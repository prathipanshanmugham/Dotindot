from fastapi import APIRouter, Depends
from database import db
from auth import require_roles

router = APIRouter()

READ_ROLES = ("admin", "finance", "sales", "pm")

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


@router.get("/locations/cities")
async def cities(user: dict = Depends(require_roles(*READ_ROLES))):
    return [{"city": k, **v} for k, v in CITY_COORDS.items()]


@router.get("/locations/branches")
async def branches(user: dict = Depends(require_roles(*READ_ROLES))):
    return await db.branches.find({}, {"_id": 0}).sort("name", 1).to_list(100)


@router.get("/locations/map")
async def map_data(user: dict = Depends(require_roles(*READ_ROLES))):
    clients = await db.clients.find({}, {"_id": 0, "id": 1, "name": 1, "city": 1, "status": 1, "industry": 1}).to_list(1000)
    branch_rows = await db.branches.find({}, {"_id": 0}).to_list(100)
    employees = await db.users.find(
        {"is_active": True, "city": {"$exists": True, "$ne": ""}},
        {"_id": 0, "id": 1, "name": 1, "city": 1, "role": 1, "designation": 1},
    ).to_list(500)

    city_map = {}

    def bucket(city_name):
        coords = CITY_COORDS.get(city_name)
        if not coords:
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
        b = bucket(br.get("city"))
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
