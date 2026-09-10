"""Social media planning. Module gated by 'social' permission.
Writes: admin, social_manager (+super_admin)."""
import uuid
from datetime import datetime, timezone
from typing import Optional
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Depends
from database import db
from auth import get_current_user, require_roles, log_activity

router = APIRouter()

SOCIAL_PLATFORMS = ["instagram", "facebook", "linkedin", "youtube", "x", "tiktok"]
CONTENT_TYPES = ["reel", "static", "carousel", "story", "video", "blog"]
POST_STATUSES = ["planned", "in_review", "approved", "posted"]
SOCIAL_WRITE = ("admin", "social_manager")


class PostCreate(BaseModel):
    client_id: Optional[str] = None
    platform: str = "instagram"
    scheduled_at: str  # ISO datetime or date
    content_type: str = "static"
    caption: Optional[str] = ""
    creative_link: Optional[str] = ""
    status: str = "planned"
    assigned_to: Optional[str] = None
    branch_id: Optional[str] = None


class PostUpdate(BaseModel):
    client_id: Optional[str] = None
    platform: Optional[str] = None
    scheduled_at: Optional[str] = None
    content_type: Optional[str] = None
    caption: Optional[str] = None
    creative_link: Optional[str] = None
    status: Optional[str] = None
    assigned_to: Optional[str] = None
    branch_id: Optional[str] = None


class StatusBody(BaseModel):
    status: str


def _now():
    return datetime.now(timezone.utc).isoformat()


async def _enrich(rows):
    cids = list({r["client_id"] for r in rows if r.get("client_id")})
    uids = list({r["assigned_to"] for r in rows if r.get("assigned_to")})
    clients = await db.clients.find({"id": {"$in": cids}}, {"_id": 0, "id": 1, "name": 1}).to_list(200)
    users = await db.users.find({"id": {"$in": uids}}, {"_id": 0, "id": 1, "name": 1}).to_list(200)
    cmap = {c["id"]: c["name"] for c in clients}
    umap = {u["id"]: u["name"] for u in users}
    for r in rows:
        r["client_name"] = cmap.get(r.get("client_id"), "")
        r["assigned_to_name"] = umap.get(r.get("assigned_to"), "")
    return rows


@router.get("/social/posts")
async def list_posts(
    month: Optional[str] = None,  # YYYY-MM
    client_id: Optional[str] = None, platform: Optional[str] = None, status: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    q = {}
    if month:
        q["scheduled_at"] = {"$gte": month + "-01", "$lt": month + "-32"}
    if client_id:
        q["client_id"] = client_id
    if platform:
        q["platform"] = platform
    if status:
        q["status"] = status
    from permissions import branch_scope
    branches = branch_scope(user)
    if branches is not None:
        q["branch_id"] = {"$in": branches}
    rows = await db.social_posts.find(q, {"_id": 0}).sort("scheduled_at", 1).to_list(1000)
    return await _enrich(rows)


@router.get("/social/summary")
async def social_summary(month: Optional[str] = None, user: dict = Depends(get_current_user)):
    month = month or datetime.now(timezone.utc).date().isoformat()[:7]
    rows = await db.social_posts.find(
        {"scheduled_at": {"$gte": month + "-01", "$lt": month + "-32"}}, {"_id": 0, "status": 1, "platform": 1}).to_list(2000)
    by_status, by_platform = {}, {}
    for r in rows:
        by_status[r["status"]] = by_status.get(r["status"], 0) + 1
        by_platform[r["platform"]] = by_platform.get(r["platform"], 0) + 1
    return {"month": month, "total": len(rows),
            "by_status": [{"name": k, "value": v} for k, v in by_status.items()],
            "by_platform": [{"name": k, "value": v} for k, v in by_platform.items()]}


@router.post("/social/posts")
async def create_post(body: PostCreate, user: dict = Depends(require_roles(*SOCIAL_WRITE))):
    if body.platform not in SOCIAL_PLATFORMS or body.content_type not in CONTENT_TYPES or body.status not in POST_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid platform, content type or status")
    doc = {"id": str(uuid.uuid4()), **body.dict(), "created_at": _now(), "updated_at": _now(), "created_by": user["id"]}
    await db.social_posts.insert_one(dict(doc))
    await log_activity(user, "social_post_created", "social_post", doc["id"],
                       f"{body.platform} {body.content_type} · {body.scheduled_at[:10]}")
    doc.pop("_id", None)
    return (await _enrich([doc]))[0]


@router.put("/social/posts/{post_id}")
async def update_post(post_id: str, body: PostUpdate, user: dict = Depends(require_roles(*SOCIAL_WRITE))):
    p = await db.social_posts.find_one({"id": post_id})
    if not p:
        raise HTTPException(status_code=404, detail="Post not found")
    updates = {k: v for k, v in body.dict().items() if v is not None}
    updates["updated_at"] = _now()
    await db.social_posts.update_one({"id": post_id}, {"$set": updates})
    await log_activity(user, "social_post_updated", "social_post", post_id, f"{p['platform']} · {p['scheduled_at'][:10]}")
    row = await db.social_posts.find_one({"id": post_id}, {"_id": 0})
    return (await _enrich([row]))[0]


@router.post("/social/posts/{post_id}/status")
async def set_status(post_id: str, body: StatusBody, user: dict = Depends(require_roles(*SOCIAL_WRITE))):
    if body.status not in POST_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")
    p = await db.social_posts.find_one({"id": post_id})
    if not p:
        raise HTTPException(status_code=404, detail="Post not found")
    await db.social_posts.update_one({"id": post_id}, {"$set": {"status": body.status, "updated_at": _now()}})
    await log_activity(user, "social_post_status_changed", "social_post", post_id,
                       f"{p['platform']} · {p['scheduled_at'][:10]} → {body.status}")
    row = await db.social_posts.find_one({"id": post_id}, {"_id": 0})
    return (await _enrich([row]))[0]


@router.delete("/social/posts/{post_id}")
async def delete_post(post_id: str, user: dict = Depends(require_roles(*SOCIAL_WRITE))):
    p = await db.social_posts.find_one({"id": post_id})
    if not p:
        raise HTTPException(status_code=404, detail="Post not found")
    await db.social_posts.delete_one({"id": post_id})
    await log_activity(user, "social_post_deleted", "social_post", post_id, f"{p['platform']} · {p['scheduled_at'][:10]}")
    return {"ok": True}
