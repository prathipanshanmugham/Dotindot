"""MRR & ARR (Finance → MRR & ARR, permission `finance.revenue`).

GET  /revenue/summary          today's MRR / ARR, a 12-month trend with new / growth / shrink / lost, MRR by client,
                               service and branch, renewals coming up, and this month's recurring bills.
POST /revenue/draft-invoices   draft GST invoices for this month's recurring bills that aren't invoiced yet
                               (also needs `billing.manage`). Drafts are ordinary invoices: check and send them in Billing.
"""
import re
from datetime import date, timedelta
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from database import db
from auth import get_current_user, log_activity
from permissions import has_permission, branch_scope
from revenue import (ACTIVE_STATUSES, CYCLE_LABEL, SERVICES, SERVICE_TAG, add_months, bill_dates, is_recurring, ist_today, live_on, monthly,
                     months_back, movement, mrr_in_month, period_label, to_date, ym)

router = APIRouter()


def _need(user: dict, manage: bool = False):
    if not has_permission(user, "finance.revenue"):
        raise HTTPException(status_code=403, detail="MRR & ARR needs the Finance → MRR & ARR permission")
    if manage and not has_permission(user, "billing.manage"):
        raise HTTPException(status_code=403, detail="Drafting invoices needs the Billing → manage permission")


async def _scope(user: dict, branch: Optional[str]):
    """Client projects in this person's branches (and the chosen branch), with their clients."""
    branches = branch_scope(user)
    cq: Dict = {}
    if branch and branch != "all":
        if branches is not None and branch not in branches:
            raise HTTPException(status_code=403, detail="That branch is outside your access")
        cq["branch_id"] = branch
    elif branches is not None:
        cq["branch_id"] = {"$in": branches}
    clients = {c["id"]: c for c in await db.clients.find(cq, {"_id": 0, "id": 1, "name": 1, "branch_id": 1, "status": 1, "billing": 1, "contacts": 1,
                                                                "state": 1, "region": 1, "city": 1}).to_list(5000)}
    projects = await db.projects.find({"client_id": {"$in": list(clients)}, "kind": {"$ne": "internal"}}, {"_id": 0, "milestones": 0, "deliverables": 0}).to_list(10000)
    return clients, projects


async def _invoiced(project_ids: List[str], month: str) -> Dict[str, dict]:
    """Invoices already raised for a project's bill in this month (drafted from here, or made by hand in that month)."""
    if not project_ids:
        return {}
    first = f"{month}-01"
    y, m = int(month[:4]), int(month[5:7])
    last = (date(y + (m == 12), m % 12 + 1, 1) - timedelta(days=1)).isoformat()
    rows = await db.billing_docs.find({"project_id": {"$in": project_ids}, "type": {"$in": ["invoice", "proforma"]}, "status": {"$ne": "cancelled"},
                                       "$or": [{"recurring_period": month}, {"recurring_period": {"$exists": False}, "date": {"$gte": first, "$lte": last}}]},
                                      {"_id": 0, "id": 1, "number": 1, "project_id": 1, "status": 1, "total": 1, "type": 1}).to_list(5000)
    return {r["project_id"]: r for r in rows}


def _bills_for_month(projects: List[dict], clients: Dict[str, dict], y: int, m: int) -> List[dict]:
    first, last = date(y, m, 1), date(y + (m == 12), m % 12 + 1, 1) - timedelta(days=1)
    out = []
    for p in projects:
        if p.get("status") in ("on_hold",):
            continue
        for d in bill_dates(p, first, last):
            c = clients.get(p.get("client_id")) or {}
            out.append({"project_id": p["id"], "project": p["name"], "client_id": p.get("client_id"), "client": c.get("name", ""),
                        "bill_date": d.isoformat(), "amount": float(p.get("recurring_amount") or 0), "cycle": p.get("billing_cycle") or "monthly",
                        "period": period_label(p, d)})
    return sorted(out, key=lambda b: (b["bill_date"], b["client"]))


@router.get("/revenue/summary")
async def summary(branch: Optional[str] = None, months: int = 12, user: dict = Depends(get_current_user)):
    _need(user)
    months = max(3, min(int(months or 12), 36))
    today = ist_today()
    clients, projects = await _scope(user, branch)
    recurring = [p for p in projects if is_recurring(p)]

    # trend + movement, client by client
    trend = []
    prev: Dict[str, float] = {}
    span = months_back(months + 1, today)          # one extra month so the first point has a movement
    for i, (y, m) in enumerate(span):
        cur: Dict[str, float] = {}
        for p in recurring:
            v = mrr_in_month(p, y, m, today)
            if v:
                cur[p["client_id"]] = cur.get(p["client_id"], 0.0) + v
        if i:
            mv = movement(prev, cur)
            trend.append({"month": ym(y, m), "mrr": round(sum(cur.values()), 2), "clients": len(cur), **mv})
        prev = cur

    now_by_client = prev   # the last month in `span` is this month
    mrr = round(sum(now_by_client.values()), 2)
    paused = round(sum(monthly(p) for p in recurring if live_on(p, today) and p.get("status") == "on_hold"), 2)
    live = [p for p in recurring if mrr_in_month(p, today.year, today.month, today)]

    by_client = []
    for cid, v in sorted(now_by_client.items(), key=lambda kv: -kv[1]):
        ps = [p for p in live if p["client_id"] == cid]
        since = min((p.get("start_date") for p in ps if p.get("start_date")), default=None)
        by_client.append({"client_id": cid, "name": (clients.get(cid) or {}).get("name", "Unknown"), "mrr": round(v, 2), "arr": round(v * 12, 2),
                          "share": round(v / mrr * 100, 1) if mrr else 0, "projects": len(ps), "since": since})
    by_service: Dict[str, float] = {}
    by_branch: Dict[str, float] = {}
    for p in live:
        v = mrr_in_month(p, today.year, today.month, today)
        key = p.get("service") or "other"
        by_service[key] = by_service.get(key, 0.0) + v
        b = (clients.get(p["client_id"]) or {}).get("branch_id") or ""
        by_branch[b] = by_branch.get(b, 0.0) + v
    bnames = {b["id"]: b["name"] for b in await db.branches.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(200)}

    renewals = []
    horizon = today + timedelta(days=90)
    for p in live:
        e = to_date(p.get("end_date"))
        if e and today <= e <= horizon:
            renewals.append({"project_id": p["id"], "project": p["name"], "client_id": p["client_id"], "client": (clients.get(p["client_id"]) or {}).get("name", ""),
                             "end_date": e.isoformat(), "days_left": (e - today).days, "mrr": monthly(p)})
    renewals.sort(key=lambda r: r["end_date"])

    month = ym(today.year, today.month)
    bills = _bills_for_month(recurring, clients, today.year, today.month)
    done = await _invoiced([b["project_id"] for b in bills], month)
    for b in bills:
        inv = done.get(b["project_id"])
        b["invoice"] = {"id": inv["id"], "number": inv["number"], "status": inv["status"]} if inv else None
    nxt = add_months(date(today.year, today.month, 1), 1)
    next_bills = _bills_for_month(recurring, clients, nxt.year, nxt.month)

    one_time = [p for p in projects if not is_recurring(p)]
    fy_start = date(today.year if today.month >= 4 else today.year - 1, 4, 1)
    booked = [p for p in one_time if (to_date(p.get("start_date")) or to_date(p.get("created_at")) or date.min) >= fy_start]
    return {
        "as_of": today.isoformat(), "month": month,
        "mrr": mrr, "arr": round(mrr * 12, 2), "paused_mrr": paused,
        "recurring_clients": len(now_by_client), "recurring_projects": len(live),
        "arpa": round(mrr / len(now_by_client), 2) if now_by_client else 0,
        "this_month": trend[-1] if trend else None,
        "trend": trend,
        "by_client": by_client,
        "by_service": [{"service": k, "label": SERVICES.get(k, k.title()), "mrr": round(v, 2)} for k, v in sorted(by_service.items(), key=lambda kv: -kv[1])],
        "by_branch": [{"branch_id": k or None, "name": bnames.get(k, "No branch"), "mrr": round(v, 2)} for k, v in sorted(by_branch.items(), key=lambda kv: -kv[1])],
        "renewals": renewals,
        "bills": bills, "bills_total": round(sum(b["amount"] for b in bills), 2),
        "bills_open": sum(1 for b in bills if not b["invoice"]),
        "next_bills": next_bills, "next_bills_total": round(sum(b["amount"] for b in next_bills), 2),
        "one_time": {"active_value": round(sum(float(p.get("budget") or 0) for p in one_time if p.get("status") in ACTIVE_STATUSES), 2),
                     "active_projects": sum(1 for p in one_time if p.get("status") in ACTIVE_STATUSES),
                     "booked_this_fy": round(sum(float(p.get("budget") or 0) for p in booked), 2), "fy_start": fy_start.isoformat()},
        "can_draft": has_permission(user, "billing.manage"),
    }


class DraftIn(BaseModel):
    month: Optional[str] = None            # YYYY-MM, default this month
    project_ids: Optional[List[str]] = None


def _state_code(name: str) -> str:
    from routes_billing import STATES
    n = (name or "").strip().lower()
    return next((code for code, label in STATES.items() if label.lower() == n), "")


@router.post("/revenue/draft-invoices")
async def draft_invoices(body: DraftIn, user: dict = Depends(get_current_user)):
    _need(user, manage=True)
    from routes_billing import DocIn, PartyIn, LineIn, create_doc, company_profile, SERVICE_TAGS
    today = ist_today()
    month = body.month or ym(today.year, today.month)
    if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", month):
        raise HTTPException(status_code=400, detail="Month must look like 2026-11")
    y, m = int(month[:4]), int(month[5:7])
    clients, projects = await _scope(user, None)
    recurring = [p for p in projects if is_recurring(p)]
    bills = _bills_for_month(recurring, clients, y, m)
    if body.project_ids is not None:
        want = set(body.project_ids)
        bills = [b for b in bills if b["project_id"] in want]
    done = await _invoiced([b["project_id"] for b in bills], month)
    co = await company_profile()
    pmap = {p["id"]: p for p in recurring}
    created, skipped = [], []
    for b in bills:
        if b["project_id"] in done:
            skipped.append({"project": b["project"], "client": b["client"], "reason": f"Already invoiced ({done[b['project_id']]['number']})"})
            continue
        p, c = pmap[b["project_id"]], clients.get(b["client_id"]) or {}
        saved = c.get("billing") or {}
        contact = next((x for x in c.get("contacts") or [] if (x.get("name") or "").strip()), {})
        country = saved.get("country") or ("India" if (c.get("region") or "India") in ("", "India") else c.get("region"))
        state_code = saved.get("state_code") or (saved.get("gstin") or "")[:2] or _state_code(c.get("state"))
        party = PartyIn(name=saved.get("name") or contact.get("name") or "", company=saved.get("company") or c.get("name") or "",
                        email=saved.get("email") or contact.get("email") or "", phone=saved.get("phone") or contact.get("phone") or "",
                        address=saved.get("address") or "", city=saved.get("city") or c.get("city") or "", state_code=state_code,
                        country=country, gstin=saved.get("gstin") or "", tax_id=saved.get("tax_id") or "")
        if country != "India":
            tax_mode = "zero_rated" if co.get("lut") else "none"
        else:
            tax_mode = "gst_inter" if (state_code and co.get("state_code") and state_code != co["state_code"]) else "gst_intra"
        bd = date.fromisoformat(b["bill_date"])
        tags = [t for t in {SERVICE_TAG.get(p.get("service") or "other", "all"), "retainer"} if t in SERVICE_TAGS]
        try:
            doc = await create_doc(DocIn(
                type="invoice", client_id=b["client_id"], project_id=p["id"], title=f"{p['name']} — {b['period']}"[:160], bill_to=party,
                date=max(bd, today).isoformat(), tax_mode=tax_mode,
                items=[LineIn(description=f"{p['name']} — {b['period']}"[:200], details=(p.get("description") or "")[:800], qty=1,
                              unit=CYCLE_LABEL.get(p.get("billing_cycle") or "monthly", "month"), unit_price=float(p["recurring_amount"]))],
                service_tags=tags, reference=f"Recurring · {CYCLE_LABEL.get(p.get('billing_cycle') or 'monthly', 'month')}ly"[:120]), user)
        except HTTPException as exc:
            skipped.append({"project": b["project"], "client": b["client"], "reason": str(exc.detail)})
            continue
        await db.billing_docs.update_one({"id": doc["id"]}, {"$set": {"recurring_period": month}})
        created.append({"id": doc["id"], "number": doc["number"], "client": b["client"], "project": b["project"], "total": doc["total"]})
    if created:
        await log_activity(user, "recurring_invoices_drafted", "billing_doc", created[0]["id"], f"{len(created)} draft invoices for {month}")
    return {"month": month, "created": created, "skipped": skipped,
            "message": (f"{len(created)} draft invoice{'s' if len(created) != 1 else ''} ready in Billing — check and send them" if created
                        else "Nothing new to draft for this month")}
