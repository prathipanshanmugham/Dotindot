import uuid
from datetime import datetime, timezone
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
    return await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(500)


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


@router.put("/users/{user_id}")
async def update_user(user_id: str, body: UserUpdate, user: dict = Depends(require_roles("admin"))):
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    _can_manage(user, target["role"])
    updates = {}
    if body.name is not None:
        updates["name"] = body.name
    if body.role is not None:
        if body.role not in VALID_ROLES:
            raise HTTPException(status_code=400, detail="Invalid role")
        _can_manage(user, body.role)
        updates["role"] = body.role
    if body.is_active is not None:
        updates["is_active"] = body.is_active
    if body.password:
        updates["password_hash"] = hash_password(body.password)
    if updates:
        await db.users.update_one({"id": user_id}, {"$set": updates})
    action = "user_deactivated" if body.is_active is False else "user_updated"
    await log_activity(user, action, "user", user_id, target["name"])
    updated = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    return updated
