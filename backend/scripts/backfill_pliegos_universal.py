"""
Backfill pliegos_bases for all sources that already have pliego data
but haven't normalized it to the pliegos_bases field yet.

Covers:
  1. COMPR.AR (Mendoza + Nacional + OSEP) — metadata.comprar_pliego_url → pliegos_bases
  2. Generic HTML sources — attached_files with pliego keywords → pliegos_bases
  3. Boletín Oficial — attached_files PDFs → pliegos_bases
  4. Any source with attached_files containing a single PDF

Usage:
  docker exec -w /app -e PYTHONPATH=/app licitometro-backend-1 \
    python3 scripts/backfill_pliegos_universal.py
"""
import asyncio
import logging
import os
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("backfill_pliegos_universal")

MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
DB_NAME   = os.getenv("DB_NAME", "licitaciones_db")

# Keywords that identify a pliego document in attached_files name/url
PLIEGO_KW = {"pliego", "bases", "condicion", "plieg", "licitacion", "adjunt", "documento"}

# Sources that use metadata.comprar_pliego_url
COMPRAR_FUENTES = {"COMPR.AR Mendoza", "COMPR.AR Nacional", "comprar_nacional", "OSEP"}


def _is_pliego_file(f: dict) -> bool:
    needle = " ".join([
        f.get("name", ""),
        f.get("url", ""),
        f.get("filename", ""),
    ]).lower()
    return any(kw in needle for kw in PLIEGO_KW)


def _file_to_pliego_base(f: dict, fuente: str = "web") -> dict:
    return {
        "url":    f.get("url", ""),
        "titulo": f.get("name") or f.get("filename") or f.get("url", "").rsplit("/", 1)[-1],
        "tipo":   (f.get("type") or "pdf").upper(),
        "fuente": fuente,
    }


async def main():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    now = datetime.now(timezone.utc)
    total_updated = 0
    stats = {}

    # ── 1. COMPR.AR: metadata.comprar_pliego_url → pliegos_bases ─────────────
    logger.info("Pass 1: COMPR.AR — metadata.comprar_pliego_url → pliegos_bases")
    comprar_query = {
        "fuente": {"$in": list(COMPRAR_FUENTES)},
        "metadata.comprar_pliego_url": {"$exists": True, "$ne": None, "$ne": ""},
        "$or": [
            {"pliegos_bases": {"$exists": False}},
            {"pliegos_bases": {"$size": 0}},
        ],
    }
    comprar_docs = await db.licitaciones.find(
        comprar_query,
        {"_id": 1, "metadata": 1, "licitacion_number": 1, "fuente": 1}
    ).to_list(length=2000)

    logger.info(f"  Found {len(comprar_docs)} COMPR.AR docs to backfill")
    for doc in comprar_docs:
        pliego_url = (doc.get("metadata") or {}).get("comprar_pliego_url", "")
        if not pliego_url or "VistaPreviaPliegoCiudadano" not in pliego_url:
            continue
        numero = doc.get("licitacion_number", "")
        fuente = doc.get("fuente", "comprar_ar")
        pliegos_bases = [{
            "url":    pliego_url,
            "titulo": f"Pliego — {numero}",
            "tipo":   "HTML",
            "fuente": "comprar_ar",
        }]
        await db.licitaciones.update_one(
            {"_id": doc["_id"]},
            {"$set": {"pliegos_bases": pliegos_bases, "updated_at": now}},
        )
        total_updated += 1

    stats["comprar_ar"] = len(comprar_docs)
    logger.info(f"  COMPR.AR: {total_updated} updated")

    # ── 2. Generic HTML + Boletín: attached_files → pliegos_bases ────────────
    logger.info("Pass 2: Generic HTML — attached_files → pliegos_bases")
    html_query = {
        "fuente": {"$nin": list(COMPRAR_FUENTES) + ["ComprasApps Mendoza"]},
        "attached_files": {"$exists": True, "$not": {"$size": 0}},
        "$or": [
            {"pliegos_bases": {"$exists": False}},
            {"pliegos_bases": {"$size": 0}},
        ],
    }
    html_docs = await db.licitaciones.find(
        html_query,
        {"_id": 1, "attached_files": 1, "fuente": 1}
    ).to_list(length=5000)

    logger.info(f"  Found {len(html_docs)} HTML/generic docs to inspect")
    html_updated = 0
    for doc in html_docs:
        files = doc.get("attached_files") or []
        if not files:
            continue

        # Identify pliego files by keyword
        pliego_files = [f for f in files if _is_pliego_file(f)]

        # If no keyword match but only one file, promote it
        if not pliego_files and len(files) == 1:
            pliego_files = files

        if not pliego_files:
            continue

        fuente_tag = "boletin" if "Boletin" in (doc.get("fuente") or "") else "web"
        pliegos_bases = [_file_to_pliego_base(f, fuente_tag) for f in pliego_files]

        await db.licitaciones.update_one(
            {"_id": doc["_id"]},
            {"$set": {"pliegos_bases": pliegos_bases, "updated_at": now}},
        )
        html_updated += 1

    stats["generic_html"] = html_updated
    total_updated += html_updated
    logger.info(f"  Generic HTML: {html_updated} updated")

    # ── Summary ───────────────────────────────────────────────────────────────
    # Count final state
    with_pliego = await db.licitaciones.count_documents(
        {"pliegos_bases": {"$exists": True, "$not": {"$size": 0}}}
    )
    total_docs = await db.licitaciones.count_documents({})

    logger.info("=" * 60)
    logger.info(f"DONE. Total updated this run: {total_updated}")
    logger.info(f"  COMPR.AR:     {stats.get('comprar_ar', 0)}")
    logger.info(f"  Generic HTML: {stats.get('generic_html', 0)}")
    logger.info(f"Final: {with_pliego}/{total_docs} licitaciones con pliegos_bases "
                f"({with_pliego/total_docs*100:.1f}%)")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
