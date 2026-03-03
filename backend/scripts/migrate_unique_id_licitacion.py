"""
Migration script: Upgrade id_licitacion index from non-unique to unique sparse.

This prevents duplicate documents from being inserted by concurrent scraper runs.
The app-level dedup in scheduler_service is the fast path; the unique index is
the safety net that catches race conditions.

Prerequisites:
  - All duplicate id_licitacion values must be resolved BEFORE running this script.
    Use the cleanup step (--check / --cleanup) to find and remove remaining dups.

Usage:
    cd backend

    # Step 1: Check for remaining duplicates (dry-run, no changes)
    python scripts/migrate_unique_id_licitacion.py --check

    # Step 2: Auto-remove duplicates (keeps oldest by first_seen_at)
    python scripts/migrate_unique_id_licitacion.py --cleanup

    # Step 3: Upgrade the index to unique
    python scripts/migrate_unique_id_licitacion.py --migrate
"""

import asyncio
import argparse
import os
import sys
from pathlib import Path
from datetime import datetime

sys.path.insert(0, str(Path(__file__).parent.parent))

from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "licitaciones_db")


async def check_duplicates(collection) -> int:
    """Find id_licitacion values with more than one document."""
    pipeline = [
        {"$match": {"id_licitacion": {"$ne": None}}},
        {"$group": {"_id": "$id_licitacion", "count": {"$sum": 1}, "ids": {"$push": "$_id"}}},
        {"$match": {"count": {"$gt": 1}}},
        {"$sort": {"count": -1}},
    ]
    dups = await collection.aggregate(pipeline).to_list(length=None)
    if not dups:
        print("No duplicate id_licitacion values found.")
        return 0

    print(f"Found {len(dups)} id_licitacion value(s) with duplicates:\n")
    for d in dups[:50]:
        print(f"  {d['_id']}  ({d['count']} docs)  _ids={d['ids'][:5]}")
    if len(dups) > 50:
        print(f"  ... and {len(dups) - 50} more")
    return len(dups)


async def cleanup_duplicates(collection) -> int:
    """Remove duplicate documents, keeping the one with the earliest first_seen_at."""
    pipeline = [
        {"$match": {"id_licitacion": {"$ne": None}}},
        {"$group": {"_id": "$id_licitacion", "count": {"$sum": 1}, "ids": {"$push": "$_id"}}},
        {"$match": {"count": {"$gt": 1}}},
    ]
    dups = await collection.aggregate(pipeline).to_list(length=None)
    if not dups:
        print("No duplicates to clean up.")
        return 0

    total_deleted = 0
    for group in dups:
        id_lic = group["_id"]
        docs = await collection.find(
            {"id_licitacion": id_lic},
            {"_id": 1, "first_seen_at": 1, "created_at": 1}
        ).sort("first_seen_at", 1).to_list(length=None)

        # Keep the first (earliest first_seen_at), delete the rest
        keep = docs[0]
        delete_ids = [d["_id"] for d in docs[1:]]

        print(f"  {id_lic}: keeping _id={keep['_id']} (first_seen={keep.get('first_seen_at')}), "
              f"deleting {len(delete_ids)} duplicate(s)")

        result = await collection.delete_many({"_id": {"$in": delete_ids}})
        total_deleted += result.deleted_count

    print(f"\nDeleted {total_deleted} duplicate document(s) across {len(dups)} groups.")
    return total_deleted


async def migrate_index(collection):
    """Drop the old non-unique index and create a unique sparse one."""
    indexes = await collection.index_information()
    print(f"Current indexes: {list(indexes.keys())}\n")

    # Find existing id_licitacion index
    old_index_name = None
    for name, info in indexes.items():
        keys = info.get("key", [])
        # key is a list of tuples like [("id_licitacion", 1)]
        if any(k[0] == "id_licitacion" for k in keys):
            old_index_name = name
            is_unique = info.get("unique", False)
            print(f"Found index '{name}': unique={is_unique}, sparse={info.get('sparse', False)}")
            if is_unique:
                print("Index is already unique. Nothing to do.")
                return
            break

    if old_index_name:
        print(f"\nDropping old index '{old_index_name}'...")
        await collection.drop_index(old_index_name)
        print("Dropped.")

    print("Creating new unique sparse index on id_licitacion...")
    await collection.create_index("id_licitacion", unique=True, sparse=True)
    print("Created unique sparse index on id_licitacion.")

    # Verify
    indexes = await collection.index_information()
    for name, info in indexes.items():
        keys = info.get("key", [])
        if any(k[0] == "id_licitacion" for k in keys):
            print(f"\nVerified: '{name}' unique={info.get('unique', False)} sparse={info.get('sparse', False)}")
            break


async def main():
    parser = argparse.ArgumentParser(description="Migrate id_licitacion index to unique sparse")
    parser.add_argument("--check", action="store_true", help="Check for duplicate id_licitacion values")
    parser.add_argument("--cleanup", action="store_true", help="Remove duplicate documents (keep earliest)")
    parser.add_argument("--migrate", action="store_true", help="Upgrade index to unique sparse")
    args = parser.parse_args()

    if not any([args.check, args.cleanup, args.migrate]):
        parser.print_help()
        return

    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    collection = db["licitaciones"]

    count = await collection.count_documents({})
    print(f"Connected to {MONGO_URL}/{DB_NAME}")
    print(f"Total documents: {count}\n")

    if args.check:
        await check_duplicates(collection)

    if args.cleanup:
        await cleanup_duplicates(collection)

    if args.migrate:
        # Safety check: ensure no duplicates remain
        dup_count = await check_duplicates(collection)
        if dup_count > 0:
            print(f"\nERROR: {dup_count} duplicate group(s) still exist. "
                  f"Run --cleanup first, then --migrate.")
            return
        print()
        await migrate_index(collection)

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
