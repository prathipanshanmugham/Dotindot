"""Optional demo data for v3.0 (support desk, lead flow, HR hub, payroll, loans, investors, AI tokens).
NOT run at startup — call seed_v30() manually on a demo/staging database. Idempotent (guarded by seed flag "v30").
All names, IDs and numbers below are made up for the demo."""
import hashlib
import random
import uuid
from datetime import date, datetime, timedelta, timezone
from database import db
from auth import encrypt_secret, hash_password

IST = timezone(timedelta(hours=5, minutes=30))
MUMBAI, DUBAI, LONDON = "seed-branch-01", "seed-branch-02", "seed-branch-03"
ERODE, COIMBATORE = "seed-branch-erode", "seed-branch-cbe"


def _iso(d):
    return d.isoformat() if isinstance(d, (date, datetime)) else d


def _ts(d: date, h=10, m=0):
    return datetime(d.year, d.month, d.day, h, m, tzinfo=IST).astimezone(timezone.utc).isoformat()


async def _flag(key):
    return bool(await db.seed_flags.find_one({"id": key}))


async def seed_v30():
    if await _flag("v30"):
        return
    rnd = random.Random(30)
    today = datetime.now(IST).date()
    now = datetime.now(timezone.utc).isoformat()
    users = {u["id"]: u for u in await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(200)}
    clients = await db.clients.find({}, {"_id": 0, "id": 1, "name": 1, "branch_id": 1}).to_list(100)
    cmap = {c["id"]: c for c in clients}

    # ---------------- branches: two Tamil Nadu offices (exact + city-centre pins) ----------------
    if not await db.branches.find_one({"id": ERODE}):
        await db.branches.insert_many([
            {"id": ERODE, "name": "Erode Office", "address": "Perundurai Road, Erode 638011", "city": "Erode", "state": "Tamil Nadu", "country": "India",
             "region": "South", "contact_phone": "", "contact_email": "erode@dotindot.in", "manager_id": "user-midhun", "head_name": "Midhun",
             "status": "active", "lat": 11.3374, "lng": 77.7060, "pin_source": "exact", "established": "2025-04-01", "created_at": now},
            {"id": COIMBATORE, "name": "Coimbatore Office", "address": "Avinashi Road, Coimbatore", "city": "Coimbatore", "state": "Tamil Nadu", "country": "India",
             "region": "South", "contact_phone": "", "contact_email": "cbe@dotindot.in", "manager_id": "user-midhun", "head_name": "Midhun",
             "status": "active", "lat": 11.0168, "lng": 76.9558, "pin_source": "city", "established": "2025-09-01", "created_at": now},
        ])

    # ---------------- HR records ----------------
    hr_seed = {
        "user-admin": ("DOT-001", "full_time", None, "1988-03-14", "Management", "Founder & CEO", "2023-01-02"),
        "user-midhun": ("DOT-002", "full_time", "user-admin", "1991-07-22", "Management", "CEO — Erode, Coimbatore & Chennai", "2023-06-01"),
        "user-finance": ("DOT-003", "full_time", "user-admin", "1990-11-05", "Finance", "Finance Manager", "2023-04-10"),
        "user-sales": ("DOT-004", "full_time", "user-midhun", "1994-01-19", "Sales", "Business Development Manager", "2023-08-01"),
        "user-pm": ("DOT-005", "full_time", "user-midhun", "1992-09-30", "Delivery", "Senior Project Manager", "2023-05-15"),
        "user-employee": ("DOT-006", "full_time", "user-pm", "1998-12-02", "Creative", "Content Strategist", "2024-02-01"),
        "user-designer": ("DOT-007", "full_time", "user-pm", "1997-11-18", "Creative", "Senior Designer", "2024-03-11"),
        "user-dev": ("DOT-008", "full_time", "user-pm", "1996-05-25", "Technology", "Full-stack Developer", "2024-01-08"),
        "user-marketing": ("DOT-009", "contract", "user-midhun", "1999-04-09", "Marketing", "Performance Marketer", "2025-07-01"),
        "user-ads": ("DOT-010", "full_time", "user-midhun", "1995-08-14", "Marketing", "Ads Manager", "2024-09-02"),
        "user-social": ("DOT-011", "full_time", "user-midhun", "1997-02-27", "Social Media", "Social Media Manager", "2025-01-06"),
    }
    blood = ["O+", "B+", "A+", "AB+", "O-", "B-"]
    first_names = ["Lakshmi", "Ravi", "Meena", "Suresh", "Divya", "Kumar", "Anitha", "Vijay", "Revathi", "Senthil", "Kavitha"]
    for i, (uid, (code, typ, mgr, dob, dept, desig, doj)) in enumerate(hr_seed.items()):
        u = users.get(uid)
        if not u:
            continue
        docs = [{"name": n, "status": ("verified" if (i + j) % 4 else "pending") if j < 6 else "received", "note": ""}
                for j, n in enumerate(["Offer letter (signed)", "ID proof", "Address proof", "PAN card", "Education certificates",
                                       "Previous employer relieving letter", "Bank details / cancelled cheque", "Passport-size photo"])]
        hr = {"employee_code": code, "employment_type": typ, "status": "active", "manager_id": mgr, "probation_end": "", "confirmation_date": "",
              "notice_period_days": 30 if typ == "full_time" else 15, "personal_email": f"{u['name'].split()[0].lower()}.personal@example.com",
              "date_of_birth": dob, "gender": "", "blood_group": blood[i % len(blood)], "marital_status": "",
              "address_current": f"{12 + i}, {['Gandhi Nagar', 'Anna Salai', 'RS Puram', 'Brough Road', 'Perundurai Road'][i % 5]}",
              "address_permanent": "", "emergency_contact": {"name": first_names[i % len(first_names)], "relation": ["Spouse", "Parent", "Sibling"][i % 3],
                                                             "phone": f"+91 98{40000000 + i * 1371:08d}"[:16]},
              "education": ["B.Com", "MBA", "B.E. Computer Science", "B.Des", "BBA", "M.Sc"][i % 6], "previous_employer": "",
              "documents": docs, "aadhaar_last4": f"{4100 + i * 37:04d}"[-4:], "bank_name": ["HDFC Bank", "ICICI Bank", "State Bank of India", "Axis Bank"][i % 4],
              "bank_ifsc": ["HDFC0001234", "ICIC0004321", "SBIN0007788", "UTIB0002211"][i % 4], "bank_account_holder": u["name"],
              "pan_enc": encrypt_secret(f"ABCPD{1234 + i:04d}{'FGHKLMNPQRS'[i]}"), "uan_enc": encrypt_secret(f"1012{34567800 + i:08d}"),
              "bank_account_enc": encrypt_secret(f"50100{1234567 + i * 11:07d}"), "updated_at": now}
        if uid == "user-marketing":
            hr["status"] = "probation"
            hr["probation_end"] = (today + timedelta(days=9)).isoformat()
        sets = {"hr": hr, "department": u.get("department") or dept, "designation": u.get("designation") or desig, "join_date": u.get("join_date") or doj}
        if uid in ("user-midhun", "user-ads", "user-social") and not u.get("branch_id"):
            sets["branch_id"] = ERODE
        await db.users.update_one({"id": uid}, {"$set": sets})

    # an HR manager (v3.0 role)
    if not await db.users.find_one({"id": "user-hr"}):
        await db.users.insert_one({
            "id": "user-hr", "name": "Lakshmi Narayanan", "email": "hr@dotindot.in", "password_hash": hash_password("Dotindot@2026"),
            "role": "hr", "is_active": True, "designation": "HR Manager", "department": "People & HR", "city": "Erode", "branch_id": ERODE,
            "join_date": (today - timedelta(days=420)).isoformat(), "skills": ["Payroll", "Recruitment", "Labour law"],
            "skill_levels": {"Payroll": 4, "Recruitment": 4, "Labour law": 3},
            "hr": {"employee_code": "DOT-011", "employment_type": "full_time", "status": "active", "manager_id": "user-admin", "notice_period_days": 60},
            "created_at": now})
        users["user-hr"] = {"id": "user-hr", "name": "Lakshmi Narayanan", "role": "hr"}

    # a new joiner (onboarding in progress)
    if not await db.users.find_one({"id": "user-newjoiner"}):
        jd = today - timedelta(days=3)
        await db.users.insert_one({
            "id": "user-newjoiner", "name": "Nithya Raman", "email": "nithya@dotindot.in", "password_hash": hash_password("Dotindot@2026"),
            "role": "employee", "is_active": True, "designation": "Junior Designer", "department": "Creative", "city": "Erode", "branch_id": ERODE,
            "join_date": jd.isoformat(), "skills": ["Figma", "Canva"], "skill_levels": {"Figma": 3, "Canva": 3},
            "hr": {"employee_code": "DOT-012", "employment_type": "full_time", "status": "probation", "manager_id": "user-pm",
                   "probation_end": (jd + timedelta(days=90)).isoformat(), "notice_period_days": 30, "date_of_birth": "2001-06-11",
                   "emergency_contact": {"name": "Raman K", "relation": "Parent", "phone": "+91 98430 11223"},
                   "documents": [{"name": n, "status": "received" if k < 3 else "pending", "note": ""} for k, n in enumerate(
                       ["Offer letter (signed)", "ID proof", "Address proof", "PAN card", "Education certificates", "Bank details / cancelled cheque"])]},
            "created_at": now})
        from routes_hr import DEFAULT_TEMPLATES, _tasks_from
        tasks = _tasks_from(DEFAULT_TEMPLATES["onboarding"], jd.isoformat(), {"manager": "user-pm", "buddy": "user-designer", "employee": "user-newjoiner",
                                                                              "it": "user-dev", "hr": "user-admin", "finance": "user-finance"})
        for t in tasks:
            if t["due_date"] <= today.isoformat() and t["owner_role"] != "manager":
                t.update({"done": True, "done_at": now, "done_by": "Arjun Mehta"})
        await db.hr_onboarding.insert_one({"id": "seed-onb-01", "user_id": "user-newjoiner", "user_name": "Nithya Raman", "start_date": jd.isoformat(),
                                           "manager_id": "user-pm", "buddy_id": "user-designer", "notes": "", "status": "in_progress", "tasks": tasks,
                                           "created_by": "user-admin", "created_at": now, "completed_at": None})
        await db.daily_reports.delete_many({"user_id": "user-newjoiner"})

    # someone leaving (offboarding in progress) + their KT handover
    if not await db.hr_offboarding.find_one({"id": "seed-off-01"}):
        lwd = today + timedelta(days=12)
        from routes_hr import DEFAULT_TEMPLATES, _tasks_from
        tasks = _tasks_from(DEFAULT_TEMPLATES["offboarding"], lwd.isoformat(), {"manager": "user-pm", "employee": "user-dev", "it": "user-admin",
                                                                                "hr": "user-admin", "finance": "user-finance"})
        for t in tasks[:2]:
            t.update({"done": True, "done_at": now, "done_by": "Arjun Mehta"})
        await db.hr_kt.insert_one({"id": "seed-kt-01", "from_id": "user-dev", "from_name": "Dev Malhotra", "to_ids": ["user-employee"], "to_names": ["Karan Patel"],
                                   "topic": "Handover from Dev Malhotra", "scope": "UrbanKart storefront, MediCare booking app, deployment scripts",
                                   "due_date": (lwd - timedelta(days=3)).isoformat(), "status": "in_progress",
                                   "items": [{"id": str(uuid.uuid4()), "title": t, "done": k < 2} for k, t in enumerate(
                                       ["UrbanKart storefront codebase & hosting", "MediCare booking app — release process", "Server / VPS logins → Password Manager",
                                        "Monthly SEO report automation", "Client WhatsApp groups & contacts"])],
                                   "sessions": [{"id": str(uuid.uuid4()), "date": (today - timedelta(days=2)).isoformat(), "duration_min": 90,
                                                 "notes": "Walked through the UrbanKart repo, CI and Hostinger deploy.", "recording_link": "", "logged_by": "Dev Malhotra"}],
                                   "docs": [{"id": str(uuid.uuid4()), "title": "UrbanKart runbook", "url": "https://drive.google.com/"}],
                                   "offboarding_id": "seed-off-01", "signed_off_by": None, "signed_off_at": None, "created_by": "user-admin", "created_at": now})
        assets = await db.assets.find({"assigned_to": "user-dev"}, {"_id": 0, "id": 1, "code": 1, "name": 1, "asset_type": 1}).to_list(20)
        await db.hr_offboarding.insert_one({"id": "seed-off-01", "user_id": "user-dev", "user_name": "Dev Malhotra", "type": "resignation",
                                            "notice_date": (today - timedelta(days=18)).isoformat(), "last_working_day": lwd.isoformat(),
                                            "reason": "Moving to a product company in Bengaluru", "handover_to_id": "user-employee", "status": "in_progress",
                                            "tasks": tasks, "assets": [{**a, "returned": False} for a in assets], "exit_interview": {"done": False, "notes": ""},
                                            "fnf": {"status": "pending", "amount": None, "note": ""}, "rehire_eligible": True, "kt_id": "seed-kt-01",
                                            "created_by": "user-admin", "created_at": now, "completed_at": None})
        await db.users.update_one({"id": "user-dev"}, {"$set": {"hr.status": "notice", "hr.exit_date": lwd.isoformat()}})

    # skills + plans
    levels = {
        "user-designer": {"Figma": 5, "Brand identity": 4, "Motion graphics": 3, "Canva": 4},
        "user-dev": {"React": 5, "Python": 4, "WordPress": 4, "Shopify": 3, "SEO (technical)": 3},
        "user-employee": {"Copywriting": 4, "SEO (content)": 3, "React": 2, "ChatGPT / Claude prompting": 4},
        "user-ads": {"Meta Ads": 5, "Google Ads": 4, "GA4 analytics": 3},
        "user-social": {"Instagram growth": 4, "Content calendar": 4, "Canva": 4, "Motion graphics": 2},
        "user-marketing": {"Meta Ads": 3, "Google Ads": 3, "Email marketing": 3},
        "user-sales": {"Consultative selling": 4, "Proposal writing": 4, "CRM hygiene": 3},
        "user-pm": {"Project planning": 5, "Client communication": 5, "Shopify": 2},
    }
    for uid, lv in levels.items():
        await db.users.update_one({"id": uid}, {"$set": {"skill_levels": lv, "skills": list(lv.keys())}})
    await db.settings.update_one({"id": "hr_skills"}, {"$set": {"id": "hr_skills", "skills": [
        "Meta Ads", "Google Ads", "GA4 analytics", "SEO (technical)", "SEO (content)", "React", "Python", "WordPress", "Shopify", "Figma", "Canva",
        "Brand identity", "Motion graphics", "Copywriting", "Instagram growth", "ChatGPT / Claude prompting", "Client communication", "Video editing"]}}, upsert=True)
    if not await db.hr_skill_plans.find_one({"id": "seed-plan-01"}):
        course = await db.training_courses.find_one({}, {"_id": 0, "id": 1})
        await db.hr_skill_plans.insert_many([
            {"id": "seed-plan-01", "user_id": "user-employee", "user_name": "Karan Patel", "skill": "React", "current_level": 2, "target_level": 4,
             "due_date": (today + timedelta(days=60)).isoformat(), "course_id": (course or {}).get("id"),
             "actions": "Take over UrbanKart front-end from Dev; pair 2×/week", "status": "active", "notes": [], "created_by": "user-admin", "created_at": now},
            {"id": "seed-plan-02", "user_id": "user-social", "user_name": "Zara Ali", "skill": "Motion graphics", "current_level": 2, "target_level": 3,
             "due_date": (today + timedelta(days=45)).isoformat(), "course_id": None, "actions": "After Effects basics; 4 reels a month",
             "status": "active", "notes": [], "created_by": "user-admin", "created_at": now},
            {"id": "seed-plan-03", "user_id": "user-marketing", "user_name": "Fatima Khan", "skill": "GA4 analytics", "current_level": 1, "target_level": 3,
             "due_date": (today - timedelta(days=5)).isoformat(), "course_id": None, "actions": "Google Analytics certification",
             "status": "active", "notes": [], "created_by": "user-admin", "created_at": now},
        ])

    # ---------------- payroll ----------------
    ctc = {"user-admin": 2400000, "user-midhun": 1800000, "user-finance": 900000, "user-sales": 720000, "user-pm": 960000, "user-employee": 420000,
           "user-designer": 540000, "user-dev": 780000, "user-marketing": 240000, "user-ads": 600000, "user-social": 360000, "user-newjoiner": 216000}
    from routes_payroll import split_ctc, DEFAULTS
    cfg = dict(DEFAULTS)
    cfg["default_pt"] = 208
    await db.settings.update_one({"id": "payroll"}, {"$set": {"id": "payroll", "default_pt": 208, "company_name": "dotindot Creative",
                                                              "company_address": "Erode, Tamil Nadu"}}, upsert=True)
    for uid, c in ctc.items():
        if uid not in users and uid != "user-newjoiner":
            continue
        if await db.salary_structures.find_one({"user_id": uid}):
            continue
        parts = split_ctc(c, cfg, True)
        monthly = {k: parts[k] for k in ("basic", "hra", "special", "conveyance", "other_allowances")}
        name = (users.get(uid) or {}).get("name") or "Nithya Raman"
        eff = "2026-04-01" if uid != "user-newjoiner" else (today - timedelta(days=3)).isoformat()
        await db.salary_structures.insert_one({"id": str(uuid.uuid4()), "user_id": uid, "user_name": name, "effective_from": eff, "ctc_annual": c, "monthly": monthly,
                                               "pf_applicable": uid != "user-marketing", "esi_applicable": "auto", "pt_monthly": None,
                                               "tds_monthly": 15000 if c >= 1500000 else (2500 if c >= 900000 else 0),
                                               "revisions": [{"effective_from": eff, "ctc_annual": c, "monthly": monthly, "reason": "Annual appraisal 2026" if uid != "user-newjoiner" else "Joining",
                                                              "by": "Arjun Mehta", "at": now}], "created_at": now, "updated_at": now})
    if not await db.incentive_plans.find_one({"id": "seed-plan-ceo"}):
        await db.incentive_plans.insert_many([
            {"id": "seed-plan-ceo", "name": "Location CEO — monthly incentive", "kind": "monthly_incentive", "metric": "branch_revenue", "branch_id": MUMBAI,
             "target": 300000, "payout_type": "percent_above_target", "payout_value": 10, "cap": 75000, "user_ids": ["user-midhun"], "active": True,
             "notes": "10% of branch revenue above ₹3L in the month, capped at ₹75k", "created_by": "user-admin", "created_at": now, "last_calculated": None},
            {"id": "seed-plan-turnover", "name": "Location CEO — yearly turnover bonus", "kind": "yearly_bonus", "metric": "branch_revenue", "branch_id": MUMBAI,
             "target": 4000000, "payout_type": "percent_of_metric", "payout_value": 2, "cap": None, "user_ids": ["user-midhun"], "active": True,
             "notes": "2% of the financial year's branch turnover when it crosses ₹40L", "created_by": "user-admin", "created_at": now, "last_calculated": None},
            {"id": "seed-plan-raise", "name": "Location CEO — target-based raise", "kind": "increment", "metric": "branch_revenue", "branch_id": MUMBAI,
             "target": 5000000, "payout_type": "percent_of_ctc", "payout_value": 12, "cap": None, "user_ids": ["user-midhun"], "active": True,
             "notes": "12% salary increase when the year's branch turnover crosses ₹50L", "created_by": "user-admin", "created_at": now, "last_calculated": None},
            {"id": "seed-plan-commission", "name": "Sales commission — 5% of deals won", "kind": "commission", "metric": "own_sales_won", "branch_id": None,
             "target": 0, "payout_type": "percent_of_metric", "payout_value": 5, "cap": 100000, "user_ids": ["user-sales", "user-midhun"], "active": True,
             "notes": "", "created_by": "user-admin", "created_at": now, "last_calculated": None},
        ])
    last_m = (today.replace(day=1) - timedelta(days=1))
    lm = last_m.strftime("%Y-%m")
    cur_m = today.strftime("%Y-%m")
    if not await db.pay_items.find_one({"source": "seed"}):
        items = [
            ("user-midhun", lm, "incentive", "Location CEO — monthly incentive · " + lm, 42500, "paid"),
            ("user-sales", lm, "commission", "Sales commission — 5% of deals won · " + lm, 31250, "paid"),
            ("user-designer", lm, "reimbursement", "Client shoot travel", 2400, "paid"),
            ("user-employee", cur_m, "bonus", "Diwali bonus", 10000, "approved"),
            ("user-designer", cur_m, "bonus", "Diwali bonus", 10000, "approved"),
            ("user-dev", cur_m, "bonus", "Diwali bonus", 10000, "approved"),
            ("user-ads", cur_m, "incentive", "ROAS target hit — Skyline Realty", 8000, "pending"),
            ("user-social", cur_m, "incentive", "30 posts on schedule", 5000, "pending"),
        ]
        for uid, m, kind, title, amt, st in items:
            await db.pay_items.insert_one({"id": str(uuid.uuid4()), "user_id": uid, "user_name": users[uid]["name"], "month": m, "kind": kind, "title": title,
                                           "amount": amt, "note": "", "status": st, "source": "seed", "plan_id": "seed-plan-ceo" if kind == "incentive" and uid == "user-midhun" else
                                           ("seed-plan-commission" if kind == "commission" else None), "basis": None, "run_id": None,
                                           "created_by": "user-admin", "created_at": now, "approved_by": "Arjun Mehta" if st != "pending" else None,
                                           "approved_at": now if st != "pending" else None})

    # ---------------- loans ----------------
    if not await db.loans.find_one({"id": "seed-loan-01"}):
        from routes_loans import schedule

        def paid_until(ln, upto: date, via="manual"):
            pays = []
            for r in schedule(ln):
                if r["due_date"] <= upto.isoformat():
                    pays.append({"id": str(uuid.uuid4()), "date": r["due_date"], "amount": r["emi"], "principal": r["principal"], "interest": r["interest"],
                                 "mode": "auto_debit" if via == "manual" else "payroll", "note": "EMI" if via == "manual" else "Salary deduction",
                                 "via": via, "txn_id": None, "by": "Priya Sharma", "at": now})
            return pays

        def mstart(k):
            d = today.replace(day=5)
            for _ in range(k):
                d = (d.replace(day=1) - timedelta(days=1)).replace(day=5)
            return d

        loans = [
            {"id": "seed-loan-01", "name": "HDFC business term loan", "direction": "borrowed", "kind": "term_loan", "counterparty": "HDFC Bank, Erode",
             "employee_id": None, "principal": 1500000, "rate_annual": 10.5, "method": "reducing", "tenure_months": 60,
             "disbursed_on": (mstart(15) - timedelta(days=20)).isoformat(), "first_emi_date": mstart(14).isoformat(), "emi_override": None,
             "processing_fee": 15000, "account_ref": "…4821", "collateral": "Office equipment + personal guarantee", "recover_via_payroll": False,
             "notes": "Office fit-out and equipment", "status": "active"},
            {"id": "seed-loan-02", "name": "Car loan — Kia Seltos", "direction": "borrowed", "kind": "vehicle", "counterparty": "ICICI Bank",
             "employee_id": None, "principal": 950000, "rate_annual": 8.9, "method": "reducing", "tenure_months": 48,
             "disbursed_on": (mstart(8) - timedelta(days=15)).isoformat(), "first_emi_date": mstart(7).isoformat(), "emi_override": None,
             "processing_fee": 4500, "account_ref": "…7710", "collateral": "Hypothecation", "recover_via_payroll": False, "notes": "", "status": "active"},
            {"id": "seed-loan-03", "name": "Working capital OD", "direction": "borrowed", "kind": "working_capital", "counterparty": "State Bank of India",
             "employee_id": None, "principal": 500000, "rate_annual": 11.25, "method": "interest_only", "tenure_months": 12,
             "disbursed_on": (mstart(4) - timedelta(days=10)).isoformat(), "first_emi_date": mstart(3).isoformat(), "emi_override": None,
             "processing_fee": 0, "account_ref": "…0093", "collateral": "Receivables", "recover_via_payroll": False, "notes": "Renew yearly", "status": "active"},
            {"id": "seed-loan-04", "name": "Salary advance — Karan", "direction": "lent", "kind": "employee_advance", "counterparty": "Karan Patel",
             "employee_id": "user-employee", "principal": 60000, "rate_annual": 0, "method": "zero", "tenure_months": 6,
             "disbursed_on": mstart(3).isoformat(), "first_emi_date": (mstart(2).replace(day=28)).isoformat(), "emi_override": None,
             "processing_fee": 0, "account_ref": "", "collateral": "", "recover_via_payroll": True, "notes": "Medical emergency advance", "status": "active"},
            {"id": "seed-loan-05", "name": "Advance to print partner", "direction": "lent", "kind": "client_advance", "counterparty": "Kongu Print House",
             "employee_id": None, "principal": 200000, "rate_annual": 12, "method": "reducing", "tenure_months": 10,
             "disbursed_on": mstart(5).isoformat(), "first_emi_date": mstart(4).isoformat(), "emi_override": None, "processing_fee": 0, "account_ref": "",
             "collateral": "", "recover_via_payroll": False, "notes": "", "status": "active"},
        ]
        for ln in loans:
            upto = today if ln["id"] in ("seed-loan-01", "seed-loan-02") else (today - timedelta(days=35) if ln["id"] == "seed-loan-05" else today)
            ln["payments"] = paid_until(ln, upto, "payroll" if ln["recover_via_payroll"] else "manual")
            if ln["id"] == "seed-loan-01":  # this month's EMI not yet paid
                ln["payments"] = [p for p in ln["payments"] if p["date"] < today.replace(day=1).isoformat()]
            ln.update({"created_by": "user-finance", "created_at": now})
        await db.loans.insert_many(loans)

    # ---------------- payroll runs: last month paid, this month draft ----------------
    from routes_payroll import _rebuild, payroll_settings, _totals
    if not await db.payroll_runs.find_one({"month": lm}):
        run = {"id": "seed-run-prev", "month": lm, "status": "draft", "created_by": "user-finance", "created_by_name": "Priya Sharma", "created_at": now,
               "finalised_at": None, "paid_at": None, "paid_on": None, "ledger_txn_id": None, "totals": {}, "missing_structure": []}
        await db.payroll_runs.insert_one(dict(run))
        await db.pay_items.update_many({"month": lm, "status": "paid"}, {"$set": {"status": "approved"}})
        await _rebuild(run, await payroll_settings())
        slips = await db.payslips.find({"run_id": run["id"]}, {"_id": 0}).to_list(100)
        paid_on = last_m.replace(day=min(30, last_m.day)).isoformat()
        await db.pay_items.update_many({"run_id": run["id"]}, {"$set": {"status": "paid", "paid_on": paid_on}})
        await db.payroll_runs.update_one({"id": run["id"]}, {"$set": {"status": "paid", "finalised_at": now, "finalised_by": "Priya Sharma", "paid_at": now,
                                                                      "paid_on": paid_on, "totals": _totals(slips)}})
        await db.payslips.update_many({"run_id": run["id"]}, {"$set": {"status": "paid", "paid_on": paid_on}})
    if not await db.payroll_runs.find_one({"month": cur_m}):
        run = {"id": "seed-run-cur", "month": cur_m, "status": "draft", "created_by": "user-finance", "created_by_name": "Priya Sharma", "created_at": now,
               "finalised_at": None, "paid_at": None, "paid_on": None, "ledger_txn_id": None, "totals": {}, "missing_structure": []}
        await db.payroll_runs.insert_one(dict(run))
        await _rebuild(run, await payroll_settings())

    # ---------------- support tickets ----------------
    if not await db.tickets.find_one({"seed": "v30"}):
        from routes_support import DEFAULT_SLA
        portal = await db.portal_users.find_one({}, {"_id": 0})
        pc = (portal or {}).get("client_id") or clients[0]["id"]
        pname = (portal or {}).get("name") or "Client contact"
        pid = (portal or {}).get("id") or "portal-x"

        def msg(atype, aid, aname, body, d, h, internal=False):
            return {"id": str(uuid.uuid4()), "author_type": atype, "author_id": aid, "author_name": aname, "body": body, "internal": internal, "at": _ts(d, h)}

        T = [
            ("client", pc, "website", "high", "in_progress", "Contact form on the website isn't sending emails", 2, "user-dev",
             [("portal", pid, pname, "Since yesterday the enquiry form on our site shows 'sent' but we're not getting the emails.", 2, 10),
              ("user", "user-dev", "Dev Malhotra", "Thanks — looking now. Looks like the SMTP password expired; resetting it.", 2, 12),
              ("user", "user-dev", "Dev Malhotra", "SMTP app password rotated, moved to Password Manager.", 2, 12, True)]),
            ("client", pc, "reports", "normal", "waiting", "Can we add Google Ads conversions to the monthly report?", 5, "user-ads",
             [("portal", pid, pname, "Our board wants to see conversions by campaign in the monthly PDF.", 5, 11),
              ("user", "user-ads", "Aarav Shetty", "Yes — can you confirm which conversion actions count (calls, form fills or both)?", 4, 15)]),
            ("client", "seed-client-06", "billing", "normal", "resolved", "Invoice for October shows the wrong GST number", 9, "user-finance",
             [("user", "user-finance", "Priya Sharma", "Logged on behalf of Desert Pearl: GSTIN on Oct invoice is old.", 9, 10),
              ("user", "user-finance", "Priya Sharma", "Revised invoice sent with the new GSTIN.", 8, 16)]),
            ("client", "seed-client-02", "campaigns", "urgent", "open", "Meta ad account disabled — campaigns stopped", 0, None,
             [("user", "user-ads", "Aarav Shetty", "Client called: ad account flagged this morning, all health-package ads paused.", 0, 9)]),
            ("internal", None, "it", "high", "in_progress", "Laptop battery swelling — need replacement", 1, "user-admin",
             [("user", "user-designer", "Ananya Verma", "My MacBook Air trackpad is lifting, battery looks swollen.", 1, 10),
              ("user", "user-admin", "Arjun Mehta", "Please stop using it. Loaner iMac on your desk tomorrow; Apple service booked.", 1, 13)]),
            ("internal", None, "hr", "normal", "open", "Need salary certificate for home loan", 1, None,
             [("user", "user-employee", "Karan Patel", "Bank needs a salary certificate + last 3 payslips for a home loan.", 1, 17)]),
            ("internal", None, "tools", "low", "open", "Canva Pro seat for the new joiner", 0, "user-admin",
             [("user", "user-pm", "Sneha Iyer", "Nithya joined this week — please add her to our Canva team.", 0, 11)]),
            ("internal", None, "finance", "normal", "resolved", "Reimbursement for client shoot travel", 12, "user-finance",
             [("user", "user-designer", "Ananya Verma", "Bus + auto for the GreenLeaf shoot, ₹2,400. Receipts attached in expenses.", 12, 18),
              ("user", "user-finance", "Priya Sharma", "Approved — added to last month's payroll.", 11, 11)]),
        ]
        n = 0
        for kind, cid, cat, pri, st, subj, ago, assignee, msgs in T:
            n += 1
            first = msgs[0]
            raised = {"type": first[0], "id": first[1], "name": first[2], "email": ""}
            created = _ts(today - timedelta(days=first[4]), first[5])
            mm = [msg(m[0], m[1], m[2], m[3], today - timedelta(days=m[4]), m[5], m[6] if len(m) > 6 else False) for m in msgs]
            team_public = [m for m in mm if m["author_type"] == "user" and not m["internal"] and m["author_id"] != raised["id"]]
            doc = {"id": f"seed-tkt-{n:02d}", "seed": "v30", "number": f"TKT-{1000 + n}", "kind": kind, "client_id": cid if kind == "client" else None,
                   "client_name": (cmap.get(cid) or {}).get("name", "") if kind == "client" else "", "subject": subj, "category": cat, "priority": pri,
                   "status": st, "assignee_id": assignee, "assignee_name": (users.get(assignee) or {}).get("name", "") if assignee else "", "raised_by": raised,
                   "messages": mm, "due_at": (datetime.fromisoformat(created) + timedelta(hours=DEFAULT_SLA[pri])).isoformat(),
                   "first_response_at": team_public[0]["at"] if team_public else None,
                   "resolved_at": mm[-1]["at"] if st == "resolved" else None, "closed_at": None,
                   "rating": {"score": 5, "comment": "Quick fix, thank you!", "at": mm[-1]["at"]} if st == "resolved" and kind == "client" else None,
                   "unread_for_team": mm[-1]["author_type"] == "portal" or len(mm) == 1, "unread_for_requester": bool(team_public) and st in ("waiting", "in_progress"),
                   "created_at": created, "updated_at": mm[-1]["at"], "last_activity_at": mm[-1]["at"]}
            await db.tickets.insert_one(doc)
        await db.counters.update_one({"id": "tickets"}, {"$set": {"seq": n}}, upsert=True)
        await db.settings.update_one({"id": "support"}, {"$set": {"id": "support", "routing": {"internal:it": "user-admin", "internal:hr": "user-admin",
                                                                                             "internal:finance": "user-finance", "internal:tools": "user-admin",
                                                                                             "client:billing": "user-finance", "client:campaigns": "user-ads"}}}, upsert=True)

    # ---------------- lead flow: client leads + recent internal leads ----------------
    if not await db.client_leads.find_one({"seed": "v30"}):
        profiles = {
            "seed-client-01": ("Skyline Realty", [("meta_ads", 34), ("google_ads", 18), ("website", 10), ("whatsapp", 8), ("referral", 5), ("marketplace", 6)], 2500000),
            "seed-client-02": ("MediCare Plus", [("google_ads", 26), ("meta_ads", 22), ("instagram", 9), ("walk_in", 7), ("website", 8)], 18000),
            "seed-client-09": ("Nova Dental Studio", [("google_ads", 14), ("instagram", 12), ("whatsapp", 6), ("referral", 6)], 12000),
            "seed-client-06": ("Desert Pearl Properties", [("meta_ads", 16), ("google_ads", 10), ("linkedin", 4), ("referral", 3)], 4500000),
            "seed-client-10": ("Bombay Brew Co", [("instagram", 12), ("meta_ads", 9), ("walk_in", 6)], 3500),
        }
        conv = {"meta_ads": .09, "google_ads": .14, "website": .12, "whatsapp": .18, "referral": .35, "marketplace": .06, "instagram": .08, "walk_in": .3, "linkedin": .12}
        firsts = ["Arun", "Priya", "Karthik", "Divya", "Sanjay", "Meera", "Vignesh", "Anu", "Rahul", "Swathi", "Naveen", "Keerthi", "Ajay", "Pooja", "Gokul", "Nisha"]
        lasts = ["Kumar", "Raj", "S", "Menon", "Iyer", "Reddy", "Nair", "Shah", "Pillai", "Das"]
        docs = []
        for cid, (cname, mix, val) in profiles.items():
            if cid not in cmap:
                continue
            for src, n in mix:
                for _ in range(n):
                    d = today - timedelta(days=rnd.randint(0, 125))
                    r = rnd.random()
                    p = conv.get(src, .1)
                    if r < p:
                        stage, path = "converted", ["new", "contacted", "qualified", "converted"]
                    elif r < p + .25:
                        stage, path = "lost", rnd.choice([["new", "lost"], ["new", "contacted", "lost"], ["new", "contacted", "qualified", "lost"]])
                    else:
                        path = rnd.choice([["new"], ["new", "contacted"], ["new", "contacted"], ["new", "contacted", "qualified"]])
                        stage = path[-1]
                    hist = [{"stage": s, "at": _ts(d + timedelta(days=i * rnd.randint(0, 3)), 11)} for i, s in enumerate(path)]
                    docs.append({"id": str(uuid.uuid4()), "seed": "v30", "client_id": cid, "name": f"{rnd.choice(firsts)} {rnd.choice(lasts)}",
                                 "phone": f"+91 9{rnd.randint(100000000, 999999999)}", "email": "", "source": src,
                                 "campaign": {"meta_ads": "Lead gen — " + cname.split()[0], "google_ads": "Search — brand + generic"}.get(src, ""),
                                 "stage": stage, "value": round(val * rnd.uniform(.6, 1.4)) if stage == "converted" else 0, "date": d.isoformat(),
                                 "notes": "", "stage_history": hist, "created_by": "user-ads", "created_at": _ts(d, 10), "updated_at": hist[-1]["at"]})
        if docs:
            await db.client_leads.insert_many(docs)
    if not await db.leads.find_one({"seed": "v30"}):
        srcs = [("referral", 7, .4), ("website", 9, .15), ("linkedin", 6, .12), ("ads", 8, .1), ("cold_outreach", 5, .06), ("event", 3, .25)]
        biz = ["Kongu Textiles", "Erode Turmeric Traders", "Bhavani Silks", "Velan Hospitals", "KPR Motors", "Annai Sweets", "Sri Ganesh Builders",
               "Tiruppur Knit Co", "Arasan Dairy", "Kovai Smart Homes", "Senthil Agro", "Lakshmi Jewellers", "Perundurai Steel", "Green Valley School",
               "Royal Furniture", "Sathy Coconut Exports", "Vel Dental Care", "Kaveri Resorts", "Rathna Electricals", "MK Pharma"]
        k = 0
        for src, n, pw in srcs:
            for _ in range(n):
                k += 1
                d = today - timedelta(days=rnd.randint(0, 110))
                r = rnd.random()
                if r < pw:
                    path = ["new", "contacted", "qualified", "proposal", "won"]
                elif r < pw + .3:
                    path = rnd.choice([["new", "contacted", "lost"], ["new", "contacted", "qualified", "lost"], ["new", "contacted", "qualified", "proposal", "lost"]])
                else:
                    path = rnd.choice([["new"], ["new", "contacted"], ["new", "contacted", "qualified"], ["new", "contacted", "qualified", "proposal"]])
                hist = [{"stage": s, "at": _ts(d + timedelta(days=i * rnd.randint(1, 6)), 11), "by": "user-sales"} for i, s in enumerate(path)]
                await db.leads.insert_one({"id": str(uuid.uuid4()), "seed": "v30", "name": biz[k % len(biz)] + ("" if k <= len(biz) else f" ({k})"),
                                           "company": biz[k % len(biz)], "contact_email": "", "contact_phone": "", "source": src,
                                           "estimated_value": rnd.choice([60000, 90000, 150000, 240000, 360000, 480000]),
                                           "service_interest": rnd.choice(["web_dev", "marketing", "ai", "retainer"]), "stage": path[-1],
                                           "owner_id": rnd.choice(["user-sales", "user-midhun"]), "region": "South", "state": "Tamil Nadu",
                                           "city": rnd.choice(["Erode", "Coimbatore", "Tiruppur", "Chennai"]), "notes": "", "follow_up_date": None,
                                           "currency": "INR", "converted_client_id": None, "branch_id": ERODE, "stage_history": hist,
                                           "created_by": "user-sales", "created_at": _ts(d, 10), "updated_at": hist[-1]["at"]})
    for cid in ("seed-client-01", "seed-client-02"):
        if cid in cmap and not await db.lead_intake_keys.find_one({"client_id": cid}):
            await db.lead_intake_keys.insert_one({"kind": "client", "client_id": cid, "key": "lk_demo_" + cid[-2:] + "x" * 20, "created_at": now,
                                                  "last_used_at": now, "count": rnd.randint(20, 60)})

    # ---------------- investors ----------------
    if not await db.investors.find_one({"id": "seed-inv-01"}):
        await db.investors.insert_many([
            {"id": "seed-inv-01", "name": "Karthik Subramanian", "type": "individual", "email": "karthik@investor.example", "phone": "", "city": "Coimbatore",
             "joined_on": "2024-04-01", "relationship_owner_id": "user-admin", "notes": "Angel; ex-founder in textiles SaaS", "status": "active", "created_at": now},
            {"id": "seed-inv-02", "name": "Kovai Growth Partners LLP", "type": "company", "email": "deals@kovaigrowth.example", "phone": "", "city": "Coimbatore",
             "joined_on": "2025-01-15", "relationship_owner_id": "user-admin", "notes": "", "status": "active", "created_at": now},
            {"id": "seed-inv-03", "name": "Meenakshi Raghavan", "type": "individual", "email": "meenakshi@investor.example", "phone": "", "city": "Erode",
             "joined_on": "2025-06-10", "relationship_owner_id": "user-finance", "notes": "Debt investor, monthly interest", "status": "active", "created_at": now},
        ])
        await db.investments.insert_many([
            {"id": "seed-x-01", "investor_id": "seed-inv-01", "date": "2024-04-01", "amount": 1500000, "instrument": "profit_share", "stake_percent": 6,
             "interest_rate": None, "tenure_months": None, "terms": "6% of net profit, paid quarterly", "status": "active", "note": "", "created_at": now},
            {"id": "seed-x-02", "investor_id": "seed-inv-01", "date": "2025-08-01", "amount": 500000, "instrument": "profit_share", "stake_percent": 1.5,
             "interest_rate": None, "tenure_months": None, "terms": "Top-up", "status": "active", "note": "", "created_at": now},
            {"id": "seed-x-03", "investor_id": "seed-inv-02", "date": "2025-01-15", "amount": 3000000, "instrument": "capital", "stake_percent": 9,
             "interest_rate": None, "tenure_months": None, "terms": "Capital contribution, pro-rata profit share", "status": "active", "note": "", "created_at": now},
            {"id": "seed-x-04", "investor_id": "seed-inv-03", "date": "2025-06-10", "amount": 1000000, "instrument": "debt", "stake_percent": None,
             "interest_rate": 14, "tenure_months": 36, "terms": "14% p.a., interest monthly, principal at maturity", "status": "active", "note": "", "created_at": now},
        ])
        rets = []
        for q in ("2024-10-15", "2025-01-15", "2025-04-15", "2025-07-15", "2025-10-15", "2026-01-15", "2026-04-15", "2026-07-15", "2026-10-15"):
            if q <= today.isoformat():
                rets.append({"investor_id": "seed-inv-01", "investment_id": "seed-x-01", "date": q, "amount": rnd.choice([42000, 48000, 55000, 61000]), "kind": "profit_share", "tds": 0, "note": "Quarterly profit share"})
        for q in ("2025-07-20", "2026-01-20", "2026-07-20"):
            if q <= today.isoformat():
                rets.append({"investor_id": "seed-inv-02", "investment_id": "seed-x-03", "date": q, "amount": rnd.choice([120000, 135000, 150000]), "kind": "profit_share", "tds": 0, "note": "Half-yearly distribution"})
        d = date(2025, 7, 10)
        while d <= today:
            rets.append({"investor_id": "seed-inv-03", "investment_id": "seed-x-04", "date": d.isoformat(), "amount": round(1000000 * .14 / 12), "kind": "interest", "tds": round(1000000 * .14 / 12 * .1), "note": "Monthly interest"})
            d = (d.replace(day=1) + timedelta(days=32)).replace(day=10)
        await db.investor_returns.insert_many([{"id": str(uuid.uuid4()), **r, "created_by": "user-finance", "created_at": now} for r in rets])
        await db.company_valuations.insert_many([
            {"id": "seed-val-01", "date": "2025-01-15", "valuation": 33000000, "method": "Pre-money at Kovai Growth round", "note": "", "created_at": now},
            {"id": "seed-val-02", "date": "2026-04-01", "valuation": 52000000, "method": "4× trailing revenue", "note": "FY25-26 close", "created_at": now},
        ])
        await db.investor_updates.insert_many([
            {"id": "seed-upd-01", "title": "Q2 FY26-27 update — Coimbatore office live", "body": "We opened our Coimbatore office in September and signed 4 new retainers. Revenue is up 31% on the same quarter last year. Next: Chennai in Q4.",
             "date": (today - timedelta(days=28)).isoformat(), "audience": "all", "investor_ids": [], "links": [], "published": True,
             "created_by": "user-admin", "created_by_name": "Arjun Mehta", "created_at": now},
            {"id": "seed-upd-02", "title": "Interest schedule for FY26-27", "body": "Attached is the monthly interest schedule. Payments go out on the 10th of every month.",
             "date": (today - timedelta(days=60)).isoformat(), "audience": "selected", "investor_ids": ["seed-inv-03"],
             "links": [{"title": "Interest schedule", "url": "https://drive.google.com/"}], "published": True,
             "created_by": "user-finance", "created_by_name": "Priya Sharma", "created_at": now},
        ])
        await db.investor_users.insert_many([
            {"id": "seed-invu-01", "investor_id": "seed-inv-01", "name": "Karthik Subramanian", "email": "investor@dotindot.in",
             "password_hash": hash_password("Investor@2026"), "is_active": True, "last_login": None, "created_by": "user-admin", "created_at": now},
            {"id": "seed-invu-03", "investor_id": "seed-inv-03", "name": "Meenakshi Raghavan", "email": "meenakshi@investor.example",
             "password_hash": hash_password("Investor@2026"), "is_active": True, "last_login": None, "created_by": "user-admin", "created_at": now},
        ])
        await db.settings.update_one({"id": "investor_portal"}, {"$set": {"id": "investor_portal", "contact": "Arjun Mehta · founder@dotindot.in",
                                                                          "share": {"revenue": True, "profit": True, "clients": True, "team": True, "projects": True, "pipeline": False}}}, upsert=True)

    # ---------------- AI settings + a token ----------------
    if not await db.ai_tokens.find_one({"id": "seed-ai-01"}):
        await db.settings.update_one({"id": "ai"}, {"$set": {"id": "ai", "enabled": True, "default_provider": "anthropic",
                                                             "instructions": "Amounts are in Indian rupees. Our offices are in Erode, Coimbatore and Chennai.",
                                                             "updated_at": now, "updated_by": "Arjun Mehta"}}, upsert=True)
        agent = await db.ai_agents.find_one({}, {"_id": 0, "id": 1})
        await db.ai_tokens.insert_one({"id": "seed-ai-01", "name": "Claude — ops assistant", "agent_id": (agent or {}).get("id"),
                                       "access": {"clients": "read", "projects": "read", "leads": "write", "client_leads": "read", "support": "write",
                                                  "attendance": "read", "employees": "read", "finance": "read"},
                                       "token_hash": hashlib.sha256(b"dai_demo_token_not_usable").hexdigest(), "prefix": "dai_7Hq2Lx", "expires_at": (datetime.now(timezone.utc) + timedelta(days=80)).isoformat(),
                                       "revoked": False, "created_by": "user-admin", "created_by_name": "Arjun Mehta", "created_at": now,
                                       "last_used_at": now, "calls": 37})
        for i, (tool, mod, cnt) in enumerate([("business_summary", None, 1), ("query_records", "leads", 12), ("search", None, 4), ("get_record", "clients", 1),
                                              ("update_record", "leads", 1), ("query_records", "support", 6)]):
            await db.ai_access_log.insert_one({"id": str(uuid.uuid4()), "token_id": "seed-ai-01", "token_name": "Claude — ops assistant", "via": "mcp", "tool": tool,
                                               "module": mod, "count": cnt, "ok": True, "detail": "", "at": (datetime.now(timezone.utc) - timedelta(hours=i * 5)).isoformat()})

    await db.seed_flags.insert_one({"id": "v30", "at": now})
