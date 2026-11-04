"""Optional demo data for v3.1 Digital Growth: 12 months of follower / views numbers for dotindot's own accounts and
for a handful of clients. NOT run at startup — call seed_v31() manually on a demo/staging database.
Idempotent (guarded by seed flag "v31"). All handles and numbers are made up for the demo."""
import random
import uuid
from datetime import date, datetime, timezone
from database import db

# owner, platform, handle, start audience, monthly growth %, views per follower, synced?
ACCOUNTS = [
    ("internal", "instagram", "dotindot.creative", 8400, 4.2, 3.1, "instagram"),
    ("internal", "linkedin", "dotindot", 3100, 5.5, 2.4, None),
    ("internal", "youtube", "@dotindotcreative", 1250, 6.0, 9.0, "youtube"),
    ("internal", "x", "dotindot_in", 980, 1.8, 3.0, None),
    ("internal", "website", "dotindot.in", None, 0, 0, None),
    ("seed-client-01", "instagram", "skylinerealty", 21500, 3.6, 2.8, "instagram"),
    ("seed-client-01", "facebook", "SkylineRealtyIndia", 46200, 1.1, 1.4, None),
    ("seed-client-01", "youtube", "@skylinerealty", 5300, 4.8, 11.0, None),
    ("seed-client-01", "google_business", "Skyline Realty — Bandra", None, 0, 0, None),
    ("seed-client-01", "website", "skylinerealty.in", None, 0, 0, None),
    ("seed-client-02", "instagram", "medicarehospitals", 33800, 2.4, 2.2, None),
    ("seed-client-02", "facebook", "MediCareHospitals", 88100, 0.8, 1.1, None),
    ("seed-client-02", "linkedin", "medicare-hospitals", 12400, 3.1, 1.9, None),
    ("seed-client-02", "google_business", "MediCare — Andheri", None, 0, 0, None),
    ("seed-client-03", "instagram", "spiceroute.kitchen", 6900, 7.5, 4.6, None),
    ("seed-client-03", "google_business", "Spice Route — Indiranagar", None, 0, 0, None),
    ("seed-client-05", "instagram", "urbankart", 54000, 2.9, 3.4, None),
    ("seed-client-05", "facebook", "UrbanKartShop", 71000, 0.6, 1.2, None),
    ("seed-client-05", "youtube", "@urbankart", 9100, 3.9, 14.0, None),
    ("seed-client-05", "pinterest", "urbankart", 4200, 5.2, 18.0, None),
    ("seed-client-10", "instagram", "bombaybrew", 12800, 5.1, 3.9, None),
    ("seed-client-10", "threads", "bombaybrew", 2100, 8.0, 2.5, None),
]


def _shift(ym, k):
    y, m = map(int, ym.split("-"))
    t = y * 12 + (m - 1) + k
    return f"{t // 12:04d}-{t % 12 + 1:02d}"


async def seed_v31():
    if await db.seed_flags.find_one({"id": "v31"}):
        return
    rnd = random.Random(31)
    now = datetime.now(timezone.utc).isoformat()
    this_month = date.today().strftime("%Y-%m")
    months = [_shift(this_month, -i) for i in range(12, 0, -1)]   # the 12 complete months before this one
    names = {c["id"]: c["name"] for c in await db.clients.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(200)}
    for i, (owner, plat, handle, start, g, vpf, sync) in enumerate(ACCOUNTS):
        if owner != "internal" and owner not in names:
            continue
        aid = f"seed-growth-{i + 1:02d}"
        url = {"instagram": f"https://instagram.com/{handle}", "facebook": f"https://facebook.com/{handle}", "youtube": f"https://youtube.com/{handle}",
               "linkedin": f"https://linkedin.com/company/{handle}", "x": f"https://x.com/{handle}", "threads": f"https://threads.net/@{handle}",
               "pinterest": f"https://pinterest.com/{handle}", "website": f"https://{handle}"}.get(plat, "")
        target = round(start * 1.6, -2) if start and plat in ("instagram", "youtube") else None
        sync_doc = {"method": None}
        if sync == "youtube":
            sync_doc = {"method": "youtube", "external_id": handle, "last": {"ok": True, "message": "Synced subscribers, videos", "at": now}}
        elif sync == "instagram":
            sync_doc = {"method": "instagram", "external_id": "me", "host": "graph.instagram.com", "token_hint": "…k3Qa",
                        "last": {"ok": True, "message": "Synced followers, posts, views, accounts reached, interactions, link taps", "at": now}}
        await db.growth_accounts.insert_one({
            "id": aid, "owner": owner, "client_id": None if owner == "internal" else owner, "owner_name": "dotindot" if owner == "internal" else names[owner],
            "platform": plat, "handle": handle, "url": url, "name": "", "target": target, "target_date": f"{date.today().year + 1}-03-31" if target else None,
            "status": "active", "sync": sync_doc, "created_by": "user-admin", "created_at": "2025-10-20T09:00:00+00:00", "updated_at": now})
        aud = float(start or 0)
        posts = rnd.randint(140, 600)
        reviews, rating = rnd.randint(60, 380), round(rnd.uniform(4.1, 4.7), 1)
        web_users = rnd.randint(2500, 14000)
        # a quiet month and a viral month for realism
        viral = rnd.randint(3, 10)
        rows = months + ([this_month] if sync else [])
        for j, m in enumerate(rows):
            partial = m == this_month
            boost = 2.4 if j == viral else (0.5 if j == viral - 2 else 1.0)
            vals = {}
            if plat == "website":
                web_users = int(web_users * rnd.uniform(0.97, 1.08) * (1.25 if j == viral else 1))
                sess = int(web_users * rnd.uniform(1.3, 1.6))
                vals = {"users": web_users, "sessions": sess, "page_views": int(sess * rnd.uniform(2.1, 3.2)),
                        "organic_sessions": int(sess * rnd.uniform(0.35, 0.55)), "conversions": int(sess * rnd.uniform(0.012, 0.03))}
            elif plat == "google_business":
                reviews += rnd.randint(4, 22)
                rating = max(3.9, min(4.9, round(rating + rnd.uniform(-0.05, 0.06), 1)))
                pv = rnd.randint(3800, 12500)
                vals = {"reviews": reviews, "rating": rating, "profile_views": pv, "searches": int(pv * rnd.uniform(1.4, 2.2)),
                        "calls": int(pv * rnd.uniform(0.02, 0.05)), "directions": int(pv * rnd.uniform(0.03, 0.07)), "website_clicks": int(pv * rnd.uniform(0.04, 0.09))}
            else:
                gain = aud * (g / 100) * rnd.uniform(0.55, 1.45) * boost
                if partial:
                    gain *= 0.12
                aud = max(0, aud + gain)
                views = aud * vpf * rnd.uniform(0.75, 1.3) * boost * (0.13 if partial else 1)
                key = "subscribers" if plat == "youtube" else "followers"
                vals = {key: int(aud)}
                pl = {"instagram": "views", "facebook": "views", "youtube": "views", "threads": "views",
                      "linkedin": "impressions", "x": "impressions", "pinterest": "impressions"}[plat]
                vals[pl] = int(views)
                reach = views * rnd.uniform(0.42, 0.62)
                inter = reach * rnd.uniform(0.035, 0.075)
                if plat == "instagram":
                    posts += rnd.randint(8, 20) if not partial else 2
                    vals.update({"posts": posts, "reach": int(reach), "interactions": int(inter), "profile_visits": int(reach * rnd.uniform(0.04, 0.08)),
                                 "link_taps": int(reach * rnd.uniform(0.004, 0.012))})
                elif plat == "facebook":
                    vals.update({"reach": int(reach), "interactions": int(inter), "link_clicks": int(reach * rnd.uniform(0.005, 0.015))})
                elif plat == "youtube":
                    posts += rnd.randint(2, 6) if not partial else 0
                    vals.update({"videos": posts // 10, "watch_hours": round(views * rnd.uniform(0.04, 0.09), 1), "interactions": int(views * rnd.uniform(0.02, 0.05))})
                elif plat in ("linkedin", "x"):
                    vals.update({"interactions": int(views * rnd.uniform(0.02, 0.06)), "link_clicks": int(views * rnd.uniform(0.006, 0.02))})
                elif plat == "pinterest":
                    vals.update({"saves": int(views * rnd.uniform(0.01, 0.03)), "outbound_clicks": int(views * rnd.uniform(0.004, 0.01))})
                elif plat == "threads":
                    vals.update({"interactions": int(views * rnd.uniform(0.03, 0.07))})
            source = "sync" if (sync and j >= len(rows) - 4) else ("import" if j < 6 and owner != "internal" else "manual")
            await db.growth_months.insert_one({"id": str(uuid.uuid4()), "account_id": aid, "owner": owner, "client_id": None if owner == "internal" else owner,
                                               "platform": plat, "month": m, "values": vals, "meta": {}, "source": source, "note": "Reel went viral" if j == viral and plat == "instagram" else "",
                                               "updated_by": "Auto-sync" if source == "sync" else "Neha Kapoor", "updated_at": now, "created_at": now})
    # one client account still waiting on last month's numbers, so the reminder shows
    await db.growth_months.delete_one({"account_id": "seed-growth-16", "month": months[-1]})
    await db.seed_flags.insert_one({"id": "v31", "at": now})
