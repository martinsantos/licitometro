#!/usr/bin/env python3
"""
Batch enrichment: fetch source_url for all licitaciones missing opening_date
and attempt to extract the date from the page content.

Usage:
  docker exec -w /app -e PYTHONPATH=/app licitometro-backend-1 python scripts/batch_enrich_opening_dates.py
  docker exec -w /app -e PYTHONPATH=/app licitometro-backend-1 python scripts/batch_enrich_opening_dates.py --dry-run
"""

import asyncio
import argparse
import logging
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from motor.motor_asyncio import AsyncIOMotorClient
from services.generic_enrichment import GenericEnrichmentService

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger("batch_enrich")


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Don't save, just show what would be extracted")
    parser.add_argument("--fuente", type=str, default=None, help="Only process this source")
    parser.add_argument("--limit", type=int, default=0, help="Max items to process")
    args = parser.parse_args()

    client = AsyncIOMotorClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
    db = client[os.environ.get("DB_NAME", "licitaciones_db")]

    # Find licitaciones without opening_date that have a source_url
    query = {
        "opening_date": None,
        "source_url": {"$ne": None, "$ne": ""},
    }
    if args.fuente:
        query["fuente"] = {"$regex": args.fuente, "$options": "i"}

    # Exclude sources where we know there's no apertura data
    query["fuente"] = query.get("fuente", {"$nin": [
        "Boletin Oficial Mendoza",
        "Boletin Oficial Mendoza (PDF)",
    ]})

    cursor = db.licitaciones.find(query).sort("fuente", 1)
    docs = await cursor.to_list(args.limit or 1000)

    logger.info(f"Found {len(docs)} licitaciones without opening_date")

    service = GenericEnrichmentService()
    stats = {"processed": 0, "found": 0, "failed": 0, "skipped": 0}
    results_by_source = {}

    # Load scraper configs for selectors
    configs = {}
    async for cfg in db.scraper_configs.find({"active": True}):
        configs[cfg["name"]] = cfg.get("selectors", {}) or {}

    for doc in docs:
        fuente = doc.get("fuente", "?")
        source_url = str(doc.get("source_url", ""))
        title = (doc.get("title", "") or "")[:60]

        # Skip non-HTTP URLs (PDFs, ZIPs, localhost proxies)
        if not source_url.startswith("http"):
            stats["skipped"] += 1
            continue
        if any(source_url.lower().endswith(ext) for ext in [".pdf", ".zip", ".rar", ".doc"]):
            stats["skipped"] += 1
            continue
        if "localhost" in source_url:
            stats["skipped"] += 1
            continue

        stats["processed"] += 1
        selectors = configs.get(fuente, {})

        try:
            updates = await service.enrich(doc, selectors)
            opening = updates.get("opening_date")

            if opening:
                stats["found"] += 1
                results_by_source.setdefault(fuente, []).append({
                    "title": title,
                    "opening_date": opening.isoformat(),
                })
                logger.info(f"  FOUND: [{fuente}] {title} -> {opening.strftime('%d/%m/%Y %H:%M')}")

                if not args.dry_run:
                    from bson import ObjectId
                    update_fields = {"opening_date": opening}
                    # Also save any other enrichment data found
                    for k in ("description", "attached_files", "metadata"):
                        if k in updates:
                            update_fields[k] = updates[k]
                    update_fields["enrichment_level"] = max(doc.get("enrichment_level", 1), 2)
                    update_fields["last_enrichment"] = updates.get("last_enrichment")

                    await db.licitaciones.update_one(
                        {"_id": doc["_id"]},
                        {"$set": update_fields}
                    )
            else:
                logger.debug(f"  NONE:  [{fuente}] {title}")

        except Exception as e:
            stats["failed"] += 1
            logger.warning(f"  ERROR: [{fuente}] {title}: {e}")

        # Rate limit: 1.5s between requests
        await asyncio.sleep(1.5)

    # Summary
    print(f"\n{'='*60}")
    print(f"BATCH ENRICHMENT RESULTS {'(DRY RUN)' if args.dry_run else ''}")
    print(f"{'='*60}")
    print(f"Processed: {stats['processed']}")
    print(f"Found opening_date: {stats['found']}")
    print(f"Skipped (bad URL): {stats['skipped']}")
    print(f"Errors: {stats['failed']}")
    print()
    for src, items in sorted(results_by_source.items()):
        print(f"  {src}: {len(items)} dates found")
        for item in items[:5]:
            print(f"    - {item['title']} -> {item['opening_date']}")

    await service.close()


if __name__ == "__main__":
    asyncio.run(main())
