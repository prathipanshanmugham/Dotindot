"""V2 backend tests: auth migration, permissions, RBAC, access control, branch scoping, assets, ads, social, influencers, HUD, locations, reports, exports, notifications."""
import os
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE = line.split("=", 1)[1].strip().rstrip("/")
API = f"{BASE}/api"
PW = "Dotindot@2026"


def _login(email, password=PW):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    return r


def _tok(email):
    r = _login(email)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return r.json()["access_token"]


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="session")
def toks():
    users = ["admin", "midhun", "finance", "sales", "pm", "employee", "ads", "social"]
    return {u: _tok(f"{u}@dotindot.in") for u in users}


# ---------- Auth migration ----------
class TestAuthMigration:
    def test_old_com_emails_fail(self):
        for e in ["admin@dotindot.com", "midhun@dotindot.com", "finance@dotindot.com"]:
            r = _login(e)
            assert r.status_code == 401, f"expected 401 for old email {e}, got {r.status_code}"

    def test_new_in_emails_pass(self):
        for u in ["admin", "midhun", "finance", "sales", "pm", "employee", "ads", "social"]:
            r = _login(f"{u}@dotindot.in")
            assert r.status_code == 200, f"login failed for {u}@dotindot.in"


# ---------- Permissions ----------
class TestPermissions:
    def test_super_admin_perms(self, toks):
        r = requests.get(f"{API}/me/permissions", headers=_h(toks["admin"]))
        assert r.status_code == 200
        data = r.json()
        keys = data.get("permissions") or data.get("keys") or data
        # super_admin should have many keys including access_control
        s = str(keys)
        for expected in ["clients", "ads", "social", "influencers", "assets", "access_control"]:
            assert expected in s

    def test_employee_perms(self, toks):
        r = requests.get(f"{API}/me/permissions", headers=_h(toks["employee"]))
        assert r.status_code == 200
        s = str(r.json())
        assert "projects" in s and "employees" in s
        # Should not include ads/social/clients broadly
        # (may include 'training')

    def test_ads_manager_perms(self, toks):
        r = requests.get(f"{API}/me/permissions", headers=_h(toks["ads"]))
        assert r.status_code == 200
        s = str(r.json())
        assert "ads" in s and "clients" in s

    def test_social_manager_perms(self, toks):
        r = requests.get(f"{API}/me/permissions", headers=_h(toks["social"]))
        assert r.status_code == 200
        s = str(r.json())
        assert "social" in s and "influencers" in s and "clients" in s


# ---------- Middleware RBAC ----------
class TestMiddlewareRBAC:
    @pytest.mark.parametrize("path", [
        "/clients", "/ads/campaigns", "/social/posts", "/influencers",
        "/assets", "/reports/templates", "/logs",
    ])
    def test_employee_403(self, toks, path):
        r = requests.get(f"{API}{path}", headers=_h(toks["employee"]))
        assert r.status_code == 403, f"employee should 403 on {path}, got {r.status_code}"

    def test_ads_manager_allowed_and_blocked(self, toks):
        t = toks["ads"]
        assert requests.get(f"{API}/ads/campaigns", headers=_h(t)).status_code == 200
        assert requests.get(f"{API}/clients", headers=_h(t)).status_code == 200
        for p in ["/finance/transactions", "/sales/leads", "/projects"]:
            r = requests.get(f"{API}{p}", headers=_h(t))
            assert r.status_code == 403, f"ads should 403 on {p}, got {r.status_code}"

    def test_social_manager_allowed_and_blocked(self, toks):
        t = toks["social"]
        assert requests.get(f"{API}/social/posts", headers=_h(t)).status_code == 200
        assert requests.get(f"{API}/influencers", headers=_h(t)).status_code == 200
        r = requests.get(f"{API}/ads/campaigns", headers=_h(t))
        assert r.status_code == 403


# ---------- Access control ----------
class TestAccessControl:
    def test_registry(self, toks):
        r = requests.get(f"{API}/access/registry", headers=_h(toks["admin"]))
        assert r.status_code == 200
        assert isinstance(r.json(), (list, dict))

    def test_users_list(self, toks):
        r = requests.get(f"{API}/access/users", headers=_h(toks["admin"]))
        assert r.status_code == 200

    def test_sales_forbidden(self, toks):
        r = requests.get(f"{API}/access/registry", headers=_h(toks["sales"]))
        assert r.status_code == 403

    def test_grant_override_then_reset(self, toks):
        emp_tok = toks["employee"]
        # baseline: employee 403 on /ads
        assert requests.get(f"{API}/ads/campaigns", headers=_h(emp_tok)).status_code == 403
        # grant override
        r = requests.put(
            f"{API}/access/users/user-employee/permissions",
            headers=_h(toks["admin"]),
            json={"overrides": {"ads": True}},
        )
        assert r.status_code in (200, 204), r.text
        # re-login (permissions embed in fresh token? we test via same token — server should read overrides from db)
        r2 = requests.get(f"{API}/ads/campaigns", headers=_h(emp_tok))
        # If token embeds perms, may need re-login
        if r2.status_code == 403:
            emp_tok2 = _tok("employee@dotindot.in")
            r2 = requests.get(f"{API}/ads/campaigns", headers=_h(emp_tok2))
        assert r2.status_code == 200, f"After grant, expected 200, got {r2.status_code}"
        # reset
        rr = requests.post(
            f"{API}/access/users/user-employee/permissions/reset",
            headers=_h(toks["admin"]),
        )
        assert rr.status_code in (200, 204)
        emp_tok3 = _tok("employee@dotindot.in")
        rf = requests.get(f"{API}/ads/campaigns", headers=_h(emp_tok3))
        assert rf.status_code == 403, f"After reset expected 403, got {rf.status_code}"


# ---------- Branch scoping ----------
class TestBranchScoping:
    def test_pm_scoped_to_dubai(self, toks):
        # set pm branches -> Dubai
        r = requests.put(
            f"{API}/access/users/user-pm/branches",
            headers=_h(toks["admin"]),
            json={"assigned_branches": ["seed-branch-02"]},
        )
        assert r.status_code in (200, 204), r.text
        pm_tok = _tok("pm@dotindot.in")
        rc = requests.get(f"{API}/clients", headers=_h(pm_tok))
        assert rc.status_code == 200
        clients = rc.json()
        items = clients if isinstance(clients, list) else clients.get("items") or clients.get("clients") or []
        # all should be branch_id seed-branch-02
        bad = [c for c in items if c.get("branch_id") not in (None, "seed-branch-02")]
        # Some clients may have no branch_id; only fail if there are wrong-branch items
        assert not bad, f"pm sees non-dubai clients: {bad[:2]}"
        # reset
        rst = requests.put(
            f"{API}/access/users/user-pm/branches",
            headers=_h(toks["admin"]),
            json={"assigned_branches": []},
        )
        assert rst.status_code in (200, 204)
        pm_tok2 = _tok("pm@dotindot.in")
        rc2 = requests.get(f"{API}/clients", headers=_h(pm_tok2))
        assert rc2.status_code == 200
        items2 = rc2.json() if isinstance(rc2.json(), list) else rc2.json().get("items") or rc2.json().get("clients") or []
        assert len(items2) >= len(items)


# ---------- Assets ----------
class TestAssets:
    _created_id = None

    def test_stats(self, toks):
        r = requests.get(f"{API}/assets/stats", headers=_h(toks["admin"]))
        assert r.status_code == 200

    def test_crud_assign_maintenance(self, toks):
        h = _h(toks["admin"])
        r = requests.post(f"{API}/assets", headers=h, json={
            "name": "TEST_Asset_Laptop", "category": "laptop", "serial_number": "TEST-SN-001",
            "branch_id": "seed-branch-01", "status": "available"
        })
        assert r.status_code in (200, 201), r.text
        aid = r.json().get("id") or r.json().get("_id")
        assert aid
        TestAssets._created_id = aid
        # assign
        ra = requests.post(f"{API}/assets/{aid}/assign", headers=h,
                           json={"user_id": "user-employee", "notes": "test"})
        assert ra.status_code in (200, 201), ra.text
        # maintenance
        rm = requests.post(f"{API}/assets/{aid}/maintenance", headers=h,
                           json={"type": "check", "notes": "annual", "next_due": "2027-01-01",
                                 "date": "2026-01-15", "description": "TEST annual check"})
        assert rm.status_code in (200, 201), rm.text
        # cleanup
        requests.delete(f"{API}/assets/{aid}", headers=h)


# ---------- Ads ----------
class TestAds:
    def test_overview(self, toks):
        r = requests.get(f"{API}/ads/overview", headers=_h(toks["admin"]))
        assert r.status_code == 200

    def test_campaign_and_metrics(self, toks):
        h = _h(toks["admin"])
        r = requests.get(f"{API}/ads/campaigns", headers=h)
        assert r.status_code == 200
        items = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
        assert items, "expected seeded campaigns"
        cid = items[0].get("id") or items[0].get("_id")
        rm = requests.post(f"{API}/ads/campaigns/{cid}/metrics", headers=h,
                           json={"date": "2026-01-15", "spend": 100, "impressions": 1000, "clicks": 50, "conversions": 5, "revenue": 500})
        assert rm.status_code in (200, 201), rm.text

    def test_growth_rollup(self, toks):
        r = requests.get(f"{API}/clients/seed-client-01/growth-rollup", headers=_h(toks["admin"]))
        assert r.status_code == 200
        d = r.json()
        for k in ["ads", "social", "influencer_collabs"]:
            assert k in d, f"missing {k} in rollup"


# ---------- Social ----------
class TestSocial:
    def test_summary_and_status(self, toks):
        h = _h(toks["admin"])
        r = requests.get(f"{API}/social/summary", headers=h)
        assert r.status_code == 200
        rp = requests.get(f"{API}/social/posts", headers=h)
        assert rp.status_code == 200
        items = rp.json() if isinstance(rp.json(), list) else rp.json().get("items", [])
        if items:
            pid = items[0].get("id") or items[0].get("_id")
            rs = requests.post(f"{API}/social/posts/{pid}/status", headers=h,
                               json={"status": "approved"})
            assert rs.status_code in (200, 201), rs.text


# ---------- Influencers ----------
class TestInfluencers:
    def test_list_and_collab(self, toks):
        h = _h(toks["admin"])
        r = requests.get(f"{API}/influencers", headers=h)
        assert r.status_code == 200
        items = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
        if items:
            iid = items[0].get("id") or items[0].get("_id")
            rc = requests.post(f"{API}/influencers/{iid}/collabs", headers=h,
                               json={"client_id": "seed-client-01", "campaign_name": "TEST_collab",
                                     "fee": 1000, "status": "planned", "date": "2026-01-15"})
            assert rc.status_code in (200, 201), rc.text


# ---------- HUD ----------
class TestHUD:
    def test_admin_and_sales_allowed(self, toks):
        assert requests.get(f"{API}/sales/hud", headers=_h(toks["admin"])).status_code == 200
        assert requests.get(f"{API}/sales/hud", headers=_h(toks["sales"])).status_code == 200

    def test_employee_forbidden(self, toks):
        assert requests.get(f"{API}/sales/hud", headers=_h(toks["employee"])).status_code == 403


# ---------- Locations ----------
class TestLocations:
    def test_compare(self, toks):
        r = requests.get(f"{API}/locations/compare", headers=_h(toks["admin"]))
        assert r.status_code == 200
        data = r.json()
        rows = data if isinstance(data, list) else data.get("branches") or data.get("items") or []
        assert len(rows) >= 3, f"expected >=3 branches got {len(rows)}"

    def test_branch_crud(self, toks):
        h = _h(toks["admin"])
        r = requests.post(f"{API}/locations/branches", headers=h,
                          json={"name": "TEST_Branch", "city": "Bangalore", "country": "India"})
        assert r.status_code in (200, 201), r.text
        bid = r.json().get("id") or r.json().get("_id")
        ru = requests.put(f"{API}/locations/branches/{bid}", headers=h,
                          json={"name": "TEST_Branch_Upd"})
        assert ru.status_code in (200, 204), ru.text
        rd = requests.delete(f"{API}/locations/branches/{bid}", headers=h)
        assert rd.status_code in (200, 204), rd.text

    def test_sales_cannot_create_branch(self, toks):
        r = requests.post(f"{API}/locations/branches", headers=_h(toks["sales"]),
                          json={"name": "X", "city": "Mumbai", "country": "India"})
        assert r.status_code == 403

    def test_delete_linked_branch_blocked(self, toks):
        r = requests.delete(f"{API}/locations/branches/seed-branch-01", headers=_h(toks["admin"]))
        assert r.status_code == 400, f"expected 400 on linked branch delete got {r.status_code}"


# ---------- Reports ----------
class TestReports:
    def test_templates(self, toks):
        r = requests.get(f"{API}/reports/templates", headers=_h(toks["admin"]))
        assert r.status_code == 200
        data = r.json()
        items = data if isinstance(data, list) else data.get("templates") or data.get("items") or []
        ids = {str(t.get("id") or t.get("key") or t.get("name")).lower() for t in items}
        for expected in ["monthly-financial", "client-status", "sales-pipeline", "employee-activity", "ads-performance", "location-comparison"]:
            assert any(expected in i for i in ids), f"missing template {expected}, got {ids}"

    def test_ads_perf_charts(self, toks):
        r = requests.get(f"{API}/reports/template/ads-performance", headers=_h(toks["admin"]))
        assert r.status_code == 200
        d = r.json()
        assert "charts" in d and isinstance(d["charts"], list) and len(d["charts"]) > 0


# ---------- Exports ----------
class TestExports:
    @pytest.mark.parametrize("path", [
        "/exports/ad-campaigns?format=xlsx",
        "/exports/social-posts?format=pdf",
        "/exports/influencers?format=xlsx",
        "/exports/assets?format=pdf",
    ])
    def test_exports(self, toks, path):
        r = requests.get(f"{API}{path}", headers=_h(toks["admin"]))
        assert r.status_code == 200, f"{path} -> {r.status_code}"
        assert len(r.content) > 100


# ---------- Notifications ----------
class TestNotifications:
    def test_admin_notifications(self, toks):
        r = requests.get(f"{API}/notifications", headers=_h(toks["admin"]))
        assert r.status_code == 200
        data = r.json()
        items = data if isinstance(data, list) else data.get("items") or []
        kinds = {i.get("kind") for i in items}
        # asset kind may or may not exist depending on seed; but at least endpoint works
        assert isinstance(items, list)
