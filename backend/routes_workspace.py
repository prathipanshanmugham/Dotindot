"""Workspace Data Manager — super_admin ONLY power tool.

Browse any collection, edit any record, HARD delete (true DB removal, unlike the
tombstone user-delete in User Management). Dependent records are detected and either
cascade-handled (delete / unset / pull) or the delete is refused with a 409 + counts.
Every action is written to activity_logs.
"""
import uuid
from datetime import datetime, timezone, timedelta
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
    "password_entries": {"label": "Password Entries", "search": ["name", "username"]},
    "ai_agents": {"label": "AI Agents", "search": ["name", "platform"]},
    "ai_agent_usage": {"label": "AI Agent Usage", "search": ["task", "user_name"]},
    "org_nodes": {"label": "Org Structure", "search": ["title"]},
    "api_accounts": {"label": "API Accounts", "search": ["name", "provider"]},
    "api_credit_txns": {"label": "API Credit Entries", "search": ["note", "kind"]},
    "daily_reports": {"label": "Daily Reports & Attendance", "search": ["user_name", "date"]},
    "portal_users": {"label": "Client Portal Logins", "search": ["name", "email"]},
}

# child collection, foreign-key field, cascade mode: delete | unset | pull(array)
DEPS = {
    "clients": [("projects", "client_id", "delete"), ("transactions", "client_id", "unset"), ("portal_users", "client_id", "delete"),
                ("api_credit_txns", "client_id", "unset"),
                ("ad_campaigns", "client_id", "delete"), ("social_posts", "client_id", "unset"),
                ("quotes", "client_id", "unset")],
    "projects": [("transactions", "project_id", "unset"), ("expenses", "project_id", "unset"), ("api_credit_txns", "project_id", "unset")],
    "leads": [("quotes", "lead_id", "unset"), ("lead_activities", "lead_id", "delete")],
    "branches": [("clients", "branch_id", "unset"), ("leads", "branch_id", "unset"), ("users", "branch_id", "unset")],
    "users": [("projects", "team_member_ids", "pull"), ("training_assignments", "user_id", "delete"),
              ("leads", "owner_id", "unset"), ("assets", "assigned_to", "unset"), ("password_entries", "owner_id", "unset"),
              ("clients", "account_manager_id", "unset"), ("branches", "manager_id", "unset"), ("targets", "user_id", "delete"),
              ("ai_agents", "assignee_ids", "pull"), ("ai_agents", "owner_id", "unset"), ("org_nodes", "person_ids", "pull"),
              ("daily_reports", "user_id", "delete"), ("api_accounts", "owner_id", "unset")],
    "campaigns": [("transactions", "campaign_id", "unset")],
    "subscriptions": [("transactions", "subscription_id", "unset")],
    "ad_campaigns": [("transactions", "campaign_id", "unset")],
    "training_courses": [("training_assignments", "course_id", "delete")],
    "ai_agents": [("ai_agent_usage", "agent_id", "delete"), ("api_credit_txns", "agent_id", "unset"), ("api_accounts", "agent_ids", "pull")],
    "api_accounts": [("api_credit_txns", "account_id", "delete")],
    "org_nodes": [("org_nodes", "parent_id", "unset")],
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


async def _collect_cascade_ops(coll: str, rid: str):
    """Snapshot-friendly cascade plan: what will be deleted / unset / pulled."""
    ops = []
    for child, field, mode in DEPS.get(coll, []):
        if mode == "delete":
            docs = await db[child].find({field: rid}, {"_id": 0}).to_list(5000)
            if docs:
                ops.append({"type": "delete", "coll": child, "docs": docs})
        else:
            ids = [d["id"] for d in await db[child].find({field: rid}, {"_id": 0, "id": 1}).to_list(5000)]
            if ids:
                ops.append({"type": mode, "coll": child, "field": field, "ids": ids, "value": rid})
    return ops


async def _apply_cascade(ops):
    for op in ops:
        if op["type"] == "delete":
            await db[op["coll"]].delete_many({"id": {"$in": [d["id"] for d in op["docs"]]}})
        elif op["type"] == "unset":
            await db[op["coll"]].update_many({"id": {"$in": op["ids"]}}, {"$set": {op["field"]: None}})
        elif op["type"] == "pull":
            await db[op["coll"]].update_many({"id": {"$in": op["ids"]}}, {"$pull": {op["field"]: op["value"]}})


async def _snapshot(coll: str, doc: dict, ops, user: dict) -> str:
    """Store a 24h-recoverable snapshot (main doc + full cascade plan)."""
    label = doc.get("name") or doc.get("title") or doc.get("number") or doc.get("email") or doc["id"]
    now = datetime.now(timezone.utc)
    snap = {"id": str(uuid.uuid4()), "coll": coll, "record_id": doc["id"], "label": label,
            "doc": {k: v for k, v in doc.items() if k != "_id"},
            "cascade_ops": ops,
            "deleted_at": now.isoformat(), "deleted_by": user.get("name", ""),
            "expires_at": (now + timedelta(hours=24)).isoformat()}
    await db.deleted_records.insert_one(dict(snap))
    return snap["id"]


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


@router.get("/workspace/recycle-bin")
async def recycle_bin(user: dict = Depends(require_super_admin)):
    """Snapshots recoverable within 24h of deletion."""
    now = datetime.now(timezone.utc).isoformat()
    rows = await db.deleted_records.find({"expires_at": {"$gt": now}}, {"_id": 0}).sort("deleted_at", -1).to_list(200)
    return [{
        "id": r["id"], "coll": r["coll"], "record_id": r["record_id"], "label": r["label"],
        "deleted_at": r["deleted_at"], "deleted_by": r["deleted_by"], "expires_at": r["expires_at"],
        "cascaded": sum(len(o.get("docs") or o.get("ids") or []) for o in r.get("cascade_ops", [])),
    } for r in rows]


@router.post("/workspace/recycle-bin/{snap_id}/restore")
async def restore_snapshot(snap_id: str, user: dict = Depends(require_super_admin)):
    snap = await db.deleted_records.find_one({"id": snap_id})
    if not snap:
        raise HTTPException(status_code=404, detail="Snapshot not found (may have expired)")
    if snap["expires_at"] <= datetime.now(timezone.utc).isoformat():
        raise HTTPException(status_code=410, detail="Snapshot expired — deletion is now permanent")
    if await db[snap["coll"]].find_one({"id": snap["record_id"]}):
        raise HTTPException(status_code=409, detail="A record with this id already exists")
    await db[snap["coll"]].insert_one(dict(snap["doc"]))
    for op in snap.get("cascade_ops", []):
        if op["type"] == "delete":
            for d in op["docs"]:
                if not await db[op["coll"]].find_one({"id": d["id"]}):
                    await db[op["coll"]].insert_one(dict(d))
        elif op["type"] == "unset":
            await db[op["coll"]].update_many({"id": {"$in": op["ids"]}}, {"$set": {op["field"]: op["value"]}})
        elif op["type"] == "pull":
            await db[op["coll"]].update_many({"id": {"$in": op["ids"]}}, {"$addToSet": {op["field"]: op["value"]}})
    await db.deleted_records.delete_one({"id": snap_id})
    await log_activity(user, "workspace_restored", snap["coll"], snap["record_id"], snap["label"])
    return {"ok": True, "restored": snap["label"]}


@router.delete("/workspace/recycle-bin/{snap_id}")
async def purge_snapshot(snap_id: str, user: dict = Depends(require_super_admin)):
    """Delete a recycle-bin snapshot now (the record can no longer be restored)."""
    snap = await db.deleted_records.find_one({"id": snap_id}, {"_id": 0, "label": 1, "coll": 1, "record_id": 1})
    if not snap:
        raise HTTPException(status_code=404, detail="Snapshot not found (may have expired)")
    await db.deleted_records.delete_one({"id": snap_id})
    await log_activity(user, "recycle_bin_purged", snap["coll"], snap["record_id"], snap["label"])
    return {"ok": True}


@router.delete("/workspace/recycle-bin")
async def empty_recycle_bin(user: dict = Depends(require_super_admin)):
    res = await db.deleted_records.delete_many({})
    await log_activity(user, "recycle_bin_emptied", "deleted_records", None, f"{res.deleted_count} snapshots")
    return {"ok": True, "deleted_count": res.deleted_count}


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
    ops = await _collect_cascade_ops(coll, rid) if (deps and cascade) else []
    await _snapshot(coll, existing, ops, user)
    if ops:
        await _apply_cascade(ops)
    await db[coll].delete_one({"id": rid})
    label = existing.get("name") or existing.get("title") or existing.get("number") or rid
    await log_activity(user, "workspace_deleted", coll, rid,
                       f"{label}" + (" (+cascade)" if ops else "") + " — recoverable 24h")
    return {"ok": True, "cascaded": bool(ops), "recoverable_hours": 24}


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
        ops = await _collect_cascade_ops(coll, rid) if deps else []
        await _snapshot(coll, existing, ops, user)
        if ops:
            await _apply_cascade(ops)
        await db[coll].delete_one({"id": rid})
        deleted += 1
    await log_activity(user, "workspace_bulk_deleted", coll, None,
                       f"{deleted} records deleted (recoverable 24h), {len(skipped)} skipped")
    return {"deleted": deleted, "skipped": skipped}
