"""v2.8 Weekly timesheets — every employee registers their own attendance and hours.

One `timesheets` doc per person per week (Monday start):
  days  {date: {status, start, end, break_min, note}}   ← attendance for the day (pre-filled from GPS check-ins)
  rows  [{id, project_id, task, billable, hours: {date: h}}]  ← where the time went
Flow: draft → submitted → approved (or rejected → edit → resubmit). Managers (`daily_reports.team`) approve; nobody
approves their own sheet except the super admin. On approval, registered days that have no check-in become
attendance records (`source: "timesheet"`), so the month grid, reports and team view count them.
Cost rates (₹/hour per role) for profitability reports live in their own settings doc, visible to admin/finance only.
"""
import re
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Dict, List, Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Query
from database import db
from auth import get_current_user, log_activity
from permissions import has_permission, branch_scope
from routes_daily import (get_settings, _local_now, _is_team, _home_branch, _team_people, _upsert, _hm_to_min, _attendee,
                          STATUSES, PRESENT)
from routes_holidays import holidays_between, holiday_for

router = APIRouter()
HM = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
ROLE_LABELS = {"admin": "Admin / CEO", "finance": "Finance", "sales": "Sales", "pm": "Project Manager", "employee": "Employee",
               "ads_manager": "Ads Manager", "social_manager": "Social Media Manager"}


def _now():
    return datetime.now(timezone.utc).isoformat()


class Row(BaseModel):
    id: Optional[str] = None
    project_id: Optional[str] = None
    task: Optional[str] = ""
    billable: bool = True
    hours: Dict[str, float] = {}


class Day(BaseModel):
    status: Optional[str] = None
    start: Optional[str] = None
    end: Optional[str] = None
    break_min: Optional[int] = 0
    note: Optional[str] = ""


class SheetIn(BaseModel):
    week_start: str
    rows: List[Row] = []
    days: Dict[str, Day] = {}


class ReviewIn(BaseModel):
    note: Optional[str] = ""


class CostRatesIn(BaseModel):
    rates: Dict[str, float] = {}
    per_user: Dict[str, float] = {}


# ------------------------------------------------------------------ helpers
def week_of(any_day: str):
    try:
        d = date.fromisoformat(any_day[:10])
    except ValueError:
        raise HTTPException(status_code=400, detail="Week must be a date (YYYY-MM-DD)")
    mon = d - timedelta(days=d.weekday())
    return mon.isoformat(), [(mon + timedelta(days=i)).isoformat() for i in range(7)]


def day_hours(day: dict) -> float:
    if not day or not day.get("start") or not day.get("end"):
        return 0.0
    mins = _hm_to_min(day["end"]) - _hm_to_min(day["start"]) - int(day.get("break_min") or 0)
    return round(max(0, mins) / 60, 2)


def totals(sheet: dict) -> dict:
    per_day, billable = {}, 0.0
    for r in sheet.get("rows") or []:
        for d, h in (r.get("hours") or {}).items():
            per_day[d] = round(per_day.get(d, 0) + float(h or 0), 2)
            if r.get("billable"):
                billable += float(h or 0)
    days = sheet.get("days") or {}
    return {"work_hours": round(sum(per_day.values()), 2), "billable_hours": round(billable, 2), "per_day": per_day,
            "attendance_hours": round(sum(day_hours(x) for x in days.values()), 2),
            "days_present": sum(1 for x in days.values() if x.get("status") in PRESENT) - 0.5 * sum(1 for x in days.values() if x.get("status") == "half_day"),
            "days_leave": sum(1 for x in days.values() if x.get("status") == "leave")}


async def _projects_index():
    clients = {c["id"]: c["name"] for c in await db.clients.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(3000)}
    return {p["id"]: {"id": p["id"], "name": p["name"], "client_id": p.get("client_id"), "client_name": clients.get(p.get("client_id")),
                      "status": p.get("status")}
            for p in await db.projects.find({}, {"_id": 0, "id": 1, "name": 1, "client_id": 1, "status": 1}).to_list(3000)}


async def _day_info(person: dict, dates: list, settings: dict):
    hols = await holidays_between(dates[0], dates[-1])
    branch = _home_branch(person)
    recs = {r["date"]: r for r in await db.daily_reports.find({"user_id": person["id"], "date": {"$in": dates}}, {"_id": 0}).to_list(20)}
    off = set(settings.get("weekly_off") or [])
    out = {}
    for d in dates:
        h = holiday_for(hols, d, branch)
        opt = holiday_for(hols, d, branch, include_optional=True)
        r = recs.get(d)
        out[d] = {"weekly_off": date.fromisoformat(d).weekday() in off,
                  "holiday": {"name": h["name"], "type": h["type"]} if h else None,
                  "optional_holiday": opt["name"] if opt and not h else None,
                  "record": {k: r.get(k) for k in ("status", "check_in_local", "check_out_local", "hours", "late", "source", "on_site",
                                                   "nearest_branch_name")} if r else None}
    return out


def _working(info: dict) -> bool:
    return not info["weekly_off"] and not info["holiday"]


async def _skeleton(person: dict, week_start: str, dates: list, info: dict, settings: dict):
    days = {}
    for d in dates:
        r = info[d]["record"]
        if r and r.get("status"):
            both = r.get("check_in_local") and r.get("check_out_local")
            days[d] = {"status": r["status"], "start": r.get("check_in_local"), "end": r.get("check_out_local"),
                       "break_min": 60 if both and r["status"] != "half_day" and day_hours({"start": r["check_in_local"], "end": r["check_out_local"]}) > 6 else 0,
                       "note": "", "from_checkin": bool(r.get("check_in_local"))}
    # suggested work rows from the daily reports' task hours
    rows = {}
    for rep in await db.daily_reports.find({"user_id": person["id"], "date": {"$in": dates}}, {"_id": 0, "date": 1, "report": 1}).to_list(20):
        for t in ((rep.get("report") or {}).get("tasks") or []):
            if not t.get("hours"):
                continue
            key = t.get("project_id") or "_internal"
            row = rows.setdefault(key, {"id": str(uuid.uuid4()), "project_id": t.get("project_id"), "task": "" if t.get("project_id") else "Internal work",
                                        "billable": bool(t.get("project_id")), "hours": {}})
            row["hours"][rep["date"]] = round(row["hours"].get(rep["date"], 0) + float(t["hours"]), 2)
    return {"id": None, "user_id": person["id"], "user_name": person["name"], "branch_id": _home_branch(person), "week_start": week_start,
            "status": "draft", "days": days, "rows": list(rows.values()), "suggested": bool(rows) or bool(days)}


async def _payload(person: dict, sheet: Optional[dict], week_start: str, dates: list, viewer: dict):
    s = await get_settings()
    info = await _day_info(person, dates, s)
    if not sheet:
        sheet = await _skeleton(person, week_start, dates, info, s)
    else:
        # bring in check-ins made after the draft was saved
        if sheet["status"] in ("draft", "rejected"):
            for d in dates:
                r = info[d]["record"]
                if r and r.get("status") and d not in (sheet.get("days") or {}):
                    sheet.setdefault("days", {})[d] = {"status": r["status"], "start": r.get("check_in_local"), "end": r.get("check_out_local"),
                                                       "break_min": 0, "note": "", "from_checkin": bool(r.get("check_in_local"))}
    today = _local_now(s).date().isoformat()
    working = [d for d in dates if _working(info[d])]
    last_working = working[-1] if working else dates[-1]
    mon = date.fromisoformat(week_start)
    used = {r.get("project_id") for r in sheet.get("rows") or [] if r.get("project_id")}
    pidx = await _projects_index() if used else {}
    return {"sheet": {**sheet, "totals": totals(sheet)}, "week_start": week_start, "dates": dates, "day_info": info, "today": today,
            "projects": {k: v for k, v in pidx.items() if k in used},
            "prev_week": (mon - timedelta(days=7)).isoformat(), "next_week": (mon + timedelta(days=7)).isoformat(),
            "can_edit": sheet["status"] in ("draft", "rejected") and viewer["id"] == person["id"],
            "can_submit_from": last_working, "statuses": STATUSES,
            "settings": {"std_hours_per_day": s.get("std_hours_per_day", 8), "approval": s.get("timesheet_approval", True),
                         "work_start": s["work_start"], "work_end": s["work_end"]},
            "person": {"id": person["id"], "name": person["name"], "role": person.get("role"), "branch_id": _home_branch(person)}}


def _validate(body: SheetIn, dates: list, today: str):
    dset = set(dates)
    days = {}
    for d, day in (body.days or {}).items():
        if d not in dset:
            raise HTTPException(status_code=400, detail=f"{d} isn't in this week")
        x = day.model_dump()
        if x["status"] is None or x["status"] == "":
            continue
        if x["status"] not in STATUSES:
            raise HTTPException(status_code=400, detail=f"Status must be one of {', '.join(STATUSES)}")
        if x["status"] in PRESENT and d > today:
            raise HTTPException(status_code=400, detail=f"You can't register attendance for {d} yet — only leave can be planned ahead")
        for k in ("start", "end"):
            if x.get(k) and not HM.match(x[k]):
                raise HTTPException(status_code=400, detail="Times must be HH:MM (24-hour)")
        if x["status"] not in PRESENT:
            x["start"] = x["end"] = None
            x["break_min"] = 0
        if x.get("start") and x.get("end") and _hm_to_min(x["end"]) <= _hm_to_min(x["start"]):
            raise HTTPException(status_code=400, detail=f"Out time must be after in time on {d}")
        if not (0 <= int(x.get("break_min") or 0) <= 600):
            raise HTTPException(status_code=400, detail="Break must be between 0 and 600 minutes")
        x["break_min"] = int(x.get("break_min") or 0)
        days[d] = x
    rows, per_day = [], {}
    for r in body.rows or []:
        x = r.model_dump()
        hrs = {}
        for d, h in (x.get("hours") or {}).items():
            if h in (None, "") or float(h) == 0:
                continue
            if d not in dset:
                raise HTTPException(status_code=400, detail=f"{d} isn't in this week")
            h = float(h)
            if h < 0 or h > 24:
                raise HTTPException(status_code=400, detail="Hours must be between 0 and 24")
            if d > today:
                raise HTTPException(status_code=400, detail=f"You can't log hours for {d} yet")
            if days.get(d, {}).get("status") in ("leave", "absent"):
                raise HTTPException(status_code=400, detail=f"{d} is marked as {days[d]['status']} but has hours logged")
            hrs[d] = round(h, 2)
            per_day[d] = per_day.get(d, 0) + h
        if not hrs and not x.get("project_id") and not (x.get("task") or "").strip():
            continue
        if not x.get("project_id") and not (x.get("task") or "").strip():
            raise HTTPException(status_code=400, detail="Each row needs a project or a task name")
        rows.append({"id": x.get("id") or str(uuid.uuid4()), "project_id": x.get("project_id") or None,
                     "task": (x.get("task") or "").strip()[:200], "billable": bool(x.get("billable")), "hours": hrs})
    for d, h in per_day.items():
        if h > 24:
            raise HTTPException(status_code=400, detail=f"More than 24 hours logged on {d}")
    return days, rows


async def _save(user: dict, body: SheetIn):
    week_start, dates = week_of(body.week_start)
    s = await get_settings()
    today = _local_now(s).date().isoformat()
    existing = await db.timesheets.find_one({"user_id": user["id"], "week_start": week_start}, {"_id": 0})
    if existing and existing["status"] in ("submitted", "approved"):
        raise HTTPException(status_code=409, detail="This week is already submitted — ask your manager to reopen it")
    pids = {r.project_id for r in body.rows if r.project_id}
    if pids:
        known = {p["id"] for p in await db.projects.find({"id": {"$in": list(pids)}}, {"_id": 0, "id": 1}).to_list(500)}
        if pids - known:
            raise HTTPException(status_code=400, detail="One of the projects no longer exists")
    days, rows = _validate(body, dates, today)
    doc = {"user_id": user["id"], "user_name": user["name"], "branch_id": _home_branch(user), "week_start": week_start,
           "days": days, "rows": rows, "status": "draft", "updated_at": _now()}
    if existing:
        await db.timesheets.update_one({"id": existing["id"]}, {"$set": doc})
        doc = {**existing, **doc}
    else:
        doc.update({"id": str(uuid.uuid4()), "created_at": _now(), "submitted_at": None, "approved_by": None, "approved_at": None, "review_note": ""})
        await db.timesheets.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc, dates


async def apply_to_attendance(sheet: dict, approver: dict):
    """Registered days without a check-in become attendance records; GPS check-ins are kept as they are."""
    s = await get_settings()
    person = await db.users.find_one({"id": sheet["user_id"]}, {"_id": 0, "password_hash": 0}) or {"id": sheet["user_id"], "name": sheet["user_name"]}
    applied = 0
    for d, day in (sheet.get("days") or {}).items():
        if not day.get("status"):
            continue
        rec = await db.daily_reports.find_one({"user_id": sheet["user_id"], "date": d}, {"_id": 0})
        if rec and rec.get("check_in_at"):
            await db.daily_reports.update_one({"id": rec["id"]}, {"$set": {"timesheet_id": sheet["id"]}})
            continue
        fields = {"status": day["status"], "source": "timesheet", "self_registered": True, "timesheet_id": sheet["id"],
                  "approved_by": approver["name"], "late": False, "late_by_min": 0}
        if day["status"] in PRESENT and day.get("start"):
            late_by = _hm_to_min(day["start"]) - _hm_to_min(s["work_start"])
            late = day["status"] in ("office", "field") and late_by > int(s.get("late_grace_min") or 0)
            fields.update({"check_in_local": day["start"], "check_out_local": day.get("end"), "hours": day_hours(day),
                           "late": late, "late_by_min": late_by if late else 0})
        else:
            fields.update({"check_in_local": None, "check_out_local": None, "hours": None})
        await _upsert(sheet["user_id"], d, fields, person)
        applied += 1
    return applied


def _can_view(viewer: dict, sheet: dict):
    if viewer["id"] == sheet["user_id"]:
        return True
    if not _is_team(viewer):
        return False
    scope = branch_scope(viewer)
    return scope is None or sheet.get("branch_id") in scope


# ------------------------------------------------------------------ my timesheet
@router.get("/timesheets/me")
async def my_sheet(week: Optional[str] = None, user: dict = Depends(get_current_user)):
    s = await get_settings()
    week_start, dates = week_of(week or _local_now(s).date().isoformat())
    sheet = await db.timesheets.find_one({"user_id": user["id"], "week_start": week_start}, {"_id": 0})
    data = await _payload(user, sheet, week_start, dates, user)
    data["recent"] = await db.timesheets.find({"user_id": user["id"]}, {"_id": 0, "id": 1, "week_start": 1, "status": 1, "rows": 1, "days": 1,
                                                                       "review_note": 1}).sort("week_start", -1).to_list(8)
    for r in data["recent"]:
        t = totals(r)
        r.update({"work_hours": t["work_hours"], "days_present": t["days_present"]})
        r.pop("rows", None)
        r.pop("days", None)
    return data


@router.put("/timesheets/me")
async def save_sheet(body: SheetIn, user: dict = Depends(get_current_user)):
    doc, dates = await _save(user, body)
    return await _payload(user, doc, doc["week_start"], dates, user)


@router.post("/timesheets/me/submit")
async def submit_sheet(body: SheetIn, user: dict = Depends(get_current_user)):
    doc, dates = await _save(user, body)
    s = await get_settings()
    today = _local_now(s).date().isoformat()
    info = await _day_info(user, dates, s)
    working = [d for d in dates if _working(info[d])]
    if working and today < working[-1]:
        raise HTTPException(status_code=400, detail=f"You can submit this week from {date.fromisoformat(working[-1]).strftime('%a %d %b')}")
    missing = [d for d in working if not (doc.get("days") or {}).get(d, {}).get("status")]
    if missing:
        names = ", ".join(date.fromisoformat(d).strftime("%a %d") for d in missing)
        raise HTTPException(status_code=400, detail=f"Register attendance for every working day first (missing: {names})")
    t = totals(doc)
    if t["work_hours"] == 0 and t["days_present"] > 0:
        raise HTTPException(status_code=400, detail="Add the hours you worked before submitting")
    auto = not s.get("timesheet_approval", True)
    u = {"status": "approved" if auto else "submitted", "submitted_at": _now(), "review_note": doc.get("review_note") if not auto else ""}
    if auto:
        u.update({"approved_by": "Auto-approved", "approved_at": _now()})
    await db.timesheets.update_one({"id": doc["id"]}, {"$set": u})
    doc.update(u)
    if auto:
        await apply_to_attendance(doc, {"name": "Auto-approved"})
    await log_activity(user, "timesheet_submitted", "timesheet", doc["id"], f"Week of {doc['week_start']} · {t['work_hours']} h")
    return await _payload(user, doc, doc["week_start"], dates, user)


# ------------------------------------------------------------------ cost rates (admin / finance only)
@router.get("/timesheets/cost-rates")
async def get_cost_rates(user: dict = Depends(get_current_user)):
    if user["role"] not in ("super_admin", "admin", "finance"):
        raise HTTPException(status_code=403, detail="Cost rates are visible to admins and finance only")
    doc = await db.settings.find_one({"id": "cost_rates"}, {"_id": 0}) or {}
    people = [{"id": u["id"], "name": u["name"], "role": u.get("role")} for u in await db.users.find({}, {"_id": 0, "id": 1, "name": 1, "role": 1, "is_active": 1}).to_list(2000)
              if _attendee(u)]
    return {"rates": doc.get("rates") or {}, "per_user": doc.get("per_user") or {}, "roles": [{"value": k, "label": v} for k, v in ROLE_LABELS.items()],
            "people": sorted(people, key=lambda p: p["name"]), "can_edit": user["role"] in ("super_admin", "admin")}


@router.put("/timesheets/cost-rates")
async def put_cost_rates(body: CostRatesIn, user: dict = Depends(get_current_user)):
    if user["role"] not in ("super_admin", "admin"):
        raise HTTPException(status_code=403, detail="Only admins can change cost rates")
    for v in list(body.rates.values()) + list(body.per_user.values()):
        if v < 0 or v > 100000:
            raise HTTPException(status_code=400, detail="Cost per hour must be between ₹0 and ₹1,00,000")
    rates = {k: round(v, 2) for k, v in body.rates.items() if k in ROLE_LABELS and v}
    per_user = {k: round(v, 2) for k, v in body.per_user.items() if v}
    await db.settings.update_one({"id": "cost_rates"}, {"$set": {"id": "cost_rates", "rates": rates, "per_user": per_user, "updated_at": _now()}}, upsert=True)
    await log_activity(user, "cost_rates_updated", "settings", "cost_rates", f"{len(rates)} roles, {len(per_user)} people")
    return {"rates": rates, "per_user": per_user}


async def cost_rate_lookup():
    """user dict → ₹ per hour (person override, else role rate, else 0)."""
    doc = await db.settings.find_one({"id": "cost_rates"}, {"_id": 0}) or {}
    rates, per_user = doc.get("rates") or {}, doc.get("per_user") or {}
    return lambda u: float(per_user.get(u.get("id")) or rates.get(u.get("role")) or 0)


# ------------------------------------------------------------------ team approvals
@router.get("/timesheets")
async def team_sheets(week: Optional[str] = None, status: Optional[str] = None, branch: Optional[str] = None,
                      user: dict = Depends(get_current_user)):
    if not _is_team(user):
        raise HTTPException(status_code=403, detail="Timesheet approvals are for managers")
    s = await get_settings()
    week_start, dates = week_of(week or (_local_now(s).date() - timedelta(days=7)).isoformat())
    people = await _team_people(user, branch)
    sheets = {x["user_id"]: x for x in await db.timesheets.find({"week_start": week_start, "user_id": {"$in": [p["id"] for p in people]}},
                                                                 {"_id": 0}).to_list(3000)}
    bnames = {b["id"]: b["name"] for b in await db.branches.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(100)}
    rows, counts = [], {"not_started": 0, "draft": 0, "submitted": 0, "approved": 0, "rejected": 0}
    for p in sorted(people, key=lambda x: x["name"]):
        sh = sheets.get(p["id"])
        st = sh["status"] if sh else "not_started"
        counts[st] = counts.get(st, 0) + 1
        t = totals(sh) if sh else {"work_hours": 0, "billable_hours": 0, "days_present": 0, "days_leave": 0}
        rows.append({"user": {"id": p["id"], "name": p["name"], "role": p.get("role")}, "branch": bnames.get(_home_branch(p), "No branch"),
                     "sheet_id": sh["id"] if sh else None, "status": st, "work_hours": t["work_hours"], "billable_hours": t["billable_hours"],
                     "days_present": t["days_present"], "days_leave": t["days_leave"], "submitted_at": sh.get("submitted_at") if sh else None,
                     "self": p["id"] == user["id"]})
    if status:
        rows = [r for r in rows if r["status"] == status]
    mon = date.fromisoformat(week_start)
    return {"week_start": week_start, "dates": dates, "rows": rows, "counts": counts,
            "prev_week": (mon - timedelta(days=7)).isoformat(), "next_week": (mon + timedelta(days=7)).isoformat()}


@router.get("/timesheets/{sid}")
async def get_sheet(sid: str, user: dict = Depends(get_current_user)):
    sh = await db.timesheets.find_one({"id": sid}, {"_id": 0})
    if not sh:
        raise HTTPException(status_code=404, detail="Timesheet not found")
    if not _can_view(user, sh):
        raise HTTPException(status_code=403, detail="You can't see this timesheet")
    person = await db.users.find_one({"id": sh["user_id"]}, {"_id": 0, "password_hash": 0}) or {"id": sh["user_id"], "name": sh["user_name"]}
    _, dates = week_of(sh["week_start"])
    data = await _payload(person, sh, sh["week_start"], dates, user)
    data["projects"] = {k: v for k, v in (await _projects_index()).items() if any(r.get("project_id") == k for r in sh.get("rows") or [])}
    data["can_review"] = _is_team(user) and (sh["user_id"] != user["id"] or user["role"] == "super_admin")
    return data


async def _review_target(sid: str, user: dict):
    if not _is_team(user):
        raise HTTPException(status_code=403, detail="Only managers can review timesheets")
    sh = await db.timesheets.find_one({"id": sid}, {"_id": 0})
    if not sh:
        raise HTTPException(status_code=404, detail="Timesheet not found")
    if not _can_view(user, sh):
        raise HTTPException(status_code=403, detail="This person is outside your branches")
    if sh["user_id"] == user["id"] and user["role"] != "super_admin":
        raise HTTPException(status_code=403, detail="Ask another manager to approve your own timesheet")
    return sh


@router.post("/timesheets/{sid}/approve")
async def approve(sid: str, body: ReviewIn, user: dict = Depends(get_current_user)):
    sh = await _review_target(sid, user)
    if sh["status"] != "submitted":
        raise HTTPException(status_code=409, detail="Only submitted timesheets can be approved")
    u = {"status": "approved", "approved_by": user["name"], "approved_at": _now(), "review_note": body.note or ""}
    await db.timesheets.update_one({"id": sid}, {"$set": u})
    sh.update(u)
    applied = await apply_to_attendance(sh, user)
    await log_activity(user, "timesheet_approved", "timesheet", sid, f"{sh['user_name']} · week of {sh['week_start']}")
    return {"ok": True, "status": "approved", "days_added_to_attendance": applied}


@router.post("/timesheets/{sid}/reject")
async def reject(sid: str, body: ReviewIn, user: dict = Depends(get_current_user)):
    sh = await _review_target(sid, user)
    if sh["status"] != "submitted":
        raise HTTPException(status_code=409, detail="Only submitted timesheets can be sent back")
    if not (body.note or "").strip():
        raise HTTPException(status_code=400, detail="Say what needs fixing")
    await db.timesheets.update_one({"id": sid}, {"$set": {"status": "rejected", "review_note": body.note.strip(), "reviewed_by": user["name"],
                                                          "reviewed_at": _now()}})
    await log_activity(user, "timesheet_rejected", "timesheet", sid, f"{sh['user_name']} · {body.note.strip()[:80]}")
    return {"ok": True, "status": "rejected"}


@router.post("/timesheets/{sid}/reopen")
async def reopen(sid: str, body: ReviewIn, user: dict = Depends(get_current_user)):
    sh = await _review_target(sid, user)
    if sh["status"] not in ("submitted", "approved"):
        raise HTTPException(status_code=409, detail="Only submitted or approved timesheets can be reopened")
    await db.timesheets.update_one({"id": sid}, {"$set": {"status": "draft", "review_note": body.note or "Reopened for changes",
                                                          "reviewed_by": user["name"], "reviewed_at": _now()}})
    await log_activity(user, "timesheet_reopened", "timesheet", sid, sh["user_name"])
    return {"ok": True, "status": "draft"}


# ------------------------------------------------------------------ bell
async def timesheet_alerts(user: dict):
    s = await get_settings()
    today = _local_now(s).date()
    items = []
    last_mon = (today - timedelta(days=today.weekday() + 7)).isoformat()
    if _attendee(user) and has_permission(user, "daily_reports"):
        mine = await db.timesheets.find_one({"user_id": user["id"], "week_start": last_mon}, {"_id": 0, "status": 1, "review_note": 1})
        if not mine or mine["status"] == "draft":
            items.append({"kind": "timesheet", "title": "Last week's timesheet isn't submitted", "sub": f"Week of {date.fromisoformat(last_mon).strftime('%d %b')}",
                          "link": f"/daily?tab=timesheet&week={last_mon}", "date": today.isoformat()})
        rej = await db.timesheets.find_one({"user_id": user["id"], "status": "rejected"}, {"_id": 0, "week_start": 1, "review_note": 1})
        if rej:
            items.append({"kind": "timesheet", "title": "Timesheet sent back for changes", "sub": (rej.get("review_note") or "")[:60],
                          "link": f"/daily?tab=timesheet&week={rej['week_start']}", "date": today.isoformat()})
    if _is_team(user):
        people = [p["id"] for p in await _team_people(user, None) if p["id"] != user["id"] or user["role"] == "super_admin"]
        waiting = await db.timesheets.count_documents({"status": "submitted", "user_id": {"$in": people}})
        if waiting:
            items.append({"kind": "timesheet", "title": f"{waiting} timesheet{'s' if waiting > 1 else ''} waiting for approval",
                          "sub": "Review and approve", "link": "/daily?tab=approvals", "date": today.isoformat()})
    return items
