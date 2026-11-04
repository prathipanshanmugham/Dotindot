"""v3.0 HR hub — everything about our people in one place.

  • People: the full HR record per employee (job, personal, emergency contact, statutory IDs, bank, documents).
    Statutory IDs and bank details are encrypted at rest and shown masked; only `payroll.manage` / `hr.manage`
    can reveal them (every reveal is logged). Aadhaar is never stored — only its last 4 digits.
  • Onboarding & offboarding: checklists generated from editable templates, with owners and due dates.
    Offboarding lists the assets to collect, opens a knowledge-transfer plan and can deactivate the login.
  • Skills: skill matrix (1–5 per skill), development plans linked to training courses.
  • Knowledge transfer (KT): handover plans with a checklist, sessions and documents, signed off by the receiver.

Gate: `/api/hr/*` needs `hr`; writes need `hr.manage`. Self-service under `/api/me/hr` (any signed-in user).
"""
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Optional, List, Dict
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException
from database import db
from auth import get_current_user, log_activity, encrypt_secret, decrypt_secret
from permissions import has_permission

router = APIRouter()

EMPLOYMENT_TYPES = {"full_time": "Full-time", "part_time": "Part-time", "contract": "Contract", "intern": "Intern", "consultant": "Consultant"}
HR_STATUSES = {"active": "Active", "probation": "On probation", "notice": "Serving notice", "exited": "Exited"}
OWNER_ROLES = {"hr": "HR", "it": "IT / Admin", "manager": "Manager", "employee": "Employee", "finance": "Finance", "buddy": "Buddy"}
OFFBOARD_TYPES = {"resignation": "Resignation", "termination": "Termination", "contract_end": "Contract ended", "retirement": "Retirement", "other": "Other"}
DOC_STATUS = ("pending", "received", "verified")
DEFAULT_DOCS = ["Offer letter (signed)", "ID proof", "Address proof", "PAN card", "Education certificates", "Previous employer relieving letter",
                "Bank details / cancelled cheque", "Passport-size photo"]

DEFAULT_TEMPLATES = {
    "onboarding": [
        {"title": "Send offer letter and collect signed copy", "group": "before_day1", "owner_role": "hr", "due_offset_days": -7},
        {"title": "Collect documents (ID, PAN, address, bank)", "group": "before_day1", "owner_role": "hr", "due_offset_days": -3},
        {"title": "Create email + platform login", "group": "before_day1", "owner_role": "it", "due_offset_days": -1},
        {"title": "Prepare laptop and accessories", "group": "before_day1", "owner_role": "it", "due_offset_days": -1},
        {"title": "Welcome + office tour, introduce buddy", "group": "day1", "owner_role": "manager", "due_offset_days": 0},
        {"title": "Share company handbook and policies", "group": "day1", "owner_role": "hr", "due_offset_days": 0},
        {"title": "Add to salary structure and PF / ESI", "group": "week1", "owner_role": "finance", "due_offset_days": 3},
        {"title": "Tools access: Drive, Meta Business, Google Ads, Canva…", "group": "week1", "owner_role": "it", "due_offset_days": 2},
        {"title": "Assign starter training courses", "group": "week1", "owner_role": "manager", "due_offset_days": 5},
        {"title": "First project shadowing", "group": "week1", "owner_role": "manager", "due_offset_days": 5},
        {"title": "30-day check-in with manager", "group": "month1", "owner_role": "manager", "due_offset_days": 30},
        {"title": "Confirm probation goals", "group": "month1", "owner_role": "hr", "due_offset_days": 30},
    ],
    "offboarding": [
        {"title": "Acknowledge resignation / issue letter", "group": "notice", "owner_role": "hr", "due_offset_days": -28},
        {"title": "Plan knowledge transfer (KT) and handover owner", "group": "notice", "owner_role": "manager", "due_offset_days": -21},
        {"title": "Hand over client accounts and passwords", "group": "notice", "owner_role": "manager", "due_offset_days": -7},
        {"title": "Exit interview", "group": "last_week", "owner_role": "hr", "due_offset_days": -3},
        {"title": "Collect laptop, ID card and other assets", "group": "last_day", "owner_role": "it", "due_offset_days": 0},
        {"title": "Revoke email, platform and tool access", "group": "last_day", "owner_role": "it", "due_offset_days": 0},
        {"title": "Full & final settlement", "group": "after", "owner_role": "finance", "due_offset_days": 30},
        {"title": "Relieving + experience letter", "group": "after", "owner_role": "hr", "due_offset_days": 30},
        {"title": "PF exit / transfer guidance", "group": "after", "owner_role": "finance", "due_offset_days": 30},
    ],
}
GROUP_LABELS = {"before_day1": "Before day 1", "day1": "Day 1", "week1": "First week", "month1": "First month",
                "notice": "During notice", "last_week": "Last week", "last_day": "Last day", "after": "After exit"}
SENSITIVE = ("pan", "uan", "pf_number", "esi_number", "bank_account")


def _now():
    return datetime.now(timezone.utc).isoformat()


def _today():
    return date.today()


def _need(user, key="hr.manage"):
    if not has_permission(user, key):
        raise HTTPException(status_code=403, detail="You need HR → manage to change this")


def _can_sensitive(user):
    return has_permission(user, "payroll.manage", "hr.manage")


def _mask(v: str, keep: int = 4) -> str:
    v = (v or "").strip()
    return ("•" * max(0, min(len(v) - keep, 8)) + v[-keep:]) if v else ""


def _enc(v):
    return encrypt_secret(v.strip()) if v and v.strip() else None


def _dec(v):
    try:
        return decrypt_secret(v) if v else ""
    except Exception:
        return ""


async def templates() -> dict:
    doc = await db.settings.find_one({"id": "hr_templates"}, {"_id": 0}) or {}
    return {"onboarding": doc.get("onboarding") or DEFAULT_TEMPLATES["onboarding"],
            "offboarding": doc.get("offboarding") or DEFAULT_TEMPLATES["offboarding"]}


async def _people(active_only=True):
    q = {"deleted": {"$ne": True}}
    if active_only:
        q["is_active"] = {"$ne": False}
    return await db.users.find(q, {"_id": 0, "password_hash": 0}).sort("name", 1).to_list(2000)


def _completeness(u: dict) -> int:
    h = u.get("hr") or {}
    checks = [u.get("designation"), u.get("department"), u.get("join_date"), u.get("phone"), h.get("employee_code"),
              h.get("date_of_birth"), h.get("emergency_contact", {}).get("phone") if isinstance(h.get("emergency_contact"), dict) else None,
              h.get("address_current"), h.get("pan_enc"), h.get("bank_account_enc") and h.get("bank_ifsc"), h.get("employment_type"),
              h.get("manager_id")]
    return round(100 * sum(1 for c in checks if c) / len(checks))


def _hr_view(u: dict, sensitive: bool, branches: dict, users: dict) -> dict:
    h = dict(u.get("hr") or {})
    out = {
        "id": u["id"], "name": u.get("name"), "email": u.get("email"), "role": u.get("role"), "is_active": u.get("is_active", True),
        "designation": u.get("designation", ""), "department": u.get("department", ""), "phone": u.get("phone", ""),
        "join_date": u.get("join_date", ""), "city": u.get("city", ""), "branch_id": u.get("branch_id"),
        "branch_name": branches.get(u.get("branch_id"), ""), "skills": u.get("skills") or [], "skill_levels": u.get("skill_levels") or {},
        "employee_code": h.get("employee_code", ""), "employment_type": h.get("employment_type", "full_time"),
        "status": h.get("status") or ("active" if u.get("is_active", True) else "exited"),
        "manager_id": h.get("manager_id"), "manager_name": users.get(h.get("manager_id"), ""),
        "probation_end": h.get("probation_end", ""), "confirmation_date": h.get("confirmation_date", ""), "notice_period_days": h.get("notice_period_days", 30),
        "exit_date": h.get("exit_date", ""), "work_location": h.get("work_location", ""),
        "personal_email": h.get("personal_email", ""), "date_of_birth": h.get("date_of_birth", ""), "gender": h.get("gender", ""),
        "blood_group": h.get("blood_group", ""), "marital_status": h.get("marital_status", ""),
        "address_current": h.get("address_current", ""), "address_permanent": h.get("address_permanent", ""),
        "emergency_contact": h.get("emergency_contact") or {"name": "", "relation": "", "phone": ""},
        "education": h.get("education", ""), "previous_employer": h.get("previous_employer", ""),
        "documents": h.get("documents") or [{"name": n, "status": "pending", "note": ""} for n in DEFAULT_DOCS],
        "aadhaar_last4": h.get("aadhaar_last4", ""), "bank_name": h.get("bank_name", ""), "bank_ifsc": h.get("bank_ifsc", ""),
        "bank_account_holder": h.get("bank_account_holder", ""), "notes": h.get("notes", "") if sensitive else "",
        "completeness": _completeness(u),
    }
    for f in SENSITIVE:
        raw = _dec(h.get(f"{f}_enc"))
        out[f"{f}_masked"] = _mask(raw) if raw else ""
        out[f"has_{f}"] = bool(raw)
    out["can_view_sensitive"] = sensitive
    return out


async def _maps():
    branches = {b["id"]: b["name"] for b in await db.branches.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(500)}
    users = {u["id"]: u["name"] for u in await db.users.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(3000)}
    return branches, users


# ------------------------------------------------------------------ overview
@router.get("/hr/overview")
async def overview(user: dict = Depends(get_current_user)):
    people = await _people(active_only=False)
    active = [p for p in people if p.get("is_active", True)]
    today = _today()
    t_iso, in30 = today.isoformat(), (today + timedelta(days=30)).isoformat()
    branches, _ = await _maps()
    by = lambda key: sorted(({"name": k or "Not set", "count": v} for k, v in _count(active, key).items()), key=lambda x: -x["count"])
    month = today.strftime("%Y-%m")
    joiners = [p for p in active if (p.get("join_date") or "")[:7] == month]
    onboarding = await db.hr_onboarding.find({"status": "in_progress"}, {"_id": 0}).to_list(500)
    offboarding = await db.hr_offboarding.find({"status": "in_progress"}, {"_id": 0}).to_list(500)
    left = await db.hr_offboarding.count_documents({"status": "completed", "last_working_day": {"$regex": f"^{month}"}})

    def upcoming(field, years=False):
        out = []
        for p in active:
            v = (p.get("hr") or {}).get(field) if field != "join_date" else p.get("join_date")
            if not v:
                continue
            try:
                d0 = date.fromisoformat(v[:10])
            except ValueError:
                continue
            if years:
                try:
                    nxt = d0.replace(year=today.year)
                except ValueError:
                    nxt = d0.replace(year=today.year, day=28)
                if nxt < today:
                    nxt = nxt.replace(year=today.year + 1)
                if (nxt - today).days <= 30 and (field != "join_date" or nxt.year > d0.year):
                    out.append({"id": p["id"], "name": p["name"], "date": nxt.isoformat(), "years": nxt.year - d0.year})
            elif t_iso <= v[:10] <= in30:
                out.append({"id": p["id"], "name": p["name"], "date": v[:10]})
        return sorted(out, key=lambda x: x["date"])

    docs_pending = sum(1 for p in active for d in ((p.get("hr") or {}).get("documents") or []) if d.get("status") == "pending")
    no_record = sum(1 for p in active if not (p.get("hr") or {}).get("employee_code"))
    tasks_due = []
    for ob in onboarding + offboarding:
        for t in ob.get("tasks") or []:
            if not t.get("done") and t.get("due_date") and t["due_date"] <= in30:
                tasks_due.append({"process": "onboarding" if ob in onboarding else "offboarding", "process_id": ob["id"], "person": ob.get("user_name"),
                                  "title": t["title"], "due_date": t["due_date"], "owner_role": t.get("owner_role"), "overdue": t["due_date"] < t_iso})
    tasks_due.sort(key=lambda x: x["due_date"])
    training_overdue = await db.training_assignments.count_documents({"status": {"$ne": "completed"}, "due_date": {"$ne": None, "$lt": t_iso}})
    hr_tickets = await db.tickets.count_documents({"kind": "internal", "category": "hr", "status": {"$in": ["open", "in_progress", "waiting"]}})
    payroll = None
    if has_permission(user, "payroll"):
        run = await db.payroll_runs.find_one({"month": month}, {"_id": 0, "status": 1, "totals": 1, "month": 1})
        payroll = run or {"month": month, "status": "not_started"}
    kt_open = await db.hr_kt.count_documents({"status": {"$in": ["planned", "in_progress"]}})
    plans = await db.hr_skill_plans.count_documents({"status": "active"})
    return {
        "headcount": len(active), "inactive": len(people) - len(active),
        "by_department": by("department"), "by_type": [{"name": EMPLOYMENT_TYPES.get(k, k), "count": v} for k, v in _count(active, "employment_type", hr=True).items()],
        "by_branch": sorted(({"name": branches.get(k, "Not set"), "count": v} for k, v in _count(active, "branch_id").items()), key=lambda x: -x["count"]),
        "joiners_this_month": [{"id": p["id"], "name": p["name"], "join_date": p.get("join_date")} for p in joiners],
        "left_this_month": left,
        "on_notice": [{"id": o["user_id"], "name": o.get("user_name"), "last_working_day": o.get("last_working_day")} for o in offboarding],
        "onboarding_in_progress": len(onboarding), "offboarding_in_progress": len(offboarding),
        "probation_ending": upcoming("probation_end"), "birthdays": upcoming("date_of_birth", years=True),
        "anniversaries": upcoming("join_date", years=True),
        "documents_pending": docs_pending, "records_missing": no_record, "tasks_due": tasks_due[:15],
        "training_overdue": training_overdue, "hr_tickets_open": hr_tickets, "payroll": payroll, "kt_open": kt_open, "skill_plans_active": plans,
    }


def _count(rows, key, hr=False):
    out = {}
    for r in rows:
        v = ((r.get("hr") or {}).get(key) if hr else r.get(key)) or ("full_time" if hr and key == "employment_type" else "")
        out[v] = out.get(v, 0) + 1
    return out


# ------------------------------------------------------------------ people
@router.get("/hr/meta")
async def hr_meta(user: dict = Depends(get_current_user)):
    return {"employment_types": [{"value": k, "label": v} for k, v in EMPLOYMENT_TYPES.items()],
            "statuses": [{"value": k, "label": v} for k, v in HR_STATUSES.items()],
            "owner_roles": [{"value": k, "label": v} for k, v in OWNER_ROLES.items()],
            "offboard_types": [{"value": k, "label": v} for k, v in OFFBOARD_TYPES.items()],
            "group_labels": GROUP_LABELS, "default_docs": DEFAULT_DOCS,
            "can_manage": has_permission(user, "hr.manage"), "can_view_sensitive": _can_sensitive(user),
            "can_payroll": has_permission(user, "payroll"), "can_delete": has_permission(user, "hr.delete")}


@router.get("/hr/people")
async def people(q: Optional[str] = None, department: Optional[str] = None, branch_id: Optional[str] = None, status: Optional[str] = None,
                 include_inactive: bool = False, user: dict = Depends(get_current_user)):
    rows = await _people(active_only=not include_inactive)
    branches, users = await _maps()
    sens = _can_sensitive(user)
    out = []
    for u in rows:
        v = _hr_view(u, sens, branches, users)
        if q and q.lower() not in f"{v['name']} {v['designation']} {v['employee_code']} {v['email']}".lower():
            continue
        if department and v["department"] != department:
            continue
        if branch_id and v["branch_id"] != branch_id:
            continue
        if status and v["status"] != status:
            continue
        out.append({k: v[k] for k in ("id", "name", "email", "role", "is_active", "designation", "department", "branch_id", "branch_name", "employee_code",
                                      "employment_type", "status", "manager_name", "join_date", "phone", "probation_end", "completeness", "city")})
    return out


@router.get("/hr/people/{uid}")
async def person(uid: str, user: dict = Depends(get_current_user)):
    u = await db.users.find_one({"id": uid}, {"_id": 0, "password_hash": 0})
    if not u:
        raise HTTPException(status_code=404, detail="Employee not found")
    branches, users = await _maps()
    v = _hr_view(u, _can_sensitive(user), branches, users)
    v["onboarding"] = await db.hr_onboarding.find_one({"user_id": uid}, {"_id": 0, "id": 1, "status": 1, "start_date": 1}, sort=[("created_at", -1)])
    v["offboarding"] = await db.hr_offboarding.find_one({"user_id": uid}, {"_id": 0, "id": 1, "status": 1, "last_working_day": 1}, sort=[("created_at", -1)])
    v["skill_plans"] = await db.hr_skill_plans.find({"user_id": uid}, {"_id": 0}).sort("created_at", -1).to_list(50)
    v["kt"] = await db.hr_kt.find({"$or": [{"from_id": uid}, {"to_ids": uid}]}, {"_id": 0, "id": 1, "topic": 1, "status": 1, "from_name": 1, "due_date": 1}).to_list(50)
    return v


class EmergencyContact(BaseModel):
    name: Optional[str] = ""
    relation: Optional[str] = ""
    phone: Optional[str] = ""


class DocItem(BaseModel):
    name: str
    status: str = "pending"
    note: Optional[str] = ""


class HRRecordIn(BaseModel):
    # user-level fields
    designation: Optional[str] = None
    department: Optional[str] = None
    phone: Optional[str] = None
    join_date: Optional[str] = None
    branch_id: Optional[str] = None
    # hr fields
    employee_code: Optional[str] = None
    employment_type: Optional[str] = None
    status: Optional[str] = None
    manager_id: Optional[str] = None
    probation_end: Optional[str] = None
    confirmation_date: Optional[str] = None
    notice_period_days: Optional[int] = None
    work_location: Optional[str] = None
    personal_email: Optional[str] = None
    date_of_birth: Optional[str] = None
    gender: Optional[str] = None
    blood_group: Optional[str] = None
    marital_status: Optional[str] = None
    address_current: Optional[str] = None
    address_permanent: Optional[str] = None
    emergency_contact: Optional[EmergencyContact] = None
    education: Optional[str] = None
    previous_employer: Optional[str] = None
    documents: Optional[List[DocItem]] = None
    notes: Optional[str] = None
    # sensitive (write-only; send "" to clear)
    pan: Optional[str] = None
    uan: Optional[str] = None
    pf_number: Optional[str] = None
    esi_number: Optional[str] = None
    bank_account: Optional[str] = None
    bank_name: Optional[str] = None
    bank_ifsc: Optional[str] = None
    bank_account_holder: Optional[str] = None
    aadhaar_last4: Optional[str] = None


USER_FIELDS = ("designation", "department", "phone", "join_date", "branch_id")
SELF_FIELDS = ("personal_email", "phone", "blood_group", "marital_status", "address_current", "address_permanent", "emergency_contact",
               "education", "date_of_birth")


def _validate_dates(d: dict):
    for k in ("join_date", "probation_end", "confirmation_date", "date_of_birth"):
        v = d.get(k)
        if v:
            try:
                date.fromisoformat(v[:10])
            except ValueError:
                raise HTTPException(status_code=400, detail=f"{k.replace('_', ' ').capitalize()} must be a date")


async def _apply_hr(uid: str, patch: dict, actor: dict, allowed: tuple = None):
    u = await db.users.find_one({"id": uid}, {"_id": 0, "id": 1, "name": 1, "hr": 1})
    if not u:
        raise HTTPException(status_code=404, detail="Employee not found")
    if allowed is not None:
        patch = {k: v for k, v in patch.items() if k in allowed}
    _validate_dates(patch)
    if patch.get("employment_type") and patch["employment_type"] not in EMPLOYMENT_TYPES:
        raise HTTPException(status_code=400, detail="Invalid employment type")
    if patch.get("status") and patch["status"] not in HR_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")
    if patch.get("aadhaar_last4") and not (patch["aadhaar_last4"].isdigit() and len(patch["aadhaar_last4"]) == 4):
        raise HTTPException(status_code=400, detail="Store only the last 4 digits of Aadhaar")
    if patch.get("pan"):
        pan = patch["pan"].strip().upper()
        if len(pan) != 10 or not (pan[:5].isalpha() and pan[5:9].isdigit() and pan[9].isalpha()):
            raise HTTPException(status_code=400, detail="PAN should look like ABCDE1234F")
        patch["pan"] = pan
    if patch.get("bank_ifsc"):
        patch["bank_ifsc"] = patch["bank_ifsc"].strip().upper()
        if len(patch["bank_ifsc"]) != 11:
            raise HTTPException(status_code=400, detail="IFSC should be 11 characters (e.g. HDFC0001234)")
    if patch.get("employee_code"):
        clash = await db.users.find_one({"hr.employee_code": patch["employee_code"].strip(), "id": {"$ne": uid}}, {"_id": 0, "name": 1})
        if clash:
            raise HTTPException(status_code=409, detail=f"Employee code already used by {clash['name']}")
    if patch.get("documents"):
        for d in patch["documents"]:
            if d.get("status") not in DOC_STATUS:
                d["status"] = "pending"
    sets = {}
    changed = []
    for k, v in patch.items():
        if k in USER_FIELDS:
            sets[k] = v or ("" if k != "branch_id" else None)
        elif k in SENSITIVE:
            sets[f"hr.{k}_enc"] = _enc(v)
            changed.append(k)
        else:
            sets[f"hr.{k}"] = v
    if not sets:
        return
    sets["hr.updated_at"] = _now()
    await db.users.update_one({"id": uid}, {"$set": sets})
    await log_activity(actor, "hr_record_updated", "user", uid, u["name"] + (f" · {', '.join(changed)} changed" if changed else ""))


@router.put("/hr/people/{uid}")
async def update_person(uid: str, body: HRRecordIn, user: dict = Depends(get_current_user)):
    _need(user)
    patch = {k: v for k, v in body.dict(exclude_unset=True).items()}
    if any(k in patch for k in SENSITIVE + ("bank_name", "bank_ifsc", "bank_account_holder", "aadhaar_last4")) and not _can_sensitive(user):
        raise HTTPException(status_code=403, detail="Bank and statutory details need Payroll → manage")
    if "emergency_contact" in patch and patch["emergency_contact"] is not None:
        patch["emergency_contact"] = dict(patch["emergency_contact"])
    if "documents" in patch and patch["documents"] is not None:
        patch["documents"] = [dict(d) for d in patch["documents"]]
    await _apply_hr(uid, patch, user)
    return await person(uid, user)


class RevealIn(BaseModel):
    field: str


@router.post("/hr/people/{uid}/reveal")
async def reveal(uid: str, body: RevealIn, user: dict = Depends(get_current_user)):
    if not _can_sensitive(user):
        raise HTTPException(status_code=403, detail="Revealing bank / statutory details needs Payroll → manage")
    if body.field not in SENSITIVE:
        raise HTTPException(status_code=400, detail="Unknown field")
    u = await db.users.find_one({"id": uid}, {"_id": 0, "name": 1, "hr": 1})
    if not u:
        raise HTTPException(status_code=404, detail="Employee not found")
    await log_activity(user, "hr_sensitive_revealed", "user", uid, f"{u['name']} · {body.field}")
    return {"value": _dec((u.get("hr") or {}).get(f"{body.field}_enc"))}


# ------------------------------------------------------------------ self-service
@router.get("/me/hr")
async def my_hr(user: dict = Depends(get_current_user)):
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
    branches, users = await _maps()
    v = _hr_view(u, False, branches, users)
    v["self_fields"] = list(SELF_FIELDS)
    return v


@router.put("/me/hr")
async def update_my_hr(body: HRRecordIn, user: dict = Depends(get_current_user)):
    patch = {k: v for k, v in body.dict(exclude_unset=True).items() if k in SELF_FIELDS}
    if "emergency_contact" in patch and patch["emergency_contact"] is not None:
        patch["emergency_contact"] = dict(patch["emergency_contact"])
    await _apply_hr(user["id"], patch, user, allowed=SELF_FIELDS)
    return await my_hr(user)


# ------------------------------------------------------------------ onboarding / offboarding
class TaskIn(BaseModel):
    title: str
    group: Optional[str] = "other"
    owner_role: Optional[str] = "hr"
    assignee_id: Optional[str] = None
    due_date: Optional[str] = None


class TaskUpdate(BaseModel):
    done: Optional[bool] = None
    note: Optional[str] = None
    assignee_id: Optional[str] = None
    due_date: Optional[str] = None
    title: Optional[str] = None


class OnboardIn(BaseModel):
    user_id: str
    start_date: str
    manager_id: Optional[str] = None
    buddy_id: Optional[str] = None
    notes: Optional[str] = ""


class OffboardIn(BaseModel):
    user_id: str
    type: str = "resignation"
    notice_date: Optional[str] = None
    last_working_day: str
    reason: Optional[str] = ""
    handover_to_id: Optional[str] = None
    create_kt: bool = True


class OffboardUpdate(BaseModel):
    last_working_day: Optional[str] = None
    reason: Optional[str] = None
    exit_interview_done: Optional[bool] = None
    exit_interview_notes: Optional[str] = None
    fnf_status: Optional[str] = None
    fnf_amount: Optional[float] = None
    fnf_note: Optional[str] = None
    rehire_eligible: Optional[bool] = None


class CompleteIn(BaseModel):
    deactivate_login: bool = False


def _offset(d: str, days: int) -> str:
    return (date.fromisoformat(d) + timedelta(days=days)).isoformat()


def _tasks_from(template: list, anchor: str, assign: dict) -> list:
    return [{"id": str(uuid.uuid4()), "title": t["title"], "group": t.get("group", "other"), "owner_role": t.get("owner_role", "hr"),
             "assignee_id": assign.get(t.get("owner_role")), "due_date": _offset(anchor, int(t.get("due_offset_days") or 0)),
             "done": False, "done_at": None, "done_by": None, "note": ""} for t in template]


def _progress(doc):
    tasks = doc.get("tasks") or []
    done = sum(1 for t in tasks if t.get("done"))
    doc["progress"] = round(100 * done / len(tasks)) if tasks else 0
    doc["tasks_done"], doc["tasks_total"] = done, len(tasks)
    doc["overdue"] = sum(1 for t in tasks if not t.get("done") and t.get("due_date") and t["due_date"] < _today().isoformat())
    return doc


async def _named(doc):
    _, users = await _maps()
    for t in doc.get("tasks") or []:
        t["assignee_name"] = users.get(t.get("assignee_id"), "")
    for k in ("manager_id", "buddy_id", "handover_to_id"):
        if k in doc:
            doc[k.replace("_id", "_name")] = users.get(doc.get(k), "")
    return _progress(doc)


@router.get("/hr/onboarding")
async def list_onboarding(status: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = {"status": status} if status else {}
    if not has_permission(user, "hr"):  # your own checklist, plus any where you own a task (manager, buddy, IT…)
        q["$or"] = [{"tasks.assignee_id": user["id"]}, {"user_id": user["id"]}]
    return [await _named(d) for d in await db.hr_onboarding.find(q, {"_id": 0}).sort("start_date", -1).to_list(500)]


@router.post("/hr/onboarding")
async def start_onboarding(body: OnboardIn, user: dict = Depends(get_current_user)):
    _need(user)
    emp = await db.users.find_one({"id": body.user_id}, {"_id": 0, "id": 1, "name": 1, "hr": 1})
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    if await db.hr_onboarding.find_one({"user_id": body.user_id, "status": "in_progress"}):
        raise HTTPException(status_code=409, detail=f"{emp['name']} already has onboarding in progress")
    _validate_dates({"join_date": body.start_date})
    tpl = (await templates())["onboarding"]
    mgr = body.manager_id or (emp.get("hr") or {}).get("manager_id")
    doc = {"id": str(uuid.uuid4()), "user_id": emp["id"], "user_name": emp["name"], "start_date": body.start_date, "manager_id": mgr,
           "buddy_id": body.buddy_id, "notes": body.notes or "", "status": "in_progress",
           "tasks": _tasks_from(tpl, body.start_date, {"manager": mgr, "buddy": body.buddy_id, "employee": emp["id"]}),
           "created_by": user["id"], "created_at": _now(), "completed_at": None}
    await db.hr_onboarding.insert_one(dict(doc))
    await db.users.update_one({"id": emp["id"]}, {"$set": {"join_date": body.start_date, "hr.status": "probation", **({"hr.manager_id": mgr} if mgr else {})}})
    await log_activity(user, "onboarding_started", "user", emp["id"], emp["name"])
    return await _named(doc)


EXIT_PRIVATE = ("reason", "exit_interview", "rehire_eligible")


def _redact_exit(d: dict, user: dict) -> dict:
    """Exit reason, interview notes, settlement figures and rehire eligibility stay with HR. The person leaving
    still sees whether their full & final is settled."""
    if has_permission(user, "hr"):
        return d
    for k in EXIT_PRIVATE:
        d.pop(k, None)
    fnf = d.pop("fnf", None)
    if d.get("user_id") == user["id"] and isinstance(fnf, dict):
        d["fnf"] = {"status": fnf.get("status")}
    return d


@router.get("/hr/offboarding")
async def list_offboarding(status: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = {"status": status} if status else {}
    if not has_permission(user, "hr"):  # your own checklist, plus any where you own a task (manager, buddy, IT…)
        q["$or"] = [{"tasks.assignee_id": user["id"]}, {"user_id": user["id"]}]
    rows = await db.hr_offboarding.find(q, {"_id": 0}).sort("last_working_day", -1).to_list(500)
    return [_redact_exit(await _named(d), user) for d in rows]


async def _assets_of(uid: str):
    return await db.assets.find({"assigned_to": uid, "status": {"$ne": "retired"}}, {"_id": 0, "id": 1, "code": 1, "name": 1, "asset_type": 1}).to_list(100)


@router.post("/hr/offboarding")
async def start_offboarding(body: OffboardIn, user: dict = Depends(get_current_user)):
    _need(user)
    emp = await db.users.find_one({"id": body.user_id}, {"_id": 0, "id": 1, "name": 1, "hr": 1})
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    if await db.hr_offboarding.find_one({"user_id": body.user_id, "status": "in_progress"}):
        raise HTTPException(status_code=409, detail=f"{emp['name']} already has offboarding in progress")
    if body.type not in OFFBOARD_TYPES:
        raise HTTPException(status_code=400, detail="Invalid exit type")
    _validate_dates({"join_date": body.last_working_day, "probation_end": body.notice_date})
    tpl = (await templates())["offboarding"]
    mgr = (emp.get("hr") or {}).get("manager_id")
    assets = await _assets_of(emp["id"])
    doc = {"id": str(uuid.uuid4()), "user_id": emp["id"], "user_name": emp["name"], "type": body.type,
           "notice_date": body.notice_date or _today().isoformat(), "last_working_day": body.last_working_day, "reason": body.reason or "",
           "handover_to_id": body.handover_to_id, "status": "in_progress",
           "tasks": _tasks_from(tpl, body.last_working_day, {"manager": mgr, "employee": emp["id"]}),
           "assets": [{**a, "returned": False} for a in assets],
           "exit_interview": {"done": False, "notes": ""}, "fnf": {"status": "pending", "amount": None, "note": ""}, "rehire_eligible": None,
           "kt_id": None, "created_by": user["id"], "created_at": _now(), "completed_at": None}
    if body.create_kt:
        to = [body.handover_to_id] if body.handover_to_id else ([mgr] if mgr else [])
        kt = await _create_kt({"from_id": emp["id"], "to_ids": to, "topic": f"Handover from {emp['name']}",
                               "due_date": _offset(body.last_working_day, -3), "scope": "Clients, projects, logins and recurring work",
                               "items": ["Active client accounts and contacts", "Ongoing projects and next steps", "Tool / platform logins (move to Password Manager)",
                                         "Recurring reports and schedules", "Files and folders location"]}, user, offboarding_id=doc["id"])
        doc["kt_id"] = kt["id"]
    await db.hr_offboarding.insert_one(dict(doc))
    await db.users.update_one({"id": emp["id"]}, {"$set": {"hr.status": "notice", "hr.exit_date": body.last_working_day}})
    await log_activity(user, "offboarding_started", "user", emp["id"], f"{emp['name']} · last day {body.last_working_day}")
    return await _named(doc)


async def _process(kind: str, pid: str) -> dict:
    coll = db.hr_onboarding if kind == "onboarding" else db.hr_offboarding
    d = await coll.find_one({"id": pid}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Not found")
    return d


@router.get("/hr/process/{kind}/{pid}")
async def get_process(kind: str, pid: str, user: dict = Depends(get_current_user)):
    if kind not in ("onboarding", "offboarding"):
        raise HTTPException(status_code=404, detail="Not found")
    d = await _process(kind, pid)
    # open to HR, the person it's about, and anyone who owns a task on this checklist (manager, buddy, IT…)
    if not has_permission(user, "hr") and d.get("user_id") != user["id"] and not any(t.get("assignee_id") == user["id"] for t in d.get("tasks") or []):
        raise HTTPException(status_code=403, detail="You don't have permission for this module")
    if kind == "offboarding":
        # refresh asset list (new assignments since the process started)
        have = {a["id"] for a in d.get("assets") or []}
        for a in await _assets_of(d["user_id"]):
            if a["id"] not in have:
                d.setdefault("assets", []).append({**a, "returned": False})
        if d.get("kt_id"):
            d["kt"] = await db.hr_kt.find_one({"id": d["kt_id"]}, {"_id": 0, "id": 1, "topic": 1, "status": 1})
        return _redact_exit(await _named(d), user)
    return await _named(d)


@router.post("/hr/process/{kind}/{pid}/tasks")
async def add_task(kind: str, pid: str, body: TaskIn, user: dict = Depends(get_current_user)):
    _need(user)
    if kind not in ("onboarding", "offboarding"):
        raise HTTPException(status_code=404, detail="Not found")
    await _process(kind, pid)
    t = {"id": str(uuid.uuid4()), "title": body.title.strip()[:200], "group": body.group or "other", "owner_role": body.owner_role or "hr",
         "assignee_id": body.assignee_id, "due_date": body.due_date, "done": False, "done_at": None, "done_by": None, "note": ""}
    coll = db.hr_onboarding if kind == "onboarding" else db.hr_offboarding
    await coll.update_one({"id": pid}, {"$push": {"tasks": t}})
    return await get_process(kind, pid, user)


@router.put("/hr/process/{kind}/{pid}/tasks/{tid}")
async def update_task(kind: str, pid: str, tid: str, body: TaskUpdate, user: dict = Depends(get_current_user)):
    if kind not in ("onboarding", "offboarding"):
        raise HTTPException(status_code=404, detail="Not found")
    d = await _process(kind, pid)
    task = next((t for t in d.get("tasks") or [] if t["id"] == tid), None)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    # task assignee can tick their own task; everything else needs hr.manage
    if not (has_permission(user, "hr.manage") or (task.get("assignee_id") == user["id"] and set(body.dict(exclude_unset=True)) <= {"done", "note"})):
        raise HTTPException(status_code=403, detail="You need HR → manage to change this")
    sets = {}
    for k, v in body.dict(exclude_unset=True).items():
        sets[f"tasks.$.{k}"] = v
    if body.done is not None:
        sets["tasks.$.done_at"] = _now() if body.done else None
        sets["tasks.$.done_by"] = user["name"] if body.done else None
    coll = db.hr_onboarding if kind == "onboarding" else db.hr_offboarding
    await coll.update_one({"id": pid, "tasks.id": tid}, {"$set": sets})
    return await get_process(kind, pid, user)


@router.put("/hr/offboarding/{pid}")
async def update_offboarding(pid: str, body: OffboardUpdate, user: dict = Depends(get_current_user)):
    _need(user)
    d = await _process("offboarding", pid)
    sets = {}
    if body.last_working_day:
        _validate_dates({"join_date": body.last_working_day})
        sets["last_working_day"] = body.last_working_day
        await db.users.update_one({"id": d["user_id"]}, {"$set": {"hr.exit_date": body.last_working_day}})
    if body.reason is not None:
        sets["reason"] = body.reason
    if body.exit_interview_done is not None:
        sets["exit_interview.done"] = body.exit_interview_done
    if body.exit_interview_notes is not None:
        sets["exit_interview.notes"] = body.exit_interview_notes[:4000]
    if body.fnf_status is not None:
        if body.fnf_status not in ("pending", "processed", "paid"):
            raise HTTPException(status_code=400, detail="Invalid settlement status")
        sets["fnf.status"] = body.fnf_status
    if body.fnf_amount is not None:
        sets["fnf.amount"] = body.fnf_amount
    if body.fnf_note is not None:
        sets["fnf.note"] = body.fnf_note[:1000]
    if body.rehire_eligible is not None:
        sets["rehire_eligible"] = body.rehire_eligible
    if sets:
        await db.hr_offboarding.update_one({"id": pid}, {"$set": sets})
    return await get_process("offboarding", pid, user)


@router.post("/hr/offboarding/{pid}/assets/{aid}")
async def asset_returned(pid: str, aid: str, user: dict = Depends(get_current_user)):
    """Mark an asset as collected: unassigns it in the Assets module too."""
    _need(user)
    d = await _process("offboarding", pid)
    if not any(a["id"] == aid for a in d.get("assets") or []):
        raise HTTPException(status_code=404, detail="Asset not on this checklist")
    await db.hr_offboarding.update_one({"id": pid, "assets.id": aid}, {"$set": {"assets.$.returned": True, "assets.$.returned_at": _now()}})
    a = await db.assets.find_one({"id": aid}, {"_id": 0})
    if a and a.get("assigned_to") == d["user_id"]:
        hist = a.get("assignment_history") or []
        for h in hist:
            if h.get("assigned_to") == d["user_id"] and h.get("to_date") is None:
                h["to_date"] = _today().isoformat()
        await db.assets.update_one({"id": aid}, {"$set": {"assigned_to": None, "status": "available", "assignment_history": hist}})
    await log_activity(user, "offboarding_asset_returned", "asset", aid, f"{(a or {}).get('name', aid)} from {d['user_name']}")
    return await get_process("offboarding", pid, user)


@router.post("/hr/process/{kind}/{pid}/complete")
async def complete_process(kind: str, pid: str, body: CompleteIn, user: dict = Depends(get_current_user)):
    _need(user)
    if kind not in ("onboarding", "offboarding"):
        raise HTTPException(status_code=404, detail="Not found")
    d = await _process(kind, pid)
    coll = db.hr_onboarding if kind == "onboarding" else db.hr_offboarding
    await coll.update_one({"id": pid}, {"$set": {"status": "completed", "completed_at": _now()}})
    if kind == "offboarding":
        sets = {"hr.status": "exited"}
        if body.deactivate_login:
            if d["user_id"] == user["id"]:
                raise HTTPException(status_code=400, detail="You can't deactivate your own login")
            sets["is_active"] = False
        await db.users.update_one({"id": d["user_id"]}, {"$set": sets})
    else:
        await db.users.update_one({"id": d["user_id"], "hr.status": {"$in": [None, "probation"]}}, {"$set": {"hr.status": "probation"}})
    await log_activity(user, f"{kind}_completed", "user", d["user_id"], d["user_name"] + (" · login deactivated" if body.deactivate_login else ""))
    return await get_process(kind, pid, user)


@router.post("/hr/process/{kind}/{pid}/cancel")
async def cancel_process(kind: str, pid: str, user: dict = Depends(get_current_user)):
    _need(user)
    if kind not in ("onboarding", "offboarding"):
        raise HTTPException(status_code=404, detail="Not found")
    d = await _process(kind, pid)
    coll = db.hr_onboarding if kind == "onboarding" else db.hr_offboarding
    await coll.update_one({"id": pid}, {"$set": {"status": "cancelled", "completed_at": _now()}})
    if kind == "offboarding":
        await db.users.update_one({"id": d["user_id"]}, {"$set": {"hr.status": "active", "hr.exit_date": ""}})
    await log_activity(user, f"{kind}_cancelled", "user", d["user_id"], d["user_name"])
    return await get_process(kind, pid, user)


class TemplatesIn(BaseModel):
    onboarding: Optional[List[dict]] = None
    offboarding: Optional[List[dict]] = None


@router.get("/hr/templates")
async def get_templates(user: dict = Depends(get_current_user)):
    return await templates()


@router.put("/hr/templates")
async def save_templates(body: TemplatesIn, user: dict = Depends(get_current_user)):
    _need(user)
    sets = {}
    for k in ("onboarding", "offboarding"):
        v = getattr(body, k)
        if v is not None:
            clean = []
            for t in v:
                if not (t.get("title") or "").strip():
                    continue
                clean.append({"title": t["title"].strip()[:200], "group": t.get("group") or "other",
                              "owner_role": t.get("owner_role") if t.get("owner_role") in OWNER_ROLES else "hr",
                              "due_offset_days": int(t.get("due_offset_days") or 0)})
            sets[k] = clean
    await db.settings.update_one({"id": "hr_templates"}, {"$set": {"id": "hr_templates", **sets}}, upsert=True)
    await log_activity(user, "hr_templates_updated", "settings", "hr_templates", ", ".join(sets))
    return await templates()


# ------------------------------------------------------------------ knowledge transfer
class KTIn(BaseModel):
    from_id: str
    to_ids: List[str] = []
    topic: str
    scope: Optional[str] = ""
    due_date: Optional[str] = None
    items: Optional[List[str]] = None


class KTUpdate(BaseModel):
    topic: Optional[str] = None
    scope: Optional[str] = None
    due_date: Optional[str] = None
    to_ids: Optional[List[str]] = None
    status: Optional[str] = None


class KTSession(BaseModel):
    date: str
    duration_min: int = 60
    notes: Optional[str] = ""
    recording_link: Optional[str] = ""


class KTDoc(BaseModel):
    title: str
    url: str


class KTItem(BaseModel):
    title: str


KT_STATUS = {"planned": "Planned", "in_progress": "In progress", "completed": "Handed over", "signed_off": "Signed off"}


async def _create_kt(data: dict, user: dict, offboarding_id: Optional[str] = None) -> dict:
    _, users = await _maps()
    if data["from_id"] not in users:
        raise HTTPException(status_code=404, detail="Person handing over not found")
    doc = {"id": str(uuid.uuid4()), "from_id": data["from_id"], "from_name": users[data["from_id"]],
           "to_ids": [t for t in data.get("to_ids") or [] if t in users and t != data["from_id"]],
           "topic": data["topic"].strip()[:200], "scope": (data.get("scope") or "")[:1000], "due_date": data.get("due_date"),
           "status": "planned", "items": [{"id": str(uuid.uuid4()), "title": t[:200], "done": False} for t in (data.get("items") or []) if t.strip()],
           "sessions": [], "docs": [], "offboarding_id": offboarding_id, "signed_off_by": None, "signed_off_at": None,
           "created_by": user["id"], "created_at": _now()}
    doc["to_names"] = [users[t] for t in doc["to_ids"]]
    await db.hr_kt.insert_one(dict(doc))
    await log_activity(user, "kt_created", "user", doc["from_id"], doc["topic"])
    return doc


def _kt_view(d):
    items = d.get("items") or []
    d["progress"] = round(100 * sum(1 for i in items if i.get("done")) / len(items)) if items else (100 if d.get("status") in ("completed", "signed_off") else 0)
    d["hours"] = round(sum(s.get("duration_min", 0) for s in d.get("sessions") or []) / 60, 1)
    d["status_label"] = KT_STATUS.get(d.get("status"), d.get("status"))
    return d


@router.get("/hr/kt")
async def list_kt(status: Optional[str] = None, person: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = {}
    if not has_permission(user, "hr"):
        person = user["id"]  # people outside HR only see handovers they're part of
    if status:
        q["status"] = status
    if person:
        q["$or"] = [{"from_id": person}, {"to_ids": person}]
    return [_kt_view(d) for d in await db.hr_kt.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)]


@router.post("/hr/kt")
async def create_kt(body: KTIn, user: dict = Depends(get_current_user)):
    _need(user)
    if not body.topic.strip():
        raise HTTPException(status_code=400, detail="Give the handover a topic")
    return _kt_view(await _create_kt(body.dict(), user))


async def _kt(kid):
    d = await db.hr_kt.find_one({"id": kid}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Knowledge transfer not found")
    return d


def _kt_can_edit(user, d):
    return has_permission(user, "hr.manage") or user["id"] == d.get("from_id") or user["id"] in (d.get("to_ids") or [])


@router.get("/hr/kt/{kid}")
async def get_kt(kid: str, user: dict = Depends(get_current_user)):
    d = await _kt(kid)
    if not (has_permission(user, "hr") or _kt_can_edit(user, d)):
        raise HTTPException(status_code=403, detail="You don't have permission for this module")
    return _kt_view(d)


@router.put("/hr/kt/{kid}")
async def update_kt(kid: str, body: KTUpdate, user: dict = Depends(get_current_user)):
    d = await _kt(kid)
    if not _kt_can_edit(user, d):
        raise HTTPException(status_code=403, detail="Only the people in this handover or HR can change it")
    sets = {k: v for k, v in body.dict(exclude_unset=True).items() if v is not None}
    if "status" in sets:
        if sets["status"] not in KT_STATUS:
            raise HTTPException(status_code=400, detail="Invalid status")
        if sets["status"] == "signed_off":
            if user["id"] not in (d.get("to_ids") or []) and not has_permission(user, "hr.manage"):
                raise HTTPException(status_code=403, detail="The person receiving the handover (or HR) signs it off")
            sets["signed_off_by"], sets["signed_off_at"] = user["name"], _now()
    if "to_ids" in sets:
        _, users = await _maps()
        sets["to_ids"] = [t for t in sets["to_ids"] if t in users and t != d["from_id"]]
        sets["to_names"] = [users[t] for t in sets["to_ids"]]
    if sets:
        await db.hr_kt.update_one({"id": kid}, {"$set": sets})
    return _kt_view(await _kt(kid))


@router.post("/hr/kt/{kid}/items")
async def add_kt_item(kid: str, body: KTItem, user: dict = Depends(get_current_user)):
    d = await _kt(kid)
    if not _kt_can_edit(user, d):
        raise HTTPException(status_code=403, detail="Only the people in this handover or HR can change it")
    await db.hr_kt.update_one({"id": kid}, {"$push": {"items": {"id": str(uuid.uuid4()), "title": body.title.strip()[:200], "done": False}}})
    return _kt_view(await _kt(kid))


@router.post("/hr/kt/{kid}/items/{iid}/toggle")
async def toggle_kt_item(kid: str, iid: str, user: dict = Depends(get_current_user)):
    d = await _kt(kid)
    if not _kt_can_edit(user, d):
        raise HTTPException(status_code=403, detail="Only the people in this handover or HR can change it")
    it = next((i for i in d.get("items") or [] if i["id"] == iid), None)
    if not it:
        raise HTTPException(status_code=404, detail="Item not found")
    sets = {"items.$.done": not it.get("done")}
    if d.get("status") == "planned":
        sets["status"] = "in_progress"
    await db.hr_kt.update_one({"id": kid, "items.id": iid}, {"$set": sets})
    return _kt_view(await _kt(kid))


@router.post("/hr/kt/{kid}/sessions")
async def add_kt_session(kid: str, body: KTSession, user: dict = Depends(get_current_user)):
    d = await _kt(kid)
    if not _kt_can_edit(user, d):
        raise HTTPException(status_code=403, detail="Only the people in this handover or HR can change it")
    _validate_dates({"join_date": body.date})
    s = {"id": str(uuid.uuid4()), "date": body.date, "duration_min": max(5, min(600, body.duration_min)), "notes": (body.notes or "")[:4000],
         "recording_link": (body.recording_link or "")[:500], "logged_by": user["name"]}
    sets = {"status": "in_progress"} if d.get("status") == "planned" else {}
    await db.hr_kt.update_one({"id": kid}, {"$push": {"sessions": s}, **({"$set": sets} if sets else {})})
    return _kt_view(await _kt(kid))


@router.post("/hr/kt/{kid}/docs")
async def add_kt_doc(kid: str, body: KTDoc, user: dict = Depends(get_current_user)):
    d = await _kt(kid)
    if not _kt_can_edit(user, d):
        raise HTTPException(status_code=403, detail="Only the people in this handover or HR can change it")
    if not body.url.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="Add a full link (https://…)")
    await db.hr_kt.update_one({"id": kid}, {"$push": {"docs": {"id": str(uuid.uuid4()), "title": body.title.strip()[:200], "url": body.url[:1000]}}})
    return _kt_view(await _kt(kid))


@router.get("/me/kt")
async def my_kt(user: dict = Depends(get_current_user)):
    return [_kt_view(d) for d in await db.hr_kt.find({"$or": [{"from_id": user["id"]}, {"to_ids": user["id"]}]}, {"_id": 0}).sort("created_at", -1).to_list(100)]


# ------------------------------------------------------------------ skills
class LevelsIn(BaseModel):
    levels: Dict[str, int]


class PlanIn(BaseModel):
    user_id: str
    skill: str
    current_level: int = 1
    target_level: int = 3
    due_date: Optional[str] = None
    course_id: Optional[str] = None
    actions: Optional[str] = ""


class PlanUpdate(BaseModel):
    current_level: Optional[int] = None
    target_level: Optional[int] = None
    due_date: Optional[str] = None
    status: Optional[str] = None
    actions: Optional[str] = None
    note: Optional[str] = None


@router.get("/hr/skills/matrix")
async def skill_matrix(department: Optional[str] = None, user: dict = Depends(get_current_user)):
    rows = await _people()
    if department:
        rows = [r for r in rows if r.get("department") == department]
    catalog = (await db.settings.find_one({"id": "hr_skills"}, {"_id": 0}) or {}).get("skills") or []
    skills = list(dict.fromkeys(catalog + [s for r in rows for s in (r.get("skill_levels") or {})] + [s for r in rows for s in (r.get("skills") or [])]))
    people_out = []
    for r in rows:
        lv = dict(r.get("skill_levels") or {})
        for s in r.get("skills") or []:
            lv.setdefault(s, 2)  # listed on profile but never rated → "working knowledge"
        people_out.append({"id": r["id"], "name": r["name"], "designation": r.get("designation", ""), "department": r.get("department", ""), "levels": lv})
    summary = []
    for s in skills:
        vals = [p["levels"][s] for p in people_out if s in p["levels"]]
        summary.append({"skill": s, "people": len(vals), "experts": sum(1 for v in vals if v >= 4), "avg": round(sum(vals) / len(vals), 1) if vals else 0})
    summary.sort(key=lambda x: (x["experts"], x["people"]))
    return {"skills": skills, "people": people_out, "summary": summary, "catalog": catalog,
            "gaps": [x for x in summary if x["experts"] == 0 and x["people"] <= 2][:8]}


class CatalogIn(BaseModel):
    skills: List[str]


@router.put("/hr/skills/catalog")
async def save_catalog(body: CatalogIn, user: dict = Depends(get_current_user)):
    _need(user)
    skills = list(dict.fromkeys(s.strip()[:60] for s in body.skills if s.strip()))
    await db.settings.update_one({"id": "hr_skills"}, {"$set": {"id": "hr_skills", "skills": skills}}, upsert=True)
    return {"skills": skills}


@router.put("/hr/skills/{uid}")
async def set_levels(uid: str, body: LevelsIn, user: dict = Depends(get_current_user)):
    _need(user)
    u = await db.users.find_one({"id": uid}, {"_id": 0, "name": 1})
    if not u:
        raise HTTPException(status_code=404, detail="Employee not found")
    levels = {k.strip()[:60]: max(1, min(5, int(v))) for k, v in body.levels.items() if k.strip() and int(v) > 0}
    await db.users.update_one({"id": uid}, {"$set": {"skill_levels": levels, "skills": list(levels.keys())}})
    await log_activity(user, "skills_rated", "user", uid, f"{u['name']} · {len(levels)} skills")
    return {"levels": levels}


@router.get("/hr/skill-plans")
async def list_plans(status: Optional[str] = None, user_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = {}
    if status:
        q["status"] = status
    if user_id:
        q["user_id"] = user_id
    rows = await db.hr_skill_plans.find(q, {"_id": 0}).sort("due_date", 1).to_list(1000)
    courses = {c["id"]: c["title"] for c in await db.training_courses.find({}, {"_id": 0, "id": 1, "title": 1}).to_list(500)}
    for r in rows:
        r["course_title"] = courses.get(r.get("course_id"), "")
        r["overdue"] = r.get("status") == "active" and bool(r.get("due_date")) and r["due_date"] < _today().isoformat()
    return rows


@router.post("/hr/skill-plans")
async def create_plan(body: PlanIn, user: dict = Depends(get_current_user)):
    _need(user)
    u = await db.users.find_one({"id": body.user_id}, {"_id": 0, "id": 1, "name": 1})
    if not u:
        raise HTTPException(status_code=404, detail="Employee not found")
    if not body.skill.strip():
        raise HTTPException(status_code=400, detail="Which skill?")
    doc = {"id": str(uuid.uuid4()), "user_id": u["id"], "user_name": u["name"], "skill": body.skill.strip()[:60],
           "current_level": max(1, min(5, body.current_level)), "target_level": max(1, min(5, body.target_level)), "due_date": body.due_date,
           "course_id": body.course_id, "actions": (body.actions or "")[:2000], "status": "active", "notes": [],
           "created_by": user["id"], "created_at": _now()}
    await db.hr_skill_plans.insert_one(dict(doc))
    if body.course_id and not await db.training_assignments.find_one({"user_id": u["id"], "course_id": body.course_id}):
        await db.training_assignments.insert_one({"id": str(uuid.uuid4()), "user_id": u["id"], "course_id": body.course_id, "status": "assigned",
                                                  "progress": 0, "due_date": body.due_date, "assigned_by": user["id"], "assigned_at": _now(), "completed_at": None})
    await log_activity(user, "skill_plan_created", "user", u["id"], f"{u['name']} · {doc['skill']} → {doc['target_level']}")
    return doc


@router.put("/hr/skill-plans/{pid}")
async def update_plan(pid: str, body: PlanUpdate, user: dict = Depends(get_current_user)):
    p = await db.hr_skill_plans.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Plan not found")
    if not (has_permission(user, "hr.manage") or (p["user_id"] == user["id"] and set(body.dict(exclude_unset=True)) <= {"note", "current_level"})):
        raise HTTPException(status_code=403, detail="You need HR → manage to change this")
    sets, push = {}, None
    for k in ("current_level", "target_level"):
        v = getattr(body, k)
        if v is not None:
            sets[k] = max(1, min(5, v))
    if body.due_date is not None:
        sets["due_date"] = body.due_date
    if body.actions is not None:
        sets["actions"] = body.actions[:2000]
    if body.status is not None:
        if body.status not in ("active", "achieved", "dropped"):
            raise HTTPException(status_code=400, detail="Invalid status")
        sets["status"] = body.status
    if body.note:
        push = {"notes": {"at": _now(), "by": user["name"], "text": body.note[:1000]}}
    cur = sets.get("current_level", p["current_level"])
    if cur >= sets.get("target_level", p["target_level"]) and p.get("status") == "active" and "status" not in sets:
        sets["status"] = "achieved"
    if sets.get("status") == "achieved":
        u = await db.users.find_one({"id": p["user_id"]}, {"_id": 0, "skill_levels": 1, "skills": 1})
        lv = dict((u or {}).get("skill_levels") or {})
        lv[p["skill"]] = max(lv.get(p["skill"], 0), cur)
        await db.users.update_one({"id": p["user_id"]}, {"$set": {"skill_levels": lv, "skills": list(lv.keys())}})
    upd = {}
    if sets:
        upd["$set"] = sets
    if push:
        upd["$push"] = push
    if upd:
        await db.hr_skill_plans.update_one({"id": pid}, upd)
    return await db.hr_skill_plans.find_one({"id": pid}, {"_id": 0})


async def hr_alerts(user: dict) -> list:
    """Bell items: my onboarding/offboarding tasks due, probation ending (HR), KT sign-off waiting on me."""
    items = []
    t_iso = _today().isoformat()
    soon = (_today() + timedelta(days=3)).isoformat()
    for coll, kind in ((db.hr_onboarding, "onboarding"), (db.hr_offboarding, "offboarding")):
        async for d in coll.find({"status": "in_progress", "tasks.assignee_id": user["id"]}, {"_id": 0, "id": 1, "user_name": 1, "tasks": 1}):
            for t in d.get("tasks") or []:
                if t.get("assignee_id") == user["id"] and not t.get("done") and t.get("due_date") and t["due_date"] <= soon:
                    items.append({"kind": "hr", "title": f"{'Overdue' if t['due_date'] < t_iso else 'Due soon'}: {t['title']}",
                                  "sub": f"{kind.title()} · {d['user_name']}", "link": f"/hr/{kind}?open={d['id']}", "date": t["due_date"]})
    async for k in db.hr_kt.find({"to_ids": user["id"], "status": "completed"}, {"_id": 0, "id": 1, "topic": 1, "from_name": 1}):
        items.append({"kind": "hr", "title": f"Sign off handover: {k['topic']}", "sub": f"From {k['from_name']}", "link": f"/hr/kt?open={k['id']}", "date": t_iso})
    if has_permission(user, "hr.manage"):
        in14 = (_today() + timedelta(days=14)).isoformat()
        async for u in db.users.find({"is_active": {"$ne": False}, "hr.status": "probation", "hr.probation_end": {"$gte": t_iso, "$lte": in14}},
                                     {"_id": 0, "id": 1, "name": 1, "hr.probation_end": 1}):
            items.append({"kind": "hr", "title": f"Probation ends: {u['name']}", "sub": f"Confirm or extend by {u['hr']['probation_end']}",
                          "link": f"/hr/people?open={u['id']}", "date": u["hr"]["probation_end"]})
    return items
