"""Password Manager module (permission key: password_manager).

- Secrets encrypted at rest with Fernet (same infra as client credentials).
- Passwords are NEVER returned in list endpoints and never logged.
- Reveal requires the requester to RE-ENTER THEIR OWN login password AND the
  password_manager.reveal permission (default: super_admin + admin only).
- Every create/update/delete/reveal (and denied reveal) audited to activity_logs.
- Email reminders intentionally NOT implemented: no email provider is configured
  (pending user setup) — in-app notification bell only.
"""
import uuid
import secrets
import string
from datetime import datetime, timezone, timedelta, date
from typing import Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException
from database import db
from auth import get_current_user, encrypt_secret, decrypt_secret, verify_password, log_activity
from permissions import has_permission

router = APIRouter()


class EntryIn(BaseModel):
    name: str
    login_url: Optional[str] = ""
    username: str
    password: Optional[str] = None
    plan: Optional[str] = ""
    renewal_date: Optional[str] = None
    cost: float = 0
    currency: str = "INR"
    owner_id: Optional[str] = None
    branch_id: Optional[str] = None
    twofa_enabled: bool = False
    twofa_method: Optional[str] = None  # app | sms | email
    last_password_changed: Optional[str] = None
    change_interval_days: int = 90
    notes: Optional[str] = ""
    subscription_id: Optional[str] = None


class EntryUpdate(EntryIn):
    name: Optional[str] = None
    username: Optional[str] = None


class RevealBody(BaseModel):
    login_password: str


def _due_info(e: dict, today: str):
    lc = e.get("last_password_changed")
    iv = e.get("change_interval_days") or 90
    if not lc:
        return None, "unknown"
    due = (date.fromisoformat(lc[:10]) + timedelta(days=iv)).isoformat()
    week = (date.fromisoformat(today) + timedelta(days=7)).isoformat()
    if due < today:
        status = "overdue"
    elif due <= week:
        status = "due_soon"
    else:
        status = "ok"
    return due, status


def _public(e: dict) -> dict:
    out = {k: v for k, v in e.items() if k not in ("_id", "password_encrypted")}
    out["has_password"] = bool(e.get("password_encrypted"))
    return out


@router.get("/passwords")
async def list_entries(twofa: Optional[str] = None, status: Optional[str] = None,
                       branch: Optional[str] = None, owner: Optional[str] = None,
                       search: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = {}
    if twofa == "off":
        q["twofa_enabled"] = False
    elif twofa == "on":
        q["twofa_enabled"] = True
    if branch:
        q["branch_id"] = branch
    if owner:
        q["owner_id"] = owner
    if search:
        q["name"] = {"$regex": search, "$options": "i"}
    rows = await db.password_entries.find(q, {"_id": 0}).sort("name", 1).to_list(500)
    today = datetime.now(timezone.utc).date().isoformat()
    umap = {u["id"]: u["name"] for u in await db.users.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(500)}
    bmap = {b["id"]: b["name"] for b in await db.branches.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(50)}
    out = []
    for e in rows:
        p = _public(e)
        p["owner_name"] = umap.get(e.get("owner_id"), "")
        p["branch_name"] = bmap.get(e.get("branch_id"), "")
        p["change_due_date"], p["change_status"] = _due_info(e, today)
        if status and p["change_status"] != status:
            continue
        out.append(p)
    return out


@router.get("/passwords/summary")
async def summary(user: dict = Depends(get_current_user)):
    rows = await db.password_entries.find({}, {"_id": 0, "password_encrypted": 0}).to_list(500)
    today = datetime.now(timezone.utc).date()
    t_iso = today.isoformat()
    limit30 = (today + timedelta(days=30)).isoformat()
    overdue = due_soon = 0
    for e in rows:
        _, st = _due_info(e, t_iso)
        if st == "overdue":
            overdue += 1
        elif st == "due_soon":
            due_soon += 1
    return {
        "total": len(rows),
        "without_2fa": sum(1 for e in rows if not e.get("twofa_enabled")),
        "overdue": overdue,
        "due_soon": due_soon,
        "renewals_30d": sum(1 for e in rows if e.get("renewal_date") and t_iso <= e["renewal_date"] <= limit30),
        "email_reminders": "not configured — pending email provider setup (in-app reminders active)",
    }


@router.post("/passwords")
async def create_entry(body: EntryIn, user: dict = Depends(get_current_user)):
    doc = body.model_dump()
    pw = doc.pop("password", None)
    doc["password_encrypted"] = encrypt_secret(pw) if pw else ""
    if pw and not doc.get("last_password_changed"):
        doc["last_password_changed"] = datetime.now(timezone.utc).date().isoformat()
    doc.update({"id": str(uuid.uuid4()), "owner_id": doc.get("owner_id") or user["id"],
                "created_at": datetime.now(timezone.utc).isoformat(), "created_by": user["id"]})
    await db.password_entries.insert_one(dict(doc))
    await log_activity(user, "password_entry_created", "password", doc["id"], doc["name"])
    return _public(doc)


@router.put("/passwords/{entry_id}")
async def update_entry(entry_id: str, body: EntryUpdate, user: dict = Depends(get_current_user)):
    e = await db.password_entries.find_one({"id": entry_id})
    if not e:
        raise HTTPException(status_code=404, detail="Entry not found")
    updates = body.model_dump(exclude_unset=True)
    pw = updates.pop("password", None)
    if pw:
        updates["password_encrypted"] = encrypt_secret(pw)
        updates["last_password_changed"] = datetime.now(timezone.utc).date().isoformat()
    if updates:
        await db.password_entries.update_one({"id": entry_id}, {"$set": updates})
    await log_activity(user, "password_entry_updated", "password", entry_id, updates.get("name") or e["name"])
    return {"ok": True}


@router.delete("/passwords/{entry_id}")
async def delete_entry(entry_id: str, user: dict = Depends(get_current_user)):
    e = await db.password_entries.find_one({"id": entry_id})
    if not e:
        raise HTTPException(status_code=404, detail="Entry not found")
    await db.password_entries.delete_one({"id": entry_id})
    await log_activity(user, "password_entry_deleted", "password", entry_id, e["name"])
    return {"ok": True}


async def _verify_reveal(entry_id: str, body: RevealBody, user: dict, action: str):
    if not has_permission(user, "password_manager.reveal"):
        raise HTTPException(status_code=403, detail="You don't have reveal permission for the password manager")
    me = await db.users.find_one({"id": user["id"]})
    if not me or not me.get("password_hash") or not verify_password(body.login_password, me["password_hash"]):
        await log_activity(user, f"{action}_denied", "password", entry_id, "incorrect login password")
        raise HTTPException(status_code=403, detail="Your login password is incorrect")
    e = await db.password_entries.find_one({"id": entry_id})
    if not e:
        raise HTTPException(status_code=404, detail="Entry not found")
    if not e.get("password_encrypted"):
        raise HTTPException(status_code=404, detail="No password stored for this entry")
    await log_activity(user, action, "password", entry_id, e["name"])
    return e


@router.post("/passwords/{entry_id}/reveal")
async def reveal_password(entry_id: str, body: RevealBody, user: dict = Depends(get_current_user)):
    e = await _verify_reveal(entry_id, body, user, "password_revealed")
    return {"id": entry_id, "password": decrypt_secret(e["password_encrypted"]), "hide_after_seconds": 30}


@router.post("/passwords/{entry_id}/copy")
async def copy_password(entry_id: str, body: RevealBody, user: dict = Depends(get_current_user)):
    """Same verification as reveal; logged separately as password_copied (clipboard-only on the client)."""
    e = await _verify_reveal(entry_id, body, user, "password_copied")
    return {"id": entry_id, "password": decrypt_secret(e["password_encrypted"]), "clear_after_seconds": 30}


@router.get("/passwords/generate")
async def generate_password(length: int = 16, user: dict = Depends(get_current_user)):
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*-_+="
    length = max(12, min(length, 40))
    pw = "".join(secrets.choice(alphabet) for _ in range(length))
    return {"password": pw}


# ---------------- Idempotent seed (from existing subscription stack) ----------------
def _d(days: int) -> str:
    return (datetime.now(timezone.utc).date() + timedelta(days=days)).isoformat()


async def seed_password_entries():
    seed = [
        {"name": "Figma", "login_url": "https://figma.com", "username": "design@dotindot.in", "plan": "Professional",
         "renewal_date": _d(45), "cost": 12000, "owner_id": "user-designer", "branch_id": "seed-branch-01",
         "twofa_enabled": True, "twofa_method": "app", "last_password_changed": _d(-30), "change_interval_days": 90},
        {"name": "Adobe Creative Cloud", "login_url": "https://adobe.com", "username": "studio@dotindot.in", "plan": "All Apps",
         "renewal_date": _d(60), "cost": 48000, "owner_id": "user-designer", "branch_id": "seed-branch-01",
         "twofa_enabled": False, "twofa_method": None, "last_password_changed": _d(-150), "change_interval_days": 90},
        {"name": "Google Workspace", "login_url": "https://admin.google.com", "username": "admin@dotindot.in", "plan": "Business Standard",
         "renewal_date": _d(5), "cost": 30000, "owner_id": "user-admin", "branch_id": "seed-branch-01",
         "twofa_enabled": True, "twofa_method": "app", "last_password_changed": _d(-20), "change_interval_days": 90},
        {"name": "OpenAI Platform", "login_url": "https://platform.openai.com", "username": "ai@dotindot.in", "plan": "Pay-as-you-go",
         "renewal_date": None, "cost": 25000, "owner_id": "user-dev", "branch_id": "seed-branch-01",
         "twofa_enabled": False, "twofa_method": None, "last_password_changed": _d(-100), "change_interval_days": 60},
        {"name": "Canva Teams", "login_url": "https://canva.com", "username": "social@dotindot.in", "plan": "Teams",
         "renewal_date": _d(25), "cost": 9000, "owner_id": "user-social", "branch_id": "seed-branch-02",
         "twofa_enabled": True, "twofa_method": "email", "last_password_changed": _d(-15), "change_interval_days": 60},
        {"name": "GitHub", "login_url": "https://github.com", "username": "dev@dotindot.in", "plan": "Team",
         "renewal_date": _d(80), "cost": 15000, "owner_id": "user-dev", "branch_id": "seed-branch-01",
         "twofa_enabled": True, "twofa_method": "app", "last_password_changed": _d(-40), "change_interval_days": 90},
        {"name": "Meta Business Suite", "login_url": "https://business.facebook.com", "username": "ads@dotindot.in", "plan": "Free",
         "renewal_date": None, "cost": 0, "owner_id": "user-ads", "branch_id": "seed-branch-02",
         "twofa_enabled": True, "twofa_method": "sms", "last_password_changed": _d(-85), "change_interval_days": 90},
        {"name": "Zoho Books", "login_url": "https://books.zoho.in", "username": "finance@dotindot.in", "plan": "Premium",
         "renewal_date": _d(20), "cost": 18000, "owner_id": "user-finance", "branch_id": "seed-branch-01",
         "twofa_enabled": False, "twofa_method": None, "last_password_changed": _d(-10), "change_interval_days": 30},
    ]
    for i, s in enumerate(seed, 1):
        sid = f"pw-seed-{i:02d}"
        if await db.password_entries.find_one({"id": sid}):
            continue
        doc = {**s, "id": sid, "currency": "INR", "notes": "Seeded from subscription stack",
               "subscription_id": None, "password_encrypted": encrypt_secret(f"Demo#{sid}!2026"),
               "created_at": datetime.now(timezone.utc).isoformat(), "created_by": "seed"}
        await db.password_entries.insert_one(doc)
