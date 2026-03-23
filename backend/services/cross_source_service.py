"""
Cross-Source Matching and Enrichment Service.

Finds related licitaciones across different sources (COMPR.AR, Boletín Oficial,
ComprasApps, etc.) and enables data enrichment by merging fields from multiple sources.
"""

import logging
import re
from datetime import datetime
from typing import List, Dict, Any, Optional
from utils.time import utc_now

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from db.models import licitacion_entity
from utils.proceso_id import extract_identifiers_from_text, normalize_proceso_id

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

        updates["updated_at"] = utc_now()

        # Track merge in metadata
        meta = base.get("metadata") or {}
        merge_log = meta.get("cross_source_merges", [])
        merge_log.append({
            "from_id": str(related["_id"]),
            "from_fuente": related_fuente,
            "fields_merged": list(updates.keys()),
            "timestamp": utc_now().isoformat(),
        })
        meta["cross_source_merges"] = merge_log[-10:]  # Keep last 10
        updates["metadata"] = meta

        await self.db.licitaciones.update_one(
            {"_id": ObjectId(base_id)},
            {"$set": updates}
        )

        updated = await self.db.licitaciones.find_one({"_id": ObjectId(base_id)})
        return licitacion_entity(updated) if updated else None

    async def hunt_cross_sources(
        self, lic_id: str, lic_doc: dict, enrichment_updates: dict
    ) -> Dict[str, Any]:
        """
        After enrichment, extract identifiers from text and search for
        related items across sources. Merges data from matches.

        Returns summary: {matches_found, merged_from, fields_merged}
        """
        result: Dict[str, Any] = {"matches_found": 0, "merged_from": [], "fields_merged": []}

        # Combine original doc fields with enrichment updates
        title = enrichment_updates.get("title", lic_doc.get("title", ""))
        objeto = enrichment_updates.get("objeto", lic_doc.get("objeto", ""))
        description = enrichment_updates.get("description", lic_doc.get("description", ""))
        fuente = lic_doc.get("fuente", "")

        # Step 1: Extract identifiers from text
        ids = extract_identifiers_from_text(title, description, objeto)

        # Step 2: Populate structured fields if missing
        field_updates: Dict[str, Any] = {}
        if ids["expedient_number"] and not lic_doc.get("expedient_number"):
            field_updates["expedient_number"] = ids["expedient_number"]
        if ids["licitacion_number"] and not lic_doc.get("licitacion_number"):
            field_updates["licitacion_number"] = ids["licitacion_number"]

        # Step 3: Generate/update proceso_id
        exp = field_updates.get("expedient_number", lic_doc.get("expedient_number"))
        lic_num = field_updates.get("licitacion_number", lic_doc.get("licitacion_number"))
        new_pid = normalize_proceso_id(
            expedient_number=exp, licitacion_number=lic_num, title=title, fuente=fuente
        )
        if new_pid and new_pid != lic_doc.get("proceso_id"):
            field_updates["proceso_id"] = new_pid

        # Write extracted fields to DB
        if field_updates:
            try:
                await self.db.licitaciones.update_one(
                    {"_id": ObjectId(lic_id)},
                    {"$set": field_updates}
                )
            except Exception as e:
                logger.warning(f"Hunter: failed to save extracted fields for {lic_id}: {e}")

        # Step 4: Find related using structured fields
        search_doc = {**lic_doc, **field_updates}
        search_doc["_id"] = ObjectId(lic_id)
        matches = await self.find_related(search_doc, limit=5)

        # Step 5: Fallback regex search if no matches and we have numbers
        if not matches and ids["numbers"]:
            or_clauses = []
            for number in ids["numbers"][:3]:
                escaped = re.escape(number)
                or_clauses.append({"licitacion_number": {"$regex": escaped}})
                or_clauses.append({"title": {"$regex": escaped, "$options": "i"}})
            try:
                cursor = self.db.licitaciones.find({
                    "$or": or_clauses,
                    "fuente": {"$ne": fuente},
                    "_id": {"$ne": ObjectId(lic_id)},
                }).limit(5)
                async for doc in cursor:
                    matches.append(licitacion_entity(doc))
            except Exception as e:
                logger.warning(f"Hunter fallback search failed for {lic_id}: {e}")

        # Step 5b: Title-keyword text search as last resort
        if not matches and title:
            text_query = self._build_title_search_query(title)
            if text_query:
                try:
                    cursor = self.db.licitaciones.find(
                        {
                            "$text": {"$search": text_query},
                            "fuente": {"$ne": fuente},
                            "_id": {"$ne": ObjectId(lic_id)},
                        },
                        {"score": {"$meta": "textScore"}},
                    ).sort([("score", {"$meta": "textScore"})]).limit(3)
                    async for doc in cursor:
                        # Only accept high-confidence text matches
                        score = doc.get("score", 0)
                        if score >= 3.0:
                            matches.append(licitacion_entity(doc))
                except Exception as e:
                    logger.debug(f"Hunter text search failed for {lic_id}: {e}")

        if not matches:
            return result

        # Step 6: Merge data from each match
        all_merged_fields: set = set()
        for match in matches:
            match_id = match.get("id") or str(match.get("_id", ""))
            if not match_id:
                continue
            merged = await self.merge_source_data(lic_id, match_id)
            if merged:
                # Check what was actually merged by looking at cross_source_merges log
                meta = merged.get("metadata") or {}
                merges = meta.get("cross_source_merges") or []
                if merges:
                    last_merge = merges[-1]
                    merged_fields = last_merge.get("fields_merged", [])
                    all_merged_fields.update(merged_fields)
                    result["merged_from"].append({
                        "id": match_id,
                        "fuente": match.get("fuente", ""),
                        "title": (match.get("title") or "")[:100],
                    })

        result["matches_found"] = len(result["merged_from"])
        result["fields_merged"] = list(all_merged_fields)

        if result["matches_found"]:
            logger.info(
                f"Hunter: {lic_id} matched {result['matches_found']} cross-source items, "
                f"merged fields: {result['fields_merged']}"
            )

        return result

    @staticmethod
    def _build_title_search_query(title: str) -> Optional[str]:
        """Extract significant keywords from title for MongoDB $text search.
        Returns a quoted phrase of 3+ significant words, or None."""
        # Spanish stopwords common in procurement titles
        stopwords = {
            "de", "del", "la", "las", "los", "el", "en", "y", "a", "para",
            "por", "con", "un", "una", "se", "al", "es", "que", "su", "o",
            "no", "lo", "le", "da", "e", "n", "varios", "varias", "sobre",
        }
        words = re.sub(r"[^\w\s]", " ", title.lower()).split()
        significant = [w for w in words if w not in stopwords and len(w) >= 4]
        if len(significant) < 3:
            return None
        # Use up to 5 most significant words as an AND query (no quotes = AND in $text)
        return " ".join(significant[:5])

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
                            "updated_at": utc_now(),
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
                            "updated_at": utc_now(),
                        }
                    }
                )
                linked += 1

        return linked
