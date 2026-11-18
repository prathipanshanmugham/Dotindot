import re
from datetime import datetime, timezone, timedelta, date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from database import db
from locations_util import project_location, tx_location
from permissions import ceo_scope, require_permission
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


def ceo_locations(user: dict, branch: Optional[str]):
    """Which locations a CEO view covers: None = the whole company; else a list. A location CEO only ever gets theirs."""
    scope = ceo_scope(user)
    if branch and branch != "all":
        if scope is not None and branch not in scope:
            raise HTTPException(status_code=403, detail="That location isn't one of yours")
        return [branch]
    return scope


@router.get("/ceo/dashboard")
async def ceo_dashboard(period: str = Query("this_month"), branch: str = Query(None), user: dict = Depends(require_permission("ceo_dashboard"))):
    return await ceo_data(period, branch, user)


async def ceo_data(period: str, branch: Optional[str], user: dict) -> dict:
    if period not in ("this_month", "quarter", "ytd", "last_6_months"):
        raise HTTPException(status_code=400, detail="Period is this_month, quarter, ytd or last_6_months")
    locs = ceo_locations(user, branch)
    start, end, prev_start, prev_end = ceo_ranges(period)
    t = _today()

    tx = await db.transactions.find({}, {"_id": 0}).to_list(20000)
    clients = await db.clients.find({}, {"_id": 0, "credentials": 0}).to_list(2000)
    leads = await db.leads.find({}, {"_id": 0}).to_list(2000)
    users = await db.users.find({"is_active": True, "deleted": {"$ne": True}}, {"_id": 0, "id": 1, "name": 1, "branch_id": 1, "branch_assignments": 1, "role": 1}).to_list(2000)
    projects = await db.projects.find({}, {"_id": 0, "id": 1, "status": 1, "team_member_ids": 1, "client_id": 1, "kind": 1, "branch_id": 1,
                                           "billing_type": 1, "recurring_amount": 1, "billing_cycle": 1, "start_date": 1, "end_date": 1}).to_list(5000)

    if locs is not None:
        lset = set(locs)
        _cb = {c["id"]: c.get("branch_id") for c in clients}
        _pl = {p["id"]: project_location(p, _cb) for p in projects}
        clients = [c for c in clients if c.get("branch_id") in lset]
        tx = [x for x in tx if tx_location(x, _pl, _cb) in lset]
        leads = [l for l in leads if l.get("branch_id") in lset]
        projects = [p for p in projects if _pl.get(p["id"]) in lset]
        from routes_daily import _home_branch
        users = [u for u in users if _home_branch(u) in lset]

    income, expense = sums_in(tx, start, end)
    prev_income, prev_expense = sums_in(tx, prev_start, prev_end)

    # 1. MRR / ARR + 6-month trend — from recurring projects (the same numbers as Finance → MRR & ARR)
    from revenue import mrr_in_month, ist_today
    today_ist = ist_today()
    trend_months = [add_months(t.replace(day=1), -i) for i in range(5, -1, -1)]
    mrr_trend = [{"month": m.isoformat()[:7], "value": round(sum(mrr_in_month(p, m.year, m.month, today_ist) for p in projects), 2)} for m in trend_months]
    mrr = mrr_trend[-1]["value"]

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

    bnames = {b["id"]: b["name"] for b in await db.branches.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(200)}

    # 9. Team cost: what payslips for the period's months cost (employer cost), for people based at these locations
    slips = await db.payslips.find({"month": {"$gte": start[:7], "$lte": end[:7]}}, {"_id": 0, "user_id": 1, "employer_cost": 1}).to_list(20000)
    if locs is not None:
        from routes_daily import _home_branch
        homes = {u["id"]: _home_branch(u) for u in await db.users.find({}, {"_id": 0, "id": 1, "branch_id": 1, "branch_assignments": 1}).to_list(5000)}
        slips = [x for x in slips if homes.get(x["user_id"]) in set(locs)]
    team_cost = round(sum(float(x.get("employer_cost") or 0) for x in slips), 2)
    return {
        "period": period,
        "scope": {"locations": None if locs is None else [{"id": b, "name": bnames.get(b, "")} for b in locs],
                  "label": "All locations" if locs is None else ", ".join(bnames.get(b, "") for b in locs) or "No locations",
                  "company_wide_costs_excluded": locs is not None},
        "range": {"start": start, "end": end},
        "prev_range": {"start": prev_start, "end": prev_end},
        "mrr": {
            "value": mrr, "arr": round(mrr * 12, 2), "trend": mrr_trend,
            "formula": "Recurring projects live today, each turned into a monthly amount (a quarterly fee ÷ 3, a yearly fee ÷ 12). Projects on hold are left out. ARR = MRR × 12.",
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
        "team": {"cost": team_cost, "payslips": len(slips),
                 "contribution": round(income - expense - team_cost, 2) if locs is not None else None,
                 "formula": "Team cost = employer cost on payslips for the period's months, for people based here. Contribution = income − "
                            "this location's expenses − its team cost (company-wide costs like rent and shared tools are not included)."},
        "utilization": {"headcount": headcount, "utilized": utilized, "rate_pct": utilization,
                        "formula": "Users assigned to ≥1 active project ÷ active headcount."},
        "regions": {"by_region": by_region, "top3": by_region[:3]},
    }


PERIOD_LABEL = {"this_month": "This month", "quarter": "This quarter", "ytd": "This year so far", "last_6_months": "Last 6 months"}


@router.get("/ceo/report.pdf")
async def ceo_report_pdf(period: str = Query("this_month"), branch: str = Query(None), user: dict = Depends(require_permission("ceo_dashboard"))):
    """The CEO report as a PDF: one location (or all of a CEO's locations), for the chosen period."""
    from fastapi.responses import Response
    from export_engine import build_pdf
    from routes_scores import location_scores
    from auth import log_activity
    d = await ceo_data(period, branch, user)
    scores = await location_scores(user)
    want = None if d["scope"]["locations"] is None else {x["id"] for x in d["scope"]["locations"]}
    srows = []
    for l in scores["locations"]:
        if want is not None and l["id"] not in want:
            continue
        part = {p["key"]: p for p in l["parts"]}
        srows.append({"name": l["name"], "score": "—" if l["score"] is None else f"{l['score']} / 100",
                      "band": {"strong": "Strong", "steady": "Steady", "attention": "Needs attention"}.get(l["band"], "Not scored"),
                      **{k: ("—" if part[k]["score"] is None else part[k]["score"]) for k in part}})
    m, t = d["margin"], d["team"]
    money = [
        {"metric": "Income", "now": m["income"], "prev": m["prev_income"], "change": f"{m['income_change_pct']}%" if m["income_change_pct"] is not None else "—"},
        {"metric": "Expenses", "now": m["expense"], "prev": m["prev_expense"], "change": "—"},
        {"metric": "Margin", "now": f"{m['value_pct']}%" if m["value_pct"] is not None else "—", "prev": f"{m['prev_pct']}%" if m["prev_pct"] is not None else "—",
         "change": f"{m['change']} pts" if m["change"] is not None else "—"},
        {"metric": "Team cost (payslips)", "now": t["cost"], "prev": "", "change": ""},
        {"metric": "Revenue per person", "now": d["revenue_per_employee"]["value"], "prev": d["revenue_per_employee"]["prev"], "change": "—"},
        {"metric": "Marketing spend", "now": d["cac"]["marketing_spend"], "prev": "", "change": ""},
        {"metric": "Cost to win a client (CAC)", "now": d["cac"]["value"] if d["cac"]["value"] is not None else "—", "prev": d["cac"]["prev"] if d["cac"]["prev"] is not None else "—", "change": "—"},
    ]
    if t["contribution"] is not None:
        money.insert(3, {"metric": "Contribution (income − expenses − team)", "now": t["contribution"], "prev": "", "change": ""})
    for r in money:
        for k in ("now", "prev"):
            if isinstance(r[k], (int, float)):
                r[k] = f"₹{r[k]:,.0f}"
    sections = []
    if srows:
        sections.append({"title": "Location score (this month so far, out of 100)",
                         "columns": [("name", "Location", "text"), ("score", "Score", "text"), ("band", "Band", "text"), ("sales", "Sales", "text"),
                                     ("collections", "Collections", "text"), ("delivery", "Delivery", "text"), ("clients", "Clients", "text"), ("attendance", "Attendance", "text")],
                         "rows": srows})
    sections += [
        {"title": f"Money — {PERIOD_LABEL.get(period, period)} vs the period before",
         "columns": [("metric", "Measure", "text"), ("now", "This period", "text"), ("prev", "Before", "text"), ("change", "Change", "text")], "rows": money},
        {"title": "Recurring revenue (MRR) — last 6 months", "columns": [("month", "Month", "text"), ("value", "MRR", "money")], "rows": d["mrr"]["trend"]},
        {"title": "Income and expenses by month", "columns": [("month", "Month", "text"), ("income", "Income", "money"), ("expense", "Expenses", "money"), ("margin_pct", "Margin %", "num")],
         "rows": d["margin"]["trend"]},
        {"title": "Sales pipeline", "columns": [("stage", "Stage", "text"), ("count", "Leads", "num"), ("value", "Value", "money")],
         "rows": [{**x, "stage": x["stage"].replace("_", " ").capitalize()} for x in d["pipeline"]["by_stage"]]},
        {"title": "Clients and team", "columns": [("k", "Measure", "text"), ("v", "Value", "text")], "rows": [
            {"k": "Clients", "v": d["retention"]["total_clients"]}, {"k": "Churned clients", "v": d["retention"]["churned"]},
            {"k": "Retention", "v": f"{d['retention']['retained_pct']}%"}, {"k": "People", "v": d["utilization"]["headcount"]},
            {"k": "On an active project", "v": f"{d['utilization']['utilized']} ({d['utilization']['rate_pct']}%)"},
            {"k": "Leads won in period", "v": d["cac"]["new_clients_won"]}]},
    ]
    summary = [{"label": "Income", "value": m["income"], "money": True}, {"label": "Expenses", "value": m["expense"], "money": True},
               {"label": "Margin", "value": f"{m['value_pct']}%" if m["value_pct"] is not None else "—"},
               {"label": "MRR", "value": d["mrr"]["value"], "money": True}, {"label": "ARR", "value": d["mrr"]["arr"], "money": True},
               {"label": "Open pipeline", "value": d["pipeline"]["total_value"], "money": True}]
    note = " Company-wide costs (rent, shared tools, payroll not tied to a location) are not in these figures." if d["scope"]["company_wide_costs_excluded"] else ""
    subtitle = f"{d['scope']['label']} · {PERIOD_LABEL.get(period, period)} ({d['range']['start']} to {d['range']['end']}) · prepared for {user['name']}.{note}"
    pdf = build_pdf(f"CEO report — {d['scope']['label']}", subtitle, sections, summary=summary, generated_by=user["name"])
    await log_activity(user, "ceo_report_downloaded", "report", None, f"{d['scope']['label']} · {period}")
    slug = re.sub(r"[^a-z0-9]+", "-", d["scope"]["label"].lower()).strip("-")[:40] or "all"
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="ceo-report-{slug}-{d["range"]["end"]}.pdf"'})
