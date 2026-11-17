"""AI connections — let Claude, ChatGPT and your own tools work in dotindot, safely.

Settings → AI → Connections (permission `ai_settings`):
* A connection works *as one login*: that login's role, permissions and branches apply to everything the AI does, and
  every change it makes shows in the activity log as "<connection> (AI)". Only a super admin can connect an AI as
  someone else, so an AI never gets more access than the person who set it up.
* Access: Read only · Read & write (no deleting) · Full control. Two extra switches, off by default, that only a super
  admin can turn on: change logins & permissions, read saved passwords & ID numbers.
* Never open to an AI, whatever the settings: AI settings and connections, signing in and passwords, the client and
  investor portals, recycle-bin restores and wipes, erasing the activity log.
* Claude / ChatGPT: add https://<your address>/api/mcp as a custom connector. They sign in with OAuth 2.1 (PKCE S256,
  dynamic client registration) and someone with AI settings access approves the connection on /app/connect-ai.
* Scripts, n8n, Claude Code: an access key (dot_key_…) sent as `Authorization: Bearer <key>` to /api/mcp or to any
  /api endpoint. Keys expire within a year.
* Keys and tokens are stored only as SHA-256 hashes; a key is shown once. Every call is logged for 90 days.
* MCP: POST /api/mcp (Streamable HTTP, JSON answers, stateless). Tools: whoami, app_map, list_endpoints,
  describe_endpoint and call_api — together they reach every endpoint the login may use.
"""
import base64
import hashlib
import ipaddress
import json
import os
import re
import secrets
import time
import uuid
from collections import deque
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import urlencode, urlparse

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, Response
from pydantic import BaseModel

from database import db
from auth import get_current_user, log_activity, client_ip
from permissions import has_permission, match_permission, branch_scope

router = APIRouter()        # mounted under /api
root_router = APIRouter()   # site root: /.well-known/… (must be included before the website's catch-all)

PREFIX = "dot_"
LEGACY_PREFIX = "dai_"
ACCESS_LEVELS = ("read", "write", "full")
ACCESS_LABEL = {"read": "Read only", "write": "Read & write", "full": "Full control"}
READ_METHODS = {"GET", "HEAD", "OPTIONS"}
CALL_METHODS = ("GET", "POST", "PUT", "PATCH", "DELETE")
# POSTs that only calculate or export — a read-only connection may use them
READ_POSTS = {"/api/finance/loans/preview", "/api/hr/payroll/structures/preview", "/api/reports/custom/preview", "/api/reports/custom/export"}
DELETE_RE = re.compile(r"/(bulk-delete|purge|wipe)$")
SECRET_RE = re.compile(r"^/api/(passwords/[^/]+/(reveal|copy)|clients/[^/]+/credentials/[^/]+/reveal|hr/people/[^/]+/reveal"
                       r"|hr/payroll/runs/[^/]+/statutory)$")
ACCESS_TOKEN_SECONDS = 3600
REFRESH_TOKEN_DAYS = 60
CODE_SECONDS = 300
REQUEST_SECONDS = 900
ACTIVITY_DAYS = 90
RATE_PER_MINUTE = 300
KEY_DEFAULT_DAYS = 90
KEY_MAX_DAYS = 366
MAX_TEXT = 100_000
PROTOCOLS = ("2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05")
SCOPE = "dotindot"
CONSENT_PATH = "/app/connect-ai"
KNOWN_APP_HOSTS = ("claude.ai", "claude.com", "anthropic.com", "chatgpt.com", "openai.com")
LOCAL_HOSTS = ("localhost", "127.0.0.1", "::1")
MCP_PATHS = ("/api/mcp", "/api/ai/mcp")   # /api/ai/mcp: the address older set-ups used

APP = {"app": None}   # set by server.py so call_api can reach the app in-process


def init(app) -> None:
    APP["app"] = app
    _index.clear()


# ───────────────────────── pure helpers ─────────────────────────
def new_secret(kind: str) -> str:
    return f"{PREFIX}{kind}_{secrets.token_urlsafe(32)}"


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def today_ist() -> str:
    return (now_utc() + timedelta(hours=5, minutes=30)).date().isoformat()


def _under(path: str, prefix: str) -> bool:
    return path == prefix or path.startswith(prefix + "/")


def is_delete(method: str, path: str) -> bool:
    return method.upper() == "DELETE" or bool(DELETE_RE.search(path))


def method_allowed(access: str, method: str, path: str = "") -> bool:
    method = method.upper()
    if access == "full":
        return True
    if is_delete(method, path):
        return False
    if access == "write":
        return True
    return method in READ_METHODS or (method == "POST" and path in READ_POSTS)


def refusal(path: str, method: str, conn: Dict[str, Any]) -> Optional[str]:
    """Why this connection may not make this call (None = it may; the login's own permissions are checked after)."""
    p = (path or "/").rstrip("/") or "/"
    method = method.upper()
    if any(_under(p, x) for x in ("/api/ai-settings", "/api/ai-connections", "/api/ai", "/api/oauth", "/api/mcp")):
        return "An AI connection can't see or change AI settings or connections. A person does that in Settings → AI."
    if _under(p, "/api/auth"):
        return None if (method == "GET" and p == "/api/auth/me") else "Signing in and passwords are for people, not AI connections."
    if _under(p, "/api/portal") or _under(p, "/api/investor-portal"):
        return "The client and investor portals have their own logins. An AI connection works as a staff login."
    if method not in READ_METHODS and (_under(p, "/api/workspace") or _under(p, "/api/logs/purge") or _under(p, "/api/records/activity_logs")):
        return "Restoring or wiping the recycle bin and erasing the activity log are for people, not AI connections."
    if method not in READ_METHODS and (_under(p, "/api/users") or _under(p, "/api/access")) and not conn.get("manage_access"):
        return "This connection can't change logins or permissions. A super admin can allow it in Settings → AI."
    if SECRET_RE.match(p) and not conn.get("read_secrets"):
        return "This connection can't read saved passwords or ID numbers. A super admin can allow it in Settings → AI."
    access = conn.get("access", "read")
    if not method_allowed(access, method, p):
        if access == "read":
            return "This connection is read only. Someone with AI settings access can allow changes in Settings → AI."
        return "This connection can't delete. Someone with AI settings access can give it full control in Settings → AI."
    return None


def pkce_ok(verifier: str, challenge: str) -> bool:
    if not verifier or not challenge or not (43 <= len(verifier) <= 128):
        return False
    digest = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
    return secrets.compare_digest(digest, challenge)


def redirect_uri_ok(uri: str) -> bool:
    """https anywhere; http only to this computer (desktop apps); an app's own scheme (cursor://…) is allowed."""
    try:
        u = urlparse(uri or "")
    except ValueError:
        return False
    if not u.scheme or u.fragment or len(uri) > 500 or u.username or u.password:
        return False
    if u.scheme == "https":
        return bool(u.hostname)
    if u.scheme == "http":
        return u.hostname in LOCAL_HOSTS
    return bool(re.match(r"^[a-z][a-z0-9+.-]{1,30}$", u.scheme)) and u.scheme not in ("javascript", "data", "file", "vbscript", "about", "blob", "http", "https")


def known_app(uri: str) -> bool:
    host = (urlparse(uri).hostname or "").lower()
    return any(host == h or host.endswith("." + h) for h in KNOWN_APP_HOSTS)


def with_query(uri: str, params: Dict[str, Any]) -> str:
    q = urlencode({k: v for k, v in params.items() if v not in (None, "")})
    return uri + ("&" if "?" in uri else "?") + q


def _keep(items: List[Any], budget: int) -> int:
    size = 2
    for i, item in enumerate(items):
        size += len(json.dumps(item, ensure_ascii=False, default=str)) + 1
        if size > budget:
            return i
    return len(items)


def fit(data: Any, limit: int = MAX_TEXT) -> str:
    """JSON text for a tool result, cut down to the size limit (long lists keep their first items)."""
    text = json.dumps(data, ensure_ascii=False, default=str)
    if len(text) <= limit:
        return text
    note = "Narrow the call with its query parameters (search, status, dates, limit) to see the rest."
    if isinstance(data, list):
        n = _keep(data, limit - 400)
        return json.dumps({"items": data[:n], "note": f"Showing the first {n} of {len(data)} items. {note}"}, ensure_ascii=False, default=str)
    if isinstance(data, dict):
        for key in ("data", "items", "rows", "endpoints"):
            inner = data.get(key)
            if isinstance(inner, list) and len(inner) > 1:
                rest = len(text) - len(json.dumps(inner, ensure_ascii=False, default=str))
                n = _keep(inner, limit - rest - 400)
                return json.dumps({**data, key: inner[:n], "note": f"Showing the first {n} of {len(inner)} items. {note}"}, ensure_ascii=False, default=str)
    return text[: limit - 200] + f"… [cut: the full answer is {len(text)} characters — narrow the call]"


def header_text(text: str) -> str:
    """Plain ASCII for an HTTP header (headers can't carry → or curly quotes)."""
    for a, b in (("→", "->"), ("—", "-"), ("–", "-"), ("’", "'"), ("‘", "'"), ("“", "'"), ("”", "'"), ('"', "'"), ("…", "...")):
        text = text.replace(a, b)
    return text.encode("ascii", "ignore").decode()


def compact_schema(schema: Any, components: Dict[str, Any], depth: int = 0) -> Any:
    """A short, readable version of an OpenAPI schema (refs resolved, 4 levels deep)."""
    if not isinstance(schema, dict):
        return schema
    if "$ref" in schema:
        name = schema["$ref"].split("/")[-1]
        if depth >= 4:
            return {"type": "object", "model": name}
        return compact_schema(components.get(name, {}), components, depth + 1)
    for key in ("anyOf", "oneOf"):
        if key in schema:
            opts = [compact_schema(s, components, depth) for s in schema[key]]
            non_null = [o for o in opts if not (isinstance(o, dict) and o.get("type") == "null")]
            if len(non_null) == 1 and len(non_null) < len(opts):
                out = dict(non_null[0]) if isinstance(non_null[0], dict) else {"type": non_null[0]}
                out["nullable"] = True
                if "default" in schema:
                    out["default"] = schema["default"]
                return out
            return {"any_of": opts}
    if "allOf" in schema and len(schema["allOf"]) == 1:
        return compact_schema(schema["allOf"][0], components, depth)
    t = schema.get("type")
    out: Dict[str, Any] = {}
    if t == "object" or "properties" in schema:
        props = schema.get("properties") or {}
        if depth >= 4:
            return {"type": "object"}
        out = {"type": "object", "properties": {k: compact_schema(v, components, depth + 1) for k, v in props.items()}}
        if schema.get("required"):
            out["required"] = schema["required"]
        if not props and schema.get("additionalProperties") not in (None, False):
            out["additional_properties"] = True
        return out
    if t == "array":
        return {"type": "array", "items": compact_schema(schema.get("items", {}), components, depth + 1)}
    for k in ("type", "format", "enum", "default", "description", "minimum", "maximum", "maxLength"):
        if k in schema:
            out[k] = schema[k]
    return out or {"type": "any"}


def host_name(host: str) -> str:
    """'dotindot.in:443' → 'dotindot.in'; '[::1]:8001' → '::1'."""
    h = (host or "").strip().lower()
    if h.startswith("["):
        return h[1:h.find("]")] if "]" in h else h[1:]
    return h.rsplit(":", 1)[0] if h.count(":") == 1 else h


def is_local_host(host: str) -> bool:
    """This computer or the local network — the only places an http:// address is acceptable."""
    h = host_name(host)
    if not h or h == "localhost" or h.endswith(".localhost") or h.endswith(".local") or h == "test":
        return True
    try:
        ip = ipaddress.ip_address(h)
    except ValueError:
        return False
    return ip.is_loopback or ip.is_private or ip.is_unspecified or ip.is_link_local


def clean_public_url(value: Optional[str]) -> str:
    """'dotindot.in' or 'http://dotindot.in/api/mcp' → 'https://dotindot.in'. '' when it isn't a usable address."""
    v = (value or "").strip()
    if not v:
        return ""
    if "://" not in v:
        v = "https://" + v
    try:
        u = urlparse(v)
        if u.scheme not in ("http", "https") or not u.hostname or u.username or u.password or u.query or u.fragment:
            return ""
        u.port  # raises on a bad port
    except ValueError:
        return ""
    scheme = u.scheme if is_local_host(u.netloc) else "https"
    path = u.path.rstrip("/")
    for tail in ("/api/mcp", "/api"):
        if path.endswith(tail):
            path = path[: -len(tail)]
    return f"{scheme}://{u.netloc.lower()}{path}"


def humanize(name: str) -> str:
    return (name or "").replace("_", " ").strip().capitalize()


def first_line(doc: Optional[str]) -> str:
    return " ".join((doc or "").strip().split())[:400]


# ───────────────────────── areas (what the AI sees in app_map) ─────────────────────────
# first path segment → (area, name, what it is). Segments marked None are never shown to an AI.
AREAS: Dict[str, Optional[tuple]] = {
    "dashboard": ("dashboard", "Dashboards", "Headline numbers for each role's home screen"),
    "ceo": ("dashboard", "Dashboards", "Headline numbers for each role's home screen"),
    "search": ("search", "Search", "Search across clients, projects, people and more"),
    "notifications": ("notifications", "Notifications", "The login's notifications"),
    "me": ("me", "My things", "The login's own HR record, payslips, handovers and permissions"),
    "clients": ("clients", "Clients", "Client companies, contacts, contracts, saved logins and portal access"),
    "projects": ("projects", "Projects", "Client and internal projects: milestones, deliverables, team, budget"),
    "sales": ("sales", "Sales", "Our own leads pipeline, quotes, targets and the sales screen"),
    "lead-flow": ("lead_flow", "Client leads", "Leads we bring in for clients, by source and stage"),
    "client-leads": ("lead_flow", "Client leads", "Leads we bring in for clients, by source and stage"),
    "billing": ("billing", "Billing", "GST quotes, invoices, payments and credit notes"),
    "revenue": ("revenue", "MRR & ARR", "Recurring revenue: MRR, ARR, trend, renewals and this month's recurring bills"),
    "finance": ("finance", "Finance", "Ledger, expenses, subscriptions, budgets, AI spend, API credits, loans, project profit"),
    "investors": ("investors", "Investors", "Investors, investments and company valuations"),
    "investors-settings": ("investors", "Investors", "Investors, investments and company valuations"),
    "investors-valuations": ("investors", "Investors", "Investors, investments and company valuations"),
    "hr": ("hr", "HR", "People records, onboarding and offboarding, handovers, payroll and hiring"),
    "employees": ("people", "Team", "Team directory and work profiles"),
    "training": ("training", "Training", "Courses and who is assigned to them"),
    "daily": ("attendance", "Attendance & daily reports", "Check-ins, daily reports and attendance"),
    "timesheets": ("attendance", "Attendance & daily reports", "Weekly timesheets"),
    "holidays": ("attendance", "Attendance & daily reports", "Holiday calendar"),
    "support": ("support", "Support", "Client support tickets"),
    "growth": ("growth", "Growth", "Growth plans and experiments for clients"),
    "ads": ("marketing", "Ads, social & influencers", "Ad campaigns"),
    "social": ("marketing", "Ads, social & influencers", "Social media calendar and posts"),
    "influencers": ("marketing", "Ads, social & influencers", "Influencers and collaborations"),
    "website": ("website", "Website", "dotindot.in pages, insights, SEO, careers and the chat assistant"),
    "website-settings": ("website", "Website", "dotindot.in pages, insights, SEO, careers and the chat assistant"),
    "website-publish": ("website", "Website", "dotindot.in pages, insights, SEO, careers and the chat assistant"),
    "partnerships": ("operations", "Partnerships & assets", "Partner programmes and tools we pay for"),
    "assets": ("operations", "Partnerships & assets", "Laptops, phones and other company assets"),
    "locations": ("branches", "Branches", "Branches and office locations"),
    "agents": ("ai_agents", "AI agents register", "AI tools the team uses, who uses them and time saved"),
    "org": ("org", "Org structure", "Roles, responsibilities and who reports to whom"),
    "reports": ("reports", "Reports", "Ready-made and custom reports"),
    "exports": ("reports", "Reports", "Excel and PDF exports"),
    "logs": ("logs", "Activity log", "Who did what, when"),
    "records": ("records", "Delete & restore", "Deleting records (they go to the recycle bin)"),
    "workspace": ("records", "Delete & restore", "The recycle bin"),
    "users": ("logins", "Logins", "Staff logins"),
    "access": ("logins", "Logins", "Role and per-person permissions"),
    "passwords": ("passwords", "Password manager", "Shared logins for tools and client accounts"),
    # never for an AI: sign-in, portals, public website forms, AI settings themselves
    "": None, "auth": None, "portal": None, "investor-portal": None, "share": None, "intake": None, "careers": None, "chat": None,
    "oauth": None, "mcp": None, "ai": None, "ai-settings": None, "ai-connections": None,
}
# areas whose prefix isn't in permissions.PATH_PERMISSIONS but whose routes check this permission themselves
EXTRA_PERMS = {"investors-settings": ("investors",), "investors-valuations": ("investors",), "website-settings": ("website",), "website-publish": ("website",)}


def _segment(path: str) -> str:
    return (path.split("/") + ["", "", ""])[2]


def endpoint_perms(path: str):
    return match_permission(path) or EXTRA_PERMS.get(_segment(path))


_index: List[Dict[str, Any]] = []
_spec: Dict[str, Any] = {}


def index() -> List[Dict[str, Any]]:
    if _index:
        return _index
    from fastapi.routing import APIRoute
    rows = []
    for r in (APP["app"].routes if APP["app"] else []):
        if not isinstance(r, APIRoute) or not r.path.startswith("/api/") or not r.include_in_schema:
            continue
        seg = _segment(r.path)
        area = AREAS.get(seg, (seg, humanize(seg.replace("-", " ")), ""))
        if area is None and r.path != "/api/auth/me":
            continue
        area = area or ("me", "My things", "")
        for m in sorted((r.methods or set()) - {"HEAD", "OPTIONS"}):
            rows.append({"method": m, "path": r.path, "summary": r.summary or humanize(r.name), "about": first_line(r.description or r.endpoint.__doc__),
                         "area": area[0], "area_name": area[1], "area_what": area[2]})
    _index.extend(rows)
    return _index


def spec() -> Dict[str, Any]:
    if not _spec and APP["app"]:
        _spec.update(APP["app"].openapi())
    return _spec


def visible(user: Dict[str, Any]) -> List[Dict[str, Any]]:
    conn = user["agent"]
    out = []
    for e in index():
        if refusal(e["path"], e["method"], conn):
            continue
        keys = endpoint_perms(e["path"])
        if keys and not has_permission(user, *keys):
            continue
        out.append(e)
    return out


# ───────────────────────── settings ─────────────────────────
_settings_cache: Dict[str, Any] = {"at": 0.0, "value": None}


async def conn_settings() -> Dict[str, Any]:
    if _settings_cache["value"] is not None and time.monotonic() - _settings_cache["at"] < 5:
        return _settings_cache["value"]
    d = await db.settings.find_one({"id": "ai"}, {"_id": 0}) or {}
    value = {"enabled": bool(d.get("enabled", False)), "instructions": (d.get("instructions") or "")[:4000]}
    _settings_cache.update(at=time.monotonic(), value=value)
    return value


def forget_settings() -> None:
    _settings_cache["value"] = None


async def base_url(request: Request) -> str:
    """Where AI apps reach dotindot: PUBLIC_BASE_URL in .env, else this request's host. A public host is always https:
    behind nginx the backend only sees http, and connectors refuse an http address."""
    env = clean_public_url(os.environ.get("PUBLIC_BASE_URL"))
    if env:
        return env
    host = (request.headers.get("host") or request.url.netloc).split(",")[0].strip()   # X-Forwarded-Host isn't trusted
    proto = (request.headers.get("x-forwarded-proto") or request.url.scheme or "https").split(",")[0].strip().lower()
    if not is_local_host(host) or proto not in ("http", "https"):
        proto = "https"
    return f"{proto}://{host}"


async def links(request: Request) -> Dict[str, Any]:
    b = await base_url(request)
    return {"base_url": b, "mcp_url": f"{b}/api/mcp", "openapi_url": f"{b}/api/mcp/openapi.json", "api_url": f"{b}/api",
            "https": b.startswith("https://"), "from_env": bool(clean_public_url(os.environ.get("PUBLIC_BASE_URL")))}


# ───────────────────────── tokens + who is calling ─────────────────────────
_hits: Dict[str, deque] = {}
_touched: Dict[str, float] = {}


def rate_ok(conn_id: str) -> bool:
    dq = _hits.setdefault(conn_id, deque())
    now = time.monotonic()
    while dq and now - dq[0] > 60:
        dq.popleft()
    if len(dq) >= RATE_PER_MINUTE:
        return False
    dq.append(now)
    return True


async def issue(conn_id: str, kind: str, seconds: Optional[int] = None) -> str:
    token = new_secret({"key": "key", "access": "at", "refresh": "rt"}[kind])
    doc = {"hash": token_hash(token), "connection_id": conn_id, "kind": kind, "revoked": False, "created_at": now_utc().isoformat()}
    if seconds:
        exp = now_utc() + timedelta(seconds=seconds)
        doc.update(expires_at=exp.isoformat(), expires_dt=exp)
    await db.ai_conn_tokens.insert_one(doc)
    return token


def _active(u: Optional[dict]) -> bool:
    return bool(u) and u.get("is_active", True) and not u.get("deleted")


async def authenticate(request: Request, token: str, check_route: bool = True) -> Dict[str, Any]:
    """The login an AI connection works as, with the connection's limits applied to this request."""
    h = token_hash(token)
    cached = getattr(request.state, "ai_user", None)
    if check_route and cached and cached[0] == h:
        return cached[1]
    bad = HTTPException(status_code=401, detail="This AI key isn't valid — it may have been replaced or removed")
    t = await db.ai_conn_tokens.find_one({"hash": h})
    if not t or t.get("revoked") or t.get("kind") == "refresh":
        raise bad
    if t.get("expires_at") and t["expires_at"] < now_utc().isoformat():
        raise HTTPException(status_code=401, detail="This sign-in has expired")
    conn = await db.ai_connections.find_one({"id": t["connection_id"]}, {"_id": 0})
    if not conn:
        raise bad
    ip = client_ip(request)
    request.state.ai_ctx = {"id": conn["id"], "name": conn["name"], "ip": ip}     # refused calls are logged too
    if not (await conn_settings())["enabled"]:
        raise HTTPException(status_code=401, detail="AI connections are switched off in dotindot (Settings → AI)")
    if conn.get("status") != "active":
        raise HTTPException(status_code=401, detail="This AI connection is paused (Settings → AI)")
    if conn.get("expires_on") and today_ist() > conn["expires_on"]:
        raise HTTPException(status_code=401, detail="This AI connection has expired (Settings → AI)")
    runner = await db.users.find_one({"id": conn.get("run_as_user_id")}, {"_id": 0, "password_hash": 0})
    if not _active(runner):
        raise HTTPException(status_code=401, detail="The login this AI connection works as is closed. Choose another in Settings → AI.")
    if conn.get("created_by") != runner["id"]:
        maker = await db.users.find_one({"id": conn.get("created_by")}, {"_id": 0, "is_active": 1, "deleted": 1, "role": 1})
        if not _active(maker) or maker.get("role") != "super_admin":
            raise HTTPException(status_code=401, detail="The person who set up this AI connection can no longer vouch for it. Set it up again in Settings → AI.")
    if not rate_ok(conn["id"]):
        raise HTTPException(status_code=429, detail=f"Too many calls — an AI connection may make {RATE_PER_MINUTE} a minute")
    if check_route:
        path, method = request.url.path, request.method
        reason = refusal(path, method, conn)
        if reason:
            raise HTTPException(status_code=403, detail=reason)
        keys = endpoint_perms(path)
        if keys and not has_permission(runner, *keys):
            raise HTTPException(status_code=403, detail=f"{runner.get('name', 'This login')}'s login doesn't have access to this part of dotindot")
    if time.monotonic() - _touched.get(conn["id"], 0) > 60:
        _touched[conn["id"]] = time.monotonic()
        await db.ai_connections.update_one({"id": conn["id"]}, {"$set": {"last_used_at": now_utc().isoformat(), "last_ip": ip}})
    user = {**runner, "name": f"{conn['name']} (AI)", "is_agent": True,
            "agent": {"id": conn["id"], "name": conn["name"], "kind": conn.get("kind", "key"), "access": conn.get("access", "read"),
                      "manage_access": bool(conn.get("manage_access")), "read_secrets": bool(conn.get("read_secrets")),
                      "works_as": runner.get("name"), "works_as_id": runner["id"]}}
    if check_route:
        request.state.ai_user = (h, user)
    return user


async def user_from_token(request: Request, token: str) -> Dict[str, Any]:
    """auth.get_current_user hands AI tokens to this."""
    if token.startswith(LEGACY_PREFIX):
        raise HTTPException(status_code=401, detail="Old AI tokens were retired. Connect again in Settings → AI.")
    return await authenticate(request, token)


class ActivityMiddleware:
    """Logs every API request made with an AI key or token (method, path, status, time) once it is answered."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        headers = dict(scope.get("headers") or [])
        auth = headers.get(b"authorization", b"")
        path = scope.get("path", "")
        if not auth.startswith(b"Bearer " + PREFIX.encode()) or path.rstrip("/") in MCP_PATHS:
            return await self.app(scope, receive, send)
        started, status = time.monotonic(), {"code": 500}

        async def send_wrap(message):
            if message["type"] == "http.response.start":
                status["code"] = message["status"]
            await send(message)

        try:
            await self.app(scope, receive, send_wrap)
        finally:
            ctx = (scope.get("state") or {}).get("ai_ctx")
            if ctx:
                try:
                    via = "mcp" if headers.get(b"x-dot-via", b"") == b"mcp" else "api"
                    at = now_utc()
                    await db.ai_activity.insert_one({"id": str(uuid.uuid4()), "connection_id": ctx["id"], "connection_name": ctx["name"], "at": at.isoformat(),
                                                     "at_dt": at, "method": scope.get("method", ""), "path": path[:300], "status": status["code"],
                                                     "ms": int((time.monotonic() - started) * 1000), "via": via, "ip": ctx.get("ip", "")})
                except Exception:  # noqa: BLE001 — logging must never break the request
                    pass


# ───────────────────────── Settings → AI → Connections ─────────────────────────
class SettingsBody(BaseModel):
    enabled: Optional[bool] = None
    instructions: Optional[str] = None


class ConnectionBody(BaseModel):
    name: Optional[str] = None
    run_as_user_id: Optional[str] = None
    access: Optional[str] = None
    manage_access: Optional[bool] = None
    read_secrets: Optional[bool] = None
    expires_on: Optional[str] = None
    note: Optional[str] = None
    status: Optional[str] = None


class ApproveBody(BaseModel):
    name: Optional[str] = None
    run_as_user_id: Optional[str] = None
    access: str = "read"
    manage_access: bool = False
    read_secrets: bool = False


def _manager(user: dict) -> dict:
    if user.get("is_agent") or not has_permission(user, "ai_settings"):
        raise HTTPException(status_code=403, detail="AI connections are managed by people with the AI settings permission")
    return user


def _is_super(user: dict) -> bool:
    return user.get("role") == "super_admin"


def _may_edit(user: dict, conn: dict) -> bool:
    return _is_super(user) or conn.get("run_as_user_id") == user["id"]


async def _runner_for(user: dict, uid: Optional[str]) -> dict:
    uid = uid or user["id"]
    if uid != user["id"] and not _is_super(user):
        raise HTTPException(status_code=403, detail="You can connect an AI as yourself only. A super admin can connect one as another login.")
    u = await db.users.find_one({"id": uid}, {"_id": 0, "id": 1, "name": 1, "role": 1, "is_active": 1, "deleted": 1})
    if not _active(u):
        raise HTTPException(status_code=400, detail="Choose an active login for the AI to work as")
    return u


def _check_fields(body: Dict[str, Any], user: dict, kind: str, creating: bool, current: Optional[dict] = None) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    if body.get("name") is not None:
        name = " ".join(str(body["name"]).split())[:60]
        if len(name) < 2:
            raise HTTPException(status_code=400, detail="Give the connection a name, for example Claude or Weekly report bot")
        out["name"] = name
    if body.get("access") is not None:
        if body["access"] not in ACCESS_LEVELS:
            raise HTTPException(status_code=400, detail="Access is read, write or full")
        out["access"] = body["access"]
    for k in ("manage_access", "read_secrets"):
        if body.get(k) is not None:
            if body[k] and not (current or {}).get(k) and not _is_super(user):   # keeping what a super admin allowed is fine
                raise HTTPException(status_code=403, detail="Only a super admin can let an AI change logins or read saved passwords")
            out[k] = bool(body[k])
    if "expires_on" in body or (creating and kind == "key"):
        exp = body.get("expires_on") or None
        if kind == "key" and not exp:
            exp = (now_utc() + timedelta(hours=5, minutes=30) + timedelta(days=KEY_DEFAULT_DAYS)).date().isoformat()
        if exp:
            try:
                d = date.fromisoformat(str(exp)[:10])
            except ValueError:
                raise HTTPException(status_code=400, detail="The end date must be a date like 2026-12-31")
            if d.isoformat() < today_ist():
                raise HTTPException(status_code=400, detail="That end date has already passed")
            if kind == "key" and (d - date.fromisoformat(today_ist())).days > KEY_MAX_DAYS:
                raise HTTPException(status_code=400, detail="An access key can last a year at most — make a new one when it ends")
            exp = d.isoformat()
        out["expires_on"] = exp
    if body.get("note") is not None:
        out["note"] = str(body["note"]).strip()[:300]
    if body.get("status") is not None:
        if body["status"] not in ("active", "paused"):
            raise HTTPException(status_code=400, detail="Status is active or paused")
        out["status"] = body["status"]
    return out


async def _rows(user: dict, docs: List[dict]) -> List[dict]:
    uids = {d.get("run_as_user_id") for d in docs} | {d.get("created_by") for d in docs}
    users = {u["id"]: u for u in await db.users.find({"id": {"$in": [x for x in uids if x]}},
                                                     {"_id": 0, "id": 1, "name": 1, "role": 1, "is_active": 1, "deleted": 1}).to_list(500)}
    since = (now_utc() - timedelta(hours=24)).isoformat()
    counts = {r["_id"]: r["n"] for r in await db.ai_activity.aggregate([{"$match": {"at": {"$gte": since}}},
                                                                         {"$group": {"_id": "$connection_id", "n": {"$sum": 1}}}]).to_list(1000)}
    today = today_ist()
    out = []
    for d in docs:
        u = users.get(d.get("run_as_user_id")) or {}
        state = d.get("status", "active")
        if state == "active" and d.get("expires_on") and today > d["expires_on"]:
            state = "expired"
        if state == "active" and not _active(u):
            state = "login closed"
        out.append({"id": d["id"], "name": d["name"], "kind": d.get("kind", "key"), "app_name": d.get("client_name"),
                    "run_as_user_id": d.get("run_as_user_id"), "run_as_name": u.get("name"), "run_as_role": u.get("role"),
                    "access": d.get("access", "read"), "access_label": ACCESS_LABEL.get(d.get("access", "read")),
                    "manage_access": bool(d.get("manage_access")), "read_secrets": bool(d.get("read_secrets")),
                    "status": d.get("status", "active"), "state": state, "expires_on": d.get("expires_on"), "note": d.get("note", ""),
                    "key_hint": d.get("key_hint"), "created_by_name": d.get("created_by_name"), "created_at": d.get("created_at"),
                    "last_used_at": d.get("last_used_at"), "calls_24h": counts.get(d["id"], 0), "can_edit": _may_edit(user, d)})
    return out


async def _logins_for(user: dict) -> List[dict]:
    if not _is_super(user):
        return [{"id": user["id"], "name": user["name"], "role": user["role"]}]
    rows = await db.users.find({"is_active": {"$ne": False}, "deleted": {"$ne": True}}, {"_id": 0, "id": 1, "name": 1, "role": 1, "email": 1}).sort("name", 1).to_list(500)
    return rows


async def _find(cid: str) -> dict:
    c = await db.ai_connections.find_one({"id": cid}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Connection not found")
    return c


async def _editable(user: dict, cid: str) -> dict:
    c = await _find(cid)
    if not _may_edit(user, c):
        raise HTTPException(status_code=403, detail="Only a super admin, or the person this AI works as, can change this connection")
    return c


async def overview(request: Request, user: dict) -> Dict[str, Any]:
    st = await conn_settings()
    docs = await db.ai_connections.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return {**st, **(await links(request)), "connections": await _rows(user, docs), "logins": await _logins_for(user),
            "is_super_admin": _is_super(user), "me": {"id": user["id"], "name": user["name"], "role": user["role"]},
            "access_levels": [{"key": k, "label": ACCESS_LABEL[k]} for k in ACCESS_LEVELS],
            "key_default_days": KEY_DEFAULT_DAYS, "key_max_days": KEY_MAX_DAYS}


@router.get("/ai-connections")
async def list_connections(request: Request, user: dict = Depends(get_current_user)):
    return await overview(request, _manager(user))


@router.put("/ai-connections/settings")
async def save_conn_settings(body: SettingsBody, request: Request, user: dict = Depends(get_current_user)):
    _manager(user)
    sets: Dict[str, Any] = {}
    if body.enabled is not None:
        sets["enabled"] = bool(body.enabled)
    if body.instructions is not None:
        sets["instructions"] = body.instructions.strip()[:4000]
    if not sets:
        raise HTTPException(status_code=400, detail="Nothing to change")
    await db.settings.update_one({"id": "ai"}, {"$set": {"id": "ai", **sets, "updated_at": now_utc().isoformat(), "updated_by": user["name"]}}, upsert=True)
    forget_settings()
    what = ("AI connections switched on" if sets.get("enabled") else "AI connections switched off") if "enabled" in sets else "AI house rules updated"
    await log_activity(user, "ai_connections_settings", "settings", "ai", what)
    return await overview(request, user)


@router.post("/ai-connections")
async def create_connection(body: ConnectionBody, request: Request, user: dict = Depends(get_current_user)):
    _manager(user)
    fields = _check_fields({**body.model_dump(), "name": body.name or ""}, user, "key", creating=True)
    runner = await _runner_for(user, body.run_as_user_id)
    now = now_utc().isoformat()
    doc = {"id": str(uuid.uuid4()), "name": fields["name"], "kind": "key", "run_as_user_id": runner["id"], "access": fields.get("access", "read"),
           "manage_access": fields.get("manage_access", False), "read_secrets": fields.get("read_secrets", False),
           "expires_on": fields.get("expires_on"), "note": fields.get("note", ""), "status": "active",
           "created_by": user["id"], "created_by_name": user["name"], "created_at": now}
    await db.ai_connections.insert_one(dict(doc))
    key = await issue(doc["id"], "key")
    await db.ai_connections.update_one({"id": doc["id"]}, {"$set": {"key_hint": key[-4:]}})
    await log_activity(user, "ai_connection_created", "ai_connection", doc["id"], f"{doc['name']} · works as {runner['name']} · {ACCESS_LABEL[doc['access']]}")
    row = (await _rows(user, [{**doc, "key_hint": key[-4:]}]))[0]
    return {"connection": row, "key": key, **(await links(request))}


@router.put("/ai-connections/{cid}")
async def update_connection(cid: str, body: ConnectionBody, request: Request, user: dict = Depends(get_current_user)):
    _manager(user)
    conn = await _editable(user, cid)
    fields = _check_fields(body.model_dump(exclude_unset=True), user, conn.get("kind", "key"), creating=False, current=conn)
    if body.run_as_user_id and body.run_as_user_id != conn.get("run_as_user_id"):
        runner = await _runner_for(user, body.run_as_user_id)
        fields["run_as_user_id"] = runner["id"]
        fields["created_by"], fields["created_by_name"] = user["id"], user["name"]   # whoever picks the login now vouches for it
    if not fields:
        raise HTTPException(status_code=400, detail="Nothing to change")
    fields["updated_at"] = now_utc().isoformat()
    await db.ai_connections.update_one({"id": cid}, {"$set": fields})
    changed = ", ".join(f"{k}: {v}" for k, v in fields.items() if k not in ("updated_at", "created_by", "created_by_name"))
    await log_activity(user, "ai_connection_updated", "ai_connection", cid, f"{conn['name']} · {changed}"[:300])
    return (await _rows(user, [await _find(cid)]))[0]


@router.post("/ai-connections/{cid}/rotate")
async def rotate_key(cid: str, request: Request, user: dict = Depends(get_current_user)):
    _manager(user)
    conn = await _editable(user, cid)
    if conn.get("kind") != "key":
        raise HTTPException(status_code=400, detail="Claude and ChatGPT get their sign-in from the app — remove this connection and connect again instead")
    await db.ai_conn_tokens.update_many({"connection_id": cid, "kind": "key"}, {"$set": {"revoked": True}})
    key = await issue(cid, "key")
    await db.ai_connections.update_one({"id": cid}, {"$set": {"key_hint": key[-4:], "updated_at": now_utc().isoformat()}})
    await log_activity(user, "ai_connection_key_replaced", "ai_connection", cid, conn["name"])
    return {"key": key, **(await links(request))}


@router.delete("/ai-connections/{cid}")
async def delete_connection(cid: str, user: dict = Depends(get_current_user)):
    _manager(user)
    conn = await _editable(user, cid)
    await db.ai_conn_tokens.delete_many({"connection_id": cid})
    await db.ai_connections.delete_one({"id": cid})
    await log_activity(user, "ai_connection_removed", "ai_connection", cid, conn["name"])
    return {"ok": True, "message": f"{conn['name']} is disconnected — its keys stop working now"}


@router.get("/ai-connections/activity")
async def activity(connection_id: Optional[str] = None, errors_only: bool = False, limit: int = 100, before: Optional[str] = None,
                   user: dict = Depends(get_current_user)):
    _manager(user)
    q: Dict[str, Any] = {}
    if connection_id:
        q["connection_id"] = str(connection_id)
    if errors_only:
        q["status"] = {"$gte": 400}
    if before:
        q["at"] = {"$lt": str(before)}
    limit = max(1, min(int(limit or 100), 500))
    rows = await db.ai_activity.find(q, {"_id": 0, "at_dt": 0}).sort("at", -1).limit(limit).to_list(limit)
    return {"rows": rows, "next_before": rows[-1]["at"] if len(rows) >= limit else None}


# ───────────────────────── MCP tools ─────────────────────────
INSTRUCTIONS = (
    "dotindot Ops is the business system of Dotindot Creative, an AI-first growth agency in India: clients and projects "
    "(client and internal), our sales pipeline and quotes, leads we bring in for clients, GST billing, finance (ledger, "
    "expenses, subscriptions, budgets, loans), HR (people, onboarding, handovers, attendance, timesheets, payroll, hiring), "
    "ads, social and influencers, the dotindot.in website, support tickets, assets, branches and reports.\n"
    "You work as one dotindot login: its role, permissions and branches apply, and every change is recorded as made by this "
    "AI connection.\n"
    "How to work: 1) app_map shows the areas you can use. 2) list_endpoints finds the API by words or area. "
    "3) describe_endpoint shows its parameters and body. 4) call_api reads or changes data.\n"
    "Money is in Indian rupees unless a record says otherwise, dates are YYYY-MM-DD and times are India time (IST, UTC+5:30). "
    "Ask the person you work for before deleting anything, sending anything to a client, or making large changes."
)

_EMPTY = {"type": "object", "properties": {}, "additionalProperties": False}
TOOLS = [
    {"name": "whoami", "title": "Who am I",
     "description": "This connection, the dotindot login it works as (role, branches), what it may do, and today's date in India.",
     "inputSchema": _EMPTY, "annotations": {"readOnlyHint": True, "openWorldHint": False}},
    {"name": "app_map", "title": "Map of dotindot",
     "description": "The areas of dotindot this connection can use (clients, projects, billing, HR…), what each is for, what it may "
                    "do there and how many API endpoints each has. Start here.",
     "inputSchema": _EMPTY, "annotations": {"readOnlyHint": True, "openWorldHint": False}},
    {"name": "list_endpoints", "title": "Find API endpoints",
     "description": "Find dotindot API endpoints this connection may call, by words (e.g. 'invoice payment', 'leave', 'lead stage') "
                    "and/or an area key from app_map.",
     "inputSchema": {"type": "object", "properties": {
         "query": {"type": "string", "description": "Words to look for in the path or description"},
         "area": {"type": "string", "description": "An area key from app_map, e.g. billing"},
         "method": {"type": "string", "enum": list(CALL_METHODS)},
         "limit": {"type": "integer", "minimum": 1, "maximum": 300, "default": 80}}, "additionalProperties": False},
     "annotations": {"readOnlyHint": True, "openWorldHint": False}},
    {"name": "describe_endpoint", "title": "Describe an endpoint",
     "description": "The path and query parameters and the JSON body of one endpoint (as listed by list_endpoints).",
     "inputSchema": {"type": "object", "properties": {
         "method": {"type": "string", "enum": list(CALL_METHODS)},
         "path": {"type": "string", "description": "e.g. /api/clients or /api/projects/{project_id}"}},
         "required": ["method", "path"], "additionalProperties": False},
     "annotations": {"readOnlyHint": True, "openWorldHint": False}},
    {"name": "call_api", "title": "Call the dotindot API",
     "description": "Call a dotindot API endpoint as this connection and get its JSON answer. Fill path parameters into the path "
                    "(/api/projects/8f2c…). A read-only connection can only read; deleting needs full control.",
     "inputSchema": {"type": "object", "properties": {
         "method": {"type": "string", "enum": list(CALL_METHODS)},
         "path": {"type": "string", "description": "Starts with /api/"},
         "query": {"type": "object", "description": "Query parameters", "additionalProperties": True},
         "body": {"description": "JSON body for POST / PUT / PATCH"}},
         "required": ["method", "path"], "additionalProperties": False},
     "annotations": {"readOnlyHint": False, "destructiveHint": True, "openWorldHint": False}},
]


def _verbs(access: str) -> List[str]:
    return {"read": ["read"], "write": ["read", "add & change"], "full": ["read", "add & change", "delete"]}[access]


async def tool_whoami(u: Dict[str, Any], args: Dict[str, Any], request: Request) -> Dict[str, Any]:
    a = u["agent"]
    scope = branch_scope(u)
    names = [b["name"] for b in await db.branches.find({"id": {"$in": scope}}, {"_id": 0, "name": 1}).to_list(100)] if scope else []
    return {"connection": a["name"], "works_as": {"name": a["works_as"], "email": u.get("email"), "role": u.get("role"),
                                                  "branches": names or ("all branches" if scope is None else "none")},
            "access": ACCESS_LABEL[a["access"]], "can_change_logins": a["manage_access"], "can_read_saved_passwords": a["read_secrets"],
            "today_india": today_ist(), "timezone": "Asia/Kolkata (UTC+5:30)", "currency": "INR", "api_base": f"{await base_url(request)}/api"}


async def tool_app_map(u: Dict[str, Any], args: Dict[str, Any], request: Request) -> Dict[str, Any]:
    eps = visible(u)
    areas: Dict[str, Dict[str, Any]] = {}
    for e in eps:
        a = areas.setdefault(e["area"], {"area": e["area"], "name": e["area_name"], "what": e["area_what"], "endpoints": 0, "_m": set()})
        a["endpoints"] += 1
        a["_m"].add("delete" if is_delete(e["method"], e["path"]) else ("read" if e["method"] == "GET" or e["path"] in READ_POSTS else "add & change"))
    out = []
    for a in sorted(areas.values(), key=lambda x: -x["endpoints"]):
        kinds = a.pop("_m")
        can = [v for v in ("read", "add & change", "delete") if v in kinds]
        out.append({**a, "can": can})
    return {"areas": out, "total_endpoints": len(eps), "access": ACCESS_LABEL[u["agent"]["access"]],
            "next": "list_endpoints(area=…) or list_endpoints(query=…), then describe_endpoint and call_api"}


async def tool_list(u: Dict[str, Any], args: Dict[str, Any], request: Request) -> Dict[str, Any]:
    eps = visible(u)
    words = [w for w in re.split(r"\W+", str(args.get("query") or "").lower()) if w]
    area, method = str(args.get("area") or "").strip().lower(), str(args.get("method") or "").upper()
    try:
        limit = max(1, min(int(args.get("limit") or 80), 300))
    except (TypeError, ValueError):
        raise ValueError("limit must be a number from 1 to 300")
    hits = []
    for e in eps:
        if area and e["area"] != area and e["area_name"].lower() != area:
            continue
        if method and e["method"] != method:
            continue
        hay = f"{e['path']} {e['summary']} {e['about']} {e['area_name']} {e['area_what']}".lower().replace("-", " ").replace("_", " ")
        if words and not all(w in hay or w.rstrip("s") in hay for w in words):
            continue
        hits.append(e)
    hits.sort(key=lambda e: (e["path"], CALL_METHODS.index(e["method"]) if e["method"] in CALL_METHODS else 9))
    return {"total": len(hits), "endpoints": [{"method": e["method"], "path": e["path"], "summary": e["summary"], "area": e["area"],
                                                **({"about": e["about"][:200]} if e["about"] else {})} for e in hits[:limit]],
            **({"note": f"{len(hits) - limit} more — narrow the query"} if len(hits) > limit else {})}


def _clean_path(raw: Any) -> str:
    path = str(raw or "").strip()
    if "://" in path or ".." in path or "#" in path or "\\" in path:
        raise ValueError("Give only the path, e.g. /api/clients")
    if "?" in path:
        raise ValueError("Put query parameters in 'query', not in the path")
    if not path.startswith("/api/"):
        path = "/api/" + path.lstrip("/")
    return path


async def tool_describe(u: Dict[str, Any], args: Dict[str, Any], request: Request) -> Dict[str, Any]:
    method, path = str(args.get("method") or "GET").upper(), _clean_path(args.get("path"))
    e = next((x for x in visible(u) if x["method"] == method and x["path"] == path), None)
    if not e:
        raise ValueError(f"No endpoint {method} {path} that this connection may use. Use list_endpoints to find it (paths look like /api/projects/{{project_id}}).")
    sp = spec()
    op = ((sp.get("paths") or {}).get(path) or {}).get(method.lower()) or {}
    comps = (sp.get("components") or {}).get("schemas") or {}
    params: Dict[str, list] = {"path": [], "query": []}
    for prm in op.get("parameters") or []:
        where = prm.get("in")
        if where in params:
            params[where].append({"name": prm.get("name"), "required": bool(prm.get("required")),
                                  "schema": compact_schema(prm.get("schema") or {}, comps), **({"description": prm["description"]} if prm.get("description") else {})})
    body = None
    content = (op.get("requestBody") or {}).get("content") or {}
    if "application/json" in content:
        body = compact_schema(content["application/json"].get("schema") or {}, comps)
    elif content:
        body = {"note": f"This endpoint takes {', '.join(content)} (a file upload) — not available through call_api"}
    return {"method": method, "path": path, "summary": e["summary"], "about": e["about"], "area": e["area"],
            "path_parameters": params["path"], "query_parameters": params["query"], "body": body}


async def tool_call(u: Dict[str, Any], args: Dict[str, Any], request: Request, token: str) -> Dict[str, Any]:
    import httpx
    method = str(args.get("method") or "GET").upper()
    if method not in CALL_METHODS:
        raise ValueError("method must be GET, POST, PUT, PATCH or DELETE")
    path = _clean_path(args.get("path"))
    if "{" in path or "}" in path:
        raise ValueError("Fill in the path parameters, e.g. /api/projects/8f2c… instead of /api/projects/{project_id}")
    why = refusal(path, method, u["agent"])
    if not why and AREAS.get(_segment(path), ()) is None and path != "/api/auth/me":
        why = "That endpoint is for website visitors and portal logins, not AI connections."
    if why:
        return {"status": 403, "ok": False, "error": why}
    query = args.get("query") or {}
    if not isinstance(query, dict):
        raise ValueError("query must be an object of name: value")
    query = {str(k): (json.dumps(v) if isinstance(v, (dict, list)) else str(v).lower() if isinstance(v, bool) else v) for k, v in query.items() if v is not None}
    b = await base_url(request)
    headers = {"authorization": f"Bearer {token}", "x-dot-via": "mcp", "x-real-ip": client_ip(request), "accept": "application/json"}
    kwargs: Dict[str, Any] = {"params": query, "headers": headers}
    if method in ("POST", "PUT", "PATCH") and "body" in args:
        kwargs["json"] = args["body"]
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=APP["app"]), base_url=b, timeout=120) as c:
        try:
            r = await c.request(method, path, **kwargs)
        except Exception as exc:  # noqa: BLE001 — report it to the AI instead of failing the MCP call
            return {"status": 500, "ok": False, "error": f"The server failed on this call ({type(exc).__name__})"}
    ctype = r.headers.get("content-type", "")
    if "json" in ctype:
        try:
            data = r.json()
        except ValueError:
            data = r.text[:2000]
    elif ctype.startswith("text/") and "html" not in ctype:
        data = r.text
    else:
        data = {"file": ctype or "binary", "bytes": len(r.content),
                "note": "This endpoint returns a file. Download it with the REST API directly (an access key in Authorization: Bearer …)."}
    out: Dict[str, Any] = {"status": r.status_code, "ok": r.status_code < 400}
    if r.status_code >= 400:
        out["error"] = data.get("detail", data) if isinstance(data, dict) else data
    else:
        out["data"] = data
    return out


HANDLERS = {"whoami": tool_whoami, "app_map": tool_app_map, "list_endpoints": tool_list, "describe_endpoint": tool_describe}


# ───────────────────────── MCP server ─────────────────────────
def _resource_path(request: Request) -> str:
    p = request.url.path.rstrip("/")
    return p if p in MCP_PATHS else "/api/mcp"


async def _unauthorized(request: Request, detail: str, error: str = "invalid_token") -> JSONResponse:
    res = _resource_path(request)
    meta = f"{await base_url(request)}/.well-known/oauth-protected-resource{res}"
    return JSONResponse({"error": error, "error_description": detail}, status_code=401,
                        headers={"WWW-Authenticate": f'Bearer error="{error}", error_description="{header_text(detail)}", resource_metadata="{meta}", scope="{SCOPE}"',
                                 "Cache-Control": "no-store"})


def _rpc_error(mid: Any, code: int, message: str) -> Dict[str, Any]:
    return {"jsonrpc": "2.0", "id": mid, "error": {"code": code, "message": message}}


async def _log_tool(u: Dict[str, Any], name: str, ok: bool, request: Request, started: float) -> None:
    at = now_utc()
    await db.ai_activity.insert_one({"id": str(uuid.uuid4()), "connection_id": u["agent"]["id"], "connection_name": u["agent"]["name"],
                                     "at": at.isoformat(), "at_dt": at, "method": "TOOL", "path": name, "status": 200 if ok else 400,
                                     "ms": int((time.monotonic() - started) * 1000), "via": "mcp", "ip": client_ip(request)})


async def _handle(msg: Dict[str, Any], u: Dict[str, Any], request: Request, token: str) -> Dict[str, Any]:
    mid, method, params = msg.get("id"), msg.get("method"), msg.get("params")
    if params is not None and not isinstance(params, dict):
        return _rpc_error(mid, -32602, "params must be an object")
    params = params or {}
    if method == "initialize":
        asked = params.get("protocolVersion")
        a = u["agent"]
        rules = (await conn_settings())["instructions"]
        text = INSTRUCTIONS + f"\nThis connection: “{a['name']}”, works as {a['works_as']} ({u.get('role')}), access: {ACCESS_LABEL[a['access']]}."
        if rules:
            text += f"\nHouse rules from dotindot:\n{rules}"
        return {"jsonrpc": "2.0", "id": mid, "result": {
            "protocolVersion": asked if asked in PROTOCOLS else PROTOCOLS[0],
            "capabilities": {"tools": {"listChanged": False}},
            "serverInfo": {"name": "dotindot", "title": "dotindot Ops", "version": "2.0.0"}, "instructions": text}}
    if method == "ping":
        return {"jsonrpc": "2.0", "id": mid, "result": {}}
    if method == "tools/list":
        return {"jsonrpc": "2.0", "id": mid, "result": {"tools": TOOLS}}
    if method in ("resources/list", "resources/templates/list", "prompts/list"):
        key = {"resources/list": "resources", "resources/templates/list": "resourceTemplates", "prompts/list": "prompts"}[method]
        return {"jsonrpc": "2.0", "id": mid, "result": {key: []}}
    if method == "logging/setLevel":
        return {"jsonrpc": "2.0", "id": mid, "result": {}}
    if method == "tools/call":
        name, args = params.get("name"), params.get("arguments") or {}
        if name != "call_api" and name not in HANDLERS:
            return _rpc_error(mid, -32602, f"Unknown tool: {name}")
        if not isinstance(args, dict):
            return _rpc_error(mid, -32602, "arguments must be an object")
        started = time.monotonic()
        try:
            result = await (tool_call(u, args, request, token) if name == "call_api" else HANDLERS[name](u, args, request))
            is_error = name == "call_api" and not result.get("ok")
        except (ValueError, TypeError) as exc:
            result, is_error = {"error": str(exc)}, True
        if name != "call_api":
            await _log_tool(u, name, not is_error, request, started)
        return {"jsonrpc": "2.0", "id": mid, "result": {"content": [{"type": "text", "text": fit(result)}], "isError": is_error}}
    return _rpc_error(mid, -32601, f"Method not found: {method}")


async def _mcp(request: Request):
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        return await _unauthorized(request, "Sign in: connect with OAuth, or send an access key as Authorization: Bearer <key>", "invalid_request")
    token = auth[7:].strip()
    if token.startswith(LEGACY_PREFIX):
        return await _unauthorized(request, "Old AI tokens were retired. Connect again (Settings → AI)")
    if not token.startswith(PREFIX):
        return await _unauthorized(request, "That is not a dotindot AI key")
    try:
        u = await authenticate(request, token, check_route=False)
    except HTTPException as exc:
        if exc.status_code == 401:
            return await _unauthorized(request, exc.detail)
        return JSONResponse(_rpc_error(None, -32000, exc.detail), status_code=exc.status_code)
    try:
        payload = await request.json()
    except ValueError:
        return JSONResponse(_rpc_error(None, -32700, "Parse error"), status_code=400)
    batch = isinstance(payload, list)
    if batch and not payload:
        return JSONResponse(_rpc_error(None, -32600, "Empty batch"), status_code=400)
    replies = []
    for msg in (payload if batch else [payload]):
        if not isinstance(msg, dict) or msg.get("jsonrpc") != "2.0":
            replies.append(_rpc_error(None, -32600, "Invalid request"))
            continue
        if "method" not in msg or "id" not in msg:      # notifications and client responses need no answer
            continue
        replies.append(await _handle(msg, u, request, token))
    if not replies:
        return Response(status_code=202)
    return JSONResponse(replies if batch else replies[0])


for _p in ("/mcp", "/ai/mcp"):
    router.add_api_route(_p, _mcp, methods=["POST"], include_in_schema=False)
    router.add_api_route(_p, lambda: Response(status_code=405, headers={"Allow": "POST"}), methods=["GET", "DELETE"], include_in_schema=False)


@router.api_route("/ai/v1/{rest:path}", methods=["GET", "POST", "PATCH", "PUT", "DELETE"], include_in_schema=False)
async def retired_rest(rest: str):
    return JSONResponse({"detail": "This AI API was replaced. Connect through the MCP server at /api/mcp (Settings → AI)."}, status_code=410)


@router.get("/mcp/openapi.json", include_in_schema=False)
async def agent_openapi(request: Request):
    """The API description for tools that call REST directly (n8n, custom GPT actions, scripts) — only what the caller may use."""
    auth = request.headers.get("authorization", "")
    if auth.startswith("Bearer " + PREFIX):
        u = await authenticate(request, auth[7:].strip(), check_route=False)
        allowed = {(e["method"].lower(), e["path"]) for e in visible(u)}
    else:
        _manager(await get_current_user(request))
        allowed = {(e["method"].lower(), e["path"]) for e in index()}
    sp = json.loads(json.dumps(spec(), default=str))
    paths = {}
    for path, ops in (sp.get("paths") or {}).items():
        keep = {m: op for m, op in ops.items() if (m, path) in allowed}
        if keep:
            paths[path] = keep
    sp["paths"] = paths
    sp["servers"] = [{"url": await base_url(request)}]
    sp["components"] = {**(sp.get("components") or {}), "securitySchemes": {"aiKey": {"type": "http", "scheme": "bearer", "description": "A dotindot AI access key (Settings → AI)"}}}
    sp["security"] = [{"aiKey": []}]
    sp.setdefault("info", {})["description"] = INSTRUCTIONS
    return JSONResponse(sp)


# ───────────────────────── OAuth 2.1 for Claude / ChatGPT connectors ─────────────────────────
async def _prm(request: Request, resource_path: str = "/api/mcp") -> Dict[str, Any]:
    b = await base_url(request)
    return {"resource": f"{b}{resource_path}", "authorization_servers": [f"{b}/api"], "scopes_supported": [SCOPE],
            "bearer_methods_supported": ["header"], "resource_name": "dotindot Ops", "resource_documentation": f"{b}/app/settings/ai"}


async def _asm(request: Request) -> Dict[str, Any]:
    b = await base_url(request)
    return {"issuer": f"{b}/api", "authorization_endpoint": f"{b}/api/oauth/authorize", "token_endpoint": f"{b}/api/oauth/token",
            "registration_endpoint": f"{b}/api/oauth/register", "revocation_endpoint": f"{b}/api/oauth/revoke",
            "response_types_supported": ["code"], "response_modes_supported": ["query"], "grant_types_supported": ["authorization_code", "refresh_token"],
            "code_challenge_methods_supported": ["S256"], "token_endpoint_auth_methods_supported": ["none"],
            "revocation_endpoint_auth_methods_supported": ["none"], "scopes_supported": [SCOPE], "service_documentation": f"{b}/app/settings/ai"}


def _prm_route(resource_path: str):
    async def handler(request: Request):
        return JSONResponse(await _prm(request, resource_path), headers={"Cache-Control": "no-store"})
    return handler


async def _asm_route(request: Request):
    return JSONResponse(await _asm(request), headers={"Cache-Control": "no-store"})


# under /api (reachable on every host nginx forwards /api from)
router.add_api_route("/.well-known/oauth-protected-resource", _prm_route("/api/mcp"), methods=["GET"], include_in_schema=False)
for _res in MCP_PATHS:
    router.add_api_route(f"/.well-known/oauth-protected-resource{_res[4:]}", _prm_route(_res), methods=["GET"], include_in_schema=False)
    router.add_api_route(f"{_res[4:]}/.well-known/oauth-protected-resource", _prm_route(_res), methods=["GET"], include_in_schema=False)
for _p in ("/.well-known/oauth-authorization-server", "/.well-known/openid-configuration"):
    router.add_api_route(_p, _asm_route, methods=["GET"], include_in_schema=False)
# at the site root (RFC 9728 / RFC 8414 well-known locations)
root_router.add_api_route("/.well-known/oauth-protected-resource", _prm_route("/api/mcp"), methods=["GET"], include_in_schema=False)
for _res in MCP_PATHS:
    root_router.add_api_route(f"/.well-known/oauth-protected-resource{_res}", _prm_route(_res), methods=["GET"], include_in_schema=False)
for _p in ("/.well-known/oauth-authorization-server", "/.well-known/oauth-authorization-server/api", "/.well-known/openid-configuration",
           "/.well-known/openid-configuration/api"):
    root_router.add_api_route(_p, _asm_route, methods=["GET"], include_in_schema=False)


def _oauth_error(error: str, detail: str, status: int = 400) -> JSONResponse:
    return JSONResponse({"error": error, "error_description": detail}, status_code=status, headers={"Cache-Control": "no-store"})


def _page(title: str, text: str, status: int = 400) -> HTMLResponse:
    def safe(s: str) -> str:
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return HTMLResponse(f"<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>"
                        f"<title>dotindot</title><body style='font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1rem;color:#111827;background:#fff'>"
                        f"<h1 style='font-size:1.25rem'>{safe(title)}</h1><p style='color:#4B5563;line-height:1.5'>{safe(text)}</p></body>", status_code=status)


_REG_HITS: Dict[str, deque] = {}


@router.post("/oauth/register", include_in_schema=False)
async def oauth_register(request: Request):
    ip = client_ip(request)
    dq = _REG_HITS.setdefault(ip, deque())
    now = time.monotonic()
    while dq and now - dq[0] > 3600:
        dq.popleft()
    if len(dq) >= 20:
        return _oauth_error("invalid_client_metadata", "Too many apps registered from this address — try again in an hour", 429)
    dq.append(now)
    if len(_REG_HITS) > 5000:
        _REG_HITS.clear()
    try:
        body = await request.json()
    except ValueError:
        return _oauth_error("invalid_client_metadata", "Send the client details as JSON")
    uris = body.get("redirect_uris") if isinstance(body, dict) else None
    if not isinstance(uris, list) or not uris or len(uris) > 10 or not all(isinstance(u, str) and redirect_uri_ok(u) for u in uris):
        return _oauth_error("invalid_redirect_uri", "redirect_uris must be 1–10 https addresses (or http://localhost for desktop apps)")
    name = " ".join(str(body.get("client_name") or "AI app").split())[:80] or "AI app"
    cutoff = (now_utc() - timedelta(days=7)).isoformat()
    await db.oauth_clients.delete_many({"used": {"$ne": True}, "created_at": {"$lt": cutoff}})
    client_id = "dotc_" + secrets.token_urlsafe(18)
    await db.oauth_clients.insert_one({"client_id": client_id, "client_name": name, "redirect_uris": uris, "created_at": now_utc().isoformat(), "used": False})
    return JSONResponse({"client_id": client_id, "client_id_issued_at": int(time.time()), "client_name": name, "redirect_uris": uris,
                         "grant_types": ["authorization_code", "refresh_token"], "response_types": ["code"],
                         "token_endpoint_auth_method": "none", "scope": SCOPE}, status_code=201)


@router.get("/oauth/authorize", include_in_schema=False)
async def oauth_authorize(request: Request):
    q = request.query_params
    client = await db.oauth_clients.find_one({"client_id": q.get("client_id") or ""}, {"_id": 0})
    if not client:
        return _page("This app isn't registered", "Start the connection again from the AI app (remove the connector and add it again).")
    redirect_uri = q.get("redirect_uri") or (client["redirect_uris"][0] if len(client["redirect_uris"]) == 1 else "")
    if redirect_uri not in client["redirect_uris"]:
        return _page("Wrong return address", "The AI app asked to come back to an address it didn't register. Start the connection again.")
    # Problems show a page here instead of bouncing back to the app: anyone can register an app, so an automatic
    # redirect would let this site send people elsewhere. Only a person's decision on the approval page redirects.
    if q.get("response_type") != "code":
        return _page("This app asked in a way dotindot doesn't support", "Only the authorization code flow is supported.")
    if not q.get("code_challenge") or q.get("code_challenge_method") != "S256" or len(q.get("code_challenge") or "") > 128:
        return _page("This app's sign-in isn't secure enough", "dotindot needs PKCE (S256). Update the AI app, or use an access key instead.")
    rid = secrets.token_urlsafe(24)
    exp = now_utc() + timedelta(seconds=REQUEST_SECONDS)
    await db.oauth_requests.insert_one({"id": rid, "client_id": client["client_id"], "client_name": client["client_name"], "redirect_uri": redirect_uri,
                                        "state": (q.get("state") or "")[:500], "code_challenge": q["code_challenge"], "resource": (q.get("resource") or "")[:300],
                                        "created_at": now_utc().isoformat(), "expires_at": exp.isoformat(), "expires_dt": exp, "status": "waiting"})
    return RedirectResponse(f"{await base_url(request)}{CONSENT_PATH}?request={rid}", status_code=302)


async def _pending(rid: str) -> Dict[str, Any]:
    r = await db.oauth_requests.find_one({"id": str(rid)}, {"_id": 0})
    if not r or r.get("status") != "waiting":
        raise HTTPException(status_code=404, detail="This connection request was already used or doesn't exist. Start again from the AI app.")
    if r["expires_at"] < now_utc().isoformat():
        raise HTTPException(status_code=410, detail="This connection request has expired. Start again from the AI app.")
    return r


@router.get("/oauth/requests/{rid}")
async def oauth_request(rid: str, user: dict = Depends(get_current_user)):
    _manager(user)
    r = await _pending(rid)
    u = urlparse(r["redirect_uri"])
    return {"id": rid, "app_name": r["client_name"], "return_to": u.hostname or f"{u.scheme}://", "known_app": known_app(r["redirect_uri"]),
            "local_app": u.hostname in LOCAL_HOSTS or u.scheme not in ("http", "https"), "expires_at": r["expires_at"],
            "enabled": (await conn_settings())["enabled"], "is_super_admin": _is_super(user),
            "me": {"id": user["id"], "name": user["name"], "role": user["role"]}, "logins": await _logins_for(user),
            "access_levels": [{"key": k, "label": ACCESS_LABEL[k]} for k in ACCESS_LEVELS]}


@router.post("/oauth/requests/{rid}/approve")
async def oauth_approve(rid: str, body: ApproveBody, request: Request, user: dict = Depends(get_current_user)):
    _manager(user)
    r = await _pending(rid)
    fields = _check_fields({"name": body.name or r["client_name"], "access": body.access, "manage_access": body.manage_access,
                            "read_secrets": body.read_secrets}, user, "connector", creating=True)
    runner = await _runner_for(user, body.run_as_user_id)
    claimed = await db.oauth_requests.find_one_and_update({"id": rid, "status": "waiting"}, {"$set": {"status": "approved"}})
    if not claimed:
        raise HTTPException(status_code=404, detail="This connection request was already used. Start again from the AI app.")
    if not (await conn_settings())["enabled"]:
        await db.settings.update_one({"id": "ai"}, {"$set": {"id": "ai", "enabled": True, "updated_at": now_utc().isoformat(), "updated_by": user["name"]}}, upsert=True)
        forget_settings()
        await log_activity(user, "ai_connections_settings", "settings", "ai", "AI connections switched on")
    now = now_utc().isoformat()
    doc = {"id": str(uuid.uuid4()), "name": fields["name"], "kind": "connector", "client_id": r["client_id"], "client_name": r["client_name"],
           "run_as_user_id": runner["id"], "access": fields["access"], "manage_access": fields.get("manage_access", False),
           "read_secrets": fields.get("read_secrets", False), "expires_on": None, "note": "", "status": "active",
           "created_by": user["id"], "created_by_name": user["name"], "created_at": now}
    await db.ai_connections.insert_one(dict(doc))
    code = secrets.token_urlsafe(32)
    exp = now_utc() + timedelta(seconds=CODE_SECONDS)
    await db.oauth_codes.insert_one({"hash": token_hash(code), "connection_id": doc["id"], "client_id": r["client_id"], "redirect_uri": r["redirect_uri"],
                                     "code_challenge": r["code_challenge"], "expires_at": exp.isoformat(), "expires_dt": exp, "used": False})
    await db.oauth_requests.update_one({"id": rid}, {"$set": {"connection_id": doc["id"]}})
    await db.oauth_clients.update_one({"client_id": r["client_id"]}, {"$set": {"used": True}})
    await log_activity(user, "ai_connection_created", "ai_connection", doc["id"], f"{doc['name']} ({r['client_name']}) · works as {runner['name']} · {ACCESS_LABEL[doc['access']]}")
    return {"redirect": with_query(r["redirect_uri"], {"code": code, "state": r.get("state"), "iss": f"{await base_url(request)}/api"}), "name": doc["name"]}


@router.post("/oauth/requests/{rid}/deny")
async def oauth_deny(rid: str, user: dict = Depends(get_current_user)):
    _manager(user)
    r = await _pending(rid)
    await db.oauth_requests.update_one({"id": rid}, {"$set": {"status": "denied"}})
    return {"redirect": with_query(r["redirect_uri"], {"error": "access_denied", "error_description": "The connection was declined in dotindot", "state": r.get("state")})}


async def _form_or_json(request: Request) -> Dict[str, Any]:
    if "application/json" in (request.headers.get("content-type") or ""):
        try:
            body = await request.json()
            return body if isinstance(body, dict) else {}
        except ValueError:
            return {}
    try:
        return dict(await request.form())
    except Exception:  # noqa: BLE001 — a malformed form is just an empty one
        return {}


async def _token_pair(conn_id: str) -> JSONResponse:
    access = await issue(conn_id, "access", ACCESS_TOKEN_SECONDS)
    refresh = await issue(conn_id, "refresh", REFRESH_TOKEN_DAYS * 86400)
    return JSONResponse({"access_token": access, "token_type": "Bearer", "expires_in": ACCESS_TOKEN_SECONDS,
                         "refresh_token": refresh, "scope": SCOPE}, headers={"Cache-Control": "no-store", "Pragma": "no-cache"})


@router.post("/oauth/token", include_in_schema=False)
async def oauth_token(request: Request):
    f = await _form_or_json(request)
    grant = f.get("grant_type")
    if grant == "authorization_code":
        c = await db.oauth_codes.find_one_and_update({"hash": token_hash(str(f.get("code") or "")), "used": False}, {"$set": {"used": True}})
        if not c or c["expires_at"] < now_utc().isoformat():
            return _oauth_error("invalid_grant", "The sign-in code is wrong, used or expired")
        if f.get("client_id") and f["client_id"] != c["client_id"]:
            return _oauth_error("invalid_grant", "This code was given to another app")
        if (f.get("redirect_uri") or c["redirect_uri"]) != c["redirect_uri"]:
            return _oauth_error("invalid_grant", "redirect_uri doesn't match")
        if not pkce_ok(str(f.get("code_verifier") or ""), c["code_challenge"]):
            return _oauth_error("invalid_grant", "PKCE check failed")
        if not await db.ai_connections.find_one({"id": c["connection_id"]}, {"_id": 0, "id": 1}):
            return _oauth_error("invalid_grant", "This connection was removed")
        return await _token_pair(c["connection_id"])
    if grant == "refresh_token":
        t = await db.ai_conn_tokens.find_one_and_update({"hash": token_hash(str(f.get("refresh_token") or "")), "kind": "refresh", "revoked": False},
                                                        {"$set": {"revoked": True}})
        if not t or (t.get("expires_at") and t["expires_at"] < now_utc().isoformat()):
            return _oauth_error("invalid_grant", "Sign in again — this connection's sign-in is no longer valid")
        conn = await db.ai_connections.find_one({"id": t["connection_id"]}, {"_id": 0})
        if not conn or (f.get("client_id") and conn.get("client_id") and f["client_id"] != conn["client_id"]):
            return _oauth_error("invalid_grant", "This connection was removed")
        return await _token_pair(conn["id"])
    return _oauth_error("unsupported_grant_type", "Use authorization_code or refresh_token")


@router.post("/oauth/revoke", include_in_schema=False)
async def oauth_revoke(request: Request):
    f = await _form_or_json(request)
    tok = str(f.get("token") or "")
    if tok.startswith(PREFIX):
        await db.ai_conn_tokens.update_one({"hash": token_hash(tok), "kind": {"$in": ["access", "refresh"]}}, {"$set": {"revoked": True}})
    return Response(status_code=200)


async def ensure_indexes() -> None:
    await db.ai_conn_tokens.create_index("hash", unique=True)
    await db.ai_conn_tokens.create_index("connection_id")
    await db.ai_conn_tokens.create_index("expires_dt", expireAfterSeconds=0)
    await db.ai_connections.create_index("id", unique=True)
    await db.ai_activity.create_index([("connection_id", 1), ("at", -1)])
    await db.ai_activity.create_index("at")
    await db.ai_activity.create_index("at_dt", expireAfterSeconds=ACTIVITY_DAYS * 86400)
    await db.oauth_clients.create_index("client_id", unique=True)
    await db.oauth_codes.create_index("hash", unique=True)
    await db.oauth_codes.create_index("expires_dt", expireAfterSeconds=3600)
    await db.oauth_requests.create_index("id", unique=True)
    await db.oauth_requests.create_index("expires_dt", expireAfterSeconds=3600)
