"""v3.8 — Locations page data: India on the map, everything abroad by country, money only for people who can see it.
Self-contained: makes its own locations, people and clients (names tagged) and removes them."""
import os
import uuid

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://127.0.0.1:8001").rstrip("/")
API = f"{BASE_URL}/api"
PASSWORD = "Dotindot@2026"
TAG = uuid.uuid4().hex[:6]


def _login(email, password=PASSWORD):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def sa():
    return _login("admin@dotindot.in")


@pytest.fixture(scope="module")
def world(sa):
    made = {"branches": [], "clients": [], "users": []}
    india = requests.post(f"{API}/locations/branches", headers=sa, json={"name": f"T38 Erode {TAG}", "city": "Erode", "state": "Tamil Nadu", "country": "India"}).json()
    dubai = requests.post(f"{API}/locations/branches", headers=sa, json={"name": f"T38 Dubai {TAG}", "city": "Dubai", "country": "UAE"}).json()
    made["branches"] += [india["id"], dubai["id"]]
    for name, body in ((f"T38 Local {TAG}", {"city": "Erode", "state": "", "region": "South", "branch_id": india["id"]}),     # "South" is a region, not a country
                       (f"T38 Gulf {TAG}", {"city": "Dubai", "region": "UAE", "branch_id": dubai["id"]})):
        made["clients"].append(requests.post(f"{API}/clients", headers=sa, json={"name": name, **body}).json())
    email = f"t38-ceo-{TAG}@dotindot.in"
    u = requests.post(f"{API}/users", headers=sa, json={"name": f"T38 Ceo {TAG}", "email": email, "password": PASSWORD, "role": "pm"}).json()
    made["users"].append(u["id"])
    requests.put(f"{API}/locations/branches/{india['id']}", headers=sa, json={"manager_id": u["id"]})
    made.update({"india": india, "dubai": dubai, "ceo": _login(email)})
    yield made
    for b in made["branches"]:
        requests.put(f"{API}/locations/branches/{b}", headers=sa, json={"manager_id": ""})
    for c in made["clients"]:
        requests.delete(f"{API}/clients/{c['id']}", headers=sa)
    for u in made["users"]:
        requests.delete(f"{API}/records/users/{u}", headers=sa, params={"permanent": True})
    for b in made["branches"]:
        requests.delete(f"{API}/workspace/branches/{b}", headers=sa, params={"cascade": True, "permanent": True})


def test_india_on_the_map_abroad_by_country(sa, world):
    d = requests.get(f"{API}/locations/insights", headers=sa).json()
    pins = {p["id"] for p in d["india"]["pins"]}
    assert world["india"]["id"] in pins and world["dubai"]["id"] not in pins          # no map pins abroad
    uae = next(c for c in d["abroad"] if c["country"] == "UAE")
    assert world["dubai"]["id"] in [b["id"] for b in uae["locations"]]
    assert f"T38 Gulf {TAG}" in [c["name"] for c in uae["clients"]]
    assert "South" not in [c["country"] for c in d["abroad"]]                           # a region isn't a country
    erode = next(c for c in d["india"]["cities"] if c["city"] == "Erode")
    assert f"T38 Local {TAG}" in [c["name"] for c in erode["clients"]] and erode["state"] == "Tamil Nadu"   # state worked out from the city
    row = {l["id"]: l for l in d["locations"]}
    assert row[world["dubai"]["id"]]["country"] == "UAE" and row[world["india"]["id"]]["clients"] == 1
    assert d["money"] is True and len(row[world["india"]["id"]]["trend"]) == 6 and len(d["months"]) == 6
    assert sum(1 for l in d["locations"] if l["country"] != "India") == d["kpis"]["locations_abroad"]


def test_location_ceo_sees_only_their_location(world):
    d = requests.get(f"{API}/locations/insights", headers=world["ceo"]).json()
    assert [l["id"] for l in d["locations"]] == [world["india"]["id"]]
    assert requests.get(f"{API}/locations/insights", headers=world["ceo"], params={"branch": world["dubai"]["id"]}).status_code == 403


def test_money_only_for_people_who_can_see_it(sa, world):
    seen = None
    for who in ("sales@dotindot.in", "employee@dotindot.in"):
        emp = _login(who)
        r = requests.get(f"{API}/locations/insights", headers=emp)
        if r.status_code == 200 and r.json()["money"] is False:
            seen = r.json()
            break
    assert seen is not None, "expected a role that can open Locations but not see money"
    d = seen
    assert d["money"] is False and "mrr" not in d["kpis"] and all("trend" not in l for l in d["locations"])
    rows = requests.get(f"{API}/locations/compare", headers=emp).json()
    assert all(x["revenue"] is None and x["pipeline_value"] is None for x in rows)


def test_one_location_filter(sa, world):
    d = requests.get(f"{API}/locations/insights", headers=sa, params={"branch": world["dubai"]["id"]}).json()
    assert [l["id"] for l in d["locations"]] == [world["dubai"]["id"]] and d["india"]["pins"] == []
