"""
Backfill script: Populate `objeto` field and improve poor titles for existing licitaciones.

Run via:
    docker exec -w /app -e PYTHONPATH=/app licitometro-backend python3 scripts/backfill_objeto.py

This script:
1. COMPR.AR records: Promotes "Nombre descriptivo del proceso" to title, extracts objeto from pliego fields
2. Boletin records: Extracts objeto from description text
3. All others: Synthesizes objeto from title+description via object_extractor
4. Re-classifies category where missing and objeto is now available
5. Reports stats per source
"""

import asyncio
import os
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "licitaciones_db")


async def backfill():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    collection = db["licitaciones"]

    from utils.object_extractor import extract_objeto, is_poor_title
    from services.category_classifier import get_category_classifier

    classifier = get_category_classifier()

    total = await collection.count_documents({})
    print(f"Connected to {MONGO_URL}/{DB_NAME}")
    print(f"Total licitaciones: {total}")
    print()

    stats = defaultdict(lambda: {"total": 0, "objeto_added": 0, "title_improved": 0, "category_added": 0})

    cursor = collection.find({})
    processed = 0

    async for doc in cursor:
        processed += 1
        fuente = doc.get("fuente", "unknown")
        stats[fuente]["total"] += 1
        updates = {}

        title = doc.get("title", "")
        description = doc.get("description", "")
        metadata = doc.get("metadata", {}) or {}
        pliego = metadata.get("comprar_pliego_fields", {})
        if not isinstance(pliego, dict):
            pliego = {}

        # --- 1. Improve title for COMPR.AR records ---
        if "COMPR.AR" in fuente and is_poor_title(title):
            nombre_desc = pliego.get("Nombre descriptivo del proceso") or pliego.get("Nombre descriptivo de proceso")
            if nombre_desc and len(nombre_desc.strip()) > 10:
                updates["title"] = nombre_desc.strip()
                stats[fuente]["title_improved"] += 1

        # --- 2. Extract objeto ---
        if not doc.get("objeto"):
            # For COMPR.AR: try pliego fields first
            if pliego:
                for key in ("Objeto de la contratación", "Objeto de la contratacion", "Objeto"):
                    val = pliego.get(key)
                    if val and len(val.strip()) > 10:
                        updates["objeto"] = val.strip()[:200]
                        break

            # For Boletin: extract from description
            if "objeto" not in updates and "Boletin" in fuente and description:
                from scrapers.boletin_oficial_mendoza_scraper import BoletinOficialMendozaScraper
                obj = BoletinOficialMendozaScraper._extract_objeto_from_text(description)
                if obj:
                    updates["objeto"] = obj[:200]
                    # Also improve Boletin title if it's just "Decreto 140" etc.
                    if is_poor_title(title) and obj:
                        updates["title"] = f"{title} - {obj[:100]}"
                        stats[fuente]["title_improved"] += 1

            # For all others: use generic extractor
            if "objeto" not in updates:
                obj = extract_objeto(
                    title=updates.get("title", title),
                    description=description,
                    metadata=metadata,
                )
                if obj:
                    updates["objeto"] = obj

            if "objeto" in updates:
                stats[fuente]["objeto_added"] += 1

        # --- 3. Re-classify category if missing ---
        if not doc.get("category"):
            objeto = updates.get("objeto", doc.get("objeto", ""))
            effective_title = updates.get("title", title)
            cat = classifier.classify(title=effective_title, objeto=objeto)
            if not cat and description:
                cat = classifier.classify(title=effective_title, objeto=objeto, description=description[:500])
            if cat:
                updates["category"] = cat
                stats[fuente]["category_added"] += 1

        # --- Apply updates ---
        if updates:
            await collection.update_one({"_id": doc["_id"]}, {"$set": updates})

        if processed % 500 == 0:
            print(f"  Processed {processed}/{total}...")

    print(f"\nDone! Processed {processed} records.\n")
    print(f"{'Source':<40} {'Total':>6} {'Objeto+':>8} {'Title+':>8} {'Cat+':>6}")
    print("-" * 72)
    for fuente in sorted(stats.keys()):
        s = stats[fuente]
        print(f"{fuente:<40} {s['total']:>6} {s['objeto_added']:>8} {s['title_improved']:>8} {s['category_added']:>6}")

    # Summary
    total_obj = sum(s["objeto_added"] for s in stats.values())
    total_title = sum(s["title_improved"] for s in stats.values())
    total_cat = sum(s["category_added"] for s in stats.values())
    print("-" * 72)
    print(f"{'TOTAL':<40} {processed:>6} {total_obj:>8} {total_title:>8} {total_cat:>6}")

    client.close()


if __name__ == "__main__":
    asyncio.run(backfill())
