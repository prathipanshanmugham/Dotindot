"""Asset management. Module gated by 'assets' permission (middleware).
Writes: admin + super_admin. Finance has read via role defaults."""
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, List
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Depends
from database import db
from auth import get_current_user, require_roles, log_activity
from permissions import branch_scope, has_permission

router = APIRouter()

ASSET_TYPES = ["laptop", "computer", "phone", "sim_card", "camera", "equipment", "other"]
ASSET_STATUSES = ["in_use", "available", "maintenance", "retired"]


class AssetCreate(BaseModel):
    name: str
    asset_type: str = "laptop"
    serial_no: Optional[str] = ""
    purchase_date: Optional[str] = None
    purchase_value: float = 0
    status: str = "available"
    assigned_to: Optional[str] = None
    assigned_location: Optional[str] = ""
    branch_id: Optional[str] = None
    notes: Optional[str] = ""
    next_maintenance_date: Optional[str] = None
    maintenance_interval_days: Optional[int] = None
    currency: str = "INR"


class AssetUpdate(BaseModel):
    name: Optional[str] = None
    asset_type: Optional[str] = None
    serial_no: Optional[str] = None
    purchase_date: Optional[str] = None
    purchase_value: Optional[float] = None
    status: Optional[str] = None
    branch_id: Optional[str] = None
    notes: Optional[str] = None
    next_maintenance_date: Optional[str] = None
    maintenance_interval_days: Optional[int] = None


class AssignBody(BaseModel):
    assigned_to: Optional[str] = None      # user id
    assigned_location: Optional[str] = ""  # or a location label
    note: Optional[str] = ""


class MaintenanceBody(BaseModel):
    date: str
    description: str
    cost: float = 0


def _today():
    return datetime.now(timezone.utc).date().isoformat()


async def next_asset_code() -> str:
    n = await db.assets.count_documents({})
    while True:
        n += 1
        code = f"DOT-AST-{n:03d}"
        if not await db.assets.find_one({"code": code}):
            return code


async def _user_name(uid):
    if not uid:
        return None
    u = await db.users.find_one({"id": uid}, {"_id": 0, "name": 1})
    return u["name"] if u else None


def _flag(asset):
    nmd = asset.get("next_maintenance_date")
    if nmd:
        limit = (datetime.now(timezone.utc).date() + timedelta(days=30)).isoformat()
        asset["maintenance_due"] = _today() <= nmd <= limit
        asset["maintenance_overdue"] = nmd < _today()
    else:
        asset["maintenance_due"] = False
        asset["maintenance_overdue"] = False
    return asset


@router.get("/assets")
async def list_assets(
    asset_type: Optional[str] = None, status: Optional[str] = None,
    branch_id: Optional[str] = None, assigned_to: Optional[str] = None,
    search: Optional[str] = None, user: dict = Depends(get_current_user),
):
    q = {}
    if asset_type:
        q["asset_type"] = asset_type
    if status:
        q["status"] = status
    if branch_id:
        q["branch_id"] = branch_id
    if assigned_to:
        q["assigned_to"] = assigned_to
    if search:
        q["$or"] = [{"name": {"$regex": search, "$options": "i"}}, {"code": {"$regex": search, "$options": "i"}},
                    {"serial_no": {"$regex": search, "$options": "i"}}]
    branches = branch_scope(user)
    if branches is not None:
        q["branch_id"] = {"$in": branches} if not branch_id else branch_id
    rows = await db.assets.find(q, {"_id": 0}).sort("code", 1).to_list(1000)
    users = await db.users.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(300)
    branches_rows = await db.branches.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(50)
    umap = {u["id"]: u["name"] for u in users}
    bmap = {b["id"]: b["name"] for b in branches_rows}
    for a in rows:
        a["assigned_to_name"] = umap.get(a.get("assigned_to"))
        a["branch_name"] = bmap.get(a.get("branch_id"), "")
        _flag(a)
    return rows


@router.get("/assets/stats")
async def asset_stats(user: dict = Depends(get_current_user)):
    q = {}
    branches = branch_scope(user)
    if branches is not None:
        q["branch_id"] = {"$in": branches}
    rows = await db.assets.find(q, {"_id": 0}).to_list(1000)
    by_type, by_status = {}, {}
    for a in rows:
        by_type[a["asset_type"]] = by_type.get(a["asset_type"], 0) + 1
        by_status[a["status"]] = by_status.get(a["status"], 0) + 1
    due = sum(1 for a in rows if _flag(dict(a))["maintenance_due"] or _flag(dict(a))["maintenance_overdue"])
    return {
        "total": len(rows),
        "total_value": sum(a.get("purchase_value", 0) for a in rows),
        "in_use": by_status.get("in_use", 0),
        "maintenance_due": due,
        "by_type": [{"name": k, "value": v} for k, v in sorted(by_type.items(), key=lambda i: -i[1])],
        "by_status": [{"name": k, "value": v} for k, v in by_status.items()],
    }


@router.get("/assets/{asset_id}")
async def get_asset(asset_id: str, user: dict = Depends(get_current_user)):
    a = await db.assets.find_one({"id": asset_id}, {"_id": 0})
    if not a:
        raise HTTPException(status_code=404, detail="Asset not found")
    a["assigned_to_name"] = await _user_name(a.get("assigned_to"))
    if a.get("branch_id"):
        b = await db.branches.find_one({"id": a["branch_id"]}, {"_id": 0, "name": 1})
        a["branch_name"] = b["name"] if b else ""
    return _flag(a)


@router.post("/assets")
async def create_asset(body: AssetCreate, user: dict = Depends(require_roles("admin"))):
    if body.asset_type not in ASSET_TYPES or body.status not in ASSET_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid asset type or status")
    now = datetime.now(timezone.utc).isoformat()
    doc = {"id": str(uuid.uuid4()), "code": await next_asset_code(), **body.dict(),
           "maintenance_log": [], "assignment_history": [], "created_at": now, "updated_at": now,
           "created_by": user["id"]}
    if doc.get("assigned_to") or doc.get("assigned_location"):
        doc["assignment_history"].append({
            "assigned_to": doc.get("assigned_to"), "assigned_to_name": await _user_name(doc.get("assigned_to")),
            "location": doc.get("assigned_location") or "", "from_date": _today(), "to_date": None,
            "note": "Initial assignment"})
        doc["status"] = "in_use" if doc["status"] == "available" else doc["status"]
    await db.assets.insert_one(dict(doc))
    await log_activity(user, "asset_created", "asset", doc["id"], f"{doc['code']} {doc['name']}")
    doc.pop("_id", None)
    return doc


@router.put("/assets/{asset_id}")
async def update_asset(asset_id: str, body: AssetUpdate, user: dict = Depends(require_roles("admin"))):
    a = await db.assets.find_one({"id": asset_id})
    if not a:
        raise HTTPException(status_code=404, detail="Asset not found")
    updates = {k: v for k, v in body.dict().items() if v is not None}
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.assets.update_one({"id": asset_id}, {"$set": updates})
    await log_activity(user, "asset_updated", "asset", asset_id, f"{a['code']} {a['name']}")
    return await db.assets.find_one({"id": asset_id}, {"_id": 0})


@router.get("/assets/{asset_id}/dependents")
async def asset_dependents(asset_id: str, user: dict = Depends(get_current_user)):
    a = await db.assets.find_one({"id": asset_id}, {"_id": 0})
    if not a:
        raise HTTPException(status_code=404, detail="Asset not found")
    return {
        "assigned_to": a.get("assigned_to"), "assigned_to_name": await _user_name(a.get("assigned_to")),
        "assigned_location": a.get("assigned_location") or "",
        "branch_id": a.get("branch_id"),
        "maintenance_entries": len(a.get("maintenance_log") or []),
        "assignment_entries": len(a.get("assignment_history") or []),
    }


def _require_delete(user: dict):
    if not has_permission(user, "assets.delete"):
        raise HTTPException(status_code=403, detail="You don't have permission to delete assets (assets.delete)")


async def _hard_delete_asset(a: dict, user: dict):
    from routes_workspace import _snapshot
    await _snapshot("assets", a, [], user)
    await db.assets.delete_one({"id": a["id"]})
    await log_activity(user, "asset_deleted", "asset", a["id"],
                       f"{a.get('code', '')} {a.get('name', '')} — permanent (recoverable 24h)")


@router.delete("/assets/{asset_id}")
async def delete_asset(asset_id: str, user: dict = Depends(get_current_user)):
    _require_delete(user)
    a = await db.assets.find_one({"id": asset_id})
    if not a:
        raise HTTPException(status_code=404, detail="Asset not found")
    await _hard_delete_asset(a, user)
    return {"ok": True, "recoverable_hours": 24}


class BulkDeleteBody(BaseModel):
    ids: List[str]


@router.post("/assets/bulk-delete")
async def bulk_delete_assets(body: BulkDeleteBody, user: dict = Depends(get_current_user)):
    _require_delete(user)
    deleted = 0
    for aid in body.ids[:200]:
        a = await db.assets.find_one({"id": aid})
        if a:
            await _hard_delete_asset(a, user)
            deleted += 1
    return {"deleted": deleted}


@router.post("/assets/{asset_id}/retire")
async def retire_asset(asset_id: str, user: dict = Depends(require_roles("admin"))):
    a = await db.assets.find_one({"id": asset_id})
    if not a:
        raise HTTPException(status_code=404, detail="Asset not found")
    await db.assets.update_one({"id": asset_id}, {"$set": {"status": "retired", "assigned_to": None}})
    await log_activity(user, "asset_retired", "asset", asset_id, f"{a['code']} {a['name']}")
    return {"ok": True}


@router.post("/assets/{asset_id}/assign")
async def assign_asset(asset_id: str, body: AssignBody, user: dict = Depends(require_roles("admin"))):
    a = await db.assets.find_one({"id": asset_id})
    if not a:
        raise HTTPException(status_code=404, detail="Asset not found")
    if body.assigned_to and not await db.users.find_one({"id": body.assigned_to}):
        raise HTTPException(status_code=404, detail="User not found")
    history = a.get("assignment_history", [])
    today = _today()
    if history and history[-1].get("to_date") is None:
        history[-1]["to_date"] = today
    new_name = await _user_name(body.assigned_to)
    unassigning = not body.assigned_to and not (body.assigned_location or "").strip()
    if not unassigning:
        history.append({"assigned_to": body.assigned_to, "assigned_to_name": new_name,
                        "location": body.assigned_location or "", "from_date": today, "to_date": None,
                        "note": body.note or ""})
    await db.assets.update_one({"id": asset_id}, {"$set": {
        "assignment_history": history,
        "assigned_to": body.assigned_to,
        "assigned_location": body.assigned_location or "",
        "status": "available" if unassigning else "in_use",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }})
    target = new_name or body.assigned_location or "unassigned"
    await log_activity(user, "asset_assigned", "asset", asset_id, f"{a['code']} → {target}")
    return await db.assets.find_one({"id": asset_id}, {"_id": 0})


@router.post("/assets/{asset_id}/maintenance")
async def log_maintenance(asset_id: str, body: MaintenanceBody, user: dict = Depends(require_roles("admin"))):
    a = await db.assets.find_one({"id": asset_id})
    if not a:
        raise HTTPException(status_code=404, detail="Asset not found")
    entry = {"id": str(uuid.uuid4()), "date": body.date, "description": body.description,
             "cost": body.cost, "logged_by": user["name"]}
    updates = {"$push": {"maintenance_log": entry}}
    interval = a.get("maintenance_interval_days")
    if interval:
        try:
            nxt = (datetime.fromisoformat(body.date).date() + timedelta(days=int(interval))).isoformat()
            updates["$set"] = {"next_maintenance_date": nxt}
        except ValueError:
            pass
    await db.assets.update_one({"id": asset_id}, updates)
    await log_activity(user, "asset_maintenance_logged", "asset", asset_id, f"{a['code']} {a['name']}")
    return await db.assets.find_one({"id": asset_id}, {"_id": 0})
