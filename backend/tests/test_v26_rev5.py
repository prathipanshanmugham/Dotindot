"""v2.6 Revision 5 — AI Agents, Org Structure, Admin/CEO delete rights, project restructure,
line-item deletes, recycle-bin purge, partnership delete rules.

Self-contained: creates its own records (and a temporary employee) and cleans up, so it runs on an
empty production-like database (only admin@ + midhun@) as well as on a seeded demo database."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://agency-hub-490.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
PASSWORD = "Dotindot@2026"


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


@pytest.fixture(scope="module")
def employee(ah):
    """Temporary employee account (deleted at the end)."""
    email = f"t-emp-{uuid.uuid4().hex[:6]}@dotindot.in"
    r = requests.post(f"{API}/users", headers=ah, json={"name": "Temp Employee", "email": email, "password": PASSWORD, "role": "employee"})
    assert r.status_code in (200, 201), r.text
    uid = r.json().get("id") or next(u["id"] for u in requests.get(f"{API}/users", headers=ah).json() if u["email"] == email)
    yield {"id": uid, "h": _login(email)}
    requests.delete(f"{API}/records/users/{uid}", headers=ah)


# ---------------- permissions ----------------
class TestPermissions:
    def test_new_keys_registered(self, ah):
        flat = str(requests.get(f"{API}/access/registry", headers=ah).json())
        for k in ["ai_agents", "ai_agents.manage", "ai_agents.delete", "org_structure", "org_structure.manage", "org_structure.delete"]:
            assert k in flat, k

    def test_admin_ceo_has_every_delete_key(self, mh):
        perms = set(requests.get(f"{API}/me/permissions", headers=mh).json()["permissions"])
        for k in ["clients.delete", "projects.delete", "finance.delete", "sales.delete", "assets.delete",
                  "partnerships.delete", "logs.delete", "ai_agents.delete", "org_structure.delete"]:
            assert k in perms, k

    def test_employee_sees_new_tabs_but_cannot_manage(self, employee):
        perms = set(requests.get(f"{API}/me/permissions", headers=employee["h"]).json()["permissions"])
        assert {"ai_agents", "org_structure"} <= perms
        assert "ai_agents.manage" not in perms and "org_structure.manage" not in perms


# ---------------- AI agents ----------------
class TestAgents:
    def test_full_agent_lifecycle(self, ah, mh, employee):
        # create (admin/CEO can manage)
        r = requests.post(f"{API}/agents", headers=mh, json={
            "name": "T-Agent", "platform": "claude", "agent_type": "content", "monthly_cost": 1700,
            "minutes_saved_per_run": 30, "purpose": "Testing", "playbook": "Step 1",
            "prompts": [{"title": "P1", "prompt": "Write X"}]})
        assert r.status_code == 200, r.text
        agent = r.json()
        assert agent["prompts"][0]["id"]

        # employee can't see it until assigned
        ids = [a["id"] for a in requests.get(f"{API}/agents", headers=employee["h"]).json()]
        assert agent["id"] not in ids
        assert requests.get(f"{API}/agents/{agent['id']}", headers=employee["h"]).status_code == 403
        # employee can't create
        assert requests.post(f"{API}/agents", headers=employee["h"], json={"name": "nope"}).status_code == 403

        # assign → visible, can log a run (default minutes from agent)
        r = requests.put(f"{API}/agents/{agent['id']}", headers=mh, json={"assignee_ids": [employee["id"]]})
        assert r.status_code == 200, r.text
        assert agent["id"] in [a["id"] for a in requests.get(f"{API}/agents", headers=employee["h"]).json()]
        r = requests.post(f"{API}/agents/{agent['id']}/usage", headers=employee["h"], json={"task": "Draft", "outcome": "success", "rating": 5})
        assert r.status_code == 200, r.text
        usage = r.json()
        assert usage["minutes_saved"] == 30

        # validation
        assert requests.post(f"{API}/agents/{agent['id']}/usage", headers=employee["h"], json={"task": " "}).status_code == 400
        assert requests.post(f"{API}/agents/{agent['id']}/usage", headers=employee["h"], json={"task": "x", "rating": 9}).status_code == 400
        assert requests.put(f"{API}/agents/{agent['id']}", headers=mh, json={"platform": "bogus"}).status_code == 400

        # stats + overview
        d = requests.get(f"{API}/agents/{agent['id']}", headers=ah).json()
        assert d["stats"]["runs_30d"] == 1 and d["stats"]["hours_saved_30d"] == 0.5
        assert d["cost_per_hour_saved"] == 3400
        ov = requests.get(f"{API}/agents/overview", headers=ah).json()
        assert ov["runs_30d"] >= 1 and "weekly" in ov and len(ov["weekly"]) == 8

        # employee can't delete; usage + prompt line item delete by CEO
        assert requests.delete(f"{API}/records/ai_agent_usage/{usage['id']}", headers=employee["h"]).status_code == 403
        assert requests.delete(f"{API}/records/ai_agent_usage/{usage['id']}", headers=mh).status_code == 200
        pid = agent["prompts"][0]["id"]
        r = requests.delete(f"{API}/records/ai_agents/{agent['id']}/items/prompts/{pid}", headers=mh)
        assert r.status_code == 200 and r.json()["prompts"] == []

        # export works
        assert requests.get(f"{API}/exports/ai-agents", headers=ah, params={"format": "xlsx"}).status_code == 200

        # delete agent → recycle bin → restore → delete again
        assert requests.delete(f"{API}/records/ai_agents/{agent['id']}", headers=ah).status_code == 200
        assert requests.get(f"{API}/agents/{agent['id']}", headers=ah).status_code == 404
        snap = next(s for s in requests.get(f"{API}/workspace/recycle-bin", headers=ah).json() if s["record_id"] == agent["id"])
        assert requests.post(f"{API}/workspace/recycle-bin/{snap['id']}/restore", headers=ah).status_code == 200
        assert requests.get(f"{API}/agents/{agent['id']}", headers=ah).status_code == 200
        assert requests.delete(f"{API}/records/ai_agents/{agent['id']}", headers=ah).status_code == 200


# ---------------- Org structure ----------------
class TestOrg:
    def test_tree_crud_move_and_delete_modes(self, ah, mh, employee):
        root = requests.post(f"{API}/org/nodes", headers=mh, json={"title": "T-Root", "kind": "role"}).json()
        dept = requests.post(f"{API}/org/nodes", headers=mh, json={"title": "T-Dept", "kind": "department", "parent_id": root["id"]}).json()
        role = requests.post(f"{API}/org/nodes", headers=mh, json={
            "title": "T-Role", "kind": "role", "parent_id": dept["id"], "person_ids": [employee["id"]],
            "responsibilities": ["Ship work", "  "], "kpis": ["On time"]}).json()
        assert role["responsibilities"] == ["Ship work"]

        # employee can view + sees own role, cannot edit
        nodes = requests.get(f"{API}/org/nodes", headers=employee["h"]).json()
        assert any(n["id"] == role["id"] for n in nodes["nodes"]) and nodes["can_manage"] is False
        mine = requests.get(f"{API}/org/person/{employee['id']}", headers=employee["h"]).json()
        assert any(m["id"] == role["id"] and m["reports_to"]["title"] == "T-Dept" for m in mine)
        assert requests.put(f"{API}/org/nodes/{role['id']}", headers=employee["h"], json={"title": "x"}).status_code == 403

        # cycles are refused; moving works
        assert requests.put(f"{API}/org/nodes/{root['id']}", headers=mh, json={"parent_id": role["id"]}).status_code == 400
        assert requests.put(f"{API}/org/nodes/{role['id']}", headers=mh, json={"parent_id": root["id"]}).status_code == 200

        # reattach delete: children move up
        requests.put(f"{API}/org/nodes/{role['id']}", headers=mh, json={"parent_id": dept["id"]})
        r = requests.delete(f"{API}/org/nodes/{dept['id']}", headers=mh, params={"mode": "reattach"})
        assert r.status_code == 200 and r.json()["removed"] == 1
        after = {n["id"]: n for n in requests.get(f"{API}/org/nodes", headers=ah).json()["nodes"]}
        assert after[role["id"]]["parent_id"] == root["id"]

        # cascade delete removes the branch
        r = requests.delete(f"{API}/org/nodes/{root['id']}", headers=mh, params={"mode": "cascade"})
        assert r.status_code == 200 and r.json()["removed"] == 2
        ids = {n["id"] for n in requests.get(f"{API}/org/nodes", headers=ah).json()["nodes"]}
        assert root["id"] not in ids and role["id"] not in ids
        assert requests.get(f"{API}/exports/org-structure", headers=ah, params={"format": "pdf"}).status_code == 200

    def test_bootstrap_requires_replace_when_chart_exists(self, mh):
        n = requests.post(f"{API}/org/nodes", headers=mh, json={"title": "T-Keep", "kind": "role"}).json()
        assert requests.post(f"{API}/org/bootstrap", headers=mh, json={"replace": False}).status_code == 409
        requests.delete(f"{API}/org/nodes/{n['id']}", headers=mh)


# ---------------- Projects ----------------
class TestProjectRestructure:
    def test_edit_everything(self, ah):
        c1 = requests.post(f"{API}/clients", headers=ah, json={"name": "T-C1", "company": "T", "industry": "other", "service_type": "web_dev", "size": "small", "status": "active", "city": "Erode", "region": "India"}).json()
        c2 = requests.post(f"{API}/clients", headers=ah, json={"name": "T-C2", "company": "T", "industry": "other", "service_type": "web_dev", "size": "small", "status": "active", "city": "Erode", "region": "India"}).json()
        p = requests.post(f"{API}/projects", headers=ah, json={"client_id": c1["id"], "name": "T-Proj", "budget": 1000,
                                                               "milestones": [{"title": "M1"}], "deliverables": [{"item": "D1"}]}).json()
        m1 = p["milestones"][0]
        r = requests.put(f"{API}/projects/{p['id']}", headers=ah, json={
            "name": "T-Proj v2", "client_id": c2["id"], "budget": 2500, "start_date": "2026-10-01", "end_date": "2026-12-01",
            "milestones": [{"id": m1["id"], "title": "M1 renamed", "done": True}, {"title": "M2", "due_date": "2026-11-01"}],
            "deliverables": []})
        assert r.status_code == 200, r.text
        got = requests.get(f"{API}/projects/{p['id']}", headers=ah).json()
        assert got["name"] == "T-Proj v2" and got["client_id"] == c2["id"] and got["budget"] == 2500
        assert [m["title"] for m in got["milestones"]] == ["M1 renamed", "M2"] and got["milestones"][0]["id"] == m1["id"]
        assert got["deliverables"] == []
        # validation
        assert requests.put(f"{API}/projects/{p['id']}", headers=ah, json={"name": "  "}).status_code == 400
        assert requests.put(f"{API}/projects/{p['id']}", headers=ah, json={"start_date": "2026-12-01", "end_date": "2026-01-01"}).status_code == 400
        assert requests.put(f"{API}/projects/{p['id']}", headers=ah, json={"client_id": "nope"}).status_code == 404
        # line-item delete
        r = requests.delete(f"{API}/records/projects/{p['id']}/items/milestones/{m1['id']}", headers=ah)
        assert r.status_code == 200 and len(r.json()["milestones"]) == 1
        assert requests.delete(f"{API}/records/projects/{p['id']}/items/bogus/x", headers=ah).status_code == 404
        for cid in (c1["id"], c2["id"]):
            requests.delete(f"{API}/records/clients/{cid}", headers=ah)


# ---------------- Partnerships + recycle bin ----------------
class TestPartnershipsAndBin:
    def test_partnership_delete_needs_permission_and_is_recoverable(self, ah, mh, employee):
        p = requests.post(f"{API}/partnerships", headers=ah, json={"name": "T-Partner", "partner_type": "platform", "cost": 0, "billing_cycle": "yearly",
                                                                   "benefits": [{"id": "bn-1", "title": "Credit", "credit_value": 100, "used": False}]}).json()
        assert requests.delete(f"{API}/partnerships/{p['id']}", headers=employee["h"]).status_code == 403
        r = requests.delete(f"{API}/records/partnerships/{p['id']}/items/benefits/bn-1", headers=mh)
        assert r.status_code == 200 and r.json()["benefits"] == []
        assert requests.delete(f"{API}/partnerships/{p['id']}", headers=mh).status_code == 200
        snap = next(s for s in requests.get(f"{API}/workspace/recycle-bin", headers=ah).json() if s["record_id"] == p["id"])
        # purge one snapshot (super admin only)
        assert requests.delete(f"{API}/workspace/recycle-bin/{snap['id']}", headers=mh).status_code == 403
        assert requests.delete(f"{API}/workspace/recycle-bin/{snap['id']}", headers=ah).status_code == 200
        assert all(s["id"] != snap["id"] for s in requests.get(f"{API}/workspace/recycle-bin", headers=ah).json())
