"""Phase 3 backend tests: Sales module + CEO dashboard."""
import os
import pytest
import requests

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "https://agency-hub-490.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
PASSWORD = "Dotindot@2026"
USERS = {r: f"{r}@dotindot.com" for r in ("admin", "finance", "sales", "pm", "employee")}


def _login(email):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": PASSWORD}, timeout=20)
    assert r.status_code == 200
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def tokens():
    return {r: _login(e) for r, e in USERS.items()}


def H(t):
    return {"Authorization": f"Bearer {t}"}


# ---------- RBAC ----------
class TestRBAC:
    def test_employee_403_on_all_sales(self, tokens):
        for path in ["/sales/leads", "/sales/quotes", "/sales/overview", "/sales/targets"]:
            r = requests.get(f"{API}{path}", headers=H(tokens["employee"]))
            assert r.status_code == 403, f"{path} => {r.status_code}"

    def test_pm_finance_can_get_but_not_write(self, tokens):
        for role in ("pm", "finance"):
            assert requests.get(f"{API}/sales/leads", headers=H(tokens[role])).status_code == 200
            assert requests.get(f"{API}/sales/quotes", headers=H(tokens[role])).status_code == 200
            r = requests.post(f"{API}/sales/leads", headers=H(tokens[role]),
                              json={"name": "x", "company": "x", "stage": "new", "source": "other", "estimated_value": 0})
            assert r.status_code == 403
            r = requests.post(f"{API}/sales/leads/lead-01/stage", headers=H(tokens[role]), json={"stage": "contacted"})
            assert r.status_code == 403

    def test_ceo_dashboard_admin_only(self, tokens):
        assert requests.get(f"{API}/ceo/dashboard", headers=H(tokens["admin"])).status_code == 200
        for role in ("sales", "pm", "finance", "employee"):
            assert requests.get(f"{API}/ceo/dashboard", headers=H(tokens[role])).status_code == 403

    def test_sales_full_access(self, tokens):
        r = requests.get(f"{API}/sales/overview", headers=H(tokens["sales"]))
        assert r.status_code == 200


# ---------- Leads / Stage / Convert ----------
@pytest.fixture(scope="module")
def test_lead(tokens):
    """Create a fresh lead as sales for destructive tests."""
    payload = {"name": "TEST_ConvLead", "company": "TEST Corp", "stage": "new",
               "source": "referral", "estimated_value": 500000, "region": "India", "city": "Pune",
               "contact_email": "t@t.com", "contact_phone": "9999"}
    r = requests.post(f"{API}/sales/leads", headers=H(tokens["sales"]), json=payload)
    assert r.status_code == 200, r.text
    lead_id = r.json()["id"]
    yield lead_id
    # cleanup best-effort
    requests.delete(f"{API}/sales/leads/{lead_id}", headers=H(tokens["admin"]))


class TestLeadsStageConvert:
    def test_stage_history_grows(self, tokens, test_lead):
        for st in ("contacted", "qualified", "proposal", "won"):
            r = requests.post(f"{API}/sales/leads/{test_lead}/stage",
                              headers=H(tokens["sales"]), json={"stage": st})
            assert r.status_code == 200, r.text
        r = requests.get(f"{API}/sales/leads/{test_lead}", headers=H(tokens["sales"]))
        lead = r.json()
        assert lead["stage"] == "won"
        stages_in_hist = [h["stage"] for h in lead["stage_history"]]
        assert "won" in stages_in_hist
        assert len(lead["stage_history"]) >= 5
        for h in lead["stage_history"]:
            assert "at" in h and h["at"]

    def test_convert_new_client_and_double_convert_blocked(self, tokens, test_lead):
        # First conversion (new_client mode)
        r = requests.post(f"{API}/sales/leads/{test_lead}/convert",
                          headers=H(tokens["sales"]), json={"mode": "new_client"})
        assert r.status_code == 200, r.text
        cid = r.json()["client_id"]
        # Verify client exists
        clients = requests.get(f"{API}/clients", headers=H(tokens["admin"])).json()
        assert any(c["id"] == cid for c in clients)
        # Verify converted_client_id set
        lead = requests.get(f"{API}/sales/leads/{test_lead}", headers=H(tokens["sales"])).json()
        assert lead["converted_client_id"] == cid
        # Second conversion => 400
        r2 = requests.post(f"{API}/sales/leads/{test_lead}/convert",
                           headers=H(tokens["sales"]), json={"mode": "new_client"})
        assert r2.status_code == 400
        # Stage change on converted lead => 400
        r3 = requests.post(f"{API}/sales/leads/{test_lead}/stage",
                           headers=H(tokens["sales"]), json={"stage": "contacted"})
        assert r3.status_code == 400
        # cleanup client
        requests.delete(f"{API}/clients/{cid}", headers=H(tokens["admin"]))

    def test_lost_lead_convert_blocked(self, tokens):
        r = requests.post(f"{API}/sales/leads/lead-16/convert",
                          headers=H(tokens["sales"]), json={"mode": "new_client"})
        assert r.status_code == 400

    def test_already_converted_lead_blocked(self, tokens):
        r = requests.post(f"{API}/sales/leads/lead-12/convert",
                          headers=H(tokens["sales"]), json={"mode": "new_client"})
        assert r.status_code == 400


# ---------- Quotes ----------
class TestQuotes:
    def test_quote_math_with_gst(self, tokens):
        payload = {"title": "TEST Quote GST", "lead_id": "lead-07", "client_id": None,
                   "items": [{"description": "A", "qty": 2, "unit_price": 100000},
                             {"description": "B", "qty": 1, "unit_price": 50000}],
                   "gst_enabled": True, "validity_date": "2027-01-01", "status": "draft", "notes": ""}
        r = requests.post(f"{API}/sales/quotes", headers=H(tokens["sales"]), json=payload)
        assert r.status_code == 200, r.text
        q = r.json()
        assert q["subtotal"] == 250000
        assert q["gst_amount"] == 45000
        assert q["total"] == 295000
        assert q["number"].startswith("QTN-2026-")
        assert int(q["number"].split("-")[-1]) >= 9
        qid = q["id"]

        # Update with gst=false => gst 0
        upd = {"items": payload["items"], "gst_enabled": False}
        r2 = requests.put(f"{API}/sales/quotes/{qid}", headers=H(tokens["sales"]), json=upd)
        assert r2.status_code == 200
        q2 = requests.get(f"{API}/sales/quotes/{qid}", headers=H(tokens["sales"])).json()
        assert q2["gst_amount"] == 0
        assert q2["total"] == 250000

        requests.delete(f"{API}/sales/quotes/{qid}", headers=H(tokens["admin"]))

    def test_seeded_expired_quote(self, tokens):
        # Trigger lazy expiry
        requests.get(f"{API}/sales/quotes", headers=H(tokens["sales"]))
        r = requests.get(f"{API}/sales/quotes/sales-quote-08", headers=H(tokens["sales"]))
        assert r.status_code == 200
        assert r.json()["status"] == "expired"


# ---------- Targets / Overview ----------
class TestTargetsOverview:
    def test_targets_actuals(self, tokens):
        r = requests.get(f"{API}/sales/targets", headers=H(tokens["admin"]))
        assert r.status_code == 200
        targets = r.json()
        by_id = {t.get("id"): t for t in targets}
        # Just sanity: at least 4 seeded targets with pct computed
        for t in targets:
            assert "actual" in t and "pct" in t and "on_track" in t

    def test_overview_shape(self, tokens):
        r = requests.get(f"{API}/sales/overview", headers=H(tokens["sales"]))
        assert r.status_code == 200
        ov = r.json()
        for k in ("funnel", "conversion", "win_rate", "avg_deal_size",
                  "avg_days_to_close", "by_source", "followups", "targets"):
            assert k in ov
        assert isinstance(ov["by_source"], list) and len(ov["by_source"]) > 0
        assert isinstance(ov["followups"]["overdue"], list)

    def test_target_create_delete(self, tokens):
        payload = {"scope": "team", "period": "2027-01", "amount": 1000000}
        r = requests.post(f"{API}/sales/targets", headers=H(tokens["sales"]), json=payload)
        assert r.status_code == 200
        tid = r.json()["id"]
        r2 = requests.delete(f"{API}/sales/targets/{tid}", headers=H(tokens["admin"]))
        assert r2.status_code == 200


# ---------- Activities ----------
class TestActivities:
    def test_add_activity(self, tokens):
        r = requests.post(f"{API}/sales/leads/lead-07/activities",
                          headers=H(tokens["sales"]),
                          json={"type": "note", "text": "TEST activity", "date": "2026-09-30"})
        assert r.status_code == 200
        lead = requests.get(f"{API}/sales/leads/lead-07", headers=H(tokens["sales"])).json()
        assert any(a["text"] == "TEST activity" for a in lead["activities"])


# ---------- CEO Dashboard ----------
class TestCEODashboard:
    def test_dashboard_groups(self, tokens):
        r = requests.get(f"{API}/ceo/dashboard?period=this_month", headers=H(tokens["admin"]))
        assert r.status_code == 200
        d = r.json()
        for k in ("mrr", "cac", "revenue_per_employee", "retention", "margin",
                  "pipeline", "utilization", "regions"):
            assert k in d
        assert d["mrr"]["value"] > 0
        assert d["mrr"]["arr"] == round(d["mrr"]["value"] * 12, 2)
        assert isinstance(d["mrr"]["trend"], list) and len(d["mrr"]["trend"]) == 6
        assert isinstance(d["margin"]["trend"], list) and len(d["margin"]["trend"]) == 6
        assert isinstance(d["regions"]["top3"], list)

    def test_dashboard_period_switch(self, tokens):
        for p in ("this_month", "quarter", "ytd", "last_6_months"):
            r = requests.get(f"{API}/ceo/dashboard?period={p}", headers=H(tokens["admin"]))
            assert r.status_code == 200, p


# ---------- Activity Logs ----------
class TestLogs:
    def test_logs_contain_sales_events(self, tokens):
        r = requests.get(f"{API}/logs", headers=H(tokens["admin"]))
        assert r.status_code == 200
        actions = {l.get("action") for l in r.json()}
        assert "lead_created" in actions
        assert any(a.startswith("lead_stage_") for a in actions)
        assert "quote_created" in actions or any(a.startswith("quote_") for a in actions)
