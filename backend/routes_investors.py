"""v3.0 Investors — who has put money into dotindot, what it's worth, what they've been paid — and a separate
investor login so each investor can track their own position.

Admin (`investors` / `investors.manage` / `investors.delete`, super admin by default):
  investors, investments (capital contribution, profit share, equity, convertible note, debt, revenue share),
  returns paid (profit share, interest, dividend, principal back…), company valuations, updates posted to investors,
  investor logins, and which company numbers investors can see.

Investor portal (own login at /investor/login, token type "investor" — rejected everywhere else):
  GET /api/investor-portal/me | dashboard | statement (PDF), POST login / change-password.
An investor only ever sees their own investments and returns, plus company figures you choose to share.
"""
import os
import uuid
from datetime import date, datetime, timedelta, timezone
from io import BytesIO
from typing import Optional, List, Dict
import jwt
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from database import db
from auth import get_current_user, log_activity, hash_password, verify_password
from permissions import has_permission

router = APIRouter()

INSTRUMENTS = {"capital": "Capital contribution", "profit_share": "Profit-sharing stake", "equity": "Equity", "convertible": "Convertible note",
               "debt": "Loan / debt", "revenue_share": "Revenue share"}
STAKE_INSTRUMENTS = ("capital", "profit_share", "equity", "convertible")
RETURN_KINDS = {"profit_share": "Profit share", "interest": "Interest", "dividend": "Dividend", "principal": "Principal returned",
                "exit": "Exit / buy-back", "revenue_share": "Revenue share", "other": "Other"}
INVESTOR_TYPES = {"individual": "Individual", "company": "Company", "fund": "Fund", "family_office": "Family office", "partner": "Partner / founder", "other": "Other"}
SHARE_KEYS = {"revenue": "Monthly revenue", "profit": "Profit (revenue − expenses)", "clients": "Active clients", "team": "Team size",
              "projects": "Projects delivered", "pipeline": "Sales pipeline value"}


def _now():
    return datetime.now(timezone.utc).isoformat()


def _need(user):
    if not has_permission(user, "investors.manage"):
        raise HTTPException(status_code=403, detail="You need Investors → manage to change this")


def _date(v, field="Date"):
    try:
        return date.fromisoformat(str(v)[:10]).isoformat()
    except ValueError:
        raise HTTPException(status_code=400, detail=f"{field} must be YYYY-MM-DD")


async def portal_settings() -> dict:
    d = await db.settings.find_one({"id": "investor_portal"}, {"_id": 0}) or {}
    share = {k: False for k in SHARE_KEYS}
    share.update({"revenue": True, "clients": True, "team": True, "projects": True})
    share.update(d.get("share") or {})
    return {"share": share, "welcome": d.get("welcome") or "Thank you for backing dotindot. Here's where your investment stands.",
            "contact": d.get("contact") or "", "company_name": d.get("company_name") or "dotindot Creative"}


# ------------------------------------------------------------------ maths
def xirr(flows: List[tuple]) -> Optional[float]:
    """Annualised return from dated cash flows [(date, amount)] — negative = money in, positive = money out/value."""
    flows = [(d, a) for d, a in flows if a]
    if len(flows) < 2 or not any(a < 0 for _, a in flows) or not any(a > 0 for _, a in flows):
        return None
    t0 = min(d for d, _ in flows)

    def npv(r):
        return sum(a / (1 + r) ** ((d - t0).days / 365.0) for d, a in flows)

    lo, hi = -0.99, 10.0
    if npv(lo) * npv(hi) > 0:
        return None
    for _ in range(200):
        mid = (lo + hi) / 2
        if npv(lo) * npv(mid) <= 0:
            hi = mid
        else:
            lo = mid
    return round(mid * 100, 1)


async def latest_valuation(on: Optional[str] = None):
    q = {"date": {"$lte": on}} if on else {}
    return await db.company_valuations.find_one(q, {"_id": 0}, sort=[("date", -1)])


def _inv_value(inv: dict, returns: List[dict], val: Optional[dict]) -> dict:
    amount = float(inv.get("amount") or 0)
    principal_back = sum(float(r.get("amount") or 0) for r in returns if r.get("kind") in ("principal", "exit") and r.get("investment_id") == inv["id"])
    if inv.get("status") in ("redeemed", "exited"):
        current = 0.0
    elif inv.get("instrument") in STAKE_INSTRUMENTS and val and inv.get("stake_percent"):
        current = float(val["valuation"]) * float(inv["stake_percent"]) / 100
    elif inv.get("instrument") == "debt":
        current = max(0.0, amount - principal_back)
    else:
        current = max(0.0, amount - principal_back)
    return {"current_value": round(current), "principal_back": round(principal_back)}


async def investor_position(investor_id: str) -> dict:
    invs = await db.investments.find({"investor_id": investor_id}, {"_id": 0}).sort("date", 1).to_list(500)
    rets = await db.investor_returns.find({"investor_id": investor_id}, {"_id": 0}).sort("date", 1).to_list(2000)
    val = await latest_valuation()
    rows = []
    for inv in invs:
        v = _inv_value(inv, rets, val)
        inv_rets = [r for r in rets if r.get("investment_id") == inv["id"]]
        rows.append({**inv, **v, "instrument_label": INSTRUMENTS.get(inv.get("instrument"), inv.get("instrument")),
                     "returns_paid": round(sum(float(r["amount"]) for r in inv_rets if r.get("kind") not in ("principal", "exit")))})
    invested = sum(float(i.get("amount") or 0) for i in invs)
    income = sum(float(r.get("amount") or 0) for r in rets if r.get("kind") not in ("principal", "exit"))
    back = sum(float(r.get("amount") or 0) for r in rets if r.get("kind") in ("principal", "exit"))
    current = sum(r["current_value"] for r in rows)
    flows = [(date.fromisoformat(i["date"][:10]), -float(i["amount"])) for i in invs] + \
            [(date.fromisoformat(r["date"][:10]), float(r["amount"])) for r in rets] + ([(date.today(), current)] if current else [])
    stake = sum(float(i.get("stake_percent") or 0) for i in invs if i.get("instrument") in STAKE_INSTRUMENTS and i.get("status", "active") == "active")
    return {
        "investments": rows,
        "returns": [{**r, "kind_label": RETURN_KINDS.get(r.get("kind"), r.get("kind"))} for r in sorted(rets, key=lambda r: r["date"], reverse=True)],
        "totals": {"invested": round(invested), "current_value": round(current), "returns_paid": round(income), "principal_back": round(back),
                   "gain": round(current + income + back - invested), "moic": round((current + income + back) / invested, 2) if invested else None,
                   "xirr": xirr(flows), "stake_percent": round(stake, 3)},
        "valuation": val,
    }


async def company_metrics(share: dict) -> dict:
    """Last 12 months of the company numbers the founder chose to share."""
    out = {}
    today = date.today()
    months = []
    m = today.replace(day=1)
    for _ in range(12):
        months.insert(0, m.strftime("%Y-%m"))
        m = (m - timedelta(days=1)).replace(day=1)
    if share.get("revenue") or share.get("profit"):
        tx = await db.transactions.find({"date": {"$gte": months[0] + "-01"}}, {"_id": 0, "type": 1, "amount": 1, "date": 1}).to_list(200000)
        series = []
        for k in months:
            inc = sum(float(t["amount"]) for t in tx if t["type"] == "income" and t["date"][:7] == k)
            exp = sum(float(t["amount"]) for t in tx if t["type"] == "expense" and t["date"][:7] == k)
            row = {"month": datetime.strptime(k, "%Y-%m").strftime("%b %y")}
            if share.get("revenue"):
                row["revenue"] = round(inc)
            if share.get("profit"):
                row["profit"] = round(inc - exp)
            series.append(row)
        out["monthly"] = series
        if share.get("revenue"):
            out["revenue_12m"] = sum(r["revenue"] for r in series)
        if share.get("profit"):
            out["profit_12m"] = sum(r["profit"] for r in series)
    if share.get("clients"):
        out["active_clients"] = await db.clients.count_documents({"status": "active"})
    if share.get("team"):
        out["team_size"] = await db.users.count_documents({"is_active": {"$ne": False}, "deleted": {"$ne": True}})
    if share.get("projects"):
        out["projects_delivered"] = await db.projects.count_documents({"status": "completed"})
        out["projects_active"] = await db.projects.count_documents({"status": {"$in": ["kickoff", "in_progress", "review"]}})
    if share.get("pipeline"):
        out["pipeline_value"] = round(sum(float(l.get("estimated_value") or 0) for l in await db.leads.find(
            {"stage": {"$in": ["new", "contacted", "qualified", "proposal"]}}, {"_id": 0, "estimated_value": 1}).to_list(20000)))
    return out


async def investor_dashboard(inv: dict) -> dict:
    cfg = await portal_settings()
    pos = await investor_position(inv["id"])
    updates = await db.investor_updates.find({"published": True, "$or": [{"audience": "all"}, {"investor_ids": inv["id"]}]}, {"_id": 0}).sort("date", -1).to_list(50)
    return {"investor": {k: inv.get(k) for k in ("id", "name", "type", "email", "city", "joined_on")}, **pos,
            "company": await company_metrics(cfg["share"]), "shared": cfg["share"], "share_labels": SHARE_KEYS,
            "updates": updates, "welcome": cfg["welcome"], "contact": cfg["contact"], "company_name": cfg["company_name"],
            "generated_at": _now()}


# ------------------------------------------------------------------ admin: investors
class InvestorIn(BaseModel):
    name: str
    type: str = "individual"
    email: Optional[str] = ""
    phone: Optional[str] = ""
    city: Optional[str] = ""
    joined_on: Optional[str] = None
    relationship_owner_id: Optional[str] = None
    notes: Optional[str] = ""
    status: str = "active"


class InvestmentIn(BaseModel):
    investor_id: str
    date: str
    amount: float
    instrument: str = "capital"
    stake_percent: Optional[float] = None
    interest_rate: Optional[float] = None
    tenure_months: Optional[int] = None
    terms: Optional[str] = ""
    status: str = "active"
    note: Optional[str] = ""


class ReturnIn(BaseModel):
    investor_id: str
    investment_id: Optional[str] = None
    date: str
    amount: float
    kind: str = "profit_share"
    tds: Optional[float] = 0
    note: Optional[str] = ""


class ValuationIn(BaseModel):
    date: str
    valuation: float
    method: Optional[str] = ""
    note: Optional[str] = ""


class UpdateIn(BaseModel):
    title: str
    body: str
    date: Optional[str] = None
    audience: str = "all"
    investor_ids: List[str] = []
    links: List[Dict[str, str]] = []
    published: bool = True


class LoginIn(BaseModel):
    name: Optional[str] = ""
    email: str
    password: str


class LoginUpdate(BaseModel):
    password: Optional[str] = None
    is_active: Optional[bool] = None


class PortalSettingsIn(BaseModel):
    share: Optional[Dict[str, bool]] = None
    welcome: Optional[str] = None
    contact: Optional[str] = None
    company_name: Optional[str] = None


@router.get("/investors")
async def list_investors(user: dict = Depends(get_current_user)):
    rows = await db.investors.find({}, {"_id": 0}).sort("name", 1).to_list(1000)
    out = []
    for r in rows:
        pos = await investor_position(r["id"])
        logins = await db.investor_users.count_documents({"investor_id": r["id"], "is_active": True})
        out.append({**r, "type_label": INVESTOR_TYPES.get(r.get("type"), r.get("type")), **pos["totals"],
                    "investments_count": len(pos["investments"]), "logins": logins,
                    "last_return": pos["returns"][0]["date"] if pos["returns"] else None})
    val = await latest_valuation()
    totals = {"investors": len([r for r in rows if r.get("status") == "active"]), "invested": sum(r["invested"] for r in out),
              "current_value": sum(r["current_value"] for r in out), "returns_paid": sum(r["returns_paid"] + r["principal_back"] for r in out),
              "stake_out": round(sum(r["stake_percent"] for r in out), 2)}
    return {"investors": out, "totals": totals, "valuation": val, "can_manage": has_permission(user, "investors.manage"),
            "can_delete": has_permission(user, "investors.delete"),
            "meta": {"types": INVESTOR_TYPES, "instruments": INSTRUMENTS, "return_kinds": RETURN_KINDS, "share_keys": SHARE_KEYS}}


@router.post("/investors")
async def create_investor(body: InvestorIn, user: dict = Depends(get_current_user)):
    _need(user)
    if not body.name.strip():
        raise HTTPException(status_code=400, detail="Investor name is required")
    if body.type not in INVESTOR_TYPES:
        raise HTTPException(status_code=400, detail="Invalid investor type")
    doc = {"id": str(uuid.uuid4()), **body.dict(), "name": body.name.strip()[:120], "joined_on": _date(body.joined_on) if body.joined_on else date.today().isoformat(),
           "created_by": user["id"], "created_at": _now()}
    await db.investors.insert_one(dict(doc))
    await log_activity(user, "investor_created", "investor", doc["id"], doc["name"])
    return doc


@router.get("/investors/{iid}")
async def get_investor(iid: str, user: dict = Depends(get_current_user)):
    inv = await db.investors.find_one({"id": iid}, {"_id": 0})
    if not inv:
        raise HTTPException(status_code=404, detail="Investor not found")
    logins = await db.investor_users.find({"investor_id": iid}, {"_id": 0, "password_hash": 0}).to_list(50)
    return {**inv, "type_label": INVESTOR_TYPES.get(inv.get("type")), **await investor_position(iid), "logins": logins}


@router.put("/investors/{iid}")
async def update_investor(iid: str, body: InvestorIn, user: dict = Depends(get_current_user)):
    _need(user)
    if not await db.investors.find_one({"id": iid}):
        raise HTTPException(status_code=404, detail="Investor not found")
    sets = {**body.dict(), "name": body.name.strip()[:120]}
    if body.joined_on:
        sets["joined_on"] = _date(body.joined_on)
    await db.investors.update_one({"id": iid}, {"$set": sets})
    await log_activity(user, "investor_updated", "investor", iid, body.name)
    return await get_investor(iid, user)


@router.get("/investors/{iid}/dashboard")
async def preview_dashboard(iid: str, user: dict = Depends(get_current_user)):
    """Exactly what this investor sees after signing in."""
    inv = await db.investors.find_one({"id": iid}, {"_id": 0})
    if not inv:
        raise HTTPException(status_code=404, detail="Investor not found")
    return await investor_dashboard(inv)


@router.post("/investors/investments")
async def add_investment(body: InvestmentIn, user: dict = Depends(get_current_user)):
    _need(user)
    if not await db.investors.find_one({"id": body.investor_id}):
        raise HTTPException(status_code=404, detail="Investor not found")
    if body.instrument not in INSTRUMENTS:
        raise HTTPException(status_code=400, detail="Invalid instrument")
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be more than zero")
    if body.stake_percent is not None and not 0 <= body.stake_percent <= 100:
        raise HTTPException(status_code=400, detail="Stake must be between 0 and 100%")
    doc = {"id": str(uuid.uuid4()), **body.dict(), "date": _date(body.date), "created_by": user["id"], "created_at": _now()}
    await db.investments.insert_one(dict(doc))
    await log_activity(user, "investment_recorded", "investor", body.investor_id, f"₹{int(body.amount):,} · {INSTRUMENTS[body.instrument]}")
    return doc


@router.put("/investors/investments/{xid}")
async def update_investment(xid: str, body: InvestmentIn, user: dict = Depends(get_current_user)):
    _need(user)
    if not await db.investments.find_one({"id": xid}):
        raise HTTPException(status_code=404, detail="Investment not found")
    if body.instrument not in INSTRUMENTS or body.status not in ("active", "redeemed", "converted", "exited"):
        raise HTTPException(status_code=400, detail="Invalid instrument or status")
    await db.investments.update_one({"id": xid}, {"$set": {**body.dict(), "date": _date(body.date)}})
    return await db.investments.find_one({"id": xid}, {"_id": 0})


@router.post("/investors/returns")
async def add_return(body: ReturnIn, user: dict = Depends(get_current_user)):
    _need(user)
    if not await db.investors.find_one({"id": body.investor_id}):
        raise HTTPException(status_code=404, detail="Investor not found")
    if body.kind not in RETURN_KINDS:
        raise HTTPException(status_code=400, detail="Invalid return type")
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be more than zero")
    if body.investment_id and not await db.investments.find_one({"id": body.investment_id, "investor_id": body.investor_id}):
        raise HTTPException(status_code=400, detail="That investment belongs to someone else")
    doc = {"id": str(uuid.uuid4()), **body.dict(), "date": _date(body.date), "created_by": user["id"], "created_at": _now()}
    await db.investor_returns.insert_one(dict(doc))
    await log_activity(user, "investor_return_recorded", "investor", body.investor_id, f"₹{int(body.amount):,} · {RETURN_KINDS[body.kind]}")
    return doc


@router.get("/investors-valuations")
async def valuations(user: dict = Depends(get_current_user)):
    if not has_permission(user, "investors"):
        raise HTTPException(status_code=403, detail="You don't have permission for this module")
    return await db.company_valuations.find({}, {"_id": 0}).sort("date", -1).to_list(200)


@router.post("/investors/valuations")
async def add_valuation(body: ValuationIn, user: dict = Depends(get_current_user)):
    _need(user)
    if body.valuation <= 0:
        raise HTTPException(status_code=400, detail="Valuation must be more than zero")
    doc = {"id": str(uuid.uuid4()), **body.dict(), "date": _date(body.date), "created_by": user["id"], "created_at": _now()}
    await db.company_valuations.insert_one(dict(doc))
    await log_activity(user, "valuation_recorded", "investor", None, f"₹{int(body.valuation):,} on {doc['date']}")
    return doc


@router.get("/investors/updates/all")
async def list_updates(user: dict = Depends(get_current_user)):
    rows = await db.investor_updates.find({}, {"_id": 0}).sort("date", -1).to_list(200)
    names = {i["id"]: i["name"] for i in await db.investors.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(1000)}
    for r in rows:
        r["investor_names"] = [names.get(x, "—") for x in r.get("investor_ids") or []]
    return rows


@router.post("/investors/updates")
async def post_update(body: UpdateIn, user: dict = Depends(get_current_user)):
    _need(user)
    if not body.title.strip() or not body.body.strip():
        raise HTTPException(status_code=400, detail="Add a title and the update")
    if body.audience not in ("all", "selected"):
        raise HTTPException(status_code=400, detail="Audience must be all or selected")
    links = [{"title": (l.get("title") or l.get("url") or "")[:120], "url": l.get("url", "")[:1000]} for l in body.links if (l.get("url") or "").startswith("http")]
    doc = {"id": str(uuid.uuid4()), "title": body.title.strip()[:160], "body": body.body.strip()[:10000], "date": _date(body.date) if body.date else date.today().isoformat(),
           "audience": body.audience, "investor_ids": body.investor_ids if body.audience == "selected" else [], "links": links,
           "published": body.published, "created_by": user["id"], "created_by_name": user["name"], "created_at": _now()}
    await db.investor_updates.insert_one(dict(doc))
    await log_activity(user, "investor_update_posted", "investor", None, doc["title"])
    return doc


@router.get("/investors-settings")
async def get_portal_settings(user: dict = Depends(get_current_user)):
    if not has_permission(user, "investors"):
        raise HTTPException(status_code=403, detail="You don't have permission for this module")
    return {**await portal_settings(), "share_labels": SHARE_KEYS}


@router.put("/investors-settings")
async def save_portal_settings(body: PortalSettingsIn, user: dict = Depends(get_current_user)):
    _need(user)
    sets = {}
    if body.share is not None:
        sets["share"] = {k: bool(v) for k, v in body.share.items() if k in SHARE_KEYS}
    for k in ("welcome", "contact", "company_name"):
        v = getattr(body, k)
        if v is not None:
            sets[k] = v[:1000]
    await db.settings.update_one({"id": "investor_portal"}, {"$set": {"id": "investor_portal", **sets}}, upsert=True)
    await log_activity(user, "investor_portal_settings_updated", "settings", "investor_portal", ", ".join(sets))
    return {**await portal_settings(), "share_labels": SHARE_KEYS}


@router.post("/investors/{iid}/logins")
async def create_login(iid: str, body: LoginIn, user: dict = Depends(get_current_user)):
    _need(user)
    inv = await db.investors.find_one({"id": iid}, {"_id": 0, "id": 1, "name": 1})
    if not inv:
        raise HTTPException(status_code=404, detail="Investor not found")
    email = body.email.strip().lower()
    if "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(status_code=400, detail="Enter a valid email address")
    if len(body.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    for coll in (db.investor_users, db.portal_users, db.users):
        if await coll.find_one({"email": email}):
            raise HTTPException(status_code=409, detail="That email already has a login")
    doc = {"id": str(uuid.uuid4()), "investor_id": iid, "name": (body.name or inv["name"]).strip(), "email": email,
           "password_hash": hash_password(body.password), "is_active": True, "last_login": None, "created_by": user["id"], "created_at": _now()}
    await db.investor_users.insert_one(dict(doc))
    await log_activity(user, "investor_login_created", "investor", iid, f"{inv['name']} · {email}")
    return {k: v for k, v in doc.items() if k not in ("password_hash", "_id")}


@router.put("/investors/{iid}/logins/{lid}")
async def update_login(iid: str, lid: str, body: LoginUpdate, user: dict = Depends(get_current_user)):
    _need(user)
    lu = await db.investor_users.find_one({"id": lid, "investor_id": iid})
    if not lu:
        raise HTTPException(status_code=404, detail="Login not found")
    sets = {}
    if body.password:
        if len(body.password) < 8:
            raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
        sets["password_hash"] = hash_password(body.password)
    if body.is_active is not None:
        sets["is_active"] = body.is_active
    if sets:
        await db.investor_users.update_one({"id": lid}, {"$set": sets})
    await log_activity(user, "investor_login_updated", "investor", iid, lu["email"] + (" · password reset" if body.password else ""))
    return {k: v for k, v in (await db.investor_users.find_one({"id": lid}, {"_id": 0})).items() if k != "password_hash"}


# ------------------------------------------------------------------ investor portal
class PortalLogin(BaseModel):
    email: str
    password: str


class PortalPassword(BaseModel):
    current_password: str
    new_password: str


def _token(lu: dict) -> str:
    return jwt.encode({"sub": lu["id"], "investor_id": lu["investor_id"], "type": "investor", "exp": datetime.now(timezone.utc) + timedelta(hours=12)},
                      os.environ["JWT_SECRET"], algorithm="HS256")


async def get_investor_user(request: Request) -> dict:
    auth = request.headers.get("Authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else None
    if not token:
        raise HTTPException(status_code=401, detail="Not signed in")
    try:
        payload = jwt.decode(token, os.environ["JWT_SECRET"], algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Your session expired — sign in again")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid session")
    if payload.get("type") != "investor":
        raise HTTPException(status_code=401, detail="Use the investor login")
    lu = await db.investor_users.find_one({"id": payload.get("sub")}, {"_id": 0})
    if not lu or not lu.get("is_active", True):
        raise HTTPException(status_code=401, detail="This login has been disabled")
    inv = await db.investors.find_one({"id": lu["investor_id"]}, {"_id": 0})
    if not inv:
        raise HTTPException(status_code=401, detail="This account is no longer available")
    lu["investor"] = inv
    return lu


def _actor(lu):
    return {"id": lu["id"], "name": lu["name"], "email": lu["email"], "role": "investor"}


@router.post("/investor-portal/login")
async def portal_login(body: PortalLogin):
    lu = await db.investor_users.find_one({"email": body.email.strip().lower()})
    if not lu or not verify_password(body.password, lu["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not lu.get("is_active", True):
        raise HTTPException(status_code=403, detail="This login has been disabled. Please contact dotindot.")
    inv = await db.investors.find_one({"id": lu["investor_id"]}, {"_id": 0, "id": 1, "name": 1})
    if not inv:
        raise HTTPException(status_code=403, detail="This account is no longer available")
    await db.investor_users.update_one({"id": lu["id"]}, {"$set": {"last_login": _now()}})
    await log_activity(_actor(lu), "investor_portal_login", "investor", inv["id"], inv["name"])
    return {"access_token": _token(lu), "token_type": "bearer", "user": {"id": lu["id"], "name": lu["name"], "email": lu["email"], "investor_name": inv["name"]}}


@router.get("/investor-portal/me")
async def portal_me(lu: dict = Depends(get_investor_user)):
    return {"id": lu["id"], "name": lu["name"], "email": lu["email"], "investor_id": lu["investor_id"], "investor_name": lu["investor"]["name"]}


@router.get("/investor-portal/dashboard")
async def portal_dashboard(lu: dict = Depends(get_investor_user)):
    return await investor_dashboard(lu["investor"])


@router.post("/investor-portal/change-password")
async def portal_change_password(body: PortalPassword, lu: dict = Depends(get_investor_user)):
    full = await db.investor_users.find_one({"id": lu["id"]})
    if not verify_password(body.current_password, full["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters")
    await db.investor_users.update_one({"id": lu["id"]}, {"$set": {"password_hash": hash_password(body.new_password)}})
    return {"ok": True}


def build_statement_pdf(d: dict) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from export_engine import FONT, BOLD_FONT, ORANGE_HEX, inr, _page_decorator

    bio = BytesIO()
    inv, t = d["investor"], d["totals"]
    doc = SimpleDocTemplate(bio, pagesize=A4, leftMargin=14 * mm, rightMargin=14 * mm, topMargin=22 * mm, bottomMargin=16 * mm,
                            title=f"Investment statement — {inv['name']}")
    W = A4[0] - 28 * mm
    ink, muted, line = colors.HexColor("#111827"), colors.HexColor("#6B7280"), colors.HexColor("#E5E7EB")
    orange, peach = colors.HexColor(ORANGE_HEX), colors.HexColor("#FFF7ED")
    H1 = ParagraphStyle("h1", fontName=BOLD_FONT, fontSize=17, textColor=ink, leading=21)
    SUB = ParagraphStyle("sub", fontName=FONT, fontSize=9, textColor=muted, leading=12)
    H2 = ParagraphStyle("h2", fontName=BOLD_FONT, fontSize=11, textColor=orange, spaceBefore=12, spaceAfter=5)
    CELL = ParagraphStyle("cell", fontName=FONT, fontSize=8.3, textColor=ink, leading=10.5)
    esc = lambda s: (str(s) if s not in (None, "") else "—").replace("&", "&amp;").replace("<", "&lt;")

    def dd(iso):
        try:
            x = date.fromisoformat(str(iso)[:10])
            return f"{x.day} {x.strftime('%b %Y')}"
        except Exception:
            return "—"

    story = [Paragraph(esc(inv["name"]), H1), Paragraph(f"Investment statement · {esc(d['company_name'])} · as of {dd(date.today().isoformat())}", SUB), Spacer(1, 8)]
    tiles = [("Invested", inr(t["invested"])), ("Current value", inr(t["current_value"])), ("Returns received", inr(t["returns_paid"] + t["principal_back"])),
             ("Multiple", f"{t['moic']}x" if t["moic"] else "—")]
    tt = Table([[Paragraph(esc(k).upper(), ParagraphStyle("tl", fontName=BOLD_FONT, fontSize=6.5, textColor=muted)) for k, _ in tiles],
                [Paragraph(f"<b>{esc(v)}</b>", ParagraphStyle("tv", fontName=BOLD_FONT, fontSize=12.5, textColor=ink)) for _, v in tiles]], colWidths=[W / 4] * 4)
    tt.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), peach), ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#FDBA74")),
                            ("LEFTPADDING", (0, 0), (-1, -1), 7), ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]))
    story.append(tt)
    if t.get("xirr") is not None:
        story += [Spacer(1, 4), Paragraph(f"Annualised return (XIRR): <b>{t['xirr']}%</b>" + (f" · stake held: <b>{t['stake_percent']:g}%</b>" if t.get("stake_percent") else ""), CELL)]
    if d.get("valuation"):
        story.append(Paragraph(f"Current value uses the company valuation of {inr(d['valuation']['valuation'])} dated {dd(d['valuation']['date'])}.", SUB))

    def table(headers, rows, widths, right=()):
        hdr = [Paragraph(f"<b>{h}</b>", ParagraphStyle("hd", fontName=BOLD_FONT, fontSize=7.5, textColor=colors.white)) for h in headers]
        tb = Table([hdr] + rows, colWidths=[W * w for w in widths], repeatRows=1)
        st = [("BACKGROUND", (0, 0), (-1, 0), orange), ("GRID", (0, 0), (-1, -1), 0.25, line), ("FONTNAME", (0, 1), (-1, -1), FONT),
              ("FONTSIZE", (0, 1), (-1, -1), 8.2), ("TOPPADDING", (0, 0), (-1, -1), 3.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5)]
        st += [("ALIGN", (i, 0), (i, -1), "RIGHT") for i in right]
        tb.setStyle(TableStyle(st))
        return tb

    story.append(Paragraph("Investments", H2))
    story.append(table(["Date", "Instrument", "Amount", "Stake / rate", "Current value", "Status"],
                       [[dd(x["date"]), Paragraph(esc(x["instrument_label"]), CELL), inr(x["amount"]),
                         (f"{x['stake_percent']:g}%" if x.get("stake_percent") else (f"{x['interest_rate']:g}% p.a." if x.get("interest_rate") else "—")),
                         inr(x["current_value"]), esc((x.get("status") or "active").title())] for x in d["investments"]],
                       [0.14, 0.26, 0.15, 0.15, 0.17, 0.13], right=(2, 4)))
    story.append(Paragraph("Returns received", H2))
    if d["returns"]:
        story.append(table(["Date", "Type", "Amount", "TDS", "Note"],
                           [[dd(r["date"]), esc(r["kind_label"]), inr(r["amount"]), inr(r.get("tds") or 0), Paragraph(esc(r.get("note")), CELL)] for r in d["returns"]],
                           [0.14, 0.2, 0.16, 0.12, 0.38], right=(2, 3)))
    else:
        story.append(Paragraph("No returns paid yet.", SUB))
    co = d.get("company") or {}
    if co:
        story.append(Paragraph("Company snapshot", H2))
        bits = []
        if "revenue_12m" in co:
            bits.append(f"Revenue (12 months): <b>{inr(co['revenue_12m'])}</b>")
        if "profit_12m" in co:
            bits.append(f"Profit (12 months): <b>{inr(co['profit_12m'])}</b>")
        for k, label in (("active_clients", "Active clients"), ("team_size", "Team"), ("projects_delivered", "Projects delivered")):
            if k in co:
                bits.append(f"{label}: <b>{co[k]}</b>")
        story.append(Paragraph(" · ".join(bits), CELL))
    story += [Spacer(1, 12), Paragraph("This statement is for your information. Figures are from dotindot's books on the date shown." +
                                       (f" Questions: {esc(d['contact'])}" if d.get("contact") else ""), SUB)]
    deco = _page_decorator(f"Investment statement — {inv['name']}", d["company_name"])
    doc.build(story, onFirstPage=deco, onLaterPages=deco)
    return bio.getvalue()


def _pdf(d):
    from export_engine import slug, attachment
    nm = d["investor"]["name"]
    fname = f"dotindot-statement-{slug(nm, 'investor')}-{date.today().isoformat()}.pdf"
    return Response(content=build_statement_pdf(d), media_type="application/pdf",
                    headers={"Content-Disposition": attachment(fname, f"dotindot-statement-{'-'.join(nm.split())}-{date.today().isoformat()}.pdf")})


@router.get("/investor-portal/statement")
async def portal_statement(lu: dict = Depends(get_investor_user)):
    d = await investor_dashboard(lu["investor"])
    await log_activity(_actor(lu), "investor_statement_downloaded", "investor", lu["investor_id"], lu["investor"]["name"])
    return _pdf(d)


@router.get("/investors/{iid}/statement")
async def admin_statement(iid: str, user: dict = Depends(get_current_user)):
    inv = await db.investors.find_one({"id": iid}, {"_id": 0})
    if not inv:
        raise HTTPException(status_code=404, detail="Investor not found")
    return _pdf(await investor_dashboard(inv))
