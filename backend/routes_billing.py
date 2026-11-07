"""v3.2 Billing — quotations, proforma invoices, tax invoices and credit notes to international standards.

  • Company profile (Settings → Company): legal name, GSTIN / PAN / CIN / Udyam / LUT, address, bank + SWIFT, UPI id,
    logo, signatory + signature, certifications (ISO, Google Partner, Meta Business Partner…). All printed on documents.
  • Terms library: reusable clauses by category (payment, scope, revisions, IP, confidentiality, cancellation,
    liability…) tagged by service type; pick the ones that fit each document, add one-off clauses, reorder.
  • Documents: INR with GST (CGST+SGST inside the state, IGST outside), zero-rated exports / SEZ under LUT, or no tax;
    USD / EUR / AED / GBP / SGD / AUD / CAD with an exchange rate (the INR value is kept for the books).
    SAC/HSN per line, per-line discount + tax rate, overall discount, round-off, amount in words, PO number,
    validity / due dates, numbering per type per financial year (QTN/26-27/0007).
  • Flow: quotation → proforma → invoice (one click, keeps a link back) → payments (part payments, ageing)
    → credit note against an invoice. Clients see and accept quotations in the portal or via a share link.
  • PDF: branded letterhead, UPI QR on INR documents (upi://pay with the exact amount), bank/SWIFT block for
    foreign currency, GST summary, terms, certifications strip, signature.

Permissions: `billing` (see), `billing.manage` (create / edit / send / record payments), `billing.delete`.
"""
import base64
import math
import re
import secrets
import uuid
from datetime import date, datetime, timezone, timedelta
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from pymongo import ReturnDocument
from database import db
from auth import get_current_user, log_activity
from routes_client_dashboard import get_portal_user
from permissions import has_permission, scoped_client_ids

router = APIRouter()

DOC_TYPES = {"quotation": {"label": "Quotation", "prefix": "QTN", "title": "QUOTATION"},
             "proforma": {"label": "Proforma invoice", "prefix": "PI", "title": "PROFORMA INVOICE"},
             "invoice": {"label": "Tax invoice", "prefix": "INV", "title": "TAX INVOICE"},
             "credit_note": {"label": "Credit note", "prefix": "CN", "title": "CREDIT NOTE"}}
STATUSES = {"quotation": ["draft", "sent", "accepted", "rejected", "expired", "converted", "cancelled"],
            "proforma": ["draft", "sent", "paid", "converted", "cancelled"],
            "invoice": ["draft", "sent", "part_paid", "paid", "overdue", "cancelled"],
            "credit_note": ["draft", "issued", "cancelled"]}
CURRENCIES = {"INR": {"symbol": "₹", "name": "Indian rupee", "minor": "paise", "major": "rupees"},
              "USD": {"symbol": "$", "name": "US dollar", "minor": "cents", "major": "dollars"},
              "EUR": {"symbol": "€", "name": "Euro", "minor": "cents", "major": "euros"},
              "AED": {"symbol": "AED", "name": "UAE dirham", "minor": "fils", "major": "dirhams"},
              "GBP": {"symbol": "£", "name": "Pound sterling", "minor": "pence", "major": "pounds"},
              "SGD": {"symbol": "S$", "name": "Singapore dollar", "minor": "cents", "major": "dollars"},
              "AUD": {"symbol": "A$", "name": "Australian dollar", "minor": "cents", "major": "dollars"},
              "CAD": {"symbol": "C$", "name": "Canadian dollar", "minor": "cents", "major": "dollars"}}
TAX_MODES = {"gst_intra": {"label": "GST — same state (CGST + SGST)", "india": True},
             "gst_inter": {"label": "GST — other state (IGST)", "india": True},
             "zero_rated": {"label": "Zero-rated export / SEZ (under LUT)", "india": False},
             "none": {"label": "No tax", "india": False}}
# GST state codes (place of supply)
STATES = {"01": "Jammu & Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh", "05": "Uttarakhand", "06": "Haryana", "07": "Delhi",
          "08": "Rajasthan", "09": "Uttar Pradesh", "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh", "13": "Nagaland", "14": "Manipur",
          "15": "Mizoram", "16": "Tripura", "17": "Meghalaya", "18": "Assam", "19": "West Bengal", "20": "Jharkhand", "21": "Odisha",
          "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat", "26": "Dadra & Nagar Haveli and Daman & Diu", "27": "Maharashtra",
          "29": "Karnataka", "30": "Goa", "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu", "34": "Puducherry", "35": "Andaman & Nicobar",
          "36": "Telangana", "37": "Andhra Pradesh", "38": "Ladakh", "97": "Other Territory"}
SAC = [("998361", "Advertising services"), ("998365", "Sale of advertising space / time (digital)"), ("998371", "Market research"),
       ("998313", "IT consulting and support"), ("998314", "IT design and development (websites, apps)"), ("998315", "Hosting and IT infrastructure"),
       ("998316", "IT infrastructure and network management"), ("998391", "Specialty design (branding, graphics)"), ("998394", "Original design (creative)"),
       ("998311", "Management consulting"), ("998399", "Other professional / technical services"), ("999293", "Commercial training and coaching"),
       ("998346", "Photography and videography"), ("998347", "Video production, post-production")]
UNITS = ["service", "month", "hour", "day", "page", "post", "video", "campaign", "unit", "set", "year"]
TERM_CATEGORIES = [("payment", "Payment"), ("scope", "Scope & deliverables"), ("timeline", "Timeline"), ("revisions", "Revisions"),
                   ("ip", "Ownership & IP"), ("confidentiality", "Confidentiality"), ("cancellation", "Cancellation & refunds"),
                   ("liability", "Liability & warranty"), ("ads", "Advertising spend"), ("hosting", "Hosting, domains & access"),
                   ("general", "General")]
SERVICE_TAGS = ["all", "web", "seo", "ads", "social", "branding", "video", "influencer", "retainer", "ai", "export"]
TERM_CAT_ORDER = {k: i for i, (k, _) in enumerate(TERM_CATEGORIES)}

DEFAULT_TERMS = [
    ("payment", "Advance to start", "50% of the total is payable in advance to confirm the order; the balance is due on delivery, before the final hand-over or go-live.", ["all"], ["quotation", "proforma"]),
    ("payment", "Net 15 payment", "Invoices are payable within 15 days of the invoice date by bank transfer or UPI. Please quote the invoice number with the payment.", ["all"], ["invoice"]),
    ("payment", "Monthly retainer billing", "Retainer fees are invoiced on the 1st of each month in advance and are payable within 7 days. Services may be paused if an invoice is more than 15 days overdue.", ["retainer", "social", "seo", "ads"], ["quotation", "invoice"]),
    ("payment", "Late payment", "Overdue amounts attract interest at 1.5% per month (18% p.a.) from the due date until paid, without prejudice to our other rights.", ["all"], ["invoice", "quotation"]),
    ("payment", "Taxes extra", "Prices exclude GST / VAT and any other applicable taxes, which are charged at the rate in force on the date of invoice.", ["all"], ["quotation"]),
    ("payment", "Foreign remittance", "For payments from outside India, all bank charges (including intermediary charges) are borne by the client so that we receive the invoiced amount in full. Please share the SWIFT copy / FIRC reference after payment.", ["export"], ["quotation", "invoice", "proforma"]),
    ("scope", "Scope as quoted", "The deliverables are limited to those listed in this document. Work outside this scope will be estimated separately and starts only on written approval.", ["all"], ["quotation"]),
    ("scope", "Client inputs", "Content, brand assets, access credentials and approvals must be provided by the client on time. Delays in inputs extend the timeline accordingly.", ["all"], ["quotation"]),
    ("timeline", "Timeline", "Timelines start from receipt of the advance and all required inputs, and are indicative; milestones are confirmed at kick-off.", ["all"], ["quotation"]),
    ("revisions", "Two rounds of revisions", "Each deliverable includes two rounds of revisions. Further revisions, or changes to an approved deliverable, are billed at our prevailing hourly rate.", ["web", "branding", "video", "social"], ["quotation"]),
    ("ip", "Ownership on full payment", "Ownership of final deliverables transfers to the client on receipt of full payment. Working files, source assets and unused concepts remain our property unless agreed otherwise.", ["web", "branding", "video"], ["quotation", "invoice"]),
    ("ip", "Third-party licences", "Stock images, fonts, plugins, themes and other third-party licences are procured in the client's name where possible and are subject to their own licence terms.", ["web", "branding", "video"], ["quotation"]),
    ("ip", "Portfolio rights", "We may showcase the completed work in our portfolio and marketing unless the client requests otherwise in writing before the start of the project.", ["all"], ["quotation"]),
    ("confidentiality", "Confidentiality", "Each party keeps the other's business information confidential and uses it only for this engagement. This obligation survives the completion or termination of the work.", ["all"], ["quotation"]),
    ("confidentiality", "Data protection", "Personal data shared for this engagement is processed only on the client's instructions and protected with reasonable security measures, in line with the DPDP Act 2023 and, where applicable, GDPR.", ["ads", "web", "export"], ["quotation"]),
    ("cancellation", "Cancellation", "Either party may cancel with 30 days' written notice. Work completed up to the cancellation date is billable; advances are non-refundable once work has started.", ["all"], ["quotation"]),
    ("cancellation", "Retainer notice", "Retainers run month to month and may be ended by either party with 30 days' written notice.", ["retainer", "social", "seo", "ads"], ["quotation"]),
    ("liability", "Results not guaranteed", "Marketing outcomes (rankings, reach, leads, sales) depend on factors outside our control, including platform policies and market conditions, and are not guaranteed. We commit to industry best practice and transparent reporting.", ["seo", "ads", "social", "influencer"], ["quotation"]),
    ("liability", "Limitation of liability", "Our total liability under this engagement is limited to the fees paid for the services concerned. Neither party is liable for indirect or consequential loss.", ["all"], ["quotation", "invoice"]),
    ("liability", "Warranty on websites", "Websites and apps are warranted against defects in our code for 30 days after go-live. Changes by third parties, hosting issues and platform updates are excluded; an AMC is available.", ["web"], ["quotation"]),
    ("ads", "Ad spend separate", "Media / advertising spend is paid by the client directly to the platforms (Meta, Google, LinkedIn…) or invoiced at cost in advance, and is separate from our management fee.", ["ads", "influencer"], ["quotation", "invoice"]),
    ("ads", "Influencer fees", "Influencer / creator fees are agreed per campaign and are paid in advance; usage rights are as specified in each creator agreement.", ["influencer"], ["quotation"]),
    ("hosting", "Hosting & domains", "Domains, hosting, SSL and SaaS subscriptions are billed annually in advance and renew unless cancelled 30 days before renewal. Credentials are shared with the client on request.", ["web", "retainer"], ["quotation", "invoice"]),
    ("hosting", "Accounts remain the client's", "Ad accounts, social profiles and analytics properties are created in the client's name; we work as a partner / manager and never hold them hostage.", ["ads", "social", "seo"], ["quotation"]),
    ("general", "Acceptance", "Acceptance of this quotation (by signature, e-mail confirmation, portal acceptance or payment of the advance) forms a binding agreement on these terms.", ["all"], ["quotation"]),
    ("general", "Validity", "This quotation is valid until the date shown; prices may be revised thereafter.", ["all"], ["quotation"]),
    ("general", "Governing law", "This agreement is governed by the laws of India and subject to the exclusive jurisdiction of the courts at Erode, Tamil Nadu.", ["all"], ["quotation", "invoice"]),
    ("general", "Export of services", "Services are exported under LUT without payment of IGST (Section 16, IGST Act 2017). Place of supply is outside India; the recipient is responsible for any taxes in their jurisdiction.", ["export"], ["invoice", "proforma"]),
]


def _now():
    return datetime.now(timezone.utc).isoformat()


def _today():
    return date.today().isoformat()


def _fy(d: Optional[str] = None) -> str:
    """Indian financial year label for a date: 2026-11-07 → '26-27'."""
    dt = date.fromisoformat(d) if d else date.today()
    y = dt.year if dt.month >= 4 else dt.year - 1
    return f"{y % 100:02d}-{(y + 1) % 100:02d}"


def _need(user, manage=False):
    if not has_permission(user, "billing.manage" if manage else "billing"):
        raise HTTPException(status_code=403, detail="Billing needs " + ("Billing → manage" if manage else "the Billing permission"))


def _r2(x) -> float:
    return float(round(float(x or 0) + 1e-9, 2))


# ------------------------------------------------------------------ amount in words
_ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen",
         "sixteen", "seventeen", "eighteen", "nineteen"]
_TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"]


def _words_below_1000(n: int) -> str:
    out = []
    if n >= 100:
        out.append(_ONES[n // 100] + " hundred")
        n %= 100
        if n:
            out.append("and")
    if n >= 20:
        out.append(_TENS[n // 10] + ("-" + _ONES[n % 10] if n % 10 else ""))
    elif n:
        out.append(_ONES[n])
    return " ".join(out)


def _int_words(n: int, indian: bool) -> str:
    if n == 0:
        return "zero"
    parts = []
    if indian:
        for div, name in ((10 ** 7, "crore"), (10 ** 5, "lakh"), (1000, "thousand")):
            if n >= div:
                parts.append(_words_below_1000(n // div) + " " + name)
                n %= div
    else:
        for div, name in ((10 ** 9, "billion"), (10 ** 6, "million"), (1000, "thousand")):
            if n >= div:
                parts.append(_words_below_1000(n // div) + " " + name)
                n %= div
    if n:
        parts.append(_words_below_1000(n))
    return " ".join(parts)


def amount_in_words(amount: float, currency: str) -> str:
    c = CURRENCIES.get(currency, CURRENCIES["USD"])
    amount = _r2(abs(amount))
    whole, frac = int(amount), int(round((amount - int(amount)) * 100))
    s = f"{_int_words(whole, currency == 'INR')} {c['major']}"
    if frac:
        s += f" and {_int_words(frac, False)} {c['minor']}"
    return (s[0].upper() + s[1:] + " only").replace("  ", " ")


# ------------------------------------------------------------------ company profile
DEFAULT_COMPANY = {"legal_name": "Dotindot Creative", "trade_name": "dotindot", "tagline": "AI Marketing-Tech Agency", "address1": "", "address2": "",
                   "city": "Erode", "state_code": "33", "pincode": "", "country": "India", "gstin": "", "pan": "", "cin": "", "udyam": "", "lut": "",
                   "email": "", "phone": "", "website": "dotindot.in", "logo": None, "signature": None, "signatory_name": "", "signatory_title": "",
                   "bank": {"account_name": "", "account_no": "", "ifsc": "", "bank_name": "", "branch": "", "swift": "", "bank_address": ""},
                   "upi_id": "", "upi_name": "", "certifications": [],
                   "numbering": {"quotation": "QTN", "proforma": "PI", "invoice": "INV", "credit_note": "CN"},
                   "defaults": {"validity_days": 15, "due_days": 15, "tax_rate": 18.0, "sac": "998361", "currency": "INR", "notes": "Thank you for choosing dotindot.",
                                "show_qr": True, "show_certs": True}}
MAX_IMG = 400 * 1024


def _check_image(data_url: Optional[str], what: str) -> Optional[str]:
    if not data_url:
        return None
    m = re.match(r"^data:image/(png|jpeg|jpg|webp|svg\+xml);base64,([A-Za-z0-9+/=\s]+)$", data_url)
    if not m:
        raise HTTPException(status_code=400, detail=f"{what} must be a PNG, JPG, WebP or SVG image")
    try:
        raw = base64.b64decode(m.group(2), validate=False)
    except Exception:
        raise HTTPException(status_code=400, detail=f"{what} image is corrupt")
    if len(raw) > MAX_IMG:
        raise HTTPException(status_code=400, detail=f"{what} must be under 400 KB — export it smaller")
    return data_url


async def company_profile() -> dict:
    d = await db.settings.find_one({"id": "company"}, {"_id": 0}) or {}
    out = {**DEFAULT_COMPANY, **{k: v for k, v in d.items() if k not in ("id", "updated_at", "updated_by")}}
    out["bank"] = {**DEFAULT_COMPANY["bank"], **(d.get("bank") or {})}
    out["numbering"] = {**DEFAULT_COMPANY["numbering"], **(d.get("numbering") or {})}
    out["defaults"] = {**DEFAULT_COMPANY["defaults"], **(d.get("defaults") or {})}
    out["state"] = STATES.get(out.get("state_code") or "", "")
    return out


class CompanyIn(BaseModel):
    legal_name: Optional[str] = None
    trade_name: Optional[str] = None
    tagline: Optional[str] = None
    address1: Optional[str] = None
    address2: Optional[str] = None
    city: Optional[str] = None
    state_code: Optional[str] = None
    pincode: Optional[str] = None
    country: Optional[str] = None
    gstin: Optional[str] = None
    pan: Optional[str] = None
    cin: Optional[str] = None
    udyam: Optional[str] = None
    lut: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    website: Optional[str] = None
    logo: Optional[str] = None
    signature: Optional[str] = None
    signatory_name: Optional[str] = None
    signatory_title: Optional[str] = None
    bank: Optional[Dict[str, Any]] = None
    upi_id: Optional[str] = None
    upi_name: Optional[str] = None
    certifications: Optional[List[Dict[str, Any]]] = None
    numbering: Optional[Dict[str, str]] = None
    defaults: Optional[Dict[str, Any]] = None


@router.get("/billing/company")
async def get_company(user: dict = Depends(get_current_user)):
    _need(user)
    return await company_profile()


@router.put("/billing/company")
async def save_company(body: CompanyIn, user: dict = Depends(get_current_user)):
    _need(user, manage=True)
    sets = {}
    sent = body.model_fields_set
    for k in ("legal_name", "trade_name", "tagline", "address1", "address2", "city", "pincode", "country", "email", "phone", "website",
              "signatory_name", "signatory_title", "upi_name", "cin", "udyam", "lut"):
        if k in sent:
            sets[k] = (getattr(body, k) or "").strip()[:200]
    if "gstin" in sent:
        g = (body.gstin or "").strip().upper()
        if g and not re.fullmatch(r"\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]", g):
            raise HTTPException(status_code=400, detail="GSTIN should be 15 characters like 33ABCDE1234F1Z5")
        sets["gstin"] = g
        if g and "state_code" not in sent:
            sets["state_code"] = g[:2]
    if "pan" in sent:
        p = (body.pan or "").strip().upper()
        if p and not re.fullmatch(r"[A-Z]{5}\d{4}[A-Z]", p):
            raise HTTPException(status_code=400, detail="PAN should look like ABCDE1234F")
        sets["pan"] = p
    if "state_code" in sent:
        if body.state_code and body.state_code not in STATES:
            raise HTTPException(status_code=400, detail="Unknown GST state code")
        sets["state_code"] = body.state_code or ""
    if "upi_id" in sent:
        u = (body.upi_id or "").strip()
        if u and not re.fullmatch(r"[\w.\-]{2,}@[A-Za-z]{2,}", u):
            raise HTTPException(status_code=400, detail="UPI id looks like name@bank")
        sets["upi_id"] = u
    if "logo" in sent:
        sets["logo"] = _check_image(body.logo, "Logo")
    if "signature" in sent:
        sets["signature"] = _check_image(body.signature, "Signature")
    if body.bank is not None:
        bank = {k: str(body.bank.get(k) or "").strip()[:120] for k in DEFAULT_COMPANY["bank"]}
        if bank["ifsc"] and not re.fullmatch(r"[A-Z]{4}0[A-Z0-9]{6}", bank["ifsc"].upper()):
            raise HTTPException(status_code=400, detail="IFSC should look like HDFC0001234")
        bank["ifsc"] = bank["ifsc"].upper()
        bank["swift"] = bank["swift"].upper()
        sets["bank"] = bank
    if body.certifications is not None:
        certs = []
        for c in body.certifications[:12]:
            certs.append({"id": c.get("id") or str(uuid.uuid4()), "name": str(c.get("name") or "").strip()[:80], "issuer": str(c.get("issuer") or "").strip()[:80],
                          "number": str(c.get("number") or "").strip()[:60], "valid_till": c.get("valid_till") or None,
                          "image": _check_image(c.get("image"), f"Certification '{c.get('name') or ''}'"), "show_on_docs": bool(c.get("show_on_docs", True))})
            if not certs[-1]["name"]:
                raise HTTPException(status_code=400, detail="Each certification needs a name")
        sets["certifications"] = certs
    if body.numbering is not None:
        num = {}
        for t in DOC_TYPES:
            v = re.sub(r"[^A-Za-z0-9\-]", "", str(body.numbering.get(t) or DOC_TYPES[t]["prefix"]))[:8].upper()
            num[t] = v or DOC_TYPES[t]["prefix"]
        sets["numbering"] = num
    if body.defaults is not None:
        d = {**DEFAULT_COMPANY["defaults"], **(await company_profile())["defaults"]}
        for k in ("validity_days", "due_days"):
            if k in body.defaults:
                try:
                    d[k] = max(0, min(365, int(body.defaults[k])))
                except (TypeError, ValueError):
                    raise HTTPException(status_code=400, detail=f"{k.replace('_', ' ')} must be a number of days")
        if "tax_rate" in body.defaults:
            try:
                d["tax_rate"] = float(body.defaults["tax_rate"])
            except (TypeError, ValueError):
                raise HTTPException(status_code=400, detail="Tax rate must be a number")
            if not 0 <= d["tax_rate"] <= 50:
                raise HTTPException(status_code=400, detail="Tax rate must be between 0 and 50")
        if "sac" in body.defaults:
            d["sac"] = str(body.defaults["sac"] or "")[:8]
        if "currency" in body.defaults and body.defaults["currency"] in CURRENCIES:
            d["currency"] = body.defaults["currency"]
        if "notes" in body.defaults:
            d["notes"] = str(body.defaults["notes"] or "")[:500]
        for k in ("show_qr", "show_certs"):
            if k in body.defaults:
                d[k] = bool(body.defaults[k])
        sets["defaults"] = d
    await db.settings.update_one({"id": "company"}, {"$set": {"id": "company", **sets, "updated_at": _now(), "updated_by": user["name"]}}, upsert=True)
    await log_activity(user, "company_profile_updated", "settings", "company", ", ".join(k for k in sets if k not in ("logo", "signature")))
    return await company_profile()


# ------------------------------------------------------------------ terms library
async def ensure_default_terms():
    if await db.billing_terms.count_documents({}):
        return
    now = _now()
    docs = [{"id": f"term-{i + 1:02d}", "category": cat, "title": title, "text": text, "tags": tags, "default_for": dfor, "order": i, "active": True,
             "created_at": now, "updated_at": now, "builtin": True} for i, (cat, title, text, tags, dfor) in enumerate(DEFAULT_TERMS)]
    await db.billing_terms.insert_many(docs)


class TermIn(BaseModel):
    category: str = "general"
    title: str
    text: str
    tags: List[str] = ["all"]
    default_for: List[str] = []
    active: bool = True
    order: Optional[int] = None


def _clean_term(body: TermIn) -> dict:
    if body.category not in TERM_CAT_ORDER:
        raise HTTPException(status_code=400, detail="Unknown term category")
    if not body.title.strip() or not body.text.strip():
        raise HTTPException(status_code=400, detail="A term needs a title and the clause text")
    return {"category": body.category, "title": body.title.strip()[:80], "text": body.text.strip()[:1500],
            "tags": [t for t in body.tags if t in SERVICE_TAGS] or ["all"], "default_for": [t for t in body.default_for if t in DOC_TYPES], "active": body.active}


@router.get("/billing/terms")
async def list_terms(user: dict = Depends(get_current_user)):
    _need(user)
    await ensure_default_terms()
    rows = await db.billing_terms.find({}, {"_id": 0}).to_list(500)
    rows.sort(key=lambda t: (TERM_CAT_ORDER.get(t["category"], 99), t.get("order", 0), t["title"]))
    return rows


@router.post("/billing/terms")
async def create_term(body: TermIn, user: dict = Depends(get_current_user)):
    _need(user, manage=True)
    await ensure_default_terms()
    n = await db.billing_terms.count_documents({})
    doc = {"id": str(uuid.uuid4()), **_clean_term(body), "order": body.order if body.order is not None else n, "builtin": False, "created_at": _now(), "updated_at": _now()}
    await db.billing_terms.insert_one(dict(doc))
    await log_activity(user, "billing_term_created", "billing_term", doc["id"], doc["title"])
    return doc


@router.put("/billing/terms/{tid}")
async def update_term(tid: str, body: TermIn, user: dict = Depends(get_current_user)):
    _need(user, manage=True)
    cur = await db.billing_terms.find_one({"id": tid}, {"_id": 0})
    if not cur:
        raise HTTPException(status_code=404, detail="Term not found")
    sets = {**_clean_term(body), "updated_at": _now()}
    if body.order is not None:
        sets["order"] = body.order
    await db.billing_terms.update_one({"id": tid}, {"$set": sets})
    return {**cur, **sets}


@router.delete("/billing/terms/{tid}")
async def delete_term(tid: str, user: dict = Depends(get_current_user)):
    _need(user, manage=True)
    r = await db.billing_terms.delete_one({"id": tid})
    if not r.deleted_count:
        raise HTTPException(status_code=404, detail="Term not found")
    await log_activity(user, "billing_term_deleted", "billing_term", tid)
    return {"ok": True}


# ------------------------------------------------------------------ meta
@router.get("/billing/meta")
async def meta(user: dict = Depends(get_current_user)):
    _need(user)
    await ensure_default_terms()
    co = await company_profile()
    scope = await scoped_client_ids(user)
    cq = {"id": {"$in": scope}} if scope is not None else {}
    clients = await db.clients.find(cq, {"_id": 0, "id": 1, "name": 1, "company": 1, "status": 1, "currency": 1, "state": 1, "city": 1, "contacts": 1, "billing": 1}).sort("name", 1).to_list(1000)
    for c in clients:
        prim = next((x for x in (c.get("contacts") or []) if x.get("is_primary")), (c.get("contacts") or [{}])[0] if c.get("contacts") else {})
        c["email"], c["phone"] = prim.get("email", ""), prim.get("phone", "")
        c.pop("contacts", None)
    return {"types": {k: v["label"] for k, v in DOC_TYPES.items()}, "statuses": STATUSES, "currencies": CURRENCIES, "tax_modes": TAX_MODES, "states": STATES,
            "sac": SAC, "units": UNITS, "term_categories": TERM_CATEGORIES, "service_tags": SERVICE_TAGS, "clients": clients,
            "company": {k: co[k] for k in ("legal_name", "trade_name", "state_code", "gstin", "upi_id", "lut", "defaults", "numbering")},
            "company_ready": bool(co.get("gstin") or co.get("pan")) and bool(co.get("address1")),
            "can_manage": has_permission(user, "billing.manage"), "can_delete": has_permission(user, "billing.delete"), "today": _today(), "fy": _fy()}


# ------------------------------------------------------------------ documents
class LineIn(BaseModel):
    description: str
    details: Optional[str] = ""
    sac: Optional[str] = ""
    qty: float = Field(1, ge=0, le=1e7, allow_inf_nan=False)
    unit: Optional[str] = "service"
    unit_price: float = Field(0, ge=0, le=1e10, allow_inf_nan=False)
    discount_pct: float = Field(0, ge=0, le=100, allow_inf_nan=False)
    tax_rate: Optional[float] = Field(None, ge=0, le=50, allow_inf_nan=False)


class PartyIn(BaseModel):
    name: str = ""
    company: Optional[str] = ""
    email: Optional[str] = ""
    phone: Optional[str] = ""
    address: Optional[str] = ""
    city: Optional[str] = ""
    state_code: Optional[str] = ""
    country: Optional[str] = "India"
    gstin: Optional[str] = ""
    tax_id: Optional[str] = ""      # VAT / TRN / EIN for foreign clients


class DocIn(BaseModel):
    type: str = "quotation"
    client_id: Optional[str] = None
    lead_id: Optional[str] = None
    project_id: Optional[str] = None
    title: Optional[str] = ""
    bill_to: PartyIn = PartyIn()
    date: Optional[str] = None
    valid_until: Optional[str] = None
    due_date: Optional[str] = None
    currency: str = "INR"
    fx_rate: Optional[float] = Field(None, gt=0, le=1e6, allow_inf_nan=False)   # 1 unit of currency = fx_rate INR
    tax_mode: str = "gst_intra"
    place_of_supply: Optional[str] = ""
    items: List[LineIn] = []
    discount_pct: float = Field(0, ge=0, le=100, allow_inf_nan=False)
    discount_amount: float = Field(0, ge=0, le=1e12, allow_inf_nan=False)
    round_off: bool = True
    term_ids: List[str] = []
    custom_terms: List[str] = []
    notes: Optional[str] = ""
    po_number: Optional[str] = ""
    reference: Optional[str] = ""
    service_tags: List[str] = []
    show_qr: Optional[bool] = None
    show_certs: Optional[bool] = None
    source_id: Optional[str] = None


def compute_totals(items: List[dict], currency: str, tax_mode: str, discount_pct: float, discount_amount: float, round_off: bool, default_rate: float) -> dict:
    lines, subtotal = [], 0.0
    for it in items:
        gross = _r2(float(it["qty"]) * float(it["unit_price"]))
        disc = _r2(gross * float(it.get("discount_pct") or 0) / 100)
        net = _r2(gross - disc)
        rate = float(it["tax_rate"]) if it.get("tax_rate") is not None else default_rate
        lines.append({**it, "gross": gross, "discount": disc, "net": net, "tax_rate": rate if tax_mode in ("gst_intra", "gst_inter") else 0.0})
        subtotal += net
    subtotal = _r2(subtotal)
    overall = _r2(discount_amount or subtotal * (discount_pct or 0) / 100)
    overall = min(overall, subtotal)
    taxable = _r2(subtotal - overall)
    factor = (taxable / subtotal) if subtotal else 0
    cgst = sgst = igst = 0.0
    tax_rows: Dict[str, dict] = {}
    for ln in lines:
        base = _r2(ln["net"] * factor)
        ln["taxable"] = base
        t = _r2(base * ln["tax_rate"] / 100)
        ln["tax"] = t
        key = f"{ln.get('sac') or '-'}|{ln['tax_rate']}"
        row = tax_rows.setdefault(key, {"sac": ln.get("sac") or "", "rate": ln["tax_rate"], "taxable": 0.0, "tax": 0.0})
        row["taxable"] = _r2(row["taxable"] + base)
        row["tax"] = _r2(row["tax"] + t)
        if tax_mode == "gst_intra":
            cgst += t / 2
            sgst += t / 2
        elif tax_mode == "gst_inter":
            igst += t
    cgst, sgst, igst = _r2(cgst), _r2(sgst), _r2(igst)
    tax_total = _r2(cgst + sgst + igst)
    gross_total = _r2(taxable + tax_total)
    rounded = float(round(gross_total)) if (round_off and currency == "INR") else gross_total
    return {"items": lines, "subtotal": subtotal, "discount_total": overall, "taxable": taxable, "cgst": cgst, "sgst": sgst, "igst": igst,
            "tax_total": tax_total, "round_off_amount": _r2(rounded - gross_total), "total": rounded, "tax_summary": list(tax_rows.values()),
            "amount_words": amount_in_words(rounded, currency)}


async def next_number(doc_type: str, fy: str, prefix: str) -> str:
    c = await db.counters.find_one_and_update({"_id": f"billing-{doc_type}-{fy}"}, {"$inc": {"seq": 1}}, upsert=True, return_document=ReturnDocument.AFTER)
    return f"{prefix}/{fy}/{c['seq']:04d}"


async def _client_ok(user: dict, client_id: Optional[str]):
    if not client_id:
        return None
    c = await db.clients.find_one({"id": client_id}, {"_id": 0, "id": 1, "name": 1, "company": 1})
    if not c:
        raise HTTPException(status_code=404, detail="Client not found")
    scope = await scoped_client_ids(user)
    if scope is not None and client_id not in scope:
        raise HTTPException(status_code=403, detail="This client is outside your locations")
    return c


def _clean_party(p: PartyIn, tax_mode: str) -> dict:
    d = {k: (getattr(p, k) or "").strip()[:200] for k in PartyIn.model_fields}
    d["gstin"] = d["gstin"].upper()
    if d["gstin"] and not re.fullmatch(r"\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]", d["gstin"]):
        raise HTTPException(status_code=400, detail="Client GSTIN should be 15 characters like 27ABCDE1234F1Z5")
    if d["state_code"] and d["state_code"] not in STATES:
        raise HTTPException(status_code=400, detail="Unknown client state code")
    if not d["state_code"] and d["gstin"]:
        d["state_code"] = d["gstin"][:2]
    if not d["name"] and not d["company"]:
        raise HTTPException(status_code=400, detail="Bill to: add the client's name or company")
    return d


def _date_ok(v: Optional[str], what: str, required=False) -> Optional[str]:
    if not v:
        if required:
            raise HTTPException(status_code=400, detail=f"{what} is required")
        return None
    try:
        return date.fromisoformat(str(v)[:10]).isoformat()
    except ValueError:
        raise HTTPException(status_code=400, detail=f"{what} must look like 2026-11-07")


async def _build(body: DocIn, user: dict, existing: Optional[dict] = None) -> dict:
    if body.type not in DOC_TYPES:
        raise HTTPException(status_code=400, detail="Unknown document type")
    if body.currency not in CURRENCIES:
        raise HTTPException(status_code=400, detail="Unsupported currency")
    if body.tax_mode not in TAX_MODES:
        raise HTTPException(status_code=400, detail="Unknown tax mode")
    co = await company_profile()
    dft = co["defaults"]
    client = await _client_ok(user, body.client_id)
    bill_to = _clean_party(body.bill_to, body.tax_mode)
    if body.currency != "INR" and body.tax_mode in ("gst_intra", "gst_inter"):
        raise HTTPException(status_code=400, detail="GST applies to INR documents — use 'Zero-rated export' or 'No tax' for foreign currency")
    if body.currency != "INR" and not body.fx_rate:
        raise HTTPException(status_code=400, detail=f"Add the exchange rate (1 {body.currency} = ? INR) — it's needed for the books")
    if body.tax_mode == "gst_intra" and bill_to["state_code"] and co.get("state_code") and bill_to["state_code"] != co["state_code"]:
        raise HTTPException(status_code=400, detail=f"The client is in {STATES[bill_to['state_code']]} — use 'GST — other state (IGST)'")
    if body.tax_mode == "gst_inter" and bill_to["state_code"] and co.get("state_code") and bill_to["state_code"] == co["state_code"]:
        raise HTTPException(status_code=400, detail="The client is in your state — use 'GST — same state (CGST + SGST)'")
    if not body.items:
        raise HTTPException(status_code=400, detail="Add at least one line item")
    items = []
    for it in body.items[:60]:
        if not it.description.strip():
            raise HTTPException(status_code=400, detail="Every line needs a description")
        items.append({"id": str(uuid.uuid4()), "description": it.description.strip()[:200], "details": (it.details or "").strip()[:800],
                      "sac": (it.sac or "").strip()[:8] or (dft["sac"] if body.tax_mode in ("gst_intra", "gst_inter") else ""),
                      "qty": float(it.qty), "unit": (it.unit or "service")[:20], "unit_price": float(it.unit_price),
                      "discount_pct": float(it.discount_pct or 0), "tax_rate": it.tax_rate})
    totals = compute_totals(items, body.currency, body.tax_mode, body.discount_pct, body.discount_amount, body.round_off, float(dft["tax_rate"]))
    d0 = _date_ok(body.date, "Date") or _today()
    fy = _fy(d0)
    terms = []
    if body.term_ids:
        lib = {t["id"]: t for t in await db.billing_terms.find({"id": {"$in": body.term_ids}}, {"_id": 0}).to_list(200)}
        for tid in body.term_ids:
            if tid in lib:
                terms.append({"id": tid, "category": lib[tid]["category"], "title": lib[tid]["title"], "text": lib[tid]["text"]})
    for ct in body.custom_terms[:20]:
        if str(ct).strip():
            terms.append({"id": None, "category": "general", "title": "", "text": str(ct).strip()[:1500]})
    doc = {"type": body.type, "client_id": body.client_id, "client_name": (client or {}).get("name") or bill_to["company"] or bill_to["name"],
           "lead_id": body.lead_id, "project_id": body.project_id, "title": (body.title or "").strip()[:160], "bill_to": bill_to, "date": d0, "fy": fy,
           "valid_until": _date_ok(body.valid_until, "Valid until") if body.type == "quotation" else None,
           "due_date": _date_ok(body.due_date, "Due date") if body.type in ("invoice", "proforma") else None,
           "currency": body.currency, "fx_rate": float(body.fx_rate) if body.currency != "INR" else 1.0, "tax_mode": body.tax_mode,
           "place_of_supply": body.place_of_supply or bill_to["state_code"] or ("96" if body.tax_mode == "zero_rated" else co.get("state_code", "")),
           "discount_pct": float(body.discount_pct or 0), "discount_amount": float(body.discount_amount or 0), "round_off": bool(body.round_off),
           **totals, "inr_total": _r2(totals["total"] * (float(body.fx_rate) if body.currency != "INR" else 1.0)),
           "terms": terms, "notes": (body.notes if body.notes is not None else dft["notes"])[:1000], "po_number": (body.po_number or "").strip()[:60],
           "reference": (body.reference or "").strip()[:120], "service_tags": [t for t in body.service_tags if t in SERVICE_TAGS],
           "show_qr": dft["show_qr"] if body.show_qr is None else body.show_qr, "show_certs": dft["show_certs"] if body.show_certs is None else body.show_certs,
           "source_id": body.source_id or (existing or {}).get("source_id"), "updated_at": _now(), "updated_by": user["name"]}
    if body.type == "quotation" and not doc["valid_until"]:
        doc["valid_until"] = (date.fromisoformat(d0) + timedelta(days=int(dft["validity_days"]))).isoformat()
    if body.type in ("invoice", "proforma") and not doc["due_date"]:
        doc["due_date"] = (date.fromisoformat(d0) + timedelta(days=int(dft["due_days"]))).isoformat()
    return doc


def _derive_status(d: dict) -> str:
    """Invoices: paid / part_paid / overdue follow the payments and the due date."""
    if d["type"] != "invoice" or d.get("status") in ("draft", "cancelled"):
        return d.get("status", "draft")
    paid = _r2(sum(p["amount"] for p in d.get("payments") or []))
    if paid >= d["total"] - 0.005 and d["total"] > 0:
        return "paid"
    if paid > 0:
        return "part_paid"
    if d.get("due_date") and d["due_date"] < _today():
        return "overdue"
    return "sent"


def _public(d: dict) -> dict:
    out = {k: v for k, v in d.items() if k != "share_token"}
    paid = _r2(sum(p["amount"] for p in d.get("payments") or []))
    out["paid"] = paid
    out["balance"] = _r2(d["total"] - paid) if d["type"] in ("invoice", "proforma") else None
    out["type_label"] = DOC_TYPES[d["type"]]["label"]
    out["days_overdue"] = (date.today() - date.fromisoformat(d["due_date"])).days if (d["type"] == "invoice" and d.get("due_date") and out["balance"] and d["status"] not in ("draft", "cancelled") and d["due_date"] < _today()) else 0
    return out


async def _get(user: dict, did: str) -> dict:
    d = await db.billing_docs.find_one({"id": did}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Document not found")
    if d.get("client_id"):
        await _client_ok(user, d["client_id"])
    return d


@router.get("/billing/docs")
async def list_docs(type: Optional[str] = None, status: Optional[str] = None, client_id: Optional[str] = None, q: Optional[str] = None,
                    fy: Optional[str] = None, limit: int = 500, user: dict = Depends(get_current_user)):
    _need(user)
    query: dict = {}
    if type in DOC_TYPES:
        query["type"] = type
    if status:
        query["status"] = {"$in": status.split(",")}
    if client_id:
        await _client_ok(user, client_id)
        query["client_id"] = client_id
    else:
        scope = await scoped_client_ids(user)
        if scope is not None:
            query["$or"] = [{"client_id": {"$in": scope}}, {"client_id": None}]
    if fy:
        query["fy"] = fy
    if q:
        rx = {"$regex": re.escape(q.strip()), "$options": "i"}
        query["$and"] = [{"$or": [{"number": rx}, {"client_name": rx}, {"title": rx}, {"bill_to.company": rx}, {"bill_to.name": rx}, {"po_number": rx}]}]
    rows = await db.billing_docs.find(query, {"_id": 0}).sort([("date", -1), ("created_at", -1)]).to_list(max(1, min(limit, 2000)))
    changed = False
    for r in rows:
        if r["type"] == "quotation" and r["status"] in ("sent",) and r.get("valid_until") and r["valid_until"] < _today():
            r["status"] = "expired"
            await db.billing_docs.update_one({"id": r["id"]}, {"$set": {"status": "expired"}})
        s = _derive_status(r)
        if s != r["status"]:
            r["status"] = s
            await db.billing_docs.update_one({"id": r["id"]}, {"$set": {"status": s}})
    return [_public(r) for r in rows]


@router.post("/billing/docs")
async def create_doc(body: DocIn, user: dict = Depends(get_current_user)):
    _need(user, manage=True)
    co = await company_profile()
    d = await _build(body, user)
    d.update({"id": str(uuid.uuid4()), "number": await next_number(d["type"], d["fy"], co["numbering"][d["type"]]), "status": "draft", "payments": [],
              "share_token": secrets.token_urlsafe(18), "created_by": user["id"], "created_by_name": user["name"], "created_at": _now(), "history": [{"at": _now(), "by": user["name"], "event": "created"}]})
    await db.billing_docs.insert_one(dict(d))
    if d.get("client_id"):
        await db.clients.update_one({"id": d["client_id"]}, {"$set": {"billing": d["bill_to"]}})
    await log_activity(user, "billing_doc_created", "billing_doc", d["id"], f"{d['number']} · {d['client_name']} · {d['currency']} {d['total']:,.2f}")
    return _public(d)


@router.get("/billing/docs/{did}")
async def get_doc(did: str, user: dict = Depends(get_current_user)):
    _need(user)
    d = await _get(user, did)
    s = _derive_status(d)
    if s != d["status"]:
        d["status"] = s
        await db.billing_docs.update_one({"id": did}, {"$set": {"status": s}})
    await db.notifications_outbox.update_many({"kind": "billing", "doc_id": did}, {"$set": {"seen": True}})
    out = _public(d)
    out["share_url_path"] = f"/share/{d['share_token']}" if has_permission(user, "billing.manage") else None
    if d.get("source_id"):
        src = await db.billing_docs.find_one({"id": d["source_id"]}, {"_id": 0, "id": 1, "number": 1, "type": 1})
        out["source"] = src
    out["children"] = await db.billing_docs.find({"source_id": did}, {"_id": 0, "id": 1, "number": 1, "type": 1, "status": 1, "total": 1}).to_list(50)
    return out


@router.put("/billing/docs/{did}")
async def update_doc(did: str, body: DocIn, user: dict = Depends(get_current_user)):
    _need(user, manage=True)
    cur = await _get(user, did)
    if cur["status"] in ("paid", "cancelled", "converted") or (cur["type"] == "invoice" and cur.get("payments")):
        raise HTTPException(status_code=400, detail="This document can't be edited any more — issue a credit note or duplicate it")
    body.type = cur["type"]
    d = await _build(body, user, cur)
    d["history"] = (cur.get("history") or []) + [{"at": _now(), "by": user["name"], "event": "edited"}]
    if cur["status"] == "draft":
        pass
    await db.billing_docs.update_one({"id": did}, {"$set": d})
    if d.get("client_id"):
        await db.clients.update_one({"id": d["client_id"]}, {"$set": {"billing": d["bill_to"]}})
    await log_activity(user, "billing_doc_updated", "billing_doc", did, cur["number"])
    return _public({**cur, **d})


class StatusIn(BaseModel):
    status: str
    note: Optional[str] = ""


@router.post("/billing/docs/{did}/status")
async def set_status(did: str, body: StatusIn, user: dict = Depends(get_current_user)):
    _need(user, manage=True)
    d = await _get(user, did)
    allowed = {"quotation": {"sent", "accepted", "rejected", "cancelled", "draft"}, "proforma": {"sent", "paid", "cancelled", "draft"},
               "invoice": {"sent", "cancelled", "draft"}, "credit_note": {"issued", "cancelled", "draft"}}[d["type"]]
    if body.status not in allowed:
        raise HTTPException(status_code=400, detail=f"A {DOC_TYPES[d['type']]['label'].lower()} can't be marked {body.status}")
    if body.status == "draft" and d["status"] not in ("sent",):
        raise HTTPException(status_code=400, detail="Only a sent document can go back to draft")
    if d["type"] == "invoice" and body.status == "cancelled" and d.get("payments"):
        raise HTTPException(status_code=400, detail="This invoice has payments — issue a credit note instead")
    sets = {"status": body.status, "updated_at": _now()}
    if body.status == "sent" and not d.get("sent_at"):
        sets["sent_at"] = _now()
    if body.status == "accepted":
        sets["accepted_at"], sets["accepted_by"] = _now(), user["name"]
    hist = (d.get("history") or []) + [{"at": _now(), "by": user["name"], "event": body.status, "note": (body.note or "")[:300]}]
    sets["history"] = hist
    await db.billing_docs.update_one({"id": did}, {"$set": sets})
    await log_activity(user, f"billing_doc_{body.status}", "billing_doc", did, d["number"])
    return _public({**d, **sets})


class ConvertIn(BaseModel):
    to: str                     # proforma | invoice | credit_note
    date: Optional[str] = None
    reason: Optional[str] = ""  # credit notes


@router.post("/billing/docs/{did}/convert")
async def convert_doc(did: str, body: ConvertIn, user: dict = Depends(get_current_user)):
    _need(user, manage=True)
    src = await _get(user, did)
    ok = {"quotation": ("proforma", "invoice"), "proforma": ("invoice",), "invoice": ("credit_note",)}.get(src["type"], ())
    if body.to not in ok:
        raise HTTPException(status_code=400, detail=f"A {DOC_TYPES[src['type']]['label'].lower()} can become: {', '.join(DOC_TYPES[t]['label'].lower() for t in ok) or 'nothing'}")
    if body.to == "credit_note":
        if src["status"] in ("draft", "cancelled"):
            raise HTTPException(status_code=400, detail="Credit notes are issued against sent invoices")
    elif src["status"] not in ("sent", "accepted", "paid"):
        raise HTTPException(status_code=400, detail={"draft": "Send the document first", "expired": "This quotation has expired — duplicate it to re-issue", "rejected": "This quotation was rejected",
                                                     "converted": "Already converted", "cancelled": "This document is cancelled"}.get(src["status"], "This document can't be converted"))
    co = await company_profile()
    d0 = _date_ok(body.date, "Date") or _today()
    fy = _fy(d0)
    new = {k: v for k, v in src.items() if k not in ("id", "number", "status", "payments", "share_token", "history", "created_at", "created_by", "created_by_name",
                                                       "sent_at", "accepted_at", "accepted_by", "valid_until", "due_date", "fy", "date", "source_id")}
    new.update({"id": str(uuid.uuid4()), "type": body.to, "number": await next_number(body.to, fy, co["numbering"][body.to]), "status": "draft", "payments": [],
                "share_token": secrets.token_urlsafe(18), "date": d0, "fy": fy, "source_id": src["id"], "source_number": src["number"],
                "created_by": user["id"], "created_by_name": user["name"], "created_at": _now(), "updated_at": _now(), "updated_by": user["name"],
                "history": [{"at": _now(), "by": user["name"], "event": f"created from {src['number']}"}]})
    if body.to in ("invoice", "proforma"):
        new["due_date"] = (date.fromisoformat(d0) + timedelta(days=int(co["defaults"]["due_days"]))).isoformat()
        # terms meant for quotations only don't carry over
        lib = {t["id"]: t for t in await db.billing_terms.find({"id": {"$in": [t["id"] for t in src.get("terms") or [] if t.get("id")]}}, {"_id": 0}).to_list(200)}
        new["terms"] = [t for t in src.get("terms") or [] if not t.get("id") or body.to in (lib.get(t["id"], {}).get("default_for") or [body.to])]
    if body.to == "credit_note":
        new["reason"] = (body.reason or "").strip()[:300]
        new["terms"] = []
    await db.billing_docs.insert_one(dict(new))
    sets = {"updated_at": _now(), "history": (src.get("history") or []) + [{"at": _now(), "by": user["name"], "event": f"converted to {new['number']}"}]}
    if src["type"] in ("quotation", "proforma") and body.to in ("invoice", "proforma"):
        sets["status"] = "converted"
    await db.billing_docs.update_one({"id": did}, {"$set": sets})
    await log_activity(user, "billing_doc_converted", "billing_doc", new["id"], f"{src['number']} → {new['number']}")
    return _public(new)


@router.post("/billing/docs/{did}/duplicate")
async def duplicate_doc(did: str, user: dict = Depends(get_current_user)):
    _need(user, manage=True)
    src = await _get(user, did)
    co = await company_profile()
    d0 = _today()
    new = {k: v for k, v in src.items() if k not in ("id", "number", "status", "payments", "share_token", "history", "created_at", "created_by", "created_by_name",
                                                       "sent_at", "accepted_at", "accepted_by", "source_id", "source_number", "reason")}
    new.update({"id": str(uuid.uuid4()), "number": await next_number(src["type"], _fy(d0), co["numbering"][src["type"]]), "status": "draft", "payments": [], "date": d0, "fy": _fy(d0),
                "share_token": secrets.token_urlsafe(18), "created_by": user["id"], "created_by_name": user["name"], "created_at": _now(), "updated_at": _now(),
                "history": [{"at": _now(), "by": user["name"], "event": f"duplicated from {src['number']}"}]})
    if src["type"] == "quotation":
        new["valid_until"] = (date.today() + timedelta(days=int(co["defaults"]["validity_days"]))).isoformat()
    else:
        new["due_date"] = (date.today() + timedelta(days=int(co["defaults"]["due_days"]))).isoformat()
    await db.billing_docs.insert_one(dict(new))
    return _public(new)


class PaymentIn(BaseModel):
    date: Optional[str] = None
    amount: float = Field(..., gt=0, le=1e12, allow_inf_nan=False)
    method: str = "bank"      # bank | upi | card | cash | cheque | paypal | wise | other
    reference: Optional[str] = ""
    note: Optional[str] = ""
    inr_amount: Optional[float] = Field(None, ge=0, le=1e13, allow_inf_nan=False)   # what actually landed in INR (foreign payments)


@router.post("/billing/docs/{did}/payments")
async def add_payment(did: str, body: PaymentIn, user: dict = Depends(get_current_user)):
    _need(user, manage=True)
    d = await _get(user, did)
    if d["type"] not in ("invoice", "proforma") or d["status"] in ("draft", "cancelled"):
        raise HTTPException(status_code=400, detail="Payments are recorded against sent invoices and proforma invoices")
    paid = _r2(sum(p["amount"] for p in d.get("payments") or []))
    if paid + body.amount > d["total"] + 0.005:
        raise HTTPException(status_code=400, detail=f"That's more than the balance of {d['currency']} {_r2(d['total'] - paid):,.2f}")
    p = {"id": str(uuid.uuid4()), "date": _date_ok(body.date, "Payment date") or _today(), "amount": _r2(body.amount),
         "method": body.method if body.method in ("bank", "upi", "card", "cash", "cheque", "paypal", "wise", "other") else "other",
         "reference": (body.reference or "").strip()[:80], "note": (body.note or "").strip()[:300],
         "inr_amount": _r2(body.inr_amount) if body.inr_amount is not None else _r2(body.amount * (d.get("fx_rate") or 1)), "by": user["name"], "at": _now()}
    pays = (d.get("payments") or []) + [p]
    d2 = {**d, "payments": pays}
    sets = {"payments": pays, "status": _derive_status(d2) if d["type"] == "invoice" else ("paid" if _r2(sum(x["amount"] for x in pays)) >= d["total"] - 0.005 else d["status"]),
            "updated_at": _now(), "history": (d.get("history") or []) + [{"at": _now(), "by": user["name"], "event": f"payment {d['currency']} {p['amount']:,.2f} ({p['method']})"}]}
    await db.billing_docs.update_one({"id": did}, {"$set": sets})
    await log_activity(user, "billing_payment_recorded", "billing_doc", did, f"{d['number']} · {d['currency']} {p['amount']:,.2f}")
    return _public({**d, **sets})


@router.delete("/billing/docs/{did}/payments/{pid}")
async def remove_payment(did: str, pid: str, user: dict = Depends(get_current_user)):
    _need(user, manage=True)
    d = await _get(user, did)
    pays = [p for p in d.get("payments") or [] if p["id"] != pid]
    if len(pays) == len(d.get("payments") or []):
        raise HTTPException(status_code=404, detail="Payment not found")
    d2 = {**d, "payments": pays, "status": "sent" if d["status"] in ("paid", "part_paid", "overdue") else d["status"]}
    sets = {"payments": pays, "status": _derive_status(d2), "updated_at": _now(), "history": (d.get("history") or []) + [{"at": _now(), "by": user["name"], "event": "payment removed"}]}
    await db.billing_docs.update_one({"id": did}, {"$set": sets})
    await log_activity(user, "billing_payment_removed", "billing_doc", did, d["number"])
    return _public({**d, **sets})


@router.get("/billing/summary")
async def summary(user: dict = Depends(get_current_user)):
    _need(user)
    scope = await scoped_client_ids(user)
    q: dict = {"status": {"$nin": ["cancelled", "draft"]}}
    if scope is not None:
        q["$or"] = [{"client_id": {"$in": scope}}, {"client_id": None}]
    rows = await db.billing_docs.find(q, {"_id": 0}).to_list(5000)
    today = date.today()
    m0 = today.strftime("%Y-%m")
    out = {"outstanding_inr": 0.0, "overdue_inr": 0.0, "invoiced_this_month_inr": 0.0, "collected_this_month_inr": 0.0, "open_quotes": 0, "open_quotes_inr": 0.0,
           "ageing": {"0-30": 0.0, "31-60": 0.0, "61-90": 0.0, "90+": 0.0}, "by_currency": {}, "overdue_docs": []}
    for d in rows:
        fx = d.get("fx_rate") or 1
        if d["type"] == "invoice":
            paid = sum(p["amount"] for p in d.get("payments") or [])
            bal = d["total"] - paid
            if d["date"][:7] == m0:
                out["invoiced_this_month_inr"] += d["total"] * fx
            for p in d.get("payments") or []:
                if p["date"][:7] == m0:
                    out["collected_this_month_inr"] += p.get("inr_amount") or p["amount"] * fx
            if bal > 0.005:
                out["outstanding_inr"] += bal * fx
                bc = out["by_currency"].setdefault(d["currency"], 0.0)
                out["by_currency"][d["currency"]] = bc + bal
                if d.get("due_date") and d["due_date"] < today.isoformat():
                    days = (today - date.fromisoformat(d["due_date"])).days
                    out["overdue_inr"] += bal * fx
                    out["ageing"]["0-30" if days <= 30 else "31-60" if days <= 60 else "61-90" if days <= 90 else "90+"] += bal * fx
                    out["overdue_docs"].append({"id": d["id"], "number": d["number"], "client_name": d["client_name"], "currency": d["currency"], "balance": _r2(bal), "days": days})
        elif d["type"] == "quotation" and d["status"] in ("sent", "draft"):
            out["open_quotes"] += 1
            out["open_quotes_inr"] += d["total"] * fx
    for k in ("outstanding_inr", "overdue_inr", "invoiced_this_month_inr", "collected_this_month_inr", "open_quotes_inr"):
        out[k] = _r2(out[k])
    out["ageing"] = {k: _r2(v) for k, v in out["ageing"].items()}
    out["overdue_docs"].sort(key=lambda r: -r["days"])
    out["overdue_docs"] = out["overdue_docs"][:20]
    return out


# ------------------------------------------------------------------ share link + portal
async def _by_token(token: str) -> dict:
    d = await db.billing_docs.find_one({"share_token": token}, {"_id": 0})
    if not d or d["status"] in ("draft", "cancelled"):
        raise HTTPException(status_code=404, detail="This link isn't valid any more")
    return d


def _share_view(d: dict) -> dict:
    keep = ("id", "type", "type_label", "number", "title", "client_name", "bill_to", "date", "valid_until", "due_date", "currency", "tax_mode", "items", "subtotal",
            "discount_total", "taxable", "cgst", "sgst", "igst", "tax_total", "round_off_amount", "total", "amount_words", "terms", "notes", "po_number",
            "status", "accepted_at", "accepted_by", "paid", "balance", "payments", "tax_summary", "place_of_supply")
    p = _public(d)
    out = {k: p.get(k) for k in keep}
    out["payments"] = [{"date": x["date"], "amount": x["amount"], "method": x["method"]} for x in p.get("payments") or []]
    return out


@router.get("/share/billing/{token}")
async def share_get(token: str):
    d = await _by_token(token)
    co = await company_profile()
    return {"doc": _share_view(d), "company": {k: co.get(k) for k in ("legal_name", "trade_name", "logo", "email", "phone", "website", "upi_id", "gstin")}}


class AcceptIn(BaseModel):
    name: str
    email: Optional[str] = ""
    note: Optional[str] = ""


@router.post("/share/billing/{token}/accept")
async def share_accept(token: str, body: AcceptIn, request: Request):
    d = await _by_token(token)
    if d["type"] != "quotation":
        raise HTTPException(status_code=400, detail="Only quotations can be accepted here")
    if d["status"] == "accepted":
        return {"ok": True, "already": True}
    if d["status"] != "sent":
        raise HTTPException(status_code=400, detail="This quotation is no longer open")
    if not body.name.strip():
        raise HTTPException(status_code=400, detail="Type your name to accept")
    who = f"{body.name.strip()[:80]}" + (f" <{body.email.strip()[:120]}>" if body.email else "")
    sets = {"status": "accepted", "accepted_at": _now(), "accepted_by": who, "accepted_ip": (request.client.host if request.client else ""),
            "history": (d.get("history") or []) + [{"at": _now(), "by": who, "event": "accepted via share link", "note": (body.note or "")[:300]}]}
    await db.billing_docs.update_one({"id": d["id"]}, {"$set": sets})
    await db.notifications_outbox.insert_one({"id": str(uuid.uuid4()), "kind": "billing", "title": f"{d['number']} accepted by {who}", "doc_id": d["id"], "at": _now(), "seen": False})
    return {"ok": True}


@router.get("/share/billing/{token}/pdf")
async def share_pdf(token: str):
    d = await _by_token(token)
    return await _pdf_response(d)


@router.get("/portal/billing")
async def portal_billing(pu: dict = Depends(get_portal_user)):
    rows = await db.billing_docs.find({"client_id": pu["client_id"], "status": {"$nin": ["draft", "cancelled"]}}, {"_id": 0}).sort("date", -1).to_list(500)
    for r in rows:
        s = _derive_status(r)
        if s != r["status"]:
            r["status"] = s
            await db.billing_docs.update_one({"id": r["id"]}, {"$set": {"status": s}})
    out = [_share_view(r) for r in rows]
    inv = [r for r in out if r["type"] == "invoice"]
    return {"docs": out, "outstanding": {c: _r2(sum(r["balance"] or 0 for r in inv if r["currency"] == c)) for c in {r["currency"] for r in inv}},
            "open_quotes": sum(1 for r in out if r["type"] == "quotation" and r["status"] == "sent")}


@router.post("/portal/billing/{did}/accept")
async def portal_accept(did: str, body: AcceptIn, pu: dict = Depends(get_portal_user)):
    d = await db.billing_docs.find_one({"id": did, "client_id": pu["client_id"]}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Document not found")
    if d["type"] != "quotation" or d["status"] != "sent":
        raise HTTPException(status_code=400, detail="This quotation is no longer open")
    who = f"{pu.get('name') or body.name} ({pu.get('email', '')})"
    sets = {"status": "accepted", "accepted_at": _now(), "accepted_by": who,
            "history": (d.get("history") or []) + [{"at": _now(), "by": who, "event": "accepted in the client portal", "note": (body.note or "")[:300]}]}
    await db.billing_docs.update_one({"id": did}, {"$set": sets})
    return {"ok": True}


@router.get("/portal/billing/{did}/pdf")
async def portal_pdf(did: str, pu: dict = Depends(get_portal_user)):
    d = await db.billing_docs.find_one({"id": did, "client_id": pu["client_id"], "status": {"$nin": ["draft", "cancelled"]}}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Document not found")
    return await _pdf_response(d)


# ------------------------------------------------------------------ PDF
def _img_reader(data_url: Optional[str]):
    if not data_url or data_url.startswith("data:image/svg"):
        return None
    try:
        from reportlab.lib.utils import ImageReader
        from io import BytesIO
        raw = base64.b64decode(data_url.split(",", 1)[1])
        return ImageReader(BytesIO(raw))
    except Exception:
        return None


def _money(v, cur):
    s = f"{abs(float(v or 0)):,.2f}"
    if cur == "INR":   # Indian grouping
        whole, frac = s.split(".")
        whole = whole.replace(",", "")
        if len(whole) > 3:
            head, tail = whole[:-3], whole[-3:]
            head = ",".join(re.findall(r"\d{1,2}(?=(?:\d{2})*$)", head))
            whole = f"{head},{tail}"
        s = f"{whole}.{frac}"
    return ("-" if float(v or 0) < 0 else "") + s


def build_doc_pdf(d: dict, co: dict) -> bytes:
    from io import BytesIO
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, KeepTogether, Image as RLImage
    from reportlab.graphics.barcode import qr
    from reportlab.graphics.shapes import Drawing
    from export_engine import FONT, BOLD_FONT, ORANGE_HEX, draw_wordmark, _gradient_rule

    cur, sym = d["currency"], CURRENCIES[d["currency"]]["symbol"]
    W = A4[0] - 28 * mm
    ink, muted, line = colors.HexColor("#111827"), colors.HexColor("#6B7280"), colors.HexColor("#E5E7EB")
    orange, peach = colors.HexColor(ORANGE_HEX), colors.HexColor("#FFF7ED")
    P = lambda name, **kw: ParagraphStyle(name, fontName=kw.pop("font", FONT), fontSize=kw.pop("size", 8.6), textColor=kw.pop("color", ink), leading=kw.pop("leading", 11.2), **kw)
    S_TITLE, S_SUB, S_LBL = P("t", font=BOLD_FONT, size=16, leading=19), P("s", size=8.4, color=muted), P("l", font=BOLD_FONT, size=6.8, color=muted)
    S_CELL, S_SMALL, S_H2 = P("c"), P("sm", size=7.6, color=muted, leading=9.8), P("h2", font=BOLD_FONT, size=9.4, color=orange, spaceBefore=8, spaceAfter=3)
    esc = lambda s: (str(s) if s not in (None, "") else "").replace("&", "&amp;").replace("<", "&lt;").replace("\n", "<br/>")
    is_gst = d["tax_mode"] in ("gst_intra", "gst_inter")
    title = DOC_TYPES[d["type"]]["title"]
    if d["type"] == "invoice" and d["tax_mode"] == "zero_rated":
        title = "EXPORT INVOICE"
    if d["type"] == "invoice" and not is_gst and d["tax_mode"] == "none":
        title = "INVOICE"
    logo = _img_reader(co.get("logo"))

    def deco(canvas, doc_):
        w, h = doc_.pagesize
        canvas.saveState()
        if logo:
            try:
                iw, ih = logo.getSize()
                hh = 11 * mm
                canvas.drawImage(logo, 14 * mm, h - 21 * mm, width=hh * iw / ih, height=hh, mask="auto")
            except Exception:
                draw_wordmark(canvas, 14 * mm, h - 17 * mm, 6.4 * mm)
        else:
            draw_wordmark(canvas, 14 * mm, h - 17 * mm, 6.4 * mm)
        canvas.setFillColor(ink)
        canvas.setFont(BOLD_FONT, 15)
        canvas.drawRightString(w - 14 * mm, h - 15 * mm, title)
        canvas.setFillColor(muted)
        canvas.setFont(FONT, 8.4)
        canvas.drawRightString(w - 14 * mm, h - 19.6 * mm, f"{d['number']}   ·   {date.fromisoformat(d['date']).strftime('%d %b %Y')}")
        _gradient_rule(canvas, 0, h - 24 * mm, w, 1.1 * mm)
        canvas.setFont(FONT, 7.2)
        canvas.setFillColor(colors.HexColor("#9CA3AF"))
        foot = " · ".join(x for x in (co.get("legal_name"), co.get("website"), co.get("email"), co.get("phone")) if x)
        canvas.drawString(14 * mm, 8 * mm, foot[:140])
        canvas.drawRightString(w - 14 * mm, 8 * mm, f"Page {doc_.page}")
        if d["type"] != "quotation":
            canvas.drawCentredString(w / 2, 4.5 * mm, "This is a computer-generated document." + ("" if co.get("signature") else " No signature required."))
        canvas.restoreState()

    bio = BytesIO()
    doc = SimpleDocTemplate(bio, pagesize=A4, leftMargin=14 * mm, rightMargin=14 * mm, topMargin=29 * mm, bottomMargin=16 * mm, title=f"{title} {d['number']}")
    story = []
    # --- parties
    co_lines = [f"<b>{esc(co['legal_name'])}</b>"] + [esc(x) for x in (co.get("address1"), co.get("address2"), " ".join(filter(None, [co.get("city"), co.get("pincode")])),
                                                                         f"{STATES.get(co.get('state_code'), '')}, {co.get('country') or 'India'}".strip(", ")) if x]
    ids = [f"GSTIN {co['gstin']}" if co.get("gstin") else "", f"PAN {co['pan']}" if co.get("pan") else "", f"CIN {co['cin']}" if co.get("cin") else "",
           f"Udyam {co['udyam']}" if co.get("udyam") else ""]
    co_lines += [esc(x) for x in ids if x]
    co_lines += [esc(" · ".join(x for x in (co.get("email"), co.get("phone")) if x))]
    bt = d["bill_to"]
    bt_lines = [f"<b>{esc(bt.get('company') or bt.get('name'))}</b>"] + ([esc(bt["name"])] if bt.get("company") and bt.get("name") else [])
    bt_lines += [esc(x) for x in (bt.get("address"), " ".join(filter(None, [bt.get("city"), STATES.get(bt.get("state_code"), "") if bt.get("country", "India") == "India" else ""])),
                                  bt.get("country") if bt.get("country") and bt.get("country") != "India" else "") if x]
    if bt.get("gstin"):
        bt_lines.append(f"GSTIN {esc(bt['gstin'])}")
    if bt.get("tax_id"):
        bt_lines.append(f"Tax ID {esc(bt['tax_id'])}")
    bt_lines += [esc(x) for x in (bt.get("email"), bt.get("phone")) if x]
    facts = [("Date", date.fromisoformat(d["date"]).strftime("%d %b %Y"))]
    if d.get("valid_until"):
        facts.append(("Valid until", date.fromisoformat(d["valid_until"]).strftime("%d %b %Y")))
    if d.get("due_date"):
        facts.append(("Due date", date.fromisoformat(d["due_date"]).strftime("%d %b %Y")))
    if d.get("po_number"):
        facts.append(("PO / Ref", d["po_number"]))
    if d.get("source_number"):
        facts.append(("Against", d["source_number"]))
    if is_gst:
        facts.append(("Place of supply", f"{STATES.get(d.get('place_of_supply'), '')} ({d.get('place_of_supply')})"))
    elif d["tax_mode"] == "zero_rated":
        facts.append(("Supply", "Export of services" + (f" · LUT {co['lut']}" if co.get("lut") else "")))
    facts.append(("Currency", f"{cur} — {CURRENCIES[cur]['name']}"))
    if cur != "INR" and d.get("fx_rate"):
        facts.append(("Exchange rate", f"1 {cur} = ₹{d['fx_rate']:,.2f}"))
    fact_tbl = Table([[Paragraph(k.upper(), S_LBL), Paragraph(esc(v), P("fv", size=8.2, leading=10.4))] for k, v in facts], colWidths=[W * 0.1, W * 0.2])
    fact_tbl.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("TOPPADDING", (0, 0), (-1, -1), 1.2), ("BOTTOMPADDING", (0, 0), (-1, -1), 1.2), ("LEFTPADDING", (0, 0), (-1, -1), 0)]))
    parties = Table([[Paragraph("FROM", S_LBL), Paragraph("BILL TO", S_LBL), ""],
                     [Paragraph("<br/>".join(co_lines), P("pc", size=8.2, leading=10.6)), Paragraph("<br/>".join(bt_lines), P("pb", size=8.2, leading=10.6)), fact_tbl]],
                    colWidths=[W * 0.36, W * 0.33, W * 0.31])
    parties.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                                 ("BOTTOMPADDING", (0, 0), (-1, 0), 2), ("LINEBELOW", (0, 1), (-1, 1), 0.5, line), ("BOTTOMPADDING", (0, 1), (-1, 1), 8)]))
    story += [parties, Spacer(1, 6)]
    if d.get("title"):
        story += [Paragraph(esc(d["title"]), P("ti", font=BOLD_FONT, size=10.5, leading=13)), Spacer(1, 4)]
    # --- items
    show_disc = any(it.get("discount_pct") for it in d["items"])
    hdr = ["#", "Description"] + (["SAC"] if is_gst else []) + ["Qty", "Rate"] + (["Disc"] if show_disc else []) + (["Tax"] if is_gst else []) + ["Amount"]
    widths = [0.04, 0.44 if is_gst else 0.56] + ([0.08] if is_gst else []) + [0.09, 0.11] + ([0.07] if show_disc else []) + ([0.07] if is_gst else []) + [0.13]
    tot = sum(widths)
    widths = [w / tot for w in widths]
    rows = [[Paragraph(f"<b>{h}</b>", P("hd", font=BOLD_FONT, size=7.4, color=colors.white)) for h in hdr]]
    for i, it in enumerate(d["items"], 1):
        desc = f"<b>{esc(it['description'])}</b>" + (f"<br/><font color='#6B7280' size='7.4'>{esc(it.get('details'))}</font>" if it.get("details") else "")
        qty = f"{it['qty']:g} {it.get('unit') or ''}".strip()
        row = [str(i), Paragraph(desc, S_CELL)] + ([it.get("sac") or ""] if is_gst else []) + [qty, _money(it["unit_price"], cur)]
        row += ([f"{it['discount_pct']:g}%" if it.get("discount_pct") else ""] if show_disc else []) + ([f"{it['tax_rate']:g}%"] if is_gst else []) + [_money(it["net"], cur)]
        rows.append(row)
    tbl = Table(rows, colWidths=[W * w for w in widths], repeatRows=1)
    st = [("BACKGROUND", (0, 0), (-1, 0), orange), ("FONTNAME", (0, 1), (-1, -1), FONT), ("FONTSIZE", (0, 1), (-1, -1), 8.4), ("VALIGN", (0, 0), (-1, -1), "TOP"),
          ("LINEBELOW", (0, 1), (-1, -1), 0.3, line), ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
          ("ALIGN", (2 if not is_gst else 3, 1), (-1, -1), "RIGHT"), ("ALIGN", (0, 1), (0, -1), "CENTER")]
    tbl.setStyle(TableStyle(st))
    story.append(tbl)
    # --- totals + payment block
    tl = [("Subtotal", d["subtotal"])]
    if d.get("discount_total"):
        tl.append((f"Discount{f' ({d['discount_pct']:g}%)' if d.get('discount_pct') else ''}", -d["discount_total"]))
    if is_gst:
        tl.append(("Taxable value", d["taxable"]))
        if d["tax_mode"] == "gst_intra":
            tl += [("CGST", d["cgst"]), ("SGST", d["sgst"])]
        else:
            tl.append(("IGST", d["igst"]))
    elif d["tax_mode"] == "zero_rated":
        tl.append(("IGST (zero-rated, under LUT)", 0.0))
    if d.get("round_off_amount"):
        tl.append(("Round off", d["round_off_amount"]))
    paid = sum(p["amount"] for p in d.get("payments") or [])
    trows = [[Paragraph(esc(k), S_CELL), Paragraph(f"{sym} {_money(v, cur)}", P("tv", alignment=2))] for k, v in tl]
    trows.append([Paragraph(f"<b>{'Total' if d['type'] != 'credit_note' else 'Credit total'}</b>", P("tb", font=BOLD_FONT, size=10)),
                  Paragraph(f"<b>{sym} {_money(d['total'], cur)}</b>", P("tbv", font=BOLD_FONT, size=10, alignment=2))])
    if paid and d["type"] in ("invoice", "proforma"):
        trows += [[Paragraph("Paid", S_CELL), Paragraph(f"{sym} {_money(paid, cur)}", P("tp", alignment=2))],
                  [Paragraph("<b>Balance due</b>", P("bd", font=BOLD_FONT)), Paragraph(f"<b>{sym} {_money(d['total'] - paid, cur)}</b>", P("bdv", font=BOLD_FONT, alignment=2))]]
    if cur != "INR" and d.get("fx_rate"):
        trows.append([Paragraph("INR equivalent", S_SMALL), Paragraph(f"₹ {_money(d['total'] * d['fx_rate'], 'INR')}", P("ie", size=7.6, color=muted, alignment=2))])
    ttab = Table(trows, colWidths=[W * 0.24, W * 0.18])
    ttab.setStyle(TableStyle([("LINEABOVE", (0, len(tl)), (-1, len(tl)), 0.8, orange), ("BACKGROUND", (0, len(tl)), (-1, len(tl)), peach),
                              ("TOPPADDING", (0, 0), (-1, -1), 2.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5)]))
    # left side: amount in words + payment details / QR
    left = [Paragraph("AMOUNT IN WORDS", S_LBL), Paragraph(esc(d["amount_words"]), P("aw", size=8.2, leading=10.4)), Spacer(1, 5)]
    if d["type"] in ("invoice", "proforma", "quotation") and (paid < d["total"] - 0.005):
        bank = co.get("bank") or {}
        pay_lines = []
        if bank.get("account_no"):
            pay_lines += [f"<b>{esc(bank.get('account_name') or co['legal_name'])}</b>", f"A/c {esc(bank['account_no'])} · {esc(bank.get('bank_name'))} {esc(bank.get('branch'))}".strip(),
                          f"IFSC {esc(bank['ifsc'])}" if bank.get("ifsc") else ""]
            if cur != "INR" or d["tax_mode"] == "zero_rated":
                pay_lines += [f"SWIFT {esc(bank['swift'])}" if bank.get("swift") else "", esc(bank.get("bank_address")) if bank.get("bank_address") else "",
                              "Please pay by SWIFT / wire with all charges borne by the remitter (OUR)."]
        if co.get("upi_id") and cur == "INR":
            pay_lines.append(f"UPI {esc(co['upi_id'])}")
        pay_lines = [x for x in pay_lines if x]
        qr_flow = None
        if d.get("show_qr") and co.get("upi_id") and cur == "INR":
            amt = _r2(d["total"] - paid)
            pa, pn = co["upi_id"], (co.get("upi_name") or co["legal_name"])[:50]
            from urllib.parse import quote
            upi = f"upi://pay?pa={quote(pa)}&pn={quote(pn)}&am={amt:.2f}&cu=INR&tn={quote(d['number'][:40])}"
            widget = qr.QrCodeWidget(upi, barLevel="M")
            b = widget.getBounds()
            size = 26 * mm
            dr = Drawing(size, size, transform=[size / (b[2] - b[0]), 0, 0, size / (b[3] - b[1]), 0, 0])
            dr.add(widget)
            qr_flow = Table([[dr], [Paragraph(f"Scan to pay {sym} {_money(amt, cur)}", P("qrl", size=6.8, color=muted, alignment=1))]], colWidths=[size + 4])
            qr_flow.setStyle(TableStyle([("ALIGN", (0, 0), (-1, -1), "CENTER"), ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
        if pay_lines or qr_flow:
            cells = [[Paragraph("PAYMENT DETAILS", S_LBL), ""], [Paragraph("<br/>".join(pay_lines), P("pl", size=8, leading=10.4)), qr_flow or ""]]
            ptab = Table(cells, colWidths=[W * 0.36, 30 * mm])
            ptab.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, 0), 1)]))
            left.append(ptab)
    bottom = Table([[left, ttab]], colWidths=[W * 0.56, W * 0.44])
    bottom.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 8)]))
    story.append(KeepTogether([bottom]))
    # --- GST summary
    if is_gst and d.get("tax_summary"):
        srows = [[Paragraph("<b>SAC</b>", P("sh", font=BOLD_FONT, size=7.2)), Paragraph("<b>Taxable</b>", P("sh2", font=BOLD_FONT, size=7.2, alignment=2)),
                  Paragraph("<b>Rate</b>", P("sh3", font=BOLD_FONT, size=7.2, alignment=2)),
                  Paragraph("<b>CGST</b>" if d["tax_mode"] == "gst_intra" else "<b>IGST</b>", P("sh4", font=BOLD_FONT, size=7.2, alignment=2))] +
                 ([Paragraph("<b>SGST</b>", P("sh5", font=BOLD_FONT, size=7.2, alignment=2))] if d["tax_mode"] == "gst_intra" else [])]
        for r in d["tax_summary"]:
            half = _r2(r["tax"] / 2)
            srows.append([r["sac"] or "—", _money(r["taxable"], cur), f"{r['rate']:g}%"] + ([_money(half, cur), _money(half, cur)] if d["tax_mode"] == "gst_intra" else [_money(r["tax"], cur)]))
        stab = Table(srows, colWidths=[W * 0.12, W * 0.14, W * 0.08, W * 0.12] + ([W * 0.12] if d["tax_mode"] == "gst_intra" else []), hAlign="LEFT")
        stab.setStyle(TableStyle([("FONTNAME", (0, 1), (-1, -1), FONT), ("FONTSIZE", (0, 1), (-1, -1), 7.6), ("ALIGN", (1, 1), (-1, -1), "RIGHT"), ("GRID", (0, 0), (-1, -1), 0.25, line),
                                  ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F3F4F6")), ("TOPPADDING", (0, 0), (-1, -1), 2.2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2.2)]))
        story += [Spacer(1, 6), KeepTogether([Paragraph("Tax summary", S_H2), stab])]
    # --- terms, notes
    if d.get("terms"):
        items_ = [Paragraph("Terms & conditions", S_H2)]
        for i, t in enumerate(d["terms"], 1):
            head = f"<b>{esc(t['title'])}.</b> " if t.get("title") else ""
            items_.append(Paragraph(f"{i}. {head}{esc(t['text'])}", P("tc", size=7.6, leading=9.8, leftIndent=8, firstLineIndent=-8, spaceAfter=2)))
        story += [Spacer(1, 4)] + items_
    if d.get("notes"):
        story += [Paragraph("Notes", S_H2), Paragraph(esc(d["notes"]), P("nt", size=8, leading=10.4))]
    if d["type"] == "credit_note" and d.get("reason"):
        story += [Paragraph("Reason", S_H2), Paragraph(esc(d["reason"]), S_CELL)]
    # --- signature + certifications
    sig_cells = []
    certs = [c for c in co.get("certifications") or [] if c.get("show_on_docs", True)] if d.get("show_certs") else []
    cert_flow = ""
    if certs:
        cf = []
        for c in certs[:6]:
            img = _img_reader(c.get("image"))
            if img:
                iw, ih = img.getSize()
                h = 11 * mm
                cf.append(RLImage(BytesIO(base64.b64decode(c["image"].split(",", 1)[1])), width=h * iw / ih, height=h))
            else:
                cf.append(Paragraph(f"<b>{esc(c['name'])}</b>" + (f"<br/>{esc(c.get('issuer'))}" if c.get("issuer") else "") + (f"<br/>{esc(c.get('number'))}" if c.get("number") else ""), P("ce", size=6.8, leading=8.4)))
        ct = Table([cf], colWidths=[W * 0.58 / max(1, len(cf))] * len(cf))
        ct.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 2), ("RIGHTPADDING", (0, 0), (-1, -1), 2)]))
        cert_flow = [Paragraph("CERTIFICATIONS & PARTNERSHIPS", S_LBL), ct]
    sig = _img_reader(co.get("signature"))
    sig_block = [Paragraph(f"For <b>{esc(co['legal_name'])}</b>", P("fs", size=8, alignment=2))]
    if sig:
        iw, ih = sig.getSize()
        h = 14 * mm
        im = RLImage(BytesIO(base64.b64decode(co["signature"].split(",", 1)[1])), width=h * iw / ih, height=h)
        im.hAlign = "RIGHT"
        sig_block.append(im)
    else:
        sig_block.append(Spacer(1, 14 * mm))
    sig_block.append(Paragraph(f"<b>{esc(co.get('signatory_name') or '')}</b>" + (f"<br/>{esc(co.get('signatory_title'))}" if co.get("signatory_title") else "") + "<br/>Authorised signatory", P("sn", size=7.6, leading=9.6, alignment=2)))
    foot = Table([[cert_flow or "", sig_block]], colWidths=[W * 0.6, W * 0.4])
    foot.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "BOTTOM"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 12)]))
    story.append(KeepTogether([foot]))
    if d["type"] == "quotation":
        story += [Spacer(1, 8), Paragraph("Accepted for the client: ____________________________   Name: ______________________   Date: ____________", P("acc", size=7.8, color=muted))]
    doc.build(story, onFirstPage=deco, onLaterPages=deco)
    return bio.getvalue()


async def _pdf_response(d: dict) -> Response:
    from export_engine import attachment
    co = await company_profile()
    pdf = build_doc_pdf(d, co)
    fname = f"{d['number'].replace('/', '-')}-{re.sub(r'[^a-z0-9]+', '-', (d.get('client_name') or 'client').lower()).strip('-')[:40]}.pdf"
    return Response(pdf, media_type="application/pdf", headers={"Content-Disposition": attachment(fname)})


@router.get("/billing/docs/{did}/pdf")
async def doc_pdf(did: str, user: dict = Depends(get_current_user)):
    _need(user)
    d = await _get(user, did)
    await log_activity(user, "billing_pdf_downloaded", "billing_doc", did, d["number"])
    return await _pdf_response(d)


# ------------------------------------------------------------------ alerts + migration of the old Sales → Quotes
async def billing_alerts(user: dict) -> list:
    if not has_permission(user, "billing"):
        return []
    scope = await scoped_client_ids(user)
    q: dict = {"type": "invoice", "status": {"$in": ["sent", "part_paid", "overdue"]}, "due_date": {"$lt": _today()}}
    if scope is not None:
        q["$or"] = [{"client_id": {"$in": scope}}, {"client_id": None}]
    n = await db.billing_docs.count_documents(q)
    out = []
    if n:
        out.append({"kind": "billing", "title": f"{n} overdue invoice{'s' if n > 1 else ''}", "sub": "Follow up or record the payment", "link": "/finance/billing?status=overdue", "date": _today()})
    acc = await db.notifications_outbox.find({"kind": "billing", "seen": False}, {"_id": 0}).sort("at", -1).to_list(5)
    for a in acc:
        out.append({"kind": "billing", "title": a["title"], "sub": "Convert it to an invoice when you're ready", "link": f"/finance/billing/{a['doc_id']}", "date": a["at"][:10]})
    return out


async def migrate_old_quotes():
    """One-time: carry the old Sales → Quotes into Billing as quotations (same numbers, same status)."""
    if await db.migrations.find_one({"id": "billing_v32_quotes"}):
        return
    co = await company_profile()
    n = 0
    async for q in db.quotes.find({}, {"_id": 0}):
        if await db.billing_docs.find_one({"legacy_id": q["id"]}, {"_id": 0, "id": 1}):
            continue
        items = [{"id": str(uuid.uuid4()), "description": it.get("description", ""), "details": "", "sac": co["defaults"]["sac"], "qty": float(it.get("qty", 1)),
                  "unit": "service", "unit_price": float(it.get("unit_price", 0)), "discount_pct": 0.0, "tax_rate": 18.0 if q.get("gst_enabled") else 0.0} for it in q.get("items") or []]
        tax_mode = "gst_intra" if q.get("gst_enabled") else "none"
        totals = compute_totals(items, "INR", tax_mode, 0, 0, False, 18.0)
        client = await db.clients.find_one({"id": q.get("client_id")}, {"_id": 0, "name": 1, "company": 1, "state": 1}) if q.get("client_id") else None
        lead = await db.leads.find_one({"id": q.get("lead_id")}, {"_id": 0, "name": 1, "company": 1, "contact_email": 1, "contact_phone": 1}) if q.get("lead_id") else None
        who = client or lead or {}
        status = {"draft": "draft", "sent": "sent", "accepted": "accepted", "rejected": "rejected", "expired": "expired"}.get(q.get("status"), "draft")
        d0 = (q.get("created_at") or _now())[:10]
        doc = {"id": str(uuid.uuid4()), "legacy_id": q["id"], "type": "quotation", "number": q.get("number") or await next_number("quotation", _fy(d0), co["numbering"]["quotation"]),
               "status": status, "client_id": q.get("client_id"), "client_name": who.get("name") or who.get("company") or "", "lead_id": q.get("lead_id"), "project_id": None,
               "title": q.get("title", ""), "bill_to": {"name": who.get("name", ""), "company": who.get("company", ""), "email": who.get("contact_email", ""), "phone": who.get("contact_phone", ""),
                                                        "address": "", "city": "", "state_code": co.get("state_code", ""), "country": "India", "gstin": "", "tax_id": ""},
               "date": d0, "fy": _fy(d0), "valid_until": q.get("validity_date"), "due_date": None, "currency": "INR", "fx_rate": 1.0, "tax_mode": tax_mode,
               "place_of_supply": co.get("state_code", ""), "discount_pct": 0.0, "discount_amount": 0.0, "round_off": False, **totals, "inr_total": totals["total"],
               "terms": [], "notes": q.get("notes") or "", "po_number": "", "reference": "", "service_tags": [], "show_qr": True, "show_certs": True, "payments": [],
               "share_token": secrets.token_urlsafe(18), "created_by": q.get("created_by"), "created_by_name": "", "created_at": q.get("created_at") or _now(),
               "updated_at": _now(), "history": [{"at": _now(), "by": "system", "event": "migrated from Sales → Quotes"}]}
        await db.billing_docs.insert_one(doc)
        n += 1
    await db.migrations.insert_one({"id": "billing_v32_quotes", "at": _now(), "count": n})
