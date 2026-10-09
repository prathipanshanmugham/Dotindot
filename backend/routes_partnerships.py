import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends
from database import db
from models import PartnershipCreate, PartnershipUpdate
from auth import require_roles, log_activity, get_current_user
from permissions import has_permission

router = APIRouter()

READ_ROLES = ("admin", "finance", "sales", "pm")
WRITE_ROLES = ("admin", "finance")

RENEWAL_ALERT_DAYS = 60


def _now():
    return datetime.now(timezone.utc).isoformat()


def _enrich(p: dict) -> dict:
    today = datetime.now(timezone.utc).date()
    days = None
    if p.get("renewal_date"):
        try:
            days = (datetime.fromisoformat(p["renewal_date"]).date() - today).days
        except ValueError:
            pass
    p["days_to_renewal"] = days
    p["renewing_soon"] = days is not None and 0 <= days <= RENEWAL_ALERT_DAYS and p.get("status") == "active"
    p["unused_value"] = sum(b.get("credit_value", 0) for b in p.get("benefits", []) if not b.get("used"))
    p["unused_count"] = sum(1 for b in p.get("benefits", []) if not b.get("used"))
    return p


@router.get("/partnerships")
async def list_partnerships(user: dict = Depends(require_roles(*READ_ROLES))):
    rows = await db.partnerships.find({}, {"_id": 0}).sort("name", 1).to_list(500)
    return [_enrich(p) for p in rows]


@router.get("/partnerships/stats")
async def partnership_stats(user: dict = Depends(require_roles(*READ_ROLES))):
    rows = [_enrich(p) for p in await db.partnerships.find({}, {"_id": 0}).to_list(500)]
    active = [p for p in rows if p.get("status") == "active"]
    renewing = sorted([p for p in rows if p["renewing_soon"]], key=lambda x: x["days_to_renewal"])
    annual_cost = 0
    for p in active:
        mult = {"monthly": 12, "quarterly": 4, "yearly": 1}.get(p.get("billing_cycle", "yearly"), 1)
        annual_cost += p.get("cost", 0) * mult
    return {
        "total": len(rows),
        "active": len(active),
        "renewing_soon": [
            {"id": p["id"], "name": p["name"], "renewal_date": p["renewal_date"],
             "days_to_renewal": p["days_to_renewal"], "cost": p.get("cost", 0)}
            for p in renewing
        ],
        "annual_cost": annual_cost,
        "unused_benefits_value": sum(p["unused_value"] for p in active),
        "unused_benefits_count": sum(p["unused_count"] for p in active),
    }


@router.post("/partnerships")
async def create_partnership(body: PartnershipCreate, user: dict = Depends(require_roles(*WRITE_ROLES))):
    doc = {"id": str(uuid.uuid4()), **body.dict(), "created_at": _now(), "updated_at": _now(), "created_by": user["id"]}
    await db.partnerships.insert_one(dict(doc))
    await log_activity(user, "partnership_created", "partnership", doc["id"], doc["name"])
    doc.pop("_id", None)
    return _enrich(doc)


@router.put("/partnerships/{pid}")
async def update_partnership(pid: str, body: PartnershipUpdate, user: dict = Depends(require_roles(*WRITE_ROLES))):
    p = await db.partnerships.find_one({"id": pid})
    if not p:
        raise HTTPException(status_code=404, detail="Partnership not found")
    updates = {k: v for k, v in body.dict().items() if v is not None}
    if "benefits" in updates:
        updates["benefits"] = [b if isinstance(b, dict) else b for b in updates["benefits"]]
    updates["updated_at"] = _now()
    await db.partnerships.update_one({"id": pid}, {"$set": updates})
    await log_activity(user, "partnership_updated", "partnership", pid, p["name"])
    return _enrich(await db.partnerships.find_one({"id": pid}, {"_id": 0}))


@router.delete("/partnerships/{pid}")
async def delete_partnership(pid: str, user: dict = Depends(get_current_user)):
    """v2.6: same rules as every other delete — needs partnerships.delete, lands in the 24h recycle bin."""
    from routes_records import hard_delete
    if not has_permission(user, "partnerships.delete"):
        raise HTTPException(status_code=403, detail="You don't have delete permission for partnerships")
    p = await db.partnerships.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Partnership not found")
    return await hard_delete("partnerships", p, user)


@router.post("/partnerships/{pid}/benefits/{benefit_id}/toggle")
async def toggle_benefit(pid: str, benefit_id: str, user: dict = Depends(require_roles(*WRITE_ROLES))):
    p = await db.partnerships.find_one({"id": pid})
    if not p:
        raise HTTPException(status_code=404, detail="Partnership not found")
    benefits = p.get("benefits", [])
    target = next((b for b in benefits if b.get("id") == benefit_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Benefit not found")
    target["used"] = not target.get("used", False)
    target["used_at"] = _now() if target["used"] else None
    await db.partnerships.update_one({"id": pid}, {"$set": {"benefits": benefits, "updated_at": _now()}})
    action = "benefit_marked_used" if target["used"] else "benefit_marked_unused"
    await log_activity(user, action, "partnership", pid, f"{p['name']} · {target['title']}")
    return _enrich(await db.partnerships.find_one({"id": pid}, {"_id": 0}))
