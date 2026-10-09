"""v2.7 Daily Reporting & attendance (location-wise).

One record per person per day (`daily_reports`): attendance (status, check-in/out time, GPS location,
nearest branch + distance → on-site check, late flag, hours) and the end-of-day report (what was done,
tasks with project + hours, plan for tomorrow, blockers), plus a manager review note.

`daily_reports` → own day; `daily_reports.team` → team views (scoped to the manager's branches);
`daily_reports.delete` → delete records (recycle bin). Settings (office hours, grace, geofence radius,
weekly off) live in db.settings {id: "daily"}.
"""
import math
import uuid
from datetime import datetime, timezone, timedelta, date
from typing import List, Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Query
from database import db
from auth import get_current_user, log_activity
from permissions import has_permission, branch_scope

try:
    from zoneinfo import ZoneInfo
except Exception:  # pragma: no cover
    ZoneInfo = None

router = APIRouter()

STATUSES = ["office", "wfh", "field", "half_day", "leave", "absent"]
PRESENT = {"office", "wfh", "field", "half_day"}
DEFAULT_SETTINGS = {"id": "daily", "work_start": "09:30", "work_end": "18:30", "late_grace_min": 10, "geofence_m": 300,
                    "report_due": "19:00", "timezone": "Asia/Kolkata", "weekly_off": [6], "require_location_for_office": False}


def _now_utc():
    return datetime.now(timezone.utc)


def _tz(settings):
    if ZoneInfo:
        try:
            return ZoneInfo(settings.get("timezone") or "Asia/Kolkata")
        except Exception:
            pass
    return timezone(timedelta(hours=5, minutes=30))


async def get_settings():
    s = await db.settings.find_one({"id": "daily"}, {"_id": 0})
    return {**DEFAULT_SETTINGS, **(s or {})}


def _local_now(settings):
    return _now_utc().astimezone(_tz(settings))


def _hm_to_min(hm: str) -> int:
    h, m = (hm or "00:00").split(":")[:2]
    return int(h) * 60 + int(m)


def haversine_m(lat1, lng1, lat2, lng2):
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


async def _branches():
    return await db.branches.find({}, {"_id": 0, "id": 1, "name": 1, "city": 1, "lat": 1, "lng": 1}).to_list(500)


def _home_branch(u: dict):
    if u.get("branch_id"):
        return u["branch_id"]
    for a in u.get("branch_assignments") or []:
        if a.get("branch_id"):
            return a["branch_id"]
    return None


def _nearest(branches, lat, lng):
    best = None
    for b in branches:
        if b.get("lat") is None or b.get("lng") is None:
            continue
        d = haversine_m(lat, lng, float(b["lat"]), float(b["lng"]))
        if best is None or d < best[1]:
            best = (b, d)
    return best


class CheckIn(BaseModel):
    status: str = "office"
    lat: Optional[float] = None
    lng: Optional[float] = None
    accuracy: Optional[float] = None
    note: Optional[str] = ""


class CheckOut(BaseModel):
    lat: Optional[float] = None
    lng: Optional[float] = None
    accuracy: Optional[float] = None


class Task(BaseModel):
    text: str
    project_id: Optional[str] = None
    hours: Optional[float] = None


class ReportIn(BaseModel):
    date: Optional[str] = None
    summary: str = ""
    tasks: List[Task] = []
    plan_tomorrow: Optional[str] = ""
    blockers: Optional[str] = ""
    submit: bool = True


class MarkIn(BaseModel):
    user_id: str
    date: str
    status: str
    note: Optional[str] = ""


class ReviewIn(BaseModel):
    note: str


class SettingsIn(BaseModel):
    work_start: Optional[str] = None
    work_end: Optional[str] = None
    late_grace_min: Optional[int] = None
    geofence_m: Optional[int] = None
    report_due: Optional[str] = None
    timezone: Optional[str] = None
    weekly_off: Optional[List[int]] = None
    require_location_for_office: Optional[bool] = None


def _is_team(user):
    return has_permission(user, "daily_reports.team")


def _attendee(u):
    return u.get("role") != "super_admin" and u.get("is_active", True) and not u.get("deleted")


async def _get_record(user_id, d):
    return await db.daily_reports.find_one({"user_id": user_id, "date": d}, {"_id": 0})


async def _upsert(user_id, d, fields, user_doc=None):
    rec = await _get_record(user_id, d)
    now = _now_utc().isoformat()
    if rec:
        await db.daily_reports.update_one({"id": rec["id"]}, {"$set": {**fields, "updated_at": now}})
    else:
        u = user_doc or await db.users.find_one({"id": user_id}, {"_id": 0}) or {}
        rec = {"id": str(uuid.uuid4()), "user_id": user_id, "user_name": u.get("name"), "date": d,
               "branch_id": _home_branch(u), "status": None, "check_in_at": None, "check_out_at": None, "report": None,
               "created_at": now, "updated_at": now}
        await db.daily_reports.insert_one({**rec, **fields})
    return await _get_record(user_id, d)


def _late(settings, local_dt):
    start = _hm_to_min(settings["work_start"]) + int(settings.get("late_grace_min") or 0)
    mins = local_dt.hour * 60 + local_dt.minute
    return (mins > start, max(0, mins - _hm_to_min(settings["work_start"])))


@router.get("/daily/settings")
async def daily_settings(user: dict = Depends(get_current_user)):
    return await get_settings()


@router.put("/daily/settings")
async def update_settings(body: SettingsIn, user: dict = Depends(get_current_user)):
    if user["role"] not in ("super_admin", "admin"):
        raise HTTPException(status_code=403, detail="Only admins can change attendance settings")
    u = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    for k in ("work_start", "work_end", "report_due"):
        if k in u:
            try:
                h, m = u[k].split(":")
                assert 0 <= int(h) < 24 and 0 <= int(m) < 60
            except Exception:
                raise HTTPException(status_code=400, detail=f"{k} must be HH:MM")
    if "geofence_m" in u and not (20 <= u["geofence_m"] <= 20000):
        raise HTTPException(status_code=400, detail="Geofence radius must be between 20 m and 20 km")
    await db.settings.update_one({"id": "daily"}, {"$set": {"id": "daily", **u}}, upsert=True)
    await log_activity(user, "attendance_settings_updated", "settings", "daily", ", ".join(f"{k}={v}" for k, v in u.items()))
    return await get_settings()


@router.get("/daily/me")
async def my_day(date_: Optional[str] = Query(None, alias="date"), user: dict = Depends(get_current_user)):
    s = await get_settings()
    today = _local_now(s).date().isoformat()
    d = date_ or today
    rec = await _get_record(user["id"], d)
    start = (date.fromisoformat(today) - timedelta(days=13)).isoformat()
    history = await db.daily_reports.find({"user_id": user["id"], "date": {"$gte": start}}, {"_id": 0}).sort("date", -1).to_list(30)
    branches = await _branches()
    home = _home_branch(user)
    return {"date": d, "today": today, "record": rec, "history": history, "settings": s,
            "home_branch": next((b for b in branches if b["id"] == home), None),
            "branches": branches, "statuses": STATUSES, "is_team": _is_team(user)}


@router.post("/daily/check-in")
async def check_in(body: CheckIn, user: dict = Depends(get_current_user)):
    if body.status not in STATUSES:
        raise HTTPException(status_code=400, detail=f"Status must be one of {', '.join(STATUSES)}")
    s = await get_settings()
    local = _local_now(s)
    d = local.date().isoformat()
    rec = await _get_record(user["id"], d)
    if rec and rec.get("check_in_at"):
        raise HTTPException(status_code=409, detail="You've already checked in today")
    if body.status == "office" and s.get("require_location_for_office") and body.lat is None:
        raise HTTPException(status_code=400, detail="Turn on location to check in at the office")
    fields = {"status": body.status, "note": body.note or ""}
    if body.status in PRESENT:
        late, late_by = _late(s, local)
        fields.update({"check_in_at": _now_utc().isoformat(), "check_in_local": local.strftime("%H:%M"),
                       "late": late and body.status in ("office", "field"), "late_by_min": late_by if late else 0})
    if body.lat is not None and body.lng is not None:
        fields["check_in_location"] = {"lat": body.lat, "lng": body.lng, "accuracy": body.accuracy}
        near = _nearest(await _branches(), body.lat, body.lng)
        if near:
            b, dist = near
            fields.update({"nearest_branch_id": b["id"], "nearest_branch_name": b["name"], "distance_m": round(dist)})
            fields["on_site"] = dist <= float(s["geofence_m"]) + float(body.accuracy or 0) * 0.5
    else:
        fields["check_in_location"] = None
        fields["on_site"] = None
    rec = await _upsert(user["id"], d, fields, user)
    where = f" at {fields.get('nearest_branch_name')} ({fields.get('distance_m')} m)" if fields.get("nearest_branch_name") else ""
    await log_activity(user, "checked_in", "daily_report", rec["id"], f"{body.status}{where}")
    return rec


@router.post("/daily/check-out")
async def check_out(body: CheckOut, user: dict = Depends(get_current_user)):
    s = await get_settings()
    local = _local_now(s)
    d = local.date().isoformat()
    rec = await _get_record(user["id"], d)
    if not rec or not rec.get("check_in_at"):
        raise HTTPException(status_code=400, detail="Check in first")
    if rec.get("check_out_at"):
        raise HTTPException(status_code=409, detail="You've already checked out today")
    now = _now_utc()
    hours = round((now - datetime.fromisoformat(rec["check_in_at"])).total_seconds() / 3600, 2)
    fields = {"check_out_at": now.isoformat(), "check_out_local": local.strftime("%H:%M"), "hours": hours,
              "check_out_location": {"lat": body.lat, "lng": body.lng, "accuracy": body.accuracy} if body.lat is not None else None}
    rec = await _upsert(user["id"], d, fields, user)
    await log_activity(user, "checked_out", "daily_report", rec["id"], f"{hours} h")
    return rec


@router.put("/daily/me/report")
async def save_report(body: ReportIn, user: dict = Depends(get_current_user)):
    s = await get_settings()
    today = _local_now(s).date()
    d = body.date or today.isoformat()
    try:
        dd = date.fromisoformat(d)
    except ValueError:
        raise HTTPException(status_code=400, detail="Date must be YYYY-MM-DD")
    if dd > today or (today - dd).days > 3:
        raise HTTPException(status_code=400, detail="You can file reports for today or the last 3 days")
    if body.submit and not body.summary.strip() and not any(t.text.strip() for t in body.tasks):
        raise HTTPException(status_code=400, detail="Add what you worked on before submitting")
    report = {"summary": body.summary.strip(), "tasks": [t.model_dump() for t in body.tasks if t.text.strip()],
              "plan_tomorrow": (body.plan_tomorrow or "").strip(), "blockers": (body.blockers or "").strip(),
              "submitted": body.submit, "submitted_at": _now_utc().isoformat() if body.submit else None}
    rec = await _upsert(user["id"], d, {"report": report}, user)
    if body.submit:
        await log_activity(user, "daily_report_submitted", "daily_report", rec["id"], d)
    return rec


async def _team_people(user, branch: Optional[str]):
    users = [u for u in await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(2000) if _attendee(u)]
    scope = branch_scope(user)
    if scope is not None:
        users = [u for u in users if _home_branch(u) in scope]
    if branch:
        users = [u for u in users if _home_branch(u) == branch]
    return users


def _state(rec, settings, d_iso, today_iso, local_min):
    if rec and rec.get("status"):
        if rec["status"] in ("leave", "absent"):
            return rec["status"]
        return "late" if rec.get("late") else rec["status"]
    if d_iso < today_iso or local_min > _hm_to_min(settings["work_start"]) + int(settings.get("late_grace_min") or 0):
        return "not_checked_in"
    return "pending"


@router.get("/daily/team")
async def team_day(date_: Optional[str] = Query(None, alias="date"), branch: Optional[str] = None,
                   user: dict = Depends(get_current_user)):
    if not _is_team(user):
        raise HTTPException(status_code=403, detail="Team attendance is for managers")
    s = await get_settings()
    local = _local_now(s)
    today = local.date().isoformat()
    d = date_ or today
    people = await _team_people(user, branch)
    recs = {r["user_id"]: r for r in await db.daily_reports.find({"date": d, "user_id": {"$in": [p["id"] for p in people]}}, {"_id": 0}).to_list(3000)}
    branches = {b["id"]: b for b in await _branches()}
    groups = {}
    counts = {"people": len(people), "office": 0, "wfh": 0, "field": 0, "half_day": 0, "leave": 0, "absent": 0,
              "late": 0, "not_checked_in": 0, "pending": 0, "reports_submitted": 0, "off_site": 0}
    weekday_off = date.fromisoformat(d).weekday() in (s.get("weekly_off") or [])
    for p in people:
        r = recs.get(p["id"])
        st = "off" if weekday_off and not (r and r.get("status")) else _state(r, s, d, today, local.hour * 60 + local.minute)
        if r and r.get("status") in counts:
            counts[r["status"]] += 1
        if st in ("late", "not_checked_in", "pending"):
            counts[st] += 1
        if r and (r.get("report") or {}).get("submitted"):
            counts["reports_submitted"] += 1
        if r and r.get("status") == "office" and r.get("on_site") is False:
            counts["off_site"] += 1
        bid = _home_branch(p)
        g = groups.setdefault(bid, {"branch_id": bid, "name": branches.get(bid, {}).get("name", "No branch"),
                                    "city": branches.get(bid, {}).get("city"), "people": [], "present": 0})
        if r and r.get("status") in PRESENT:
            g["present"] += 1
        g["people"].append({"user": {"id": p["id"], "name": p["name"], "role": p.get("role"), "designation": p.get("designation")},
                            "state": st, "record": r})
    present = sum(counts[k] for k in PRESENT)
    for g in groups.values():
        g["people"].sort(key=lambda x: x["user"]["name"])
        g["rate"] = round(100 * g["present"] / len(g["people"])) if g["people"] else 0
    return {"date": d, "today": today, "weekly_off": weekday_off, "settings": s,
            "summary": {**counts, "present": present, "rate": round(100 * present / len(people)) if people else 0},
            "branches": sorted(groups.values(), key=lambda g: (g["branch_id"] is None, g["name"]))}


@router.get("/daily/attendance")
async def attendance_month(month: Optional[str] = None, branch: Optional[str] = None, user: dict = Depends(get_current_user)):
    if not _is_team(user):
        raise HTTPException(status_code=403, detail="Team attendance is for managers")
    s = await get_settings()
    today = _local_now(s).date()
    m = month or today.strftime("%Y-%m")
    try:
        first = date.fromisoformat(m + "-01")
    except ValueError:
        raise HTTPException(status_code=400, detail="Month must be YYYY-MM")
    nxt = (first.replace(day=28) + timedelta(days=4)).replace(day=1)
    days = [(first + timedelta(days=i)) for i in range((nxt - first).days)]
    people = await _team_people(user, branch)
    recs = await db.daily_reports.find({"date": {"$gte": first.isoformat(), "$lt": nxt.isoformat()},
                                        "user_id": {"$in": [p["id"] for p in people]}}, {"_id": 0}).to_list(50000)
    by = {(r["user_id"], r["date"]): r for r in recs}
    off = set(s.get("weekly_off") or [])
    working = [d for d in days if d.weekday() not in off and d <= today]
    branches = {b["id"]: b["name"] for b in await _branches()}
    rows = []
    for p in sorted(people, key=lambda x: x["name"]):
        cells, tot = [], {"present": 0, "late": 0, "wfh": 0, "leave": 0, "absent": 0, "half_day": 0, "reports": 0, "hours": 0.0}
        ins = []
        for d in days:
            r = by.get((p["id"], d.isoformat()))
            code = None
            if r and r.get("status"):
                code = r["status"]
                if code in PRESENT:
                    tot["present"] += 1 if code != "half_day" else 0.5
                if code == "half_day":
                    tot["half_day"] += 1
                if code in ("wfh", "leave", "absent"):
                    tot[code] += 1
                if r.get("late"):
                    tot["late"] += 1
                    code = "late"
                if r.get("check_in_local"):
                    ins.append(_hm_to_min(r["check_in_local"]))
                tot["hours"] += float(r.get("hours") or 0)
            elif d.weekday() in off:
                code = "off"
            elif d <= today:
                code = "missing"
            if r and (r.get("report") or {}).get("submitted"):
                tot["reports"] += 1
            cells.append(code)
        avg_in = sum(ins) / len(ins) if ins else None
        rows.append({"user": {"id": p["id"], "name": p["name"], "designation": p.get("designation")},
                     "branch": branches.get(_home_branch(p), "No branch"), "cells": cells,
                     "totals": {**tot, "hours": round(tot["hours"], 1),
                                "rate": round(100 * tot["present"] / len(working)) if working else None,
                                "avg_check_in": f"{int(avg_in // 60):02d}:{int(avg_in % 60):02d}" if avg_in is not None else None}})
    by_branch = {}
    for r in rows:
        b = by_branch.setdefault(r["branch"], {"name": r["branch"], "present": 0.0, "possible": 0})
        b["present"] += r["totals"]["present"]
        b["possible"] += len(working)
    return {"month": m, "days": [d.isoformat() for d in days], "working_days": len(working), "rows": rows,
            "by_branch": [{"name": b["name"], "rate": round(100 * b["present"] / b["possible"]) if b["possible"] else 0} for b in by_branch.values()],
            "statuses": STATUSES}


@router.get("/daily/records/{rid}")
async def get_record(rid: str, user: dict = Depends(get_current_user)):
    r = await db.daily_reports.find_one({"id": rid}, {"_id": 0})
    if not r:
        raise HTTPException(status_code=404, detail="Report not found")
    if r["user_id"] != user["id"] and not _is_team(user):
        raise HTTPException(status_code=403, detail="You can only open your own reports")
    return r


@router.put("/daily/mark")
async def mark(body: MarkIn, user: dict = Depends(get_current_user)):
    """Manager sets someone's status for a day (leave, absent, present when they forgot to check in…)."""
    if not _is_team(user):
        raise HTTPException(status_code=403, detail="Only managers can mark attendance")
    if body.status not in STATUSES:
        raise HTTPException(status_code=400, detail=f"Status must be one of {', '.join(STATUSES)}")
    target = await db.users.find_one({"id": body.user_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Person not found")
    scope = branch_scope(user)
    if scope is not None and _home_branch(target) not in scope:
        raise HTTPException(status_code=403, detail="This person is outside your branches")
    try:
        date.fromisoformat(body.date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Date must be YYYY-MM-DD")
    fields = {"status": body.status, "marked_by": user["name"], "marked_note": body.note or ""}
    if body.status not in ("office", "field"):  # "late" only applies to people expected on site
        fields.update({"late": False, "late_by_min": 0})
    rec = await _upsert(body.user_id, body.date, fields, target)
    await log_activity(user, "attendance_marked", "daily_report", rec["id"], f"{target['name']} · {body.date} · {body.status}")
    return rec


@router.post("/daily/records/{rid}/review")
async def review(rid: str, body: ReviewIn, user: dict = Depends(get_current_user)):
    if not _is_team(user):
        raise HTTPException(status_code=403, detail="Only managers can review reports")
    r = await db.daily_reports.find_one({"id": rid}, {"_id": 0})
    if not r:
        raise HTTPException(status_code=404, detail="Report not found")
    await db.daily_reports.update_one({"id": rid}, {"$set": {"manager_note": body.note.strip(), "reviewed_by": user["name"],
                                                             "reviewed_at": _now_utc().isoformat()}})
    await log_activity(user, "daily_report_reviewed", "daily_report", rid, f"{r.get('user_name')} · {r['date']}")
    return await db.daily_reports.find_one({"id": rid}, {"_id": 0})


async def daily_alerts(user: dict):
    """Bell items: own check-in / report reminders, and a 'not reported yet' count for managers."""
    s = await get_settings()
    local = _local_now(s)
    if local.weekday() in (s.get("weekly_off") or []):
        return []
    d = local.date().isoformat()
    mins = local.hour * 60 + local.minute
    items = []
    if _attendee(user) and has_permission(user, "daily_reports"):
        rec = await _get_record(user["id"], d)
        if (not rec or not rec.get("status")) and mins > _hm_to_min(s["work_start"]) + 30:
            items.append({"kind": "daily", "title": "You haven't checked in today", "sub": f"Office starts {s['work_start']}", "link": "/daily", "date": d})
        elif rec and rec.get("status") in PRESENT and not (rec.get("report") or {}).get("submitted") and mins > _hm_to_min(s["report_due"]):
            items.append({"kind": "daily", "title": "Daily report not submitted", "sub": f"Due by {s['report_due']}", "link": "/daily", "date": d})
    if _is_team(user) and mins > _hm_to_min(s["work_start"]) + 60:
        people = await _team_people(user, None)
        done = await db.daily_reports.count_documents({"date": d, "user_id": {"$in": [p["id"] for p in people]}, "status": {"$ne": None}})
        missing = len(people) - done
        if missing > 0:
            items.append({"kind": "daily", "title": f"{missing} team member{'s' if missing > 1 else ''} not checked in", "sub": "See today's attendance", "link": "/daily?tab=team", "date": d})
    return items
