"""
Backfill embeddings for all licitaciones with enrichment_level >= 2.

Usage:
    python scripts/backfill_embeddings.py [--dry-run] [--limit N]

Processes items in batches of 50 with 2s pause between batches.
"""

import asyncio
import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()


async def run_backfill(dry_run: bool = False, limit: int = 0):
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "licitaciones_db")
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    # Count items needing embeddings
    pipeline = [
        {"$match": {"enrichment_level": {"$gte": 2}}},
        {
            "$lookup": {
                "from": "licitacion_embeddings",
                "localField": "_id",
                "foreignField": "licitacion_id",
                "as": "emb",
            }
        },
        {"$match": {"emb": {"$size": 0}}},
        {"$count": "total"},
    ]
    result = await db.licitaciones.aggregate(pipeline).to_list(1)
    total = result[0]["total"] if result else 0
    print(f"Items needing embeddings: {total}")

    if dry_run:
        print("DRY RUN — no embeddings generated")
        client.close()
        return

    if total == 0:
        print("Nothing to do!")
        client.close()
        return

    from services.embedding_service import get_embedding_service
    svc = get_embedding_service(db)

    # Process in batches
    batch_size = 50
    processed = 0
    max_items = limit if limit > 0 else total

    while processed < max_items:
        batch_limit = min(batch_size, max_items - processed)
        items_pipeline = [
            {"$match": {"enrichment_level": {"$gte": 2}}},
            {
                "$lookup": {
                    "from": "licitacion_embeddings",
                    "localField": "_id",
                    "foreignField": "licitacion_id",
                    "as": "emb",
                }
            },
            {"$match": {"emb": {"$size": 0}}},
            {"$limit": batch_limit},
            {"$project": {"_id": 1}},
        ]
        items = await db.licitaciones.aggregate(items_pipeline).to_list(batch_limit)
        if not items:
            break

        batch_success = 0
        for item in items:
            lic_id = str(item["_id"])
            if await svc.embed_licitacion(lic_id):
                batch_success += 1
            await asyncio.sleep(0.1)

        processed += len(items)
        print(f"Progress: {processed}/{max_items} ({batch_success}/{len(items)} in this batch)")
        await asyncio.sleep(2)  # Pause between batches

    print(f"Done! Processed {processed} items.")
    client.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Count only, don't generate")
    parser.add_argument("--limit", type=int, default=0, help="Max items to process (0=all)")
    args = parser.parse_args()
    asyncio.run(run_backfill(dry_run=args.dry_run, limit=args.limit))
