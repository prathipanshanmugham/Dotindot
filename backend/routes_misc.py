from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, Query
from database import db
from auth import get_current_user, require_roles
from permissions import branch_scope, scoped_client_ids

router = APIRouter()


@router.get("/search")
async def global_search(q: str = Query(..., min_length=1), user: dict = Depends(get_current_user)):
    results = {"clients": [], "projects": []}
    branches = branch_scope(user)
    if user["role"] != "employee":
        cq = {"$or": [
            {"name": {"$regex": q, "$options": "i"}},
            {"company": {"$regex": q, "$options": "i"}},
        ]}
        if branches is not None:
            cq["branch_id"] = {"$in": branches}
        results["clients"] = await db.clients.find(
            cq,
            {"_id": 0, "id": 1, "name": 1, "company": 1, "status": 1},
        ).limit(6).to_list(6)
    pq = {"name": {"$regex": q, "$options": "i"}}
    if user["role"] == "employee":
        pq["team_member_ids"] = user["id"]
    ids = await scoped_client_ids(user)
    if ids is not None:
        pq["client_id"] = {"$in": ids}
    projects = await db.projects.find(
        pq, {"_id": 0, "id": 1, "name": 1, "status": 1, "client_id": 1}
    ).limit(6).to_list(6)
    if projects:
        cids = list({p["client_id"] for p in projects})
        crows = await db.clients.find({"id": {"$in": cids}}, {"_id": 0, "id": 1, "name": 1}).to_list(50)
        cmap = {c["id"]: c["name"] for c in crows}
        for p in projects:
            p["client_name"] = cmap.get(p["client_id"], "")
    results["projects"] = projects
    return results


@router.get("/notifications")
async def notifications(user: dict = Depends(get_current_user)):
    """Role-filtered in-app notification feed, computed on demand."""
    role = "admin" if user["role"] == "super_admin" else user["role"]
    today = datetime.now(timezone.utc).date()
    t_iso = today.isoformat()
    items = []

    if role in ("admin", "finance", "pm", "sales"):
        limit30 = (today + timedelta(days=30)).isoformat()
        clients = await db.clients.find({}, {"_id": 0, "id": 1, "name": 1, "contracts": 1}).to_list(1000)
        for c in clients:
            for ct in c.get("contracts", []):
                exp = ct.get("expiry_date")
                if exp and t_iso <= exp <= limit30:
                    items.append({"kind": "contract", "title": f"{c['name']} — {ct['title']}",
                                  "sub": f"Contract expires {exp}", "link": f"/clients/{c['id']}", "date": exp})

    if role in ("admin", "finance"):
        limit30 = (today + timedelta(days=30)).isoformat()
        subs = await db.subscriptions.find({"status": "active", "next_renewal_date": {"$gte": t_iso, "$lte": limit30}}, {"_id": 0}).to_list(200)
        for s in subs:
            items.append({"kind": "subscription", "title": s["name"],
                          "sub": f"Renews {s['next_renewal_date']} · ₹{int(s['cost']):,}/{s['billing_cycle']}",
                          "link": "/finance/subscriptions", "date": s["next_renewal_date"]})
        limit60 = (today + timedelta(days=60)).isoformat()
        partners = await db.partnerships.find({"status": "active", "renewal_date": {"$gte": t_iso, "$lte": limit60}}, {"_id": 0}).to_list(200)
        for p in partners:
            items.append({"kind": "partnership", "title": p["name"],
                          "sub": f"Partnership renews {p['renewal_date']}", "link": "/partnerships", "date": p["renewal_date"]})
        pending = await db.expenses.count_documents({"status": "submitted"})
        if pending:
            items.append({"kind": "expense", "title": f"{pending} expense{'s' if pending > 1 else ''} awaiting approval",
                          "sub": "Review in the expenses workflow", "link": "/finance/expenses", "date": t_iso})

    if role in ("admin", "sales"):
        leads = await db.leads.find(
            {"stage": {"$in": ["new", "contacted", "qualified", "proposal"]}, "follow_up_date": {"$ne": None, "$lt": t_iso}},
            {"_id": 0, "id": 1, "name": 1, "follow_up_date": 1}).to_list(200)
        for l in leads:
            items.append({"kind": "followup", "title": f"Follow-up overdue: {l['name']}",
                          "sub": f"Was due {l['follow_up_date']}", "link": f"/sales/leads/{l['id']}", "date": l["follow_up_date"]})

    if role in ("admin", "finance"):
        limit30a = (today + timedelta(days=30)).isoformat()
        due_assets = await db.assets.find(
            {"next_maintenance_date": {"$ne": None, "$lte": limit30a}, "status": {"$ne": "retired"}},
            {"_id": 0, "id": 1, "name": 1, "code": 1, "next_maintenance_date": 1}).to_list(200)
        for a in due_assets:
            overdue = a["next_maintenance_date"] < t_iso
            items.append({"kind": "asset", "title": f"{'Maintenance overdue' if overdue else 'Maintenance due'}: {a['name']}",
                          "sub": f"{a.get('code', '')} · {'was due' if overdue else 'due'} {a['next_maintenance_date']}",
                          "link": "/assets", "date": a["next_maintenance_date"]})

    if role == "admin":
        week_pw = (today + timedelta(days=7)).isoformat()
        pw_rows = await db.password_entries.find(
            {}, {"_id": 0, "id": 1, "name": 1, "last_password_changed": 1,
                 "change_interval_days": 1, "renewal_date": 1}).to_list(300)
        for p in pw_rows:
            lc = p.get("last_password_changed")
            iv = p.get("change_interval_days") or 90
            if lc:
                due = (datetime.fromisoformat(lc[:10]).date() + timedelta(days=iv)).isoformat()
                if due <= week_pw:
                    overdue_pw = due < t_iso
                    items.append({"kind": "password",
                                  "title": f"Password change {'overdue' if overdue_pw else 'due'}: {p['name']}",
                                  "sub": f"{'Was due' if overdue_pw else 'Due'} {due} (in-app reminder — email not configured)",
                                  "link": "/passwords", "date": due})
            if p.get("renewal_date") and t_iso <= p["renewal_date"] <= week_pw:
                items.append({"kind": "password", "title": f"Subscription renews soon: {p['name']}",
                              "sub": f"Renews {p['renewal_date']}", "link": "/passwords", "date": p["renewal_date"]})

    if role in ("admin", "social_manager"):
        week = (today + timedelta(days=7)).isoformat()
        posts = await db.social_posts.find(            {"scheduled_at": {"$gte": t_iso, "$lte": week + "T23:59:59"}, "status": {"$in": ["planned", "in_review"]}},
            {"_id": 0, "id": 1, "platform": 1, "scheduled_at": 1, "status": 1, "client_id": 1, "caption": 1}).to_list(200)
        cids = list({p["client_id"] for p in posts if p.get("client_id")})
        cmap = {c["id"]: c["name"] for c in await db.clients.find({"id": {"$in": cids}}, {"_id": 0, "id": 1, "name": 1}).to_list(100)}
        for p in posts:
            items.append({"kind": "social", "title": f"Post {'needs approval' if p['status'] == 'in_review' else 'not yet approved'}: {cmap.get(p.get('client_id'), 'Internal')}",
                          "sub": f"{p['platform']} · scheduled {p['scheduled_at'][:10]}",
                          "link": "/social", "date": p["scheduled_at"][:10]})

    if role == "employee":
        assignments = await db.training_assignments.find(
            {"user_id": user["id"], "status": {"$ne": "completed"}, "due_date": {"$ne": None, "$lt": t_iso}}, {"_id": 0}).to_list(50)
        course_ids = [a["course_id"] for a in assignments]
        courses = {c["id"]: c["title"] for c in await db.training_courses.find({"id": {"$in": course_ids}}, {"_id": 0}).to_list(50)}
        for a in assignments:
            items.append({"kind": "training", "title": f"Training overdue: {courses.get(a['course_id'], 'Course')}",
                          "sub": f"Was due {a['due_date']}", "link": f"/employees/{user['id']}", "date": a["due_date"]})

    items.sort(key=lambda x: x["date"])
    return {"items": items, "count": len(items)}


@router.get("/dashboard/stats")
async def dashboard_stats(user: dict = Depends(get_current_user)):
    is_employee = user["role"] == "employee"
    pq = {"team_member_ids": user["id"]} if is_employee else {}
    projects = await db.projects.find(pq, {"_id": 0, "credentials": 0}).to_list(1000)

    projects_by_status = {}
    total_budget = 0
    for p in projects:
        projects_by_status[p["status"]] = projects_by_status.get(p["status"], 0) + 1
        total_budget += p.get("budget", 0)
    active_projects = sum(
        v for k, v in projects_by_status.items() if k in ("kickoff", "in_progress", "review")
    )

    stats = {
        "role": user["role"],
        "projects_total": len(projects),
        "projects_active": active_projects,
        "projects_by_status": [{"name": k, "value": v} for k, v in projects_by_status.items()],
        "total_budget": total_budget,
        "clients_total": 0,
        "clients_active": 0,
        "clients_by_status": [],
        "clients_by_industry": [],
        "expiring_contracts": [],
    }

    if not is_employee:
        clients = await db.clients.find({}, {"_id": 0, "credentials": 0}).to_list(1000)
        by_status, by_industry = {}, {}
        for c in clients:
            by_status[c.get("status", "active")] = by_status.get(c.get("status", "active"), 0) + 1
            ind = c.get("industry") or "other"
            by_industry[ind] = by_industry.get(ind, 0) + 1
        stats["clients_total"] = len(clients)
        stats["clients_active"] = by_status.get("active", 0)
        stats["clients_by_status"] = [{"name": k, "value": v} for k, v in by_status.items()]
        stats["clients_by_industry"] = [{"name": k, "value": v} for k, v in by_industry.items()]

        today = datetime.now(timezone.utc).date()
        limit = (today + timedelta(days=30)).isoformat()
        expiring = []
        for c in clients:
            for ct in c.get("contracts", []):
                exp = ct.get("expiry_date")
                if exp and today.isoformat() <= exp <= limit:
                    expiring.append({
                        "client_id": c["id"], "client_name": c["name"],
                        "title": ct["title"], "expiry_date": exp, "value": ct.get("value", 0),
                    })
        expiring.sort(key=lambda x: x["expiry_date"])
        stats["expiring_contracts"] = expiring

    return stats

