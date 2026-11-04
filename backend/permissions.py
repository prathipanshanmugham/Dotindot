"""v2 granular permission system.

- Registry of permission keys grouped by module.
- Role defaults reproduce v1 behavior exactly; per-user overrides grant/revoke keys.
- super_admin is unrestricted and cannot be restricted.
- Module-level enforcement happens in a FastAPI HTTP middleware (see permission_middleware),
  mapping path prefixes to permission keys. Write-level rules remain role-based in routes.
- Branch scoping helpers: users with assigned_branches limited to those branches' records.
"""
import os
import jwt
from fastapi import HTTPException, Depends
from fastapi.responses import JSONResponse
from database import db
from auth import get_current_user

PERMISSION_GROUPS = {
    "Core": ["ceo_dashboard", "clients", "clients.delete", "client_portal", "projects", "projects.delete",
             "support", "support.manage", "support.delete"],
    "Finance": ["finance.ledger", "finance.expenses", "finance.subscriptions", "finance.budgets",
                "finance.ai_spend", "finance.api_credits", "finance.marketing", "finance.project_profit", "finance.employee_revenue",
                "finance.loans", "finance.delete"],
    "Investors": ["investors", "investors.manage", "investors.delete"],
    "Sales": ["sales.pipeline", "sales.quotes", "sales.targets", "sales.hud", "lead_flow", "lead_flow.manage", "sales.delete"],
    "HR": ["hr", "hr.manage", "hr.delete", "payroll", "payroll.manage", "payroll.delete"],
    "Growth": ["growth", "growth.manage", "growth.delete", "ads", "ads.delete", "social", "social.delete", "influencers", "influencers.delete"],
    "Operations": ["employees", "training", "training.delete", "partnerships", "partnerships.delete", "assets", "assets.delete", "locations", "locations.delete",
                   "ai_agents", "ai_agents.manage", "ai_agents.delete", "org_structure", "org_structure.manage", "org_structure.delete",
                   "daily_reports", "daily_reports.team", "daily_reports.delete", "holidays.manage"],
    "System": ["logs", "logs.delete", "reports", "access_control", "user_management", "password_manager", "password_manager.reveal", "password_manager.delete",
               "ai_settings"],
}

ALL_KEYS = {k for keys in PERMISSION_GROUPS.values() for k in keys}
DELETE_KEYS_SET = {k for k in ALL_KEYS if k.endswith(".delete")}

_FINANCE_ALL = set(PERMISSION_GROUPS["Finance"]) - {"finance.delete"}

# v2.6: every role can see the AI agents assigned to them and the org chart.
# v2.7: every role files daily reports / attendance.
_V26_EVERYONE = {"ai_agents", "org_structure", "daily_reports"}

_INVESTOR_KEYS = {"investors", "investors.manage", "investors.delete"}

ROLE_DEFAULTS = {
    "super_admin": set(ALL_KEYS),
    # v2.6: Admin / CEO can delete everything by default (permanent user deletion stays super-admin only).
    # v3.0: investor records stay with the super admin unless granted in Settings → Role permissions.
    "admin": set(ALL_KEYS) - _INVESTOR_KEYS,
    "finance": {"clients", "projects", *_FINANCE_ALL, "sales.pipeline", "sales.quotes", "sales.targets",
                "employees", "training", "partnerships", "assets", "locations", "reports", *_V26_EVERYONE,
                "payroll", "support"},
    "sales": {"clients", "projects", "sales.pipeline", "sales.quotes", "sales.targets", "sales.hud",
              "employees", "training", "partnerships", "influencers", "locations", "reports", *_V26_EVERYONE, "client_portal",
              "lead_flow", "lead_flow.manage", "support", "growth"},
    "pm": {"clients", "projects", "finance.project_profit", "sales.pipeline", "sales.quotes", "sales.targets",
           "employees", "training", "partnerships", "locations", "reports", *_V26_EVERYONE, "ai_agents.manage",
           "client_portal", "daily_reports.team", "lead_flow", "support", "support.manage", "growth"},
    "employee": {"projects", "employees", "training", *_V26_EVERYONE},
    "ads_manager": {"ads", "clients", *_V26_EVERYONE, "lead_flow", "lead_flow.manage", "growth", "growth.manage"},
    "social_manager": {"social", "influencers", "clients", *_V26_EVERYONE, "lead_flow", "growth", "growth.manage"},
    # v3.0: HR Manager — people records, onboarding/offboarding, skills, KT, payroll, attendance.
    "hr": {"employees", "training", "training.delete", "hr", "hr.manage", "hr.delete", "payroll", "payroll.manage",
           "daily_reports", "daily_reports.team", "holidays.manage", "org_structure", "org_structure.manage", "ai_agents",
           "locations", "reports", "support", "support.manage"},
}

# Keys introduced in v2.6 per role — merged once into DB-saved role defaults (see migrate_role_defaults_v26).
V26_NEW_KEYS = {role: (keys & {"ai_agents", "ai_agents.manage", "ai_agents.delete",
                               "org_structure", "org_structure.manage", "org_structure.delete"})
                for role, keys in ROLE_DEFAULTS.items()}
V26_NEW_KEYS["admin"] = V26_NEW_KEYS["admin"] | (DELETE_KEYS_SET - {"daily_reports.delete", "support.delete", "hr.delete",
                                                                  "payroll.delete", "investors.delete"})
_V27 = {"finance.api_credits", "daily_reports", "daily_reports.team", "daily_reports.delete", "client_portal"}
V27_NEW_KEYS = {role: (keys & _V27) for role, keys in ROLE_DEFAULTS.items()}
for _r in V26_NEW_KEYS:
    V26_NEW_KEYS[_r] -= _V27
# v2.8: holiday calendar management (timesheets reuse daily_reports / daily_reports.team)
_V28 = {"holidays.manage"}
V28_NEW_KEYS = {role: (keys & _V28) for role, keys in ROLE_DEFAULTS.items()}
# v3.0: support desk, lead flow, HR + payroll, loans, investors, AI settings
_V30 = {"support", "support.manage", "support.delete", "lead_flow", "lead_flow.manage", "hr", "hr.manage", "hr.delete",
        "payroll", "payroll.manage", "payroll.delete", "finance.loans", "investors", "investors.manage", "investors.delete", "ai_settings"}
V30_NEW_KEYS = {role: (keys & _V30) for role, keys in ROLE_DEFAULTS.items()}
# v3.1: Digital Growth (follower / views tracking + reports)
_V31 = {"growth", "growth.manage", "growth.delete"}
V31_NEW_KEYS = {role: (keys & _V31) for role, keys in ROLE_DEFAULTS.items()}
for _r in (V26_NEW_KEYS, V27_NEW_KEYS, V28_NEW_KEYS, V30_NEW_KEYS):
    for _k in _r:
        _r[_k] = _r[_k] - _V31
ROLE_MIGRATIONS = [("role_defaults_v26", V26_NEW_KEYS), ("role_defaults_v27", V27_NEW_KEYS), ("role_defaults_v28", V28_NEW_KEYS),
                   ("role_defaults_v30", V30_NEW_KEYS), ("role_defaults_v31", V31_NEW_KEYS)]

VALID_ROLES = set(ROLE_DEFAULTS.keys())

EDITABLE_ROLES = sorted(VALID_ROLES - {"super_admin"})


async def load_role_defaults():
    """DB-backed role defaults (collection role_defaults) override the code defaults. Call at startup."""
    async for doc in db.role_defaults.find({}, {"_id": 0}):
        role = doc.get("role")
        if role in ROLE_DEFAULTS and role != "super_admin":
            ROLE_DEFAULTS[role] = {k for k in doc.get("permissions", []) if k in ALL_KEYS}


async def migrate_role_defaults():
    """Role defaults saved in the DB before a release don't know that release's new permission keys.
    Each migration adds the role's new defaults exactly once (tracked in `migrations`), so new tabs appear
    without overwriting choices made later in Settings → Role permissions."""
    for mig_id, new_keys in ROLE_MIGRATIONS:
        if await db.migrations.find_one({"id": mig_id}):
            continue
        async for doc in db.role_defaults.find({}, {"_id": 0}):
            role = doc.get("role")
            if role in new_keys and role != "super_admin" and new_keys[role]:
                merged = set(doc.get("permissions", [])) | new_keys[role]
                await save_role_default(role, merged)
        await db.migrations.insert_one({"id": mig_id})


migrate_role_defaults_v26 = migrate_role_defaults  # backwards-compatible name


async def save_role_default(role: str, permissions: set):
    """Persist + apply immediately (in-memory dict feeds middleware and effective_permissions)."""
    ROLE_DEFAULTS[role] = set(permissions)
    await db.role_defaults.update_one(
        {"role": role}, {"$set": {"role": role, "permissions": sorted(permissions)}}, upsert=True)


def effective_permissions(user: dict) -> list:
    if user.get("role") == "super_admin":
        return sorted(ALL_KEYS)
    base = set(ROLE_DEFAULTS.get(user.get("role"), set()))
    for key, granted in (user.get("permission_overrides") or {}).items():
        if key not in ALL_KEYS:
            continue
        if granted:
            base.add(key)
        else:
            base.discard(key)
    return sorted(base)


def has_permission(user: dict, *keys) -> bool:
    if user.get("role") == "super_admin":
        return True
    if "__super_admin__" in keys:
        return False
    perms = set(effective_permissions(user))
    return any(k in perms for k in keys)


def require_permission(*keys):
    async def dependency(user: dict = Depends(get_current_user)) -> dict:
        if not has_permission(user, *keys):
            raise HTTPException(status_code=403, detail="You don't have permission for this module")
        return user
    return dependency


# ---------------- Branch scoping ----------------
def branch_scope(user: dict):
    """Return list of allowed branch ids, or None if unrestricted."""
    if user.get("role") == "super_admin":
        return None
    assigns = user.get("branch_assignments") or []
    if assigns:
        return [a["branch_id"] for a in assigns if a.get("branch_id")]
    branches = user.get("assigned_branches") or []
    return branches if branches else None


def user_branch_role(user: dict, branch_id):
    """Branch-level capability: 'manager' | 'staff' | None (no access).
    Unrestricted users (no assignments) behave as manager everywhere."""
    if user.get("role") == "super_admin":
        return "manager"
    assigns = user.get("branch_assignments") or []
    legacy = user.get("assigned_branches") or []
    if not assigns and not legacy:
        return "manager"  # unrestricted — current behavior
    for a in assigns:
        if a.get("branch_id") == branch_id:
            return a.get("branch_role", "staff")
    if branch_id in legacy:
        return "staff"
    return None


def check_branch_write(user: dict, record_branch_id, owner_id=None):
    """Raise 403 when the user cannot write records of this branch, or when a
    branch 'staff' member tries to modify someone else's record."""
    from fastapi import HTTPException
    role = user_branch_role(user, record_branch_id)
    if role is None:
        raise HTTPException(status_code=403, detail="This record belongs to a branch outside your access")
    if role == "staff" and owner_id and owner_id != user.get("id"):
        raise HTTPException(status_code=403, detail="Branch staff can only modify their own records")


async def scoped_client_ids(user: dict):
    """None = unrestricted; else client ids belonging to the user's branches."""
    branches = branch_scope(user)
    if branches is None:
        return None
    rows = await db.clients.find({"branch_id": {"$in": branches}}, {"_id": 0, "id": 1}).to_list(3000)
    return [r["id"] for r in rows]


# ---------------- Middleware enforcement ----------------
# Ordered prefix → permission key(s). First match wins. Any listed key grants access.
PATH_PERMISSIONS = [
    ("/api/ceo", ("ceo_dashboard",)),
    ("/api/dashboard/ceo", ("ceo_dashboard",)),
    ("/api/passwords", ("password_manager",)),
    ("/api/workspace", ("__super_admin__",)),
    ("/api/clients", ("clients",)),
    ("/api/projects", ("projects",)),
    ("/api/finance/overview", tuple(_FINANCE_ALL)),
    ("/api/finance/transactions", ("finance.ledger",)),
    ("/api/finance/subscriptions", ("finance.subscriptions",)),
    ("/api/finance/budgets", ("finance.budgets",)),
    ("/api/finance/ai-spend", ("finance.ai_spend",)),
    ("/api/finance/campaigns", ("finance.marketing",)),
    ("/api/finance/marketing", ("finance.marketing",)),
    ("/api/finance/project-profit", ("finance.project_profit",)),
    ("/api/finance/employee-revenue", ("finance.employee_revenue",)),
    ("/api/finance/loans", ("finance.loans",)),
    # NOTE: /api/finance/expenses intentionally NOT gated — all roles may submit/view own (v1 behavior);
    # approval actions remain role-guarded in the route.
    ("/api/sales/hud", ("sales.hud",)),
    ("/api/sales/overview", ("sales.pipeline", "sales.quotes", "sales.targets")),
    ("/api/sales/leads", ("sales.pipeline",)),
    ("/api/sales/quotes", ("sales.quotes",)),
    ("/api/sales/targets", ("sales.targets",)),
    ("/api/employees", ("employees",)),
    ("/api/training", ("training",)),
    ("/api/partnerships", ("partnerships",)),
    ("/api/assets", ("assets",)),
    ("/api/growth", ("growth",)),
    ("/api/ads", ("ads",)),
    ("/api/social", ("social",)),
    ("/api/influencers", ("influencers",)),
    ("/api/locations", ("locations",)),
    ("/api/agents", ("ai_agents",)),
    ("/api/finance/api-credits", ("finance.api_credits",)),
    ("/api/daily", ("daily_reports",)),
    ("/api/timesheets", ("daily_reports",)),
    ("/api/org", ("org_structure",)),
    ("/api/lead-flow", ("lead_flow", "sales.pipeline")),
    ("/api/client-leads", ("lead_flow",)),
    ("/api/hr/payroll", ("payroll",)),
    # KT handovers + onboarding/offboarding checklists: participants (task owners, handover receivers) reach them too;
    # the routes check membership themselves.
    ("/api/hr/kt", None),
    ("/api/hr/process", None),
    ("/api/hr/onboarding", None),
    ("/api/hr/offboarding", None),
    ("/api/hr/meta", None),
    ("/api/hr", ("hr",)),
    ("/api/investors", ("investors",)),
    ("/api/ai-settings", ("ai_settings",)),
    ("/api/logs", ("logs",)),
    ("/api/reports", ("reports",)),
    ("/api/access", ("access_control",)),
    ("/api/users/team", None),  # team picker used across modules — any authenticated user
    ("/api/users", ("user_management",)),
]


def match_permission(path: str):
    for prefix, keys in PATH_PERMISSIONS:
        if path == prefix or path.startswith(prefix + "/") or path.startswith(prefix + "?"):
            return keys
    return None


async def _user_from_request(request):
    token = None
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
    if not token:
        token = request.cookies.get("access_token")
    if not token:
        return None
    try:
        payload = jwt.decode(token, os.environ["JWT_SECRET"], algorithms=["HS256"])
    except jwt.InvalidTokenError:
        return None
    return await db.users.find_one({"id": payload.get("sub")}, {"_id": 0, "password_hash": 0})


async def permission_middleware(request, call_next):
    if request.method != "OPTIONS":
        keys = match_permission(request.url.path)
        if keys:
            user = await _user_from_request(request)
            # No/invalid token → let the route's auth dependency return 401 properly
            if user is not None and not has_permission(user, *keys):
                return JSONResponse(status_code=403, content={"detail": "You don't have permission for this module"})
    return await call_next(request)
