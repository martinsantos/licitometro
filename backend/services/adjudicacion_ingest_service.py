"""Cron-friendly ingest wrapper for adjudicaciones.

Runs both OCDS + Boletín ingesta incrementally since `last_run_at` (stored
in db.adjudicaciones_ingest_state). Intended to be registered in cron_registry.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Optional

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from services.adjudicacion_service import get_adjudicacion_service
from services.boletin_adjudicacion_extractor import extract_adjudicaciones
from utils.time import utc_now

logger = logging.getLogger("adjudicacion_ingest")

STATE_COLLECTION = "adjudicaciones_ingest_state"
MIN_CONFIDENCE = 0.6  # Threshold for cron (higher than backfill default 0.5)


class AdjudicacionIngestService:
    def __init__(self, db):
        self.db = db

    async def _get_last_run(self) -> Optional[datetime]:
        doc = await self.db[STATE_COLLECTION].find_one({"_id": "state"})
        if not doc:
            return None
        return doc.get("last_run_at")

    async def _set_last_run(self, ts: datetime) -> None:
        await self.db[STATE_COLLECTION].update_one(
            {"_id": "state"},
            {"$set": {"last_run_at": ts}},
            upsert=True,
        )

    async def ingest_ocds_incremental(self, since: Optional[datetime]) -> int:
        """Upsert adjudicaciones from licitaciones updated since `since`."""
        svc = get_adjudicacion_service(self.db)
        await svc.ensure_indexes()

        query = {
            "metadata.adjudicatario": {"$exists": True, "$ne": None, "$ne": ""},
        }
        if since:
            query["updated_at"] = {"$gte": since}

        count = 0
        async for doc in self.db.licitaciones.find(query):
            meta = doc.get("metadata") or {}
            adjudicatario = meta.get("adjudicatario")
            if not adjudicatario:
                continue

            monto = meta.get("monto_adjudicado")
            try:
                monto = float(monto) if monto is not None else None
            except (ValueError, TypeError):
                monto = None

            fecha_raw = meta.get("fecha_adjudicacion")
            fecha = None
            if isinstance(fecha_raw, datetime):
                fecha = fecha_raw
            elif fecha_raw:
                try:
                    fecha = datetime.fromisoformat(str(fecha_raw).replace("Z", ""))
                except (ValueError, TypeError):
                    pass

            ocid = meta.get("ocds_ocid")
            dedup_key = svc.compute_dedup_key(
                fuente="ocds_mendoza",
                ocds_ocid=ocid,
                adjudicatario=adjudicatario,
                fecha=fecha,
                monto=monto,
            )

            await svc.upsert({
                "dedup_key": dedup_key,
                "proceso_id": doc.get("proceso_id"),
                "licitacion_id": str(doc["_id"]),
                "ocds_ocid": ocid,
                "expedient_number": doc.get("expedient_number"),
                "licitacion_number": doc.get("licitacion_number"),
                "adjudicatario": adjudicatario,
                "monto_adjudicado": monto,
                "currency": doc.get("currency", "ARS"),
                "fecha_adjudicacion": fecha,
                "estado_adjudicacion": "active",
                "objeto": doc.get("objeto") or doc.get("title"),
                "organization": doc.get("organization"),
                "category": doc.get("category"),
                "tipo_procedimiento": doc.get("tipo_procedimiento"),
                "budget_original": doc.get("budget"),
                "num_oferentes": len(meta.get("proveedores") or []) or None,
                "fuente": "ocds_mendoza",
                "extraction_confidence": 1.0,
                "metadata": {
                    "ocds_method": meta.get("ocds_method"),
                    "proveedores": meta.get("proveedores") or [],
                },
            })
            count += 1
        return count

    async def ingest_boletin_incremental(self, since: Optional[datetime]) -> int:
        svc = get_adjudicacion_service(self.db)
        await svc.ensure_indexes()

        query = {
            "fuente": {"$regex": "boletin", "$options": "i"},
            "description": {"$exists": True, "$ne": None, "$ne": ""},
        }
        if since:
            query["updated_at"] = {"$gte": since}

        count = 0
        async for doc in self.db.licitaciones.find(query):
            text = doc.get("description") or ""
            if len(text) < 50:
                continue
            try:
                extractions = extract_adjudicaciones(text)
            except Exception as e:
                logger.warning(f"boletin extractor failed on {doc.get('_id')}: {e}")
                continue

            for ex in extractions:
                if ex.confidence < MIN_CONFIDENCE:
                    continue
                dedup_key = svc.compute_dedup_key(
                    fuente="boletin_oficial",
                    ocds_ocid=None,
                    adjudicatario=ex.adjudicatario,
                    fecha=ex.fecha_adjudicacion,
                    monto=ex.monto_adjudicado,
                )
                try:
                    await svc.upsert({
                        "dedup_key": dedup_key,
                        "licitacion_id": str(doc["_id"]),
                        "proceso_id": doc.get("proceso_id"),
                        "expedient_number": ex.expedient_number or doc.get("expedient_number"),
                        "licitacion_number": ex.licitacion_number or doc.get("licitacion_number"),
                        "adjudicatario": ex.adjudicatario,
                        "supplier_id": ex.supplier_id,
                        "monto_adjudicado": ex.monto_adjudicado,
                        "currency": "ARS",
                        "fecha_adjudicacion": ex.fecha_adjudicacion or doc.get("publication_date"),
                        "estado_adjudicacion": "active",
                        "objeto": doc.get("objeto") or doc.get("title"),
                        "organization": doc.get("organization"),
                        "category": doc.get("category"),
                        "tipo_procedimiento": doc.get("tipo_procedimiento"),
                        "budget_original": doc.get("budget"),
                        "fuente": "boletin_oficial",
                        "extraction_confidence": ex.confidence,
                        "metadata": {"raw_match": ex.raw_match[:300]},
                    })
                    count += 1
                except Exception as e:
                    logger.warning(f"boletin upsert failed for {ex.adjudicatario[:30]}: {e}")
        return count

    async def run_ingest_cycle(self) -> None:
        """Full cron cycle — called by APScheduler."""
        last_run = await self._get_last_run()
        now = utc_now()
        # On first run, only look back 30 days to avoid full scan
        since = last_run or (now - timedelta(days=30))
        logger.info(f"adjudicaciones ingest starting (since={since.isoformat()})")

        try:
            ocds_count = await self.ingest_ocds_incremental(since)
        except Exception as e:
            logger.error(f"OCDS ingest failed: {e}")
            ocds_count = 0

        try:
            boletin_count = await self.ingest_boletin_incremental(since)
        except Exception as e:
            logger.error(f"Boletín ingest failed: {e}")
            boletin_count = 0

        await self._set_last_run(now)
        logger.info(f"adjudicaciones ingest done: ocds={ocds_count} boletin={boletin_count}")


_service: Optional[AdjudicacionIngestService] = None


def get_adjudicacion_ingest_service(db) -> AdjudicacionIngestService:
    global _service
    if _service is None or _service.db is not db:
        _service = AdjudicacionIngestService(db)
    return _service
