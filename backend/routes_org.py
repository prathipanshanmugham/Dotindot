"""v2.6 Organisation structure — a tree of departments and roles shown as a mind map.

Each node: title, kind (company | department | team | role), parent_id, the people who hold it,
responsibilities and KPIs. `org_structure` can view; `org_structure.manage` edits/moves/adds;
`org_structure.delete` removes (snapshotted into the 24h recycle bin).
"""
import uuid
from datetime import datetime, timezone
from typing import List, Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Query
from database import db
from auth import get_current_user, log_activity
from permissions import has_permission

router = APIRouter()

KINDS = ["company", "department", "team", "role"]

ROLE_TEMPLATE = {
    "super_admin": {
        "dept": None, "title": "Founder & CEO",
        "responsibilities": ["Sets company vision, strategy and yearly goals", "Approves budgets, pricing and key hires",
                             "Owns top client relationships and partnerships", "Reviews monthly P&L and branch performance"],
        "kpis": ["Revenue growth", "Net margin", "Client retention"],
    },
    "admin": {
        "dept": "Operations", "title": "Operations Head",
        "responsibilities": ["Runs day-to-day operations across branches", "Manages user access, assets and vendors",
                             "Makes sure processes and SLAs are followed", "Unblocks teams and escalates risks to the CEO"],
        "kpis": ["On-time delivery %", "Team utilisation", "Process compliance"],
    },
    "finance": {
        "dept": "Finance", "title": "Finance Manager",
        "responsibilities": ["Maintains the ledger and monthly closing", "Approves and pays expenses",
                             "Tracks subscriptions, budgets and AI spend", "Prepares financial reports for leadership"],
        "kpis": ["Days to close books", "Budget variance", "Receivables collected"],
    },
    "sales": {
        "dept": "Sales & Business Development", "title": "Sales Executive",
        "responsibilities": ["Generates and qualifies new leads", "Sends proposals and quotes",
                             "Follows up until the deal is won or lost", "Hands won deals over to delivery"],
        "kpis": ["Monthly revenue vs target", "Win rate", "Average deal size"],
    },
    "pm": {
        "dept": "Project Management", "title": "Project Manager",
        "responsibilities": ["Plans milestones and deliverables", "Coordinates the delivery team day to day",
                             "Keeps clients updated on progress", "Tracks project budget and profitability"],
        "kpis": ["Projects delivered on time", "Client satisfaction", "Project margin"],
    },
    "employee": {
        "dept": "Creative & Delivery", "title": "Team Member",
        "responsibilities": ["Delivers assigned project work to brief", "Keeps deliverable status up to date",
                             "Completes assigned training", "Uses assigned AI agents to work faster"],
        "kpis": ["Deliverables completed", "Rework rate", "Hours saved with AI"],
    },
    "ads_manager": {
        "dept": "Performance Marketing", "title": "Ads Manager",
        "responsibilities": ["Plans and runs paid campaigns", "Optimises spend and creatives weekly",
                             "Reports ROAS and results to clients"],
        "kpis": ["ROAS", "Cost per conversion", "Spend vs budget"],
    },
    "social_manager": {
        "dept": "Social Media", "title": "Social Media Manager",
        "responsibilities": ["Plans the monthly content calendar", "Publishes and monitors posts",
                             "Manages influencer collaborations"],
        "kpis": ["Posts published on schedule", "Engagement rate", "Follower growth"],
    },
}
DEPT_ORDER = ["Operations", "Finance", "Sales & Business Development", "Project Management", "Creative & Delivery",
              "Performance Marketing", "Social Media"]


def _now():
    return datetime.now(timezone.utc).isoformat()


class NodeIn(BaseModel):
    title: str
    kind: str = "role"
    parent_id: Optional[str] = None
    person_ids: List[str] = []
    responsibilities: List[str] = []
    kpis: List[str] = []
    description: Optional[str] = ""
    color: Optional[str] = None
    order: int = 0


class NodeUpdate(BaseModel):
    title: Optional[str] = None
    kind: Optional[str] = None
    parent_id: Optional[str] = None
    person_ids: Optional[List[str]] = None
    responsibilities: Optional[List[str]] = None
    kpis: Optional[List[str]] = None
    description: Optional[str] = None
    color: Optional[str] = None
    order: Optional[int] = None


class BootstrapBody(BaseModel):
    replace: bool = False


def _need(user, key, msg):
    if not has_permission(user, key):
        raise HTTPException(status_code=403, detail=msg)


async def _people_index():
    rows = await db.users.find({"is_active": {"$ne": False}}, {"_id": 0, "id": 1, "name": 1, "role": 1, "email": 1,
                                                               "designation": 1, "department": 1, "branch_id": 1}).to_list(2000)
    return {u["id"]: u for u in rows}


@router.get("/org/nodes")
async def list_nodes(user: dict = Depends(get_current_user)):
    nodes = await db.org_nodes.find({}, {"_id": 0}).sort("order", 1).to_list(3000)
    people = await _people_index()
    placed = set()
    for n in nodes:
        n["people"] = [people[p] for p in (n.get("person_ids") or []) if p in people]
        placed.update(n.get("person_ids") or [])
    unassigned = [p for pid, p in people.items() if pid not in placed]
    return {
        "nodes": nodes,
        "unassigned": sorted(unassigned, key=lambda p: p.get("name", "")),
        "kinds": KINDS,
        "can_manage": has_permission(user, "org_structure.manage"),
        "can_delete": has_permission(user, "org_structure.delete"),
    }


@router.get("/org/person/{user_id}")
async def person_roles(user_id: str, user: dict = Depends(get_current_user)):
    nodes = await db.org_nodes.find({"person_ids": user_id}, {"_id": 0}).to_list(50)
    people = await _people_index()
    out = []
    for n in nodes:
        parent = await db.org_nodes.find_one({"id": n.get("parent_id")}, {"_id": 0}) if n.get("parent_id") else None
        reports = await db.org_nodes.find({"parent_id": n["id"]}, {"_id": 0, "id": 1, "title": 1, "person_ids": 1}).to_list(100)
        out.append({
            **n,
            "reports_to": {"id": parent["id"], "title": parent["title"],
                           "people": [people[p]["name"] for p in parent.get("person_ids", []) if p in people]} if parent else None,
            "direct_reports": [{"id": r["id"], "title": r["title"],
                                "people": [people[p]["name"] for p in r.get("person_ids", []) if p in people]} for r in reports],
        })
    return out


async def _check_parent(node_id: Optional[str], parent_id: Optional[str]):
    if not parent_id:
        return
    if not await db.org_nodes.find_one({"id": parent_id}):
        raise HTTPException(status_code=400, detail="The selected parent doesn't exist")
    if node_id is None:
        return
    # walk up from the new parent; hitting node_id means a cycle
    cur, seen = parent_id, set()
    while cur and cur not in seen:
        if cur == node_id:
            raise HTTPException(status_code=400, detail="A role can't report to itself or to someone below it")
        seen.add(cur)
        p = await db.org_nodes.find_one({"id": cur}, {"_id": 0, "parent_id": 1})
        cur = p.get("parent_id") if p else None


@router.post("/org/nodes")
async def create_node(body: NodeIn, user: dict = Depends(get_current_user)):
    _need(user, "org_structure.manage", "You don't have permission to edit the org structure")
    if not body.title.strip():
        raise HTTPException(status_code=400, detail="Title is required")
    if body.kind not in KINDS:
        raise HTTPException(status_code=400, detail=f"Kind must be one of: {', '.join(KINDS)}")
    await _check_parent(None, body.parent_id)
    doc = {"id": str(uuid.uuid4()), **body.model_dump(), "created_at": _now(), "updated_at": _now(), "created_by": user["id"]}
    doc["responsibilities"] = [r.strip() for r in doc["responsibilities"] if r and r.strip()]
    doc["kpis"] = [k.strip() for k in doc["kpis"] if k and k.strip()]
    await db.org_nodes.insert_one(dict(doc))
    await log_activity(user, "org_node_created", "org_node", doc["id"], doc["title"])
    doc.pop("_id", None)
    return doc


@router.put("/org/nodes/{node_id}")
async def update_node(node_id: str, body: NodeUpdate, user: dict = Depends(get_current_user)):
    _need(user, "org_structure.manage", "You don't have permission to edit the org structure")
    n = await db.org_nodes.find_one({"id": node_id})
    if not n:
        raise HTTPException(status_code=404, detail="Node not found")
    updates = body.model_dump(exclude_unset=True)
    if "kind" in updates and updates["kind"] not in KINDS:
        raise HTTPException(status_code=400, detail=f"Kind must be one of: {', '.join(KINDS)}")
    if "parent_id" in updates:
        await _check_parent(node_id, updates["parent_id"])
    for k in ("responsibilities", "kpis"):
        if k in updates and updates[k] is not None:
            updates[k] = [r.strip() for r in updates[k] if r and r.strip()]
    updates["updated_at"] = _now()
    await db.org_nodes.update_one({"id": node_id}, {"$set": updates})
    action = "org_node_moved" if "parent_id" in updates and updates["parent_id"] != n.get("parent_id") else "org_node_updated"
    await log_activity(user, action, "org_node", node_id, updates.get("title", n["title"]))
    return await db.org_nodes.find_one({"id": node_id}, {"_id": 0})


async def _subtree_ids(node_id: str):
    out, stack = [], [node_id]
    while stack:
        cur = stack.pop()
        out.append(cur)
        stack.extend([c["id"] for c in await db.org_nodes.find({"parent_id": cur}, {"_id": 0, "id": 1}).to_list(500)])
    return out


@router.delete("/org/nodes/{node_id}")
async def delete_node(node_id: str, mode: str = Query("reattach", pattern="^(reattach|cascade)$"),
                      user: dict = Depends(get_current_user)):
    """reattach: children move up to this node's parent. cascade: the whole branch below is removed too."""
    _need(user, "org_structure.delete", "You don't have delete permission for the org structure")
    from routes_records import hard_delete
    n = await db.org_nodes.find_one({"id": node_id}, {"_id": 0})
    if not n:
        raise HTTPException(status_code=404, detail="Node not found")
    removed = 0
    if mode == "cascade":
        for nid in reversed(await _subtree_ids(node_id)):
            doc = await db.org_nodes.find_one({"id": nid}, {"_id": 0})
            if doc:
                await hard_delete("org_nodes", doc, user)
                removed += 1
    else:
        await db.org_nodes.update_many({"parent_id": node_id}, {"$set": {"parent_id": n.get("parent_id"), "updated_at": _now()}})
        await hard_delete("org_nodes", n, user)
        removed = 1
    return {"ok": True, "removed": removed}


@router.post("/org/bootstrap")
async def bootstrap(body: BootstrapBody, user: dict = Depends(get_current_user)):
    """Build a starter chart from the current team: CEO → departments → roles (grouped by designation)."""
    _need(user, "org_structure.manage", "You don't have permission to edit the org structure")
    existing = await db.org_nodes.count_documents({})
    if existing and not body.replace:
        raise HTTPException(status_code=409, detail="An org structure already exists. Choose replace to rebuild it.")
    if existing and body.replace:
        if not has_permission(user, "org_structure.delete"):
            raise HTTPException(status_code=403, detail="Replacing the chart needs org structure delete permission")
        from routes_records import hard_delete
        for doc in await db.org_nodes.find({}, {"_id": 0}).to_list(3000):
            await hard_delete("org_nodes", doc, user)
    people = list((await _people_index()).values())
    now = _now()

    def node(title, kind, parent_id, person_ids, tpl, order):
        return {"id": str(uuid.uuid4()), "title": title, "kind": kind, "parent_id": parent_id, "person_ids": person_ids,
                "responsibilities": list(tpl.get("responsibilities", [])) if tpl else [],
                "kpis": list(tpl.get("kpis", [])) if tpl else [], "description": "", "color": None, "order": order,
                "created_at": now, "updated_at": now, "created_by": user["id"]}

    ceo_tpl = ROLE_TEMPLATE["super_admin"]
    root = node(ceo_tpl["title"], "role", None, [p["id"] for p in people if p.get("role") == "super_admin"], ceo_tpl, 0)
    docs = [root]
    depts = {}
    for p in people:
        tpl = ROLE_TEMPLATE.get(p.get("role"))
        if not tpl or not tpl["dept"]:
            continue
        depts.setdefault(tpl["dept"], {}).setdefault((p.get("designation") or tpl["title"]), []).append((p, tpl))
    for i, dept in enumerate(sorted(depts, key=lambda d: DEPT_ORDER.index(d) if d in DEPT_ORDER else 99)):
        d = node(dept, "department", root["id"], [], None, i)
        docs.append(d)
        for j, (title, members) in enumerate(sorted(depts[dept].items())):
            tpl = members[0][1]
            docs.append(node(title, "role", d["id"], [m[0]["id"] for m in members], tpl, j))
    for doc in docs:
        await db.org_nodes.insert_one(dict(doc))
    await log_activity(user, "org_bootstrapped", "org_node", root["id"], f"{len(docs)} nodes from current team")
    return {"ok": True, "created": len(docs)}
