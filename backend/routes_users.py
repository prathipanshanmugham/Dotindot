import re
import uuid
from datetime import date, datetime, timezone
from fastapi import APIRouter, HTTPException, Depends
from database import db
from models import UserCreate, UserUpdate
from auth import hash_password, get_current_user, require_roles, log_activity
from permissions import VALID_ROLES

router = APIRouter()

ELEVATED = ("admin", "super_admin")


def _can_manage(actor: dict, target_role: str):
    """Only a super_admin may create/edit admin or super_admin accounts."""
    if target_role in ELEVATED and actor["role"] != "super_admin":
        raise HTTPException(status_code=403, detail="Only a super admin can manage admin accounts")


@router.get("/users/team")
async def team_members(user: dict = Depends(get_current_user)):
    users = await db.users.find(
        {"is_active": True}, {"_id": 0, "id": 1, "name": 1, "email": 1, "role": 1}
    ).to_list(200)
    return users


@router.get("/users")
async def list_users(user: dict = Depends(require_roles("admin"))):
    rows = await db.users.find({"deleted": {"$ne": True}}, {"_id": 0, "password_hash": 0, "hr": 0}).to_list(500)
    logins = await db.activity_logs.aggregate([
        {"$match": {"action": "login"}},
        {"$group": {"_id": "$user_id", "last": {"$max": "$timestamp"}}},
    ]).to_list(1000)
    lmap = {r["_id"]: r["last"] for r in logins}
    for u in rows:
        u["last_login"] = lmap.get(u["id"])
    return rows


@router.get("/users/{user_id}/logins")
async def login_history(user_id: str, user: dict = Depends(require_roles("admin"))):
    """Recent login events for a user (admin/super_admin only)."""
    rows = await db.activity_logs.find(
        {"action": "login", "user_id": user_id},
        {"_id": 0, "timestamp": 1, "user_name": 1}).sort("timestamp", -1).to_list(25)
    return rows


@router.post("/users")
async def create_user(body: UserCreate, user: dict = Depends(require_roles("admin"))):
    if body.role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail="Invalid role")
    _can_manage(user, body.role)
    email = body.email.strip().lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="A user with this email already exists")
    doc = {
        "id": str(uuid.uuid4()),
        "name": body.name,
        "email": email,
        "role": body.role,
        "is_active": True,
        "password_hash": hash_password(body.password),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)
    await log_activity(user, "user_created", "user", doc["id"], doc["name"])
    return {k: v for k, v in doc.items() if k not in ("password_hash", "_id")}


EMAIL_RX = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
TEXT_FIELDS = {"name": 80, "phone": 30, "designation": 80, "department": 60, "country": 60, "state": 60, "city": 60, "bio": 1000}


async def ensure_super_admin_active():
    """A super admin is always active (run at startup)."""
    await db.users.update_many({"role": "super_admin", "is_active": {"$ne": True}}, {"$set": {"is_active": True}})


def guard_always_active(target: dict, updates: dict):
    """Super admins can't be switched off; demote them first. And the last super admin stays one."""
    role_after = updates.get("role", target.get("role"))
    if role_after == "super_admin" and updates.get("is_active") is False:
        raise HTTPException(status_code=400, detail="A super admin is always active. Change their role first if they should lose access.")


async def guard_last_super_admin(target: dict, new_role):
    if target.get("role") == "super_admin" and new_role and new_role != "super_admin":
        others = await db.users.count_documents({"role": "super_admin", "id": {"$ne": target["id"]}, "deleted": {"$ne": True}})
        if not others:
            raise HTTPException(status_code=400, detail="This is the only super admin. Make someone else super admin first.")


@router.put("/users/{user_id}")
async def update_user(user_id: str, body: UserUpdate, user: dict = Depends(require_roles("admin"))):
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    _can_manage(user, target["role"])
    data = body.model_dump(exclude_unset=True)
    updates = {}
    for k, limit in TEXT_FIELDS.items():
        if k in data and data[k] is not None:
            v = str(data[k]).strip()
            if k == "name" and not v:
                raise HTTPException(status_code=400, detail="Name can't be empty")
            if len(v) > limit:
                raise HTTPException(status_code=400, detail=f"{k.replace('_', ' ').capitalize()} is too long (max {limit} characters)")
            updates[k] = v
    if data.get("email") is not None:
        email = data["email"].strip().lower()
        if not EMAIL_RX.match(email):
            raise HTTPException(status_code=400, detail="That email doesn't look right")
        if email != target.get("email") and await db.users.find_one({"email": email, "id": {"$ne": user_id}}):
            raise HTTPException(status_code=400, detail="Another user already has this email")
        updates["email"] = email
    if "join_date" in data:
        jd = (data["join_date"] or "").strip()
        if jd:
            try:
                date.fromisoformat(jd[:10])
            except ValueError:
                raise HTTPException(status_code=400, detail="Join date should be a date like 2026-04-01")
        updates["join_date"] = jd[:10] or None
    if "branch_id" in data:
        from locations_util import valid_branch
        updates["branch_id"] = await valid_branch(data["branch_id"])
    if data.get("skills") is not None:
        updates["skills"] = [str(x).strip()[:40] for x in data["skills"] if str(x).strip()][:30]
    if body.role is not None and body.role != target["role"]:
        if body.role not in VALID_ROLES:
            raise HTTPException(status_code=400, detail="Invalid role")
        _can_manage(user, body.role)
        if user_id == user["id"]:
            raise HTTPException(status_code=400, detail="You can't change your own role")
        await guard_last_super_admin(target, body.role)
        updates["role"] = body.role
    if body.is_active is not None:
        if body.is_active is False and user_id == user["id"]:
            raise HTTPException(status_code=400, detail="You can't deactivate your own login")
        updates["is_active"] = body.is_active
    guard_always_active(target, updates)
    if body.password:
        if len(body.password) < 8:
            raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
        updates["password_hash"] = hash_password(body.password)
    if updates:
        await db.users.update_one({"id": user_id}, {"$set": updates})
    if updates.get("role") == "super_admin" and target.get("is_active") is False:
        await db.users.update_one({"id": user_id}, {"$set": {"is_active": True}})
    action = "user_deactivated" if updates.get("is_active") is False else "user_updated"
    changed = ", ".join(sorted(k if k != "password_hash" else "password" for k in updates))
    await log_activity(user, action, "user", user_id, f"{updates.get('name', target['name'])}" + (f" ({changed})" if changed else ""))
    updated = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0, "hr": 0})
    return updated


@router.get("/users/{user_id}/assignments")
async def user_assignments(user_id: str, user: dict = Depends(require_roles("admin"))):
    """What is this user still responsible for? Shown as a warning before deletion."""
    target = await db.users.find_one({"id": user_id, "deleted": {"$ne": True}})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    projects = await db.projects.find(
        {"team_member_ids": user_id, "status": {"$in": ["kickoff", "in_progress", "review"]}},
        {"_id": 0, "id": 1, "name": 1, "status": 1}).to_list(100)
    leads = await db.leads.find(
        {"owner_id": user_id, "stage": {"$nin": ["won", "lost"]}},
        {"_id": 0, "id": 1, "name": 1, "stage": 1}).to_list(100)
    assets = await db.assets.find(
        {"assigned_to": user_id, "status": {"$ne": "retired"}},
        {"_id": 0, "id": 1, "name": 1, "code": 1}).to_list(100)
    return {"active_projects": projects, "open_leads": leads, "assets_held": assets}


@router.delete("/users/{user_id}")
async def delete_user(user_id: str, user: dict = Depends(require_roles("admin"))):
    """Permanent hard delete (super_admin only): user doc removed, assignments unset (→ Unassigned),
    snapshot kept 24h in the recycle bin, live tokens die immediately."""
    if user["role"] != "super_admin":
        raise HTTPException(status_code=403, detail="Only a super admin can delete accounts")
    if user_id == user["id"]:
        raise HTTPException(status_code=400, detail="You cannot delete your own account")
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    from routes_records import hard_delete
    await hard_delete("users", target, user, action="user_deleted")
    return {"ok": True, "message": f"{target['name']} permanently deleted. Their assignments are now Unassigned (recoverable 24h)."}
