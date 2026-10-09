"""Server-side PDF/Excel exports for every list view. RBAC mirrors the underlying data routes."""
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import Response
from database import db
from auth import get_current_user, log_activity
from export_engine import build_xlsx, build_pdf, inr
from routes_finance import monthly_equiv, name_maps, _profit_row
from routes_sales import targets_with_actuals, enrich_quotes, won_at
from routes_partnerships import _enrich as enrich_partnership
from routes_logs import _build_query as logs_query

router = APIRouter()

STAFF = ("admin", "finance", "sales", "pm")
FIN = ("admin", "finance")
SALES_READ = ("admin", "sales", "pm", "finance")
ALL = ("admin", "finance", "sales", "pm", "employee")


def _today():
    return datetime.now(timezone.utc).date()


async def _umap():
    users = await db.users.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(300)
    return {u["id"]: u["name"] for u in users}


# ---------- dataset fetchers: return (title, columns, rows, summary|None) ----------
async def fetch_clients(p, user):
    q = {}
    for k in ("industry", "service_type", "size", "status", "region"):
        if p.get(k):
            q[k] = p[k]
    if p.get("retainer") is not None and p.get("retainer") != "":
        q["retainer"] = str(p["retainer"]).lower() == "true"
    if p.get("search"):
        q["$or"] = [{"name": {"$regex": p["search"], "$options": "i"}}, {"company": {"$regex": p["search"], "$options": "i"}}]
    rows = await db.clients.find(q, {"_id": 0, "credentials": 0}).sort("name", 1).to_list(1000)
    cols = [("name", "Client", "text"), ("company", "Company", "text"), ("industry", "Industry", "text"),
            ("service_type", "Service", "text"), ("size", "Size", "text"), ("status", "Status", "text"),
            ("retainer", "Retainer", "text"), ("region", "Region", "text"), ("city", "City", "text")]
    return "Clients", cols, rows, [{"label": "Clients in export", "value": len(rows)},
                                   {"label": "Active", "value": sum(1 for r in rows if r.get("status") == "active")}]


async def fetch_projects(p, user):
    q = {}
    if user["role"] == "employee":
        q["team_member_ids"] = user["id"]
    if p.get("status"):
        q["status"] = p["status"]
    if p.get("client_id"):
        q["client_id"] = p["client_id"]
    if p.get("team_member"):
        q["team_member_ids"] = p["team_member"]
    rows = await db.projects.find(q, {"_id": 0}).sort("name", 1).to_list(1000)
    cmap, _ = await name_maps()
    for r in rows:
        r["client_name"] = cmap.get(r["client_id"], "")
    cols = [("name", "Project", "text"), ("client_name", "Client", "text"), ("status", "Status", "text"),
            ("budget", "Budget", "money"), ("start_date", "Start", "text"), ("end_date", "End", "text"),
            ("location", "Location", "text")]
    return "Projects", cols, rows, [{"label": "Projects", "value": len(rows)},
                                    {"label": "Total budget", "value": sum(r.get("budget", 0) for r in rows), "money": True}]


async def fetch_ledger(p, user):
    q = {}
    if p.get("start") or p.get("end"):
        q["date"] = {}
        if p.get("start"):
            q["date"]["$gte"] = p["start"]
        if p.get("end"):
            q["date"]["$lte"] = p["end"]
    if p.get("type"):
        q["type"] = p["type"]
    if p.get("category"):
        q["category"] = p["category"]
    rows = await db.transactions.find(q, {"_id": 0}).sort("date", -1).to_list(5000)
    cmap, pmap = await name_maps()
    for r in rows:
        r["client_name"] = cmap.get(r.get("client_id"), "")
        r["project_name"] = pmap.get(r.get("project_id"), "")
    income = sum(r["amount"] for r in rows if r["type"] == "income")
    expense = sum(r["amount"] for r in rows if r["type"] == "expense")
    cols = [("date", "Date", "text"), ("type", "Type", "text"), ("category", "Category", "text"),
            ("description", "Description", "text"), ("client_name", "Client", "text"),
            ("project_name", "Project", "text"), ("amount", "Amount", "money")]
    summary = [{"label": "Income", "value": income, "money": True}, {"label": "Expenses", "value": expense, "money": True},
               {"label": "Net", "value": income - expense, "money": True}, {"label": "Transactions", "value": len(rows)}]
    return "General Ledger", cols, rows, summary


async def fetch_expenses(p, user):
    q = {"status": p["status"]} if p.get("status") else {}
    if user["role"] not in FIN:
        q["submitted_by"] = user["id"]
    rows = await db.expenses.find(q, {"_id": 0}).sort("date", -1).to_list(2000)
    umap = await _umap()
    for r in rows:
        r["submitted_by_name"] = umap.get(r.get("submitted_by"), "")
    cols = [("date", "Date", "text"), ("category", "Category", "text"), ("description", "Description", "text"),
            ("submitted_by_name", "Submitted by", "text"), ("status", "Status", "text"), ("amount", "Amount", "money")]
    return "Expenses", cols, rows, [{"label": "Expenses", "value": len(rows)},
                                    {"label": "Total value", "value": sum(r.get("amount", 0) for r in rows), "money": True}]


async def fetch_subscriptions(p, user):
    rows = await db.subscriptions.find({}, {"_id": 0}).sort("next_renewal_date", 1).to_list(500)
    burn = 0
    for s in rows:
        s["monthly_equivalent"] = monthly_equiv(s["cost"], s["billing_cycle"])
        if s["status"] == "active":
            burn += s["monthly_equivalent"]
    cols = [("name", "Tool", "text"), ("vendor", "Vendor", "text"), ("billing_cycle", "Cycle", "text"),
            ("cost", "Cost", "money"), ("monthly_equivalent", "Monthly eq.", "money"),
            ("next_renewal_date", "Next renewal", "text"), ("owner", "Owner", "text"), ("status", "Status", "text")]
    return "Subscriptions", cols, rows, [{"label": "Subscriptions", "value": len(rows)},
                                         {"label": "Monthly burn", "value": round(burn, 2), "money": True}]


async def fetch_budgets(p, user):
    period = p.get("period") or _today().isoformat()[:7]
    from routes_finance import period_range
    budgets = await db.budgets.find({"period": period}, {"_id": 0}).to_list(100)
    start, end = period_range(period)
    tx = await db.transactions.find({"type": "expense", "date": {"$gte": start, "$lte": end}}, {"_id": 0, "category": 1, "amount": 1}).to_list(10000)
    actuals = {}
    for x in tx:
        actuals[x["category"]] = actuals.get(x["category"], 0) + x["amount"]
    rows = []
    for b in budgets:
        actual = round(actuals.get(b["category"], 0), 2)
        rows.append({**b, "actual": actual, "pct": round(actual / b["amount"] * 100, 1) if b["amount"] else 0,
                     "over": actual > b["amount"]})
    cols = [("period", "Period", "text"), ("category", "Category", "text"), ("amount", "Budget", "money"),
            ("actual", "Actual", "money"), ("pct", "% used", "num"), ("over", "Over budget", "text")]
    return f"Budgets — {period}", cols, rows, [{"label": "Budgeted", "value": sum(b["amount"] for b in budgets), "money": True},
                                               {"label": "Actual spend", "value": sum(r["actual"] for r in rows), "money": True}]


async def fetch_ai_spend(p, user):
    rows = await db.transactions.find(
        {"type": "expense", "$or": [{"category": "ai"}, {"ai_tool": {"$nin": [None, ""]}}]}, {"_id": 0}
    ).sort("date", -1).to_list(5000)
    cmap, pmap = await name_maps()
    for r in rows:
        r["client_name"] = cmap.get(r.get("client_id"), "")
        r["project_name"] = pmap.get(r.get("project_id"), "")
        r["ai_tool"] = r.get("ai_tool") or "Other AI"
    cols = [("date", "Date", "text"), ("ai_tool", "Tool", "text"), ("description", "Description", "text"),
            ("client_name", "Client", "text"), ("project_name", "Project", "text"), ("amount", "Amount", "money")]
    return "AI Spend", cols, rows, [{"label": "AI transactions", "value": len(rows)},
                                    {"label": "Total AI spend", "value": sum(r["amount"] for r in rows), "money": True}]


async def fetch_marketing(p, user):
    campaigns = await db.campaigns.find({}, {"_id": 0}).to_list(500)
    income = await db.transactions.find({"type": "income", "campaign_id": {"$nin": [None, ""]}}, {"_id": 0}).to_list(5000)
    cmap, _ = await name_maps()
    rev = {}
    for x in income:
        rev[x["campaign_id"]] = rev.get(x["campaign_id"], 0) + x["amount"]
    for c in campaigns:
        c["attributed_revenue"] = round(rev.get(c["id"], 0), 2)
        c["roi"] = round(c["attributed_revenue"] / c["spend"], 2) if c.get("spend") else 0
        c["client_name"] = cmap.get(c.get("client_id"), "") if c.get("client_id") else ""
    campaigns.sort(key=lambda c: -c.get("spend", 0))
    cols = [("name", "Campaign", "text"), ("channel", "Channel", "text"), ("period", "Period", "text"),
            ("client_name", "Client", "text"), ("spend", "Spend", "money"),
            ("attributed_revenue", "Attributed revenue", "money"), ("roi", "ROI (x)", "num")]
    ts = sum(c.get("spend", 0) for c in campaigns)
    tr = sum(c["attributed_revenue"] for c in campaigns)
    return "Marketing Financials", cols, campaigns, [
        {"label": "Total spend", "value": ts, "money": True}, {"label": "Attributed revenue", "value": tr, "money": True},
        {"label": "Overall ROI", "value": f"{round(tr / ts, 2) if ts else 0}x"}]


async def fetch_project_profit(p, user):
    pq = {"team_member_ids": user["id"]} if user["role"] == "pm" else {}
    projects = await db.projects.find(pq, {"_id": 0}).to_list(1000)
    tx = await db.transactions.find({"project_id": {"$nin": [None, ""]}}, {"_id": 0}).to_list(10000)
    by_p = {}
    for x in tx:
        by_p.setdefault(x["project_id"], []).append(x)
    cmap, _ = await name_maps()
    rows = [_profit_row(pr, by_p) for pr in projects]
    for r in rows:
        r["client_name"] = cmap.get(r["client_id"], "")
    rows.sort(key=lambda r: -r["net"])
    cols = [("project_name", "Project", "text"), ("client_name", "Client", "text"), ("status", "Status", "text"),
            ("budget", "Budget", "money"), ("revenue", "Revenue", "money"), ("linked_expenses", "Expenses", "money"),
            ("cost_allocation", "Allocation", "money"), ("net", "Net", "money"), ("margin_pct", "Margin %", "num")]
    return "Project Profit", cols, rows, [{"label": "Total revenue", "value": sum(r["revenue"] for r in rows), "money": True},
                                          {"label": "Total net", "value": sum(r["net"] for r in rows), "money": True}]


async def fetch_employee_revenue(p, user):
    projects = await db.projects.find({}, {"_id": 0, "id": 1, "team_member_ids": 1}).to_list(1000)
    team_map = {pr["id"]: pr.get("team_member_ids", []) for pr in projects}
    income = await db.transactions.find({"type": "income", "project_id": {"$nin": [None, ""]}}, {"_id": 0}).to_list(10000)
    users = await db.users.find({}, {"_id": 0, "id": 1, "name": 1, "role": 1}).to_list(300)
    umap = {u["id"]: u for u in users}
    totals = {}
    for x in income:
        members = team_map.get(x["project_id"], [])
        if not members:
            continue
        for uid in members:
            totals[uid] = totals.get(uid, 0) + x["amount"] / len(members)
    rows = [{"name": umap.get(uid, {}).get("name", "Former member"), "role": umap.get(uid, {}).get("role", ""),
             "revenue": round(v, 2)} for uid, v in sorted(totals.items(), key=lambda i: -i[1])]
    cols = [("name", "Team member", "text"), ("role", "Role", "text"), ("revenue", "Attributed revenue", "money")]
    return "Employee Revenue", cols, rows, [{"label": "Attributed total", "value": sum(r["revenue"] for r in rows), "money": True}]


async def fetch_leads(p, user):
    q = {}
    if p.get("stage"):
        q["stage"] = p["stage"]
    if p.get("source"):
        q["source"] = p["source"]
    if p.get("owner"):
        q["owner_id"] = p["owner"]
    rows = await db.leads.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)
    umap = await _umap()
    for l in rows:
        l["owner_name"] = umap.get(l.get("owner_id"), "")
        l["created"] = (l.get("created_at") or "")[:10]
    cols = [("name", "Lead", "text"), ("company", "Company", "text"), ("stage", "Stage", "text"),
            ("source", "Source", "text"), ("estimated_value", "Est. value", "money"),
            ("owner_name", "Owner", "text"), ("city", "City", "text"), ("follow_up_date", "Follow-up", "text"),
            ("created", "Created", "text")]
    return "Sales Pipeline", cols, rows, [{"label": "Leads", "value": len(rows)},
                                          {"label": "Pipeline value", "value": sum(l.get("estimated_value", 0) for l in rows), "money": True},
                                          {"label": "Won", "value": sum(1 for l in rows if l["stage"] == "won")}]


async def fetch_quotes(p, user):
    q = {"status": p["status"]} if p.get("status") else {}
    rows = await db.quotes.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    await enrich_quotes(rows)
    for r in rows:
        r["for_name"] = r.get("lead_name") or r.get("client_name") or ""
        r["created"] = (r.get("created_at") or "")[:10]
    cols = [("number", "Number", "text"), ("title", "Title", "text"), ("for_name", "For", "text"),
            ("status", "Status", "text"), ("validity_date", "Valid until", "text"),
            ("subtotal", "Subtotal", "money"), ("gst_amount", "GST", "money"), ("total", "Total", "money")]
    return "Quotes", cols, rows, [{"label": "Quotes", "value": len(rows)},
                                  {"label": "Total value", "value": sum(r.get("total", 0) for r in rows), "money": True},
                                  {"label": "Accepted", "value": sum(1 for r in rows if r["status"] == "accepted")}]


async def fetch_targets(p, user):
    q = {"period": p["period"]} if p.get("period") else {}
    rows = await targets_with_actuals(q)
    for r in rows:
        r["on_track_label"] = "On track" if r.get("on_track") else "Behind"
    cols = [("user_name", "Owner", "text"), ("scope", "Scope", "text"), ("period", "Period", "text"),
            ("amount", "Target", "money"), ("actual", "Actual", "money"), ("pct", "% achieved", "num"),
            ("on_track_label", "Status", "text")]
    return "Targets vs Actuals", cols, rows, [{"label": "Targets", "value": len(rows)},
                                              {"label": "On track", "value": sum(1 for r in rows if r.get("on_track"))}]


async def fetch_employees(p, user):
    q = {}
    if p.get("role"):
        q["role"] = p["role"]
    if p.get("city"):
        q["city"] = p["city"]
    if p.get("search"):
        q["$or"] = [{"name": {"$regex": p["search"], "$options": "i"}},
                    {"designation": {"$regex": p["search"], "$options": "i"}},
                    {"skills": {"$regex": p["search"], "$options": "i"}}]
    rows = await db.users.find(q, {"_id": 0, "password_hash": 0}).sort("name", 1).to_list(500)
    cols = [("name", "Name", "text"), ("email", "Email", "text"), ("role", "Role", "text"),
            ("designation", "Designation", "text"), ("department", "Department", "text"),
            ("city", "City", "text"), ("phone", "Phone", "text"), ("join_date", "Joined", "text"),
            ("skills", "Skills", "text")]
    return "Team Directory", cols, rows, [{"label": "Team members", "value": len(rows)}]


async def fetch_partnerships(p, user):
    rows = [enrich_partnership(r) for r in await db.partnerships.find({}, {"_id": 0}).sort("name", 1).to_list(500)]
    cols = [("name", "Partner", "text"), ("partner_type", "Type", "text"), ("category", "Category", "text"),
            ("cost", "Cost", "money"), ("billing_cycle", "Cycle", "text"), ("renewal_date", "Renews", "text"),
            ("days_to_renewal", "Days left", "num"), ("status", "Status", "text"), ("unused_value", "Unused benefits", "money")]
    return "Partnerships", cols, rows, [
        {"label": "Partnerships", "value": len(rows)},
        {"label": "Renewing ≤60d", "value": sum(1 for r in rows if r.get("renewing_soon"))},
        {"label": "Unused benefit value", "value": sum(r["unused_value"] for r in rows if r.get("status") == "active"), "money": True}]


async def fetch_ai_agents(p, user):
    from routes_agents import list_agents
    rows = await list_agents(status=p.get("status"), platform=p.get("platform"), assignee=p.get("assignee"),
                             search=p.get("search"), user=user)
    for r in rows:
        r["assigned_to"] = "Everyone" if r.get("open_to_all") else ", ".join(a["name"] for a in r.get("assignees", []))
        r["runs_30d"] = r["stats"]["runs_30d"]
        r["hours_saved_30d"] = r["stats"]["hours_saved_30d"]
        r["last_used"] = r["stats"]["last_used_at"] or "Never"
    cols = [("name", "Agent", "text"), ("platform", "Platform", "text"), ("agent_type", "Type", "text"),
            ("status", "Status", "text"), ("owner_name", "Owner", "text"), ("assigned_to", "Assigned to", "text"),
            ("monthly_cost", "Monthly cost", "money"), ("runs_30d", "Runs (30d)", "num"),
            ("hours_saved_30d", "Hours saved (30d)", "num"), ("cost_per_hour_saved", "Cost / hour saved", "money"),
            ("last_used", "Last used", "text")]
    return "AI Agents", cols, rows, [
        {"label": "Agents", "value": len(rows)},
        {"label": "Monthly cost", "value": sum(r.get("monthly_cost", 0) for r in rows if r.get("status") == "active"), "money": True},
        {"label": "Hours saved (30d)", "value": round(sum(r["hours_saved_30d"] for r in rows), 1)},
        {"label": "Idle agents", "value": sum(1 for r in rows if r.get("idle"))}]


async def fetch_org_structure(p, user):
    nodes = await db.org_nodes.find({}, {"_id": 0}).sort("order", 1).to_list(3000)
    people = {u["id"]: u["name"] for u in await db.users.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(2000)}
    by_id = {n["id"]: n for n in nodes}
    children = {}
    for n in nodes:
        children.setdefault(n.get("parent_id"), []).append(n)
    rows = []

    def walk(parent_id, depth):
        for n in children.get(parent_id, []):
            parent = by_id.get(n.get("parent_id"))
            rows.append({"title": ("    " * depth) + n["title"], "kind": n.get("kind"),
                         "people": ", ".join(people[x] for x in n.get("person_ids", []) if x in people) or "—",
                         "reports_to": parent["title"] if parent else "—",
                         "responsibilities": "; ".join(n.get("responsibilities") or []),
                         "kpis": "; ".join(n.get("kpis") or [])})
            walk(n["id"], depth + 1)
    walk(None, 0)
    cols = [("title", "Role / department", "text"), ("kind", "Type", "text"), ("people", "People", "text"),
            ("reports_to", "Reports to", "text"), ("responsibilities", "Responsibilities", "text"), ("kpis", "KPIs", "text")]
    return "Organisation Structure", cols, rows, [
        {"label": "Roles & departments", "value": len(rows)},
        {"label": "People placed", "value": len({x for n in nodes for x in n.get("person_ids", [])})}]


async def fetch_api_credits(p, user):
    from permissions import has_permission
    from routes_api_credits import list_txns, list_accounts
    if not has_permission(user, "finance.api_credits"):
        raise HTTPException(status_code=403, detail="You don't have permission for this module")
    rows = await list_txns(account_id=p.get("account_id"), kind=p.get("kind"), client_id=p.get("client_id"),
                           project_id=p.get("project_id"), start=p.get("start"), end=p.get("end"), limit=2000, user=user)
    for r in rows:
        r["amount_txt"] = f"{r['amount']:g} {r.get('currency', '')}"
        r["units_txt"] = f"{r['units']:g} {r.get('unit_label') or ''}".strip() if r.get("units") is not None else ""
    accts = await list_accounts(user=user)
    cols = [("date", "Date", "text"), ("account_name", "Account", "text"), ("kind", "Type", "text"), ("amount_txt", "Amount", "text"),
            ("amount_inr", "Amount (INR)", "money"), ("units_txt", "Units", "text"), ("client_name", "Client", "text"),
            ("project_name", "Project", "text"), ("agent_name", "AI agent", "text"), ("note", "Note", "text")]
    return "API Credits", cols, rows, [
        {"label": "Accounts", "value": len(accts)},
        {"label": "Prepaid balance", "value": round(sum(a["balance_inr"] or 0 for a in accts if a.get("status") == "active")), "money": True},
        {"label": "Used this month", "value": round(sum(a["used_mtd_inr"] for a in accts)), "money": True},
        {"label": "Low balance", "value": sum(1 for a in accts if a["low_balance"])}]


async def fetch_attendance(p, user):
    from routes_daily import attendance_month
    d = await attendance_month(month=p.get("month"), branch=p.get("branch"), user=user)
    rows = []
    for r in d["rows"]:
        t = r["totals"]
        rows.append({"name": r["user"]["name"], "branch": r["branch"], "present": t["present"], "late": t["late"], "wfh": t["wfh"],
                     "leave": t["leave"], "absent": t["absent"], "rate": f"{t['rate']}%" if t["rate"] is not None else "—",
                     "avg_check_in": t["avg_check_in"] or "—", "hours": t["hours"], "reports": t["reports"]})
    cols = [("name", "Person", "text"), ("branch", "Location", "text"), ("present", "Days present", "num"), ("late", "Late", "num"),
            ("wfh", "WFH", "num"), ("leave", "Leave", "num"), ("absent", "Absent", "num"), ("rate", "Attendance", "text"),
            ("avg_check_in", "Avg check-in", "text"), ("hours", "Hours", "num"), ("reports", "Reports filed", "num")]
    return f"Attendance — {d['month']}", cols, rows, [
        {"label": "People", "value": len(rows)}, {"label": "Working days so far", "value": d["working_days"]}] + [
        {"label": b["name"], "value": f"{b['rate']}%"} for b in d["by_branch"][:4]]


async def fetch_logs(p, user):
    q = logs_query(p.get("user_id"), p.get("action"), p.get("entity_type"), p.get("date_from"), p.get("date_to"))
    rows = await db.activity_logs.find(q, {"_id": 0}).sort("timestamp", -1).to_list(2000)
    for r in rows:
        r["when"] = (r.get("timestamp") or "").replace("T", " ")[:16]
    cols = [("when", "When (UTC)", "text"), ("user_name", "User", "text"), ("role", "Role", "text"),
            ("action", "Action", "text"), ("entity_type", "Entity", "text"), ("entity_name", "Record", "text")]
    return "Activity Logs", cols, rows, [{"label": "Log entries in export", "value": len(rows)}]


async def fetch_assets(p, user):
    q = {}
    for k in ("asset_type", "status", "branch_id"):
        if p.get(k):
            q[k] = p[k]
    rows = await db.assets.find(q, {"_id": 0}).sort("code", 1).to_list(1000)
    umap = await _umap()
    for r in rows:
        r["assigned"] = umap.get(r.get("assigned_to")) or r.get("assigned_location") or "—"
    cols = [("code", "Code", "text"), ("name", "Asset", "text"), ("asset_type", "Type", "text"),
            ("serial_no", "Serial", "text"), ("status", "Status", "text"), ("assigned", "Assigned to", "text"),
            ("purchase_value", "Value", "money"), ("purchase_date", "Purchased", "text"),
            ("next_maintenance_date", "Next maintenance", "text")]
    return "Assets Register", cols, rows, [
        {"label": "Assets", "value": len(rows)},
        {"label": "Total value", "value": sum(r.get("purchase_value", 0) for r in rows), "money": True},
        {"label": "In use", "value": sum(1 for r in rows if r.get("status") == "in_use")}]


async def fetch_ad_campaigns(p, user):
    from routes_ads import compute_metrics
    q = {}
    for k in ("platform", "status", "client_id"):
        if p.get(k):
            q[k] = p[k]
    rows = [compute_metrics(c) for c in await db.ad_campaigns.find(q, {"_id": 0}).sort("name", 1).to_list(500)]
    cmap, _ = await name_maps()
    out = []
    for c in rows:
        m = c["metrics"]
        out.append({"name": c["name"], "client_name": cmap.get(c.get("client_id"), ""), "platform": c["platform"],
                    "status": c["status"], "budget": c.get("budget", 0), "spend": m["spend"],
                    "revenue": m["revenue"], "roas": m["roas"], "conversions": m["conversions"], "ctr": m["ctr"]})
    spend = sum(r["spend"] for r in out)
    revenue = sum(r["revenue"] for r in out)
    cols = [("name", "Campaign", "text"), ("client_name", "Client", "text"), ("platform", "Platform", "text"),
            ("status", "Status", "text"), ("budget", "Budget", "money"), ("spend", "Spend", "money"),
            ("revenue", "Revenue", "money"), ("roas", "ROAS", "num"), ("conversions", "Conversions", "num"), ("ctr", "CTR %", "num")]
    return "Ad Campaigns", cols, out, [
        {"label": "Campaigns", "value": len(out)}, {"label": "Spend", "value": spend, "money": True},
        {"label": "Revenue", "value": revenue, "money": True},
        {"label": "Blended ROAS", "value": round(revenue / spend, 2) if spend else 0}]


async def fetch_social_posts(p, user):
    q = {}
    if p.get("month"):
        q["scheduled_at"] = {"$gte": p["month"] + "-01", "$lt": p["month"] + "-32"}
    for k in ("platform", "status", "client_id"):
        if p.get(k):
            q[k] = p[k]
    rows = await db.social_posts.find(q, {"_id": 0}).sort("scheduled_at", 1).to_list(2000)
    umap = await _umap()
    cmap, _ = await name_maps()
    for r in rows:
        r["client_name"] = cmap.get(r.get("client_id"), "")
        r["assigned_to_name"] = umap.get(r.get("assigned_to"), "")
        r["when"] = (r.get("scheduled_at") or "").replace("T", " ")[:16]
    cols = [("when", "Scheduled", "text"), ("client_name", "Client", "text"), ("platform", "Platform", "text"),
            ("content_type", "Type", "text"), ("caption", "Caption", "text"), ("status", "Status", "text"),
            ("assigned_to_name", "Assigned to", "text")]
    return "Social Media Calendar", cols, rows, [
        {"label": "Posts", "value": len(rows)},
        {"label": "Posted", "value": sum(1 for r in rows if r.get("status") == "posted")},
        {"label": "Awaiting approval", "value": sum(1 for r in rows if r.get("status") in ("planned", "in_review"))}]


async def fetch_influencers(p, user):
    q = {}
    for k in ("niche", "booking_status"):
        if p.get(k):
            q[k] = p[k]
    rows = await db.influencers.find(q, {"_id": 0}).sort("name", 1).to_list(500)
    for r in rows:
        r["total_followers"] = sum(pl.get("followers", 0) for pl in r.get("platforms", []))
        r["platform_list"] = ", ".join(pl["platform"] for pl in r.get("platforms", []))
        r["reel_rate"] = (r.get("rate_card") or {}).get("reel", 0)
        r["collab_count"] = len(r.get("collaborations", []))
        r["collab_value"] = sum(c.get("amount", 0) for c in r.get("collaborations", []))
    cols = [("name", "Influencer", "text"), ("handle", "Handle", "text"), ("niche", "Niche", "text"),
            ("platform_list", "Platforms", "text"), ("total_followers", "Followers", "num"),
            ("reel_rate", "Reel rate", "money"), ("booking_status", "Status", "text"),
            ("collab_count", "Collabs", "num"), ("collab_value", "Collab value", "money")]
    return "Influencer Directory", cols, rows, [
        {"label": "Influencers", "value": len(rows)},
        {"label": "Booked", "value": sum(1 for r in rows if r.get("booking_status") == "booked")},
        {"label": "Total collab value", "value": sum(r["collab_value"] for r in rows), "money": True}]


DATASETS = {
    "clients": {"roles": STAFF, "fetch": fetch_clients},
    "projects": {"roles": ALL, "fetch": fetch_projects},
    "ledger": {"roles": FIN, "fetch": fetch_ledger},
    "expenses": {"roles": ALL, "fetch": fetch_expenses},
    "subscriptions": {"roles": FIN, "fetch": fetch_subscriptions},
    "budgets": {"roles": FIN, "fetch": fetch_budgets},
    "ai-spend": {"roles": FIN, "fetch": fetch_ai_spend},
    "marketing": {"roles": FIN, "fetch": fetch_marketing},
    "project-profit": {"roles": ("admin", "finance", "pm"), "fetch": fetch_project_profit},
    "employee-revenue": {"roles": FIN, "fetch": fetch_employee_revenue},
    "leads": {"roles": SALES_READ, "fetch": fetch_leads},
    "quotes": {"roles": SALES_READ, "fetch": fetch_quotes},
    "targets": {"roles": SALES_READ, "fetch": fetch_targets},
    "employees": {"roles": ALL, "fetch": fetch_employees},
    "partnerships": {"roles": STAFF, "fetch": fetch_partnerships},
    "logs": {"roles": ("admin",), "fetch": fetch_logs},
    "assets": {"roles": FIN, "fetch": fetch_assets},
    "ad-campaigns": {"roles": ("admin", "finance", "sales", "ads_manager"), "fetch": fetch_ad_campaigns},
    "social-posts": {"roles": ("admin", "social_manager"), "fetch": fetch_social_posts},
    "influencers": {"roles": ("admin", "sales", "social_manager"), "fetch": fetch_influencers},
    "ai-agents": {"roles": ALL + ("ads_manager", "social_manager"), "fetch": fetch_ai_agents},
    "org-structure": {"roles": ALL + ("ads_manager", "social_manager"), "fetch": fetch_org_structure},
    "api-credits": {"roles": ALL + ("ads_manager", "social_manager"), "fetch": fetch_api_credits},
    "attendance": {"roles": ALL + ("ads_manager", "social_manager"), "fetch": fetch_attendance},
}

MEDIA = {
    "pdf": "application/pdf",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}


def file_response(data: bytes, base: str, fmt: str):
    filename = f"dotindot-{base}-{_today().isoformat()}.{fmt}"
    return Response(content=data, media_type=MEDIA[fmt],
                    headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.get("/exports/quote/{quote_id}")
async def export_quote_pdf(quote_id: str, user: dict = Depends(get_current_user)):
    if user["role"] != "super_admin" and user["role"] not in SALES_READ:
        raise HTTPException(status_code=403, detail="Insufficient permissions for this action")
    q = await db.quotes.find_one({"id": quote_id}, {"_id": 0})
    if not q:
        raise HTTPException(status_code=404, detail="Quote not found")
    await enrich_quotes([q])
    for_name = q.get("lead_name") or q.get("client_name") or "—"
    rows = [{"description": it["description"], "qty": it["qty"], "unit_price": it["unit_price"], "total": it["total"]}
            for it in q.get("items", [])]
    cols = [("description", "Description", "text"), ("qty", "Qty", "num"),
            ("unit_price", "Unit price", "money"), ("total", "Line total", "money")]
    summary = [{"label": "Subtotal", "value": q.get("subtotal", 0), "money": True},
               {"label": "GST (18%)" if q.get("gst_enabled") else "GST", "value": q.get("gst_amount", 0), "money": True},
               {"label": "Total", "value": q.get("total", 0), "money": True},
               {"label": "Status", "value": (q.get("status") or "").title()}]
    subtitle = f"Quotation {q['number']} · Prepared for {for_name} · Valid until {q.get('validity_date') or 'further notice'}"
    sections = [{"title": q.get("title"), "columns": cols, "rows": rows}]
    if q.get("notes"):
        sections.append({"title": "Notes & terms", "columns": [("note", "", "text")], "rows": [{"note": q["notes"]}]})
    data = build_pdf(f"Quotation {q['number']}", subtitle, sections, summary=summary, generated_by=user.get("name", ""))
    await log_activity(user, "report_exported", "export", quote_id, f"Quote PDF {q['number']}")
    return file_response(data, f"quote-{q['number']}", "pdf")


@router.get("/exports/{dataset}")
async def export_dataset(dataset: str, request: Request, format: str = "xlsx", user: dict = Depends(get_current_user)):
    spec = DATASETS.get(dataset)
    if not spec:
        raise HTTPException(status_code=404, detail="Unknown export dataset")
    if user["role"] != "super_admin" and user["role"] not in spec["roles"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions for this action")
    if format not in MEDIA:
        raise HTTPException(status_code=400, detail="format must be pdf or xlsx")
    params = {k: v for k, v in request.query_params.items() if k != "format" and v not in ("", "all", None)}
    title, cols, rows, summary = await spec["fetch"](params, user)
    filter_note = ", ".join(f"{k}={v}" for k, v in params.items())
    subtitle = f"{len(rows)} records" + (f" · Filters: {filter_note}" if filter_note else " · All records")
    sections = [{"title": None, "columns": cols, "rows": rows}]
    if format == "pdf":
        data = build_pdf(title, subtitle, sections, summary=summary, generated_by=user.get("name", ""))
    else:
        data = build_xlsx(title, sections, summary=summary, generated_by=user.get("name", ""))
    await log_activity(user, "report_exported", "export", dataset, f"{title} ({format.upper()}, {len(rows)} rows)")
    return file_response(data, dataset, format)
