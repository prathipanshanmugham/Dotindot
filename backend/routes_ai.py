"""v3.0 AI settings + agent access to the platform's data.

Settings → AI (permission `ai_settings`):
  • Providers — Anthropic (Claude), OpenAI, Google Gemini, OpenRouter or any OpenAI-compatible endpoint. Keys are
    encrypted at rest and only their last 4 characters are ever shown. "Test" checks the key with the provider.
  • Data access — one switch per module: Off / Read / Read + write. Sensitive areas (salaries & payroll,
    employees' personal & bank details, investors) stay off until you turn them on. Passwords, password hashes,
    API keys and client credentials are never exposed to AI, whatever the settings.
  • Agent tokens — one per agent or tool. A token can only narrow the workspace settings, never widen them.
    Shown once, stored as a hash, revocable, with an expiry and a usage log.

For agents (token auth: `Authorization: Bearer dai_…`):
  • REST:  GET /api/ai/v1/modules · /records/{module} · /records/{module}/{id} · /search?q= · /summary
           POST /api/ai/v1/records/{module} · PATCH /api/ai/v1/records/{module}/{id}  (write-enabled modules only)
  • MCP:   POST /api/ai/mcp  (Model Context Protocol, streamable HTTP, JSON responses) — tools: list_modules,
           query_records, get_record, search, business_summary, create_record, update_record.
Every call is written to the AI access log.
"""
import hashlib
import json
import re
import secrets
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Optional, Dict, List, Any
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, Response
from database import db
from auth import get_current_user, log_activity, encrypt_secret, decrypt_secret
from permissions import has_permission

router = APIRouter()

PROVIDERS = {
    "anthropic": {"label": "Anthropic (Claude)", "default_model": "claude-sonnet-5-5", "base_url": "https://api.anthropic.com"},
    "openai": {"label": "OpenAI", "default_model": "", "base_url": "https://api.openai.com/v1"},
    "google": {"label": "Google Gemini", "default_model": "", "base_url": "https://generativelanguage.googleapis.com"},
    "openrouter": {"label": "OpenRouter", "default_model": "", "base_url": "https://openrouter.ai/api/v1"},
    "custom": {"label": "Custom (OpenAI-compatible)", "default_model": "", "base_url": ""},
}
LEVELS = ("none", "read", "write")

# Never sent to an AI, in any module.
ALWAYS_HIDDEN = {"_id", "password_hash", "key_enc", "secret_enc", "credentials", "password", "token_hash", "pan_enc", "uan_enc",
                 "pf_number_enc", "esi_number_enc", "bank_account_enc", "encrypted_password", "password_enc", "uan"}

# module → spec. sensitive: off by default and needs its own switch. write: fields an agent may set.
MODULES: Dict[str, dict] = {
    "clients": {"label": "Clients", "coll": "clients", "search": ["name", "company", "industry", "city"], "hide": {"contacts.phone"}},
    "projects": {"label": "Projects (incl. milestones & deliverables)", "coll": "projects", "search": ["name", "description", "status"]},
    "leads": {"label": "Sales pipeline (our leads)", "coll": "leads", "search": ["name", "company", "source", "stage"],
              "write": {"create": ["name", "company", "contact_email", "contact_phone", "source", "estimated_value", "service_interest", "notes", "city"],
                        "update": ["stage", "notes", "follow_up_date", "estimated_value"]}},
    "client_leads": {"label": "Client leads (lead flow)", "coll": "client_leads", "search": ["name", "phone", "email", "campaign", "source"],
                     "write": {"create": ["client_id", "name", "phone", "email", "source", "campaign", "value", "notes", "date"],
                               "update": ["stage", "notes", "value"]}},
    "quotes": {"label": "Quotes", "coll": "quotes", "search": ["number", "title"]},
    "finance": {"label": "Ledger transactions", "coll": "transactions", "search": ["description", "category"]},
    "expenses": {"label": "Expenses", "coll": "expenses", "search": ["description", "category"]},
    "subscriptions": {"label": "Subscriptions", "coll": "subscriptions", "search": ["name"]},
    "loans": {"label": "Loans", "coll": "loans", "search": ["name", "counterparty"]},
    "ads": {"label": "Ad campaigns", "coll": "ad_campaigns", "search": ["name", "platform"]},
    "social": {"label": "Social media posts", "coll": "social_posts", "search": ["caption", "platform"],
               "write": {"create": ["client_id", "platform", "caption", "scheduled_at", "content_type"], "update": ["caption", "status"]}},
    "influencers": {"label": "Influencers", "coll": "influencers", "search": ["name", "handle"]},
    "support": {"label": "Support tickets", "coll": "tickets", "search": ["number", "subject", "client_name"],
                "write": {"create": ["subject", "body", "category", "priority"], "update": ["status", "priority", "reply"]}},
    "employees": {"label": "Team directory (name, role, skills)", "coll": "users", "search": ["name", "designation", "department", "skills"],
                  "fields": ["id", "name", "email", "role", "designation", "department", "city", "skills", "skill_levels", "join_date", "branch_id", "is_active"]},
    "attendance": {"label": "Attendance & daily reports", "coll": "daily_reports", "search": ["user_name", "date", "status"]},
    "timesheets": {"label": "Timesheets", "coll": "timesheets", "search": ["user_name", "week_start"]},
    "holidays": {"label": "Holiday calendar", "coll": "holidays", "search": ["name", "date"]},
    "hr": {"label": "HR processes (onboarding, offboarding, KT, skill plans)", "colls": ["hr_onboarding", "hr_offboarding", "hr_kt", "hr_skill_plans"],
           "search": ["user_name", "topic", "skill"],
           "hide": {"reason", "exit_interview", "fnf", "rehire_eligible"}},
    "assets": {"label": "Assets", "coll": "assets", "search": ["name", "code"]},
    "partnerships": {"label": "Partnerships", "coll": "partnerships", "search": ["name"]},
    "locations": {"label": "Branches / locations", "coll": "branches", "search": ["name", "city"]},
    "org": {"label": "Org structure", "coll": "org_nodes", "search": ["title"]},
    "agents": {"label": "AI agents registry", "coll": "ai_agents", "search": ["name", "platform"]},
    "api_credits": {"label": "API credit accounts", "coll": "api_accounts", "search": ["name", "provider"]},
    # sensitive
    "payroll": {"label": "Salaries & payroll", "colls": ["salary_structures", "payslips", "pay_items", "incentive_plans", "payroll_runs"],
                "search": ["user_name", "month", "title"], "sensitive": "payroll"},
    "hr_records": {"label": "Employee personal & bank details", "coll": "users", "search": ["name"], "sensitive": "hr_personal",
                   "fields": ["id", "name", "email", "phone", "hr"]},
    "investors": {"label": "Investors & investments", "colls": ["investors", "investments", "investor_returns", "investor_updates"],
                  "search": ["name", "title", "note"], "sensitive": "investors"},
}
SENSITIVE = {"payroll": "Salaries & payroll", "hr_personal": "Employee personal & bank details", "investors": "Investors & investments"}
SENSITIVE_PERM = {"payroll": "payroll", "hr_personal": "hr", "investors": "investors"}
# You can only open a module to AI (or put it on a token) if you can see that data in the app yourself.
MODULE_PERM = {"clients": "clients", "projects": "projects", "leads": "sales.pipeline", "client_leads": "lead_flow", "quotes": "sales.quotes",
               "finance": "finance.ledger", "expenses": "finance.expenses", "subscriptions": "finance.subscriptions", "loans": "finance.loans",
               "ads": "ads", "social": "social", "influencers": "influencers", "support": "support", "employees": "employees",
               "attendance": "daily_reports.team", "timesheets": "daily_reports.team", "holidays": "daily_reports", "hr": "hr", "assets": "assets",
               "partnerships": "partnerships", "locations": "locations", "org": "org_structure", "agents": "ai_agents",
               "api_credits": "finance.api_credits", "payroll": "payroll", "hr_records": "hr", "investors": "investors"}


def _may_share(user: dict, module: str) -> bool:
    return has_permission(user, MODULE_PERM.get(module, "__super_admin__"))
DEFAULT_ACCESS = {k: ("none" if v.get("sensitive") else "read") for k, v in MODULES.items()}


def _now():
    return datetime.now(timezone.utc).isoformat()


async def ai_settings() -> dict:
    d = await db.settings.find_one({"id": "ai"}, {"_id": 0}) or {}
    access = {**DEFAULT_ACCESS, **(d.get("access") or {})}
    sens = {k: False for k in SENSITIVE}
    sens.update(d.get("sensitive") or {})
    for k, spec in MODULES.items():  # a sensitive module can't be on while its switch is off
        if spec.get("sensitive") and not sens.get(spec["sensitive"]):
            access[k] = "none"
        if not spec.get("write") and access.get(k) == "write":
            access[k] = "read"
    return {"enabled": bool(d.get("enabled", False)), "providers": d.get("providers") or {}, "default_provider": d.get("default_provider") or "",
            "access": access, "sensitive": sens, "max_rows": int(d.get("max_rows") or 200), "instructions": d.get("instructions") or "",
            "updated_at": d.get("updated_at"), "updated_by": d.get("updated_by")}


def _public_providers(provs: dict) -> dict:
    out = {}
    for k, meta in PROVIDERS.items():
        p = provs.get(k) or {}
        out[k] = {"label": meta["label"], "connected": bool(p.get("key_enc")), "key_hint": p.get("key_hint", ""), "model": p.get("model") or meta["default_model"],
                  "base_url": p.get("base_url") or meta["base_url"], "last_test": p.get("last_test")}
    return out


def _need(user):
    if not has_permission(user, "ai_settings"):
        raise HTTPException(status_code=403, detail="AI settings need the AI settings permission")


def _public_base(request: Request) -> str:
    """The address agents should use — honours the reverse proxy (nginx on the VPS sets X-Forwarded-*)."""
    proto = (request.headers.get("x-forwarded-proto") or request.url.scheme).split(",")[0].strip()
    host = (request.headers.get("x-forwarded-host") or request.headers.get("host") or request.url.netloc).split(",")[0].strip()
    return f"{proto}://{host}"


# ------------------------------------------------------------------ settings UI
@router.get("/ai-settings")
async def get_settings(request: Request, user: dict = Depends(get_current_user)):
    s = await ai_settings()
    base = _public_base(request)
    return {**{k: v for k, v in s.items() if k != "providers"}, "providers": _public_providers(s["providers"]),
            "modules": [{"key": k, "label": v["label"], "sensitive": v.get("sensitive"), "writable": bool(v.get("write")),
                         "yours": _may_share(user, k)} for k, v in MODULES.items()],
            "sensitive_yours": {k: has_permission(user, p) for k, p in SENSITIVE_PERM.items()},
            "sensitive_labels": SENSITIVE, "endpoints": {"mcp": f"{base}/api/ai/mcp", "rest": f"{base}/api/ai/v1"},
            "tokens": await _tokens_view(), "can_manage": has_permission(user, "ai_settings")}


class SettingsIn(BaseModel):
    enabled: Optional[bool] = None
    default_provider: Optional[str] = None
    access: Optional[Dict[str, str]] = None
    sensitive: Optional[Dict[str, bool]] = None
    max_rows: Optional[int] = None
    instructions: Optional[str] = None


@router.put("/ai-settings")
async def save_settings(body: SettingsIn, request: Request, user: dict = Depends(get_current_user)):
    _need(user)
    sets = {}
    if body.enabled is not None:
        sets["enabled"] = body.enabled
    if body.default_provider is not None:
        if body.default_provider and body.default_provider not in PROVIDERS:
            raise HTTPException(status_code=400, detail="Unknown provider")
        sets["default_provider"] = body.default_provider
    if body.access is not None:
        cur = (await db.settings.find_one({"id": "ai"}, {"_id": 0}) or {}).get("access") or {}
        for k, v in body.access.items():
            if k in MODULES and v in LEVELS:
                if v != "none" and not _may_share(user, k):
                    raise HTTPException(status_code=403, detail=f"You can't open {MODULES[k]['label']} to AI — you don't have access to it yourself")
                cur[k] = v
        sets["access"] = cur
    if body.sensitive is not None:
        cur = (await db.settings.find_one({"id": "ai"}, {"_id": 0}) or {}).get("sensitive") or {}
        for k, v in body.sensitive.items():
            if k in SENSITIVE and v and not has_permission(user, SENSITIVE_PERM[k]):
                raise HTTPException(status_code=403, detail=f"Only someone who can see {SENSITIVE[k].lower()} can share it with AI")
        cur.update({k: bool(v) for k, v in body.sensitive.items() if k in SENSITIVE})
        sets["sensitive"] = cur
    if body.max_rows is not None:
        if not 10 <= body.max_rows <= 1000:
            raise HTTPException(status_code=400, detail="Max rows per call must be 10–1000")
        sets["max_rows"] = body.max_rows
    if body.instructions is not None:
        sets["instructions"] = body.instructions[:4000]
    sets.update({"updated_at": _now(), "updated_by": user["name"]})
    await db.settings.update_one({"id": "ai"}, {"$set": {"id": "ai", **sets}}, upsert=True)
    await log_activity(user, "ai_settings_updated", "settings", "ai", ", ".join(k for k in sets if k not in ("updated_at", "updated_by")))
    return await get_settings(request, user)


class ProviderIn(BaseModel):
    api_key: Optional[str] = None
    model: Optional[str] = None
    base_url: Optional[str] = None
    remove: bool = False


@router.put("/ai-settings/providers/{provider}")
async def save_provider(provider: str, body: ProviderIn, request: Request, user: dict = Depends(get_current_user)):
    _need(user)
    if provider not in PROVIDERS:
        raise HTTPException(status_code=404, detail="Unknown provider")
    d = await db.settings.find_one({"id": "ai"}, {"_id": 0}) or {}
    provs = d.get("providers") or {}
    if body.remove:
        provs.pop(provider, None)
        what = "removed"
    else:
        p = provs.get(provider) or {}
        if body.api_key:
            k = body.api_key.strip()
            if len(k) < 12:
                raise HTTPException(status_code=400, detail="That key looks too short")
            p["key_enc"], p["key_hint"] = encrypt_secret(k), "…" + k[-4:]
            p["last_test"] = None
        if body.model is not None:
            p["model"] = body.model.strip()[:100]
        if body.base_url is not None:
            if body.base_url and not body.base_url.startswith("https://"):
                raise HTTPException(status_code=400, detail="Base URL must start with https://")
            p["base_url"] = body.base_url.strip()[:300]
        if not p.get("key_enc"):
            raise HTTPException(status_code=400, detail="Paste the API key")
        provs[provider] = p
        what = "saved"
    await db.settings.update_one({"id": "ai"}, {"$set": {"id": "ai", "providers": provs, "updated_at": _now(), "updated_by": user["name"]}}, upsert=True)
    await log_activity(user, f"ai_provider_{what}", "settings", "ai", PROVIDERS[provider]["label"])
    return await get_settings(request, user)


@router.post("/ai-settings/providers/{provider}/test")
async def test_provider(provider: str, user: dict = Depends(get_current_user)):
    _need(user)
    d = await db.settings.find_one({"id": "ai"}, {"_id": 0}) or {}
    p = (d.get("providers") or {}).get(provider)
    if not p or not p.get("key_enc"):
        raise HTTPException(status_code=400, detail="Save a key first")
    key = decrypt_secret(p["key_enc"])
    import httpx
    base = (p.get("base_url") or PROVIDERS[provider]["base_url"]).rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=10) as cx:
            if provider == "anthropic":
                r = await cx.get(f"{base}/v1/models", headers={"x-api-key": key, "anthropic-version": "2023-06-01"})
            elif provider == "google":
                r = await cx.get(f"{base}/v1beta/models", params={"key": key})
            elif provider == "openrouter":
                r = await cx.get(f"{base}/key", headers={"Authorization": f"Bearer {key}"})
            else:
                if not base:
                    raise HTTPException(status_code=400, detail="Set the base URL for the custom provider")
                r = await cx.get(f"{base}/models", headers={"Authorization": f"Bearer {key}"})
        ok = r.status_code == 200
        msg = "Connected" if ok else ("The provider rejected this key" if r.status_code in (401, 403) else f"Provider answered {r.status_code}")
    except HTTPException:
        raise
    except Exception as e:
        ok, msg = False, f"Couldn't reach the provider ({type(e).__name__}) — check the server's internet access"
    result = {"ok": ok, "message": msg, "at": _now()}
    await db.settings.update_one({"id": "ai"}, {"$set": {f"providers.{provider}.last_test": result}})
    return result


# ------------------------------------------------------------------ tokens
async def _tokens_view():
    rows = await db.ai_tokens.find({}, {"_id": 0, "token_hash": 0}).sort("created_at", -1).to_list(200)
    agents = {a["id"]: a["name"] for a in await db.ai_agents.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(500)}
    now = _now()
    for r in rows:
        r["agent_name"] = agents.get(r.get("agent_id"), "")
        r["state"] = "revoked" if r.get("revoked") else ("expired" if r.get("expires_at") and r["expires_at"] < now else "active")
    return rows


class TokenIn(BaseModel):
    name: str
    agent_id: Optional[str] = None
    access: Dict[str, str] = {}
    expires_days: Optional[int] = 90


@router.post("/ai-settings/tokens")
async def create_token(body: TokenIn, user: dict = Depends(get_current_user)):
    _need(user)
    if not body.name.strip():
        raise HTTPException(status_code=400, detail="Name the token after the agent or tool that will use it")
    access = {k: v for k, v in body.access.items() if k in MODULES and v in ("read", "write")}
    blocked = [MODULES[k]["label"] for k in access if not _may_share(user, k)]
    if blocked:
        raise HTTPException(status_code=403, detail=f"You can't give a token access to data you can't see yourself: {', '.join(blocked)}")
    if not access:
        raise HTTPException(status_code=400, detail="Give the token access to at least one module")
    raw = "dai_" + secrets.token_urlsafe(32)
    exp = (datetime.now(timezone.utc) + timedelta(days=body.expires_days)).isoformat() if body.expires_days else None
    doc = {"id": str(uuid.uuid4()), "name": body.name.strip()[:80], "agent_id": body.agent_id, "access": access,
           "token_hash": hashlib.sha256(raw.encode()).hexdigest(), "prefix": raw[:10], "expires_at": exp, "revoked": False,
           "created_by": user["id"], "created_by_name": user["name"], "created_at": _now(), "last_used_at": None, "calls": 0}
    await db.ai_tokens.insert_one(dict(doc))
    await log_activity(user, "ai_token_created", "ai_token", doc["id"], f"{doc['name']} · {', '.join(f'{k}:{v}' for k, v in access.items())}")
    return {"token": raw, "id": doc["id"], "name": doc["name"], "expires_at": exp, "note": "Copy it now — it won't be shown again."}


@router.post("/ai-settings/tokens/{tid}/revoke")
async def revoke_token(tid: str, user: dict = Depends(get_current_user)):
    _need(user)
    t = await db.ai_tokens.find_one({"id": tid}, {"_id": 0, "name": 1})
    if not t:
        raise HTTPException(status_code=404, detail="Token not found")
    await db.ai_tokens.update_one({"id": tid}, {"$set": {"revoked": True, "revoked_at": _now(), "revoked_by": user["name"]}})
    await log_activity(user, "ai_token_revoked", "ai_token", tid, t["name"])
    return {"ok": True}


@router.get("/ai-settings/log")
async def access_log(token_id: Optional[str] = None, limit: int = 100, user: dict = Depends(get_current_user)):
    _need(user)
    q = {"token_id": token_id} if token_id else {}
    return await db.ai_access_log.find(q, {"_id": 0}).sort("at", -1).to_list(max(1, min(500, limit)))


# ------------------------------------------------------------------ agent auth + data access
class Agent:
    def __init__(self, token: dict, settings: dict):
        self.token, self.settings = token, settings

    def level(self, module: str) -> str:
        """The lower of the workspace setting and the token's own grant."""
        ws = self.settings["access"].get(module, "none")
        tk = self.token["access"].get(module, "none")
        order = {"none": 0, "read": 1, "write": 2}
        return min(ws, tk, key=lambda x: order[x])

    def actor(self):
        return {"id": f"ai:{self.token['id']}", "name": f"AI · {self.token['name']}", "email": "", "role": "ai_agent"}


async def agent_from_request(request: Request) -> Agent:
    auth = request.headers.get("Authorization", "")
    raw = auth[7:].strip() if auth.startswith("Bearer ") else request.headers.get("X-API-Key", "").strip()
    if not raw.startswith("dai_"):
        raise HTTPException(status_code=401, detail="Send an AI access token: Authorization: Bearer dai_…")
    t = await db.ai_tokens.find_one({"token_hash": hashlib.sha256(raw.encode()).hexdigest()}, {"_id": 0})
    if not t or t.get("revoked"):
        raise HTTPException(status_code=401, detail="This token is not valid (revoked or unknown)")
    if t.get("expires_at") and t["expires_at"] < _now():
        raise HTTPException(status_code=401, detail="This token has expired — create a new one in Settings → AI")
    s = await ai_settings()
    if not s["enabled"]:
        raise HTTPException(status_code=403, detail="AI access is switched off in Settings → AI")
    await db.ai_tokens.update_one({"id": t["id"]}, {"$set": {"last_used_at": _now(), "last_ip": request.client.host if request.client else None},
                                                    "$inc": {"calls": 1}})
    return Agent(t, s)


async def _log(agent: Agent, via: str, tool: str, module: Optional[str], count: int, ok: bool = True, detail: str = ""):
    await db.ai_access_log.insert_one({"id": str(uuid.uuid4()), "token_id": agent.token["id"], "token_name": agent.token["name"], "via": via, "tool": tool,
                                       "module": module, "count": count, "ok": ok, "detail": detail[:300], "at": _now()})


def _drop_path(doc: Any, parts: List[str]):
    if isinstance(doc, list):
        for x in doc:
            _drop_path(x, parts)
    elif isinstance(doc, dict) and parts:
        if len(parts) == 1:
            doc.pop(parts[0], None)
        elif parts[0] in doc:
            _drop_path(doc[parts[0]], parts[1:])


def _clean(doc: Any, spec: dict) -> Any:
    if isinstance(doc, list):
        return [_clean(x, spec) for x in doc]
    if not isinstance(doc, dict):
        return doc
    if spec.get("fields") and "id" in doc and "_coll" not in doc:
        doc = {k: doc[k] for k in spec["fields"] if k in doc}
    out = {}
    for k, v in doc.items():
        if k in ALWAYS_HIDDEN or k.endswith("_enc") or k.endswith("_hash"):
            continue
        out[k] = _clean(v, {}) if isinstance(v, (dict, list)) else v
    for path in spec.get("hide") or ():  # module-specific fields agents never get (e.g. client contact phones)
        _drop_path(out, path.split("."))
    return out


def _filter_ok(spec: dict, module: str, key: str) -> bool:
    """Agents may only filter on fields they could read anyway — no probing hidden or nested sensitive values."""
    parts = key.split(".")
    if any(p in ALWAYS_HIDDEN or p.endswith("_enc") or p.endswith("_hash") for p in parts) or parts[0] == "deleted":
        return False
    if spec.get("fields") and parts[0] not in spec["fields"]:
        return False
    hide = spec.get("hide") or set()
    return not any(".".join(parts[:i + 1]) in hide for i in range(len(parts)))


def _require(agent: Agent, module: str, need: str = "read") -> dict:
    spec = MODULES.get(module)
    if not spec:
        raise HTTPException(status_code=404, detail=f"Unknown module '{module}'. Call list_modules / GET /api/ai/v1/modules.")
    lv = agent.level(module)
    if lv == "none" or (need == "write" and lv != "write"):
        raise HTTPException(status_code=403, detail=f"This token can't {'change' if need == 'write' else 'read'} {spec['label']}")
    return spec


async def _query(agent: Agent, module: str, q: Optional[str], filters: Optional[dict], limit: int, offset: int, updated_since: Optional[str] = None):
    spec = _require(agent, module)
    limit = max(1, min(int(limit or 50), agent.settings["max_rows"]))
    colls = spec.get("colls") or [spec["coll"]]
    query: dict = {}
    if q:
        rx = {"$regex": re.escape(q[:100]), "$options": "i"}
        query["$or"] = [{f: rx} for f in spec["search"]]
    for k, v in (filters or {}).items():
        k = str(k)
        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_.]{0,60}", k) or not isinstance(v, (str, int, float, bool)):
            raise HTTPException(status_code=400, detail=f"Filters take a field name and a plain value ('{k}' isn't allowed)")
        if not _filter_ok(spec, module, k):
            raise HTTPException(status_code=403, detail=f"You can't filter {spec['label']} on '{k}'")
        query[k] = v
    if module in ("employees", "hr_records"):
        query["deleted"] = {"$ne": True}
    if updated_since:
        query["$and"] = [{"$or": [{"updated_at": {"$gte": updated_since}}, {"created_at": {"$gte": updated_since}}]}]
    rows, total = [], 0
    for c in colls:
        n = await db[c].count_documents(query)
        total += n
        if len(rows) < limit:
            got = await db[c].find(query, {"_id": 0}).skip(offset if len(colls) == 1 else 0).limit(limit - len(rows)).to_list(limit)
            if len(colls) > 1:
                for g in got:
                    g["_type"] = c
            rows += got
    return {"module": module, "total": total, "count": len(rows), "offset": offset, "limit": limit, "records": _clean(rows, spec)}


async def _get(agent: Agent, module: str, rid: str):
    spec = _require(agent, module)
    for c in spec.get("colls") or [spec["coll"]]:
        d = await db[c].find_one({"id": rid}, {"_id": 0})
        if d:
            return {"module": module, "record": _clean(d, spec)}
    raise HTTPException(status_code=404, detail="Record not found")


async def _search(agent: Agent, q: str):
    if not q or len(q.strip()) < 2:
        raise HTTPException(status_code=400, detail="Search for at least 2 characters")
    out = []
    for m, spec in MODULES.items():
        if agent.level(m) == "none":
            continue
        res = await _query(agent, m, q.strip(), None, 5, 0)
        for r in res["records"]:
            out.append({"module": m, "id": r.get("id"), "title": r.get("name") or r.get("title") or r.get("subject") or r.get("number") or r.get("user_name")
                        or r.get("description") or r.get("caption") or r.get("id"), "type": r.get("_type")})
    return {"query": q, "results": out[:60]}


async def _summary(agent: Agent):
    lv = agent.level
    today = date.today()
    month = today.strftime("%Y-%m")
    out = {"date": today.isoformat(), "company": "dotindot Creative"}
    if lv("clients") != "none":
        out["clients"] = {"total": await db.clients.count_documents({}), "active": await db.clients.count_documents({"status": "active"})}
    if lv("projects") != "none":
        out["projects"] = {"active": await db.projects.count_documents({"status": {"$in": ["kickoff", "in_progress", "review"]}}),
                           "completed": await db.projects.count_documents({"status": "completed"})}
    if lv("leads") != "none":
        open_l = await db.leads.find({"stage": {"$in": ["new", "contacted", "qualified", "proposal"]}}, {"_id": 0, "estimated_value": 1}).to_list(20000)
        out["sales_pipeline"] = {"open_leads": len(open_l), "open_value": round(sum(float(l.get("estimated_value") or 0) for l in open_l)),
                                 "won_total": await db.leads.count_documents({"stage": "won"})}
    if lv("finance") != "none":
        tx = await db.transactions.find({"date": {"$regex": f"^{month}"}}, {"_id": 0, "type": 1, "amount": 1}).to_list(50000)
        inc = sum(float(t["amount"]) for t in tx if t["type"] == "income")
        exp = sum(float(t["amount"]) for t in tx if t["type"] == "expense")
        out["finance_this_month"] = {"income": round(inc), "expenses": round(exp), "net": round(inc - exp)}
    if lv("support") != "none":
        out["support"] = {"open_tickets": await db.tickets.count_documents({"status": {"$in": ["open", "in_progress", "waiting"]}})}
    if lv("attendance") != "none":
        recs = await db.daily_reports.find({"date": today.isoformat()}, {"_id": 0, "status": 1}).to_list(2000)
        out["attendance_today"] = {"checked_in": sum(1 for r in recs if r.get("status") in ("office", "wfh", "field", "half_day")),
                                   "on_leave": sum(1 for r in recs if r.get("status") == "leave")}
    if lv("employees") != "none":
        out["team_size"] = await db.users.count_documents({"is_active": {"$ne": False}, "deleted": {"$ne": True}})
    if agent.settings.get("instructions"):
        out["workspace_instructions"] = agent.settings["instructions"]
    return out


def _pick(data: dict, allowed: List[str]) -> dict:
    return {k: v for k, v in (data or {}).items() if k in allowed}


async def _create(agent: Agent, module: str, data: dict):
    spec = _require(agent, module, "write")
    w = spec.get("write") or {}
    vals = _pick(data, w.get("create", []))
    actor = agent.actor()
    now = _now()
    if module == "leads":
        if not (vals.get("name") or "").strip():
            raise HTTPException(status_code=400, detail="A lead needs a name")
        src = vals.get("source") if vals.get("source") in ("referral", "website", "ads", "linkedin", "cold_outreach", "event", "other") else "other"
        doc = {"id": str(uuid.uuid4()), "name": vals["name"].strip()[:120], "company": vals.get("company", ""), "contact_email": vals.get("contact_email", ""),
               "contact_phone": vals.get("contact_phone", ""), "source": src, "estimated_value": float(vals.get("estimated_value") or 0),
               "service_interest": vals.get("service_interest", ""), "stage": "new", "owner_id": None, "region": "", "state": "", "city": vals.get("city", ""),
               "notes": vals.get("notes", ""), "follow_up_date": None, "currency": "INR", "converted_client_id": None, "created_by": actor["id"],
               "stage_history": [{"stage": "new", "at": now, "by": actor["id"]}], "created_at": now, "updated_at": now, "via": "ai"}
        await db.leads.insert_one(dict(doc))
    elif module == "client_leads":
        from routes_lead_flow import _clean_lead
        if not await db.clients.find_one({"id": vals.get("client_id")}, {"_id": 0, "id": 1}):
            raise HTTPException(status_code=400, detail="client_id is required and must exist")
        d = _clean_lead(vals)
        doc = {"id": str(uuid.uuid4()), "client_id": vals["client_id"], **d, "created_by": actor["id"], "created_at": now, "updated_at": now,
               "stage_history": [{"stage": d["stage"], "at": now}], "via": "ai"}
        await db.client_leads.insert_one(dict(doc))
    elif module == "support":
        from routes_support import _create as create_ticket, INTERNAL_CATEGORIES
        cat = vals.get("category") if vals.get("category") in INTERNAL_CATEGORIES else "other"
        doc = await create_ticket("internal", vals.get("subject", ""), vals.get("body", ""), cat, vals.get("priority") if vals.get("priority") in ("low", "normal", "high", "urgent") else "normal",
                                  {"type": "user", "id": actor["id"], "name": actor["name"], "email": ""}, actor=actor)
    elif module == "social":
        if not await db.clients.find_one({"id": vals.get("client_id")}, {"_id": 0, "id": 1}):
            raise HTTPException(status_code=400, detail="client_id is required and must exist")
        doc = {"id": str(uuid.uuid4()), "client_id": vals["client_id"], "platform": vals.get("platform", "instagram"), "caption": vals.get("caption", "")[:3000],
               "scheduled_at": vals.get("scheduled_at") or now, "content_type": vals.get("content_type", "post"), "status": "planned",
               "created_by": actor["id"], "created_at": now, "via": "ai"}
        await db.social_posts.insert_one(dict(doc))
    else:
        raise HTTPException(status_code=400, detail="This module is read-only for AI")
    await log_activity(actor, "ai_record_created", module, doc["id"], doc.get("name") or doc.get("subject") or doc.get("number") or doc["id"])
    return {"module": module, "created": _clean(doc, spec)}


async def _update(agent: Agent, module: str, rid: str, data: dict):
    spec = _require(agent, module, "write")
    w = spec.get("write") or {}
    vals = _pick(data, w.get("update", []))
    if not vals:
        raise HTTPException(status_code=400, detail=f"Nothing to change. Allowed fields: {', '.join(w.get('update', []))}")
    actor = agent.actor()
    now = _now()
    coll = spec["coll"]
    doc = await db[coll].find_one({"id": rid}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Record not found")
    if module == "support":
        from routes_support import _add_message, STATUSES, PRIORITIES
        if vals.get("reply"):
            doc = await _add_message(doc, {"type": "user", "id": actor["id"], "name": actor["name"]}, vals["reply"], internal=True, from_team=True)
        sets = {}
        if vals.get("status") in STATUSES:
            sets["status"] = vals["status"]
        if vals.get("priority") in PRIORITIES:
            sets["priority"] = vals["priority"]
        if sets:
            await db.tickets.update_one({"id": rid}, {"$set": {**sets, "updated_at": now}})
    else:
        sets = dict(vals)
        push = None
        if "stage" in sets:
            allowed = ["new", "contacted", "qualified", "proposal", "won", "lost"] if module == "leads" else ["new", "contacted", "qualified", "converted", "lost"]
            if sets["stage"] not in allowed:
                raise HTTPException(status_code=400, detail=f"stage must be one of {', '.join(allowed)}")
            if sets["stage"] != doc.get("stage"):
                push = {"stage_history": {"stage": sets["stage"], "at": now, "by": actor["id"]}}
        if module == "social" and "status" in sets and sets["status"] not in ("planned", "in_review"):
            raise HTTPException(status_code=400, detail="AI can only move a post to planned or in_review")
        sets["updated_at"] = now
        await db[coll].update_one({"id": rid}, {"$set": sets, **({"$push": push} if push else {})})
    await log_activity(actor, "ai_record_updated", module, rid, ", ".join(vals))
    return {"module": module, "updated": _clean(await db[coll].find_one({"id": rid}, {"_id": 0}), spec)}


def _modules_for(agent: Agent):
    out = []
    for k, v in MODULES.items():
        lv = agent.level(k)
        if lv == "none":
            continue
        out.append({"module": k, "label": v["label"], "access": lv, "search_fields": v["search"],
                    **({"create_fields": v["write"]["create"], "update_fields": v["write"]["update"]} if lv == "write" and v.get("write") else {})})
    return out


# ------------------------------------------------------------------ REST for agents
@router.get("/ai/v1/modules")
async def rest_modules(request: Request):
    a = await agent_from_request(request)
    m = _modules_for(a)
    await _log(a, "api", "list_modules", None, len(m))
    return {"token": a.token["name"], "modules": m, "max_rows": a.settings["max_rows"], "instructions": a.settings.get("instructions", "")}


@router.get("/ai/v1/records/{module}")
async def rest_list(module: str, request: Request, q: Optional[str] = None, limit: int = 50, offset: int = 0, updated_since: Optional[str] = None):
    a = await agent_from_request(request)
    filters = {k[7:-1]: v for k, v in request.query_params.items() if k.startswith("filter[") and k.endswith("]")}
    try:
        res = await _query(a, module, q, filters, limit, offset, updated_since)
    except HTTPException as e:
        await _log(a, "api", "query_records", module, 0, False, str(e.detail))
        raise
    await _log(a, "api", "query_records", module, res["count"])
    return res


@router.get("/ai/v1/records/{module}/{rid}")
async def rest_get(module: str, rid: str, request: Request):
    a = await agent_from_request(request)
    res = await _get(a, module, rid)
    await _log(a, "api", "get_record", module, 1)
    return res


@router.get("/ai/v1/search")
async def rest_search(request: Request, q: str = ""):
    a = await agent_from_request(request)
    res = await _search(a, q)
    await _log(a, "api", "search", None, len(res["results"]), detail=q)
    return res


@router.get("/ai/v1/summary")
async def rest_summary(request: Request):
    a = await agent_from_request(request)
    res = await _summary(a)
    await _log(a, "api", "business_summary", None, 1)
    return res


@router.post("/ai/v1/records/{module}")
async def rest_create(module: str, request: Request):
    a = await agent_from_request(request)
    data = await request.json()
    res = await _create(a, module, data if isinstance(data, dict) else {})
    await _log(a, "api", "create_record", module, 1)
    return res


@router.patch("/ai/v1/records/{module}/{rid}")
async def rest_update(module: str, rid: str, request: Request):
    a = await agent_from_request(request)
    data = await request.json()
    res = await _update(a, module, rid, data if isinstance(data, dict) else {})
    await _log(a, "api", "update_record", module, 1)
    return res


# ------------------------------------------------------------------ MCP (Model Context Protocol)
MCP_VERSIONS = ("2025-06-18", "2025-11-25", "2025-03-26", "2024-11-05")  # first = what we answer when the client asks for one we don't know


def _tools(agent: Agent) -> List[dict]:
    mods = [m["module"] for m in _modules_for(agent)]
    writable = [m["module"] for m in _modules_for(agent) if m["access"] == "write"]
    tools = [
        {"name": "list_modules", "description": "List the dotindot Ops modules this agent can read or change, with searchable fields.",
         "inputSchema": {"type": "object", "properties": {}}, "annotations": {"readOnlyHint": True}},
        {"name": "query_records", "description": "List records from one module. Optional text search, exact-match filters and paging.",
         "inputSchema": {"type": "object", "required": ["module"], "properties": {
             "module": {"type": "string", "enum": mods}, "query": {"type": "string", "description": "Text to look for in the module's search fields"},
             "filters": {"type": "object", "description": "Exact field matches, e.g. {\"status\": \"active\"}"},
             "limit": {"type": "integer", "minimum": 1, "maximum": agent.settings["max_rows"]}, "offset": {"type": "integer", "minimum": 0},
             "updated_since": {"type": "string", "description": "ISO date/time — only records created or updated since"}}},
         "annotations": {"readOnlyHint": True}},
        {"name": "get_record", "description": "Fetch one record by id.", "inputSchema": {"type": "object", "required": ["module", "id"], "properties": {
            "module": {"type": "string", "enum": mods}, "id": {"type": "string"}}}, "annotations": {"readOnlyHint": True}},
        {"name": "search", "description": "Search every module this agent can read for a name, company, subject or number.",
         "inputSchema": {"type": "object", "required": ["query"], "properties": {"query": {"type": "string"}}}, "annotations": {"readOnlyHint": True}},
        {"name": "business_summary", "description": "Today's snapshot: clients, projects, pipeline, this month's money, support, attendance (only what this agent may see).",
         "inputSchema": {"type": "object", "properties": {}}, "annotations": {"readOnlyHint": True}},
    ]
    if writable:
        tools += [
            {"name": "create_record", "description": "Create a record in a write-enabled module (" + ", ".join(writable) + "). Call list_modules for the allowed fields.",
             "inputSchema": {"type": "object", "required": ["module", "data"], "properties": {"module": {"type": "string", "enum": writable}, "data": {"type": "object"}}}},
            {"name": "update_record", "description": "Change allowed fields of a record in a write-enabled module (e.g. a lead's stage or a ticket's status / reply).",
             "inputSchema": {"type": "object", "required": ["module", "id", "data"], "properties": {"module": {"type": "string", "enum": writable},
                                                                                                   "id": {"type": "string"}, "data": {"type": "object"}}}},
        ]
    return tools


async def _call_tool(agent: Agent, name: str, args: dict):
    if name == "list_modules":
        return {"modules": _modules_for(agent), "instructions": agent.settings.get("instructions", "")}
    if name == "query_records":
        return await _query(agent, args.get("module", ""), args.get("query"), args.get("filters"), args.get("limit", 50), int(args.get("offset") or 0), args.get("updated_since"))
    if name == "get_record":
        return await _get(agent, args.get("module", ""), args.get("id", ""))
    if name == "search":
        return await _search(agent, args.get("query", ""))
    if name == "business_summary":
        return await _summary(agent)
    if name == "create_record":
        return await _create(agent, args.get("module", ""), args.get("data") or {})
    if name == "update_record":
        return await _update(agent, args.get("module", ""), args.get("id", ""), args.get("data") or {})
    raise HTTPException(status_code=404, detail=f"Unknown tool {name}")


def _rpc_error(mid, code, msg):
    return {"jsonrpc": "2.0", "id": mid, "error": {"code": code, "message": msg}}


async def _handle(agent: Agent, msg: dict):
    mid, method, params = msg.get("id"), msg.get("method"), msg.get("params") or {}
    if method == "initialize":
        want = params.get("protocolVersion")
        return {"jsonrpc": "2.0", "id": mid, "result": {
            "protocolVersion": want if want in MCP_VERSIONS else MCP_VERSIONS[0],
            "capabilities": {"tools": {"listChanged": False}},
            "serverInfo": {"name": "dotindot-ops", "title": "dotindot Ops", "version": "3.0"},
            "instructions": "dotindot Creative's internal operations data. Start with business_summary or list_modules. " + (agent.settings.get("instructions") or "")}}
    if method and method.startswith("notifications/"):
        return None
    if method == "ping":
        return {"jsonrpc": "2.0", "id": mid, "result": {}}
    if method == "tools/list":
        return {"jsonrpc": "2.0", "id": mid, "result": {"tools": _tools(agent)}}
    if method == "tools/call":
        name, args = params.get("name"), params.get("arguments") or {}
        try:
            data = await _call_tool(agent, name, args)
            count = data.get("count") if isinstance(data, dict) and "count" in data else 1
            await _log(agent, "mcp", name, args.get("module"), count or 0)
            return {"jsonrpc": "2.0", "id": mid, "result": {"content": [{"type": "text", "text": json.dumps(data, default=str, ensure_ascii=False)}],
                                                           "structuredContent": data, "isError": False}}
        except HTTPException as e:
            await _log(agent, "mcp", name or "?", args.get("module"), 0, False, str(e.detail))
            return {"jsonrpc": "2.0", "id": mid, "result": {"content": [{"type": "text", "text": str(e.detail)}], "isError": True}}
    if method in ("resources/list", "prompts/list"):
        return {"jsonrpc": "2.0", "id": mid, "result": {"resources" if method.startswith("resources") else "prompts": []}}
    return _rpc_error(mid, -32601, f"Method not found: {method}")


@router.post("/ai/mcp")
async def mcp(request: Request):
    try:
        agent = await agent_from_request(request)
    except HTTPException as e:
        return JSONResponse(status_code=e.status_code, content={"jsonrpc": "2.0", "id": None, "error": {"code": -32001, "message": e.detail}})
    try:
        body = await request.json()
    except Exception:
        return JSONResponse(status_code=400, content=_rpc_error(None, -32700, "Parse error"))
    if isinstance(body, list):
        out = [r for r in [await _handle(agent, m) for m in body] if r is not None]
        return JSONResponse(content=out) if out else Response(status_code=202)
    res = await _handle(agent, body)
    if res is None:
        return Response(status_code=202)
    return JSONResponse(content=res, headers={"Mcp-Session-Id": agent.token["id"]})


@router.get("/ai/mcp")
async def mcp_get():
    return Response(status_code=405, headers={"Allow": "POST"})


@router.delete("/ai/mcp")
async def mcp_delete():
    return Response(status_code=204)
