"""v3.8 Locations page data — one call for the whole page: India (map, states, cities), outside India (by country) and a
side-by-side of every location (clients, team, projects, pipeline, money, six-month trends, score).

The map is India only: anything abroad is grouped by country instead of pinned. Money (revenue, MRR, pipeline value,
asset value) is only sent to people who can see money (CEO report or finance); everyone else gets counts.
Scope follows the CEO report: a location CEO sees their locations, someone limited to some locations sees those.
"""
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from auth import get_current_user
from database import db
from india_locations import INDIA_STATES
from locations_util import project_location, tx_location
from permissions import ceo_scope, has_permission
from revenue import ACTIVE_STATUSES, ist_today, mrr_in_month, months_back, ym

router = APIRouter()

INDIA = "India"
COUNTRY_ALIASES = {"in": INDIA, "ind": INDIA, "bharat": INDIA, "uae": "UAE", "united arab emirates": "UAE", "uk": "UK", "united kingdom": "UK",
                   "england": "UK", "usa": "USA", "us": "USA", "united states": "USA", "america": "USA", "sg": "Singapore"}
PROJECT_STATUSES = ["kickoff", "in_progress", "review", "on_hold", "completed"]


def can_see_money(user: dict) -> bool:
    return any(has_permission(user, k) for k in ("ceo_dashboard", "finance.revenue", "finance.ledger"))


CITY_STATE = {city: st for st, cities in INDIA_STATES.items() for city in cities}


def country_of(country: Optional[str], state: Optional[str], city: Optional[str]) -> Optional[str]:
    """India / another country / None (not known). Only a real country name counts (older records keep a region like
    "South" in the same field)."""
    from routes_locations import CITY_COORDS
    from india_locations import COUNTRIES
    c = (country or "").strip()
    c = COUNTRY_ALIASES.get(c.lower(), c)
    if c in COUNTRIES:
        return c
    if state and state in INDIA_STATES:
        return INDIA
    known = CITY_COORDS.get(city or "")
    if known:
        return known.get("country") or INDIA
    return INDIA if city else None


def state_of(state: Optional[str], city: Optional[str]) -> str:
    return state if state in INDIA_STATES else CITY_STATE.get(city or "", "")


@router.get("/locations/insights")
async def location_insights(branch: Optional[str] = Query(None), user: dict = Depends(get_current_user)):
    from routes_locations import city_centre, resolve_coords, pin_source_of
    scope = ceo_scope(user)
    if branch and branch != "all" and scope is not None and branch not in scope:
        raise HTTPException(status_code=403, detail="That location isn't one of yours")
    allowed = [branch] if branch and branch != "all" else scope          # None = everything
    money = can_see_money(user)
    today = ist_today()
    months = months_back(6, today)
    mkeys = [ym(y, m) for y, m in months]

    bq = {} if allowed is None else {"id": {"$in": allowed}}
    branches = await db.branches.find(bq, {"_id": 0}).sort("name", 1).to_list(200)
    bids = [b["id"] for b in branches]
    aset = None if allowed is None else set(bids)
    umap = {u["id"]: u["name"] for u in await db.users.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(5000)}

    clients_all = await db.clients.find({}, {"_id": 0, "id": 1, "name": 1, "branch_id": 1, "status": 1, "city": 1, "state": 1, "region": 1,
                                             "industry": 1}).to_list(5000)
    cb = {c["id"]: c.get("branch_id") for c in clients_all}
    clients = clients_all if aset is None else [c for c in clients_all if c.get("branch_id") in aset]
    projects_all = await db.projects.find({}, {"_id": 0, "milestones": 0, "deliverables": 0, "description": 0}).to_list(20000)
    ploc = {p["id"]: project_location(p, cb) for p in projects_all}
    projects = projects_all if aset is None else [p for p in projects_all if ploc.get(p["id"]) in aset]
    people = await db.users.find({"is_active": True, "deleted": {"$ne": True}, "role": {"$nin": ["client", "investor"]}},
                                 {"_id": 0, "id": 1, "name": 1, "designation": 1, "city": 1, "state": 1, "country": 1, "branch_id": 1,
                                  "branch_assignments": 1}).to_list(5000)
    from routes_daily import _home_branch
    for u in people:
        u["_home"] = _home_branch(u)
    if aset is not None:
        people = [u for u in people if u["_home"] in aset]
    leads = await db.leads.find({} if aset is None else {"branch_id": {"$in": list(aset)}},
                                {"_id": 0, "branch_id": 1, "stage": 1, "estimated_value": 1, "city": 1, "state": 1, "region": 1,
                                 "stage_history": 1, "won_at": 1, "updated_at": 1}).to_list(10000)
    tx = await db.transactions.find({"date": {"$gte": f"{mkeys[0]}-01"}}, {"_id": 0, "type": 1, "amount": 1, "date": 1, "client_id": 1,
                                                                          "project_id": 1, "branch_id": 1}).to_list(50000) if money else []
    assets = await db.assets.find({} if aset is None else {"branch_id": {"$in": list(aset)}}, {"_id": 0, "branch_id": 1, "purchase_value": 1, "status": 1}).to_list(5000)

    # ---------------- per location ----------------
    from routes_sales import won_at
    score_by = {}
    try:
        from routes_scores import location_scores
        for l in (await location_scores(user))["locations"]:
            score_by[l["id"]] = {"score": l["score"], "band": l["band"]}
    except HTTPException:
        pass
    this_month = mkeys[-1]
    rows = []
    for b in branches:
        bid = b["id"]
        bc = [c for c in clients if c.get("branch_id") == bid]
        bp = [p for p in projects if ploc.get(p["id"]) == bid]
        bl = [l for l in leads if l.get("branch_id") == bid]
        team = [u for u in people if u["_home"] == bid]
        status_mix = {s: sum(1 for p in bp if (p.get("status") or "kickoff") == s) for s in PROJECT_STATUSES}
        row = {
            "id": bid, "name": b["name"], "city": b.get("city") or "", "state": b.get("state") or "",
            "country": country_of(b.get("country"), b.get("state"), b.get("city")) or INDIA, "status": b.get("status", "active"),
            "ceo": umap.get(b.get("manager_id")) or b.get("head_name") or "", "ceo_id": b.get("manager_id"),
            "pin": pin_source_of(b), "clients": len(bc), "clients_active": sum(1 for c in bc if c.get("status") == "active"),
            "team": len(team), "projects_active": sum(1 for p in bp if p.get("status") in ACTIVE_STATUSES), "projects_total": len(bp),
            "projects_by_status": status_mix,
            "leads_open": sum(1 for l in bl if l.get("stage") not in ("won", "lost")),
            "won_this_month": sum(1 for l in bl if l.get("stage") == "won" and (won_at(l) or "")[:7] == this_month),
            "assets": sum(1 for a in assets if a.get("branch_id") == bid),
            **score_by.get(bid, {"score": None, "band": None}),
        }
        if money:
            btx = [x for x in tx if tx_location(x, ploc, cb) == bid]
            trend = []
            for (y, m), key in zip(months, mkeys):
                inc = sum(float(x.get("amount") or 0) for x in btx if x.get("type") == "income" and str(x.get("date", ""))[:7] == key)
                exp = sum(float(x.get("amount") or 0) for x in btx if x.get("type") == "expense" and str(x.get("date", ""))[:7] == key)
                mrr = sum(mrr_in_month(p, y, m, today) for p in bp if p.get("kind") != "internal")
                trend.append({"month": key, "income": round(inc, 2), "expense": round(exp, 2), "mrr": round(mrr, 2)})
            row.update({
                "trend": trend, "mrr": trend[-1]["mrr"], "revenue_6m": round(sum(t["income"] for t in trend), 2),
                "expense_6m": round(sum(t["expense"] for t in trend), 2),
                "pipeline_value": round(sum(float(l.get("estimated_value") or 0) for l in bl if l.get("stage") not in ("won", "lost")), 2),
                "one_time_open": round(sum(float(p.get("budget") or 0) for p in bp if p.get("status") in ACTIVE_STATUSES and p.get("billing_type") != "recurring"), 2),
                "asset_value": round(sum(float(a.get("purchase_value") or 0) for a in assets if a.get("branch_id") == bid), 2),
            })
        rows.append(row)

    # ---------------- India: states, cities (map), branch pins ----------------
    states: Dict[str, Dict] = {}
    cities: Dict[str, Dict] = {}
    abroad: Dict[str, Dict] = {}
    unplaced = {"clients": 0, "team": 0}

    def state_row(st):
        return states.setdefault(st, {"state": st, "clients": 0, "team": 0, "locations": 0, "leads": 0})

    def country_row(cn):
        return abroad.setdefault(cn, {"country": cn, "clients": [], "team": 0, "locations": [], "leads": 0, "cities": set()})

    def city_row(city, st):
        lat, lng = city_centre(city)
        if lat is None:
            return None
        return cities.setdefault(city, {"city": city, "state": st or "", "lat": lat, "lng": lng, "clients": [], "team": [], "branches": []})

    for c in clients:
        cn = country_of(c.get("region"), c.get("state"), c.get("city"))
        if cn is None:
            unplaced["clients"] += 1
        elif cn == INDIA:
            st = state_of(c.get("state"), c.get("city"))
            if st:
                state_row(st)["clients"] += 1
            cr = city_row(c.get("city"), st)
            if cr:
                cr["clients"].append({"id": c["id"], "name": c["name"], "industry": c.get("industry") or ""})
            elif not st:
                unplaced["clients"] += 1
        else:
            r = country_row(cn)
            r["clients"].append({"id": c["id"], "name": c["name"], "city": c.get("city") or ""})
            if c.get("city"):
                r["cities"].add(c["city"])
    for u in people:
        cn = country_of(u.get("country"), u.get("state"), u.get("city"))
        if cn is None:
            unplaced["team"] += 1
        elif cn == INDIA:
            st = state_of(u.get("state"), u.get("city"))
            if st:
                state_row(st)["team"] += 1
            cr = city_row(u.get("city"), st)
            if cr:
                cr["team"].append({"id": u["id"], "name": u["name"], "designation": u.get("designation") or ""})
        else:
            country_row(cn)["team"] += 1
    for l in leads:
        if l.get("stage") in ("won", "lost"):
            continue
        cn = country_of(l.get("region"), l.get("state"), l.get("city"))
        if cn == INDIA and state_of(l.get("state"), l.get("city")):
            state_row(state_of(l.get("state"), l.get("city")))["leads"] += 1
        elif cn and cn != INDIA:
            country_row(cn)["leads"] += 1
    pins = []
    for b in branches:
        cn = country_of(b.get("country"), b.get("state"), b.get("city")) or INDIA
        if cn != INDIA:
            country_row(cn)["locations"].append({"id": b["id"], "name": b["name"], "city": b.get("city") or ""})
            continue
        if state_of(b.get("state"), b.get("city")):
            state_row(state_of(b.get("state"), b.get("city")))["locations"] += 1
        lat, lng = resolve_coords(b.get("city"), b.get("state"), b.get("lat"), b.get("lng"))
        item = {"id": b["id"], "name": b["name"], "city": b.get("city") or "", "address": b.get("address") or "", "lat": lat, "lng": lng,
                "pin": pin_source_of({**b, "lat": lat, "lng": lng}), "ceo": umap.get(b.get("manager_id")) or b.get("head_name") or ""}
        if lat is not None:
            pins.append(item)
        cr = city_row(b.get("city"), state_of(b.get("state"), b.get("city")))
        if cr:
            cr["branches"].append(item)

    abroad_out = sorted(({**r, "cities": sorted(r["cities"])} for r in abroad.values()),
                        key=lambda r: (-len(r["clients"]) - r["team"] - len(r["locations"]), r["country"]))
    india_clients = sum(len(c["clients"]) for c in cities.values())
    return {
        "money": money, "months": mkeys,
        "scope": {"all": allowed is None, "locations": [{"id": b["id"], "name": b["name"]} for b in branches]},
        "kpis": {
            "locations": sum(1 for b in branches if b.get("status", "active") == "active"),
            "locations_abroad": sum(1 for r in rows if r["country"] != INDIA),
            "clients": len(clients), "clients_india": sum(1 for c in clients if country_of(c.get("region"), c.get("state"), c.get("city")) == INDIA),
            "clients_abroad": sum(len(r["clients"]) for r in abroad_out), "team": len(people),
            "projects_active": sum(1 for p in projects if p.get("status") in ACTIVE_STATUSES),
            "india_cities": len(cities), "india_states": len([s for s in states.values() if s["clients"] or s["team"] or s["locations"]]),
            "countries_abroad": len(abroad_out),
            **({"mrr": round(sum(r["mrr"] for r in rows), 2), "revenue_6m": round(sum(r["revenue_6m"] for r in rows), 2),
                "pipeline_value": round(sum(r["pipeline_value"] for r in rows), 2)} if money else {}),
        },
        "locations": rows,
        "india": {"states": sorted(states.values(), key=lambda s: (-s["clients"], -s["team"], s["state"])),
                  "cities": sorted(cities.values(), key=lambda c: (-(len(c["clients"]) + len(c["team"]) + len(c["branches"])), c["city"])),
                  "pins": pins, "clients_on_map": india_clients},
        "abroad": abroad_out,
        "unplaced": unplaced,
    }
