"""Ads management — MANUAL metric entry (no live platform APIs).
Module gated by 'ads' permission. Writes: admin, ads_manager (+super_admin)."""
import uuid
from datetime import datetime, timezone
from typing import Optional, List
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Depends
from database import db
from auth import get_current_user, require_roles, log_activity
from permissions import scoped_client_ids, has_permission

router = APIRouter()

PLATFORMS = ["google_ads", "meta_ads", "amazon_ppc", "linkedin", "other"]
AD_WRITE = ("admin", "ads_manager")


class MetricsIn(BaseModel):
    date: str
    spend: float = 0
    impressions: int = 0
    clicks: int = 0
    conversions: int = 0
    revenue: float = 0


class CampaignCreate(BaseModel):
    name: str
    platform: str = "google_ads"
    client_id: Optional[str] = None
    branch_id: Optional[str] = None
    status: str = "active"  # active | paused | completed
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    budget: float = 0
    notes: Optional[str] = ""
    currency: str = "INR"


class CampaignUpdate(BaseModel):
    name: Optional[str] = None
    platform: Optional[str] = None
    client_id: Optional[str] = None
    branch_id: Optional[str] = None
    status: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    budget: Optional[float] = None
    notes: Optional[str] = None


def _now():
    return datetime.now(timezone.utc).isoformat()


def compute_metrics(c: dict) -> dict:
    hist = sorted(c.get("metrics_history", []), key=lambda m: m["date"])
    latest = {"spend": 0, "impressions": 0, "clicks": 0, "conversions": 0, "revenue": 0}
    for m in hist:
        for k in latest:
            latest[k] += m.get(k, 0)
    c["metrics"] = {
        **{k: round(v, 2) for k, v in latest.items()},
        "ctr": round(latest["clicks"] / latest["impressions"] * 100, 2) if latest["impressions"] else 0,
        "cpc": round(latest["spend"] / latest["clicks"], 2) if latest["clicks"] else 0,
        "cost_per_conversion": round(latest["spend"] / latest["conversions"], 2) if latest["conversions"] else 0,
        "roas": round(latest["revenue"] / latest["spend"], 2) if latest["spend"] else 0,
    }
    c["metrics_history"] = hist
    return c


async def _client_map():
    rows = await db.clients.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(1000)
    return {r["id"]: r["name"] for r in rows}


@router.get("/ads/overview")
async def ads_overview(user: dict = Depends(get_current_user)):
    rows = [compute_metrics(c) for c in await db.ad_campaigns.find({}, {"_id": 0}).to_list(500)]
    by_platform = {}
    for c in rows:
        b = by_platform.setdefault(c["platform"], {"platform": c["platform"], "spend": 0, "revenue": 0, "campaigns": 0})
        b["spend"] = round(b["spend"] + c["metrics"]["spend"], 2)
        b["revenue"] = round(b["revenue"] + c["metrics"]["revenue"], 2)
        b["campaigns"] += 1
    spend = sum(c["metrics"]["spend"] for c in rows)
    revenue = sum(c["metrics"]["revenue"] for c in rows)
    return {
        "totals": {
            "campaigns": len(rows), "active": sum(1 for c in rows if c["status"] == "active"),
            "spend": round(spend, 2), "revenue": round(revenue, 2),
            "roas": round(revenue / spend, 2) if spend else 0,
            "conversions": sum(c["metrics"]["conversions"] for c in rows),
        },
        "by_platform": list(by_platform.values()),
        "roas_by_campaign": sorted(
            [{"name": c["name"], "roas": c["metrics"]["roas"], "spend": c["metrics"]["spend"]} for c in rows],
            key=lambda x: -x["roas"])[:10],
    }


@router.get("/ads/campaigns")
async def list_campaigns(
    platform: Optional[str] = None, client_id: Optional[str] = None, status: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    q = {}
    if platform:
        q["platform"] = platform
    if client_id:
        q["client_id"] = client_id
    if status:
        q["status"] = status
    ids = await scoped_client_ids(user)
    if ids is not None:
        q["client_id"] = {"$in": ids} if not client_id else client_id
    rows = [compute_metrics(c) for c in await db.ad_campaigns.find(q, {"_id": 0}).sort("name", 1).to_list(500)]
    cmap = await _client_map()
    for c in rows:
        c["client_name"] = cmap.get(c.get("client_id"), "")
    return rows


@router.get("/ads/campaigns/{cid}")
async def get_campaign(cid: str, user: dict = Depends(get_current_user)):
    c = await db.ad_campaigns.find_one({"id": cid}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Campaign not found")
    compute_metrics(c)
    cmap = await _client_map()
    c["client_name"] = cmap.get(c.get("client_id"), "")
    # per-snapshot computed trend
    c["trend"] = [{
        "date": m["date"], "spend": m.get("spend", 0), "revenue": m.get("revenue", 0),
        "clicks": m.get("clicks", 0), "conversions": m.get("conversions", 0),
        "roas": round(m.get("revenue", 0) / m["spend"], 2) if m.get("spend") else 0,
    } for m in c["metrics_history"]]
    return c


@router.post("/ads/campaigns")
async def create_campaign(body: CampaignCreate, user: dict = Depends(require_roles(*AD_WRITE))):
    if body.platform not in PLATFORMS:
        raise HTTPException(status_code=400, detail="Invalid platform")
    doc = {"id": str(uuid.uuid4()), **body.dict(), "metrics_history": [],
           "created_at": _now(), "updated_at": _now(), "created_by": user["id"]}
    await db.ad_campaigns.insert_one(dict(doc))
    await log_activity(user, "ad_campaign_created", "ad_campaign", doc["id"], doc["name"])
    doc.pop("_id", None)
    return compute_metrics(doc)


@router.put("/ads/campaigns/{cid}")
async def update_campaign(cid: str, body: CampaignUpdate, user: dict = Depends(require_roles(*AD_WRITE))):
    c = await db.ad_campaigns.find_one({"id": cid})
    if not c:
        raise HTTPException(status_code=404, detail="Campaign not found")
    updates = {k: v for k, v in body.dict().items() if v is not None}
    updates["updated_at"] = _now()
    await db.ad_campaigns.update_one({"id": cid}, {"$set": updates})
    await log_activity(user, "ad_campaign_updated", "ad_campaign", cid, c["name"])
    return compute_metrics(await db.ad_campaigns.find_one({"id": cid}, {"_id": 0}))


@router.delete("/ads/campaigns/{cid}")
async def delete_campaign(cid: str, user: dict = Depends(require_roles(*AD_WRITE))):
    c = await db.ad_campaigns.find_one({"id": cid})
    if not c:
        raise HTTPException(status_code=404, detail="Campaign not found")
    await db.ad_campaigns.delete_one({"id": cid})
    await log_activity(user, "ad_campaign_deleted", "ad_campaign", cid, c["name"])
    return {"ok": True}


@router.post("/ads/campaigns/{cid}/metrics")
async def add_metrics(cid: str, body: MetricsIn, user: dict = Depends(require_roles(*AD_WRITE))):
    c = await db.ad_campaigns.find_one({"id": cid})
    if not c:
        raise HTTPException(status_code=404, detail="Campaign not found")
    entry = {"id": str(uuid.uuid4()), **body.dict(), "entered_by": user["name"], "entered_at": _now()}
    await db.ad_campaigns.update_one({"id": cid}, {"$push": {"metrics_history": entry}, "$set": {"updated_at": _now()}})
    await log_activity(user, "ad_metrics_added", "ad_campaign", cid, f"{c['name']} · {body.date}")
    return compute_metrics(await db.ad_campaigns.find_one({"id": cid}, {"_id": 0}))


# ---------- Client growth rollup (lives under /api/clients → 'clients' permission) ----------
@router.get("/clients/{client_id}/growth-rollup")
async def client_growth_rollup(client_id: str, user: dict = Depends(get_current_user)):
    campaigns = [compute_metrics(c) for c in await db.ad_campaigns.find({"client_id": client_id}, {"_id": 0}).to_list(100)]
    spend = sum(c["metrics"]["spend"] for c in campaigns)
    revenue = sum(c["metrics"]["revenue"] for c in campaigns)
    month = datetime.now(timezone.utc).date().isoformat()[:7]
    posts = await db.social_posts.find({"client_id": client_id}, {"_id": 0}).to_list(500)
    month_posts = [p for p in posts if (p.get("scheduled_at") or "").startswith(month)]
    by_status = {}
    for p in month_posts:
        by_status[p["status"]] = by_status.get(p["status"], 0) + 1
    collabs = []
    for inf in await db.influencers.find({"collaborations.client_id": client_id}, {"_id": 0}).to_list(100):
        for col in inf.get("collaborations", []):
            if col.get("client_id") == client_id:
                collabs.append({**col, "influencer_id": inf["id"], "influencer_name": inf["name"], "handle": inf.get("handle", "")})
    collabs.sort(key=lambda c: c.get("date") or "", reverse=True)
    return {
        "ads": {
            "campaigns": [{"id": c["id"], "name": c["name"], "platform": c["platform"], "status": c["status"],
                           "spend": c["metrics"]["spend"], "revenue": c["metrics"]["revenue"], "roas": c["metrics"]["roas"]}
                          for c in campaigns],
            "total_spend": round(spend, 2), "total_revenue": round(revenue, 2),
            "roas": round(revenue / spend, 2) if spend else 0,
        },
        "social": {"month": month, "total_this_month": len(month_posts),
                   "by_status": [{"name": k, "value": v} for k, v in by_status.items()],
                   "total_all_time": len(posts)},
        "influencer_collabs": collabs,
    }
