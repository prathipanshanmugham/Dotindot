import re
import uuid
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from database import db
from models import ProjectCreate, ProjectUpdate, ToggleRequest
from auth import get_current_user, require_roles, log_activity
from permissions import scoped_client_ids, check_branch_write, branch_scope

router = APIRouter()

WRITE_ROLES = ("admin", "pm", "sales")


KINDS = ("client", "internal")
INTERNAL = "Internal"


async def client_name_map():
    rows = await db.clients.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(1000)
    return {r["id"]: r["name"] for r in rows}


def is_internal(p: dict) -> bool:
    return p.get("kind") == "internal"


async def project_scope(user: dict):
    """Mongo filter for the projects this user's branches cover, or None when unrestricted.
    Client projects follow their client's branch; internal projects carry their own."""
    ids = await scoped_client_ids(user)
    if ids is None:
        return None
    return {"$or": [{"client_id": {"$in": ids}}, {"kind": "internal", "branch_id": {"$in": branch_scope(user) or []}}]}


async def project_branch(p: dict):
    if is_internal(p):
        return p.get("branch_id")
    c = await db.clients.find_one({"id": p.get("client_id")}, {"_id": 0, "branch_id": 1})
    return (c or {}).get("branch_id")


async def _internal_branch(user: dict, branch_id):
    """The branch an internal project belongs to: the one picked, else the user's own when they work in one branch."""
    if branch_id:
        if not await db.branches.find_one({"id": branch_id}, {"_id": 0, "id": 1}):
            raise HTTPException(status_code=404, detail="Branch not found")
        return branch_id
    scope = branch_scope(user)
    return scope[0] if scope else None


@router.get("/projects")
async def list_projects(
    status: Optional[str] = None,
    client_id: Optional[str] = None,
    team_member: Optional[str] = None,
    search: Optional[str] = None,
    branch: Optional[str] = None,
    kind: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    q = {}
    if kind in KINDS:
        q["kind"] = "internal" if kind == "internal" else {"$ne": "internal"}
    if status:
        q["status"] = status
    if client_id:
        q["client_id"] = client_id
    if team_member:
        q["team_member_ids"] = team_member
    if search:
        q["name"] = {"$regex": re.escape(search), "$options": "i"}
    if user["role"] == "employee":
        q["team_member_ids"] = user["id"]
    ands = [q]
    scope = await project_scope(user)
    if scope:
        ands.append(scope)
    if branch and not client_id:
        bset = [c["id"] for c in await db.clients.find({"branch_id": branch}, {"_id": 0, "id": 1}).to_list(2000)]
        ands.append({"$or": [{"client_id": {"$in": bset}}, {"kind": "internal", "branch_id": branch}]})
    projects = await db.projects.find({"$and": ands} if len(ands) > 1 else q, {"_id": 0}).sort("created_at", -1).to_list(500)
    names = await client_name_map()
    for p in projects:
        p["kind"] = p.get("kind") or "client"
        p["client_name"] = INTERNAL if is_internal(p) else names.get(p.get("client_id"), "Unknown")
    return projects


@router.get("/projects/{project_id}")
async def get_project(project_id: str, user: dict = Depends(get_current_user)):
    p = await db.projects.find_one({"id": project_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    if user["role"] == "employee" and user["id"] not in p.get("team_member_ids", []):
        raise HTTPException(status_code=403, detail="You are not assigned to this project")
    scope = await project_scope(user)
    if scope and user["id"] not in p.get("team_member_ids", []) and not await db.projects.find_one({"$and": [{"id": project_id}, scope]}, {"_id": 0, "id": 1}):
        raise HTTPException(status_code=403, detail="This project belongs to a branch outside your access")
    p["kind"] = p.get("kind") or "client"
    if is_internal(p):
        p["client"] = None
        p["client_name"] = INTERNAL
        b = await db.branches.find_one({"id": p.get("branch_id")}, {"_id": 0, "name": 1}) if p.get("branch_id") else None
        p["branch_name"] = (b or {}).get("name", "")
    else:
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
    if body.kind not in KINDS:
        raise HTTPException(status_code=400, detail="A project is either for a client or internal")
    if not (body.name or "").strip():
        raise HTTPException(status_code=400, detail="Give the project a name")
    doc = body.model_dump()
    doc["name"] = doc["name"].strip()
    if body.kind == "internal":
        doc["client_id"] = None
        doc["branch_id"] = await _internal_branch(user, body.branch_id)
        check_branch_write(user, doc["branch_id"])
        client = None
        if not doc.get("location") and doc["branch_id"]:
            b = await db.branches.find_one({"id": doc["branch_id"]}, {"_id": 0, "city": 1, "state": 1})
            doc["location"] = ", ".join(x for x in [(b or {}).get("city"), (b or {}).get("state")] if x)
    else:
        client = await db.clients.find_one({"id": body.client_id}) if body.client_id else None
        if not client:
            raise HTTPException(status_code=404 if body.client_id else 400, detail="Client not found" if body.client_id else "Pick the client, or mark the project internal")
        check_branch_write(user, client.get("branch_id"))
        doc["branch_id"] = None
        if not doc.get("location"):
            doc["location"] = ", ".join(x for x in [client.get("city"), client.get("region")] if x)
    now = datetime.now(timezone.utc).isoformat()
    doc.update({"id": str(uuid.uuid4()), "created_at": now, "updated_at": now, "created_by": user["id"]})
    await db.projects.insert_one(doc)
    await log_activity(user, "project_created", "project", doc["id"], doc["name"])
    doc.pop("_id", None)
    doc["client_name"] = client["name"] if client else INTERNAL
    return doc


@router.put("/projects/{project_id}")
async def update_project(project_id: str, body: ProjectUpdate, user: dict = Depends(require_roles(*WRITE_ROLES))):
    existing = await db.projects.find_one({"id": project_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Project not found")
    check_branch_write(user, await project_branch(existing), existing.get("created_by"))
    updates = body.model_dump(exclude_unset=True)
    if "name" in updates and not (updates["name"] or "").strip():
        raise HTTPException(status_code=400, detail="Project name can't be empty")
    kind = updates.pop("kind", None) or existing.get("kind") or "client"
    if kind not in KINDS:
        raise HTTPException(status_code=400, detail="A project is either for a client or internal")
    if kind == "internal":
        updates["kind"], updates["client_id"] = "internal", None
        if "branch_id" in updates or not is_internal(existing):
            updates["branch_id"] = await _internal_branch(user, updates.get("branch_id"))
            check_branch_write(user, updates["branch_id"])
    else:
        updates["kind"] = "client"
        updates.pop("branch_id", None)
        new_id = updates.get("client_id") or (None if is_internal(existing) else existing.get("client_id"))
        if not new_id:
            raise HTTPException(status_code=400, detail="Pick the client, or mark the project internal")
        if new_id != existing.get("client_id"):
            new_client = await db.clients.find_one({"id": new_id}, {"_id": 0})
            if not new_client:
                raise HTTPException(status_code=404, detail="Client not found")
            check_branch_write(user, new_client.get("branch_id"))
            updates["client_id"], updates["branch_id"] = new_id, None
        else:
            updates.pop("client_id", None)
    if updates.get("start_date") and updates.get("end_date") and updates["end_date"] < updates["start_date"]:
        raise HTTPException(status_code=400, detail="End date must be after the start date")
    restructured = bool({"milestones", "deliverables", "team_member_ids", "client_id"} & set(updates)) or kind != (existing.get("kind") or "client")
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.projects.update_one({"id": project_id}, {"$set": updates})
    await log_activity(user, "project_restructured" if restructured else "project_updated", "project", project_id,
                       updates.get("name", existing["name"]))
    return {"ok": True}


@router.delete("/projects/{project_id}")
async def delete_project(project_id: str, user: dict = Depends(require_roles("admin", "pm"))):
    existing = await db.projects.find_one({"id": project_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Project not found")
    check_branch_write(user, await project_branch(existing), existing.get("created_by"))
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
