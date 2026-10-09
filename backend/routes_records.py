"""Module-level permanent delete (single + bulk) for every data type.
super_admin always; other roles need the per-module `<module>.delete` key. Cascades automatically,
snapshots into the 24h recycle bin and writes an audit entry. Activity-log purge writes a meta entry."""
from typing import List
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException
from database import db
from auth import get_current_user, log_activity
from permissions import has_permission
from routes_workspace import (COLLECTIONS, _dependents, _collect_cascade_ops, _apply_cascade, _snapshot,
                              _guard_user_delete)

router = APIRouter()

# collection -> permission key required for non-super_admin deletes
DELETE_KEYS = {
    "clients": "clients.delete", "projects": "projects.delete",
    "leads": "sales.delete", "quotes": "sales.delete", "targets": "sales.delete", "lead_activities": "sales.delete",
    "transactions": "finance.delete", "expenses": "finance.delete", "subscriptions": "finance.delete",
    "budgets": "finance.delete", "campaigns": "finance.delete",
    "ad_campaigns": "ads.delete", "social_posts": "social.delete", "influencers": "influencers.delete",
    "assets": "assets.delete", "partnerships": "partnerships.delete", "branches": "locations.delete",
    "training_courses": "training.delete", "training_assignments": "training.delete",
    "password_entries": "password_manager.delete", "activity_logs": "logs.delete",
    "users": "__super_admin__",
    "ai_agents": "ai_agents.delete", "ai_agent_usage": "ai_agents.delete",
    "org_nodes": "org_structure.delete",
    "api_accounts": "finance.delete", "api_credit_txns": "finance.delete",
    "daily_reports": "daily_reports.delete",
    "portal_users": "clients.delete",
}

# Line items stored inside a parent record that can be removed one by one: collection -> {array field: module delete key}
SUB_ITEMS = {
    "clients": {"contacts": "clients.delete", "contracts": "clients.delete", "credentials": "clients.delete"},
    "projects": {"milestones": "projects.delete", "deliverables": "projects.delete"},
    "assets": {"maintenance_log": "assets.delete", "assignment_history": "assets.delete"},
    "ad_campaigns": {"metrics_history": "ads.delete"},
    "influencers": {"collaborations": "influencers.delete"},
    "partnerships": {"benefits": "partnerships.delete"},
    "ai_agents": {"prompts": "ai_agents.delete"},
    "daily_reports": {"tasks": "daily_reports.delete"},
}


def _label(doc):
    return doc.get("name") or doc.get("title") or doc.get("number") or doc.get("description") or doc.get("email") or doc.get("action") or doc["id"]


def _require(user: dict, coll: str):
    if coll not in COLLECTIONS or coll not in DELETE_KEYS:
        raise HTTPException(status_code=404, detail="Unknown collection")
    if not has_permission(user, DELETE_KEYS[coll]):
        raise HTTPException(status_code=403, detail=f"You don't have delete permission for this module ({DELETE_KEYS[coll]})")


async def hard_delete(coll: str, existing: dict, user: dict, action: str = "record_deleted") -> dict:
    """Snapshot → cascade → delete → audit. Shared by module endpoints and user deletion."""
    if coll == "users":
        await _guard_user_delete(user, existing["id"])
    ops = await _collect_cascade_ops(coll, existing["id"])
    await _snapshot(coll, existing, ops, user)
    if ops:
        await _apply_cascade(ops)
    await db[coll].delete_one({"id": existing["id"]})
    await log_activity(user, action, coll, existing["id"], f"{_label(existing)}" + (" (+cascade)" if ops else "") + " — recoverable 24h")
    return {"ok": True, "cascaded": bool(ops), "recoverable_hours": 24}


@router.get("/records/{coll}/{rid}/dependents")
async def record_dependents(coll: str, rid: str, user: dict = Depends(get_current_user)):
    _require(user, coll)
    return {k: v["count"] for k, v in (await _dependents(coll, rid)).items()}


@router.delete("/records/{coll}/{rid}")
async def delete_one(coll: str, rid: str, user: dict = Depends(get_current_user)):
    _require(user, coll)
    existing = await db[coll].find_one({"id": rid})
    if not existing:
        raise HTTPException(status_code=404, detail="Record not found")
    return await hard_delete(coll, existing, user)


class BulkBody(BaseModel):
    ids: List[str]


@router.delete("/records/{coll}/{rid}/items/{field}/{item_id}")
async def delete_sub_item(coll: str, rid: str, field: str, item_id: str, user: dict = Depends(get_current_user)):
    """Remove one line item (a contact, maintenance entry, metrics snapshot, collaboration…) from a record."""
    key = SUB_ITEMS.get(coll, {}).get(field)
    if not key:
        raise HTTPException(status_code=404, detail="These items can't be deleted individually")
    if not has_permission(user, key):
        raise HTTPException(status_code=403, detail=f"You don't have delete permission for this module ({key})")
    doc = await db[coll].find_one({"id": rid}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Record not found")
    items = doc.get(field) or []
    keep = [x for x in items if not (isinstance(x, dict) and x.get("id") == item_id)]
    if len(keep) == len(items):
        raise HTTPException(status_code=404, detail="Item not found")
    removed = next(x for x in items if isinstance(x, dict) and x.get("id") == item_id)
    await db[coll].update_one({"id": rid}, {"$set": {field: keep}})
    label = removed.get("title") or removed.get("name") or removed.get("description") or removed.get("item") or removed.get("campaign_name") or removed.get("date") or item_id
    await log_activity(user, "record_item_deleted", coll, rid, f"{_label(doc)} · {field}: {label}")
    return {"ok": True, field: keep}


@router.post("/records/{coll}/bulk-delete")
async def delete_many(coll: str, body: BulkBody, user: dict = Depends(get_current_user)):
    _require(user, coll)
    deleted, skipped = 0, []
    for rid in body.ids[:500]:
        existing = await db[coll].find_one({"id": rid})
        if not existing:
            skipped.append({"id": rid, "reason": "not found"})
            continue
        try:
            await hard_delete(coll, existing, user, action="record_deleted")
            deleted += 1
        except HTTPException as e:
            skipped.append({"id": rid, "reason": e.detail})
    await log_activity(user, "records_bulk_deleted", coll, None, f"{deleted} {COLLECTIONS[coll]['label']} deleted (recoverable 24h), {len(skipped)} skipped")
    return {"deleted": deleted, "skipped": skipped}


class PurgeBody(BaseModel):
    confirm: str
    before: str | None = None  # ISO date; None = everything


@router.post("/records/activity_logs/purge")
async def purge_logs(body: PurgeBody, user: dict = Depends(get_current_user)):
    if user.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="Only a super admin can purge activity logs")
    if body.confirm != "DELETE":
        raise HTTPException(status_code=400, detail="Type DELETE to confirm")
    q = {"timestamp": {"$lt": body.before}} if body.before else {}
    res = await db.activity_logs.delete_many(q)
    await log_activity(user, "logs_purged", "activity_logs", None, f"{res.deleted_count} log entries purged by {user.get('name')}" + (f" (before {body.before})" if body.before else ""))
    return {"purged": res.deleted_count}
