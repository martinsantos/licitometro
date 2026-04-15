#!/usr/bin/env python3
"""Backfill adjudicaciones collection from OCDS awards embedded in licitaciones.metadata.

Walks `db.licitaciones` items with `metadata.adjudicatario` (written by
`contrataciones_abiertas_mza_scraper.py`) and upserts them into `db.adjudicaciones`
keyed by dedup_key (stable across runs).

Usage (Docker prod):
  docker exec -w /app -e PYTHONPATH=/app licitometro-backend-1 \\
      python3 scripts/backfill_adjudicaciones_ocds.py [--dry-run]

Usage (local):
  cd backend && PYTHONPATH=. python3 scripts/backfill_adjudicaciones_ocds.py [--dry-run]
"""
import asyncio
import argparse
import os
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

from services.adjudicacion_service import get_adjudicacion_service
from utils.time import utc_now

load_dotenv()

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "licitaciones_db")


def _parse_fecha(raw):
    if not raw:
        return None
    if isinstance(raw, datetime):
        return raw
    try:
        # Usually stored as ISO string from OCDS
        return datetime.fromisoformat(str(raw).replace("Z", ""))
    except (ValueError, TypeError):
        return None


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Report only, do not write")
    parser.add_argument("--limit", type=int, default=0, help="Limit processing to N docs")
    args = parser.parse_args()

    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    svc = get_adjudicacion_service(db)

    if not args.dry_run:
        await svc.ensure_indexes()

    query = {
        "metadata.adjudicatario": {"$exists": True, "$ne": None, "$ne": ""},
    }
    total = await db.licitaciones.count_documents(query)
    print(f"Found {total} licitaciones with OCDS award metadata")
    if total == 0:
        client.close()
        return

    cursor = db.licitaciones.find(query)
    if args.limit:
        cursor = cursor.limit(args.limit)

    stats = {"scanned": 0, "upserted": 0, "skipped_no_name": 0, "skipped_err": 0}

    async for doc in cursor:
        stats["scanned"] += 1
        meta = doc.get("metadata") or {}
        adjudicatario = meta.get("adjudicatario")
        if not adjudicatario:
            stats["skipped_no_name"] += 1
            continue

        monto = meta.get("monto_adjudicado")
        try:
            monto = float(monto) if monto is not None else None
        except (ValueError, TypeError):
            monto = None

        fecha = _parse_fecha(meta.get("fecha_adjudicacion"))
        ocid = meta.get("ocds_ocid")

        dedup_key = svc.compute_dedup_key(
            fuente="ocds_mendoza",
            ocds_ocid=ocid,
            adjudicatario=adjudicatario,
            fecha=fecha,
            monto=monto,
        )

        new_doc = {
            "dedup_key": dedup_key,
            "proceso_id": doc.get("proceso_id"),
            "licitacion_id": str(doc["_id"]),
            "ocds_ocid": ocid,
            "expedient_number": doc.get("expedient_number"),
            "licitacion_number": doc.get("licitacion_number"),
            "adjudicatario": adjudicatario,
            "supplier_id": None,
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
            "fecha_ingesta": utc_now(),
            "extraction_confidence": 1.0,
            "metadata": {
                "ocds_method": meta.get("ocds_method"),
                "proveedores": meta.get("proveedores") or [],
            },
        }

        if args.dry_run:
            if stats["scanned"] <= 5:
                print(f"  [dry-run] {adjudicatario[:60]} | {monto} | {fecha} | ocid={ocid[:30] if ocid else 'none'}")
            stats["upserted"] += 1
            continue

        try:
            await svc.upsert(new_doc)
            stats["upserted"] += 1
        except Exception as e:
            stats["skipped_err"] += 1
            if stats["skipped_err"] <= 5:
                print(f"  ERROR on {adjudicatario[:40]}: {e}")

        if stats["scanned"] % 100 == 0:
            print(f"  progress: scanned={stats['scanned']} upserted={stats['upserted']}")

    print("\n--- Results ---")
    for k, v in stats.items():
        print(f"  {k}: {v}")

    if not args.dry_run:
        total_now = await db.adjudicaciones.count_documents({})
        print(f"\nadjudicaciones collection total now: {total_now}")

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
