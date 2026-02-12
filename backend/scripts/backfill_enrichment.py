"""
Backfill enrichment for all existing licitaciones at enrichment_level=1.

Phase 1: ComprasApps items (title-only, no HTTP) — ~30 seconds
Phase 2: All other items (HTTP fetch + full pipeline) — ~33 minutes at 2s/item

Sets: objeto, category, enrichment_level=2, workflow_state=evaluando, nodo re-match

Usage:
    docker exec -w /app -e PYTHONPATH=/app licitometro-backend-1 python3 scripts/backfill_enrichment.py
"""

import asyncio
import logging
import os
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from motor.motor_asyncio import AsyncIOMotorClient

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("backfill_enrichment")

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "licitaciones_db")

HTTP_DELAY = 2.0  # seconds between HTTP fetches


async def main():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    collection = db["licitaciones"]

    total_count = await collection.count_documents({"enrichment_level": {"$in": [None, 1]}})
    logger.info(f"Total items at enrichment_level<=1: {total_count}")

    # Load utilities
    from utils.object_extractor import extract_objeto
    from services.category_classifier import get_category_classifier
    from services.nodo_matcher import get_nodo_matcher

    classifier = get_category_classifier()
    nodo_matcher = get_nodo_matcher(db)
    await nodo_matcher.reload_nodos()

    # ---- Phase 1: Title-only (ComprasApps + no source_url) ----
    logger.info("=" * 60)
    logger.info("Phase 1: Title-only enrichment (ComprasApps + no source_url)")
    logger.info("=" * 60)

    query_titleonly = {
        "enrichment_level": {"$in": [None, 1]},
        "$or": [
            {"fuente": {"$regex": "ComprasApps|comprasapps", "$options": "i"}},
            {"source_url": {"$in": [None, ""]}},
        ],
    }
    cursor = collection.find(query_titleonly)
    items_titleonly = await cursor.to_list(length=5000)
    logger.info(f"Phase 1: {len(items_titleonly)} items to process")

    stats_p1 = {"processed": 0, "objeto": 0, "category": 0, "errors": 0}

    for doc in items_titleonly:
        try:
            updates = {}
            title = doc.get("title", "")
            description = doc.get("description", "") or ""
            metadata = doc.get("metadata") or {}

            if not doc.get("objeto"):
                obj = extract_objeto(title=title, description=description, metadata=metadata)
                if obj:
                    updates["objeto"] = obj
                    stats_p1["objeto"] += 1

            if not doc.get("category"):
                objeto = updates.get("objeto", doc.get("objeto", ""))
                cat = classifier.classify(title=title, objeto=objeto)
                if not cat:
                    cat = classifier.classify(title=title, objeto=objeto, description=description[:500])
                if cat:
                    updates["category"] = cat
                    stats_p1["category"] += 1

            updates["enrichment_level"] = 2
            updates["updated_at"] = datetime.utcnow()
            if doc.get("workflow_state", "descubierta") == "descubierta":
                updates["workflow_state"] = "evaluando"

            await collection.update_one({"_id": doc["_id"]}, {"$set": updates})

            # Nodo re-match with enriched data
            await nodo_matcher.assign_nodos_to_licitacion(
                lic_id=doc["_id"],
                title=title,
                objeto=updates.get("objeto", doc.get("objeto", "")),
                description=description,
                organization=doc.get("organization", ""),
            )

            stats_p1["processed"] += 1
            if stats_p1["processed"] % 500 == 0:
                logger.info(f"Phase 1 progress: {stats_p1['processed']}/{len(items_titleonly)}")

        except Exception as e:
            stats_p1["errors"] += 1
            logger.error(f"Phase 1 error for {doc.get('_id')}: {e}")

    logger.info(f"Phase 1 complete: {stats_p1}")

    # ---- Phase 2: HTTP enrichment (non-ComprasApps with source_url) ----
    logger.info("=" * 60)
    logger.info("Phase 2: HTTP enrichment (non-ComprasApps with source_url)")
    logger.info("=" * 60)

    query_http = {
        "enrichment_level": {"$in": [None, 1]},
        "source_url": {"$nin": [None, ""]},
        "fuente": {"$not": {"$regex": "ComprasApps|comprasapps", "$options": "i"}},
    }
    cursor = collection.find(query_http)
    items_http = await cursor.to_list(length=5000)
    logger.info(f"Phase 2: {len(items_http)} items to process")

    stats_p2 = {"processed": 0, "enriched": 0, "errors": 0}

    from services.generic_enrichment import GenericEnrichmentService
    enrichment_service = GenericEnrichmentService()

    try:
        for doc in items_http:
            try:
                # Look up selectors
                fuente = doc.get("fuente", "")
                selectors = None
                if fuente:
                    import re
                    config_doc = await db.scraper_configs.find_one({
                        "name": {"$regex": re.escape(fuente), "$options": "i"},
                    })
                    if config_doc:
                        selectors = config_doc.get("selectors", {})

                updates = await enrichment_service.enrich(doc, selectors)
                if not updates:
                    updates = {}

                updates["enrichment_level"] = 2
                updates["updated_at"] = datetime.utcnow()
                if doc.get("workflow_state", "descubierta") == "descubierta":
                    updates["workflow_state"] = "evaluando"

                await collection.update_one({"_id": doc["_id"]}, {"$set": updates})

                # Nodo re-match
                await nodo_matcher.assign_nodos_to_licitacion(
                    lic_id=doc["_id"],
                    title=updates.get("title", doc.get("title", "")),
                    objeto=updates.get("objeto", doc.get("objeto", "")),
                    description=updates.get("description", doc.get("description", "")),
                    organization=doc.get("organization", ""),
                )

                stats_p2["processed"] += 1
                if updates:
                    stats_p2["enriched"] += 1

                if stats_p2["processed"] % 50 == 0:
                    logger.info(f"Phase 2 progress: {stats_p2['processed']}/{len(items_http)}")

                await asyncio.sleep(HTTP_DELAY)

            except Exception as e:
                stats_p2["errors"] += 1
                logger.error(f"Phase 2 error for {doc.get('_id')}: {e}")
    finally:
        await enrichment_service.close()

    logger.info(f"Phase 2 complete: {stats_p2}")

    # ---- Final audit ----
    logger.info("=" * 60)
    logger.info("Final audit")
    logger.info("=" * 60)

    total = await collection.count_documents({})
    l1 = await collection.count_documents({"enrichment_level": {"$in": [None, 1]}})
    l2 = await collection.count_documents({"enrichment_level": 2})
    with_objeto = await collection.count_documents({"objeto": {"$ne": None}})
    with_category = await collection.count_documents({"category": {"$ne": None}})
    descubierta = await collection.count_documents({"workflow_state": "descubierta"})
    evaluando = await collection.count_documents({"workflow_state": "evaluando"})

    logger.info(f"Total: {total}")
    logger.info(f"enrichment_level=1: {l1} ({l1/total*100:.1f}%)")
    logger.info(f"enrichment_level=2: {l2} ({l2/total*100:.1f}%)")
    logger.info(f"With objeto: {with_objeto} ({with_objeto/total*100:.1f}%)")
    logger.info(f"With category: {with_category} ({with_category/total*100:.1f}%)")
    logger.info(f"workflow=descubierta: {descubierta}")
    logger.info(f"workflow=evaluando: {evaluando}")

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
