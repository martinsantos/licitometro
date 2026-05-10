"""
Backfill canonical_url for existing ComprasApps Mendoza licitaciones.

Reconstructs the stable hli00048 detail URL from comprasapps_numero
(format: "3/2026-616" → tipo_code=3, año=2026, cuc=616) and
optional metadata fields (comprasapps_anio/seq/tipo_code/cuc).

Usage:
  docker exec -w /app -e PYTHONPATH=/app licitometro-backend-1 \\
      python3 scripts/backfill_comprasapps_canonical_urls.py [--dry-run]
"""
import argparse
import asyncio
import logging
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from motor.motor_asyncio import AsyncIOMotorClient

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("backfill_canonical")

NUMERO_RE = re.compile(r"^(\d+)/(\d{4})-(\d+)$")


def derive_url_parts(meta: dict) -> tuple | None:
    """Returns (anio, cuc, tip_code, seq) or None."""
    anio = meta.get("comprasapps_anio")
    seq = meta.get("comprasapps_seq")
    tip = meta.get("comprasapps_tipo_code")
    cuc = meta.get("comprasapps_cuc")
    if anio and seq and tip and cuc:
        return str(anio), str(cuc), str(tip), str(seq)

    # Fallback: parse from numero "3/2026-616" — but seq is missing.
    # The numero is "tipo/año-cuc"; seq is internal sequential not present here.
    # So we cannot fully reconstruct without the original grid columns.
    return None


async def main(dry_run: bool):
    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ["DB_NAME"]
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    cursor = db.licitaciones.find(
        {
            "fuente": "ComprasApps Mendoza",
            "$or": [
                {"canonical_url": {"$regex": "/Compras/$"}},  # base URL
                {"canonical_url": "https://comprasapps.mendoza.gov.ar/Compras/"},
                {"url_quality": {"$in": ["list_only", None]}},
            ],
        },
        {"_id": 1, "metadata": 1, "canonical_url": 1},
    )

    total = 0
    fixed = 0
    skipped_no_parts = 0
    async for doc in cursor:
        total += 1
        meta = doc.get("metadata") or {}
        parts = derive_url_parts(meta)
        if not parts:
            skipped_no_parts += 1
            continue
        anio, cuc, tip, seq = parts
        url = (
            f"https://comprasapps.mendoza.gov.ar/Compras/servlet/"
            f"hli00048?{anio},{cuc},{tip},{seq}"
        )

        if dry_run:
            logger.info(f"WOULD UPDATE {doc['_id']}: {url}")
        else:
            await db.licitaciones.update_one(
                {"_id": doc["_id"]},
                {
                    "$set": {
                        "canonical_url": url,
                        "source_url": url,
                        "url_quality": "direct",
                        "source_urls.comprasapps_detail": url,
                        "metadata.comprasapps_detail_url": url,
                    }
                },
            )
        fixed += 1

    logger.info(
        f"Total scanned: {total} | Fixed: {fixed} | "
        f"Skipped (no parts in metadata): {skipped_no_parts}"
    )
    logger.info(
        "Items skipped need to be re-scraped (fresh runs will populate metadata)."
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    asyncio.run(main(args.dry_run))
