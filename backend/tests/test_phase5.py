"""Phase 5 tests: exports, reports templates, custom builder, notifications, stale users."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"
PW = "Dotindot@2026"

USERS = {
    "admin": "admin@dotindot.com",
    "finance": "finance@dotindot.com",
    "sales": "sales@dotindot.com",
    "pm": "pm@dotindot.com",
    "employee": "employee@dotindot.com",
}


@pytest.fixture(scope="session")
def tokens():
    out = {}
    for role, email in USERS.items():
        r = requests.post(f"{API}/auth/login", json={"email": email, "password": PW}, timeout=30)
        assert r.status_code == 200, f"login {role} failed: {r.status_code} {r.text}"
        out[role] = r.json()["access_token"]
    return out


def hdr(tok):
    return {"Authorization": f"Bearer {tok}"}


DATASETS = ["clients", "projects", "ledger", "expenses", "subscriptions", "budgets",
            "ai-spend", "marketing", "project-profit", "employee-revenue",
            "leads", "quotes", "targets", "employees", "partnerships", "logs"]


# --- Exports: admin gets valid files for all 16 datasets in both formats ---
@pytest.mark.parametrize("dataset", DATASETS)
@pytest.mark.parametrize("fmt", ["xlsx", "pdf"])
def test_export_admin_valid(tokens, dataset, fmt):
    r = requests.get(f"{API}/exports/{dataset}?format={fmt}", headers=hdr(tokens["admin"]), timeout=60)
    assert r.status_code == 200, f"{dataset}/{fmt}: {r.status_code} {r.text[:200]}"
    ct = r.headers.get("content-type", "")
    if fmt == "pdf":
        assert "application/pdf" in ct
        assert r.content[:4] == b"%PDF"
    else:
        assert "spreadsheetml" in ct
        assert r.content[:2] == b"PK"
    assert len(r.content) > 1000, f"{dataset}/{fmt} too small: {len(r.content)}"
    disp = r.headers.get("content-disposition", "")
    assert f"dotindot-{dataset}-" in disp and f".{fmt}" in disp


# --- Filters honored ---
def test_export_ledger_filter_income(tokens):
    unfiltered = requests.get(f"{API}/exports/ledger?format=xlsx", headers=hdr(tokens["admin"]), timeout=30)
    filtered = requests.get(f"{API}/exports/ledger?format=xlsx&type=income", headers=hdr(tokens["admin"]), timeout=30)
    assert unfiltered.status_code == 200 and filtered.status_code == 200
    # Compare against actual transaction endpoint
    tx = requests.get(f"{API}/finance/transactions?type=income", headers=hdr(tokens["admin"]), timeout=30)
    assert tx.status_code == 200
    assert len(filtered.content) != len(unfiltered.content) or len(tx.json()) == 0


def test_export_clients_status_filter(tokens):
    r = requests.get(f"{API}/exports/clients?format=xlsx&status=active", headers=hdr(tokens["admin"]), timeout=30)
    assert r.status_code == 200
    assert r.content[:2] == b"PK"


def test_export_logs_action_filter(tokens):
    r = requests.get(f"{API}/exports/logs?format=xlsx&action=login", headers=hdr(tokens["admin"]), timeout=30)
    assert r.status_code == 200
    assert r.content[:2] == b"PK"


# --- RBAC on exports ---
@pytest.mark.parametrize("dataset", ["ledger", "logs", "subscriptions", "partnerships"])
def test_export_employee_forbidden(tokens, dataset):
    r = requests.get(f"{API}/exports/{dataset}?format=xlsx", headers=hdr(tokens["employee"]), timeout=30)
    assert r.status_code == 403


@pytest.mark.parametrize("dataset", ["ledger", "budgets"])
def test_export_sales_forbidden(tokens, dataset):
    r = requests.get(f"{API}/exports/{dataset}?format=xlsx", headers=hdr(tokens["sales"]), timeout=30)
    assert r.status_code == 403


def test_export_employee_allowed(tokens):
    for d in ("projects", "employees"):
        r = requests.get(f"{API}/exports/{d}?format=xlsx", headers=hdr(tokens["employee"]), timeout=30)
        assert r.status_code == 200, f"{d}: {r.status_code}"


def test_export_pm_project_profit(tokens):
    r = requests.get(f"{API}/exports/project-profit?format=xlsx", headers=hdr(tokens["pm"]), timeout=30)
    assert r.status_code == 200


# --- Single quote PDF ---
def test_export_quote_pdf(tokens):
    q = requests.get(f"{API}/sales/quotes", headers=hdr(tokens["admin"]), timeout=30)
    assert q.status_code == 200
    quotes = q.json()
    assert len(quotes) > 0
    qid = quotes[0]["id"]
    r = requests.get(f"{API}/exports/quote/{qid}", headers=hdr(tokens["admin"]), timeout=30)
    assert r.status_code == 200
    assert r.content[:4] == b"%PDF"
    assert len(r.content) > 1000

    # employee 403
    r2 = requests.get(f"{API}/exports/quote/{qid}", headers=hdr(tokens["employee"]), timeout=30)
    assert r2.status_code == 403


# --- Export logs ---
def test_exports_are_logged(tokens):
    # trigger an export
    requests.get(f"{API}/exports/clients?format=xlsx", headers=hdr(tokens["admin"]), timeout=30)
    r = requests.get(f"{API}/logs?action=report_exported", headers=hdr(tokens["admin"]), timeout=30)
    assert r.status_code == 200
    logs = r.json()
    assert len(logs) > 0
    # Endpoint may return {items:...} or list; handle both
    items = logs.get("items", logs) if isinstance(logs, dict) else logs
    assert any(l.get("entity_type") in ("export", "report") for l in items)


# --- Report templates listing per role ---
def test_templates_admin(tokens):
    r = requests.get(f"{API}/reports/templates", headers=hdr(tokens["admin"]), timeout=30)
    assert r.status_code == 200
    keys = {t["key"] for t in r.json()}
    assert keys == {"monthly-financial", "client-status", "sales-pipeline", "employee-activity"}


def test_templates_finance(tokens):
    r = requests.get(f"{API}/reports/templates", headers=hdr(tokens["finance"]), timeout=30)
    assert r.status_code == 200
    keys = {t["key"] for t in r.json()}
    assert keys == {"monthly-financial", "client-status"}


def test_templates_sales(tokens):
    r = requests.get(f"{API}/reports/templates", headers=hdr(tokens["sales"]), timeout=30)
    assert r.status_code == 200
    keys = {t["key"] for t in r.json()}
    assert keys == {"sales-pipeline"}


def test_templates_pm(tokens):
    r = requests.get(f"{API}/reports/templates", headers=hdr(tokens["pm"]), timeout=30)
    assert r.status_code == 200
    keys = {t["key"] for t in r.json()}
    assert keys == {"client-status"}


def test_templates_employee_forbidden(tokens):
    r = requests.get(f"{API}/reports/templates", headers=hdr(tokens["employee"]), timeout=30)
    assert r.status_code == 403


# --- Template generation content ---
def test_template_monthly_financial(tokens):
    r = requests.get(f"{API}/reports/template/monthly-financial?date_from=2026-08-01&date_to=2026-08-31",
                     headers=hdr(tokens["admin"]), timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert "title" in d and "period" in d and "summary" in d and "sections" in d
    labels = {s["label"] for s in d["summary"]}
    assert {"Income", "Expenses", "Net"}.issubset(labels)
    section_titles = [s["title"] for s in d["sections"]]
    assert any("category" in (t or "").lower() for t in section_titles)


def test_template_client_status(tokens):
    r = requests.get(f"{API}/reports/template/client-status", headers=hdr(tokens["admin"]), timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert d["sections"][0]["rows"], "client rows empty"
    cols = {c["key"] for c in d["sections"][0]["columns"]}
    assert {"health", "next_contract_expiry", "revenue"}.issubset(cols)


def test_template_sales_pipeline(tokens):
    r = requests.get(f"{API}/reports/template/sales-pipeline", headers=hdr(tokens["admin"]), timeout=30)
    assert r.status_code == 200
    d = r.json()
    labels = {s["label"] for s in d["summary"]}
    assert "Win rate" in labels


def test_template_employee_activity(tokens):
    r = requests.get(f"{API}/reports/template/employee-activity", headers=hdr(tokens["admin"]), timeout=30)
    assert r.status_code == 200
    d = r.json()
    rows = d["sections"][0]["rows"]
    assert len(rows) > 0


# --- Template export files & RBAC ---
@pytest.mark.parametrize("key", ["monthly-financial", "client-status", "sales-pipeline", "employee-activity"])
@pytest.mark.parametrize("fmt", ["pdf", "xlsx"])
def test_template_export_admin(tokens, key, fmt):
    r = requests.get(f"{API}/reports/template/{key}/export?format={fmt}", headers=hdr(tokens["admin"]), timeout=45)
    assert r.status_code == 200
    if fmt == "pdf":
        assert r.content[:4] == b"%PDF"
    else:
        assert r.content[:2] == b"PK"
    assert len(r.content) > 1000


def test_template_rbac_sales_forbidden_financial(tokens):
    r = requests.get(f"{API}/reports/template/monthly-financial", headers=hdr(tokens["sales"]), timeout=30)
    assert r.status_code == 403
    r2 = requests.get(f"{API}/reports/template/monthly-financial/export?format=pdf", headers=hdr(tokens["sales"]), timeout=30)
    assert r2.status_code == 403


def test_template_rbac_finance_forbidden_pipeline(tokens):
    r = requests.get(f"{API}/reports/template/sales-pipeline", headers=hdr(tokens["finance"]), timeout=30)
    assert r.status_code == 403


# --- Custom builder ---
def test_custom_meta_admin(tokens):
    r = requests.get(f"{API}/reports/custom/meta", headers=hdr(tokens["admin"]), timeout=30)
    assert r.status_code == 200
    keys = {m["key"] for m in r.json()}
    assert keys == {"clients", "projects", "ledger", "expenses", "leads", "quotes"}


def test_custom_meta_pm(tokens):
    r = requests.get(f"{API}/reports/custom/meta", headers=hdr(tokens["pm"]), timeout=30)
    assert r.status_code == 200
    keys = {m["key"] for m in r.json()}
    assert keys == {"clients", "projects"}


def test_custom_meta_sales(tokens):
    r = requests.get(f"{API}/reports/custom/meta", headers=hdr(tokens["sales"]), timeout=30)
    assert r.status_code == 200
    keys = {m["key"] for m in r.json()}
    assert keys == {"clients", "projects", "leads", "quotes"}


def test_custom_meta_employee_forbidden(tokens):
    r = requests.get(f"{API}/reports/custom/meta", headers=hdr(tokens["employee"]), timeout=30)
    assert r.status_code == 403


def test_custom_preview_ledger_income(tokens):
    body = {"module": "ledger", "date_from": "2026-06-01", "date_to": "2026-09-07",
            "filters": {"type": "income"}, "columns": ["date", "category", "amount"]}
    r = requests.post(f"{API}/reports/custom/preview", json=body, headers=hdr(tokens["admin"]), timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert d["total"] > 0
    assert len(d["rows"]) <= 20
    col_keys = [c["key"] for c in d["columns"]]
    assert col_keys == ["date", "category", "amount"]


def test_custom_export_xlsx(tokens):
    body = {"module": "ledger", "date_from": "2026-06-01", "date_to": "2026-09-07",
            "filters": {"type": "income"}, "columns": ["date", "category", "amount"], "format": "xlsx"}
    r = requests.post(f"{API}/reports/custom/export", json=body, headers=hdr(tokens["admin"]), timeout=45)
    assert r.status_code == 200
    assert r.content[:2] == b"PK"
    assert len(r.content) > 1000


def test_custom_sales_forbidden_ledger(tokens):
    body = {"module": "ledger", "filters": {}, "columns": []}
    r = requests.post(f"{API}/reports/custom/preview", json=body, headers=hdr(tokens["sales"]), timeout=30)
    assert r.status_code == 403


# --- Notifications ---
def test_notifications_admin(tokens):
    r = requests.get(f"{API}/notifications", headers=hdr(tokens["admin"]), timeout=30)
    assert r.status_code == 200
    data = r.json()
    items = data if isinstance(data, list) else data.get("items", [])
    assert len(items) > 0
    kinds = {i.get("kind") for i in items}
    allowed = {"contract", "subscription", "partnership", "expense", "followup", "training"}
    assert kinds.issubset(allowed | {None})


def test_notifications_finance_no_followup(tokens):
    r = requests.get(f"{API}/notifications", headers=hdr(tokens["finance"]), timeout=30)
    assert r.status_code == 200
    data = r.json()
    items = data if isinstance(data, list) else data.get("items", [])
    kinds = {i.get("kind") for i in items}
    assert "followup" not in kinds


def test_notifications_sales_only_contract_followup(tokens):
    r = requests.get(f"{API}/notifications", headers=hdr(tokens["sales"]), timeout=30)
    assert r.status_code == 200
    data = r.json()
    items = data if isinstance(data, list) else data.get("items", [])
    kinds = {i.get("kind") for i in items}
    assert kinds.issubset({"contract", "followup"})


def test_notifications_employee_only_training(tokens):
    r = requests.get(f"{API}/notifications", headers=hdr(tokens["employee"]), timeout=30)
    assert r.status_code == 200
    data = r.json()
    items = data if isinstance(data, list) else data.get("items", [])
    kinds = {i.get("kind") for i in items}
    forbidden = {"contract", "subscription", "expense"}
    assert not (kinds & forbidden)


# --- Stale users removed ---
def test_stale_users_removed(tokens):
    r = requests.get(f"{API}/employees", headers=hdr(tokens["admin"]), timeout=30)
    assert r.status_code == 200
    users = r.json()
    emails = [u["email"] for u in users]
    assert all(not e.endswith("@dotindot.test") for e in emails)
    assert len(users) == 8, f"expected 8 users, got {len(users)}: {emails}"
