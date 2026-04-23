#!/usr/bin/env python3
"""One-time script to add COMPR.AR Nacional scraper config."""
import asyncio
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from motor.motor_asyncio import AsyncIOMotorClient


async def main():
    mongo_url = os.getenv("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.getenv("DB_NAME", "licitometro")
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    result = await db.scraper_configs.update_one(
        {"name": "COMPR.AR Nacional"},
        {"$set": {
            "name": "COMPR.AR Nacional",
            "url": "https://comprar.gob.ar/Compras.aspx",
            "scraper_type": "comprar_nacional",
            "fuente": "comprar_nacional",
            "active": True,
            "tags": ["LIC_AR"],
            "jurisdiccion": "Nacional",
            "wait_time": 1.5,
            "max_items": 200,
            "selectors": {
                "max_pages": 10,
                "disable_date_filter": True,
            },
            "pagination": {},
        }},
        upsert=True,
    )
    print(f"Config upserted: {result.upserted_id or 'updated existing'}")
    client.close()


asyncio.run(main())
