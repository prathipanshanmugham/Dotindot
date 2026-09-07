"""Phase 3 sales seed — idempotent ($setOnInsert, fixed ids). Leads, activities, quotes, targets."""
from datetime import datetime, timezone, timedelta
from database import db

U = {"admin": "user-admin", "sales": "user-sales"}


def _now():
    return datetime.now(timezone.utc).isoformat()


def d(days: int) -> str:
    return (datetime.now(timezone.utc).date() + timedelta(days=days)).isoformat()


def hist(*entries):
    """entries: (stage, iso_date)"""
    return [{"stage": s, "at": f"{dt}T10:00:00+00:00", "by": U["sales"]} for s, dt in entries]


def lead(n, name, company, stage, value, source, owner, region, city, service, history, follow_up=None,
         converted=None, email=None, phone=None, notes=""):
    return {
        "id": f"lead-{n:02d}", "name": name, "company": company,
        "contact_email": email or f"contact@{company.lower().replace(' ', '')[:12]}.com",
        "contact_phone": phone or f"+91 98{n:02d}0 11{n:02d}2",
        "source": source, "estimated_value": value, "service_interest": service,
        "stage": stage, "owner_id": owner, "region": region, "city": city,
        "notes": notes, "follow_up_date": follow_up, "currency": "INR",
        "stage_history": history, "converted_client_id": converted,
        "created_at": history[0]["at"], "updated_at": history[-1]["at"], "created_by": owner,
    }


def get_leads():
    s, a = U["sales"], U["admin"]
    return [
        # NEW (3)
        lead(1, "Aroma Spice Exports", "Aroma Spice Exports Pvt Ltd", "new", 350000, "website", s, "India", "Kochi",
             "E-commerce website", hist(("new", d(-4))), follow_up=d(-2), notes="Inbound demo request; wants Shopify store."),
        lead(2, "Zen Yoga Collective", "Zen Yoga Collective", "new", 180000, "referral", s, "India", "Rishikesh",
             "Brand + website", hist(("new", d(-2))), follow_up=d(0), notes="Referred by Bombay Brew founder."),
        lead(3, "Marina Bay Interiors", "Marina Bay Interiors LLC", "new", 900000, "linkedin", a, "UAE", "Dubai",
             "Marketing retainer", hist(("new", d(-1)))),
        # CONTACTED (3)
        lead(4, "Pixel Park Gaming Cafe", "Pixel Park", "contacted", 250000, "ads", s, "India", "Bengaluru",
             "Social media retainer", hist(("new", d(-12)), ("contacted", d(-8))), follow_up=d(3)),
        lead(5, "TrueNorth Logistics", "TrueNorth Logistics Ltd", "contacted", 1200000, "cold_outreach", s, "India", "Gurugram",
             "AI ops automation", hist(("new", d(-20)), ("contacted", d(-14)))),
        lead(6, "Casa Verde Cafes", "Casa Verde Hospitality", "contacted", 300000, "event", a, "India", "Goa",
             "Website + booking system", hist(("new", d(-16)), ("contacted", d(-10))), follow_up=d(5)),
        # QUALIFIED (3)
        lead(7, "Helix Diagnostics", "Helix Diagnostics Labs", "qualified", 850000, "referral", s, "India", "Chennai",
             "Patient portal (web dev)", hist(("new", d(-35)), ("contacted", d(-28)), ("qualified", d(-18))), follow_up=d(-5),
             notes="Budget confirmed; awaiting technical scoping call."),
        lead(8, "Crown & Anchor Pubs", "Crown & Anchor Group", "qualified", 700000, "linkedin", s, "UK", "Manchester",
             "Marketing + web", hist(("new", d(-30)), ("contacted", d(-24)), ("qualified", d(-12)))),
        lead(9, "SwiftPay Wallet", "SwiftPay Fintech", "qualified", 1800000, "website", a, "India", "Mumbai",
             "AI chatbot + dashboard", hist(("new", d(-40)), ("contacted", d(-33)), ("qualified", d(-20))), follow_up=d(6)),
        # PROPOSAL (2)
        lead(10, "Orchid Grand Hotels", "Orchid Grand Hospitality", "proposal", 1400000, "referral", s, "India", "Jaipur",
             "Booking engine + marketing", hist(("new", d(-50)), ("contacted", d(-42)), ("qualified", d(-30)), ("proposal", d(-10))), follow_up=d(1)),
        lead(11, "NorthStar EdTech", "NorthStar Learning", "proposal", 950000, "ads", s, "India", "Pune",
             "LMS website + campaigns", hist(("new", d(-45)), ("contacted", d(-38)), ("qualified", d(-25)), ("proposal", d(-7))), follow_up=d(2)),
        # WON (4) — 2 converted to seeded clients
        lead(12, "Desert Pearl Properties", "Desert Pearl Properties LLC", "won", 1500000, "linkedin", s, "UAE", "Dubai",
             "Luxury listings portal", hist(("new", "2026-04-10"), ("contacted", "2026-04-16"), ("qualified", "2026-04-26"), ("proposal", "2026-05-06"), ("won", "2026-05-18")),
             converted="seed-client-06", notes="Converted — flagship Dubai win."),
        lead(13, "ThamesTech Solutions", "ThamesTech Solutions Ltd", "won", 1200000, "referral", s, "UK", "London",
             "AI automation retainer", hist(("new", "2026-05-20"), ("contacted", "2026-05-27"), ("qualified", "2026-06-10"), ("proposal", "2026-06-24"), ("won", "2026-07-08")),
             converted="seed-client-07", notes="Converted — retainer signed."),
        lead(14, "Lotus Wellness Resort", "Lotus Wellness Resorts", "won", 650000, "event", s, "India", "Udaipur",
             "Resort website + SEO", hist(("new", "2026-07-15"), ("contacted", "2026-07-22"), ("qualified", "2026-08-05"), ("proposal", "2026-08-20"), ("won", "2026-09-03")),
             notes="Won at wedding-industry expo. Convert once advance received."),
        lead(15, "Nexbank NBFC", "Nexbank Financial Services", "won", 900000, "cold_outreach", a, "India", "Mumbai",
             "Compliance-safe AI assistant", hist(("new", "2026-07-01"), ("contacted", "2026-07-10"), ("qualified", "2026-08-01"), ("proposal", "2026-08-18"), ("won", "2026-09-05")),
             notes="CEO-sourced deal. Kickoff pending."),
        # LOST (3)
        lead(16, "Budget Motors Used Cars", "Budget Motors", "lost", 200000, "ads", s, "India", "Delhi",
             "Listings website", hist(("new", "2026-05-05"), ("contacted", "2026-05-12"), ("lost", "2026-06-02")), notes="Went with cheaper freelancer."),
        lead(17, "Peak Fitness Chain", "Peak Fitness", "lost", 450000, "website", s, "India", "Hyderabad",
             "App + marketing", hist(("new", "2026-06-10"), ("contacted", "2026-06-18"), ("qualified", "2026-07-01"), ("lost", "2026-08-05")), notes="Budget freeze."),
        lead(18, "GlobalMart Wholesale", "GlobalMart Trading", "lost", 1100000, "cold_outreach", a, "UAE", "Sharjah",
             "B2B portal", hist(("new", "2026-04-20"), ("contacted", "2026-05-02"), ("qualified", "2026-05-20"), ("proposal", "2026-06-10"), ("lost", "2026-07-15")), notes="Chose local agency."),
    ]


ACTIVITIES = [
    # (lead_no, act_no, kind, days_ago, text, follow_up)
    (1, 1, "email", -3, "Sent intro deck and Shopify portfolio.", None),
    (1, 2, "call", -2, "Spoke to founder; wants call next week.", d(-2)),
    (4, 1, "call", -8, "Intro call done. Interested in reels-first retainer.", d(3)),
    (5, 1, "email", -14, "Cold email opened 4x; sent AI ops case study.", None),
    (7, 1, "meeting", -18, "Scoping meeting with lab director. Budget ₹8-9L confirmed.", d(-5)),
    (7, 2, "note", -15, "Needs HL7 integration — loop in engineering for estimate.", None),
    (9, 1, "meeting", -20, "Demoed FinEdge chatbot. Strong interest from CTO.", d(6)),
    (10, 1, "email", -10, "Proposal QTN-2026-003 sent. Follow up after GM review.", d(1)),
    (11, 1, "call", -7, "Sent proposal; negotiating campaign budget split.", d(2)),
    (12, 1, "note", -120, "Won! Handover to PM team completed; converted to client.", None),
    (14, 1, "call", -4, "Advance invoice shared. Convert on receipt.", None),
]

QUOTES = [
    # (n, number, title, lead_no|None, client_id|None, items, gst, validity_days, status, notes)
    (1, "QTN-2026-001", "Luxury Listings Portal — Desert Pearl", 12, None,
     [("Portal design & build", 1, 1100000), ("Virtual tour module", 1, 250000), ("Arabic localisation", 1, 150000)],
     False, -100, "accepted", "Accepted 2026-05; delivered as seed-project-10."),
    (2, "QTN-2026-002", "AI Automation Retainer — ThamesTech", 13, None,
     [("Support triage automation", 1, 800000), ("Quarterly optimisation retainer", 4, 100000)],
     False, -60, "accepted", "Accepted 2026-07."),
    (3, "QTN-2026-003", "Booking Engine + Growth — Orchid Grand", 10, None,
     [("Booking engine build", 1, 850000), ("Performance marketing setup", 1, 300000), ("Content pack", 10, 25000)],
     True, 20, "sent", "Awaiting GM sign-off."),
    (4, "QTN-2026-004", "LMS Website + Campaigns — NorthStar", 11, None,
     [("LMS website", 1, 600000), ("Ad campaigns (3 months)", 3, 100000)],
     True, 15, "sent", ""),
    (5, "QTN-2026-005", "Patient Portal — Helix Diagnostics", 7, None,
     [("Patient portal MVP", 1, 700000), ("HL7 integration", 1, 150000)],
     True, 30, "draft", "Pending engineering estimate for HL7."),
    (6, "QTN-2026-006", "FY27 Web Retainer Renewal — Skyline", None, "seed-client-01",
     [("Annual web retainer FY27", 12, 75000)],
     True, 25, "draft", "Renewal proposal for expiring contract."),
    (7, "QTN-2026-007", "Listings Website — Budget Motors", 16, None,
     [("Listings website", 1, 180000)],
     True, -45, "rejected", "Lost to freelancer on price."),
    (8, "QTN-2026-008", "Marketing + Web — Crown & Anchor", 8, None,
     [("Website refresh", 1, 350000), ("Monthly marketing retainer", 6, 60000)],
     False, -8, "sent", "Validity lapsed — needs re-issue."),
]

TARGETS = []


def get_targets():
    t = datetime.now(timezone.utc).date()
    month = t.isoformat()[:7]
    quarter = f"{t.year}-Q{(t.month - 1) // 3 + 1}"
    return [
        {"id": "sales-target-01", "scope": "user", "user_id": U["sales"], "period": month, "amount": 600000},
        {"id": "sales-target-02", "scope": "team", "user_id": None, "period": month, "amount": 2500000},
        {"id": "sales-target-03", "scope": "user", "user_id": U["sales"], "period": quarter, "amount": 2000000},
        {"id": "sales-target-04", "scope": "team", "user_id": None, "period": quarter, "amount": 3000000},
    ]


async def seed_sales():
    for l in get_leads():
        await db.leads.update_one({"id": l["id"]}, {"$setOnInsert": l}, upsert=True)

    for lead_no, act_no, kind, days_ago, text, follow_up in ACTIVITIES:
        aid = f"lead-{lead_no:02d}-act-{act_no}"
        doc = {"id": aid, "lead_id": f"lead-{lead_no:02d}", "kind": kind, "text": text,
               "date": d(days_ago), "follow_up_date": follow_up,
               "created_by": U["sales"], "created_at": _now()}
        await db.lead_activities.update_one({"id": aid}, {"$setOnInsert": doc}, upsert=True)

    for n, number, title, lead_no, client_id, items, gst, validity_days, status, notes in QUOTES:
        qid = f"sales-quote-{n:02d}"
        norm = [{"description": desc, "qty": qty, "unit_price": price, "total": round(qty * price, 2)}
                for desc, qty, price in items]
        subtotal = round(sum(x["total"] for x in norm), 2)
        gst_amount = round(subtotal * 0.18, 2) if gst else 0.0
        doc = {
            "id": qid, "number": number, "title": title,
            "lead_id": f"lead-{lead_no:02d}" if lead_no else None, "client_id": client_id,
            "items": norm, "subtotal": subtotal, "gst_enabled": gst, "gst_amount": gst_amount,
            "total": round(subtotal + gst_amount, 2), "validity_date": d(validity_days),
            "status": status, "notes": notes, "currency": "INR",
            "created_by": U["sales"], "created_at": _now(), "updated_at": _now(),
        }
        await db.quotes.update_one({"id": qid}, {"$setOnInsert": doc}, upsert=True)

    year = datetime.now(timezone.utc).year
    await db.counters.update_one({"_id": f"quotes-{year}"}, {"$max": {"seq": 8}}, upsert=True)

    for t in get_targets():
        doc = {**t, "currency": "INR", "created_by": U["admin"], "created_at": _now()}
        await db.targets.update_one({"id": t["id"]}, {"$setOnInsert": doc}, upsert=True)
