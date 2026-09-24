import uuid
from datetime import datetime, timezone
from typing import Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException
from database import db
from auth import get_current_user, require_roles, log_activity
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


@router.get("/locations/geo")
async def geo_data(user: dict = Depends(get_current_user)):
    """Static geo dataset for dropdowns: countries + Indian states with cities."""
    return {"countries": COUNTRIES, "india_states": INDIA_STATES}


@router.get("/locations/cities")
async def cities(user: dict = Depends(get_current_user)):
    return [{"city": k, **v} for k, v in CITY_COORDS.items()]


@router.get("/locations/branches")
async def branches(user: dict = Depends(get_current_user)):
    rows = await db.branches.find({}, {"_id": 0}).sort("name", 1).to_list(100)
    mids = [b["manager_id"] for b in rows if b.get("manager_id")]
    users = await db.users.find({"id": {"$in": mids}}, {"_id": 0, "id": 1, "name": 1}).to_list(50)
    umap = {u["id"]: u["name"] for u in users}
    for b in rows:
        b["manager_name"] = umap.get(b.get("manager_id")) or b.get("head_name", "")
        b.setdefault("status", "active")
    return rows


@router.post("/locations/branches")
async def create_branch(body: BranchIn, user: dict = Depends(require_roles("admin"))):
    doc = {"id": str(uuid.uuid4()), **body.dict(), "established": datetime.now(timezone.utc).date().isoformat(),
           "created_at": datetime.now(timezone.utc).isoformat()}
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
async def map_data(user: dict = Depends(get_current_user)):
    clients = await db.clients.find({}, {"_id": 0, "id": 1, "name": 1, "city": 1, "status": 1, "industry": 1}).to_list(1000)
    branch_rows = await db.branches.find({}, {"_id": 0}).to_list(100)
    employees = await db.users.find(
        {"is_active": True, "city": {"$exists": True, "$ne": ""}},
        {"_id": 0, "id": 1, "name": 1, "city": 1, "role": 1, "designation": 1},
    ).to_list(500)

    city_map = {}

    def bucket(city_name, state_name=None):
        coords = CITY_COORDS.get(city_name)
        if not coords and state_name and INDIA_STATES.get(state_name):
            coords = CITY_COORDS.get(INDIA_STATES[state_name][0])  # state capital fallback
        if not coords or not city_name:
            return None
        if city_name not in city_map:
            city_map[city_name] = {
                "city": city_name, "lat": coords["lat"], "lng": coords["lng"],
                "country": coords["country"], "clients": [], "branches": [], "employees": [],
            }
        return city_map[city_name]

    for c in clients:
        b = bucket(c.get("city"))
        if b:
            b["clients"].append({"id": c["id"], "name": c["name"], "status": c.get("status"), "industry": c.get("industry")})
    for br in branch_rows:
        b = bucket(br.get("city"), br.get("state"))
        if b:
            b["branches"].append({"id": br["id"], "name": br["name"], "address": br.get("address", ""), "head_name": br.get("head_name", "")})
    for e in employees:
        b = bucket(e.get("city"))
        if b:
            b["employees"].append({"id": e["id"], "name": e["name"], "role": e.get("role"), "designation": e.get("designation", "")})

    cities_out = sorted(city_map.values(), key=lambda x: x["city"])
    return {
        "cities": cities_out,
        "totals": {
            "clients": sum(len(c["clients"]) for c in cities_out),
            "branches": sum(len(c["branches"]) for c in cities_out),
            "employees": sum(len(c["employees"]) for c in cities_out),
            "cities": len(cities_out),
        },
    }
