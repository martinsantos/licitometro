"""
Cross-Source Matching and Enrichment Service.

Finds related licitaciones across different sources (COMPR.AR, Boletín Oficial,
ComprasApps, etc.) and enables data enrichment by merging fields from multiple sources.
"""

import logging
import re
from datetime import datetime
from typing import List, Dict, Any, Optional

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from db.models import licitacion_entity

logger = logging.getLogger("cross_source_service")


class CrossSourceService:
    """Find and merge licitaciones across procurement sources."""

    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db

    async def find_related(self, lic_doc: dict, limit: int = 10) -> List[dict]:
        """
        Find items from OTHER sources that match this licitación.

        Matches by:
        1. proceso_id (canonical, most reliable)
        2. expedient_number (fuzzy)
        3. licitacion_number (exact)
        """
        proceso_id = lic_doc.get("proceso_id")
        expediente = lic_doc.get("expedient_number")
        lic_number = lic_doc.get("licitacion_number")
        fuente = lic_doc.get("fuente", "")
        lic_id = str(lic_doc.get("_id", ""))

        query_parts = []
        if proceso_id:
            query_parts.append({"proceso_id": proceso_id})
        if expediente:
            # Fuzzy match: strip common prefixes, match core number
            cleaned = re.sub(r"^(Expte\.?|Expediente|EX[-\s]*)\s*N?[°º]?\s*", "", expediente, flags=re.IGNORECASE).strip()
            if cleaned and len(cleaned) >= 3:
                query_parts.append({"expedient_number": {"$regex": re.escape(cleaned), "$options": "i"}})
        if lic_number:
            query_parts.append({"licitacion_number": lic_number})

        if not query_parts:
            return []

        # Exclude self and items from same source
        exclude_filter: Dict[str, Any] = {"fuente": {"$ne": fuente}}
        if lic_id:
            try:
                exclude_filter["_id"] = {"$ne": ObjectId(lic_id)}
            except Exception:
                pass

        cursor = self.db.licitaciones.find(
            {"$and": [{"$or": query_parts}, exclude_filter]}
        ).limit(limit)

        results = []
        async for doc in cursor:
            results.append(licitacion_entity(doc))
        return results

    async def find_related_by_id(self, licitacion_id: str, limit: int = 10) -> List[dict]:
        """Find related items for a licitación by its ID."""
        try:
            doc = await self.db.licitaciones.find_one({"_id": ObjectId(licitacion_id)})
        except Exception:
            return []
        if not doc:
            return []
        return await self.find_related(doc, limit=limit)

    async def merge_source_data(self, base_id: str, related_id: str) -> Optional[dict]:
        """
        Merge data from a related item into the base item.
        Does NOT delete the related item — both records are preserved.
        Only fills in missing fields on the base item.
        """
        try:
            base = await self.db.licitaciones.find_one({"_id": ObjectId(base_id)})
            related = await self.db.licitaciones.find_one({"_id": ObjectId(related_id)})
        except Exception:
            return None

        if not base or not related:
            return None

        updates: Dict[str, Any] = {}

        # Fill missing text fields from related
        for field in ("description", "objeto", "expedient_number", "licitacion_number",
                       "contact", "budget", "currency", "opening_date", "expiration_date",
                       "location", "category", "tipo_procedimiento"):
            if not base.get(field) and related.get(field):
                updates[field] = related[field]

        # Merge attached_files
        base_files = base.get("attached_files") or []
        related_files = related.get("attached_files") or []
        if related_files:
            existing_urls = {f.get("url") for f in base_files if f.get("url")}
            new_files = [f for f in related_files if f.get("url") and f.get("url") not in existing_urls]
            if new_files:
                updates["attached_files"] = base_files + new_files

        # Add related fuente to fuentes[]
        base_fuentes = base.get("fuentes") or []
        related_fuente = related.get("fuente", "")
        if related_fuente and related_fuente not in base_fuentes:
            updates["fuentes"] = base_fuentes + [related_fuente]

        # Add source_url to source_urls dict
        base_source_urls = base.get("source_urls") or {}
        related_source_url = related.get("source_url")
        if related_source_url and related_fuente:
            key = related_fuente.lower().replace(" ", "_").replace(".", "")
            if key not in base_source_urls:
                base_source_urls[key] = str(related_source_url)
                updates["source_urls"] = base_source_urls

        if not updates:
            return licitacion_entity(base)

        updates["updated_at"] = datetime.utcnow()

        # Track merge in metadata
        meta = base.get("metadata") or {}
        merge_log = meta.get("cross_source_merges", [])
        merge_log.append({
            "from_id": str(related["_id"]),
            "from_fuente": related_fuente,
            "fields_merged": list(updates.keys()),
            "timestamp": datetime.utcnow().isoformat(),
        })
        meta["cross_source_merges"] = merge_log[-10:]  # Keep last 10
        updates["metadata"] = meta

        await self.db.licitaciones.update_one(
            {"_id": ObjectId(base_id)},
            {"$set": updates}
        )

        updated = await self.db.licitaciones.find_one({"_id": ObjectId(base_id)})
        return licitacion_entity(updated) if updated else None

    async def auto_link_after_scrape(self, new_items: List[dict]) -> int:
        """
        After a scrape run, find cross-source matches for new items.
        Only adds to fuentes[] and source_urls — does NOT auto-merge data.
        Returns count of items linked.
        """
        linked = 0
        for item in new_items:
            proceso_id = item.get("proceso_id")
            if not proceso_id:
                continue

            # Find matches in OTHER sources
            matches = await self.db.licitaciones.find(
                {
                    "proceso_id": proceso_id,
                    "fuente": {"$ne": item.get("fuente", "")},
                    "_id": {"$ne": item.get("_id")},
                },
                {"_id": 1, "fuente": 1, "source_url": 1, "fuentes": 1, "source_urls": 1}
            ).to_list(length=5)

            if not matches:
                continue

            # Cross-link: add each other's fuentes
            item_fuente = item.get("fuente", "")
            item_source_url = str(item.get("source_url", "")) if item.get("source_url") else ""

            for match in matches:
                match_fuente = match.get("fuente", "")
                # Update the matched doc to include our fuente
                await self.db.licitaciones.update_one(
                    {"_id": match["_id"]},
                    {
                        "$addToSet": {"fuentes": item_fuente},
                        "$set": {
                            f"source_urls.{item_fuente.lower().replace(' ', '_').replace('.', '')}": item_source_url,
                            "updated_at": datetime.utcnow(),
                        }
                    }
                )
                # Update our item to include matched fuente
                match_url = str(match.get("source_url", "")) if match.get("source_url") else ""
                await self.db.licitaciones.update_one(
                    {"_id": item.get("_id")},
                    {
                        "$addToSet": {"fuentes": match_fuente},
                        "$set": {
                            f"source_urls.{match_fuente.lower().replace(' ', '_').replace('.', '')}": match_url,
                            "updated_at": datetime.utcnow(),
                        }
                    }
                )
                linked += 1

        return linked
