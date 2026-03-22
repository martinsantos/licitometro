"""
Backfill script: Populate `fuentes` and `proceso_id` for existing licitaciones.

Run via:
  docker exec -w /app -e PYTHONPATH=/app licitometro-backend-1 python3 scripts/backfill_proceso_id.py [--dry-run]
"""

import asyncio
import sys
import os
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from motor.motor_asyncio import AsyncIOMotorClient
from utils.proceso_id import normalize_proceso_id


async def main():
    dry_run = "--dry-run" in sys.argv

    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "licitaciones_db")
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    collection = db.licitaciones

    total = await collection.count_documents({})
    print(f"Total licitaciones: {total}")

    # Pass 1: Populate fuentes[] where empty
    empty_fuentes = await collection.count_documents({"$or": [{"fuentes": {"$exists": False}}, {"fuentes": {"$size": 0}}]})
    print(f"Items missing fuentes[]: {empty_fuentes}")

    if not dry_run and empty_fuentes > 0:
        result = await collection.update_many(
            {"$or": [{"fuentes": {"$exists": False}}, {"fuentes": {"$size": 0}}], "fuente": {"$ne": None}},
            [{"$set": {"fuentes": ["$fuente"]}}]
        )
        print(f"  Updated fuentes for {result.modified_count} items")

    # Pass 2: Generate proceso_id where missing
    missing_pid = await collection.count_documents({"$or": [{"proceso_id": {"$exists": False}}, {"proceso_id": None}]})
    print(f"Items missing proceso_id: {missing_pid}")

    cursor = collection.find(
        {"$or": [{"proceso_id": {"$exists": False}}, {"proceso_id": None}]},
        {"_id": 1, "expedient_number": 1, "licitacion_number": 1, "title": 1, "fuente": 1}
    )

    updated = 0
    skipped = 0
    async for doc in cursor:
        pid = normalize_proceso_id(
            expedient_number=doc.get("expedient_number"),
            licitacion_number=doc.get("licitacion_number"),
            title=doc.get("title", ""),
            fuente=doc.get("fuente", ""),
        )
        if pid:
            if not dry_run:
                await collection.update_one({"_id": doc["_id"]}, {"$set": {"proceso_id": pid}})
            updated += 1
        else:
            skipped += 1

    print(f"  proceso_id generated: {updated}, no match: {skipped}")

    # Pass 3: Cross-source linking summary
    with_pid = await collection.count_documents({"proceso_id": {"$ne": None}})
    print(f"\nSummary:")
    print(f"  Items with proceso_id: {with_pid}/{total} ({100*with_pid//max(total,1)}%)")

    # Show potential cross-source matches
    pipeline = [
        {"$match": {"proceso_id": {"$ne": None}}},
        {"$group": {"_id": "$proceso_id", "count": {"$sum": 1}, "fuentes": {"$addToSet": "$fuente"}}},
        {"$match": {"count": {"$gt": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 20},
    ]
    cross_matches = await collection.aggregate(pipeline).to_list(length=20)
    if cross_matches:
        print(f"\n  Potential cross-source matches ({len(cross_matches)} groups):")
        for m in cross_matches:
            print(f"    {m['_id']}: {m['count']} items from {m['fuentes']}")
    else:
        print(f"\n  No cross-source matches found yet")

    if dry_run:
        print("\n[DRY RUN] No changes written. Run without --dry-run to apply.")

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
