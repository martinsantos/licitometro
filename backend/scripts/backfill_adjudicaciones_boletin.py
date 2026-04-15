#!/usr/bin/env python3
"""Backfill adjudicaciones from Boletín Oficial free-text descriptions.

Scans `db.licitaciones` documents with `fuente ~ /boletin/i` and runs the
regex-based extractor (`services.boletin_adjudicacion_extractor`) over the
`description` field. Upserts every extraction above the confidence threshold.

Usage:
  docker exec -w /app -e PYTHONPATH=/app licitometro-backend-1 \\
      python3 scripts/backfill_adjudicaciones_boletin.py [--sample=N] [--dry-run] [--min-confidence=0.5]
"""
import asyncio
import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

from services.adjudicacion_service import get_adjudicacion_service
from services.boletin_adjudicacion_extractor import extract_adjudicaciones
from utils.time import utc_now

load_dotenv()

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "licitaciones_db")


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--sample", type=int, default=0, help="Process only N documents (for testing)")
    parser.add_argument("--min-confidence", type=float, default=0.5)
    args = parser.parse_args()

    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    svc = get_adjudicacion_service(db)

    if not args.dry_run:
        await svc.ensure_indexes()

    query = {
        "fuente": {"$regex": "boletin", "$options": "i"},
        "description": {"$exists": True, "$ne": None, "$ne": ""},
    }
    total = await db.licitaciones.count_documents(query)
    print(f"Found {total} Boletín Oficial licitaciones with description")
    if total == 0:
        client.close()
        return

    cursor = db.licitaciones.find(query)
    if args.sample:
        cursor = cursor.limit(args.sample)

    stats = {
        "scanned": 0,
        "extracted": 0,
        "upserted": 0,
        "below_threshold": 0,
        "no_match": 0,
        "errors": 0,
    }

    sample_shown = 0

    async for doc in cursor:
        stats["scanned"] += 1
        text = doc.get("description") or ""
        if len(text) < 50:
            stats["no_match"] += 1
            continue

        try:
            extractions = extract_adjudicaciones(text)
        except Exception as e:
            stats["errors"] += 1
            if stats["errors"] <= 3:
                print(f"  extractor error on {doc.get('_id')}: {e}")
            continue

        if not extractions:
            stats["no_match"] += 1
            continue

        for ex in extractions:
            stats["extracted"] += 1
            if ex.confidence < args.min_confidence:
                stats["below_threshold"] += 1
                continue

            dedup_key = svc.compute_dedup_key(
                fuente="boletin_oficial",
                ocds_ocid=None,
                adjudicatario=ex.adjudicatario,
                fecha=ex.fecha_adjudicacion,
                monto=ex.monto_adjudicado,
            )

            new_doc = {
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
                "num_oferentes": None,
                "fuente": "boletin_oficial",
                "fecha_ingesta": utc_now(),
                "extraction_confidence": ex.confidence,
                "metadata": {"raw_match": ex.raw_match[:300]},
            }

            if args.dry_run:
                if sample_shown < 10:
                    print(
                        f"  [dry-run] conf={ex.confidence:.2f} | "
                        f"{ex.adjudicatario[:50]} | "
                        f"${ex.monto_adjudicado} | "
                        f"{ex.fecha_adjudicacion}"
                    )
                    sample_shown += 1
                stats["upserted"] += 1
                continue

            try:
                await svc.upsert(new_doc)
                stats["upserted"] += 1
            except Exception as e:
                stats["errors"] += 1
                if stats["errors"] <= 3:
                    print(f"  upsert error for {ex.adjudicatario[:30]}: {e}")

        if stats["scanned"] % 50 == 0:
            print(f"  progress: scanned={stats['scanned']} upserted={stats['upserted']}")

    print("\n--- Results ---")
    for k, v in stats.items():
        print(f"  {k}: {v}")

    if not args.dry_run:
        total_now = await db.adjudicaciones.count_documents({"fuente": "boletin_oficial"})
        print(f"\nadjudicaciones (boletin_oficial) total now: {total_now}")

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
