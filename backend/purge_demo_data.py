"""One-time v2.5 purge: remove ALL demo/seed data. Keeps only admin@dotindot.in + midhun@dotindot.in,
role_defaults, deleted_records (recycle bin) and purge_runs. Run: python purge_demo_data.py"""
import asyncio
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")

from database import db  # noqa: E402

KEEP_USERS = {"admin@dotindot.in", "midhun@dotindot.in"}
KEEP_COLLECTIONS = {"role_defaults", "purge_runs"}


async def main():
    names = await db.list_collection_names()
    for n in sorted(names):
        if n in KEEP_COLLECTIONS or n.startswith("system."):
            continue
        if n == "users":
            res = await db.users.delete_many({"email": {"$nin": list(KEEP_USERS)}})
        else:
            res = await db[n].delete_many({})
        print(f"{n}: removed {res.deleted_count}")
    # kept accounts: clear demo-only fields so nothing references removed branches/users
    await db.users.update_many({}, {"$set": {"branch_assignments": [], "assigned_branches": [], "permission_overrides": {}},
                                    "$unset": {"branch_id": "", "city": "", "state": ""}})
    print("kept:", [u["email"] async for u in db.users.find({}, {"email": 1})])


if __name__ == "__main__":
    asyncio.run(main())
