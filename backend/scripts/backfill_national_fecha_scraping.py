"""
Backfill fecha_scraping for national (AR) sources.

The 4 national scrapers (boletin_oficial_nacional, banco_mundial_argentina,
bid_procurement_argentina, santa_fe_compras) historically did not set
fecha_scraping, causing cards in /licitaciones-ar to show "Sin datos" in the
date badge when sorted by indexación.

This script populates fecha_scraping for existing items using the best
available proxy, in this priority order:
  1. first_seen_at   (when we first saw the item)
  2. created_at      (MongoDB insert timestamp)
  3. publication_date (last resort)

Idempotent: only updates docs where fecha_scraping is None/missing.

Usage:
  docker exec -w /app -e PYTHONPATH=/app licitometro-backend-1 \
      python3 scripts/backfill_national_fecha_scraping.py
"""

import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient


NATIONAL_FUENTES = [
    "boletin_oficial_nacional",
    "banco_mundial_argentina",
    "bid_procurement_argentina",
    "santa_fe_compras",
]


async def main():
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "licitometro")

    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    collection = db.licitaciones

    query = {
        "fuente": {"$in": NATIONAL_FUENTES},
        "$or": [
            {"fecha_scraping": None},
            {"fecha_scraping": {"$exists": False}},
        ],
    }

    total = await collection.count_documents(query)
    print(f"Found {total} national items without fecha_scraping")

    updated = 0
    skipped = 0

    async for doc in collection.find(query):
        fallback = (
            doc.get("first_seen_at")
            or doc.get("created_at")
            or doc.get("publication_date")
        )
        if not fallback:
            skipped += 1
            continue

        result = await collection.update_one(
            {"_id": doc["_id"]},
            {"$set": {"fecha_scraping": fallback}},
        )
        if result.modified_count > 0:
            updated += 1
        else:
            skipped += 1

        if (updated + skipped) % 100 == 0:
            print(f"  progress: {updated + skipped}/{total}")

    print(f"\nDone.")
    print(f"  Updated: {updated}")
    print(f"  Skipped (no fallback date): {skipped}")

    # Per-source breakdown
    print(f"\nRemaining without fecha_scraping by source:")
    for fuente in NATIONAL_FUENTES:
        remaining = await collection.count_documents({
            "fuente": fuente,
            "$or": [
                {"fecha_scraping": None},
                {"fecha_scraping": {"$exists": False}},
            ],
        })
        print(f"  {fuente}: {remaining}")


if __name__ == "__main__":
    asyncio.run(main())
