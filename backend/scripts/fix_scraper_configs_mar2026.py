"""
Production-safe scraper config reconciliation.

Default mode is dry-run. Use --apply to write changes:
  docker exec -w /app -e PYTHONPATH=/app licitometro-backend-1 \
    python3 scripts/fix_scraper_configs_mar2026.py --apply

This script intentionally avoids broad disabling by URL. Production currently
has working canonical configs such as "COMPR.AR Nacional"; legacy duplicates
are handled by exact name only.
"""
import asyncio
import os
import sys
from pathlib import Path
from typing import Any, Dict

sys.path.insert(0, str(Path(__file__).parent.parent))

from motor.motor_asyncio import AsyncIOMotorClient
from utils.time import utc_now


APPLY = "--apply" in sys.argv


async def update_many(db, label: str, filter_doc: Dict[str, Any], update_doc: Dict[str, Any]) -> int:
    matched = await db.scraper_configs.count_documents(filter_doc)
    if not APPLY:
        print(f"DRY-RUN {label}: matched={matched}")
        return 0
    result = await db.scraper_configs.update_many(filter_doc, update_doc)
    print(f"APPLIED {label}: matched={matched}, modified={result.modified_count}")
    return result.modified_count


async def update_one(db, label: str, filter_doc: Dict[str, Any], update_doc: Dict[str, Any], *, upsert: bool = False) -> int:
    matched = await db.scraper_configs.count_documents(filter_doc)
    if not APPLY:
        print(f"DRY-RUN {label}: matched={matched}, upsert={upsert}")
        return 0
    result = await db.scraper_configs.update_one(filter_doc, update_doc, upsert=upsert)
    print(f"APPLIED {label}: matched={matched}, modified={result.modified_count}")
    return result.modified_count


async def main():
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "licitaciones_db")
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    now = utc_now()

    mode = "APPLY" if APPLY else "DRY-RUN"
    print(f"=== Scraper Config Reconcile ({mode}) ===\n")

    await update_one(
        db,
        "Boletin Oficial Nacional selectors",
        {"name": "boletin_oficial_nacional"},
        {
            "$setOnInsert": {
                "name": "boletin_oficial_nacional",
                "schedule": "0 8,13 * * 1-5",
                "created_at": now,
                "runs_count": 0,
                "headers": {},
                "cookies": {},
            },
            "$set": {
                "active": True,
                "url": "https://www.boletinoficial.gob.ar/seccion/tercera",
                "source_type": "website",
                "max_items": 50,
                "wait_time": 3.0,
                "scope": "ar_nacional",
                "updated_at": now,
                "selectors.section_url": "https://www.boletinoficial.gob.ar/seccion/tercera",
                "selectors.scraper_type": "boletin_oficial_nacional",
                "selectors.lookback_days": 5,
                "selectors.lookback_min_items_per_day": 5,
                "selectors.timezone": "America/Argentina/Buenos_Aires",
                "selectors.cadence_hours": 24,
                "selectors.freshness_slo_days": 4,
            },
        },
        upsert=True,
    )

    await update_one(
        db,
        "OCDS Mendoza scope",
        {"name": "contrataciones_abiertas_mendoza_ocds"},
        {
            "$set": {
                "active": True,
                "url": "https://datosabiertos-compras.mendoza.gov.ar/datosabiertos/",
                "source_type": "api",
                "max_items": 200,
                "wait_time": 1.0,
                "scope": None,
                "selectors.scraper_type": "contrataciones_abiertas_mza",
                "updated_at": now,
            }
        },
    )

    await update_many(
        db,
        "Deactivate exact legacy duplicates",
        {
            "name": {
                "$in": [
                    "COMPR.AR",
                    "Boletín Oficial Argentina",
                    "Datos Argentina API",
                    "Datos Argentina - Sistema Contrataciones Electrónicas",
                    "comprar_gob_ar_nacional",
                ]
            }
        },
        {"$set": {"active": False, "updated_at": now}},
    )

    await update_one(
        db,
        "Lavalle explicit active flag",
        {"name": "Lavalle", "active": {"$exists": False}},
        {"$set": {"active": True, "updated_at": now}},
    )

    active = await db.scraper_configs.count_documents({"active": True})
    inactive = await db.scraper_configs.count_documents({"active": False})
    missing_active = await db.scraper_configs.count_documents({"active": {"$exists": False}})
    print("\n--- Summary ---")
    print(f"Active: {active}, Inactive: {inactive}, Missing active: {missing_active}")

    if not APPLY:
        print("\nNo changes written. Re-run with --apply to persist.")

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
