"""v3.0 Finance → Loans: money we borrowed and money we lent (including salary advances to employees).

  • EMI schedule worked out from principal, annual rate, tenure and method (reducing balance, flat, interest-only,
    or interest-free). Override the EMI if the bank's figure differs slightly.
  • Repayments split into interest and principal automatically (editable). Outstanding principal, interest paid,
    next due date and overdue amount are always current.
  • Employee advances can be recovered through payroll: each month's payslip deducts the EMI and records the repayment.
  • Optional: post each repayment to the ledger as an expense (category "loan_emi").

Gate: /api/finance/loans needs `finance.loans`; deletes use `finance.delete`.
"""
import uuid
from datetime import date, datetime, timezone
from typing import Optional, List
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException
from database import db
from auth import get_current_user, log_activity
from permissions import has_permission

router = APIRouter()

KINDS = {"term_loan": "Term loan", "working_capital": "Working capital / OD", "vehicle": "Vehicle loan", "equipment": "Equipment loan",
         "gold": "Gold loan", "business": "Business loan (NBFC)", "personal": "Personal / director loan", "employee_advance": "Employee advance",
         "client_advance": "Loan to a client / partner", "other": "Other"}
METHODS = {"reducing": "Reducing balance (EMI)", "flat": "Flat rate", "interest_only": "Interest only, principal at the end", "zero": "Interest-free"}
FIN_WRITE = ("super_admin", "admin", "finance")


def _now():
    return datetime.now(timezone.utc).isoformat()


def _add_months(d: date, k: int) -> date:
    y, m = divmod(d.month - 1 + k, 12)
    y, m = d.year + y, m + 1
    import calendar
    return date(y, m, min(d.day, calendar.monthrange(y, m)[1]))


def emi_for(principal: float, rate: float, n: int, method: str) -> float:
    P, n = float(principal or 0), max(1, int(n or 1))
    r = float(rate or 0) / 1200
    if method == "zero" or r == 0:
        return P / n
    if method == "flat":
        return (P + P * float(rate) / 100 * n / 12) / n
    if method == "interest_only":
        return P * r
    return P * r * (1 + r) ** n / ((1 + r) ** n - 1)


def schedule(ln: dict) -> List[dict]:
    P, n, method = float(ln.get("principal") or 0), max(1, int(ln.get("tenure_months") or 1)), ln.get("method", "reducing")
    r = float(ln.get("rate_annual") or 0) / 1200
    emi = float(ln.get("emi_override") or 0) or emi_for(P, ln.get("rate_annual"), n, method)
    try:
        first = date.fromisoformat(ln["first_emi_date"][:10])
    except (KeyError, ValueError, TypeError):
        first = date.today()
    rows, bal = [], P
    flat_int = P * float(ln.get("rate_annual") or 0) / 100 * n / 12 / n if method == "flat" else 0
    for k in range(n):
        if bal <= 0.005:
            break
        if method == "flat":
            interest, principal = flat_int, min(bal, emi - flat_int)
        elif method == "interest_only":
            interest = bal * r
            principal = bal if k == n - 1 else 0
        elif method == "zero" or r == 0:
            interest, principal = 0.0, min(bal, emi)
        else:
            interest = bal * r
            principal = min(bal, emi - interest)
        amount = interest + principal
        rows.append({"n": k + 1, "due_date": _add_months(first, k).isoformat(), "opening": round(bal, 2), "emi": round(amount, 2),
                     "interest": round(interest, 2), "principal": round(principal, 2), "closing": round(max(0.0, bal - principal), 2)})
        bal -= principal
    return rows


def loan_status(ln: dict) -> dict:
    sch = schedule(ln)
    pays = sorted(ln.get("payments") or [], key=lambda p: p.get("date") or "")
    paid = sum(float(p.get("amount") or 0) for p in pays)
    princ_paid = sum(float(p.get("principal") or 0) for p in pays)
    int_paid = sum(float(p.get("interest") or 0) for p in pays)
    outstanding = max(0.0, float(ln.get("principal") or 0) - princ_paid)
    today = date.today().isoformat()
    due_so_far = sum(r["emi"] for r in sch if r["due_date"] <= today)
    overdue = max(0.0, due_so_far - paid)
    cum, nxt = 0.0, None
    for r in sch:
        cum += r["emi"]
        if cum > paid + 0.5:
            nxt = r
            break
    sched_interest_left = sum(r["interest"] for r in sch if not nxt or r["n"] >= nxt["n"])
    emi = float(ln.get("emi_override") or 0) or (sch[0]["emi"] if sch else 0)
    months_left = sum(1 for r in sch if nxt and r["n"] >= nxt["n"]) if outstanding > 0.5 else 0
    status = ln.get("status", "active")
    return {"emi": round(emi, 2), "paid_total": round(paid, 2), "principal_repaid": round(princ_paid, 2), "interest_paid": round(int_paid, 2),
            "outstanding_principal": round(outstanding, 2), "outstanding_total": round(outstanding + (sched_interest_left if outstanding > 0.5 else 0), 2),
            "next_due": {"date": nxt["due_date"], "amount": round(min(nxt["emi"], max(0.0, cum - paid)), 2), "n": nxt["n"]} if nxt and status == "active" and outstanding > 0.5 else None,
            "overdue_amount": round(overdue, 2) if status == "active" and outstanding > 0.5 else 0,
            "months_left": months_left, "installments": len(sch), "progress": round(100 * princ_paid / float(ln["principal"]), 1) if float(ln.get("principal") or 0) else 0,
            "total_interest": round(sum(r["interest"] for r in sch), 2)}


def _view(ln: dict, with_schedule=False) -> dict:
    out = {k: v for k, v in ln.items() if k != "_id"}
    out["kind_label"] = KINDS.get(ln.get("kind"), ln.get("kind"))
    out["method_label"] = METHODS.get(ln.get("method"), ln.get("method"))
    out.update(loan_status(ln))
    out["payments"] = sorted(ln.get("payments") or [], key=lambda p: p.get("date") or "", reverse=True)
    if with_schedule:
        sch = schedule(ln)
        paid = out["paid_total"]
        cum = 0.0
        for r in sch:
            cum += r["emi"]
            r["state"] = "paid" if cum <= paid + 0.5 else ("overdue" if r["due_date"] < date.today().isoformat() else "upcoming")
        out["schedule"] = sch
    return out


class LoanIn(BaseModel):
    name: str
    direction: str = "borrowed"          # borrowed | lent
    kind: str = "term_loan"
    counterparty: Optional[str] = ""
    employee_id: Optional[str] = None
    principal: float
    rate_annual: float = 0
    method: str = "reducing"
    tenure_months: int = 12
    disbursed_on: Optional[str] = None
    first_emi_date: str
    emi_override: Optional[float] = None
    processing_fee: Optional[float] = 0
    account_ref: Optional[str] = ""
    collateral: Optional[str] = ""
    recover_via_payroll: bool = False
    notes: Optional[str] = ""
    status: str = "active"


class PaymentIn(BaseModel):
    date: str
    amount: float
    principal: Optional[float] = None
    interest: Optional[float] = None
    mode: Optional[str] = "bank_transfer"
    note: Optional[str] = ""
    post_to_ledger: bool = False


class PreviewIn(BaseModel):
    principal: float
    rate_annual: float = 0
    tenure_months: int = 12
    method: str = "reducing"
    first_emi_date: Optional[str] = None


def _need_write(user):
    if user["role"] not in FIN_WRITE:
        raise HTTPException(status_code=403, detail="Only finance can add or change loans")


async def _validate(b: LoanIn):
    if b.direction not in ("borrowed", "lent"):
        raise HTTPException(status_code=400, detail="Direction must be borrowed or lent")
    if b.kind not in KINDS:
        raise HTTPException(status_code=400, detail="Invalid loan type")
    if b.method not in METHODS:
        raise HTTPException(status_code=400, detail="Invalid repayment method")
    if b.principal <= 0:
        raise HTTPException(status_code=400, detail="Principal must be more than zero")
    if not 0 <= b.rate_annual <= 60:
        raise HTTPException(status_code=400, detail="Interest rate looks wrong (0–60% a year)")
    if not 1 <= b.tenure_months <= 480:
        raise HTTPException(status_code=400, detail="Tenure must be 1–480 months")
    try:
        date.fromisoformat(b.first_emi_date[:10])
        if b.disbursed_on:
            date.fromisoformat(b.disbursed_on[:10])
    except ValueError:
        raise HTTPException(status_code=400, detail="Dates must be YYYY-MM-DD")
    if b.status not in ("active", "closed", "defaulted"):
        raise HTTPException(status_code=400, detail="Invalid status")
    if b.employee_id:
        if not await db.users.find_one({"id": b.employee_id}, {"_id": 0, "id": 1}):
            raise HTTPException(status_code=400, detail="Employee not found")
    if b.recover_via_payroll and not (b.direction == "lent" and b.employee_id):
        raise HTTPException(status_code=400, detail="Only money lent to an employee can be recovered through payroll")
    if b.account_ref and len(b.account_ref.strip()) > 4 and any(ch.isdigit() for ch in b.account_ref):
        b.account_ref = "…" + b.account_ref.strip()[-4:]  # never keep full loan account numbers


@router.post("/finance/loans/preview")
async def preview(body: PreviewIn, user: dict = Depends(get_current_user)):
    ln = {"principal": body.principal, "rate_annual": body.rate_annual, "tenure_months": body.tenure_months, "method": body.method,
          "first_emi_date": body.first_emi_date or date.today().isoformat()}
    sch = schedule(ln)
    return {"emi": round(emi_for(body.principal, body.rate_annual, body.tenure_months, body.method), 2), "total_interest": round(sum(r["interest"] for r in sch), 2),
            "total_payable": round(sum(r["emi"] for r in sch), 2), "schedule": sch[:480]}


@router.get("/finance/loans")
async def list_loans(direction: Optional[str] = None, status: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = {}
    if direction in ("borrowed", "lent"):
        q["direction"] = direction
    if status:
        q["status"] = status
    rows = [_view(l) for l in await db.loans.find(q, {"_id": 0}).sort("first_emi_date", -1).to_list(1000)]
    names = {u["id"]: u["name"] for u in await db.users.find({"id": {"$in": [r.get("employee_id") for r in rows if r.get("employee_id")]}}, {"_id": 0, "id": 1, "name": 1}).to_list(500)}
    for r in rows:
        r["employee_name"] = names.get(r.get("employee_id"), "")
    active = [r for r in rows if r.get("status") == "active"]
    month = date.today().strftime("%Y-%m")
    t = date.today()
    fy_start = date(t.year if t.month >= 4 else t.year - 1, 4, 1).isoformat()  # Indian financial year (Apr–Mar)

    def due_this_month(r):
        return sum(x["emi"] for x in schedule(r) if x["due_date"][:7] == month)

    summary = {
        "borrowed_outstanding": round(sum(r["outstanding_principal"] for r in active if r["direction"] == "borrowed")),
        "lent_outstanding": round(sum(r["outstanding_principal"] for r in active if r["direction"] == "lent")),
        "emi_out_this_month": round(sum(due_this_month(r) for r in active if r["direction"] == "borrowed")),
        "emi_in_this_month": round(sum(due_this_month(r) for r in active if r["direction"] == "lent")),
        "overdue": round(sum(r["overdue_amount"] for r in active)), "overdue_count": sum(1 for r in active if r["overdue_amount"] > 0.5),
        "interest_paid_fy": round(sum(float(p.get("interest") or 0) for r in rows if r["direction"] == "borrowed" for p in r["payments"]
                                      if (p.get("date") or "") >= fy_start)),
        "active": len(active),
    }
    upcoming = sorted([{"loan_id": r["id"], "name": r["name"], "direction": r["direction"], **r["next_due"]} for r in active if r.get("next_due")],
                      key=lambda x: x["date"])[:8]
    return {"loans": rows, "summary": summary, "upcoming": upcoming, "kinds": [{"value": k, "label": v} for k, v in KINDS.items()],
            "methods": [{"value": k, "label": v} for k, v in METHODS.items()], "can_write": user["role"] in FIN_WRITE,
            "can_delete": has_permission(user, "finance.delete")}


@router.get("/finance/loans/{lid}")
async def get_loan(lid: str, user: dict = Depends(get_current_user)):
    ln = await db.loans.find_one({"id": lid}, {"_id": 0})
    if not ln:
        raise HTTPException(status_code=404, detail="Loan not found")
    v = _view(ln, with_schedule=True)
    if v.get("employee_id"):
        u = await db.users.find_one({"id": v["employee_id"]}, {"_id": 0, "name": 1})
        v["employee_name"] = (u or {}).get("name", "")
    return v


@router.post("/finance/loans")
async def create_loan(body: LoanIn, user: dict = Depends(get_current_user)):
    _need_write(user)
    await _validate(body)
    doc = {"id": str(uuid.uuid4()), **body.dict(), "name": body.name.strip()[:120], "payments": [], "created_by": user["id"], "created_at": _now()}
    if doc["kind"] == "employee_advance" and not doc.get("employee_id"):
        raise HTTPException(status_code=400, detail="Pick the employee for an advance")
    await db.loans.insert_one(dict(doc))
    await log_activity(user, "loan_created", "loan", doc["id"], f"{doc['name']} · ₹{int(doc['principal']):,} {doc['direction']}")
    return await get_loan(doc["id"], user)


@router.put("/finance/loans/{lid}")
async def update_loan(lid: str, body: LoanIn, user: dict = Depends(get_current_user)):
    _need_write(user)
    ln = await db.loans.find_one({"id": lid}, {"_id": 0})
    if not ln:
        raise HTTPException(status_code=404, detail="Loan not found")
    await _validate(body)
    await db.loans.update_one({"id": lid}, {"$set": {**body.dict(), "name": body.name.strip()[:120], "updated_at": _now()}})
    await log_activity(user, "loan_updated", "loan", lid, body.name)
    return await get_loan(lid, user)


async def record_payment_internal(lid: str, on: str, amount: float, via: str, note: str, user: dict,
                                  principal: Optional[float] = None, interest: Optional[float] = None, mode: str = "bank_transfer",
                                  post_to_ledger: bool = False) -> dict:
    ln = await db.loans.find_one({"id": lid}, {"_id": 0})
    if not ln:
        raise HTTPException(status_code=404, detail="Loan not found")
    st = loan_status(ln)
    if principal is None or interest is None:
        r = float(ln.get("rate_annual") or 0) / 1200
        method = ln.get("method", "reducing")
        if method == "flat":
            n = max(1, int(ln.get("tenure_months") or 1))
            due_int = float(ln["principal"]) * float(ln.get("rate_annual") or 0) / 100 * n / 12 / n
        elif method == "zero":
            due_int = 0.0
        else:
            due_int = st["outstanding_principal"] * r
        interest = round(min(amount, due_int), 2) if interest is None else interest
        principal = round(max(0.0, amount - interest), 2) if principal is None else principal
    principal = min(principal, st["outstanding_principal"])
    pay = {"id": str(uuid.uuid4()), "date": on, "amount": round(amount, 2), "principal": round(principal, 2), "interest": round(interest, 2),
           "mode": mode, "note": (note or "")[:300], "via": via, "txn_id": None, "by": user.get("name"), "at": _now()}
    if post_to_ledger:
        tid = str(uuid.uuid4())
        await db.transactions.insert_one({"id": tid, "type": "expense" if ln["direction"] == "borrowed" else "income", "date": on, "amount": pay["amount"],
                                          "category": "loan_emi" if ln["direction"] == "borrowed" else "other",
                                          "description": f"{'EMI' if ln['direction'] == 'borrowed' else 'Repayment received'} · {ln['name']} (interest ₹{int(pay['interest']):,})",
                                          "client_id": None, "project_id": None, "invoice_ref": "", "payment_method": mode, "campaign_id": None,
                                          "ai_tool": None, "source": "loans", "currency": "INR", "created_by": user.get("id"), "created_at": _now()})
        pay["txn_id"] = tid
    sets = {}
    if st["outstanding_principal"] - principal <= 0.5:
        sets["status"] = "closed"
        sets["closed_on"] = on
    await db.loans.update_one({"id": lid}, {"$push": {"payments": pay}, **({"$set": sets} if sets else {})})
    await log_activity(user, "loan_payment_recorded", "loan", lid, f"{ln['name']} · ₹{int(amount):,} via {via}" + (" · closed" if sets else ""))
    return pay


@router.post("/finance/loans/{lid}/payments")
async def add_payment(lid: str, body: PaymentIn, user: dict = Depends(get_current_user)):
    _need_write(user)
    try:
        date.fromisoformat(body.date[:10])
    except ValueError:
        raise HTTPException(status_code=400, detail="Date must be YYYY-MM-DD")
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be more than zero")
    if body.principal is not None and body.interest is not None and abs(body.principal + body.interest - body.amount) > 1:
        raise HTTPException(status_code=400, detail="Principal + interest should add up to the amount")
    await record_payment_internal(lid, body.date[:10], body.amount, "manual", body.note, user, body.principal, body.interest, body.mode or "bank_transfer",
                                  body.post_to_ledger)
    return await get_loan(lid, user)


async def loan_alerts(user: dict) -> list:
    if not has_permission(user, "finance.loans"):
        return []
    items = []
    today = date.today()
    in5 = date.fromordinal(today.toordinal() + 5).isoformat()
    async for ln in db.loans.find({"status": "active"}, {"_id": 0}):
        st = loan_status(ln)
        if st["overdue_amount"] > 0.5:
            items.append({"kind": "loan", "title": f"{'EMI overdue' if ln['direction'] == 'borrowed' else 'Repayment overdue'}: {ln['name']}",
                          "sub": f"₹{int(st['overdue_amount']):,} past due", "link": f"/finance/loans?open={ln['id']}", "date": today.isoformat()})
        elif st["next_due"] and st["next_due"]["date"] <= in5 and ln["direction"] == "borrowed" and not ln.get("recover_via_payroll"):
            items.append({"kind": "loan", "title": f"EMI due {st['next_due']['date']}: {ln['name']}", "sub": f"₹{int(st['next_due']['amount']):,}",
                          "link": f"/finance/loans?open={ln['id']}", "date": st["next_due"]["date"]})
    return items
