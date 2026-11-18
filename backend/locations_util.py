"""Where a record sits: the Dotindot location (branch) of a project, client or lead.

A project's location is its own `branch_id`. Client projects start at the client's location and can be moved to
another one (say the Chennai team runs a job for an Erode client). Older client projects without one fall back to
the client's location.
"""
from typing import Dict, Optional

from fastapi import HTTPException

from database import db
from permissions import branch_scope


async def branch_names() -> Dict[str, str]:
    return {b["id"]: b["name"] for b in await db.branches.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(500)}


async def valid_branch(branch_id) -> Optional[str]:
    """'' / None → None; an unknown id → 404."""
    if not branch_id:
        return None
    if not isinstance(branch_id, str) or not await db.branches.find_one({"id": branch_id}, {"_id": 0, "id": 1}):
        raise HTTPException(status_code=404, detail="That location doesn't exist")
    return branch_id


async def default_branch(user: dict) -> Optional[str]:
    """The location new work lands in when none is picked: the person's own, inside their access."""
    scope = branch_scope(user)
    home = user.get("branch_id")
    if scope:
        return home if home in scope else scope[0]
    if home and await db.branches.find_one({"id": home}, {"_id": 0, "id": 1}):
        return home
    return None


def project_location(p: dict, client_branch: Dict[str, Optional[str]]) -> Optional[str]:
    """The location a project belongs to (its own, else its client's)."""
    if p.get("branch_id"):
        return p["branch_id"]
    if p.get("kind") == "internal":
        return None
    return client_branch.get(p.get("client_id")) or None


async def client_branch_map() -> Dict[str, Optional[str]]:
    return {c["id"]: c.get("branch_id") for c in await db.clients.find({}, {"_id": 0, "id": 1, "branch_id": 1}).to_list(10000)}


async def migrate_locations_v36():
    """Give every client project and lead a location (idempotent; tracked in db.migrations)."""
    if await db.migrations.find_one({"id": "locations_v36"}):
        return
    cb = await client_branch_map()
    n = 0
    async for p in db.projects.find({"kind": {"$ne": "internal"}, "$or": [{"branch_id": None}, {"branch_id": ""}, {"branch_id": {"$exists": False}}]},
                                    {"_id": 0, "id": 1, "client_id": 1}):
        b = cb.get(p.get("client_id"))
        if b:
            await db.projects.update_one({"id": p["id"]}, {"$set": {"branch_id": b}})
            n += 1
    homes = {u["id"]: u.get("branch_id") for u in await db.users.find({}, {"_id": 0, "id": 1, "branch_id": 1}).to_list(5000)}
    known = set(await branch_names())
    m = 0
    async for l in db.leads.find({"$or": [{"branch_id": None}, {"branch_id": ""}, {"branch_id": {"$exists": False}}]}, {"_id": 0, "id": 1, "owner_id": 1, "created_by": 1}):
        b = homes.get(l.get("owner_id")) or homes.get(l.get("created_by"))
        if b in known:
            await db.leads.update_one({"id": l["id"]}, {"$set": {"branch_id": b}})
            m += 1
    await db.migrations.insert_one({"id": "locations_v36", "projects": n, "leads": m})


def tx_location(x: dict, ploc: Dict[str, Optional[str]], client_branch: Dict[str, Optional[str]]) -> Optional[str]:
    """The location a ledger entry belongs to: picked on the entry, else its project's, else its client's.
    None = company-wide (rent, tools, salaries not tied to one location)."""
    if x.get("branch_id"):
        return x["branch_id"]
    if x.get("project_id") and ploc.get(x["project_id"]):
        return ploc[x["project_id"]]
    return client_branch.get(x.get("client_id")) or None


async def location_maps():
    """(client → location, project → location) for attributing money to locations."""
    cb = await client_branch_map()
    ploc = {p["id"]: project_location(p, cb) for p in await db.projects.find({}, {"_id": 0, "id": 1, "client_id": 1, "kind": 1, "branch_id": 1}).to_list(20000)}
    return cb, ploc


async def sync_ceo_of():
    """Each person's `ceo_of` = the locations they are CEO of (from branches.manager_id)."""
    heads: Dict[str, list] = {}
    for b in await db.branches.find({"manager_id": {"$nin": [None, ""]}}, {"_id": 0, "id": 1, "manager_id": 1}).to_list(500):
        heads.setdefault(b["manager_id"], []).append(b["id"])
    await db.users.update_many({"ceo_of": {"$exists": True}, "id": {"$nin": list(heads)}}, {"$unset": {"ceo_of": ""}})
    for uid, ids in heads.items():
        await db.users.update_one({"id": uid}, {"$set": {"ceo_of": sorted(ids)}})


async def migrate_location_ceos_v37():
    """Turn a location's typed head name into its CEO when exactly one active person has that name."""
    if not await db.migrations.find_one({"id": "location_ceos_v37"}):
        people = await db.users.find({"is_active": True, "deleted": {"$ne": True}}, {"_id": 0, "id": 1, "name": 1}).to_list(5000)
        linked = 0
        for b in await db.branches.find({"$or": [{"manager_id": None}, {"manager_id": ""}, {"manager_id": {"$exists": False}}],
                                         "head_name": {"$nin": [None, ""]}}, {"_id": 0, "id": 1, "head_name": 1}).to_list(500):
            match = [u for u in people if (u.get("name") or "").strip().lower() == b["head_name"].strip().lower()]
            if len(match) == 1:
                await db.branches.update_one({"id": b["id"]}, {"$set": {"manager_id": match[0]["id"]}})
                linked += 1
        await db.migrations.insert_one({"id": "location_ceos_v37", "linked": linked})
    await sync_ceo_of()
