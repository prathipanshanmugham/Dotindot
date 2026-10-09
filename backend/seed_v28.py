"""Optional demo data for v2.8 (holiday calendar, timesheets, cost rates, location-tagged roles).
NOT run at startup — call seed_v28() manually on a demo/staging database. Idempotent.
Holidays here are fixed-date ones only; add festival dates (Pongal, Diwali, Eid…) from your HR list each year."""
import random
import uuid
from datetime import date, datetime, timedelta, timezone
from database import db

IST = timezone(timedelta(hours=5, minutes=30))
MUMBAI, DUBAI, LONDON = "seed-branch-01", "seed-branch-02", "seed-branch-03"

HOLIDAYS = [
    ("2026-01-01", "New Year's Day", "company", []),
    ("2026-01-26", "Republic Day", "public", [MUMBAI]),
    ("2026-05-01", "Maharashtra Day", "regional", [MUMBAI]),
    ("2026-08-15", "Independence Day", "public", [MUMBAI]),
    ("2026-10-02", "Gandhi Jayanti", "public", [MUMBAI]),
    ("2026-12-02", "UAE National Day", "public", [DUBAI]),
    ("2026-12-03", "UAE National Day (2nd day)", "public", [DUBAI]),
    ("2026-12-25", "Christmas Day", "public", [MUMBAI, LONDON]),
    ("2026-12-31", "New Year's Eve", "optional", []),
    ("2027-01-01", "New Year's Day", "company", []),
    ("2027-01-26", "Republic Day", "public", [MUMBAI]),
]
COST_RATES = {"admin": 1500, "finance": 800, "sales": 700, "pm": 900, "employee": 450, "ads_manager": 750, "social_manager": 600}
INTERNAL = ["Team meetings", "Internal tools & admin", "Learning / training"]


def _home(u):
    return u.get("branch_id") or next((a.get("branch_id") for a in u.get("branch_assignments") or [] if a.get("branch_id")), None)


async def seed_v28():
    rnd = random.Random(28)
    now = datetime.now(timezone.utc).isoformat()
    today = datetime.now(IST).date()
    branches = {b["id"] for b in await db.branches.find({}, {"_id": 0, "id": 1}).to_list(50)}

    # ---- holidays ----
    if not await db.holidays.find_one({"seed": "v28"}):
        for d, name, typ, bids in HOLIDAYS:
            bids = [b for b in bids if b in branches]
            await db.holidays.insert_one({"id": str(uuid.uuid4()), "seed": "v28", "date": d, "name": name, "type": typ, "branch_ids": bids,
                                          "notes": "", "created_by": "user-admin", "created_at": now, "updated_at": now})
            # demo attendance generated before the calendar existed: clear check-ins on that day off
            if typ != "optional":
                q = {"date": d, "seed": "v27"}
                if bids:
                    q["branch_id"] = {"$in": bids}
                await db.daily_reports.delete_many(q)

    # ---- cost rates ----
    if not await db.settings.find_one({"id": "cost_rates"}):
        await db.settings.insert_one({"id": "cost_rates", "rates": COST_RATES, "per_user": {}, "updated_at": now})

    # ---- location-tagged roles in the org chart ----
    if await db.org_nodes.count_documents({}) and not await db.org_nodes.find_one({"seed": "v28"}):
        depts = {n["title"]: n["id"] for n in await db.org_nodes.find({"kind": "department"}, {"_id": 0, "id": 1, "title": 1}).to_list(50)}
        adds = [("Account Manager", "Sales & Business Development", DUBAI, ["Owns Dubai client relationships day to day", "Runs monthly reviews with UAE clients"],
                 ["Client retention", "Upsell revenue"]),
                ("Business Development Lead", "Sales & Business Development", LONDON, ["Builds the UK pipeline", "Represents dotindot at London events"],
                 ["Qualified leads per month", "Win rate"]),
                ("Content Writer", "Creative & Delivery", LONDON, ["Writes web and social copy for UK clients", "Keeps tone consistent with each brand"],
                 ["Pieces delivered on time", "Revision rounds"])]
        for i, (title, dept_name, bid, resp, kpis) in enumerate(adds):
            if dept_name in depts and bid in branches:
                await db.org_nodes.insert_one({"id": str(uuid.uuid4()), "seed": "v28", "title": title, "kind": "role", "parent_id": depts[dept_name],
                                               "person_ids": [], "responsibilities": resp, "kpis": kpis, "description": "", "color": None, "order": 50 + i,
                                               "branch_id": bid, "created_at": now, "updated_at": now, "created_by": "user-admin"})

    # ---- timesheets for the last three weeks ----
    if not await db.timesheets.find_one({"seed": "v28"}):
        users = [u for u in await db.users.find({"role": {"$ne": "super_admin"}}, {"_id": 0, "password_hash": 0}).to_list(200) if u.get("is_active", True)]
        this_mon = today - timedelta(days=today.weekday())
        weeks = [this_mon - timedelta(days=7 * k) for k in (3, 2, 1)]
        for u in users:
            for wi, mon in enumerate(weeks):
                dates = [(mon + timedelta(days=i)).isoformat() for i in range(7)]
                recs = {r["date"]: r for r in await db.daily_reports.find({"user_id": u["id"], "date": {"$in": dates}}, {"_id": 0}).to_list(10)}
                days, rows = {}, {}
                for d in dates:
                    r = recs.get(d)
                    if not r or not r.get("status"):
                        continue
                    if r["status"] == "leave":
                        days[d] = {"status": "leave", "start": None, "end": None, "break_min": 0, "note": ""}
                        continue
                    start = r.get("check_in_local") or "09:30"
                    end = r.get("check_out_local") or ("13:30" if r["status"] == "half_day" else "18:30")
                    brk = 0 if r["status"] == "half_day" else 60
                    days[d] = {"status": r["status"], "start": start, "end": end, "break_min": brk, "note": ""}
                    at_work = max(0.0, ((int(end[:2]) * 60 + int(end[3:])) - (int(start[:2]) * 60 + int(start[3:])) - brk) / 60)
                    logged = 0.0
                    for t in ((r.get("report") or {}).get("tasks") or []):
                        if t.get("hours"):
                            key = t.get("project_id") or "internal:" + INTERNAL[0]
                            row = rows.setdefault(key, {"id": str(uuid.uuid4()), "project_id": t.get("project_id"), "task": "" if t.get("project_id") else INTERNAL[0],
                                                        "billable": bool(t.get("project_id")), "hours": {}})
                            row["hours"][d] = round(row["hours"].get(d, 0) + float(t["hours"]), 2)
                            logged += float(t["hours"])
                    rest = round(max(0.0, min(at_work, 8.0) - logged) * 2) / 2
                    if rest > 0:
                        name = rnd.choice(INTERNAL)
                        row = rows.setdefault("internal:" + name, {"id": str(uuid.uuid4()), "project_id": None, "task": name, "billable": False, "hours": {}})
                        row["hours"][d] = round(row["hours"].get(d, 0) + rest, 2)
                if not days:
                    continue
                if wi < 2:
                    status = "approved"
                else:
                    roll = rnd.random()
                    status = "submitted" if roll < 0.55 else "draft" if roll < 0.8 else "rejected" if roll < 0.9 else None
                if status is None:
                    continue
                doc = {"id": str(uuid.uuid4()), "seed": "v28", "user_id": u["id"], "user_name": u["name"], "branch_id": _home(u),
                       "week_start": mon.isoformat(), "days": days, "rows": list(rows.values()), "status": status,
                       "submitted_at": now if status in ("submitted", "approved", "rejected") else None,
                       "approved_by": "Midhun" if status == "approved" else None, "approved_at": now if status == "approved" else None,
                       "review_note": "Please split the 'Team meetings' hours by client where you can." if status == "rejected" else "",
                       "reviewed_by": "Midhun" if status == "rejected" else None, "created_at": now, "updated_at": now}
                await db.timesheets.insert_one(doc)
