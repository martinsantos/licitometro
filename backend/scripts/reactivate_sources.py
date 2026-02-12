"""
Reactivate inactive scraper sources + deactivate Vialidad + tune ComprasApps wait_time.

Actions:
1. Reactivate 8 sources: General Alvear, Junin, Malargue, Rivadavia, Santa Rosa, Tupungato, EMESA, Las Heras
2. Deactivate Vialidad Mendoza (homepage URL, 0 items, already covered by ComprasApps CUC 509)
3. Reduce ComprasApps wait_time from 1.5s to 0.5s (cuts 400s→133s sleep, avoids timeout)

Usage:
    docker exec -w /app -e PYTHONPATH=/app licitometro-backend-1 python3 scripts/reactivate_sources.py
"""

import asyncio
import logging
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from motor.motor_asyncio import AsyncIOMotorClient

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("reactivate_sources")

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "licitaciones_db")

# Sources to reactivate
REACTIVATE = [
    "General Alvear",
    "Junin",
    "Junín",
    "Malargue",
    "Malargüe",
    "Rivadavia",
    "Santa Rosa",
    "Tupungato",
    "EMESA",
    "Las Heras",
]

# Sources to deactivate
DEACTIVATE = [
    "Vialidad Mendoza",
    "Vialidad",
]


async def main():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    configs = db["scraper_configs"]

    # List current state
    all_configs = await configs.find({}).to_list(length=100)
    logger.info(f"Total scraper configs: {len(all_configs)}")
    for c in sorted(all_configs, key=lambda x: x.get("name", "")):
        logger.info(f"  {c.get('name'):30s} active={c.get('active')}")

    # 1. Reactivate sources
    logger.info("\n--- Reactivating sources ---")
    for name in REACTIVATE:
        import re
        result = await configs.update_many(
            {"name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}, "active": {"$ne": True}},
            {"$set": {"active": True}}
        )
        if result.modified_count > 0:
            logger.info(f"  Reactivated: {name} ({result.modified_count} configs)")
        else:
            # Check if already active
            existing = await configs.find_one({"name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}})
            if existing:
                logger.info(f"  Already active: {name}")
            else:
                logger.warning(f"  Not found: {name}")

    # 2. Deactivate Vialidad
    logger.info("\n--- Deactivating Vialidad ---")
    for name in DEACTIVATE:
        import re
        result = await configs.update_many(
            {"name": {"$regex": re.escape(name), "$options": "i"}, "active": True},
            {"$set": {"active": False}}
        )
        if result.modified_count > 0:
            logger.info(f"  Deactivated: {name} ({result.modified_count} configs)")
        else:
            logger.info(f"  Already inactive or not found: {name}")

    # 3. Reduce ComprasApps wait_time
    logger.info("\n--- Tuning ComprasApps wait_time ---")
    comprasapps = await configs.find_one({"name": {"$regex": "comprasapps", "$options": "i"}})
    if comprasapps:
        selectors = comprasapps.get("selectors", {}) or {}
        old_wait = selectors.get("wait_time", "not set")
        selectors["wait_time"] = 0.5
        await configs.update_one(
            {"_id": comprasapps["_id"]},
            {"$set": {"selectors": selectors}}
        )
        logger.info(f"  ComprasApps wait_time: {old_wait} → 0.5")
    else:
        logger.warning("  ComprasApps config not found")

    # Final state
    logger.info("\n--- Final state ---")
    active_count = await configs.count_documents({"active": True})
    all_count = await configs.count_documents({})
    logger.info(f"Active: {active_count}/{all_count}")

    all_configs = await configs.find({}).to_list(length=100)
    for c in sorted(all_configs, key=lambda x: x.get("name", "")):
        status = "ACTIVE" if c.get("active") else "OFF"
        logger.info(f"  [{status:6s}] {c.get('name')}")

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
