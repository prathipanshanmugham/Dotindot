"""Optional demo data for v3.2 Billing: a filled company profile and a spread of quotations / invoices / credit notes
in INR and foreign currency. NOT run at startup — call seed_v32() on a demo database. Idempotent (seed flag "v32").
All numbers, bank details and certifications are made up for the demo."""
import secrets
import uuid
from datetime import date, datetime, timezone, timedelta
from database import db


def _d(k):
    return (date.today() + timedelta(days=k)).isoformat()


async def seed_v32():
    if await db.seed_flags.find_one({"id": "v32"}):
        return
    from routes_billing import company_profile, compute_totals, next_number, ensure_default_terms, amount_in_words, _fy, DOC_TYPES
    now = datetime.now(timezone.utc).isoformat()
    await db.settings.update_one({"id": "company"}, {"$set": {
        "id": "company", "legal_name": "Dotindot Creative", "trade_name": "dotindot", "tagline": "AI Marketing-Tech Agency",
        "address1": "2nd Floor, 14 Brough Road", "address2": "Near Bus Stand", "city": "Erode", "state_code": "33", "pincode": "638001", "country": "India",
        "gstin": "33AAFCD1234K1ZP", "pan": "AAFCD1234K", "udyam": "UDYAM-TN-08-0012345", "lut": "AD3304260001234", "email": "accounts@dotindot.in",
        "phone": "+91 98765 43210", "website": "dotindot.in", "signatory_name": "Prathipan S", "signatory_title": "Founder",
        "bank": {"account_name": "Dotindot Creative", "account_no": "50200012345678", "ifsc": "HDFC0001234", "bank_name": "HDFC Bank", "branch": "Erode Main",
                 "swift": "HDFCINBBCHE", "bank_address": "HDFC Bank Ltd, Erode Main Branch, Tamil Nadu 638001, India"},
        "upi_id": "dotindot@hdfcbank", "upi_name": "Dotindot Creative",
        "certifications": [{"id": "cert-1", "name": "Google Partner", "issuer": "Google", "number": "", "valid_till": None, "image": None, "show_on_docs": True},
                           {"id": "cert-2", "name": "Meta Business Partner", "issuer": "Meta", "number": "", "valid_till": None, "image": None, "show_on_docs": True},
                           {"id": "cert-3", "name": "ISO 9001:2015", "issuer": "TÜV SÜD", "number": "QMS-2026-1187", "valid_till": "2029-03-31", "image": None, "show_on_docs": True},
                           {"id": "cert-4", "name": "MSME / Udyam registered", "issuer": "Ministry of MSME", "number": "UDYAM-TN-08-0012345", "valid_till": None, "image": None, "show_on_docs": True}],
        "updated_at": now, "updated_by": "seed"}}, upsert=True)
    await ensure_default_terms()
    co = await company_profile()
    terms = await db.billing_terms.find({}, {"_id": 0}).to_list(100)
    tid = {t["title"]: t for t in terms}
    pick = lambda *names: [{"id": tid[n]["id"], "category": tid[n]["category"], "title": n, "text": tid[n]["text"]} for n in names if n in tid]
    names = {c["id"]: c for c in await db.clients.find({}, {"_id": 0, "id": 1, "name": 1, "company": 1, "contacts": 1, "state": 1, "city": 1}).to_list(200)}

    def party(cid, state_code, gstin="", country="India", tax_id=""):
        c = names.get(cid, {})
        prim = (c.get("contacts") or [{}])[0]
        return {"name": prim.get("name", ""), "company": c.get("company") or c.get("name", ""), "email": prim.get("email", ""), "phone": prim.get("phone", ""),
                "address": f"{c.get('city') or ''}".strip(), "city": c.get("city", ""), "state_code": state_code, "country": country, "gstin": gstin, "tax_id": tax_id}

    async def mk(dtype, cid, bill_to, items, tax_mode, currency="INR", fx=1.0, days_ago=0, status="sent", title="", terms_=None, payments=None, tags=None, src=None, notes=None):
        d0 = _d(-days_ago)
        norm = [{"id": str(uuid.uuid4()), "description": a, "details": b, "sac": sac, "qty": q, "unit": u, "unit_price": p, "discount_pct": 0.0, "tax_rate": None} for a, b, sac, q, u, p in items]
        tot = compute_totals(norm, currency, tax_mode, 0, 0, currency == "INR", 18.0)
        doc = {"id": str(uuid.uuid4()), "type": dtype, "number": await next_number(dtype, _fy(d0), co["numbering"][dtype]), "status": status, "client_id": cid,
               "client_name": names.get(cid, {}).get("name", bill_to["company"]), "lead_id": None, "project_id": None, "title": title, "bill_to": bill_to, "date": d0, "fy": _fy(d0),
               "valid_until": _d(15 - days_ago) if dtype == "quotation" else None, "due_date": _d(15 - days_ago) if dtype in ("invoice", "proforma") else None,
               "currency": currency, "fx_rate": fx, "tax_mode": tax_mode, "place_of_supply": bill_to["state_code"] or ("96" if tax_mode == "zero_rated" else "33"),
               "discount_pct": 0.0, "discount_amount": 0.0, "round_off": currency == "INR", **tot, "inr_total": round(tot["total"] * fx, 2),
               "terms": terms_ or [], "notes": notes if notes is not None else co["defaults"]["notes"], "po_number": "", "reference": "", "service_tags": tags or [],
               "show_qr": True, "show_certs": True, "payments": payments or [], "share_token": secrets.token_urlsafe(18), "created_by": "user-sales", "created_by_name": "Rahul Verma",
               "created_at": f"{d0}T09:30:00+00:00", "updated_at": now, "updated_by": "Rahul Verma", "sent_at": f"{d0}T10:00:00+00:00" if status != "draft" else None,
               "history": [{"at": f"{d0}T09:30:00+00:00", "by": "Rahul Verma", "event": "created"}]}
        if src:
            doc["source_id"], doc["source_number"] = src["id"], src["number"]
        if status == "accepted":
            doc["accepted_at"], doc["accepted_by"] = f"{_d(-days_ago + 2)}T11:00:00+00:00", f"{bill_to['name']} (portal)"
        await db.billing_docs.insert_one(dict(doc))
        return doc

    quote_terms = pick("Advance to start", "Scope as quoted", "Client inputs", "Timeline", "Two rounds of revisions", "Ownership on full payment", "Confidentiality",
                       "Cancellation", "Limitation of liability", "Acceptance", "Validity", "Governing law")
    inv_terms = pick("Net 15 payment", "Late payment", "Governing law")
    exp_terms = pick("Foreign remittance", "Export of services", "Limitation of liability")
    # Skyline (Maharashtra, IGST): accepted quote → invoice part paid
    sky = party("seed-client-01", "27", "27AABCS1234P1ZV")
    q1 = await mk("quotation", "seed-client-01", sky, [("Listings portal revamp — phase 2", "Map search, saved searches, CRM lead capture, SEO setup", "998314", 1, "service", 450000),
                                                      ("Monthly SEO & content retainer", "8 articles, technical SEO, monthly report", "998361", 3, "month", 35000)],
                "gst_inter", days_ago=40, status="converted", title="Skyline Listings Portal — Phase 2", terms_=quote_terms, tags=["web", "seo"])
    i1 = await mk("invoice", "seed-client-01", sky, [("Listings portal revamp — phase 2 (50% advance)", "As per quotation", "998314", 1, "service", 225000)],
                  "gst_inter", days_ago=30, status="part_paid", terms_=inv_terms, src=q1,
                  payments=[{"id": str(uuid.uuid4()), "date": _d(-20), "amount": 150000.0, "method": "bank", "reference": "NEFT HDFC00234", "note": "", "inr_amount": 150000.0, "by": "Priya Sharma", "at": now}])
    # MediCare (Tamil Nadu, CGST+SGST): paid invoice + a credit note
    med = party("seed-client-02", "33", "33AAACM5678Q1Z3")
    i2 = await mk("invoice", "seed-client-02", med, [("Performance marketing management — October", "Meta + Google campaigns, weekly optimisation", "998361", 1, "month", 60000),
                                                     ("Landing page A/B variants", "2 variants with analytics", "998314", 2, "page", 12500)],
                  "gst_intra", days_ago=25, status="paid", terms_=inv_terms,
                  payments=[{"id": str(uuid.uuid4()), "date": _d(-12), "amount": 100300.0, "method": "upi", "reference": "UPI 6291…", "note": "", "inr_amount": 100300.0, "by": "Priya Sharma", "at": now}])
    await mk("credit_note", "seed-client-02", med, [("Landing page A/B variants — one variant not delivered", "", "998314", 1, "page", 12500)], "gst_intra", days_ago=8, status="issued", src=i2,
             notes="Credit against INV for the undelivered variant.")
    # ThamesTech (UK client — export, USD, zero-rated)
    dp = party("seed-client-07", "", "", "United Kingdom", "VAT GB 987654321")
    q2 = await mk("quotation", "seed-client-07", dp, [("Brand identity & website (bilingual EN/AR)", "Logo system, brand book, 8-page site, Arabic RTL", "998391", 1, "service", 9500),
                                                     ("Social media management", "4 platforms, 20 posts a month", "998361", 6, "month", 1200)],
                  "zero_rated", "USD", 83.4, days_ago=12, status="accepted", title="ThamesTech — brand refresh & support site", terms_=quote_terms + exp_terms, tags=["branding", "web", "social", "export"])
    await mk("proforma", "seed-client-07", dp, [("Brand identity & website — 50% advance", "", "998391", 1, "service", 4750)], "zero_rated", "USD", 83.4, days_ago=5, status="sent", terms_=exp_terms, src=q2)
    # Spice Route: overdue invoice
    sr = party("seed-client-03", "29", "29AADCS9012R1ZK")
    await mk("invoice", "seed-client-03", sr, [("Instagram growth retainer — September", "", "998361", 1, "month", 25000), ("Reel production", "4 reels", "998347", 4, "video", 4000)],
             "gst_inter", days_ago=48, status="overdue", terms_=inv_terms)
    # UrbanKart: open quotation, Bombay Brew: draft
    uk = party("seed-client-05", "33", "33AABCU4321M1ZQ")
    await mk("quotation", "seed-client-05", uk, [("Marketplace ads management (Amazon + Flipkart)", "Campaign setup, bid management, weekly reporting", "998361", 3, "month", 40000),
                                                ("Product photography", "60 SKUs, white background + lifestyle", "998346", 60, "unit", 450)],
             "gst_intra", days_ago=3, status="sent", title="UrbanKart — festive season push", terms_=quote_terms, tags=["ads", "video"])
    bb = party("seed-client-10", "27", "")
    await mk("quotation", "seed-client-10", bb, [("Café website with online ordering", "Menu, ordering, UPI payments, Google Business sync", "998314", 1, "service", 85000)],
             "gst_inter", days_ago=1, status="draft", title="Bombay Brew — website", terms_=quote_terms, tags=["web"])
    # a GBP invoice for a London prospect without a client record
    ldn = {"name": "Olivia Hart", "company": "Hart & Fable Ltd", "email": "olivia@hartfable.co.uk", "phone": "+44 20 7946 0123", "address": "12 Golden Square", "city": "London",
           "state_code": "", "country": "United Kingdom", "gstin": "", "tax_id": "VAT GB123456789"}
    await mk("invoice", None, ldn, [("Shopify store build", "Theme customisation, 40 products, payments, analytics", "998314", 1, "service", 3200)], "zero_rated", "GBP", 106.2,
             days_ago=10, status="sent", terms_=exp_terms)
    await db.seed_flags.insert_one({"id": "v32", "at": now})
