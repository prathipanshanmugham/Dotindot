"""Role-based dashboards.
- /dashboard/ceo     super_admin (+ admin via ceo_dashboard perm): org-wide extras on top of /ceo/dashboard
- /dashboard/manager admin or any user with a branch_role=manager assignment; scoped to managed branches
- /dashboard/staff   everyone: personal view
- /dashboard/which   resolves the landing dashboard for the current user
"""
from datetime import datetime, timezone, timedelta, date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from database import db
from auth import get_current_user
from permissions import has_permission
from routes_sales import won_at

router = APIRouter()

ACTIVE = ("kickoff", "in_progress", "review")
CRITICAL_ACTIONS = ("expense_approved", "expense_rejected", "workspace_deleted", "workspace_bulk_deleted", "asset_deleted",
                    "user_deleted", "user_deactivated", "permissions_updated", "permissions_reset", "role_defaults_updated",
                    "branch_access_updated", "password_revealed", "password_copied", "workspace_restored")


def _today() -> date:
    return datetime.now(timezone.utc).date()


def managed_branches(user: dict):
    """None = all branches (super_admin / unrestricted admin); [] = none; else managed branch ids."""
    if user.get("role") == "super_admin":
        return None
    assigns = user.get("branch_assignments") or []
    mgr = [a["branch_id"] for a in assigns if a.get("branch_role") == "manager"]
    if user.get("role") == "admin" and not assigns:
        return None
    return mgr


def resolve_dashboard(user: dict) -> str:
    if user.get("role") == "super_admin":
        return "ceo"
    mb = managed_branches(user)
    if mb is None or mb:
        return "manager"
    return "staff"


@router.get("/dashboard/which")
async def which_dashboard(user: dict = Depends(get_current_user)):
    return {"dashboard": resolve_dashboard(user), "can_switch": user.get("role") == "super_admin",
            "managed_branches": managed_branches(user)}


async def _umap():
    return {u["id"]: u["name"] for u in await db.users.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(1000)}


async def _bmap():
    return {b["id"]: b["name"] for b in await db.branches.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(100)}


def _month_range():
    t = _today()
    return t.replace(day=1).isoformat(), t.isoformat()


# ---------------- CEO extras ----------------
@router.get("/dashboard/ceo")
async def ceo_extras(user: dict = Depends(get_current_user)):
    if not has_permission(user, "ceo_dashboard"):
        raise HTTPException(status_code=403, detail="CEO dashboard is restricted")
    t = _today().isoformat()
    soon = (_today() + timedelta(days=30)).isoformat()
    assets = await db.assets.find({}, {"_id": 0, "purchase_value": 1, "status": 1, "next_maintenance_date": 1}).to_list(5000)
    users = await db.users.find({"is_active": True, "deleted": {"$ne": True}}, {"_id": 0, "branch_id": 1, "branch_assignments": 1}).to_list(1000)
    bmap = await _bmap()
    head = {}
    for u in users:
        bid = u.get("branch_id") or ((u.get("branch_assignments") or [{}])[0].get("branch_id"))
        key = bmap.get(bid, "Unassigned")
        head[key] = head.get(key, 0) + 1
    pw = await db.password_entries.find({}, {"_id": 0, "twofa_enabled": 1, "last_password_changed": 1, "change_interval_days": 1}).to_list(1000)
    overdue = 0
    for e in pw:
        lc = e.get("last_password_changed")
        if lc and (date.fromisoformat(lc[:10]) + timedelta(days=e.get("change_interval_days") or 90)).isoformat() < t:
            overdue += 1
    subs = await db.subscriptions.find({"status": "active"}, {"_id": 0, "name": 1, "next_renewal_date": 1, "cost": 1, "amount": 1}).to_list(500)
    renewals = sorted([s for s in subs if s.get("next_renewal_date") and t <= s["next_renewal_date"] <= soon], key=lambda s: s["next_renewal_date"])
    feed = await db.activity_logs.find({"action": {"$in": list(CRITICAL_ACTIONS)}}, {"_id": 0}).sort("timestamp", -1).to_list(12)
    return {
        "assets": {"count": len(assets), "value": round(sum(a.get("purchase_value") or 0 for a in assets), 2),
                   "maintenance_due": sum(1 for a in assets if a.get("next_maintenance_date") and a["next_maintenance_date"] <= soon and a.get("status") != "retired"),
                   "in_use": sum(1 for a in assets if a.get("status") == "in_use")},
        "employees": {"headcount": len(users), "by_branch": [{"branch": k, "count": v} for k, v in sorted(head.items(), key=lambda i: -i[1])]},
        "security": {"entries": len(pw), "without_2fa": sum(1 for e in pw if not e.get("twofa_enabled")), "overdue_changes": overdue},
        "renewals": {"count": len(renewals), "items": [{"name": s["name"], "date": s["next_renewal_date"], "cost": s.get("cost") or s.get("amount") or 0} for s in renewals[:6]]},
        "critical_feed": feed,
    }


# ---------------- Manager ----------------
@router.get("/dashboard/manager")
async def manager_dashboard(branch: Optional[str] = Query(None), user: dict = Depends(get_current_user)):
    mb = managed_branches(user)
    if mb is not None and not mb:
        raise HTTPException(status_code=403, detail="Manager dashboard requires a branch manager assignment")
    bq = {} if mb is None else {"id": {"$in": mb}}
    branches = await db.branches.find(bq, {"_id": 0, "id": 1, "name": 1, "city": 1}).to_list(100)
    ids = [b["id"] for b in branches]
    if branch and branch in ids:
        ids = [branch]
    start, end = _month_range()
    umap = await _umap()

    clients = await db.clients.find({"branch_id": {"$in": ids}}, {"_id": 0, "id": 1, "name": 1, "status": 1}).to_list(3000)
    cids = [c["id"] for c in clients]
    leads = await db.leads.find({"branch_id": {"$in": ids}}, {"_id": 0}).to_list(5000)
    won = [l for l in leads if l["stage"] == "won" and (won_at(l) or "") >= start]
    open_leads = [l for l in leads if l["stage"] not in ("won", "lost")]
    tx = await db.transactions.find({"client_id": {"$in": cids}, "type": "income", "date": {"$gte": start, "$lte": end}}, {"_id": 0, "amount": 1}).to_list(5000)
    projects = await db.projects.find({"client_id": {"$in": cids}}, {"_id": 0, "id": 1, "name": 1, "status": 1, "team_member_ids": 1, "client_id": 1}).to_list(3000)

    team = {}
    for l in won:
        o = l.get("owner_id")
        team.setdefault(o, {"name": umap.get(o, "Unassigned"), "won_value": 0, "won_count": 0, "projects": 0})
        team[o]["won_value"] += l.get("estimated_value", 0)
        team[o]["won_count"] += 1
    for p in projects:
        if p["status"] in ACTIVE:
            for m in p.get("team_member_ids") or []:
                team.setdefault(m, {"name": umap.get(m, "?"), "won_value": 0, "won_count": 0, "projects": 0})
                team[m]["projects"] += 1
    team_rows = sorted(team.values(), key=lambda r: (-r["won_value"], -r["projects"]))[:8]

    assets = await db.assets.find({"branch_id": {"$in": ids}, "status": {"$ne": "retired"}}, {"_id": 0, "status": 1, "purchase_value": 1}).to_list(5000)
    overdue_follow = [{"id": l["id"], "name": l["name"], "follow_up_date": l.get("follow_up_date"), "owner": umap.get(l.get("owner_id"), "")}
                      for l in open_leads if l.get("follow_up_date") and l["follow_up_date"] < end][:6]
    pending_expenses = await db.expenses.count_documents({"status": "submitted"}) if has_permission(user, "finance.expenses") and user["role"] in ("admin", "finance", "super_admin") else None
    posts_review = await db.social_posts.count_documents({"client_id": {"$in": cids}, "status": "in_review"}) if has_permission(user, "social") else None
    activity = await db.activity_logs.find({"$or": [{"entity_id": {"$in": cids + [p["id"] for p in projects] + [l["id"] for l in leads]}}, {"user_id": {"$in": list(team.keys())}}]},
                                           {"_id": 0}).sort("timestamp", -1).to_list(10)
    return {
        "branches": branches, "selected_branch": branch if branch in [b["id"] for b in branches] else None, "range": {"start": start, "end": end},
        "sales": {"won_value": round(sum(l.get("estimated_value", 0) for l in won), 2), "won_count": len(won),
                  "open_pipeline": round(sum(l.get("estimated_value", 0) for l in open_leads), 2), "open_leads": len(open_leads),
                  "revenue": round(sum(x["amount"] for x in tx), 2)},
        "clients": {"total": len(clients), "active": sum(1 for c in clients if c.get("status") == "active")},
        "projects": {"total": len(projects), "active": sum(1 for p in projects if p["status"] in ACTIVE)},
        "team": team_rows,
        "assets": {"count": len(assets), "in_use": sum(1 for a in assets if a.get("status") == "in_use"), "value": round(sum(a.get("purchase_value") or 0 for a in assets), 2)},
        "pending": {"expense_approvals": pending_expenses, "overdue_followups": overdue_follow, "posts_in_review": posts_review},
        "activity": activity,
    }


# ---------------- Staff ----------------
@router.get("/dashboard/staff")
async def staff_dashboard(user: dict = Depends(get_current_user)):
    uid = user["id"]
    start, end = _month_range()
    projects = await db.projects.find({"team_member_ids": uid}, {"_id": 0, "id": 1, "name": 1, "status": 1, "deliverables": 1, "client_id": 1, "end_date": 1}).to_list(500)
    cmap = {c["id"]: c["name"] for c in await db.clients.find({"id": {"$in": [p["client_id"] for p in projects if p.get("client_id")]}}, {"_id": 0, "id": 1, "name": 1}).to_list(500)}
    tasks = []
    for p in projects:
        for d in p.get("deliverables") or []:
            if not d.get("done"):
                tasks.append({"project_id": p["id"], "project": p["name"], "client": cmap.get(p.get("client_id"), ""), "title": d.get("item") or d.get("title") or d.get("name") or "Deliverable", "due": d.get("due_date")})
    sales = None
    if has_permission(user, "sales.pipeline", "sales.targets"):
        leads = await db.leads.find({"owner_id": uid}, {"_id": 0}).to_list(2000)
        won = [l for l in leads if l["stage"] == "won" and (won_at(l) or "") >= start]
        target = await db.targets.find_one({"scope": "individual", "user_id": uid, "period": start[:7]}, {"_id": 0})
        wv = round(sum(l.get("estimated_value", 0) for l in won), 2)
        sales = {"open_leads": sum(1 for l in leads if l["stage"] not in ("won", "lost")), "won_count": len(won), "won_value": wv,
                 "target": target["amount"] if target else None, "pct": round(wv / target["amount"] * 100, 1) if target and target["amount"] else None,
                 "overdue_followups": sum(1 for l in leads if l["stage"] not in ("won", "lost") and l.get("follow_up_date") and l["follow_up_date"] < end)}
    assets = await db.assets.find({"assigned_to": uid, "status": {"$ne": "retired"}}, {"_id": 0, "id": 1, "code": 1, "name": 1, "asset_type": 1, "next_maintenance_date": 1}).to_list(100)
    assigns = await db.training_assignments.find({"user_id": uid}, {"_id": 0}).to_list(100)
    courses = {c["id"]: c["title"] for c in await db.training_courses.find({"id": {"$in": [a["course_id"] for a in assigns]}}, {"_id": 0, "id": 1, "title": 1}).to_list(100)}
    training = [{"course": courses.get(a["course_id"], "Course"), "status": a.get("status"), "due_date": a.get("due_date")} for a in assigns]
    extras = {}
    if user["role"] == "finance":
        extras["pending_expense_approvals"] = await db.expenses.count_documents({"status": "submitted"})
    if user["role"] == "social_manager":
        extras["posts_in_review"] = await db.social_posts.count_documents({"status": "in_review"})
    if user["role"] == "ads_manager":
        extras["active_campaigns"] = await db.ad_campaigns.count_documents({"status": "active"})
    my_expenses = await db.expenses.count_documents({"submitted_by": uid, "status": "submitted"})
    activity = await db.activity_logs.find({"user_id": uid}, {"_id": 0}).sort("timestamp", -1).to_list(10)
    return {
        "projects": {"total": len(projects), "active": sum(1 for p in projects if p["status"] in ACTIVE),
                     "items": [{"id": p["id"], "name": p["name"], "status": p["status"], "client": cmap.get(p.get("client_id"), ""), "end_date": p.get("end_date"),
                                "progress": round(sum(1 for d in (p.get("deliverables") or []) if d.get("done")) / max(1, len(p.get("deliverables") or [])) * 100)} for p in projects[:8]]},
        "tasks": tasks[:10], "open_tasks": len(tasks),
        "sales": sales, "assets": assets, "training": training,
        "training_completed": sum(1 for a in assigns if a.get("status") == "completed"),
        "my_pending_expenses": my_expenses, "extras": extras, "activity": activity,
    }
