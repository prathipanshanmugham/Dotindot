"""V2.3 Revision 2 backend tests: geo/branches, branch roles, password manager,
recycle bin, sales HUD latest_won, login history."""
import os
import time
import pytest
import requests

def _load_env_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v:
        return v.rstrip("/")
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip().rstrip("/")
    raise RuntimeError("REACT_APP_BACKEND_URL not set")

BASE = _load_env_url()
API = f"{BASE}/api"
PW = "Dotindot@2026"


def _login(email):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": PW}, timeout=30)
    assert r.status_code == 200, f"login {email} -> {r.status_code} {r.text}"
    return r.json()["access_token"]


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def admin_tok():
    return _login("midhun@dotindot.in")


@pytest.fixture(scope="module")
def super_tok():
    return _login("admin@dotindot.in")


@pytest.fixture(scope="module")
def sales_tok():
    return _login("sales@dotindot.in")


@pytest.fixture(scope="module")
def employee_tok():
    return _login("employee@dotindot.in")


@pytest.fixture(scope="module")
def finance_tok():
    return _login("finance@dotindot.in")


# ---------- 1. Login of 11 seed accounts + login logs ----------
SEED_EMAILS = [
    "admin@dotindot.in", "midhun@dotindot.in", "finance@dotindot.in", "sales@dotindot.in",
    "pm@dotindot.in", "employee@dotindot.in", "designer@dotindot.in", "dev@dotindot.in",
    "marketing@dotindot.in", "ads@dotindot.in", "social@dotindot.in",
]


def test_all_seed_accounts_login():
    for e in SEED_EMAILS:
        r = requests.post(f"{API}/auth/login", json={"email": e, "password": PW}, timeout=30)
        assert r.status_code == 200, f"{e} => {r.status_code}"
        assert r.json().get("access_token")


def test_users_last_login_and_history(admin_tok):
    r = requests.get(f"{API}/users", headers=_h(admin_tok), timeout=30)
    assert r.status_code == 200
    users = r.json()
    # find user-admin
    admin_row = next((u for u in users if u["id"] == "user-admin"), None)
    assert admin_row is not None
    assert "last_login" in admin_row
    r2 = requests.get(f"{API}/users/user-admin/logins", headers=_h(admin_tok), timeout=30)
    assert r2.status_code == 200
    rows = r2.json()
    assert isinstance(rows, list)
    # newest-first ordering (if any rows)
    if len(rows) >= 2:
        assert rows[0]["timestamp"] >= rows[1]["timestamp"]


# ---------- 2. Locations: geo + branch create/map fallback ----------
def test_locations_geo(admin_tok):
    r = requests.get(f"{API}/locations/geo", headers=_h(admin_tok), timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert "countries" in data and "india_states" in data
    # 36 states/UTs
    assert len(data["india_states"]) == 36, f"got {len(data['india_states'])}"
    assert "Kerala" in data["india_states"]
    assert "Kochi" in data["india_states"]["Kerala"]


def test_branch_create_known_city_and_map(admin_tok):
    body = {"name": "TEST_Kochi_Branch", "country": "India", "state": "Kerala", "city": "Kochi"}
    r = requests.post(f"{API}/locations/branches", headers=_h(admin_tok), json=body, timeout=30)
    assert r.status_code in (200, 201), r.text
    bid = r.json().get("id") or r.json().get("branch", {}).get("id")
    assert bid
    try:
        m = requests.get(f"{API}/locations/map", headers=_h(admin_tok), timeout=30).json()
        # map returns city buckets somewhere; look flexibly
        text = str(m).lower()
        assert "kochi" in text
    finally:
        rd = requests.delete(f"{API}/locations/branches/{bid}", headers=_h(admin_tok), timeout=30)
        assert rd.status_code in (200, 204)


def test_branch_create_unknown_city_fallback(admin_tok):
    body = {"name": "TEST_Muv_Branch", "country": "India", "state": "Kerala", "city": "Muvattupuzha"}
    r = requests.post(f"{API}/locations/branches", headers=_h(admin_tok), json=body, timeout=30)
    assert r.status_code in (200, 201), r.text
    bid = r.json().get("id") or r.json().get("branch", {}).get("id")
    try:
        m = requests.get(f"{API}/locations/map", headers=_h(admin_tok), timeout=30).json()
        # The branch should appear on the map somewhere (via state-capital fallback)
        text = str(m)
        assert "TEST_Muv_Branch" in text or "Muvattupuzha" in text
    finally:
        requests.delete(f"{API}/locations/branches/{bid}", headers=_h(admin_tok), timeout=30)


# ---------- 3. Clients state field ----------
def test_clients_state_field(admin_tok):
    body = {"name": "TEST_StateClient", "country": "India", "state": "Karnataka", "city": "Bengaluru"}
    r = requests.post(f"{API}/clients", headers=_h(admin_tok), json=body, timeout=30)
    assert r.status_code in (200, 201), r.text
    cid = r.json().get("id")
    try:
        assert r.json().get("state") == "Karnataka"
        r2 = requests.put(f"{API}/clients/{cid}", headers=_h(admin_tok),
                          json={"state": "Tamil Nadu"}, timeout=30)
        assert r2.status_code == 200
        r3 = requests.get(f"{API}/clients/{cid}", headers=_h(admin_tok), timeout=30)
        assert r3.status_code == 200
        assert r3.json().get("state") == "Tamil Nadu"
    finally:
        requests.delete(f"{API}/clients/{cid}", headers=_h(admin_tok), timeout=30)


# ---------- 4. Branch role assignments + branch filter ----------
def test_branch_role_assignments(admin_tok):
    try:
        # valid manager assignment
        r = requests.put(f"{API}/access/users/user-sales/branches", headers=_h(admin_tok),
                         json={"assignments": [{"branch_id": "seed-branch-01", "branch_role": "manager"}]},
                         timeout=30)
        assert r.status_code == 200, r.text
        r2 = requests.get(f"{API}/access/users", headers=_h(admin_tok), timeout=30)
        users = r2.json()
        row = next(u for u in users if u["id"] == "user-sales")
        ba = row.get("branch_assignments", [])
        assert any(a.get("branch_id") == "seed-branch-01" and a.get("branch_role") == "manager" for a in ba), ba

        # invalid role
        r3 = requests.put(f"{API}/access/users/user-sales/branches", headers=_h(admin_tok),
                          json={"assignments": [{"branch_id": "seed-branch-01", "branch_role": "boss"}]},
                          timeout=30)
        assert r3.status_code == 400

        # unknown branch
        r4 = requests.put(f"{API}/access/users/user-sales/branches", headers=_h(admin_tok),
                          json={"assignments": [{"branch_id": "not-a-branch", "branch_role": "staff"}]},
                          timeout=30)
        assert r4.status_code == 400
    finally:
        # reset
        requests.put(f"{API}/access/users/user-sales/branches", headers=_h(admin_tok),
                     json={"assignments": []}, timeout=30)


def test_branch_filter_param(admin_tok):
    endpoints = ["/clients", "/projects", "/ceo/dashboard", "/finance/overview", "/sales/overview"]
    for ep in endpoints:
        r = requests.get(f"{API}{ep}?branch=seed-branch-01", headers=_h(admin_tok), timeout=30)
        assert r.status_code == 200, f"{ep} => {r.status_code} {r.text[:200]}"


# ---------- 5. Password Manager ----------
def test_password_list_and_summary(admin_tok):
    r = requests.get(f"{API}/passwords", headers=_h(admin_tok), timeout=30)
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) >= 8
    for row in rows:
        assert row.get("has_password") is True
        assert "password" not in row  # plaintext never leaked
        assert row.get("change_status") in ("ok", "due_soon", "overdue", "unknown")
    r2 = requests.get(f"{API}/passwords/summary", headers=_h(admin_tok), timeout=30)
    assert r2.status_code == 200
    for k in ("total", "without_2fa", "overdue", "due_soon", "renewals_30d"):
        assert k in r2.json()


def test_password_crud_and_reveal(admin_tok):
    body = {"name": "TEST_PwEntry", "username": "test@example.com", "password": "InitPass#12345"}
    r = requests.post(f"{API}/passwords", headers=_h(admin_tok), json=body, timeout=30)
    assert r.status_code in (200, 201), r.text
    pid = r.json()["id"]
    assert r.json().get("has_password") is True
    assert "password" not in r.json()

    # update
    r2 = requests.put(f"{API}/passwords/{pid}", headers=_h(admin_tok),
                      json={"password": "NewPass#54321"}, timeout=30)
    assert r2.status_code == 200

    # reveal wrong login pw
    r3 = requests.post(f"{API}/passwords/{pid}/reveal", headers=_h(admin_tok),
                       json={"login_password": "wrong-pw"}, timeout=30)
    assert r3.status_code == 403

    # reveal correct
    r4 = requests.post(f"{API}/passwords/{pid}/reveal", headers=_h(admin_tok),
                       json={"login_password": PW}, timeout=30)
    assert r4.status_code == 200, r4.text
    data = r4.json()
    assert data.get("password") == "NewPass#54321"
    assert data.get("hide_after_seconds") == 30

    # generate
    r5 = requests.get(f"{API}/passwords/generate?length=16", headers=_h(admin_tok), timeout=30)
    assert r5.status_code == 200
    assert len(r5.json()["password"]) == 16

    # delete
    rd = requests.delete(f"{API}/passwords/{pid}", headers=_h(admin_tok), timeout=30)
    assert rd.status_code == 200


def test_password_permission_denied(employee_tok, sales_tok, finance_tok):
    for tok, role in ((employee_tok, "employee"), (sales_tok, "sales"), (finance_tok, "finance")):
        r = requests.get(f"{API}/passwords", headers=_h(tok), timeout=30)
        assert r.status_code == 403, f"{role} expected 403 got {r.status_code}"


# ---------- 6. Workspace recycle bin ----------
def test_recycle_bin_flow(super_tok, admin_tok):
    # Create a branch to delete
    body = {"name": "TEST_RecycleBranch", "country": "India", "state": "Kerala", "city": "Kochi"}
    r = requests.post(f"{API}/locations/branches", headers=_h(super_tok), json=body, timeout=30)
    assert r.status_code in (200, 201)
    bid = r.json().get("id") or r.json().get("branch", {}).get("id")

    # Admin (not super) should be 403 on recycle bin
    ra = requests.get(f"{API}/workspace/recycle-bin", headers=_h(admin_tok), timeout=30)
    assert ra.status_code == 403

    # Delete via workspace endpoint
    rd = requests.delete(f"{API}/workspace/branches/{bid}", headers=_h(super_tok), timeout=30)
    assert rd.status_code in (200, 204), rd.text

    # Recycle bin should list it
    rb = requests.get(f"{API}/workspace/recycle-bin", headers=_h(super_tok), timeout=30)
    assert rb.status_code == 200
    items = rb.json() if isinstance(rb.json(), list) else rb.json().get("items", [])
    match = next((i for i in items if (i.get("record_id") == bid or i.get("id") == bid
                                        or (i.get("record") or {}).get("id") == bid)), None)
    assert match is not None, f"deleted branch not in recycle bin: {items}"
    snap_id = match.get("snap_id") or match.get("id")
    assert match.get("expires_at")

    # restore unknown id -> 404
    rn = requests.post(f"{API}/workspace/recycle-bin/does-not-exist/restore",
                       headers=_h(super_tok), timeout=30)
    assert rn.status_code == 404

    # restore real snap
    rr = requests.post(f"{API}/workspace/recycle-bin/{snap_id}/restore",
                       headers=_h(super_tok), timeout=30)
    assert rr.status_code == 200, rr.text

    # verify branch back
    rl = requests.get(f"{API}/locations/branches", headers=_h(super_tok), timeout=30)
    assert any(b["id"] == bid for b in rl.json())

    # cleanup
    requests.delete(f"{API}/locations/branches/{bid}", headers=_h(super_tok), timeout=30)


# ---------- 7. Sales HUD latest_won ----------
def test_sales_hud_latest_won(admin_tok):
    r = requests.get(f"{API}/sales/hud", headers=_h(admin_tok), timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert "latest_won" in data

    # trigger a win on lead-02
    r2 = requests.post(f"{API}/sales/leads/lead-02/stage", headers=_h(admin_tok),
                       json={"stage": "won"}, timeout=30)
    assert r2.status_code in (200, 201), r2.text
    try:
        r3 = requests.get(f"{API}/sales/hud", headers=_h(admin_tok), timeout=30)
        lw = r3.json().get("latest_won") or {}
        assert lw.get("name"), f"latest_won missing name: {lw}"
        # The just-won lead should be latest
        # (lead-02 = "Zen Yoga Collective")
        assert "zen" in lw["name"].lower() or lw.get("value") is not None
    finally:
        # revert
        requests.post(f"{API}/sales/leads/lead-02/stage", headers=_h(admin_tok),
                      json={"stage": "new"}, timeout=30)
