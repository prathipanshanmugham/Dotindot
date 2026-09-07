import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Query
from fastapi.responses import Response
from database import db
from models import (
    TransactionCreate, TransactionUpdate, ExpenseCreate,
    SubscriptionCreate, SubscriptionUpdate, BudgetCreate, CampaignCreate, CampaignUpdate,
)
from auth import require_roles, get_current_user, log_activity
from storage import put_object, get_object, APP_NAME

router = APIRouter()

FIN = ("admin", "finance")
SUBMIT = ("admin", "finance", "pm")
PROFIT = ("admin", "finance", "pm")

CYCLE_DIV = {"monthly": 1, "quarterly": 3, "yearly": 12}
ALLOWED_RECEIPT_EXT = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp", "pdf": "application/pdf"}


def _now():
    return datetime.now(timezone.utc).isoformat()


def _today():
    return datetime.now(timezone.utc).date()


def monthly_equiv(cost: float, cycle: str) -> float:
    return round(cost / CYCLE_DIV.get(cycle, 1), 2)


def period_range(period: str):
    """'2026-09' -> month range; '2026-Q3' -> quarter range (string-compare safe)."""
    if "Q" in period.upper():
        year, q = period.upper().split("-Q")
        start_month = (int(q) - 1) * 3 + 1
        return f"{year}-{start_month:02d}-01", f"{year}-{start_month + 2:02d}-31"
    return f"{period}-01", f"{period}-31"


def last_months(n: int = 6):
    t = _today().replace(day=1)
    months = []
    for _ in range(n):
        months.append(t.isoformat()[:7])
        t = (t - timedelta(days=1)).replace(day=1)
    return list(reversed(months))


async def name_maps():
    clients = await db.clients.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(1000)
    projects = await db.projects.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(1000)
    return {c["id"]: c["name"] for c in clients}, {p["id"]: p["name"] for p in projects}


def enrich(rows, cmap, pmap):
    for r in rows:
        if r.get("client_id"):
            r["client_name"] = cmap.get(r["client_id"], "")
        if r.get("project_id"):
            r["project_name"] = pmap.get(r["project_id"], "")
    return rows


# ---------------- Overview ----------------
@router.get("/finance/overview")
async def finance_overview(user: dict = Depends(require_roles(*FIN))):
    tx = await db.transactions.find({}, {"_id": 0}).to_list(10000)
    t = _today()
    this_month = t.isoformat()[:7]
    year = t.isoformat()[:4]
    months = last_months(6)
    trend = {m: {"month": m, "income": 0, "expense": 0} for m in months}
    income_ytd = expense_ytd = net_month = 0
    for x in tx:
        m = (x.get("date") or "")[:7]
        amt = x.get("amount", 0)
        if m.startswith(year):
            if x["type"] == "income":
                income_ytd += amt
            else:
                expense_ytd += amt
        if m == this_month:
            net_month += amt if x["type"] == "income" else -amt
        if m in trend:
            trend[m]["income" if x["type"] == "income" else "expense"] += amt
    subs = await db.subscriptions.find({"status": "active"}, {"_id": 0}).to_list(500)
    burn = round(sum(monthly_equiv(s["cost"], s["billing_cycle"]) for s in subs), 2)
    pending = await db.expenses.count_documents({"status": "submitted"})
    renewal_limit = (t + timedelta(days=30)).isoformat()
    renewals_soon = sum(1 for s in subs if s.get("next_renewal_date") and t.isoformat() <= s["next_renewal_date"] <= renewal_limit)
    return {
        "net_this_month": net_month,
        "income_ytd": income_ytd,
        "expense_ytd": expense_ytd,
        "subscription_burn_monthly": burn,
        "pending_approvals": pending,
        "renewals_within_30d": renewals_soon,
        "trend": [trend[m] for m in months],
    }


# ---------------- Ledger / Transactions ----------------
@router.get("/finance/transactions")
async def list_transactions(
    start: Optional[str] = None,
    end: Optional[str] = None,
    type: Optional[str] = None,
    category: Optional[str] = None,
    client_id: Optional[str] = None,
    project_id: Optional[str] = None,
    user: dict = Depends(require_roles(*FIN)),
):
    q = {}
    if start or end:
        q["date"] = {}
        if start:
            q["date"]["$gte"] = start
        if end:
            q["date"]["$lte"] = end
    if type:
        q["type"] = type
    if category:
        q["category"] = category
    if client_id:
        q["client_id"] = client_id
    if project_id:
        q["project_id"] = project_id
    rows = await db.transactions.find(q, {"_id": 0}).sort("date", -1).to_list(5000)
    cmap, pmap = await name_maps()
    enrich(rows, cmap, pmap)
    income = sum(r["amount"] for r in rows if r["type"] == "income")
    expense = sum(r["amount"] for r in rows if r["type"] == "expense")
    return {"transactions": rows, "totals": {"income": income, "expense": expense, "net": income - expense}}


@router.post("/finance/transactions")
async def create_transaction(body: TransactionCreate, user: dict = Depends(require_roles(*FIN))):
    if body.type not in ("income", "expense"):
        raise HTTPException(status_code=400, detail="type must be income or expense")
    doc = body.model_dump()
    doc.update({"id": str(uuid.uuid4()), "created_by": user["id"], "created_at": _now()})
    await db.transactions.insert_one(doc)
    await log_activity(user, "transaction_created", "transaction", doc["id"], f"{doc['type']} ₹{doc['amount']}")
    doc.pop("_id", None)
    return doc


@router.put("/finance/transactions/{tx_id}")
async def update_transaction(tx_id: str, body: TransactionUpdate, user: dict = Depends(require_roles(*FIN))):
    existing = await db.transactions.find_one({"id": tx_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Transaction not found")
    updates = body.model_dump(exclude_unset=True)
    if updates:
        await db.transactions.update_one({"id": tx_id}, {"$set": updates})
    await log_activity(user, "transaction_updated", "transaction", tx_id, existing.get("description", ""))
    return {"ok": True}


@router.delete("/finance/transactions/{tx_id}")
async def delete_transaction(tx_id: str, user: dict = Depends(require_roles(*FIN))):
    existing = await db.transactions.find_one({"id": tx_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Transaction not found")
    await db.transactions.delete_one({"id": tx_id})
    await log_activity(user, "transaction_deleted", "transaction", tx_id, existing.get("description", ""))
    return {"ok": True}


# ---------------- Expenses + approval workflow ----------------
@router.get("/finance/expenses")
async def list_expenses(status: Optional[str] = None, user: dict = Depends(get_current_user)):
    """Finance/admin see all expenses; every other role sees only their OWN submissions."""
    q = {"status": status} if status else {}
    if user["role"] not in FIN:
        q["submitted_by"] = user["id"]
    rows = await db.expenses.find(q, {"_id": 0}).sort("date", -1).to_list(2000)
    cmap, pmap = await name_maps()
    enrich(rows, cmap, pmap)
    users = await db.users.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(200)
    umap = {u["id"]: u["name"] for u in users}
    for r in rows:
        r["submitted_by_name"] = umap.get(r.get("submitted_by"), "")
    return rows


@router.post("/finance/expenses")
async def submit_expense(body: ExpenseCreate, user: dict = Depends(get_current_user)):
    """Any authenticated staff member may submit an expense."""
    doc = body.model_dump()
    doc.update({
        "id": str(uuid.uuid4()), "status": "submitted", "submitted_by": user["id"],
        "approved_by": None, "created_at": _now(), "updated_at": _now(),
    })
    await db.expenses.insert_one(doc)
    await log_activity(user, "expense_submitted", "expense", doc["id"], f"{doc['category']} ₹{doc['amount']}")
    doc.pop("_id", None)
    return doc


async def _get_expense(expense_id: str):
    e = await db.expenses.find_one({"id": expense_id}, {"_id": 0})
    if not e:
        raise HTTPException(status_code=404, detail="Expense not found")
    return e


@router.post("/finance/expenses/{expense_id}/approve")
async def approve_expense(expense_id: str, user: dict = Depends(require_roles(*FIN))):
    e = await _get_expense(expense_id)
    if e["status"] != "submitted":
        raise HTTPException(status_code=400, detail=f"Only submitted expenses can be approved (current: {e['status']})")
    await db.expenses.update_one({"id": expense_id}, {"$set": {"status": "approved", "approved_by": user["id"], "updated_at": _now()}})
    tx = {
        "id": str(uuid.uuid4()), "type": "expense", "date": e["date"], "amount": e["amount"],
        "category": e["category"], "description": f"[Expense] {e.get('description') or e['category']}",
        "client_id": e.get("client_id"), "project_id": e.get("project_id"), "invoice_ref": "",
        "payment_method": "pending", "campaign_id": None, "ai_tool": e.get("ai_tool"),
        "source": "expense_workflow", "currency": "INR", "expense_id": expense_id,
        "created_by": user["id"], "created_at": _now(),
    }
    await db.transactions.insert_one(tx)
    await log_activity(user, "expense_approved", "expense", expense_id, f"{e['category']} ₹{e['amount']}")
    return {"ok": True, "status": "approved", "transaction_id": tx["id"]}


@router.post("/finance/expenses/{expense_id}/reject")
async def reject_expense(expense_id: str, user: dict = Depends(require_roles(*FIN))):
    e = await _get_expense(expense_id)
    if e["status"] != "submitted":
        raise HTTPException(status_code=400, detail=f"Only submitted expenses can be rejected (current: {e['status']})")
    await db.expenses.update_one({"id": expense_id}, {"$set": {"status": "rejected", "approved_by": user["id"], "updated_at": _now()}})
    await log_activity(user, "expense_rejected", "expense", expense_id, f"{e['category']} ₹{e['amount']}")
    return {"ok": True, "status": "rejected"}


@router.post("/finance/expenses/{expense_id}/pay")
async def pay_expense(expense_id: str, user: dict = Depends(require_roles(*FIN))):
    e = await _get_expense(expense_id)
    if e["status"] != "approved":
        raise HTTPException(status_code=400, detail=f"Expense must be approved before it can be marked paid (current: {e['status']})")
    await db.expenses.update_one({"id": expense_id}, {"$set": {"status": "paid", "paid_at": _now(), "updated_at": _now()}})
    await db.transactions.update_one({"expense_id": expense_id}, {"$set": {"payment_method": "bank_transfer"}})
    await log_activity(user, "expense_paid", "expense", expense_id, f"{e['category']} ₹{e['amount']}")
    return {"ok": True, "status": "paid"}


@router.post("/finance/expenses/upload-receipt")
async def upload_receipt(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in ALLOWED_RECEIPT_EXT:
        raise HTTPException(status_code=400, detail="Allowed receipt types: jpg, png, webp, pdf")
    data = await file.read()
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Receipt must be under 5MB")
    path = f"{APP_NAME}/receipts/{user['id']}/{uuid.uuid4()}.{ext}"
    try:
        result = put_object(path, data, ALLOWED_RECEIPT_EXT[ext])
    except Exception:
        raise HTTPException(status_code=502, detail="Receipt storage is unavailable right now. Try again or use a receipt link instead.")
    await db.files.insert_one({
        "id": str(uuid.uuid4()), "storage_path": result["path"], "original_filename": file.filename,
        "content_type": ALLOWED_RECEIPT_EXT[ext], "size": result.get("size", len(data)),
        "is_deleted": False, "uploaded_by": user["id"], "created_at": _now(),
    })
    return {"receipt_path": result["path"], "filename": file.filename}


@router.get("/finance/receipts/{path:path}")
async def get_receipt(path: str, user: dict = Depends(get_current_user)):
    rec = await db.files.find_one({"storage_path": path, "is_deleted": False})
    if not rec:
        raise HTTPException(status_code=404, detail="Receipt not found")
    if user["role"] not in FIN and rec.get("uploaded_by") != user["id"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions for this action")
    try:
        data, ct = get_object(path)
    except Exception:
        raise HTTPException(status_code=502, detail="Receipt storage is unavailable right now")
    return Response(content=data, media_type=rec.get("content_type") or ct)


# ---------------- Subscriptions ----------------
@router.get("/finance/subscriptions")
async def list_subscriptions(user: dict = Depends(require_roles(*FIN))):
    rows = await db.subscriptions.find({}, {"_id": 0}).to_list(500)
    t = _today().isoformat()
    limit = (_today() + timedelta(days=30)).isoformat()
    burn = 0
    for s in rows:
        s["monthly_equivalent"] = monthly_equiv(s["cost"], s["billing_cycle"])
        nrd = s.get("next_renewal_date")
        s["renewal_alert"] = bool(s["status"] == "active" and nrd and t <= nrd <= limit)
        s["days_to_renewal"] = ((datetime.fromisoformat(nrd).date() - _today()).days if nrd else None)
        if s["status"] == "active":
            burn += s["monthly_equivalent"]
    rows.sort(key=lambda s: s.get("next_renewal_date") or "9999")
    return {"subscriptions": rows, "monthly_burn": round(burn, 2), "alerts": sum(1 for s in rows if s["renewal_alert"])}


@router.post("/finance/subscriptions")
async def create_subscription(body: SubscriptionCreate, user: dict = Depends(require_roles(*FIN))):
    doc = body.model_dump()
    doc.update({"id": str(uuid.uuid4()), "created_by": user["id"], "created_at": _now()})
    await db.subscriptions.insert_one(doc)
    await log_activity(user, "subscription_created", "subscription", doc["id"], doc["name"])
    doc.pop("_id", None)
    return doc


@router.put("/finance/subscriptions/{sub_id}")
async def update_subscription(sub_id: str, body: SubscriptionUpdate, user: dict = Depends(require_roles(*FIN))):
    existing = await db.subscriptions.find_one({"id": sub_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Subscription not found")
    updates = body.model_dump(exclude_unset=True)
    if updates:
        await db.subscriptions.update_one({"id": sub_id}, {"$set": updates})
    await log_activity(user, "subscription_updated", "subscription", sub_id, existing["name"])
    return {"ok": True}


@router.delete("/finance/subscriptions/{sub_id}")
async def delete_subscription(sub_id: str, user: dict = Depends(require_roles(*FIN))):
    existing = await db.subscriptions.find_one({"id": sub_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Subscription not found")
    await db.subscriptions.delete_one({"id": sub_id})
    await log_activity(user, "subscription_deleted", "subscription", sub_id, existing["name"])
    return {"ok": True}


# ---------------- Budgets ----------------
@router.get("/finance/budgets")
async def list_budgets(user: dict = Depends(require_roles(*FIN))):
    return await db.budgets.find({}, {"_id": 0}).sort("period", -1).to_list(500)


@router.get("/finance/budgets/report")
async def budgets_report(period: str = Query(...), user: dict = Depends(require_roles(*FIN))):
    budgets = await db.budgets.find({"period": period}, {"_id": 0}).to_list(100)
    start, end = period_range(period)
    tx = await db.transactions.find(
        {"type": "expense", "date": {"$gte": start, "$lte": end}}, {"_id": 0, "category": 1, "amount": 1}
    ).to_list(10000)
    actuals = {}
    for x in tx:
        actuals[x["category"]] = actuals.get(x["category"], 0) + x["amount"]
    rows = []
    for b in budgets:
        actual = round(actuals.get(b["category"], 0), 2)
        pct = round(actual / b["amount"] * 100, 1) if b["amount"] else 0
        rows.append({**b, "actual": actual, "pct": pct, "over": actual > b["amount"],
                     "over_pct": round(pct - 100, 1) if actual > b["amount"] else 0})
    rows.sort(key=lambda r: -r["pct"])
    unbudgeted = [{"category": k, "actual": round(v, 2)} for k, v in actuals.items() if k not in {b["category"] for b in budgets}]
    return {"period": period, "rows": rows, "unbudgeted": unbudgeted}


@router.post("/finance/budgets")
async def create_budget(body: BudgetCreate, user: dict = Depends(require_roles(*FIN))):
    doc = body.model_dump()
    doc.update({"id": str(uuid.uuid4()), "created_by": user["id"], "created_at": _now()})
    await db.budgets.insert_one(doc)
    await log_activity(user, "budget_created", "budget", doc["id"], f"{doc['period']} {doc['category']}")
    doc.pop("_id", None)
    return doc


@router.delete("/finance/budgets/{budget_id}")
async def delete_budget(budget_id: str, user: dict = Depends(require_roles(*FIN))):
    existing = await db.budgets.find_one({"id": budget_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Budget not found")
    await db.budgets.delete_one({"id": budget_id})
    await log_activity(user, "budget_deleted", "budget", budget_id, f"{existing['period']} {existing['category']}")
    return {"ok": True}


# ---------------- AI spend sub-ledger ----------------
@router.get("/finance/ai-spend")
async def ai_spend(user: dict = Depends(require_roles(*FIN))):
    tx = await db.transactions.find(
        {"type": "expense", "$or": [{"category": "ai"}, {"ai_tool": {"$nin": [None, ""]}}]}, {"_id": 0}
    ).sort("date", -1).to_list(5000)
    subs = await db.subscriptions.find({"is_ai": True}, {"_id": 0}).to_list(200)
    cmap, pmap = await name_maps()
    enrich(tx, cmap, pmap)
    by_tool, monthly, by_client = {}, {}, {}
    for x in tx:
        tool = x.get("ai_tool") or "Other AI"
        by_tool[tool] = by_tool.get(tool, 0) + x["amount"]
        m = (x.get("date") or "")[:7]
        monthly[m] = monthly.get(m, 0) + x["amount"]
        if x.get("client_id"):
            cn = cmap.get(x["client_id"], "Unknown")
            by_client[cn] = by_client.get(cn, 0) + x["amount"]
    for s in subs:
        s["monthly_equivalent"] = monthly_equiv(s["cost"], s["billing_cycle"])
    subs_burn = round(sum(s["monthly_equivalent"] for s in subs if s["status"] == "active"), 2)
    return {
        "transactions": tx,
        "subscriptions": subs,
        "by_tool": [{"name": k, "value": round(v, 2)} for k, v in sorted(by_tool.items(), key=lambda i: -i[1])],
        "monthly_trend": [{"month": m, "value": round(v, 2)} for m, v in sorted(monthly.items())],
        "by_client": [{"name": k, "value": round(v, 2)} for k, v in sorted(by_client.items(), key=lambda i: -i[1])],
        "total_tx_spend": round(sum(x["amount"] for x in tx), 2),
        "subscriptions_monthly_burn": subs_burn,
    }


# ---------------- Marketing financials ----------------
@router.get("/finance/marketing")
async def marketing_financials(user: dict = Depends(require_roles(*FIN))):
    campaigns = await db.campaigns.find({}, {"_id": 0}).to_list(500)
    income = await db.transactions.find({"type": "income", "campaign_id": {"$nin": [None, ""]}}, {"_id": 0}).to_list(5000)
    cmap, _ = await name_maps()
    rev_by_campaign = {}
    for x in income:
        rev_by_campaign[x["campaign_id"]] = rev_by_campaign.get(x["campaign_id"], 0) + x["amount"]
    by_channel = {}
    for c in campaigns:
        c["attributed_revenue"] = round(rev_by_campaign.get(c["id"], 0), 2)
        c["roi"] = round(c["attributed_revenue"] / c["spend"], 2) if c.get("spend") else 0
        c["client_name"] = cmap.get(c.get("client_id"), "") if c.get("client_id") else ""
        ch = by_channel.setdefault(c.get("channel", "other"), {"channel": c.get("channel", "other"), "spend": 0, "revenue": 0})
        ch["spend"] += c.get("spend", 0)
        ch["revenue"] += c["attributed_revenue"]
    for ch in by_channel.values():
        ch["roi"] = round(ch["revenue"] / ch["spend"], 2) if ch["spend"] else 0
    total_spend = sum(c.get("spend", 0) for c in campaigns)
    total_rev = sum(c["attributed_revenue"] for c in campaigns)
    campaigns.sort(key=lambda c: -c.get("spend", 0))
    return {
        "campaigns": campaigns,
        "by_channel": list(by_channel.values()),
        "total_spend": round(total_spend, 2),
        "total_attributed_revenue": round(total_rev, 2),
        "overall_roi": round(total_rev / total_spend, 2) if total_spend else 0,
    }


@router.post("/finance/campaigns")
async def create_campaign(body: CampaignCreate, user: dict = Depends(require_roles(*FIN))):
    doc = body.model_dump()
    doc.update({"id": str(uuid.uuid4()), "created_by": user["id"], "created_at": _now()})
    await db.campaigns.insert_one(doc)
    await log_activity(user, "campaign_created", "campaign", doc["id"], doc["name"])
    doc.pop("_id", None)
    return doc


@router.put("/finance/campaigns/{campaign_id}")
async def update_campaign(campaign_id: str, body: CampaignUpdate, user: dict = Depends(require_roles(*FIN))):
    existing = await db.campaigns.find_one({"id": campaign_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Campaign not found")
    updates = body.model_dump(exclude_unset=True)
    if updates:
        await db.campaigns.update_one({"id": campaign_id}, {"$set": updates})
    await log_activity(user, "campaign_updated", "campaign", campaign_id, existing["name"])
    return {"ok": True}


@router.delete("/finance/campaigns/{campaign_id}")
async def delete_campaign(campaign_id: str, user: dict = Depends(require_roles(*FIN))):
    existing = await db.campaigns.find_one({"id": campaign_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Campaign not found")
    await db.campaigns.delete_one({"id": campaign_id})
    await log_activity(user, "campaign_deleted", "campaign", campaign_id, existing["name"])
    return {"ok": True}


# ---------------- Project-wise profit ----------------
def _profit_row(p, tx_by_project):
    rows = tx_by_project.get(p["id"], [])
    revenue = sum(x["amount"] for x in rows if x["type"] == "income")
    expense = sum(x["amount"] for x in rows if x["type"] == "expense")
    alloc = p.get("cost_allocation", 0) or 0
    costs = expense + alloc
    net = revenue - costs
    return {
        "project_id": p["id"], "project_name": p["name"], "client_id": p["client_id"],
        "status": p["status"], "budget": p.get("budget", 0),
        "revenue": round(revenue, 2), "linked_expenses": round(expense, 2),
        "cost_allocation": round(alloc, 2), "total_costs": round(costs, 2),
        "net": round(net, 2), "margin_pct": round(net / revenue * 100, 1) if revenue else None,
    }


@router.get("/finance/project-profit")
async def project_profit(user: dict = Depends(require_roles(*PROFIT))):
    pq = {"team_member_ids": user["id"]} if user["role"] == "pm" else {}
    projects = await db.projects.find(pq, {"_id": 0}).to_list(1000)
    tx = await db.transactions.find({"project_id": {"$nin": [None, ""]}}, {"_id": 0}).to_list(10000)
    tx_by_project = {}
    for x in tx:
        tx_by_project.setdefault(x["project_id"], []).append(x)
    cmap, _ = await name_maps()
    rows = [_profit_row(p, tx_by_project) for p in projects]
    for r in rows:
        r["client_name"] = cmap.get(r["client_id"], "")
    rows.sort(key=lambda r: -r["net"])
    return rows


@router.get("/finance/project-profit/{project_id}")
async def project_profit_detail(project_id: str, user: dict = Depends(require_roles(*PROFIT))):
    p = await db.projects.find_one({"id": project_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    if user["role"] == "pm" and user["id"] not in p.get("team_member_ids", []):
        raise HTTPException(status_code=403, detail="You are not assigned to this project")
    tx = await db.transactions.find({"project_id": project_id}, {"_id": 0}).sort("date", -1).to_list(2000)
    cmap, pmap = await name_maps()
    enrich(tx, cmap, pmap)
    row = _profit_row(p, {project_id: tx})
    row["client_name"] = cmap.get(p["client_id"], "")
    row["transactions"] = tx
    return row


# ---------------- Per-employee revenue ----------------
@router.get("/finance/employee-revenue")
async def employee_revenue(user: dict = Depends(require_roles(*FIN))):
    projects = await db.projects.find({}, {"_id": 0, "id": 1, "team_member_ids": 1}).to_list(1000)
    team_map = {p["id"]: p.get("team_member_ids", []) for p in projects}
    income = await db.transactions.find({"type": "income", "project_id": {"$nin": [None, ""]}}, {"_id": 0}).to_list(10000)
    users = await db.users.find({}, {"_id": 0, "id": 1, "name": 1, "role": 1}).to_list(200)
    umap = {u["id"]: u for u in users}
    totals, monthly = {}, {}
    for x in income:
        members = team_map.get(x["project_id"], [])
        if not members:
            continue
        share = x["amount"] / len(members)
        m = (x.get("date") or "")[:7]
        for uid in members:
            totals[uid] = totals.get(uid, 0) + share
            bucket = monthly.setdefault(m, {})
            bucket[uid] = bucket.get(uid, 0) + share
    employees = [
        {"user_id": uid, "name": umap.get(uid, {}).get("name", "Former member"),
         "role": umap.get(uid, {}).get("role", ""), "revenue": round(v, 2)}
        for uid, v in sorted(totals.items(), key=lambda i: -i[1])
    ]
    months = sorted(monthly.keys())
    trend = []
    for m in months:
        row = {"month": m}
        for uid, v in monthly[m].items():
            row[umap.get(uid, {}).get("name", uid)] = round(v, 2)
        trend.append(row)
    return {"employees": employees, "monthly_trend": trend,
            "split_rule": "Income linked to a project is split evenly among all assigned team members."}
