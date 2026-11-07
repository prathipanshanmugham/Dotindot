"""v3.2 Billing — company profile, terms, GST maths (intra / inter / export / none), foreign currency, numbering per FY,
quote → invoice → payments → credit note, share link + portal acceptance, permissions and branch scope, PDFs.
Self-contained; safe on a production-like database (never touches the real company profile's secrets)."""
import io
import os
import uuid
from datetime import date, timedelta
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://127.0.0.1:8001").rstrip("/")
API = f"{BASE_URL}/api"
PASSWORD = "Dotindot@2026"
TAG = uuid.uuid4().hex[:6]


def _login(email, password=PASSWORD):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def sa():
    return _login("admin@dotindot.in")


@pytest.fixture(scope="module")
def company(sa):
    """Make sure the company is in Tamil Nadu with a GSTIN; restore what was there afterwards."""
    before = requests.get(f"{API}/billing/company", headers=sa).json()
    requests.put(f"{API}/billing/company", headers=sa, json={"gstin": before["gstin"] or "33AAFCD1234K1ZP", "state_code": "33", "address1": before["address1"] or "14 Brough Road",
                                                               "upi_id": before["upi_id"] or "dotindot@hdfcbank", "legal_name": before["legal_name"] or "Dotindot Creative"})
    yield requests.get(f"{API}/billing/company", headers=sa).json()
    requests.put(f"{API}/billing/company", headers=sa, json={k: before[k] for k in ("gstin", "state_code", "address1", "upi_id", "legal_name")})


def _user(sa, label, role):
    email = f"t32-{label}-{TAG}@dotindot.in"
    r = requests.post(f"{API}/users", headers=sa, json={"name": f"T32 {label}", "email": email, "password": PASSWORD, "role": role})
    assert r.status_code in (200, 201), r.text
    uid = r.json().get("id") or next(u["id"] for u in requests.get(f"{API}/users", headers=sa).json() if u["email"] == email)
    return {"id": uid, "email": email, "h": _login(email)}


@pytest.fixture(scope="module")
def people(sa):
    out = {k: _user(sa, k, r) for k, r in (("emp", "employee"), ("sales", "sales"), ("fin", "finance"), ("pm", "pm"), ("scoped", "sales"))}
    yield out
    for p in out.values():
        requests.delete(f"{API}/records/users/{p['id']}", headers=sa, params={"permanent": True})


@pytest.fixture(scope="module")
def clients(sa):
    r1 = requests.post(f"{API}/clients", headers=sa, json={"name": f"T32 Chennai Co {TAG}", "company": "Chennai Co Pvt Ltd", "industry": "other", "status": "active", "state": "Tamil Nadu", "city": "Chennai",
                                                            "contacts": [{"name": "Arun", "email": "arun@example.in", "phone": "9000000001", "is_primary": True}]})
    r2 = requests.post(f"{API}/clients", headers=sa, json={"name": f"T32 Mumbai Co {TAG}", "company": "Mumbai Co LLP", "industry": "other", "status": "active", "state": "Maharashtra", "city": "Mumbai"})
    r3 = requests.post(f"{API}/clients", headers=sa, json={"name": f"T32 Dubai Co {TAG}", "company": "Dubai Co FZE", "industry": "other", "status": "active", "currency": "USD"})
    out = [r.json() for r in (r1, r2, r3)]
    for r in (r1, r2, r3):
        assert r.status_code in (200, 201), r.text
    yield out
    for c in out:
        requests.delete(f"{API}/records/clients/{c['id']}", headers=sa, params={"permanent": True})


def _doc(h, **kw):
    body = {"type": "quotation", "bill_to": {"name": "Arun", "company": "Chennai Co Pvt Ltd", "state_code": "33", "country": "India"}, "currency": "INR", "tax_mode": "gst_intra",
            "items": [{"description": "Website", "qty": 1, "unit_price": 100000}, {"description": "SEO retainer", "qty": 3, "unit": "month", "unit_price": 20000}]}
    body.update(kw)
    r = requests.post(f"{API}/billing/docs", headers=h, json=body)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def made(sa, company, clients):
    """Documents created by the module; deleted at the end (permanently) so numbering sequences aren't polluted beyond the FY counter."""
    ids = []
    yield ids
    for i in ids:
        requests.delete(f"{API}/records/billing_docs/{i}", headers=sa, params={"permanent": True})


class TestCompanyAndTerms:
    def test_company_validation(self, sa, company):
        assert requests.put(f"{API}/billing/company", headers=sa, json={"gstin": "BAD"}).status_code == 400
        assert requests.put(f"{API}/billing/company", headers=sa, json={"pan": "123"}).status_code == 400
        assert requests.put(f"{API}/billing/company", headers=sa, json={"upi_id": "nope"}).status_code == 400
        assert requests.put(f"{API}/billing/company", headers=sa, json={"bank": {"ifsc": "XX"}}).status_code == 400
        assert requests.put(f"{API}/billing/company", headers=sa, json={"logo": "data:text/plain;base64,QUJD"}).status_code == 400
        big = "data:image/png;base64," + ("A" * 600000)
        assert requests.put(f"{API}/billing/company", headers=sa, json={"logo": big}).status_code == 400
        assert company["state"] == "Tamil Nadu"

    def test_default_terms_present(self, sa):
        t = requests.get(f"{API}/billing/terms", headers=sa).json()
        assert len(t) >= 25 and {"payment", "ip", "cancellation", "liability"} <= {x["category"] for x in t}
        assert any(x["title"] == "Export of services" for x in t)

    def test_terms_crud(self, sa):
        r = requests.post(f"{API}/billing/terms", headers=sa, json={"category": "payment", "title": f"T32 {TAG}", "text": "Pay in 7 days.", "tags": ["web"], "default_for": ["invoice"]})
        assert r.status_code == 200
        tid = r.json()["id"]
        assert requests.put(f"{API}/billing/terms/{tid}", headers=sa, json={"category": "payment", "title": f"T32 {TAG}", "text": "Pay in 10 days.", "tags": ["web"], "default_for": []}).json()["text"] == "Pay in 10 days."
        assert requests.post(f"{API}/billing/terms", headers=sa, json={"category": "nope", "title": "x", "text": "y"}).status_code == 400
        assert requests.delete(f"{API}/billing/terms/{tid}", headers=sa).status_code == 200


class TestMaths:
    def test_intra_state_gst(self, sa, clients, made):
        d = _doc(sa, client_id=clients[0]["id"], items=[{"description": "Website", "qty": 1, "unit_price": 100000, "discount_pct": 10}, {"description": "Hosting", "qty": 1, "unit_price": 5000, "tax_rate": 18}])
        made.append(d["id"])
        assert d["subtotal"] == 95000 and d["taxable"] == 95000 and d["cgst"] == 8550 and d["sgst"] == 8550 and d["igst"] == 0
        assert d["total"] == 112100 and d["round_off_amount"] == 0 and d["amount_words"] == "One lakh twelve thousand one hundred rupees only"
        assert d["number"].startswith("QTN/") and d["fy"] in d["number"] and d["status"] == "draft"
        assert d["valid_until"] == (date.today() + timedelta(days=15)).isoformat()

    def test_inter_state_needs_igst(self, sa, clients, made):
        bt = {"name": "Meera", "company": "Mumbai Co LLP", "state_code": "27", "gstin": "27AABCM1234P1ZV", "country": "India"}
        assert requests.post(f"{API}/billing/docs", headers=sa, json={"type": "invoice", "bill_to": bt, "currency": "INR", "tax_mode": "gst_intra", "items": [{"description": "x", "qty": 1, "unit_price": 100}]}).status_code == 400
        d = _doc(sa, type="invoice", client_id=clients[1]["id"], bill_to=bt, tax_mode="gst_inter", items=[{"description": "Ads management", "qty": 2, "unit": "month", "unit_price": 33333.33}])
        made.append(d["id"])
        assert d["igst"] == 12000 and d["cgst"] == 0 and d["taxable"] == 66666.66 and d["total"] == 78667 and d["round_off_amount"] == 0.34
        assert d["number"].startswith("INV/") and d["due_date"] == (date.today() + timedelta(days=15)).isoformat()

    def test_overall_discount_and_round_off(self, sa, made):
        d = _doc(sa, discount_pct=5, items=[{"description": "a", "qty": 3, "unit_price": 333.33}])
        made.append(d["id"])
        assert d["subtotal"] == 999.99 and d["discount_total"] == 50 and d["taxable"] == 949.99 and d["tax_total"] == 171 and d["total"] == 1121
        d2 = _doc(sa, round_off=False, items=[{"description": "a", "qty": 1, "unit_price": 999.99}])
        made.append(d2["id"])
        assert d2["total"] == 1179.99 and d2["amount_words"].endswith("rupees and ninety-nine paise only")

    def test_export_usd(self, sa, clients, made):
        bt = {"name": "Omar", "company": "Dubai Co FZE", "country": "United Arab Emirates", "tax_id": "TRN 1003", "state_code": ""}
        assert requests.post(f"{API}/billing/docs", headers=sa, json={"type": "quotation", "bill_to": bt, "currency": "USD", "tax_mode": "gst_intra", "items": [{"description": "x", "qty": 1, "unit_price": 100}]}).status_code == 400
        assert requests.post(f"{API}/billing/docs", headers=sa, json={"type": "quotation", "bill_to": bt, "currency": "USD", "tax_mode": "zero_rated", "items": [{"description": "x", "qty": 1, "unit_price": 100}]}).status_code == 400  # no fx
        d = _doc(sa, client_id=clients[2]["id"], bill_to=bt, currency="USD", fx_rate=83.5, tax_mode="zero_rated", items=[{"description": "Brand & site", "qty": 1, "unit_price": 9500.5}])
        made.append(d["id"])
        assert d["tax_total"] == 0 and d["total"] == 9500.5 and d["inr_total"] == 793291.75 and d["amount_words"] == "Nine thousand five hundred dollars and fifty cents only" and d["place_of_supply"] == "96"
        for cur in ("EUR", "AED", "GBP", "SGD", "AUD", "CAD"):
            x = _doc(sa, bill_to=bt, currency=cur, fx_rate=50, tax_mode="none", items=[{"description": "x", "qty": 1, "unit_price": 10}])
            made.append(x["id"])
            assert x["currency"] == cur and x["total"] == 10

    def test_bad_inputs(self, sa):
        base = {"type": "quotation", "bill_to": {"company": "X", "country": "India", "state_code": "33"}, "currency": "INR", "tax_mode": "gst_intra"}
        assert requests.post(f"{API}/billing/docs", headers=sa, json={**base, "items": []}).status_code == 400
        assert requests.post(f"{API}/billing/docs", headers=sa, json={**base, "items": [{"description": "", "qty": 1, "unit_price": 1}]}).status_code == 400
        assert requests.post(f"{API}/billing/docs", headers=sa, json={**base, "items": [{"description": "x", "qty": -1, "unit_price": 1}]}).status_code == 422
        assert requests.post(f"{API}/billing/docs", headers=sa, json={**base, "items": [{"description": "x", "qty": 1, "unit_price": 1}], "bill_to": {"company": "X", "gstin": "BAD", "country": "India"}}).status_code == 400
        assert requests.post(f"{API}/billing/docs", headers=sa, json={**base, "currency": "BTC", "items": [{"description": "x", "qty": 1, "unit_price": 1}]}).status_code == 400
        assert requests.post(f"{API}/billing/docs", headers=sa, json={**base, "date": "07-11-2026", "items": [{"description": "x", "qty": 1, "unit_price": 1}]}).status_code == 400


class TestFlow:
    def test_quote_to_invoice_to_payment_to_credit_note(self, sa, clients, made):
        terms = requests.get(f"{API}/billing/terms", headers=sa).json()
        q_only = next(t["id"] for t in terms if t["default_for"] == ["quotation"])
        both = next(t["id"] for t in terms if "invoice" in t["default_for"] and "quotation" in t["default_for"])
        q = _doc(sa, client_id=clients[0]["id"], term_ids=[q_only, both], custom_terms=["Delivery in Chennai."], title="Chennai site")
        made.append(q["id"])
        assert len(q["terms"]) == 3
        # can't convert a draft
        assert requests.post(f"{API}/billing/docs/{q['id']}/convert", headers=sa, json={"to": "invoice"}).status_code == 400
        assert requests.post(f"{API}/billing/docs/{q['id']}/status", headers=sa, json={"status": "sent"}).json()["status"] == "sent"
        assert requests.post(f"{API}/billing/docs/{q['id']}/status", headers=sa, json={"status": "accepted"}).json()["status"] == "accepted"
        inv = requests.post(f"{API}/billing/docs/{q['id']}/convert", headers=sa, json={"to": "invoice"}).json()
        made.append(inv["id"])
        assert inv["type"] == "invoice" and inv["number"].startswith("INV/") and inv["total"] == q["total"] and inv["source_id"] == q["id"] and inv["status"] == "draft"
        assert {t.get("id") for t in inv["terms"]} == {both, None}   # quotation-only clause dropped, custom kept
        assert requests.get(f"{API}/billing/docs/{q['id']}", headers=sa).json()["status"] == "converted"
        assert requests.get(f"{API}/billing/docs/{q['id']}", headers=sa).json()["children"][0]["number"] == inv["number"]
        # payments only on sent invoices; part payment then overpay refused
        assert requests.post(f"{API}/billing/docs/{inv['id']}/payments", headers=sa, json={"amount": 1000}).status_code == 400
        requests.post(f"{API}/billing/docs/{inv['id']}/status", headers=sa, json={"status": "sent"})
        p1 = requests.post(f"{API}/billing/docs/{inv['id']}/payments", headers=sa, json={"amount": 100000, "method": "upi", "reference": "UPI123"}).json()
        assert p1["status"] == "part_paid" and p1["paid"] == 100000 and p1["balance"] == inv["total"] - 100000
        assert requests.post(f"{API}/billing/docs/{inv['id']}/payments", headers=sa, json={"amount": inv["total"]}).status_code == 400
        # can't edit once paid against; can't cancel
        assert requests.put(f"{API}/billing/docs/{inv['id']}", headers=sa, json={"type": "invoice", "bill_to": inv["bill_to"], "currency": "INR", "tax_mode": "gst_intra", "items": [{"description": "x", "qty": 1, "unit_price": 1}]}).status_code == 400
        assert requests.post(f"{API}/billing/docs/{inv['id']}/status", headers=sa, json={"status": "cancelled"}).status_code == 400
        p2 = requests.post(f"{API}/billing/docs/{inv['id']}/payments", headers=sa, json={"amount": inv["total"] - 100000}).json()
        assert p2["status"] == "paid" and p2["balance"] == 0
        # remove a payment → back to part paid
        back = requests.delete(f"{API}/billing/docs/{inv['id']}/payments/{p2['payments'][-1]['id']}", headers=sa).json()
        assert back["status"] == "part_paid"
        cn = requests.post(f"{API}/billing/docs/{inv['id']}/convert", headers=sa, json={"to": "credit_note", "reason": "One deliverable dropped"}).json()
        made.append(cn["id"])
        assert cn["type"] == "credit_note" and cn["number"].startswith("CN/") and cn["reason"] == "One deliverable dropped" and cn["terms"] == []
        assert requests.post(f"{API}/billing/docs/{cn['id']}/status", headers=sa, json={"status": "issued"}).json()["status"] == "issued"
        # quotation can't be re-converted; invoice can't become proforma
        assert requests.post(f"{API}/billing/docs/{q['id']}/convert", headers=sa, json={"to": "invoice"}).status_code == 400
        assert requests.post(f"{API}/billing/docs/{inv['id']}/convert", headers=sa, json={"to": "proforma"}).status_code == 400

    def test_overdue_and_summary(self, sa, clients, made):
        d = _doc(sa, type="invoice", client_id=clients[0]["id"], date=(date.today() - timedelta(days=40)).isoformat(), due_date=(date.today() - timedelta(days=25)).isoformat(),
                 items=[{"description": "Old work", "qty": 1, "unit_price": 10000}])
        made.append(d["id"])
        requests.post(f"{API}/billing/docs/{d['id']}/status", headers=sa, json={"status": "sent"})
        got = requests.get(f"{API}/billing/docs/{d['id']}", headers=sa).json()
        assert got["status"] == "overdue" and got["days_overdue"] == 25
        s = requests.get(f"{API}/billing/summary", headers=sa).json()
        assert any(x["id"] == d["id"] for x in s["overdue_docs"]) and s["ageing"]["0-30"] >= 11800
        lst = requests.get(f"{API}/billing/docs", headers=sa, params={"status": "overdue"}).json()
        assert any(x["id"] == d["id"] for x in lst)
        assert any(a["kind"] == "billing" for a in requests.get(f"{API}/notifications", headers=sa).json()["items"])

    def test_numbering_per_fy(self, sa, made):
        a = _doc(sa, date="2025-03-31", items=[{"description": "x", "qty": 1, "unit_price": 1}])
        b = _doc(sa, date="2025-04-01", items=[{"description": "x", "qty": 1, "unit_price": 1}])
        made += [a["id"], b["id"]]
        assert "/24-25/" in a["number"] and "/25-26/" in b["number"]

    def test_duplicate_and_edit(self, sa, made):
        d = _doc(sa, title="orig")
        made.append(d["id"])
        c = requests.post(f"{API}/billing/docs/{d['id']}/duplicate", headers=sa).json()
        made.append(c["id"])
        assert c["number"] != d["number"] and c["status"] == "draft" and c["title"] == "orig"
        e = requests.put(f"{API}/billing/docs/{c['id']}", headers=sa, json={"type": "invoice", "title": "edited", "bill_to": c["bill_to"], "currency": "INR", "tax_mode": "gst_intra",
                                                                               "items": [{"description": "x", "qty": 2, "unit_price": 500}]}).json()
        assert e["title"] == "edited" and e["type"] == "quotation" and e["total"] == 1180   # type can't change on edit


class TestShareAndPortal:
    def test_share_link_accept(self, sa, clients, made):
        d = _doc(sa, client_id=clients[0]["id"])
        made.append(d["id"])
        full = requests.get(f"{API}/billing/docs/{d['id']}", headers=sa).json()
        token = full["share_url_path"].split("/")[-1]
        assert requests.get(f"{API}/share/billing/{token}").status_code == 404   # draft not shareable
        requests.post(f"{API}/billing/docs/{d['id']}/status", headers=sa, json={"status": "sent"})
        pub = requests.get(f"{API}/share/billing/{token}").json()
        assert pub["doc"]["number"] == d["number"] and "share_token" not in str(pub) and "history" not in pub["doc"]
        assert requests.get(f"{API}/share/billing/{token}/pdf").content[:4] == b"%PDF"
        assert requests.post(f"{API}/share/billing/{token}/accept", json={"name": ""}).status_code == 400
        assert requests.post(f"{API}/share/billing/{token}/accept", json={"name": "Arun K", "email": "arun@example.in"}).json()["ok"]
        after = requests.get(f"{API}/billing/docs/{d['id']}", headers=sa).json()
        assert after["status"] == "accepted" and "Arun K" in after["accepted_by"]
        assert requests.get(f"{API}/share/billing/nope").status_code == 404

    def test_portal(self, sa, clients, made):
        c0 = clients[0]["id"]
        email = f"t32-portal-{TAG}@client.example"
        assert requests.post(f"{API}/clients/{c0}/portal-users", headers=sa, json={"name": "Portal", "email": email, "password": PASSWORD}).status_code in (200, 201)
        ph = {"Authorization": "Bearer " + requests.post(f"{API}/portal/login", json={"email": email, "password": PASSWORD}).json()["access_token"]}
        q = _doc(sa, client_id=c0)
        made.append(q["id"])
        other = _doc(sa, client_id=clients[1]["id"], bill_to={"company": "Mumbai Co LLP", "state_code": "27", "country": "India"}, tax_mode="gst_inter")
        made.append(other["id"])
        requests.post(f"{API}/billing/docs/{q['id']}/status", headers=sa, json={"status": "sent"})
        requests.post(f"{API}/billing/docs/{other['id']}/status", headers=sa, json={"status": "sent"})
        mine = requests.get(f"{API}/portal/billing", headers=ph).json()
        ids = {x["id"] for x in mine["docs"]}
        assert q["id"] in ids and other["id"] not in ids and mine["open_quotes"] >= 1
        assert requests.get(f"{API}/portal/billing/{other['id']}/pdf", headers=ph).status_code == 404
        assert requests.post(f"{API}/portal/billing/{other['id']}/accept", headers=ph, json={"name": "x"}).status_code == 404
        assert requests.post(f"{API}/portal/billing/{q['id']}/accept", headers=ph, json={"name": "x"}).json()["ok"]
        assert requests.get(f"{API}/portal/billing/{q['id']}/pdf", headers=ph).content[:4] == b"%PDF"
        assert requests.get(f"{API}/billing/docs", headers=ph).status_code == 401


class TestPermissions:
    def test_roles(self, people, clients, made, sa):
        assert requests.get(f"{API}/billing/meta", headers=people["emp"]["h"]).status_code == 403
        assert requests.get(f"{API}/billing/docs", headers=people["pm"]["h"]).status_code == 200
        assert requests.post(f"{API}/billing/docs", headers=people["pm"]["h"], json={"type": "quotation", "bill_to": {"company": "x", "country": "India"}, "items": [{"description": "x", "qty": 1, "unit_price": 1}]}).status_code == 403
        d = _doc(people["sales"]["h"], client_id=clients[0]["id"])
        made.append(d["id"])
        assert requests.delete(f"{API}/records/billing_docs/{d['id']}", headers=people["sales"]["h"]).status_code == 403
        assert requests.put(f"{API}/billing/company", headers=people["pm"]["h"], json={"tagline": "x"}).status_code == 403
        assert requests.put(f"{API}/billing/company", headers=people["fin"]["h"], json={"tagline": "AI Marketing-Tech Agency"}).status_code == 200

    def test_branch_scope(self, sa, people, clients, made):
        r = requests.post(f"{API}/locations/branches", headers=sa, json={"name": f"T32 Branch {TAG}", "city": "Salem", "state": "Tamil Nadu", "country": "India"})
        b = r.json()
        try:
            assert requests.put(f"{API}/workspace/clients/{clients[0]['id']}", headers=sa, json={"branch_id": b["id"]}).status_code == 200
            requests.put(f"{API}/access/users/{people['scoped']['id']}/branches", headers=sa, json={"assignments": [{"branch_id": b["id"], "branch_role": "manager"}]})
            h = _login(people["scoped"]["email"])
            mine = _doc(sa, client_id=clients[0]["id"])
            theirs = _doc(sa, client_id=clients[1]["id"], bill_to={"company": "Mumbai Co LLP", "state_code": "27", "country": "India"}, tax_mode="gst_inter")
            made += [mine["id"], theirs["id"]]
            assert requests.get(f"{API}/billing/docs/{mine['id']}", headers=h).status_code == 200
            assert requests.get(f"{API}/billing/docs/{theirs['id']}", headers=h).status_code == 403
            assert requests.post(f"{API}/billing/docs", headers=h, json={"type": "quotation", "client_id": clients[1]["id"], "bill_to": {"company": "x", "state_code": "27", "country": "India"}, "tax_mode": "gst_inter",
                                                                       "items": [{"description": "x", "qty": 1, "unit_price": 1}]}).status_code == 403
            ids = {x["id"] for x in requests.get(f"{API}/billing/docs", headers=h).json()}
            assert mine["id"] in ids and theirs["id"] not in ids
            assert clients[1]["id"] not in {c["id"] for c in requests.get(f"{API}/billing/meta", headers=h).json()["clients"]}
        finally:
            requests.put(f"{API}/workspace/clients/{clients[0]['id']}", headers=sa, json={"branch_id": None})
            requests.delete(f"{API}/records/branches/{b['id']}", headers=sa, params={"permanent": True})


class TestPdf:
    def test_pdfs_for_every_mode(self, sa, clients, made):
        bt_in = {"name": "Arun", "company": "Chennai Co Pvt Ltd", "state_code": "33", "gstin": "33AAACC1234A1Z5", "country": "India", "address": "1 Mount Road"}
        bt_out = {"name": "Omar", "company": "Dubai Co FZE", "country": "United Arab Emirates", "tax_id": "TRN 1003", "state_code": ""}
        for kw in ({"type": "quotation", "bill_to": bt_in}, {"type": "invoice", "bill_to": bt_in, "discount_pct": 10},
                   {"type": "proforma", "bill_to": bt_out, "currency": "AED", "fx_rate": 22.7, "tax_mode": "zero_rated"},
                   {"type": "invoice", "bill_to": bt_out, "currency": "EUR", "fx_rate": 90, "tax_mode": "none"}):
            d = _doc(sa, **kw)
            made.append(d["id"])
            r = requests.get(f"{API}/billing/docs/{d['id']}/pdf", headers=sa)
            assert r.status_code == 200 and r.content[:4] == b"%PDF" and len(r.content) > 20000, kw
            assert "attachment" in r.headers["content-disposition"]

    def test_pdf_with_unicode_client(self, sa, made):
        d = _doc(sa, bill_to={"company": f"சென்னை நிறுவனம் {TAG}", "state_code": "33", "country": "India"})
        made.append(d["id"])
        r = requests.get(f"{API}/billing/docs/{d['id']}/pdf", headers=sa)
        assert r.status_code == 200 and r.content[:4] == b"%PDF"


class TestAI:
    def test_ai_reads_billing_without_tokens(self, sa, made):
        before = requests.get(f"{API}/ai-settings", headers=sa).json()
        lvl = (before.get("access") or {}).get("billing", "none")
        assert requests.put(f"{API}/ai-settings", headers=sa, json={"enabled": True, "access": {"billing": "read"}}).status_code == 200
        r = requests.post(f"{API}/ai-settings/tokens", headers=sa, json={"name": f"T32 {TAG}", "access": {"billing": "read"}, "expires_days": 1})
        assert r.status_code == 200, r.text
        h = {"Authorization": f"Bearer {r.json()['token']}"}
        recs = requests.get(f"{API}/ai/v1/records/billing", headers=h, params={"limit": 50}).json()["records"]
        assert recs and all("share_token" not in x for x in recs)
        requests.post(f"{API}/ai-settings/tokens/{r.json()['id']}/revoke", headers=sa)
        requests.put(f"{API}/ai-settings", headers=sa, json={"access": {"billing": lvl if lvl != "none" else "read"}})
