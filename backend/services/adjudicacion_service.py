"""Adjudicaciones service — CRUD, indexes, analytics queries, historical references.

Single point of access to the `adjudicaciones` collection. Keeps analytics logic
out of routers and keeps index creation idempotent.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional
from datetime import datetime, timedelta
import logging
import hashlib

from pymongo import ASCENDING, DESCENDING, TEXT

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from db.adjudicacion_entity import adjudicacion_entity
from utils.time import utc_now

logger = logging.getLogger("adjudicacion_service")


class AdjudicacionService:
    def __init__(self, db):
        self.db = db
        self.col = db.adjudicaciones
        self._indexes_ready = False

    # ── Indexes ──────────────────────────────────────────────────────
    async def ensure_indexes(self) -> None:
        if self._indexes_ready:
            return
        try:
            await self.col.create_index([("ocds_ocid", ASCENDING)], sparse=True, name="ocds_ocid_idx")
            await self.col.create_index([("dedup_key", ASCENDING)], unique=True, sparse=True, name="dedup_key_uniq")
            await self.col.create_index([("proceso_id", ASCENDING)], sparse=True, name="proceso_id_idx")
            await self.col.create_index([("licitacion_id", ASCENDING)], sparse=True, name="licitacion_id_idx")
            await self.col.create_index([("category", ASCENDING), ("fecha_adjudicacion", DESCENDING)], name="cat_fecha_idx")
            await self.col.create_index([("adjudicatario", ASCENDING), ("fecha_adjudicacion", DESCENDING)], name="supplier_fecha_idx")
            await self.col.create_index([("supplier_id", ASCENDING)], sparse=True, name="cuit_idx")
            await self.col.create_index(
                [("objeto", TEXT), ("adjudicatario", TEXT)],
                default_language="spanish",
                name="adj_text_idx",
            )
            self._indexes_ready = True
        except Exception as e:
            logger.warning(f"ensure_indexes for adjudicaciones failed: {e}")

    # ── Dedup key ────────────────────────────────────────────────────
    @staticmethod
    def compute_dedup_key(fuente: str, ocds_ocid: Optional[str], adjudicatario: str,
                          fecha: Optional[datetime], monto: Optional[float]) -> str:
        """Stable identity for an award (idempotent backfills)."""
        if ocds_ocid:
            return f"{fuente}:ocid:{ocds_ocid}:{(adjudicatario or '').lower()[:40]}"
        parts = [
            fuente,
            (adjudicatario or "").lower().strip()[:80],
            fecha.date().isoformat() if fecha else "nodate",
            f"{monto:.2f}" if monto else "nomonto",
        ]
        raw = "|".join(parts)
        return f"{fuente}:hash:{hashlib.md5(raw.encode('utf-8')).hexdigest()[:16]}"

    # ── Upsert ───────────────────────────────────────────────────────
    async def upsert(self, doc: Dict[str, Any]) -> str:
        """Upsert by dedup_key. Returns the _id of the doc (existing or new)."""
        await self.ensure_indexes()
        dedup_key = doc.get("dedup_key")
        if not dedup_key:
            raise ValueError("dedup_key is required for upsert")

        doc.setdefault("fecha_ingesta", utc_now())
        now = utc_now()

        result = await self.col.update_one(
            {"dedup_key": dedup_key},
            {
                "$setOnInsert": {**doc, "created_at": now},
                "$set": {"updated_at": now},
            },
            upsert=True,
        )
        if result.upserted_id:
            return str(result.upserted_id)
        found = await self.col.find_one({"dedup_key": dedup_key}, {"_id": 1})
        return str(found["_id"]) if found else ""

    # ── Queries ──────────────────────────────────────────────────────
    async def find_historical_references(
        self,
        licitacion: Dict[str, Any],
        limit: int = 10,
        min_score: float = 3.0,
    ) -> List[Dict[str, Any]]:
        """Return past awards similar in objeto/categoría to the given licitación.

        Strategy:
        1. $text search on objeto+adjudicatario for top signal words of the licitación
        2. Fallback to same category, most recent
        Safe to call on any licitación — returns [] if nothing matches.
        """
        await self.ensure_indexes()

        results: List[Dict[str, Any]] = []
        objeto = licitacion.get("objeto") or licitacion.get("title") or ""
        category = licitacion.get("category")
        budget = licitacion.get("budget")

        keywords = [w for w in objeto.split() if len(w) >= 5][:6]
        seen_ids: set = set()

        if keywords:
            query = " ".join(keywords)
            try:
                cursor = self.col.find(
                    {"$text": {"$search": query}},
                    {"score": {"$meta": "textScore"}},
                ).sort([("score", {"$meta": "textScore"})]).limit(limit * 2)
                async for doc in cursor:
                    score = doc.get("score") if isinstance(doc.get("score"), (int, float)) else None
                    if score is not None and score < min_score:
                        continue
                    if str(doc["_id"]) in seen_ids:
                        continue
                    seen_ids.add(str(doc["_id"]))
                    entry = adjudicacion_entity(doc)
                    entry["similarity_score"] = score
                    entry["match_type"] = "text"
                    results.append(entry)
                    if len(results) >= limit:
                        return results
            except Exception as e:
                logger.warning(f"find_historical_references text search failed: {e}")

        # Category fallback (magnitude-bounded)
        if category and len(results) < limit:
            try:
                q: Dict[str, Any] = {"category": category}
                if budget and budget > 0:
                    q["monto_adjudicado"] = {"$gte": budget * 0.1, "$lte": budget * 10}
                cursor = self.col.find(q).sort("fecha_adjudicacion", DESCENDING).limit(limit * 2)
                async for doc in cursor:
                    if str(doc["_id"]) in seen_ids:
                        continue
                    seen_ids.add(str(doc["_id"]))
                    entry = adjudicacion_entity(doc)
                    entry["match_type"] = "category"
                    results.append(entry)
                    if len(results) >= limit:
                        break
            except Exception as e:
                logger.warning(f"find_historical_references category search failed: {e}")

        return results

    async def price_stats(self, adjudicaciones: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        """min/median/max from a list of adjudicaciones."""
        montos = sorted([a["monto_adjudicado"] for a in adjudicaciones if a.get("monto_adjudicado")])
        if not montos:
            return None
        return {
            "min": montos[0],
            "median": montos[len(montos) // 2],
            "max": montos[-1],
            "sample_size": len(montos),
        }

    # ── Analytics queries ────────────────────────────────────────────
    async def top_suppliers(
        self,
        since: Optional[datetime] = None,
        category: Optional[str] = None,
        limit: int = 20,
        min_confidence: float = 0.0,
    ) -> List[Dict[str, Any]]:
        match: Dict[str, Any] = {
            "adjudicatario": {"$exists": True, "$ne": ""},
            "extraction_confidence": {"$gte": min_confidence},
        }
        if since:
            match["fecha_adjudicacion"] = {"$gte": since}
        if category:
            match["category"] = category

        pipeline = [
            {"$match": match},
            {
                "$group": {
                    "_id": "$adjudicatario",
                    "count": {"$sum": 1},
                    "monto_total": {"$sum": {"$ifNull": ["$monto_adjudicado", 0]}},
                    "categories": {"$addToSet": "$category"},
                    "organizations": {"$addToSet": "$organization"},
                    "cuit": {"$first": "$supplier_id"},
                    "last_fecha": {"$max": "$fecha_adjudicacion"},
                }
            },
            {"$sort": {"monto_total": -1}},
            {"$limit": limit},
            {
                "$project": {
                    "adjudicatario": "$_id",
                    "count": 1,
                    "monto_total": 1,
                    "categories": 1,
                    "organizations": {"$slice": ["$organizations", 10]},
                    "cuit": 1,
                    "last_fecha": 1,
                    "_id": 0,
                }
            },
        ]
        return await self.col.aggregate(pipeline).to_list(limit)

    async def price_ranges_by_category(
        self,
        since: Optional[datetime] = None,
        min_sample: int = 3,
        min_confidence: float = 0.7,
    ) -> List[Dict[str, Any]]:
        match: Dict[str, Any] = {
            "category": {"$exists": True, "$ne": None},
            "monto_adjudicado": {"$gt": 0},
            "extraction_confidence": {"$gte": min_confidence},
        }
        if since:
            match["fecha_adjudicacion"] = {"$gte": since}

        pipeline = [
            {"$match": match},
            {
                "$group": {
                    "_id": "$category",
                    "count": {"$sum": 1},
                    "montos": {"$push": "$monto_adjudicado"},
                    "min": {"$min": "$monto_adjudicado"},
                    "max": {"$max": "$monto_adjudicado"},
                    "avg": {"$avg": "$monto_adjudicado"},
                }
            },
            {"$match": {"count": {"$gte": min_sample}}},
            {"$sort": {"count": -1}},
        ]
        raw = await self.col.aggregate(pipeline).to_list(200)

        for row in raw:
            montos = sorted(row.pop("montos"))
            row["category"] = row.pop("_id")
            row["median"] = montos[len(montos) // 2]
            p25_idx = max(0, int(len(montos) * 0.25) - 1)
            p75_idx = min(len(montos) - 1, int(len(montos) * 0.75))
            row["p25"] = montos[p25_idx]
            row["p75"] = montos[p75_idx]
            row["spread_ratio"] = (row["max"] / row["min"]) if row["min"] else None
        return raw

    async def vacancias(
        self,
        since: Optional[datetime] = None,
        min_count: int = 2,
        max_suppliers_avg: float = 2.0,
    ) -> List[Dict[str, Any]]:
        """Categories with few competitors on average (gap opportunities)."""
        match: Dict[str, Any] = {"category": {"$exists": True, "$ne": None}}
        if since:
            match["fecha_adjudicacion"] = {"$gte": since}

        pipeline = [
            {"$match": match},
            {
                "$group": {
                    "_id": {"cat": "$category", "proc": "$proceso_id"},
                    "suppliers": {"$addToSet": "$adjudicatario"},
                }
            },
            {
                "$group": {
                    "_id": "$_id.cat",
                    "procesos": {"$sum": 1},
                    "avg_suppliers_per_proc": {"$avg": {"$size": "$suppliers"}},
                    "unique_suppliers": {"$addToSet": "$suppliers"},
                }
            },
            {"$match": {"procesos": {"$gte": min_count}, "avg_suppliers_per_proc": {"$lte": max_suppliers_avg}}},
            {"$sort": {"avg_suppliers_per_proc": 1, "procesos": -1}},
            {
                "$project": {
                    "category": "$_id",
                    "procesos": 1,
                    "avg_suppliers_per_proc": 1,
                    "_id": 0,
                }
            },
        ]
        return await self.col.aggregate(pipeline).to_list(100)

    async def monto_vs_budget(self, since: Optional[datetime] = None) -> List[Dict[str, Any]]:
        """Ratio adjudicado / presupuestado por organización."""
        match: Dict[str, Any] = {
            "monto_adjudicado": {"$gt": 0},
            "budget_original": {"$gt": 0},
            "organization": {"$exists": True, "$ne": None},
        }
        if since:
            match["fecha_adjudicacion"] = {"$gte": since}

        pipeline = [
            {"$match": match},
            {
                "$project": {
                    "organization": 1,
                    "ratio": {"$divide": ["$monto_adjudicado", "$budget_original"]},
                    "monto_adjudicado": 1,
                    "budget_original": 1,
                }
            },
            {
                "$group": {
                    "_id": "$organization",
                    "count": {"$sum": 1},
                    "avg_ratio": {"$avg": "$ratio"},
                    "total_adjudicado": {"$sum": "$monto_adjudicado"},
                    "total_presupuestado": {"$sum": "$budget_original"},
                }
            },
            {"$match": {"count": {"$gte": 3}}},
            {"$sort": {"count": -1}},
            {
                "$project": {
                    "organization": "$_id",
                    "count": 1,
                    "avg_ratio": 1,
                    "total_adjudicado": 1,
                    "total_presupuestado": 1,
                    "_id": 0,
                }
            },
        ]
        return await self.col.aggregate(pipeline).to_list(200)

    async def search(
        self,
        q: Optional[str] = None,
        category: Optional[str] = None,
        supplier: Optional[str] = None,
        cuit: Optional[str] = None,
        limit: int = 50,
    ) -> List[Dict[str, Any]]:
        match: Dict[str, Any] = {}
        if category:
            match["category"] = category
        if cuit:
            match["supplier_id"] = cuit
        if supplier:
            match["adjudicatario"] = {"$regex": supplier, "$options": "i"}

        if q:
            try:
                cursor = self.col.find(
                    {**match, "$text": {"$search": q}},
                    {"score": {"$meta": "textScore"}},
                ).sort([("score", {"$meta": "textScore"})]).limit(limit)
                docs = await cursor.to_list(limit)
                return [adjudicacion_entity(d) for d in docs]
            except Exception as e:
                logger.warning(f"search text query failed: {e}, falling back to regex")
                match["$or"] = [
                    {"objeto": {"$regex": q, "$options": "i"}},
                    {"adjudicatario": {"$regex": q, "$options": "i"}},
                ]

        cursor = self.col.find(match).sort("fecha_adjudicacion", DESCENDING).limit(limit)
        docs = await cursor.to_list(limit)
        return [adjudicacion_entity(d) for d in docs]

    async def summary(self) -> Dict[str, Any]:
        """Counts + last ingest for dashboard header."""
        total = await self.col.count_documents({})
        ocds = await self.col.count_documents({"fuente": "ocds_mendoza"})
        boletin = await self.col.count_documents({"fuente": "boletin_oficial"})
        last = await self.col.find_one({}, sort=[("fecha_ingesta", DESCENDING)])
        unique_suppliers = len(await self.col.distinct("adjudicatario"))
        return {
            "total": total,
            "by_fuente": {"ocds_mendoza": ocds, "boletin_oficial": boletin},
            "unique_suppliers": unique_suppliers,
            "last_ingest": last.get("fecha_ingesta") if last else None,
        }


_service: Optional[AdjudicacionService] = None


def get_adjudicacion_service(db) -> AdjudicacionService:
    global _service
    if _service is None or _service.db is not db:
        _service = AdjudicacionService(db)
    return _service
