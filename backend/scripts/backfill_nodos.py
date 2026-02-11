#!/usr/bin/env python3
"""
Backfill nodos: match all existing licitaciones against active nodos.

Run:
  docker exec -w /app -e PYTHONPATH=/app licitometro-backend-1 python3 scripts/backfill_nodos.py
"""

import asyncio
import os
import sys
from pathlib import Path
from collections import defaultdict

sys.path.insert(0, str(Path(__file__).parent.parent))

from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "licitaciones_db")


async def main():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    from services.nodo_matcher import get_nodo_matcher

    matcher = get_nodo_matcher(db)
    await matcher.reload_nodos()

    if not matcher._cache:
        print("No active nodos found. Run seed_nodos.py first.")
        client.close()
        return

    print(f"Loaded {len(matcher._cache)} active nodos")

    # Track matches per nodo
    nodo_counts = defaultdict(int)
    total = 0
    matched_total = 0

    cursor = db.licitaciones.find(
        {},
        {"_id": 1, "title": 1, "objeto": 1, "description": 1, "organization": 1, "nodos": 1}
    )

    async for lic in cursor:
        total += 1
        matched_ids = matcher.match_licitacion(
            title=lic.get("title", "") or "",
            objeto=lic.get("objeto", "") or "",
            description=lic.get("description", "") or "",
            organization=lic.get("organization", "") or "",
        )

        if matched_ids:
            matched_total += 1
            for nid in matched_ids:
                nodo_counts[nid] += 1

        # Always set the full computed nodos list (replaces previous assignments)
        await db.licitaciones.update_one(
            {"_id": lic["_id"]},
            {"$set": {"nodos": matched_ids}}
        )

        if total % 500 == 0:
            print(f"  Processed {total} licitaciones, {matched_total} matched so far...")

    # Update matched_count on each nodo
    for nodo_id, count in nodo_counts.items():
        from bson import ObjectId
        await db.nodos.update_one(
            {"_id": ObjectId(nodo_id)},
            {"$set": {"matched_count": count}}
        )

    print(f"\nDone! Processed {total} licitaciones, {matched_total} matched at least one nodo.")
    for nodo_doc, _ in matcher._cache:
        nid = str(nodo_doc["_id"])
        print(f"  {nodo_doc['name']}: {nodo_counts.get(nid, 0)} matches")

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
