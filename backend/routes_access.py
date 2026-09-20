"""Access Control: per-user permission overrides + branch restrictions.
Module gated by 'access_control' permission (middleware). Edit rules:
- super_admin can edit anyone except other super_admins (super_admin cannot be restricted).
- admin can edit only non-admin, non-super_admin users.
"""
from typing import Dict, List, Optional
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Depends
from database import db
from auth import get_current_user, log_activity
from permissions import (
    PERMISSION_GROUPS, ALL_KEYS, ROLE_DEFAULTS, VALID_ROLES,
    effective_permissions,
)

router = APIRouter()


class OverridesBody(BaseModel):
    overrides: Dict[str, bool] = {}


class BranchesBody(BaseModel):
    assigned_branches: List[str] = []


def _can_edit(actor: dict, target: dict):
    if target["role"] == "super_admin":
        raise HTTPException(status_code=403, detail="super_admin accounts cannot be restricted")
    if actor["role"] == "super_admin":
        return
    if actor["role"] == "admin":
        if target["role"] in ("admin", "super_admin"):
            raise HTTPException(status_code=403, detail="Only a super admin can manage admin permissions")
        return
    raise HTTPException(status_code=403, detail="Insufficient permissions for this action")


@router.get("/me/permissions")
async def my_permissions(user: dict = Depends(get_current_user)):
    return {
        "role": user["role"],
        "permissions": effective_permissions(user),
        "assigned_branches": user.get("assigned_branches") or [],
        "groups": PERMISSION_GROUPS,
    }


@router.get("/access/registry")
async def registry(user: dict = Depends(get_current_user)):
    return {
        "groups": PERMISSION_GROUPS,
        "role_defaults": {r: sorted(keys) for r, keys in ROLE_DEFAULTS.items()},
        "roles": sorted(VALID_ROLES),
    }


@router.get("/access/users")
async def access_users(user: dict = Depends(get_current_user)):
    users = await db.users.find({"deleted": {"$ne": True}}, {"_id": 0, "password_hash": 0}).sort("name", 1).to_list(500)
    for u in users:
        u["effective_permissions"] = effective_permissions(u)
        u["permission_overrides"] = u.get("permission_overrides") or {}
        u["assigned_branches"] = u.get("assigned_branches") or []
    return users


@router.put("/access/users/{user_id}/permissions")
async def set_overrides(user_id: str, body: OverridesBody, user: dict = Depends(get_current_user)):
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    _can_edit(user, target)
    invalid = [k for k in body.overrides if k not in ALL_KEYS]
    if invalid:
        raise HTTPException(status_code=400, detail=f"Unknown permission keys: {', '.join(invalid)}")
    await db.users.update_one({"id": user_id}, {"$set": {"permission_overrides": body.overrides}})
    changed = ", ".join(f"{'+' if v else '-'}{k}" for k, v in body.overrides.items()) or "cleared"
    await log_activity(user, "permissions_updated", "user", user_id, f"{target['name']}: {changed}")
    updated = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    updated["effective_permissions"] = effective_permissions(updated)
    return updated


@router.post("/access/users/{user_id}/permissions/reset")
async def reset_overrides(user_id: str, user: dict = Depends(get_current_user)):
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    _can_edit(user, target)
    await db.users.update_one({"id": user_id}, {"$unset": {"permission_overrides": ""}})
    await log_activity(user, "permissions_reset", "user", user_id, target["name"])
    updated = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    updated["effective_permissions"] = effective_permissions(updated)
    updated["permission_overrides"] = {}
    return updated


@router.put("/access/users/{user_id}/branches")
async def set_branches(user_id: str, body: BranchesBody, user: dict = Depends(get_current_user)):
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    _can_edit(user, target)
    if body.assigned_branches:
        valid = await db.branches.count_documents({"id": {"$in": body.assigned_branches}})
        if valid != len(set(body.assigned_branches)):
            raise HTTPException(status_code=400, detail="Unknown branch id in list")
    await db.users.update_one({"id": user_id}, {"$set": {"assigned_branches": body.assigned_branches}})
    label = ", ".join(body.assigned_branches) if body.assigned_branches else "all branches"
    await log_activity(user, "branch_access_updated", "user", user_id, f"{target['name']} → {label}")
    return {"ok": True, "assigned_branches": body.assigned_branches}
