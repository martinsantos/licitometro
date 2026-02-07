"""
Add EMESA scraper config to MongoDB.

Usage: docker exec -w /app -e PYTHONPATH=/app backend python3 scripts/add_emesa_source.py
"""

import asyncio
import os
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from motor.motor_asyncio import AsyncIOMotorClient


async def main():
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017/licitaciones_db")
    db_name = os.environ.get("DB_NAME", "licitaciones_db")

    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    existing = await db.scraper_configs.find_one({"name": "EMESA"})
    if existing:
        print("SKIP (exists): EMESA")
        return

    doc = {
        "name": "EMESA",
        "url": "https://emesa.com.ar/licitaciones/",
        "enabled": True,
        "schedule": "0 9 * * 1-5",
        "max_items": 50,
        "wait_time": 3,
        "selectors": {
            "scraper_type": "emesa",
            "organization": "EMESA - Empresa Mendocina de Energía",
        },
        "headers": {},
        "cookies": {},
        "pagination": {"max_pages": 1},
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    result = await db.scraper_configs.insert_one(doc)
    print(f"ADDED: EMESA ({result.inserted_id})")


if __name__ == "__main__":
    asyncio.run(main())
