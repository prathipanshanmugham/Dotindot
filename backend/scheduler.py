"""Daily background job that purges activity logs older than RETENTION_DAYS."""
import uuid
import logging
from datetime import datetime, timezone, timedelta
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from database import db

logger = logging.getLogger(__name__)

RETENTION_DAYS = 90
_scheduler = None


async def purge_old_logs(trigger: str = "scheduled") -> dict:
    cutoff = (datetime.now(timezone.utc) - timedelta(days=RETENTION_DAYS)).isoformat()
    res = await db.activity_logs.delete_many({"timestamp": {"$lt": cutoff}})
    run = {
        "id": str(uuid.uuid4()),
        "run_at": datetime.now(timezone.utc).isoformat(),
        "deleted_count": res.deleted_count,
        "trigger": trigger,
        "retention_days": RETENTION_DAYS,
        "cutoff": cutoff,
    }
    await db.purge_runs.insert_one(dict(run))
    logger.info(f"Log purge ({trigger}): deleted {res.deleted_count} logs older than {cutoff}")
    return run


async def purge_deleted_records(trigger: str = "scheduled") -> int:
    """Hourly: permanently remove workspace delete-snapshots older than 24h."""
    cutoff = datetime.now(timezone.utc).isoformat()
    res = await db.deleted_records.delete_many({"expires_at": {"$lt": cutoff}})
    if res.deleted_count:
        logger.info(f"Recycle-bin purge ({trigger}): {res.deleted_count} snapshots now permanent")
    return res.deleted_count


def start_scheduler():
    global _scheduler
    if _scheduler:
        return
    _scheduler = AsyncIOScheduler(timezone="UTC")
    _scheduler.add_job(purge_old_logs, CronTrigger(hour=2, minute=30), id="log_purge_daily", replace_existing=True)
    _scheduler.add_job(purge_deleted_records, CronTrigger(minute=15), id="recycle_purge_hourly", replace_existing=True)
    _scheduler.start()
    logger.info("Schedulers started (log purge daily 02:30 UTC, recycle-bin purge hourly)")


def get_next_run():
    if _scheduler:
        job = _scheduler.get_job("log_purge_daily")
        if job and job.next_run_time:
            return job.next_run_time.isoformat()
    return None


def stop_scheduler():
    global _scheduler
    if _scheduler:
        _scheduler.shutdown(wait=False)
        _scheduler = None
