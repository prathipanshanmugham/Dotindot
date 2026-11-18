"""v3.7 — super admins are always active, full user editing, location CEOs and their CEO report.
Self-contained: makes its own people and locations (names tagged) and removes them."""
import os
import uuid
from datetime import date

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
def me(sa):
    return requests.get(f"{API}/auth/me", headers=sa).json()


def _user(sa, role="employee", name=None):
    email = f"t37-{uuid.uuid4().hex[:6]}-{TAG}@dotindot.in"
    r = requests.post(f"{API}/users", headers=sa, json={"name": name or f"T37 {role} {TAG}", "email": email, "password": PASSWORD, "role": role})
    assert r.status_code == 200, r.text
    return {**r.json(), "email": email}


@pytest.fixture(scope="module")
def made(sa):
    out = {"users": [], "branches": []}
    yield out
    for b in out["branches"]:
        requests.put(f"{API}/locations/branches/{b}", headers=sa, json={"manager_id": ""})
        requests.delete(f"{API}/workspace/branches/{b}", headers=sa, params={"cascade": True, "permanent": True})
    for u in out["users"]:
        requests.put(f"{API}/users/{u}", headers=sa, json={"role": "employee"})
        requests.delete(f"{API}/records/users/{u}", headers=sa, params={"permanent": True})


# ---------------------------------------------------------------- always active
def test_super_admin_cannot_be_switched_off(sa, made):
    other = _user(sa, "super_admin")
    made["users"].append(other["id"])
    r = requests.put(f"{API}/users/{other['id']}", headers=sa, json={"is_active": False})
    assert r.status_code == 400 and "always active" in r.text
    r = requests.put(f"{API}/workspace/users/{other['id']}", headers=sa, json={"is_active": False})
    assert r.status_code == 400
    assert requests.get(f"{API}/users", headers=sa).json() and next(u for u in requests.get(f"{API}/users", headers=sa).json() if u["id"] == other["id"])["is_active"] is True
    # demote first, then it can be switched off
    assert requests.put(f"{API}/users/{other['id']}", headers=sa, json={"role": "admin"}).status_code == 200
    assert requests.put(f"{API}/users/{other['id']}", headers=sa, json={"is_active": False}).status_code == 200


def test_cannot_switch_off_or_demote_yourself(sa, me):
    assert requests.put(f"{API}/users/{me['id']}", headers=sa, json={"is_active": False}).status_code == 400
    assert requests.put(f"{API}/users/{me['id']}", headers=sa, json={"role": "admin"}).status_code == 400


# ---------------------------------------------------------------- edit everything
def test_super_admin_edits_every_field(sa, made):
    u = _user(sa)
    made["users"].append(u["id"])
    b = requests.post(f"{API}/locations/branches", headers=sa, json={"name": f"T37 Loc {TAG}", "city": "Erode"}).json()
    made["branches"].append(b["id"])
    new_email = f"t37-renamed-{TAG}@dotindot.in"
    body = {"name": "  T37 Renamed  ", "email": new_email.upper(), "phone": "+91 90000 00000", "designation": "Designer", "department": "Design",
            "join_date": "2025-06-01", "branch_id": b["id"], "country": "India", "state": "Tamil Nadu", "city": "Erode", "bio": "Hi",
            "skills": ["Figma", " ", "Reels"], "role": "pm", "password": "NewPass@2026"}
    r = requests.put(f"{API}/users/{u['id']}", headers=sa, json=body)
    assert r.status_code == 200, r.text
    got = r.json()
    assert got["name"] == "T37 Renamed" and got["email"] == new_email and got["role"] == "pm" and got["branch_id"] == b["id"]
    assert got["skills"] == ["Figma", "Reels"] and got["join_date"] == "2025-06-01" and got["designation"] == "Designer"
    _login(new_email, "NewPass@2026")      # the new email and password work


@pytest.mark.parametrize("body,code", [
    ({"email": "not-an-email"}, 400),
    ({"email": "admin@dotindot.in"}, 400),
    ({"name": "   "}, 400),
    ({"join_date": "soon"}, 400),
    ({"branch_id": "nope"}, 404),
    ({"password": "short"}, 400),
    ({"role": "wizard"}, 400),
])
def test_user_edit_validation(sa, made, body, code):
    u = _user(sa)
    made["users"].append(u["id"])
    assert requests.put(f"{API}/users/{u['id']}", headers=sa, json=body).status_code == code


def test_admin_cannot_edit_admins(sa, made):
    adm = _user(sa, "admin")
    other = _user(sa, "admin")
    made["users"] += [adm["id"], other["id"]]
    ah = _login(adm["email"])
    assert requests.put(f"{API}/users/{other['id']}", headers=ah, json={"phone": "1"}).status_code == 403
    assert requests.put(f"{API}/employees/{other['id']}/profile", headers=ah, json={"phone": "1"}).status_code == 403
    emp = _user(sa)
    made["users"].append(emp["id"])
    assert requests.put(f"{API}/users/{emp['id']}", headers=ah, json={"designation": "Writer"}).status_code == 200


# ---------------------------------------------------------------- location CEOs
@pytest.fixture(scope="module")
def ceo_world(sa, made):
    ceo = _user(sa, "pm", name=f"T37 Ceo {TAG}")
    made["users"].append(ceo["id"])
    locs = []
    for n in ("A", "B"):
        b = requests.post(f"{API}/locations/branches", headers=sa, json={"name": f"T37 {n} {TAG}", "city": "Erode"}).json()
        made["branches"].append(b["id"])
        locs.append(b)
    r = requests.put(f"{API}/locations/branches/{locs[0]['id']}", headers=sa, json={"manager_id": ceo["id"]})
    assert r.status_code == 200 and r.json()["head_name"] == ceo["name"], r.text
    # money and a client in each location
    for b, amt in ((locs[0], 50000), (locs[1], 70000)):
        c = requests.post(f"{API}/clients", headers=sa, json={"name": f"T37 Client {b['name']}", "branch_id": b["id"]}).json()
        requests.post(f"{API}/finance/transactions", headers=sa, json={"type": "income", "date": date.today().isoformat(), "amount": amt, "category": "project_income", "client_id": c["id"]})
    requests.post(f"{API}/finance/transactions", headers=sa, json={"type": "expense", "date": date.today().isoformat(), "amount": 8000, "category": "operational", "branch_id": locs[0]["id"]})
    return {"ceo": ceo, "h": _login(ceo["email"]), "a": locs[0], "b": locs[1]}


def test_location_ceo_lands_on_their_ceo_report(ceo_world):
    h = ceo_world["h"]
    w = requests.get(f"{API}/dashboard/which", headers=h).json()
    assert w["dashboard"] == "ceo" and "ceo" in w["views"]
    assert "ceo_dashboard" in requests.get(f"{API}/me/permissions", headers=h).json()["permissions"]
    d = requests.get(f"{API}/ceo/dashboard", headers=h).json()
    assert [x["id"] for x in d["scope"]["locations"]] == [ceo_world["a"]["id"]]
    assert d["margin"]["income"] == 50000 and d["margin"]["expense"] == 8000      # only location A's money
    assert d["team"]["contribution"] == 42000 - d["team"]["cost"]
    assert requests.get(f"{API}/ceo/dashboard", headers=h, params={"branch": ceo_world["b"]["id"]}).status_code == 403
    ex = requests.get(f"{API}/dashboard/ceo", headers=h).json()
    assert ex["security"] is None and ex["critical_feed"] is None                 # founder-only panels stay hidden
    assert [l["id"] for l in requests.get(f"{API}/locations/compare", headers=h).json()] == [ceo_world["a"]["id"]]
    assert [l["id"] for l in requests.get(f"{API}/dashboard/location-scores", headers=h).json()["locations"]] == [ceo_world["a"]["id"]]


def test_founder_sees_each_location(sa, ceo_world):
    d = requests.get(f"{API}/ceo/dashboard", headers=sa, params={"branch": ceo_world["b"]["id"]}).json()
    assert d["margin"]["income"] == 70000 and d["scope"]["label"] == ceo_world["b"]["name"]
    assert requests.get(f"{API}/ceo/dashboard", headers=sa).json()["scope"]["locations"] is None
    rows = requests.get(f"{API}/finance/transactions", headers=sa, params={"branch": ceo_world["a"]["id"]}).json()["transactions"]
    assert {r["amount"] for r in rows} == {50000, 8000} and all(r["location_name"] == ceo_world["a"]["name"] for r in rows)


def test_ceo_report_pdf(sa, ceo_world):
    r = requests.get(f"{API}/ceo/report.pdf", headers=ceo_world["h"], params={"period": "this_month"})
    assert r.status_code == 200 and r.content[:4] == b"%PDF" and "ceo-report-" in r.headers["content-disposition"]
    assert requests.get(f"{API}/ceo/report.pdf", headers=ceo_world["h"], params={"branch": ceo_world["b"]["id"]}).status_code == 403
    for period in ("quarter", "ytd", "last_6_months"):
        assert requests.get(f"{API}/ceo/report.pdf", headers=sa, params={"period": period}).status_code == 200
    assert requests.get(f"{API}/ceo/dashboard", headers=sa, params={"period": "forever"}).status_code == 400


def test_removing_the_ceo_takes_the_report_away(sa, ceo_world):
    assert requests.put(f"{API}/locations/branches/{ceo_world['a']['id']}", headers=sa, json={"manager_id": ""}).status_code == 200
    h = _login(ceo_world["ceo"]["email"])
    assert requests.get(f"{API}/ceo/dashboard", headers=h).status_code == 403
    assert requests.get(f"{API}/dashboard/which", headers=h).json()["dashboard"] != "ceo"
    requests.put(f"{API}/locations/branches/{ceo_world['a']['id']}", headers=sa, json={"manager_id": ceo_world["ceo"]["id"]})


def test_ceo_must_be_a_real_active_person(sa, ceo_world, made):
    assert requests.put(f"{API}/locations/branches/{ceo_world['b']['id']}", headers=sa, json={"manager_id": "nope"}).status_code == 404
    off = _user(sa)
    made["users"].append(off["id"])
    requests.put(f"{API}/users/{off['id']}", headers=sa, json={"is_active": False})
    assert requests.put(f"{API}/locations/branches/{ceo_world['b']['id']}", headers=sa, json={"manager_id": off["id"]}).status_code == 400


def test_compare_respects_location_access(sa, made):
    emp = _login("employee@dotindot.in")
    me_emp = requests.get(f"{API}/auth/me", headers=emp).json()
    rows = requests.get(f"{API}/locations/compare", headers=emp).json()
    if me_emp.get("branch_assignments"):
        allowed = {a["branch_id"] for a in me_emp["branch_assignments"]}
        assert {r["id"] for r in rows} <= allowed
