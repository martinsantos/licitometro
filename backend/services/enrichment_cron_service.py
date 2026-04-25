"""
Enrichment Cron Service — periodically enriches licitaciones stuck at enrichment_level=1.

Runs every 30 minutes via APScheduler. Two passes:
1. Non-ComprasApps items with source_url: HTTP fetch + full enrichment pipeline
2. ComprasApps items: title-only enrichment (no HTTP needed)

CRITICAL: This service ONLY updates data fields (objeto, category, enrichment_level).
It NEVER changes workflow_state. Workflow transitions must be explicit and manual.
"""

import asyncio
import logging
import os
from datetime import datetime
from typing import Dict, Any, Optional
from utils.time import utc_now

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger("enrichment_cron")

# Limits — tuneable via env vars
MAX_HTTP_BATCH = int(os.getenv("ENRICH_MAX_HTTP_BATCH", "75"))
MAX_TITLEONLY_BATCH = int(os.getenv("ENRICH_MAX_TITLEONLY_BATCH", "300"))
MAX_RUNTIME_SECONDS = int(os.getenv("ENRICH_MAX_RUNTIME_SECONDS", str(25 * 60)))
HTTP_DELAY = float(os.getenv("ENRICH_HTTP_DELAY", "1.0"))


class EnrichmentCronService:
    """Periodic enrichment for items at enrichment_level=1."""

    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.collection = db["licitaciones"]

    async def run_enrichment_cycle(self) -> Dict[str, Any]:
        """Main entry point called by APScheduler every 30 min."""
        start = utc_now()
        logger.info("Starting enrichment cycle...")

        stats = {
            "started_at": start.isoformat(),
            "title_only": {"processed": 0, "enriched": 0, "errors": 0},
            "http": {"processed": 0, "enriched": 0, "errors": 0},
            "pliego_download": {"processed": 0, "downloaded": 0, "errors": 0},
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

        # Pass 3: Pliego PDF download for COMPR.AR items
        try:
            await self._pass_pliego_download(stats)
        except Exception as e:
            logger.error(f"Pliego download pass failed: {e}")

        stats["finished_at"] = utc_now().isoformat()
        duration = (utc_now() - start).total_seconds()
        stats["duration_seconds"] = round(duration, 1)

        logger.info(
            f"Enrichment cycle complete in {duration:.0f}s — "
            f"title-only: {stats['title_only']['enriched']}/{stats['title_only']['processed']}, "
            f"HTTP: {stats['http']['enriched']}/{stats['http']['processed']}, "
            f"Pliegos: {stats['pliego_download']['downloaded']}/{stats['pliego_download']['processed']}"
        )
        return stats

    async def _pass_title_only(self, stats: dict):
        """Enrich items that don't need HTTP: extract_objeto + classify.
        Uses a single bulk_write instead of one update_one per item."""
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
        from pymongo import UpdateOne as MongoUpdateOne
        classifier = get_category_classifier()

        now = utc_now()
        bulk_ops = []

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
                        cat = classifier.classify(title=title, objeto=objeto, description=description[:1000])
                    if cat:
                        updates["category"] = cat

                # Set enrichment level only - DO NOT auto-transition workflow state
                # Workflow transitions should be explicit business logic, not automatic
                updates["enrichment_level"] = 2
                updates["updated_at"] = now

                bulk_ops.append(MongoUpdateOne({"_id": doc["_id"]}, {"$set": updates}))
                stats["title_only"]["enriched"] += 1

            except Exception as e:
                stats["title_only"]["errors"] += 1
                logger.error(f"Title-only enrichment failed for {doc.get('_id')}: {e}")

        # Single bulk_write for all items instead of one update_one per item
        if bulk_ops:
            try:
                await self.collection.bulk_write(bulk_ops, ordered=False)
            except Exception as bw_err:
                logger.error(f"Title-only bulk_write failed: {bw_err}")

    async def _pass_http(self, stats: dict, start: datetime):
        """Enrich items with source_url via HTTP fetch + full pipeline.
        Pre-loads all scraper configs in ONE query to avoid N+1 MongoDB round-trips."""
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

        # Pre-load ALL scraper configs in one query (eliminates N+1 pattern).
        # Build a lowercase name → selectors map for O(1) lookups per item.
        all_configs = await self.db.scraper_configs.find(
            {}, {"name": 1, "selectors": 1}
        ).to_list(length=None)
        selectors_cache: Dict[str, Optional[dict]] = {
            cfg["name"].lower(): cfg.get("selectors") or {}
            for cfg in all_configs
            if cfg.get("name")
        }

        from services.generic_enrichment import GenericEnrichmentService
        enrichment_service = GenericEnrichmentService()

        try:
            for doc in items:
                # Safety: check runtime
                elapsed = (utc_now() - start).total_seconds()
                if elapsed > MAX_RUNTIME_SECONDS:
                    logger.warning(f"HTTP pass stopped: runtime {elapsed:.0f}s exceeded {MAX_RUNTIME_SECONDS}s cap")
                    break

                stats["http"]["processed"] += 1
                try:
                    # O(1) lookup from pre-loaded cache instead of per-item DB query
                    selectors = self._get_selectors_from_cache(doc.get("fuente", ""), selectors_cache)

                    updates = await enrichment_service.enrich(doc, selectors)

                    # Even if enrich() returned empty, set enrichment_level=2 to avoid re-processing
                    if not updates:
                        updates = {}

                    updates["enrichment_level"] = 2
                    updates["updated_at"] = utc_now()
                    # DO NOT auto-transition workflow state - must be explicit business logic

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
                            category=updates.get("category", doc.get("category", "")),
                        )
                    except Exception as nodo_err:
                        logger.warning(f"Nodo re-match failed for {doc.get('_id')}: {nodo_err}")

                    await self.collection.update_one(
                        {"_id": doc["_id"]},
                        {"$set": updates}
                    )
                    stats["http"]["enriched"] += 1

                    # Rate limit — polite to source servers
                    await asyncio.sleep(HTTP_DELAY)

                except Exception as e:
                    stats["http"]["errors"] += 1
                    logger.error(f"HTTP enrichment failed for {doc.get('_id')}: {e}")
        finally:
            await enrichment_service.close()

    async def _pass_pliego_download(self, stats: dict):
        """Download pliego PDFs for COMPR.AR items that have a known pliego URL
        but no local copy yet. Runs in small batches due to auth + anti-ban delays.

        Stores PDFs via pliego_storage_service so Nginx can serve them at /pliegos/...
        This makes links permanent — independent of upstream qs= token expiry.
        """
        MAX_BATCH = 5  # small: each download login + anti-ban delays

        query = {
            "metadata.comprar_pliego_url": {"$regex": "VistaPreviaPliegoCiudadano"},
            "metadata.pliego_local_url": {"$in": [None, ""]},
        }
        cursor = self.collection.find(query).limit(MAX_BATCH)
        items = await cursor.to_list(length=MAX_BATCH)

        if not items:
            return

        logger.info(f"Pliego download pass: {len(items)} items to process")

        from services.comprar_pliego_downloader import ComprarPliegoDownloader
        from services.pliego_storage_service import store_pliego

        downloader = ComprarPliegoDownloader(db=self.db)

        for doc in items:
            stats["pliego_download"]["processed"] += 1
            try:
                pliego_url = doc.get("metadata", {}).get("comprar_pliego_url", "")
                if not pliego_url:
                    continue

                lic_id = doc["_id"]
                fuente = doc.get("fuente", "COMPR.AR")
                numero = doc.get("licitacion_number") or doc.get("id_licitacion", "")

                pdf_bytes = await downloader.download_pliego_pdf(pliego_url)
                if not pdf_bytes:
                    continue

                public_url = await store_pliego(
                    db=self.db,
                    licitacion_id=lic_id,
                    pdf_bytes=pdf_bytes,
                    fuente=fuente,
                    numero=numero,
                    source_url=pliego_url,
                )
                if public_url:
                    stats["pliego_download"]["downloaded"] += 1
                    logger.info(f"Stored pliego for {numero}: {public_url} ({len(pdf_bytes)} bytes)")
                else:
                    stats["pliego_download"]["errors"] += 1

            except Exception as e:
                stats["pliego_download"]["errors"] += 1
                logger.error(f"Pliego download failed for {doc.get('_id')}: {e}")

    def _get_selectors_from_cache(self, fuente: str, cache: Dict[str, Optional[dict]]) -> Optional[dict]:
        """O(1) lookup of CSS selectors using the pre-loaded configs cache."""
        if not fuente:
            return None
        fuente_lower = fuente.lower()
        # Exact match first
        if fuente_lower in cache:
            return cache[fuente_lower]
        # Partial match fallback (scraper name may be a substring of fuente)
        for name, selectors in cache.items():
            if name in fuente_lower or fuente_lower in name:
                return selectors
        return None

    async def _get_selectors_for_fuente(self, fuente: str) -> Optional[dict]:
        """Legacy per-item DB lookup — kept for external callers.
        Use _get_selectors_from_cache() inside enrichment cycles instead."""
        if not fuente:
            return None
        import re
        config_doc = await self.db.scraper_configs.find_one({
            "name": {"$regex": re.escape(fuente), "$options": "i"},
        })
        if config_doc:
            return config_doc.get("selectors", {})
        return None

    async def _pass_groq_llm(self, stats: dict):
        """Pass 3: Use Groq LLM to extract fields from items with description
        but missing budget or category. Only runs if GROQ_API_KEY is set."""
        from services.groq_field_extractor import get_groq_field_extractor

        extractor = get_groq_field_extractor()
        if not extractor.enabled:
            logger.info("Groq LLM pass skipped (GROQ_API_KEY not set)")
            return

        MAX_GROQ_BATCH = 50
        GROQ_DELAY = 3.0  # 20 req/min = 3s between calls
        MAX_GROQ_RUNTIME = 10 * 60  # 10 min safety cap

        # Items with description but missing budget OR category, not yet processed by Groq
        query = {
            "enrichment_level": {"$gte": 2},
            "description": {"$ne": None, "$exists": True},
            "$or": [
                {"budget": None},
                {"budget": {"$exists": False}},
                {"category": None},
                {"category": {"$exists": False}},
            ],
            "metadata.groq_enriched": {"$ne": True},
        }

        cursor = self.db.licitaciones.find(
            query,
            {"title": 1, "description": 1, "objeto": 1, "budget": 1,
             "opening_date": 1, "category": 1, "metadata": 1},
        ).sort("first_seen_at", -1).limit(MAX_GROQ_BATCH)

        items = await cursor.to_list(length=MAX_GROQ_BATCH)
        if not items:
            logger.info("Groq LLM pass: no items to process")
            return

        logger.info(f"Groq LLM pass: processing {len(items)} items")
        groq_start = utc_now()

        for doc in items:
            elapsed = (utc_now() - groq_start).total_seconds()
            if elapsed > MAX_GROQ_RUNTIME:
                logger.warning(f"Groq LLM pass hit runtime cap ({MAX_GROQ_RUNTIME}s)")
                break

            stats["groq_llm"]["processed"] += 1
            try:
                result = await extractor.extract_missing_fields(
                    title=doc.get("title", ""),
                    description=doc.get("description", ""),
                    objeto=doc.get("objeto"),
                )

                updates: Dict[str, Any] = {"metadata.groq_enriched": True}
                fields_set = []

                # Budget (only if currently missing)
                if result.get("budget") and not doc.get("budget"):
                    updates["budget"] = result["budget"]
                    updates["currency"] = result.get("currency", "ARS")
                    updates["metadata.budget_source"] = "groq_llm"
                    fields_set.append("budget")

                # Opening date (only if currently missing)
                if result.get("opening_date") and not doc.get("opening_date"):
                    updates["opening_date"] = result["opening_date"]
                    fields_set.append("opening_date")

                # Category (only if currently missing)
                if result.get("category") and not doc.get("category"):
                    updates["category"] = result["category"]
                    fields_set.append("category")

                # Objeto (only if currently missing)
                if result.get("objeto") and not doc.get("objeto"):
                    updates["objeto"] = result["objeto"]
                    fields_set.append("objeto")

                await self.db.licitaciones.update_one(
                    {"_id": doc["_id"]},
                    {"$set": updates},
                )

                if fields_set:
                    stats["groq_llm"]["enriched"] += 1
                    logger.debug(f"Groq enriched {doc['_id']}: {', '.join(fields_set)}")

            except Exception as e:
                stats["groq_llm"]["errors"] += 1
                logger.warning(f"Groq LLM error for {doc.get('_id')}: {e}")

            await asyncio.sleep(GROQ_DELAY)

        logger.info(
            f"Groq LLM pass done: {stats['groq_llm']['enriched']}/{stats['groq_llm']['processed']} enriched, "
            f"{stats['groq_llm']['errors']} errors"
        )


# Singleton
_instance: Optional[EnrichmentCronService] = None


def get_enrichment_cron_service(db: AsyncIOMotorDatabase) -> EnrichmentCronService:
    """Get or create singleton EnrichmentCronService instance."""
    global _instance
    if _instance is None:
        _instance = EnrichmentCronService(db)
    return _instance
