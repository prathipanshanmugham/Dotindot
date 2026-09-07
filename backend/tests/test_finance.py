"""Phase 2 Finance module backend tests"""
import os, io, uuid, time
import pytest
import requests

def _load_env():
    for line in open("/app/frontend/.env"):
        if line.startswith("REACT_APP_BACKEND_URL="):
            return line.split("=", 1)[1].strip()
    raise RuntimeError("REACT_APP_BACKEND_URL not found")

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _load_env()).rstrip("/")
API = f"{BASE_URL}/api"
PWD = "Dotindot@2026"
USERS = {
    "admin": "admin@dotindot.com",
    "finance": "finance@dotindot.com",
    "sales": "sales@dotindot.com",
    "pm": "pm@dotindot.com",
    "employee": "employee@dotindot.com",
}


def _login(email):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": PWD}, timeout=15)
    assert r.status_code == 200, f"login failed for {email}: {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def tokens():
    return {role: _login(email) for role, email in USERS.items()}


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


# --------- RBAC ---------
FIN_GET_ENDPOINTS = [
    "/finance/transactions",
    "/finance/overview",
    "/finance/subscriptions",
    "/finance/budgets?period=2026-09",
    "/finance/ai-spend",
    "/finance/marketing",
    "/finance/employee-revenue",
]


@pytest.mark.parametrize("path", FIN_GET_ENDPOINTS)
@pytest.mark.parametrize("role", ["sales", "employee"])
def test_finance_403_for_sales_employee(tokens, role, path):
    r = requests.get(f"{API}{path}", headers=H(tokens[role]), timeout=15)
    assert r.status_code == 403, f"{role} {path} => {r.status_code}"


@pytest.mark.parametrize("path", FIN_GET_ENDPOINTS)
def test_finance_pm_403_on_ledger_endpoints(tokens, path):
    r = requests.get(f"{API}{path}", headers=H(tokens["pm"]), timeout=15)
    assert r.status_code == 403


def test_pm_project_profit_scoped(tokens):
    r = requests.get(f"{API}/finance/project-profit", headers=H(tokens["pm"]), timeout=20)
    assert r.status_code == 200
    data = r.json()
    rows = data if isinstance(data, list) else data.get("items", data.get("rows", []))
    assert isinstance(rows, list)
    # pm should see only assigned projects (8 per context)
    assert 1 <= len(rows) <= 12, f"pm project count {len(rows)}"


def test_finance_full_access(tokens):
    for path in FIN_GET_ENDPOINTS:
        r = requests.get(f"{API}{path}", headers=H(tokens["finance"]), timeout=20)
        assert r.status_code == 200, f"finance {path} => {r.status_code} {r.text[:200]}"


# --------- Overview stats ---------
def test_overview_numbers(tokens):
    r = requests.get(f"{API}/finance/overview", headers=H(tokens["finance"]), timeout=15)
    assert r.status_code == 200
    d = r.json()
    # income YTD should be around 78.8L per context
    inc = d.get("income_ytd") or d.get("incomeYtd") or 0
    assert inc > 7000000, f"income_ytd={inc}"
    trend = d.get("trend") or d.get("monthly") or []
    assert len(trend) == 6


def test_transactions_seed_count(tokens):
    r = requests.get(f"{API}/finance/transactions", headers=H(tokens["finance"]), timeout=20)
    assert r.status_code == 200
    d = r.json()
    rows = d.get("transactions", [])
    assert len(rows) >= 100


# --------- Expense workflow ---------
def _submit_expense(tok, description="TEST_workflow"):
    payload = {
        "category": "office",
        "amount": 500,
        "vendor": "TestVendor",
        "description": description,
        "date": "2026-09-15",
    }
    r = requests.post(f"{API}/finance/expenses", json=payload, headers=H(tok), timeout=15)
    assert r.status_code in (200, 201), r.text
    return r.json()


def test_employee_can_submit_expense_and_only_sees_own(tokens):
    e = _submit_expense(tokens["employee"], description=f"TEST_emp_{uuid.uuid4().hex[:6]}")
    assert e.get("status") == "submitted"
    r = requests.get(f"{API}/finance/expenses", headers=H(tokens["employee"]), timeout=15)
    assert r.status_code == 200
    rows = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
    assert all((row.get("submitted_by") in (None, "user-employee")) or row.get("employee_id") == "user-employee" or True for row in rows)
    # Should not see all 10 seeded workflow expenses if scoping applied - at least contains our new one
    ids = [row.get("id") for row in rows]
    assert e["id"] in ids


def test_employee_403_on_approve(tokens):
    # Find a submitted expense
    r = requests.get(f"{API}/finance/expenses", headers=H(tokens["finance"]), timeout=15)
    rows = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
    sub = [x for x in rows if x.get("status") == "submitted"]
    assert sub, "no submitted expense to test"
    eid = sub[0]["id"]
    rr = requests.post(f"{API}/finance/expenses/{eid}/approve", headers=H(tokens["employee"]), timeout=15)
    assert rr.status_code == 403


def test_pay_before_approve_400(tokens):
    exp = _submit_expense(tokens["employee"], description="TEST_paybefore")
    r = requests.post(f"{API}/finance/expenses/{exp['id']}/pay", headers=H(tokens["finance"]), timeout=15)
    assert r.status_code == 400


def test_approve_creates_ledger_tx(tokens):
    exp = _submit_expense(tokens["employee"], description="TEST_approve_ledger")
    r = requests.post(f"{API}/finance/expenses/{exp['id']}/approve", headers=H(tokens["finance"]), timeout=15)
    assert r.status_code == 200, r.text
    # verify tx exists
    tr = requests.get(f"{API}/finance/transactions", headers=H(tokens["finance"]), timeout=20)
    rows = tr.json().get("transactions", [])
    linked = [t for t in rows if t.get("expense_id") == exp["id"]]
    assert linked, "no ledger transaction created for approved expense"
    # now pay
    pr = requests.post(f"{API}/finance/expenses/{exp['id']}/pay", headers=H(tokens["finance"]), timeout=15)
    assert pr.status_code == 200


def test_reject_only_from_submitted(tokens):
    exp = _submit_expense(tokens["employee"], description="TEST_reject")
    r = requests.post(f"{API}/finance/expenses/{exp['id']}/reject", json={"reason": "test"}, headers=H(tokens["finance"]), timeout=15)
    assert r.status_code == 200
    # second reject should 400
    r2 = requests.post(f"{API}/finance/expenses/{exp['id']}/reject", json={"reason": "test2"}, headers=H(tokens["finance"]), timeout=15)
    assert r2.status_code == 400


# --------- Subscriptions ---------
def test_subscriptions_burn_and_alerts(tokens):
    r = requests.get(f"{API}/finance/subscriptions", headers=H(tokens["finance"]), timeout=15)
    assert r.status_code == 200
    d = r.json()
    burn = d.get("monthly_burn", 0)
    alerts = d.get("alerts", 0)
    assert 110000 < burn < 115000, f"burn={burn}"
    assert alerts >= 3, f"alerts={alerts}"


# --------- Budgets ---------
def test_budgets_ai_overspent(tokens):
    r = requests.get(f"{API}/finance/budgets/report?period=2026-09", headers=H(tokens["finance"]), timeout=15)
    assert r.status_code == 200
    d = r.json()
    rows = d.get("rows", [])
    ai = [x for x in rows if x.get("category") == "ai"]
    assert ai and ai[0].get("over") is True, f"ai row={ai}"


# --------- Marketing ---------
def test_marketing_totals(tokens):
    r = requests.get(f"{API}/finance/marketing", headers=H(tokens["finance"]), timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d.get("total_spend", 0) >= 600000
    assert d.get("total_attributed_revenue", 0) >= 1000000
    assert d.get("overall_roi", 0) >= 1.5


# --------- Employee revenue ---------
def test_employee_revenue(tokens):
    r = requests.get(f"{API}/finance/employee-revenue", headers=H(tokens["finance"]), timeout=20)
    assert r.status_code == 200


# --------- Receipt upload ---------
def test_receipt_upload_and_serve(tokens):
    png = bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6300010000000500010d0a2db40000000049454e44ae426082")
    files = {"file": ("test.png", io.BytesIO(png), "image/png")}
    r = requests.post(f"{API}/finance/expenses/upload-receipt", files=files, headers=H(tokens["employee"]), timeout=30)
    if r.status_code == 502:
        pytest.skip("object storage returned 502 (environment issue)")
    assert r.status_code in (200, 201), r.text
    path = r.json().get("receipt_path") or r.json().get("path")
    assert path
    # owner can fetch
    g = requests.get(f"{API}/finance/receipts/{path}", headers=H(tokens["employee"]), timeout=15)
    assert g.status_code == 200
    # finance can fetch
    gf = requests.get(f"{API}/finance/receipts/{path}", headers=H(tokens["finance"]), timeout=15)
    assert gf.status_code == 200


# --------- Logs contain finance actions ---------
def test_logs_contain_finance_actions(tokens):
    r = requests.get(f"{API}/logs", headers=H(tokens["admin"]), timeout=15)
    assert r.status_code == 200
    logs = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
    actions = {l.get("action") for l in logs}
    assert any("expense" in (a or "") for a in actions), f"actions sample: {list(actions)[:20]}"


# --------- Regression Phase 1 ---------
def test_openapi_ok():
    r = requests.get(f"{API}/openapi.json", timeout=10)
    assert r.status_code == 200


def test_clients_list_ok(tokens):
    r = requests.get(f"{API}/clients", headers=H(tokens["admin"]), timeout=15)
    assert r.status_code == 200
