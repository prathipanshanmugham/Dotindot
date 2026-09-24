from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from database import db
from models import LoginRequest
from auth import verify_password, hash_password, create_access_token, get_current_user, log_activity

router = APIRouter()


@router.post("/auth/login")
async def login(body: LoginRequest):
    email = body.email.strip().lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="Account deactivated. Contact your administrator.")
    token = create_access_token(user["id"], user["email"], user["role"])
    safe_user = {"id": user["id"], "name": user["name"], "email": user["email"], "role": user["role"]}
    await log_activity(safe_user, "login")
    return {"access_token": token, "token_type": "bearer", "user": safe_user}


@router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


@router.post("/auth/logout")
async def logout(user: dict = Depends(get_current_user)):
    await log_activity(user, "logout")
    return {"ok": True}


class ChangePasswordBody(BaseModel):
    current_password: str
    new_password: str


@router.post("/auth/change-password")
async def change_password(body: ChangePasswordBody, user: dict = Depends(get_current_user)):
    doc = await db.users.find_one({"id": user["id"]})
    if not doc or not doc.get("password_hash") or not verify_password(body.current_password, doc["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters")
    await db.users.update_one({"id": user["id"]}, {"$set": {"password_hash": hash_password(body.new_password)}})
    await log_activity(user, "password_changed", "user", user["id"], user["name"])
    return {"ok": True}
