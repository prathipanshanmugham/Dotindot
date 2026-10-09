"""v2.7 Revision 6 — API Credits (Finance), Daily Reporting + location-wise attendance, Customer dashboard,
branded PDF report and the client portal.

Self-contained: creates its own accounts, branch, employees, client and portal login, then cleans up, so it
runs on an empty production-like database (only admin@ + midhun@) as well as on a seeded demo database."""
import os
import uuid
from datetime import date
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://agency-hub-490.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
PASSWORD = "Dotindot@2026"
TAG = uuid.uuid4().hex[:6]


def _login(email, password=PASSWORD):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def ah():
    return _login("admin@dotindot.in")


@pytest.fixture(scope="module")
def mh():
    return _login("midhun@dotindot.in")


def _make_employee(ah, label):
    email = f"t27-{label}-{TAG}@dotindot.in"
    r = requests.post(f"{API}/users", headers=ah, json={"name": f"T27 {label.title()}", "email": email, "password": PASSWORD, "role": "employee"})
    assert r.status_code in (200, 201), r.text
    uid = r.json().get("id") or next(u["id"] for u in requests.get(f"{API}/users", headers=ah).json() if u["email"] == email)
    return {"id": uid, "email": email, "h": _login(email)}


@pytest.fixture(scope="module")
def emp(ah):
    e = _make_employee(ah, "onsite")
    yield e
    requests.delete(f"{API}/records/users/{e['id']}", headers=ah)


@pytest.fixture(scope="module")
def emp2(ah):
    e = _make_employee(ah, "offsite")
    yield e
    requests.delete(f"{API}/records/users/{e['id']}", headers=ah)


# ====================================================================== permissions
class TestPermissions:
    def test_new_keys_registered(self, ah):
        flat = str(requests.get(f"{API}/access/registry", headers=ah).json())
        for k in ["finance.api_credits", "daily_reports", "daily_reports.team", "daily_reports.delete", "client_portal"]:
            assert k in flat, k

    def test_employee_has_daily_but_not_team_or_credits(self, emp):
        perms = requests.get(f"{API}/me/permissions", headers=emp["h"]).json()["permissions"]
        assert "daily_reports" in perms
        assert "daily_reports.team" not in perms
        assert "finance.api_credits" not in perms
        assert requests.get(f"{API}/finance/api-credits/accounts", headers=emp["h"]).status_code == 403
        assert requests.get(f"{API}/daily/team", headers=emp["h"]).status_code == 403


# ====================================================================== API credits
@pytest.fixture(scope="module")
def account(ah):
    r = requests.post(f"{API}/finance/api-credits/accounts", headers=ah, json={
        "name": f"T27 OpenAI {TAG}", "provider": "openai", "billing": "prepaid", "currency": "USD", "fx_rate": 80,
        "monthly_budget": 100, "low_balance_threshold": 30, "key_hint": "sk-proj-THISISAFULLKEY1234"})
    assert r.status_code in (200, 201), r.text
    a = r.json()
    yield a
    requests.delete(f"{API}/records/api_accounts/{a['id']}", headers=ah)


class TestApiCredits:
    def test_key_hint_never_stores_full_key(self, account):
        assert len(account.get("key_hint") or "") <= 12
        assert "THISISAFULLKEY" not in str(account)

    def test_topup_posts_to_ledger_and_usage_reduces_balance(self, ah, account):
        today = date.today().isoformat()
        r = requests.post(f"{API}/finance/api-credits/txns", headers=ah, json={
            "account_id": account["id"], "kind": "topup", "amount": 50, "date": today, "post_to_ledger": True, "note": "T27 topup"})
        assert r.status_code in (200, 201), r.text
        tx = r.json()
        assert tx.get("ledger_tx_id"), "top-up should post an expense to the ledger"
        led = requests.get(f"{API}/finance/transactions", headers=ah, params={"type": "expense"}).json()
        rows = led if isinstance(led, list) else led.get("items") or led.get("transactions") or []
        hit = next((t for t in rows if t["id"] == tx["ledger_tx_id"]), None)
        assert hit and float(hit["amount"]) == pytest.approx(4000), "ledger amount must be in ₹ (50 × 80)"

        r = requests.post(f"{API}/finance/api-credits/txns", headers=ah, json={"account_id": account["id"], "kind": "usage", "amount": 12.5, "date": today})
        assert r.status_code in (200, 201), r.text
        a = requests.get(f"{API}/finance/api-credits/accounts/{account['id']}", headers=ah).json()
        assert a["balance"] == pytest.approx(37.5)
        assert a["balance_inr"] == pytest.approx(3000)
        assert a["used_mtd"] == pytest.approx(12.5)
        assert len(a["series"]) >= 28

    def test_bulk_import_and_low_balance_alert(self, ah, account):
        today = date.today().isoformat()
        r = requests.post(f"{API}/finance/api-credits/txns/bulk", headers=ah, json={
            "account_id": account["id"], "kind": "usage", "rows": [{"date": today, "amount": 5}, {"date": today, "amount": 5.5, "units": 1000}]})
        assert r.status_code in (200, 201), r.text
        assert r.json()["imported"] == 2 and r.json()["total"] == pytest.approx(10.5)
        a = requests.get(f"{API}/finance/api-credits/accounts/{account['id']}", headers=ah).json()
        assert a["balance"] == pytest.approx(27.0) and a["low_balance"] is True
        ov = requests.get(f"{API}/finance/api-credits/overview", headers=ah).json()
        assert any(x["id"] == account["id"] for x in ov["low_balance"])
        notes = requests.get(f"{API}/notifications", headers=ah).json()["items"]
        assert any(n["kind"] == "api_credit" and account["name"] in n["title"] for n in notes)

    def test_rejects_bad_kind_and_negative_amount(self, ah, account):
        assert requests.post(f"{API}/finance/api-credits/txns", headers=ah, json={"account_id": account["id"], "kind": "gift", "amount": 1}).status_code == 400
        assert requests.post(f"{API}/finance/api-credits/txns", headers=ah, json={"account_id": account["id"], "kind": "usage", "amount": -3}).status_code in (400, 422)

    def test_exports(self, ah):
        for fmt, magic in (("pdf", b"%PDF"), ("xlsx", b"PK")):
            r = requests.get(f"{API}/exports/api-credits", headers=ah, params={"format": fmt})
            assert r.status_code == 200 and r.content[:4].startswith(magic), (fmt, r.status_code)

    def test_delete_account_cascades_entries(self, ah):
        r = requests.post(f"{API}/finance/api-credits/accounts", headers=ah, json={"name": f"T27 temp {TAG}", "provider": "other", "currency": "INR"})
        aid = r.json()["id"]
        requests.post(f"{API}/finance/api-credits/txns", headers=ah, json={"account_id": aid, "kind": "topup", "amount": 100})
        assert requests.delete(f"{API}/records/api_accounts/{aid}", headers=ah).status_code == 200
        left = requests.get(f"{API}/finance/api-credits/txns", headers=ah, params={"account_id": aid}).json()
        assert left == []


# ====================================================================== Daily reporting
@pytest.fixture(scope="module")
def branch(ah):
    r = requests.post(f"{API}/locations/branches", headers=ah, json={"name": f"T27 Branch {TAG}", "city": "Testville", "country": "India",
                                                                        "lat": 10.0, "lng": 10.0})
    assert r.status_code in (200, 201), r.text
    b = r.json()
    yield b
    requests.delete(f"{API}/locations/branches/{b['id']}", headers=ah)


@pytest.fixture(scope="module")
def strict_hours(ah):
    """Office starts 00:00 with no grace so every check-in is 'late' — restored afterwards."""
    before = requests.get(f"{API}/daily/settings", headers=ah).json()
    r = requests.put(f"{API}/daily/settings", headers=ah, json={"work_start": "00:00", "late_grace_min": 0, "geofence_m": 300})
    assert r.status_code == 200, r.text
    yield r.json()
    requests.put(f"{API}/daily/settings", headers=ah, json={k: before[k] for k in ("work_start", "late_grace_min", "geofence_m")})


class TestDaily:
    def test_settings_admin_only(self, emp):
        assert requests.put(f"{API}/daily/settings", headers=emp["h"], json={"geofence_m": 50}).status_code == 403

    def test_check_in_on_site_and_late(self, emp, branch, strict_hours):
        r = requests.post(f"{API}/daily/check-in", headers=emp["h"], json={"status": "office", "lat": 10.0, "lng": 10.0, "accuracy": 10})
        assert r.status_code == 200, r.text
        rec = r.json()
        assert rec["nearest_branch_id"] == branch["id"] and rec["distance_m"] == 0 and rec["on_site"] is True
        assert rec["late"] is True and rec["late_by_min"] >= 0
        assert requests.post(f"{API}/daily/check-in", headers=emp["h"], json={"status": "office"}).status_code == 409

    def test_check_in_off_site(self, emp2, branch, strict_hours):
        rec = requests.post(f"{API}/daily/check-in", headers=emp2["h"], json={"status": "office", "lat": 10.02, "lng": 10.0, "accuracy": 10}).json()
        assert rec["nearest_branch_id"] == branch["id"]
        assert 2000 < rec["distance_m"] < 2500 and rec["on_site"] is False

    def test_report_requires_content_then_submits(self, emp):
        assert requests.put(f"{API}/daily/me/report", headers=emp["h"], json={"summary": "", "tasks": [], "submit": True}).status_code == 400
        r = requests.put(f"{API}/daily/me/report", headers=emp["h"], json={
            "summary": "Built the T27 thing", "tasks": [{"text": "Wrote tests", "hours": 2}], "plan_tomorrow": "Ship", "submit": True})
        assert r.status_code == 200, r.text
        me = requests.get(f"{API}/daily/me", headers=emp["h"]).json()
        assert me["record"]["report"]["submitted"] is True
        old = (date.fromordinal(date.today().toordinal() - 10)).isoformat()
        assert requests.put(f"{API}/daily/me/report", headers=emp["h"], json={"date": old, "summary": "late", "submit": True}).status_code == 400

    def test_check_out(self, emp):
        r = requests.post(f"{API}/daily/check-out", headers=emp["h"], json={})
        assert r.status_code == 200 and r.json()["hours"] >= 0

    def test_team_view_groups_by_location(self, mh, emp, emp2):
        d = requests.get(f"{API}/daily/team", headers=mh).json()
        people = {p["user"]["id"]: p for g in d["branches"] for p in g["people"]}
        assert people[emp["id"]]["state"] == "late"
        assert people[emp["id"]]["record"]["report"]["submitted"] is True
        assert d["summary"]["off_site"] >= 1
        assert {"present", "rate", "late", "not_checked_in"} <= set(d["summary"])

    def test_review_note_and_mark(self, mh, emp, emp2):
        me = requests.get(f"{API}/daily/me", headers=emp["h"]).json()
        assert requests.post(f"{API}/daily/records/{me['record']['id']}/review", headers=mh, json={"note": "Nice work"}).status_code == 200
        assert requests.get(f"{API}/daily/me", headers=emp["h"]).json()["record"]["manager_note"] == "Nice work"
        today = me["today"]
        r = requests.put(f"{API}/daily/mark", headers=mh, json={"user_id": emp2["id"], "date": today, "status": "wfh", "note": "Approved"})
        assert r.status_code == 200 and r.json()["status"] == "wfh"
        assert requests.put(f"{API}/daily/mark", headers=emp["h"], json={"user_id": emp2["id"], "date": today, "status": "absent"}).status_code == 403

    def test_employee_cannot_read_others_record(self, emp, emp2):
        rid = requests.get(f"{API}/daily/me", headers=emp2["h"]).json()["record"]["id"]
        assert requests.get(f"{API}/daily/records/{rid}", headers=emp["h"]).status_code == 403

    def test_attendance_month_and_export(self, mh, emp):
        d = requests.get(f"{API}/daily/attendance", headers=mh).json()
        row = next(r for r in d["rows"] if r["user"]["id"] == emp["id"])
        assert len(row["cells"]) == len(d["days"]) and row["totals"]["present"] >= 1 and row["totals"]["late"] >= 1
        r = requests.get(f"{API}/exports/attendance", headers=mh, params={"format": "xlsx"})
        assert r.status_code == 200 and r.content[:2] == b"PK"


# ====================================================================== Customer dashboard + portal
@pytest.fixture(scope="module")
def client_rec(ah):
    r = requests.post(f"{API}/clients", headers=ah, json={"name": f"T27 Client {TAG}", "company": "T27 Pvt Ltd", "city": "Mumbai", "region": "West"})
    assert r.status_code in (200, 201), r.text
    c = r.json()
    yield c
    requests.delete(f"{API}/records/clients/{c['id']}", headers=ah)


@pytest.fixture(scope="module")
def portal_user(ah, client_rec):
    email = f"t27-portal-{TAG}@example.com"
    r = requests.post(f"{API}/clients/{client_rec['id']}/portal-users", headers=ah, json={"name": "Client Person", "email": email, "password": "ClientPass#1"})
    assert r.status_code in (200, 201), r.text
    pu = r.json()
    assert "password_hash" not in pu
    return {**pu, "password": "ClientPass#1"}


def _portal_login(email, password):
    return requests.post(f"{API}/portal/login", json={"email": email, "password": password})


class TestClientDashboard:
    def test_internal_dashboard_and_periods(self, ah, client_rec):
        for period in ("this_month", "last_month", "last_3_months", "ytd"):
            d = requests.get(f"{API}/clients/{client_rec['id']}/dashboard", headers=ah, params={"period": period}).json()
            assert d["client"]["id"] == client_rec["id"] and d["period"]["key"] == period
            assert {"active_projects", "ad_spend", "posts_published", "paid_in_period"} <= set(d["kpis"])
        r = requests.get(f"{API}/clients/{client_rec['id']}/dashboard", headers=ah, params={"period": "custom", "start": "2026-01-01", "end": "2025-01-01"})
        assert r.status_code == 400

    def test_internal_pdf(self, ah, client_rec):
        r = requests.get(f"{API}/clients/{client_rec['id']}/dashboard/report", headers=ah, params={"period": "last_3_months"})
        assert r.status_code == 200 and r.content[:4] == b"%PDF"
        assert "t27-client" in r.headers["content-disposition"].lower()

    def test_payload_has_no_internal_secrets(self, ah, client_rec):
        s = str(requests.get(f"{API}/clients/{client_rec['id']}/dashboard", headers=ah).json()).lower()
        for word in ("password", "credential", "margin", "cost_price", "notes"):
            assert word not in s, word

    def test_employee_without_clients_perm_is_blocked(self, emp, client_rec):
        assert requests.get(f"{API}/clients/{client_rec['id']}/dashboard", headers=emp["h"]).status_code == 403

    def test_duplicate_and_weak_portal_logins_rejected(self, ah, client_rec, portal_user):
        cid = client_rec["id"]
        assert requests.post(f"{API}/clients/{cid}/portal-users", headers=ah, json={"name": "x", "email": portal_user["email"], "password": "LongEnough1"}).status_code == 409
        assert requests.post(f"{API}/clients/{cid}/portal-users", headers=ah, json={"name": "x", "email": "admin@dotindot.in", "password": "LongEnough1"}).status_code == 409
        assert requests.post(f"{API}/clients/{cid}/portal-users", headers=ah, json={"name": "x", "email": f"n-{TAG}@ex.com", "password": "short"}).status_code == 400


class TestPortal:
    def test_login_and_own_dashboard(self, client_rec, portal_user):
        assert _portal_login(portal_user["email"], "wrong-password").status_code == 401
        r = _portal_login(portal_user["email"].upper(), portal_user["password"])
        assert r.status_code == 200, r.text
        ph = {"Authorization": f"Bearer {r.json()['access_token']}"}
        me = requests.get(f"{API}/portal/me", headers=ph).json()
        assert me["client_id"] == client_rec["id"]
        d = requests.get(f"{API}/portal/dashboard", headers=ph, params={"period": "last_month"}).json()
        assert d["client"]["id"] == client_rec["id"] and "portal_users" not in d
        pdf = requests.get(f"{API}/portal/report", headers=ph)
        assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF"

    def test_portal_token_cannot_reach_internal_api(self, portal_user, client_rec):
        ph = {"Authorization": f"Bearer {_portal_login(portal_user['email'], portal_user['password']).json()['access_token']}"}
        for path in ("/auth/me", "/clients", f"/clients/{client_rec['id']}", f"/clients/{client_rec['id']}/dashboard", "/finance/transactions", "/daily/me"):
            assert requests.get(f"{API}{path}", headers=ph).status_code == 401, path

    def test_staff_token_cannot_use_portal(self, ah):
        assert requests.get(f"{API}/portal/dashboard", headers=ah).status_code == 401

    def test_change_password(self, portal_user):
        ph = {"Authorization": f"Bearer {_portal_login(portal_user['email'], portal_user['password']).json()['access_token']}"}
        assert requests.post(f"{API}/portal/change-password", headers=ph, json={"current_password": "nope", "new_password": "NewPass#2026"}).status_code == 400
        assert requests.post(f"{API}/portal/change-password", headers=ph, json={"current_password": portal_user["password"], "new_password": "NewPass#2026"}).status_code == 200
        assert _portal_login(portal_user["email"], "NewPass#2026").status_code == 200
        portal_user["password"] = "NewPass#2026"

    def test_disable_blocks_login_and_existing_token(self, ah, client_rec, portal_user):
        ph = {"Authorization": f"Bearer {_portal_login(portal_user['email'], portal_user['password']).json()['access_token']}"}
        r = requests.put(f"{API}/clients/{client_rec['id']}/portal-users/{portal_user['id']}", headers=ah, json={"is_active": False})
        assert r.status_code == 200 and r.json()["is_active"] is False
        assert _portal_login(portal_user["email"], portal_user["password"]).status_code == 403
        assert requests.get(f"{API}/portal/dashboard", headers=ph).status_code == 401
        requests.put(f"{API}/clients/{client_rec['id']}/portal-users/{portal_user['id']}", headers=ah, json={"is_active": True})

    def test_deleting_client_removes_portal_logins(self, ah):
        c = requests.post(f"{API}/clients", headers=ah, json={"name": f"T27 Gone {TAG}"}).json()
        email = f"t27-gone-{TAG}@example.com"
        requests.post(f"{API}/clients/{c['id']}/portal-users", headers=ah, json={"name": "G", "email": email, "password": "GonePass#1"})
        assert _portal_login(email, "GonePass#1").status_code == 200
        assert requests.delete(f"{API}/records/clients/{c['id']}", headers=ah).status_code == 200
        assert _portal_login(email, "GonePass#1").status_code == 401
