"""Add or repair BAC Buenos Aires scraper config in MongoDB.

The scraper factory routes by URL and by ``selectors.scraper_type``. Keep the
legacy top-level fields for admin visibility, but do not rely on them for
runtime routing.
"""

import asyncio
import os

from motor.motor_asyncio import AsyncIOMotorClient
from utils.time import utc_now


async def main():
    client = AsyncIOMotorClient(os.getenv("MONGO_URL", "mongodb://localhost:27017"))
    db = client[os.getenv("DB_NAME", "licitaciones_db")]
    now = utc_now()
    result = await db.scraper_configs.update_one(
        {"name": "BAC Buenos Aires"},
        {"$set": {
            "name": "BAC Buenos Aires",
            "url": "https://www.buenosairescompras.gob.ar/Compras.aspx",
            "active": False,  # keep inactive until a smoke run is verified
            "schedule": "15 8,14 * * 1-5",
            "selectors": {
                "scraper_type": "bac_buenos_aires",
                "max_pages": 2,
            },
            "source_type": "website",
            "max_items": 25,
            "wait_time": 1.5,
            "scope": "ar_nacional",
            "scraper_type": "bac_buenos_aires",
            "fuente": "bac_buenos_aires",
            "tags": ["LIC_AR"],
            "updated_at": now,
        }},
        upsert=True
    )
    print(f"BAC config upserted matched={result.matched_count} modified={result.modified_count}")


asyncio.run(main())
