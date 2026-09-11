import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from database import db
from models import ClientCreate, ClientUpdate, CredentialIn
from auth import require_roles, encrypt_secret, decrypt_secret, log_activity
from permissions import branch_scope

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
    if retainer is not None:
        q["retainer"] = retainer
    if region:
        q["region"] = region
    if search:
        q["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"company": {"$regex": search, "$options": "i"}},
        ]
    branches = branch_scope(user)
    if branches is not None:
        q["branch_id"] = {"$in": branches}
    clients = await db.clients.find(q, {"_id": 0, "credentials": 0}).sort("name", 1).to_list(500)
    counts = await project_counts_map()
    for c in clients:
        row = counts.get(c["id"], {})
        c["project_count"] = row.get("total", 0)
        c["active_projects"] = row.get("active", 0)
        c["health"] = compute_health(c, c["active_projects"])
    return clients


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
        {"client_id": client_id},
        {"_id": 0, "id": 1, "name": 1, "status": 1, "budget": 1, "currency": 1,
         "start_date": 1, "end_date": 1, "team_member_ids": 1, "deliverables": 1},
    ).to_list(200)
    active = sum(1 for p in projects if p["status"] in ("kickoff", "in_progress", "review"))
    c["projects"] = projects
    c["health"] = compute_health(c, active)
    return c


@router.post("/clients")
async def create_client(body: ClientCreate, user: dict = Depends(require_roles(*WRITE_ROLES))):
    now = datetime.now(timezone.utc).isoformat()
    doc = body.model_dump()
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
    updates = body.model_dump(exclude_unset=True)
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.clients.update_one({"id": client_id}, {"$set": updates})
    await log_activity(user, "client_updated", "client", client_id, updates.get("name", existing["name"]))
    return {"ok": True}


@router.delete("/clients/{client_id}")
async def delete_client(client_id: str, user: dict = Depends(require_roles("admin", "pm"))):
    existing = await db.clients.find_one({"id": client_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Client not found")
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
