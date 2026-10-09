"""v2.8 report templates — the numbers an agency runs on.

Each builder(date_from, date_to, branch_ids=None) returns {title, summary, charts, sections} like the other templates
in routes_reports.py. Registered there via V28_TEMPLATES / V28_BUILDERS.
"""
from datetime import date, datetime, timedelta, timezone
from database import db
from routes_daily import get_settings, _home_branch, _attendee, _hm_to_min, PRESENT
from routes_holidays import holidays_between, holiday_for
from routes_timesheets import cost_rate_lookup, _projects_index
from routes_finance import monthly_equiv
from routes_api_credits import PROVIDERS

V28_TEMPLATES = {
    "attendance": {
        "name": "Attendance & Punctuality",
        "description": "Per person and per location: attendance %, late arrivals, leave, missed days, average check-in and on-site check-ins.",
        "roles": ("admin", "pm"),
    },
    "timesheet-utilisation": {
        "name": "Timesheets & Utilisation",
        "description": "Hours logged vs hours available, billable %, team cost, hours by client and project, and pending timesheets.",
        "roles": ("admin", "pm", "finance"),
    },
    "client-profitability": {
        "name": "Client Profitability",
        "description": "Per client: revenue, direct expenses, AI/API usage and team cost from timesheets → gross profit, margin and revenue concentration.",
        "roles": ("admin", "finance"),
    },
    "project-delivery": {
        "name": "Project Delivery & Deadlines",
        "description": "Every live project's deadline, progress, overdue milestones, hours and budget used — flagged on track, at risk or late.",
        "roles": ("admin", "pm"),
    },
    "renewals": {
        "name": "Retainers & Renewals (next 90 days)",
        "description": "Client agreements and tool subscriptions coming up for renewal, retainer revenue at stake and recently lapsed contracts.",
        "roles": ("admin", "finance", "sales", "pm"),
    },
    "cash-flow": {
        "name": "Cash Flow Trend",
        "description": "Month by month income, expenses, net and running cash position, with the biggest income and cost categories.",
        "roles": ("admin", "finance"),
    },
    "lead-sources": {
        "name": "Lead Sources & Conversion",
        "description": "Which channels bring leads that convert: leads, proposals, wins, win rate, value won and days to close per source.",
        "roles": ("admin", "sales"),
    },
    "ai-costs": {
        "name": "AI & API Costs",
        "description": "API credit usage by account, client, project and AI agent, AI tool subscriptions, and AI cost as a share of each client's revenue.",
        "roles": ("admin", "finance"),
    },
}

WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
nice = lambda s: (s or "—").replace("_", " ").title()


def _today():
    return datetime.now(timezone.utc).date()


def _dates(date_from, date_to):
    a, b = date.fromisoformat(date_from[:10]), date.fromisoformat(date_to[:10])
    return [a + timedelta(days=i) for i in range((b - a).days + 1)] if b >= a else []


async def _people(branch_ids):
    users = [u for u in await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(3000) if _attendee(u)]
    if branch_ids:
        users = [u for u in users if _home_branch(u) in branch_ids]
    return users


async def _bnames():
    return {b["id"]: b["name"] for b in await db.branches.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(100)}


async def _client_scope(branch_ids):
    if not branch_ids:
        return None
    return {c["id"] for c in await db.clients.find({"branch_id": {"$in": branch_ids}}, {"_id": 0, "id": 1}).to_list(5000)}


async def _working_days(person, days, settings, hols, upto):
    off = set(settings.get("weekly_off") or [])
    b = _home_branch(person)
    return [d for d in days if d <= upto and d.weekday() not in off and not holiday_for(hols, d.isoformat(), b)]


# ------------------------------------------------------------------ 1. attendance
async def tpl_attendance(date_from, date_to, branch_ids=None):
    s = await get_settings()
    days = _dates(date_from, date_to)
    today = _today()
    people = await _people(branch_ids)
    hols = await holidays_between(date_from, date_to)
    recs = await db.daily_reports.find({"date": {"$gte": date_from, "$lte": date_to}, "user_id": {"$in": [p["id"] for p in people]}},
                                       {"_id": 0}).to_list(50000)
    by = {}
    for r in recs:
        by.setdefault(r["user_id"], {})[r["date"]] = r
    bnames = await _bnames()
    rows, loc, late_wd = [], {}, [0] * 7
    for p in sorted(people, key=lambda x: x["name"]):
        mine = by.get(p["id"], {})
        work = await _working_days(p, days, s, hols, today)
        present = late = leave = wfh = absent = reports = office_loc = office_on = 0
        ins, hours = [], []
        for d in work:
            r = mine.get(d.isoformat())
            st = (r or {}).get("status")
            if st in PRESENT:
                present += 0.5 if st == "half_day" else 1
                if r.get("check_in_local"):
                    ins.append(_hm_to_min(r["check_in_local"]))
                if r.get("hours"):
                    hours.append(float(r["hours"]))
            if r and r.get("late"):
                late += 1
                late_wd[d.weekday()] += 1
            leave += st == "leave"
            wfh += st == "wfh"
            absent += st == "absent"
            if r and (r.get("report") or {}).get("submitted"):
                reports += 1
            if st == "office" and r.get("check_in_location"):
                office_loc += 1
                office_on += bool(r.get("on_site"))
        missing = sum(1 for d in work if not (mine.get(d.isoformat()) or {}).get("status"))
        rate = round(100 * present / len(work)) if work else None
        avg_in = sum(ins) / len(ins) if ins else None
        branch = bnames.get(_home_branch(p), "No branch")
        rows.append({"name": p["name"], "branch": branch, "working_days": len(work), "present": present, "late": late, "wfh": wfh,
                     "leave": leave, "absent": absent, "missing": missing, "rate": f"{rate}%" if rate is not None else "—", "_rate": rate or 0,
                     "avg_check_in": f"{int(avg_in // 60):02d}:{int(avg_in % 60):02d}" if avg_in is not None else "—",
                     "avg_hours": round(sum(hours) / len(hours), 1) if hours else 0,
                     "reports": f"{round(100 * reports / present)}%" if present else "—",
                     "on_site": f"{round(100 * office_on / office_loc)}%" if office_loc else "—"})
        L = loc.setdefault(branch, {"branch": branch, "people": 0, "possible": 0, "present": 0.0, "late": 0, "leave": 0, "missing": 0})
        L["people"] += 1
        L["possible"] += len(work)
        L["present"] += present
        L["late"] += late
        L["leave"] += leave
        L["missing"] += missing
    loc_rows = [{**v, "rate": f"{round(100 * v['present'] / v['possible'])}%" if v["possible"] else "—",
                 "_rate": round(100 * v["present"] / v["possible"]) if v["possible"] else 0} for v in loc.values()]
    possible = sum(v["possible"] for v in loc.values())
    return {
        "title": "Attendance & Punctuality",
        "summary": [
            {"label": "People", "value": len(rows)},
            {"label": "Attendance", "value": f"{round(100 * sum(r['present'] for r in rows) / possible)}%" if possible else "—"},
            {"label": "Late arrivals", "value": sum(r["late"] for r in rows)},
            {"label": "Leave days", "value": sum(r["leave"] for r in rows)},
            {"label": "Days not registered", "value": sum(r["missing"] for r in rows)},
        ],
        "charts": [
            {"type": "bar", "title": "Attendance % by location", "data": [{"name": r["branch"], "value": r["_rate"]} for r in loc_rows]},
            {"type": "bar", "title": "Late arrivals by weekday", "data": [{"name": WEEKDAYS[i], "value": v} for i, v in enumerate(late_wd) if i < 6 or v]},
        ],
        "sections": [
            {"title": "People", "columns": [("name", "Person", "text"), ("branch", "Location", "text"), ("working_days", "Working days", "num"),
                                            ("present", "Present", "num"), ("rate", "Attendance", "text"), ("late", "Late", "num"),
                                            ("wfh", "WFH", "num"), ("leave", "Leave", "num"), ("absent", "Absent", "num"),
                                            ("missing", "Not registered", "num"), ("avg_check_in", "Avg check-in", "text"),
                                            ("avg_hours", "Avg hours", "num"), ("reports", "Reports filed", "text"), ("on_site", "On-site", "text")],
             "rows": sorted(rows, key=lambda r: r["_rate"])},
            {"title": "By location", "columns": [("branch", "Location", "text"), ("people", "People", "num"), ("rate", "Attendance", "text"),
                                                 ("late", "Late arrivals", "num"), ("leave", "Leave days", "num"), ("missing", "Not registered", "num")],
             "rows": loc_rows},
        ],
    }


# ------------------------------------------------------------------ timesheet helpers
async def _timesheet_hours(date_from, date_to, user_ids=None, statuses=("submitted", "approved")):
    """[(user_id, date, project_id, billable, hours)] for hours inside the range."""
    a = (date.fromisoformat(date_from) - timedelta(days=6)).isoformat()
    q = {"week_start": {"$gte": a, "$lte": date_to}, "status": {"$in": list(statuses)}}
    if user_ids is not None:
        q["user_id"] = {"$in": list(user_ids)}
    out = []
    for sh in await db.timesheets.find(q, {"_id": 0}).to_list(20000):
        for r in sh.get("rows") or []:
            for d, h in (r.get("hours") or {}).items():
                if date_from <= d <= date_to and h:
                    out.append((sh["user_id"], d, r.get("project_id"), bool(r.get("billable")), float(h)))
    return out


# ------------------------------------------------------------------ 2. timesheets & utilisation
async def tpl_timesheet_utilisation(date_from, date_to, branch_ids=None):
    s = await get_settings()
    std = float(s.get("std_hours_per_day") or 8)
    days = _dates(date_from, date_to)
    today = _today()
    people = await _people(branch_ids)
    ids = {p["id"] for p in people}
    hols = await holidays_between(date_from, date_to)
    leave = {(r["user_id"], r["date"]): r["status"] for r in await db.daily_reports.find(
        {"date": {"$gte": date_from, "$lte": date_to}, "user_id": {"$in": list(ids)}, "status": {"$in": ["leave", "half_day", "absent"]}},
        {"_id": 0, "user_id": 1, "date": 1, "status": 1}).to_list(20000)}
    hrs = await _timesheet_hours(date_from, date_to, ids)
    rate_of = await cost_rate_lookup()
    proj = await _projects_index()
    bnames = await _bnames()
    rows = []
    by_proj, by_client = {}, {}
    for p in sorted(people, key=lambda x: x["name"]):
        work = await _working_days(p, days, s, hols, min(today, days[-1]) if days else today)
        avail = sum(0 if leave.get((p["id"], d.isoformat())) in ("leave", "absent") else (std / 2 if leave.get((p["id"], d.isoformat())) == "half_day" else std) for d in work)
        mine = [x for x in hrs if x[0] == p["id"]]
        logged = sum(x[4] for x in mine)
        billable = sum(x[4] for x in mine if x[3])
        cost = round(logged * rate_of(p))
        rows.append({"name": p["name"], "branch": bnames.get(_home_branch(p), "No branch"), "available": round(avail, 1), "logged": round(logged, 1),
                     "billable": round(billable, 1), "non_billable": round(logged - billable, 1),
                     "utilisation": f"{round(100 * billable / avail)}%" if avail else "—", "_util": round(100 * billable / avail) if avail else 0,
                     "logged_pct": f"{round(100 * logged / avail)}%" if avail else "—", "cost": cost})
        for _, _, pid, bill, h in mine:
            key = pid or "_internal"
            pr = proj.get(pid) or {}
            P = by_proj.setdefault(key, {"project": pr.get("name") or "Internal / no project", "client": pr.get("client_name") or "—", "hours": 0.0, "billable": 0.0, "cost": 0.0})
            P["hours"] += h
            P["billable"] += h if bill else 0
            P["cost"] += h * rate_of(p)
            cname = pr.get("client_name") or "Internal"
            by_client[cname] = by_client.get(cname, 0) + h
    pending = await db.timesheets.count_documents({"status": "submitted", "user_id": {"$in": list(ids)},
                                                   "week_start": {"$gte": (date.fromisoformat(date_from) - timedelta(days=6)).isoformat(), "$lte": date_to}})
    total_avail = sum(r["available"] for r in rows)
    total_bill = sum(r["billable"] for r in rows)
    total_logged = sum(r["logged"] for r in rows)
    prow = [{**v, "hours": round(v["hours"], 1), "billable": round(v["billable"], 1), "cost": round(v["cost"])} for v in by_proj.values()]
    return {
        "title": "Timesheets & Utilisation",
        "summary": [
            {"label": "Hours logged", "value": round(total_logged, 1)},
            {"label": "Billable", "value": f"{round(100 * total_bill / total_logged)}%" if total_logged else "—"},
            {"label": "Utilisation", "value": f"{round(100 * total_bill / total_avail)}%" if total_avail else "—"},
            {"label": "Team cost", "value": sum(r["cost"] for r in rows), "money": True},
            {"label": "Waiting for approval", "value": pending},
        ],
        "charts": [
            {"type": "bar", "title": "Billable vs other hours by person",
             "data": [{"name": r["name"].split(" ")[0], "billable": r["billable"], "other": r["non_billable"]} for r in rows if r["logged"]], "keys": ["billable", "other"]},
            {"type": "donut", "title": "Hours by client", "data": sorted([{"name": k, "value": round(v, 1)} for k, v in by_client.items()], key=lambda x: -x["value"])[:8]},
        ],
        "sections": [
            {"title": "People (submitted + approved timesheets)", "columns": [
                ("name", "Person", "text"), ("branch", "Location", "text"), ("available", "Hours available", "num"), ("logged", "Logged", "num"),
                ("billable", "Billable", "num"), ("non_billable", "Non-billable", "num"), ("utilisation", "Utilisation", "text"),
                ("logged_pct", "Logged / available", "text"), ("cost", "Team cost", "money")], "rows": sorted(rows, key=lambda r: -r["_util"])},
            {"title": "Hours by project", "columns": [("project", "Project", "text"), ("client", "Client", "text"), ("hours", "Hours", "num"),
                                                     ("billable", "Billable hours", "num"), ("cost", "Team cost", "money")],
             "rows": sorted(prow, key=lambda r: -r["hours"])},
        ],
    }


# ------------------------------------------------------------------ 3. client profitability
async def _api_usage_inr(date_from, date_to):
    accs = {a["id"]: float(a.get("fx_rate") or 1) for a in await db.api_accounts.find({}, {"_id": 0, "id": 1, "fx_rate": 1}).to_list(500)}
    rows = await db.api_credit_txns.find({"kind": "usage", "date": {"$gte": date_from, "$lte": date_to}}, {"_id": 0}).to_list(50000)
    for r in rows:
        r["inr"] = float(r.get("amount") or 0) * accs.get(r["account_id"], 1)
    return rows


async def tpl_client_profitability(date_from, date_to, branch_ids=None):
    scope = await _client_scope(branch_ids)
    clients = {c["id"]: c for c in await db.clients.find({}, {"_id": 0, "id": 1, "name": 1, "retainer": 1, "service_type": 1, "branch_id": 1}).to_list(5000)
               if scope is None or c["id"] in scope}
    proj = await _projects_index()
    p2c = {pid: p.get("client_id") for pid, p in proj.items()}
    tx = await db.transactions.find({"date": {"$gte": date_from, "$lte": date_to}}, {"_id": 0, "type": 1, "amount": 1, "client_id": 1, "project_id": 1}).to_list(50000)
    agg = {cid: {"revenue": 0.0, "expenses": 0.0, "api": 0.0, "team_hours": 0.0, "team_cost": 0.0} for cid in clients}

    def cid_of(x):
        return x.get("client_id") or p2c.get(x.get("project_id"))

    for x in tx:
        c = cid_of(x)
        if c in agg:
            agg[c]["revenue" if x["type"] == "income" else "expenses"] += float(x["amount"] or 0)
    for u in await _api_usage_inr(date_from, date_to):
        c = cid_of(u)
        if c in agg:
            agg[c]["api"] += u["inr"]
    rate_of = await cost_rate_lookup()
    users = {u["id"]: u for u in await db.users.find({}, {"_id": 0, "id": 1, "role": 1}).to_list(3000)}
    for uid, _, pid, _, h in await _timesheet_hours(date_from, date_to):
        c = p2c.get(pid)
        if c in agg:
            agg[c]["team_hours"] += h
            agg[c]["team_cost"] += h * rate_of(users.get(uid, {"id": uid}))
    total_rev = sum(a["revenue"] for a in agg.values())
    rows = []
    for cid, a in agg.items():
        if not any(a.values()):
            continue
        cost = a["expenses"] + a["api"] + a["team_cost"]
        gp = a["revenue"] - cost
        rows.append({"name": clients[cid]["name"], "service": nice(clients[cid].get("service_type")), "revenue": round(a["revenue"]),
                     "expenses": round(a["expenses"]), "api": round(a["api"]), "team_hours": round(a["team_hours"], 1), "team_cost": round(a["team_cost"]),
                     "total_cost": round(cost), "profit": round(gp), "margin": f"{round(100 * gp / a['revenue'])}%" if a["revenue"] else "—",
                     "_margin": (100 * gp / a["revenue"]) if a["revenue"] else -999,
                     "share": f"{round(100 * a['revenue'] / total_rev)}%" if total_rev else "—"})
    rows.sort(key=lambda r: -r["profit"])
    by_rev = sorted(rows, key=lambda r: -r["revenue"])
    top3 = sum(r["revenue"] for r in by_rev[:3])
    total_cost = sum(r["total_cost"] for r in rows)
    donut = [{"name": r["name"], "value": r["revenue"]} for r in by_rev[:5] if r["revenue"]]
    others = sum(r["revenue"] for r in by_rev[5:])
    if others:
        donut.append({"name": "Others", "value": others})
    return {
        "title": "Client Profitability",
        "summary": [
            {"label": "Revenue", "value": round(total_rev), "money": True},
            {"label": "Direct costs", "value": total_cost, "money": True},
            {"label": "Gross profit", "value": round(total_rev - total_cost), "money": True},
            {"label": "Margin", "value": f"{round(100 * (total_rev - total_cost) / total_rev)}%" if total_rev else "—"},
            {"label": "Top 3 clients' share", "value": f"{round(100 * top3 / total_rev)}%" if total_rev else "—"},
        ],
        "charts": [
            {"type": "bar", "title": "Revenue vs cost by client (top 8)",
             "data": [{"name": r["name"], "revenue": r["revenue"], "cost": r["total_cost"]} for r in by_rev[:8]], "keys": ["revenue", "cost"]},
            {"type": "donut", "title": "Revenue concentration", "data": donut},
        ],
        "sections": [{"title": "Clients", "columns": [
            ("name", "Client", "text"), ("service", "Service", "text"), ("revenue", "Revenue", "money"), ("expenses", "Expenses", "money"),
            ("api", "AI / API usage", "money"), ("team_hours", "Team hours", "num"), ("team_cost", "Team cost", "money"),
            ("profit", "Gross profit", "money"), ("margin", "Margin", "text"), ("share", "Share of revenue", "text")], "rows": rows},
            {"title": "Lowest margins", "columns": [("name", "Client", "text"), ("revenue", "Revenue", "money"), ("total_cost", "Cost", "money"),
                                                    ("margin", "Margin", "text")],
             "rows": sorted([r for r in rows if r["revenue"]], key=lambda r: r["_margin"])[:5]}],
    }


# ------------------------------------------------------------------ 4. project delivery
async def tpl_project_delivery(date_from, date_to, branch_ids=None):
    scope = await _client_scope(branch_ids)
    today = _today()
    ti = today.isoformat()
    clients = {c["id"]: c["name"] for c in await db.clients.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(5000)}
    users = {u["id"]: u for u in await db.users.find({}, {"_id": 0, "id": 1, "name": 1, "role": 1}).to_list(3000)}
    projects = [p for p in await db.projects.find({}, {"_id": 0}).to_list(3000) if scope is None or p.get("client_id") in scope]
    projects = [p for p in projects if p.get("status") != "completed" or date_from <= (p.get("end_date") or "") <= date_to]
    exp = {}
    for x in await db.transactions.find({"type": "expense", "project_id": {"$nin": [None, ""]}}, {"_id": 0, "project_id": 1, "amount": 1}).to_list(50000):
        exp[x["project_id"]] = exp.get(x["project_id"], 0) + float(x["amount"] or 0)
    rate_of = await cost_rate_lookup()
    hours, tcost = {}, {}
    for uid, _, pid, _, h in await _timesheet_hours("2000-01-01", ti):
        if pid:
            hours[pid] = hours.get(pid, 0) + h
            tcost[pid] = tcost.get(pid, 0) + h * rate_of(users.get(uid, {"id": uid}))
    rows, overdue_rows = [], []
    for p in projects:
        dels = p.get("deliverables") or []
        prog = round(100 * sum(1 for d in dels if d.get("done")) / len(dels)) if dels else (100 if p.get("status") == "completed" else 0)
        ms = p.get("milestones") or []
        overdue = [m for m in ms if not m.get("done") and m.get("due_date") and m["due_date"] < ti]
        nxt = next((m for m in sorted(ms, key=lambda m: m.get("due_date") or "9999") if not m.get("done")), None)
        end = p.get("end_date")
        days_left = (date.fromisoformat(end) - today).days if end else None
        budget = float(p.get("budget") or 0)
        spent = float(p.get("cost_allocation") or 0) + exp.get(p["id"], 0) + tcost.get(p["id"], 0)
        used = round(100 * spent / budget) if budget else None
        if p.get("status") == "completed":
            health = "Delivered"
        elif days_left is not None and days_left < 0:
            health = "Late"
        elif overdue or (used is not None and used > 90) or (days_left is not None and days_left < 14 and prog < 70):
            health = "At risk"
        else:
            health = "On track"
        pm = next((users[u]["name"] for u in p.get("team_member_ids") or [] if users.get(u, {}).get("role") == "pm"), "—")
        rows.append({"name": p["name"], "client": clients.get(p.get("client_id"), "—"), "pm": pm, "status": nice(p.get("status")), "health": health,
                     "end": end or "—", "days_left": days_left if days_left is not None else "—", "progress": f"{prog}%",
                     "overdue": len(overdue), "next": f"{nxt['title']} · {nxt.get('due_date') or ''}" if nxt else "—",
                     "hours": round(hours.get(p["id"], 0), 1), "budget": round(budget), "spent": round(spent),
                     "used": f"{used}%" if used is not None else "—", "_used": used or 0})
        for m in overdue:
            overdue_rows.append({"project": p["name"], "client": clients.get(p.get("client_id"), "—"), "milestone": m.get("title"), "due": m["due_date"],
                                 "days": (today - date.fromisoformat(m["due_date"])).days})
    order = {"Late": 0, "At risk": 1, "On track": 2, "Delivered": 3}
    rows.sort(key=lambda r: (order[r["health"]], r["end"]))
    cnt = {h: sum(1 for r in rows if r["health"] == h) for h in order}
    return {
        "title": "Project Delivery & Deadlines",
        "summary": [
            {"label": "Live projects", "value": sum(1 for r in rows if r["health"] != "Delivered")},
            {"label": "On track", "value": cnt["On track"]},
            {"label": "At risk", "value": cnt["At risk"]},
            {"label": "Late", "value": cnt["Late"]},
            {"label": "Overdue milestones", "value": len(overdue_rows)},
        ],
        "charts": [
            {"type": "donut", "title": "Projects by health", "data": [{"name": k, "value": v} for k, v in cnt.items() if v]},
            {"type": "bar", "title": "Budget used % (top 8)", "data": sorted([{"name": r["name"], "value": r["_used"]} for r in rows if r["budget"]],
                                                                       key=lambda x: -x["value"])[:8]},
        ],
        "sections": [
            {"title": "Projects", "columns": [("name", "Project", "text"), ("client", "Client", "text"), ("pm", "PM", "text"), ("health", "Health", "text"),
                                              ("end", "Deadline", "text"), ("days_left", "Days left", "num"), ("progress", "Progress", "text"),
                                              ("overdue", "Overdue milestones", "num"), ("next", "Next milestone", "text"), ("hours", "Hours logged", "num"),
                                              ("budget", "Budget", "money"), ("spent", "Cost to date", "money"), ("used", "Budget used", "text")], "rows": rows},
            {"title": "Overdue milestones", "columns": [("project", "Project", "text"), ("client", "Client", "text"), ("milestone", "Milestone", "text"),
                                                        ("due", "Was due", "text"), ("days", "Days overdue", "num")],
             "rows": sorted(overdue_rows, key=lambda r: -r["days"])},
        ],
    }


# ------------------------------------------------------------------ 5. renewals
async def tpl_renewals(date_from, date_to, branch_ids=None):
    scope = await _client_scope(branch_ids)
    today = _today()
    horizon = today + timedelta(days=90)
    since = today - timedelta(days=30)
    users = {u["id"]: u["name"] for u in await db.users.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(3000)}
    clients = [c for c in await db.clients.find({}, {"_id": 0, "credentials": 0}).to_list(5000) if scope is None or c["id"] in scope]
    three_m = (today - timedelta(days=90)).isoformat()
    income = {}
    for x in await db.transactions.find({"type": "income", "date": {"$gte": three_m}}, {"_id": 0, "client_id": 1, "amount": 1}).to_list(50000):
        if x.get("client_id"):
            income[x["client_id"]] = income.get(x["client_id"], 0) + float(x["amount"] or 0)
    rows, by_month = [], {}
    for c in clients:
        mrr = round(income.get(c["id"], 0) / 3)
        for ct in c.get("contracts") or []:
            exp = ct.get("expiry_date")
            if not exp:
                continue
            e = date.fromisoformat(exp)
            if not (since <= e <= horizon):
                continue
            left = (e - today).days
            rows.append({"client": c["name"], "agreement": ct.get("title") or "Agreement", "expiry": exp, "days_left": left,
                         "state": "Lapsed" if left < 0 else "Due ≤30d" if left <= 30 else "Due ≤60d" if left <= 60 else "Due ≤90d",
                         "value": float(ct.get("value") or 0), "retainer": "Yes" if c.get("retainer") else "No", "mrr": mrr,
                         "owner": users.get(c.get("account_manager_id"), "—")})
            if left >= 0:
                k = e.strftime("%b %Y")
                by_month[k] = by_month.get(k, 0) + float(ct.get("value") or 0)
    rows.sort(key=lambda r: r["days_left"])
    subs = []
    for sb in await db.subscriptions.find({"status": "active"}, {"_id": 0}).to_list(2000):
        nd = sb.get("next_renewal_date")
        if nd and today.isoformat() <= nd <= horizon.isoformat():
            subs.append({"name": sb["name"], "vendor": sb.get("vendor") or "—", "renews": nd, "days_left": (date.fromisoformat(nd) - today).days,
                         "cost": float(sb.get("cost") or 0), "cycle": nice(sb.get("billing_cycle")), "monthly": monthly_equiv(sb.get("cost") or 0, sb.get("billing_cycle"))})
    subs.sort(key=lambda r: r["renews"])
    upcoming = [r for r in rows if r["days_left"] >= 0]
    return {
        "title": "Retainers & Renewals — next 90 days",
        "summary": [
            {"label": "Agreements due", "value": len(upcoming)},
            {"label": "Value up for renewal", "value": round(sum(r["value"] for r in upcoming)), "money": True},
            {"label": "Monthly revenue at stake", "value": round(sum({r["client"]: r["mrr"] for r in upcoming}.values())), "money": True},
            {"label": "Lapsed (last 30 days)", "value": sum(1 for r in rows if r["days_left"] < 0)},
            {"label": "Tool renewals", "value": round(sum(s["cost"] for s in subs)), "money": True},
        ],
        "charts": [
            {"type": "bar", "title": "Agreement value renewing by month", "data": [{"name": k, "value": round(v)} for k, v in by_month.items()]},
            {"type": "donut", "title": "Agreements by urgency", "data": [{"name": k, "value": sum(1 for r in rows if r["state"] == k)}
                                                                         for k in ("Lapsed", "Due ≤30d", "Due ≤60d", "Due ≤90d") if any(r["state"] == k for r in rows)]},
        ],
        "sections": [
            {"title": "Client agreements", "columns": [("client", "Client", "text"), ("agreement", "Agreement", "text"), ("expiry", "Ends", "text"),
                                                       ("days_left", "Days left", "num"), ("state", "Status", "text"), ("value", "Value", "money"),
                                                       ("retainer", "Retainer", "text"), ("mrr", "Avg monthly revenue", "money"), ("owner", "Account manager", "text")],
             "rows": rows},
            {"title": "Tool subscriptions renewing", "columns": [("name", "Tool", "text"), ("vendor", "Vendor", "text"), ("renews", "Renews", "text"),
                                                                 ("days_left", "Days left", "num"), ("cycle", "Billing", "text"), ("cost", "Cost", "money"),
                                                                 ("monthly", "Per month", "money")], "rows": subs},
        ],
    }


# ------------------------------------------------------------------ 6. cash flow
async def tpl_cash_flow(date_from, date_to, branch_ids=None):
    end = date.fromisoformat(date_to)
    start = date.fromisoformat(date_from)
    if (end.year * 12 + end.month) - (start.year * 12 + start.month) < 2:
        m = end.replace(day=1)
        for _ in range(11):
            m = (m - timedelta(days=1)).replace(day=1)
        start = m
    scope = await _client_scope(branch_ids)
    tx = await db.transactions.find({"date": {"$gte": start.isoformat(), "$lte": end.isoformat()}}, {"_id": 0}).to_list(100000)
    if scope is not None:
        tx = [x for x in tx if x.get("client_id") in scope]
    months, cats_in, cats_out = {}, {}, {}
    m = start.replace(day=1)
    while m <= end:
        months[m.strftime("%Y-%m")] = {"month": m.strftime("%b %Y"), "income": 0.0, "expenses": 0.0}
        m = (m.replace(day=28) + timedelta(days=4)).replace(day=1)
    for x in tx:
        k = x["date"][:7]
        if k not in months:
            continue
        amt = float(x["amount"] or 0)
        if x["type"] == "income":
            months[k]["income"] += amt
            cats_in[x.get("category") or "other"] = cats_in.get(x.get("category") or "other", 0) + amt
        else:
            months[k]["expenses"] += amt
            cats_out[x.get("category") or "other"] = cats_out.get(x.get("category") or "other", 0) + amt
    rows, run = [], 0.0
    for k, v in months.items():
        net = v["income"] - v["expenses"]
        run += net
        rows.append({"month": v["month"], "income": round(v["income"]), "expenses": round(v["expenses"]), "net": round(net), "running": round(run),
                     "margin": f"{round(100 * net / v['income'])}%" if v["income"] else "—"})
    inc, out = sum(r["income"] for r in rows), sum(r["expenses"] for r in rows)
    best = max(rows, key=lambda r: r["net"]) if rows else None
    return {
        "title": "Cash Flow Trend",
        "summary": [
            {"label": "Income", "value": inc, "money": True},
            {"label": "Expenses", "value": out, "money": True},
            {"label": "Net", "value": inc - out, "money": True},
            {"label": "Avg monthly spend", "value": round(out / len(rows)) if rows else 0, "money": True},
            {"label": "Best month", "value": best["month"] if best else "—"},
        ],
        "charts": [
            {"type": "bar", "title": "Income vs expenses by month", "data": [{"name": r["month"][:3] + " " + r["month"][-2:], "income": r["income"], "expenses": r["expenses"]} for r in rows],
             "keys": ["income", "expenses"]},
            {"type": "line", "title": "Running cash position", "data": [{"name": r["month"][:3] + " " + r["month"][-2:], "value": r["running"]} for r in rows]},
        ],
        "sections": [
            {"title": "By month", "columns": [("month", "Month", "text"), ("income", "Income", "money"), ("expenses", "Expenses", "money"),
                                              ("net", "Net", "money"), ("margin", "Margin", "text"), ("running", "Running total", "money")], "rows": rows},
            {"title": "Top income sources", "columns": [("category", "Category", "text"), ("amount", "Amount", "money")],
             "rows": [{"category": nice(k), "amount": round(v)} for k, v in sorted(cats_in.items(), key=lambda x: -x[1])]},
            {"title": "Top costs", "columns": [("category", "Category", "text"), ("amount", "Amount", "money")],
             "rows": [{"category": nice(k), "amount": round(v)} for k, v in sorted(cats_out.items(), key=lambda x: -x[1])]},
        ],
    }


# ------------------------------------------------------------------ 7. lead sources
async def tpl_lead_sources(date_from, date_to, branch_ids=None):
    q = {"created_at": {"$gte": date_from, "$lte": date_to + "T23:59:59"}}
    if branch_ids:
        q["branch_id"] = {"$in": branch_ids}
    leads = await db.leads.find(q, {"_id": 0}).to_list(20000)
    later = ("qualified", "proposal", "won", "lost")
    agg = {}
    for ld in leads:
        src = ld.get("source") or "other"
        a = agg.setdefault(src, {"source": nice(src), "leads": 0, "qualified": 0, "proposals": 0, "won": 0, "lost": 0, "open_value": 0.0,
                                 "won_value": 0.0, "days": []})
        a["leads"] += 1
        st = ld.get("stage")
        hist = {h.get("stage") for h in ld.get("stage_history") or []} | {st}
        a["qualified"] += bool(hist & set(later))
        a["proposals"] += bool(hist & {"proposal", "won"})
        val = float(ld.get("estimated_value") or 0)
        if st == "won":
            a["won"] += 1
            a["won_value"] += val
            won_at = ld.get("won_at") or next((h.get("at") for h in reversed(ld.get("stage_history") or []) if h.get("stage") == "won"), None)
            if won_at and ld.get("created_at"):
                a["days"].append((date.fromisoformat(won_at[:10]) - date.fromisoformat(ld["created_at"][:10])).days)
        elif st == "lost":
            a["lost"] += 1
        else:
            a["open_value"] += val
    rows = []
    for a in agg.values():
        closed = a["won"] + a["lost"]
        rows.append({**{k: v for k, v in a.items() if k != "days"}, "open_value": round(a["open_value"]), "won_value": round(a["won_value"]),
                     "win_rate": f"{round(100 * a['won'] / closed)}%" if closed else "—",
                     "conversion": f"{round(100 * a['won'] / a['leads'])}%" if a["leads"] else "—",
                     "days_to_close": round(sum(a["days"]) / len(a["days"])) if a["days"] else "—"})
    rows.sort(key=lambda r: -r["won_value"])
    tl = sum(r["leads"] for r in rows)
    tw = sum(r["won"] for r in rows)
    tc = tw + sum(r["lost"] for r in rows)
    return {
        "title": "Lead Sources & Conversion",
        "summary": [
            {"label": "New leads", "value": tl},
            {"label": "Won", "value": tw},
            {"label": "Win rate", "value": f"{round(100 * tw / tc)}%" if tc else "—"},
            {"label": "Value won", "value": sum(r["won_value"] for r in rows), "money": True},
            {"label": "Open pipeline", "value": sum(r["open_value"] for r in rows), "money": True},
        ],
        "charts": [
            {"type": "bar", "title": "Leads vs wins by source", "data": [{"name": r["source"], "leads": r["leads"], "won": r["won"]} for r in rows], "keys": ["leads", "won"]},
            {"type": "donut", "title": "Value won by source", "data": [{"name": r["source"], "value": r["won_value"]} for r in rows if r["won_value"]]},
        ],
        "sections": [{"title": "Sources", "columns": [
            ("source", "Source", "text"), ("leads", "Leads", "num"), ("qualified", "Qualified", "num"), ("proposals", "Proposals", "num"),
            ("won", "Won", "num"), ("lost", "Lost", "num"), ("win_rate", "Win rate", "text"), ("conversion", "Lead → won", "text"),
            ("won_value", "Value won", "money"), ("open_value", "Open pipeline", "money"), ("days_to_close", "Avg days to close", "text")], "rows": rows}],
    }


# ------------------------------------------------------------------ 8. AI & API costs
async def tpl_ai_costs(date_from, date_to, branch_ids=None):
    scope = await _client_scope(branch_ids)
    proj = await _projects_index()
    p2c = {pid: p.get("client_id") for pid, p in proj.items()}
    accounts = {a["id"]: a for a in await db.api_accounts.find({}, {"_id": 0}).to_list(500)}
    clients = {c["id"]: c["name"] for c in await db.clients.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(5000)}
    agents = {a["id"]: a["name"] for a in await db.ai_agents.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(500)}
    usage = await _api_usage_inr(date_from, date_to)
    by_acc, by_client, by_proj, by_agent, by_month = {}, {}, {}, {}, {}
    for u in usage:
        cid = u.get("client_id") or p2c.get(u.get("project_id"))
        if scope is not None and cid not in scope:
            continue
        a = accounts.get(u["account_id"], {})
        A = by_acc.setdefault(u["account_id"], {"account": a.get("name", "—"), "provider": PROVIDERS.get(a.get("provider"), nice(a.get("provider"))), "currency": a.get("currency", "INR"),
                                                "usage": 0.0, "usage_inr": 0.0})
        A["usage"] += float(u.get("amount") or 0)
        A["usage_inr"] += u["inr"]
        if cid:
            by_client[cid] = by_client.get(cid, 0) + u["inr"]
        if u.get("project_id"):
            by_proj[u["project_id"]] = by_proj.get(u["project_id"], 0) + u["inr"]
        by_agent[u.get("agent_id") or "_none"] = by_agent.get(u.get("agent_id") or "_none", 0) + u["inr"]
        by_month[u["date"][:7]] = by_month.get(u["date"][:7], 0) + u["inr"]
    rev = {}
    for x in await db.transactions.find({"type": "income", "date": {"$gte": date_from, "$lte": date_to}}, {"_id": 0, "client_id": 1, "project_id": 1, "amount": 1}).to_list(50000):
        c = x.get("client_id") or p2c.get(x.get("project_id"))
        if c:
            rev[c] = rev.get(c, 0) + float(x["amount"] or 0)
    subs = [s for s in await db.subscriptions.find({"status": "active"}, {"_id": 0}).to_list(2000) if s.get("is_ai") or s.get("category") == "ai"]
    subs_month = round(sum(monthly_equiv(s.get("cost") or 0, s.get("billing_cycle")) for s in subs))
    ledger_ai = 0.0
    if scope is None:
        for x in await db.transactions.find({"type": "expense", "date": {"$gte": date_from, "$lte": date_to}}, {"_id": 0, "category": 1, "ai_tool": 1, "amount": 1, "source": 1}).to_list(50000):
            if (x.get("category") == "ai" or x.get("ai_tool")) and x.get("source") != "api_credits":
                ledger_ai += float(x["amount"] or 0)
    total = sum(v["usage_inr"] for v in by_acc.values())
    crow = sorted([{"client": clients.get(c, "—"), "usage": round(v), "revenue": round(rev.get(c, 0)),
                    "pct": f"{round(100 * v / rev[c], 1)}%" if rev.get(c) else "no revenue"} for c, v in by_client.items()], key=lambda r: -r["usage"])
    return {
        "title": "AI & API Costs",
        "summary": [
            {"label": "API usage", "value": round(total), "money": True},
            {"label": "AI subscriptions / month", "value": subs_month, "money": True},
            {"label": "Other AI spend (ledger)", "value": round(ledger_ai), "money": True},
            {"label": "Tagged to clients", "value": f"{round(100 * sum(by_client.values()) / total)}%" if total else "—"},
            {"label": "Top client", "value": crow[0]["client"] if crow else "—"},
        ],
        "charts": [
            {"type": "bar", "title": "API usage by month (₹)", "data": [{"name": datetime.strptime(k, "%Y-%m").strftime("%b %y"), "value": round(v)} for k, v in sorted(by_month.items())]},
            {"type": "donut", "title": "Usage by account", "data": [{"name": v["account"], "value": round(v["usage_inr"])} for v in sorted(by_acc.values(), key=lambda x: -x["usage_inr"])]},
        ],
        "sections": [
            {"title": "By account", "columns": [("account", "Account", "text"), ("provider", "Provider", "text"), ("currency", "Currency", "text"),
                                                ("usage", "Usage (account currency)", "num"), ("usage_inr", "Usage (₹)", "money")],
             "rows": [{**v, "usage": round(v["usage"], 2), "usage_inr": round(v["usage_inr"])} for v in sorted(by_acc.values(), key=lambda x: -x["usage_inr"])]},
            {"title": "By client", "columns": [("client", "Client", "text"), ("usage", "AI / API cost", "money"), ("revenue", "Revenue", "money"),
                                               ("pct", "Cost as % of revenue", "text")], "rows": crow},
            {"title": "By project", "columns": [("project", "Project", "text"), ("client", "Client", "text"), ("usage", "AI / API cost", "money")],
             "rows": sorted([{"project": proj.get(p, {}).get("name", "—"), "client": proj.get(p, {}).get("client_name") or "—", "usage": round(v)} for p, v in by_proj.items()],
                            key=lambda r: -r["usage"])},
            {"title": "By AI agent", "columns": [("agent", "Agent", "text"), ("usage", "AI / API cost", "money")],
             "rows": sorted([{"agent": agents.get(a, "Not tagged"), "usage": round(v)} for a, v in by_agent.items()], key=lambda r: -r["usage"])},
            {"title": "AI tool subscriptions", "columns": [("name", "Tool", "text"), ("vendor", "Vendor", "text"), ("cycle", "Billing", "text"),
                                                           ("cost", "Cost", "money"), ("monthly", "Per month", "money")],
             "rows": [{"name": s["name"], "vendor": s.get("vendor") or "—", "cycle": nice(s.get("billing_cycle")), "cost": s.get("cost") or 0,
                       "monthly": monthly_equiv(s.get("cost") or 0, s.get("billing_cycle"))} for s in subs]},
        ],
    }


V28_BUILDERS = {
    "attendance": tpl_attendance,
    "timesheet-utilisation": tpl_timesheet_utilisation,
    "client-profitability": tpl_client_profitability,
    "project-delivery": tpl_project_delivery,
    "renewals": tpl_renewals,
    "cash-flow": tpl_cash_flow,
    "lead-sources": tpl_lead_sources,
    "ai-costs": tpl_ai_costs,
}
