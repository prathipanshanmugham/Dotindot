"""Idempotent seed script — runs at startup. Uses $setOnInsert so re-runs never overwrite live edits."""
from datetime import datetime, timezone, timedelta
from database import db
from auth import hash_password, encrypt_secret

PASSWORD = "Dotindot@2026"

U = {
    "admin": "user-admin",
    "finance": "user-finance",
    "sales": "user-sales",
    "pm": "user-pm",
    "employee": "user-employee",
}

USERS = [
    {"id": U["admin"], "name": "Arjun Mehta", "email": "admin@dotindot.com", "role": "admin"},
    {"id": U["finance"], "name": "Priya Sharma", "email": "finance@dotindot.com", "role": "finance"},
    {"id": U["sales"], "name": "Rohan Kapoor", "email": "sales@dotindot.com", "role": "sales"},
    {"id": U["pm"], "name": "Sneha Iyer", "email": "pm@dotindot.com", "role": "pm"},
    {"id": U["employee"], "name": "Karan Patel", "email": "employee@dotindot.com", "role": "employee"},
]


def _now():
    return datetime.now(timezone.utc).isoformat()


def d(days: int) -> str:
    return (datetime.now(timezone.utc).date() + timedelta(days=days)).isoformat()


def contact(name, email, phone, role):
    return {"name": name, "email": email, "phone": phone, "role": role}


def contract(cid, title, value, start_days, expiry_days, note=""):
    return {"id": cid, "title": title, "value": value, "currency": "INR",
            "start_date": d(start_days), "expiry_date": d(expiry_days),
            "file_link": "https://drive.google.com/file/d/contract-" + cid, "note": note}


def cred(cid, label, username, secret):
    return {"id": cid, "label": label, "username": username, "secret_encrypted": encrypt_secret(secret)}


def client(i, **kw):
    base = {
        "id": f"seed-client-{i:02d}",
        "currency": "INR",
        "notes": "",
        "google_drive_link": f"https://drive.google.com/drive/folders/dotindot-client-{i:02d}",
        "domain_hosting": None,
        "contacts": [],
        "contracts": [],
        "credentials": [],
        "created_at": _now(),
        "updated_at": _now(),
        "created_by": U["admin"],
    }
    base.update(kw)
    return base


def get_clients():
    return [
        client(1, name="Skyline Realty", company="Skyline Realty Pvt Ltd", industry="real-estate",
               service_type="web_dev", size="mid", status="active", retainer=True,
               region="India", city="Mumbai",
               contacts=[contact("Vikram Singhania", "vikram@skylinerealty.in", "+91 98200 11223", "Managing Director"),
                         contact("Anita Rao", "anita@skylinerealty.in", "+91 98200 44556", "Marketing Head")],
               domain_hosting={"registrar": "GoDaddy", "domain_expiry": d(210), "host": "AWS Lightsail", "hosting_expiry": d(180)},
               contracts=[contract("ct-01a", "Annual Web Retainer FY26", 840000, -330, 18, "Renewal discussion pending")],
               credentials=[cred("cr-01a", "WordPress Admin", "skyline_admin", "Sk!Line#Wp2026"),
                            cred("cr-01b", "cPanel Hosting", "skylinehost", "cP@nel$sky99")],
               notes="Flagship real-estate client. Prefers WhatsApp updates. Renewal talk needed before contract expiry."),
        client(2, name="MediCare Plus", company="MediCare Plus Hospitals", industry="healthcare",
               service_type="marketing", size="large", status="active", retainer=True,
               region="India", city="Bengaluru",
               contacts=[contact("Dr. Ramesh Nair", "ramesh@medicareplus.in", "+91 99450 22334", "CEO"),
                         contact("Divya Kulkarni", "divya@medicareplus.in", "+91 99450 66778", "Digital Manager")],
               domain_hosting={"registrar": "Namecheap", "domain_expiry": d(400), "host": "DigitalOcean", "hosting_expiry": d(365)},
               contracts=[contract("ct-02a", "Performance Marketing Retainer", 1800000, -180, 185)],
               credentials=[cred("cr-02a", "Google Ads Account", "ads@medicareplus.in", "GAds#Medi2026"),
                            cred("cr-02b", "Meta Business Suite", "meta@medicareplus.in", "MetaMedi@77")],
               notes="High-value healthcare retainer. Monthly performance reviews on 5th."),
        client(3, name="Spice Route Bistro", company="Spice Route Hospitality", industry="restaurant",
               service_type="one_off", size="small", status="active", retainer=False,
               region="India", city="New Delhi",
               contacts=[contact("Kabir Malhotra", "kabir@spiceroute.in", "+91 98110 33445", "Owner")],
               domain_hosting={"registrar": "GoDaddy", "domain_expiry": d(150), "host": "Hostinger", "hosting_expiry": d(150)},
               contracts=[contract("ct-03a", "Website + Menu System (One-off)", 175000, -60, 60)],
               credentials=[cred("cr-03a", "Zomato Partner", "spiceroute_zmt", "Zmt$Spice21")],
               notes="One-off build. Upsell opportunity: social media retainer."),
        client(4, name="FinEdge Capital", company="FinEdge Capital Advisors", industry="fintech",
               service_type="ai", size="large", status="active", retainer=True,
               region="India", city="Mumbai",
               contacts=[contact("Meera Desai", "meera@finedge.in", "+91 98670 55667", "CTO"),
                         contact("Sanjay Bhatt", "sanjay@finedge.in", "+91 98670 88990", "Product Lead")],
               domain_hosting={"registrar": "Cloudflare", "domain_expiry": d(500), "host": "AWS", "hosting_expiry": d(365)},
               contracts=[contract("ct-04a", "AI Advisory Chatbot Build + Support", 2400000, -90, 275)],
               credentials=[cred("cr-04a", "AWS Console (IAM)", "dotindot-dev", "aws#FinEdge!42"),
                            cred("cr-04b", "OpenAI Org", "dev@finedge.in", "sk-ref-vault-041")],
               notes="AI-first engagement. Strict security review process for all deploys."),
        client(5, name="UrbanKart", company="UrbanKart Retail Pvt Ltd", industry="e-commerce",
               service_type="marketing", size="mid", status="active", retainer=True,
               region="India", city="Pune",
               contacts=[contact("Neha Joshi", "neha@urbankart.in", "+91 98220 11224", "Founder"),
                         contact("Amit Verma", "amit@urbankart.in", "+91 98220 33447", "Ops Manager")],
               domain_hosting={"registrar": "GoDaddy", "domain_expiry": d(90), "host": "Shopify", "hosting_expiry": None},
               contracts=[contract("ct-05a", "E-commerce Growth Retainer", 960000, -340, 24, "Auto-renewal clause; confirm scope changes")],
               credentials=[cred("cr-05a", "Shopify Admin", "urbankart-admin", "Shop!Kart#88"),
                            cred("cr-05b", "Google Analytics", "ga@urbankart.in", "GA4urban$26")],
               notes="Contract expiring soon — renewal proposal in progress."),
        client(6, name="Desert Pearl Properties", company="Desert Pearl Properties LLC", industry="real-estate",
               service_type="web_dev", size="large", status="active", retainer=False,
               region="UAE", city="Dubai",
               contacts=[contact("Omar Al Farsi", "omar@desertpearl.ae", "+971 50 123 4567", "Director"),
                         contact("Layla Hassan", "layla@desertpearl.ae", "+971 50 765 4321", "Brand Manager")],
               domain_hosting={"registrar": "GoDaddy", "domain_expiry": d(300), "host": "AWS (me-south-1)", "hosting_expiry": d(300)},
               contracts=[contract("ct-06a", "Luxury Listings Portal", 1500000, -45, 135)],
               credentials=[cred("cr-06a", "Portal Admin", "dp_admin", "Pearl@Dxb#2026")],
               notes="International client (Dubai). Invoicing in INR for now; AED support later."),
        client(7, name="ThamesTech Solutions", company="ThamesTech Solutions Ltd", industry="saas",
               service_type="ai", size="mid", status="active", retainer=True,
               region="UK", city="London",
               contacts=[contact("James Whitfield", "james@thamestech.co.uk", "+44 7700 900123", "COO")],
               domain_hosting={"registrar": "Cloudflare", "domain_expiry": d(420), "host": "GCP", "hosting_expiry": d(365)},
               contracts=[contract("ct-07a", "AI Automation Retainer", 1200000, -120, 245)],
               credentials=[cred("cr-07a", "GCP Project", "dotindot-svc", "gcp#Thames!19")],
               notes="London-based SaaS. Weekly syncs Thursday 4pm IST."),
        client(8, name="GreenLeaf Organics", company="GreenLeaf Organics", industry="e-commerce",
               service_type="marketing", size="small", status="inactive", retainer=False,
               region="India", city="Jaipur",
               contacts=[contact("Pooja Agarwal", "pooja@greenleaf.in", "+91 94140 22335", "Founder")],
               domain_hosting={"registrar": "Namecheap", "domain_expiry": d(60), "host": "Hostinger", "hosting_expiry": d(60)},
               contracts=[contract("ct-08a", "Festive Campaign Sprint", 220000, -150, -60, "Completed; awaiting next brief")],
               credentials=[cred("cr-08a", "Instagram Business", "greenleaf.organics", "IG@leaf#2025")],
               notes="Paused after festive campaign. Re-engage in Q3."),
        client(9, name="Nova Dental Studio", company="Nova Dental Studio", industry="healthcare",
               service_type="one_off", size="small", status="churned", retainer=False,
               region="India", city="Hyderabad",
               contacts=[contact("Dr. Kavya Reddy", "kavya@novadental.in", "+91 90000 44556", "Owner")],
               domain_hosting={"registrar": "GoDaddy", "domain_expiry": d(-20), "host": "Shared", "hosting_expiry": d(-20)},
               contracts=[contract("ct-09a", "Clinic Website (One-off)", 90000, -400, -220)],
               credentials=[],
               notes="Churned — moved to in-house freelancer. Keep archived."),
        client(10, name="Bombay Brew Co", company="Bombay Brew Beverages", industry="restaurant",
               service_type="marketing", size="mid", status="active", retainer=True,
               region="India", city="Mumbai",
               contacts=[contact("Aditya Khanna", "aditya@bombaybrew.in", "+91 98200 77889", "Co-founder"),
                         contact("Ritika Shah", "ritika@bombaybrew.in", "+91 98200 99001", "Brand Lead")],
               domain_hosting={"registrar": "GoDaddy", "domain_expiry": d(250), "host": "Vercel", "hosting_expiry": None},
               contracts=[contract("ct-10a", "Social + Content Retainer", 540000, -200, 165)],
               credentials=[cred("cr-10a", "Instagram Business", "bombaybrewco", "Brew@Bom#77"),
                            cred("cr-10b", "Canva Team", "design@bombaybrew.in", "Canva$brew12")],
               notes="Great referral source. Runs quarterly offline events we cover."),
    ]


def ms(pid, i, title, due_days, done):
    return {"id": f"{pid}-m{i}", "title": title, "due_date": d(due_days), "done": done}


def dl(pid, i, item, done):
    return {"id": f"{pid}-d{i}", "item": item, "done": done}


def project(i, client_id, name, status, budget, start_days, end_days, team, description, location, milestones, deliverables):
    pid = f"seed-project-{i:02d}"
    return {
        "id": pid, "client_id": client_id, "name": name, "description": description,
        "status": status, "start_date": d(start_days), "end_date": d(end_days),
        "budget": budget, "currency": "INR",
        "milestones": [ms(pid, j + 1, *m) for j, m in enumerate(milestones)],
        "deliverables": [dl(pid, j + 1, *x) for j, x in enumerate(deliverables)],
        "team_member_ids": team, "location": location,
        "created_at": _now(), "updated_at": _now(), "created_by": U["admin"],
    }


def get_projects():
    pm, emp, sal, fin, adm = U["pm"], U["employee"], U["sales"], U["finance"], U["admin"]
    return [
        project(1, "seed-client-01", "Skyline Listings Portal Revamp", "in_progress", 650000, -40, 50,
                [pm, emp], "Full revamp of property listings portal with map search and CRM lead capture.", "Mumbai, India",
                [("Design sign-off", -20, True), ("Listings engine build", 10, False), ("UAT & launch", 45, False)],
                [("Figma designs", True), ("Listings module", False), ("Lead capture forms", False), ("SEO setup", False)]),
        project(2, "seed-client-01", "Skyline Monsoon Campaign Microsite", "completed", 120000, -120, -70,
                [emp], "Campaign microsite for monsoon offers with lead gen.", "Mumbai, India",
                [("Microsite live", -80, True)],
                [("Landing page", True), ("Ad creatives", True)]),
        project(3, "seed-client-02", "MediCare Performance Marketing Q3", "in_progress", 450000, -30, 60,
                [sal, emp], "Quarterly performance marketing: Google + Meta ads for 4 hospital units.", "Bengaluru, India",
                [("Campaign structure", -15, True), ("Mid-quarter review", 15, False), ("Q3 report", 58, False)],
                [("Ad account restructure", True), ("Creative batch 1", True), ("Creative batch 2", False), ("Landing pages x4", False)]),
        project(4, "seed-client-02", "Hospital Appointment Booking App", "review", 1400000, -100, 20,
                [pm, emp], "Patient-facing appointment booking web app integrated with HMS.", "Bengaluru, India",
                [("HMS integration", -30, True), ("Beta rollout", -5, True), ("Go-live", 18, False)],
                [("Booking flow", True), ("Doctor dashboard", True), ("SMS reminders", True), ("Analytics", False)]),
        project(5, "seed-client-03", "Spice Route Website & Menu", "completed", 175000, -60, -10,
                [emp], "Restaurant website with digital menu and reservations.", "New Delhi, India",
                [("Launch", -12, True)],
                [("Website", True), ("Digital menu", True), ("Reservation form", True)]),
        project(6, "seed-client-04", "FinEdge AI Advisory Chatbot", "in_progress", 1500000, -80, 70,
                [pm, emp], "LLM-powered financial advisory chatbot with compliance guardrails.", "Mumbai, India",
                [("Prototype demo", -40, True), ("Compliance review", 10, False), ("Production launch", 65, False)],
                [("Conversation design", True), ("RAG pipeline", True), ("Guardrails layer", False), ("Admin console", False)]),
        project(7, "seed-client-04", "FinEdge Data Dashboard", "kickoff", 600000, 5, 95,
                [pm], "Internal analytics dashboard for advisor performance.", "Mumbai, India",
                [("Requirements freeze", 15, False), ("V1 build", 60, False)],
                [("Data model", False), ("Dashboard UI", False)]),
        project(8, "seed-client-05", "UrbanKart Festive Growth Sprint", "in_progress", 350000, -20, 40,
                [sal, emp], "Festive-season growth sprint: ads, email flows, landing pages.", "Pune, India",
                [("Campaign launch", -5, True), ("Peak week ops", 25, False)],
                [("Email flows", True), ("Ad sets", True), ("Festive landing pages", False)]),
        project(9, "seed-client-05", "UrbanKart Loyalty Program Setup", "on_hold", 280000, -50, 30,
                [pm], "Loyalty points program on Shopify — on hold pending budget approval.", "Pune, India",
                [("Vendor selection", -30, True), ("Integration", 20, False)],
                [("Program design", True), ("Shopify integration", False)]),
        project(10, "seed-client-06", "Desert Pearl Luxury Portal", "in_progress", 1500000, -45, 75,
                [pm, emp], "Luxury property listings portal with virtual tours (Dubai market).", "Dubai, UAE",
                [("Design approval", -20, True), ("Virtual tour module", 20, False), ("Launch", 70, False)],
                [("Brand design", True), ("Listings CMS", False), ("Virtual tours", False), ("Arabic localisation", False)]),
        project(11, "seed-client-07", "ThamesTech Support Automation", "review", 800000, -90, 15,
                [pm, emp], "AI support-ticket triage and reply-draft automation.", "London, UK",
                [("Model evaluation", -50, True), ("Pilot with support team", -10, True), ("Full rollout", 14, False)],
                [("Triage classifier", True), ("Reply drafting", True), ("Analytics report", False)]),
        project(12, "seed-client-07", "ThamesTech Website Refresh", "kickoff", 320000, 10, 80,
                [emp], "Marketing site refresh with new positioning.", "London, UK",
                [("Wireframes", 25, False), ("Launch", 78, False)],
                [("Copywriting", False), ("New site build", False)]),
        project(13, "seed-client-08", "GreenLeaf Festive Campaign", "completed", 220000, -150, -60,
                [sal], "Festive social + influencer campaign for organic food brand.", "Jaipur, India",
                [("Campaign wrap", -65, True)],
                [("Influencer kit", True), ("Campaign report", True)]),
        project(14, "seed-client-10", "Bombay Brew Content Engine", "in_progress", 540000, -60, 120,
                [sal, emp], "Monthly content retainer: reels, statics, blog and events coverage.", "Mumbai, India",
                [("August content calendar", -10, True), ("September calendar", 20, False)],
                [("Reels batch Aug", True), ("Statics batch Aug", True), ("Blog articles", False), ("Event coverage", False)]),
        project(15, "seed-client-10", "Bombay Brew Website 2.0", "kickoff", 260000, 7, 90,
                [pm], "New brand website with store locator and events page.", "Mumbai, India",
                [("Moodboard", 14, False), ("Build", 60, False)],
                [("Design system", False), ("Store locator", False)]),
    ]


async def seed_database():
    pw_hash = hash_password(PASSWORD)
    for u in USERS:
        await db.users.update_one(
            {"email": u["email"]},
            {"$setOnInsert": {**u, "is_active": True, "password_hash": pw_hash, "created_at": _now()}},
            upsert=True,
        )
    for c in get_clients():
        await db.clients.update_one({"id": c["id"]}, {"$setOnInsert": c}, upsert=True)
    for p in get_projects():
        await db.projects.update_one({"id": p["id"]}, {"$setOnInsert": p}, upsert=True)
