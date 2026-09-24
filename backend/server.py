from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import logging
from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware

from database import db, client
from seed import seed_database
from seed_finance import seed_finance
from seed_sales import seed_sales
from seed_phase4 import seed_phase4
from seed_v2 import seed_v2
from storage import init_storage
from scheduler import start_scheduler, stop_scheduler
from permissions import permission_middleware
from routes_auth import router as auth_router
from routes_users import router as users_router
from routes_clients import router as clients_router
from routes_projects import router as projects_router
from routes_misc import router as misc_router
from routes_finance import router as finance_router
from routes_sales import router as sales_router
from routes_ceo import router as ceo_router
from routes_employees import router as employees_router
from routes_logs import router as logs_router
from routes_partnerships import router as partnerships_router
from routes_locations import router as locations_router
from routes_exports import router as exports_router
from routes_reports import router as reports_router
from routes_access import router as access_router
from routes_assets import router as assets_router
from routes_ads import router as ads_router
from routes_social import router as social_router
from routes_influencers import router as influencers_router
from routes_hud import router as hud_router
from routes_workspace import router as workspace_router

app = FastAPI(
    title="Dotindot Internal Operations Platform",
    openapi_url="/api/openapi.json",
    docs_url="/api/docs",
)

for r in (auth_router, users_router, clients_router, projects_router, misc_router, finance_router, sales_router, ceo_router,
          employees_router, logs_router, partnerships_router, locations_router, exports_router, reports_router,
          access_router, assets_router, ads_router, social_router, influencers_router, hud_router, workspace_router):
    app.include_router(r, prefix="/api")

# Granular permission enforcement (registered before CORS so CORS stays outermost)
app.middleware("http")(permission_middleware)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.get("/api/")
async def root():
    return {"message": "Dotindot Ops API", "status": "ok"}


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.clients.create_index("id", unique=True)
    await db.projects.create_index("id", unique=True)
    await db.activity_logs.create_index("timestamp")
    await db.transactions.create_index("id", unique=True)
    await db.transactions.create_index("date")
    await db.expenses.create_index("id", unique=True)
    await db.subscriptions.create_index("id", unique=True)
    await db.budgets.create_index("id", unique=True)
    await db.campaigns.create_index("id", unique=True)
    await db.leads.create_index("id", unique=True)
    await db.quotes.create_index("id", unique=True)
    await db.targets.create_index("id", unique=True)
    await db.lead_activities.create_index("lead_id")
    await db.training_courses.create_index("id", unique=True)
    await db.training_assignments.create_index("id", unique=True)
    await db.training_assignments.create_index("user_id")
    await db.partnerships.create_index("id", unique=True)
    await db.branches.create_index("id", unique=True)
    await db.assets.create_index("id", unique=True)
    await db.ad_campaigns.create_index("id", unique=True)
    await db.social_posts.create_index("id", unique=True)
    await db.social_posts.create_index("scheduled_at")
    await db.influencers.create_index("id", unique=True)
    await db.purge_runs.create_index("run_at")
    # Ignore-proof cleanup: remove any stale test users (test_*@dotindot.test) on every startup
    removed = await db.users.delete_many({"email": {"$regex": r"@dotindot\.test$"}})
    if removed.deleted_count:
        logger.info(f"Removed {removed.deleted_count} stale test users (@dotindot.test)")
    await seed_database()
    await seed_finance()
    await seed_sales()
    await seed_phase4()
    await seed_v2()
    from permissions import load_role_defaults
    await load_role_defaults()
    start_scheduler()
    try:
        init_storage()
        logger.info("Object storage initialized")
    except Exception as e:
        logger.error(f"Object storage init failed (receipt uploads unavailable): {e}")
    logger.info("Startup complete: indexes ensured, seed verified")


@app.on_event("shutdown")
async def shutdown_db_client():
    stop_scheduler()
    client.close()
