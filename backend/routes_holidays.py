"""v2.8 Holiday calendar.

`holidays`: one row per holiday — date, name, type, and the locations it applies to (empty = every location).
Everyone can read the calendar; `holidays.manage` adds, edits, imports and deletes (deletes go through the
records pipeline → 24h recycle bin). Public / company / regional holidays are days off for that location:
attendance, alerts and timesheets skip them. Optional holidays are shown but are normal working days.
"""
import re
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import List, Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Query
from database import db
from auth import get_current_user, log_activity
from permissions import has_permission

router = APIRouter()

TYPES = {"public": "Public holiday", "company": "Company holiday", "regional": "Regional holiday", "optional": "Optional holiday"}
OFF_TYPES = {"public", "company", "regional"}


def _now():
    return datetime.now(timezone.utc).isoformat()


class HolidayIn(BaseModel):
    date: str
    name: str
    type: str = "public"
    branch_ids: List[str] = []
    notes: Optional[str] = ""


class HolidayUpdate(BaseModel):
    date: Optional[str] = None
    name: Optional[str] = None
    type: Optional[str] = None
    branch_ids: Optional[List[str]] = None
    notes: Optional[str] = None


class BulkRow(BaseModel):
    date: str
    name: str
    type: Optional[str] = None


class HolidayBulk(BaseModel):
    rows: List[BulkRow]
    type: str = "public"
    branch_ids: List[str] = []


def _need_manage(user):
    if not has_permission(user, "holidays.manage"):
        raise HTTPException(status_code=403, detail="You don't have permission to manage holidays")


def _valid_date(s: str) -> str:
    try:
        return date.fromisoformat(str(s).strip()[:10]).isoformat()
    except ValueError:
        raise HTTPException(status_code=400, detail=f"'{s}' isn't a date (use YYYY-MM-DD)")


async def _check(d: dict):
    if "type" in d and d["type"] is not None and d["type"] not in TYPES:
        raise HTTPException(status_code=400, detail=f"Type must be one of: {', '.join(TYPES)}")
    if "name" in d and d["name"] is not None and not d["name"].strip():
        raise HTTPException(status_code=400, detail="Give the holiday a name")
    if d.get("branch_ids"):
        known = {b["id"] for b in await db.branches.find({}, {"_id": 0, "id": 1}).to_list(200)}
        bad = [b for b in d["branch_ids"] if b not in known]
        if bad:
            raise HTTPException(status_code=400, detail="Unknown location in the list")


async def _branch_names():
    return {b["id"]: b["name"] for b in await db.branches.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(200)}


def _enrich(h: dict, names: dict) -> dict:
    h["type_label"] = TYPES.get(h.get("type"), h.get("type"))
    h["day_off"] = h.get("type") in OFF_TYPES
    h["locations"] = [names[b] for b in h.get("branch_ids") or [] if b in names] or ["All locations"]
    h["weekday"] = date.fromisoformat(h["date"]).strftime("%a")
    return h


# ------------------------------------------------------------------ helpers used by attendance / timesheets
async def holidays_between(start: str, end: str) -> list:
    return await db.holidays.find({"date": {"$gte": start, "$lte": end}}, {"_id": 0}).sort("date", 1).to_list(1000)


def holiday_for(hols: list, d: str, branch_id: Optional[str], include_optional: bool = False) -> Optional[dict]:
    """The holiday that makes `d` a day off for someone based at `branch_id` (None if it's a working day)."""
    for h in hols:
        if h["date"] != d:
            continue
        if not include_optional and h.get("type") not in OFF_TYPES:
            continue
        if not h.get("branch_ids") or (branch_id and branch_id in h["branch_ids"]):
            return h
    return None


def holiday_index(hols: list) -> dict:
    out = {}
    for h in hols:
        out.setdefault(h["date"], []).append(h)
    return out


def off_holiday(index: dict, d: str, branch_id: Optional[str]) -> Optional[dict]:
    return holiday_for(index.get(d, []), d, branch_id)


# ------------------------------------------------------------------ endpoints
@router.get("/holidays/meta")
async def meta(user: dict = Depends(get_current_user)):
    return {"types": [{"value": k, "label": v, "day_off": k in OFF_TYPES} for k, v in TYPES.items()],
            "branches": await db.branches.find({}, {"_id": 0, "id": 1, "name": 1, "city": 1}).sort("name", 1).to_list(100),
            "can_manage": has_permission(user, "holidays.manage")}


@router.get("/holidays")
async def list_holidays(year: Optional[int] = None, branch: Optional[str] = None, start: Optional[str] = None,
                        end: Optional[str] = None, upcoming: Optional[int] = None, user: dict = Depends(get_current_user)):
    q = {}
    if upcoming:
        today = date.today()
        q["date"] = {"$gte": today.isoformat(), "$lte": (today + timedelta(days=int(upcoming))).isoformat()}
    elif start or end:
        q["date"] = {"$gte": start or "0000", "$lte": end or "9999"}
    else:
        y = year or date.today().year
        q["date"] = {"$gte": f"{y}-01-01", "$lte": f"{y}-12-31"}
    rows = await db.holidays.find(q, {"_id": 0}).sort("date", 1).to_list(1000)
    if branch:
        rows = [h for h in rows if not h.get("branch_ids") or branch in h["branch_ids"]]
    names = await _branch_names()
    return [_enrich(h, names) for h in rows]


@router.post("/holidays")
async def create_holiday(body: HolidayIn, user: dict = Depends(get_current_user)):
    _need_manage(user)
    d = body.model_dump()
    d["date"] = _valid_date(d["date"])
    await _check(d)
    d["name"] = d["name"].strip()
    if await db.holidays.find_one({"date": d["date"], "name": {"$regex": f"^{re.escape(d['name'])}$", "$options": "i"}}):
        raise HTTPException(status_code=409, detail="That holiday is already on the calendar")
    d.update({"id": str(uuid.uuid4()), "created_by": user["id"], "created_at": _now(), "updated_at": _now()})
    await db.holidays.insert_one(dict(d))
    await log_activity(user, "holiday_added", "holiday", d["id"], f"{d['name']} · {d['date']}")
    return _enrich(d, await _branch_names())


@router.put("/holidays/{hid}")
async def update_holiday(hid: str, body: HolidayUpdate, user: dict = Depends(get_current_user)):
    _need_manage(user)
    h = await db.holidays.find_one({"id": hid}, {"_id": 0})
    if not h:
        raise HTTPException(status_code=404, detail="Holiday not found")
    u = body.model_dump(exclude_unset=True)
    if "date" in u:
        u["date"] = _valid_date(u["date"])
    await _check(u)
    if u.get("name"):
        u["name"] = u["name"].strip()
    u["updated_at"] = _now()
    await db.holidays.update_one({"id": hid}, {"$set": u})
    await log_activity(user, "holiday_updated", "holiday", hid, u.get("name", h["name"]))
    return _enrich(await db.holidays.find_one({"id": hid}, {"_id": 0}), await _branch_names())


@router.post("/holidays/bulk")
async def bulk_holidays(body: HolidayBulk, user: dict = Depends(get_current_user)):
    """Paste a list (date, name[, type]) — e.g. the year's festival list from HR. Duplicates are skipped."""
    _need_manage(user)
    if not body.rows:
        raise HTTPException(status_code=400, detail="Nothing to import")
    if len(body.rows) > 200:
        raise HTTPException(status_code=400, detail="Import up to 200 holidays at a time")
    await _check({"type": body.type, "branch_ids": body.branch_ids})
    added, skipped = 0, 0
    for r in body.rows:
        d = _valid_date(r.date)
        name = r.name.strip()
        typ = (r.type or body.type or "public").strip().lower()
        if typ not in TYPES:
            typ = body.type
        if not name or await db.holidays.find_one({"date": d, "name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}}):
            skipped += 1
            continue
        await db.holidays.insert_one({"id": str(uuid.uuid4()), "date": d, "name": name, "type": typ, "branch_ids": body.branch_ids,
                                      "notes": "", "created_by": user["id"], "created_at": _now(), "updated_at": _now()})
        added += 1
    await log_activity(user, "holidays_imported", "holiday", "-", f"{added} added, {skipped} skipped")
    return {"added": added, "skipped": skipped}


@router.get("/holidays/calendar")
async def calendar(month: Optional[str] = None, branch: Optional[str] = None, user: dict = Depends(get_current_user)):
    """One month: every day with its holidays, weekly-off flag and who's on leave (team view for managers)."""
    from routes_daily import get_settings, _is_team, _team_people, _home_branch
    from routes_daily import _local_now
    s = await get_settings()
    today = _local_now(s).date()
    m = month or today.strftime("%Y-%m")
    try:
        first = date.fromisoformat(m + "-01")
    except ValueError:
        raise HTTPException(status_code=400, detail="Month must be YYYY-MM")
    nxt = (first.replace(day=28) + timedelta(days=4)).replace(day=1)
    days = [first + timedelta(days=i) for i in range((nxt - first).days)]
    names = await _branch_names()
    hols = [_enrich(h, names) for h in await holidays_between(first.isoformat(), (nxt - timedelta(days=1)).isoformat())]
    own_branch = _home_branch(user)
    view_branch = branch if branch else (None if _is_team(user) else own_branch)
    if view_branch:
        hols = [h for h in hols if not h.get("branch_ids") or view_branch in h["branch_ids"]]
    team = _is_team(user)
    people = await _team_people(user, view_branch) if team else [user]
    ids = [p["id"] for p in people]
    leaves = await db.daily_reports.find({"date": {"$gte": first.isoformat(), "$lt": nxt.isoformat()}, "user_id": {"$in": ids},
                                          "status": {"$in": ["leave", "half_day", "wfh"]}},
                                         {"_id": 0, "user_id": 1, "user_name": 1, "date": 1, "status": 1}).to_list(5000)
    by_day = {}
    for lv in leaves:
        by_day.setdefault(lv["date"], []).append({"user_id": lv["user_id"], "name": lv.get("user_name"), "status": lv["status"]})
    off = set(s.get("weekly_off") or [])
    out_days = []
    for d in days:
        iso = d.isoformat()
        out_days.append({"date": iso, "weekday": d.weekday(), "weekly_off": d.weekday() in off,
                         "holidays": [h for h in hols if h["date"] == iso], "away": by_day.get(iso, []), "is_today": d == today})
    upcoming = await db.holidays.find({"date": {"$gte": today.isoformat(), "$lte": (today + timedelta(days=120)).isoformat()}},
                                      {"_id": 0}).sort("date", 1).to_list(100)
    if view_branch:
        upcoming = [h for h in upcoming if not h.get("branch_ids") or view_branch in h["branch_ids"]]
    return {"month": m, "today": today.isoformat(), "branch": view_branch, "branch_name": names.get(view_branch) if view_branch else None,
            "days": out_days, "holidays": hols, "upcoming": [_enrich(h, names) for h in upcoming[:8]],
            "is_team": team, "can_manage": has_permission(user, "holidays.manage"),
            "branches": [{"id": k, "name": v} for k, v in sorted(names.items(), key=lambda x: x[1])]}
