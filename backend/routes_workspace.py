"""Workspace Data Manager — super_admin ONLY power tool.

Browse any collection, edit any record, HARD delete (true DB removal, unlike the
tombstone user-delete in User Management). Dependent records are detected and either
cascade-handled (delete / unset / pull) or the delete is refused with a 409 + counts.
Every action is written to activity_logs.
"""
from typing import List, Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Body, Query
from database import db
from auth import get_current_user, log_activity

router = APIRouter()

SAFE_PROJECTION = {"_id": 0, "password_hash": 0}

COLLECTIONS = {
    "clients": {"label": "Clients", "search": ["name", "company"]},
    "projects": {"label": "Projects", "search": ["name"]},
    "leads": {"label": "Leads", "search": ["name", "company"]},
    "quotes": {"label": "Quotes", "search": ["number", "title"]},
    "transactions": {"label": "Ledger Transactions", "search": ["description", "category"]},
    "expenses": {"label": "Expenses", "search": ["description", "category"]},
    "subscriptions": {"label": "Subscriptions", "search": ["name"]},
    "budgets": {"label": "Budgets", "search": ["category", "period"]},
    "campaigns": {"label": "Marketing Campaigns", "search": ["name"]},
    "ad_campaigns": {"label": "Ad Campaigns", "search": ["name", "platform"]},
    "social_posts": {"label": "Social Posts", "search": ["caption", "platform"]},
    "influencers": {"label": "Influencers", "search": ["name", "handle"]},
    "assets": {"label": "Assets", "search": ["name", "code"]},
    "partnerships": {"label": "Partnerships", "search": ["name"]},
    "branches": {"label": "Branches", "search": ["name", "city"]},
    "users": {"label": "Users", "search": ["name", "email"]},
    "activity_logs": {"label": "Activity Logs", "search": ["action", "user_name"]},
    "training_courses": {"label": "Training Courses", "search": ["title"]},
    "training_assignments": {"label": "Training Assignments", "search": []},
    "targets": {"label": "Sales Targets", "search": ["period"]},
    "lead_activities": {"label": "Lead Activities", "search": ["note"]},
}

# child collection, foreign-key field, cascade mode: delete | unset | pull(array)
DEPS = {
    "clients": [("projects", "client_id", "delete"), ("transactions", "client_id", "unset"),
                ("ad_campaigns", "client_id", "delete"), ("social_posts", "client_id", "unset"),
                ("quotes", "client_id", "unset")],
    "projects": [("transactions", "project_id", "unset"), ("expenses", "project_id", "unset")],
    "leads": [("quotes", "lead_id", "unset"), ("lead_activities", "lead_id", "delete")],
    "branches": [("clients", "branch_id", "unset"), ("leads", "branch_id", "unset"), ("users", "branch_id", "unset")],
    "users": [("projects", "team_member_ids", "pull"), ("training_assignments", "user_id", "delete"),
              ("leads", "owner_id", "unset"), ("assets", "assigned_to", "unset")],
    "campaigns": [("transactions", "campaign_id", "unset")],
    "training_courses": [("training_assignments", "course_id", "delete")],
}


async def require_super_admin(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] != "super_admin":
        raise HTTPException(status_code=403, detail="Workspace data manager is restricted to super admins")
    return user


def _spec(coll: str):
    spec = COLLECTIONS.get(coll)
    if not spec:
        raise HTTPException(status_code=404, detail="Unknown collection")
    return spec


async def _dependents(coll: str, rid: str):
    out = {}
    for child, field, mode in DEPS.get(coll, []):
        n = await db[child].count_documents({field: rid})
        if n:
            out[child] = {"count": n, "mode": mode}
    return out


async def _cascade(coll: str, rid: str):
    for child, field, mode in DEPS.get(coll, []):
        if mode == "delete":
            await db[child].delete_many({field: rid})
        elif mode == "unset":
            await db[child].update_many({field: rid}, {"$set": {field: None}})
        elif mode == "pull":
            await db[child].update_many({field: rid}, {"$pull": {field: rid}})


async def _guard_user_delete(actor: dict, rid: str):
    if rid == actor["id"]:
        raise HTTPException(status_code=400, detail="You cannot hard-delete your own account")
    target = await db.users.find_one({"id": rid})
    if target and target.get("role") == "super_admin":
        others = await db.users.count_documents(
            {"role": "super_admin", "id": {"$ne": rid}, "deleted": {"$ne": True}})
        if others == 0:
            raise HTTPException(status_code=400, detail="Cannot delete the last remaining super admin")


@router.get("/workspace/collections")
async def list_collections(user: dict = Depends(require_super_admin)):
    out = []
    for key, spec in COLLECTIONS.items():
        out.append({"key": key, "label": spec["label"], "count": await db[key].count_documents({})})
    return out


@router.get("/workspace/{coll}")
async def list_records(coll: str, search: Optional[str] = None,
                       page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
                       user: dict = Depends(require_super_admin)):
    spec = _spec(coll)
    q = {}
    if search and spec["search"]:
        q["$or"] = [{f: {"$regex": search, "$options": "i"}} for f in spec["search"]]
    total = await db[coll].count_documents(q)
    sort_field = "timestamp" if coll == "activity_logs" else "id"
    items = await db[coll].find(q, SAFE_PROJECTION).sort(sort_field, -1).skip((page - 1) * page_size).limit(page_size).to_list(page_size)
    return {"total": total, "page": page, "page_size": page_size, "items": items}


@router.get("/workspace/{coll}/{rid}")
async def get_record(coll: str, rid: str, user: dict = Depends(require_super_admin)):
    _spec(coll)
    doc = await db[coll].find_one({"id": rid}, SAFE_PROJECTION)
    if not doc:
        raise HTTPException(status_code=404, detail="Record not found")
    return doc


@router.put("/workspace/{coll}/{rid}")
async def edit_record(coll: str, rid: str, body: dict = Body(...), user: dict = Depends(require_super_admin)):
    _spec(coll)
    existing = await db[coll].find_one({"id": rid})
    if not existing:
        raise HTTPException(status_code=404, detail="Record not found")
    updates = {k: v for k, v in (body or {}).items() if k not in ("_id", "id", "password_hash")}
    if not updates:
        raise HTTPException(status_code=400, detail="No editable fields provided")
    await db[coll].update_one({"id": rid}, {"$set": updates})
    label = existing.get("name") or existing.get("title") or existing.get("number") or rid
    await log_activity(user, "workspace_edited", coll, rid, f"{label} ({len(updates)} fields)")
    return await db[coll].find_one({"id": rid}, SAFE_PROJECTION)


@router.get("/workspace/{coll}/{rid}/dependents")
async def get_dependents(coll: str, rid: str, user: dict = Depends(require_super_admin)):
    """Pre-delete check: dependent record counts for this record."""
    _spec(coll)
    if not await db[coll].find_one({"id": rid}):
        raise HTTPException(status_code=404, detail="Record not found")
    deps = await _dependents(coll, rid)
    return {"dependents": {k: v["count"] for k, v in deps.items()}}


@router.delete("/workspace/{coll}/{rid}")
async def delete_record(coll: str, rid: str, cascade: bool = False, user: dict = Depends(require_super_admin)):
    _spec(coll)
    existing = await db[coll].find_one({"id": rid})
    if not existing:
        raise HTTPException(status_code=404, detail="Record not found")
    if coll == "users":
        await _guard_user_delete(user, rid)
    deps = await _dependents(coll, rid)
    if deps and not cascade:
        raise HTTPException(status_code=409, detail={
            "message": "Record has dependent records",
            "dependents": {k: v["count"] for k, v in deps.items()},
        })
    if deps and cascade:
        await _cascade(coll, rid)
    await db[coll].delete_one({"id": rid})
    label = existing.get("name") or existing.get("title") or existing.get("number") or rid
    await log_activity(user, "workspace_deleted", coll, rid,
                       f"{label}" + (" (+cascade)" if deps and cascade else ""))
    return {"ok": True, "cascaded": bool(deps and cascade)}


class BulkDeleteBody(BaseModel):
    ids: List[str]
    cascade: bool = False


@router.post("/workspace/{coll}/bulk-delete")
async def bulk_delete(coll: str, body: BulkDeleteBody, user: dict = Depends(require_super_admin)):
    _spec(coll)
    deleted, skipped = 0, []
    for rid in body.ids[:200]:
        existing = await db[coll].find_one({"id": rid})
        if not existing:
            skipped.append({"id": rid, "reason": "not found"})
            continue
        if coll == "users":
            try:
                await _guard_user_delete(user, rid)
            except HTTPException as e:
                skipped.append({"id": rid, "reason": e.detail})
                continue
        deps = await _dependents(coll, rid)
        if deps and not body.cascade:
            skipped.append({"id": rid, "reason": f"has dependents: {', '.join(deps.keys())}"})
            continue
        if deps:
            await _cascade(coll, rid)
        await db[coll].delete_one({"id": rid})
        deleted += 1
    await log_activity(user, "workspace_bulk_deleted", coll, None,
                       f"{deleted} records deleted, {len(skipped)} skipped")
    return {"deleted": deleted, "skipped": skipped}
