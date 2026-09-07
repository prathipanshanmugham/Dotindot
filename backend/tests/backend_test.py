"""Backend regression tests for Dotindot Ops Platform - Phase 1."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://agency-hub-490.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
PASSWORD = "Dotindot@2026"

USERS = {
    "admin": "admin@dotindot.com",
    "finance": "finance@dotindot.com",
    "sales": "sales@dotindot.com",
    "pm": "pm@dotindot.com",
    "employee": "employee@dotindot.com",
}


def login(email, password=PASSWORD):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    return r


@pytest.fixture(scope="session")
def tokens():
    t = {}
    for role, email in USERS.items():
        r = login(email)
        assert r.status_code == 200, f"{role} login failed: {r.status_code} {r.text}"
        t[role] = r.json()["access_token"]
    return t


def hdr(tok):
    return {"Authorization": f"Bearer {tok}"}


# --- Auth ---
class TestAuth:
    def test_openapi(self):
        r = requests.get(f"{API}/openapi.json", timeout=15)
        assert r.status_code == 200

    def test_login_all_roles(self, tokens):
        assert set(tokens.keys()) == set(USERS.keys())

    def test_login_bad_password(self):
        r = login("admin@dotindot.com", "wrong")
        assert r.status_code in (400, 401)

    def test_me(self, tokens):
        for role, tok in tokens.items():
            r = requests.get(f"{API}/auth/me", headers=hdr(tok), timeout=15)
            assert r.status_code == 200
            data = r.json()
            assert data["email"] == USERS[role]
            assert data["role"] == role


# --- RBAC ---
class TestRBAC:
    def test_employee_forbidden_clients_read(self, tokens):
        r = requests.get(f"{API}/clients", headers=hdr(tokens["employee"]), timeout=15)
        assert r.status_code == 403

    def test_employee_forbidden_client_create(self, tokens):
        r = requests.post(f"{API}/clients", headers=hdr(tokens["employee"]),
                          json={"name": "X", "company_name": "X"}, timeout=15)
        assert r.status_code == 403

    def test_employee_forbidden_users(self, tokens):
        r = requests.get(f"{API}/users", headers=hdr(tokens["employee"]), timeout=15)
        assert r.status_code == 403

    def test_employee_forbidden_logs(self, tokens):
        r = requests.get(f"{API}/logs", headers=hdr(tokens["employee"]), timeout=15)
        assert r.status_code == 403

    def test_employee_forbidden_project_create(self, tokens):
        r = requests.post(f"{API}/projects", headers=hdr(tokens["employee"]),
                          json={"name": "X", "client_id": "seed-client-01"}, timeout=15)
        assert r.status_code == 403

    def test_reveal_admin_ok(self, tokens):
        r = requests.get(f"{API}/clients/seed-client-01/credentials/cr-01a/reveal",
                         headers=hdr(tokens["admin"]), timeout=15)
        assert r.status_code == 200
        assert "password" in r.json() or "secret" in r.json() or "value" in r.json()

    def test_reveal_pm_ok(self, tokens):
        r = requests.get(f"{API}/clients/seed-client-01/credentials/cr-01a/reveal",
                         headers=hdr(tokens["pm"]), timeout=15)
        assert r.status_code == 200

    def test_reveal_sales_forbidden(self, tokens):
        r = requests.get(f"{API}/clients/seed-client-01/credentials/cr-01a/reveal",
                         headers=hdr(tokens["sales"]), timeout=15)
        assert r.status_code == 403

    def test_reveal_finance_forbidden(self, tokens):
        r = requests.get(f"{API}/clients/seed-client-01/credentials/cr-01a/reveal",
                         headers=hdr(tokens["finance"]), timeout=15)
        assert r.status_code == 403

    def test_reveal_employee_forbidden(self, tokens):
        r = requests.get(f"{API}/clients/seed-client-01/credentials/cr-01a/reveal",
                         headers=hdr(tokens["employee"]), timeout=15)
        assert r.status_code == 403


# --- Seed / Dashboard ---
class TestSeed:
    def test_seed_clients_count(self, tokens):
        r = requests.get(f"{API}/clients", headers=hdr(tokens["admin"]), timeout=15)
        assert r.status_code == 200
        clients = r.json()
        assert len(clients) >= 10

    def test_seed_projects_count(self, tokens):
        r = requests.get(f"{API}/projects", headers=hdr(tokens["admin"]), timeout=15)
        assert r.status_code == 200
        assert len(r.json()) >= 15

    def test_dashboard_stats(self, tokens):
        r = requests.get(f"{API}/dashboard/stats", headers=hdr(tokens["admin"]), timeout=15)
        assert r.status_code == 200
        d = r.json()
        # loose checks
        assert isinstance(d, dict)

    def test_employee_sees_only_assigned(self, tokens):
        r = requests.get(f"{API}/projects", headers=hdr(tokens["employee"]), timeout=15)
        assert r.status_code == 200
        projects = r.json()
        # employee is assigned; ensure less than total
        r2 = requests.get(f"{API}/projects", headers=hdr(tokens["admin"]), timeout=15)
        assert len(projects) <= len(r2.json())
        assert len(projects) > 0

    def test_search(self, tokens):
        r = requests.get(f"{API}/search?q=sky", headers=hdr(tokens["admin"]), timeout=15)
        assert r.status_code == 200


# --- Client CRUD ---
class TestClientsCRUD:
    def test_create_get_update_delete(self, tokens):
        admin = hdr(tokens["admin"])
        payload = {
            "name": f"TEST_Client_{uuid.uuid4().hex[:6]}",
            "company_name": "TEST Corp",
            "industry": "Technology",
            "service": "Web Development",
            "size": "SMB",
            "retainer_type": "Monthly",
            "status": "Active",
        }
        r = requests.post(f"{API}/clients", headers=admin, json=payload, timeout=15)
        assert r.status_code in (200, 201), r.text
        cid = r.json().get("id")
        assert cid

        # GET
        r = requests.get(f"{API}/clients/{cid}", headers=admin, timeout=15)
        assert r.status_code == 200
        assert r.json()["name"] == payload["name"]

        # UPDATE
        r = requests.put(f"{API}/clients/{cid}", headers=admin,
                         json={"name": payload["name"] + "_upd"}, timeout=15)
        assert r.status_code == 200

        # verify persisted
        r = requests.get(f"{API}/clients/{cid}", headers=admin, timeout=15)
        assert r.json()["name"].endswith("_upd")

        # DELETE
        r = requests.delete(f"{API}/clients/{cid}", headers=admin, timeout=15)
        assert r.status_code in (200, 204)

        r = requests.get(f"{API}/clients/{cid}", headers=admin, timeout=15)
        assert r.status_code == 404


# --- Project toggle deliverable ---
class TestProjectToggle:
    def test_toggle_deliverable(self, tokens):
        admin = hdr(tokens["admin"])
        r = requests.get(f"{API}/projects/seed-project-01", headers=admin, timeout=15)
        assert r.status_code == 200
        p = r.json()
        delivs = p.get("deliverables") or []
        if not delivs:
            pytest.skip("no deliverables to toggle")
        did = delivs[0].get("id")
        before = delivs[0].get("completed", False)
        r = requests.patch(f"{API}/projects/seed-project-01/toggle",
                           headers=admin, json={"kind": "deliverable", "item_id": did}, timeout=15)
        assert r.status_code in (200, 204), r.text
        r = requests.get(f"{API}/projects/seed-project-01", headers=admin, timeout=15)
        after = next((d for d in r.json()["deliverables"] if d["id"] == did), None)
        assert after is not None
        assert after.get("completed") != before


# --- User Management ---
class TestUserManagement:
    def test_admin_list_users(self, tokens):
        r = requests.get(f"{API}/users", headers=hdr(tokens["admin"]), timeout=15)
        assert r.status_code == 200
        assert len(r.json()) >= 5

    def test_create_and_deactivate_user(self, tokens):
        admin = hdr(tokens["admin"])
        email = f"test_{uuid.uuid4().hex[:6]}@dotindot.test"
        r = requests.post(f"{API}/users", headers=admin, json={
            "email": email, "name": "TestUser", "password": PASSWORD, "role": "employee"
        }, timeout=15)
        assert r.status_code in (200, 201), r.text
        uid = r.json()["id"]

        # login works
        r2 = login(email)
        assert r2.status_code == 200

        # deactivate
        r = requests.put(f"{API}/users/{uid}", headers=admin, json={"is_active": False}, timeout=15)
        assert r.status_code == 200

        # login should now fail
        r3 = login(email)
        assert r3.status_code in (400, 401, 403)


# --- Activity logs ---
class TestLogs:
    def test_logs_admin(self, tokens):
        r = requests.get(f"{API}/logs", headers=hdr(tokens["admin"]), timeout=15)
        assert r.status_code == 200
        logs = r.json()
        assert isinstance(logs, list)
        assert len(logs) > 0
