"""v2.7 API Credits (Finance → API Credits): every paid API account, its top-ups and usage.

- Accounts are in their own currency (USD/INR…) with an INR rate, so totals roll up in ₹.
- Prepaid accounts: balance = top-ups + refunds − usage ± adjustments; burn rate = last-30-day usage / 30;
  runway = balance / burn rate. Postpaid accounts: month-to-date spend vs monthly budget.
- Usage can be tagged to a client, project or AI agent; top-ups can post an expense to the ledger (category "ai").
- Deletes go through the records pipeline (finance.delete) → 24h recycle bin.
"""
import uuid
from datetime import datetime, timezone, timedelta, date
from typing import List, Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Query
from database import db
from auth import get_current_user, log_activity
from permissions import has_permission

router = APIRouter()

PROVIDERS = {
    "openai": "OpenAI", "anthropic": "Anthropic", "google": "Google Gemini / Vertex", "elevenlabs": "ElevenLabs",
    "replicate": "Replicate", "perplexity": "Perplexity", "stability": "Stability AI", "aws": "AWS Bedrock",
    "azure": "Azure OpenAI", "twilio": "Twilio", "openrouter": "OpenRouter", "other": "Other",
}
KINDS = ["topup", "usage", "refund", "adjustment"]
DEFAULT_FX = {"INR": 1.0, "USD": 84.0, "EUR": 91.0, "GBP": 107.0, "AED": 22.9}
LOW_RUNWAY_DAYS = 7


def _now():
    return datetime.now(timezone.utc).isoformat()


class AccountIn(BaseModel):
    name: str
    provider: str = "openai"
    billing: str = "prepaid"  # prepaid | postpaid
    currency: str = "USD"
    fx_rate: Optional[float] = None  # ₹ per 1 unit of currency
    monthly_budget: float = 0
    low_balance_threshold: float = 0
    owner_id: Optional[str] = None
    agent_ids: List[str] = []
    status: str = "active"  # active | paused | closed
    dashboard_url: Optional[str] = ""
    key_hint: Optional[str] = ""  # last few characters only — never the key
    notes: Optional[str] = ""


class AccountUpdate(BaseModel):
    name: Optional[str] = None
    provider: Optional[str] = None
    billing: Optional[str] = None
    currency: Optional[str] = None
    fx_rate: Optional[float] = None
    monthly_budget: Optional[float] = None
    low_balance_threshold: Optional[float] = None
    owner_id: Optional[str] = None
    agent_ids: Optional[List[str]] = None
    status: Optional[str] = None
    dashboard_url: Optional[str] = None
    key_hint: Optional[str] = None
    notes: Optional[str] = None


class TxnIn(BaseModel):
    account_id: str
    kind: str = "usage"
    date: Optional[str] = None
    amount: float
    units: Optional[float] = None
    unit_label: Optional[str] = ""
    client_id: Optional[str] = None
    project_id: Optional[str] = None
    agent_id: Optional[str] = None
    note: Optional[str] = ""
    post_to_ledger: bool = False


class BulkRow(BaseModel):
    date: str
    amount: float
    units: Optional[float] = None
    note: Optional[str] = ""
    client_id: Optional[str] = None
    project_id: Optional[str] = None


class BulkIn(BaseModel):
    account_id: str
    kind: str = "usage"
    unit_label: Optional[str] = ""
    rows: List[BulkRow]


def _need(user, write=False):
    if not has_permission(user, "finance.api_credits"):
        raise HTTPException(status_code=403, detail="You don't have permission for this module")


def _signed(t):
    a = float(t.get("amount") or 0)
    k = t.get("kind")
    if k in ("topup", "refund"):
        return a
    if k == "usage":
        return -a
    return a  # adjustment carries its own sign


def _mask_hint(h):
    """Keep only the last 4 characters of whatever was pasted — a full key must never be stored."""
    h = "".join(ch for ch in str(h or "") if not ch.isspace()).lstrip("….")
    return f"…{h[-4:]}" if h else ""


def _validate_account(d: dict):
    if d.get("key_hint") is not None:
        d["key_hint"] = _mask_hint(d["key_hint"])
    if "provider" in d and d["provider"] and d["provider"] not in PROVIDERS:
        raise HTTPException(status_code=400, detail="Unknown provider")
    if "billing" in d and d["billing"] and d["billing"] not in ("prepaid", "postpaid"):
        raise HTTPException(status_code=400, detail="Billing must be prepaid or postpaid")
    if "status" in d and d["status"] and d["status"] not in ("active", "paused", "closed"):
        raise HTTPException(status_code=400, detail="Status must be active, paused or closed")
    if d.get("currency") is not None:
        d["currency"] = d["currency"].upper().strip()
    if d.get("fx_rate") is not None and d["fx_rate"] <= 0:
        raise HTTPException(status_code=400, detail="Exchange rate must be positive")


def enrich_account(a: dict, txns: list, today: Optional[date] = None) -> dict:
    today = today or date.today()
    fx = float(a.get("fx_rate") or DEFAULT_FX.get(a.get("currency", "INR"), 1.0))
    month_start = today.replace(day=1).isoformat()
    last_month_end = today.replace(day=1) - timedelta(days=1)
    last_month_start = last_month_end.replace(day=1).isoformat()
    d30 = (today - timedelta(days=30)).isoformat()
    usage = [t for t in txns if t.get("kind") == "usage"]
    balance = round(sum(_signed(t) for t in txns), 2)
    used_mtd = round(sum(float(t["amount"]) for t in usage if (t.get("date") or "") >= month_start), 2)
    used_last_month = round(sum(float(t["amount"]) for t in usage if last_month_start <= (t.get("date") or "") <= last_month_end.isoformat()), 2)
    used_30 = sum(float(t["amount"]) for t in usage if (t.get("date") or "") > d30)
    burn = round(used_30 / 30, 2)
    topups_mtd = round(sum(float(t["amount"]) for t in txns if t.get("kind") == "topup" and (t.get("date") or "") >= month_start), 2)
    prepaid = a.get("billing", "prepaid") == "prepaid"
    runway = round(balance / burn, 1) if prepaid and burn > 0 else None
    budget = float(a.get("monthly_budget") or 0)
    # straight-line projection for the month
    days_in_month = ((today.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)).day
    projected = round(used_mtd / today.day * days_in_month, 2) if today.day else used_mtd
    low = prepaid and a.get("status") == "active" and (
        (a.get("low_balance_threshold") and balance <= float(a["low_balance_threshold"])) or (runway is not None and runway < LOW_RUNWAY_DAYS))
    last = max((t.get("date") or "" for t in txns), default=None)
    a.update({
        "fx_rate": fx,
        "balance": balance if prepaid else None,
        "balance_inr": round(balance * fx, 2) if prepaid else None,
        "used_mtd": used_mtd, "used_mtd_inr": round(used_mtd * fx, 2),
        "used_last_month": used_last_month, "used_last_month_inr": round(used_last_month * fx, 2),
        "topups_mtd": topups_mtd,
        "burn_per_day": burn, "burn_per_day_inr": round(burn * fx, 2),
        "runway_days": runway,
        "budget_used_pct": round(100 * used_mtd / budget) if budget else None,
        "projected_month": projected, "projected_month_inr": round(projected * fx, 2),
        "over_budget": bool(budget and projected > budget),
        "low_balance": bool(low),
        "last_activity": last or None,
        "txn_count": len(txns),
        "provider_label": PROVIDERS.get(a.get("provider"), a.get("provider")),
    })
    return a


async def _all_txns(account_ids=None):
    q = {"account_id": {"$in": account_ids}} if account_ids is not None else {}
    rows = await db.api_credit_txns.find(q, {"_id": 0}).sort("date", -1).to_list(50000)
    by = {}
    for r in rows:
        by.setdefault(r["account_id"], []).append(r)
    return rows, by


async def _names():
    clients = {c["id"]: c["name"] for c in await db.clients.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(3000)}
    projects = {p["id"]: p["name"] for p in await db.projects.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(3000)}
    agents = {a["id"]: a["name"] for a in await db.ai_agents.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(1000)}
    users = {u["id"]: u["name"] for u in await db.users.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(2000)}
    return clients, projects, agents, users


@router.get("/finance/api-credits/meta")
async def meta(user: dict = Depends(get_current_user)):
    _need(user)
    return {"providers": [{"value": k, "label": v} for k, v in PROVIDERS.items()], "kinds": KINDS,
            "currencies": list(DEFAULT_FX), "default_fx": DEFAULT_FX, "low_runway_days": LOW_RUNWAY_DAYS,
            "can_delete": has_permission(user, "finance.delete")}


@router.get("/finance/api-credits/accounts")
async def list_accounts(user: dict = Depends(get_current_user)):
    _need(user)
    accts = await db.api_accounts.find({}, {"_id": 0}).sort("name", 1).to_list(500)
    _, by = await _all_txns([a["id"] for a in accts])
    _, _, agents, users = await _names()
    out = []
    for a in accts:
        e = enrich_account(a, by.get(a["id"], []))
        e["owner_name"] = users.get(a.get("owner_id"))
        e["agents"] = [{"id": i, "name": agents[i]} for i in a.get("agent_ids", []) if i in agents]
        out.append(e)
    return out


@router.get("/finance/api-credits/overview")
async def overview(user: dict = Depends(get_current_user)):
    _need(user)
    accts = await db.api_accounts.find({}, {"_id": 0}).to_list(500)
    rows, by = await _all_txns([a["id"] for a in accts])
    enriched = {a["id"]: enrich_account(dict(a), by.get(a["id"], [])) for a in accts}
    clients, projects, agents, _ = await _names()
    today = date.today()
    month_start = today.replace(day=1).isoformat()
    fx = {a["id"]: enriched[a["id"]]["fx_rate"] for a in accts}
    usage = [t for t in rows if t.get("kind") == "usage"]
    # daily usage in ₹ for the last 30 days
    daily = []
    for i in range(29, -1, -1):
        d = (today - timedelta(days=i)).isoformat()
        daily.append({"date": d[5:], "value": round(sum(float(t["amount"]) * fx.get(t["account_id"], 1) for t in usage if t.get("date") == d))})

    def group(key, names):
        out = {}
        for t in usage:
            if (t.get("date") or "") < month_start or not t.get(key):
                continue
            out[t[key]] = out.get(t[key], 0) + float(t["amount"]) * fx.get(t["account_id"], 1)
        return sorted([{"id": k, "name": names.get(k, "—"), "value": round(v)} for k, v in out.items()], key=lambda x: -x["value"])[:8]

    active = [e for e in enriched.values() if e.get("status") == "active"]
    prepaid = [e for e in active if e.get("billing") == "prepaid"]
    return {
        "accounts": len(accts), "active": len(active),
        "balance_inr": round(sum(e["balance_inr"] or 0 for e in prepaid)),
        "used_mtd_inr": round(sum(e["used_mtd_inr"] for e in enriched.values())),
        "used_last_month_inr": round(sum(e["used_last_month_inr"] for e in enriched.values())),
        "projected_month_inr": round(sum(e["projected_month_inr"] for e in enriched.values())),
        "budget_inr": round(sum(float(e.get("monthly_budget") or 0) * e["fx_rate"] for e in active)),
        "burn_per_day_inr": round(sum(e["burn_per_day_inr"] for e in active)),
        "low_balance": [{"id": e["id"], "name": e["name"], "balance": e["balance"], "currency": e["currency"], "runway_days": e["runway_days"]} for e in prepaid if e["low_balance"]],
        "over_budget": [{"id": e["id"], "name": e["name"], "budget_used_pct": e["budget_used_pct"]} for e in active if e["over_budget"]],
        "daily": daily,
        "by_account": sorted([{"id": e["id"], "name": e["name"], "value": round(e["used_mtd_inr"])} for e in enriched.values() if e["used_mtd_inr"]], key=lambda x: -x["value"]),
        "by_client": group("client_id", clients),
        "by_project": group("project_id", projects),
        "by_agent": group("agent_id", agents),
    }


@router.get("/finance/api-credits/txns")
async def list_txns(account_id: Optional[str] = None, kind: Optional[str] = None, client_id: Optional[str] = None,
                    project_id: Optional[str] = None, start: Optional[str] = None, end: Optional[str] = None,
                    limit: int = Query(300, le=2000), user: dict = Depends(get_current_user)):
    _need(user)
    q = {}
    for k, v in (("account_id", account_id), ("kind", kind), ("client_id", client_id), ("project_id", project_id)):
        if v:
            q[k] = v
    if start or end:
        q["date"] = {**({"$gte": start} if start else {}), **({"$lte": end} if end else {})}
    rows = await db.api_credit_txns.find(q, {"_id": 0}).sort([("date", -1), ("created_at", -1)]).to_list(limit)
    accts = {a["id"]: a for a in await db.api_accounts.find({}, {"_id": 0, "id": 1, "name": 1, "currency": 1, "fx_rate": 1}).to_list(500)}
    clients, projects, agents, users = await _names()
    for r in rows:
        a = accts.get(r["account_id"], {})
        r["account_name"] = a.get("name")
        r["currency"] = a.get("currency", "INR")
        r["amount_inr"] = round(float(r["amount"]) * float(a.get("fx_rate") or DEFAULT_FX.get(a.get("currency", "INR"), 1)), 2)
        r["client_name"] = clients.get(r.get("client_id"))
        r["project_name"] = projects.get(r.get("project_id"))
        r["agent_name"] = agents.get(r.get("agent_id"))
        r["entered_by_name"] = users.get(r.get("created_by"))
    return rows


@router.get("/finance/api-credits/accounts/{account_id}")
async def get_account(account_id: str, user: dict = Depends(get_current_user)):
    _need(user)
    a = await db.api_accounts.find_one({"id": account_id}, {"_id": 0})
    if not a:
        raise HTTPException(status_code=404, detail="API account not found")
    txns = await db.api_credit_txns.find({"account_id": account_id}, {"_id": 0}).sort("date", -1).to_list(5000)
    e = enrich_account(a, txns)
    today = date.today()
    series, bal = [], 0.0
    ordered = sorted(txns, key=lambda t: t.get("date") or "")
    start = (today - timedelta(days=29)).isoformat()
    bal = sum(_signed(t) for t in ordered if (t.get("date") or "") < start)
    for i in range(29, -1, -1):
        d = (today - timedelta(days=i)).isoformat()
        day = [t for t in ordered if t.get("date") == d]
        bal += sum(_signed(t) for t in day)
        series.append({"date": d[5:], "usage": round(sum(float(t["amount"]) for t in day if t.get("kind") == "usage"), 2), "balance": round(bal, 2)})
    e["series"] = series
    e["txns"] = await list_txns(account_id=account_id, limit=500, user=user)
    return e


@router.post("/finance/api-credits/accounts")
async def create_account(body: AccountIn, user: dict = Depends(get_current_user)):
    _need(user)
    d = body.model_dump()
    _validate_account(d)
    if not d["name"].strip():
        raise HTTPException(status_code=400, detail="Give the account a name")
    d["fx_rate"] = d.get("fx_rate") or DEFAULT_FX.get(d["currency"], 1.0)
    d.update({"id": str(uuid.uuid4()), "owner_id": d.get("owner_id") or user["id"], "created_at": _now(), "updated_at": _now(), "created_by": user["id"]})
    await db.api_accounts.insert_one(dict(d))
    await log_activity(user, "api_account_created", "api_account", d["id"], d["name"])
    d.pop("_id", None)
    return d


@router.put("/finance/api-credits/accounts/{account_id}")
async def update_account(account_id: str, body: AccountUpdate, user: dict = Depends(get_current_user)):
    _need(user)
    a = await db.api_accounts.find_one({"id": account_id})
    if not a:
        raise HTTPException(status_code=404, detail="API account not found")
    u = body.model_dump(exclude_unset=True)
    _validate_account(u)
    u["updated_at"] = _now()
    await db.api_accounts.update_one({"id": account_id}, {"$set": u})
    await log_activity(user, "api_account_updated", "api_account", account_id, u.get("name", a["name"]))
    return await db.api_accounts.find_one({"id": account_id}, {"_id": 0})


async def _insert_txn(user, acct, t: dict, post_to_ledger=False):
    if t["kind"] not in KINDS:
        raise HTTPException(status_code=400, detail=f"Kind must be one of {', '.join(KINDS)}")
    if t["kind"] != "adjustment" and float(t["amount"]) <= 0:
        raise HTTPException(status_code=400, detail="Amount must be more than zero")
    doc = {"id": str(uuid.uuid4()), "account_id": acct["id"], "kind": t["kind"], "date": t.get("date") or date.today().isoformat(),
           "amount": round(float(t["amount"]), 4), "units": t.get("units"), "unit_label": t.get("unit_label") or "",
           "client_id": t.get("client_id") or None, "project_id": t.get("project_id") or None, "agent_id": t.get("agent_id") or None,
           "note": t.get("note") or "", "ledger_tx_id": None, "created_by": user["id"], "created_at": _now()}
    if post_to_ledger and t["kind"] == "topup":
        fx = float(acct.get("fx_rate") or DEFAULT_FX.get(acct.get("currency", "INR"), 1))
        tx = {"id": str(uuid.uuid4()), "type": "expense", "date": doc["date"], "amount": round(doc["amount"] * fx, 2),
              "category": "ai", "description": f"API credits top-up — {acct['name']} ({doc['amount']:g} {acct.get('currency', 'INR')})",
              "client_id": doc["client_id"], "project_id": doc["project_id"], "invoice_ref": "", "payment_method": "credit_card",
              "campaign_id": None, "ai_tool": PROVIDERS.get(acct.get("provider"), "Other AI"), "source": "api_credits", "currency": "INR",
              "created_by": user["id"], "created_at": _now()}
        await db.transactions.insert_one(dict(tx))
        doc["ledger_tx_id"] = tx["id"]
    await db.api_credit_txns.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


@router.post("/finance/api-credits/txns")
async def create_txn(body: TxnIn, user: dict = Depends(get_current_user)):
    _need(user)
    acct = await db.api_accounts.find_one({"id": body.account_id}, {"_id": 0})
    if not acct:
        raise HTTPException(status_code=404, detail="API account not found")
    doc = await _insert_txn(user, acct, body.model_dump(), body.post_to_ledger)
    await log_activity(user, f"api_credit_{doc['kind']}", "api_account", acct["id"],
                       f"{acct['name']} · {doc['kind']} {doc['amount']:g} {acct.get('currency', '')}" + (" (+ledger)" if doc["ledger_tx_id"] else ""))
    return doc


@router.post("/finance/api-credits/txns/bulk")
async def bulk_txns(body: BulkIn, user: dict = Depends(get_current_user)):
    """Import usage lines (e.g. pasted from a provider's CSV export)."""
    _need(user)
    acct = await db.api_accounts.find_one({"id": body.account_id}, {"_id": 0})
    if not acct:
        raise HTTPException(status_code=404, detail="API account not found")
    if not body.rows:
        raise HTTPException(status_code=400, detail="Nothing to import")
    if len(body.rows) > 1000:
        raise HTTPException(status_code=400, detail="Import at most 1,000 lines at a time")
    out = []
    for r in body.rows:
        try:
            date.fromisoformat(r.date)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Bad date '{r.date}' — use YYYY-MM-DD")
        out.append(await _insert_txn(user, acct, {**r.model_dump(), "kind": body.kind, "unit_label": body.unit_label}))
    await log_activity(user, "api_credit_import", "api_account", acct["id"], f"{acct['name']} · {len(out)} {body.kind} lines")
    return {"imported": len(out), "total": round(sum(x["amount"] for x in out), 2)}


async def api_credit_alerts():
    """Used by the notifications bell (admin/finance)."""
    accts = await db.api_accounts.find({"status": "active"}, {"_id": 0}).to_list(500)
    if not accts:
        return []
    _, by = await _all_txns([a["id"] for a in accts])
    items = []
    t_iso = date.today().isoformat()
    for a in accts:
        e = enrich_account(dict(a), by.get(a["id"], []))
        if e["low_balance"]:
            run = f" · ~{e['runway_days']:g} days left" if e["runway_days"] is not None else ""
            items.append({"kind": "api_credit", "title": f"Low API credit: {a['name']}",
                          "sub": f"Balance {e['balance']:g} {a.get('currency', '')}{run}", "link": "/finance/api-credits", "date": t_iso})
        elif e["over_budget"]:
            items.append({"kind": "api_credit", "title": f"API spend heading over budget: {a['name']}",
                          "sub": f"{e['budget_used_pct']}% of monthly budget used", "link": "/finance/api-credits", "date": t_iso})
    return items
