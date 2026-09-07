"""Phase 2 finance seed — idempotent (fixed ids + $setOnInsert). 6 months of history Apr-Sep 2026."""
from datetime import datetime, timezone, timedelta
from database import db

U = {"admin": "user-admin", "finance": "user-finance", "sales": "user-sales", "pm": "user-pm", "employee": "user-employee"}
MONTHS = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]


def _now():
    return datetime.now(timezone.utc).isoformat()


def d(days: int) -> str:
    return (datetime.now(timezone.utc).date() + timedelta(days=days)).isoformat()


def tx(i, type_, date, amount, category, desc, client_id=None, project_id=None, invoice_ref="",
       payment_method="bank_transfer", campaign_id=None, ai_tool=None, source=None, expense_id=None):
    return {
        "id": f"fin-tx-{i:03d}", "type": type_, "date": date, "amount": amount, "category": category,
        "description": desc, "client_id": client_id, "project_id": project_id, "invoice_ref": invoice_ref,
        "payment_method": payment_method, "campaign_id": campaign_id, "ai_tool": ai_tool, "source": source,
        "expense_id": expense_id, "currency": "INR", "created_by": U["finance"], "created_at": _now(),
    }


# project_id -> (client_id, [(month, day, amount)])
INCOME_PLAN = {
    "seed-project-01": ("seed-client-01", [("2026-06", 5, 130000), ("2026-07", 5, 130000), ("2026-08", 5, 130000), ("2026-09", 5, 130000)]),
    "seed-project-02": ("seed-client-01", [("2026-05", 20, 120000)]),
    "seed-project-03": ("seed-client-02", [("2026-07", 8, 150000), ("2026-08", 8, 150000), ("2026-09", 6, 150000)]),
    "seed-project-04": ("seed-client-02", [("2026-06", 15, 400000), ("2026-08", 12, 500000), ("2026-09", 4, 300000)]),
    "seed-project-05": ("seed-client-03", [("2026-07", 10, 87500), ("2026-09", 2, 87500)]),
    "seed-project-06": ("seed-client-04", [("2026-06", 22, 375000), ("2026-07", 22, 375000), ("2026-08", 22, 375000), ("2026-09", 3, 375000)]),
    "seed-project-08": ("seed-client-05", [("2026-08", 18, 175000), ("2026-09", 5, 175000)]),
    "seed-project-10": ("seed-client-06", [("2026-08", 2, 500000), ("2026-09", 2, 400000)]),
    "seed-project-11": ("seed-client-07", [("2026-06", 12, 200000), ("2026-07", 12, 200000), ("2026-08", 12, 200000), ("2026-09", 5, 200000)]),
    "seed-project-13": ("seed-client-08", [("2026-04", 15, 220000)]),
    "seed-project-14": ("seed-client-10", [(m, 3, 90000) for m in MONTHS]),
}

AI_TOOLS = ["OpenAI", "Anthropic", "Midjourney", "ElevenLabs"]
AI_CLIENTS = {"OpenAI": "seed-client-04", "Anthropic": "seed-client-07", "Midjourney": None, "ElevenLabs": "seed-client-02"}
AI_PROJECTS = {"OpenAI": "seed-project-06", "Anthropic": "seed-project-11", "Midjourney": None, "ElevenLabs": None}


def build_transactions():
    txs = []
    i = 1
    # --- income (project invoices) ---
    for pid, (cid, invoices) in INCOME_PLAN.items():
        for n, (month, day, amount) in enumerate(invoices):
            txs.append(tx(i, "income", f"{month}-{day:02d}", amount, "project_income",
                          f"Invoice {month}/{pid[-2:]}", client_id=cid, project_id=pid,
                          invoice_ref=f"INV-{month.replace('-', '')}-{pid[-2:]}{n}"))
            i += 1
    # --- marketing-attributed income ---
    camp_income = [
        ("fin-camp-01", "seed-client-05", "2026-07", 25, 240000, "UrbanKart festive leads revenue"),
        ("fin-camp-01", "seed-client-05", "2026-08", 28, 180000, "UrbanKart festive leads revenue"),
        ("fin-camp-02", "seed-client-02", "2026-08", 20, 320000, "MediCare patient-acquisition revenue"),
        ("fin-camp-03", "seed-client-01", "2026-06", 25, 150000, "Skyline site-visit leads revenue"),
        ("fin-camp-04", "seed-client-07", "2026-09", 4, 120000, "ThamesTech demo bookings revenue"),
        ("fin-camp-05", "seed-client-10", "2026-08", 30, 95000, "Bombay Brew event ticket revenue"),
    ]
    for camp_id, cid, month, day, amount, desc in camp_income:
        txs.append(tx(i, "income", f"{month}-{day:02d}", amount, "campaign_revenue", desc,
                      client_id=cid, campaign_id=camp_id, source="marketing"))
        i += 1
    # --- monthly operating expenses ---
    for mi, m in enumerate(MONTHS):
        txs.append(tx(i, "expense", f"{m}-01", 420000, "salaries", f"Team salaries {m}")); i += 1
        txs.append(tx(i, "expense", f"{m}-03", 85000, "operational", f"Office rent {m}")); i += 1
        txs.append(tx(i, "expense", f"{m}-07", 16000 + mi * 800, "operational", f"Utilities & internet {m}")); i += 1
        txs.append(tx(i, "expense", f"{m}-05", 12000, "tools", f"Design & dev tools {m}")); i += 1
        txs.append(tx(i, "expense", f"{m}-19", 8000 + mi * 300, "tools", f"Cloud hosting {m}")); i += 1
        txs.append(tx(i, "expense", f"{m}-10", 30000 + mi * 1500, "marketing", f"Agency brand ads {m}", campaign_id=None)); i += 1
        txs.append(tx(i, "expense", f"{m}-14", 25000, "marketing", f"Content production {m}")); i += 1
        txs.append(tx(i, "expense", f"{m}-21", 18000 + mi * 500, "marketing", f"Events & outreach {m}")); i += 1
        txs.append(tx(i, "expense", f"{m}-25", 7000 + mi * 200, "misc", f"Miscellaneous {m}")); i += 1
        # AI expenses (3/month, tagged with tools + attributable client/project)
        ai_amounts = [26000 + mi * 900, 21000 + mi * 700, 9000 + mi * 400]
        for k in range(3):
            tool = AI_TOOLS[(mi + k) % len(AI_TOOLS)]
            txs.append(tx(i, "expense", f"{m}-{12 + k * 5:02d}", ai_amounts[k], "ai",
                          f"{tool} API usage {m}", client_id=AI_CLIENTS[tool], project_id=AI_PROJECTS[tool], ai_tool=tool))
            i += 1
    # --- project-linked contractor/production expenses ---
    proj_costs = [
        ("seed-project-01", "seed-client-01", "2026-07", 15, 45000, "Freelance photography - listings"),
        ("seed-project-04", "seed-client-02", "2026-07", 28, 120000, "Contract QA & security audit"),
        ("seed-project-06", "seed-client-04", "2026-08", 9, 90000, "ML contractor - guardrails"),
        ("seed-project-10", "seed-client-06", "2026-08", 16, 110000, "Virtual tour production vendor"),
        ("seed-project-11", "seed-client-07", "2026-06", 25, 60000, "Data annotation vendor"),
        ("seed-project-14", "seed-client-10", "2026-05", 12, 35000, "Event videography"),
        ("seed-project-08", "seed-client-05", "2026-09", 2, 40000, "Festive creatives freelancer"),
        ("seed-project-03", "seed-client-02", "2026-09", 4, 30000, "Landing page copywriter"),
    ]
    for pid, cid, month, day, amount, desc in proj_costs:
        txs.append(tx(i, "expense", f"{month}-{day:02d}", amount, "operational", desc, client_id=cid, project_id=pid))
        i += 1
    return txs


EXPENSES = [
    # (id_suffix, category, amount, date, desc, submitted_by, status, ai_tool, client, project)
    (1, "tools", 14500, d(-3), "Annual Figma plugin bundle", U["pm"], "submitted", None, None, None),
    (2, "marketing", 22000, d(-2), "Diwali campaign shoot props", U["finance"], "submitted", None, "seed-client-05", "seed-project-08"),
    (3, "ai", 12500, d(-1), "Midjourney extra fast-hours", U["pm"], "submitted", "Midjourney", None, None),
    (4, "operational", 9500, d(-12), "Client meeting travel - Pune", U["pm"], "approved", None, "seed-client-05", None),
    (5, "misc", 5600, d(-10), "Team lunch - project launch", U["finance"], "approved", None, None, None),
    (6, "tools", 18800, d(-25), "JetBrains all-products pack", U["pm"], "paid", None, None, None),
    (7, "marketing", 27500, d(-20), "LinkedIn boosted posts", U["finance"], "paid", None, "seed-client-07", None),
    (8, "ai", 15200, d(-18), "ElevenLabs voice credits", U["pm"], "paid", "ElevenLabs", "seed-client-02", None),
    (9, "misc", 32000, d(-8), "Office chairs (rejected - over policy)", U["pm"], "rejected", None, None, None),
    (10, "operational", 12800, d(-6), "Courier & printing (no receipt)", U["finance"], "rejected", None, None, None),
]

SUBSCRIPTIONS = [
    # (n, name, vendor, cost, cycle, renewal_days, owner, is_ai, status)
    (1, "Figma Organization", "Figma Inc", 36000, "yearly", 8, "Design", False, "active"),
    (2, "Adobe Creative Cloud", "Adobe", 4800, "monthly", 15, "Design", False, "active"),
    (3, "Google Workspace", "Google", 9900, "monthly", 28, "Ops", False, "active"),
    (4, "Slack Pro", "Slack", 8700, "monthly", 41, "Ops", False, "active"),
    (5, "HubSpot Starter", "HubSpot", 58000, "quarterly", 55, "Sales", False, "active"),
    (6, "Notion Team", "Notion", 6000, "monthly", 47, "Ops", False, "active"),
    (7, "Canva Teams", "Canva", 42000, "yearly", 120, "Design", False, "active"),
    (8, "GitHub Team", "GitHub", 3200, "monthly", 38, "Engineering", False, "active"),
    (9, "Zoom Pro", "Zoom", 13200, "yearly", 200, "Ops", False, "cancelled"),
    (10, "Hostinger Cloud", "Hostinger", 15000, "yearly", 160, "Engineering", False, "active"),
    (11, "OpenAI API", "OpenAI", 25000, "monthly", 33, "AI", True, "active"),
    (12, "Anthropic API", "Anthropic", 20000, "monthly", 36, "AI", True, "active"),
    (13, "Midjourney Pro", "Midjourney", 2500, "monthly", 44, "AI", True, "active"),
    (14, "ElevenLabs Creator", "ElevenLabs", 1800, "monthly", 50, "AI", True, "active"),
    (15, "Runway Standard", "Runway", 4000, "monthly", 62, "AI", True, "active"),
]

BUDGETS = [
    (1, "2026-09", "salaries", 450000),
    (2, "2026-09", "operational", 200000),
    (3, "2026-09", "marketing", 90000),
    (4, "2026-09", "tools", 40000),
    (5, "2026-09", "ai", 50000),
    (6, "2026-09", "misc", 25000),
    (7, "2026-Q3", "marketing", 300000),
    (8, "2026-Q3", "ai", 160000),
    (9, "2026-Q3", "salaries", 1350000),
]

CAMPAIGNS = [
    (1, "UrbanKart Festive Blast", "meta", 145000, "2026-07 to 2026-09", "seed-client-05"),
    (2, "MediCare Patient Acquisition", "google", 180000, "2026-07 to 2026-09", "seed-client-02"),
    (3, "Skyline Site-Visit Leads", "meta", 95000, "2026-05 to 2026-06", "seed-client-01"),
    (4, "ThamesTech B2B Demos", "linkedin", 110000, "2026-08 to 2026-09", "seed-client-07"),
    (5, "Bombay Brew Event Push", "meta", 48000, "2026-08", "seed-client-10"),
    (6, "dotindot Brand Awareness", "other", 60000, "2026-04 to 2026-09", None),
]

COST_ALLOCATION = {
    "seed-project-01": 220000, "seed-project-02": 40000, "seed-project-03": 180000,
    "seed-project-04": 600000, "seed-project-05": 60000, "seed-project-06": 700000,
    "seed-project-07": 150000, "seed-project-08": 120000, "seed-project-09": 80000,
    "seed-project-10": 650000, "seed-project-11": 320000, "seed-project-12": 90000,
    "seed-project-13": 70000, "seed-project-14": 200000, "seed-project-15": 60000,
}


async def seed_finance():
    for t in build_transactions():
        await db.transactions.update_one({"id": t["id"]}, {"$setOnInsert": t}, upsert=True)

    for n, category, amount, date, desc, submitter, status, ai_tool, cid, pid in EXPENSES:
        eid = f"fin-exp-{n:02d}"
        doc = {
            "id": eid, "category": category, "amount": amount, "date": date, "description": desc,
            "receipt_path": None, "receipt_link": "", "client_id": cid, "project_id": pid, "ai_tool": ai_tool,
            "currency": "INR", "status": status, "submitted_by": submitter,
            "approved_by": U["finance"] if status in ("approved", "paid", "rejected") else None,
            "paid_at": _now() if status == "paid" else None, "created_at": _now(), "updated_at": _now(),
        }
        await db.expenses.update_one({"id": eid}, {"$setOnInsert": doc}, upsert=True)
        if status in ("approved", "paid"):
            txid = f"fin-tx-exp-{n:02d}"
            txdoc = tx(900 + n, "expense", date, amount, category, f"[Expense] {desc}", client_id=cid,
                       project_id=pid, ai_tool=ai_tool, source="expense_workflow", expense_id=eid,
                       payment_method="bank_transfer" if status == "paid" else "pending")
            txdoc["id"] = txid
            await db.transactions.update_one({"id": txid}, {"$setOnInsert": txdoc}, upsert=True)

    for n, name, vendor, cost, cycle, renewal_days, owner, is_ai, status in SUBSCRIPTIONS:
        sid = f"fin-sub-{n:02d}"
        doc = {
            "id": sid, "name": name, "vendor": vendor, "cost": cost, "billing_cycle": cycle,
            "next_renewal_date": d(renewal_days), "owner": owner,
            "category": "ai_tool" if is_ai else "general", "is_ai": is_ai, "status": status,
            "currency": "INR", "created_by": U["finance"], "created_at": _now(),
        }
        await db.subscriptions.update_one({"id": sid}, {"$setOnInsert": doc}, upsert=True)

    for n, period, category, amount in BUDGETS:
        bid = f"fin-bud-{n:02d}"
        doc = {"id": bid, "period": period, "category": category, "amount": amount, "currency": "INR",
               "created_by": U["finance"], "created_at": _now()}
        await db.budgets.update_one({"id": bid}, {"$setOnInsert": doc}, upsert=True)

    for n, name, channel, spend, period, cid in CAMPAIGNS:
        campid = f"fin-camp-{n:02d}"
        doc = {"id": campid, "name": name, "channel": channel, "spend": spend, "period": period,
               "client_id": cid, "currency": "INR", "created_by": U["finance"], "created_at": _now()}
        await db.campaigns.update_one({"id": campid}, {"$setOnInsert": doc}, upsert=True)
    # legacy fixed campaign ids used in income tx: fin-camp-01..05 map to fin-camp-01..05 above? ids differ (fin-camp-01 vs fin-camp-01) - consistent.

    for pid, alloc in COST_ALLOCATION.items():
        await db.projects.update_one(
            {"id": pid, "cost_allocation": {"$exists": False}}, {"$set": {"cost_allocation": alloc}}
        )

    # Early-month marketing spend so CAC is meaningful even at month start
    month = datetime.now(timezone.utc).date().isoformat()[:7]
    boost = tx(200, "expense", f"{month}-02", 45000, "marketing", f"Lead-gen ads early-month batch {month}")
    boost["id"] = "fin-tx-200"
    await db.transactions.update_one({"id": "fin-tx-200"}, {"$setOnInsert": boost}, upsert=True)
