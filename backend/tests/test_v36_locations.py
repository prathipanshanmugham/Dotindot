"""v3.6 — every project, client and lead has a Dotindot location; location targets; location scores; pick-lists.
Self-contained: makes its own locations, people, clients, projects and leads (names tagged) and removes them."""
import os
import uuid
from datetime import date, timedelta

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://127.0.0.1:8001").rstrip("/")
API = f"{BASE_URL}/api"
PASSWORD = "Dotindot@2026"
TAG = uuid.uuid4().hex[:6]
MONTH = date.today().strftime("%Y-%m")


def _login(email, password=PASSWORD):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def sa():
    return _login("admin@dotindot.in")


@pytest.fixture(scope="module")
def world(sa):
    """Two locations, a manager of the first, a client in each, projects and leads."""
    made = {"branches": [], "users": [], "clients": [], "targets": []}
    for n in ("A", "B"):
        r = requests.post(f"{API}/locations/branches", headers=sa, json={"name": f"T36 {n} {TAG}", "city": "Erode", "state": "Tamil Nadu", "country": "India"})
        assert r.status_code == 200, r.text
        made["branches"].append(r.json())
    a, b = made["branches"]
    email = f"t36-mgr-{TAG}@dotindot.in"
    r = requests.post(f"{API}/users", headers=sa, json={"name": f"T36 Manager {TAG}", "email": email, "password": PASSWORD, "role": "pm"})
    assert r.status_code in (200, 201), r.text
    uid = r.json().get("id") or next(u["id"] for u in requests.get(f"{API}/users", headers=sa).json() if u["email"] == email)
    made["users"].append(uid)
    r = requests.put(f"{API}/access/users/{uid}/branches", headers=sa, json={"assignments": [{"branch_id": a["id"], "branch_role": "manager"}]})
    assert r.status_code == 200, r.text
    for br in (a, b):
        r = requests.post(f"{API}/clients", headers=sa, json={"name": f"T36 Client {br['name']}", "branch_id": br["id"]})
        assert r.status_code == 200, r.text
        made["clients"].append(r.json())
    made["mgr"] = _login(email)
    yield made
    for t in made["targets"]:
        requests.delete(f"{API}/sales/targets/{t}", headers=sa)
    for c in made["clients"]:
        requests.delete(f"{API}/clients/{c['id']}", headers=sa)
    for l in requests.get(f"{API}/sales/leads", headers=sa).json():
        if TAG in l["name"]:
            requests.delete(f"{API}/sales/leads/{l['id']}", headers=sa)
    for u in made["users"]:
        requests.delete(f"{API}/records/users/{u}", headers=sa, params={"permanent": True})
    for br in made["branches"]:
        requests.delete(f"{API}/workspace/branches/{br['id']}", headers=sa, params={"cascade": True, "permanent": True})


def _project(sa, client, **kw):
    r = requests.post(f"{API}/projects", headers=sa, json={"kind": "client", "client_id": client["id"], "name": f"T36 P {uuid.uuid4().hex[:4]} {TAG}", "status": "in_progress", **kw})
    assert r.status_code == 200, r.text
    return r.json()


# ---------------------------------------------------------------- projects
def test_client_project_starts_at_the_clients_location(sa, world):
    a = world["branches"][0]
    p = _project(sa, world["clients"][0])
    assert p["branch_id"] == a["id"] and p["branch_name"] == a["name"] and p["location"] == "Erode"
    got = requests.get(f"{API}/projects/{p['id']}", headers=sa).json()
    assert got["branch_id"] == a["id"] and got["branch_name"] == a["name"]


def test_project_can_run_from_another_location(sa, world):
    a, b = world["branches"]
    p = _project(sa, world["clients"][0], branch_id=b["id"])
    assert p["branch_id"] == b["id"]
    rows = requests.get(f"{API}/projects", headers=sa, params={"branch": b["id"]}).json()
    assert p["id"] in [r["id"] for r in rows]
    rows = requests.get(f"{API}/projects", headers=sa, params={"branch": a["id"]}).json()
    assert p["id"] not in [r["id"] for r in rows]
    assert requests.put(f"{API}/projects/{p['id']}", headers=sa, json={"branch_id": a["id"]}).status_code == 200
    assert requests.get(f"{API}/projects/{p['id']}", headers=sa).json()["branch_id"] == a["id"]


def test_unknown_location_is_refused(sa, world):
    r = requests.post(f"{API}/projects", headers=sa, json={"kind": "client", "client_id": world["clients"][0]["id"], "name": f"T36 bad {TAG}", "branch_id": "nope"})
    assert r.status_code == 404
    r = requests.post(f"{API}/clients", headers=sa, json={"name": f"T36 Bad {TAG}", "branch_id": "nope"})
    assert r.status_code == 404


def test_manager_sees_projects_run_from_their_location_only(sa, world):
    a, b = world["branches"]
    mine = _project(sa, world["clients"][1], branch_id=a["id"])       # B's client, run from A
    theirs = _project(sa, world["clients"][1])                         # B's client, run from B
    ids = [r["id"] for r in requests.get(f"{API}/projects", headers=world["mgr"]).json()]
    assert mine["id"] in ids and theirs["id"] not in ids
    assert requests.get(f"{API}/projects/{theirs['id']}", headers=world["mgr"]).status_code == 403
    r = requests.put(f"{API}/projects/{mine['id']}", headers=world["mgr"], json={"branch_id": b["id"]})
    assert r.status_code == 403   # can't hand a project to a location outside their access


def test_moving_a_client_moves_the_projects_that_followed_it(sa, world):
    a, b = world["branches"]
    r = requests.post(f"{API}/clients", headers=sa, json={"name": f"T36 Mover {TAG}", "branch_id": a["id"]})
    c = r.json()
    world["clients"].append(c)
    follow = _project(sa, c)
    stay = _project(sa, c, branch_id=b["id"])
    assert requests.put(f"{API}/clients/{c['id']}", headers=sa, json={"branch_id": b["id"]}).status_code == 200
    assert requests.get(f"{API}/projects/{follow['id']}", headers=sa).json()["branch_id"] == b["id"]
    assert requests.put(f"{API}/clients/{c['id']}", headers=sa, json={"branch_id": a["id"]}).status_code == 200
    assert requests.get(f"{API}/projects/{follow['id']}", headers=sa).json()["branch_id"] == a["id"]
    assert requests.get(f"{API}/projects/{stay['id']}", headers=sa).json()["branch_id"] == a["id"]   # it had followed to B, so it comes back too
    assert requests.get(f"{API}/clients/{c['id']}", headers=sa).json()["branch_name"] == a["name"]


# ---------------------------------------------------------------- leads
def test_lead_location_defaults_and_converts(sa, world):
    a, b = world["branches"]
    r = requests.post(f"{API}/sales/leads", headers=sa, json={"name": f"T36 Lead {TAG}", "company": f"T36 Lead Co {TAG}", "branch_id": b["id"], "estimated_value": 50000})
    assert r.status_code == 200, r.text
    lead = r.json()
    assert lead["branch_id"] == b["id"]
    assert requests.get(f"{API}/sales/leads/{lead['id']}", headers=sa).json()["branch_name"] == b["name"]
    assert requests.put(f"{API}/sales/leads/{lead['id']}", headers=sa, json={"branch_id": "nope"}).status_code == 404
    for st in ("contacted", "won"):
        requests.post(f"{API}/sales/leads/{lead['id']}/stage", headers=sa, json={"stage": st})
    r = requests.post(f"{API}/sales/leads/{lead['id']}/convert", headers=sa, json={"mode": "new_client"})
    assert r.status_code == 200, r.text
    cid = r.json().get("client_id")
    c = requests.get(f"{API}/clients/{cid}", headers=sa).json()
    world["clients"].append(c)
    assert c["branch_id"] == b["id"]


def test_manager_lead_lands_in_their_location(world):
    a = world["branches"][0]
    r = requests.post(f"{API}/sales/leads", headers=world["mgr"], json={"name": f"T36 Mgr lead {TAG}"})
    if r.status_code == 403:
        pytest.skip("pm can't create leads in this setup")
    assert r.status_code == 200 and r.json()["branch_id"] == a["id"], r.text


# ---------------------------------------------------------------- targets + scores
@pytest.mark.parametrize("body,code", [
    ({"scope": "branch", "period": MONTH, "amount": 1000}, 400),
    ({"scope": "branch", "branch_id": "nope", "period": MONTH, "amount": 1000}, 404),
    ({"scope": "team", "period": "soon", "amount": 1000}, 400),
    ({"scope": "team", "period": MONTH, "amount": 0}, 400),
    ({"scope": "region", "period": MONTH, "amount": 10}, 400),
])
def test_target_validation(sa, body, code):
    assert requests.post(f"{API}/sales/targets", headers=sa, json=body).status_code == code


def test_scores(sa, world):
    a, b = world["branches"]
    r = requests.post(f"{API}/sales/targets", headers=sa, json={"scope": "branch", "branch_id": b["id"], "period": MONTH, "amount": 100000})
    assert r.status_code == 200, r.text
    world["targets"].append(r.json()["id"])
    t = next(x for x in requests.get(f"{API}/sales/targets", headers=sa, params={"period": MONTH}).json() if x["id"] == r.json()["id"])
    assert t["user_name"] == b["name"] and t["actual"] >= 50000     # the converted lead above was won in B this month
    late = (date.today() - timedelta(days=3)).isoformat()
    _project(sa, world["clients"][0], end_date=late)     # A: one late project
    d = requests.get(f"{API}/dashboard/location-scores", headers=sa).json()
    rows = {l["id"]: l for l in d["locations"]}
    sa_b = {p["key"]: p for p in rows[b["id"]]["parts"]}
    assert sa_b["sales"]["target"] == 100000 and sa_b["sales"]["score"] == 50
    sa_a = {p["key"]: p for p in rows[a["id"]]["parts"]}
    assert sa_a["sales"]["missing"] == "no_target" and sa_a["sales"]["score"] is None
    assert sa_a["delivery"]["late"] >= 1 and sa_a["delivery"]["score"] < 100
    for l in (rows[a["id"]], rows[b["id"]]):
        scored = [p for p in l["parts"] if p["score"] is not None]
        w = sum(p["weight"] for p in scored)
        assert l["scored_weight"] == w
        assert l["score"] == round(sum(p["score"] * p["weight"] for p in scored) / w)
        assert 0 <= l["score"] <= 100
    assert set(d["weights"]) == {"sales", "collections", "delivery", "clients", "attendance"} and sum(d["weights"].values()) == 100


def test_manager_sees_only_their_locations_score(world):
    a = world["branches"][0]
    d = requests.get(f"{API}/dashboard/location-scores", headers=world["mgr"])
    assert d.status_code == 200, d.text
    assert [l["id"] for l in d.json()["locations"]] == [a["id"]]
    assert d.json()["unassigned"] is None


def test_scores_need_ceo_or_manager():
    emp = _login("employee@dotindot.in")
    assert requests.get(f"{API}/dashboard/location-scores", headers=emp).status_code == 403


# ---------------------------------------------------------------- pick-lists, exports
def test_lookups(sa):
    d = requests.get(f"{API}/lookups", headers=sa).json()
    for k in ("departments", "designations", "contact_roles", "course_categories", "partnership_categories", "education", "subscription_owners"):
        assert isinstance(d[k], list)
    assert "Marketing" in d["departments"] and len(d["departments"]) == len({x.lower() for x in d["departments"]})


def test_exports_carry_location(sa, world):
    for ds in ("projects", "clients", "leads"):
        r = requests.get(f"{API}/exports/{ds}", headers=sa, params={"format": "xlsx", "branch": world["branches"][0]["id"]})
        assert r.status_code == 200 and r.content[:2] == b"PK", (ds, r.text[:200])


def test_revenue_by_project_location(sa, world):
    a, b = world["branches"]
    p = _project(sa, world["clients"][0], branch_id=b["id"], billing_type="recurring", recurring_amount=12000, billing_cycle="monthly",
                 start_date=date.today().replace(day=1).isoformat())
    s = requests.get(f"{API}/revenue/summary", headers=sa, params={"branch": b["id"]}).json()
    assert any(c["client_id"] == world["clients"][0]["id"] for c in s["by_client"])     # A's client, billed from B
    assert any(x["branch_id"] == b["id"] and x["mrr"] >= 12000 for x in s["by_branch"])
    requests.delete(f"{API}/projects/{p['id']}", headers=sa)
