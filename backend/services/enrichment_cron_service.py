"""
Enrichment Cron Service — periodically enriches licitaciones stuck at enrichment_level=1.

Runs every 30 minutes via APScheduler. Two passes:
1. Non-ComprasApps items with source_url: HTTP fetch + full enrichment pipeline
2. ComprasApps items: title-only enrichment (no HTTP needed)

After enrichment, transitions workflow_state from descubierta → evaluando,
which unlocks the auto_update_service (8am cron) for ongoing monitoring.
"""

import asyncio
import logging
from datetime import datetime
from typing import Dict, Any, Optional

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger("enrichment_cron")

# Limits
MAX_HTTP_BATCH = 50        # max items per HTTP enrichment run
MAX_TITLEONLY_BATCH = 200  # max items per title-only run
MAX_RUNTIME_SECONDS = 25 * 60  # 25 min safety cap for HTTP pass
HTTP_DELAY = 2.0           # seconds between HTTP fetches


class EnrichmentCronService:
    """Periodic enrichment for items at enrichment_level=1."""

    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.collection = db["licitaciones"]

    async def run_enrichment_cycle(self) -> Dict[str, Any]:
        """Main entry point called by APScheduler every 30 min."""
        start = datetime.utcnow()
        logger.info("Starting enrichment cycle...")

        stats = {
            "started_at": start.isoformat(),
            "title_only": {"processed": 0, "enriched": 0, "errors": 0},
            "http": {"processed": 0, "enriched": 0, "errors": 0},
        }

        # Pass 1: Title-only enrichment (ComprasApps + items without usable source_url)
        try:
            await self._pass_title_only(stats)
        except Exception as e:
            logger.error(f"Title-only pass failed: {e}")

        # Pass 2: HTTP enrichment (items with source_url, non-ComprasApps)
        try:
            await self._pass_http(stats, start)
        except Exception as e:
            logger.error(f"HTTP pass failed: {e}")

        stats["finished_at"] = datetime.utcnow().isoformat()
        duration = (datetime.utcnow() - start).total_seconds()
        stats["duration_seconds"] = round(duration, 1)

        logger.info(
            f"Enrichment cycle complete in {duration:.0f}s — "
            f"title-only: {stats['title_only']['enriched']}/{stats['title_only']['processed']}, "
            f"HTTP: {stats['http']['enriched']}/{stats['http']['processed']}"
        )
        return stats

    async def _pass_title_only(self, stats: dict):
        """Enrich items that don't need HTTP: extract_objeto + classify + workflow transition."""
        # ComprasApps items OR items without source_url
        query = {
            "enrichment_level": {"$in": [None, 1]},
            "$or": [
                {"fuente": {"$regex": "ComprasApps|comprasapps", "$options": "i"}},
                {"source_url": {"$in": [None, ""]}},
            ],
        }
        cursor = self.collection.find(query).limit(MAX_TITLEONLY_BATCH)
        items = await cursor.to_list(length=MAX_TITLEONLY_BATCH)

        if not items:
            logger.info("Title-only pass: no items to process")
            return

        logger.info(f"Title-only pass: processing {len(items)} items")

        from utils.object_extractor import extract_objeto
        from services.category_classifier import get_category_classifier
        classifier = get_category_classifier()

        for doc in items:
            stats["title_only"]["processed"] += 1
            try:
                updates: Dict[str, Any] = {}
                title = doc.get("title", "")
                description = doc.get("description", "") or ""
                metadata = doc.get("metadata") or {}

                # Extract objeto
                if not doc.get("objeto"):
                    obj = extract_objeto(title=title, description=description, metadata=metadata)
                    if obj:
                        updates["objeto"] = obj

                # Classify category
                if not doc.get("category"):
                    objeto = updates.get("objeto", doc.get("objeto", ""))
                    cat = classifier.classify(title=title, objeto=objeto)
                    if not cat:
                        cat = classifier.classify(title=title, objeto=objeto, description=description[:500])
                    if cat:
                        updates["category"] = cat

                # Set enrichment level + workflow
                updates["enrichment_level"] = 2
                updates["updated_at"] = datetime.utcnow()
                if doc.get("workflow_state", "descubierta") == "descubierta":
                    updates["workflow_state"] = "evaluando"

                await self.collection.update_one(
                    {"_id": doc["_id"]},
                    {"$set": updates}
                )
                stats["title_only"]["enriched"] += 1

            except Exception as e:
                stats["title_only"]["errors"] += 1
                logger.error(f"Title-only enrichment failed for {doc.get('_id')}: {e}")

    async def _pass_http(self, stats: dict, start: datetime):
        """Enrich items with source_url via HTTP fetch + full pipeline."""
        query = {
            "enrichment_level": {"$in": [None, 1]},
            "source_url": {"$nin": [None, ""]},
            "fuente": {"$not": {"$regex": "ComprasApps|comprasapps", "$options": "i"}},
        }
        cursor = self.collection.find(query).limit(MAX_HTTP_BATCH)
        items = await cursor.to_list(length=MAX_HTTP_BATCH)

        if not items:
            logger.info("HTTP pass: no items to process")
            return

        logger.info(f"HTTP pass: processing {len(items)} items")

        from services.generic_enrichment import GenericEnrichmentService
        enrichment_service = GenericEnrichmentService()

        try:
            for doc in items:
                # Safety: check runtime
                elapsed = (datetime.utcnow() - start).total_seconds()
                if elapsed > MAX_RUNTIME_SECONDS:
                    logger.warning(f"HTTP pass stopped: runtime {elapsed:.0f}s exceeded {MAX_RUNTIME_SECONDS}s cap")
                    break

                stats["http"]["processed"] += 1
                try:
                    # Look up scraper config for CSS selectors
                    selectors = await self._get_selectors_for_fuente(doc.get("fuente", ""))

                    updates = await enrichment_service.enrich(doc, selectors)

                    # Even if enrich() returned empty, set enrichment_level=2 to avoid re-processing
                    if not updates:
                        updates = {}

                    updates["enrichment_level"] = 2
                    updates["updated_at"] = datetime.utcnow()
                    if doc.get("workflow_state", "descubierta") == "descubierta":
                        updates["workflow_state"] = "evaluando"

                    # Re-run nodo matching with enriched data
                    try:
                        from services.nodo_matcher import get_nodo_matcher
                        nodo_matcher = get_nodo_matcher(self.db)
                        await nodo_matcher.assign_nodos_to_licitacion(
                            lic_id=doc["_id"],
                            title=updates.get("title", doc.get("title", "")),
                            objeto=updates.get("objeto", doc.get("objeto", "")),
                            description=updates.get("description", doc.get("description", "")),
                            organization=doc.get("organization", ""),
                        )
                    except Exception as nodo_err:
                        logger.warning(f"Nodo re-match failed for {doc.get('_id')}: {nodo_err}")

                    await self.collection.update_one(
                        {"_id": doc["_id"]},
                        {"$set": updates}
                    )
                    stats["http"]["enriched"] += 1

                    # Rate limit
                    await asyncio.sleep(HTTP_DELAY)

                except Exception as e:
                    stats["http"]["errors"] += 1
                    logger.error(f"HTTP enrichment failed for {doc.get('_id')}: {e}")
        finally:
            await enrichment_service.close()

    async def _get_selectors_for_fuente(self, fuente: str) -> Optional[dict]:
        """Look up CSS selectors from scraper config for a given fuente name."""
        if not fuente:
            return None
        import re
        config_doc = await self.db.scraper_configs.find_one({
            "name": {"$regex": re.escape(fuente), "$options": "i"},
        })
        if config_doc:
            return config_doc.get("selectors", {})
        return None


# Singleton
_instance: Optional[EnrichmentCronService] = None


def get_enrichment_cron_service(db: AsyncIOMotorDatabase) -> EnrichmentCronService:
    """Get or create singleton EnrichmentCronService instance."""
    global _instance
    if _instance is None:
        _instance = EnrichmentCronService(db)
    return _instance
