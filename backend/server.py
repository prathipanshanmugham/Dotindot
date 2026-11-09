from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import logging
import math
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware

from database import db, client
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
from routes_passwords import router as passwords_router
from routes_records import router as records_router
from bootstrap import ensure_super_admin
from routes_locations import repair_coordinates
from routes_dashboard import router as dashboard_router
from routes_agents import router as agents_router
from routes_org import router as org_router
from routes_api_credits import router as api_credits_router
from routes_daily import router as daily_router
from routes_client_dashboard import router as client_dashboard_router
from routes_holidays import router as holidays_router
from routes_timesheets import router as timesheets_router
from routes_support import router as support_router
from routes_lead_flow import router as lead_flow_router
from routes_hr import router as hr_router
from routes_payroll import router as payroll_router
from routes_loans import router as loans_router
from routes_investors import router as investors_router
from routes_ai import router as ai_router
from routes_growth import router as growth_router
from routes_billing import router as billing_router
from routes_website import router as website_router
from routes_chat import router as chat_router

app = FastAPI(
    title="Dotindot Internal Operations Platform",
    openapi_url="/api/openapi.json",
    docs_url="/api/docs",
)


@app.exception_handler(RequestValidationError)
async def _validation_error(request: Request, exc: RequestValidationError):
    """Same 422 as FastAPI's default, but never fails on input it can't echo back (NaN, Infinity, bytes)."""
    def safe(v):
        if isinstance(v, float) and not math.isfinite(v):
            return str(v)
        if isinstance(v, dict):
            return {k: safe(x) for k, x in v.items()}
        if isinstance(v, (list, tuple)):
            return [safe(x) for x in v]
        if isinstance(v, (str, int, float, bool)) or v is None:
            return v
        return str(v)
    errors = [{k: safe(v) for k, v in e.items() if k != "ctx"} for e in exc.errors()]
    return JSONResponse(status_code=422, content={"detail": errors})

for r in (auth_router, users_router, clients_router, projects_router, misc_router, finance_router, sales_router, ceo_router,
          employees_router, logs_router, partnerships_router, locations_router, exports_router, reports_router,
          access_router, assets_router, ads_router, social_router, influencers_router, hud_router, workspace_router,
          passwords_router, dashboard_router, records_router, agents_router, org_router,
          api_credits_router, daily_router, client_dashboard_router, holidays_router, timesheets_router,
          support_router, lead_flow_router, hr_router, payroll_router, loans_router, investors_router, ai_router, growth_router, billing_router, website_router, chat_router):
    app.include_router(r, prefix="/api")

# Granular permission enforcement (registered before CORS so CORS stays outermost)
app.middleware("http")(permission_middleware)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],  # lets the browser read download filenames
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
    await db.ai_agents.create_index("id", unique=True)
    await db.ai_agent_usage.create_index("agent_id")
    await db.ai_agent_usage.create_index("date")
    await db.org_nodes.create_index("id", unique=True)
    await db.org_nodes.create_index("parent_id")
    await db.api_accounts.create_index("id", unique=True)
    await db.api_credit_txns.create_index("account_id")
    await db.api_credit_txns.create_index("date")
    await db.daily_reports.create_index("id", unique=True)
    await db.daily_reports.create_index([("user_id", 1), ("date", 1)], unique=True)
    await db.daily_reports.create_index("date")
    await db.portal_users.create_index("email", unique=True)
    await db.portal_users.create_index("client_id")
    await db.holidays.create_index("id", unique=True)
    await db.holidays.create_index("date")
    await db.timesheets.create_index("id", unique=True)
    await db.timesheets.create_index([("user_id", 1), ("week_start", 1)], unique=True)
    await db.timesheets.create_index([("week_start", 1), ("status", 1)])
    # v3.0
    await db.tickets.create_index("id", unique=True)
    await db.tickets.create_index([("kind", 1), ("status", 1)])
    await db.tickets.create_index("client_id")
    await db.tickets.create_index("assignee_id")
    await db.client_leads.create_index("id", unique=True)
    await db.client_leads.create_index([("client_id", 1), ("date", -1)])
    await db.lead_intake_keys.create_index("key", unique=True)
    await db.hr_onboarding.create_index("id", unique=True)
    await db.hr_offboarding.create_index("id", unique=True)
    await db.hr_kt.create_index("id", unique=True)
    await db.hr_skill_plans.create_index("id", unique=True)
    await db.salary_structures.create_index("user_id", unique=True)
    await db.payroll_runs.create_index("month", unique=True)
    await db.payslips.create_index("id", unique=True)
    await db.payslips.create_index([("run_id", 1), ("user_id", 1)])
    await db.pay_items.create_index("id", unique=True)
    await db.pay_items.create_index([("user_id", 1), ("month", 1)])
    await db.incentive_plans.create_index("id", unique=True)
    await db.loans.create_index("id", unique=True)
    await db.investors.create_index("id", unique=True)
    await db.investments.create_index("investor_id")
    await db.investor_returns.create_index("investor_id")
    await db.investor_users.create_index("email", unique=True)
    await db.ai_tokens.create_index("token_hash", unique=True)
    await db.ai_access_log.create_index("at")
    await db.growth_accounts.create_index("id", unique=True)
    await db.growth_accounts.create_index("owner")
    await db.growth_months.create_index("id", unique=True)
    await db.growth_months.create_index([("account_id", 1), ("month", 1)], unique=True)
    await db.growth_months.create_index([("owner", 1), ("month", 1)])
    await db.billing_docs.create_index("id", unique=True)
    await db.billing_docs.create_index("share_token", unique=True)
    await db.billing_docs.create_index([("type", 1), ("status", 1), ("date", -1)])
    await db.billing_docs.create_index("client_id")
    await db.billing_terms.create_index("id", unique=True)
    from routes_billing import migrate_old_quotes, ensure_default_terms
    await ensure_default_terms()
    await migrate_old_quotes()
    # Ignore-proof cleanup: remove any stale test users (test_*@dotindot.test) on every startup
    removed = await db.users.delete_many({"email": {"$regex": r"@dotindot\.test$"}})
    if removed.deleted_count:
        logger.info(f"Removed {removed.deleted_count} stale test users (@dotindot.test)")
    # Demo seeding removed (v2.5): only a minimal super_admin guard so a fresh deploy is usable.
    await ensure_super_admin()
    from permissions import load_role_defaults, migrate_role_defaults
    await load_role_defaults()
    await migrate_role_defaults()
    await repair_coordinates()
    start_scheduler()
    try:
        init_storage()
        logger.info("Object storage initialized")
    except Exception as e:
        logger.error(f"Object storage init failed (receipt uploads unavailable): {e}")
    logger.info("Startup complete: indexes ensured, no demo seeding")


@app.on_event("shutdown")
async def shutdown_db_client():
    stop_scheduler()
    client.close()


# One web app: the website at /, the app at /app. Registered last so every /api route above wins.
from web_static import router as web_router  # noqa: E402
app.include_router(web_router)
