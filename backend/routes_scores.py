"""v3.6 Location scores — one 0–100 score per Dotindot location, so each location (and its CEO) sees how it's doing.

Five parts, each scored 0–100 from real records, then weighted:
* Sales (25)        won this month ÷ the location's target for the month (Sales → Targets, "Location").
* Collections (25)  of the invoice money that fell due in the last 90 days, how much has come in.
* Delivery (25)     active projects on track: not past their end date, no milestone overdue.
* Clients (15)      active clients that are healthy (watch counts half).
* Attendance (10)   days present ÷ working days so far this month (holidays, weekly off and leave left out).

A part with nothing to measure yet (no target, no invoices due, no active projects…) is left out and the others are
re-weighted, so a new location isn't marked down for what it hasn't started. Every part returns its raw numbers.
"""
from datetime import date, timedelta
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException

from auth import get_current_user
from database import db
from locations_util import project_location
from permissions import branch_scope, has_permission
from revenue import ACTIVE_STATUSES, ist_today
from routes_clients import compute_health
from routes_sales import won_at

router = APIRouter()

WEIGHTS = {"sales": 25, "collections": 25, "delivery": 25, "clients": 15, "attendance": 10}
LABELS = {"sales": "Sales vs target", "collections": "Collections", "delivery": "Delivery on track", "clients": "Client health",
          "attendance": "Attendance"}
PRESENT = {"office": 1.0, "wfh": 1.0, "field": 1.0, "half_day": 0.5}


def band(score: Optional[float]) -> Optional[str]:
    if score is None:
        return None
    return "strong" if score >= 75 else "steady" if score >= 50 else "attention"


def _pct(a: float, b: float) -> Optional[int]:
    return min(100, round(100 * a / b)) if b > 0 else None


def _visible_branches(user: dict) -> Optional[List[str]]:
    """None = every location; else the ones this person may see a score for."""
    from routes_dashboard import managed_branches
    if has_permission(user, "ceo_dashboard"):
        return branch_scope(user)
    mb = managed_branches(user)
    if mb is None:
        return branch_scope(user)
    if not mb:
        raise HTTPException(status_code=403, detail="Location scores are for the CEO and location managers")
    scope = branch_scope(user)
    return [b for b in mb if scope is None or b in scope]


def _overdue(p: dict, today: str) -> bool:
    if p.get("end_date") and str(p["end_date"])[:10] < today:
        return True
    return any(m.get("due_date") and str(m["due_date"])[:10] < today and not m.get("done") for m in p.get("milestones") or [])


async def _attendance(bid: str, people: List[dict], today: date) -> Dict:
    from routes_daily import get_settings
    from routes_holidays import holidays_between, holiday_for
    first = today.replace(day=1)
    s = await get_settings()
    off = set(s.get("weekly_off") or [])
    hols = await holidays_between(first.isoformat(), today.isoformat())
    days = [first + timedelta(days=i) for i in range((today - first).days + 1)]
    working = [d.isoformat() for d in days if d.weekday() not in off and not holiday_for(hols, d.isoformat(), bid)]
    ids = [p["id"] for p in people]
    recs = await db.daily_reports.find({"user_id": {"$in": ids}, "date": {"$gte": first.isoformat(), "$lte": today.isoformat()}},
                                       {"_id": 0, "user_id": 1, "date": 1, "status": 1}).to_list(20000) if ids else []
    wset = set(working)
    present = sum(PRESENT.get(r.get("status"), 0) for r in recs if r["date"] in wset)
    leave = sum(1 for r in recs if r["date"] in wset and r.get("status") == "leave")
    expected = len(ids) * len(working) - leave
    return {"people": len(ids), "working_days": len(working), "present_days": present, "leave_days": leave, "expected_days": max(expected, 0),
            "records": len(recs)}


@router.get("/dashboard/location-scores")
async def location_scores(user: dict = Depends(get_current_user)):
    visible = _visible_branches(user)
    bq = {"status": {"$ne": "inactive"}}
    if visible is not None:
        bq["id"] = {"$in": visible}
    branches = await db.branches.find(bq, {"_id": 0, "id": 1, "name": 1, "city": 1, "head_name": 1}).sort("name", 1).to_list(100)
    today = ist_today()
    t = today.isoformat()
    month = t[:7]
    window_start = (today - timedelta(days=90)).isoformat()

    clients = await db.clients.find({}, {"_id": 0, "id": 1, "branch_id": 1, "status": 1, "updated_at": 1, "created_at": 1, "contracts": 1}).to_list(10000)
    cb = {c["id"]: c.get("branch_id") for c in clients}
    projects = await db.projects.find({}, {"_id": 0, "id": 1, "client_id": 1, "kind": 1, "branch_id": 1, "status": 1, "end_date": 1,
                                           "milestones": 1}).to_list(20000)
    ploc = {p["id"]: project_location(p, cb) for p in projects}
    leads = await db.leads.find({"stage": "won"}, {"_id": 0, "branch_id": 1, "estimated_value": 1, "stage": 1, "stage_history": 1,
                                                   "won_at": 1, "updated_at": 1}).to_list(10000)
    targets = await db.targets.find({"scope": "branch", "period": month}, {"_id": 0, "branch_id": 1, "amount": 1}).to_list(500)
    invoices = await db.billing_docs.find({"type": "invoice", "status": {"$nin": ["draft", "cancelled"]},
                                           "due_date": {"$gte": window_start, "$lte": t}},
                                          {"_id": 0, "client_id": 1, "project_id": 1, "total": 1, "inr_total": 1, "fx_rate": 1, "payments": 1}).to_list(20000)
    staff = await db.users.find({"is_active": {"$ne": False}, "deleted": {"$ne": True}, "role": {"$nin": ["client", "investor"]}},
                                {"_id": 0, "id": 1, "branch_id": 1, "branch_assignments": 1}).to_list(5000)

    active_by_client: Dict[str, int] = {}
    for p in projects:
        if p.get("status") in ACTIVE_STATUSES and p.get("client_id"):
            active_by_client[p["client_id"]] = active_by_client.get(p["client_id"], 0) + 1

    out = []
    for b in branches:
        bid = b["id"]
        parts: Dict[str, Dict] = {}

        # Sales — this month's won deals against the location's target
        won = [l for l in leads if l.get("branch_id") == bid and (won_at(l) or "")[:7] == month]
        won_value = round(sum(float(l.get("estimated_value") or 0) for l in won), 2)
        target = round(sum(float(x.get("amount") or 0) for x in targets if x.get("branch_id") == bid), 2)
        parts["sales"] = {"score": _pct(won_value, target), "won_value": won_value, "won_count": len(won), "target": target or None,
                          "missing": None if target else "no_target"}

        # Collections — invoices that fell due in the last 90 days
        due = paid = 0.0
        count = 0
        for d in invoices:
            loc = ploc.get(d.get("project_id")) if d.get("project_id") in ploc else cb.get(d.get("client_id"))
            if loc != bid:
                continue
            fx = float(d.get("fx_rate") or 1)
            total = float(d.get("inr_total") or 0) or float(d.get("total") or 0) * fx
            got = sum(float(x.get("inr_amount") or 0) or float(x.get("amount") or 0) * fx for x in d.get("payments") or [])
            due += total
            paid += min(got, total)
            count += 1
        parts["collections"] = {"score": _pct(paid, due), "due": round(due, 2), "collected": round(paid, 2), "outstanding": round(max(due - paid, 0), 2),
                                "invoices": count, "missing": None if due > 0 else "no_invoices_due"}

        # Delivery — active projects on track
        act = [p for p in projects if ploc.get(p["id"]) == bid and p.get("status") in ACTIVE_STATUSES]
        late = [p for p in act if _overdue(p, t)]
        parts["delivery"] = {"score": _pct(len(act) - len(late), len(act)), "active": len(act), "on_track": len(act) - len(late), "late": len(late),
                             "missing": None if act else "no_active_projects"}

        # Clients — health of active clients
        mine = [c for c in clients if c.get("branch_id") == bid and c.get("status") == "active"]
        health = [compute_health(c, active_by_client.get(c["id"], 0)) for c in mine]
        healthy, watch = health.count("healthy"), health.count("watch")
        parts["clients"] = {"score": _pct(healthy + 0.5 * watch, len(mine)), "active": len(mine), "healthy": healthy, "watch": watch,
                            "at_risk": len(mine) - healthy - watch, "missing": None if mine else "no_clients"}

        # Attendance — staff based at this location
        from routes_daily import _home_branch
        people = [u for u in staff if _home_branch(u) == bid]
        att = await _attendance(bid, people, today)
        att_score = _pct(att["present_days"], att["expected_days"]) if att["records"] else None
        parts["attendance"] = {"score": att_score, **att,
                               "missing": None if att_score is not None else ("no_staff" if not people else "no_attendance")}

        scored = {k: v["score"] for k, v in parts.items() if v["score"] is not None}
        weight = sum(WEIGHTS[k] for k in scored)
        score = round(sum(v * WEIGHTS[k] for k, v in scored.items()) / weight) if weight else None
        out.append({"id": bid, "name": b["name"], "city": b.get("city") or "", "head": b.get("head_name") or "",
                    "score": score, "band": band(score), "scored_weight": weight, "provisional": score is not None and weight < 50,
                    "parts": [{"key": k, "label": LABELS[k], "weight": WEIGHTS[k], **parts[k]} for k in WEIGHTS]})

    out.sort(key=lambda r: (r["score"] is None, r["provisional"], -(r["score"] or 0), r["name"]))   # early reads (under half the card) rank after full ones
    for i, r in enumerate([r for r in out if r["score"] is not None]):
        r["rank"] = i + 1

    unassigned = None
    if visible is None:
        unassigned = {"clients": sum(1 for c in clients if not c.get("branch_id")),
                      "projects": sum(1 for p in projects if not ploc.get(p["id"])),
                      "leads": await db.leads.count_documents({"$or": [{"branch_id": None}, {"branch_id": ""}, {"branch_id": {"$exists": False}}]})}
    return {"month": month, "as_of": t, "weights": WEIGHTS, "locations": out, "unassigned": unassigned,
            "method": "Each part is scored 0–100 from your records and weighted: sales vs this month's location target 25, collections "
                      "(invoices due in the last 90 days that have been paid) 25, active projects on track 25, healthy active clients 15, "
                      "attendance so far this month 10. Parts with nothing to measure yet are left out and the rest re-weighted."}
