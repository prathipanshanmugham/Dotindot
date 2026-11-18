import re
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from database import db
from models import ClientCreate, ClientUpdate, CredentialIn
from auth import require_roles, encrypt_secret, decrypt_secret, log_activity
from permissions import branch_scope, check_branch_write
from locations_util import valid_branch, branch_names
from revenue import client_mrr, billing_summary, is_recurring, ist_today, ACTIVE_STATUSES

router = APIRouter()

READ_ROLES = ("admin", "pm", "sales", "finance", "ads_manager", "social_manager")
WRITE_ROLES = ("admin", "pm", "sales")
REVEAL_ROLES = ("admin", "pm")


def compute_health(client_doc: dict, active_projects: int) -> str:
    if client_doc.get("status") == "churned":
        return "at_risk"
    now = datetime.now(timezone.utc)
    score = 0
    if active_projects > 0:
        score += 1
    updated = client_doc.get("updated_at") or client_doc.get("created_at")
    if updated:
        try:
            dt = datetime.fromisoformat(updated)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            if (now - dt) <= timedelta(days=45):
                score += 1
        except ValueError:
            pass
    today = now.date().isoformat()
    if any(c.get("expiry_date") and c["expiry_date"] >= today for c in client_doc.get("contracts", [])):
        score += 1
    if client_doc.get("status") != "active":
        score = min(score, 1)
    if score >= 2:
        return "healthy"
    if score == 1:
        return "watch"
    return "at_risk"


def _contact_key(name: str) -> str:
    return " ".join((name or "").lower().split())


def normalize_client(doc: dict) -> dict:
    """A client is the company. Older callers (and older records) put the person in `name` and the company in
    `company`: then the company becomes the name and the person becomes the main contact. `company` mirrors `name`."""
    name = " ".join(str(doc.get("name") or "").split())
    company = " ".join(str(doc.get("company") or "").split())
    contacts = [dict(c) for c in (doc.get("contacts") or []) if isinstance(c, dict)]
    if len(company) >= 2 and _contact_key(company) != _contact_key(name):   # a one-letter "company" is a placeholder, not a name
        person, name = name, company
        if person and not any(_contact_key(c.get("name")) == _contact_key(person) for c in contacts):
            contacts.insert(0, {"name": person, "email": "", "phone": "", "role": "Main contact"})
    doc["name"] = name[:120]
    doc["company"] = doc["name"]
    if "contacts" in doc or contacts:
        doc["contacts"] = contacts
    return doc


def main_contact(c: dict) -> dict:
    first = next((x for x in (c.get("contacts") or []) if isinstance(x, dict) and (x.get("name") or "").strip()), None)
    return first or {}


# records elsewhere keep a copy of the client's name next to client_id (invoices, tickets, leads…): kept in step on rename.
# OAuth / AI-connection collections also use the words client_id / client_name, for apps — never touched.
_NOT_CLIENT_COPIES = {"clients", "oauth_clients", "oauth_requests", "oauth_codes", "ai_connections", "ai_conn_tokens", "activity_logs", "migrations"}


async def propagate_client_name(client_id: str, name: str):
    for coll in await db.list_collection_names():
        if coll not in _NOT_CLIENT_COPIES and not coll.startswith("system."):
            await db[coll].update_many({"client_id": client_id, "client_name": {"$exists": True}}, {"$set": {"client_name": name}})


async def migrate_clients_v35():
    """Once: client = company (person → main contact), ids on old milestones/deliverables, project billing defaults."""
    if await db.migrations.find_one({"id": "clients_company_v35"}):
        return
    from revenue import infer_service
    renamed = 0
    async for c in db.clients.find({}, {"_id": 0}):
        before = c.get("name")
        doc = normalize_client({"name": c.get("name"), "company": c.get("company"), "contacts": c.get("contacts") or []})
        await db.clients.update_one({"id": c["id"]}, {"$set": doc})
        if doc["name"] != before:
            renamed += 1
            await propagate_client_name(c["id"], doc["name"])
    fixed = 0
    async for p in db.projects.find({}, {"_id": 0}):
        sets = {}
        for field in ("milestones", "deliverables"):
            items = p.get(field) or []
            if any(not it.get("id") for it in items):
                sets[field] = [{**it, "id": it.get("id") or str(uuid.uuid4())} for it in items]
        if not p.get("billing_type"):
            sets.update(billing_type="one_time", recurring_amount=0, billing_cycle="monthly")
        if (p.get("name") or "") != (p.get("name") or "").strip():
            sets["name"] = p["name"].strip()
        if not p.get("service") and p.get("kind") != "internal":
            sets["service"] = infer_service(p.get("name", ""), p.get("description", ""))
        if sets:
            fixed += 1
            await db.projects.update_one({"id": p["id"]}, {"$set": sets})
    await db.migrations.insert_one({"id": "clients_company_v35", "at": datetime.now(timezone.utc).isoformat(), "renamed": renamed, "projects": fixed})


async def project_counts_map():
    pipeline = [
        {"$group": {
            "_id": "$client_id",
            "total": {"$sum": 1},
            "active": {"$sum": {"$cond": [{"$in": ["$status", ["kickoff", "in_progress", "review"]]}, 1, 0]}},
        }}
    ]
    rows = await db.projects.aggregate(pipeline).to_list(1000)
    return {r["_id"]: r for r in rows}


@router.get("/clients")
async def list_clients(
    industry: Optional[str] = None,
    service_type: Optional[str] = None,
    size: Optional[str] = None,
    status: Optional[str] = None,
    retainer: Optional[bool] = None,
    region: Optional[str] = None,
    search: Optional[str] = None,
    branch: Optional[str] = None,
    billing: Optional[str] = None,
    user: dict = Depends(require_roles(*READ_ROLES)),
):
    q = {}
    if industry:
        q["industry"] = industry
    if service_type:
        q["service_type"] = service_type
    if size:
        q["size"] = size
    if status:
        q["status"] = status
    if region:
        q["region"] = region
    if search:
        rx = {"$regex": re.escape(search), "$options": "i"}
        q["$or"] = [{"name": rx}, {"company": rx}, {"contacts.name": rx}, {"contacts.email": rx}, {"contacts.phone": rx}, {"city": rx}]
    branches = branch_scope(user)
    if branch and (branches is None or branch in branches):
        q["branch_id"] = branch
    elif branches is not None:
        q["branch_id"] = {"$in": branches}
    clients = await db.clients.find(q, {"_id": 0, "credentials": 0}).sort("name", 1).to_list(1000)
    projects = await db.projects.find({"client_id": {"$in": [c["id"] for c in clients]}, "kind": {"$ne": "internal"}},
                                      {"_id": 0, "client_id": 1, "status": 1, "budget": 1, "billing_type": 1, "recurring_amount": 1,
                                       "billing_cycle": 1, "start_date": 1, "end_date": 1, "kind": 1}).to_list(5000)
    by_client: dict = {}
    for p in projects:
        by_client.setdefault(p["client_id"], []).append(p)
    today = ist_today()
    bnames = await branch_names()
    out = []
    for c in clients:
        ps = by_client.get(c["id"], [])
        c["branch_name"] = bnames.get(c.get("branch_id"), "")
        c["project_count"] = len(ps)
        c["active_projects"] = sum(1 for p in ps if p.get("status") in ACTIVE_STATUSES)
        c["health"] = compute_health(c, c["active_projects"])
        c["mrr"] = client_mrr(ps, today)
        c["arr"] = round(c["mrr"] * 12, 2)
        c["recurring"] = c["mrr"] > 0
        c["retainer"] = c["recurring"]
        c["one_time_value"] = round(sum(float(p.get("budget") or 0) for p in ps if not is_recurring(p)), 2)
        mc = main_contact(c)
        c["contact_name"], c["contact_phone"], c["contact_email"] = mc.get("name", ""), mc.get("phone", ""), mc.get("email", "")
        if billing == "recurring" and not c["recurring"]:
            continue
        if billing == "one_time" and c["recurring"]:
            continue
        if retainer is not None and c["recurring"] != retainer:
            continue
        out.append(c)
    return out


@router.get("/clients/{client_id}")
async def get_client(client_id: str, user: dict = Depends(require_roles(*READ_ROLES))):
    c = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Client not found")
    branches = branch_scope(user)
    if branches is not None and c.get("branch_id") not in branches:
        raise HTTPException(status_code=403, detail="This client belongs to a branch outside your access")
    # mask credentials — never return secrets here
    c["credentials"] = [
        {"id": cr["id"], "label": cr["label"], "username": cr["username"]}
        for cr in c.get("credentials", [])
    ]
    projects = await db.projects.find(
        {"client_id": client_id, "kind": {"$ne": "internal"}},
        {"_id": 0, "id": 1, "name": 1, "status": 1, "budget": 1, "currency": 1, "kind": 1, "service": 1,
         "start_date": 1, "end_date": 1, "team_member_ids": 1, "deliverables": 1,
         "billing_type": 1, "recurring_amount": 1, "billing_cycle": 1},
    ).sort("created_at", -1).to_list(500)
    today = ist_today()
    for p in projects:
        p.update(billing_summary(p, today))
    active = sum(1 for p in projects if p["status"] in ACTIVE_STATUSES)
    c["projects"] = projects
    c["health"] = compute_health(c, active)
    c["branch_name"] = (await branch_names()).get(c.get("branch_id"), "")
    mc = main_contact(c)
    c["contact_name"], c["contact_phone"], c["contact_email"] = mc.get("name", ""), mc.get("phone", ""), mc.get("email", "")
    mrr = client_mrr(projects, today)
    docs = await db.billing_docs.find({"client_id": client_id, "type": "invoice", "status": {"$nin": ["draft", "cancelled"]}},
                                      {"_id": 0, "inr_total": 1, "total": 1, "fx_rate": 1, "payments": 1, "date": 1}).to_list(5000)
    billed = sum(float(d.get("inr_total") or d.get("total") or 0) for d in docs)
    paid = sum(sum(float(x.get("amount") or 0) for x in d.get("payments") or []) * float(d.get("fx_rate") or 1) for d in docs)
    since = min((p.get("start_date") for p in projects if is_recurring(p) and p.get("start_date")), default=None)
    c["revenue"] = {"mrr": mrr, "arr": round(mrr * 12, 2), "recurring_projects": sum(1 for p in projects if p.get("live")),
                    "recurring_since": since,
                    "one_time_value": round(sum(float(p.get("budget") or 0) for p in projects if not is_recurring(p)), 2),
                    "active_one_time_value": round(sum(float(p.get("budget") or 0) for p in projects if not is_recurring(p) and p["status"] in ACTIVE_STATUSES), 2),
                    "billed": round(billed, 2), "paid": round(paid, 2), "outstanding": round(max(billed - paid, 0), 2),
                    "invoices": len(docs), "last_invoice": max((d.get("date") for d in docs if d.get("date")), default=None)}
    c["recurring"] = c["retainer"] = mrr > 0
    return c


@router.post("/clients")
async def create_client(body: ClientCreate, user: dict = Depends(require_roles(*WRITE_ROLES))):
    now = datetime.now(timezone.utc).isoformat()
    doc = normalize_client(body.model_dump())
    if len(doc["name"]) < 2:
        raise HTTPException(status_code=400, detail="Add the company name")
    doc["branch_id"] = await valid_branch(doc.get("branch_id"))
    if not doc.get("branch_id"):
        scope = branch_scope(user)
        if scope:
            doc["branch_id"] = scope[0]
    check_branch_write(user, doc.get("branch_id"))
    doc["credentials"] = [
        {"id": str(uuid.uuid4()), "label": cr["label"], "username": cr["username"],
         "secret_encrypted": encrypt_secret(cr.get("secret") or "")}
        for cr in doc.get("credentials", [])
    ]
    doc.update({"id": str(uuid.uuid4()), "created_at": now, "updated_at": now, "created_by": user["id"]})
    await db.clients.insert_one(doc)
    await log_activity(user, "client_created", "client", doc["id"], doc["name"])
    doc.pop("_id", None)
    doc.pop("credentials", None)
    return doc


@router.put("/clients/{client_id}")
async def update_client(client_id: str, body: ClientUpdate, user: dict = Depends(require_roles(*WRITE_ROLES))):
    existing = await db.clients.find_one({"id": client_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Client not found")
    check_branch_write(user, existing.get("branch_id"), existing.get("created_by"))
    updates = body.model_dump(exclude_unset=True)
    updates.pop("retainer", None)   # worked out from recurring projects
    if "name" in updates or "company" in updates:
        norm = normalize_client({"name": updates.get("name", existing.get("name")), "company": updates.get("company") or "",
                                 "contacts": updates.get("contacts", existing.get("contacts") or [])})
        if len(norm["name"]) < 2:
            raise HTTPException(status_code=400, detail="Add the company name")
        updates.update(norm)
    moved = False
    if "branch_id" in updates:
        updates["branch_id"] = await valid_branch(updates["branch_id"])
        moved = (updates["branch_id"] or None) != (existing.get("branch_id") or None)
        if moved:
            check_branch_write(user, updates["branch_id"])
            if updates["branch_id"] is None and branch_scope(user):
                raise HTTPException(status_code=403, detail="Pick one of your locations for this client")
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.clients.update_one({"id": client_id}, {"$set": updates})
    if moved:   # projects that followed the client move with it; ones moved to another location stay put
        await db.projects.update_many({"client_id": client_id, "kind": {"$ne": "internal"},
                                       "$or": [{"branch_id": existing.get("branch_id")}, {"branch_id": None}, {"branch_id": ""}, {"branch_id": {"$exists": False}}]},
                                      {"$set": {"branch_id": updates["branch_id"]}})
    if updates.get("name") and updates["name"] != existing.get("name"):
        await propagate_client_name(client_id, updates["name"])
    await log_activity(user, "client_updated", "client", client_id, updates.get("name", existing["name"]))
    return {"ok": True}


@router.delete("/clients/{client_id}")
async def delete_client(client_id: str, user: dict = Depends(require_roles("admin", "pm"))):
    existing = await db.clients.find_one({"id": client_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Client not found")
    check_branch_write(user, existing.get("branch_id"), existing.get("created_by"))
    await db.clients.delete_one({"id": client_id})
    await db.projects.delete_many({"client_id": client_id})
    await log_activity(user, "client_deleted", "client", client_id, existing["name"])
    return {"ok": True}


@router.post("/clients/{client_id}/credentials")
async def add_credential(client_id: str, body: CredentialIn, user: dict = Depends(require_roles(*REVEAL_ROLES))):
    existing = await db.clients.find_one({"id": client_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Client not found")
    cred = {"id": str(uuid.uuid4()), "label": body.label, "username": body.username,
            "secret_encrypted": encrypt_secret(body.secret or "")}
    await db.clients.update_one({"id": client_id}, {"$push": {"credentials": cred}})
    await log_activity(user, "credential_added", "client", client_id, existing["name"])
    return {"id": cred["id"], "label": cred["label"], "username": cred["username"]}


@router.delete("/clients/{client_id}/credentials/{cred_id}")
async def delete_credential(client_id: str, cred_id: str, user: dict = Depends(require_roles(*REVEAL_ROLES))):
    existing = await db.clients.find_one({"id": client_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Client not found")
    await db.clients.update_one({"id": client_id}, {"$pull": {"credentials": {"id": cred_id}}})
    await log_activity(user, "credential_deleted", "client", client_id, existing["name"])
    return {"ok": True}


@router.get("/clients/{client_id}/credentials/{cred_id}/reveal")
async def reveal_credential(client_id: str, cred_id: str, user: dict = Depends(require_roles(*REVEAL_ROLES))):
    c = await db.clients.find_one({"id": client_id})
    if not c:
        raise HTTPException(status_code=404, detail="Client not found")
    cred = next((cr for cr in c.get("credentials", []) if cr["id"] == cred_id), None)
    if not cred:
        raise HTTPException(status_code=404, detail="Credential not found")
    await log_activity(user, "credential_revealed", "client", client_id, c["name"])
    return {"id": cred["id"], "label": cred["label"], "username": cred["username"],
            "secret": decrypt_secret(cred["secret_encrypted"])}
