"""v3.5 — client = company, one-time vs recurring projects, MRR / ARR, recurring invoice drafts, project edit fixes.
Self-contained: creates its own clients / projects (names tagged) and removes them afterwards."""
import os
import sys
import uuid
from datetime import date, timedelta

import pytest
import requests

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import revenue  # noqa: E402  (pure maths, no database)

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
def emp():
    return _login("employee@dotindot.in")


@pytest.fixture(scope="module")
def made(sa):
    """A client sent the old way (person in name, company in company) and two projects."""
    r = requests.post(f"{API}/clients", headers=sa, json={"name": f"Ravi {TAG}", "company": f"T35 Foods {TAG}", "industry": "restaurant", "state": "Tamil Nadu", "city": "Erode"})
    assert r.status_code == 200, r.text
    c = r.json()
    start = (date.today().replace(day=1) - timedelta(days=62)).replace(day=1).isoformat()
    rec = requests.post(f"{API}/projects", headers=sa, json={"kind": "client", "client_id": c["id"], "name": f"T35 social {TAG}  ", "status": "in_progress",
                                                         "billing_type": "recurring", "recurring_amount": 30000, "billing_cycle": "quarterly", "start_date": start})
    assert rec.status_code == 200, rec.text
    one = requests.post(f"{API}/projects", headers=sa, json={"kind": "client", "client_id": c["id"], "name": f"T35 website {TAG}", "budget": 120000,
                                                         "milestones": [{"title": "Design"}, {"title": "  "}], "deliverables": [{"item": "Home page"}]})
    assert one.status_code == 200, one.text
    yield {"client": c, "rec": rec.json(), "one": one.json(), "start": start}
    for d in requests.get(f"{API}/billing/docs", headers=sa, params={"client_id": c["id"]}).json():
        requests.delete(f"{API}/records/billing_docs/{d['id']}", headers=sa)
    requests.delete(f"{API}/clients/{c['id']}", headers=sa)


# ---------------------------------------------------------------- pure maths
def test_monthly_and_cycles():
    p = {"billing_type": "recurring", "recurring_amount": 30000, "billing_cycle": "quarterly", "start_date": "2026-01-15"}
    assert revenue.monthly(p) == 10000
    assert revenue.monthly({**p, "billing_cycle": "yearly", "recurring_amount": 120000}) == 10000
    assert revenue.monthly({**p, "kind": "internal"}) == 0
    assert revenue.monthly({**p, "billing_type": "one_time"}) == 0


def test_bill_dates_follow_the_cycle_and_month_ends():
    p = {"billing_type": "recurring", "recurring_amount": 1, "billing_cycle": "quarterly", "start_date": "2026-01-31"}
    got = [d.isoformat() for d in revenue.bill_dates(p, date(2026, 1, 1), date(2026, 12, 31))]
    assert got == ["2026-01-31", "2026-04-30", "2026-07-31", "2026-10-31"]
    p["end_date"] = "2026-06-30"
    assert [d.isoformat() for d in revenue.bill_dates(p, date(2026, 1, 1), date(2026, 12, 31))] == ["2026-01-31", "2026-04-30"]


def test_mrr_snapshot_and_on_hold():
    today = date(2026, 11, 17)
    p = {"billing_type": "recurring", "recurring_amount": 9000, "billing_cycle": "monthly", "start_date": "2026-05-10", "end_date": "2026-08-31", "status": "completed"}
    assert revenue.mrr_in_month(p, 2026, 8, today) == 9000      # live on 31 Aug
    assert revenue.mrr_in_month(p, 2026, 9, today) == 0
    assert revenue.mrr_in_month(p, 2026, 4, today) == 0
    q = {**p, "end_date": None, "status": "on_hold"}
    assert revenue.mrr_in_month(q, 2026, 11, today) == 0        # paused today
    assert revenue.mrr_in_month(q, 2026, 10, today) == 9000     # history stays


def test_movement():
    mv = revenue.movement({"a": 100, "b": 50, "c": 30}, {"a": 150, "b": 20, "d": 10})
    assert mv == {"new": 10, "expansion": 50, "contraction": 30, "churn": 30, "net": 0}


# ---------------------------------------------------------------- client = company
def test_client_is_the_company(sa, made):
    c = requests.get(f"{API}/clients/{made['client']['id']}", headers=sa).json()
    assert c["name"] == f"T35 Foods {TAG}" and c["company"] == c["name"]
    assert c["contact_name"] == f"Ravi {TAG}"
    assert c["contacts"][0]["role"] == "Main contact"


def test_one_letter_company_is_a_placeholder(sa):
    r = requests.post(f"{API}/clients", headers=sa, json={"name": f"T35 Solo {TAG}", "company": "x"})
    assert r.status_code == 200 and r.json()["name"] == f"T35 Solo {TAG}" and r.json()["company"] == r.json()["name"]
    requests.delete(f"{API}/records/clients/{r.json()['id']}", headers=sa, params={"permanent": True})


def test_rename_reaches_invoices(sa, made):
    cid = made["client"]["id"]
    r = requests.post(f"{API}/revenue/draft-invoices", headers=sa, json={"project_ids": [made["rec"]["id"]],
                      "month": revenue.ym(*map(int, made["start"][:7].split("-")))})
    assert r.status_code == 200, r.text
    assert len(r.json()["created"]) == 1
    requests.put(f"{API}/clients/{cid}", headers=sa, json={"name": f"T35 Foods Pvt Ltd {TAG}", "company": f"T35 Foods Pvt Ltd {TAG}"})
    docs = requests.get(f"{API}/billing/docs", headers=sa, params={"client_id": cid}).json()
    assert docs and all(d["client_name"] == f"T35 Foods Pvt Ltd {TAG}" for d in docs)
    projects = requests.get(f"{API}/projects", headers=sa, params={"client_id": cid}).json()
    assert all(p["client_name"] == f"T35 Foods Pvt Ltd {TAG}" for p in projects)


def test_search_finds_the_contact(sa, made):
    rows = requests.get(f"{API}/clients", headers=sa, params={"search": f"Ravi {TAG}"}).json()
    assert [r["id"] for r in rows] == [made["client"]["id"]]
    hits = requests.get(f"{API}/search", headers=sa, params={"q": f"Ravi {TAG}"}).json()["clients"]
    assert hits and hits[0]["contact_name"] == f"Ravi {TAG}"


# ---------------------------------------------------------------- projects
def test_project_billing_fields(sa, made):
    p = requests.get(f"{API}/projects/{made['rec']['id']}", headers=sa).json()
    assert p["name"] == f"T35 social {TAG}"                        # trimmed
    assert p["billing_type"] == "recurring" and p["mrr"] == 10000 and p["billing_label"] == "₹30,000 / quarter"
    assert p["service"] == "social"                                 # worked out from the name
    one = requests.get(f"{API}/projects/{made['one']['id']}", headers=sa).json()
    assert one["billing_type"] == "one_time" and one["mrr"] == 0
    assert [m["title"] for m in one["milestones"]] == ["Design"] and all(m.get("id") for m in one["milestones"])


@pytest.mark.parametrize("body,msg", [
    ({"billing_type": "recurring", "recurring_amount": 0}, "how much"),
    ({"billing_type": "recurring", "recurring_amount": 5000, "start_date": None}, "billing starts"),
    ({"billing_type": "weekly"}, "one_time or recurring"),
    ({"billing_type": "recurring", "recurring_amount": 5000, "start_date": "2026-01-01", "billing_cycle": "weekly"}, "Billing cycle"),
    ({"budget": -5}, "zero or more"),
    ({"start_date": "soon"}, "2026-11-30"),
    ({"start_date": "2026-05-01", "end_date": "2026-04-01"}, "after the start"),
    ({"service": "magic"}, "Unknown service"),
])
def test_project_billing_validation(sa, made, body, msg):
    r = requests.put(f"{API}/projects/{made['one']['id']}", headers=sa, json=body)
    assert r.status_code == 400 and msg in r.text, r.text


def test_nan_is_refused(sa, made):
    r = requests.put(f"{API}/projects/{made['one']['id']}", headers=sa, data='{"budget": NaN}')
    assert r.status_code in (400, 422)


def test_completing_a_recurring_project_stops_billing(sa, made):
    pid = made["rec"]["id"]
    assert requests.put(f"{API}/projects/{pid}", headers=sa, json={"status": "completed"}).status_code == 200
    p = requests.get(f"{API}/projects/{pid}", headers=sa).json()
    assert p["end_date"] and p["live"] is False
    requests.put(f"{API}/projects/{pid}", headers=sa, json={"status": "in_progress", "end_date": None})


def test_internal_projects_never_recur(sa):
    r = requests.post(f"{API}/projects", headers=sa, json={"kind": "internal", "name": f"T35 internal {TAG}", "billing_type": "recurring", "recurring_amount": 999, "start_date": "2026-01-01"})
    assert r.status_code == 200 and r.json()["billing_type"] == "one_time" and r.json()["mrr"] == 0
    requests.delete(f"{API}/projects/{r.json()['id']}", headers=sa)


def test_list_filters(sa, made):
    rows = requests.get(f"{API}/projects", headers=sa, params={"billing_type": "recurring", "client_id": made["client"]["id"]}).json()
    assert [r["id"] for r in rows] == [made["rec"]["id"]]
    rows = requests.get(f"{API}/clients", headers=sa, params={"billing": "recurring", "search": TAG}).json()
    assert rows and rows[0]["mrr"] == 10000 and rows[0]["arr"] == 120000


def test_toggle_old_milestones(sa, made):
    one = requests.get(f"{API}/projects/{made['one']['id']}", headers=sa).json()
    mid = one["milestones"][0]["id"]
    r = requests.patch(f"{API}/projects/{one['id']}/toggle", headers=sa, json={"kind": "milestone", "item_id": mid})
    assert r.status_code == 200
    assert requests.patch(f"{API}/projects/{one['id']}/toggle", headers=sa, json={"kind": "milestone", "item_id": "nope"}).status_code == 404


# ---------------------------------------------------------------- MRR / ARR
def test_summary(sa, made):
    s = requests.get(f"{API}/revenue/summary", headers=sa).json()
    assert s["arr"] == round(s["mrr"] * 12, 2)
    mine = next(c for c in s["by_client"] if c["client_id"] == made["client"]["id"])
    assert mine["mrr"] == 10000
    assert len(s["trend"]) == 12 and s["trend"][-1]["mrr"] == s["mrr"]
    assert {"new", "expansion", "contraction", "churn", "net"} <= set(s["this_month"])


def test_summary_needs_permission(emp):
    assert requests.get(f"{API}/revenue/summary", headers=emp).status_code == 403
    assert requests.post(f"{API}/revenue/draft-invoices", headers=emp, json={}).status_code == 403


def test_draft_invoices_once_per_period(sa, made):
    month = revenue.ym(*map(int, made["start"][:7].split("-")))
    r = requests.post(f"{API}/revenue/draft-invoices", headers=sa, json={"project_ids": [made["rec"]["id"]], "month": month}).json()
    assert r["created"] == [] and "Already invoiced" in r["skipped"][0]["reason"]
    assert requests.post(f"{API}/revenue/draft-invoices", headers=sa, json={"month": "2026-13"}).status_code == 400


def test_client_revenue_block(sa, made):
    c = requests.get(f"{API}/clients/{made['client']['id']}", headers=sa).json()
    assert c["revenue"]["mrr"] == 10000 and c["revenue"]["arr"] == 120000 and c["revenue"]["one_time_value"] == 120000
    assert c["recurring"] is True


def test_exports_have_billing_columns(sa):
    for ds in ("clients", "projects"):
        r = requests.get(f"{API}/exports/{ds}", headers=sa, params={"format": "xlsx"})
        assert r.status_code == 200, (ds, r.text[:200])
