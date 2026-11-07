"""v3.0 Lead Flow — where leads come from and where they end up, for our own sales and for each client.

  • Internal: our sales pipeline (`leads`). Flow = Source → furthest stage reached → Won / Lost / Open.
  • Clients: leads we generate for clients (`client_leads`, new). Flow = Source → furthest stage → Converted / Lost / Open.
    Cost per lead uses the client's ad-campaign spend for the same platforms and period.
  • Capture: every client (and our own pipeline) gets a private intake link so website forms, Meta lead ads,
    Zapier/Make or WhatsApp tools can drop leads straight in — POST /api/intake/leads/{key}.

Endpoints: GET /api/lead-flow (lead_flow | sales.pipeline), /api/client-leads* (lead_flow; writes lead_flow.manage),
GET /api/portal/leads (client portal), POST /api/intake/leads/{key} (public, key-protected).
"""
import os
import re
import secrets
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Optional, List
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Request
from database import db
from auth import get_current_user, log_activity
from permissions import has_permission, scoped_client_ids

router = APIRouter()

SOURCES = {
    "meta_ads": "Meta ads (FB / IG)", "google_ads": "Google ads", "ads": "Paid ads", "instagram": "Instagram",
    "facebook": "Facebook", "linkedin": "LinkedIn", "website": "Website / landing page", "whatsapp": "WhatsApp",
    "referral": "Referral", "walk_in": "Walk-in / call", "event": "Events", "cold_outreach": "Cold outreach",
    "marketplace": "JustDial / IndiaMART", "other": "Other",
}
PLATFORM_SOURCE = {"meta": "meta_ads", "meta_ads": "meta_ads", "facebook": "meta_ads", "instagram": "meta_ads", "google": "google_ads",
                   "google_ads": "google_ads", "linkedin": "linkedin", "linkedin_ads": "linkedin"}

INTERNAL_STAGES = ["new", "contacted", "qualified", "proposal"]
CLIENT_STAGES = ["new", "contacted", "qualified", "converted", "lost"]
CLIENT_OPEN = ["new", "contacted", "qualified"]
STAGE_LABEL = {"new": "New", "contacted": "Contacted", "qualified": "Qualified", "proposal": "Proposal sent",
               "won": "Won", "converted": "Converted", "lost": "Lost", "open": "Still open"}


def _now():
    return datetime.now(timezone.utc).isoformat()


def _period(start: Optional[str], end: Optional[str], days: int = 90):
    e = date.fromisoformat(end) if end else date.today()
    s = date.fromisoformat(start) if start else e - timedelta(days=days - 1)
    if s > e:
        s, e = e, s
    return s.isoformat(), e.isoformat()


def _lead_date(l: dict) -> str:
    return (l.get("date") or l.get("created_at") or "")[:10]


def _furthest(lead: dict, order: list) -> str:
    seen = {h.get("stage") for h in lead.get("stage_history") or []} | {lead.get("stage")}
    best = order[0]
    for st in order:
        if st in seen:
            best = st
    return best


def _flow(rows: List[dict], order: list, win: str, value_key: str):
    """Sankey nodes/links + per-source table. Columns: source → furthest stage → outcome."""
    by_src, links = {}, {}
    stage_tot = {}
    for l in rows:
        src = l.get("source") if l.get("source") in SOURCES else "other"
        st = l.get("stage")
        outcome = win if st == win else ("lost" if st == "lost" else "open")
        reached = _furthest(l, order)
        val = float(l.get(value_key) or 0)
        b = by_src.setdefault(src, {"source": src, "label": SOURCES[src], "leads": 0, "qualified": 0, "won": 0, "lost": 0, "open": 0,
                                    "pipeline_value": 0.0, "won_value": 0.0})
        b["leads"] += 1
        b[("won" if outcome == win else outcome)] += 1
        if order.index(reached) >= order.index("qualified") or outcome == win:
            b["qualified"] += 1
        if outcome == win:
            b["won_value"] += val
        elif outcome == "open":
            b["pipeline_value"] += val
        k1 = (f"src:{src}", f"stage:{reached}")
        k2 = (f"stage:{reached}", f"out:{outcome}")
        for k in (k1, k2):
            x = links.setdefault(k, {"count": 0, "amount": 0.0})
            x["count"] += 1
            x["amount"] += val
        stage_tot[reached] = stage_tot.get(reached, 0) + 1
    # node list in column order (sources by size, stages in funnel order, outcomes)
    srcs = sorted(by_src.values(), key=lambda r: -r["leads"])
    nodes = [{"id": f"src:{r['source']}", "name": r["label"], "column": 0, "kind": "source", "key": r["source"]} for r in srcs]
    nodes += [{"id": f"stage:{st}", "name": STAGE_LABEL[st], "column": 1, "kind": "stage", "key": st} for st in order if st in stage_tot]
    outs = [o for o in (win, "lost", "open") if any(k[1] == f"out:{o}" for k in links)]
    nodes += [{"id": f"out:{o}", "name": STAGE_LABEL[o], "column": 2, "kind": "outcome", "key": o} for o in outs]
    idx = {n["id"]: i for i, n in enumerate(nodes)}
    link_rows = [{"source": idx[a], "target": idx[b], "value": v["count"], "amount": round(v["amount"])} for (a, b), v in links.items()]
    for r in srcs:
        r["win_rate"] = round(100 * r["won"] / r["leads"], 1) if r["leads"] else 0
        r["qualify_rate"] = round(100 * r["qualified"] / r["leads"], 1) if r["leads"] else 0
        r["won_value"] = round(r["won_value"])
        r["pipeline_value"] = round(r["pipeline_value"])
    total = len(rows)
    won = sum(r["won"] for r in srcs)
    return {
        "nodes": nodes, "links": link_rows, "sources": srcs,
        "totals": {"leads": total, "qualified": sum(r["qualified"] for r in srcs), "won": won, "lost": sum(r["lost"] for r in srcs),
                   "open": sum(r["open"] for r in srcs), "win_rate": round(100 * won / total, 1) if total else 0,
                   "won_value": sum(r["won_value"] for r in srcs), "pipeline_value": sum(r["pipeline_value"] for r in srcs)},
    }


def _monthly(rows: List[dict], end_iso: str, months: int = 6):
    end_d = date.fromisoformat(end_iso).replace(day=1)
    keys = []
    m = end_d
    for _ in range(months):
        keys.insert(0, m.strftime("%Y-%m"))
        m = (m - timedelta(days=1)).replace(day=1)
    out = {k: {"month": datetime.strptime(k, "%Y-%m").strftime("%b %y")} for k in keys}
    for l in rows:
        k = _lead_date(l)[:7]
        if k in out:
            src = l.get("source") if l.get("source") in SOURCES else "other"
            out[k][src] = out[k].get(src, 0) + 1
    return list(out.values())


async def _ad_spend_by_source(client_ids: Optional[List[str]], start: str, end: str) -> dict:
    q = {} if client_ids is None else {"client_id": {"$in": client_ids}}
    spend = {}
    async for c in db.ad_campaigns.find(q, {"_id": 0, "platform": 1, "metrics_history": 1}):
        src = PLATFORM_SOURCE.get((c.get("platform") or "").lower())
        if not src:
            continue
        for s in c.get("metrics_history") or []:
            if start <= (s.get("date") or "")[:10] <= end:
                spend[src] = spend.get(src, 0.0) + float(s.get("spend") or 0)
    return spend


async def client_lead_flow(client_ids: Optional[List[str]], start: str, end: str) -> dict:
    q = {} if client_ids is None else {"client_id": {"$in": client_ids}}
    all_rows = await db.client_leads.find(q, {"_id": 0}).to_list(50000)
    rows = [l for l in all_rows if start <= _lead_date(l) <= end]
    flow = _flow(rows, ["new", "contacted", "qualified"], "converted", "value")
    spend = await _ad_spend_by_source(client_ids, start, end)
    for r in flow["sources"]:
        sp = spend.get(r["source"])
        r["spend"] = round(sp) if sp else None
        r["cost_per_lead"] = round(sp / r["leads"]) if sp and r["leads"] else None
    paid_leads = sum(r["leads"] for r in flow["sources"] if r.get("spend"))
    total_spend = sum(spend.values())
    flow["totals"]["ad_spend"] = round(total_spend)
    flow["totals"]["cost_per_lead"] = round(total_spend / paid_leads) if paid_leads and total_spend else None
    flow["monthly"] = _monthly([l for l in all_rows if _lead_date(l) <= end], end)
    return flow


# ------------------------------------------------------------------ overview
@router.get("/lead-flow")
async def lead_flow(scope: str = "internal", client_id: Optional[str] = None, start: Optional[str] = None, end: Optional[str] = None,
                    user: dict = Depends(get_current_user)):
    s, e = _period(start, end)
    if scope == "clients":
        if not has_permission(user, "lead_flow"):
            raise HTTPException(status_code=403, detail="Client lead flow needs the Lead Flow permission")
        allowed = await scoped_client_ids(user)
        if client_id:
            if allowed is not None and client_id not in allowed:
                raise HTTPException(status_code=403, detail="That client belongs to a branch outside your access")
            ids = [client_id]
        else:
            ids = allowed
        flow = await client_lead_flow(ids, s, e)
        # per-client table (only when looking across clients)
        if not client_id:
            q = {} if ids is None else {"client_id": {"$in": ids}}
            per = {}
            async for l in db.client_leads.find(q, {"_id": 0, "client_id": 1, "stage": 1, "date": 1, "created_at": 1, "source": 1}):
                if not (s <= _lead_date(l) <= e):
                    continue
                r = per.setdefault(l["client_id"], {"client_id": l["client_id"], "leads": 0, "converted": 0, "sources": {}})
                r["leads"] += 1
                r["converted"] += 1 if l.get("stage") == "converted" else 0
                r["sources"][l.get("source", "other")] = r["sources"].get(l.get("source", "other"), 0) + 1
            names = {c["id"]: c["name"] for c in await db.clients.find({"id": {"$in": list(per)}}, {"_id": 0, "id": 1, "name": 1}).to_list(1000)}
            rows = []
            for r in per.values():
                top = max(r["sources"].items(), key=lambda x: x[1])[0] if r["sources"] else "other"
                rows.append({"client_id": r["client_id"], "client_name": names.get(r["client_id"], "—"), "leads": r["leads"], "converted": r["converted"],
                             "conversion_rate": round(100 * r["converted"] / r["leads"], 1) if r["leads"] else 0, "top_source": SOURCES.get(top, top)})
            flow["clients"] = sorted(rows, key=lambda x: -x["leads"])
    else:
        if not has_permission(user, "sales.pipeline", "lead_flow"):
            raise HTTPException(status_code=403, detail="Our lead flow needs the Sales pipeline permission")
        all_rows = await db.leads.find({}, {"_id": 0}).to_list(20000)
        rows = [l for l in all_rows if s <= _lead_date(l) <= e]
        flow = _flow(rows, INTERNAL_STAGES, "won", "estimated_value")
        flow["monthly"] = _monthly([l for l in all_rows if _lead_date(l) <= e], e)
    flow.update({"scope": scope, "period": {"start": s, "end": e}, "source_labels": SOURCES,
                 "can_manage": has_permission(user, "lead_flow.manage")})
    return flow


# ------------------------------------------------------------------ client leads CRUD
class ClientLeadIn(BaseModel):
    client_id: str
    name: str
    phone: Optional[str] = ""
    email: Optional[str] = ""
    source: str = "other"
    campaign: Optional[str] = ""
    stage: str = "new"
    value: Optional[float] = 0
    date: Optional[str] = None
    notes: Optional[str] = ""


class ClientLeadUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    source: Optional[str] = None
    campaign: Optional[str] = None
    stage: Optional[str] = None
    value: Optional[float] = None
    date: Optional[str] = None
    notes: Optional[str] = None
    lost_reason: Optional[str] = None


class ImportBody(BaseModel):
    client_id: str
    rows: List[dict]


def _need_manage(user):
    if not has_permission(user, "lead_flow.manage"):
        raise HTTPException(status_code=403, detail="Adding or editing client leads needs Lead Flow → manage")


async def _check_client(user, client_id):
    allowed = await scoped_client_ids(user)
    if allowed is not None and client_id not in allowed:
        raise HTTPException(status_code=403, detail="That client belongs to a branch outside your access")
    c = await db.clients.find_one({"id": client_id}, {"_id": 0, "id": 1, "name": 1})
    if not c:
        raise HTTPException(status_code=404, detail="Client not found")
    return c


def _clean_lead(d: dict) -> dict:
    src = (d.get("source") or "other").strip().lower().replace(" ", "_")
    src = {"fb": "meta_ads", "facebook_ads": "meta_ads", "meta": "meta_ads", "ig": "instagram", "google": "google_ads", "adwords": "google_ads",
           "site": "website", "web": "website", "form": "website", "landing_page": "website", "wa": "whatsapp", "call": "walk_in",
           "phone": "walk_in", "justdial": "marketplace", "indiamart": "marketplace"}.get(src, src)
    if src not in SOURCES:
        src = "other"
    stage = (d.get("stage") or "new").strip().lower()
    if stage not in CLIENT_STAGES:
        stage = "new"
    dt = (d.get("date") or "")[:10]
    try:
        date.fromisoformat(dt)
    except ValueError:
        dt = date.today().isoformat()
    try:
        value = float(d.get("value") or 0)
    except (TypeError, ValueError):
        value = 0.0
    return {"name": (d.get("name") or "").strip()[:120] or "Unnamed lead", "phone": str(d.get("phone") or "").strip()[:40],
            "email": (d.get("email") or "").strip()[:120], "source": src, "campaign": (d.get("campaign") or "").strip()[:120],
            "stage": stage, "value": value, "date": dt, "notes": (d.get("notes") or d.get("message") or "").strip()[:2000]}


@router.get("/client-leads")
async def list_client_leads(client_id: Optional[str] = None, stage: Optional[str] = None, source: Optional[str] = None,
                            q: Optional[str] = None, start: Optional[str] = None, end: Optional[str] = None,
                            user: dict = Depends(get_current_user)):
    query = {}
    allowed = await scoped_client_ids(user)
    if client_id:
        await _check_client(user, client_id)
        query["client_id"] = client_id
    elif allowed is not None:
        query["client_id"] = {"$in": allowed}
    if stage in CLIENT_STAGES:
        query["stage"] = stage
    elif stage == "open":
        query["stage"] = {"$in": CLIENT_OPEN}
    if source in SOURCES:
        query["source"] = source
    if q:
        query["$or"] = [{f: {"$regex": re.escape(q), "$options": "i"}} for f in ("name", "phone", "email", "campaign")]
    rows = await db.client_leads.find(query, {"_id": 0}).sort("date", -1).to_list(2000)
    if start or end:
        s, e = _period(start, end)
        rows = [r for r in rows if s <= _lead_date(r) <= e]
    names = {c["id"]: c["name"] for c in await db.clients.find({"id": {"$in": list({r["client_id"] for r in rows})}}, {"_id": 0, "id": 1, "name": 1}).to_list(1000)}
    for r in rows:
        r["client_name"] = names.get(r["client_id"], "")
        r["source_label"] = SOURCES.get(r.get("source"), r.get("source"))
    return rows


@router.post("/client-leads")
async def create_client_lead(body: ClientLeadIn, user: dict = Depends(get_current_user)):
    _need_manage(user)
    c = await _check_client(user, body.client_id)
    doc = {"id": str(uuid.uuid4()), "client_id": c["id"], **_clean_lead(body.dict()), "created_by": user["id"], "created_at": _now(),
           "updated_at": _now()}
    doc["stage_history"] = [{"stage": doc["stage"], "at": _now()}]
    await db.client_leads.insert_one(dict(doc))
    await log_activity(user, "client_lead_created", "client", c["id"], f"{c['name']} · {doc['name']}")
    return doc


@router.put("/client-leads/{lid}")
async def update_client_lead(lid: str, body: ClientLeadUpdate, user: dict = Depends(get_current_user)):
    _need_manage(user)
    l = await db.client_leads.find_one({"id": lid}, {"_id": 0})
    if not l:
        raise HTTPException(status_code=404, detail="Lead not found")
    await _check_client(user, l["client_id"])
    patch = {k: v for k, v in body.dict().items() if v is not None}
    merged = _clean_lead({**l, **patch})
    sets = {k: merged[k] for k in patch if k in merged}
    if "lost_reason" in patch:
        sets["lost_reason"] = patch["lost_reason"][:300]
    sets["updated_at"] = _now()
    upd = {"$set": sets}
    if "stage" in sets and sets["stage"] != l.get("stage"):
        upd["$push"] = {"stage_history": {"stage": sets["stage"], "at": _now()}}
    await db.client_leads.update_one({"id": lid}, upd)
    await log_activity(user, "client_lead_updated", "client", l["client_id"], f"{l['name']}" + (f" → {sets['stage']}" if "stage" in sets else ""))
    return await db.client_leads.find_one({"id": lid}, {"_id": 0})


@router.post("/client-leads/import")
async def import_client_leads(body: ImportBody, user: dict = Depends(get_current_user)):
    """Bulk add from a CSV/sheet the frontend has parsed: columns name, phone, email, source, campaign, stage, value, date, notes."""
    _need_manage(user)
    c = await _check_client(user, body.client_id)
    docs = []
    for r in body.rows[:5000]:
        if not any(str(r.get(k) or "").strip() for k in ("name", "phone", "email")):
            continue
        d = _clean_lead(r)
        docs.append({"id": str(uuid.uuid4()), "client_id": c["id"], **d, "created_by": user["id"], "created_at": _now(), "updated_at": _now(),
                     "stage_history": [{"stage": d["stage"], "at": _now()}], "imported": True})
    if docs:
        await db.client_leads.insert_many([dict(x) for x in docs])
    await log_activity(user, "client_leads_imported", "client", c["id"], f"{c['name']} · {len(docs)} leads")
    return {"imported": len(docs), "skipped": len(body.rows) - len(docs)}


# ------------------------------------------------------------------ intake links
def _intake_url(request: Request, key: str) -> str:
    base = str(request.base_url).rstrip("/")
    return f"{base}/api/intake/leads/{key}"


@router.get("/client-leads/intake-key")
async def get_intake_key(client_id: Optional[str] = None, rotate: bool = False, request: Request = None, user: dict = Depends(get_current_user)):
    """client_id → that client's capture link; no client_id → our own pipeline's link (needs sales.pipeline)."""
    _need_manage(user)
    if client_id:
        await _check_client(user, client_id)
        target = {"kind": "client", "client_id": client_id}
    else:
        if not has_permission(user, "sales.pipeline"):
            raise HTTPException(status_code=403, detail="Our own capture link needs the Sales pipeline permission")
        target = {"kind": "internal", "client_id": None}
    doc = await db.lead_intake_keys.find_one(target, {"_id": 0})
    if not doc or rotate:
        key = "lk_" + secrets.token_urlsafe(24)
        if doc:
            await db.lead_intake_keys.update_one(target, {"$set": {"key": key, "rotated_at": _now()}})
        else:
            await db.lead_intake_keys.insert_one({**target, "key": key, "created_at": _now(), "last_used_at": None, "count": 0})
        await log_activity(user, "lead_intake_key_" + ("rotated" if doc else "created"), "client" if client_id else "lead", client_id, target["kind"])
        doc = await db.lead_intake_keys.find_one(target, {"_id": 0})
    return {"url": _intake_url(request, doc["key"]), "key": doc["key"], "last_used_at": doc.get("last_used_at"), "count": doc.get("count", 0),
            "fields": ["name", "phone", "email", "source", "campaign", "value", "message"]}


async def _read_intake(request: Request) -> dict:
    """JSON or form body → a dict with common form-builder / Meta lead-ad field names normalised."""
    ctype = request.headers.get("content-type", "")
    try:
        data = await request.json() if "json" in ctype else dict(await request.form())
    except Exception:
        raise HTTPException(status_code=400, detail="Send JSON or a form")
    if isinstance(data, list):
        data = data[0] if data else {}
    if not isinstance(data, dict):
        raise HTTPException(status_code=400, detail="Send the lead as an object of fields")
    # common field aliases from form builders / Meta lead ads exports
    alias = {"full_name": "name", "fullname": "name", "your-name": "name", "mobile": "phone", "phone_number": "phone", "contact": "phone",
             "email_address": "email", "your-email": "email", "utm_source": "source", "utm_campaign": "campaign", "comments": "message"}
    data = {alias.get(str(k).lower(), str(k).lower()): v for k, v in (data or {}).items()}
    if not any(str(data.get(k) or "").strip() for k in ("name", "phone", "email")):
        raise HTTPException(status_code=400, detail="A lead needs at least a name, phone or email")
    return data


async def _save_internal_lead(data: dict, now: str, via: str = "intake") -> dict:
    """A lead for our own pipeline (Sales → Pipeline)."""
    d = _clean_lead({"source": "website", **data})
    src = d["source"] if d["source"] in ("referral", "website", "ads", "linkedin", "cold_outreach", "event") else ("ads" if d["source"] in ("meta_ads", "google_ads") else "other")
    lead = {"id": str(uuid.uuid4()), "name": d["name"], "company": str(data.get("company") or "")[:120], "contact_email": d["email"],
            "contact_phone": d["phone"], "source": src, "service_interest": str(data.get("service") or "")[:80], "estimated_value": d["value"],
            "stage": "new", "notes": d["notes"], "owner_id": None, "branch_id": None, "follow_up_date": None, "created_at": now, "updated_at": now,
            "region": "", "state": "", "city": str(data.get("city") or "")[:80], "currency": "INR", "converted_client_id": None,
            "created_by": "intake", "stage_history": [{"stage": "new", "at": now, "by": "intake"}], "via": via}
    await db.leads.insert_one(dict(lead))
    return {"ok": True, "id": lead["id"]}


@router.post("/intake/leads/{key}")
async def intake(key: str, request: Request):
    """Public capture endpoint (JSON or form-encoded). The key is the only credential — rotate it if it leaks."""
    doc = await db.lead_intake_keys.find_one({"key": key}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Unknown capture link")
    data = await _read_intake(request)
    now = _now()
    await db.lead_intake_keys.update_one({"key": key}, {"$set": {"last_used_at": now}, "$inc": {"count": 1}})
    if doc["kind"] == "client":
        d = _clean_lead({"source": "website", **data, "stage": "new"})
        lead = {"id": str(uuid.uuid4()), "client_id": doc["client_id"], **d, "created_by": "intake", "created_at": now, "updated_at": now,
                "stage_history": [{"stage": "new", "at": now}], "via": "intake"}
        await db.client_leads.insert_one(dict(lead))
        return {"ok": True, "id": lead["id"]}
    return await _save_internal_lead(data, now)


# Our own website (dotindot.in) is served by this same app, so its forms post here — no key in the page.
_WEB_HITS: dict = {}


@router.post("/intake/website")
async def website_intake(request: Request):
    """Leads from dotindot.in forms → Sales → Pipeline. Same-origin only, a few per visitor per 10 minutes."""
    origin = request.headers.get("origin") or ""
    if origin:
        host = re.sub(r"^https?://", "", origin).split("/")[0].lower()
        allowed = {(request.headers.get("host") or "").lower()}
        allowed |= {re.sub(r"^https?://", "", o.strip()).split("/")[0].lower() for o in os.environ.get("WEBSITE_ORIGINS", "").split(",") if o.strip()}
        if host not in allowed:
            raise HTTPException(status_code=403, detail="Leads are only accepted from our own website")
    # visitor address from nginx (X-Real-IP); a direct local call without one (health checks, a proxy that
    # doesn't pass it) is not limited, so one misconfigured proxy can't block every visitor at once
    ip = (request.headers.get("x-real-ip") or (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
          or (request.client.host if request.client else ""))
    if ip and ip not in ("127.0.0.1", "::1", "localhost"):
        t = datetime.now(timezone.utc).timestamp()
        hits = [h for h in _WEB_HITS.get(ip, []) if t - h < 600]
        if len(hits) >= 8:
            raise HTTPException(status_code=429, detail="Too many messages — please try again in a few minutes")
        if len(_WEB_HITS) > 5000:
            _WEB_HITS.clear()
        _WEB_HITS[ip] = hits + [t]
    data = await _read_intake(request)
    if str(data.get("website_url_hp") or "").strip():
        return {"ok": True}  # bot filled the hidden field: accept silently, store nothing
    return await _save_internal_lead(data, _now(), via="website")


# ------------------------------------------------------------------ client dashboard + portal
@router.get("/clients/{client_id}/lead-flow")
async def client_dashboard_flow(client_id: str, start: Optional[str] = None, end: Optional[str] = None, user: dict = Depends(get_current_user)):
    if not has_permission(user, "clients"):
        raise HTTPException(status_code=403, detail="You don't have permission for this module")
    await _check_client(user, client_id)
    s, e = _period(start, end)
    return {**await client_lead_flow([client_id], s, e), "period": {"start": s, "end": e}, "source_labels": SOURCES}


from routes_client_dashboard import get_portal_user  # noqa: E402


@router.get("/portal/leads")
async def portal_leads(start: Optional[str] = None, end: Optional[str] = None, pu: dict = Depends(get_portal_user)):
    s, e = _period(start, end)
    flow = await client_lead_flow([pu["client_id"]], s, e)
    recent = await db.client_leads.find({"client_id": pu["client_id"]}, {"_id": 0, "name": 1, "source": 1, "stage": 1, "date": 1, "campaign": 1}).sort("date", -1).to_list(25)
    for r in recent:
        r["source_label"] = SOURCES.get(r.get("source"), r.get("source"))
    return {**flow, "recent": recent, "period": {"start": s, "end": e}, "source_labels": SOURCES}
