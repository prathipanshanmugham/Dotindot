"""v2.8 Revision 7 — location-wise org chart, weekly timesheets, holiday calendar, 8 new report templates.

Self-contained: creates its own employee, holidays, org box and timesheet, then cleans up, so it runs on an
empty production-like database (only admin@ + midhun@) as well as on a seeded demo database."""
import os
import uuid
from datetime import date, timedelta
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


def _make_user(ah, label, role="employee"):
    email = f"t28-{label}-{TAG}@dotindot.in"
    r = requests.post(f"{API}/users", headers=ah, json={"name": f"T28 {label.title()}", "email": email, "password": PASSWORD, "role": role})
    assert r.status_code in (200, 201), r.text
    uid = r.json().get("id") or next(u["id"] for u in requests.get(f"{API}/users", headers=ah).json() if u["email"] == email)
    return {"id": uid, "email": email, "h": _login(email)}


@pytest.fixture(scope="module")
def emp(ah):
    e = _make_user(ah, "emp")
    yield e
    requests.delete(f"{API}/records/users/{e['id']}", headers=ah)


@pytest.fixture(scope="module")
def fin(ah):
    e = _make_user(ah, "fin", "finance")
    yield e
    requests.delete(f"{API}/records/users/{e['id']}", headers=ah)


@pytest.fixture(scope="module")
def pm(ah):
    e = _make_user(ah, "pm", "pm")
    yield e
    requests.delete(f"{API}/records/users/{e['id']}", headers=ah)


def last_week():
    t = date.today()
    mon = t - timedelta(days=t.weekday() + 7)
    return mon, [(mon + timedelta(days=i)).isoformat() for i in range(7)]


# ====================================================================== permissions
class TestPermissions:
    def test_new_key(self, ah, emp):
        assert "holidays.manage" in str(requests.get(f"{API}/access/registry", headers=ah).json())
        assert "holidays.manage" not in requests.get(f"{API}/me/permissions", headers=emp["h"]).json()["permissions"]


# ====================================================================== holidays
@pytest.fixture(scope="module")
def branch(ah):
    r = requests.post(f"{API}/locations/branches", headers=ah, json={"name": f"T28 Branch {TAG}", "city": "Testpur", "country": "India", "lat": 11.0, "lng": 77.0})
    assert r.status_code in (200, 201), r.text
    b = r.json()
    yield b
    requests.delete(f"{API}/locations/branches/{b['id']}", headers=ah)


class TestHolidays:
    def test_validation_and_permissions(self, ah, emp, branch):
        assert requests.post(f"{API}/holidays", headers=emp["h"], json={"date": "2031-01-01", "name": "X"}).status_code == 403
        assert requests.post(f"{API}/holidays", headers=ah, json={"date": "2031-13-01", "name": "X"}).status_code == 400
        assert requests.post(f"{API}/holidays", headers=ah, json={"date": "2031-01-02", "name": "X", "type": "party"}).status_code == 400
        assert requests.post(f"{API}/holidays", headers=ah, json={"date": "2031-01-02", "name": "X", "branch_ids": ["nope"]}).status_code == 400

    def test_create_list_bulk_and_delete(self, ah, emp, branch):
        r = requests.post(f"{API}/holidays", headers=ah, json={"date": "2031-01-15", "name": f"T28 Fest {TAG}", "type": "public", "branch_ids": [branch["id"]]})
        assert r.status_code == 200, r.text
        h = r.json()
        assert h["day_off"] is True and h["locations"] == [branch["name"]]
        assert requests.post(f"{API}/holidays", headers=ah, json={"date": "2031-01-15", "name": f"t28 fest {TAG}"}).status_code == 409
        b = requests.post(f"{API}/holidays/bulk", headers=ah, json={"rows": [{"date": "2031-02-01", "name": f"T28 A {TAG}"},
                                                                               {"date": "2031-02-02", "name": f"T28 B {TAG}", "type": "optional"},
                                                                               {"date": "2031-01-15", "name": f"T28 Fest {TAG}"}]}).json()
        assert b == {"added": 2, "skipped": 1}
        year = requests.get(f"{API}/holidays", headers=emp["h"], params={"year": 2031}).json()
        mine = [x for x in year if TAG in x["name"]]
        assert len(mine) == 3 and any(x["type"] == "optional" and x["day_off"] is False for x in mine)
        only_other = requests.get(f"{API}/holidays", headers=emp["h"], params={"year": 2031, "branch": "someone-else"}).json()
        assert not any(x["id"] == h["id"] for x in only_other)
        cal = requests.get(f"{API}/holidays/calendar", headers=emp["h"], params={"month": "2031-01", "branch": branch["id"]}).json()
        assert len(cal["days"]) == 31 and any(x["date"] == "2031-01-15" and x["holidays"] for x in cal["days"])
        for x in mine:
            assert requests.delete(f"{API}/records/holidays/{x['id']}", headers=ah).status_code == 200
        assert not [x for x in requests.get(f"{API}/holidays", headers=ah, params={"year": 2031}).json() if TAG in x["name"]]

    def test_holiday_counts_in_attendance(self, ah, mh, emp):
        # a company-wide holiday on a past weekday where the temp employee has no record
        d = date.today() - timedelta(days=1)
        while d.weekday() >= 5:
            d -= timedelta(days=1)
        h = requests.post(f"{API}/holidays", headers=ah, json={"date": d.isoformat(), "name": f"T28 Day Off {TAG}", "type": "company"}).json()
        try:
            team = requests.get(f"{API}/daily/team", headers=mh, params={"date": d.isoformat()}).json()
            st = {p["user"]["id"]: p["state"] for g in team["branches"] for p in g["people"]}
            assert st[emp["id"]] == "holiday"
            att = requests.get(f"{API}/daily/attendance", headers=mh, params={"month": d.strftime("%Y-%m")}).json()
            row = next(r for r in att["rows"] if r["user"]["id"] == emp["id"])
            assert row["cells"][att["days"].index(d.isoformat())] == "holiday"
        finally:
            requests.delete(f"{API}/records/holidays/{h['id']}", headers=ah)


# ====================================================================== timesheets
class TestTimesheets:
    def test_skeleton(self, emp):
        mon, dates = last_week()
        d = requests.get(f"{API}/timesheets/me", headers=emp["h"], params={"week": mon.isoformat()}).json()
        assert d["week_start"] == mon.isoformat() and d["dates"] == dates and d["sheet"]["status"] == "draft" and d["can_edit"]

    def test_validation(self, emp):
        mon, dates = last_week()
        bad = [
            {"days": {dates[0]: {"status": "leave"}}, "rows": [{"task": "x", "hours": {dates[0]: 3}}]},  # hours on leave
            {"days": {dates[0]: {"status": "office", "start": "18:00", "end": "09:00"}}, "rows": []},  # out before in
            {"days": {}, "rows": [{"task": "x", "hours": {dates[0]: 30}}]},  # > 24h
            {"days": {(date.today() + timedelta(days=9)).isoformat(): {"status": "office"}}, "rows": []},  # not in week
        ]
        for b in bad:
            r = requests.put(f"{API}/timesheets/me", headers=emp["h"], json={"week_start": mon.isoformat(), **b})
            assert r.status_code == 400, (b, r.text)
        fut = (date.today() + timedelta(days=7 - date.today().weekday() + 1)).isoformat()  # next week's Tuesday
        r = requests.put(f"{API}/timesheets/me", headers=emp["h"], json={"week_start": fut, "days": {fut: {"status": "office"}}, "rows": []})
        assert r.status_code == 400
        r = requests.put(f"{API}/timesheets/me", headers=emp["h"], json={"week_start": fut, "days": {fut: {"status": "leave"}}, "rows": []})
        assert r.status_code == 200 and r.json()["sheet"]["days"][fut]["status"] == "leave"  # leave can be planned ahead

    def test_submit_reject_resubmit_approve(self, emp, mh, ah):
        mon, dates = last_week()
        info = requests.get(f"{API}/timesheets/me", headers=emp["h"], params={"week": mon.isoformat()}).json()["day_info"]
        working = [d for d in dates if not info[d]["weekly_off"] and not info[d]["holiday"]]
        days = {d: {"status": "office", "start": "09:30", "end": "18:30", "break_min": 60} for d in working}
        days[working[0]] = {"status": "wfh", "start": "10:00", "end": "17:00", "break_min": 30}
        rows = [{"task": "Client work", "billable": True, "hours": {d: 6 for d in working}},
                {"task": "Internal", "billable": False, "hours": {d: 1.5 for d in working}}]
        # missing a working day → can't submit
        partial = {k: v for k, v in days.items() if k != working[-1]}
        r = requests.post(f"{API}/timesheets/me/submit", headers=emp["h"], json={"week_start": mon.isoformat(), "days": partial, "rows": rows})
        assert r.status_code == 400 and "missing" in r.text.lower()
        r = requests.post(f"{API}/timesheets/me/submit", headers=emp["h"], json={"week_start": mon.isoformat(), "days": days, "rows": rows})
        assert r.status_code == 200, r.text
        sheet = r.json()["sheet"]
        assert sheet["status"] == "submitted" and sheet["totals"]["work_hours"] == pytest.approx(7.5 * len(working))
        assert requests.put(f"{API}/timesheets/me", headers=emp["h"], json={"week_start": mon.isoformat(), "days": days, "rows": rows}).status_code == 409
        # employees can't review; managers see it waiting
        assert requests.post(f"{API}/timesheets/{sheet['id']}/approve", headers=emp["h"], json={}).status_code == 403
        team = requests.get(f"{API}/timesheets", headers=mh, params={"week": mon.isoformat()}).json()
        assert next(x for x in team["rows"] if x["user"]["id"] == emp["id"])["status"] == "submitted"
        assert requests.post(f"{API}/timesheets/{sheet['id']}/reject", headers=mh, json={"note": ""}).status_code == 400
        assert requests.post(f"{API}/timesheets/{sheet['id']}/reject", headers=mh, json={"note": "Split internal hours"}).json()["status"] == "rejected"
        me = requests.get(f"{API}/timesheets/me", headers=emp["h"], params={"week": mon.isoformat()}).json()
        assert me["can_edit"] and me["sheet"]["review_note"] == "Split internal hours"
        r = requests.post(f"{API}/timesheets/me/submit", headers=emp["h"], json={"week_start": mon.isoformat(), "days": days, "rows": rows})
        assert r.json()["sheet"]["status"] == "submitted"
        r = requests.post(f"{API}/timesheets/{sheet['id']}/approve", headers=mh, json={"note": "Thanks"})
        assert r.status_code == 200 and r.json()["days_added_to_attendance"] == len(working)
        rec = requests.get(f"{API}/daily/me", headers=emp["h"], params={"date": working[0]}).json()["record"]
        assert rec["status"] == "wfh" and rec["source"] == "timesheet" and rec["check_in_local"] == "10:00"
        att = requests.get(f"{API}/daily/attendance", headers=mh, params={"month": working[1][:7]}).json()
        row = next(x for x in att["rows"] if x["user"]["id"] == emp["id"])
        assert row["cells"][att["days"].index(working[1])] in ("office", "late")
        # reopen → editable again
        assert requests.post(f"{API}/timesheets/{sheet['id']}/reopen", headers=mh, json={}).json()["status"] == "draft"

    def test_no_self_approval(self, pm):
        mon, dates = last_week()
        info = requests.get(f"{API}/timesheets/me", headers=pm["h"], params={"week": mon.isoformat()}).json()["day_info"]
        working = [d for d in dates if not info[d]["weekly_off"] and not info[d]["holiday"]]
        days = {d: {"status": "office", "start": "09:30", "end": "18:00", "break_min": 30} for d in working}
        r = requests.post(f"{API}/timesheets/me/submit", headers=pm["h"], json={"week_start": mon.isoformat(), "days": days,
                                                                                 "rows": [{"task": "Planning", "hours": {d: 8 for d in working}}]})
        assert r.status_code == 200, r.text
        sid = r.json()["sheet"]["id"]
        r = requests.post(f"{API}/timesheets/{sid}/approve", headers=pm["h"], json={})
        assert r.status_code == 403 and "another manager" in r.text

    def test_cost_rates_access(self, ah, emp, fin):
        assert requests.get(f"{API}/timesheets/cost-rates", headers=emp["h"]).status_code == 403
        assert requests.get(f"{API}/timesheets/cost-rates", headers=fin["h"]).status_code == 200
        assert requests.put(f"{API}/timesheets/cost-rates", headers=fin["h"], json={"rates": {"employee": 1}}).status_code == 403
        before = requests.get(f"{API}/timesheets/cost-rates", headers=ah).json()
        r = requests.put(f"{API}/timesheets/cost-rates", headers=ah, json={"rates": {**before["rates"], "employee": 555}, "per_user": before["per_user"]})
        assert r.status_code == 200 and r.json()["rates"]["employee"] == 555
        requests.put(f"{API}/timesheets/cost-rates", headers=ah, json={"rates": before["rates"], "per_user": before["per_user"]})
        assert requests.put(f"{API}/timesheets/cost-rates", headers=ah, json={"rates": {"employee": -5}}).status_code == 400

    def test_exports(self, mh):
        mon, _ = last_week()
        r = requests.get(f"{API}/exports/timesheets", headers=mh, params={"format": "xlsx", "week": mon.isoformat()})
        assert r.status_code == 200 and r.content[:2] == b"PK"
        r = requests.get(f"{API}/exports/holidays", headers=mh, params={"format": "pdf"})
        assert r.status_code == 200 and r.content[:4] == b"%PDF"


# ====================================================================== org by location
class TestOrgLocation:
    def test_branch_tag_and_export(self, ah, branch):
        assert requests.post(f"{API}/org/nodes", headers=ah, json={"title": "X", "kind": "role", "branch_id": "nope"}).status_code == 400
        r = requests.post(f"{API}/org/nodes", headers=ah, json={"title": f"T28 Role {TAG}", "kind": "role", "branch_id": branch["id"]})
        assert r.status_code == 200, r.text
        nid = r.json()["id"]
        try:
            d = requests.get(f"{API}/org/nodes", headers=ah).json()
            assert any(b["id"] == branch["id"] and "headcount" in b for b in d["branches"])
            assert next(n for n in d["nodes"] if n["id"] == nid)["branch_id"] == branch["id"]
            assert all("branch_id" in p for n in d["nodes"] for p in n["people"])
            r = requests.put(f"{API}/org/nodes/{nid}", headers=ah, json={"branch_id": ""})
            assert r.status_code == 200 and r.json()["branch_id"] is None
            requests.put(f"{API}/org/nodes/{nid}", headers=ah, json={"branch_id": branch["id"]})
            x = requests.get(f"{API}/exports/org-structure", headers=ah, params={"format": "xlsx", "branch": branch["id"]})
            assert x.status_code == 200 and x.content[:2] == b"PK"
        finally:
            requests.delete(f"{API}/org/nodes/{nid}", headers=ah)


# ====================================================================== reports
NEW = ["attendance", "timesheet-utilisation", "client-profitability", "project-delivery", "renewals", "cash-flow", "lead-sources", "ai-costs"]


class TestReports:
    def test_templates_listed_with_groups(self, ah):
        t = requests.get(f"{API}/reports/templates", headers=ah).json()
        keys = {x["key"] for x in t}
        assert set(NEW) <= keys and all(x.get("group") for x in t) and sum(1 for x in t if x.get("new")) == 8

    @pytest.mark.parametrize("key", NEW)
    def test_generate(self, ah, key):
        r = requests.get(f"{API}/reports/template/{key}", headers=ah, params={"date_from": (date.today() - timedelta(days=40)).isoformat(),
                                                                             "date_to": date.today().isoformat()})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["title"] and d["summary"] and d["sections"] and all("columns" in s for s in d["sections"])

    def test_role_access(self, pm):
        keys = {x["key"] for x in requests.get(f"{API}/reports/templates", headers=pm["h"]).json()}
        assert {"attendance", "project-delivery", "timesheet-utilisation", "renewals"} <= keys
        assert "cash-flow" not in keys and "client-profitability" not in keys
        assert requests.get(f"{API}/reports/template/cash-flow", headers=pm["h"]).status_code == 403

    @pytest.mark.parametrize("key", ["client-profitability", "cash-flow", "attendance"])
    def test_export(self, ah, key):
        for fmt, magic in (("pdf", b"%PDF"), ("xlsx", b"PK")):
            r = requests.get(f"{API}/reports/template/{key}/export", headers=ah, params={"format": fmt})
            assert r.status_code == 200 and r.content[:len(magic)] == magic, (key, fmt)

    def test_branch_filter(self, ah, branch):
        r = requests.get(f"{API}/reports/template/attendance", headers=ah, params={"branches": branch["id"]})
        assert r.status_code == 200 and r.json()["summary"][0]["value"] == 0
