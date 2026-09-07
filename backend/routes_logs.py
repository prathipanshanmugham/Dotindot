from typing import Optional
from fastapi import APIRouter, Depends, Query
from database import db
from auth import require_roles, log_activity
from scheduler import purge_old_logs, get_next_run, RETENTION_DAYS

router = APIRouter()


def _build_query(user_id, action, entity_type, date_from, date_to):
    q = {}
    if user_id:
        q["user_id"] = user_id
    if action:
        q["action"] = action
    if entity_type:
        q["entity_type"] = entity_type
    ts = {}
    if date_from:
        ts["$gte"] = date_from
    if date_to:
        ts["$lte"] = date_to + "T23:59:59.999999+00:00" if len(date_to) == 10 else date_to
    if ts:
        q["timestamp"] = ts
    return q


@router.get("/logs")
async def list_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    user_id: Optional[str] = None,
    action: Optional[str] = None,
    entity_type: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    user: dict = Depends(require_roles("admin")),
):
    q = _build_query(user_id, action, entity_type, date_from, date_to)
    total = await db.activity_logs.count_documents(q)
    items = (
        await db.activity_logs.find(q, {"_id": 0})
        .sort("timestamp", -1)
        .skip((page - 1) * page_size)
        .limit(page_size)
        .to_list(page_size)
    )
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/logs/meta")
async def logs_meta(user: dict = Depends(require_roles("admin"))):
    actions = await db.activity_logs.distinct("action")
    entity_types = [e for e in await db.activity_logs.distinct("entity_type") if e]
    users_agg = await db.activity_logs.aggregate([
        {"$group": {"_id": "$user_id", "name": {"$first": "$user_name"}, "email": {"$first": "$user_email"}}},
        {"$sort": {"name": 1}},
    ]).to_list(500)
    users = [{"id": u["_id"], "name": u.get("name"), "email": u.get("email")} for u in users_agg if u["_id"]]

    last_run = await db.purge_runs.find_one({}, {"_id": 0}, sort=[("run_at", -1)])
    from datetime import datetime, timezone, timedelta
    cutoff = (datetime.now(timezone.utc) - timedelta(days=RETENTION_DAYS)).isoformat()
    purgeable = await db.activity_logs.count_documents({"timestamp": {"$lt": cutoff}})
    total_logs = await db.activity_logs.count_documents({})

    return {
        "actions": sorted(actions),
        "entity_types": sorted(entity_types),
        "users": users,
        "total_logs": total_logs,
        "purge": {
            "retention_days": RETENTION_DAYS,
            "last_run": last_run,
            "next_run": get_next_run(),
            "purgeable_count": purgeable,
        },
    }


@router.post("/logs/purge")
async def manual_purge(user: dict = Depends(require_roles("admin"))):
    run = await purge_old_logs(trigger="manual")
    await log_activity(user, "logs_purged", "logs", run["id"], f"Purged {run['deleted_count']} logs older than {RETENTION_DAYS} days")
    run.pop("_id", None)
    return run
