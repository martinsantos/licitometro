"""
Backfill: fix duplicated objeto strings for ComprasApps docs.

ComprasApps titles often look like "ADQUISICION PINTURA ADQUISICION PINTURA"
(the GeneXus grid returns the same text twice). This script detects and fixes
those, plus strips common legal prefixes like "S/ADQ. DE", "OBJETO:", etc.

Usage:
  docker exec -w /app -e PYTHONPATH=/app licitometro-backend-1 \
    python3 scripts/backfill_objeto_dedup.py
"""
import asyncio
import logging
import os
import re
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorClient

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("backfill_objeto_dedup")

MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "licitaciones_db")

PREFIX_RE = re.compile(
    r'^(?:S/ADQ\.\s+DE\s+|OBJETO:\s*|ADQUISICI[OÓ]N\s+DE\s+|'
    r'CONTRATACI[OÓ]N\s+(?:DIRECTA\s+)?(?:DE\s+)?)',
    re.I
)


def _fix_objeto(texto: str) -> str:
    if not texto:
        return texto
    cleaned = PREFIX_RE.sub("", texto).strip()
    # Detect doubled string "X X" where X == X (with optional spacing)
    half = len(cleaned) // 2
    if half > 10:
        left = cleaned[:half].strip()
        right = cleaned[half:].strip()
        if left == right:
            cleaned = left
    return cleaned if len(cleaned) >= 5 else texto


async def main():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    query = {
        "fuente": "ComprasApps Mendoza",
        "objeto": {"$exists": True, "$ne": None, "$ne": ""},
    }
    total = await db.licitaciones.count_documents(query)
    logger.info(f"Found {total} ComprasApps docs with objeto")

    cursor = db.licitaciones.find(query, {"_id": 1, "objeto": 1})
    docs = await cursor.to_list(length=total)

    now = datetime.now(timezone.utc)
    fixed = 0
    for doc in docs:
        original = doc.get("objeto", "")
        fixed_val = _fix_objeto(original)
        if fixed_val != original:
            await db.licitaciones.update_one(
                {"_id": doc["_id"]},
                {"$set": {"objeto": fixed_val, "updated_at": now}},
            )
            fixed += 1

    logger.info(f"Done. Fixed {fixed}/{total} docs.")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
