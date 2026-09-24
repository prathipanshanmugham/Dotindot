"""Sales HUD — fullscreen TV display data. Gated by 'sales.hud' permission (middleware)."""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from database import db
from auth import get_current_user
from routes_sales import STAGES, won_at

router = APIRouter()


@router.get("/sales/hud")
async def hud_data(user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    month = now.date().isoformat()[:7]
    month_start = month + "-01"

    leads = await db.leads.find({}, {"_id": 0}).to_list(2000)
    users = await db.users.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(300)
    umap = {u["id"]: u["name"] for u in users}

    # Pipeline totals per stage
    pipeline = []
    for s in STAGES:
        col = [l for l in leads if l["stage"] == s]
        pipeline.append({"stage": s, "count": len(col),
                         "value": round(sum(l.get("estimated_value", 0) for l in col), 2)})

    # Won this month + leaderboard
    won_mtd = [l for l in leads if (won_at(l) or "")[:7] == month]
    won_value_mtd = sum(l.get("estimated_value", 0) for l in won_mtd)
    by_owner = {}
    for l in won_mtd:
        o = l.get("owner_id")
        by_owner[o] = by_owner.get(o, 0) + l.get("estimated_value", 0)
    leaderboard = sorted(
        [{"name": umap.get(o, "Unassigned"), "value": round(v, 2)} for o, v in by_owner.items()],
        key=lambda x: -x["value"])[:3]

    # Team target for current month
    targets = await db.targets.find({"period": month}, {"_id": 0}).to_list(100)
    team_target = sum(t.get("amount", 0) for t in targets if t.get("scope") == "team") or \
        sum(t.get("amount", 0) for t in targets)

    # MTD revenue
    mtd_income = await db.transactions.find(
        {"type": "income", "date": {"$gte": month_start}}, {"_id": 0, "amount": 1}).to_list(5000)
    mtd_revenue = round(sum(x["amount"] for x in mtd_income), 2)

    # Top branch this month (revenue via client branch)
    branches = await db.branches.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(50)
    clients = await db.clients.find({}, {"_id": 0, "id": 1, "name": 1, "branch_id": 1}).to_list(2000)
    cb = {c["id"]: c.get("branch_id") for c in clients}
    tx = await db.transactions.find(
        {"type": "income", "date": {"$gte": month_start}, "client_id": {"$nin": [None, ""]}},
        {"_id": 0, "client_id": 1, "amount": 1}).to_list(5000)
    by_branch = {}
    for x in tx:
        bid = cb.get(x["client_id"])
        if bid:
            by_branch[bid] = by_branch.get(bid, 0) + x["amount"]
    bmap = {b["id"]: b["name"] for b in branches}
    top_branch = None
    if by_branch:
        bid, val = max(by_branch.items(), key=lambda i: i[1])
        top_branch = {"name": bmap.get(bid, "—"), "revenue": round(val, 2)}

    # Sales-ONLY activity ticker: lead stage moves, quote lifecycle, sales-linked payments.
    # Never includes locations/users/settings/assets or other module events.
    moves = []
    for l in leads:
        for h in (l.get("stage_history") or []):
            if h.get("at"):
                moves.append({"lead": l["name"], "stage": h.get("stage"), "at": h["at"],
                              "owner": umap.get(l.get("owner_id"), "")})
    quotes = await db.quotes.find(
        {"status": {"$in": ["sent", "accepted", "rejected"]}},
        {"_id": 0, "number": 1, "status": 1, "updated_at": 1, "created_at": 1}).to_list(500)
    for q in quotes:
        at = q.get("updated_at") or q.get("created_at")
        if at:
            moves.append({"lead": f"Quote {q['number']}", "stage": q["status"], "at": at, "owner": ""})
    cname = {c["id"]: c.get("name", "client") for c in clients}
    recent_pay = await db.transactions.find(
        {"type": "income", "client_id": {"$nin": [None, ""]}},
        {"_id": 0, "client_id": 1, "amount": 1, "date": 1}).sort("date", -1).to_list(10)
    for x in recent_pay:
        moves.append({"lead": f"₹{int(x['amount']):,} from {cname.get(x['client_id'], 'client')}",
                      "stage": "payment received", "at": x.get("date") or "", "owner": ""})
    moves.sort(key=lambda m: m["at"], reverse=True)

    # Latest won deal (for TV-mode celebration)
    won_all = [(won_at(l) or "", l) for l in leads if l["stage"] == "won"]
    won_all = [w for w in won_all if w[0]]
    latest_won = None
    if won_all:
        at, lw = max(won_all, key=lambda x: x[0])
        latest_won = {"name": lw["name"], "value": lw.get("estimated_value", 0), "at": at,
                      "owner": umap.get(lw.get("owner_id"), "")}

    pct = round(won_value_mtd / team_target * 100, 1) if team_target else 0
    return {
        "month": month,
        "generated_at": now.isoformat(),
        "target": {"amount": team_target, "actual": round(won_value_mtd, 2), "pct": pct},
        "leaderboard": leaderboard,
        "top_branch": top_branch,
        "pipeline": pipeline,
        "mtd_revenue": mtd_revenue,
        "won_count_mtd": len(won_mtd),
        "latest_won": latest_won,
        "ticker": moves[:12],
    }
