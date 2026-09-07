"""Phase 4 idempotent seed: employee profiles, training, partnerships, branches, aged logs."""
from datetime import datetime, timezone, timedelta
from database import db
from auth import hash_password
from seed import PASSWORD, U

NEW_U = {
    "designer": "user-designer",
    "dev": "user-dev",
    "marketing": "user-marketing",
}

NEW_USERS = [
    {"id": NEW_U["designer"], "name": "Ananya Verma", "email": "designer@dotindot.com", "role": "employee"},
    {"id": NEW_U["dev"], "name": "Dev Malhotra", "email": "dev@dotindot.com", "role": "employee"},
    {"id": NEW_U["marketing"], "name": "Fatima Khan", "email": "marketing@dotindot.com", "role": "employee"},
]

# Profile enrichment keyed by email — applied only if profile not yet set (designation absent)
PROFILES = {
    "admin@dotindot.com": {"designation": "Founder & CEO", "department": "Leadership", "city": "Mumbai",
                           "phone": "+91 98200 00001", "join_date": "2021-04-01",
                           "skills": ["Strategy", "AI Consulting", "Growth"],
                           "bio": "Founded dotindot to build AI-first digital experiences for ambitious brands."},
    "finance@dotindot.com": {"designation": "Finance Manager", "department": "Finance", "city": "Mumbai",
                             "phone": "+91 98200 00002", "join_date": "2022-06-15",
                             "skills": ["Accounting", "Budgeting", "GST Compliance"],
                             "bio": "Keeps the books clean and the margins healthy."},
    "sales@dotindot.com": {"designation": "Sales Lead", "department": "Sales", "city": "New Delhi",
                           "phone": "+91 98110 00003", "join_date": "2022-01-10",
                           "skills": ["B2B Sales", "Negotiation", "CRM"],
                           "bio": "Owns the pipeline from first call to signed contract."},
    "pm@dotindot.com": {"designation": "Senior Project Manager", "department": "Delivery", "city": "Bengaluru",
                        "phone": "+91 99450 00004", "join_date": "2021-11-01",
                        "skills": ["Agile Delivery", "Client Management", "Scoping"],
                        "bio": "Ships projects on time across web, marketing and AI engagements."},
    "employee@dotindot.com": {"designation": "Full-stack Developer", "department": "Engineering", "city": "Pune",
                              "phone": "+91 98220 00005", "join_date": "2023-03-20",
                              "skills": ["React", "FastAPI", "MongoDB"],
                              "bio": "Builds portals, dashboards and everything in between."},
    "designer@dotindot.com": {"designation": "UI/UX Designer", "department": "Design", "city": "Pune",
                              "phone": "+91 98220 00006", "join_date": "2023-08-01",
                              "skills": ["Figma", "Design Systems", "Motion"],
                              "bio": "Designs interfaces people actually enjoy using."},
    "dev@dotindot.com": {"designation": "AI Engineer", "department": "Engineering", "city": "Bengaluru",
                         "phone": "+91 99450 00007", "join_date": "2024-02-12",
                         "skills": ["LLMs", "RAG Pipelines", "Python"],
                         "bio": "Turns LLMs into production-grade client solutions."},
    "marketing@dotindot.com": {"designation": "Performance Marketer", "department": "Marketing", "city": "Dubai",
                               "phone": "+971 50 000 0008", "join_date": "2024-06-01",
                               "skills": ["Meta Ads", "Google Ads", "Analytics"],
                               "bio": "Runs paid growth for our retainer clients across GCC and India."},
}

COURSES = [
    {"id": "seed-course-01", "title": "Prompt Engineering & LLM Workflows", "category": "AI",
     "provider": "dotindot Academy", "duration_hours": 8, "link": "https://academy.dotindot.com/llm-workflows",
     "description": "Practical prompt design, RAG basics and agentic workflows for client projects."},
    {"id": "seed-course-02", "title": "Meta & Google Ads Mastery", "category": "Marketing",
     "provider": "Coursera", "duration_hours": 12, "link": "https://coursera.org/meta-google-ads",
     "description": "Campaign structure, bidding strategies and creative testing at scale."},
    {"id": "seed-course-03", "title": "Advanced React & Design Systems", "category": "Engineering",
     "provider": "Frontend Masters", "duration_hours": 16, "link": "https://frontendmasters.com/react-design-systems",
     "description": "Component architecture, performance and building scalable design systems."},
    {"id": "seed-course-04", "title": "Client Communication & Account Growth", "category": "Soft Skills",
     "provider": "Internal", "duration_hours": 6, "link": "https://drive.google.com/dotindot-account-growth",
     "description": "Running reviews, handling escalations and spotting upsell moments."},
    {"id": "seed-course-05", "title": "SEO & Content Strategy 2026", "category": "Marketing",
     "provider": "HubSpot Academy", "duration_hours": 10, "link": "https://academy.hubspot.com/seo-2026",
     "description": "Modern SEO: AI-search optimisation, topical authority and content ops."},
]


def _now():
    return datetime.now(timezone.utc).isoformat()


def d(days: int) -> str:
    return (datetime.now(timezone.utc).date() + timedelta(days=days)).isoformat()


def ts(days_ago: int, hour: int = 10) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days_ago)).replace(hour=hour, minute=15, second=0, microsecond=0).isoformat()


def assignment(i, user_id, course_id, status, progress, assigned_days_ago, due_days=None, completed_days_ago=None):
    return {
        "id": f"seed-ta-{i:02d}", "user_id": user_id, "course_id": course_id,
        "status": status, "progress": progress, "due_date": d(due_days) if due_days is not None else None,
        "assigned_by": U["admin"], "assigned_at": ts(assigned_days_ago),
        "completed_at": ts(completed_days_ago) if completed_days_ago is not None else None,
    }


def benefit(bid, title, credit_value, used, note="", used_days_ago=None):
    return {"id": bid, "title": title, "credit_value": credit_value, "used": used,
            "used_at": ts(used_days_ago) if used_days_ago is not None else None, "note": note}


def partnership(i, **kw):
    base = {"id": f"seed-partner-{i:02d}", "currency": "INR", "status": "active", "notes": "",
            "website": "", "contact_name": "", "contact_email": "", "benefits": [],
            "created_at": _now(), "updated_at": _now(), "created_by": U["admin"]}
    base.update(kw)
    return base


def get_partnerships():
    return [
        partnership(1, name="Google Partner Program", partner_type="program", category="Advertising",
                    cost=0, billing_cycle="yearly", renewal_date=d(35),
                    contact_name="Partner Support", contact_email="partners@google.com", website="https://www.google.com/partners",
                    benefits=[
                        benefit("bn-01a", "Google Ads promotional credits", 20000, False, "New-client ad credits, unused this cycle"),
                        benefit("bn-01b", "Partner badge & directory listing", 0, True, "Displayed on website", 120),
                    ],
                    notes="Certification renewal due soon — 2 team members must re-certify."),
        partnership(2, name="Meta Business Partner", partner_type="program", category="Advertising",
                    cost=0, billing_cycle="yearly", renewal_date=d(200),
                    contact_name="Meta Partner Desk", contact_email="partners@meta.com", website="https://www.facebook.com/business/partners",
                    benefits=[
                        benefit("bn-02a", "Meta ad credits for client onboarding", 50000, False, "₹50k credits expiring with cycle"),
                        benefit("bn-02b", "Priority ad-account support", 0, True, "Used monthly for MediCare account", 20),
                    ],
                    notes="Maintain spend threshold to keep partner tier."),
        partnership(3, name="AWS Activate", partner_type="platform", category="Cloud",
                    cost=0, billing_cycle="yearly", renewal_date=d(300),
                    contact_name="AWS Startups", contact_email="activate@aws.com", website="https://aws.amazon.com/activate",
                    benefits=[
                        benefit("bn-03a", "AWS infrastructure credits", 80000, False, "Use for FinEdge & Desert Pearl hosting"),
                        benefit("bn-03b", "Business support plan credit", 12000, False, "Not yet activated"),
                    ],
                    notes="Credits expire at cycle end — allocate to client infra."),
        partnership(4, name="Shopify Partner", partner_type="platform", category="E-commerce",
                    cost=24000, billing_cycle="yearly", renewal_date=d(45),
                    contact_name="Partner Success", contact_email="partners@shopify.com", website="https://www.shopify.com/partners",
                    benefits=[
                        benefit("bn-04a", "Unlimited development stores", 0, True, "Used for UrbanKart builds", 60),
                        benefit("bn-04b", "Revenue share on referred plans", 0, True, "Active on 2 client stores", 90),
                    ],
                    notes="Renewal in <60 days. Evaluate Plus partner upgrade."),
        partnership(5, name="GoDaddy Pro", partner_type="vendor", category="Domains & Hosting",
                    cost=15000, billing_cycle="yearly", renewal_date=d(150),
                    contact_name="Pro Support", contact_email="pro@godaddy.com", website="https://www.godaddy.com/pro",
                    benefits=[
                        benefit("bn-05a", "30% discount on client domains", 0, True, "Applied to all client renewals", 15),
                        benefit("bn-05b", "Bulk hosting management console", 0, True, "In daily use", 200),
                    ],
                    notes="Covers domain/hosting management for 8 client accounts."),
        partnership(6, name="NASSCOM Membership", partner_type="membership", category="Industry Body",
                    cost=50000, billing_cycle="yearly", renewal_date=d(250),
                    contact_name="Membership Desk", contact_email="membership@nasscom.in", website="https://nasscom.in",
                    benefits=[
                        benefit("bn-06a", "Event & summit passes", 15000, False, "2 passes for AI Summit unused"),
                        benefit("bn-06b", "Startup showcase slot", 8000, False, "Q4 showcase not yet booked"),
                    ],
                    notes="Good for enterprise networking and credibility."),
    ]


BRANCHES = [
    {"id": "seed-branch-01", "name": "Mumbai HQ", "city": "Mumbai", "country": "India",
     "address": "4th Floor, Trade Star, Andheri East, Mumbai 400059", "head_name": "Arjun Mehta", "established": "2021-04-01"},
    {"id": "seed-branch-02", "name": "Dubai Branch", "city": "Dubai", "country": "UAE",
     "address": "Office 1204, Bay Square, Business Bay, Dubai", "head_name": "Fatima Khan", "established": "2024-06-01"},
]


def get_assignments():
    return [
        assignment(1, U["employee"], "seed-course-03", "completed", 100, 80, None, 30),
        assignment(2, U["employee"], "seed-course-01", "in_progress", 60, 25, 20),
        assignment(3, NEW_U["designer"], "seed-course-03", "in_progress", 40, 30, 25),
        assignment(4, NEW_U["designer"], "seed-course-04", "assigned", 0, 10, 35),
        assignment(5, NEW_U["dev"], "seed-course-01", "completed", 100, 60, None, 12),
        assignment(6, NEW_U["dev"], "seed-course-03", "in_progress", 70, 20, 30),
        assignment(7, NEW_U["marketing"], "seed-course-02", "completed", 100, 90, None, 40),
        assignment(8, NEW_U["marketing"], "seed-course-05", "in_progress", 50, 15, 30),
        assignment(9, U["sales"], "seed-course-04", "completed", 100, 70, None, 35),
        assignment(10, U["pm"], "seed-course-01", "assigned", 0, 5, 40),
    ]


def old_log(i, days_ago, user_key, action, entity_type, entity_name, name, email, role):
    return {
        "id": f"seed-oldlog-{i:02d}", "user_id": user_key, "user_email": email, "user_name": name,
        "role": role, "action": action, "entity_type": entity_type, "entity_id": f"seed-entity-{i:02d}",
        "entity_name": entity_name, "timestamp": ts(days_ago),
    }


def get_old_logs():
    adm = ("Arjun Mehta", "admin@dotindot.com", "admin")
    pm = ("Sneha Iyer", "pm@dotindot.com", "pm")
    sal = ("Rohan Kapoor", "sales@dotindot.com", "sales")
    fin = ("Priya Sharma", "finance@dotindot.com", "finance")
    return [
        old_log(1, 185, U["admin"], "login", None, None, *adm),
        old_log(2, 170, U["pm"], "client_created", "client", "GreenLeaf Organics", *pm),
        old_log(3, 160, U["sales"], "login", None, None, *sal),
        old_log(4, 150, U["pm"], "project_created", "project", "GreenLeaf Festive Campaign", *pm),
        old_log(5, 140, U["finance"], "login", None, None, *fin),
        old_log(6, 130, U["admin"], "client_updated", "client", "Nova Dental Studio", *adm),
        old_log(7, 120, U["sales"], "lead_created", "lead", "Old Textile Lead", *sal),
        old_log(8, 110, U["pm"], "project_updated", "project", "Spice Route Website & Menu", *pm),
        old_log(9, 100, U["admin"], "login", None, None, *adm),
        old_log(10, 95, U["finance"], "transaction_created", "transaction", "Old invoice payment", *fin),
        # A few mid-age logs (must survive the 90-day purge)
        old_log(11, 75, U["admin"], "login", None, None, *adm),
        old_log(12, 45, U["pm"], "project_updated", "project", "FinEdge AI Advisory Chatbot", *pm),
        old_log(13, 20, U["sales"], "login", None, None, *sal),
    ]


async def seed_phase4():
    pw_hash = hash_password(PASSWORD)
    for u in NEW_USERS:
        await db.users.update_one(
            {"email": u["email"]},
            {"$setOnInsert": {**u, "is_active": True, "password_hash": pw_hash, "created_at": _now()}},
            upsert=True,
        )
    # Enrich profiles only where profile fields not yet set (won't clobber user edits)
    for email, prof in PROFILES.items():
        await db.users.update_one({"email": email, "designation": {"$exists": False}}, {"$set": prof})

    for c in COURSES:
        await db.training_courses.update_one({"id": c["id"]}, {"$setOnInsert": {**c, "created_at": _now(), "created_by": U["admin"]}}, upsert=True)
    for a in get_assignments():
        await db.training_assignments.update_one({"id": a["id"]}, {"$setOnInsert": a}, upsert=True)
    for p in get_partnerships():
        await db.partnerships.update_one({"id": p["id"]}, {"$setOnInsert": p}, upsert=True)
    for b in BRANCHES:
        await db.branches.update_one({"id": b["id"]}, {"$setOnInsert": b}, upsert=True)

    # Aged logs: inserted once, guarded by a flag so a purge isn't undone by restarts
    if not await db.seed_flags.find_one({"key": "phase4_old_logs"}):
        for lg in get_old_logs():
            await db.activity_logs.update_one({"id": lg["id"]}, {"$setOnInsert": lg}, upsert=True)
        await db.seed_flags.insert_one({"key": "phase4_old_logs", "done": True, "at": _now()})
