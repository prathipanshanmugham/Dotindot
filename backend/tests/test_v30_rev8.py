"""v3.0 Revision 8 — permanent delete, branch pins, lead flow, support desk (client portal + internal), HR hub,
payroll (salary, PF / EPF, ESI, incentives), loans, investor portal, AI settings + agent API / MCP.

Self-contained: creates its own people, client, investor and records and cleans up, so it runs on an empty
production-like database (only admin@ + midhun@) as well as on a seeded demo database."""
import os
import uuid
from datetime import date
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://127.0.0.1:8001").rstrip("/")
API = f"{BASE_URL}/api"
PASSWORD = "Dotindot@2026"
TAG = uuid.uuid4().hex[:6]
MONTH = "2025-12"  # a month no demo payroll uses


def _login(email, password=PASSWORD):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}", "Content-Type": "application/json"}


def _bearer(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def sa():
    return _login("admin@dotindot.in")


@pytest.fixture(scope="module")
def ceo():
    return _login("midhun@dotindot.in")  # admin role (location CEO)


def _make_user(sa, label, role="employee"):
    email = f"t30-{label}-{TAG}@dotindot.in"
    r = requests.post(f"{API}/users", headers=sa, json={"name": f"T30 {label.title()}", "email": email, "password": PASSWORD, "role": role})
    assert r.status_code in (200, 201), r.text
    uid = r.json().get("id") or next(u["id"] for u in requests.get(f"{API}/users", headers=sa).json() if u["email"] == email)
    return {"id": uid, "email": email, "h": _login(email)}


@pytest.fixture(scope="module")
def emp(sa):
    e = _make_user(sa, "emp")
    yield e
    requests.delete(f"{API}/records/users/{e['id']}", headers=sa, params={"permanent": True})


@pytest.fixture(scope="module")
def emp2(sa):
    e = _make_user(sa, "emp2")
    yield e
    requests.delete(f"{API}/records/users/{e['id']}", headers=sa, params={"permanent": True})


@pytest.fixture(scope="module")
def emp3(sa):
    e = _make_user(sa, "emp3")
    yield e
    requests.delete(f"{API}/records/users/{e['id']}", headers=sa, params={"permanent": True})


@pytest.fixture(scope="module")
def hrm(sa):
    e = _make_user(sa, "hr", "hr")
    yield e
    requests.delete(f"{API}/records/users/{e['id']}", headers=sa, params={"permanent": True})


@pytest.fixture(scope="module")
def client(sa):
    r = requests.post(f"{API}/clients", headers=sa, json={"name": f"T30 Client {TAG}", "company": "T30 Co", "industry": "other", "status": "active"})
    assert r.status_code in (200, 201), r.text
    c = r.json()
    yield c
    requests.delete(f"{API}/records/clients/{c['id']}", headers=sa, params={"permanent": True})


def _portal(sa, client_id, label):
    email = f"t30-portal-{label}-{TAG}@client.example"
    r = requests.post(f"{API}/clients/{client_id}/portal-users", headers=sa, json={"name": f"Portal {label}", "email": email, "password": PASSWORD})
    assert r.status_code in (200, 201), r.text
    lr = requests.post(f"{API}/portal/login", json={"email": email, "password": PASSWORD})
    assert lr.status_code == 200, lr.text
    return _bearer(lr.json()["access_token"])


# ------------------------------------------------------------------ 1. permanent delete
class TestPermanentDelete:
    def test_super_admin_delete_forever_skips_recycle_bin(self, sa):
        c = requests.post(f"{API}/clients", headers=sa, json={"name": f"T30 Gone {TAG}", "company": "x", "industry": "other", "status": "active"}).json()
        r = requests.delete(f"{API}/records/clients/{c['id']}", headers=sa, params={"permanent": True})
        assert r.status_code == 200 and r.json()["permanent"] is True and r.json()["recoverable_hours"] == 0
        assert requests.get(f"{API}/clients/{c['id']}", headers=sa).status_code == 404
        bin_ = requests.get(f"{API}/workspace/recycle-bin", headers=sa).json()
        assert not any(s.get("record_id") == c["id"] for s in bin_), "a delete-forever must not leave a snapshot"

    def test_normal_delete_still_recoverable(self, sa):
        c = requests.post(f"{API}/clients", headers=sa, json={"name": f"T30 Undo {TAG}", "company": "x", "industry": "other", "status": "active"}).json()
        r = requests.delete(f"{API}/records/clients/{c['id']}", headers=sa)
        assert r.status_code == 200 and r.json()["recoverable_hours"] == 24
        assert any(s.get("record_id") == c["id"] for s in requests.get(f"{API}/workspace/recycle-bin", headers=sa).json())

    def test_only_super_admin_can_delete_forever(self, sa, ceo):
        c = requests.post(f"{API}/clients", headers=sa, json={"name": f"T30 Ceo {TAG}", "company": "x", "industry": "other", "status": "active"}).json()
        assert requests.delete(f"{API}/records/clients/{c['id']}", headers=ceo, params={"permanent": True}).status_code == 403
        assert requests.post(f"{API}/records/clients/bulk-delete", headers=ceo, json={"ids": [c["id"]], "permanent": True}).status_code == 403
        assert requests.delete(f"{API}/records/clients/{c['id']}", headers=ceo).status_code == 200  # recycle-bin delete is fine

    def test_workspace_lists_every_collection_and_wipe_needs_typed_confirm(self, sa, ceo, emp):
        keys = {c["key"] for c in requests.get(f"{API}/workspace/collections", headers=sa).json()}
        for k in ("tickets", "payslips", "loans", "investors", "ai_tokens", "client_leads", "hr_kt"):
            assert k in keys
        assert requests.post(f"{API}/workspace/hr_skill_plans/wipe", headers=sa, json={"confirm": "delete all"}).status_code == 400
        assert requests.post(f"{API}/workspace/hr_skill_plans/wipe", headers=ceo, json={"confirm": "DELETE ALL"}).status_code == 403
        requests.post(f"{API}/hr/skill-plans", headers=sa, json={"user_id": emp["id"], "skill": "Figma", "current_level": 1, "target_level": 3})
        r = requests.post(f"{API}/workspace/hr_skill_plans/wipe", headers=sa, json={"confirm": "DELETE ALL"})
        assert r.status_code == 200 and r.json()["deleted"] >= 1
        assert requests.get(f"{API}/hr/skill-plans", headers=sa).json() == []


# ------------------------------------------------------------------ 2. map pins
class TestBranchPins:
    def test_erode_has_its_own_coordinates(self, sa):
        geo = requests.get(f"{API}/locations/geo", headers=sa).json()
        er = geo["city_coords"]["Erode"]
        assert abs(er["lat"] - 11.34) < 0.1 and abs(er["lng"] - 77.72) < 0.1, er  # not Chennai's

    def test_parse_pin_text_and_reject_non_google_links(self, sa):
        r = requests.post(f"{API}/locations/parse-pin", headers=sa, json={"text": "11.3410, 77.7172"})
        assert r.status_code == 200 and r.json() == {"lat": 11.341, "lng": 77.7172}
        bad = requests.post(f"{API}/locations/parse-pin", headers=sa, json={"text": "http://169.254.169.254/latest maps.google.com"})
        assert bad.status_code == 400


# ------------------------------------------------------------------ 3. lead flow
class TestLeadFlow:
    def test_client_leads_flow_and_intake(self, sa, client):
        for src, stage in (("google_ads", "new"), ("google_ads", "converted"), ("instagram", "qualified")):
            r = requests.post(f"{API}/client-leads", headers=sa, json={"client_id": client["id"], "name": f"Lead {src} {stage}", "source": src, "stage": stage, "value": 1000})
            assert r.status_code in (200, 201), r.text
        f = requests.get(f"{API}/lead-flow", headers=sa, params={"scope": "clients", "client_id": client["id"], "start": "2020-01-01"}).json()
        assert f["totals"]["leads"] == 3
        assert {s["source"] for s in f["sources"]} >= {"google_ads", "instagram"}
        assert f["nodes"] and f["links"]
        key = requests.get(f"{API}/client-leads/intake-key", headers=sa, params={"client_id": client["id"]}).json()["key"]
        ok = requests.post(f"{API}/intake/leads/{key}", json={"name": "Web form lead", "phone": "+91 90000 00000", "source": "website"})
        assert ok.status_code in (200, 201), ok.text
        assert requests.post(f"{API}/intake/leads/lk_nope_{TAG}", json={"name": "x"}).status_code in (401, 403, 404)
        f2 = requests.get(f"{API}/lead-flow", headers=sa, params={"scope": "clients", "client_id": client["id"], "start": "2020-01-01"}).json()
        assert f2["totals"]["leads"] == 4

    def test_client_sees_own_leads_in_portal(self, sa, client):
        ph = _portal(sa, client["id"], "leads")
        r = requests.get(f"{API}/portal/leads", headers=ph, params={"period": "custom", "start": "2020-01-01", "end": date.today().isoformat()})
        assert r.status_code == 200, r.text

    def test_internal_flow_needs_permission(self, sa, emp):
        assert requests.get(f"{API}/lead-flow", headers=sa, params={"scope": "internal"}).status_code == 200
        assert requests.get(f"{API}/lead-flow", headers=emp["h"], params={"scope": "internal"}).status_code == 403


# ------------------------------------------------------------------ 4 + 9. support desk
class TestSupport:
    def test_internal_request_by_any_employee(self, sa, emp):
        t = requests.post(f"{API}/support/tickets", headers=emp["h"], json={"subject": f"Laptop {TAG}", "body": "Screen flickers", "category": "it", "priority": "high"})
        assert t.status_code in (200, 201), t.text
        tid = t.json()["id"]
        assert any(x["id"] == tid for x in requests.get(f"{API}/support/tickets", headers=emp["h"], params={"scope": "mine"}).json())
        assert requests.get(f"{API}/support/tickets", headers=emp["h"], params={"scope": "desk"}).status_code == 403
        assert any(x["id"] == tid for x in requests.get(f"{API}/support/tickets", headers=sa, params={"scope": "desk", "kind": "internal"}).json())
        requests.post(f"{API}/support/tickets/{tid}/messages", headers=sa, json={"body": "INTERNAL-NOTE-" + TAG, "internal": True})
        requests.post(f"{API}/support/tickets/{tid}/messages", headers=sa, json={"body": "We'll swap it tomorrow", "internal": False})
        mine = requests.get(f"{API}/support/tickets/{tid}", headers=emp["h"]).json()
        bodies = " ".join(m["body"] for m in mine["messages"])
        assert "swap it tomorrow" in bodies and "INTERNAL-NOTE" not in bodies

    def test_client_portal_support(self, sa, client):
        ph = _portal(sa, client["id"], "support")
        t = requests.post(f"{API}/portal/tickets", headers=ph, json={"subject": f"Website down {TAG}", "body": "Home page shows 500", "category": "website", "priority": "urgent"})
        assert t.status_code in (200, 201), t.text
        tid = t.json()["id"]
        desk = requests.get(f"{API}/support/tickets", headers=sa, params={"scope": "desk", "kind": "client", "client_id": client["id"]}).json()
        assert any(x["id"] == tid for x in desk)
        requests.post(f"{API}/support/tickets/{tid}/messages", headers=sa, json={"body": "SECRET-" + TAG, "internal": True})
        requests.post(f"{API}/support/tickets/{tid}/messages", headers=sa, json={"body": "Fixed — please check", "internal": False, "status": "resolved"})
        v = requests.get(f"{API}/portal/tickets/{tid}", headers=ph).json()
        assert "SECRET" not in " ".join(m["body"] for m in v["messages"])
        assert requests.post(f"{API}/portal/tickets/{tid}/rate", headers=ph, json={"score": 5, "comment": "Quick"}).status_code == 200
        # staff tokens don't work on the portal and portal tokens don't work on staff APIs
        assert requests.get(f"{API}/portal/tickets", headers=sa).status_code == 401
        assert requests.get(f"{API}/support/tickets", headers=ph).status_code == 401

    def test_client_cannot_open_another_clients_ticket(self, sa, client):
        other = requests.post(f"{API}/clients", headers=sa, json={"name": f"T30 Other {TAG}", "company": "o", "industry": "other", "status": "active"}).json()
        try:
            p1, p2 = _portal(sa, client["id"], "a"), _portal(sa, other["id"], "b")
            tid = requests.post(f"{API}/portal/tickets", headers=p1, json={"subject": "Mine", "body": "x", "category": "other"}).json()["id"]
            assert requests.get(f"{API}/portal/tickets/{tid}", headers=p2).status_code in (403, 404)
        finally:
            requests.delete(f"{API}/records/clients/{other['id']}", headers=sa, params={"permanent": True})


# ------------------------------------------------------------------ 8. HR hub
class TestHR:
    def test_hr_record_masks_sensitive_ids(self, sa, hrm, emp):
        r = requests.put(f"{API}/hr/people/{emp['id']}", headers=hrm["h"], json={"pan": "ABCDE1234F", "bank_account": "001122334455", "bank_name": "Indian Bank",
                                                                              "employee_code": f"T30-{TAG}", "emergency_contact": {"name": "Amma", "relation": "Parent", "phone": "+91 9"}})
        assert r.status_code == 200, r.text
        p = requests.get(f"{API}/hr/people/{emp['id']}", headers=hrm["h"]).json()
        text = str(p)
        assert "ABCDE1234F" not in text and "001122334455" not in text
        rv = requests.post(f"{API}/hr/people/{emp['id']}/reveal", headers=hrm["h"], json={"field": "pan"})
        assert rv.status_code == 200 and "ABCDE1234F" in str(rv.json())

    def test_employees_cannot_open_hr_records(self, emp):
        assert requests.get(f"{API}/hr/people", headers=emp["h"]).status_code == 403
        assert requests.get(f"{API}/hr/overview", headers=emp["h"]).status_code == 403
        assert requests.get(f"{API}/me/hr", headers=emp["h"]).status_code == 200

    def test_onboarding_visible_to_the_new_joiner(self, hrm, emp2, sa):
        r = requests.post(f"{API}/hr/onboarding", headers=hrm["h"], json={"user_id": emp2["id"], "start_date": date.today().isoformat()})
        assert r.status_code in (200, 201), r.text
        pid = r.json()["id"]
        mine = requests.get(f"{API}/hr/onboarding", headers=emp2["h"]).json()
        assert any(d["id"] == pid for d in mine)
        assert requests.get(f"{API}/hr/process/onboarding/{pid}", headers=emp2["h"]).status_code == 200

    def test_joiner_after_the_month_is_left_out_of_that_payroll(self, sa, emp2):
        # emp2's onboarding (above) set their join date to today, so a December 2025 payroll must not include them
        requests.put(f"{API}/hr/payroll/structures", headers=sa, json={"user_id": emp2["id"], "effective_from": "2025-01-01", "monthly": {"basic": 20000}})
        r = requests.post(f"{API}/hr/payroll/runs", headers=sa, json={"month": "2025-11"})
        if r.status_code == 409:
            pytest.skip("a November 2025 run already exists on this database")
        try:
            assert not any(p["user_id"] == emp2["id"] for p in r.json()["payslips"])
        finally:
            requests.delete(f"{API}/records/payroll_runs/{r.json()['id']}", headers=sa, params={"permanent": True})

    def test_knowledge_transfer(self, hrm, emp, emp2):
        r = requests.post(f"{API}/hr/kt", headers=hrm["h"], json={"from_id": emp["id"], "to_ids": [emp2["id"]], "topic": f"Client X handover {TAG}", "items": ["Logins", "Open tasks"]})
        assert r.status_code in (200, 201), r.text
        kid = r.json()["id"]
        assert any(k["id"] == kid for k in requests.get(f"{API}/me/kt", headers=emp2["h"]).json())


# ------------------------------------------------------------------ 5. payroll
class TestPayroll:
    @pytest.fixture(scope="class")
    @classmethod
    def run(cls, sa, emp, emp3):
        # emp: ₹50,000 gross (basic 30,000) → PF on the ₹25,000 ceiling, no ESI. emp3: ₹20,000 gross → ESI applies.
        for u, m in ((emp, {"basic": 30000, "hra": 12000, "special": 8000}), (emp3, {"basic": 10000, "hra": 4000, "special": 6000})):
            r = requests.put(f"{API}/hr/payroll/structures", headers=sa, json={"user_id": u["id"], "effective_from": "2025-04-01", "monthly": m})
            assert r.status_code == 200, r.text
        it = requests.post(f"{API}/hr/payroll/items", headers=sa, json={"user_id": emp["id"], "month": MONTH, "kind": "incentive", "title": "Target bonus", "amount": 5000})
        assert it.status_code in (200, 201), it.text
        assert requests.post(f"{API}/hr/payroll/items/{it.json()['id']}/approve", headers=sa).status_code == 200
        ln = requests.post(f"{API}/finance/loans", headers=sa, json={"name": f"Advance {TAG}", "direction": "lent", "kind": "employee_advance", "employee_id": emp3["id"],
                                                                     "principal": 4000, "rate_annual": 0, "method": "zero", "tenure_months": 2,
                                                                     "first_emi_date": f"{MONTH}-05", "recover_via_payroll": True})
        assert ln.status_code in (200, 201), ln.text
        old = next((x for x in requests.get(f"{API}/hr/payroll/runs", headers=sa).json()["runs"] if x["month"] == MONTH), None)
        if old:
            requests.delete(f"{API}/records/payroll_runs/{old['id']}", headers=sa, params={"permanent": True})
        r = requests.post(f"{API}/hr/payroll/runs", headers=sa, json={"month": MONTH})
        assert r.status_code in (200, 201), r.text
        yield r.json()
        requests.delete(f"{API}/records/payroll_runs/{r.json()['id']}", headers=sa, params={"permanent": True})
        requests.delete(f"{API}/records/loans/{ln.json()['id']}", headers=sa, params={"permanent": True})

    def _slip(self, sa, run, uid):
        row = next(s for s in run["payslips"] if s["user_id"] == uid)
        return requests.get(f"{API}/hr/payroll/payslips/{row['id']}", headers=sa).json()

    def test_pf_uses_25000_ceiling_and_incentive_flows_in(self, sa, run, emp):
        s = self._slip(sa, run, emp["id"])
        assert s["ee_pf"] == 3000           # 12 % of ₹25,000
        assert s["eps"] == 2083             # 8.33 % of ₹25,000
        assert s["er_epf"] == 917           # employer 3,000 − EPS
        assert s["ee_esi"] == 0 and not s["esi_applicable"]
        assert s["gross"] == 55000          # 50,000 fixed + 5,000 incentive
        assert any(e["name"] == "Target bonus" for e in s["earnings"])

    def test_esi_and_advance_recovery(self, sa, run, emp3):
        s = self._slip(sa, run, emp3["id"])
        assert s["ee_pf"] == 1200           # 12 % of ₹10,000 (≥ 50 % of fixed pay)
        assert s["esi_applicable"] and s["ee_esi"] == 150 and s["er_esi"] == 650
        assert any(d["code"] == "LOAN" and d["amount"] == 2000 for d in s["deductions"])

    def test_advance_recovery_never_exceeds_pay(self, sa, run, emp3):
        sid = next(s["id"] for s in run["payslips"] if s["user_id"] == emp3["id"])
        s = requests.put(f"{API}/hr/payroll/payslips/{sid}", headers=sa, json={"lop_days": 28}).json()
        loan = sum(d["amount"] for d in s["deductions"] if d["code"] == "LOAN")
        others = sum(d["amount"] for d in s["deductions"] if d["code"] != "LOAN")
        assert loan == max(0, min(2000, s["gross"] - others)) and loan < 2000
        assert s["net"] >= 0 and sum(l["amount"] for l in s["loan_lines"]) == loan
        requests.put(f"{API}/hr/payroll/payslips/{sid}", headers=sa, json={"lop_days": 0})

    def test_future_increment_does_not_apply_early(self, sa, run, emp):
        r = requests.put(f"{API}/hr/payroll/structures", headers=sa, json={"user_id": emp["id"], "effective_from": "2026-12-01",
                                                                          "monthly": {"basic": 40000, "hra": 16000, "special": 9000}, "reason": "Increment"})
        assert r.status_code == 200
        assert requests.post(f"{API}/hr/payroll/runs/{run['id']}/recalculate", headers=sa).status_code == 200
        fresh = requests.get(f"{API}/hr/payroll/runs/{run['id']}", headers=sa).json()
        s = self._slip(sa, fresh, emp["id"])
        assert s["gross"] == 55000, "the December 2025 slip must still use the salary in force then"

    def test_payslip_pdf_and_self_service(self, sa, run, emp):
        sid = next(s["id"] for s in run["payslips"] if s["user_id"] == emp["id"])
        pdf = requests.get(f"{API}/hr/payroll/payslips/{sid}/pdf", headers=sa)
        assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF"
        assert requests.get(f"{API}/hr/payroll/runs", headers=emp["h"]).status_code == 403
        assert requests.get(f"{API}/me/payslips", headers=emp["h"]).status_code == 200


# ------------------------------------------------------------------ 6. loans
class TestLoans:
    def test_emi_schedule_and_repayment(self, sa):
        pv = requests.post(f"{API}/finance/loans/preview", headers=sa, json={"principal": 100000, "rate_annual": 12, "tenure_months": 12, "method": "reducing",
                                                                            "first_emi_date": "2026-01-05"}).json()
        assert abs(pv["emi"] - 8884.88) < 0.5, pv["emi"]
        ln = requests.post(f"{API}/finance/loans", headers=sa, json={"name": f"Term loan {TAG}", "direction": "borrowed", "counterparty": "Test Bank",
                                                                     "principal": 100000, "rate_annual": 12, "tenure_months": 12, "first_emi_date": "2026-01-05"})
        assert ln.status_code in (200, 201), ln.text
        lid = ln.json()["id"]
        try:
            p = requests.post(f"{API}/finance/loans/{lid}/payments", headers=sa, json={"date": "2026-01-05", "amount": 8884.88})
            assert p.status_code in (200, 201), p.text
            v = requests.get(f"{API}/finance/loans/{lid}", headers=sa).json()
            assert abs(v["outstanding_principal"] - (100000 - (8884.88 - 1000))) < 1, v["outstanding_principal"]
        finally:
            requests.delete(f"{API}/records/loans/{lid}", headers=sa, params={"permanent": True})

    def test_loans_need_finance_access(self, emp):
        assert requests.get(f"{API}/finance/loans", headers=emp["h"]).status_code == 403


# ------------------------------------------------------------------ 7. investor portal
class TestInvestors:
    @pytest.fixture(scope="class")
    @classmethod
    def investor(cls, sa):
        inv = requests.post(f"{API}/investors", headers=sa, json={"name": f"T30 Investor {TAG}", "type": "individual", "email": f"inv-{TAG}@example.com"})
        assert inv.status_code in (200, 201), inv.text
        iid = inv.json()["id"]
        x = requests.post(f"{API}/investors/investments", headers=sa, json={"investor_id": iid, "date": "2025-04-01", "amount": 500000, "instrument": "debt", "interest_rate": 12})
        assert x.status_code in (200, 201), x.text
        rt = requests.post(f"{API}/investors/returns", headers=sa, json={"investor_id": iid, "date": "2025-10-01", "amount": 30000, "kind": "interest", "tds": 3000})
        assert rt.status_code in (200, 201), rt.text
        email = f"inv-login-{TAG}@example.com"
        lg = requests.post(f"{API}/investors/{iid}/logins", headers=sa, json={"name": "T30 Investor", "email": email, "password": "Investor@2026"})
        assert lg.status_code in (200, 201), lg.text
        yield {"id": iid, "email": email}
        requests.delete(f"{API}/records/investors/{iid}", headers=sa, params={"permanent": True})

    def test_investor_login_and_dashboard(self, investor):
        r = requests.post(f"{API}/investor-portal/login", json={"email": investor["email"], "password": "Investor@2026"})
        assert r.status_code == 200, r.text
        ih = _bearer(r.json()["access_token"])
        d = requests.get(f"{API}/investor-portal/dashboard", headers=ih).json()
        assert d["investor"]["id"] == investor["id"] and d["totals"]["invested"] == 500000
        assert len(d["returns"]) == 1
        pdf = requests.get(f"{API}/investor-portal/statement", headers=ih)
        assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF"
        # an investor token can't reach staff or client-portal data
        assert requests.get(f"{API}/clients", headers=ih).status_code == 401
        assert requests.get(f"{API}/portal/dashboard", headers=ih).status_code == 401

    def test_wrong_password_and_staff_token(self, sa, investor):
        assert requests.post(f"{API}/investor-portal/login", json={"email": investor["email"], "password": "nope-nope"}).status_code == 401
        assert requests.get(f"{API}/investor-portal/dashboard", headers=sa).status_code == 401

    def test_investor_records_are_super_admin_only(self, ceo, emp):
        assert requests.get(f"{API}/investors", headers=ceo).status_code == 403
        assert requests.get(f"{API}/investors", headers=emp["h"]).status_code == 403


# ------------------------------------------------------------------ 10. AI settings + agent access
class TestAI:
    @pytest.fixture(scope="class")
    @classmethod
    def token(cls, sa):
        s = requests.put(f"{API}/ai-settings", headers=sa, json={"enabled": True, "access": {"clients": "read", "leads": "write", "employees": "read"}})
        assert s.status_code == 200, s.text
        r = requests.post(f"{API}/ai-settings/tokens", headers=sa, json={"name": f"T30 agent {TAG}", "access": {"clients": "read", "leads": "write", "employees": "read"},
                                                                       "expires_days": 1})
        assert r.status_code == 200, r.text
        yield r.json()
        requests.post(f"{API}/ai-settings/tokens/{r.json()['id']}/revoke", headers=sa)

    def test_rest_api_respects_token_scope(self, token):
        h = _bearer(token["token"])
        mods = requests.get(f"{API}/ai/v1/modules", headers=h).json()["modules"]
        assert {m["module"] for m in mods} == {"clients", "leads", "employees"}
        assert requests.get(f"{API}/ai/v1/records/clients", headers=h, params={"limit": 5}).status_code == 200
        assert requests.get(f"{API}/ai/v1/records/payroll", headers=h).status_code == 403
        assert requests.get(f"{API}/ai/v1/records/investors", headers=h).status_code == 403
        people = requests.get(f"{API}/ai/v1/records/employees", headers=h, params={"limit": 50}).json()["records"]
        assert people and all("password_hash" not in p and "hr" not in p for p in people)

    def test_mcp_initialize_list_and_call(self, token):
        h = {**_bearer(token["token"]), "Accept": "application/json, text/event-stream"}
        init = requests.post(f"{API}/ai/mcp", headers=h, json={"jsonrpc": "2.0", "id": 1, "method": "initialize",
                                                             "params": {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "pytest", "version": "1"}}}).json()
        assert init["result"]["protocolVersion"] == "2025-06-18" and "tools" in init["result"]["capabilities"]
        assert requests.post(f"{API}/ai/mcp", headers=h, json={"jsonrpc": "2.0", "method": "notifications/initialized"}).status_code == 202
        tools = {t["name"] for t in requests.post(f"{API}/ai/mcp", headers=h, json={"jsonrpc": "2.0", "id": 2, "method": "tools/list"}).json()["result"]["tools"]}
        assert {"list_modules", "query_records", "search", "business_summary", "create_record", "update_record"} <= tools
        res = requests.post(f"{API}/ai/mcp", headers=h, json={"jsonrpc": "2.0", "id": 3, "method": "tools/call",
                                                            "params": {"name": "create_record", "arguments": {"module": "leads", "data": {"name": f"AI lead {TAG}", "source": "website"}}}}).json()
        assert res["result"]["isError"] is False
        denied = requests.post(f"{API}/ai/mcp", headers=h, json={"jsonrpc": "2.0", "id": 4, "method": "tools/call",
                                                               "params": {"name": "create_record", "arguments": {"module": "clients", "data": {"name": "x"}}}}).json()
        assert denied["result"]["isError"] is True

    def test_every_call_is_logged_and_revoke_works(self, sa):
        r = requests.post(f"{API}/ai-settings/tokens", headers=sa, json={"name": f"T30 revoke {TAG}", "access": {"clients": "read"}, "expires_days": 1}).json()
        h = _bearer(r["token"])
        assert requests.get(f"{API}/ai/v1/summary", headers=h).status_code == 200
        assert any(l["token_id"] == r["id"] for l in requests.get(f"{API}/ai-settings/log", headers=sa).json())
        assert requests.post(f"{API}/ai-settings/tokens/{r['id']}/revoke", headers=sa).status_code == 200
        assert requests.get(f"{API}/ai/v1/summary", headers=h).status_code == 401
        assert requests.get(f"{API}/ai/v1/summary", headers=_bearer("dai_not_a_real_token")).status_code == 401

    def test_ceo_cannot_share_investor_data_with_ai(self, ceo):
        assert requests.put(f"{API}/ai-settings", headers=ceo, json={"sensitive": {"investors": True}}).status_code == 403
        assert requests.post(f"{API}/ai-settings/tokens", headers=ceo, json={"name": "sneaky", "access": {"investors": "read"}}).status_code == 403

    def test_ai_settings_need_permission_and_keys_are_masked(self, sa, emp):
        assert requests.get(f"{API}/ai-settings", headers=emp["h"]).status_code == 403
        key = "sk-ant-test-" + uuid.uuid4().hex
        r = requests.put(f"{API}/ai-settings/providers/anthropic", headers=sa, json={"api_key": key, "model": "claude-sonnet-5-5"})
        assert r.status_code == 200 and key not in r.text and r.json()["providers"]["anthropic"]["key_hint"] == "…" + key[-4:]
        requests.put(f"{API}/ai-settings/providers/anthropic", headers=sa, json={"remove": True})


# ------------------------------------------------------------------ fixes from the independent review
class TestReviewFixes:
    def test_assigned_scope_cannot_be_widened_with_assignee(self, sa, emp, emp2):
        t = requests.post(f"{API}/support/tickets", headers=emp["h"], json={"subject": f"Private HR {TAG}", "body": "Salary question", "category": "hr"}).json()
        requests.put(f"{API}/support/tickets/{t['id']}", headers=sa, json={"assignee_id": emp["id"]})
        for a in (emp["id"], "none", "user-finance"):
            rows = requests.get(f"{API}/support/tickets", headers=emp2["h"], params={"scope": "assigned", "assignee": a}).json()
            assert all(r["assignee_id"] == emp2["id"] for r in rows), a
        assert requests.get(f"{API}/support/tickets", headers=emp["h"], params={"scope": "mine", "q": "(["}).status_code == 200

    def test_admin_cannot_grant_investor_access(self, ceo, emp):
        r = requests.put(f"{API}/access/users/{emp['id']}/permissions", headers=ceo, json={"overrides": {"investors": True}})
        assert r.status_code == 403
        assert requests.get(f"{API}/investors", headers=emp["h"]).status_code == 403

    def test_uan_masked_outside_the_pf_return(self, sa, emp3):
        requests.put(f"{API}/hr/people/{emp3['id']}", headers=sa, json={"uan": "101299887766"})
        fin = _make_user(sa, "fin", "finance")
        try:
            r = requests.post(f"{API}/hr/payroll/runs", headers=sa, json={"month": "2025-10"})
            if r.status_code == 409:
                pytest.skip("an October 2025 run already exists on this database")
            run = r.json()
            try:
                sid = next(s["id"] for s in run["payslips"] if s["user_id"] == emp3["id"])
                slip = requests.get(f"{API}/hr/payroll/payslips/{sid}", headers=fin["h"]).json()
                assert "101299887766" not in str(slip) and slip.get("uan_masked", "").endswith("7766")
                st_fin = requests.get(f"{API}/hr/payroll/runs/{run['id']}/statutory", headers=fin["h"]).json()
                assert "101299887766" not in str(st_fin)
                st_sa = requests.get(f"{API}/hr/payroll/runs/{run['id']}/statutory", headers=sa).json()
                assert "101299887766" in str(st_sa)  # payroll managers file the ECR
            finally:
                requests.delete(f"{API}/records/payroll_runs/{run['id']}", headers=sa, params={"permanent": True})
        finally:
            requests.delete(f"{API}/records/users/{fin['id']}", headers=sa, params={"permanent": True})

    def test_ai_filters_and_hidden_fields(self, sa):
        requests.put(f"{API}/ai-settings", headers=sa, json={"enabled": True, "access": {"employees": "read", "clients": "read", "hr": "read"}})
        tok = requests.post(f"{API}/ai-settings/tokens", headers=sa, json={"name": f"T30 filters {TAG}", "access": {"employees": "read", "clients": "read", "hr": "read"},
                                                                         "expires_days": 1}).json()
        h = _bearer(tok["token"])
        try:
            assert requests.get(f"{API}/ai/v1/records/employees", headers=h, params={"filter[hr.date_of_birth]": "1998-12-02"}).status_code == 403
            assert requests.get(f"{API}/ai/v1/records/employees", headers=h, params={"filter[deleted]": "true"}).status_code == 403
            assert requests.get(f"{API}/ai/v1/records/employees", headers=h, params={"filter[role]": "employee"}).status_code == 200
            c = requests.post(f"{API}/clients", headers=sa, json={"name": f"T30 Contacts {TAG}", "company": "c", "industry": "other", "status": "active",
                                                                 "contacts": [{"name": "Ravi", "email": "ravi@c.example", "phone": "+91 90000 12345"}]}).json()
            try:
                rec = requests.get(f"{API}/ai/v1/records/clients/{c['id']}", headers=h).json()["record"]
                assert "90000 12345" not in str(rec)
            finally:
                requests.delete(f"{API}/records/clients/{c['id']}", headers=sa, params={"permanent": True})
        finally:
            requests.post(f"{API}/ai-settings/tokens/{tok['id']}/revoke", headers=sa)

    def test_exit_details_stay_with_hr(self, sa, hrm):
        leaver = _make_user(sa, "leaver")
        try:
            r = requests.post(f"{API}/hr/offboarding", headers=hrm["h"], json={"user_id": leaver["id"], "type": "resignation", "last_working_day": date.today().isoformat(),
                                                                             "reason": f"PRIVATE-REASON-{TAG}", "create_kt": False})
            assert r.status_code in (200, 201), r.text
            pid = r.json()["id"]
            requests.put(f"{API}/hr/offboarding/{pid}", headers=hrm["h"], json={"exit_interview_notes": f"NOTES-{TAG}", "rehire_eligible": False})
            mine = requests.get(f"{API}/hr/offboarding", headers=leaver["h"]).json()
            assert any(d["id"] == pid for d in mine)
            text = str(mine) + str(requests.get(f"{API}/hr/process/offboarding/{pid}", headers=leaver["h"]).json())
            assert "PRIVATE-REASON" not in text and "NOTES-" not in text and "rehire_eligible" not in text
            assert f"PRIVATE-REASON-{TAG}" in str(requests.get(f"{API}/hr/process/offboarding/{pid}", headers=hrm["h"]).json())
        finally:
            requests.delete(f"{API}/records/users/{leaver['id']}", headers=sa, params={"permanent": True})

    def test_ctc_split_matches_cost_to_company(self, sa):
        for ctc in (600000, 300000, 1800000):
            pv = requests.post(f"{API}/hr/payroll/structures/preview", headers=sa, json={"ctc_annual": ctc}).json()
            assert abs(pv["estimate"]["employer_cost"] * 12 - ctc) <= 24, (ctc, pv["estimate"]["employer_cost"] * 12)
        pv = requests.post(f"{API}/hr/payroll/structures/preview", headers=sa, json={"ctc_annual": 600000, "basic_percent_of_gross": 40}).json()
        assert abs(pv["estimate"]["employer_cost"] * 12 - 600000) <= 24
