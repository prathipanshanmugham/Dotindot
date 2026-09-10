"""Influencer management. Module gated by 'influencers' permission.
Writes: admin, social_manager, sales (+super_admin)."""
import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Depends
from database import db
from auth import get_current_user, require_roles, log_activity

router = APIRouter()

NICHES = ["fashion", "tech", "food", "travel", "fitness", "finance", "other"]
BOOKING_STATUSES = ["available", "negotiating", "booked", "blacklisted"]
INF_WRITE = ("admin", "social_manager", "sales")


class PlatformStat(BaseModel):
    platform: str
    followers: int = 0
    engagement_rate: float = 0


class InfluencerCreate(BaseModel):
    name: str
    handle: str
    niche: str = "other"
    platforms: List[PlatformStat] = []
    rate_card: Dict[str, float] = {}  # reel/post/story/video → ₹
    contact_email: Optional[str] = ""
    contact_phone: Optional[str] = ""
    manager_name: Optional[str] = ""
    booking_status: str = "available"
    notes: Optional[str] = ""


class InfluencerUpdate(BaseModel):
    name: Optional[str] = None
    handle: Optional[str] = None
    niche: Optional[str] = None
    platforms: Optional[List[PlatformStat]] = None
    rate_card: Optional[Dict[str, float]] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    manager_name: Optional[str] = None
    booking_status: Optional[str] = None
    notes: Optional[str] = None


class CollabIn(BaseModel):
    client_id: Optional[str] = None
    campaign_name: str
    date: str
    deliverable: str = ""
    amount: float = 0
    note: Optional[str] = ""


def _now():
    return datetime.now(timezone.utc).isoformat()


def _computed(i: dict) -> dict:
    i["total_followers"] = sum(p.get("followers", 0) for p in i.get("platforms", []))
    rates = i.get("platforms", [])
    i["avg_engagement"] = round(sum(p.get("engagement_rate", 0) for p in rates) / len(rates), 2) if rates else 0
    return i


async def _client_map():
    rows = await db.clients.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(1000)
    return {r["id"]: r["name"] for r in rows}


@router.get("/influencers")
async def list_influencers(
    niche: Optional[str] = None, platform: Optional[str] = None, booking_status: Optional[str] = None,
    min_followers: Optional[int] = None, max_followers: Optional[int] = None,
    search: Optional[str] = None, user: dict = Depends(get_current_user),
):
    q = {}
    if niche:
        q["niche"] = niche
    if booking_status:
        q["booking_status"] = booking_status
    if platform:
        q["platforms.platform"] = platform
    if search:
        q["$or"] = [{"name": {"$regex": search, "$options": "i"}}, {"handle": {"$regex": search, "$options": "i"}}]
    rows = [_computed(i) for i in await db.influencers.find(q, {"_id": 0}).sort("name", 1).to_list(500)]
    if min_followers is not None:
        rows = [r for r in rows if r["total_followers"] >= min_followers]
    if max_followers is not None:
        rows = [r for r in rows if r["total_followers"] <= max_followers]
    return rows


@router.get("/influencers/{inf_id}")
async def get_influencer(inf_id: str, user: dict = Depends(get_current_user)):
    i = await db.influencers.find_one({"id": inf_id}, {"_id": 0})
    if not i:
        raise HTTPException(status_code=404, detail="Influencer not found")
    cmap = await _client_map()
    for c in i.get("collaborations", []):
        c["client_name"] = cmap.get(c.get("client_id"), "")
    i["collaborations"] = sorted(i.get("collaborations", []), key=lambda c: c.get("date") or "", reverse=True)
    return _computed(i)


@router.post("/influencers")
async def create_influencer(body: InfluencerCreate, user: dict = Depends(require_roles(*INF_WRITE))):
    if body.niche not in NICHES or body.booking_status not in BOOKING_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid niche or booking status")
    doc = {"id": str(uuid.uuid4()), **body.dict(), "collaborations": [],
           "created_at": _now(), "updated_at": _now(), "created_by": user["id"]}
    await db.influencers.insert_one(dict(doc))
    await log_activity(user, "influencer_created", "influencer", doc["id"], doc["name"])
    doc.pop("_id", None)
    return _computed(doc)


@router.put("/influencers/{inf_id}")
async def update_influencer(inf_id: str, body: InfluencerUpdate, user: dict = Depends(require_roles(*INF_WRITE))):
    i = await db.influencers.find_one({"id": inf_id})
    if not i:
        raise HTTPException(status_code=404, detail="Influencer not found")
    updates = {k: v for k, v in body.dict().items() if v is not None}
    if "platforms" in updates:
        updates["platforms"] = [p if isinstance(p, dict) else p for p in updates["platforms"]]
    updates["updated_at"] = _now()
    await db.influencers.update_one({"id": inf_id}, {"$set": updates})
    await log_activity(user, "influencer_updated", "influencer", inf_id, i["name"])
    return _computed(await db.influencers.find_one({"id": inf_id}, {"_id": 0}))


@router.delete("/influencers/{inf_id}")
async def delete_influencer(inf_id: str, user: dict = Depends(require_roles(*INF_WRITE))):
    i = await db.influencers.find_one({"id": inf_id})
    if not i:
        raise HTTPException(status_code=404, detail="Influencer not found")
    await db.influencers.delete_one({"id": inf_id})
    await log_activity(user, "influencer_deleted", "influencer", inf_id, i["name"])
    return {"ok": True}


@router.post("/influencers/{inf_id}/collabs")
async def add_collab(inf_id: str, body: CollabIn, user: dict = Depends(require_roles(*INF_WRITE))):
    i = await db.influencers.find_one({"id": inf_id})
    if not i:
        raise HTTPException(status_code=404, detail="Influencer not found")
    entry = {"id": str(uuid.uuid4()), **body.dict(), "added_by": user["name"]}
    await db.influencers.update_one({"id": inf_id}, {"$push": {"collaborations": entry}, "$set": {"updated_at": _now()}})
    await log_activity(user, "influencer_collab_added", "influencer", inf_id, f"{i['name']} · {body.campaign_name}")
    return await get_influencer(inf_id, user)
