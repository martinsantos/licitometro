"""Add MPF Mendoza scraper config to database."""
import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from motor.motor_asyncio import AsyncIOMotorClient

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "licitaciones_db")


async def main():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    config = {
        "name": "MPF Mendoza",
        "url": "https://abogados.mpfmza.gob.ar/resoluciones/5/2025",
        "active": True,
        "schedule": "0 8,10,12,15,19 * * *",
        "selectors": {
            "organization": "Ministerio Público Fiscal de Mendoza",
            "years": [2026, 2025, 2024, 2023],
        },
        "pagination": {"max_pages": 1},
        "max_items": 500,
    }

    existing = await db.scraper_configs.find_one({"name": config["name"]})
    if existing:
        await db.scraper_configs.update_one(
            {"name": config["name"]},
            {"$set": config}
        )
        print(f"Updated config: {config['name']}")
    else:
        await db.scraper_configs.insert_one(config)
        print(f"Inserted config: {config['name']}")

    client.close()

asyncio.run(main())
