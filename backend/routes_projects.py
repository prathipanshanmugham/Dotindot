import uuid
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from database import db
from models import ProjectCreate, ProjectUpdate, ToggleRequest
from auth import get_current_user, require_roles, log_activity
from permissions import scoped_client_ids

router = APIRouter()

WRITE_ROLES = ("admin", "pm", "sales")


async def client_name_map():
    rows = await db.clients.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(1000)
    return {r["id"]: r["name"] for r in rows}


@router.get("/projects")
async def list_projects(
    status: Optional[str] = None,
    client_id: Optional[str] = None,
    team_member: Optional[str] = None,
    search: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    q = {}
    if status:
        q["status"] = status
    if client_id:
        q["client_id"] = client_id
    if team_member:
        q["team_member_ids"] = team_member
    if search:
        q["name"] = {"$regex": search, "$options": "i"}
    if user["role"] == "employee":
        q["team_member_ids"] = user["id"]
    ids = await scoped_client_ids(user)
    if ids is not None:
        q["client_id"] = {"$in": ids} if not client_id else client_id
    projects = await db.projects.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    names = await client_name_map()
    for p in projects:
        p["client_name"] = names.get(p["client_id"], "Unknown")
    return projects


@router.get("/projects/{project_id}")
async def get_project(project_id: str, user: dict = Depends(get_current_user)):
    p = await db.projects.find_one({"id": project_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    if user["role"] == "employee" and user["id"] not in p.get("team_member_ids", []):
        raise HTTPException(status_code=403, detail="You are not assigned to this project")
    client = await db.clients.find_one({"id": p["client_id"]}, {"_id": 0, "id": 1, "name": 1, "company": 1})
    p["client"] = client
    p["client_name"] = client["name"] if client else "Unknown"
    team = await db.users.find(
        {"id": {"$in": p.get("team_member_ids", [])}},
        {"_id": 0, "id": 1, "name": 1, "email": 1, "role": 1},
    ).to_list(100)
    p["team"] = team
    return p


@router.post("/projects")
async def create_project(body: ProjectCreate, user: dict = Depends(require_roles(*WRITE_ROLES))):
    client = await db.clients.find_one({"id": body.client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    now = datetime.now(timezone.utc).isoformat()
    doc = body.model_dump()
    if not doc.get("location"):
        doc["location"] = ", ".join(x for x in [client.get("city"), client.get("region")] if x)
    doc.update({"id": str(uuid.uuid4()), "created_at": now, "updated_at": now, "created_by": user["id"]})
    await db.projects.insert_one(doc)
    await log_activity(user, "project_created", "project", doc["id"], doc["name"])
    doc.pop("_id", None)
    doc["client_name"] = client["name"]
    return doc


@router.put("/projects/{project_id}")
async def update_project(project_id: str, body: ProjectUpdate, user: dict = Depends(require_roles(*WRITE_ROLES))):
    existing = await db.projects.find_one({"id": project_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Project not found")
    updates = body.model_dump(exclude_unset=True)
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.projects.update_one({"id": project_id}, {"$set": updates})
    await log_activity(user, "project_updated", "project", project_id, updates.get("name", existing["name"]))
    return {"ok": True}


@router.delete("/projects/{project_id}")
async def delete_project(project_id: str, user: dict = Depends(require_roles("admin", "pm"))):
    existing = await db.projects.find_one({"id": project_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Project not found")
    await db.projects.delete_one({"id": project_id})
    await log_activity(user, "project_deleted", "project", project_id, existing["name"])
    return {"ok": True}


@router.patch("/projects/{project_id}/toggle")
async def toggle_item(project_id: str, body: ToggleRequest, user: dict = Depends(get_current_user)):
    p = await db.projects.find_one({"id": project_id})
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    if user["role"] not in WRITE_ROLES and user["id"] not in p.get("team_member_ids", []):
        raise HTTPException(status_code=403, detail="Insufficient permissions for this action")
    field = "milestones" if body.kind == "milestone" else "deliverables"
    items = p.get(field, [])
    found = False
    for item in items:
        if item["id"] == body.item_id:
            item["done"] = not item.get("done", False)
            found = True
            break
    if not found:
        raise HTTPException(status_code=404, detail="Item not found")
    await db.projects.update_one(
        {"id": project_id},
        {"$set": {field: items, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"ok": True, field: items}
