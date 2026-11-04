"""v3.1 Digital Growth — follower growth, views, reach and engagement for every client's accounts and for dotindot's own.

  • Accounts: one per platform profile (Instagram, Facebook, YouTube, LinkedIn, X, Threads, Pinterest, Google Business
    Profile, website analytics, WhatsApp channel or anything else), owned by a client or by dotindot ("internal").
  • Monthly numbers: one record per account per month. "Stock" numbers (followers, subscribers, total posts, reviews,
    rating) are the level at month end; "flow" numbers (views, reach, interactions, clicks…) are that month's activity.
    Entered by hand in a grid, pasted / imported from CSV, pushed by AI agents, or synced automatically:
      – YouTube: public channel statistics with a YouTube Data API key (subscribers, videos, lifetime views → the
        month's views are the difference between month ends).
      – Instagram (professional accounts): followers + posts, and the month's views, reach, interactions and link taps
        from the account insights API, with the account's access token (Instagram Login or Facebook Login).
      – Facebook page: followers with a page access token.
    A daily job refreshes every synced account.
  • Overview + reports: audience now, net growth and growth % over the period, views, interactions, engagement rate,
    per-platform trends, all-clients leaderboard, and a branded PDF / Excel report. Clients see their own growth on
    the client dashboard, in the client portal and in their monthly PDF.

Permissions: `growth` (see), `growth.manage` (accounts, numbers, sync, settings), `growth.delete`.
"""
import calendar
import csv
import io
import math
import re
import uuid
from datetime import date, datetime, timezone, timedelta
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from database import db
from auth import get_current_user, log_activity, encrypt_secret, decrypt_secret
from permissions import has_permission, scoped_client_ids

router = APIRouter()

METRICS: Dict[str, dict] = {
    # stock — level at month end
    "followers": {"label": "Followers", "kind": "stock"},
    "subscribers": {"label": "Subscribers", "kind": "stock"},
    "posts": {"label": "Posts (total)", "short": "Posts", "kind": "stock"},
    "videos": {"label": "Videos (total)", "short": "Videos", "kind": "stock"},
    "reviews": {"label": "Reviews (total)", "short": "Reviews", "kind": "stock"},
    "rating": {"label": "Rating", "kind": "stock", "decimals": 1},
    # flow — activity during the month
    "views": {"label": "Views", "kind": "flow"},
    "reach": {"label": "Accounts reached", "short": "Reached", "kind": "flow"},
    "impressions": {"label": "Impressions", "short": "Impressions", "kind": "flow"},
    "interactions": {"label": "Interactions", "short": "Interactions", "kind": "flow", "hint": "likes + comments + shares + saves"},
    "profile_visits": {"label": "Profile visits", "short": "Profile visits", "kind": "flow"},
    "link_taps": {"label": "Link taps", "short": "Link taps", "kind": "flow"},
    "link_clicks": {"label": "Link clicks", "short": "Link clicks", "kind": "flow"},
    "watch_hours": {"label": "Watch hours", "short": "Watch hrs", "kind": "flow", "decimals": 1},
    "saves": {"label": "Saves", "kind": "flow"},
    "outbound_clicks": {"label": "Outbound clicks", "short": "Outbound", "kind": "flow"},
    "profile_views": {"label": "Profile views", "short": "Profile views", "kind": "flow"},
    "searches": {"label": "Search appearances", "short": "Searches", "kind": "flow"},
    "calls": {"label": "Calls", "kind": "flow"},
    "directions": {"label": "Direction requests", "short": "Directions", "kind": "flow"},
    "website_clicks": {"label": "Website clicks", "short": "Web clicks", "kind": "flow"},
    "users": {"label": "Users", "kind": "flow"},
    "sessions": {"label": "Sessions", "kind": "flow"},
    "page_views": {"label": "Page views", "short": "Page views", "kind": "flow"},
    "organic_sessions": {"label": "Organic search sessions", "short": "Organic", "kind": "flow"},
    "conversions": {"label": "Conversions (leads, sales)", "short": "Conversions", "kind": "flow"},
}

# audience: the headline "size" number · views: the headline reach-type number · social: counts toward total audience
PLATFORMS: Dict[str, dict] = {
    "instagram": {"label": "Instagram", "audience": "followers", "views": "views", "social": True, "sync": "instagram",
                  "metrics": ["followers", "posts", "views", "reach", "interactions", "profile_visits", "link_taps"]},
    "facebook": {"label": "Facebook", "audience": "followers", "views": "views", "social": True, "sync": "facebook",
                 "metrics": ["followers", "views", "reach", "interactions", "link_clicks"]},
    "youtube": {"label": "YouTube", "audience": "subscribers", "views": "views", "social": True, "sync": "youtube",
                "metrics": ["subscribers", "videos", "views", "watch_hours", "interactions"]},
    "linkedin": {"label": "LinkedIn", "audience": "followers", "views": "impressions", "social": True,
                 "metrics": ["followers", "impressions", "interactions", "link_clicks"]},
    "x": {"label": "X (Twitter)", "audience": "followers", "views": "impressions", "social": True,
          "metrics": ["followers", "impressions", "interactions", "link_clicks"]},
    "threads": {"label": "Threads", "audience": "followers", "views": "views", "social": True, "metrics": ["followers", "views", "interactions"]},
    "pinterest": {"label": "Pinterest", "audience": "followers", "views": "impressions", "social": True,
                  "metrics": ["followers", "impressions", "saves", "outbound_clicks"]},
    "whatsapp": {"label": "WhatsApp channel", "audience": "followers", "views": "views", "social": True, "metrics": ["followers", "views"]},
    "google_business": {"label": "Google Business Profile", "audience": "reviews", "views": "profile_views", "social": False,
                        "metrics": ["reviews", "rating", "profile_views", "searches", "calls", "directions", "website_clicks"]},
    "website": {"label": "Website", "audience": None, "views": "page_views", "social": False,
                "metrics": ["users", "sessions", "page_views", "organic_sessions", "conversions"]},
    "other": {"label": "Other", "audience": "followers", "views": "views", "social": True, "metrics": ["followers", "views", "interactions"]},
}
SYNC_LABELS = {"youtube": "YouTube Data API (channel statistics)", "instagram": "Instagram insights API", "facebook": "Facebook page (followers)"}
INTERNAL = "internal"
MONTH_RE = re.compile(r"^(19|20|21)\d{2}-(0[1-9]|1[0-2])$")
MAX_VALUE = 1e12   # bigger than any real follower / view count; keeps Mongo ints and maths safe


def _now():
    return datetime.now(timezone.utc).isoformat()


def _this_month() -> str:
    return date.today().strftime("%Y-%m")


def _shift(ym: str, k: int) -> str:
    y, m = map(int, ym.split("-"))
    t = y * 12 + (m - 1) + k
    return f"{t // 12:04d}-{t % 12 + 1:02d}"


def default_end() -> str:
    """Reports default to the last complete month; the current month is shown only when picked ("so far")."""
    return _shift(_this_month(), -1)


def _months(end: str, n: int) -> List[str]:
    return [_shift(end, -i) for i in range(n - 1, -1, -1)]


def _month_ok(m: str):
    if not m or not MONTH_RE.match(m) or m < "1990-01":
        raise HTTPException(status_code=400, detail="Month must look like 2026-10")


def _label(ym: str) -> str:
    y, m = map(int, ym.split("-"))
    return f"{calendar.month_abbr[m]} {y}"


def _need(user, manage=False):
    if not has_permission(user, "growth.manage" if manage else "growth"):
        raise HTTPException(status_code=403, detail="Digital Growth needs " + ("Growth → manage" if manage else "the Growth permission"))


async def _check_owner(user: dict, owner: str):
    """owner = 'internal' or a client id the user may see (branch scope)."""
    if owner == INTERNAL:
        return {"id": INTERNAL, "name": "dotindot"}
    c = await db.clients.find_one({"id": owner}, {"_id": 0, "id": 1, "name": 1, "branch_id": 1})
    if not c:
        raise HTTPException(status_code=404, detail="Client not found")
    scope = await scoped_client_ids(user)
    if scope is not None and owner not in scope:
        raise HTTPException(status_code=403, detail="This client is outside your locations")
    return c


async def growth_settings() -> dict:
    d = await db.settings.find_one({"id": "growth"}, {"_id": 0}) or {}
    return {"youtube_key_enc": d.get("youtube_key_enc"), "youtube_key_hint": d.get("youtube_key_hint", ""),
            "graph_version": d.get("graph_version") or "v23.0", "auto_sync": d.get("auto_sync", True)}


# ------------------------------------------------------------------ meta / settings
@router.get("/growth/meta")
async def meta(user: dict = Depends(get_current_user)):
    _need(user)
    s = await growth_settings()
    scope = await scoped_client_ids(user)
    cq = {"id": {"$in": scope}} if scope is not None else {}
    clients = await db.clients.find(cq, {"_id": 0, "id": 1, "name": 1, "status": 1}).sort("name", 1).to_list(1000)
    return {"platforms": [{"key": k, **{kk: v for kk, v in p.items()}} for k, p in PLATFORMS.items()],
            "metrics": [{"key": k, **v} for k, v in METRICS.items()], "sync_labels": SYNC_LABELS,
            "settings": {"youtube_connected": bool(s["youtube_key_enc"]), "youtube_key_hint": s["youtube_key_hint"],
                         "graph_version": s["graph_version"], "auto_sync": s["auto_sync"]},
            "clients": clients, "can_manage": has_permission(user, "growth.manage"), "can_delete": has_permission(user, "growth.delete"),
            "this_month": _this_month(), "default_end": default_end()}


class SettingsIn(BaseModel):
    youtube_api_key: Optional[str] = None
    remove_youtube_key: bool = False
    graph_version: Optional[str] = None
    auto_sync: Optional[bool] = None


@router.put("/growth/settings")
async def save_settings(body: SettingsIn, user: dict = Depends(get_current_user)):
    _need(user, manage=True)
    sets = {}
    if body.remove_youtube_key:
        sets.update({"youtube_key_enc": None, "youtube_key_hint": ""})
    elif body.youtube_api_key:
        k = body.youtube_api_key.strip()
        if len(k) < 20:
            raise HTTPException(status_code=400, detail="That doesn't look like a YouTube API key")
        sets.update({"youtube_key_enc": encrypt_secret(k), "youtube_key_hint": "…" + k[-4:]})
    if body.graph_version is not None:
        if not re.fullmatch(r"v\d{2}\.\d", body.graph_version.strip()):
            raise HTTPException(status_code=400, detail="Graph API version looks like v23.0")
        sets["graph_version"] = body.graph_version.strip()
    if body.auto_sync is not None:
        sets["auto_sync"] = body.auto_sync
    await db.settings.update_one({"id": "growth"}, {"$set": {"id": "growth", **sets, "updated_at": _now(), "updated_by": user["name"]}}, upsert=True)
    await log_activity(user, "growth_settings_updated", "settings", "growth", ", ".join(k for k in sets if not k.endswith("_enc")))
    return await meta(user)


# ------------------------------------------------------------------ accounts
class SyncIn(BaseModel):
    method: Optional[str] = None           # youtube | instagram | facebook | None (manual)
    external_id: Optional[str] = ""       # channel id / @handle · IG account id ("me" for Instagram Login tokens) · page id
    access_token: Optional[str] = None    # IG / FB token (write-only)
    host: Optional[str] = "graph.facebook.com"   # graph.facebook.com (Facebook Login) | graph.instagram.com (Instagram Login)


class AccountIn(BaseModel):
    owner: str = INTERNAL                  # "internal" or client id
    platform: str
    handle: Optional[str] = ""
    url: Optional[str] = ""
    name: Optional[str] = ""
    target: Optional[float] = Field(None, ge=0, le=MAX_VALUE, allow_inf_nan=False)   # audience goal
    target_date: Optional[str] = None
    status: str = "active"
    sync: Optional[SyncIn] = None


class AccountUpdate(BaseModel):
    handle: Optional[str] = None
    url: Optional[str] = None
    name: Optional[str] = None
    target: Optional[float] = Field(None, ge=0, le=MAX_VALUE, allow_inf_nan=False)   # send null to clear
    target_date: Optional[str] = None
    status: Optional[str] = None
    sync: Optional[SyncIn] = None


def _date_ok(d: Optional[str]) -> Optional[str]:
    if not d:
        return None
    try:
        return date.fromisoformat(str(d)[:10]).isoformat()
    except ValueError:
        raise HTTPException(status_code=400, detail="Goal date must look like 2027-03-31")


def _public_account(a: dict) -> dict:
    s = dict(a.get("sync") or {})
    s.pop("token_enc", None)
    return {**{k: v for k, v in a.items() if k != "sync"}, "sync": s, "platform_label": PLATFORMS.get(a["platform"], {}).get("label", a["platform"])}


def _apply_sync(doc: dict, sync: Optional[SyncIn], platform: str):
    if sync is None:
        return
    cur = dict(doc.get("sync") or {})
    if not sync.method:
        doc["sync"] = {"method": None, "last": cur.get("last")}
        return
    if sync.method != PLATFORMS.get(platform, {}).get("sync"):
        raise HTTPException(status_code=400, detail=f"{PLATFORMS[platform]['label']} accounts can't use that sync")
    cur["method"] = sync.method
    if sync.external_id is not None:
        cur["external_id"] = sync.external_id.strip()[:120]
    if sync.host:
        if sync.host not in ("graph.facebook.com", "graph.instagram.com"):
            raise HTTPException(status_code=400, detail="Host must be graph.facebook.com or graph.instagram.com")
        cur["host"] = sync.host
    if sync.access_token:
        cur["token_enc"], cur["token_hint"] = encrypt_secret(sync.access_token.strip()), "…" + sync.access_token.strip()[-4:]
    if sync.method in ("instagram", "facebook") and not cur.get("token_enc"):
        raise HTTPException(status_code=400, detail="Paste the account's access token to sync it")
    if not cur.get("external_id") and sync.method != "instagram":
        raise HTTPException(status_code=400, detail="Add the channel / page id to sync it")
    doc["sync"] = cur


@router.get("/growth/accounts")
async def list_accounts(owner: Optional[str] = None, user: dict = Depends(get_current_user)):
    _need(user)
    q: dict = {}
    if owner:
        await _check_owner(user, owner)
        q["owner"] = owner
    else:
        scope = await scoped_client_ids(user)
        if scope is not None:
            q["owner"] = {"$in": scope + [INTERNAL]}
    rows = await db.growth_accounts.find(q, {"_id": 0}).to_list(2000)
    order = list(PLATFORMS)
    rows.sort(key=lambda a: (a["owner"] != INTERNAL, a.get("owner_name") or "", order.index(a["platform"]) if a["platform"] in order else 99, a.get("handle") or ""))
    return [_public_account(a) for a in rows]


@router.post("/growth/accounts")
async def create_account(body: AccountIn, user: dict = Depends(get_current_user)):
    _need(user, manage=True)
    if body.platform not in PLATFORMS:
        raise HTTPException(status_code=400, detail="Unknown platform")
    owner = await _check_owner(user, body.owner)
    doc = {"id": str(uuid.uuid4()), "owner": body.owner, "client_id": None if body.owner == INTERNAL else body.owner, "owner_name": owner["name"],
           "platform": body.platform, "handle": (body.handle or "").strip()[:80], "url": (body.url or "").strip()[:300],
           "name": (body.name or "").strip()[:80], "target": body.target, "target_date": _date_ok(body.target_date),
           "status": body.status if body.status in ("active", "paused") else "active", "sync": {"method": None},
           "created_by": user["id"], "created_at": _now(), "updated_at": _now()}
    _apply_sync(doc, body.sync, body.platform)
    await db.growth_accounts.insert_one(dict(doc))
    await log_activity(user, "growth_account_added", "growth_account", doc["id"], f"{owner['name']} · {PLATFORMS[body.platform]['label']} {doc['handle']}")
    return _public_account(doc)


@router.put("/growth/accounts/{aid}")
async def update_account(aid: str, body: AccountUpdate, user: dict = Depends(get_current_user)):
    _need(user, manage=True)
    a = await db.growth_accounts.find_one({"id": aid}, {"_id": 0})
    if not a:
        raise HTTPException(status_code=404, detail="Account not found")
    await _check_owner(user, a["owner"])
    for k in ("handle", "url", "name"):
        v = getattr(body, k)
        if v is not None:
            a[k] = v.strip()[:300]
    sent = body.model_fields_set   # target / goal date can be cleared by sending null
    if "target" in sent:
        a["target"] = body.target
    if "target_date" in sent:
        a["target_date"] = _date_ok(body.target_date)
    if body.status in ("active", "paused"):
        a["status"] = body.status
    _apply_sync(a, body.sync, a["platform"])
    a["updated_at"] = _now()
    await db.growth_accounts.update_one({"id": aid}, {"$set": a})
    await log_activity(user, "growth_account_updated", "growth_account", aid, f"{a['owner_name']} · {a['platform']} {a.get('handle', '')}")
    return _public_account(a)


# ------------------------------------------------------------------ monthly numbers
def _clean_values(platform: str, values: dict) -> dict:
    allowed = set(PLATFORMS[platform]["metrics"])
    out = {}
    for k, v in (values or {}).items():
        if k not in allowed or v in (None, ""):
            continue
        try:
            n = float(str(v).replace(",", "").strip())
        except (ValueError, OverflowError):
            n = float("nan")
        if not math.isfinite(n):
            raise HTTPException(status_code=400, detail=f"{METRICS[k]['label']}: '{str(v)[:30]}' isn't a number")
        if n < 0 or n > MAX_VALUE or (k == "rating" and n > 5):
            raise HTTPException(status_code=400, detail=f"{METRICS[k]['label']} can't be {str(v)[:30]}")
        out[k] = round(n, METRICS[k].get("decimals", 0)) if METRICS[k].get("decimals") else int(round(n))
    return out


def _future(month: str) -> bool:
    return month > _this_month()


async def upsert_month(account: dict, month: str, values: dict, source: str, actor: dict, note: str = "", replace: bool = False,
                       meta_values: Optional[dict] = None, clear: Optional[List[str]] = None) -> dict:
    """Merge (or replace) one month's numbers for an account; `clear` removes metrics that were wiped out."""
    _month_ok(month)
    if _future(month):
        raise HTTPException(status_code=400, detail="That month hasn't started yet")
    vals = _clean_values(account["platform"], values)
    cur = await db.growth_months.find_one({"account_id": account["id"], "month": month}, {"_id": 0})
    now = _now()
    if cur:
        merged = vals if replace else {**(cur.get("values") or {}), **vals}
        for k in clear or []:
            if k not in vals:
                merged.pop(k, None)
        sets = {"values": merged, "source": source, "updated_by": actor.get("name"), "updated_at": now}
        if note:
            sets["note"] = note[:300]
        if meta_values:
            sets["meta"] = {**(cur.get("meta") or {}), **meta_values}
        await db.growth_months.update_one({"id": cur["id"]}, {"$set": sets})
        return {**cur, **sets}
    doc = {"id": str(uuid.uuid4()), "account_id": account["id"], "owner": account["owner"], "client_id": account.get("client_id"),
           "platform": account["platform"], "month": month, "values": vals, "meta": meta_values or {}, "source": source, "note": note[:300],
           "updated_by": actor.get("name"), "updated_at": now, "created_at": now}
    await db.growth_months.insert_one(dict(doc))
    return doc


class EntryIn(BaseModel):
    account_id: str
    values: Dict[str, Any] = {}
    clear: List[str] = []          # metrics emptied in the grid
    note: Optional[str] = ""


class MonthIn(BaseModel):
    month: str
    entries: List[EntryIn]


@router.put("/growth/months")
async def save_month(body: MonthIn, user: dict = Depends(get_current_user)):
    """The monthly entry grid: one month, many accounts."""
    _need(user, manage=True)
    _month_ok(body.month)
    if _future(body.month):
        raise HTTPException(status_code=400, detail="That month hasn't started yet")
    todo = []
    for e in body.entries[:500]:   # check every entry first, so a bad cell saves nothing
        a = await db.growth_accounts.find_one({"id": e.account_id}, {"_id": 0})
        if not a:
            raise HTTPException(status_code=404, detail="Account not found")
        await _check_owner(user, a["owner"])
        try:
            vals = _clean_values(a["platform"], e.values)
        except HTTPException as ex:
            raise HTTPException(status_code=400, detail=f"{PLATFORMS[a['platform']]['label']} {a.get('handle') or ''}: {ex.detail}".replace("  ", " "))
        clear = [k for k in e.clear if k in PLATFORMS[a["platform"]]["metrics"]]
        if vals or clear or e.note:
            todo.append((a, vals, clear, e.note or ""))
    saved = 0
    for a, vals, clear, note in todo:
        if not vals and clear and not await db.growth_months.find_one({"account_id": a["id"], "month": body.month}, {"_id": 0, "id": 1}):
            continue
        await upsert_month(a, body.month, vals, "manual", user, note, clear=clear)
        saved += 1
    await log_activity(user, "growth_numbers_saved", "growth", None, f"{_label(body.month)} · {saved} account(s)")
    return {"ok": True, "saved": saved}


@router.get("/growth/months")
async def list_months(account_id: Optional[str] = None, owner: Optional[str] = None, month: Optional[str] = None,
                      user: dict = Depends(get_current_user)):
    _need(user)
    q: dict = {}
    if account_id:
        a = await db.growth_accounts.find_one({"id": account_id}, {"_id": 0, "owner": 1})
        if not a:
            raise HTTPException(status_code=404, detail="Account not found")
        await _check_owner(user, a["owner"])
        q["account_id"] = account_id
    elif owner:
        await _check_owner(user, owner)
        q["owner"] = owner
    else:
        raise HTTPException(status_code=400, detail="Pick an account or an owner")
    if month:
        q["month"] = month
    return await db.growth_months.find(q, {"_id": 0}).sort("month", -1).to_list(5000)


class ImportIn(BaseModel):
    owner: str
    text: str                              # CSV / pasted table with a header row
    dry_run: bool = False


_HEADER_ALIASES = {"month": "month", "date": "month", "period": "month", "platform": "platform", "channel": "platform", "network": "platform",
                   "handle": "handle", "account": "handle", "username": "handle", "page": "handle",
                   "follower": "followers", "followers": "followers", "fans": "followers", "subscribers": "subscribers", "subs": "subscribers",
                   "posts": "posts", "videos": "videos", "reviews": "reviews", "rating": "rating", "views": "views", "video_views": "views",
                   "reach": "reach", "accounts_reached": "reach", "impressions": "impressions", "interactions": "interactions",
                   "engagement": "interactions", "engagements": "interactions", "total_interactions": "interactions",
                   "profile_visits": "profile_visits", "profile_views": "profile_views", "link_taps": "link_taps", "link_clicks": "link_clicks",
                   "clicks": "link_clicks", "watch_hours": "watch_hours", "watch_time_hours": "watch_hours", "saves": "saves",
                   "outbound_clicks": "outbound_clicks", "searches": "searches", "calls": "calls", "directions": "directions",
                   "website_clicks": "website_clicks", "users": "users", "sessions": "sessions", "page_views": "page_views", "pageviews": "page_views",
                   "organic_sessions": "organic_sessions", "conversions": "conversions", "leads": "conversions"}
_PLATFORM_ALIASES = {"ig": "instagram", "insta": "instagram", "instagram": "instagram", "fb": "facebook", "facebook": "facebook", "meta": "facebook",
                     "yt": "youtube", "youtube": "youtube", "linkedin": "linkedin", "li": "linkedin", "x": "x", "twitter": "x", "threads": "threads",
                     "pinterest": "pinterest", "gbp": "google_business", "google business": "google_business", "google_business": "google_business",
                     "google my business": "google_business", "gmb": "google_business", "website": "website", "ga4": "website", "web": "website",
                     "whatsapp": "whatsapp", "other": "other"}


def _norm_header(h: str) -> str:
    k = re.sub(r"[^a-z0-9]+", "_", (h or "").strip().lower()).strip("_")
    return _HEADER_ALIASES.get(k, k)


def _norm_month(v: str) -> Optional[str]:
    m = _parse_month(v)
    return m if m and MONTH_RE.match(m) and "1990-01" <= m else None


def _parse_month(v: str) -> Optional[str]:
    v = (v or "").strip()
    m = re.match(r"^(\d{4})[-/](\d{1,2})", v)
    if m:
        return f"{int(m.group(1)):04d}-{int(m.group(2)):02d}"
    m = re.match(r"^(\d{1,2})[-/](\d{4})$", v)
    if m:
        return f"{int(m.group(2)):04d}-{int(m.group(1)):02d}"
    m = re.match(r"^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$", v)  # dd/mm/yyyy (India)
    if m:
        return f"{int(m.group(3)):04d}-{int(m.group(2)):02d}"
    for fmt in ("%b %Y", "%B %Y", "%b-%Y", "%B-%Y", "%b %y", "%b-%y"):
        try:
            return datetime.strptime(v, fmt).strftime("%Y-%m")
        except ValueError:
            pass
    return None


@router.post("/growth/import")
async def import_numbers(body: ImportIn, user: dict = Depends(get_current_user)):
    """Paste or upload a table: a header row with month + platform (+ handle when a client has two accounts on one
    platform) and any metric columns. Missing accounts are reported, not created."""
    _need(user, manage=True)
    owner = await _check_owner(user, body.owner)
    text = (body.text or "").lstrip("\ufeff").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Paste the table first")
    if len(text) > 2_000_000:
        raise HTTPException(status_code=400, detail="That's too much to import at once — split it into smaller files")
    first = text.splitlines()[0]
    delim = "\t" if "\t" in first else (";" if first.count(";") > first.count(",") else ",")
    try:
        rows = list(csv.reader(io.StringIO(text), delimiter=delim))
    except csv.Error as e:
        raise HTTPException(status_code=400, detail=f"Couldn't read the table: {str(e)[:80]}")
    if len(rows) < 2:
        raise HTTPException(status_code=400, detail="Add a header row and at least one row of numbers")
    hdr = [_norm_header(h) for h in rows[0]]
    if "month" not in hdr or "platform" not in hdr:
        raise HTTPException(status_code=400, detail="The header needs a Month column and a Platform column")
    accounts = await db.growth_accounts.find({"owner": body.owner}, {"_id": 0}).to_list(200)
    ok, problems = [], []
    for i, r in enumerate(rows[1:5001], start=2):
        if not any(c.strip() for c in r):
            continue
        rec = {hdr[j]: (r[j] if j < len(r) else "") for j in range(len(hdr))}
        month = _norm_month(rec.get("month", ""))
        plat = _PLATFORM_ALIASES.get((rec.get("platform") or "").strip().lower())
        if not month:
            problems.append({"row": i, "problem": f"Can't read the month '{str(rec.get('month', ''))[:30]}'"}); continue
        if _future(month):
            problems.append({"row": i, "problem": f"{_label(month)} hasn't started yet"}); continue
        if not plat:
            problems.append({"row": i, "problem": f"Unknown platform '{str(rec.get('platform', ''))[:30]}'"}); continue
        handle = (rec.get("handle") or "").strip().lstrip("@").lower()
        cands = [a for a in accounts if a["platform"] == plat]
        if handle:
            cands = [a for a in cands if (a.get("handle") or "").lstrip("@").lower() == handle] or cands[:0]
        if len(cands) != 1:
            problems.append({"row": i, "problem": f"No single {PLATFORMS[plat]['label']} account for {owner['name']}" + (f" with handle @{handle}" if handle else "") +
                             (" — add the handle column" if len(cands) > 1 else " — add the account first")}); continue
        vals = {k: v for k, v in rec.items() if k in METRICS and k in PLATFORMS[plat]["metrics"] and str(v).strip() != ""}
        try:
            _clean_values(plat, vals)
        except HTTPException as e:
            problems.append({"row": i, "problem": e.detail}); continue
        if not vals:
            problems.append({"row": i, "problem": "No numbers for this platform in this row"}); continue
        ok.append((cands[0], month, vals))
    if not body.dry_run:
        for a, m, v in ok:
            await upsert_month(a, m, v, "import", user)
        await log_activity(user, "growth_numbers_imported", "growth", None, f"{owner['name']} · {len(ok)} rows, {len(problems)} skipped")
    return {"rows": len(ok), "problems": problems[:100], "preview": [{"account": f"{PLATFORMS[a['platform']]['label']} {a.get('handle', '')}".strip(), "month": m,
                                                                       "values": v} for a, m, v in ok[:20]], "dry_run": body.dry_run}


# ------------------------------------------------------------------ overview
def _num(v):
    return None if v is None else float(v)


async def owner_overview(owner: str, end: str, n: int) -> dict:
    """Per account and in total, over the n months ending `end`:
      start = audience at the end of the month before the window (or the latest number before that, or the first in the window)
      now   = the latest audience number inside the window
      engagement = interactions ÷ accounts reached, month by month (÷ views in months that don't report reach)."""
    months = _months(end, n)
    base = _shift(months[0], -1)
    accounts = [a for a in await db.growth_accounts.find({"owner": owner}, {"_id": 0}).to_list(200)]
    ids = [a["id"] for a in accounts]
    recs = await db.growth_months.find({"account_id": {"$in": ids}, "month": {"$gte": _shift(base, -24), "$lte": end}}, {"_id": 0}).to_list(50000)
    by, before = {}, {}
    for r in recs:
        if r["month"] >= base:
            by.setdefault(r["account_id"], {})[r["month"]] = r
        else:
            before.setdefault(r["account_id"], []).append(r)
    this_m = _this_month()
    last_m = _shift(this_m, -1)
    out_accounts = []
    totals = {"audience_now": 0.0, "audience_start": 0.0, "views": 0.0, "interactions": 0.0, "reach": 0.0, "er_inter": 0.0, "er_base": 0.0}
    trend = {m: {"month": m, "label": _label(m)} for m in months}
    order = list(PLATFORMS)
    for a in sorted(accounts, key=lambda x: (order.index(x["platform"]) if x["platform"] in order else 99, x.get("handle") or "")):
        p = PLATFORMS.get(a["platform"], PLATFORMS["other"])
        am = by.get(a["id"], {})
        aud_key, view_key = p["audience"], p["views"]
        series = []
        for m in months:
            r = am.get(m)
            v = (r or {}).get("values") or {}
            series.append({"month": m, "label": _label(m), "audience": _num(v.get(aud_key)) if aud_key else None,
                           "views": _num(v.get(view_key)) if view_key else None, "values": v, "source": (r or {}).get("source")})
        filled = [s for s in series if s["audience"] is not None]
        # the audience just before the window: the base month, else the latest earlier month on file
        prior = None
        if aud_key:
            base_v = ((am.get(base) or {}).get("values") or {}).get(aud_key)
            if base_v is not None:
                prior = _num(base_v)
            else:
                older = sorted((r for r in before.get(a["id"], []) if ((r.get("values") or {}).get(aud_key) is not None)), key=lambda r: r["month"])
                if older:
                    prior = _num(older[-1]["values"][aud_key])
        now = filled[-1]["audience"] if filled else None
        start = prior if prior is not None else (filled[0]["audience"] if filled else None)
        prev = filled[-2]["audience"] if len(filled) >= 2 else (prior if filled else None)
        views = sum(s["views"] or 0 for s in series)
        inter = sum(float((s["values"] or {}).get("interactions") or 0) for s in series)
        reach = sum(float((s["values"] or {}).get("reach") or 0) for s in series)
        er_i = er_b = 0.0
        for s in series:   # month by month, so a month without reach doesn't inflate the rate
            vals = s["values"] or {}
            denom = float(vals.get("reach") or 0) or float(s["views"] or 0)
            if denom and vals.get("interactions") is not None:
                er_i += float(vals["interactions"])
                er_b += denom
        last = max((r for r in am.values() if r["month"] in months), key=lambda r: r["month"], default=None)
        lab = f"{p['label']}" + (f" @{a['handle'].lstrip('@')}" if a.get("handle") and a["platform"] not in ("website", "google_business") else (f" · {a['handle']}" if a.get("handle") else ""))
        row = {"id": a["id"], "platform": a["platform"], "platform_label": p["label"], "label": lab, "handle": a.get("handle", ""), "url": a.get("url", ""),
               "name": a.get("name", ""), "status": a.get("status", "active"), "audience_metric": aud_key,
               "audience_label": METRICS[aud_key]["label"] if aud_key else None, "views_metric": view_key, "views_label": METRICS[view_key]["label"] if view_key else None,
               "audience_now": now, "audience_start": start, "change": (now - start) if (now is not None and start is not None) else None,
               "change_pct": round(100 * (now - start) / start, 1) if (now is not None and start) else None,
               "last_month_change": (now - prev) if (now is not None and prev is not None) else None,
               "views": views, "interactions": inter, "reach": reach,
               "engagement_rate": round(100 * er_i / er_b, 2) if er_i and er_b else None,
               "target": a.get("target"), "target_date": a.get("target_date"),
               "target_pct": round(100 * now / a["target"]) if (now is not None and a.get("target")) else None,
               "series": series, "metrics": p["metrics"], "last_month": last["month"] if last else None,
               "last_source": last["source"] if last else None, "last_updated": last["updated_at"] if last else None,
               "missing_last_month": (months[0] <= last_m <= months[-1] and last_m not in am
                                      and a.get("status", "active") == "active" and (a.get("created_at") or "") < this_m + "-01"),
               "sync": {k: v for k, v in (a.get("sync") or {}).items() if k != "token_enc"}}
        out_accounts.append(row)
        if p["social"]:
            # total audience: an account with no number in the window still counts at its last known level (no change)
            level_now = now if now is not None else prior
            if level_now is not None:
                totals["audience_now"] += level_now
                totals["audience_start"] += start if (now is not None and start is not None) else level_now
            totals["views"] += views
            totals["interactions"] += inter
            totals["reach"] += reach
            totals["er_inter"] += er_i
            totals["er_base"] += er_b
            for s in series:
                if s["audience"] is not None:
                    trend[s["month"]][a["id"]] = s["audience"]
                if s["views"] is not None:
                    trend[s["month"]][f"views:{a['id']}"] = s["views"]
    net = totals["audience_now"] - totals["audience_start"]
    best = max((r for r in out_accounts if r["change_pct"] is not None and PLATFORMS.get(r["platform"], {}).get("social")),
               key=lambda r: r["change_pct"], default=None)
    return {"owner": owner, "months": months, "month_labels": [_label(m) for m in months],
            "period": _label(months[0]) if len(months) == 1 else f"{_label(months[0])} – {_label(months[-1])}",
            "accounts": out_accounts, "trend": list(trend.values()),
            "totals": {"audience_now": round(totals["audience_now"]), "net_growth": round(net),
                       "growth_pct": round(100 * net / totals["audience_start"], 1) if totals["audience_start"] else None,
                       "views": round(totals["views"]), "interactions": round(totals["interactions"]), "reach": round(totals["reach"]),
                       "engagement_rate": round(100 * totals["er_inter"] / totals["er_base"], 2) if totals["er_inter"] and totals["er_base"] else None,
                       "accounts": len(out_accounts), "best": {"label": best["label"], "change_pct": best["change_pct"]} if best else None,
                       "missing_last_month": sum(1 for r in out_accounts if r["missing_last_month"])}}

@router.get("/growth/overview")
async def overview(owner: str = INTERNAL, months: int = Query(6, ge=2, le=24), end: Optional[str] = None, user: dict = Depends(get_current_user)):
    _need(user)
    o = await _check_owner(user, owner)
    end = end or default_end()
    _month_ok(end)
    d = await owner_overview(owner, end, months)
    d["owner_name"] = o["name"]
    return d


def _audience_spark(d: dict) -> list:
    """Total social audience per month, carrying each account's last known number across gaps."""
    out = [0.0] * len(d["months"])
    for a in d["accounts"]:
        if not PLATFORMS.get(a["platform"], {}).get("social"):
            continue
        last = a["audience_start"]
        for i, s in enumerate(a["series"]):
            last = s["audience"] if s["audience"] is not None else last
            out[i] += last or 0
    return [round(x) for x in out]


@router.get("/growth/leaderboard")
async def leaderboard(months: int = Query(6, ge=2, le=24), end: Optional[str] = None, user: dict = Depends(get_current_user)):
    """Every client with growth accounts, side by side (plus dotindot's own)."""
    _need(user)
    end = end or default_end()
    _month_ok(end)
    scope = await scoped_client_ids(user)
    owners = await db.growth_accounts.distinct("owner")
    names = {c["id"]: c["name"] for c in await db.clients.find({"id": {"$in": owners}}, {"_id": 0, "id": 1, "name": 1}).to_list(1000)}
    rows = []
    for o in owners:
        if o != INTERNAL and (o not in names or (scope is not None and o not in scope)):
            continue
        d = await owner_overview(o, end, months)
        t = d["totals"]
        rows.append({"owner": o, "name": "dotindot (our accounts)" if o == INTERNAL else names[o], "internal": o == INTERNAL, **t,
                     "platforms": sorted({a["platform_label"] for a in d["accounts"]}),
                     "spark": _audience_spark(d)})
    rows.sort(key=lambda r: (not r["internal"], r["growth_pct"] is None, -(r["growth_pct"] or 0)))
    return {"months": _months(end, months), "period": f"{_label(_months(end, months)[0])} – {_label(end)}", "rows": rows}


# ------------------------------------------------------------------ sync
async def _http_get(url: str, params: dict) -> dict:
    import httpx
    async with httpx.AsyncClient(timeout=15) as cx:
        r = await cx.get(url, params=params)
    try:
        data = r.json()
    except Exception:
        data = {}
    if r.status_code >= 400:
        msg = (data.get("error") or {}).get("message") if isinstance(data.get("error"), dict) else None
        raise RuntimeError(msg or f"The platform answered {r.status_code}")
    return data


def _month_window(month: str):
    y, m = map(int, month.split("-"))
    start = datetime(y, m, 1, tzinfo=timezone.utc)
    end = datetime(y + (m == 12), m % 12 + 1, 1, tzinfo=timezone.utc)
    return start, min(end, datetime.now(timezone.utc))


FLOW_ONLY = {"views", "reach", "interactions", "link_taps"}


def _scrub(msg: str, secrets: list) -> str:
    """Platform error text can echo the request back — never store a key or token in it."""
    out = str(msg or "")
    for sec in secrets:
        if sec and len(sec) >= 6:
            out = out.replace(sec, "[hidden]")
    out = re.sub(r"(access_token|key|token)=[^&\s\"']+", r"\1=[hidden]", out, flags=re.I)
    return out[:240]


async def sync_account(a: dict, actor: Optional[dict] = None, month: Optional[str] = None, flows_only: bool = False) -> dict:
    """Pull today's numbers for one account into the given (default: current) month. Returns {ok, message, values}.
    flows_only: only the month's totals (views, reach…) — used to close last month without overwriting its month-end followers."""
    actor = actor or {"id": "system", "name": "Auto-sync", "role": "system"}
    s = a.get("sync") or {}
    month = month or _this_month()
    cfg = await growth_settings()
    vals, meta_vals = {}, {}
    secrets = []
    try:
        if s.get("method") == "youtube":
            if not cfg["youtube_key_enc"]:
                raise RuntimeError("Add a YouTube Data API key in Digital Growth → Settings")
            key = decrypt_secret(cfg["youtube_key_enc"])
            secrets.append(key)
            ext = (s.get("external_id") or a.get("handle") or "").strip()
            params = {"part": "statistics", "key": key}
            if ext.startswith("UC") and len(ext) >= 20:
                params["id"] = ext
            else:
                params["forHandle"] = ext if ext.startswith("@") else "@" + ext.lstrip("@")
            data = await _http_get("https://www.googleapis.com/youtube/v3/channels", params)
            items = data.get("items") or []
            if not items:
                raise RuntimeError("YouTube couldn't find that channel — check the @handle or channel id")
            st = items[0].get("statistics") or {}
            if not st.get("hiddenSubscriberCount") and st.get("subscriberCount") is not None:
                vals["subscribers"] = int(st["subscriberCount"])
            if st.get("videoCount") is not None:
                vals["videos"] = int(st["videoCount"])
            if st.get("viewCount") is not None:
                total = int(st["viewCount"])
                meta_vals["views_total"] = total
                prev = await db.growth_months.find_one({"account_id": a["id"], "month": _shift(month, -1)}, {"_id": 0, "meta": 1})
                if prev and (prev.get("meta") or {}).get("views_total") is not None:
                    vals["views"] = max(0, total - int(prev["meta"]["views_total"]))
        elif s.get("method") in ("instagram", "facebook"):
            token = decrypt_secret(s["token_enc"])
            secrets.append(token)
            host = s.get("host") or "graph.facebook.com"
            ver = cfg["graph_version"]
            base = f"https://{host}/{ver}"
            if s["method"] == "facebook":
                data = await _http_get(f"{base}/{s['external_id']}", {"fields": "followers_count,fan_count,name", "access_token": token})
                f = data.get("followers_count", data.get("fan_count"))
                if f is not None:
                    vals["followers"] = int(f)
            else:
                ig = s.get("external_id") or "me"
                data = await _http_get(f"{base}/{ig}", {"fields": "followers_count,media_count,username", "access_token": token})
                if data.get("followers_count") is not None:
                    vals["followers"] = int(data["followers_count"])
                if data.get("media_count") is not None:
                    vals["posts"] = int(data["media_count"])
                start, stop = _month_window(month)
                sums = {"views": 0, "reach": 0, "total_interactions": 0, "profile_links_taps": 0}
                got = set()
                t0 = start
                while t0 < stop:  # the insights API takes at most 30 days per call
                    t1 = min(t0 + timedelta(days=30), stop)
                    ins = await _http_get(f"{base}/{data.get('id') or ig}/insights", {
                        "metric": ",".join(sums), "period": "day", "metric_type": "total_value",
                        "since": int(t0.timestamp()), "until": int(t1.timestamp()), "access_token": token})
                    for row in ins.get("data") or []:
                        v = (row.get("total_value") or {}).get("value")
                        if row.get("name") in sums and v is not None:
                            sums[row["name"]] += int(v)
                            got.add(row["name"])
                    t0 = t1
                for src, dst in (("views", "views"), ("reach", "reach"), ("total_interactions", "interactions"), ("profile_links_taps", "link_taps")):
                    if src in got:
                        vals[dst] = sums[src]
        else:
            raise RuntimeError("This account isn't set up to sync — enter its numbers by hand or import them")
        if flows_only:
            vals, meta_vals = {k: v for k, v in vals.items() if k in FLOW_ONLY}, {}
        if not vals and not meta_vals:
            raise RuntimeError("The platform answered but sent no numbers")
        await upsert_month(a, month, vals, "sync", actor, meta_values=meta_vals)
        res = {"ok": True, "message": f"Synced {', '.join(METRICS[k]['label'].lower() for k in vals)}", "at": _now(), "values": vals, "month": month}
    except HTTPException as e:
        res = {"ok": False, "message": _scrub(e.detail, secrets), "at": _now()}
    except Exception as e:  # network / platform errors
        res = {"ok": False, "message": _scrub(str(e), secrets) or type(e).__name__, "at": _now()}
    await db.growth_accounts.update_one({"id": a["id"]}, {"$set": {"sync.last": res}})
    return res


@router.post("/growth/accounts/{aid}/sync")
async def sync_now(aid: str, user: dict = Depends(get_current_user)):
    _need(user, manage=True)
    a = await db.growth_accounts.find_one({"id": aid}, {"_id": 0})
    if not a:
        raise HTTPException(status_code=404, detail="Account not found")
    await _check_owner(user, a["owner"])
    res = await sync_account(a, user)
    await log_activity(user, "growth_synced", "growth_account", aid, res["message"][:120])
    return res


async def sync_all(trigger: str = "scheduled") -> dict:
    """Daily job: refresh every active synced account."""
    cfg = await growth_settings()
    if not cfg["auto_sync"] and trigger == "scheduled":
        return {"skipped": True}
    done = failed = 0
    async for a in db.growth_accounts.find({"status": "active", "sync.method": {"$in": list(SYNC_LABELS)}}, {"_id": 0}):
        if date.today().day <= 2 and a["sync"]["method"] == "instagram":
            await sync_account(a, month=_shift(_this_month(), -1), flows_only=True)   # close last month's views / reach with its final days
        r = await sync_account(a)
        done += r["ok"]
        failed += not r["ok"]
    return {"synced": done, "failed": failed}


# ------------------------------------------------------------------ report (PDF / Excel)
def _fmt(n, dec=0):
    if n is None:
        return "—"
    return f"{n:,.{dec}f}" if dec else f"{int(round(n)):,}"


def build_growth_pdf(d: dict, owner_name: str, generated_by: str = "") -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, KeepTogether
    from reportlab.graphics.shapes import Drawing, String
    from reportlab.graphics.charts.linecharts import HorizontalLineChart
    from reportlab.graphics.charts.barcharts import VerticalBarChart
    from export_engine import FONT, BOLD_FONT, ORANGE_HEX, _page_decorator

    bio = BytesIO_()
    doc = SimpleDocTemplate(bio, pagesize=A4, leftMargin=14 * mm, rightMargin=14 * mm, topMargin=22 * mm, bottomMargin=16 * mm,
                            title=f"Digital growth — {owner_name}")
    W = A4[0] - 28 * mm
    ink, muted, line = colors.HexColor("#111827"), colors.HexColor("#6B7280"), colors.HexColor("#E5E7EB")
    orange, peach = colors.HexColor(ORANGE_HEX), colors.HexColor("#FFF7ED")
    PALETTE = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#6250d6", "#64748B"]
    H1 = ParagraphStyle("h1", fontName=BOLD_FONT, fontSize=17, textColor=ink, leading=21)
    SUB = ParagraphStyle("sub", fontName=FONT, fontSize=9, textColor=muted, leading=12)
    H2 = ParagraphStyle("h2", fontName=BOLD_FONT, fontSize=11, textColor=orange, spaceBefore=12, spaceAfter=5)
    CELL = ParagraphStyle("cell", fontName=FONT, fontSize=8.2, textColor=ink, leading=10.4)
    esc = lambda s: (str(s) if s not in (None, "") else "—").replace("&", "&amp;").replace("<", "&lt;")
    t = d["totals"]
    story = [Paragraph(esc(owner_name), H1), Paragraph(f"Digital growth report · {esc(d['period'])}", SUB), Spacer(1, 8)]
    tiles = [("Total audience", _fmt(t["audience_now"])), ("New followers", ("+" if (t["net_growth"] or 0) >= 0 else "") + _fmt(t["net_growth"])),
             ("Growth", f"{t['growth_pct']:+.1f}%" if t["growth_pct"] is not None else "—"), ("Views", _fmt(t["views"])),
             ("Engagement rate", f"{t['engagement_rate']:.2f}%" if t["engagement_rate"] is not None else "—")]
    tt = Table([[Paragraph(k.upper(), ParagraphStyle("tl", fontName=BOLD_FONT, fontSize=6.5, textColor=muted)) for k, _ in tiles],
                [Paragraph(f"<b>{esc(v)}</b>", ParagraphStyle("tv", fontName=BOLD_FONT, fontSize=12.5, textColor=ink)) for _, v in tiles]], colWidths=[W / 5] * 5)
    tt.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), peach), ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#FDBA74")),
                            ("LEFTPADDING", (0, 0), (-1, -1), 7), ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]))
    story.append(tt)
    if t.get("best"):
        story += [Spacer(1, 4), Paragraph(f"Fastest growing: <b>{esc(t['best']['label'])}</b> ({t['best']['change_pct']:+.1f}%).", CELL)]

    def table(headers, rows, widths, right=()):
        hdr = [Paragraph(f"<b>{h}</b>", ParagraphStyle("hd", fontName=BOLD_FONT, fontSize=7.4, textColor=colors.white)) for h in headers]
        tb = Table([hdr] + rows, colWidths=[W * w for w in widths], repeatRows=1)
        st = [("BACKGROUND", (0, 0), (-1, 0), orange), ("GRID", (0, 0), (-1, -1), 0.25, line), ("FONTNAME", (0, 1), (-1, -1), FONT),
              ("FONTSIZE", (0, 1), (-1, -1), 8), ("TOPPADDING", (0, 0), (-1, -1), 3.2), ("BOTTOMPADDING", (0, 0), (-1, -1), 3.2)]
        st += [("ALIGN", (i, 0), (i, -1), "RIGHT") for i in right]
        tb.setStyle(TableStyle(st))
        return tb

    accs = d["accounts"]
    story.append(Paragraph("By account", H2))
    story.append(table(["Account", "Audience", "Start", "Now", "Change", "Views", "Interactions", "Eng. rate"],
                       [[Paragraph(esc(a["label"]), CELL), esc(a["audience_label"] or "—"), _fmt(a["audience_start"]), _fmt(a["audience_now"]),
                         (f"{'+' if (a['change'] or 0) >= 0 else ''}{_fmt(a['change'])}" + (f" ({a['change_pct']:+.1f}%)" if a["change_pct"] is not None else "")) if a["change"] is not None else "—",
                         _fmt(a["views"]) if a["views"] else "—", _fmt(a["interactions"]) if a["interactions"] else "—",
                         f"{a['engagement_rate']:.2f}%" if a["engagement_rate"] is not None else "—"] for a in accs],
                       [0.22, 0.11, 0.09, 0.09, 0.16, 0.1, 0.13, 0.1], right=(2, 3, 4, 5, 6, 7)))

    social = [a for a in accs if PLATFORMS.get(a["platform"], {}).get("social") and any(s["audience"] is not None for s in a["series"])]
    if social:
        dw = Drawing(W, 196)
        lc = HorizontalLineChart()
        lc.x, lc.y, lc.width, lc.height = 40, 44, W - 60, 140
        data = []
        for a in social[:6]:
            pts, last = [], a["audience_start"]
            for s in a["series"]:
                last = s["audience"] if s["audience"] is not None else last
                pts.append(last if last is not None else 0)
            data.append(pts)
        lc.data = data
        lc.categoryAxis.categoryNames = [s["label"] for s in social[0]["series"]]
        lc.categoryAxis.labels.fontName, lc.categoryAxis.labels.fontSize = FONT, 7
        lc.valueAxis.labels.fontName, lc.valueAxis.labels.fontSize = FONT, 7
        lc.valueAxis.valueMin = 0
        for i in range(len(data)):
            lc.lines[i].strokeColor = colors.HexColor(PALETTE[i % len(PALETTE)])
            lc.lines[i].strokeWidth = 1.8
        dw.add(lc)
        for i, a in enumerate(social[:6]):
            dw.add(String(40 + (i % 3) * ((W - 60) / 3), 14 - (i // 3) * 10, "■ " + a["label"][:34], fontName=FONT, fontSize=7,
                          fillColor=colors.HexColor(PALETTE[i % len(PALETTE)])))
        story.append(KeepTogether([Paragraph("Audience over time", H2), dw]))
        dv = Drawing(W, 170)
        bc = VerticalBarChart()
        bc.x, bc.y, bc.width, bc.height = 40, 30, W - 60, 120
        bc.data = [[sum((s["views"] or 0) for a in social for s in a["series"] if s["month"] == m) for m in d["months"]]]
        bc.categoryAxis.categoryNames = d["month_labels"]
        bc.categoryAxis.labels.fontName, bc.categoryAxis.labels.fontSize = FONT, 7
        bc.valueAxis.labels.fontName, bc.valueAxis.labels.fontSize = FONT, 7
        bc.valueAxis.valueMin = 0
        bc.bars[0].fillColor = colors.HexColor(PALETTE[0])
        bc.bars[0].strokeColor = None
        dv.add(bc)
        story.append(KeepTogether([Paragraph("Views per month (all social accounts)", H2), dv]))

    for a in accs:
        mets = [m for m in a["metrics"] if any((s["values"] or {}).get(m) is not None for s in a["series"])]
        if not mets:
            continue
        rows = [[s["label"]] + [_fmt((s["values"] or {}).get(m), METRICS[m].get("decimals", 0)) for m in mets] for s in a["series"]]
        w0 = 0.16
        story.append(KeepTogether([Paragraph(esc(a["label"]), H2),
                                   table(["Month"] + [METRICS[m].get("short", METRICS[m]["label"]) for m in mets], rows, [w0] + [(1 - w0) / len(mets)] * len(mets),
                                         right=tuple(range(1, len(mets) + 1)))]))
    story += [Spacer(1, 10), Paragraph("Followers / subscribers are month-end figures; views, reach and interactions are totals for the month. "
                                       "Engagement rate = interactions ÷ accounts reached (or views where reach isn't reported).", SUB)]
    deco = _page_decorator(f"Digital growth — {owner_name}", generated_by)
    doc.build(story, onFirstPage=deco, onLaterPages=deco)
    return bio.getvalue()


def BytesIO_():
    from io import BytesIO
    return BytesIO()


def build_growth_xlsx(d: dict, owner_name: str, generated_by: str = "") -> bytes:
    from export_engine import build_xlsx
    t = d["totals"]
    summary = [{"label": k, "value": v} for k, v in (("Owner", owner_name), ("Period", d["period"]), ("Total audience", t["audience_now"]),
                                                     ("New followers", t["net_growth"]), ("Growth %", t["growth_pct"]), ("Views", t["views"]),
                                                     ("Interactions", t["interactions"]), ("Engagement rate %", t["engagement_rate"]))]
    sections = [{"title": "By account", "columns": [("label", "Account", "text"), ("audience_label", "Audience", "text"), ("audience_start", "Start", "num"),
                                                    ("audience_now", "Now", "num"), ("change", "Change", "num"), ("change_pct", "Change %", "num"),
                                                    ("views", "Views", "num"), ("interactions", "Interactions", "num"), ("engagement_rate", "Engagement %", "num")],
                 "rows": d["accounts"]}]
    rows = []
    for a in d["accounts"]:
        for s in a["series"]:
            for m, v in (s["values"] or {}).items():
                rows.append({"account": a["label"], "month": s["month"], "metric": METRICS.get(m, {}).get("label", m), "value": v, "source": s.get("source") or ""})
    sections.append({"title": "Monthly numbers", "columns": [("account", "Account", "text"), ("month", "Month", "text"), ("metric", "Metric", "text"),
                                                             ("value", "Value", "num"), ("source", "Source", "text")], "rows": rows})
    return build_xlsx(f"Digital growth — {owner_name}", sections, summary=summary, generated_by=generated_by)


def _safe(s):
    from export_engine import slug
    return slug(s, "client")


@router.get("/growth/report")
async def report(owner: str = INTERNAL, months: int = Query(6, ge=2, le=24), end: Optional[str] = None, format: str = "pdf",
                 user: dict = Depends(get_current_user)):
    _need(user)
    o = await _check_owner(user, owner)
    end = end or default_end()
    _month_ok(end)
    d = await owner_overview(owner, end, months)
    name = "dotindot" if owner == INTERNAL else o["name"]
    fname = f"dotindot-growth-{_safe(name)}-{d['months'][0]}-to-{end}"
    nice = f"dotindot-growth-{'-'.join(name.split())}-{d['months'][0]}-to-{end}"
    from export_engine import attachment
    await log_activity(user, "growth_report_downloaded", "growth", owner, f"{name} · {d['period']} · {format}")
    if format == "xlsx":
        return Response(build_growth_xlsx(d, name, user["name"]), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        headers={"Content-Disposition": attachment(f"{fname}.xlsx", f"{nice}.xlsx")})
    return Response(build_growth_pdf(d, name, user["name"]), media_type="application/pdf", headers={"Content-Disposition": attachment(f"{fname}.pdf", f"{nice}.pdf")})


# ------------------------------------------------------------------ client dashboard / portal hook
def _span(date_from: str, date_to: str):
    """Months covered by a date range (1–24) and its last month; 400 on a malformed date."""
    try:
        d0, d1 = date.fromisoformat(str(date_from)[:10]), date.fromisoformat(str(date_to)[:10])
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Dates must look like 2026-10-01")
    if d1 < d0:
        d0, d1 = d1, d0
    n = (d1.year * 12 + d1.month) - (d0.year * 12 + d0.month) + 1
    return max(1, min(24, n)), d1.strftime("%Y-%m")


async def client_growth_summary(client_id: str, start: str, end: str) -> Optional[dict]:
    """For the client dashboard, portal and PDF: per account audience change and views across the months in [start, end]."""
    if not await db.growth_accounts.count_documents({"owner": client_id}):
        return None
    n, m1 = _span(start, end)
    d = await owner_overview(client_id, m1, n)
    # the trend chart always looks back at least six months, even for a one-month report
    c = d if n >= 6 else await owner_overview(client_id, m1, 6)
    trend = {a["id"]: a for a in c["accounts"]}
    return {"period": d["period"], "totals": d["totals"], "months": c["month_labels"],
            "accounts": [{k: a[k] for k in ("label", "platform", "platform_label", "audience_label", "audience_start", "audience_now", "change", "change_pct",
                                            "views", "views_label", "interactions", "engagement_rate")}
                         | {"spark": [s["audience"] for s in trend[a["id"]]["series"]], "spark_start": trend[a["id"]]["audience_start"]}
                         for a in d["accounts"]]}


# ------------------------------------------------------------------ alerts + report template
async def growth_alerts(user: dict) -> list:
    if not has_permission(user, "growth.manage"):
        return []
    today = date.today()
    if today.day > 10:
        return []
    last = _shift(_this_month(), -1)
    q = {"status": "active", "created_at": {"$lt": _this_month() + "-01"}}
    scope = await scoped_client_ids(user)
    if scope is not None:
        q["owner"] = {"$in": scope + [INTERNAL]}
    ids = [a["id"] async for a in db.growth_accounts.find(q, {"_id": 0, "id": 1})]
    if not ids:
        return []
    have = set(await db.growth_months.distinct("account_id", {"month": last, "account_id": {"$in": ids}}))
    missing = len([i for i in ids if i not in have])
    if not missing:
        return []
    return [{"kind": "growth", "title": f"{missing} account{'s' if missing > 1 else ''} missing {_label(last)} numbers",
             "sub": "Update Digital Growth so client reports are complete", "link": "/growth?enter=1", "date": today.isoformat()}]


GROWTH_TEMPLATES = {
    "digital-growth": {"name": "Digital Growth", "description": "Every client's social audience, follower growth, views and engagement over the period, plus dotindot's own accounts.",
                       "roles": ("admin", "sales", "pm"), "perm": "growth"},
}


async def tpl_digital_growth(date_from, date_to, branch_ids=None):
    n, m1 = _span(date_from, date_to)
    owners = await db.growth_accounts.distinct("owner")
    q = {"id": {"$in": owners}}
    if branch_ids:
        q["branch_id"] = {"$in": branch_ids}
    names = {c["id"]: c["name"] for c in await db.clients.find(q, {"_id": 0, "id": 1, "name": 1}).to_list(1000)}
    rows = []
    for o in owners:
        if o != INTERNAL and o not in names:
            continue
        if o == INTERNAL and branch_ids:
            continue
        d = await owner_overview(o, m1, n)
        t = d["totals"]
        rows.append({"name": "dotindot (our accounts)" if o == INTERNAL else names[o], "accounts": t["accounts"], "audience": t["audience_now"],
                     "net": t["net_growth"], "growth": f"{t['growth_pct']:+.1f}%" if t["growth_pct"] is not None else "—", "growth_n": t["growth_pct"],
                     "views": t["views"], "interactions": t["interactions"],
                     "er": f"{t['engagement_rate']:.2f}%" if t["engagement_rate"] is not None else "—", "best": (t.get("best") or {}).get("label", "—"),
                     "missing": t["missing_last_month"]})
    rows.sort(key=lambda r: (r["growth_n"] is None, -(r["growth_n"] or 0)))
    total_aud = sum(r["audience"] for r in rows)
    total_net = sum(r["net"] for r in rows)
    return {
        "title": "Digital Growth",
        "period_override": _label(m1) if n == 1 else f"{_label(_months(m1, n)[0])} – {_label(m1)}",
        "summary": [{"label": "Accounts tracked", "value": sum(r["accounts"] for r in rows)}, {"label": "Total audience", "value": total_aud},
                    {"label": "New followers", "value": total_net}, {"label": "Views", "value": sum(r["views"] for r in rows)},
                    {"label": "Clients behind on numbers", "value": sum(1 for r in rows if r["missing"])}],
        "charts": [{"type": "bar", "title": "New followers by client", "data": [{"name": r["name"][:22], "new": r["net"]} for r in rows[:12]], "keys": ["new"]}],
        "sections": [{"title": "Clients", "columns": [("name", "Client", "text"), ("accounts", "Accounts", "num"), ("audience", "Audience now", "num"),
                                                      ("net", "New followers", "num"), ("growth", "Growth", "text"), ("views", "Views", "num"),
                                                      ("interactions", "Interactions", "num"), ("er", "Engagement", "text"), ("best", "Fastest growing", "text")],
                      "rows": [{k: v for k, v in r.items() if k not in ("growth_n", "missing")} for r in rows]}],
    }


GROWTH_BUILDERS = {"digital-growth": tpl_digital_growth}
