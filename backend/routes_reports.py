"""Reports module: pre-built templates + custom report builder. Employee role: 403 on everything."""
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Depends
from database import db
from auth import require_roles, log_activity
from export_engine import build_xlsx, build_pdf
from routes_finance import monthly_equiv, name_maps, period_range
from routes_sales import targets_with_actuals, won_at, STAGES
from routes_clients import compute_health, project_counts_map
from routes_exports import file_response, _umap

router = APIRouter()

REPORT_ROLES = ("admin", "finance", "sales", "pm")


def _today():
    return datetime.now(timezone.utc).date()


def _default_range():
    t = _today()
    return t.replace(day=1).isoformat(), t.isoformat()


TEMPLATES = {
    "monthly-financial": {
        "name": "Monthly Financial Summary",
        "description": "Income, expenses by category, net, budget variance, subscription burn and AI spend for a period.",
        "roles": ("admin", "finance"),
    },
    "client-status": {
        "name": "Client Status Report",
        "description": "Per client: status, active projects, revenue billed in period, contract expiries and health.",
        "roles": ("admin", "finance", "pm"),
    },
    "sales-pipeline": {
        "name": "Sales Pipeline Report",
        "description": "Funnel counts and values, win rate, targets vs actuals and quotes summary.",
        "roles": ("admin", "sales"),
    },
    "employee-activity": {
        "name": "Employee Activity Report",
        "description": "Per employee: attributed revenue, projects, training completion and platform activity in period.",
        "roles": ("admin",),
    },
}


# ---------------- template builders → {title, period, summary, sections} ----------------
async def tpl_monthly_financial(date_from, date_to):
    tx = await db.transactions.find({"date": {"$gte": date_from, "$lte": date_to}}, {"_id": 0}).to_list(10000)
    income = sum(x["amount"] for x in tx if x["type"] == "income")
    expense = sum(x["amount"] for x in tx if x["type"] == "expense")
    by_cat = {}
    for x in tx:
        if x["type"] == "expense":
            by_cat[x["category"]] = by_cat.get(x["category"], 0) + x["amount"]
    cat_rows = [{"category": k, "amount": round(v, 2)} for k, v in sorted(by_cat.items(), key=lambda i: -i[1])]

    period = date_from[:7]
    budgets = await db.budgets.find({"period": period}, {"_id": 0}).to_list(100)
    bud_rows = []
    for b in budgets:
        actual = round(by_cat.get(b["category"], 0), 2)
        bud_rows.append({"category": b["category"], "budget": b["amount"], "actual": actual,
                         "variance": round(b["amount"] - actual, 2),
                         "status": "Over" if actual > b["amount"] else "Within"})

    subs = await db.subscriptions.find({"status": "active"}, {"_id": 0}).to_list(500)
    burn = round(sum(monthly_equiv(s["cost"], s["billing_cycle"]) for s in subs), 2)
    ai_spend = sum(x["amount"] for x in tx if x["type"] == "expense" and (x.get("category") == "ai" or x.get("ai_tool")))

    return {
        "title": "Monthly Financial Summary",
        "summary": [
            {"label": "Income", "value": round(income, 2), "money": True},
            {"label": "Expenses", "value": round(expense, 2), "money": True},
            {"label": "Net", "value": round(income - expense, 2), "money": True},
            {"label": "Subscription burn /mo", "value": burn, "money": True},
            {"label": "AI spend", "value": round(ai_spend, 2), "money": True},
        ],
        "sections": [
            {"title": "Expenses by category", "columns": [("category", "Category", "text"), ("amount", "Amount", "money")], "rows": cat_rows},
            {"title": f"Budget variance ({period})", "columns": [
                ("category", "Category", "text"), ("budget", "Budget", "money"), ("actual", "Actual", "money"),
                ("variance", "Variance", "money"), ("status", "Status", "text")], "rows": bud_rows},
            {"title": "Active subscriptions", "columns": [
                ("name", "Tool", "text"), ("billing_cycle", "Cycle", "text"), ("cost", "Cost", "money"),
                ("next_renewal_date", "Next renewal", "text")], "rows": subs},
        ],
    }


async def tpl_client_status(date_from, date_to):
    clients = await db.clients.find({}, {"_id": 0, "credentials": 0}).sort("name", 1).to_list(1000)
    counts = await project_counts_map()
    income = await db.transactions.find(
        {"type": "income", "date": {"$gte": date_from, "$lte": date_to}, "client_id": {"$nin": [None, ""]}},
        {"_id": 0, "client_id": 1, "amount": 1}).to_list(10000)
    rev = {}
    for x in income:
        rev[x["client_id"]] = rev.get(x["client_id"], 0) + x["amount"]
    limit30 = (_today() + timedelta(days=30)).isoformat()
    rows = []
    expiring = 0
    for c in clients:
        pc = counts.get(c["id"], {"total": 0, "active": 0})
        exps = sorted([ct["expiry_date"] for ct in c.get("contracts", []) if ct.get("expiry_date") and ct["expiry_date"] >= _today().isoformat()])
        next_expiry = exps[0] if exps else None
        if next_expiry and next_expiry <= limit30:
            expiring += 1
        rows.append({
            "name": c["name"], "status": c.get("status"), "active_projects": pc["active"],
            "revenue": round(rev.get(c["id"], 0), 2), "next_contract_expiry": next_expiry or "—",
            "health": compute_health(c, pc["active"]),
        })
    return {
        "title": "Client Status Report",
        "summary": [
            {"label": "Clients", "value": len(rows)},
            {"label": "Active", "value": sum(1 for r in rows if r["status"] == "active")},
            {"label": "Revenue billed", "value": sum(r["revenue"] for r in rows), "money": True},
            {"label": "Contracts expiring ≤30d", "value": expiring},
            {"label": "At risk", "value": sum(1 for r in rows if r["health"] == "at_risk")},
        ],
        "sections": [{"title": "Clients", "columns": [
            ("name", "Client", "text"), ("status", "Status", "text"), ("active_projects", "Active projects", "num"),
            ("revenue", "Revenue billed", "money"), ("next_contract_expiry", "Next contract expiry", "text"),
            ("health", "Health", "text")], "rows": rows}],
    }


async def tpl_sales_pipeline(date_from, date_to):
    leads = await db.leads.find({}, {"_id": 0}).to_list(1000)
    funnel = []
    for s in STAGES:
        col = [l for l in leads if l["stage"] == s]
        funnel.append({"stage": s, "count": len(col), "value": round(sum(l.get("estimated_value", 0) for l in col), 2)})
    won_in = [l for l in leads if (won_at(l) or "") >= date_from and (won_at(l) or "z") <= date_to]
    lost = sum(1 for l in leads if l["stage"] == "lost")
    won = sum(1 for l in leads if l["stage"] == "won")
    win_rate = round(won / (won + lost) * 100, 1) if (won + lost) else 0
    targets = await targets_with_actuals({})
    quotes = await db.quotes.find({"created_at": {"$gte": date_from, "$lte": date_to + "T23:59:59"}}, {"_id": 0}).to_list(500)
    q_by_status = {}
    for q in quotes:
        b = q_by_status.setdefault(q["status"], {"status": q["status"], "count": 0, "value": 0})
        b["count"] += 1
        b["value"] = round(b["value"] + q.get("total", 0), 2)
    return {
        "title": "Sales Pipeline Report",
        "summary": [
            {"label": "Total leads", "value": len(leads)},
            {"label": "Open pipeline value", "value": sum(f["value"] for f in funnel if f["stage"] not in ("won", "lost")), "money": True},
            {"label": "Win rate", "value": f"{win_rate}%"},
            {"label": "Won in period", "value": len(won_in)},
            {"label": "Won value in period", "value": sum(l.get("estimated_value", 0) for l in won_in), "money": True},
        ],
        "sections": [
            {"title": "Funnel by stage", "columns": [("stage", "Stage", "text"), ("count", "Leads", "num"), ("value", "Value", "money")], "rows": funnel},
            {"title": "Targets vs actuals", "columns": [
                ("user_name", "Owner", "text"), ("period", "Period", "text"), ("amount", "Target", "money"),
                ("actual", "Actual", "money"), ("pct", "% achieved", "num")], "rows": targets},
            {"title": "Quotes created in period", "columns": [("status", "Status", "text"), ("count", "Count", "num"), ("value", "Value", "money")], "rows": list(q_by_status.values())},
        ],
    }


async def tpl_employee_activity(date_from, date_to):
    users = await db.users.find({"is_active": True}, {"_id": 0, "password_hash": 0}).sort("name", 1).to_list(300)
    projects = await db.projects.find({}, {"_id": 0, "id": 1, "team_member_ids": 1}).to_list(1000)
    team_map = {p["id"]: p.get("team_member_ids", []) for p in projects}
    income = await db.transactions.find(
        {"type": "income", "project_id": {"$nin": [None, ""]}, "date": {"$gte": date_from, "$lte": date_to}}, {"_id": 0}).to_list(10000)
    rev = {}
    for x in income:
        members = team_map.get(x["project_id"], [])
        for uid in members:
            rev[uid] = rev.get(uid, 0) + x["amount"] / len(members)
    assignments = await db.training_assignments.find({}, {"_id": 0, "user_id": 1, "status": 1}).to_list(1000)
    logs = await db.activity_logs.aggregate([
        {"$match": {"timestamp": {"$gte": date_from, "$lte": date_to + "T23:59:59.999999+00:00"}}},
        {"$group": {"_id": "$user_id", "count": {"$sum": 1}}},
    ]).to_list(300)
    log_map = {l["_id"]: l["count"] for l in logs}
    rows = []
    for u in users:
        tr = [a for a in assignments if a["user_id"] == u["id"]]
        done = sum(1 for a in tr if a["status"] == "completed")
        rows.append({
            "name": u["name"], "role": u["role"], "designation": u.get("designation", ""),
            "revenue": round(rev.get(u["id"], 0), 2),
            "projects": sum(1 for p in projects if u["id"] in team_map.get(p["id"], [])),
            "training": f"{done}/{len(tr)}" if tr else "—",
            "actions": log_map.get(u["id"], 0),
        })
    rows.sort(key=lambda r: -r["revenue"])
    return {
        "title": "Employee Activity Report",
        "summary": [
            {"label": "Team members", "value": len(rows)},
            {"label": "Attributed revenue", "value": sum(r["revenue"] for r in rows), "money": True},
            {"label": "Platform actions in period", "value": sum(r["actions"] for r in rows)},
        ],
        "sections": [{"title": "Per employee", "columns": [
            ("name", "Employee", "text"), ("role", "Role", "text"), ("designation", "Designation", "text"),
            ("revenue", "Revenue in period", "money"), ("projects", "Projects", "num"),
            ("training", "Training done", "text"), ("actions", "Actions", "num")], "rows": rows}],
    }


BUILDERS = {
    "monthly-financial": tpl_monthly_financial,
    "client-status": tpl_client_status,
    "sales-pipeline": tpl_sales_pipeline,
    "employee-activity": tpl_employee_activity,
}


def _check_template(key: str, user: dict):
    tpl = TEMPLATES.get(key)
    if not tpl:
        raise HTTPException(status_code=404, detail="Unknown report template")
    if user["role"] not in tpl["roles"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions for this report")
    return tpl


@router.get("/reports/templates")
async def list_templates(user: dict = Depends(require_roles(*REPORT_ROLES))):
    return [{"key": k, "name": t["name"], "description": t["description"]}
            for k, t in TEMPLATES.items() if user["role"] in t["roles"]]


@router.get("/reports/template/{key}")
async def generate_template(key: str, date_from: Optional[str] = None, date_to: Optional[str] = None,
                            user: dict = Depends(require_roles(*REPORT_ROLES))):
    _check_template(key, user)
    df, dt = date_from or _default_range()[0], date_to or _default_range()[1]
    data = await BUILDERS[key](df, dt)
    data["period"] = f"{df} → {dt}"
    data["sections"] = [{"title": s["title"],
                         "columns": [{"key": c[0], "label": c[1], "fmt": c[2]} for c in s["columns"]],
                         "rows": s["rows"]} for s in data["sections"]]
    return data


@router.get("/reports/template/{key}/export")
async def export_template(key: str, format: str = "pdf", date_from: Optional[str] = None, date_to: Optional[str] = None,
                          user: dict = Depends(require_roles(*REPORT_ROLES))):
    tpl = _check_template(key, user)
    if format not in ("pdf", "xlsx"):
        raise HTTPException(status_code=400, detail="format must be pdf or xlsx")
    df, dt = date_from or _default_range()[0], date_to or _default_range()[1]
    data = await BUILDERS[key](df, dt)
    subtitle = f"Period: {df} → {dt}"
    if format == "pdf":
        blob = build_pdf(data["title"], subtitle, data["sections"], summary=data["summary"], generated_by=user.get("name", ""))
    else:
        blob = build_xlsx(data["title"], data["sections"], summary=data["summary"], generated_by=user.get("name", ""))
    await log_activity(user, "report_exported", "report", key, f"{data['title']} ({format.upper()})")
    return file_response(blob, key, format)


# ---------------- Custom report builder ----------------
CUSTOM_MODULES = {
    "clients": {
        "name": "Clients", "roles": ("admin", "finance", "sales", "pm"), "date_field": "created_at",
        "columns": [("name", "Client"), ("company", "Company"), ("industry", "Industry"), ("service_type", "Service"),
                    ("size", "Size"), ("status", "Status"), ("retainer", "Retainer"), ("region", "Region"), ("city", "City")],
        "money_cols": [],
        "filters": [{"key": "status", "label": "Status", "options": ["active", "inactive", "churned"]},
                    {"key": "industry", "label": "Industry", "options": ["real-estate", "healthcare", "e-commerce", "restaurant", "fintech", "saas", "other"]},
                    {"key": "service_type", "label": "Service", "options": ["web_dev", "marketing", "ai", "retainer", "one_off"]}],
    },
    "projects": {
        "name": "Projects", "roles": ("admin", "finance", "sales", "pm"), "date_field": "start_date",
        "columns": [("name", "Project"), ("client_name", "Client"), ("status", "Status"), ("budget", "Budget"),
                    ("start_date", "Start"), ("end_date", "End"), ("location", "Location")],
        "money_cols": ["budget"],
        "filters": [{"key": "status", "label": "Status", "options": ["kickoff", "in_progress", "review", "completed", "on_hold"]}],
    },
    "ledger": {
        "name": "Finance Ledger", "roles": ("admin", "finance"), "date_field": "date",
        "columns": [("date", "Date"), ("type", "Type"), ("category", "Category"), ("description", "Description"),
                    ("client_name", "Client"), ("project_name", "Project"), ("amount", "Amount"), ("payment_method", "Method")],
        "money_cols": ["amount"],
        "filters": [{"key": "type", "label": "Type", "options": ["income", "expense"]},
                    {"key": "category", "label": "Category", "options": ["project_income", "retainer", "campaign_revenue", "other", "operational", "marketing", "tools", "salaries", "misc", "ai"]}],
    },
    "expenses": {
        "name": "Expenses", "roles": ("admin", "finance"), "date_field": "date",
        "columns": [("date", "Date"), ("category", "Category"), ("description", "Description"),
                    ("submitted_by_name", "Submitted by"), ("status", "Status"), ("amount", "Amount")],
        "money_cols": ["amount"],
        "filters": [{"key": "status", "label": "Status", "options": ["submitted", "approved", "paid", "rejected"]},
                    {"key": "category", "label": "Category", "options": ["operational", "marketing", "tools", "salaries", "misc", "ai"]}],
    },
    "leads": {
        "name": "Leads", "roles": ("admin", "sales"), "date_field": "created_at",
        "columns": [("name", "Lead"), ("company", "Company"), ("stage", "Stage"), ("source", "Source"),
                    ("estimated_value", "Est. value"), ("owner_name", "Owner"), ("region", "Region"), ("city", "City")],
        "money_cols": ["estimated_value"],
        "filters": [{"key": "stage", "label": "Stage", "options": ["new", "contacted", "qualified", "proposal", "won", "lost"]},
                    {"key": "source", "label": "Source", "options": ["referral", "website", "ads", "linkedin", "cold_outreach", "event", "other"]}],
    },
    "quotes": {
        "name": "Quotes", "roles": ("admin", "sales"), "date_field": "created_at",
        "columns": [("number", "Number"), ("title", "Title"), ("for_name", "For"), ("status", "Status"),
                    ("validity_date", "Valid until"), ("subtotal", "Subtotal"), ("gst_amount", "GST"), ("total", "Total")],
        "money_cols": ["subtotal", "gst_amount", "total"],
        "filters": [{"key": "status", "label": "Status", "options": ["draft", "sent", "accepted", "rejected", "expired"]}],
    },
}

COLLECTIONS = {"clients": "clients", "projects": "projects", "ledger": "transactions", "expenses": "expenses",
               "leads": "leads", "quotes": "quotes"}


class CustomReportRequest(BaseModel):
    module: str
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    filters: Dict[str, str] = {}
    columns: List[str] = []
    format: Optional[str] = "pdf"


async def _run_custom(body: CustomReportRequest, user: dict):
    mod = CUSTOM_MODULES.get(body.module)
    if not mod:
        raise HTTPException(status_code=404, detail="Unknown module")
    if user["role"] not in mod["roles"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions for this module")
    q = {}
    valid_filter_keys = {f["key"] for f in mod["filters"]}
    for k, v in (body.filters or {}).items():
        if k in valid_filter_keys and v and v != "all":
            q[k] = v
    df_field = mod["date_field"]
    if body.date_from or body.date_to:
        q[df_field] = {}
        if body.date_from:
            q[df_field]["$gte"] = body.date_from
        if body.date_to:
            q[df_field]["$lte"] = body.date_to + ("T23:59:59" if df_field == "created_at" else "")
    rows = await db[COLLECTIONS[body.module]].find(q, {"_id": 0, "credentials": 0} if body.module == "clients" else {"_id": 0}).sort(df_field, -1).to_list(3000)

    # Enrichment
    if body.module in ("projects", "ledger"):
        cmap, pmap = await name_maps()
        for r in rows:
            if r.get("client_id"):
                r["client_name"] = cmap.get(r["client_id"], "")
            if r.get("project_id"):
                r["project_name"] = pmap.get(r["project_id"], "")
    if body.module == "expenses":
        umap = await _umap()
        for r in rows:
            r["submitted_by_name"] = umap.get(r.get("submitted_by"), "")
    if body.module == "leads":
        umap = await _umap()
        for r in rows:
            r["owner_name"] = umap.get(r.get("owner_id"), "")
    if body.module == "quotes":
        from routes_sales import enrich_quotes
        await enrich_quotes(rows)
        for r in rows:
            r["for_name"] = r.get("lead_name") or r.get("client_name") or ""

    all_cols = {k: label for k, label in mod["columns"]}
    selected = [k for k in (body.columns or []) if k in all_cols] or [k for k, _ in mod["columns"]]
    columns = [(k, all_cols[k], "money" if k in mod["money_cols"] else "text") for k in selected]
    return mod, columns, rows


@router.get("/reports/custom/meta")
async def custom_meta(user: dict = Depends(require_roles(*REPORT_ROLES))):
    return [{"key": k, "name": m["name"], "date_field": m["date_field"],
             "columns": [{"key": c[0], "label": c[1]} for c in m["columns"]],
             "filters": m["filters"]}
            for k, m in CUSTOM_MODULES.items() if user["role"] in m["roles"]]


@router.post("/reports/custom/preview")
async def custom_preview(body: CustomReportRequest, user: dict = Depends(require_roles(*REPORT_ROLES))):
    mod, columns, rows = await _run_custom(body, user)
    return {"module": body.module, "total": len(rows),
            "columns": [{"key": c[0], "label": c[1], "fmt": c[2]} for c in columns],
            "rows": rows[:20]}


@router.post("/reports/custom/export")
async def custom_export(body: CustomReportRequest, user: dict = Depends(require_roles(*REPORT_ROLES))):
    if body.format not in ("pdf", "xlsx"):
        raise HTTPException(status_code=400, detail="format must be pdf or xlsx")
    mod, columns, rows = await _run_custom(body, user)
    title = f"Custom Report — {mod['name']}"
    parts = []
    if body.date_from or body.date_to:
        parts.append(f"{body.date_from or '...'} → {body.date_to or '...'}")
    parts.extend(f"{k}: {v}" for k, v in (body.filters or {}).items() if v and v != "all")
    subtitle = f"{len(rows)} records" + (f" · {' · '.join(parts)}" if parts else "")
    sections = [{"title": None, "columns": columns, "rows": rows}]
    if body.format == "pdf":
        blob = build_pdf(title, subtitle, sections, generated_by=user.get("name", ""))
    else:
        blob = build_xlsx(title, sections, generated_by=user.get("name", ""))
    await log_activity(user, "report_exported", "report", body.module, f"{title} ({body.format.upper()}, {len(rows)} rows)")
    return file_response(blob, f"custom-{body.module}", body.format)
