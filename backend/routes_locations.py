import re
import uuid
from datetime import datetime, timezone
from typing import Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException
from database import db
from auth import get_current_user, require_roles, log_activity
from permissions import branch_scope
from india_locations import INDIA_STATES, INDIA_CITY_COORDS, COUNTRIES

router = APIRouter()

READ_ROLES = ("admin", "finance", "sales", "pm")


class BranchIn(BaseModel):
    name: str
    address: Optional[str] = ""
    city: str
    state: Optional[str] = ""
    country: Optional[str] = ""
    region: Optional[str] = ""
    contact_phone: Optional[str] = ""
    contact_email: Optional[str] = ""
    manager_id: Optional[str] = None
    head_name: Optional[str] = ""
    status: str = "active"
    lat: Optional[float] = None
    lng: Optional[float] = None
    pin_source: Optional[str] = None  # exact | city


class BranchUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    region: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    manager_id: Optional[str] = None
    head_name: Optional[str] = None
    status: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    pin_source: Optional[str] = None

# Hardcoded city -> coordinates lookup (no external geocoding API)
CITY_COORDS = {
    "Mumbai": {"lat": 19.0760, "lng": 72.8777, "country": "India"},
    "Bengaluru": {"lat": 12.9716, "lng": 77.5946, "country": "India"},
    "New Delhi": {"lat": 28.6139, "lng": 77.2090, "country": "India"},
    "Pune": {"lat": 18.5204, "lng": 73.8567, "country": "India"},
    "Jaipur": {"lat": 26.9124, "lng": 75.7873, "country": "India"},
    "Hyderabad": {"lat": 17.3850, "lng": 78.4867, "country": "India"},
    "Chennai": {"lat": 13.0827, "lng": 80.2707, "country": "India"},
    "Kolkata": {"lat": 22.5726, "lng": 88.3639, "country": "India"},
    "Ahmedabad": {"lat": 23.0225, "lng": 72.5714, "country": "India"},
    "Dubai": {"lat": 25.2048, "lng": 55.2708, "country": "UAE"},
    "London": {"lat": 51.5074, "lng": -0.1278, "country": "UK"},
    "Singapore": {"lat": 1.3521, "lng": 103.8198, "country": "Singapore"},
    "New York": {"lat": 40.7128, "lng": -74.0060, "country": "USA"},
}

# Extend with all Indian state capitals + major cities (map pin fallback)
for _city, (_lat, _lng) in INDIA_CITY_COORDS.items():
    CITY_COORDS.setdefault(_city, {"lat": _lat, "lng": _lng, "country": "India"})


def resolve_coords(city, state=None, lat=None, lng=None):
    """[lat, lng] for a record: explicit coords win, else the city's own centre point.
    v3.0: no more state-capital guess — an unknown city gets no pin instead of a wrong one (Erode used to land on Chennai)."""
    if lat is not None and lng is not None and -90 <= lat <= 90 and -180 <= lng <= 180:
        return lat, lng
    c = CITY_COORDS.get(city)
    return (c["lat"], c["lng"]) if c else (None, None)


def _near(a, b, tol=0.0006):
    return a is not None and b is not None and abs(float(a) - float(b)) <= tol


def city_centre(city):
    c = CITY_COORDS.get(city)
    return (c["lat"], c["lng"]) if c else (None, None)


def pin_source_of(b: dict):
    """'exact' (GPS / map link / dragged / typed), 'city' (city centre — approximate) or None (no pin)."""
    if b.get("lat") is None or b.get("lng") is None:
        return None
    if b.get("pin_source") in ("exact", "city"):
        return b["pin_source"]
    clat, clng = city_centre(b.get("city"))
    return "city" if (_near(b["lat"], clat) and _near(b["lng"], clng)) else "exact"


def _capital_guess(b: dict):
    """True when the stored pin is the old state-capital fallback for a city that isn't the capital."""
    st = INDIA_STATES.get(b.get("state") or "")
    if not st or b.get("city") == st[0]:
        return False
    cap = CITY_COORDS.get(st[0])
    return bool(cap) and _near(b.get("lat"), cap["lat"], 0.002) and _near(b.get("lng"), cap["lng"], 0.002)


async def repair_coordinates():
    """Idempotent: normalise lat/lng on branches.
    Fixes swapped pairs, replaces pins that are far from their dataset city, and (v3.0) replaces the old
    state-capital guesses — e.g. an Erode branch saved with Chennai's pin — with the city's own centre."""
    async for b in db.branches.find({}, {"_id": 0, "id": 1, "city": 1, "state": 1, "lat": 1, "lng": 1, "pin_source": 1}):
        lat, lng = b.get("lat"), b.get("lng")
        src = b.get("pin_source")
        swapped = lat is not None and lng is not None and (abs(lat) > 90 or (abs(lng) <= 90 and abs(lat) > abs(lng) and abs(lat) > 60))
        if swapped:
            lat, lng = lng, lat
        if src != "exact" and lat is not None and _capital_guess({**b, "lat": lat, "lng": lng}):
            lat, lng, src = None, None, None
        ds = CITY_COORDS.get(b.get("city"))
        # If the stored pin is >3° away from its dataset city, trust the dataset
        if ds and lat is not None and lng is not None and (abs(lat - ds["lat"]) > 3 or abs(lng - ds["lng"]) > 3):
            lat, lng, src = None, None, None
        nlat, nlng = resolve_coords(b.get("city"), b.get("state"), lat, lng)
        nsrc = pin_source_of({"city": b.get("city"), "lat": nlat, "lng": nlng, "pin_source": src})
        if nlat != b.get("lat") or nlng != b.get("lng") or nsrc != b.get("pin_source"):
            await db.branches.update_one({"id": b["id"]}, {"$set": {"lat": nlat, "lng": nlng, "pin_source": nsrc}})


def _parse_pin_text(text: str):
    """Coordinates from a Google Maps / OpenStreetMap / Apple Maps link, or plain 'lat, lng'."""
    import re
    from urllib.parse import unquote
    t = unquote((text or "").strip())
    pats = [r"!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)",            # Google place data (most exact)
            r"@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)",             # Google @lat,lng,zoom
            r"[?&](?:q|query|ll|destination|daddr|center|sll)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)",
            r"[#&]map=\d+/(-?\d+(?:\.\d+)?)/(-?\d+(?:\.\d+)?)",       # openstreetmap.org/#map=z/lat/lng
            r"mlat=(-?\d+(?:\.\d+)?)&mlon=(-?\d+(?:\.\d+)?)",
            r"^\s*(-?\d{1,2}(?:\.\d+)?)\s*[,\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*$"]  # plain "11.34, 77.71"
    for p in pats:
        m = re.search(p, t)
        if m:
            lat, lng = float(m.group(1)), float(m.group(2))
            if -90 <= lat <= 90 and -180 <= lng <= 180 and not (lat == 0 and lng == 0):
                return round(lat, 6), round(lng, 6)
    return None


class PinText(BaseModel):
    text: str


def _google_host(url: str) -> bool:
    from urllib.parse import urlparse
    try:
        u = urlparse(url)
    except Exception:
        return False
    h = (u.hostname or "").lower()
    return u.scheme in ("https", "http") and (h in ("maps.app.goo.gl", "goo.gl", "g.co") or h == "google.com" or h.endswith(".google.com")
                                               or re.fullmatch(r"(www\.|maps\.)?google\.[a-z.]{2,6}", h) is not None)


@router.post("/locations/parse-pin")
async def parse_pin(body: PinText, user: dict = Depends(get_current_user)):
    """Turn a pasted Google Maps link (full or maps.app.goo.gl short link) or 'lat, lng' into coordinates."""
    got = _parse_pin_text(body.text)
    url = next((w for w in (body.text or "").split() if w.startswith(("https://", "http://"))), None)
    if not got and url and _google_host(url):
        try:
            import httpx
            async with httpx.AsyncClient(follow_redirects=False, timeout=6) as cx:
                for _ in range(6):  # follow redirects by hand so we only ever fetch Google addresses
                    r = await cx.get(url, headers={"User-Agent": "Mozilla/5.0"})
                    got = _parse_pin_text(str(r.url))
                    if got or r.status_code not in (301, 302, 303, 307, 308):
                        break
                    url = str(r.url.join(r.headers.get("location", "")))
                    if not _google_host(url):
                        break
                if not got and r.status_code == 200 and _google_host(str(r.url)):
                    got = _parse_pin_text(r.text[:200000])
        except Exception:
            got = None
    if not got:
        raise HTTPException(status_code=400, detail="Couldn't find coordinates in that. In Google Maps, long-press the office, "
                                                    "copy the numbers shown (like 11.3410, 77.7172) or the full link, and paste them here.")
    return {"lat": got[0], "lng": got[1]}


@router.get("/locations/geo")
async def geo_data(user: dict = Depends(get_current_user)):
    """Static geo dataset for dropdowns: countries + Indian states with cities + coords (incl. state-capital fallbacks)."""
    coords = {k: {"lat": v["lat"], "lng": v["lng"]} for k, v in CITY_COORDS.items()}
    return {"countries": COUNTRIES, "india_states": INDIA_STATES, "city_coords": coords}


@router.get("/locations/cities")
async def cities(user: dict = Depends(get_current_user)):
    return [{"city": k, **v} for k, v in CITY_COORDS.items()]


@router.get("/locations/branch-options")
async def branch_options(user: dict = Depends(get_current_user)):
    """Branches the current user may see (server-side scoped) — for dropdowns everywhere."""
    q = {}
    scope = branch_scope(user)
    if scope is not None:
        q["id"] = {"$in": scope}
    rows = await db.branches.find(q, {"_id": 0, "id": 1, "name": 1, "city": 1, "state": 1, "country": 1}).sort("name", 1).to_list(100)
    return rows


@router.get("/locations/branches")
async def branches(user: dict = Depends(get_current_user)):
    rows = await db.branches.find({}, {"_id": 0}).sort("name", 1).to_list(100)
    mids = [b["manager_id"] for b in rows if b.get("manager_id")]
    users = await db.users.find({"id": {"$in": mids}}, {"_id": 0, "id": 1, "name": 1}).to_list(50)
    umap = {u["id"]: u["name"] for u in users}
    for b in rows:
        b["manager_name"] = umap.get(b.get("manager_id")) or b.get("head_name", "")
        b.setdefault("status", "active")
        b["lat"], b["lng"] = resolve_coords(b.get("city"), b.get("state"), b.get("lat"), b.get("lng"))
        b["pin_source"] = pin_source_of(b)
    return rows


@router.post("/locations/branches")
async def create_branch(body: BranchIn, user: dict = Depends(require_roles("admin"))):
    doc = {"id": str(uuid.uuid4()), **body.dict(), "established": datetime.now(timezone.utc).date().isoformat(),
           "created_at": datetime.now(timezone.utc).isoformat()}
    doc["lat"], doc["lng"] = resolve_coords(doc.get("city"), doc.get("state"), doc.get("lat"), doc.get("lng"))
    doc["pin_source"] = pin_source_of({**doc, "pin_source": doc.get("pin_source") if doc.get("pin_source") in ("exact", "city") else None})
    await db.branches.insert_one(dict(doc))
    await log_activity(user, "branch_created", "branch", doc["id"], doc["name"])
    doc.pop("_id", None)
    return doc


@router.put("/locations/branches/{branch_id}")
async def update_branch(branch_id: str, body: BranchUpdate, user: dict = Depends(require_roles("admin"))):
    b = await db.branches.find_one({"id": branch_id})
    if not b:
        raise HTTPException(status_code=404, detail="Branch not found")
    updates = {k: v for k, v in body.dict().items() if v is not None}
    if updates.get("status") and updates["status"] not in ("active", "inactive"):
        raise HTTPException(status_code=400, detail="Invalid status")
    merged = {**b, **updates}
    city_changed = "city" in updates and updates["city"] != b.get("city")
    if city_changed and "lat" not in updates:
        merged["lat"], merged["lng"], merged["pin_source"] = None, None, None  # new city → start from its centre
    merged["lat"], merged["lng"] = resolve_coords(merged.get("city"), merged.get("state"), merged.get("lat"), merged.get("lng"))
    src = updates.get("pin_source") if updates.get("pin_source") in ("exact", "city") else (None if ("lat" in updates or city_changed) else b.get("pin_source"))
    merged["pin_source"] = pin_source_of({**merged, "pin_source": src})
    updates.update({"lat": merged["lat"], "lng": merged["lng"], "pin_source": merged["pin_source"]})
    await db.branches.update_one({"id": branch_id}, {"$set": updates})
    action = "branch_deactivated" if updates.get("status") == "inactive" else "branch_updated"
    await log_activity(user, action, "branch", branch_id, b["name"])
    return await db.branches.find_one({"id": branch_id}, {"_id": 0})


@router.delete("/locations/branches/{branch_id}")
async def delete_branch(branch_id: str, user: dict = Depends(require_roles("admin"))):
    b = await db.branches.find_one({"id": branch_id})
    if not b:
        raise HTTPException(status_code=404, detail="Branch not found")
    linked_clients = await db.clients.count_documents({"branch_id": branch_id})
    linked_users = await db.users.count_documents({"branch_id": branch_id, "is_active": True})
    if linked_clients or linked_users:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete: {linked_clients} client(s) and {linked_users} user(s) are linked to this branch. Deactivate it instead.")
    await db.branches.delete_one({"id": branch_id})
    await log_activity(user, "branch_deleted", "branch", branch_id, b["name"])
    return {"ok": True}


@router.get("/locations/compare")
async def compare_branches(user: dict = Depends(get_current_user)):
    """Branch roll-up: revenue, clients, projects, pipeline, headcount, assets per branch."""
    branches = await db.branches.find({}, {"_id": 0}).sort("name", 1).to_list(50)
    clients = await db.clients.find({}, {"_id": 0, "id": 1, "branch_id": 1, "status": 1}).to_list(2000)
    cb = {c["id"]: c.get("branch_id") for c in clients}
    projects = await db.projects.find({}, {"_id": 0, "id": 1, "client_id": 1, "status": 1, "budget": 1}).to_list(2000)
    tx = await db.transactions.find({"type": "income", "client_id": {"$nin": [None, ""]}},
                                    {"_id": 0, "client_id": 1, "amount": 1}).to_list(20000)
    leads = await db.leads.find({}, {"_id": 0, "branch_id": 1, "stage": 1, "estimated_value": 1}).to_list(2000)
    users = await db.users.find({"is_active": True}, {"_id": 0, "branch_id": 1}).to_list(500)
    assets = await db.assets.find({}, {"_id": 0, "branch_id": 1, "purchase_value": 1}).to_list(2000)

    rows = []
    for b in branches:
        bid = b["id"]
        b_clients = [c for c in clients if c.get("branch_id") == bid]
        b_client_ids = {c["id"] for c in b_clients}
        b_projects = [p for p in projects if p["client_id"] in b_client_ids]
        rows.append({
            "id": bid, "name": b["name"], "city": b.get("city"), "country": b.get("country"),
            "status": b.get("status", "active"),
            "revenue": round(sum(x["amount"] for x in tx if cb.get(x["client_id"]) == bid), 2),
            "clients_total": len(b_clients),
            "clients_active": sum(1 for c in b_clients if c.get("status") == "active"),
            "projects_active": sum(1 for p in b_projects if p["status"] in ("kickoff", "in_progress", "review")),
            "projects_total": len(b_projects),
            "pipeline_value": round(sum(l.get("estimated_value", 0) for l in leads
                                        if l.get("branch_id") == bid and l.get("stage") not in ("won", "lost")), 2),
            "headcount": sum(1 for u in users if u.get("branch_id") == bid),
            "assets": sum(1 for a in assets if a.get("branch_id") == bid),
            "asset_value": round(sum(a.get("purchase_value", 0) for a in assets if a.get("branch_id") == bid), 2),
        })
    return rows


@router.get("/locations/map")
async def map_data(branch: Optional[str] = None, user: dict = Depends(get_current_user)):
    scope = branch_scope(user)
    bq = {}
    if scope is not None:
        bq["id"] = {"$in": scope}
    if branch and (scope is None or branch in scope):
        bq["id"] = branch
    branch_rows = await db.branches.find(bq, {"_id": 0}).to_list(100)
    allowed_branch_ids = [b["id"] for b in branch_rows]
    restricted = scope is not None or bool(branch)
    cq = {"branch_id": {"$in": allowed_branch_ids}} if restricted else {}
    clients = await db.clients.find(cq, {"_id": 0, "id": 1, "name": 1, "city": 1, "state": 1, "status": 1, "industry": 1}).to_list(1000)
    eq = {"is_active": True, "city": {"$exists": True, "$ne": ""}}
    if restricted:
        eq["$or"] = [{"branch_id": {"$in": allowed_branch_ids}}, {"branch_assignments.branch_id": {"$in": allowed_branch_ids}}]
    employees = await db.users.find(eq, {"_id": 0, "id": 1, "name": 1, "city": 1, "role": 1, "designation": 1}).to_list(500)

    city_map = {}

    def bucket(city_name, state_name=None):
        """Clients and team are placed at their city's centre (we don't store street addresses for them)."""
        rlat, rlng = city_centre(city_name)
        if rlat is None or not city_name:
            return None
        if city_name not in city_map:
            country = (CITY_COORDS.get(city_name) or {}).get("country") or ("India" if state_name in INDIA_STATES else "")
            city_map[city_name] = {
                "city": city_name, "lat": rlat, "lng": rlng,
                "country": country, "clients": [], "branches": [], "employees": [],
            }
        return city_map[city_name]

    unplaced = {"clients": 0, "employees": 0}
    for c in clients:
        b = bucket(c.get("city"), c.get("state"))
        if b:
            b["clients"].append({"id": c["id"], "name": c["name"], "status": c.get("status"), "industry": c.get("industry")})
        else:
            unplaced["clients"] += 1
    branch_pins = []
    for br in branch_rows:
        lat, lng = resolve_coords(br.get("city"), br.get("state"), br.get("lat"), br.get("lng"))
        src = pin_source_of({**br, "lat": lat, "lng": lng})
        item = {"id": br["id"], "name": br["name"], "city": br.get("city", ""), "address": br.get("address", ""),
                "head_name": br.get("head_name", ""), "status": br.get("status", "active"), "lat": lat, "lng": lng, "pin_source": src}
        branch_pins.append(item)
        b = bucket(br.get("city"), br.get("state"))
        if b:
            b["branches"].append(item)
    for e in employees:
        b = bucket(e.get("city"))
        if b:
            b["employees"].append({"id": e["id"], "name": e["name"], "role": e.get("role"), "designation": e.get("designation", "")})
        else:
            unplaced["employees"] += 1

    cities_out = sorted(city_map.values(), key=lambda x: x["city"])
    return {
        "cities": cities_out,
        "branches": branch_pins,
        "unplaced": unplaced,
        "totals": {
            "clients": sum(len(c["clients"]) for c in cities_out),
            "branches": len(branch_pins),
            "employees": sum(len(c["employees"]) for c in cities_out),
            "cities": len(cities_out),
        },
    }
