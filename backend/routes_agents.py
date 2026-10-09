"""v2.6 AI Agents — registry of the AI assistants & automations the agency runs.

- Who can see what: `ai_agents` sees agents assigned to them (or open to everyone);
  `ai_agents.manage` sees and edits all of them, assigns people/clients/projects.
- Usage log: anyone who can use an agent logs a run (task, minutes saved, outcome, rating), which drives
  hours-saved, cost-per-hour-saved and idle-agent signals.
- Deletes go through the generic records pipeline (ai_agents.delete) so they land in the 24h recycle bin.
"""
import uuid
from datetime import datetime, timezone, timedelta, date
from typing import List, Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, Query
from database import db
from auth import get_current_user, log_activity
from permissions import has_permission

router = APIRouter()

PLATFORMS = ["chatgpt", "claude", "gemini", "perplexity", "copilot", "midjourney", "custom_gpt", "n8n", "make", "zapier", "other"]
AGENT_TYPES = ["assistant", "content", "design", "research", "code", "analytics", "automation", "support"]
STATUSES = ["active", "testing", "paused", "retired"]
IDLE_DAYS = 14


def _now():
    return datetime.now(timezone.utc).isoformat()


def _new_id():
    return str(uuid.uuid4())


class Prompt(BaseModel):
    id: str = Field(default_factory=_new_id)
    title: str
    prompt: str
    when_to_use: Optional[str] = ""


class AgentIn(BaseModel):
    name: str
    platform: str = "chatgpt"
    agent_type: str = "assistant"
    status: str = "active"
    purpose: Optional[str] = ""
    access_url: Optional[str] = ""
    owner_id: Optional[str] = None
    open_to_all: bool = False
    assignee_ids: List[str] = []
    client_ids: List[str] = []
    project_ids: List[str] = []
    monthly_cost: float = 0
    currency: str = "INR"
    playbook: Optional[str] = ""
    guardrails: Optional[str] = ""
    prompts: List[Prompt] = []
    minutes_saved_per_run: float = 0


class AgentUpdate(BaseModel):
    name: Optional[str] = None
    platform: Optional[str] = None
    agent_type: Optional[str] = None
    status: Optional[str] = None
    purpose: Optional[str] = None
    access_url: Optional[str] = None
    owner_id: Optional[str] = None
    open_to_all: Optional[bool] = None
    assignee_ids: Optional[List[str]] = None
    client_ids: Optional[List[str]] = None
    project_ids: Optional[List[str]] = None
    monthly_cost: Optional[float] = None
    playbook: Optional[str] = None
    guardrails: Optional[str] = None
    prompts: Optional[List[Prompt]] = None
    minutes_saved_per_run: Optional[float] = None


class UsageIn(BaseModel):
    date: Optional[str] = None
    task: str
    client_id: Optional[str] = None
    project_id: Optional[str] = None
    minutes_saved: float = 0
    outcome: str = "success"  # success | partial | failed
    rating: Optional[int] = None  # 1-5
    note: Optional[str] = ""


def _can_manage(user):
    return has_permission(user, "ai_agents.manage")


def _visible(agent: dict, user: dict) -> bool:
    if _can_manage(user):
        return True
    return agent.get("open_to_all") or user["id"] in (agent.get("assignee_ids") or []) or agent.get("owner_id") == user["id"]


async def _lookups():
    users = {u["id"]: u for u in await db.users.find({}, {"_id": 0, "id": 1, "name": 1, "role": 1, "email": 1}).to_list(1000)}
    clients = {c["id"]: c["name"] for c in await db.clients.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(3000)}
    projects = {p["id"]: p["name"] for p in await db.projects.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(3000)}
    return users, clients, projects


def _usage_stats(rows, since_iso):
    recent = [r for r in rows if (r.get("date") or "") >= since_iso[:10]]
    minutes = sum(float(r.get("minutes_saved") or 0) for r in recent)
    ratings = [r["rating"] for r in recent if r.get("rating")]
    last = max((r.get("date") or "" for r in rows), default=None)
    return {
        "runs_30d": len(recent),
        "minutes_saved_30d": round(minutes, 1),
        "hours_saved_30d": round(minutes / 60, 1),
        "avg_rating_30d": round(sum(ratings) / len(ratings), 1) if ratings else None,
        "success_rate_30d": round(100 * sum(1 for r in recent if r.get("outcome") == "success") / len(recent)) if recent else None,
        "last_used_at": last or None,
        "users_30d": len({r.get("user_id") for r in recent}),
    }


def _enrich(a: dict, usage_rows, users, clients, projects) -> dict:
    since = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    stats = _usage_stats(usage_rows, since)
    last = stats["last_used_at"]
    idle_days = None
    if last:
        try:
            idle_days = (date.today() - date.fromisoformat(last[:10])).days
        except ValueError:
            idle_days = None
    a["stats"] = stats
    a["idle"] = a.get("status") == "active" and (idle_days is None or idle_days >= IDLE_DAYS)
    a["idle_days"] = idle_days
    hours = stats["hours_saved_30d"]
    a["cost_per_hour_saved"] = round(a.get("monthly_cost", 0) / hours) if hours else None
    a["owner_name"] = users.get(a.get("owner_id"), {}).get("name") if a.get("owner_id") else None
    a["assignees"] = [{"id": uid, "name": users[uid]["name"], "role": users[uid].get("role")}
                      for uid in (a.get("assignee_ids") or []) if uid in users]
    a["clients"] = [{"id": cid, "name": clients[cid]} for cid in (a.get("client_ids") or []) if cid in clients]
    a["projects"] = [{"id": pid, "name": projects[pid]} for pid in (a.get("project_ids") or []) if pid in projects]
    return a


async def _get_or_404(agent_id: str):
    a = await db.ai_agents.find_one({"id": agent_id}, {"_id": 0})
    if not a:
        raise HTTPException(status_code=404, detail="Agent not found")
    return a


def _validate(body: dict):
    if "platform" in body and body["platform"] and body["platform"] not in PLATFORMS:
        raise HTTPException(status_code=400, detail=f"Unknown platform. Use one of: {', '.join(PLATFORMS)}")
    if "status" in body and body["status"] and body["status"] not in STATUSES:
        raise HTTPException(status_code=400, detail=f"Unknown status. Use one of: {', '.join(STATUSES)}")
    if "agent_type" in body and body["agent_type"] and body["agent_type"] not in AGENT_TYPES:
        raise HTTPException(status_code=400, detail=f"Unknown agent type. Use one of: {', '.join(AGENT_TYPES)}")


@router.get("/agents/meta")
async def agents_meta(user: dict = Depends(get_current_user)):
    return {"platforms": PLATFORMS, "agent_types": AGENT_TYPES, "statuses": STATUSES, "idle_days": IDLE_DAYS,
            "can_manage": _can_manage(user), "can_delete": has_permission(user, "ai_agents.delete")}


@router.get("/agents")
async def list_agents(status: Optional[str] = None, platform: Optional[str] = None, assignee: Optional[str] = None,
                      search: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = {}
    if status:
        q["status"] = status
    if platform:
        q["platform"] = platform
    if assignee:
        q["assignee_ids"] = assignee
    rows = await db.ai_agents.find(q, {"_id": 0}).sort("name", 1).to_list(1000)
    rows = [a for a in rows if _visible(a, user)]
    if search:
        s = search.lower()
        rows = [a for a in rows if s in (a.get("name", "") + " " + (a.get("purpose") or "")).lower()]
    ids = [a["id"] for a in rows]
    usage = await db.ai_agent_usage.find({"agent_id": {"$in": ids}}, {"_id": 0}).to_list(20000)
    by_agent = {}
    for u in usage:
        by_agent.setdefault(u["agent_id"], []).append(u)
    users, clients, projects = await _lookups()
    return [_enrich(a, by_agent.get(a["id"], []), users, clients, projects) for a in rows]


@router.get("/agents/overview")
async def agents_overview(user: dict = Depends(get_current_user)):
    agents = [a for a in await db.ai_agents.find({}, {"_id": 0}).to_list(1000) if _visible(a, user)]
    ids = [a["id"] for a in agents]
    usage = await db.ai_agent_usage.find({"agent_id": {"$in": ids}}, {"_id": 0}).to_list(50000)
    users, clients, projects = await _lookups()
    by_agent = {}
    for u in usage:
        by_agent.setdefault(u["agent_id"], []).append(u)
    enriched = [_enrich(dict(a), by_agent.get(a["id"], []), users, clients, projects) for a in agents]
    active = [a for a in enriched if a.get("status") == "active"]
    since = (date.today() - timedelta(days=30)).isoformat()
    recent = [u for u in usage if (u.get("date") or "") >= since]
    minutes = sum(float(u.get("minutes_saved") or 0) for u in recent)
    monthly_cost = sum(a.get("monthly_cost", 0) for a in active)
    # weekly trend, last 8 weeks
    today = date.today()
    start_of_week = today - timedelta(days=today.weekday())
    weeks = []
    for i in range(7, -1, -1):
        ws = start_of_week - timedelta(weeks=i)
        we = ws + timedelta(days=7)
        rows = [u for u in usage if ws.isoformat() <= (u.get("date") or "") < we.isoformat()]
        weeks.append({"week": ws.strftime("%d %b"), "runs": len(rows),
                      "hours": round(sum(float(u.get("minutes_saved") or 0) for u in rows) / 60, 1)})
    people = {}
    for u in recent:
        p = people.setdefault(u.get("user_id"), {"user_id": u.get("user_id"), "name": u.get("user_name") or users.get(u.get("user_id"), {}).get("name", "—"), "runs": 0, "hours": 0.0})
        p["runs"] += 1
        p["hours"] += float(u.get("minutes_saved") or 0) / 60
    leaderboard = sorted(({**p, "hours": round(p["hours"], 1)} for p in people.values()), key=lambda x: -x["hours"])[:8]
    # people assigned to agents but not using them (adoption gaps)
    gaps = []
    for a in active:
        users_recent = {u.get("user_id") for u in by_agent.get(a["id"], []) if (u.get("date") or "") >= since}
        for asg in a["assignees"]:
            if asg["id"] not in users_recent:
                gaps.append({"agent_id": a["id"], "agent": a["name"], "user_id": asg["id"], "user": asg["name"]})
    by_platform = {}
    for a in active:
        by_platform[a.get("platform", "other")] = by_platform.get(a.get("platform", "other"), 0) + 1
    return {
        "total": len(enriched),
        "active": len(active),
        "monthly_cost": monthly_cost,
        "runs_30d": len(recent),
        "hours_saved_30d": round(minutes / 60, 1),
        "cost_per_hour_saved": round(monthly_cost / (minutes / 60)) if minutes else None,
        "idle": [{"id": a["id"], "name": a["name"], "idle_days": a["idle_days"], "monthly_cost": a.get("monthly_cost", 0)} for a in active if a["idle"]],
        "by_agent": sorted([{"id": a["id"], "name": a["name"], "hours": a["stats"]["hours_saved_30d"], "runs": a["stats"]["runs_30d"]} for a in enriched], key=lambda x: -x["hours"]),
        "by_platform": [{"name": k, "value": v} for k, v in sorted(by_platform.items(), key=lambda x: -x[1])],
        "weekly": weeks,
        "leaderboard": leaderboard,
        "adoption_gaps": gaps[:20],
    }


@router.get("/agents/usage")
async def list_usage(agent_id: Optional[str] = None, user_id: Optional[str] = None, limit: int = Query(200, le=1000),
                     user: dict = Depends(get_current_user)):
    agents = {a["id"]: a for a in await db.ai_agents.find({}, {"_id": 0}).to_list(1000) if _visible(a, user)}
    q = {"agent_id": {"$in": list(agents)}}
    if agent_id:
        q["agent_id"] = agent_id if agent_id in agents else "__none__"
    if user_id:
        q["user_id"] = user_id
    rows = await db.ai_agent_usage.find(q, {"_id": 0}).sort("date", -1).to_list(limit)
    _, clients, projects = await _lookups()
    for r in rows:
        r["agent_name"] = agents.get(r["agent_id"], {}).get("name")
        r["client_name"] = clients.get(r.get("client_id"))
        r["project_name"] = projects.get(r.get("project_id"))
    return rows


@router.get("/agents/{agent_id}")
async def get_agent(agent_id: str, user: dict = Depends(get_current_user)):
    a = await _get_or_404(agent_id)
    if not _visible(a, user):
        raise HTTPException(status_code=403, detail="This agent isn't assigned to you")
    usage = await db.ai_agent_usage.find({"agent_id": agent_id}, {"_id": 0}).sort("date", -1).to_list(5000)
    users, clients, projects = await _lookups()
    out = _enrich(a, usage, users, clients, projects)
    for r in usage:
        r["client_name"] = clients.get(r.get("client_id"))
        r["project_name"] = projects.get(r.get("project_id"))
    out["usage"] = usage[:200]
    out["can_edit"] = _can_manage(user)
    return out


@router.post("/agents")
async def create_agent(body: AgentIn, user: dict = Depends(get_current_user)):
    if not _can_manage(user):
        raise HTTPException(status_code=403, detail="You don't have permission to manage AI agents")
    doc = body.model_dump()
    _validate(doc)
    if not doc["name"].strip():
        raise HTTPException(status_code=400, detail="Name is required")
    doc.update({"id": _new_id(), "owner_id": doc.get("owner_id") or user["id"], "created_at": _now(),
                "updated_at": _now(), "created_by": user["id"]})
    await db.ai_agents.insert_one(dict(doc))
    await log_activity(user, "ai_agent_created", "ai_agent", doc["id"], doc["name"])
    doc.pop("_id", None)
    return doc


@router.put("/agents/{agent_id}")
async def update_agent(agent_id: str, body: AgentUpdate, user: dict = Depends(get_current_user)):
    if not _can_manage(user):
        raise HTTPException(status_code=403, detail="You don't have permission to manage AI agents")
    a = await _get_or_404(agent_id)
    updates = body.model_dump(exclude_unset=True)
    _validate(updates)
    updates["updated_at"] = _now()
    await db.ai_agents.update_one({"id": agent_id}, {"$set": updates})
    action = "ai_agent_assigned" if set(updates) & {"assignee_ids", "client_ids", "project_ids", "open_to_all"} else "ai_agent_updated"
    await log_activity(user, action, "ai_agent", agent_id, updates.get("name", a["name"]))
    return await db.ai_agents.find_one({"id": agent_id}, {"_id": 0})


@router.post("/agents/{agent_id}/usage")
async def log_usage(agent_id: str, body: UsageIn, user: dict = Depends(get_current_user)):
    a = await _get_or_404(agent_id)
    if not _visible(a, user):
        raise HTTPException(status_code=403, detail="This agent isn't assigned to you")
    if not body.task.strip():
        raise HTTPException(status_code=400, detail="Describe the task you used it for")
    if body.outcome not in ("success", "partial", "failed"):
        raise HTTPException(status_code=400, detail="Outcome must be success, partial or failed")
    if body.rating is not None and not 1 <= body.rating <= 5:
        raise HTTPException(status_code=400, detail="Rating must be 1–5")
    minutes = body.minutes_saved if body.minutes_saved else float(a.get("minutes_saved_per_run") or 0)
    doc = {"id": _new_id(), "agent_id": agent_id, "user_id": user["id"], "user_name": user.get("name"),
           **body.model_dump(), "minutes_saved": minutes,
           "date": body.date or date.today().isoformat(), "created_at": _now()}
    await db.ai_agent_usage.insert_one(dict(doc))
    await log_activity(user, "ai_agent_used", "ai_agent", agent_id, f"{a['name']} · {body.task[:60]}")
    doc.pop("_id", None)
    return doc
