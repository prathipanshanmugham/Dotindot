"""v3.0 Payroll — salaries, PF / EPF, ESI, incentives, bonuses and commissions.

  • Salary structures: monthly components (basic, HRA, special, conveyance, other allowances), PF / ESI flags,
    professional tax and TDS per month. Build one from an annual CTC with the split helper. Every revision is kept.
  • Pay items: incentives, bonuses, commissions, arrears, reimbursements and one-off deductions. They start
    pending, get approved, and the approved ones flow into that month's payroll run.
  • Incentive plans: monthly incentive on a target, yearly turnover bonus, sales commission, or a target-based
    salary increase. "Calculate" reads the real numbers (branch revenue, company revenue, deals won) and proposes
    pay items for approval. Approving an increase revises the salary structure.
  • Payroll runs: one per month. Draft → finalise → mark paid. Paid days come from joining / exit dates and
    loss-of-pay days (optionally counted from attendance). Employee advances recover automatically (Loans).
    Marking paid can post the cost to the ledger (category: salaries).

Statutory defaults (editable in Payroll settings): employee PF 12 % of PF wages; employer 12 % split into EPS 8.33 %
(on wages up to the ₹25,000 ceiling — raised from ₹15,000 by EPFO notification S.O. 5109(E), effective 17 Sep 2026) and EPF
(the rest); EDLI 0.5 % and admin 0.5 %; ESI 0.75 % / 3.25 % when gross ≤ ₹21,000.
"Labour Code wage rule" (on by default) treats PF wages as at least 50 % of fixed pay. Check rates with your accountant.

Gate: /api/hr/payroll/* needs `payroll`; writes need `payroll.manage`. Employees see their own payslips at /api/me/payslips.
"""
import calendar
import math
import uuid
from datetime import date, datetime, timedelta, timezone
from io import BytesIO
from typing import Optional, List, Dict
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from database import db
from auth import get_current_user, log_activity, decrypt_secret
from permissions import has_permission

router = APIRouter()

DEFAULTS = {
    "pf_employee_rate": 12.0, "pf_employer_rate": 12.0, "eps_rate": 8.33, "edli_rate": 0.5, "pf_admin_rate": 0.5,
    "pf_wage_ceiling": 25000, "employee_pf_on_ceiling": True, "employer_pf_on_ceiling": True, "labour_code_wages": True,
    "esi_wage_limit": 21000, "esi_employee_rate": 0.75, "esi_employer_rate": 3.25,
    "default_pt": 0, "lop_from_attendance": False, "basic_percent_of_gross": 50, "hra_percent_of_basic": 40,
    "post_to_ledger": True, "company_name": "dotindot Creative", "company_address": "",
}
ITEM_KINDS = {"incentive": "Incentive", "bonus": "Bonus", "commission": "Commission", "arrears": "Arrears",
              "reimbursement": "Reimbursement", "other_earning": "Other earning", "deduction": "Deduction", "increment": "Salary increase"}
EARNING_KINDS = ("incentive", "bonus", "commission", "arrears", "reimbursement", "other_earning")
PLAN_KINDS = {"monthly_incentive": "Monthly incentive", "yearly_bonus": "Yearly turnover bonus", "commission": "Sales commission",
              "increment": "Target-based salary increase"}
METRICS = {"branch_revenue": "Branch revenue (income booked for the branch's clients)", "company_revenue": "Company revenue (all income)",
           "own_sales_won": "Deals won by the person (pipeline value)", "manual": "Entered by hand"}
PAYOUTS = {"fixed": "Fixed amount when target is met", "percent_of_metric": "% of the metric", "percent_above_target": "% of the amount above target",
           "percent_of_ctc": "% of CTC when target is met"}


def _now():
    return datetime.now(timezone.utc).isoformat()


def _need(user):
    if not has_permission(user, "payroll.manage"):
        raise HTTPException(status_code=403, detail="You need Payroll → manage to change this")


def _month_ok(m: str):
    try:
        datetime.strptime(m, "%Y-%m")
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Month must be YYYY-MM")


def _month_bounds(m: str):
    y, mo = map(int, m.split("-"))
    return date(y, mo, 1), date(y, mo, calendar.monthrange(y, mo)[1])


def _month_label(m: str) -> str:
    return datetime.strptime(m, "%Y-%m").strftime("%B %Y")


async def payroll_settings() -> dict:
    doc = await db.settings.find_one({"id": "payroll"}, {"_id": 0}) or {}
    return {**DEFAULTS, **{k: v for k, v in doc.items() if k in DEFAULTS}}


def _r(x) -> int:
    return int(math.floor(float(x) + 0.5))


# ------------------------------------------------------------------ salary math
def split_ctc(ctc_annual: float, cfg: dict, pf_applicable: bool = True, hra_pct: Optional[float] = None, basic_pct: Optional[float] = None) -> dict:
    """Monthly components whose cost to company (gross + employer PF + employer ESI) equals CTC / 12."""
    target = float(ctc_annual or 0) / 12
    bp = float(basic_pct if basic_pct is not None else cfg["basic_percent_of_gross"]) / 100
    hp = float(hra_pct if hra_pct is not None else cfg["hra_percent_of_basic"]) / 100

    ceiling = float(cfg["pf_wage_ceiling"])

    def pf_wage_of(g):
        basic = g * bp
        return max(basic, 0.5 * g) if cfg["labour_code_wages"] else basic

    def employer_pf(g):
        if not pf_applicable:
            return 0.0
        w = pf_wage_of(g)
        base = min(w, ceiling) if cfg["employer_pf_on_ceiling"] else w
        return base * cfg["pf_employer_rate"] / 100 + min(w, ceiling) * cfg["edli_rate"] / 100 + base * cfg["pf_admin_rate"] / 100

    def cost(g):  # same parts as compute_slip's employer cost
        esi = g * cfg["esi_employer_rate"] / 100 if g <= cfg["esi_wage_limit"] else 0
        return g + employer_pf(g) + esi

    lo, hi = 0.0, max(target, 1.0)
    for _ in range(60):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if cost(mid) < target else (lo, mid)
    gross = _r(lo)
    basic = _r(gross * bp)
    hra = _r(basic * hp)
    special = max(0, gross - basic - hra)
    return {"basic": basic, "hra": hra, "special": special, "conveyance": 0, "other_allowances": [], "gross": gross,
            "employer_pf": _r(employer_pf(gross)),
            "esi_applicable": gross <= cfg["esi_wage_limit"]}


def _fixed(monthly: dict) -> dict:
    lines = [("BASIC", "Basic", monthly.get("basic", 0)), ("HRA", "House rent allowance", monthly.get("hra", 0)),
             ("SPECIAL", "Special allowance", monthly.get("special", 0)), ("CONV", "Conveyance", monthly.get("conveyance", 0))]
    for i, o in enumerate(monthly.get("other_allowances") or []):
        lines.append((f"OTH{i + 1}", o.get("name") or "Allowance", o.get("amount", 0)))
    return [(c, n, float(a or 0)) for c, n, a in lines if float(a or 0)]


def compute_slip(struct: dict, month: str, cfg: dict, *, lop_days: float = 0, join_date: str = "", exit_date: str = "",
                 items: List[dict] = (), loans: List[dict] = (), extra_earnings: List[dict] = (), extra_deductions: List[dict] = (),
                 tds: Optional[float] = None, pt: Optional[float] = None) -> dict:
    start, end = _month_bounds(month)
    days = (end - start).days + 1
    first, last = start, end
    try:
        if join_date and start <= date.fromisoformat(join_date[:10]) <= end:
            first = date.fromisoformat(join_date[:10])
        if exit_date and start <= date.fromisoformat(exit_date[:10]) <= end:
            last = date.fromisoformat(exit_date[:10])
    except ValueError:
        pass
    eligible = max(0, (last - first).days + 1)
    lop = max(0.0, min(float(lop_days or 0), eligible))
    paid = eligible - lop
    f = paid / days if days else 0
    monthly = struct.get("monthly") or {}
    earnings = [{"code": c, "name": n, "amount": _r(a * f)} for c, n, a in _fixed(monthly)]
    fixed_earned = sum(e["amount"] for e in earnings)
    full_gross = sum(a for _, _, a in _fixed(monthly))
    for it in items:
        if it.get("kind") in EARNING_KINDS and float(it.get("amount") or 0):
            earnings.append({"code": it["kind"].upper()[:8], "name": it.get("title") or ITEM_KINDS[it["kind"]], "amount": _r(it["amount"]), "item_id": it["id"]})
    for e in extra_earnings or []:
        if float(e.get("amount") or 0):
            earnings.append({"code": "ADJ", "name": e.get("name") or "Adjustment", "amount": _r(e["amount"]), "manual": True})
    gross = sum(e["amount"] for e in earnings)

    basic_e = next((e["amount"] for e in earnings if e["code"] == "BASIC"), 0)
    pf_wage = max(basic_e, _r(fixed_earned * 0.5)) if cfg["labour_code_wages"] else basic_e
    ceiling = float(cfg["pf_wage_ceiling"])
    deductions, employer = [], []
    ee_pf = eps = er_epf = edli = admin = 0
    if struct.get("pf_applicable", True) and pf_wage > 0:
        ee_base = min(pf_wage, ceiling) if cfg["employee_pf_on_ceiling"] else pf_wage
        er_base = min(pf_wage, ceiling) if cfg["employer_pf_on_ceiling"] else pf_wage
        ee_pf = _r(ee_base * cfg["pf_employee_rate"] / 100)
        er_total = _r(er_base * cfg["pf_employer_rate"] / 100)
        eps = min(_r(min(pf_wage, ceiling) * cfg["eps_rate"] / 100), er_total)
        er_epf = er_total - eps
        edli = _r(min(pf_wage, ceiling) * cfg["edli_rate"] / 100)
        admin = _r(er_base * cfg["pf_admin_rate"] / 100)
        deductions.append({"code": "PF", "name": f"Provident fund (employee {cfg['pf_employee_rate']:g}%)", "amount": ee_pf})
        employer += [{"code": "EPF", "name": "EPF (employer share)", "amount": er_epf},
                     {"code": "EPS", "name": f"Pension EPS ({cfg['eps_rate']:g}%)", "amount": eps},
                     {"code": "EDLI", "name": "EDLI insurance", "amount": edli}, {"code": "PFADM", "name": "PF admin charges", "amount": admin}]
    esi_mode = struct.get("esi_applicable", "auto")
    esi_on = esi_mode == "yes" or (esi_mode == "auto" and 0 < full_gross <= float(cfg["esi_wage_limit"]))
    ee_esi = er_esi = 0
    if esi_on:
        esi_wage = gross - sum(e["amount"] for e in earnings if e["code"] in ("BONUS", "REIMBURS"))
        ee_esi = math.ceil(esi_wage * cfg["esi_employee_rate"] / 100)
        er_esi = math.ceil(esi_wage * cfg["esi_employer_rate"] / 100)
        deductions.append({"code": "ESI", "name": f"ESI (employee {cfg['esi_employee_rate']:g}%)", "amount": ee_esi})
        employer.append({"code": "ESIER", "name": f"ESI (employer {cfg['esi_employer_rate']:g}%)", "amount": er_esi})
    pt_v = _r(pt if pt is not None else (struct.get("pt_monthly") if struct.get("pt_monthly") is not None else cfg["default_pt"]))
    if pt_v and paid > 0:
        deductions.append({"code": "PT", "name": "Professional tax", "amount": pt_v})
    tds_v = _r(tds if tds is not None else (struct.get("tds_monthly") or 0))
    if tds_v:
        deductions.append({"code": "TDS", "name": "Income tax (TDS)", "amount": tds_v})
    for it in items:
        if it.get("kind") == "deduction" and float(it.get("amount") or 0):
            deductions.append({"code": "DED", "name": it.get("title") or "Deduction", "amount": _r(it["amount"]), "item_id": it["id"]})
    for d in extra_deductions or []:
        if float(d.get("amount") or 0):
            deductions.append({"code": "ADJ", "name": d.get("name") or "Adjustment", "amount": _r(d["amount"]), "manual": True})
    # advance recovery last, and only from what's left — a short month recovers less, never more than is paid
    room = max(0, gross - sum(d["amount"] for d in deductions))
    for ln in loans:
        amt = min(_r(ln.get("amount") or 0), room)
        if amt > 0:
            deductions.append({"code": "LOAN", "name": ln.get("name") or "Advance recovery", "amount": amt, "loan_id": ln["loan_id"]})
            room -= amt
    total_ded = sum(d["amount"] for d in deductions)
    net = max(0, gross - total_ded)
    er_cost = sum(e["amount"] for e in employer)
    return {"days_in_month": days, "eligible_days": eligible, "lop_days": lop, "paid_days": round(paid, 1),
            "earnings": earnings, "deductions": deductions, "employer": employer,
            "gross": gross, "total_deductions": total_ded, "net": net, "employer_cost": gross + er_cost,
            "pf_wage": pf_wage if struct.get("pf_applicable", True) else 0, "eps_wage": min(pf_wage, ceiling) if struct.get("pf_applicable", True) else 0,
            "ee_pf": ee_pf, "eps": eps, "er_epf": er_epf, "edli": edli, "pf_admin": admin, "esi_applicable": esi_on, "ee_esi": ee_esi, "er_esi": er_esi,
            "pt": pt_v if paid > 0 else 0, "tds": tds_v}


# ------------------------------------------------------------------ settings + meta
class SettingsIn(BaseModel):
    values: Dict[str, object]


@router.get("/hr/payroll/meta")
async def meta(user: dict = Depends(get_current_user)):
    return {"settings": await payroll_settings(), "item_kinds": [{"value": k, "label": v} for k, v in ITEM_KINDS.items()],
            "plan_kinds": [{"value": k, "label": v} for k, v in PLAN_KINDS.items()], "metrics": [{"value": k, "label": v} for k, v in METRICS.items()],
            "payouts": [{"value": k, "label": v} for k, v in PAYOUTS.items()],
            "can_manage": has_permission(user, "payroll.manage"), "can_delete": has_permission(user, "payroll.delete")}


@router.put("/hr/payroll/settings")
async def save_settings(body: SettingsIn, user: dict = Depends(get_current_user)):
    _need(user)
    sets = {}
    for k, v in body.values.items():
        if k not in DEFAULTS:
            continue
        d = DEFAULTS[k]
        if isinstance(d, bool):
            sets[k] = bool(v)
        elif isinstance(d, (int, float)):
            try:
                n = float(v)
            except (TypeError, ValueError):
                raise HTTPException(status_code=400, detail=f"{k} must be a number")
            if n < 0 or (k.endswith("_rate") and n > 50):
                raise HTTPException(status_code=400, detail=f"{k} looks wrong")
            sets[k] = n
        else:
            sets[k] = str(v)[:300]
    await db.settings.update_one({"id": "payroll"}, {"$set": {"id": "payroll", **sets}}, upsert=True)
    await log_activity(user, "payroll_settings_updated", "settings", "payroll", ", ".join(sets))
    return await payroll_settings()


# ------------------------------------------------------------------ structures
class Allowance(BaseModel):
    name: str
    amount: float


class Monthly(BaseModel):
    basic: float = 0
    hra: float = 0
    special: float = 0
    conveyance: float = 0
    other_allowances: List[Allowance] = []


class StructureIn(BaseModel):
    user_id: str
    effective_from: str
    ctc_annual: float = 0
    monthly: Monthly
    pf_applicable: bool = True
    esi_applicable: str = "auto"   # auto | yes | no
    pt_monthly: Optional[float] = None
    tds_monthly: Optional[float] = 0
    reason: Optional[str] = ""


class PreviewIn(BaseModel):
    ctc_annual: float
    pf_applicable: bool = True
    hra_percent_of_basic: Optional[float] = None
    basic_percent_of_gross: Optional[float] = None


@router.post("/hr/payroll/structures/preview")
async def preview_structure(body: PreviewIn, user: dict = Depends(get_current_user)):
    cfg = await payroll_settings()
    parts = split_ctc(body.ctc_annual, cfg, body.pf_applicable, body.hra_percent_of_basic, body.basic_percent_of_gross)
    slip = compute_slip({"monthly": parts, "pf_applicable": body.pf_applicable, "esi_applicable": "auto"}, date.today().strftime("%Y-%m"), cfg)
    return {"monthly": parts, "estimate": {k: slip[k] for k in ("gross", "total_deductions", "net", "employer_cost", "ee_pf", "ee_esi", "pt")},
            "deductions": slip["deductions"], "employer": slip["employer"]}


def _ctc_from(monthly: dict, pf_applicable: bool, cfg: dict) -> float:
    slip = compute_slip({"monthly": monthly, "pf_applicable": pf_applicable, "esi_applicable": "auto"}, date.today().strftime("%Y-%m"), cfg)
    return round(slip["employer_cost"] * 12)


@router.get("/hr/payroll/structures")
async def list_structures(user: dict = Depends(get_current_user)):
    cfg = await payroll_settings()
    people = await db.users.find({"deleted": {"$ne": True}, "is_active": {"$ne": False}}, {"_id": 0, "id": 1, "name": 1, "designation": 1, "department": 1,
                                                                                         "branch_id": 1, "hr": 1, "join_date": 1, "role": 1}).sort("name", 1).to_list(2000)
    structs = {s["user_id"]: s for s in await db.salary_structures.find({}, {"_id": 0}).to_list(3000)}
    out = []
    for p in people:
        s = structs.get(p["id"])
        row = {"user_id": p["id"], "name": p["name"], "designation": p.get("designation", ""), "department": p.get("department", ""),
               "employee_code": (p.get("hr") or {}).get("employee_code", ""), "has_structure": bool(s)}
        if s:
            slip = compute_slip(s, date.today().strftime("%Y-%m"), cfg)
            row.update({"structure_id": s["id"], "effective_from": s.get("effective_from"), "ctc_annual": s.get("ctc_annual"),
                        "gross_monthly": slip["gross"], "net_monthly": slip["net"], "pf_applicable": s.get("pf_applicable", True),
                        "esi": slip["esi_applicable"], "revisions": len(s.get("revisions") or [])})
        out.append(row)
    return out


@router.get("/hr/payroll/structures/{uid}")
async def get_structure(uid: str, user: dict = Depends(get_current_user)):
    s = await db.salary_structures.find_one({"user_id": uid}, {"_id": 0})
    u = await db.users.find_one({"id": uid}, {"_id": 0, "id": 1, "name": 1, "designation": 1})
    if not u:
        raise HTTPException(status_code=404, detail="Employee not found")
    cfg = await payroll_settings()
    preview = compute_slip(s, date.today().strftime("%Y-%m"), cfg) if s else None
    return {"user": u, "structure": s, "preview": preview}


@router.put("/hr/payroll/structures")
async def save_structure(body: StructureIn, user: dict = Depends(get_current_user)):
    _need(user)
    u = await db.users.find_one({"id": body.user_id}, {"_id": 0, "id": 1, "name": 1})
    if not u:
        raise HTTPException(status_code=404, detail="Employee not found")
    try:
        date.fromisoformat(body.effective_from[:10])
    except ValueError:
        raise HTTPException(status_code=400, detail="Effective from must be a date")
    if body.esi_applicable not in ("auto", "yes", "no"):
        raise HTTPException(status_code=400, detail="ESI must be auto, yes or no")
    monthly = body.monthly.dict()
    if any(float(v or 0) < 0 for k, v in monthly.items() if k != "other_allowances"):
        raise HTTPException(status_code=400, detail="Amounts can't be negative")
    cfg = await payroll_settings()
    ctc = body.ctc_annual or _ctc_from(monthly, body.pf_applicable, cfg)
    existing = await db.salary_structures.find_one({"user_id": body.user_id}, {"_id": 0})
    now = _now()
    rev = {"effective_from": body.effective_from, "ctc_annual": ctc, "monthly": monthly, "reason": body.reason or ("Initial" if not existing else "Revised"),
           "by": user["name"], "at": now}
    doc = {"user_id": u["id"], "user_name": u["name"], "effective_from": body.effective_from, "ctc_annual": ctc, "monthly": monthly,
           "pf_applicable": body.pf_applicable, "esi_applicable": body.esi_applicable, "pt_monthly": body.pt_monthly, "tds_monthly": body.tds_monthly or 0,
           "updated_at": now, "updated_by": user["id"]}
    if existing:
        await db.salary_structures.update_one({"user_id": u["id"]}, {"$set": doc, "$push": {"revisions": rev}})
    else:
        await db.salary_structures.insert_one({"id": str(uuid.uuid4()), **doc, "revisions": [rev], "created_at": now})
    await log_activity(user, "salary_structure_saved", "user", u["id"], f"{u['name']} · CTC ₹{int(ctc):,}")
    return await get_structure(u["id"], user)


# ------------------------------------------------------------------ pay items
class ItemIn(BaseModel):
    user_id: str
    month: str
    kind: str
    title: Optional[str] = ""
    amount: float
    note: Optional[str] = ""


class ItemUpdate(BaseModel):
    title: Optional[str] = None
    amount: Optional[float] = None
    month: Optional[str] = None
    note: Optional[str] = None


async def _item(iid):
    it = await db.pay_items.find_one({"id": iid}, {"_id": 0})
    if not it:
        raise HTTPException(status_code=404, detail="Item not found")
    return it


@router.get("/hr/payroll/items")
async def list_items(month: Optional[str] = None, status: Optional[str] = None, kind: Optional[str] = None, user_id: Optional[str] = None,
                     user: dict = Depends(get_current_user)):
    q = {}
    if month:
        q["month"] = month
    if status:
        q["status"] = status
    if kind:
        q["kind"] = {"$in": ["incentive", "bonus", "commission"]} if kind == "variable" else kind
    if user_id:
        q["user_id"] = user_id
    rows = await db.pay_items.find(q, {"_id": 0}).sort([("month", -1), ("user_name", 1)]).to_list(3000)
    for r in rows:
        r["kind_label"] = ITEM_KINDS.get(r.get("kind"), r.get("kind"))
    return rows


@router.post("/hr/payroll/items")
async def add_item(body: ItemIn, user: dict = Depends(get_current_user)):
    _need(user)
    _month_ok(body.month)
    if body.kind not in ITEM_KINDS or body.kind == "increment":
        raise HTTPException(status_code=400, detail="Pick incentive, bonus, commission, arrears, reimbursement, other earning or deduction")
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be more than zero")
    u = await db.users.find_one({"id": body.user_id}, {"_id": 0, "id": 1, "name": 1})
    if not u:
        raise HTTPException(status_code=404, detail="Employee not found")
    doc = {"id": str(uuid.uuid4()), "user_id": u["id"], "user_name": u["name"], "month": body.month, "kind": body.kind,
           "title": (body.title or ITEM_KINDS[body.kind]).strip()[:120], "amount": round(body.amount, 2), "note": (body.note or "")[:500],
           "status": "pending", "source": "manual", "plan_id": None, "basis": None, "run_id": None,
           "created_by": user["id"], "created_at": _now(), "approved_by": None, "approved_at": None}
    await db.pay_items.insert_one(dict(doc))
    await log_activity(user, "pay_item_added", "user", u["id"], f"{u['name']} · {ITEM_KINDS[body.kind]} ₹{int(body.amount):,} · {body.month}")
    return doc


@router.put("/hr/payroll/items/{iid}")
async def update_item(iid: str, body: ItemUpdate, user: dict = Depends(get_current_user)):
    _need(user)
    it = await _item(iid)
    if it["status"] not in ("pending", "rejected"):
        raise HTTPException(status_code=400, detail="Only pending items can be edited")
    sets = {k: v for k, v in body.dict(exclude_unset=True).items() if v is not None}
    if "month" in sets:
        _month_ok(sets["month"])
    if "amount" in sets and sets["amount"] <= 0:
        raise HTTPException(status_code=400, detail="Amount must be more than zero")
    if sets:
        await db.pay_items.update_one({"id": iid}, {"$set": sets})
    return await _item(iid)


async def _apply_increment(it: dict, user: dict):
    s = await db.salary_structures.find_one({"user_id": it["user_id"]}, {"_id": 0})
    if not s:
        raise HTTPException(status_code=400, detail=f"{it['user_name']} has no salary structure to increase")
    pct = float((it.get("basis") or {}).get("percent") or 0)
    if pct <= 0:
        raise HTTPException(status_code=400, detail="This increase has no percentage")
    k = 1 + pct / 100
    m = s.get("monthly") or {}
    new = {"basic": _r(m.get("basic", 0) * k), "hra": _r(m.get("hra", 0) * k), "special": _r(m.get("special", 0) * k),
           "conveyance": _r(m.get("conveyance", 0) * k),
           "other_allowances": [{"name": o.get("name"), "amount": _r(float(o.get("amount") or 0) * k)} for o in m.get("other_allowances") or []]}
    eff = f"{it['month']}-01"
    ctc = round(float(s.get("ctc_annual") or 0) * k)
    rev = {"effective_from": eff, "ctc_annual": ctc, "monthly": new, "reason": f"{pct:g}% increase · {it.get('title')}", "by": user["name"], "at": _now()}
    await db.salary_structures.update_one({"user_id": it["user_id"]}, {"$set": {"monthly": new, "ctc_annual": ctc, "effective_from": eff, "updated_at": _now()},
                                                                       "$push": {"revisions": rev}})


@router.post("/hr/payroll/items/{iid}/approve")
async def approve_item(iid: str, user: dict = Depends(get_current_user)):
    _need(user)
    it = await _item(iid)
    if it["status"] != "pending":
        raise HTTPException(status_code=400, detail="Only pending items can be approved")
    if it["kind"] == "increment":
        await _apply_increment(it, user)
    await db.pay_items.update_one({"id": iid}, {"$set": {"status": "approved" if it["kind"] != "increment" else "applied",
                                                        "approved_by": user["name"], "approved_at": _now()}})
    await log_activity(user, "pay_item_approved", "user", it["user_id"], f"{it['user_name']} · {it['title']} ₹{int(it['amount']):,}")
    return await _item(iid)


@router.post("/hr/payroll/items/{iid}/reject")
async def reject_item(iid: str, user: dict = Depends(get_current_user)):
    _need(user)
    it = await _item(iid)
    if it["status"] not in ("pending", "approved") or it.get("run_id"):
        raise HTTPException(status_code=400, detail="This item is already in a payroll run")
    await db.pay_items.update_one({"id": iid}, {"$set": {"status": "rejected", "approved_by": user["name"], "approved_at": _now()}})
    return await _item(iid)


# ------------------------------------------------------------------ incentive plans
class PlanIn(BaseModel):
    name: str
    kind: str
    metric: str
    branch_id: Optional[str] = None
    target: float = 0
    payout_type: str = "percent_of_metric"
    payout_value: float = 0
    cap: Optional[float] = None
    user_ids: List[str] = []
    active: bool = True
    notes: Optional[str] = ""


class CalcIn(BaseModel):
    start: str
    end: str
    pay_month: str
    manual_values: Optional[Dict[str, float]] = None


def _check_plan(b: PlanIn):
    if b.kind not in PLAN_KINDS:
        raise HTTPException(status_code=400, detail="Invalid plan type")
    if b.metric not in METRICS:
        raise HTTPException(status_code=400, detail="Invalid metric")
    if b.payout_type not in PAYOUTS:
        raise HTTPException(status_code=400, detail="Invalid payout")
    if b.kind == "increment" and b.payout_type != "percent_of_ctc":
        raise HTTPException(status_code=400, detail="A salary increase plan pays a % of CTC")
    if b.payout_value <= 0:
        raise HTTPException(status_code=400, detail="Set the payout amount or %")
    if not b.name.strip():
        raise HTTPException(status_code=400, detail="Name the plan")


@router.get("/hr/payroll/plans")
async def list_plans(user: dict = Depends(get_current_user)):
    rows = await db.incentive_plans.find({}, {"_id": 0}).sort("name", 1).to_list(500)
    names = {u["id"]: u["name"] for u in await db.users.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(3000)}
    branches = {b["id"]: b["name"] for b in await db.branches.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(500)}
    for r in rows:
        r["people"] = [{"id": i, "name": names.get(i, "—")} for i in r.get("user_ids") or []]
        r["branch_name"] = branches.get(r.get("branch_id"), "")
        r["kind_label"], r["metric_label"], r["payout_label"] = PLAN_KINDS.get(r["kind"]), METRICS.get(r["metric"]), PAYOUTS.get(r["payout_type"])
        r["paid_total"] = sum(float(x.get("amount") or 0) for x in await db.pay_items.find({"plan_id": r["id"], "status": {"$in": ["approved", "paid"]}},
                                                                                           {"_id": 0, "amount": 1}).to_list(5000))
    return rows


@router.post("/hr/payroll/plans")
async def create_plan(body: PlanIn, user: dict = Depends(get_current_user)):
    _need(user)
    _check_plan(body)
    doc = {"id": str(uuid.uuid4()), **body.dict(), "name": body.name.strip()[:120], "created_by": user["id"], "created_at": _now(), "last_calculated": None}
    await db.incentive_plans.insert_one(dict(doc))
    await log_activity(user, "incentive_plan_created", "incentive_plan", doc["id"], doc["name"])
    return doc


@router.put("/hr/payroll/plans/{pid}")
async def update_plan(pid: str, body: PlanIn, user: dict = Depends(get_current_user)):
    _need(user)
    _check_plan(body)
    if not await db.incentive_plans.find_one({"id": pid}):
        raise HTTPException(status_code=404, detail="Plan not found")
    await db.incentive_plans.update_one({"id": pid}, {"$set": {**body.dict(), "name": body.name.strip()[:120], "updated_at": _now()}})
    return await db.incentive_plans.find_one({"id": pid}, {"_id": 0})


async def _metric(plan: dict, person: dict, start: str, end: str, manual: dict) -> float:
    m = plan["metric"]
    if m == "manual":
        return float((manual or {}).get(person["id"], 0) or 0)
    if m == "own_sales_won":
        total = 0.0
        async for l in db.leads.find({"owner_id": person["id"], "stage": "won"}, {"_id": 0, "estimated_value": 1, "stage_history": 1, "updated_at": 1}):
            won_at = next((h["at"] for h in reversed(l.get("stage_history") or []) if h.get("stage") == "won"), l.get("updated_at") or "")
            if start <= (won_at or "")[:10] <= end:
                total += float(l.get("estimated_value") or 0)
        return total
    q = {"type": "income", "date": {"$gte": start, "$lte": end}}
    if m == "branch_revenue":
        bid = plan.get("branch_id") or person.get("branch_id")
        if not bid:
            return 0.0
        cids = [c["id"] for c in await db.clients.find({"branch_id": bid}, {"_id": 0, "id": 1}).to_list(5000)]
        q["client_id"] = {"$in": cids}
    return sum(float(t.get("amount") or 0) for t in await db.transactions.find(q, {"_id": 0, "amount": 1}).to_list(100000))


@router.post("/hr/payroll/plans/{pid}/calculate")
async def calculate_plan(pid: str, body: CalcIn, user: dict = Depends(get_current_user)):
    """Work out each person's payout for the period and propose pay items (pending approval)."""
    _need(user)
    plan = await db.incentive_plans.find_one({"id": pid}, {"_id": 0})
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    _month_ok(body.pay_month)
    try:
        date.fromisoformat(body.start)
        date.fromisoformat(body.end)
    except ValueError:
        raise HTTPException(status_code=400, detail="Start and end must be dates")
    people = await db.users.find({"id": {"$in": plan.get("user_ids") or []}}, {"_id": 0, "id": 1, "name": 1, "branch_id": 1}).to_list(500)
    structs = {s["user_id"]: s for s in await db.salary_structures.find({"user_id": {"$in": [p["id"] for p in people]}}, {"_id": 0}).to_list(500)}
    results = []
    kind = {"monthly_incentive": "incentive", "yearly_bonus": "bonus", "commission": "commission", "increment": "increment"}[plan["kind"]]
    for p in people:
        metric = await _metric(plan, p, body.start, body.end, body.manual_values)
        target = float(plan.get("target") or 0)
        met = metric >= target if target > 0 else metric > 0 or plan["payout_type"] == "fixed"
        v = float(plan["payout_value"])
        ctc = float((structs.get(p["id"]) or {}).get("ctc_annual") or 0)
        pt = plan["payout_type"]
        amount, percent = 0.0, None
        if pt == "fixed":
            amount = v if met else 0
        elif pt == "percent_of_metric":
            amount = metric * v / 100 if met else 0
        elif pt == "percent_above_target":
            amount = max(0.0, metric - target) * v / 100
        elif pt == "percent_of_ctc":
            if kind == "increment":
                percent = v if met else 0
                amount = round(ctc * v / 100 / 12) if met else 0  # extra per month
            else:
                amount = (ctc / 12 if plan["kind"] == "monthly_incentive" else ctc) * v / 100 if met else 0
        if plan.get("cap") and amount > float(plan["cap"]):
            amount = float(plan["cap"])
        amount = round(amount)
        basis = {"metric": plan["metric"], "metric_value": round(metric), "target": target, "met": met, "payout_type": pt, "payout_value": v,
                 "period": f"{body.start} → {body.end}", **({"percent": percent} if percent else {})}
        row = {"user_id": p["id"], "name": p["name"], "metric_value": round(metric), "target": target, "met": met, "amount": amount, "item_id": None}
        if amount > 0:
            title = f"{plan['name']} · {body.start[:7] if body.start[:7] == body.end[:7] else body.start[:7] + ' to ' + body.end[:7]}"
            existing = await db.pay_items.find_one({"plan_id": pid, "user_id": p["id"], "basis.period": basis["period"], "status": "pending"}, {"_id": 0, "id": 1})
            if existing:
                await db.pay_items.update_one({"id": existing["id"]}, {"$set": {"amount": amount, "basis": basis, "month": body.pay_month, "title": title}})
                row["item_id"] = existing["id"]
            elif not await db.pay_items.find_one({"plan_id": pid, "user_id": p["id"], "basis.period": basis["period"], "status": {"$in": ["approved", "paid", "applied"]}}):
                doc = {"id": str(uuid.uuid4()), "user_id": p["id"], "user_name": p["name"], "month": body.pay_month, "kind": kind, "title": title,
                       "amount": amount, "note": "", "status": "pending", "source": "plan", "plan_id": pid, "basis": basis, "run_id": None,
                       "created_by": user["id"], "created_at": _now(), "approved_by": None, "approved_at": None}
                await db.pay_items.insert_one(dict(doc))
                row["item_id"] = doc["id"]
            else:
                row["already_approved"] = True
        results.append(row)
    await db.incentive_plans.update_one({"id": pid}, {"$set": {"last_calculated": {"at": _now(), "start": body.start, "end": body.end, "pay_month": body.pay_month}}})
    await log_activity(user, "incentive_plan_calculated", "incentive_plan", pid, f"{plan['name']} · {body.start} → {body.end}")
    return {"plan": plan["name"], "results": results, "proposed": sum(1 for r in results if r["item_id"]), "total": sum(r["amount"] for r in results)}


# ------------------------------------------------------------------ payroll runs
class RunIn(BaseModel):
    month: str


class SlipEdit(BaseModel):
    lop_days: Optional[float] = None
    tds: Optional[float] = None
    pt: Optional[float] = None
    extra_earnings: Optional[List[dict]] = None
    extra_deductions: Optional[List[dict]] = None
    note: Optional[str] = None


class PayIn(BaseModel):
    paid_on: Optional[str] = None
    post_to_ledger: Optional[bool] = None


async def _attendance_lop(uid: str, month: str) -> float:
    s, e = _month_bounds(month)
    lop = 0.0
    async for r in db.daily_reports.find({"user_id": uid, "date": {"$gte": s.isoformat(), "$lte": e.isoformat()}}, {"_id": 0, "status": 1}):
        lop += 1 if r.get("status") == "absent" else 0.5 if r.get("status") == "half_day" else 0
    return lop


async def _uans(user_ids: List[str], full: bool) -> Dict[str, str]:
    """UANs for the PF return. Full numbers only for payroll managers (they file the ECR); masked for everyone else."""
    out = {}
    async for u in db.users.find({"id": {"$in": list(user_ids)}}, {"_id": 0, "id": 1, "hr.uan_enc": 1}):
        enc = (u.get("hr") or {}).get("uan_enc")
        try:
            v = decrypt_secret(enc) if enc else ""
        except Exception:
            v = ""
        out[u["id"]] = v if (full or not v) else "••••" + v[-4:]
    return out


async def _loan_recoveries(uid: str) -> List[dict]:
    from routes_loans import loan_status
    out = []
    async for ln in db.loans.find({"direction": "lent", "employee_id": uid, "status": "active", "recover_via_payroll": True}, {"_id": 0}):
        st = loan_status(ln)
        amt = min(float(st["emi"] or 0), float(st["outstanding_total"] or 0))
        if amt > 0:
            out.append({"loan_id": ln["id"], "name": f"Advance recovery · {ln.get('name') or 'loan'}", "amount": amt})
    return out


async def _build_slip(run: dict, person: dict, struct: dict, cfg: dict, keep: Optional[dict] = None) -> dict:
    month = run["month"]
    keep = keep or {}
    lop = keep.get("lop_days")
    if lop is None:
        lop = await _attendance_lop(person["id"], month) if cfg["lop_from_attendance"] else 0
    items = await db.pay_items.find({"user_id": person["id"], "month": month, "status": "approved", "run_id": {"$in": [None, run["id"]]},
                                     "kind": {"$ne": "increment"}}, {"_id": 0}).to_list(200)
    loans = await _loan_recoveries(person["id"])
    hr = person.get("hr") or {}
    calc = compute_slip(struct, month, cfg, lop_days=lop, join_date=person.get("join_date") or "", exit_date=hr.get("exit_date") or "",
                        items=items, loans=loans, extra_earnings=keep.get("extra_earnings") or [], extra_deductions=keep.get("extra_deductions") or [],
                        tds=keep.get("tds"), pt=keep.get("pt"))
    branch = await db.branches.find_one({"id": person.get("branch_id")}, {"_id": 0, "name": 1}) if person.get("branch_id") else None

    def mask(f):
        try:
            v = decrypt_secret(hr.get(f"{f}_enc")) if hr.get(f"{f}_enc") else ""
        except Exception:
            v = ""
        return ("•" * max(0, min(len(v) - 4, 8)) + v[-4:]) if v else ""

    return {"run_id": run["id"], "month": month, "user_id": person["id"], "user_name": person["name"],
            "employee_code": hr.get("employee_code", ""), "designation": person.get("designation", ""), "department": person.get("department", ""),
            "branch_name": (branch or {}).get("name", ""), "join_date": person.get("join_date", ""), "uan_masked": mask("uan"), "pan_masked": mask("pan"),
            "bank_masked": mask("bank_account"), "bank_name": hr.get("bank_name", ""),
            "inputs": {"lop_days": keep.get("lop_days"), "tds": keep.get("tds"), "pt": keep.get("pt"),
                       "extra_earnings": keep.get("extra_earnings") or [], "extra_deductions": keep.get("extra_deductions") or [], "note": keep.get("note", "")},
            "item_ids": [i["id"] for i in items],
            "loan_lines": [{"loan_id": d["loan_id"], "name": d["name"], "amount": d["amount"]} for d in calc["deductions"] if d["code"] == "LOAN"],
            **calc, "updated_at": _now()}


def _totals(slips):
    keys = ("gross", "total_deductions", "net", "employer_cost", "ee_pf", "eps", "er_epf", "edli", "pf_admin", "ee_esi", "er_esi", "pt", "tds")
    t = {k: sum(float(s.get(k) or 0) for s in slips) for k in keys}
    t["count"] = len(slips)
    return t


def structure_for_month(doc: dict, month_end_iso: str) -> Optional[dict]:
    """The structure as it stood on the last day of a month: the current one if already effective, otherwise the latest
    earlier revision (revisions keep effective date, CTC and monthly components)."""
    if (doc.get("effective_from") or "")[:10] <= month_end_iso:
        return doc
    revs = sorted([r for r in doc.get("revisions") or [] if (r.get("effective_from") or "")[:10] <= month_end_iso],
                  key=lambda r: ((r.get("effective_from") or "")[:10], r.get("at") or ""))
    if not revs:
        return None
    r = revs[-1]
    return {**doc, "effective_from": r["effective_from"], "ctc_annual": r.get("ctc_annual", doc.get("ctc_annual")), "monthly": r.get("monthly") or doc.get("monthly")}


async def _eligible_people(month: str):
    start, end = _month_bounds(month)
    rows = await db.users.find({"deleted": {"$ne": True}}, {"_id": 0, "password_hash": 0}).to_list(3000)
    out = []
    for p in rows:
        hr = p.get("hr") or {}
        jd, xd = (p.get("join_date") or "")[:10], (hr.get("exit_date") or "")[:10]
        if jd and jd > end.isoformat():
            continue
        if xd and xd < start.isoformat():
            continue
        if p.get("is_active") is False and not (xd and xd >= start.isoformat()):
            continue
        out.append(p)
    return out


async def _rebuild(run: dict, cfg: dict):
    start, end = _month_bounds(run["month"])
    # the salary revision in force that month (an increment entered in advance doesn't apply early)
    structs = {}
    for s_ in await db.salary_structures.find({}, {"_id": 0}).to_list(10000):
        st_ = structure_for_month(s_, end.isoformat())
        if st_:
            structs[s_["user_id"]] = st_
    existing = {s["user_id"]: s for s in await db.payslips.find({"run_id": run["id"]}, {"_id": 0}).to_list(3000)}
    seen = set()
    for p in await _eligible_people(run["month"]):
        st = structs.get(p["id"])
        if not st:
            continue
        seen.add(p["id"])
        old = existing.get(p["id"])
        slip = await _build_slip(run, p, st, cfg, keep=(old or {}).get("inputs"))
        if old:
            await db.payslips.update_one({"id": old["id"]}, {"$set": slip, "$unset": {"uan": ""}})
        else:
            await db.payslips.insert_one({"id": str(uuid.uuid4()), "status": "draft", **slip})
    for uid, old in existing.items():
        if uid not in seen:
            await db.payslips.delete_one({"id": old["id"]})
    slips = await db.payslips.find({"run_id": run["id"]}, {"_id": 0}).to_list(3000)
    await db.pay_items.update_many({"run_id": run["id"]}, {"$set": {"run_id": None}})
    ids = [i for s in slips for i in s.get("item_ids") or []]
    if ids:
        await db.pay_items.update_many({"id": {"$in": ids}}, {"$set": {"run_id": run["id"]}})
    missing = [{"id": p["id"], "name": p["name"]} for p in await _eligible_people(run["month"]) if p["id"] not in structs]
    await db.payroll_runs.update_one({"id": run["id"]}, {"$set": {"totals": _totals(slips), "missing_structure": missing, "updated_at": _now()}})


async def _run(rid):
    r = await db.payroll_runs.find_one({"id": rid}, {"_id": 0})
    if not r:
        raise HTTPException(status_code=404, detail="Payroll run not found")
    return r


@router.get("/hr/payroll/runs")
async def list_runs(user: dict = Depends(get_current_user)):
    rows = await db.payroll_runs.find({}, {"_id": 0}).sort("month", -1).to_list(200)
    for r in rows:
        r["label"] = _month_label(r["month"])
    pending = await db.pay_items.count_documents({"status": "pending"})
    return {"runs": rows, "pending_items": pending}


@router.post("/hr/payroll/runs")
async def create_run(body: RunIn, user: dict = Depends(get_current_user)):
    _need(user)
    _month_ok(body.month)
    if await db.payroll_runs.find_one({"month": body.month}):
        raise HTTPException(status_code=409, detail=f"Payroll for {_month_label(body.month)} already exists — open it instead")
    run = {"id": str(uuid.uuid4()), "month": body.month, "status": "draft", "created_by": user["id"], "created_by_name": user["name"],
           "created_at": _now(), "finalised_at": None, "paid_at": None, "paid_on": None, "ledger_txn_id": None, "totals": {}, "missing_structure": []}
    await db.payroll_runs.insert_one(dict(run))
    await _rebuild(run, await payroll_settings())
    await log_activity(user, "payroll_run_created", "payroll_run", run["id"], _month_label(body.month))
    return await get_run(run["id"], user)


@router.get("/hr/payroll/runs/{rid}")
async def get_run(rid: str, user: dict = Depends(get_current_user)):
    r = await _run(rid)
    r["label"] = _month_label(r["month"])
    slips = await db.payslips.find({"run_id": rid}, {"_id": 0}).sort("user_name", 1).to_list(3000)
    r["payslips"] = [{k: s.get(k) for k in ("id", "user_id", "user_name", "employee_code", "designation", "department", "branch_name", "paid_days", "lop_days",
                                             "gross", "total_deductions", "net", "employer_cost", "ee_pf", "ee_esi", "pt", "tds", "status")} for s in slips]
    r["pending_items"] = await db.pay_items.count_documents({"month": r["month"], "status": "pending"})
    return r


@router.post("/hr/payroll/runs/{rid}/recalculate")
async def recalc_run(rid: str, user: dict = Depends(get_current_user)):
    _need(user)
    r = await _run(rid)
    if r["status"] != "draft":
        raise HTTPException(status_code=400, detail="Re-open the run to recalculate it")
    await _rebuild(r, await payroll_settings())
    return await get_run(rid, user)


@router.get("/hr/payroll/payslips/{sid}")
async def get_slip(sid: str, user: dict = Depends(get_current_user)):
    s = await db.payslips.find_one({"id": sid}, {"_id": 0})
    if not s:
        raise HTTPException(status_code=404, detail="Payslip not found")
    return s


@router.put("/hr/payroll/payslips/{sid}")
async def edit_slip(sid: str, body: SlipEdit, user: dict = Depends(get_current_user)):
    _need(user)
    s = await db.payslips.find_one({"id": sid}, {"_id": 0})
    if not s:
        raise HTTPException(status_code=404, detail="Payslip not found")
    run = await _run(s["run_id"])
    if run["status"] != "draft":
        raise HTTPException(status_code=400, detail="This payroll is finalised — re-open it to edit")
    keep = dict(s.get("inputs") or {})
    for k, v in body.dict(exclude_unset=True).items():
        if k in ("extra_earnings", "extra_deductions") and v is not None:
            v = [{"name": str(x.get("name") or "Adjustment")[:80], "amount": float(x.get("amount") or 0)} for x in v if float(x.get("amount") or 0)]
        if k == "lop_days" and v is not None and (v < 0 or v > 31):
            raise HTTPException(status_code=400, detail="Loss-of-pay days must be between 0 and 31")
        keep[k] = v
    p = await db.users.find_one({"id": s["user_id"]}, {"_id": 0, "password_hash": 0})
    st = structure_for_month(await db.salary_structures.find_one({"user_id": s["user_id"]}, {"_id": 0}) or {}, _month_bounds(run["month"])[1].isoformat())
    if not st:
        raise HTTPException(status_code=400, detail="No salary structure in force for this month")
    slip = await _build_slip(run, p, st, await payroll_settings(), keep=keep)
    await db.payslips.update_one({"id": sid}, {"$set": slip, "$unset": {"uan": ""}})
    slips = await db.payslips.find({"run_id": run["id"]}, {"_id": 0}).to_list(3000)
    await db.payroll_runs.update_one({"id": run["id"]}, {"$set": {"totals": _totals(slips)}})
    await log_activity(user, "payslip_edited", "payslip", sid, f"{s['user_name']} · {_month_label(run['month'])}")
    return await db.payslips.find_one({"id": sid}, {"_id": 0})


@router.post("/hr/payroll/runs/{rid}/finalise")
async def finalise_run(rid: str, user: dict = Depends(get_current_user)):
    _need(user)
    r = await _run(rid)
    if r["status"] != "draft":
        raise HTTPException(status_code=400, detail="Only a draft can be finalised")
    if not await db.payslips.count_documents({"run_id": rid}):
        raise HTTPException(status_code=400, detail="No payslips yet — add salary structures first")
    await _rebuild(r, await payroll_settings())
    await db.payroll_runs.update_one({"id": rid}, {"$set": {"status": "finalised", "finalised_at": _now(), "finalised_by": user["name"]}})
    await db.payslips.update_many({"run_id": rid}, {"$set": {"status": "final"}})
    await log_activity(user, "payroll_finalised", "payroll_run", rid, _month_label(r["month"]))
    return await get_run(rid, user)


@router.post("/hr/payroll/runs/{rid}/reopen")
async def reopen_run(rid: str, user: dict = Depends(get_current_user)):
    _need(user)
    r = await _run(rid)
    if r["status"] != "finalised":
        raise HTTPException(status_code=400, detail="Only a finalised (unpaid) run can be re-opened")
    await db.payroll_runs.update_one({"id": rid}, {"$set": {"status": "draft", "finalised_at": None}})
    await db.payslips.update_many({"run_id": rid}, {"$set": {"status": "draft"}})
    await log_activity(user, "payroll_reopened", "payroll_run", rid, _month_label(r["month"]))
    return await get_run(rid, user)


@router.post("/hr/payroll/runs/{rid}/pay")
async def pay_run(rid: str, body: PayIn, user: dict = Depends(get_current_user)):
    _need(user)
    r = await _run(rid)
    if r["status"] != "finalised":
        raise HTTPException(status_code=400, detail="Finalise the payroll before marking it paid")
    cfg = await payroll_settings()
    paid_on = body.paid_on or date.today().isoformat()
    slips = await db.payslips.find({"run_id": rid}, {"_id": 0}).to_list(3000)
    ids = [i for s in slips for i in s.get("item_ids") or []]
    if ids:
        await db.pay_items.update_many({"id": {"$in": ids}}, {"$set": {"status": "paid", "paid_on": paid_on}})
    from routes_loans import record_payment_internal
    for s in slips:
        for ln in s.get("loan_lines") or []:
            await record_payment_internal(ln["loan_id"], paid_on, float(ln["amount"]), "payroll", f"Salary deduction · {_month_label(r['month'])}", user)
    txn_id = None
    post = cfg["post_to_ledger"] if body.post_to_ledger is None else body.post_to_ledger
    t = _totals(slips)
    if post and t["employer_cost"] > 0:
        txn_id = str(uuid.uuid4())
        await db.transactions.insert_one({
            "id": txn_id, "type": "expense", "date": paid_on, "amount": round(t["employer_cost"], 2), "category": "salaries",
            "description": f"Payroll {_month_label(r['month'])} — net pay ₹{int(t['net']):,}, PF/ESI/PT/TDS ₹{int(t['employer_cost'] - t['net']):,}",
            "client_id": None, "project_id": None, "invoice_ref": f"PAYROLL-{r['month']}", "payment_method": "bank_transfer",
            "campaign_id": None, "ai_tool": None, "source": "payroll", "currency": "INR", "created_by": user["id"], "created_at": _now()})
    await db.payroll_runs.update_one({"id": rid}, {"$set": {"status": "paid", "paid_at": _now(), "paid_on": paid_on, "ledger_txn_id": txn_id}})
    await db.payslips.update_many({"run_id": rid}, {"$set": {"status": "paid", "paid_on": paid_on}})
    await log_activity(user, "payroll_paid", "payroll_run", rid, f"{_month_label(r['month'])} · ₹{int(t['net']):,} net" + (" · posted to ledger" if txn_id else ""))
    return await get_run(rid, user)


@router.get("/hr/payroll/runs/{rid}/statutory")
async def statutory(rid: str, user: dict = Depends(get_current_user)):
    r = await _run(rid)
    slips = await db.payslips.find({"run_id": rid}, {"_id": 0}).sort("user_name", 1).to_list(3000)
    uans = await _uans([s["user_id"] for s in slips], full=has_permission(user, "payroll.manage"))
    pf = [{"uan": uans.get(s["user_id"]) or "—", "name": s["user_name"], "gross": s["gross"], "epf_wages": s["pf_wage"], "eps_wages": s["eps_wage"],
           "edli_wages": s["eps_wage"], "ee_pf": s["ee_pf"], "eps": s["eps"], "er_epf": s["er_epf"], "ncp_days": s["lop_days"]}
          for s in slips if s.get("ee_pf")]
    esi = [{"name": s["user_name"], "gross": s["gross"], "ee_esi": s["ee_esi"], "er_esi": s["er_esi"], "days": s["paid_days"]} for s in slips if s.get("esi_applicable")]
    t = _totals(slips)
    return {"month": r["month"], "label": _month_label(r["month"]), "pf": pf, "esi": esi,
            "totals": {"ee_pf": t["ee_pf"], "eps": t["eps"], "er_epf": t["er_epf"], "edli": t["edli"], "pf_admin": t["pf_admin"],
                       "pf_challan": t["ee_pf"] + t["eps"] + t["er_epf"] + t["edli"] + t["pf_admin"], "ee_esi": t["ee_esi"], "er_esi": t["er_esi"],
                       "esi_challan": t["ee_esi"] + t["er_esi"], "pt": t["pt"], "tds": t["tds"]}}


@router.get("/hr/payroll/runs/{rid}/export")
async def export_run(rid: str, user: dict = Depends(get_current_user)):
    from export_engine import build_xlsx
    r = await _run(rid)
    slips = await db.payslips.find({"run_id": rid}, {"_id": 0}).sort("user_name", 1).to_list(3000)
    st = await statutory(rid, user)
    t = _totals(slips)
    sections = [
        {"title": "Salary register", "columns": [("user_name", "Employee", "text"), ("employee_code", "Code", "text"), ("designation", "Designation", "text"),
                                                ("paid_days", "Paid days", "num"), ("lop_days", "LOP days", "num"), ("gross", "Gross", "money"),
                                                ("ee_pf", "PF", "money"), ("ee_esi", "ESI", "money"), ("pt", "PT", "money"), ("tds", "TDS", "money"),
                                                ("total_deductions", "Total deductions", "money"), ("net", "Net pay", "money"), ("employer_cost", "Cost to company", "money"),
                                                ("bank_masked", "Bank a/c", "text")], "rows": slips},
        {"title": "PF (ECR)", "columns": [("uan", "UAN", "text"), ("name", "Member", "text"), ("gross", "Gross wages", "money"), ("epf_wages", "EPF wages", "money"),
                                          ("eps_wages", "EPS wages", "money"), ("edli_wages", "EDLI wages", "money"), ("ee_pf", "EE share", "money"),
                                          ("eps", "EPS", "money"), ("er_epf", "ER share", "money"), ("ncp_days", "NCP days", "num")], "rows": st["pf"]},
        {"title": "ESI", "columns": [("name", "Employee", "text"), ("days", "Days", "num"), ("gross", "Wages", "money"), ("ee_esi", "Employee", "money"),
                                     ("er_esi", "Employer", "money")], "rows": st["esi"]},
    ]
    summary = [{"label": "Month", "value": _month_label(r["month"])}, {"label": "Employees", "value": t["count"]},
               {"label": "Gross", "value": t["gross"]}, {"label": "Net pay", "value": t["net"]}, {"label": "Cost to company", "value": t["employer_cost"]},
               {"label": "PF challan", "value": st["totals"]["pf_challan"]}, {"label": "ESI challan", "value": st["totals"]["esi_challan"]}]
    data = build_xlsx(f"Payroll — {_month_label(r['month'])}", sections, summary=summary, generated_by=user["name"])
    await log_activity(user, "payroll_exported", "payroll_run", rid, _month_label(r["month"]))
    return Response(content=data, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": f'attachment; filename="payroll-{r["month"]}.xlsx"'})


# ------------------------------------------------------------------ payslip PDF
_ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen",
         "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"]
_TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]


def _two(n):
    return _ONES[n] if n < 20 else (_TENS[n // 10] + (" " + _ONES[n % 10] if n % 10 else ""))


def _three(n):
    h, r = divmod(n, 100)
    return ((_ONES[h] + " Hundred" + (" " if r else "")) if h else "") + (_two(r) if r else "")


def amount_in_words(n: int) -> str:
    """Indian numbering: 1,23,45,678 → One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight."""
    n = int(round(n))
    if n == 0:
        return "Zero"
    parts = []
    for div, name in ((10 ** 7, "Crore"), (10 ** 5, "Lakh"), (1000, "Thousand")):
        q, n = divmod(n, div)
        if q:
            parts.append((amount_in_words(q) if q >= 100 and name == "Crore" else _three(q)) + " " + name)
    if n:
        parts.append(_three(n))
    return " ".join(parts)


def build_payslip_pdf(s: dict, cfg: dict) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from export_engine import FONT, BOLD_FONT, ORANGE_HEX, inr, _page_decorator

    bio = BytesIO()
    doc = SimpleDocTemplate(bio, pagesize=A4, leftMargin=16 * mm, rightMargin=16 * mm, topMargin=22 * mm, bottomMargin=16 * mm,
                            title=f"Payslip — {s['user_name']} — {_month_label(s['month'])}")
    W = A4[0] - 32 * mm
    ink, muted, line = colors.HexColor("#111827"), colors.HexColor("#6B7280"), colors.HexColor("#E5E7EB")
    orange, peach = colors.HexColor(ORANGE_HEX), colors.HexColor("#FFF7ED")
    H1 = ParagraphStyle("h1", fontName=BOLD_FONT, fontSize=17, textColor=ink, leading=21)
    SUB = ParagraphStyle("sub", fontName=FONT, fontSize=9, textColor=muted, leading=12)
    L = ParagraphStyle("l", fontName=FONT, fontSize=8, textColor=muted, leading=10)
    V = ParagraphStyle("v", fontName=BOLD_FONT, fontSize=8.8, textColor=ink, leading=11)
    esc = lambda x: (str(x) if x not in (None, "") else "—").replace("&", "&amp;").replace("<", "&lt;")
    story = [Paragraph(f"Payslip · {_month_label(s['month'])}", H1),
             Paragraph(esc(cfg.get("company_name") or "dotindot Creative") + (f" · {esc(cfg['company_address'])}" if cfg.get("company_address") else ""), SUB),
             Spacer(1, 8)]
    info = [("Employee", s["user_name"]), ("Employee code", s.get("employee_code")), ("Designation", s.get("designation")),
            ("Department", s.get("department")), ("Branch", s.get("branch_name")), ("Date of joining", s.get("join_date")),
            ("UAN", s.get("uan_masked")), ("PAN", s.get("pan_masked")), ("Bank", (s.get("bank_name") or "") + (f" {s['bank_masked']}" if s.get("bank_masked") else "")),
            ("Days in month", s["days_in_month"]), ("Paid days", s["paid_days"]), ("Loss of pay days", s["lop_days"])]
    rows = []
    for i in range(0, len(info), 3):
        chunk = info[i:i + 3]
        rows.append([x for k, v in chunk for x in (Paragraph(esc(k), L), Paragraph(esc(v), V))])
    t = Table(rows, colWidths=[W * w for w in (0.13, 0.2, 0.13, 0.2, 0.13, 0.21)])
    t.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.6, line), ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#FAFAF9")),
                           ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4), ("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
    story += [t, Spacer(1, 10)]
    e, d = s["earnings"], s["deductions"]
    n = max(len(e), len(d))
    hdr = ParagraphStyle("hd", fontName=BOLD_FONT, fontSize=8, textColor=colors.white)
    cell = ParagraphStyle("c", fontName=FONT, fontSize=8.5, textColor=ink, leading=11)
    body = [[Paragraph("<b>Earnings</b>", hdr), Paragraph("<b>Amount</b>", hdr), Paragraph("<b>Deductions</b>", hdr), Paragraph("<b>Amount</b>", hdr)]]
    for i in range(n):
        a = e[i] if i < len(e) else None
        b = d[i] if i < len(d) else None
        body.append([Paragraph(esc(a["name"]), cell) if a else "", inr(a["amount"]) if a else "", Paragraph(esc(b["name"]), cell) if b else "", inr(b["amount"]) if b else ""])
    body.append([Paragraph("<b>Gross earnings</b>", cell), inr(s["gross"]), Paragraph("<b>Total deductions</b>", cell), inr(s["total_deductions"])])
    tb = Table(body, colWidths=[W * 0.32, W * 0.18, W * 0.32, W * 0.18])
    tb.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), orange), ("GRID", (0, 0), (-1, -1), 0.25, line), ("FONTNAME", (0, 1), (-1, -1), FONT),
                            ("FONTSIZE", (0, 1), (-1, -1), 8.5), ("ALIGN", (1, 0), (1, -1), "RIGHT"), ("ALIGN", (3, 0), (3, -1), "RIGHT"),
                            ("BACKGROUND", (0, -1), (-1, -1), peach), ("FONTNAME", (0, -1), (-1, -1), BOLD_FONT),
                            ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
    story += [tb, Spacer(1, 10)]
    net = Table([[Paragraph("<b>NET PAY</b>", ParagraphStyle("n1", fontName=BOLD_FONT, fontSize=9, textColor=muted)),
                  Paragraph(f"<b>{inr(s['net'])}</b>", ParagraphStyle("n2", fontName=BOLD_FONT, fontSize=16, textColor=ink, alignment=2))],
                 [Paragraph(f"Rupees {amount_in_words(s['net'])} only", ParagraphStyle("n3", fontName=FONT, fontSize=8.5, textColor=muted)), ""]],
                colWidths=[W * 0.6, W * 0.4])
    net.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor("#FDBA74")), ("BACKGROUND", (0, 0), (-1, -1), peach), ("SPAN", (0, 1), (1, 1)),
                             ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6), ("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
    story.append(net)
    if s.get("employer"):
        story += [Spacer(1, 10), Paragraph("Employer contributions (not deducted from your pay)", ParagraphStyle("h3", fontName=BOLD_FONT, fontSize=9, textColor=orange)),
                  Spacer(1, 3), Paragraph(" · ".join(f"{esc(x['name'])}: <b>{inr(x['amount'])}</b>" for x in s["employer"]), cell),
                  Paragraph(f"Cost to company this month: <b>{inr(s['employer_cost'])}</b>", cell)]
    story += [Spacer(1, 14), Paragraph("This is a computer-generated payslip and does not need a signature.", L)]
    deco = _page_decorator(f"Payslip — {_month_label(s['month'])}", cfg.get("company_name") or "dotindot")
    doc.build(story, onFirstPage=deco, onLaterPages=deco)
    return bio.getvalue()


def _pdf(s: dict, data: bytes):
    from export_engine import slug, attachment
    fname = f"payslip-{slug(s['user_name'], 'employee')}-{s['month']}.pdf"
    return Response(content=data, media_type="application/pdf",
                    headers={"Content-Disposition": attachment(fname, f"payslip-{'-'.join(s['user_name'].split())}-{s['month']}.pdf")})


@router.get("/hr/payroll/payslips/{sid}/pdf")
async def slip_pdf(sid: str, user: dict = Depends(get_current_user)):
    s = await get_slip(sid, user)
    return _pdf(s, build_payslip_pdf(s, await payroll_settings()))


# ------------------------------------------------------------------ self-service
@router.get("/me/payslips")
async def my_payslips(user: dict = Depends(get_current_user)):
    rows = await db.payslips.find({"user_id": user["id"], "status": {"$in": ["final", "paid"]}}, {"_id": 0}).sort("month", -1).to_list(120)
    s = await db.salary_structures.find_one({"user_id": user["id"]}, {"_id": 0, "ctc_annual": 1, "effective_from": 1})
    items = await db.pay_items.find({"user_id": user["id"], "kind": {"$in": list(EARNING_KINDS)}, "status": {"$in": ["approved", "paid"]}},
                                    {"_id": 0, "title": 1, "amount": 1, "month": 1, "kind": 1, "status": 1}).sort("month", -1).to_list(50)
    return {"payslips": [{k: r.get(k) for k in ("id", "month", "gross", "total_deductions", "net", "paid_days", "status", "paid_on")} | {"label": _month_label(r["month"])}
                         for r in rows], "ctc_annual": (s or {}).get("ctc_annual"), "effective_from": (s or {}).get("effective_from"), "variable_pay": items}


@router.get("/me/payslips/{sid}")
async def my_payslip(sid: str, user: dict = Depends(get_current_user)):
    s = await db.payslips.find_one({"id": sid, "user_id": user["id"], "status": {"$in": ["final", "paid"]}}, {"_id": 0})
    if not s:
        raise HTTPException(status_code=404, detail="Payslip not found")
    return s


@router.get("/me/payslips/{sid}/pdf")
async def my_payslip_pdf(sid: str, user: dict = Depends(get_current_user)):
    s = await my_payslip(sid, user)
    return _pdf(s, build_payslip_pdf(s, await payroll_settings()))


async def payroll_alerts(user: dict) -> list:
    if not has_permission(user, "payroll.manage"):
        return []
    items = []
    today = date.today()
    pend = await db.pay_items.count_documents({"status": "pending"})
    if pend:
        items.append({"kind": "payroll", "title": f"{pend} incentive / bonus item{'s' if pend > 1 else ''} to approve", "sub": "Payroll → Incentives",
                      "link": "/hr/incentives", "date": today.isoformat()})
    m = today.strftime("%Y-%m")
    run = await db.payroll_runs.find_one({"month": m}, {"_id": 0, "status": 1})
    if today.day >= 25 and (not run or run["status"] == "draft"):
        items.append({"kind": "payroll", "title": f"Payroll for {_month_label(m)} {'is still a draft' if run else 'not started'}", "sub": "Run and finalise before pay day",
                      "link": "/hr/payroll", "date": today.isoformat()})
    return items
