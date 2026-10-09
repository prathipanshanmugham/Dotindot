"""Optional demo data for v2.7 (API Credits, Daily Reporting, client portal logins).
NOT run at startup — call seed_v27() manually for a demo/staging database. Idempotent."""
import random
import uuid
from datetime import date, datetime, timedelta, timezone
from database import db
from auth import hash_password

IST = timezone(timedelta(hours=5, minutes=30))

ACCOUNTS = [
    {"id": "api-openai", "name": "OpenAI — production", "provider": "openai", "billing": "prepaid", "currency": "USD", "fx_rate": 84.0,
     "monthly_budget": 350, "low_balance_threshold": 50, "owner_id": "user-dev", "agent_ids": ["agent-03"], "key_hint": "…x7Qa",
     "dashboard_url": "https://platform.openai.com/usage", "notes": "Used by client chatbots and ad copy tooling."},
    {"id": "api-anthropic", "name": "Anthropic — Claude API", "provider": "anthropic", "billing": "prepaid", "currency": "USD", "fx_rate": 84.0,
     "monthly_budget": 250, "low_balance_threshold": 40, "owner_id": "user-dev", "agent_ids": ["agent-01", "agent-04"], "key_hint": "…mK2d",
     "dashboard_url": "https://console.anthropic.com", "notes": "Proposal writer + social captions."},
    {"id": "api-elevenlabs", "name": "ElevenLabs voice", "provider": "elevenlabs", "billing": "prepaid", "currency": "USD", "fx_rate": 84.0,
     "monthly_budget": 60, "low_balance_threshold": 15, "owner_id": "user-designer", "agent_ids": [], "key_hint": "…9fLe",
     "dashboard_url": "https://elevenlabs.io", "notes": "Voice-overs for reels."},
    {"id": "api-gemini", "name": "Google Gemini (Vertex)", "provider": "google", "billing": "postpaid", "currency": "INR", "fx_rate": 1.0,
     "monthly_budget": 9000, "low_balance_threshold": 0, "owner_id": "user-pm", "agent_ids": ["agent-09"], "key_hint": "…vtx1",
     "dashboard_url": "https://console.cloud.google.com/billing", "notes": "Billed to the company card monthly."},
    {"id": "api-replicate", "name": "Replicate image models", "provider": "replicate", "billing": "prepaid", "currency": "USD", "fx_rate": 84.0,
     "monthly_budget": 40, "low_balance_threshold": 10, "owner_id": "user-designer", "agent_ids": ["agent-07"], "key_hint": "…r8Tt",
     "dashboard_url": "https://replicate.com/account/billing", "status": "paused", "notes": "Paused while we test Midjourney."},
]
DAILY_USAGE = {"api-openai": (6, 14), "api-anthropic": (5, 11), "api-elevenlabs": (1.5, 4), "api-gemini": (180, 420), "api-replicate": (0, 0)}
TOPUPS = {"api-openai": [(58, 300), (30, 300), (8, 200)], "api-anthropic": [(50, 200), (20, 250)], "api-elevenlabs": [(40, 99), (14, 60)],
          "api-replicate": [(70, 25)]}
CLIENTS = ["seed-client-01", "seed-client-02", "seed-client-03", "seed-client-10"]
PROJECTS = ["seed-project-01", "seed-project-04", "seed-project-09", "seed-project-15"]
TASKS = ["Client call and follow-up notes", "Design revisions for homepage", "Ad set optimisation", "Content calendar for next week",
         "QA on staging site", "Proposal draft", "Bug fixes on checkout", "Reels editing", "Monthly report prep", "SEO audit fixes"]


async def seed_v27():
    rnd = random.Random(27)
    today = datetime.now(IST).date()
    now = datetime.now(timezone.utc).isoformat()

    # ---- API credits ----
    for a in ACCOUNTS:
        await db.api_accounts.update_one({"id": a["id"]}, {"$setOnInsert": {"status": "active", **a, "created_at": now, "updated_at": now,
                                                                            "created_by": "user-admin"}}, upsert=True)
    if not await db.api_credit_txns.find_one({"id": "apitx-0001"}):
        n = 0
        for acc, tops in TOPUPS.items():
            for days_ago, amt in tops:
                n += 1
                await db.api_credit_txns.insert_one({"id": f"apitx-{n:04d}", "account_id": acc, "kind": "topup",
                                                     "date": (today - timedelta(days=days_ago)).isoformat(), "amount": amt, "units": None,
                                                     "unit_label": "", "client_id": None, "project_id": None, "agent_id": None,
                                                     "note": "Card top-up", "ledger_tx_id": None, "created_by": "user-finance", "created_at": now})
        agent_of = {a["id"]: (a["agent_ids"] or [None]) for a in ACCOUNTS}
        for acc, (lo, hi) in DAILY_USAGE.items():
            if hi == 0:
                continue
            for d in range(0, 46):
                if acc == "api-elevenlabs" and d < 3:
                    amt = hi * 1.8  # recent spike → low balance alert
                else:
                    amt = rnd.uniform(lo, hi)
                n += 1
                await db.api_credit_txns.insert_one({
                    "id": f"apitx-{n:04d}", "account_id": acc, "kind": "usage", "date": (today - timedelta(days=d)).isoformat(),
                    "amount": round(amt, 2), "units": round(amt * (55000 if acc != "api-gemini" else 650)),
                    "unit_label": "characters" if acc == "api-elevenlabs" else "tokens",
                    "client_id": rnd.choice(CLIENTS + [None]), "project_id": rnd.choice(PROJECTS + [None, None]),
                    "agent_id": rnd.choice(agent_of[acc]), "note": "", "ledger_tx_id": None, "created_by": "user-dev", "created_at": now})

    # ---- Daily reports / attendance ----
    if not await db.daily_reports.find_one({"seed": "v27"}):
        users = [u for u in await db.users.find({"role": {"$ne": "super_admin"}}, {"_id": 0}).to_list(200) if u.get("is_active", True)]
        from routes_locations import resolve_coords
        branches = {}
        for b in await db.branches.find({}, {"_id": 0}).to_list(50):
            b["lat"], b["lng"] = resolve_coords(b.get("city"), b.get("state"), b.get("lat"), b.get("lng"))
            branches[b["id"]] = b
        for u in users:
            home = u.get("branch_id") or next((a["branch_id"] for a in u.get("branch_assignments") or []), None)
            b = branches.get(home) or next(iter(branches.values()), None)
            for back in range(0, 26):
                d = today - timedelta(days=back)
                if d.weekday() == 6:
                    continue
                if back == 0 and rnd.random() < 0.35:
                    continue  # some people haven't checked in yet today
                roll = rnd.random()
                status = "office" if roll < 0.72 else "wfh" if roll < 0.84 else "field" if roll < 0.9 else "leave" if roll < 0.95 else "half_day"
                rec = {"id": str(uuid.uuid4()), "seed": "v27", "user_id": u["id"], "user_name": u["name"], "date": d.isoformat(),
                       "branch_id": home, "status": status, "created_at": now, "updated_at": now, "note": "", "report": None}
                if status != "leave":
                    mins = 9 * 60 + 5 + int(rnd.gauss(18, 14))
                    cin = datetime(d.year, d.month, d.day, mins // 60, mins % 60, tzinfo=IST)
                    late = mins > 9 * 60 + 40 and status in ("office", "field")
                    rec.update({"check_in_at": cin.astimezone(timezone.utc).isoformat(), "check_in_local": cin.strftime("%H:%M"),
                                "late": late, "late_by_min": max(0, mins - 570) if late else 0})
                    if b and b.get("lat") is not None and status == "office":
                        off = rnd.random() < 0.08
                        jitter = 0.02 if off else 0.0009
                        lat, lng = b["lat"] + rnd.uniform(-jitter, jitter), b["lng"] + rnd.uniform(-jitter, jitter)
                        from routes_daily import haversine_m
                        dist = haversine_m(lat, lng, b["lat"], b["lng"])
                        rec.update({"check_in_location": {"lat": lat, "lng": lng, "accuracy": 25}, "nearest_branch_id": b["id"],
                                    "nearest_branch_name": b["name"], "distance_m": round(dist), "on_site": dist <= 300})
                    if back > 0 or rnd.random() < 0.3:
                        out_m = mins + (240 if status == "half_day" else 8 * 60 + int(rnd.gauss(50, 30)))
                        cout = datetime(d.year, d.month, d.day, min(out_m // 60, 23), out_m % 60, tzinfo=IST)
                        rec.update({"check_out_at": cout.astimezone(timezone.utc).isoformat(), "check_out_local": cout.strftime("%H:%M"),
                                    "hours": round((out_m - mins) / 60, 2)})
                        if rnd.random() < 0.85:
                            tasks = [{"text": t, "project_id": rnd.choice(PROJECTS + [None]), "hours": rnd.choice([1, 1.5, 2, 3])}
                                     for t in rnd.sample(TASKS, rnd.randint(2, 3))]
                            rec["report"] = {"summary": "; ".join(t["text"] for t in tasks), "tasks": tasks,
                                             "plan_tomorrow": rnd.choice(["Continue revisions", "Client review call", "Start next sprint", "Wrap up QA"]),
                                             "blockers": rnd.choice(["", "", "", "Waiting on client content", "Need API key from client"]),
                                             "submitted": True, "submitted_at": cout.astimezone(timezone.utc).isoformat()}
                await db.daily_reports.insert_one(rec)

    # ---- Client portal logins ----
    for pid, cid, name, email in [("portal-01", "seed-client-01", "Vikram Singhania", "vikram@skylinerealty.in"),
                                  ("portal-02", "seed-client-10", "Bombay Brew team", "hello@bombaybrew.in")]:
        if await db.clients.find_one({"id": cid}) and not await db.portal_users.find_one({"id": pid}):
            await db.portal_users.insert_one({"id": pid, "client_id": cid, "name": name, "email": email,
                                              "password_hash": hash_password("Client@2026"), "is_active": True, "last_login": None,
                                              "created_by": "user-admin", "created_at": now})
