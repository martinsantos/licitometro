"""
Enrichment Service - Orchestrates 3 levels of licitacion enrichment.

Level 1: Basic scraping data (from initial scrape)
Level 2: Detailed data (cronograma, items, garantias, etc.)
Level 3: Document download (PDFs, pliegos)
"""

import logging
import os
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any, List

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger("enrichment_service")

STORAGE_BASE = Path(os.environ.get("STORAGE_BASE", str(Path(__file__).parent.parent / "storage")))
DOCUMENTS_DIR = STORAGE_BASE / "documents"


class EnrichmentService:
    """Orchestrates multi-level enrichment of licitaciones."""

    def __init__(self, database: AsyncIOMotorDatabase):
        self.db = database
        self.collection = database["licitaciones"]

    async def get_enrichment_status(self, lic_id: str) -> Dict[str, Any]:
        """Get current enrichment level and metadata for a licitacion."""
        query_id = lic_id
        try:
            query_id = ObjectId(lic_id)
        except Exception:
            pass

        lic = await self.collection.find_one(
            {"_id": query_id},
            {"enrichment_level": 1, "last_enrichment": 1, "document_count": 1, "fuente": 1}
        )
        if not lic:
            return None

        return {
            "lic_id": lic_id,
            "enrichment_level": lic.get("enrichment_level", 1),
            "last_enrichment": lic.get("last_enrichment"),
            "document_count": lic.get("document_count", 0),
            "fuente": lic.get("fuente"),
        }

    async def mark_enriched(self, lic_id: str, level: int, fields_updated: int = 0):
        """Mark a licitacion as enriched to a given level."""
        query_id = lic_id
        try:
            query_id = ObjectId(lic_id)
        except Exception:
            pass

        update = {
            "enrichment_level": level,
            "last_enrichment": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }

        await self.collection.update_one(
            {"_id": query_id},
            {"$set": update}
        )
        logger.info(f"Marked licitacion {lic_id} as enrichment level {level} ({fields_updated} fields)")

    async def store_document_metadata(self, lic_id: str, documents: List[Dict[str, Any]]):
        """Store document metadata and update document count."""
        query_id = lic_id
        try:
            query_id = ObjectId(lic_id)
        except Exception:
            pass

        await self.collection.update_one(
            {"_id": query_id},
            {
                "$set": {
                    "attached_files": documents,
                    "document_count": len(documents),
                    "enrichment_level": 3,
                    "last_enrichment": datetime.utcnow(),
                    "updated_at": datetime.utcnow(),
                }
            }
        )
        logger.info(f"Stored {len(documents)} document(s) for licitacion {lic_id}")

    def get_document_storage_path(self, lic_id: str) -> Path:
        """Get the storage path for a licitacion's documents."""
        doc_path = DOCUMENTS_DIR / lic_id
        doc_path.mkdir(parents=True, exist_ok=True)
        return doc_path


# Singleton
_enrichment_service: Optional[EnrichmentService] = None


def get_enrichment_service(database: AsyncIOMotorDatabase) -> EnrichmentService:
    global _enrichment_service
    if _enrichment_service is None:
        _enrichment_service = EnrichmentService(database)
    return _enrichment_service
