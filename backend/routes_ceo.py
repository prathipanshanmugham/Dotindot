from datetime import datetime, timezone, timedelta, date
from fastapi import APIRouter, Depends, Query
from database import db
from auth import require_roles
from routes_sales import won_at, OPEN_STAGES

router = APIRouter()

ACTIVE_PROJECT_STATUSES = ("kickoff", "in_progress", "review")


def _today() -> date:
    return datetime.now(timezone.utc).date()


def add_months(d: date, n: int) -> date:
    m = d.month - 1 + n
    y = d.year + m // 12
    return date(y, m % 12 + 1, 1)


def month_end(d: date) -> date:
    return add_months(d, 1) - timedelta(days=1)


def ceo_ranges(period: str):
    t = _today()
    if period == "quarter":
        qs = (t.month - 1) // 3 * 3 + 1
        start = date(t.year, qs, 1)
        prev_end = start - timedelta(days=1)
        pqs = (prev_end.month - 1) // 3 * 3 + 1
        prev_start = date(prev_end.year, pqs, 1)
    elif period == "ytd":
        start = date(t.year, 1, 1)
        prev_start, prev_end = date(t.year - 1, 1, 1), date(t.year - 1, 12, 31)
    elif period == "last_6_months":
        start = add_months(t.replace(day=1), -5)
        prev_start = add_months(start, -6)
        prev_end = start - timedelta(days=1)
    else:  # this_month
        start = t.replace(day=1)
        prev_end = start - timedelta(days=1)
        prev_start = prev_end.replace(day=1)
    return start.isoformat(), t.isoformat(), prev_start.isoformat(), prev_end.isoformat()


def pct_change(cur, prev):
    if prev in (0, None):
        return None
    return round((cur - prev) / abs(prev) * 100, 1)


def sums_in(tx, start, end):
    income = expense = 0
    for x in tx:
        d = x.get("date") or ""
        if start <= d <= end:
            if x["type"] == "income":
                income += x["amount"]
            else:
                expense += x["amount"]
    return round(income, 2), round(expense, 2)


def contract_monthly_value(c):
    try:
        s = date.fromisoformat(c["start_date"])
        e = date.fromisoformat(c["expiry_date"])
    except (TypeError, ValueError, KeyError):
        return None
    months = max(((e - s).days) / 30.44, 1)
    return c.get("value", 0) / months, s, e


def mrr_at(clients, at: date) -> float:
    total = 0
    for cl in clients:
        if not (cl.get("retainer") and cl.get("status") == "active"):
            continue
        for c in cl.get("contracts", []):
            r = contract_monthly_value(c)
            if r and r[1] <= at <= r[2]:
                total += r[0]
    return round(total, 2)


@router.get("/ceo/dashboard")
async def ceo_dashboard(period: str = Query("this_month"), user: dict = Depends(require_roles("admin"))):
    start, end, prev_start, prev_end = ceo_ranges(period)
    t = _today()

    tx = await db.transactions.find({}, {"_id": 0}).to_list(20000)
    clients = await db.clients.find({}, {"_id": 0, "credentials": 0}).to_list(2000)
    leads = await db.leads.find({}, {"_id": 0}).to_list(2000)
    users = await db.users.find({"is_active": True}, {"_id": 0, "id": 1, "name": 1}).to_list(500)
    projects = await db.projects.find({}, {"_id": 0, "id": 1, "status": 1, "team_member_ids": 1}).to_list(2000)

    income, expense = sums_in(tx, start, end)
    prev_income, prev_expense = sums_in(tx, prev_start, prev_end)

    # 1. MRR / ARR + 6-month trend
    mrr = mrr_at(clients, t)
    trend_months = [add_months(t.replace(day=1), -i) for i in range(5, -1, -1)]
    mrr_trend = [{"month": m.isoformat()[:7], "value": mrr_at(clients, min(month_end(m), t))} for m in trend_months]

    # 2. CAC = marketing ledger spend in period / leads won in period
    def mkt_spend(s, e):
        return round(sum(x["amount"] for x in tx if x["type"] == "expense" and x.get("category") == "marketing" and s <= (x.get("date") or "") <= e), 2)

    def won_count(s, e):
        return sum(1 for l in leads if l["stage"] == "won" and (won_at(l) or "") and s <= won_at(l) <= e)

    spend, new_won = mkt_spend(start, end), won_count(start, end)
    prev_spend, prev_won = mkt_spend(prev_start, prev_end), won_count(prev_start, prev_end)
    cac = round(spend / new_won, 2) if new_won else None
    prev_cac = round(prev_spend / prev_won, 2) if prev_won else None

    # 3. Revenue per employee
    headcount = len(users)
    rpe = round(income / headcount, 2) if headcount else 0
    prev_rpe = round(prev_income / headcount, 2) if headcount else 0

    # 4. Retention / churn (from current status counts)
    churned = sum(1 for c in clients if c.get("status") == "churned")
    churn_rate = round(churned / len(clients) * 100, 1) if clients else 0

    # 5. Margin + trend
    margin = round((income - expense) / income * 100, 1) if income else None
    prev_margin = round((prev_income - prev_expense) / prev_income * 100, 1) if prev_income else None
    margin_trend = []
    for m in trend_months:
        ms, me = m.isoformat(), min(month_end(m), t).isoformat()
        mi, mx = sums_in(tx, ms, me)
        margin_trend.append({"month": ms[:7], "income": mi, "expense": mx,
                             "margin_pct": round((mi - mx) / mi * 100, 1) if mi else 0})

    # 6. Pipeline
    open_leads = [l for l in leads if l["stage"] in OPEN_STAGES]
    by_stage = []
    for s in OPEN_STAGES:
        rows = [l for l in open_leads if l["stage"] == s]
        by_stage.append({"stage": s, "count": len(rows), "value": round(sum(l.get("estimated_value", 0) for l in rows), 2)})

    # 7. Headcount & utilization
    active_projects = [p for p in projects if p["status"] in ACTIVE_PROJECT_STATUSES]
    utilized_ids = {uid for p in active_projects for uid in p.get("team_member_ids", [])}
    utilized = sum(1 for u in users if u["id"] in utilized_ids)
    utilization = round(utilized / headcount * 100, 1) if headcount else 0

    # 8. Global expansion: revenue by region in period
    cregion = {c["id"]: (c.get("region") or "Unassigned") for c in clients}
    region_rev, region_clients = {}, {}
    for c in clients:
        region_clients[cregion[c["id"]]] = region_clients.get(cregion[c["id"]], 0) + 1
    for x in tx:
        if x["type"] == "income" and x.get("client_id") and start <= (x.get("date") or "") <= end:
            r = cregion.get(x["client_id"], "Unassigned")
            region_rev[r] = region_rev.get(r, 0) + x["amount"]
    by_region = [{"region": r, "revenue": round(v, 2), "clients": region_clients.get(r, 0)}
                 for r, v in sorted(region_rev.items(), key=lambda i: -i[1])]

    return {
        "period": period,
        "range": {"start": start, "end": end},
        "prev_range": {"start": prev_start, "end": prev_end},
        "mrr": {
            "value": mrr, "arr": round(mrr * 12, 2), "trend": mrr_trend,
            "formula": "Sum of (active contract value ÷ contract duration in months) across active retainer clients. ARR = MRR × 12.",
        },
        "cac": {
            "value": cac, "prev": prev_cac, "change_pct": pct_change(cac, prev_cac) if cac is not None and prev_cac else None,
            "marketing_spend": spend, "new_clients_won": new_won,
            "formula": "Marketing expenses (ledger, category=marketing) in period ÷ leads won in period.",
        },
        "revenue_per_employee": {
            "value": rpe, "prev": prev_rpe, "change_pct": pct_change(rpe, prev_rpe), "headcount": headcount,
            "formula": "Total income in period ÷ active headcount.",
        },
        "retention": {
            "churn_rate_pct": churn_rate, "retained_pct": round(100 - churn_rate, 1),
            "churned": churned, "total_clients": len(clients),
            "label": "Computed from current client status counts (status-change history accrues over time).",
        },
        "margin": {
            "value_pct": margin, "prev_pct": prev_margin,
            "change": round(margin - prev_margin, 1) if margin is not None and prev_margin is not None else None,
            "income": income, "expense": expense, "prev_income": prev_income, "prev_expense": prev_expense,
            "income_change_pct": pct_change(income, prev_income), "trend": margin_trend,
        },
        "pipeline": {
            "total_value": round(sum(l.get("estimated_value", 0) for l in open_leads), 2),
            "open_count": len(open_leads), "by_stage": by_stage,
        },
        "utilization": {"headcount": headcount, "utilized": utilized, "rate_pct": utilization,
                        "formula": "Users assigned to ≥1 active project ÷ active headcount."},
        "regions": {"by_region": by_region, "top3": by_region[:3]},
    }
