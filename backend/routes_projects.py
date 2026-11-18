import math
import re
import uuid
from datetime import date, datetime, timezone
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from database import db
from models import ProjectCreate, ProjectUpdate, ToggleRequest
from auth import get_current_user, require_roles, log_activity
from permissions import scoped_client_ids, check_branch_write, branch_scope
from locations_util import valid_branch, branch_names, client_branch_map
from revenue import BILLING_TYPES, CYCLES, SERVICES, billing_summary, infer_service, ist_today

router = APIRouter()

WRITE_ROLES = ("super_admin", "admin", "pm", "sales")


KINDS = ("client", "internal")
INTERNAL = "Internal"


async def client_name_map():
    rows = await db.clients.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(1000)
    return {r["id"]: r["name"] for r in rows}


def is_internal(p: dict) -> bool:
    return p.get("kind") == "internal"


def _money(v, what: str) -> float:
    try:
        x = float(v or 0)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail=f"{what} must be a number")
    if not math.isfinite(x) or x < 0 or x > 1e10:
        raise HTTPException(status_code=400, detail=f"{what} must be zero or more")
    return round(x, 2)


def _day(v, what: str):
    if v in (None, ""):
        return None
    try:
        return date.fromisoformat(str(v)[:10]).isoformat()
    except ValueError:
        raise HTTPException(status_code=400, detail=f"{what} must look like 2026-11-30")


def clean_billing(doc: dict, existing: dict = None) -> dict:
    """Validate money, dates and billing for a new project (doc) or an update (doc = changed fields only)."""
    existing = existing or {}
    merged = {**existing, **doc}
    for k, what in (("budget", "Project value"), ("cost_allocation", "Internal cost"), ("recurring_amount", "Recurring amount")):
        if k in doc:
            doc[k] = _money(doc[k], what)
    for k, what in (("start_date", "Start date"), ("end_date", "End date")):
        if k in doc:
            doc[k] = _day(doc[k], what)
    merged = {**existing, **doc}
    if merged.get("start_date") and merged.get("end_date") and merged["end_date"] < merged["start_date"]:
        raise HTTPException(status_code=400, detail="End date must be after the start date")
    if "service" in doc:
        if doc["service"] and doc["service"] not in SERVICES:
            raise HTTPException(status_code=400, detail="Unknown service")
        if not doc["service"] and merged.get("kind") != "internal":
            doc["service"] = infer_service(merged.get("name", ""), merged.get("description", ""))
    bt = merged.get("billing_type") or "one_time"
    if merged.get("kind") == "internal":
        if "billing_type" in doc or existing.get("billing_type") == "recurring":
            doc.update(billing_type="one_time", recurring_amount=0)
        return doc
    if bt not in BILLING_TYPES:
        raise HTTPException(status_code=400, detail="Billing is one_time or recurring")
    if bt == "recurring":
        if (merged.get("billing_cycle") or "monthly") not in CYCLES:
            raise HTTPException(status_code=400, detail="Billing cycle is monthly, quarterly, half_yearly or yearly")
        if not float(merged.get("recurring_amount") or 0) > 0:
            raise HTTPException(status_code=400, detail="Add how much the client pays each cycle")
        if not merged.get("start_date"):
            raise HTTPException(status_code=400, detail="Add the date billing starts")
        doc.setdefault("billing_cycle", merged.get("billing_cycle") or "monthly")
        # finishing a recurring project stops its billing
        if doc.get("status") == "completed" and not merged.get("end_date"):
            doc["end_date"] = max(ist_today().isoformat(), merged["start_date"])
    elif "billing_type" in doc:
        doc["recurring_amount"] = 0
    return doc


async def project_scope(user: dict):
    """Mongo filter for the projects this user's locations cover, or None when unrestricted:
    projects of their clients, and projects run from their locations."""
    ids = await scoped_client_ids(user)
    if ids is None:
        return None
    return {"$or": [{"client_id": {"$in": ids}}, {"branch_id": {"$in": branch_scope(user) or []}}]}


async def project_branch(p: dict):
    """A project's location: its own, else (older client projects) its client's."""
    if p.get("branch_id") or is_internal(p):
        return p.get("branch_id")
    c = await db.clients.find_one({"id": p.get("client_id")}, {"_id": 0, "branch_id": 1})
    return (c or {}).get("branch_id")


async def _client_location(user: dict, picked, client: dict):
    """Where a client project runs: the location picked, else the client's. Must be inside the person's access."""
    if picked:
        b = await valid_branch(picked)
        check_branch_write(user, b)
        return b
    return client.get("branch_id") or None


async def _with_location(rows: list):
    names = await branch_names()
    cb = None
    for p in rows:
        b = p.get("branch_id")
        if not b and not is_internal(p):
            if cb is None:
                cb = await client_branch_map()
            b = cb.get(p.get("client_id"))
        p["branch_id"] = b or None
        p["branch_name"] = names.get(b, "") if b else ""
    return rows


async def _internal_branch(user: dict, branch_id):
    """The branch an internal project belongs to: the one picked, else the user's own when they work in one branch."""
    if branch_id:
        if not await db.branches.find_one({"id": branch_id}, {"_id": 0, "id": 1}):
            raise HTTPException(status_code=404, detail="Branch not found")
        return branch_id
    scope = branch_scope(user)
    return scope[0] if scope else None


async def _set_location_text(doc: dict):
    """Keep the old free-text `location` in step with the chosen location (exports, the AI and older screens read it)."""
    b = await db.branches.find_one({"id": doc.get("branch_id")}, {"_id": 0, "name": 1, "city": 1}) if doc.get("branch_id") else None
    if b:
        doc["location"] = b.get("city") or b.get("name") or ""


@router.get("/projects")
async def list_projects(
    status: Optional[str] = None,
    client_id: Optional[str] = None,
    team_member: Optional[str] = None,
    search: Optional[str] = None,
    branch: Optional[str] = None,
    kind: Optional[str] = None,
    billing_type: Optional[str] = None,
    service: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    q = {}
    if billing_type == "recurring":
        q["billing_type"] = "recurring"
    elif billing_type == "one_time":
        q["billing_type"] = {"$ne": "recurring"}
    if service in SERVICES:
        q["service"] = service
    if kind in KINDS:
        q["kind"] = "internal" if kind == "internal" else {"$ne": "internal"}
    if status:
        q["status"] = status
    if client_id:
        q["client_id"] = client_id
    if team_member:
        q["team_member_ids"] = team_member
    if search:
        rx = {"$regex": re.escape(search), "$options": "i"}
        hit = [c["id"] for c in await db.clients.find({"name": rx}, {"_id": 0, "id": 1}).to_list(500)]
        q["$or"] = [{"name": rx}, {"client_id": {"$in": hit}}]
    if user["role"] == "employee":
        q["team_member_ids"] = user["id"]
    ands = [q]
    scope = await project_scope(user)
    if scope:
        ands.append(scope)
    if branch and branch != "all" and not client_id:
        if branch == "none":
            ands.append({"$or": [{"branch_id": None}, {"branch_id": ""}, {"branch_id": {"$exists": False}}]})
        else:
            bset = [c["id"] for c in await db.clients.find({"branch_id": branch}, {"_id": 0, "id": 1}).to_list(2000)]
            ands.append({"$or": [{"branch_id": branch}, {"branch_id": {"$in": [None, ""]}, "kind": {"$ne": "internal"}, "client_id": {"$in": bset}}]})
    projects = await db.projects.find({"$and": ands} if len(ands) > 1 else q, {"_id": 0}).sort("created_at", -1).to_list(500)
    names = await client_name_map()
    today = ist_today()
    for p in projects:
        p["kind"] = p.get("kind") or "client"
        p["client_name"] = INTERNAL if is_internal(p) else names.get(p.get("client_id"), "Unknown")
        p.update(billing_summary(p, today))
    return await _with_location(projects)


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
    else:
        client = await db.clients.find_one({"id": p["client_id"]}, {"_id": 0, "id": 1, "name": 1, "city": 1, "contacts": 1, "branch_id": 1})
        p["client"] = client
        p["client_name"] = client["name"] if client else "Unknown"
    await _with_location([p])
    p.update(billing_summary(p))
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
    doc["name"] = doc["name"].strip()[:160]
    for it in doc.get("milestones") or []:
        it["title"] = (it.get("title") or "").strip()[:200]
    for it in doc.get("deliverables") or []:
        it["item"] = (it.get("item") or "").strip()[:200]
    doc["milestones"] = [m for m in doc.get("milestones") or [] if m["title"]]
    doc["deliverables"] = [d for d in doc.get("deliverables") or [] if d["item"]]
    if body.kind == "internal":
        doc["client_id"] = None
        doc["branch_id"] = await _internal_branch(user, body.branch_id)
        check_branch_write(user, doc["branch_id"])
        client = None
    else:
        client = await db.clients.find_one({"id": body.client_id}) if body.client_id else None
        if not client:
            raise HTTPException(status_code=404 if body.client_id else 400, detail="Client not found" if body.client_id else "Pick the client, or mark the project internal")
        check_branch_write(user, client.get("branch_id"))
        doc["branch_id"] = await _client_location(user, body.branch_id, client)
    await _set_location_text(doc)
    clean_billing(doc)
    now = datetime.now(timezone.utc).isoformat()
    doc.update({"id": str(uuid.uuid4()), "created_at": now, "updated_at": now, "created_by": user["id"]})
    await db.projects.insert_one(doc)
    await log_activity(user, "project_created", "project", doc["id"], doc["name"])
    doc.pop("_id", None)
    doc["client_name"] = client["name"] if client else INTERNAL
    doc.update(billing_summary(doc))
    await _with_location([doc])
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
        picked = updates.pop("branch_id", "__keep")
        new_id = updates.get("client_id") or (None if is_internal(existing) else existing.get("client_id"))
        if not new_id:
            raise HTTPException(status_code=400, detail="Pick the client, or mark the project internal")
        if new_id != existing.get("client_id"):
            new_client = await db.clients.find_one({"id": new_id}, {"_id": 0})
            if not new_client:
                raise HTTPException(status_code=404, detail="Client not found")
            check_branch_write(user, new_client.get("branch_id"))
            updates["client_id"] = new_id
            updates["branch_id"] = await _client_location(user, None if picked == "__keep" else picked, new_client)
        else:
            updates.pop("client_id", None)
            if picked != "__keep" and (picked or None) != (existing.get("branch_id") or None):
                client = await db.clients.find_one({"id": new_id}, {"_id": 0, "branch_id": 1}) or {}
                updates["branch_id"] = await _client_location(user, picked, client)
    if "name" in updates:
        updates["name"] = updates["name"].strip()[:160]
    for field, key in (("milestones", "title"), ("deliverables", "item")):
        if field in updates:
            updates[field] = [{**it, key: (it.get(key) or "").strip()[:200]} for it in updates[field] or [] if (it.get(key) or "").strip()]
    clean_billing(updates, {**existing, "kind": kind})
    if "branch_id" in updates:
        await _set_location_text(updates)
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
        if item.get("id") == body.item_id:
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
