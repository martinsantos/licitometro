"""
Backfill missing fields for Mendoza licitaciones using improved extractors.

Runs in two modes:
  1. Regex pass (default): Uses text_analyzer regex patterns + category classifier
  2. Groq LLM pass (--groq flag): Uses Groq LLM for items where regex failed

Usage:
  # Regex pass (fast, no external dependencies)
  python3 scripts/backfill_mendoza_fields.py

  # Groq LLM pass (slower, needs GROQ_API_KEY, rate-limited)
  python3 scripts/backfill_mendoza_fields.py --groq --limit 500

  # Dry run (no changes, just stats)
  python3 scripts/backfill_mendoza_fields.py --dry-run
"""

import argparse
import asyncio
import logging
import os
import re
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from motor.motor_asyncio import AsyncIOMotorClient

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("backfill_mendoza")


async def main():
    parser = argparse.ArgumentParser(description="Backfill Mendoza licitaciones fields")
    parser.add_argument("--groq", action="store_true", help="Use Groq LLM for items where regex failed")
    parser.add_argument("--limit", type=int, default=10000, help="Max items to process (default: 10000)")
    parser.add_argument("--dry-run", action="store_true", help="Show stats without making changes")
    args = parser.parse_args()

    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "licitometro")
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    col = db.licitaciones

    total = await col.count_documents({})
    print(f"Total items in DB: {total}")

    stats = {
        "fecha_scraping_fixed": 0,
        "budget_regex": 0,
        "opening_date_regex": 0,
        "category_classified": 0,
        "licitacion_number_extracted": 0,
        "expedient_promoted": 0,
        "objeto_extracted": 0,
        "groq_enriched": 0,
        "errors": 0,
    }

    if not args.groq:
        await _pass_regex(col, stats, args.limit, args.dry_run)
    else:
        await _pass_groq(col, db, stats, args.limit, args.dry_run)

    print(f"\n=== BACKFILL RESULTS ===")
    for k, v in stats.items():
        if v > 0:
            print(f"  {k}: {v}")

    # Post-backfill stats
    print(f"\n=== POST-BACKFILL FIELD COVERAGE ===")
    fields = ["fecha_scraping", "opening_date", "budget", "objeto", "category", "licitacion_number"]
    for f in fields:
        missing = await col.count_documents({"$or": [{f: None}, {f: {"$exists": False}}]})
        pct = round(missing / total * 100, 1)
        print(f"  {f:25} missing: {missing:>5} ({pct}%)")


async def _pass_regex(col, stats, limit, dry_run):
    """Pass 1: Extract fields using regex patterns and classifiers."""
    from services.enrichment.text_analyzer import (
        extract_budget_from_text,
        extract_opening_date_from_text,
    )
    from utils.object_extractor import extract_objeto
    from services.category_classifier import get_category_classifier

    # Try importing extract_licitacion_number (may not exist yet)
    try:
        from services.enrichment.text_analyzer import extract_licitacion_number
    except ImportError:
        extract_licitacion_number = None
        logger.warning("extract_licitacion_number not available, skipping")

    classifier = get_category_classifier()

    # Items with any missing field
    query = {
        "$or": [
            {"fecha_scraping": None},
            {"fecha_scraping": {"$exists": False}},
            {"budget": None, "description": {"$ne": None}},
            {"opening_date": None, "description": {"$ne": None}},
            {"category": None},
            {"category": {"$exists": False}},
            {"objeto": None},
            {"objeto": {"$exists": False}},
            {"licitacion_number": None, "title": {"$ne": None}},
        ],
    }

    cursor = col.find(query).limit(limit)
    processed = 0

    async for doc in cursor:
        processed += 1
        if processed % 200 == 0:
            print(f"  progress: {processed} processed...")

        updates = {}
        title = doc.get("title", "")
        description = doc.get("description", "")
        objeto = doc.get("objeto")
        metadata = doc.get("metadata") or {}

        # 1. fecha_scraping
        if not doc.get("fecha_scraping"):
            fallback = doc.get("first_seen_at") or doc.get("created_at") or doc.get("publication_date")
            if fallback:
                updates["fecha_scraping"] = fallback
                stats["fecha_scraping_fixed"] += 1

        # 2. Budget from description
        if not doc.get("budget") and description:
            result = extract_budget_from_text(description)
            if result and result.get("budget"):
                updates["budget"] = result["budget"]
                updates["currency"] = result.get("currency", "ARS")
                updates["metadata.budget_source"] = "regex_backfill"
                stats["budget_regex"] += 1

        # 3. Opening date from description
        if not doc.get("opening_date") and description:
            result = extract_opening_date_from_text(description)
            if result:
                updates["opening_date"] = result
                stats["opening_date_regex"] += 1

        # 4. Category
        if not doc.get("category"):
            cat = classifier.classify(
                title=title,
                objeto=objeto,
                description=description[:1000] if description else "",
            )
            if cat:
                updates["category"] = cat
                stats["category_classified"] += 1

        # 5. Licitacion number
        if not doc.get("licitacion_number") and extract_licitacion_number:
            text = f"{title} {objeto or ''}"
            lic_num = extract_licitacion_number(text)
            if lic_num:
                updates["licitacion_number"] = lic_num
                stats["licitacion_number_extracted"] += 1

        # 6. Expedient number from metadata
        if not doc.get("expedient_number"):
            exp = metadata.get("expediente") or metadata.get("expedient_number")
            if exp:
                updates["expedient_number"] = exp
                stats["expedient_promoted"] += 1

        # 7. Objeto
        if not objeto and (title or description):
            new_obj = extract_objeto(title, description[:500] if description else "", None)
            if new_obj:
                updates["objeto"] = new_obj
                stats["objeto_extracted"] += 1

        # Apply updates
        if updates and not dry_run:
            try:
                await col.update_one({"_id": doc["_id"]}, {"$set": updates})
            except Exception as e:
                stats["errors"] += 1
                if stats["errors"] < 10:
                    logger.warning(f"Update failed for {doc['_id']}: {e}")

    print(f"  Regex pass: processed {processed} items")


async def _pass_groq(col, db, stats, limit, dry_run):
    """Pass 2: Use Groq LLM for items where regex failed."""
    from services.groq_field_extractor import get_groq_field_extractor

    extractor = get_groq_field_extractor()
    if not extractor.enabled:
        print("ERROR: GROQ_API_KEY not set. Cannot run Groq pass.")
        return

    GROQ_DELAY = 3.0  # 20 req/min

    query = {
        "description": {"$ne": None, "$exists": True},
        "$or": [
            {"budget": None},
            {"budget": {"$exists": False}},
            {"category": None},
            {"category": {"$exists": False}},
        ],
        "metadata.groq_enriched": {"$ne": True},
    }

    cursor = col.find(
        query,
        {"title": 1, "description": 1, "objeto": 1, "budget": 1,
         "opening_date": 1, "category": 1, "metadata": 1},
    ).sort("first_seen_at", -1).limit(limit)

    items = await cursor.to_list(length=limit)
    print(f"  Groq pass: {len(items)} items to process (limit={limit})")

    for i, doc in enumerate(items):
        if (i + 1) % 50 == 0:
            print(f"  Groq progress: {i + 1}/{len(items)}")

        try:
            result = await extractor.extract_missing_fields(
                title=doc.get("title", ""),
                description=doc.get("description", ""),
                objeto=doc.get("objeto"),
            )

            updates = {"metadata.groq_enriched": True}
            enriched = False

            if result.get("budget") and not doc.get("budget"):
                updates["budget"] = result["budget"]
                updates["currency"] = result.get("currency", "ARS")
                updates["metadata.budget_source"] = "groq_llm"
                enriched = True

            if result.get("opening_date") and not doc.get("opening_date"):
                updates["opening_date"] = result["opening_date"]
                enriched = True

            if result.get("category") and not doc.get("category"):
                updates["category"] = result["category"]
                enriched = True

            if result.get("objeto") and not doc.get("objeto"):
                updates["objeto"] = result["objeto"]
                enriched = True

            if not dry_run:
                await col.update_one({"_id": doc["_id"]}, {"$set": updates})

            if enriched:
                stats["groq_enriched"] += 1

        except Exception as e:
            stats["errors"] += 1
            if stats["errors"] < 10:
                logger.warning(f"Groq error for {doc.get('_id')}: {e}")

        await asyncio.sleep(GROQ_DELAY)

    print(f"  Groq pass done: {stats['groq_enriched']} enriched")


if __name__ == "__main__":
    asyncio.run(main())
