"""v2 idempotent seed: account migration to @dotindot.in, super_admin, new roles,
London branch, branch assignments, assets, ad campaigns, social posts, influencers."""
from datetime import datetime, timezone, timedelta
from database import db
from auth import hash_password
from seed import PASSWORD, U

NEW_V2 = {"midhun": "user-midhun", "ads": "user-ads", "social": "user-social"}

EMAIL_MIGRATIONS = {
    "admin@dotindot.com": "admin@dotindot.in",
    "finance@dotindot.com": "finance@dotindot.in",
    "sales@dotindot.com": "sales@dotindot.in",
    "pm@dotindot.com": "pm@dotindot.in",
    "employee@dotindot.com": "employee@dotindot.in",
    "designer@dotindot.com": "designer@dotindot.in",
    "dev@dotindot.com": "dev@dotindot.in",
    "marketing@dotindot.com": "marketing@dotindot.in",
}

V2_USERS = [
    {"id": NEW_V2["midhun"], "name": "Midhun", "email": "midhun@dotindot.in", "role": "admin",
     "designation": "Admin & Operations Head", "department": "Leadership", "city": "Mumbai",
     "phone": "+91 98200 00011", "join_date": "2022-02-01", "skills": ["Operations", "Strategy"],
     "bio": "Runs day-to-day operations across all dotindot branches."},
    {"id": NEW_V2["ads"], "name": "Aarav Shetty", "email": "ads@dotindot.in", "role": "ads_manager",
     "designation": "Ads Manager", "department": "Marketing", "city": "Mumbai",
     "phone": "+91 98200 00012", "join_date": "2025-01-15", "skills": ["Google Ads", "Meta Ads", "Amazon PPC"],
     "bio": "Owns paid media across client accounts."},
    {"id": NEW_V2["social"], "name": "Zara Ali", "email": "social@dotindot.in", "role": "social_manager",
     "designation": "Social Media Manager", "department": "Marketing", "city": "Dubai",
     "phone": "+971 50 000 0013", "join_date": "2025-03-01", "skills": ["Content Calendars", "Reels", "Community"],
     "bio": "Plans and ships the social calendar for retainer clients."},
]

CITY_BRANCH = {"Dubai": "seed-branch-02", "London": "seed-branch-03"}
DEFAULT_BRANCH = "seed-branch-01"

# id -> (email, name, role) for every seeded demo account (self-healing registry)
SEED_ACCOUNTS = {
    "user-admin": ("admin@dotindot.in", "Arjun Mehta", "super_admin"),
    "user-midhun": ("midhun@dotindot.in", "Midhun", "admin"),
    "user-finance": ("finance@dotindot.in", "Priya Sharma", "finance"),
    "user-sales": ("sales@dotindot.in", "Rohan Kapoor", "sales"),
    "user-pm": ("pm@dotindot.in", "Sneha Iyer", "pm"),
    "user-employee": ("employee@dotindot.in", "Karan Patel", "employee"),
    "user-designer": ("designer@dotindot.in", "Ananya Verma", "employee"),
    "user-dev": ("dev@dotindot.in", "Dev Malhotra", "employee"),
    "user-marketing": ("marketing@dotindot.in", "Fatima Khan", "employee"),
    "user-ads": ("ads@dotindot.in", "Aarav Shetty", "ads_manager"),
    "user-social": ("social@dotindot.in", "Zara Ali", "social_manager"),
}


async def restore_seed_accounts(pw_hash: str):
    """Self-healing: consolidate duplicates and restore any seeded demo account that
    was deleted/tombstoned or email-mangled (e.g. during delete-flow testing).
    Guarantees exactly one canonical doc per seed account — never raises dup-key."""
    for uid, (email, name, role) in SEED_ACCOUNTS.items():
        docs = await db.users.find({"$or": [{"id": uid}, {"email": email}]}).to_list(10)
        keep = next((x for x in docs if x.get("email") == email and not x.get("deleted")), None)
        if keep is None and docs:
            keep = docs[0]
        for x in docs:
            if keep is not None and x["_id"] != keep["_id"]:
                await db.users.delete_one({"_id": x["_id"]})
        if keep is not None:
            await db.users.update_one({"_id": keep["_id"]}, {
                "$set": {"id": uid, "email": email, "name": name, "role": role,
                         "is_active": True, "deleted": False,
                         "password_hash": keep.get("password_hash") or pw_hash},
                "$unset": {"deleted_at": "", "deleted_by": ""},
            })
        else:
            await db.users.insert_one({"id": uid, "email": email, "name": name, "role": role,
                                       "is_active": True, "deleted": False,
                                       "password_hash": pw_hash, "created_at": _now()})

LONDON_BRANCH = {
    "id": "seed-branch-03", "name": "London Branch", "city": "London", "country": "UK",
    "address": "3rd Floor, 12 Soho Square, London W1D 3QF", "head_name": "Sneha Iyer",
    "established": "2026-01-15", "status": "active",
    "contact_phone": "+44 7700 900456", "contact_email": "london@dotindot.in",
}


def _now():
    return datetime.now(timezone.utc).isoformat()


def d(days: int) -> str:
    return (datetime.now(timezone.utc).date() + timedelta(days=days)).isoformat()


def month_str(offset: int = 0) -> str:
    today = datetime.now(timezone.utc).date()
    m = today.month - 1 + offset
    return f"{today.year + m // 12}-{m % 12 + 1:02d}"


# ---------------- Assets ----------------
def asset(i, name, atype, value, status, assigned_to=None, location="", branch=DEFAULT_BRANCH,
          purchase_days_ago=400, next_maint=None, interval=None, maint_log=None, history=None):
    return {
        "id": f"seed-asset-{i:02d}", "code": f"DOT-AST-{i:03d}", "name": name, "asset_type": atype,
        "serial_no": f"SN-{atype.upper()[:3]}-{1000 + i}", "purchase_date": d(-purchase_days_ago),
        "purchase_value": value, "status": status, "assigned_to": assigned_to,
        "assigned_location": location, "branch_id": branch, "notes": "", "currency": "INR",
        "next_maintenance_date": next_maint, "maintenance_interval_days": interval,
        "maintenance_log": maint_log or [], "assignment_history": history or [],
        "created_at": _now(), "updated_at": _now(), "created_by": U["admin"],
    }


def hist(entries):
    return [{"assigned_to": e[0], "assigned_to_name": e[1], "location": e[2] if len(e) > 2 else "",
             "from_date": d(e[3] if len(e) > 3 else -300), "to_date": d(e[4]) if len(e) > 4 and e[4] is not None else None,
             "note": ""} for e in entries]


def get_assets():
    emp, pm, sal, fin = U["employee"], U["pm"], U["sales"], U["finance"]
    return [
        asset(1, 'MacBook Pro 14" M4', "laptop", 245000, "in_use", assigned_to=emp,
              history=hist([(pm, "Sneha Iyer", "", -500, -200), (emp, "Karan Patel", "", -200, None)])),
        asset(2, 'MacBook Air 13" M3', "laptop", 135000, "in_use", assigned_to="user-designer",
              history=hist([("user-designer", "Ananya Verma", "", -350, None)])),
        asset(3, "Dell XPS 15 Workstation", "laptop", 185000, "in_use", assigned_to="user-dev",
              history=hist([("user-dev", "Dev Malhotra", "", -280, None)])),
        asset(4, "iPhone 16 Pro", "phone", 135000, "in_use", assigned_to=sal,
              history=hist([(sal, "Rohan Kapoor", "", -300, None)])),
        asset(5, "Samsung S25 Ultra", "phone", 125000, "in_use", assigned_to="user-marketing", branch="seed-branch-02",
              history=hist([("user-marketing", "Fatima Khan", "", -250, None)])),
        asset(6, "Airtel Business SIM 98200-11111", "sim_card", 0, "in_use", assigned_to=sal,
              history=hist([(sal, "Rohan Kapoor", "", -300, None)])),
        asset(7, "Du Business SIM +971-50-2222", "sim_card", 0, "in_use", assigned_to="user-marketing",
              branch="seed-branch-02", history=hist([("user-marketing", "Fatima Khan", "", -250, None)])),
        asset(8, "Sony A7 IV Camera Kit", "camera", 285000, "in_use", location="Mumbai HQ Studio",
              next_maint=d(12), interval=180,
              maint_log=[{"id": "ml-08a", "date": d(-170), "description": "Sensor cleaning + firmware update",
                          "cost": 4500, "logged_by": "Arjun Mehta"}],
              history=hist([(None, None, "Mumbai HQ Studio", -400, None)])),
        asset(9, "DJI Mini 4 Pro Drone", "camera", 95000, "maintenance", location="Mumbai HQ Studio",
              next_maint=d(25), interval=120,
              maint_log=[{"id": "ml-09a", "date": d(-95), "description": "Gimbal recalibration",
                          "cost": 6800, "logged_by": "Arjun Mehta"}],
              history=hist([(None, None, "Mumbai HQ Studio", -300, None)])),
        asset(10, "Rode Podcast Mic Set", "equipment", 42000, "available",
              history=hist([(emp, "Karan Patel", "", -200, -30)])),
        asset(11, 'iMac 24" Studio', "computer", 165000, "in_use", location="Mumbai HQ Design Desk",
              history=hist([(None, None, "Mumbai HQ Design Desk", -450, None)])),
        asset(12, "Godox Lighting Rig", "equipment", 58000, "in_use", location="Mumbai HQ Studio",
              history=hist([(None, None, "Mumbai HQ Studio", -380, None)])),
        asset(13, 'MacBook Pro 16" M3 Max', "laptop", 320000, "in_use", assigned_to=pm,
              history=hist([(pm, "Sneha Iyer", "", -420, None)])),
        asset(14, "ThinkPad X1 Carbon", "laptop", 155000, "available", branch="seed-branch-03",
              history=hist([(fin, "Priya Sharma", "", -350, -60)])),
        asset(15, "Canon R6 II (Dubai kit)", "camera", 215000, "in_use", location="Dubai Branch Studio",
              branch="seed-branch-02", history=hist([(None, None, "Dubai Branch Studio", -200, None)])),
    ]


# ---------------- Ad campaigns ----------------
def snap(i, months_back, spend, imp, clicks, conv, revenue):
    m = month_str(-months_back)
    return {"id": f"ms-{i}-{months_back}", "date": f"{m}-01", "spend": spend, "impressions": imp,
            "clicks": clicks, "conversions": conv, "revenue": revenue,
            "entered_by": "Aarav Shetty", "entered_at": _now()}


def campaign(i, name, platform, client, budget, status="active", branch=DEFAULT_BRANCH, snaps=None, start=-90, end=30):
    return {
        "id": f"seed-adc-{i:02d}", "name": name, "platform": platform, "client_id": client,
        "branch_id": branch, "status": status, "start_date": d(start), "end_date": d(end),
        "budget": budget, "notes": "", "currency": "INR", "metrics_history": snaps or [],
        "created_at": _now(), "updated_at": _now(), "created_by": NEW_V2["ads"],
    }


def get_campaigns():
    return [
        campaign(1, "MediCare Search — Treatments", "google_ads", "seed-client-02", 600000, snaps=[
            snap(1, 2, 145000, 410000, 12200, 340, 520000), snap(1, 1, 162000, 452000, 13800, 395, 610000),
            snap(1, 0, 88000, 231000, 7100, 198, 315000)]),
        campaign(2, "MediCare Meta — Health Packages", "meta_ads", "seed-client-02", 350000, snaps=[
            snap(2, 2, 82000, 690000, 15800, 210, 295000), snap(2, 1, 91000, 745000, 17400, 246, 340000),
            snap(2, 0, 46000, 380000, 8600, 121, 172000)]),
        campaign(3, "UrbanKart Festive PMax", "google_ads", "seed-client-05", 500000, snaps=[
            snap(3, 2, 118000, 520000, 20400, 610, 480000), snap(3, 1, 139000, 605000, 24800, 742, 585000),
            snap(3, 0, 74000, 318000, 12900, 388, 300000)]),
        campaign(4, "UrbanKart Amazon PPC", "amazon_ppc", "seed-client-05", 300000, snaps=[
            snap(4, 2, 65000, 280000, 9800, 420, 265000), snap(4, 1, 71000, 305000, 11200, 468, 291000),
            snap(4, 0, 38000, 160000, 5900, 240, 152000)]),
        campaign(5, "Skyline Lead Gen — Mumbai", "meta_ads", "seed-client-01", 240000, snaps=[
            snap(5, 2, 56000, 480000, 8900, 92, 210000), snap(5, 1, 61000, 512000, 9600, 108, 260000),
            snap(5, 0, 33000, 270000, 5100, 55, 130000)]),
        campaign(6, "Desert Pearl Luxury — GCC", "meta_ads", "seed-client-06", 420000, branch="seed-branch-02", snaps=[
            snap(6, 2, 98000, 610000, 10200, 64, 380000), snap(6, 1, 112000, 668000, 11500, 78, 445000),
            snap(6, 0, 60000, 342000, 6100, 41, 236000)]),
        campaign(7, "Desert Pearl Search — Dubai", "google_ads", "seed-client-06", 260000, branch="seed-branch-02", snaps=[
            snap(7, 1, 72000, 156000, 4900, 46, 285000), snap(7, 0, 41000, 88000, 2800, 27, 168000)]),
        campaign(8, "ThamesTech LinkedIn ABM", "linkedin", "seed-client-07", 280000, branch="seed-branch-03", snaps=[
            snap(8, 2, 64000, 92000, 2100, 18, 190000), snap(8, 1, 70000, 101000, 2400, 22, 230000),
            snap(8, 0, 37000, 54000, 1250, 12, 121000)]),
        campaign(9, "Bombay Brew Reels Boost", "meta_ads", "seed-client-10", 120000, snaps=[
            snap(9, 1, 28000, 340000, 8100, 96, 76000), snap(9, 0, 16000, 195000, 4600, 58, 45000)]),
        campaign(10, "Spice Route Local Ads", "google_ads", "seed-client-03", 60000, status="completed", end=-10, snaps=[
            snap(10, 2, 22000, 88000, 3400, 145, 68000), snap(10, 1, 24000, 96000, 3900, 168, 74000)]),
    ]


# ---------------- Social posts ----------------
SOCIAL_MATRIX = [
    # (client, platform, content_type, day_offset_key, status, assigned, caption)
    ("seed-client-10", "instagram", "reel", 2, "posted", "user-social", "Behind the brew: monsoon special launch"),
    ("seed-client-10", "instagram", "static", 4, "posted", "user-designer", "New single-origin drop"),
    ("seed-client-10", "instagram", "carousel", 8, "approved", "user-designer", "5 ways to brew at home"),
    ("seed-client-10", "facebook", "static", 10, "in_review", "user-social", "Weekend brunch event"),
    ("seed-client-10", "instagram", "story", 12, "planned", "user-social", "Poll: next seasonal flavour?"),
    ("seed-client-10", "youtube", "video", 18, "planned", "user-employee", "Roastery tour vlog"),
    ("seed-client-02", "instagram", "reel", 3, "posted", "user-social", "Doctor Q&A: heart health myths"),
    ("seed-client-02", "linkedin", "blog", 6, "approved", "user-marketing", "Preventive care packages explained"),
    ("seed-client-02", "facebook", "static", 9, "in_review", "user-designer", "Free screening camp announcement"),
    ("seed-client-02", "instagram", "carousel", 14, "planned", "user-social", "Nutrition tips series #3"),
    ("seed-client-02", "youtube", "video", 20, "planned", "user-marketing", "Patient stories: recovery journeys"),
    ("seed-client-01", "instagram", "reel", 5, "posted", "user-social", "Sky-view walkthrough: 3BHK Andheri"),
    ("seed-client-01", "linkedin", "static", 11, "approved", "user-marketing", "Q3 property market snapshot"),
    ("seed-client-01", "instagram", "story", 16, "planned", "user-social", "Open house this weekend"),
    ("seed-client-05", "instagram", "reel", 7, "posted", "user-social", "Festive haul unboxing"),
    ("seed-client-05", "instagram", "carousel", 13, "in_review", "user-designer", "Gift guide under ₹999"),
    ("seed-client-05", "facebook", "static", 17, "planned", "user-social", "Flash sale teaser"),
    ("seed-client-06", "instagram", "reel", 6, "approved", "user-marketing", "Palm Jumeirah penthouse tour"),
    ("seed-client-06", "instagram", "static", 15, "planned", "user-marketing", "Waterfront living highlights"),
    ("seed-client-06", "linkedin", "blog", 21, "planned", "user-marketing", "Dubai real estate outlook 2027"),
    ("seed-client-07", "linkedin", "blog", 9, "approved", "user-social", "How AI triage cut response time 60%"),
    ("seed-client-07", "x", "static", 19, "planned", "user-social", "Feature drop: auto-summaries"),
    ("seed-client-03", "instagram", "reel", 10, "posted", "user-designer", "Chef's special: Awadhi biryani"),
    ("seed-client-03", "instagram", "story", 22, "planned", "user-social", "Weekend table reservations"),
]

NEXT_MONTH_MATRIX = [
    ("seed-client-10", "instagram", "reel", 3, "planned", "user-social", "Festival brew countdown"),
    ("seed-client-02", "instagram", "carousel", 5, "planned", "user-designer", "Flu season prep checklist"),
    ("seed-client-01", "instagram", "reel", 8, "planned", "user-social", "New tower launch teaser"),
    ("seed-client-05", "instagram", "reel", 10, "planned", "user-social", "Diwali collection reveal"),
    ("seed-client-06", "youtube", "video", 12, "planned", "user-marketing", "Investor guide: Dubai off-plan"),
    ("seed-client-07", "linkedin", "blog", 15, "planned", "user-social", "Case study: 24/7 AI support desk"),
]


def get_social_posts():
    this_m, next_m = month_str(0), month_str(1)
    posts = []
    for idx, (client, platform, ctype, day, status, assigned, caption) in enumerate(SOCIAL_MATRIX, start=1):
        posts.append({
            "id": f"seed-social-{idx:02d}", "client_id": client, "platform": platform,
            "scheduled_at": f"{this_m}-{day:02d}T11:00:00", "content_type": ctype, "caption": caption,
            "creative_link": f"https://drive.google.com/file/d/creative-{idx:02d}", "status": status,
            "assigned_to": assigned, "branch_id": CITY_BRANCH.get("Dubai") if client == "seed-client-06" else DEFAULT_BRANCH,
            "created_at": _now(), "updated_at": _now(), "created_by": NEW_V2["social"],
        })
    for jdx, (client, platform, ctype, day, status, assigned, caption) in enumerate(NEXT_MONTH_MATRIX, start=len(SOCIAL_MATRIX) + 1):
        posts.append({
            "id": f"seed-social-{jdx:02d}", "client_id": client, "platform": platform,
            "scheduled_at": f"{next_m}-{day:02d}T11:00:00", "content_type": ctype, "caption": caption,
            "creative_link": f"https://drive.google.com/file/d/creative-{jdx:02d}", "status": status,
            "assigned_to": assigned, "branch_id": DEFAULT_BRANCH,
            "created_at": _now(), "updated_at": _now(), "created_by": NEW_V2["social"],
        })
    return posts


# ---------------- Influencers ----------------
def influencer(i, name, handle, niche, platforms, rates, status, collabs=None, email="", manager=""):
    return {
        "id": f"seed-inf-{i:02d}", "name": name, "handle": handle, "niche": niche,
        "platforms": platforms, "rate_card": rates,
        "contact_email": email or f"{handle.strip('@')}@gmail.com", "contact_phone": "",
        "manager_name": manager, "booking_status": status, "notes": "",
        "collaborations": collabs or [], "created_at": _now(), "updated_at": _now(), "created_by": NEW_V2["social"],
    }


def collab(cid, client, campaign_name, days_ago, deliverable, amount, note=""):
    return {"id": cid, "client_id": client, "campaign_name": campaign_name, "date": d(-days_ago),
            "deliverable": deliverable, "amount": amount, "note": note, "added_by": "Zara Ali"}


def get_influencers():
    return [
        influencer(1, "Riya Foodstories", "@riyafoodstories", "food",
                   [{"platform": "instagram", "followers": 480000, "engagement_rate": 4.2},
                    {"platform": "youtube", "followers": 120000, "engagement_rate": 3.1}],
                   {"reel": 45000, "post": 25000, "story": 12000, "video": 90000}, "booked",
                   collabs=[collab("cl-01a", "seed-client-10", "Monsoon Brew Launch", 60, "2 reels + 3 stories", 102000,
                                   "Reels crossed 1.2M views combined"),
                            collab("cl-01b", "seed-client-03", "Biryani Festival", 140, "1 reel + review post", 70000,
                                   "Drove 40+ weekend reservations")]),
        influencer(2, "TechWithVihaan", "@techwithvihaan", "tech",
                   [{"platform": "youtube", "followers": 850000, "engagement_rate": 5.4},
                    {"platform": "instagram", "followers": 210000, "engagement_rate": 3.8}],
                   {"reel": 60000, "post": 35000, "story": 15000, "video": 180000}, "available",
                   collabs=[collab("cl-02a", "seed-client-07", "AI Support Desk Review", 90, "1 dedicated video", 180000,
                                   "Strong B2B lead spike week after")]),
        influencer(3, "FitWithMeher", "@fitwithmeher", "fitness",
                   [{"platform": "instagram", "followers": 620000, "engagement_rate": 6.1},
                    {"platform": "youtube", "followers": 95000, "engagement_rate": 2.9}],
                   {"reel": 55000, "post": 30000, "story": 14000, "video": 100000}, "negotiating",
                   collabs=[collab("cl-03a", "seed-client-02", "Health Screening Awareness", 45, "2 reels", 110000,
                                   "High saves; audience fit excellent")]),
        influencer(4, "DubaiLuxeLife", "@dubailuxelife", "travel",
                   [{"platform": "instagram", "followers": 950000, "engagement_rate": 3.5},
                    {"platform": "tiktok", "followers": 400000, "engagement_rate": 7.2}],
                   {"reel": 120000, "post": 70000, "story": 35000, "video": 250000}, "booked", manager="Luxe Talent Mgmt",
                   collabs=[collab("cl-04a", "seed-client-06", "Palm Penthouse Reveal", 30, "1 reel + 5 stories", 155000,
                                   "3 qualified buyer enquiries")]),
        influencer(5, "StyleByAnaya", "@stylebyanaya", "fashion",
                   [{"platform": "instagram", "followers": 380000, "engagement_rate": 4.8}],
                   {"reel": 40000, "post": 22000, "story": 10000, "video": 75000}, "available",
                   collabs=[collab("cl-05a", "seed-client-05", "Festive Haul", 70, "1 haul reel + carousel", 62000,
                                   "Code ANAYA used 240 times")]),
        influencer(6, "PaisaTalks", "@paisatalks", "finance",
                   [{"platform": "youtube", "followers": 520000, "engagement_rate": 4.4},
                    {"platform": "instagram", "followers": 180000, "engagement_rate": 3.2}],
                   {"reel": 50000, "post": 28000, "story": 12000, "video": 150000}, "available"),
        influencer(7, "MumbaiEatsDaily", "@mumbaieatsdaily", "food",
                   [{"platform": "instagram", "followers": 150000, "engagement_rate": 5.6}],
                   {"reel": 18000, "post": 10000, "story": 5000, "video": 35000}, "available"),
        influencer(8, "WanderWithZoya", "@wanderwithzoya", "travel",
                   [{"platform": "instagram", "followers": 290000, "engagement_rate": 4.0},
                    {"platform": "youtube", "followers": 60000, "engagement_rate": 2.5}],
                   {"reel": 32000, "post": 18000, "story": 8000, "video": 65000}, "blacklisted"),
    ]


async def seed_v2():
    pw_hash = hash_password(PASSWORD)

    # 1) Email migration (idempotent — old emails vanish after first run)
    for old, new in EMAIL_MIGRATIONS.items():
        await db.users.update_one({"email": old}, {"$set": {"email": new}})
    # admin becomes super_admin
    await db.users.update_one({"email": "admin@dotindot.in"}, {"$set": {"role": "super_admin"}})
    await restore_seed_accounts(pw_hash)

    # 1b) Migrate legacy assigned_branches -> branch_assignments (staff role)
    legacy = await db.users.find({"assigned_branches.0": {"$exists": True},
                                  "branch_assignments": {"$exists": False}},
                                 {"_id": 0, "id": 1, "assigned_branches": 1}).to_list(500)
    for u in legacy:
        await db.users.update_one({"id": u["id"]}, {"$set": {
            "branch_assignments": [{"branch_id": b, "branch_role": "staff"} for b in u["assigned_branches"]]}})

    # 2) New v2 users (by canonical id — restore_seed_accounts guarantees uniqueness)
    for u in V2_USERS:
        await db.users.update_one(
            {"id": u["id"]},
            {"$setOnInsert": {**u, "is_active": True, "password_hash": pw_hash, "created_at": _now()}},
            upsert=True,
        )

    # 3) London branch + branch metadata upgrades
    await db.branches.update_one({"id": LONDON_BRANCH["id"]}, {"$setOnInsert": LONDON_BRANCH}, upsert=True)
    await db.branches.update_many({"status": {"$exists": False}}, {"$set": {"status": "active"}})

    # 4) Branch assignments (only where missing)
    for c in await db.clients.find({"branch_id": {"$exists": False}}, {"_id": 0, "id": 1, "city": 1}).to_list(1000):
        await db.clients.update_one({"id": c["id"]}, {"$set": {"branch_id": CITY_BRANCH.get(c.get("city"), DEFAULT_BRANCH)}})
    for u in await db.users.find({"branch_id": {"$exists": False}}, {"_id": 0, "id": 1, "city": 1}).to_list(300):
        await db.users.update_one({"id": u["id"]}, {"$set": {"branch_id": CITY_BRANCH.get(u.get("city"), DEFAULT_BRANCH)}})
    for l in await db.leads.find({"branch_id": {"$exists": False}}, {"_id": 0, "id": 1, "city": 1}).to_list(1000):
        await db.leads.update_one({"id": l["id"]}, {"$set": {"branch_id": CITY_BRANCH.get(l.get("city"), DEFAULT_BRANCH)}})
    await db.assets.update_many({"branch_id": {"$exists": False}}, {"$set": {"branch_id": DEFAULT_BRANCH}})

    # 5) Seed data
    for a in get_assets():
        await db.assets.update_one({"id": a["id"]}, {"$setOnInsert": a}, upsert=True)
    for c in get_campaigns():
        await db.ad_campaigns.update_one({"id": c["id"]}, {"$setOnInsert": c}, upsert=True)
    for p in get_social_posts():
        await db.social_posts.update_one({"id": p["id"]}, {"$setOnInsert": p}, upsert=True)
    for i in get_influencers():
        await db.influencers.update_one({"id": i["id"]}, {"$setOnInsert": i}, upsert=True)
