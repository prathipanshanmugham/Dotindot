"""v3.4 Hiring — job posts for dotindot.in/careers and the applications they bring in.

  • HR → Hiring → Jobs: draft, open (live on the careers page, taking applications) or closed. Every change rebuilds
    the website, so an opening goes live (or comes down) within seconds. Past its closing date a job closes by itself.
  • Each open job gets its own page (/careers/<slug>/) with Google for Jobs data (JobPosting) and an apply form.
  • Applications land in HR → Hiring → Applications with the CV, and move through new → shortlisted → interview →
    offer → hired / not selected, with private notes.

Gate: `/api/hr/jobs*` needs `hiring`; changes need `hiring.manage`, deleting needs `hiring.delete`. Branch scope: people
who work in some branches see and change only those branches' jobs (company-wide jobs stay with unrestricted users).
CVs are kept outside every web folder (PRIVATE_FILES_DIR, default <repo>/private) and only reach signed-in users with
`hiring`. Public: POST /api/careers/apply (same-site, rate limited, honeypot, PDF/Word only, 5 MB).
"""
import hashlib
import json
import os
import re
import time
import uuid
from datetime import date, datetime, timezone
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from pydantic import BaseModel

from auth import get_current_user, log_activity
from database import db
from permissions import branch_scope, check_branch_write, has_permission

router = APIRouter()

REPO = Path(__file__).resolve().parent.parent
PRIVATE_DIR = Path(os.environ.get("PRIVATE_FILES_DIR") or REPO / "private").resolve()
CV_DIR = PRIVATE_DIR / "cv"
SEED_FILE = REPO / "website" / "src" / "careers.json"

JOB_STATUSES = {"draft": "Draft", "open": "Open", "closed": "Closed"}
WORK_MODES = {"onsite": "On-site", "hybrid": "Hybrid", "remote": "Remote"}
JOB_TYPES = {"full_time": "Full-time", "part_time": "Part-time", "contract": "Contract", "intern": "Internship"}
APP_STATUSES = {"new": "New", "shortlisted": "Shortlisted", "interview": "Interview", "offer": "Offer made", "hired": "Hired",
                "rejected": "Not selected"}
EXPERIENCE = ["Fresher", "Under 1 year", "1–2 years", "3–5 years", "6–10 years", "10+ years"]
CURRENCIES = ("INR", "USD", "AED", "GBP", "EUR", "SGD", "AUD", "CAD")
CV_TYPES = {".pdf": ("application/pdf", (b"%PDF-",)),
            ".docx": ("application/vnd.openxmlformats-officedocument.wordprocessingml.document", (b"PK\x03\x04",)),
            ".doc": ("application/msword", (b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1",))}
CV_MAX = 5 * 1024 * 1024
EMAIL_RE = re.compile(r"^[^@\s]{1,64}@[^@\s]+\.[a-z]{2,}$", re.I)


def _now():
    return datetime.now(timezone.utc).isoformat()


def _today():
    return date.today().isoformat()


def _need(user: dict, key: str):
    if not has_permission(user, key):
        what = {"hiring": "see hiring", "hiring.manage": "change jobs and applications", "hiring.delete": "delete jobs or applications"}[key]
        raise HTTPException(status_code=403, detail=f"You don't have permission to {what}")


def _slug(v: str) -> str:
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", (v or "").lower())).strip("-")[:70].strip("-") or "role"


def _scope_q(user: dict) -> dict:
    scope = branch_scope(user)
    return {} if scope is None else {"branch_id": {"$in": scope}}


def is_live(j: dict) -> bool:
    """On the website and taking applications."""
    return j.get("status") == "open" and not (j.get("closes_on") and j["closes_on"] < _today())


# ---------------------------------------------------------------- job posts
class JobIn(BaseModel):
    title: Optional[str] = None
    department: Optional[str] = None
    branch_id: Optional[str] = None
    location: Optional[str] = None
    work_mode: Optional[str] = None
    employment_type: Optional[str] = None
    experience: Optional[str] = None
    openings: Optional[int] = None
    salary_min: Optional[float] = None
    salary_max: Optional[float] = None
    salary_currency: Optional[str] = None
    salary_period: Optional[str] = None
    show_salary: Optional[bool] = None
    summary: Optional[str] = None
    description: Optional[str] = None
    skills: Optional[List[str]] = None
    closes_on: Optional[str] = None
    status: Optional[str] = None


async def _clean_job(d: dict, existing: Optional[dict], user: dict) -> dict:
    out = {}
    text = {"title": 120, "department": 60, "location": 100, "experience": 40, "summary": 300}
    for k, mx in text.items():
        if d.get(k) is not None:
            out[k] = re.sub(r"\s+", " ", str(d[k])).strip()[:mx]
    if d.get("description") is not None:
        v = re.sub(r"\r\n?", "\n", d["description"]).strip()
        if len(v) > 20000:
            raise HTTPException(status_code=400, detail="The description is too long (max 20,000 characters)")
        out["description"] = v
    for k, allowed in (("work_mode", WORK_MODES), ("employment_type", JOB_TYPES), ("status", JOB_STATUSES)):
        if d.get(k) is not None:
            if d[k] not in allowed:
                raise HTTPException(status_code=400, detail=f"Unknown {k.replace('_', ' ')}")
            out[k] = d[k]
    if d.get("openings") is not None:
        out["openings"] = max(1, min(int(d["openings"]), 100))
    for k in ("salary_min", "salary_max"):
        if k in d:  # null clears it
            if d[k] is not None and not 0 <= d[k] <= 1e10:
                raise HTTPException(status_code=400, detail="Check the salary figures")
            out[k] = round(float(d[k])) if d[k] else None
    if d.get("salary_currency") is not None:
        if d["salary_currency"] not in CURRENCIES:
            raise HTTPException(status_code=400, detail="Unknown currency")
        out["salary_currency"] = d["salary_currency"]
    if d.get("salary_period") is not None:
        if d["salary_period"] not in ("month", "year"):
            raise HTTPException(status_code=400, detail="Salary is per month or per year")
        out["salary_period"] = d["salary_period"]
    if d.get("show_salary") is not None:
        out["show_salary"] = bool(d["show_salary"])
    if d.get("skills") is not None:
        seen, skills = set(), []
        for s in d["skills"]:
            s = re.sub(r"\s+", " ", str(s)).strip()[:40]
            if s and s.lower() not in seen:
                seen.add(s.lower())
                skills.append(s)
        out["skills"] = skills[:15]
    if "closes_on" in d and d.get("closes_on") is not None:
        v = d["closes_on"].strip()
        if v and not re.match(r"^\d{4}-\d{2}-\d{2}$", v):
            raise HTTPException(status_code=400, detail="Closing date should be a date")
        out["closes_on"] = v or None
    if "branch_id" in d:
        b = d.get("branch_id") or None
        if b and not await db.branches.find_one({"id": b}, {"_id": 0, "id": 1}):
            raise HTTPException(status_code=404, detail="Branch not found")
        out["branch_id"] = b
    merged = {**(existing or {}), **out}
    for k, label in (("title", "a job title"), ("summary", "a one-line summary"), ("description", "a description")):
        if not (merged.get(k) or "").strip():
            raise HTTPException(status_code=400, detail=f"Add {label}")
    lo, hi = merged.get("salary_min"), merged.get("salary_max")
    if lo and hi and hi < lo:
        raise HTTPException(status_code=400, detail="The top of the salary range is below the bottom")
    if merged.get("show_salary") and not (lo or hi):
        raise HTTPException(status_code=400, detail="Add a salary figure, or turn off “Show the salary”")
    if out.get("status") == "open" and merged.get("closes_on") and merged["closes_on"] < _today():
        raise HTTPException(status_code=400, detail="The closing date has passed: move it later to open the job")
    return out


async def _branch_names() -> dict:
    return {b["id"]: b for b in await db.branches.find({}, {"_id": 0, "id": 1, "name": 1, "city": 1, "state": 1, "country": 1}).to_list(200)}


def _job_view(j: dict, branches: dict, counts: dict) -> dict:
    b = branches.get(j.get("branch_id")) or {}
    c = counts.get(j["id"], {})
    return {**j, "branch_name": b.get("name", ""), "live": is_live(j), "applications": sum(c.values()), "new_applications": c.get("new", 0),
            "location_label": j.get("location") or ", ".join(x for x in (b.get("city"), b.get("state")) if x)}


async def _counts(job_ids: list) -> dict:
    out = {}
    async for a in db.job_applications.aggregate([{"$match": {"job_id": {"$in": job_ids}}},
                                                  {"$group": {"_id": {"j": "$job_id", "s": "$status"}, "n": {"$sum": 1}}}]):
        out.setdefault(a["_id"]["j"], {})[a["_id"]["s"]] = a["n"]
    return out


async def _publish(user: dict) -> dict:
    from routes_website import publish
    return await publish(user)


async def _get_job(job_id: str, user: dict) -> dict:
    j = await db.job_posts.find_one({"id": job_id, **_scope_q(user)}, {"_id": 0})
    if not j:
        raise HTTPException(status_code=404, detail="Job not found")
    return j


@router.get("/hr/jobs")
async def list_jobs(user: dict = Depends(get_current_user)):
    _need(user, "hiring")
    jobs = await db.job_posts.find(_scope_q(user), {"_id": 0}).sort("created_at", -1).to_list(500)
    branches, counts = await _branch_names(), await _counts([j["id"] for j in jobs])
    scope = branch_scope(user)
    aq = {} if scope is None else {"branch_id": {"$in": scope}}
    general = await db.job_applications.count_documents({**aq, "job_id": None})
    return {"jobs": [_job_view(j, branches, counts) for j in jobs], "general_applications": general,
            "new_total": await db.job_applications.count_documents({**aq, "status": "new"}),
            "meta": {"statuses": JOB_STATUSES, "work_modes": WORK_MODES, "types": JOB_TYPES, "app_statuses": APP_STATUSES,
                     "experience": EXPERIENCE, "currencies": CURRENCIES, "branch_limited": scope is not None},
            "can_manage": has_permission(user, "hiring.manage"), "can_delete": has_permission(user, "hiring.delete")}


@router.post("/hr/jobs")
async def create_job(body: JobIn, user: dict = Depends(get_current_user)):
    _need(user, "hiring.manage")
    d = body.model_dump()
    data = await _clean_job({**d, "status": d.get("status") or "draft"}, None, user)
    if "branch_id" not in data or (data["branch_id"] is None and branch_scope(user)):
        data["branch_id"] = (branch_scope(user) or [None])[0]
    check_branch_write(user, data.get("branch_id"))
    base, n = _slug(data["title"]), 1
    slug = base
    while await db.job_posts.find_one({"slug": slug}, {"_id": 0, "id": 1}):
        n += 1
        slug = f"{base}-{n}"
    now = _now()
    doc = {"work_mode": "onsite", "employment_type": "full_time", "openings": 1, "salary_currency": "INR", "salary_period": "month",
           "show_salary": False, "skills": [], "closes_on": None, "department": "", "location": "", "experience": "",
           **data, "id": str(uuid.uuid4()), "slug": slug, "created_at": now, "updated_at": now, "created_by": user["id"],
           "created_by_name": user.get("name", "")}
    if doc["status"] == "open":
        doc["opened_at"] = now
    await db.job_posts.insert_one(dict(doc))
    await log_activity(user, "job_created", "job_post", doc["id"], doc["title"])
    pub = await _publish(user) if doc["status"] == "open" else None
    doc.pop("_id", None)
    return {"job": doc, "publish": pub}


@router.put("/hr/jobs/{job_id}")
async def update_job(job_id: str, body: JobIn, user: dict = Depends(get_current_user)):
    _need(user, "hiring.manage")
    j = await _get_job(job_id, user)
    check_branch_write(user, j.get("branch_id"))
    upd = await _clean_job(body.model_dump(exclude_unset=True), j, user)
    if "branch_id" in upd:
        check_branch_write(user, upd["branch_id"])
    if not upd:
        return {"ok": True, "publish": None}
    now = _now()
    upd["updated_at"] = now
    if upd.get("status") == "open" and j.get("status") != "open":
        upd["opened_at"] = now
    if upd.get("status") == "closed" and j.get("status") != "closed":
        upd["closed_at"] = now
    await db.job_posts.update_one({"id": job_id}, {"$set": upd})
    after = {**j, **upd}
    await log_activity(user, "job_updated", "job_post", job_id, after["title"] + (f" → {JOB_STATUSES[upd['status']]}" if "status" in upd else ""))
    pub = await _publish(user) if (is_live(j) or is_live(after)) else None
    return {"ok": True, "publish": pub}


@router.delete("/hr/jobs/{job_id}")
async def delete_job(job_id: str, user: dict = Depends(get_current_user)):
    _need(user, "hiring.delete")
    j = await _get_job(job_id, user)
    check_branch_write(user, j.get("branch_id"))
    from routes_records import hard_delete
    await hard_delete("job_posts", await db.job_posts.find_one({"id": job_id}), user)
    pub = await _publish(user) if is_live(j) else None
    return {"ok": True, "publish": pub}


# ---------------------------------------------------------------- applications
def _app_q(user: dict) -> dict:
    scope = branch_scope(user)
    return {} if scope is None else {"branch_id": {"$in": scope}}


async def _get_app(app_id: str, user: dict) -> dict:
    a = await db.job_applications.find_one({"id": app_id, **_app_q(user)}, {"_id": 0, "ip_hash": 0})
    if not a:
        raise HTTPException(status_code=404, detail="Application not found")
    return a


@router.get("/hr/jobs/applications")
async def list_applications(job_id: Optional[str] = None, status: Optional[str] = None, q: Optional[str] = None, limit: int = 300,
                            user: dict = Depends(get_current_user)):
    _need(user, "hiring")
    query = dict(_app_q(user))
    if job_id == "general":
        query["job_id"] = None
    elif job_id:
        query["job_id"] = job_id
    if status in APP_STATUSES:
        query["status"] = status
    if q and q.strip():
        rx = {"$regex": re.escape(q.strip()), "$options": "i"}
        query["$or"] = [{"name": rx}, {"email": rx}, {"phone": rx}, {"city": rx}, {"job_title": rx}]
    rows = await db.job_applications.find(query, {"_id": 0, "ip_hash": 0, "notes": 0, "note": 0}).sort("created_at", -1).to_list(max(1, min(limit, 500)))
    counts = {}
    async for c in db.job_applications.aggregate([{"$match": {k: v for k, v in query.items() if k != "status"}}, {"$group": {"_id": "$status", "n": {"$sum": 1}}}]):
        counts[c["_id"]] = c["n"]
    for r in rows:
        r["cv"] = {k: (r.get("cv") or {}).get(k) for k in ("name", "size", "type")} if r.get("cv") else None
    return {"rows": rows, "counts": counts}


@router.get("/hr/jobs/applications/{app_id}")
async def get_application(app_id: str, user: dict = Depends(get_current_user)):
    _need(user, "hiring")
    a = await _get_app(app_id, user)
    if a.get("cv"):
        a["cv"] = {k: a["cv"].get(k) for k in ("name", "size", "type")}
    job = await db.job_posts.find_one({"id": a.get("job_id")}, {"_id": 0, "id": 1, "title": 1, "slug": 1, "status": 1}) if a.get("job_id") else None
    others = await db.job_applications.find({"email": a["email"], "id": {"$ne": a["id"]}, **_app_q(user)},
                                            {"_id": 0, "id": 1, "job_title": 1, "status": 1, "created_at": 1}).sort("created_at", -1).to_list(10)
    return {**a, "job": job, "other_applications": others}


class AppUpdate(BaseModel):
    status: Optional[str] = None
    rating: Optional[int] = None
    note: Optional[str] = None


@router.put("/hr/jobs/applications/{app_id}")
async def update_application(app_id: str, body: AppUpdate, user: dict = Depends(get_current_user)):
    _need(user, "hiring.manage")
    a = await _get_app(app_id, user)
    upd, push = {}, None
    if body.status is not None:
        if body.status not in APP_STATUSES:
            raise HTTPException(status_code=400, detail="Unknown status")
        if body.status != a.get("status"):
            upd["status"] = body.status
            push = {"id": str(uuid.uuid4()), "at": _now(), "by": user["id"], "by_name": user.get("name", ""),
                    "text": f"Moved to {APP_STATUSES[body.status]}", "kind": "status"}
    if body.rating is not None:
        upd["rating"] = max(0, min(int(body.rating), 5))
    note = None
    if body.note is not None and body.note.strip():
        note = {"id": str(uuid.uuid4()), "at": _now(), "by": user["id"], "by_name": user.get("name", ""), "text": body.note.strip()[:3000], "kind": "note"}
    if not upd and not push and not note:
        return {"ok": True}
    upd["updated_at"] = _now()
    ops = {"$set": upd}
    items = [x for x in (push, note) if x]
    if items:
        ops["$push"] = {"notes": {"$each": items}}
    await db.job_applications.update_one({"id": app_id}, ops)
    if "status" in upd:
        await log_activity(user, "application_status", "job_application", app_id, f"{a['name']} — {a.get('job_title') or 'General'}: {APP_STATUSES[upd['status']]}")
    return {"ok": True}


@router.delete("/hr/jobs/applications/{app_id}")
async def delete_application(app_id: str, user: dict = Depends(get_current_user)):
    _need(user, "hiring.delete")
    await _get_app(app_id, user)
    from routes_records import hard_delete
    return await hard_delete("job_applications", await db.job_applications.find_one({"id": app_id}), user)


@router.get("/hr/jobs/applications/{app_id}/cv")
async def download_cv(app_id: str, user: dict = Depends(get_current_user)):
    _need(user, "hiring")
    a = await _get_app(app_id, user)
    cv = a.get("cv") or {}
    path = (CV_DIR / str(cv.get("file") or "")).resolve()
    if not cv.get("file") or path.parent != CV_DIR or not path.is_file():
        raise HTTPException(status_code=404, detail="The CV file isn't on this server any more")
    ext = path.suffix.lower()
    safe = re.sub(r"[^\w .-]+", "", a.get("name") or "Applicant").strip() or "Applicant"
    await log_activity(user, "cv_downloaded", "job_application", app_id, a.get("name", ""))
    return FileResponse(path, media_type=CV_TYPES.get(ext, ("application/octet-stream",))[0], filename=f"{safe} - CV{ext}",
                        headers={"X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store"})


# ---------------------------------------------------------------- public: apply from the website
_HITS: dict = {}


def _guard(request: Request) -> str:
    origin = request.headers.get("origin") or ""
    if origin:
        host = re.sub(r"^https?://", "", origin).split("/")[0].lower()
        allowed = {(request.headers.get("host") or "").lower()}
        allowed |= {re.sub(r"^https?://", "", o.strip()).split("/")[0].lower() for o in os.environ.get("WEBSITE_ORIGINS", "").split(",") if o.strip()}
        if host not in allowed:
            raise HTTPException(status_code=403, detail="Please apply on our website")
    ip = (request.headers.get("x-real-ip") or (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
          or (request.client.host if request.client else ""))
    if ip and ip not in ("127.0.0.1", "::1", "localhost"):
        t = time.time()
        hits = [h for h in _HITS.get(ip, []) if t - h < 3600]
        if len(hits) >= 6:
            raise HTTPException(status_code=429, detail="You've sent several applications in a short time. Please try again later.")
        if len(_HITS) > 5000:
            _HITS.clear()
        _HITS[ip] = hits + [t]
    return ip


def _fail(request: Request, status: int, msg: str):
    if request.headers.get("x-requested-with") == "fetch":
        return JSONResponse(status_code=status, content={"detail": msg})
    raise HTTPException(status_code=status, detail=msg)


@router.post("/careers/apply")
async def apply(request: Request, job_id: str = Form(""), name: str = Form(""), email: str = Form(""), phone: str = Form(""),
                city: str = Form(""), link: str = Form(""), experience: str = Form(""), note: str = Form(""), consent: str = Form(""),
                website_url: str = Form(""), page: str = Form(""), cv: Optional[UploadFile] = File(None)):
    try:
        ip = _guard(request)
    except HTTPException as e:
        return _fail(request, e.status_code, e.detail)
    done = {"ok": True, "message": "Application received"}
    if website_url.strip():  # honeypot: people never see this field
        return done if request.headers.get("x-requested-with") == "fetch" else RedirectResponse("/careers/applied/", status_code=303)
    name, email, phone = re.sub(r"\s+", " ", name).strip()[:80], email.strip().lower()[:120], re.sub(r"[^\d+()\s-]", "", phone).strip()[:30]
    if len(name) < 2:
        return _fail(request, 400, "Please add your name")
    if not EMAIL_RE.match(email):
        return _fail(request, 400, "Please check your email address")
    if not 8 <= len(re.sub(r"\D", "", phone)) <= 15:
        return _fail(request, 400, "Please add a phone number with its country code")
    link = link.strip()[:300]
    if link and not re.match(r"^https?://[^\s<>\"']+\.[^\s<>\"']+$", link):
        if re.match(r"^[\w.-]+\.[a-z]{2,}(/\S*)?$", link, re.I):
            link = "https://" + link
        else:
            return _fail(request, 400, "The link should be a web address, like linkedin.com/in/yourname")
    if experience and experience not in EXPERIENCE:
        experience = ""
    if consent not in ("1", "on", "true", "yes"):
        return _fail(request, 400, "Please tick the box to let us keep your application")
    job = None
    if job_id and job_id != "general":
        job = await db.job_posts.find_one({"id": job_id}, {"_id": 0})
        if not job:
            return _fail(request, 404, "This job isn't open any more")
        if not is_live(job):
            return _fail(request, 410, "Applications for this job have closed")
    if not cv or not cv.filename:
        return _fail(request, 400, "Please attach your CV (PDF or Word)")
    ext = Path(cv.filename).suffix.lower()
    data = await cv.read(CV_MAX + 1)
    if len(data) > CV_MAX:
        return _fail(request, 400, "Your CV is larger than 5 MB. Please attach a smaller file.")
    if ext not in CV_TYPES or not any(data.startswith(m) for m in CV_TYPES[ext][1]) or len(data) < 200:
        return _fail(request, 400, "Please attach your CV as a PDF or Word file")
    CV_DIR.mkdir(parents=True, exist_ok=True)
    fid = f"{uuid.uuid4().hex}{ext}"
    (CV_DIR / fid).write_bytes(data)
    now = _now()
    cv_doc = {"file": fid, "name": re.sub(r"[^\w .()-]+", "", Path(cv.filename).name)[:120] or f"CV{ext}", "size": len(data), "type": ext[1:]}
    fields = {"name": name, "email": email, "phone": phone, "city": re.sub(r"\s+", " ", city).strip()[:60], "link": link,
              "experience": experience, "cv": cv_doc, "updated_at": now}
    note = re.sub(r"\r\n?", "\n", note).strip()[:3000]
    # the same person applying again for the same job while it's still new: refresh it rather than duplicate
    prev = await db.job_applications.find_one({"email": email, "job_id": job["id"] if job else None, "status": "new"}, {"_id": 0})
    if prev:
        old = (prev.get("cv") or {}).get("file")
        upd = {**fields, **({"note": note} if note else {})}
        await db.job_applications.update_one({"id": prev["id"]}, {"$set": upd, "$push": {"notes": {"id": str(uuid.uuid4()), "at": now, "by": None,
                                                                                                    "by_name": "", "text": "Applied again from the website", "kind": "status"}}})
        if old and old != fid:
            try:
                (CV_DIR / old).unlink()
            except OSError:
                pass
    else:
        await db.job_applications.insert_one({
            "id": str(uuid.uuid4()), "job_id": job["id"] if job else None, "job_title": job["title"] if job else "General application",
            "branch_id": (job or {}).get("branch_id"), **fields, "note": note, "status": "new", "rating": 0, "notes": [],
            "source": "website", "page": page[:200], "consent": True, "created_at": now,
            "ip_hash": hashlib.sha256(f"dd:{ip}".encode()).hexdigest()[:16] if ip else ""})
    if request.headers.get("x-requested-with") == "fetch":
        return done
    return RedirectResponse("/careers/applied/", status_code=303)


# ---------------------------------------------------------------- website export, first run, housekeeping
async def jobs_for_site() -> list:
    """Open jobs as the website build reads them (newest first)."""
    branches = await _branch_names()
    out = []
    for j in await db.job_posts.find({"status": "open"}, {"_id": 0}).sort("opened_at", -1).to_list(200):
        if not is_live(j):
            continue
        b = branches.get(j.get("branch_id")) or {}
        out.append({
            "id": j["id"], "slug": j["slug"], "title": j["title"], "department": j.get("department", ""), "summary": j.get("summary", ""),
            "description": j.get("description", ""), "skills": j.get("skills") or [], "work_mode": j.get("work_mode", "onsite"),
            "work_mode_label": WORK_MODES.get(j.get("work_mode"), ""), "type": j.get("employment_type", "full_time"),
            "type_label": JOB_TYPES.get(j.get("employment_type"), ""), "experience": j.get("experience", ""), "openings": j.get("openings", 1),
            "location": j.get("location") or ", ".join(x for x in (b.get("city"), b.get("state")) if x),
            "city": b.get("city", ""), "region": b.get("state", ""), "country": b.get("country") or "India",
            "salary": {"min": j.get("salary_min"), "max": j.get("salary_max"), "currency": j.get("salary_currency", "INR"),
                       "period": j.get("salary_period", "month")} if j.get("show_salary") else None,
            "posted": (j.get("opened_at") or j.get("created_at") or "")[:10], "closes_on": j.get("closes_on"),
        })
    return out


async def seed_jobs() -> int:
    """Once: the roles that were on the old careers page become job posts, so the page doesn't change on its own."""
    if await db.migrations.find_one({"id": "jobs_seed_v34"}):
        return 0
    added = 0
    if not await db.job_posts.count_documents({}):
        try:
            seed = json.loads(SEED_FILE.read_text())
        except Exception:
            seed = []
        now = _now()
        for r in seed:
            if not r.get("title"):
                continue
            await db.job_posts.insert_one({
                "id": str(uuid.uuid4()), "slug": _slug(r["title"]), "title": r["title"], "department": r.get("department", ""),
                "branch_id": None, "location": r.get("location", ""), "work_mode": r.get("work_mode", "remote"),
                "employment_type": r.get("type", "full_time"), "experience": r.get("experience", ""), "openings": 1,
                "salary_min": None, "salary_max": None, "salary_currency": "INR", "salary_period": "month", "show_salary": False,
                "summary": r.get("summary", ""), "description": r.get("description") or r.get("summary", ""), "skills": r.get("skills") or [],
                "closes_on": None, "status": "open", "opened_at": now, "created_at": now, "updated_at": now, "created_by": None,
                "created_by_name": "From the old careers page"})
            added += 1
    await db.migrations.insert_one({"id": "jobs_seed_v34"})
    return added


async def close_expired_jobs(trigger: str = "scheduled") -> int:
    """Daily: jobs past their closing date close and come off the website."""
    rows = await db.job_posts.find({"status": "open", "closes_on": {"$nin": [None, ""], "$lt": _today()}}, {"_id": 0, "id": 1}).to_list(200)
    if rows:
        now = _now()
        await db.job_posts.update_many({"id": {"$in": [r["id"] for r in rows]}}, {"$set": {"status": "closed", "closed_at": now, "updated_at": now}})
        if await db.site_settings.find_one({"id": "website"}, {"_id": 0, "id": 1}):
            await _publish(None)
    return len(rows)


async def purge_orphan_cvs(trigger: str = "scheduled") -> int:
    """Daily: CV files whose application is gone (and out of the recycle bin) are removed."""
    if not CV_DIR.is_dir():
        return 0
    keep = {(a.get("cv") or {}).get("file") for a in await db.job_applications.find({}, {"_id": 0, "cv.file": 1}).to_list(100000)}
    async for s in db.deleted_records.find({"coll": "job_applications"}, {"_id": 0, "doc.cv.file": 1}):
        keep.add(((s.get("doc") or {}).get("cv") or {}).get("file"))
    n, cutoff = 0, time.time() - 3600
    for f in CV_DIR.iterdir():
        if f.is_file() and f.name not in keep and f.stat().st_mtime < cutoff:
            try:
                f.unlink()
                n += 1
            except OSError:
                pass
    return n


async def new_application_count(user: dict) -> int:
    return await db.job_applications.count_documents({**_app_q(user), "status": "new"})
