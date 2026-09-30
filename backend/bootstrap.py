"""Minimal startup guard (replaces all demo seeding): guarantee one super_admin exists."""
import os
import uuid
import logging
from datetime import datetime, timezone
from database import db
from auth import hash_password

logger = logging.getLogger(__name__)


async def ensure_super_admin():
    if await db.users.count_documents({"role": "super_admin"}) > 0:
        return
    email = os.environ.get("BOOTSTRAP_ADMIN_EMAIL", "admin@dotindot.in")
    password = os.environ.get("BOOTSTRAP_ADMIN_PASSWORD", "Dotindot@2026")
    await db.users.insert_one({
        "id": "user-admin", "email": email, "name": "Super Admin", "role": "super_admin",
        "password_hash": hash_password(password), "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat(), "uid": str(uuid.uuid4()),
    })
    logger.warning(f"No super_admin found — bootstrapped {email}")
