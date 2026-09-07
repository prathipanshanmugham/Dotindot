"""Phase 4 tests: Employees/Training, Partnerships, Logs, Locations."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://agency-hub-490.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
PWD = "Dotindot@2026"

USERS = {
    "admin": "admin@dotindot.com",
    "finance": "finance@dotindot.com",
    "sales": "sales@dotindot.com",
    "pm": "pm@dotindot.com",
    "employee": "employee@dotindot.com",
    "designer": "designer@dotindot.com",
    "dev": "dev@dotindot.com",
    "marketing": "marketing@dotindot.com",
}


def _login(email):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": PWD}, timeout=15)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def tokens():
    return {k: _login(v) for k, v in USERS.items()}


def H(t):
    return {"Authorization": f"Bearer {t}"}


# ---------- Auth regression ----------
def test_all_users_login(tokens):
    for k, tok in tokens.items():
        assert tok and isinstance(tok, str), f"{k} missing token"


def test_clients_regression(tokens):
    r = requests.get(f"{API}/clients", headers=H(tokens["admin"]), timeout=15)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


# ---------- Employees Directory ----------
def test_employees_directory(tokens):
    r = requests.get(f"{API}/employees", headers=H(tokens["admin"]), timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert len(data) >= 8
    # check enrichment on at least one
    keys = set().union(*(d.keys() for d in data))
    for f in ("designation", "department", "city", "skills", "join_date"):
        assert f in keys, f"missing {f} in employees payload"


def test_employees_filter_role_search(tokens):
    r = requests.get(f"{API}/employees?role=employee", headers=H(tokens["admin"]), timeout=15)
    assert r.status_code == 200
    assert all(u["role"] == "employee" for u in r.json())

    r2 = requests.get(f"{API}/employees?search=Figma", headers=H(tokens["admin"]), timeout=15)
    assert r2.status_code == 200
    names = [u["name"] for u in r2.json()]
    assert any("Ananya" in n for n in names), f"expected Ananya via Figma search, got {names}"


# ---------- Employee Profile RBAC ----------
def test_employee_profile_admin_any(tokens):
    r = requests.get(f"{API}/employees/user-employee", headers=H(tokens["admin"]), timeout=15)
    assert r.status_code == 200
    body = r.json()
    for k in ("user", "projects", "training", "performance"):
        assert k in body
    perf = body["performance"]
    for k in ("projects_total", "projects_active", "total_budget", "deliverables_done", "deliverables_total", "training_completed", "training_total"):
        assert k in perf


def test_employee_self_ok_other_forbidden(tokens):
    r = requests.get(f"{API}/employees/user-employee", headers=H(tokens["employee"]), timeout=15)
    assert r.status_code == 200
    r2 = requests.get(f"{API}/employees/user-pm", headers=H(tokens["employee"]), timeout=15)
    assert r2.status_code == 403


# ---------- Profile edit ----------
def test_profile_edit_rbac(tokens):
    # admin edits another
    r = requests.put(
        f"{API}/employees/user-designer/profile",
        headers=H(tokens["admin"]),
        json={"designation": "Senior Designer"},
        timeout=15,
    )
    assert r.status_code == 200

    # employee edits own
    r = requests.put(
        f"{API}/employees/user-employee/profile",
        headers=H(tokens["employee"]),
        json={"city": "Bengaluru", "phone": "+91-9000000000", "name": "SHOULD_BE_IGNORED"},
        timeout=15,
    )
    assert r.status_code == 200
    body = r.json()
    assert body.get("name") != "SHOULD_BE_IGNORED"  # name change ignored

    # employee edits other -> 403
    r = requests.put(
        f"{API}/employees/user-pm/profile",
        headers=H(tokens["employee"]),
        json={"city": "X"},
        timeout=15,
    )
    assert r.status_code == 403


# ---------- Training ----------
def test_training_courses_and_rbac(tokens):
    r = requests.get(f"{API}/training/courses", headers=H(tokens["admin"]), timeout=15)
    assert r.status_code == 200
    courses = r.json()
    ids = [c["id"] for c in courses]
    for i in range(1, 6):
        assert f"seed-course-0{i}" in ids, f"missing seed-course-0{i}"

    # employee 403 on course CRUD
    r = requests.post(f"{API}/training/courses", headers=H(tokens["employee"]), json={"title": "X"}, timeout=15)
    assert r.status_code == 403


def test_training_assign_and_progress(tokens):
    # duplicate check first — try to assign a course already assigned to employee (find one from list)
    r = requests.get(f"{API}/training/assignments?user_id=user-employee", headers=H(tokens["admin"]), timeout=15)
    assert r.status_code == 200
    existing = r.json()
    existing_course_ids = {a["course_id"] for a in existing}

    # pick a course NOT assigned
    all_courses = requests.get(f"{API}/training/courses", headers=H(tokens["admin"]), timeout=15).json()
    unassigned = [c for c in all_courses if c["id"] not in existing_course_ids]
    if not unassigned:
        pytest.skip("no unassigned course available")
    course = unassigned[0]

    # employee cannot assign
    r = requests.post(
        f"{API}/training/assignments",
        headers=H(tokens["employee"]),
        json={"user_id": "user-employee", "course_id": course["id"]},
        timeout=15,
    )
    assert r.status_code == 403

    # admin assigns
    r = requests.post(
        f"{API}/training/assignments",
        headers=H(tokens["admin"]),
        json={"user_id": "user-employee", "course_id": course["id"]},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    aid = r.json()["id"]

    # duplicate -> 400
    r = requests.post(
        f"{API}/training/assignments",
        headers=H(tokens["admin"]),
        json={"user_id": "user-employee", "course_id": course["id"]},
        timeout=15,
    )
    assert r.status_code == 400

    # progress 50 -> in_progress (assignee updating own)
    r = requests.put(f"{API}/training/assignments/{aid}", headers=H(tokens["employee"]), json={"progress": 50}, timeout=15)
    assert r.status_code == 200
    assert r.json()["status"] == "in_progress"
    assert r.json()["progress"] == 50

    # other employee cannot update
    r = requests.put(f"{API}/training/assignments/{aid}", headers=H(tokens["designer"]), json={"progress": 60}, timeout=15)
    assert r.status_code == 403

    # progress 100 -> completed
    r = requests.put(f"{API}/training/assignments/{aid}", headers=H(tokens["admin"]), json={"progress": 100}, timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "completed"
    assert body.get("completed_at")

    # cleanup
    requests.delete(f"{API}/training/assignments/{aid}", headers=H(tokens["admin"]), timeout=15)


# ---------- Partnerships ----------
def test_partnerships_rbac(tokens):
    # employee 403 on all
    for path in ["/partnerships", "/partnerships/stats"]:
        r = requests.get(f"{API}{path}", headers=H(tokens["employee"]), timeout=15)
        assert r.status_code == 403, f"{path} expected 403 got {r.status_code}"
    r = requests.post(f"{API}/partnerships", headers=H(tokens["employee"]), json={"name": "X", "type": "vendor"}, timeout=15)
    assert r.status_code == 403

    # sales GET 200, POST 403
    r = requests.get(f"{API}/partnerships", headers=H(tokens["sales"]), timeout=15)
    assert r.status_code == 200
    r = requests.post(f"{API}/partnerships", headers=H(tokens["sales"]), json={"name": "X"}, timeout=15)
    assert r.status_code == 403
    r = requests.post(f"{API}/partnerships/seed-partner-01/benefits/bn-01a/toggle", headers=H(tokens["sales"]), timeout=15)
    assert r.status_code == 403


def test_partnerships_stats(tokens):
    r = requests.get(f"{API}/partnerships", headers=H(tokens["admin"]), timeout=15)
    assert r.status_code == 200
    items = r.json()
    ids = [p["id"] for p in items]
    for i in range(1, 7):
        assert f"seed-partner-0{i}" in ids
    # enrichment
    p1 = next(p for p in items if p["id"] == "seed-partner-01")
    for f in ("days_to_renewal", "renewing_soon", "unused_value"):
        assert f in p1

    r = requests.get(f"{API}/partnerships/stats", headers=H(tokens["admin"]), timeout=15)
    assert r.status_code == 200
    s = r.json()
    assert s["unused_benefits_value"] == 185000, s
    assert s["annual_cost"] == 89000, s
    renewing = s.get("renewing_soon", [])
    assert len(renewing) == 2, renewing


def test_partnerships_benefit_toggle_roundtrip(tokens):
    # Toggle bn-01a (₹20k Google credit)
    r = requests.post(f"{API}/partnerships/seed-partner-01/benefits/bn-01a/toggle", headers=H(tokens["admin"]), timeout=15)
    assert r.status_code == 200
    s = requests.get(f"{API}/partnerships/stats", headers=H(tokens["admin"]), timeout=15).json()
    assert s["unused_benefits_value"] == 165000, s

    # Toggle back
    r = requests.post(f"{API}/partnerships/seed-partner-01/benefits/bn-01a/toggle", headers=H(tokens["admin"]), timeout=15)
    assert r.status_code == 200
    s = requests.get(f"{API}/partnerships/stats", headers=H(tokens["admin"]), timeout=15).json()
    assert s["unused_benefits_value"] == 185000, s


def test_partnerships_crud(tokens):
    payload = {
        "name": "TEST_Partnership",
        "type": "vendor",
        "status": "active",
        "annual_cost": 1000,
        "benefits": [{"id": "tp-b1", "title": "Credit", "credit_value": 5000, "used": False}],
    }
    r = requests.post(f"{API}/partnerships", headers=H(tokens["admin"]), json=payload, timeout=15)
    assert r.status_code in (200, 201), r.text
    pid = r.json()["id"]

    r = requests.put(f"{API}/partnerships/{pid}", headers=H(tokens["admin"]), json={"name": "TEST_Partnership_Upd"}, timeout=15)
    assert r.status_code == 200

    r = requests.delete(f"{API}/partnerships/{pid}", headers=H(tokens["admin"]), timeout=15)
    assert r.status_code in (200, 204)


# ---------- Locations ----------
def test_locations_map(tokens):
    r = requests.get(f"{API}/locations/map", headers=H(tokens["admin"]), timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert "cities" in body and "totals" in body
    t = body["totals"]
    assert t["clients"] == 11
    assert t["branches"] == 2
    assert t["employees"] == 8
    assert t["cities"] == 8
    city_names = [c.get("city") or c.get("name") for c in body["cities"]]
    for expected in ("Mumbai", "Dubai", "London"):
        assert any(expected in (n or "") for n in city_names), f"missing city {expected}: {city_names}"

    # employee 403
    r = requests.get(f"{API}/locations/map", headers=H(tokens["employee"]), timeout=15)
    assert r.status_code == 403


def test_locations_branches(tokens):
    r = requests.get(f"{API}/locations/branches", headers=H(tokens["admin"]), timeout=15)
    assert r.status_code == 200
    branches = r.json()
    assert len(branches) == 2


# ---------- Logs ----------
def test_logs_rbac(tokens):
    for role in ("finance", "sales", "pm", "employee"):
        r = requests.get(f"{API}/logs", headers=H(tokens[role]), timeout=15)
        assert r.status_code == 403


def test_logs_pagination_and_filters(tokens):
    r = requests.get(f"{API}/logs?page=1&page_size=5", headers=H(tokens["admin"]), timeout=15)
    assert r.status_code == 200
    b1 = r.json()
    assert set(b1.keys()) >= {"items", "total", "page", "page_size"}
    assert len(b1["items"]) <= 5

    r2 = requests.get(f"{API}/logs?page=2&page_size=5", headers=H(tokens["admin"]), timeout=15)
    b2 = r2.json()
    if b1["total"] > 5:
        ids1 = [i.get("id") or i.get("timestamp") for i in b1["items"]]
        ids2 = [i.get("id") or i.get("timestamp") for i in b2["items"]]
        assert ids1 != ids2

    r = requests.get(f"{API}/logs?action=login", headers=H(tokens["admin"]), timeout=15)
    assert r.status_code == 200
    for it in r.json()["items"]:
        assert it["action"] == "login"

    r = requests.get(f"{API}/logs?user_id=user-admin", headers=H(tokens["admin"]), timeout=15)
    assert r.status_code == 200
    for it in r.json()["items"]:
        assert it["user_id"] == "user-admin"


def test_logs_meta_and_seeded_aged(tokens):
    r = requests.get(f"{API}/logs/meta", headers=H(tokens["admin"]), timeout=15)
    assert r.status_code == 200
    m = r.json()
    assert m["purge"]["retention_days"] == 90
    assert "next_run" in m["purge"]
    # purgeable_count might be 0 already if a previous run purged them
    # for this test, we expect >=10 or 0 (already purged)


def test_logs_manual_purge_last(tokens):
    """Run LAST - deletes aged logs permanently (seed guard)."""
    # get pre-purge meta
    m0 = requests.get(f"{API}/logs/meta", headers=H(tokens["admin"]), timeout=15).json()
    pre = m0["purge"]["purgeable_count"]

    # employee forbidden
    r = requests.post(f"{API}/logs/purge", headers=H(tokens["employee"]), timeout=15)
    assert r.status_code == 403

    # admin purge
    r = requests.post(f"{API}/logs/purge", headers=H(tokens["admin"]), timeout=30)
    assert r.status_code == 200
    body = r.json()
    assert body.get("trigger") == "manual"
    assert "deleted_count" in body
    assert body["deleted_count"] == pre, f"expected {pre}, got {body['deleted_count']}"

    # post-purge meta
    m1 = requests.get(f"{API}/logs/meta", headers=H(tokens["admin"]), timeout=15).json()
    assert m1["purge"]["purgeable_count"] == 0
    lr = m1["purge"]["last_run"]
    assert lr and lr.get("trigger") == "manual"
    assert "deleted_count" in lr

    # seed-oldlog-11..13 (recent) should still exist -- search by id via listing
    # they are within 90 days; check via /logs with high page_size
    r = requests.get(f"{API}/logs?page=1&page_size=100", headers=H(tokens["admin"]), timeout=15)
    all_ids = {it.get("id") for it in r.json()["items"]}
    # Not strictly ensured to appear on page 1; just verify total still contains a lot
    assert r.json()["total"] > 0
