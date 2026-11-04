"""v3.1 Digital Growth — accounts, monthly numbers (grid, import, AI), overview / leaderboard maths, sync errors,
PDF / Excel reports, client dashboard + portal, permissions and branch scope, delete cascades.

Self-contained: creates its own branch, clients, people and accounts and removes them, so it runs on an empty
production-like database (only admin@ + midhun@) as well as on a seeded demo database."""
import io
import os
import uuid
from datetime import date
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://127.0.0.1:8001").rstrip("/")
API = f"{BASE_URL}/api"
PASSWORD = "Dotindot@2026"
TAG = uuid.uuid4().hex[:6]


def _shift(ym, k):
    y, m = map(int, ym.split("-"))
    t = y * 12 + (m - 1) + k
    return f"{t // 12:04d}-{t % 12 + 1:02d}"


THIS = date.today().strftime("%Y-%m")
LAST = _shift(THIS, -1)
M = [_shift(THIS, -i) for i in range(6, 0, -1)]   # six complete months, oldest first


def _login(email, password=PASSWORD):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}", "Content-Type": "application/json"}


def _bearer(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def sa():
    return _login("admin@dotindot.in")


def _make_user(sa, label, role="employee"):
    email = f"t31-{label}-{TAG}@dotindot.in"
    r = requests.post(f"{API}/users", headers=sa, json={"name": f"T31 {label.title()}", "email": email, "password": PASSWORD, "role": role})
    assert r.status_code in (200, 201), r.text
    uid = r.json().get("id") or next(u["id"] for u in requests.get(f"{API}/users", headers=sa).json() if u["email"] == email)
    return {"id": uid, "email": email, "h": _login(email)}


@pytest.fixture(scope="module")
def people(sa):
    out = {k: _make_user(sa, k, role) for k, role in (("emp", "employee"), ("social", "social_manager"), ("sales", "sales"), ("scoped", "social_manager"))}
    yield out
    for p in out.values():
        requests.delete(f"{API}/records/users/{p['id']}", headers=sa, params={"permanent": True})


@pytest.fixture(scope="module")
def branch(sa):
    r = requests.post(f"{API}/locations/branches", headers=sa, json={"name": f"T31 Branch {TAG}", "city": "Erode", "state": "Tamil Nadu", "country": "India"})
    assert r.status_code in (200, 201), r.text
    b = r.json()
    yield b
    requests.delete(f"{API}/records/branches/{b['id']}", headers=sa, params={"permanent": True})


@pytest.fixture(scope="module")
def clients(sa, branch):
    out = []
    for i, bid in enumerate((branch["id"], None)):
        r = requests.post(f"{API}/clients", headers=sa, json={"name": f"T31 Client {i} {TAG}", "company": "T31 Co", "industry": "other", "status": "active"})
        assert r.status_code in (200, 201), r.text
        c = r.json()
        if bid:  # place the client in the test branch (workspace editor — the client form takes the creator's branch)
            assert requests.put(f"{API}/workspace/clients/{c['id']}", headers=sa, json={"branch_id": bid}).status_code == 200
        out.append(c)
    yield out
    for c in out:
        requests.delete(f"{API}/records/clients/{c['id']}", headers=sa, params={"permanent": True})


def _account(h, owner, platform, handle, **kw):
    r = requests.post(f"{API}/growth/accounts", headers=h, json={"owner": owner, "platform": platform, "handle": handle, **kw})
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def accts(sa, clients):
    c0 = clients[0]["id"]
    ig = _account(sa, c0, "instagram", f"t31ig{TAG}", target=2000)
    yt = _account(sa, c0, "youtube", f"@t31yt{TAG}")
    web = _account(sa, c0, "website", f"t31-{TAG}.in")
    follows = [1000, 1100, 1150, 1300, 1450, 1500]
    for i, m in enumerate(M):
        r = requests.put(f"{API}/growth/months", headers=sa, json={"month": m, "entries": [
            {"account_id": ig["id"], "values": {"followers": follows[i], "views": 10000 + 1000 * i, "reach": 5000, "interactions": 250}},
            {"account_id": yt["id"], "values": {"subscribers": 200 + 10 * i, "views": 3000, "interactions": 60}},
            {"account_id": web["id"], "values": {"users": 900, "sessions": 1200, "page_views": 3000}}]})
        assert r.status_code == 200 and r.json()["saved"] == 3, r.text
    return {"ig": ig, "yt": yt, "web": web}


# ------------------------------------------------------------------ accounts + numbers
class TestAccounts:
    def test_meta_lists_platforms_and_metrics(self, sa):
        d = requests.get(f"{API}/growth/meta", headers=sa).json()
        keys = {p["key"] for p in d["platforms"]}
        assert {"instagram", "facebook", "youtube", "linkedin", "x", "threads", "pinterest", "google_business", "website"} <= keys
        assert d["can_manage"] and d["default_end"] == LAST

    def test_unknown_platform_and_bad_sync_rejected(self, sa, clients):
        c0 = clients[0]["id"]
        assert requests.post(f"{API}/growth/accounts", headers=sa, json={"owner": c0, "platform": "myspace"}).status_code == 400
        # LinkedIn has no automatic sync; Instagram sync needs a token
        assert requests.post(f"{API}/growth/accounts", headers=sa, json={"owner": c0, "platform": "linkedin", "sync": {"method": "instagram"}}).status_code == 400
        assert requests.post(f"{API}/growth/accounts", headers=sa, json={"owner": c0, "platform": "instagram", "sync": {"method": "instagram"}}).status_code == 400
        assert requests.post(f"{API}/growth/accounts", headers=sa, json={"owner": "no-such-client", "platform": "instagram"}).status_code == 404

    def test_tokens_are_write_only(self, sa, clients):
        tok = "IGQ" + uuid.uuid4().hex * 2
        a = _account(sa, clients[1]["id"], "instagram", f"tok{TAG}", sync={"method": "instagram", "external_id": "me", "access_token": tok, "host": "graph.instagram.com"})
        assert a["sync"]["token_hint"] == "…" + tok[-4:] and "token_enc" not in a["sync"]
        listed = requests.get(f"{API}/growth/accounts", headers=sa, params={"owner": clients[1]["id"]})
        assert tok not in listed.text and "token_enc" not in listed.text
        assert tok not in requests.get(f"{API}/growth/overview", headers=sa, params={"owner": clients[1]["id"]}).text

    def test_values_validated(self, sa, accts):
        ig = accts["ig"]["id"]
        assert requests.put(f"{API}/growth/months", headers=sa, json={"month": LAST, "entries": [{"account_id": ig, "values": {"followers": "lots"}}]}).status_code == 400
        assert requests.put(f"{API}/growth/months", headers=sa, json={"month": LAST, "entries": [{"account_id": ig, "values": {"followers": -5}}]}).status_code == 400
        assert requests.put(f"{API}/growth/months", headers=sa, json={"month": "2026-13", "entries": []}).status_code == 400
        assert requests.put(f"{API}/growth/months", headers=sa, json={"month": _shift(THIS, 1), "entries": [{"account_id": ig, "values": {"followers": 1}}]}).status_code == 400
        # metrics a platform doesn't have are ignored, not stored
        requests.put(f"{API}/growth/months", headers=sa, json={"month": LAST, "entries": [{"account_id": ig, "values": {"subscribers": 99, "followers": 1500}}]})
        rec = requests.get(f"{API}/growth/months", headers=sa, params={"account_id": ig, "month": LAST}).json()[0]
        assert "subscribers" not in rec["values"] and rec["values"]["followers"] == 1500 and rec["values"]["views"] == 15000  # merge keeps the rest


class TestOverview:
    def test_growth_maths(self, sa, clients, accts):
        d = requests.get(f"{API}/growth/overview", headers=sa, params={"owner": clients[0]["id"], "months": 5}).json()
        assert d["months"] == M[1:]
        ig = next(a for a in d["accounts"] if a["id"] == accts["ig"]["id"])
        # start = the month before the window (M[0] → 1000); now = last month (1500)
        assert ig["audience_start"] == 1000 and ig["audience_now"] == 1500 and ig["change"] == 500 and ig["change_pct"] == 50.0
        assert ig["last_month_change"] == 50
        assert ig["views"] == sum(10000 + 1000 * i for i in range(1, 6))
        assert ig["engagement_rate"] == round(100 * 250 * 5 / (5000 * 5), 2)  # interactions ÷ reach
        assert ig["target_pct"] == 75
        yt = next(a for a in d["accounts"] if a["id"] == accts["yt"]["id"])
        assert yt["engagement_rate"] == round(100 * 60 / 3000, 2)          # no reach → against views
        t = d["totals"]
        assert t["audience_now"] == 1500 + 250 and t["net_growth"] == 500 + 50   # website doesn't count toward audience
        assert t["views"] == ig["views"] + yt["views"]
        assert t["engagement_rate"] == round(100 * (1250 + 300) / (25000 + 15000), 2)
        assert t["best"]["label"].startswith("Instagram")

    def test_missing_last_month_and_alert(self, sa, clients, accts):
        assert requests.get(f"{API}/growth/overview", headers=sa, params={"owner": clients[0]["id"]}).json()["totals"]["missing_last_month"] == 0
        # a new account created this month isn't nagged about last month
        fresh = _account(sa, clients[0]["id"], "threads", f"fresh{TAG}")
        d = requests.get(f"{API}/growth/overview", headers=sa, params={"owner": clients[0]["id"]}).json()
        assert not next(a for a in d["accounts"] if a["id"] == fresh["id"])["missing_last_month"]
        requests.delete(f"{API}/records/growth_accounts/{fresh['id']}", headers=sa, params={"permanent": True})

    def test_leaderboard_lists_clients(self, sa, clients, accts):
        rows = requests.get(f"{API}/growth/leaderboard", headers=sa, params={"months": 6}).json()["rows"]
        mine = next(r for r in rows if r["owner"] == clients[0]["id"])
        assert mine["audience_now"] == 1750 and len(mine["spark"]) == 6 and mine["spark"][-1] == 1750

    def test_current_month_so_far(self, sa, clients, accts):
        requests.put(f"{API}/growth/months", headers=sa, json={"month": THIS, "entries": [{"account_id": accts["ig"]["id"], "values": {"followers": 1520}}]})
        d = requests.get(f"{API}/growth/overview", headers=sa, params={"owner": clients[0]["id"], "months": 2, "end": THIS}).json()
        assert d["months"][-1] == THIS and next(a for a in d["accounts"] if a["id"] == accts["ig"]["id"])["audience_now"] == 1520


class TestImport:
    def test_import_csv_with_aliases_and_problems(self, sa, clients, accts):
        handle = accts["ig"]["handle"]
        text = ("Month,Platform,Handle,Followers,Video views,Accounts reached,Engagement\n"
                f"{M[0]},IG,@{handle},1001,9999,4000,200\n"
                f"Jan 2020,Instagram,{handle},50,10,10,1\n"
                f"{M[1]},tiktokk,,1,1,1,1\n"
                f"{M[1]},Facebook,,10,10,10,10\n"
                f"13/2025,YT,,1,1,1,1\n")
        dry = requests.post(f"{API}/growth/import", headers=sa, json={"owner": clients[0]["id"], "text": text, "dry_run": True}).json()
        assert dry["rows"] == 2 and len(dry["problems"]) == 3 and dry["dry_run"]
        assert any("Unknown platform" in p["problem"] for p in dry["problems"]) and any("add the account first" in p["problem"] for p in dry["problems"])
        assert requests.get(f"{API}/growth/months", headers=sa, params={"account_id": accts["ig"]["id"], "month": M[0]}).json()[0]["values"]["followers"] == 1000
        res = requests.post(f"{API}/growth/import", headers=sa, json={"owner": clients[0]["id"], "text": text}).json()
        assert res["rows"] == 2
        rec = requests.get(f"{API}/growth/months", headers=sa, params={"account_id": accts["ig"]["id"], "month": M[0]}).json()[0]
        assert rec["values"]["followers"] == 1001 and rec["values"]["views"] == 9999 and rec["values"]["interactions"] == 200 and rec["source"] == "import"
        old = requests.get(f"{API}/growth/months", headers=sa, params={"account_id": accts["ig"]["id"], "month": "2020-01"}).json()
        assert old and old[0]["values"]["followers"] == 50
        # put M[0] back so other tests' maths hold
        requests.put(f"{API}/growth/months", headers=sa, json={"month": M[0], "entries": [{"account_id": accts["ig"]["id"], "values": {"followers": 1000}}]})

    def test_tab_separated_paste(self, sa, clients, accts):
        text = f"month\tplatform\tsubscribers\n{_label(M[2])}\tYouTube\t222\n"
        r = requests.post(f"{API}/growth/import", headers=sa, json={"owner": clients[0]["id"], "text": text}).json()
        assert r["rows"] == 1, r
        requests.put(f"{API}/growth/months", headers=sa, json={"month": M[2], "entries": [{"account_id": accts["yt"]["id"], "values": {"subscribers": 220}}]})

    def test_header_required(self, sa, clients):
        assert requests.post(f"{API}/growth/import", headers=sa, json={"owner": clients[0]["id"], "text": "a,b\n1,2"}).status_code == 400


def _label(ym):
    import calendar
    y, m = map(int, ym.split("-"))
    return f"{calendar.month_abbr[m]} {y}"


class TestSync:
    def test_sync_without_setup_reports_clearly(self, sa, accts):
        r = requests.post(f"{API}/growth/accounts/{accts['web']['id']}/sync", headers=sa).json()
        assert r["ok"] is False and "isn't set up to sync" in r["message"]

    def test_youtube_needs_api_key(self, sa, clients):
        if requests.get(f"{API}/growth/meta", headers=sa).json()["settings"]["youtube_connected"]:
            pytest.skip("a real YouTube key is configured — not touching it")
        a = _account(sa, clients[1]["id"], "youtube", f"@ytsync{TAG}", sync={"method": "youtube", "external_id": f"@ytsync{TAG}"})
        r = requests.post(f"{API}/growth/accounts/{a['id']}/sync", headers=sa).json()
        assert r["ok"] is False and "YouTube Data API key" in r["message"]
        assert requests.get(f"{API}/growth/accounts", headers=sa, params={"owner": clients[1]["id"]}).json()  # last result stored
        stored = next(x for x in requests.get(f"{API}/growth/accounts", headers=sa, params={"owner": clients[1]["id"]}).json() if x["id"] == a["id"])
        assert stored["sync"]["last"]["ok"] is False

    def test_settings_mask_key_and_validate(self, sa, people):
        if requests.get(f"{API}/growth/meta", headers=sa).json()["settings"]["youtube_connected"]:
            pytest.skip("a real YouTube key is configured — not touching it")
        key = "AIza" + uuid.uuid4().hex + "Q9"
        r = requests.put(f"{API}/growth/settings", headers=sa, json={"youtube_api_key": key, "graph_version": "v23.0"})
        assert r.status_code == 200 and key not in r.text and r.json()["settings"]["youtube_key_hint"] == "…" + key[-4:]
        assert requests.put(f"{API}/growth/settings", headers=sa, json={"graph_version": "latest"}).status_code == 400
        assert requests.put(f"{API}/growth/settings", headers=people["sales"]["h"], json={"auto_sync": False}).status_code == 403
        requests.put(f"{API}/growth/settings", headers=sa, json={"remove_youtube_key": True})


class TestReports:
    def test_pdf_and_excel(self, sa, clients, accts):
        p = requests.get(f"{API}/growth/report", headers=sa, params={"owner": clients[0]["id"], "months": 6, "format": "pdf"})
        assert p.status_code == 200 and p.content[:4] == b"%PDF" and "attachment" in p.headers["content-disposition"]
        x = requests.get(f"{API}/growth/report", headers=sa, params={"owner": clients[0]["id"], "months": 6, "format": "xlsx"})
        assert x.status_code == 200 and x.content[:2] == b"PK"
        from openpyxl import load_workbook
        wb = load_workbook(io.BytesIO(x.content))
        assert {"Summary"} <= set(wb.sheetnames) and len(wb.sheetnames) >= 3

    def test_reports_template(self, sa, clients, accts):
        tpls = {t["key"]: t for t in requests.get(f"{API}/reports/templates", headers=sa).json()}
        assert tpls["digital-growth"]["group"] == "Clients & delivery" and tpls["digital-growth"]["new"]
        d = requests.get(f"{API}/reports/template/digital-growth", headers=sa, params={"date_from": f"{M[0]}-01", "date_to": f"{M[-1]}-28"}).json()
        row = next(r for r in d["sections"][0]["rows"] if r["name"] == clients[0]["name"])
        assert row["audience"] == 1750
        assert requests.get(f"{API}/reports/template/digital-growth/export", headers=sa,
                            params={"format": "pdf", "date_from": f"{M[0]}-01", "date_to": f"{M[-1]}-28"}).content[:4] == b"%PDF"

    def test_client_dashboard_portal_and_pdf(self, sa, clients, accts):
        c0 = clients[0]["id"]
        d = requests.get(f"{API}/clients/{c0}/dashboard", headers=sa, params={"period": "last_3_months"}).json()
        assert d["growth"] and {a["platform"] for a in d["growth"]["accounts"]} == {"instagram", "youtube", "website"}
        assert "sync" not in d["growth"]["accounts"][0]
        email = f"t31-portal-{TAG}@client.example"
        assert requests.post(f"{API}/clients/{c0}/portal-users", headers=sa, json={"name": "Portal", "email": email, "password": PASSWORD}).status_code in (200, 201)
        ph = _bearer(requests.post(f"{API}/portal/login", json={"email": email, "password": PASSWORD}).json()["access_token"])
        pd = requests.get(f"{API}/portal/dashboard", headers=ph, params={"period": "last_3_months"}).json()
        assert pd["growth"]["totals"]["audience_now"] == d["growth"]["totals"]["audience_now"]
        # the portal token can't reach the staff growth API
        assert requests.get(f"{API}/growth/overview", headers=ph, params={"owner": c0}).status_code == 401
        pdf = requests.get(f"{API}/portal/report", headers=ph, params={"period": "last_3_months"})
        assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF"


class TestPermissions:
    def test_employee_has_no_access(self, people):
        h = people["emp"]["h"]
        assert requests.get(f"{API}/growth/meta", headers=h).status_code == 403
        assert requests.get(f"{API}/growth/overview", headers=h).status_code == 403

    def test_sales_can_view_not_change(self, people, clients, accts):
        h = people["sales"]["h"]
        assert requests.get(f"{API}/growth/overview", headers=h, params={"owner": clients[0]["id"]}).status_code == 200
        assert requests.post(f"{API}/growth/accounts", headers=h, json={"owner": "internal", "platform": "x"}).status_code == 403
        assert requests.put(f"{API}/growth/months", headers=h, json={"month": LAST, "entries": []}).status_code == 403
        assert requests.delete(f"{API}/records/growth_accounts/{accts['web']['id']}", headers=h).status_code == 403

    def test_social_manager_can_manage(self, people, clients):
        h = people["social"]["h"]
        a = _account(h, "internal", "x", f"t31x{TAG}")
        assert requests.put(f"{API}/growth/months", headers=h, json={"month": LAST, "entries": [{"account_id": a["id"], "values": {"followers": 10}}]}).json()["saved"] == 1
        sa = _login("admin@dotindot.in")
        r = requests.delete(f"{API}/records/growth_accounts/{a['id']}", headers=sa, params={"permanent": True})
        assert r.status_code == 200, r.text
        assert requests.get(f"{API}/growth/months", headers=sa, params={"owner": "internal", "month": LAST}).json() is not None
        assert not [x for x in requests.get(f"{API}/growth/months", headers=sa, params={"owner": "internal"}).json() if x["account_id"] == a["id"]]

    def test_branch_scope(self, sa, people, clients, branch):
        u = people["scoped"]
        assert requests.put(f"{API}/access/users/{u['id']}/branches", headers=sa,
                            json={"assignments": [{"branch_id": branch["id"], "branch_role": "manager"}]}).status_code == 200
        h = _login(u["email"])
        assert requests.get(f"{API}/growth/overview", headers=h, params={"owner": clients[0]["id"]}).status_code == 200
        assert requests.get(f"{API}/growth/overview", headers=h, params={"owner": clients[1]["id"]}).status_code == 403
        assert requests.post(f"{API}/growth/accounts", headers=h, json={"owner": clients[1]["id"], "platform": "x"}).status_code == 403
        owners = {a["owner"] for a in requests.get(f"{API}/growth/accounts", headers=h).json()}
        assert clients[1]["id"] not in owners
        board = {r["owner"] for r in requests.get(f"{API}/growth/leaderboard", headers=h).json()["rows"]}
        assert clients[1]["id"] not in board
        assert clients[1]["name"] not in {c["name"] for c in requests.get(f"{API}/growth/meta", headers=h).json()["clients"]}


class TestAIAndCascade:
    def test_ai_can_read_and_write_growth(self, sa, accts):
        before = requests.get(f"{API}/ai-settings", headers=sa).json()
        was_on = before.get("enabled", before.get("settings", {}).get("enabled"))
        was_level = (before.get("access") or before.get("settings", {}).get("access") or {}).get("growth", "read")
        assert requests.put(f"{API}/ai-settings", headers=sa, json={"enabled": True, "access": {"growth": "write"}}).status_code == 200
        r = requests.post(f"{API}/ai-settings/tokens", headers=sa, json={"name": f"T31 growth {TAG}", "access": {"growth": "write"}, "expires_days": 1})
        assert r.status_code == 200, r.text
        h = _bearer(r.json()["token"])
        recs = requests.get(f"{API}/ai/v1/records/growth", headers=h, params={"limit": 200, "q": accts["ig"]["handle"]}).json()["records"]
        assert recs and all("token_enc" not in str(x) for x in recs)
        c = requests.post(f"{API}/ai/v1/records/growth", headers=h, json={"account_id": accts["ig"]["id"], "month": LAST, "values": {"profile_visits": 321}})
        assert c.status_code == 200, c.text
        rec = requests.get(f"{API}/growth/months", headers=sa, params={"account_id": accts["ig"]["id"], "month": LAST}).json()[0]
        assert rec["values"]["profile_visits"] == 321 and rec["values"]["followers"] == 1500 and rec["source"] == "ai"
        bad = requests.post(f"{API}/ai/v1/records/growth", headers=h, json={"account_id": "nope", "month": LAST, "values": {"followers": 1}})
        assert bad.status_code == 400
        requests.post(f"{API}/ai-settings/tokens/{r.json()['id']}/revoke", headers=sa)
        requests.put(f"{API}/ai-settings", headers=sa, json={"access": {"growth": was_level}, **({"enabled": was_on} if was_on is not None else {})})

    def test_deleting_client_removes_growth(self, sa):
        c = requests.post(f"{API}/clients", headers=sa, json={"name": f"T31 Gone {TAG}", "company": "x", "industry": "other", "status": "active"}).json()
        a = _account(sa, c["id"], "instagram", f"gone{TAG}")
        requests.put(f"{API}/growth/months", headers=sa, json={"month": LAST, "entries": [{"account_id": a["id"], "values": {"followers": 5}}]})
        assert requests.delete(f"{API}/records/clients/{c['id']}", headers=sa, params={"permanent": True}).status_code == 200
        assert not [x for x in requests.get(f"{API}/growth/accounts", headers=sa).json() if x["id"] == a["id"]]


# ------------------------------------------------------------------ fixes from the independent review
class TestReviewFixes:
    def test_branch_user_cannot_delete_other_branch_growth(self, sa, people, clients, branch):
        u = people["scoped"]
        requests.put(f"{API}/access/users/{u['id']}/permissions", headers=sa, json={"overrides": {"growth.delete": True}})
        requests.put(f"{API}/access/users/{u['id']}/branches", headers=sa, json={"assignments": [{"branch_id": branch["id"], "branch_role": "manager"}]})
        h = _login(u["email"])
        other = _account(sa, clients[1]["id"], "pinterest", f"del{TAG}")
        requests.put(f"{API}/growth/months", headers=sa, json={"month": LAST, "entries": [{"account_id": other["id"], "values": {"followers": 9}}]})
        rec = requests.get(f"{API}/growth/months", headers=sa, params={"account_id": other["id"]}).json()[0]
        assert requests.delete(f"{API}/records/growth_accounts/{other['id']}", headers=h).status_code == 403
        assert requests.delete(f"{API}/records/growth_months/{rec['id']}", headers=h).status_code == 403
        assert requests.get(f"{API}/records/growth_accounts/{other['id']}/dependents", headers=h).status_code == 403
        bulk = requests.post(f"{API}/records/growth_accounts/bulk-delete", headers=h, json={"ids": [other["id"]]}).json()
        assert bulk["deleted"] == 0
        mine = _account(sa, clients[0]["id"], "pinterest", f"mine{TAG}")
        assert requests.delete(f"{API}/records/growth_accounts/{mine['id']}", headers=h).status_code == 200
        requests.delete(f"{API}/records/growth_accounts/{other['id']}", headers=sa, params={"permanent": True})

    def test_nan_infinity_and_huge_values_rejected(self, sa, accts):
        yt = accts["yt"]["id"]
        for bad in ("nan", "inf", "-inf", "1e30", "Infinity"):
            r = requests.put(f"{API}/growth/months", headers=sa, json={"month": LAST, "entries": [{"account_id": yt, "values": {"watch_hours": bad}}]})
            assert r.status_code == 400, (bad, r.text)
        r = requests.put(f"{API}/growth/accounts/{yt}", headers={**sa}, data='{"target": NaN}')
        assert r.status_code == 422
        assert requests.get(f"{API}/growth/leaderboard", headers=sa).status_code == 200
        dry = requests.post(f"{API}/growth/import", headers=sa, json={"owner": accts["yt"]["owner"], "dry_run": True,
                                                                     "text": f"Month,Platform,Subscribers\n{LAST},YouTube,nan\n{LAST},YouTube,1e40"})
        assert dry.status_code == 200 and dry.json()["rows"] == 0 and len(dry.json()["problems"]) == 2

    def test_goal_can_be_cleared(self, sa, accts):
        ig = accts["ig"]["id"]
        assert requests.put(f"{API}/growth/accounts/{ig}", headers=sa, json={"target": None, "target_date": None}).json()["target"] is None
        assert requests.put(f"{API}/growth/accounts/{ig}", headers=sa, json={"target": 2000}).json()["target"] == 2000
        assert requests.put(f"{API}/growth/accounts/{ig}", headers=sa, json={"target_date": "31-03-2027"}).status_code == 400

    def test_grid_is_all_or_nothing_and_can_clear(self, sa, accts):
        ig, yt = accts["ig"]["id"], accts["yt"]["id"]
        r = requests.put(f"{API}/growth/months", headers=sa, json={"month": LAST, "entries": [
            {"account_id": yt, "values": {"subscribers": 999}}, {"account_id": ig, "values": {"followers": "12.5k"}}]})
        assert r.status_code == 400
        assert requests.get(f"{API}/growth/months", headers=sa, params={"account_id": yt, "month": LAST}).json()[0]["values"]["subscribers"] == 250
        requests.put(f"{API}/growth/months", headers=sa, json={"month": LAST, "entries": [{"account_id": yt, "values": {}, "clear": ["interactions"]}]})
        v = requests.get(f"{API}/growth/months", headers=sa, params={"account_id": yt, "month": LAST}).json()[0]["values"]
        assert "interactions" not in v and v["subscribers"] == 250
        requests.put(f"{API}/growth/months", headers=sa, json={"month": LAST, "entries": [{"account_id": yt, "values": {"interactions": 60}}]})

    def test_import_never_half_writes(self, sa, accts):
        nxt = _shift(THIS, 2)
        text = f"Month,Platform,Handle,Followers\n{M[1]},Instagram,{accts['ig']['handle']},1100\n{nxt},Instagram,{accts['ig']['handle']},5"
        dry = requests.post(f"{API}/growth/import", headers=sa, json={"owner": accts["ig"]["owner"], "text": text, "dry_run": True}).json()
        assert dry["rows"] == 1 and "hasn't started" in dry["problems"][0]["problem"]
        assert requests.post(f"{API}/growth/import", headers=sa, json={"owner": accts["ig"]["owner"], "text": text}).status_code == 200
        semi = f"\ufeffMonth;Platform;Subscribers\n{M[2]};YouTube;220"
        assert requests.post(f"{API}/growth/import", headers=sa, json={"owner": accts["ig"]["owner"], "text": semi}).json()["rows"] == 1

    def test_one_month_period_is_one_month(self, sa, clients, accts):
        d = requests.get(f"{API}/clients/{clients[0]['id']}/dashboard", headers=sa, params={"period": "last_month"}).json()["growth"]
        ig = next(a for a in d["accounts"] if a["platform"] == "instagram")
        assert ig["audience_start"] == 1450 and ig["audience_now"] == 1500 and ig["views"] == 15000
        assert d["period"] == _label(LAST)

    def test_engagement_rate_month_by_month(self, sa, clients):
        a = _account(sa, clients[1]["id"], "instagram", f"er{TAG}")
        requests.put(f"{API}/growth/months", headers=sa, json={"month": M[4], "entries": [{"account_id": a["id"], "values": {"followers": 10, "reach": 1000, "interactions": 100}}]})
        requests.put(f"{API}/growth/months", headers=sa, json={"month": M[5], "entries": [{"account_id": a["id"], "values": {"followers": 12, "views": 700, "interactions": 100}}]})
        d = requests.get(f"{API}/growth/overview", headers=sa, params={"owner": clients[1]["id"], "months": 2}).json()
        row = next(x for x in d["accounts"] if x["id"] == a["id"])
        assert row["engagement_rate"] == round(100 * 200 / 1700, 2)
        requests.delete(f"{API}/records/growth_accounts/{a['id']}", headers=sa, params={"permanent": True})

    def test_lookback_when_base_month_missing(self, sa, clients):
        a = _account(sa, clients[1]["id"], "threads", f"lb{TAG}")
        requests.put(f"{API}/growth/months", headers=sa, json={"month": M[0], "entries": [{"account_id": a["id"], "values": {"followers": 100}}]})
        requests.put(f"{API}/growth/months", headers=sa, json={"month": M[5], "entries": [{"account_id": a["id"], "values": {"followers": 160}}]})
        d = requests.get(f"{API}/growth/overview", headers=sa, params={"owner": clients[1]["id"], "months": 3}).json()
        row = next(x for x in d["accounts"] if x["id"] == a["id"])
        assert row["audience_start"] == 100 and row["change"] == 60
        requests.delete(f"{API}/records/growth_accounts/{a['id']}", headers=sa, params={"permanent": True})

    def test_report_template_needs_growth_permission(self, sa, people):
        u = people["sales"]
        requests.put(f"{API}/access/users/{u['id']}/permissions", headers=sa, json={"overrides": {"growth": False}})
        h = _login(u["email"])
        assert requests.get(f"{API}/reports/template/digital-growth", headers=h).status_code == 403
        assert "digital-growth" not in {t["key"] for t in requests.get(f"{API}/reports/templates", headers=h).json()}
        requests.put(f"{API}/access/users/{u['id']}/permissions", headers=sa, json={"overrides": {}})
        assert requests.get(f"{API}/reports/template/digital-growth", headers=_login(u["email"])).status_code == 200

    def test_ai_write_needs_manage(self, sa, people):
        u = people["sales"]   # sales can view growth but not manage it
        requests.put(f"{API}/access/users/{u['id']}/permissions", headers=sa, json={"overrides": {"ai_settings": True}})
        h = _login(u["email"])
        try:
            assert requests.post(f"{API}/ai-settings/tokens", headers=h, json={"name": "x", "access": {"growth": "write"}}).status_code == 403
            assert requests.put(f"{API}/ai-settings", headers=h, json={"access": {"growth": "write"}}).status_code == 403
            ok_ = requests.post(f"{API}/ai-settings/tokens", headers=h, json={"name": f"T31 read {TAG}", "access": {"growth": "read"}, "expires_days": 1})
            assert ok_.status_code == 200, ok_.text
            requests.post(f"{API}/ai-settings/tokens/{ok_.json()['id']}/revoke", headers=sa)
        finally:
            requests.put(f"{API}/access/users/{u['id']}/permissions", headers=sa, json={"overrides": {}})

    def test_unicode_client_names_download(self, sa):
        c = requests.post(f"{API}/clients", headers=sa, json={"name": f"ஈரோடு Ṭhe Āravind {TAG}", "company": "x", "industry": "other", "status": "active"}).json()
        try:
            _account(sa, c["id"], "instagram", f"u{TAG}")
            for fmt in ("pdf", "xlsx"):
                r = requests.get(f"{API}/growth/report", headers=sa, params={"owner": c["id"], "format": fmt})
                assert r.status_code == 200 and "filename*=UTF-8''" in r.headers["content-disposition"]
            assert requests.get(f"{API}/clients/{c['id']}/dashboard/report", headers=sa).status_code == 200
        finally:
            requests.delete(f"{API}/records/clients/{c['id']}", headers=sa, params={"permanent": True})

    def test_bad_months_and_dates_are_400(self, sa):
        assert requests.get(f"{API}/growth/overview", headers=sa, params={"end": "0000-01"}).status_code == 400
        assert requests.get(f"{API}/growth/leaderboard", headers=sa, params={"end": "0000-01"}).status_code == 400
        for q in ({"date_to": "2026"}, {"date_from": "garbage", "date_to": "2026-10-31"}, {"date_from": "2026-13-01", "date_to": "2026-10-31"}):
            assert requests.get(f"{API}/reports/template/digital-growth", headers=sa, params={"date_from": "2026-01-01", **q}).status_code == 400, q
        huge = "Month,Platform\n" + '"' + "x" * 140000 + '",Instagram'
        assert requests.post(f"{API}/growth/import", headers=sa, json={"owner": "internal", "text": huge}).status_code == 400

    def test_leaderboard_zero_growth_ranks_above_negative(self, sa, clients):
        a0 = _account(sa, clients[1]["id"], "x", f"z{TAG}")
        for m, f in ((M[3], 100), (M[5], 100)):
            requests.put(f"{API}/growth/months", headers=sa, json={"month": m, "entries": [{"account_id": a0["id"], "values": {"followers": f}}]})
        rows = requests.get(f"{API}/growth/leaderboard", headers=sa, params={"months": 2}).json()["rows"]
        pcts = [r["growth_pct"] for r in rows if not r["internal"] and r["growth_pct"] is not None]
        assert pcts == sorted(pcts, reverse=True)
        requests.delete(f"{API}/records/growth_accounts/{a0['id']}", headers=sa, params={"permanent": True})

    def test_sync_errors_never_store_secrets(self):
        import importlib, sys
        sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        try:
            g = importlib.import_module("routes_growth")
        except Exception as e:  # needs the backend's environment (database settings)
            pytest.skip(f"backend module not importable here: {e}")
        tok = "EAAGm0PX4ZCpsBAOZCZBsecretTOKEN1234"
        msg = g._scrub(f"Malformed access token {tok} (url ...?access_token={tok}&fields=x)", [tok])
        assert tok not in msg and "[hidden]" in msg
