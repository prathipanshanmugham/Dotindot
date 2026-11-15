import os
import uuid
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from fastapi import Request, HTTPException, Depends
from cryptography.fernet import Fernet
from database import db

JWT_ALGORITHM = "HS256"

_fernet = Fernet(os.environ["CRED_ENCRYPTION_KEY"].encode())


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def encrypt_secret(secret: str) -> str:
    return _fernet.encrypt(secret.encode("utf-8")).decode("utf-8")


def decrypt_secret(token: str) -> str:
    return _fernet.decrypt(token.encode("utf-8")).decode("utf-8")


def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "type": "access",
        "exp": datetime.now(timezone.utc) + timedelta(hours=12),
    }
    return jwt.encode(payload, os.environ["JWT_SECRET"], algorithm=JWT_ALGORITHM)


async def get_current_user(request: Request) -> dict:
    token = None
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
    if not token:
        token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if token.startswith(("dot_", "dai_")):   # an AI connection (Settings → AI): works as one login, with its limits
        from ai_connector import user_from_token
        return await user_from_token(request, token)
    try:
        payload = jwt.decode(token, os.environ["JWT_SECRET"], algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="Account deactivated")
    return user


# ---------------- Sign-in throttle ----------------
# Wrong passwords are counted for 15 minutes (one backend process on the VPS, so memory is enough): per login from one
# address, per address, and per login from everywhere (high, so a stranger can't lock someone out from their own
# address). Too many → 429 until the window passes. A correct password clears that login's counts.
_FAILS: dict = {}
FAIL_WINDOW = 15 * 60
FAILS_PER_EMAIL_IP = 8
FAILS_PER_IP = 40
FAILS_PER_EMAIL = 100


def client_ip(request: Request) -> str:
    """The visitor's address: nginx passes it as X-Real-IP; a direct call uses the socket's address."""
    ip = request.headers.get("x-real-ip") or (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    return (ip or (request.client.host if request.client else ""))[:64]


def _recent(key: str, now: float) -> list:
    hits = [t for t in _FAILS.get(key, []) if now - t < FAIL_WINDOW]
    if hits:
        _FAILS[key] = hits
    else:
        _FAILS.pop(key, None)
    return hits


def _fail_keys(request: Request, email: str, kind: str):
    ip = client_ip(request)
    return ((f"{kind}:ei:{email}:{ip}", FAILS_PER_EMAIL_IP), (f"ip:{ip}", FAILS_PER_IP), (f"{kind}:e:{email}", FAILS_PER_EMAIL))


def login_guard(request: Request, email: str, kind: str = "staff"):
    now = datetime.now(timezone.utc).timestamp()
    for key, limit in _fail_keys(request, email, kind):
        hits = _recent(key, now)
        if len(hits) >= limit:
            wait = max(1, int((FAIL_WINDOW - (now - hits[0])) // 60) + 1)
            raise HTTPException(status_code=429, detail=f"Too many wrong passwords. Try again in {wait} minute{'s' if wait != 1 else ''}.")


def login_failed(request: Request, email: str, kind: str = "staff"):
    now = datetime.now(timezone.utc).timestamp()
    if len(_FAILS) > 20000:
        _FAILS.clear()
    for key, _ in _fail_keys(request, email, kind):
        _FAILS.setdefault(key, []).append(now)


def login_ok(request: Request, email: str, kind: str = "staff"):
    for key, _ in _fail_keys(request, email, kind):
        if not key.startswith("ip:"):
            _FAILS.pop(key, None)


def require_roles(*roles):
    async def dependency(user: dict = Depends(get_current_user)) -> dict:
        if user["role"] == "super_admin":
            return user
        if user["role"] not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions for this action")
        return user
    return dependency


async def log_activity(user: dict, action: str, entity_type: str = None, entity_id: str = None, entity_name: str = None):
    await db.activity_logs.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user.get("id"),
        "user_email": user.get("email"),
        "user_name": user.get("name"),
        "role": user.get("role"),
        "action": action,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "entity_name": entity_name,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })
