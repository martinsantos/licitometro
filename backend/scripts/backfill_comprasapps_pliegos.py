"""
Backfill ComprasApps pliego URLs for existing vigente licitaciones.

Fetches hli00048 detail for each vigente ComprasApps doc that lacks pliegos_bases,
extracts the pliego ZIP URL from www.mendoza.gov.ar, and updates MongoDB.

Usage:
  docker exec -w /app -e PYTHONPATH=/app licitometro-backend-1 \
    python3 scripts/backfill_comprasapps_pliegos.py
"""
import asyncio
import logging
import os
import re
import json
import aiohttp
from bs4 import BeautifulSoup
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("backfill_pliegos")

MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "licitaciones_db")
CONCURRENCY = 5
REQUEST_TIMEOUT = aiohttp.ClientTimeout(total=15, connect=5)


def _extract_pliego_urls(html: str) -> list:
    """Extract pliego ZIP/PDF URLs from hli00048 HTML."""
    urls = re.findall(
        r'https?://(?:www\.)?mendoza\.gov\.ar/compras/files/[^\s"\'\\>]+\.(?:zip|pdf|ZIP|PDF)',
        html,
    )
    return list(dict.fromkeys(urls))  # deduplicate preserving order


def _extract_presupuesto(html: str) -> float | None:
    """Extract budget from vPRESUPUESTO input."""
    soup = BeautifulSoup(html, "html.parser")
    inp = soup.find("input", {"name": "vPRESUPUESTO"})
    if not inp:
        return None
    raw = (inp.get("value") or "").strip()
    if not raw:
        return None
    try:
        val = float(raw.replace(".", "").replace(",", "."))
        return val if val > 0 else None
    except (ValueError, TypeError):
        return None


async def fetch_detail(session: aiohttp.ClientSession, canonical_url: str) -> dict:
    """Fetch hli00048 page and return {pliego_urls, budget}."""
    try:
        async with session.get(canonical_url, ssl=False, timeout=REQUEST_TIMEOUT) as r:
            if r.status != 200:
                return {}
            html = (await r.read()).decode("utf-8", errors="replace")
        pliego_urls = _extract_pliego_urls(html)
        budget = _extract_presupuesto(html)
        return {"pliego_urls": pliego_urls, "budget": budget}
    except Exception as e:
        logger.debug(f"Fetch failed {canonical_url}: {e}")
        return {}


async def main():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    # Find vigente ComprasApps docs without pliegos_bases
    query = {
        "fuente": "ComprasApps Mendoza",
        "estado": "vigente",
        "canonical_url": {"$regex": "hli00048"},
        "$or": [
            {"pliegos_bases": {"$exists": False}},
            {"pliegos_bases": {"$size": 0}},
        ],
    }
    total = await db.licitaciones.count_documents(query)
    logger.info(f"Found {total} vigente ComprasApps docs without pliegos_bases")

    cursor = db.licitaciones.find(query, {"_id": 1, "canonical_url": 1, "budget": 1})
    docs = await cursor.to_list(length=total)

    sem = asyncio.Semaphore(CONCURRENCY)
    updated = 0
    with_pliego = 0
    errors = 0

    async def process(doc):
        nonlocal updated, with_pliego, errors
        canonical = doc.get("canonical_url", "")
        if not canonical or "hli00048" not in canonical:
            return

        async with sem:
            result = await fetch_detail(session, canonical)
            await asyncio.sleep(0.3)

        if not result:
            errors += 1
            return

        update: dict = {"updated_at": datetime.now(timezone.utc)}

        pliego_urls = result.get("pliego_urls", [])
        if pliego_urls:
            pliegos_bases = []
            for url in pliego_urls:
                fname = url.rsplit("/", 1)[-1]
                ext = fname.rsplit(".", 1)[-1].lower() if "." in fname else ""
                pliegos_bases.append({
                    "url": url,
                    "titulo": f"Pliego/Adjuntos — {fname}",
                    "tipo": "ZIP" if ext == "zip" else "PDF",
                    "fuente": "comprasapps",
                })
            update["pliegos_bases"] = pliegos_bases
            with_pliego += 1

        # Update budget only if missing
        if result.get("budget") and not doc.get("budget"):
            update["budget"] = result["budget"]

        await db.licitaciones.update_one({"_id": doc["_id"]}, {"$set": update})
        updated += 1

    async with aiohttp.ClientSession() as session:
        tasks = [process(doc) for doc in docs]
        for i, coro in enumerate(asyncio.as_completed(tasks), 1):
            await coro
            if i % 20 == 0:
                logger.info(f"Progress: {i}/{total} — {with_pliego} with pliego, {errors} errors")

    logger.info(f"Done. Updated={updated}, with_pliego={with_pliego}, errors={errors}")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
