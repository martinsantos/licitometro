"""
dedup_existing.py — One-off script to find and remove duplicate licitaciones.

Run BEFORE enabling the unique index on id_licitacion, or MongoDB will reject
the index creation if duplicates already exist in the collection.

Usage:
    # Preview (no changes made)
    python scripts/dedup_existing.py --dry-run

    # Execute cleanup
    python scripts/dedup_existing.py
"""

import asyncio
import argparse
import sys
import os
from pathlib import Path
from datetime import datetime

sys.path.insert(0, str(Path(__file__).parent.parent))

from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId


async def find_and_remove_duplicates(db, dry_run: bool = True):
    collection = db.licitaciones

    print(f"\n{'[DRY RUN] ' if dry_run else ''}Scanning for duplicate id_licitacion values...")

    # Aggregate: group by id_licitacion, keep only those with more than 1 document
    pipeline = [
        {"$match": {"id_licitacion": {"$ne": None, "$exists": True}}},
        {"$group": {
            "_id": "$id_licitacion",
            "count": {"$sum": 1},
            "docs": {"$push": {"_id": "$_id", "created_at": "$created_at", "first_seen_at": "$first_seen_at"}},
        }},
        {"$match": {"count": {"$gt": 1}}},
        {"$sort": {"count": -1}},
    ]

    cursor = collection.aggregate(pipeline, allowDiskUse=True)
    groups = await cursor.to_list(length=None)

    if not groups:
        print("✅ No duplicate id_licitacion values found. DB is clean.")
        return

    total_groups = len(groups)
    total_duplicates = sum(g["count"] - 1 for g in groups)
    print(f"⚠️  Found {total_groups} id_licitacion values with duplicates ({total_duplicates} extra docs to remove)\n")

    removed = 0
    for group in groups:
        id_lic = group["_id"]
        docs = group["docs"]
        count = group["count"]

        # Sort: keep the OLDEST document (smallest created_at / first_seen_at)
        # as it is the canonical record with the correct first_seen_at
        def sort_key(d):
            ts = d.get("first_seen_at") or d.get("created_at")
            if ts is None:
                return datetime.max
            return ts if isinstance(ts, datetime) else datetime.max

        docs_sorted = sorted(docs, key=sort_key)
        keeper = docs_sorted[0]
        to_delete = [d["_id"] for d in docs_sorted[1:]]

        print(f"  id_licitacion={id_lic!r}  ({count} docs)")
        print(f"    KEEP:   _id={keeper['_id']}  first_seen={keeper.get('first_seen_at') or keeper.get('created_at')}")
        for d in docs_sorted[1:]:
            print(f"    DELETE: _id={d['_id']}  first_seen={d.get('first_seen_at') or d.get('created_at')}")

        if not dry_run:
            result = await collection.delete_many({"_id": {"$in": to_delete}})
            removed += result.deleted_count
            print(f"    → Deleted {result.deleted_count} duplicate(s)")

        print()

    if dry_run:
        print(f"[DRY RUN] Would delete {total_duplicates} duplicate document(s) across {total_groups} groups.")
        print("Run without --dry-run to apply changes.")
    else:
        print(f"✅ Removed {removed} duplicate document(s) across {total_groups} groups.")

    # After cleanup, also report on content_hash duplicates
    await report_content_hash_duplicates(collection, dry_run)


async def report_content_hash_duplicates(collection, dry_run: bool):
    """Report (but don't auto-remove) content_hash duplicates — these are cross-source."""
    print("\nChecking for content_hash duplicates (cross-source, informational only)...")
    pipeline = [
        {"$match": {"content_hash": {"$ne": None, "$exists": True}}},
        {"$group": {
            "_id": "$content_hash",
            "count": {"$sum": 1},
            "sources": {"$addToSet": "$fuente"},
            "ids": {"$push": "$id_licitacion"},
        }},
        {"$match": {"count": {"$gt": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 20},
    ]
    cursor = collection.aggregate(pipeline, allowDiskUse=True)
    groups = await cursor.to_list(length=None)
    if not groups:
        print("✅ No content_hash duplicates found.")
        return
    print(f"ℹ️  Found {len(groups)} content_hash collisions (showing up to 20):")
    for g in groups:
        print(f"  hash={g['_id'][:12]}…  count={g['count']}  sources={g['sources']}  ids={g['ids'][:3]}")
    print("  (These are cross-source duplicates; review manually before removing.)")


async def main():
    parser = argparse.ArgumentParser(description="Remove duplicate licitaciones by id_licitacion")
    parser.add_argument("--dry-run", action="store_true", default=False,
                        help="Preview changes without making any modifications")
    args = parser.parse_args()

    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "licitaciones_db")

    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    try:
        await find_and_remove_duplicates(db, dry_run=args.dry_run)
    finally:
        client.close()


if __name__ == "__main__":
    asyncio.run(main())
