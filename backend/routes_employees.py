import uuid
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from database import db
from models import ProfileUpdate, CourseCreate, CourseUpdate, TrainingAssign, TrainingProgressUpdate
from auth import get_current_user, require_roles, log_activity

router = APIRouter()

STAFF = ("admin", "finance", "sales", "pm")
TRAIN_MANAGE = ("admin", "pm")

PROFILE_FIELDS = {"_id": 0, "password_hash": 0}


def _now():
    return datetime.now(timezone.utc).isoformat()


# ---------- Directory & Profiles ----------
@router.get("/employees")
async def directory(
    role: Optional[str] = None,
    city: Optional[str] = None,
    search: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    q = {}
    if role:
        q["role"] = role
    if city:
        q["city"] = city
    if search:
        q["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"designation": {"$regex": search, "$options": "i"}},
            {"skills": {"$regex": search, "$options": "i"}},
        ]
    users = await db.users.find(q, PROFILE_FIELDS).sort("name", 1).to_list(500)
    return users


@router.get("/employees/{user_id}")
async def employee_profile(user_id: str, user: dict = Depends(get_current_user)):
    if user["role"] == "employee" and user["id"] != user_id:
        raise HTTPException(status_code=403, detail="You can only view your own profile")
    target = await db.users.find_one({"id": user_id}, PROFILE_FIELDS)
    if not target:
        raise HTTPException(status_code=404, detail="Employee not found")

    projects = await db.projects.find(
        {"team_member_ids": user_id},
        {"_id": 0, "id": 1, "name": 1, "status": 1, "budget": 1, "client_id": 1,
         "start_date": 1, "end_date": 1, "milestones": 1, "deliverables": 1},
    ).to_list(200)
    cids = list({p["client_id"] for p in projects})
    crows = await db.clients.find({"id": {"$in": cids}}, {"_id": 0, "id": 1, "name": 1}).to_list(100)
    cmap = {c["id"]: c["name"] for c in crows}
    dl_done = dl_total = 0
    for p in projects:
        p["client_name"] = cmap.get(p["client_id"], "")
        dls = p.pop("deliverables", []) or []
        p.pop("milestones", None)
        dl_done += sum(1 for x in dls if x.get("done"))
        dl_total += len(dls)

    assignments = await db.training_assignments.find({"user_id": user_id}, {"_id": 0}).to_list(100)
    course_ids = [a["course_id"] for a in assignments]
    courses = await db.training_courses.find({"id": {"$in": course_ids}}, {"_id": 0}).to_list(100)
    course_map = {c["id"]: c for c in courses}
    for a in assignments:
        a["course"] = course_map.get(a["course_id"])
    completed = sum(1 for a in assignments if a.get("status") == "completed")

    assets = await db.assets.find(
        {"assigned_to": user_id, "status": {"$ne": "retired"}},
        {"_id": 0, "id": 1, "code": 1, "name": 1, "asset_type": 1, "status": 1, "serial_no": 1, "assignment_history": 1},
    ).sort("code", 1).to_list(100)
    for a in assets:
        hist = a.pop("assignment_history", []) or []
        cur = next((h for h in reversed(hist) if h.get("assigned_to") == user_id and h.get("to_date") is None), None)
        a["since"] = cur.get("from_date") if cur else None

    active = sum(1 for p in projects if p["status"] in ("kickoff", "in_progress", "review"))
    return {
        "user": target,
        "projects": projects,
        "training": assignments,
        "assets": assets,
        "performance": {
            "projects_total": len(projects),
            "projects_active": active,
            "total_budget": sum(p.get("budget", 0) for p in projects),
            "deliverables_done": dl_done,
            "deliverables_total": dl_total,
            "training_completed": completed,
            "training_total": len(assignments),
        },
    }


@router.put("/employees/{user_id}/profile")
async def update_profile(user_id: str, body: ProfileUpdate, user: dict = Depends(get_current_user)):
    if user["role"] != "admin" and user["id"] != user_id:
        raise HTTPException(status_code=403, detail="Only admins can edit other profiles")
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="Employee not found")
    updates = {k: v for k, v in body.dict().items() if v is not None}
    if user["role"] != "admin":
        updates.pop("name", None)  # only admin renames
    if updates:
        await db.users.update_one({"id": user_id}, {"$set": updates})
    await log_activity(user, "profile_updated", "user", user_id, target["name"])
    return await db.users.find_one({"id": user_id}, PROFILE_FIELDS)


# ---------- Training Courses ----------
@router.get("/training/courses")
async def list_courses(user: dict = Depends(get_current_user)):
    return await db.training_courses.find({}, {"_id": 0}).sort("title", 1).to_list(200)


@router.post("/training/courses")
async def create_course(body: CourseCreate, user: dict = Depends(require_roles(*TRAIN_MANAGE))):
    doc = {"id": str(uuid.uuid4()), **body.dict(), "created_at": _now(), "created_by": user["id"]}
    await db.training_courses.insert_one(dict(doc))
    await log_activity(user, "course_created", "training_course", doc["id"], doc["title"])
    doc.pop("_id", None)
    return doc


@router.put("/training/courses/{course_id}")
async def update_course(course_id: str, body: CourseUpdate, user: dict = Depends(require_roles(*TRAIN_MANAGE))):
    course = await db.training_courses.find_one({"id": course_id})
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    updates = {k: v for k, v in body.dict().items() if v is not None}
    if updates:
        await db.training_courses.update_one({"id": course_id}, {"$set": updates})
    await log_activity(user, "course_updated", "training_course", course_id, course["title"])
    return await db.training_courses.find_one({"id": course_id}, {"_id": 0})


@router.delete("/training/courses/{course_id}")
async def delete_course(course_id: str, user: dict = Depends(require_roles(*TRAIN_MANAGE))):
    course = await db.training_courses.find_one({"id": course_id})
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    await db.training_courses.delete_one({"id": course_id})
    await db.training_assignments.delete_many({"course_id": course_id})
    await log_activity(user, "course_deleted", "training_course", course_id, course["title"])
    return {"ok": True}


# ---------- Training Assignments ----------
@router.get("/training/assignments")
async def list_assignments(user_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    if user["role"] == "employee":
        user_id = user["id"]
    q = {"user_id": user_id} if user_id else {}
    assignments = await db.training_assignments.find(q, {"_id": 0}).sort("assigned_at", -1).to_list(500)
    course_ids = list({a["course_id"] for a in assignments})
    user_ids = list({a["user_id"] for a in assignments})
    courses = await db.training_courses.find({"id": {"$in": course_ids}}, {"_id": 0}).to_list(200)
    users = await db.users.find({"id": {"$in": user_ids}}, {"_id": 0, "id": 1, "name": 1}).to_list(200)
    cmap = {c["id"]: c for c in courses}
    umap = {u["id"]: u["name"] for u in users}
    for a in assignments:
        a["course"] = cmap.get(a["course_id"])
        a["user_name"] = umap.get(a["user_id"], "")
    return assignments


@router.post("/training/assignments")
async def assign_training(body: TrainingAssign, user: dict = Depends(require_roles(*TRAIN_MANAGE))):
    target = await db.users.find_one({"id": body.user_id})
    course = await db.training_courses.find_one({"id": body.course_id})
    if not target or not course:
        raise HTTPException(status_code=404, detail="User or course not found")
    existing = await db.training_assignments.find_one({"user_id": body.user_id, "course_id": body.course_id})
    if existing:
        raise HTTPException(status_code=400, detail=f"{target['name']} is already assigned this course")
    doc = {
        "id": str(uuid.uuid4()), "user_id": body.user_id, "course_id": body.course_id,
        "status": "assigned", "progress": 0, "due_date": body.due_date,
        "assigned_by": user["id"], "assigned_at": _now(), "completed_at": None,
    }
    await db.training_assignments.insert_one(dict(doc))
    await log_activity(user, "training_assigned", "training", doc["id"], f"{course['title']} → {target['name']}")
    doc.pop("_id", None)
    return doc


@router.put("/training/assignments/{assignment_id}")
async def update_assignment(assignment_id: str, body: TrainingProgressUpdate, user: dict = Depends(get_current_user)):
    a = await db.training_assignments.find_one({"id": assignment_id})
    if not a:
        raise HTTPException(status_code=404, detail="Assignment not found")
    if user["role"] not in TRAIN_MANAGE and user["id"] != a["user_id"]:
        raise HTTPException(status_code=403, detail="You can only update your own training")
    updates = {}
    if body.progress is not None:
        updates["progress"] = max(0, min(100, body.progress))
    if body.status is not None:
        if body.status not in ("assigned", "in_progress", "completed"):
            raise HTTPException(status_code=400, detail="Invalid status")
        updates["status"] = body.status
    prog = updates.get("progress", a.get("progress", 0))
    status = updates.get("status", a.get("status"))
    if prog >= 100 or status == "completed":
        updates["status"] = "completed"
        updates["progress"] = 100
        updates["completed_at"] = a.get("completed_at") or _now()
    elif prog > 0 and status == "assigned":
        updates["status"] = "in_progress"
    if updates:
        await db.training_assignments.update_one({"id": assignment_id}, {"$set": updates})
    course = await db.training_courses.find_one({"id": a["course_id"]}, {"_id": 0, "title": 1})
    await log_activity(user, "training_progress_updated", "training", assignment_id, course["title"] if course else "")
    return await db.training_assignments.find_one({"id": assignment_id}, {"_id": 0})


@router.delete("/training/assignments/{assignment_id}")
async def delete_assignment(assignment_id: str, user: dict = Depends(require_roles(*TRAIN_MANAGE))):
    a = await db.training_assignments.find_one({"id": assignment_id})
    if not a:
        raise HTTPException(status_code=404, detail="Assignment not found")
    await db.training_assignments.delete_one({"id": assignment_id})
    await log_activity(user, "training_unassigned", "training", assignment_id)
    return {"ok": True}
