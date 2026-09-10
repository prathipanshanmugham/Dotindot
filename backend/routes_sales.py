import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from pymongo import ReturnDocument
from database import db
from models import (
    LeadCreate, LeadUpdate, StageChange, LeadActivityCreate, ConvertRequest,
    QuoteCreate, QuoteUpdate, QuoteStatusChange, TargetCreate,
)
from auth import require_roles, log_activity
from routes_finance import period_range

router = APIRouter()

WRITE = ("admin", "sales")
READ = ("admin", "sales", "pm", "finance")

STAGES = ["new", "contacted", "qualified", "proposal", "won", "lost"]
OPEN_STAGES = ["new", "contacted", "qualified", "proposal"]
SOURCES = ["referral", "website", "ads", "linkedin", "cold_outreach", "event", "other"]


def _now():
    return datetime.now(timezone.utc).isoformat()


def _today():
    return datetime.now(timezone.utc).date().isoformat()


def won_at(lead) -> Optional[str]:
    for h in reversed(lead.get("stage_history", [])):
        if h["stage"] == "won":
            return h["at"][:10]
    return None


async def user_map():
    users = await db.users.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(200)
    return {u["id"]: u["name"] for u in users}


# ---------------- Leads ----------------
@router.get("/sales/leads")
async def list_leads(
    stage: Optional[str] = None,
    source: Optional[str] = None,
    owner: Optional[str] = None,
    start: Optional[str] = None,
    end: Optional[str] = None,
    user: dict = Depends(require_roles(*READ)),
):
    q = {}
    if stage:
        q["stage"] = stage
    if source:
        q["source"] = source
    if owner:
        q["owner_id"] = owner
    if start or end:
        q["created_at"] = {}
        if start:
            q["created_at"]["$gte"] = start
        if end:
            q["created_at"]["$lte"] = end + "T23:59:59"
    from permissions import branch_scope
    branches = branch_scope(user)
    if branches is not None:
        q["branch_id"] = {"$in": branches}
    leads = await db.leads.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)
    umap = await user_map()
    for l in leads:
        l["owner_name"] = umap.get(l.get("owner_id"), "")
        l["won_at"] = won_at(l)
    return leads


@router.post("/sales/leads")
async def create_lead(body: LeadCreate, user: dict = Depends(require_roles(*WRITE))):
    if body.stage not in STAGES:
        raise HTTPException(status_code=400, detail="Invalid stage")
    doc = body.model_dump()
    now = _now()
    doc.update({
        "id": str(uuid.uuid4()), "owner_id": doc.get("owner_id") or user["id"],
        "stage_history": [{"stage": doc["stage"], "at": now, "by": user["id"]}],
        "converted_client_id": None, "created_at": now, "updated_at": now, "created_by": user["id"],
    })
    await db.leads.insert_one(doc)
    await log_activity(user, "lead_created", "lead", doc["id"], doc["name"])
    doc.pop("_id", None)
    return doc


@router.get("/sales/leads/{lead_id}")
async def get_lead(lead_id: str, user: dict = Depends(require_roles(*READ))):
    lead = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    umap = await user_map()
    lead["owner_name"] = umap.get(lead.get("owner_id"), "")
    lead["won_at"] = won_at(lead)
    activities = await db.lead_activities.find({"lead_id": lead_id}, {"_id": 0}).sort("date", -1).to_list(500)
    for a in activities:
        a["created_by_name"] = umap.get(a.get("created_by"), "")
    lead["activities"] = activities
    lead["quotes"] = await db.quotes.find({"lead_id": lead_id}, {"_id": 0}).sort("created_at", -1).to_list(100)
    if lead.get("converted_client_id"):
        client = await db.clients.find_one({"id": lead["converted_client_id"]}, {"_id": 0, "id": 1, "name": 1})
        lead["converted_client_name"] = client["name"] if client else ""
    return lead


@router.put("/sales/leads/{lead_id}")
async def update_lead(lead_id: str, body: LeadUpdate, user: dict = Depends(require_roles(*WRITE))):
    existing = await db.leads.find_one({"id": lead_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Lead not found")
    updates = body.model_dump(exclude_unset=True)
    updates["updated_at"] = _now()
    await db.leads.update_one({"id": lead_id}, {"$set": updates})
    await log_activity(user, "lead_updated", "lead", lead_id, updates.get("name", existing["name"]))
    return {"ok": True}


@router.delete("/sales/leads/{lead_id}")
async def delete_lead(lead_id: str, user: dict = Depends(require_roles(*WRITE))):
    existing = await db.leads.find_one({"id": lead_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Lead not found")
    await db.leads.delete_one({"id": lead_id})
    await db.lead_activities.delete_many({"lead_id": lead_id})
    await log_activity(user, "lead_deleted", "lead", lead_id, existing["name"])
    return {"ok": True}


@router.post("/sales/leads/{lead_id}/stage")
async def change_stage(lead_id: str, body: StageChange, user: dict = Depends(require_roles(*WRITE))):
    if body.stage not in STAGES:
        raise HTTPException(status_code=400, detail="Invalid stage")
    lead = await db.leads.find_one({"id": lead_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    if lead.get("converted_client_id"):
        raise HTTPException(status_code=400, detail="Converted leads are locked")
    if lead["stage"] == body.stage:
        return {"ok": True, "stage": body.stage}
    entry = {"stage": body.stage, "at": _now(), "by": user["id"]}
    await db.leads.update_one(
        {"id": lead_id},
        {"$set": {"stage": body.stage, "updated_at": _now()}, "$push": {"stage_history": entry}},
    )
    await log_activity(user, f"lead_stage_{body.stage}", "lead", lead_id, lead["name"])
    return {"ok": True, "stage": body.stage, "history_entry": entry}


@router.post("/sales/leads/{lead_id}/activities")
async def add_lead_activity(lead_id: str, body: LeadActivityCreate, user: dict = Depends(require_roles(*WRITE))):
    lead = await db.leads.find_one({"id": lead_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    doc = body.model_dump()
    doc.update({
        "id": str(uuid.uuid4()), "lead_id": lead_id, "date": doc.get("date") or _today(),
        "created_by": user["id"], "created_at": _now(),
    })
    await db.lead_activities.insert_one(doc)
    if body.follow_up_date:
        await db.leads.update_one({"id": lead_id}, {"$set": {"follow_up_date": body.follow_up_date, "updated_at": _now()}})
    await log_activity(user, "lead_activity_added", "lead", lead_id, lead["name"])
    doc.pop("_id", None)
    return doc


@router.post("/sales/leads/{lead_id}/convert")
async def convert_lead(lead_id: str, body: ConvertRequest, user: dict = Depends(require_roles(*WRITE))):
    # Atomic guard: claim the lead for conversion only if won and never converted
    lead = await db.leads.find_one_and_update(
        {"id": lead_id, "stage": "won",
         "$or": [{"converted_client_id": None}, {"converted_client_id": {"$exists": False}}]},
        {"$set": {"converted_client_id": "__converting__"}},
    )
    if not lead:
        existing = await db.leads.find_one({"id": lead_id})
        if not existing:
            raise HTTPException(status_code=404, detail="Lead not found")
        if existing.get("converted_client_id") and existing["converted_client_id"] != "__converting__":
            raise HTTPException(status_code=400, detail="This lead has already been converted to a client")
        if existing["stage"] == "lost":
            raise HTTPException(status_code=400, detail="Lost leads cannot be converted")
        raise HTTPException(status_code=400, detail="Only won leads can be converted")
    try:
        if body.mode == "existing_client":
            if not body.client_id:
                raise HTTPException(status_code=400, detail="client_id required for existing_client mode")
            client = await db.clients.find_one({"id": body.client_id})
            if not client:
                raise HTTPException(status_code=404, detail="Client not found")
            client_id, client_name = client["id"], client["name"]
        else:
            now = _now()
            if body.client:
                cdoc = body.client.model_dump()
            else:
                cdoc = {
                    "name": lead["name"], "company": lead.get("company", ""), "industry": "other",
                    "service_type": "web_dev", "size": "small", "status": "active", "retainer": False,
                    "region": lead.get("region", ""), "city": lead.get("city", ""), "google_drive_link": "",
                    "contacts": [], "domain_hosting": None, "contracts": [], "credentials": [],
                    "notes": f"Converted from sales lead. {lead.get('notes', '')}".strip(), "currency": "INR",
                }
            cdoc["credentials"] = []  # credentials are added later via the client module (encrypted)
            if lead.get("contact_email") or lead.get("contact_phone"):
                cdoc.setdefault("contacts", [])
                if not cdoc["contacts"]:
                    cdoc["contacts"] = [{"name": lead["name"], "email": lead.get("contact_email", ""),
                                         "phone": lead.get("contact_phone", ""), "role": "Primary contact"}]
            cdoc.update({"id": str(uuid.uuid4()), "created_at": now, "updated_at": now, "created_by": user["id"]})
            await db.clients.insert_one(cdoc)
            client_id, client_name = cdoc["id"], cdoc["name"]
    except HTTPException:
        await db.leads.update_one({"id": lead_id}, {"$set": {"converted_client_id": None}})
        raise
    except Exception:
        await db.leads.update_one({"id": lead_id}, {"$set": {"converted_client_id": None}})
        raise HTTPException(status_code=500, detail="Conversion failed; lead unlocked")
    await db.leads.update_one(
        {"id": lead_id},
        {"$set": {"converted_client_id": client_id, "converted_at": _now(), "updated_at": _now()}},
    )
    await log_activity(user, "lead_converted", "lead", lead_id, f"{lead['name']} → client {client_name}")
    return {"ok": True, "client_id": client_id, "client_name": client_name, "estimated_value": lead.get("estimated_value", 0)}


# ---------------- Quotes ----------------
def compute_quote_totals(items, gst_enabled: bool):
    norm = []
    for it in items:
        d = it if isinstance(it, dict) else it.model_dump()
        total = round(float(d.get("qty", 1)) * float(d.get("unit_price", 0)), 2)
        norm.append({"description": d.get("description", ""), "qty": d.get("qty", 1),
                     "unit_price": d.get("unit_price", 0), "total": total})
    subtotal = round(sum(x["total"] for x in norm), 2)
    gst_amount = round(subtotal * 0.18, 2) if gst_enabled else 0.0
    return norm, subtotal, gst_amount, round(subtotal + gst_amount, 2)


async def next_quote_number() -> str:
    year = datetime.now(timezone.utc).year
    c = await db.counters.find_one_and_update(
        {"_id": f"quotes-{year}"}, {"$inc": {"seq": 1}}, upsert=True, return_document=ReturnDocument.AFTER,
    )
    return f"QTN-{year}-{c['seq']:03d}"


async def expire_stale_quotes():
    await db.quotes.update_many(
        {"status": {"$in": ["draft", "sent"]}, "validity_date": {"$ne": None, "$lt": _today()}},
        {"$set": {"status": "expired", "updated_at": _now()}},
    )


async def enrich_quotes(rows):
    umap = await user_map()
    lead_ids = [q["lead_id"] for q in rows if q.get("lead_id")]
    client_ids = [q["client_id"] for q in rows if q.get("client_id")]
    lmap = {l["id"]: l["name"] for l in await db.leads.find({"id": {"$in": lead_ids}}, {"_id": 0, "id": 1, "name": 1}).to_list(500)}
    cmap = {c["id"]: c["name"] for c in await db.clients.find({"id": {"$in": client_ids}}, {"_id": 0, "id": 1, "name": 1}).to_list(500)}
    for q in rows:
        q["lead_name"] = lmap.get(q.get("lead_id"), "")
        q["client_name"] = cmap.get(q.get("client_id"), "")
        q["created_by_name"] = umap.get(q.get("created_by"), "")
    return rows


@router.get("/sales/quotes")
async def list_quotes(status: Optional[str] = None, lead_id: Optional[str] = None,
                      client_id: Optional[str] = None, user: dict = Depends(require_roles(*READ))):
    await expire_stale_quotes()
    q = {}
    if status:
        q["status"] = status
    if lead_id:
        q["lead_id"] = lead_id
    if client_id:
        q["client_id"] = client_id
    rows = await db.quotes.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return await enrich_quotes(rows)


@router.get("/sales/quotes/{quote_id}")
async def get_quote(quote_id: str, user: dict = Depends(require_roles(*READ))):
    await expire_stale_quotes()
    q = await db.quotes.find_one({"id": quote_id}, {"_id": 0})
    if not q:
        raise HTTPException(status_code=404, detail="Quote not found")
    rows = await enrich_quotes([q])
    return rows[0]


@router.post("/sales/quotes")
async def create_quote(body: QuoteCreate, user: dict = Depends(require_roles(*WRITE))):
    items, subtotal, gst_amount, total = compute_quote_totals(body.items, body.gst_enabled)
    now = _now()
    doc = {
        "id": str(uuid.uuid4()), "number": await next_quote_number(), "title": body.title,
        "lead_id": body.lead_id, "client_id": body.client_id, "items": items,
        "subtotal": subtotal, "gst_enabled": body.gst_enabled, "gst_amount": gst_amount, "total": total,
        "validity_date": body.validity_date, "status": body.status if body.status in ("draft", "sent") else "draft",
        "notes": body.notes, "currency": "INR", "created_by": user["id"], "created_at": now, "updated_at": now,
    }
    await db.quotes.insert_one(doc)
    await log_activity(user, "quote_created", "quote", doc["id"], doc["number"])
    doc.pop("_id", None)
    return doc


@router.put("/sales/quotes/{quote_id}")
async def update_quote(quote_id: str, body: QuoteUpdate, user: dict = Depends(require_roles(*WRITE))):
    existing = await db.quotes.find_one({"id": quote_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Quote not found")
    updates = body.model_dump(exclude_unset=True)
    gst_enabled = updates.get("gst_enabled", existing["gst_enabled"])
    items_src = updates.get("items", existing["items"])
    items, subtotal, gst_amount, total = compute_quote_totals(items_src, gst_enabled)
    updates.update({"items": items, "subtotal": subtotal, "gst_amount": gst_amount, "total": total, "updated_at": _now()})
    await db.quotes.update_one({"id": quote_id}, {"$set": updates})
    await log_activity(user, "quote_updated", "quote", quote_id, existing["number"])
    return {"ok": True}


@router.post("/sales/quotes/{quote_id}/status")
async def change_quote_status(quote_id: str, body: QuoteStatusChange, user: dict = Depends(require_roles(*WRITE))):
    if body.status not in ("draft", "sent", "accepted", "rejected"):
        raise HTTPException(status_code=400, detail="Invalid status")
    existing = await db.quotes.find_one({"id": quote_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Quote not found")
    await db.quotes.update_one({"id": quote_id}, {"$set": {"status": body.status, "updated_at": _now()}})
    await log_activity(user, f"quote_{body.status}", "quote", quote_id, existing["number"])
    return {"ok": True, "status": body.status}


@router.delete("/sales/quotes/{quote_id}")
async def delete_quote(quote_id: str, user: dict = Depends(require_roles(*WRITE))):
    existing = await db.quotes.find_one({"id": quote_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Quote not found")
    await db.quotes.delete_one({"id": quote_id})
    await log_activity(user, "quote_deleted", "quote", quote_id, existing["number"])
    return {"ok": True}


# ---------------- Targets ----------------
async def won_leads_in(start: str, end: str):
    leads = await db.leads.find({"stage": "won"}, {"_id": 0}).to_list(1000)
    rows = []
    for l in leads:
        w = won_at(l)
        if w and start <= w <= end:
            rows.append({"owner_id": l.get("owner_id"), "value": l.get("estimated_value", 0), "won_at": w, "name": l["name"]})
    return rows


async def targets_with_actuals(q: dict):
    targets = await db.targets.find(q, {"_id": 0}).sort("period", -1).to_list(200)
    umap = await user_map()
    for t in targets:
        start, end = period_range(t["period"])
        won = await won_leads_in(start, end)
        if t["scope"] == "team":
            actual = sum(w["value"] for w in won)
            t["user_name"] = "Team"
        else:
            actual = sum(w["value"] for w in won if w["owner_id"] == t.get("user_id"))
            t["user_name"] = umap.get(t.get("user_id"), "Unknown")
        t["actual"] = round(actual, 2)
        t["pct"] = round(actual / t["amount"] * 100, 1) if t["amount"] else 0
        t["on_track"] = t["pct"] >= 100
    return targets


@router.get("/sales/targets")
async def list_targets(period: Optional[str] = None, user: dict = Depends(require_roles(*READ))):
    q = {"period": period} if period else {}
    return await targets_with_actuals(q)


@router.post("/sales/targets")
async def create_target(body: TargetCreate, user: dict = Depends(require_roles(*WRITE))):
    if body.scope == "user" and not body.user_id:
        raise HTTPException(status_code=400, detail="user_id required for user-scoped targets")
    doc = body.model_dump()
    doc.update({"id": str(uuid.uuid4()), "created_by": user["id"], "created_at": _now()})
    await db.targets.insert_one(doc)
    await log_activity(user, "target_created", "target", doc["id"], f"{doc['period']} ₹{doc['amount']}")
    doc.pop("_id", None)
    return doc


@router.delete("/sales/targets/{target_id}")
async def delete_target(target_id: str, user: dict = Depends(require_roles(*WRITE))):
    existing = await db.targets.find_one({"id": target_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Target not found")
    await db.targets.delete_one({"id": target_id})
    await log_activity(user, "target_deleted", "target", target_id, existing["period"])
    return {"ok": True}


# ---------------- Sales overview / conversion metrics ----------------
@router.get("/sales/overview")
async def sales_overview(user: dict = Depends(require_roles(*READ))):
    leads = await db.leads.find({}, {"_id": 0}).to_list(2000)
    umap = await user_map()

    funnel = []
    for s in STAGES:
        rows = [l for l in leads if l["stage"] == s]
        funnel.append({"stage": s, "count": len(rows), "value": round(sum(l.get("estimated_value", 0) for l in rows), 2)})

    reached = {s: sum(1 for l in leads if any(h["stage"] == s for h in l.get("stage_history", []))) for s in STAGES}
    conversion = []
    path = ["new", "contacted", "qualified", "proposal", "won"]
    for a, b in zip(path, path[1:]):
        rate = round(reached[b] / reached[a] * 100, 1) if reached[a] else 0
        conversion.append({"from": a, "to": b, "rate_pct": rate, "reached_from": reached[a], "reached_to": reached[b]})

    won = [l for l in leads if l["stage"] == "won"]
    lost = [l for l in leads if l["stage"] == "lost"]
    win_rate = round(len(won) / (len(won) + len(lost)) * 100, 1) if (won or lost) else 0
    avg_deal = round(sum(l.get("estimated_value", 0) for l in won) / len(won), 2) if won else 0
    days = []
    for l in won:
        w = won_at(l)
        if w and l.get("created_at"):
            days.append((datetime.fromisoformat(w).date() - datetime.fromisoformat(l["created_at"][:10]).date()).days)
    avg_days_to_close = round(sum(days) / len(days), 1) if days else None

    by_source = {}
    for l in leads:
        src = l.get("source", "other")
        e = by_source.setdefault(src, {"source": src, "count": 0, "value": 0})
        e["count"] += 1
        e["value"] += l.get("estimated_value", 0)

    today = _today()
    week = (datetime.now(timezone.utc).date() + timedelta(days=7)).isoformat()
    followups = {"overdue": [], "today": [], "upcoming": []}
    for l in leads:
        f = l.get("follow_up_date")
        if not f or l["stage"] in ("won", "lost"):
            continue
        entry = {"lead_id": l["id"], "lead_name": l["name"], "company": l.get("company", ""),
                 "follow_up_date": f, "owner_name": umap.get(l.get("owner_id"), ""), "stage": l["stage"]}
        if f < today:
            followups["overdue"].append(entry)
        elif f == today:
            followups["today"].append(entry)
        elif f <= week:
            followups["upcoming"].append(entry)
    for k in followups:
        followups[k].sort(key=lambda x: x["follow_up_date"])

    t = datetime.now(timezone.utc).date()
    month = t.isoformat()[:7]
    quarter = f"{t.year}-Q{(t.month - 1) // 3 + 1}"
    targets = await targets_with_actuals({"period": {"$in": [month, quarter]}})

    return {
        "funnel": funnel,
        "conversion": conversion,
        "win_rate": win_rate,
        "avg_deal_size": avg_deal,
        "avg_days_to_close": avg_days_to_close,
        "by_source": sorted(by_source.values(), key=lambda x: -x["count"]),
        "followups": followups,
        "targets": targets,
        "open_pipeline_value": round(sum(l.get("estimated_value", 0) for l in leads if l["stage"] in OPEN_STAGES), 2),
        "total_leads": len(leads),
    }
