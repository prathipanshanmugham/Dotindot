"""v3.0 Support desk — one ticket system for two audiences.

  • Client support: clients raise tickets from the client portal (/api/portal/tickets…); the team answers from the
    desk. Internal notes on a client ticket are never shown in the portal.
  • Internal support: any team member raises a request (IT & access, HR & payroll, finance, admin…) and follows it
    under "My requests". The desk routes each category to an owner.

Permissions: everyone can raise and follow their own internal requests. `support` = see the whole desk,
`support.manage` = assign / change status / settings, `support.delete` = delete tickets (recycle bin).
"""
import re
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException
from pymongo import ReturnDocument
from database import db
from auth import get_current_user, log_activity
from permissions import has_permission

router = APIRouter()

CLIENT_CATEGORIES = {
    "website": "Website & technical", "campaigns": "Campaigns & ads", "social": "Social media",
    "billing": "Billing & invoices", "reports": "Reports & data", "access": "Account & access", "other": "Something else",
}
INTERNAL_CATEGORIES = {
    "it": "IT & access", "tools": "Tools & software", "hr": "HR & payroll", "finance": "Finance & expenses",
    "admin": "Admin & facilities", "other": "Something else",
}
PRIORITIES = {"low": "Low", "normal": "Normal", "high": "High", "urgent": "Urgent"}
STATUSES = {"open": "Open", "in_progress": "In progress", "waiting": "Waiting on requester", "resolved": "Resolved", "closed": "Closed"}
OPEN_STATUSES = ("open", "in_progress", "waiting")
DEFAULT_SLA = {"urgent": 4, "high": 8, "normal": 24, "low": 72}  # hours to resolve


def _now():
    return datetime.now(timezone.utc)


def _iso(d=None):
    return (d or _now()).isoformat()


async def support_settings() -> dict:
    doc = await db.settings.find_one({"id": "support"}, {"_id": 0}) or {}
    return {"sla_hours": {**DEFAULT_SLA, **(doc.get("sla_hours") or {})}, "routing": doc.get("routing") or {}}


async def _next_number() -> str:
    c = await db.counters.find_one_and_update({"id": "tickets"}, {"$inc": {"seq": 1}}, upsert=True, return_document=ReturnDocument.AFTER)
    return f"TKT-{1000 + int(c['seq'])}"


def _is_desk(user):
    return has_permission(user, "support")


def _can_manage(user):
    return has_permission(user, "support.manage")


async def _user_name(uid):
    if not uid:
        return ""
    u = await db.users.find_one({"id": uid}, {"_id": 0, "name": 1})
    return (u or {}).get("name", "")


def _overdue(t, now_iso=None):
    return bool(t.get("due_at")) and t.get("status") in OPEN_STATUSES and t["due_at"] < (now_iso or _iso())


def _view(t: dict, audience: str = "team") -> dict:
    """audience: team (desk) | requester (staff who raised it, not desk) | portal (client)."""
    out = {k: v for k, v in t.items() if k != "_id"}
    msgs = t.get("messages") or []
    if audience != "team":
        msgs = [m for m in msgs if not m.get("internal")]
        out.pop("unread_for_team", None)
    out["messages"] = msgs
    out["overdue"] = _overdue(t)
    out["status_label"] = STATUSES.get(t.get("status"), t.get("status"))
    cats = CLIENT_CATEGORIES if t.get("kind") == "client" else INTERNAL_CATEGORIES
    out["category_label"] = cats.get(t.get("category"), t.get("category") or "")
    out["message_count"] = len(msgs)
    return out


def _summary_row(t: dict) -> dict:
    v = _view(t)
    v.pop("messages", None)
    last = (t.get("messages") or [{}])[-1]
    v["last_message"] = {"author_name": last.get("author_name"), "at": last.get("at"), "internal": last.get("internal", False),
                         "preview": (last.get("body") or "")[:140]}
    return v


# ------------------------------------------------------------------ models
class TicketIn(BaseModel):
    subject: str
    body: str
    category: str = "other"
    priority: str = "normal"
    kind: str = "internal"            # internal | client (desk can log a client ticket on their behalf)
    client_id: Optional[str] = None


class TicketUpdate(BaseModel):
    status: Optional[str] = None
    priority: Optional[str] = None
    assignee_id: Optional[str] = None
    category: Optional[str] = None


class MessageIn(BaseModel):
    body: str
    internal: bool = False
    status: Optional[str] = None      # optional status change in the same step (e.g. reply + mark waiting)


class RateIn(BaseModel):
    score: int
    comment: Optional[str] = ""


class SettingsIn(BaseModel):
    sla_hours: Optional[Dict[str, float]] = None
    routing: Optional[Dict[str, Optional[str]]] = None


def _validate(kind, category, priority):
    cats = CLIENT_CATEGORIES if kind == "client" else INTERNAL_CATEGORIES
    if category not in cats:
        raise HTTPException(status_code=400, detail="Pick a category")
    if priority not in PRIORITIES:
        raise HTTPException(status_code=400, detail="Invalid priority")


async def _create(kind: str, subject: str, body: str, category: str, priority: str, raised_by: dict,
                  client_id: Optional[str] = None, actor: Optional[dict] = None) -> dict:
    subject, body = (subject or "").strip(), (body or "").strip()
    if len(subject) < 3:
        raise HTTPException(status_code=400, detail="Give the ticket a short subject")
    if not body:
        raise HTTPException(status_code=400, detail="Describe what you need help with")
    _validate(kind, category, priority)
    cfg = await support_settings()
    client = None
    assignee = None
    if kind == "client":
        client = await db.clients.find_one({"id": client_id}, {"_id": 0, "id": 1, "name": 1, "account_manager_id": 1})
        if not client:
            raise HTTPException(status_code=404, detail="Client not found")
        assignee = cfg["routing"].get(f"client:{category}") or client.get("account_manager_id")
    else:
        assignee = cfg["routing"].get(f"internal:{category}")
    now = _now()
    t = {
        "id": str(uuid.uuid4()), "number": await _next_number(), "kind": kind,
        "client_id": client["id"] if client else None, "client_name": client["name"] if client else "",
        "subject": subject[:160], "category": category, "priority": priority, "status": "open",
        "assignee_id": assignee, "assignee_name": await _user_name(assignee),
        "raised_by": raised_by,
        "messages": [{"id": str(uuid.uuid4()), "author_type": raised_by["type"], "author_id": raised_by["id"],
                      "author_name": raised_by["name"], "body": body[:8000], "internal": False, "at": _iso(now)}],
        "due_at": _iso(now + timedelta(hours=float(cfg["sla_hours"].get(priority, 24)))),
        "first_response_at": None, "resolved_at": None, "closed_at": None, "rating": None,
        "unread_for_team": True, "unread_for_requester": False,
        "created_at": _iso(now), "updated_at": _iso(now), "last_activity_at": _iso(now),
    }
    if actor and raised_by["type"] == "user" and kind == "client":
        t["messages"][0]["author_name"] = f"{raised_by['name']} (logged for {client['name']})"
    await db.tickets.insert_one(dict(t))
    who = actor or {"id": raised_by["id"], "name": raised_by["name"], "email": raised_by.get("email"), "role": "client" if raised_by["type"] == "portal" else None}
    await log_activity(who, "ticket_created", "ticket", t["id"], f"{t['number']} · {t['subject']}")
    return t


async def _add_message(t: dict, author: dict, body: str, internal: bool, from_team: bool, status: Optional[str] = None) -> dict:
    body = (body or "").strip()
    if not body:
        raise HTTPException(status_code=400, detail="Write a message first")
    if t.get("status") == "closed" and not from_team:
        raise HTTPException(status_code=400, detail="This ticket is closed — open a new one if you still need help")
    now = _iso()
    msg = {"id": str(uuid.uuid4()), "author_type": author["type"], "author_id": author["id"], "author_name": author["name"],
           "body": body[:8000], "internal": bool(internal and from_team), "at": now}
    sets = {"updated_at": now, "last_activity_at": now}
    if from_team and not msg["internal"]:
        sets["unread_for_requester"] = True
        sets["unread_for_team"] = False
        if not t.get("first_response_at"):
            sets["first_response_at"] = now
        if t.get("status") == "open":
            sets["status"] = "in_progress"
    elif not from_team:
        sets["unread_for_team"] = True
        if t.get("status") in ("waiting", "resolved"):
            sets["status"] = "open"  # requester replied → back to the team
            sets["resolved_at"] = None
    if status and from_team:
        if status not in STATUSES:
            raise HTTPException(status_code=400, detail="Invalid status")
        sets["status"] = status
        if status == "resolved":
            sets["resolved_at"] = now
        if status == "closed":
            sets["closed_at"] = now
    await db.tickets.update_one({"id": t["id"]}, {"$push": {"messages": msg}, "$set": sets})
    return await db.tickets.find_one({"id": t["id"]}, {"_id": 0})


# ------------------------------------------------------------------ staff side
async def _load_for_user(tid: str, user: dict):
    t = await db.tickets.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Ticket not found")
    rb = t.get("raised_by") or {}
    mine = rb.get("type") == "user" and rb.get("id") == user["id"]
    assigned = t.get("assignee_id") == user["id"]
    if not (_is_desk(user) or mine or assigned):
        raise HTTPException(status_code=403, detail="You can only open your own requests")
    return t, ("team" if (_is_desk(user) or assigned) else "requester")


@router.get("/support/meta")
async def meta(user: dict = Depends(get_current_user)):
    cfg = await support_settings()
    team = await db.users.find({"is_active": {"$ne": False}, "deleted": {"$ne": True}}, {"_id": 0, "id": 1, "name": 1, "role": 1}).sort("name", 1).to_list(500)
    return {
        "client_categories": [{"value": k, "label": v} for k, v in CLIENT_CATEGORIES.items()],
        "internal_categories": [{"value": k, "label": v} for k, v in INTERNAL_CATEGORIES.items()],
        "priorities": [{"value": k, "label": v} for k, v in PRIORITIES.items()],
        "statuses": [{"value": k, "label": v} for k, v in STATUSES.items()],
        "sla_hours": cfg["sla_hours"], "routing": cfg["routing"] if _can_manage(user) else {},
        "is_desk": _is_desk(user), "can_manage": _can_manage(user), "can_delete": has_permission(user, "support.delete"),
        "team": team if _is_desk(user) else [],
    }


@router.get("/support/tickets")
async def list_tickets(kind: Optional[str] = None, status: Optional[str] = None, priority: Optional[str] = None,
                       assignee: Optional[str] = None, client_id: Optional[str] = None, q: Optional[str] = None,
                       scope: str = "desk", user: dict = Depends(get_current_user)):
    """scope: desk (everything — needs `support`) | mine (raised by me) | assigned (assigned to me)."""
    query: dict = {}
    if scope == "mine":
        query["raised_by.type"], query["raised_by.id"] = "user", user["id"]
    elif scope == "assigned":
        query["assignee_id"] = user["id"]
    else:
        if not _is_desk(user):
            raise HTTPException(status_code=403, detail="The support desk needs the Support permission")
    if kind in ("client", "internal"):
        query["kind"] = kind
    if status == "active":
        query["status"] = {"$in": list(OPEN_STATUSES)}
    elif status in STATUSES:
        query["status"] = status
    if priority in PRIORITIES:
        query["priority"] = priority
    if scope not in ("mine", "assigned"):  # the assignee filter is a desk tool — never widens "mine" / "assigned"
        if assignee == "none":
            query["assignee_id"] = None
        elif assignee:
            query["assignee_id"] = assignee
    if client_id:
        query["client_id"] = client_id
    if q:
        rx = {"$regex": re.escape(q[:100]), "$options": "i"}
        query["$or"] = [{"subject": rx}, {"number": rx}, {"client_name": rx}, {"raised_by.name": rx}]
    rows = await db.tickets.find(query, {"_id": 0}).sort("last_activity_at", -1).to_list(500)
    out = [_summary_row(t) for t in rows]
    if scope == "mine" and not _is_desk(user):
        for r in out:
            if r["last_message"].get("internal"):
                r["last_message"] = {"author_name": "", "at": r.get("updated_at"), "internal": False, "preview": ""}
    return out


@router.get("/support/summary")
async def summary(user: dict = Depends(get_current_user)):
    now = _iso()
    mine_open = await db.tickets.count_documents({"raised_by.type": "user", "raised_by.id": user["id"], "status": {"$in": list(OPEN_STATUSES)}})
    out = {"my_open": mine_open, "assigned_open": await db.tickets.count_documents({"assignee_id": user["id"], "status": {"$in": list(OPEN_STATUSES)}})}
    if _is_desk(user):
        rows = await db.tickets.find({"status": {"$in": list(OPEN_STATUSES)}}, {"_id": 0, "kind": 1, "assignee_id": 1, "due_at": 1, "status": 1, "priority": 1}).to_list(5000)
        for kind in ("client", "internal"):
            k = [t for t in rows if t["kind"] == kind]
            out[kind] = {"open": len(k), "unassigned": sum(1 for t in k if not t.get("assignee_id")),
                         "overdue": sum(1 for t in k if _overdue(t, now)), "urgent": sum(1 for t in k if t.get("priority") == "urgent")}
        resolved = await db.tickets.find({"resolved_at": {"$ne": None}}, {"_id": 0, "created_at": 1, "resolved_at": 1, "rating": 1}).sort("resolved_at", -1).to_list(200)
        hrs = [(datetime.fromisoformat(t["resolved_at"]) - datetime.fromisoformat(t["created_at"])).total_seconds() / 3600 for t in resolved]
        scores = [t["rating"]["score"] for t in resolved if t.get("rating")]
        out["avg_resolution_hours"] = round(sum(hrs) / len(hrs), 1) if hrs else None
        out["csat"] = round(sum(scores) / len(scores), 1) if scores else None
        out["ratings"] = len(scores)
    return out


@router.post("/support/tickets")
async def create_ticket(body: TicketIn, user: dict = Depends(get_current_user)):
    kind = body.kind if body.kind in ("client", "internal") else "internal"
    if kind == "client" and not _is_desk(user):
        raise HTTPException(status_code=403, detail="Only the support desk can log a ticket for a client")
    t = await _create(kind, body.subject, body.body, body.category, body.priority,
                      {"type": "user", "id": user["id"], "name": user["name"], "email": user.get("email", "")},
                      client_id=body.client_id, actor=user)
    return _view(t)


@router.get("/support/tickets/{tid}")
async def get_ticket(tid: str, user: dict = Depends(get_current_user)):
    t, audience = await _load_for_user(tid, user)
    rb = t.get("raised_by") or {}
    if rb.get("type") == "user" and rb.get("id") == user["id"] and t.get("unread_for_requester"):
        await db.tickets.update_one({"id": tid}, {"$set": {"unread_for_requester": False}})
        t["unread_for_requester"] = False
    elif audience == "team" and t.get("unread_for_team") and t.get("assignee_id") == user["id"]:
        await db.tickets.update_one({"id": tid}, {"$set": {"unread_for_team": False}})
    v = _view(t, audience)
    v["can_manage"] = _can_manage(user) or t.get("assignee_id") == user["id"]
    v["audience"] = audience
    return v


@router.post("/support/tickets/{tid}/messages")
async def reply(tid: str, body: MessageIn, user: dict = Depends(get_current_user)):
    t, audience = await _load_for_user(tid, user)
    rb = t.get("raised_by") or {}
    is_requester = rb.get("type") == "user" and rb.get("id") == user["id"]
    # On an internal request the requester talks as the requester; desk members / assignee talk as the team.
    from_team = audience == "team" and not (is_requester and t["kind"] == "internal" and not _is_desk(user))
    if body.status and not (_can_manage(user) or t.get("assignee_id") == user["id"]):
        raise HTTPException(status_code=403, detail="Only the assignee or a support manager can change the status")
    updated = await _add_message(t, {"type": "user", "id": user["id"], "name": user["name"]}, body.body, body.internal, from_team, body.status)
    await log_activity(user, "ticket_note" if body.internal else "ticket_replied", "ticket", tid, f"{t['number']} · {t['subject']}")
    v = _view(updated, audience)
    v["can_manage"] = _can_manage(user) or updated.get("assignee_id") == user["id"]
    v["audience"] = audience
    return v


@router.put("/support/tickets/{tid}")
async def update_ticket(tid: str, body: TicketUpdate, user: dict = Depends(get_current_user)):
    t = await db.tickets.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Ticket not found")
    rb = t.get("raised_by") or {}
    is_requester = rb.get("type") == "user" and rb.get("id") == user["id"]
    manage = _can_manage(user) or t.get("assignee_id") == user["id"]
    # A requester may only close / re-open their own internal request.
    if not manage:
        if not (is_requester and body.status in ("closed", "open") and body.assignee_id is None and body.priority is None and body.category is None):
            raise HTTPException(status_code=403, detail="Only the assignee or a support manager can change this ticket")
    sets, notes = {}, []
    now = _iso()
    if body.status is not None:
        if body.status not in STATUSES:
            raise HTTPException(status_code=400, detail="Invalid status")
        sets["status"] = body.status
        if body.status == "resolved":
            sets["resolved_at"] = now
        if body.status == "closed":
            sets["closed_at"] = now
        if body.status in OPEN_STATUSES:
            sets["resolved_at"] = None
            sets["closed_at"] = None
        notes.append(f"Status → {STATUSES[body.status]}")
    if body.priority is not None:
        if body.priority not in PRIORITIES:
            raise HTTPException(status_code=400, detail="Invalid priority")
        cfg = await support_settings()
        sets["priority"] = body.priority
        sets["due_at"] = (datetime.fromisoformat(t["created_at"]) + timedelta(hours=float(cfg["sla_hours"].get(body.priority, 24)))).isoformat()
        notes.append(f"Priority → {PRIORITIES[body.priority]}")
    if body.category is not None:
        _validate(t["kind"], body.category, t["priority"])
        sets["category"] = body.category
    if body.assignee_id is not None:
        aid = body.assignee_id or None
        if aid and not await db.users.find_one({"id": aid}, {"_id": 0, "id": 1}):
            raise HTTPException(status_code=400, detail="Assignee not found")
        sets["assignee_id"] = aid
        sets["assignee_name"] = await _user_name(aid)
        notes.append(f"Assigned to {sets['assignee_name'] or 'nobody'}")
    if not sets:
        return _view(t)
    sets["updated_at"] = now
    push = {"$push": {"messages": {"id": str(uuid.uuid4()), "author_type": "system", "author_id": user["id"], "author_name": user["name"],
                                   "body": " · ".join(notes), "internal": True, "at": now}}} if notes else {}
    await db.tickets.update_one({"id": tid}, {"$set": sets, **push})
    await log_activity(user, "ticket_updated", "ticket", tid, f"{t['number']} · {' · '.join(notes)}")
    out = await db.tickets.find_one({"id": tid}, {"_id": 0})
    v = _view(out, "team" if manage or _is_desk(user) else "requester")
    v["can_manage"] = manage
    return v


@router.put("/support/settings")
async def save_settings(body: SettingsIn, user: dict = Depends(get_current_user)):
    if not _can_manage(user):
        raise HTTPException(status_code=403, detail="Only support managers can change desk settings")
    sets = {}
    if body.sla_hours is not None:
        sla = {}
        for k, v in body.sla_hours.items():
            if k in PRIORITIES:
                if not (0.5 <= float(v) <= 720):
                    raise HTTPException(status_code=400, detail="SLA hours must be between 0.5 and 720")
                sla[k] = float(v)
        sets["sla_hours"] = sla
    if body.routing is not None:
        sets["routing"] = {k: v for k, v in body.routing.items() if v and (k.startswith("client:") or k.startswith("internal:"))}
    await db.settings.update_one({"id": "support"}, {"$set": {"id": "support", **sets}}, upsert=True)
    await log_activity(user, "support_settings_updated", "settings", "support", ", ".join(sets.keys()))
    return await support_settings()


async def support_alerts(user: dict) -> list:
    """Notification bell items."""
    items = []
    t_iso = _now().date().isoformat()
    mine = await db.tickets.find({"raised_by.type": "user", "raised_by.id": user["id"], "unread_for_requester": True},
                                 {"_id": 0, "id": 1, "number": 1, "subject": 1, "updated_at": 1}).to_list(20)
    for t in mine:
        items.append({"kind": "support", "title": f"Reply on {t['number']}: {t['subject']}", "sub": "The team answered your request",
                      "link": f"/support?ticket={t['id']}", "date": t["updated_at"][:10]})
    assigned = await db.tickets.find({"assignee_id": user["id"], "status": {"$in": list(OPEN_STATUSES)}, "unread_for_team": True},
                                     {"_id": 0, "id": 1, "number": 1, "subject": 1, "client_name": 1, "updated_at": 1}).to_list(30)
    for t in assigned:
        items.append({"kind": "support", "title": f"{t['number']} needs a reply", "sub": f"{t.get('client_name') or 'Internal'} · {t['subject']}",
                      "link": f"/support?ticket={t['id']}", "date": t["updated_at"][:10]})
    if _is_desk(user):
        un = await db.tickets.count_documents({"assignee_id": None, "status": {"$in": list(OPEN_STATUSES)}})
        if un:
            items.append({"kind": "support", "title": f"{un} ticket{'s' if un > 1 else ''} not assigned yet", "sub": "Pick an owner on the support desk",
                          "link": "/support?assignee=none", "date": t_iso})
        late = await db.tickets.count_documents({"status": {"$in": list(OPEN_STATUSES)}, "due_at": {"$lt": _iso()}})
        if late:
            items.append({"kind": "support", "title": f"{late} ticket{'s' if late > 1 else ''} past their SLA", "sub": "Overdue on the support desk",
                          "link": "/support?status=active", "date": t_iso})
    return items


# ------------------------------------------------------------------ client portal side
from routes_client_dashboard import get_portal_user as _portal_user  # noqa: E402


async def _portal_ticket(tid: str, pu: dict) -> dict:
    t = await db.tickets.find_one({"id": tid, "kind": "client", "client_id": pu["client_id"]}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return t


@router.get("/portal/tickets")
async def portal_list(pu: dict = Depends(_portal_user)):
    rows = await db.tickets.find({"kind": "client", "client_id": pu["client_id"]}, {"_id": 0}).sort("last_activity_at", -1).to_list(200)
    out = []
    for t in rows:
        v = _view(t, "portal")
        msgs = v.pop("messages")
        last = msgs[-1] if msgs else {}
        v["last_message"] = {"author_name": last.get("author_name"), "at": last.get("at"), "preview": (last.get("body") or "")[:140]}
        v.pop("assignee_id", None)
        out.append(v)
    return {"tickets": out, "categories": [{"value": k, "label": v} for k, v in CLIENT_CATEGORIES.items()],
            "priorities": [{"value": k, "label": v} for k, v in PRIORITIES.items()]}


@router.post("/portal/tickets")
async def portal_create(body: TicketIn, pu: dict = Depends(_portal_user)):
    t = await _create("client", body.subject, body.body, body.category, body.priority if body.priority in ("low", "normal", "high") else "normal",
                      {"type": "portal", "id": pu["id"], "name": pu["name"], "email": pu.get("email", "")}, client_id=pu["client_id"])
    v = _view(t, "portal")
    v.pop("assignee_id", None)
    return v


@router.get("/portal/tickets/{tid}")
async def portal_get(tid: str, pu: dict = Depends(_portal_user)):
    t = await _portal_ticket(tid, pu)
    if t.get("unread_for_requester"):
        await db.tickets.update_one({"id": tid}, {"$set": {"unread_for_requester": False}})
    v = _view(t, "portal")
    v.pop("assignee_id", None)
    return v


@router.post("/portal/tickets/{tid}/messages")
async def portal_reply(tid: str, body: MessageIn, pu: dict = Depends(_portal_user)):
    t = await _portal_ticket(tid, pu)
    updated = await _add_message(t, {"type": "portal", "id": pu["id"], "name": pu["name"]}, body.body, False, from_team=False)
    await log_activity({"id": pu["id"], "name": pu["name"], "email": pu.get("email"), "role": "client"}, "ticket_replied", "ticket", tid, t["number"])
    v = _view(updated, "portal")
    v.pop("assignee_id", None)
    return v


@router.post("/portal/tickets/{tid}/resolve")
async def portal_resolve(tid: str, pu: dict = Depends(_portal_user)):
    t = await _portal_ticket(tid, pu)
    now = _iso()
    await db.tickets.update_one({"id": tid}, {"$set": {"status": "resolved", "resolved_at": now, "updated_at": now, "unread_for_team": True},
                                             "$push": {"messages": {"id": str(uuid.uuid4()), "author_type": "system", "author_id": pu["id"],
                                                                    "author_name": pu["name"], "body": "Marked as solved by the client", "internal": False, "at": now}}})
    v = _view(await db.tickets.find_one({"id": tid}, {"_id": 0}), "portal")
    v.pop("assignee_id", None)
    return v


@router.post("/portal/tickets/{tid}/rate")
async def portal_rate(tid: str, body: RateIn, pu: dict = Depends(_portal_user)):
    t = await _portal_ticket(tid, pu)
    if t.get("status") not in ("resolved", "closed"):
        raise HTTPException(status_code=400, detail="You can rate a ticket once it's solved")
    if not 1 <= body.score <= 5:
        raise HTTPException(status_code=400, detail="Rate from 1 to 5")
    await db.tickets.update_one({"id": tid}, {"$set": {"rating": {"score": body.score, "comment": (body.comment or "")[:1000], "at": _iso()}}})
    v = _view(await db.tickets.find_one({"id": tid}, {"_id": 0}), "portal")
    v.pop("assignee_id", None)
    return v
