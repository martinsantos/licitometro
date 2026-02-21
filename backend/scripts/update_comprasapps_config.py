"""
Update ComprasApps Mendoza scraper config to use the correct GeneXus protocol.

The previous config used wrong field names (WCUC, WEstado, etc.).
This script updates it with the correct vLICUC, vESTFILTRO, etc.

Run: docker exec -w /app -e PYTHONPATH=/app licitometro-backend-1 python3 scripts/update_comprasapps_config.py
"""

import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime


async def main():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]

    # Check if config already exists
    existing = await db.scraper_configs.find_one({
        "$or": [
            {"name": {"$regex": "ComprasApps", "$options": "i"}},
            {"base_url": {"$regex": "comprasapps", "$options": "i"}},
            {"url": {"$regex": "comprasapps", "$options": "i"}},
        ]
    })

    config = {
        "name": "ComprasApps Mendoza",
        "url": "https://comprasapps.mendoza.gov.ar/Compras/servlet/hli00049",
        "base_url": "https://comprasapps.mendoza.gov.ar/Compras/servlet/hli00049",
        "is_active": True,
        "active": True,
        "source_type": "website",
        "wait_time": 0.5,
        "max_items": None,
        "selectors": {
            "years": [2026, 2025],
            "estado_filters": ["V", "P"],
            "cuc_filter": "0",
            "max_pages": 50,
        },
        "pagination": {},
        "headers": {},
        "cookies": {},
        "updated_at": datetime.utcnow(),
    }

    if existing:
        print(f"Updating existing config: {existing.get('name', 'unknown')} (id={existing['_id']})")
        await db.scraper_configs.update_one(
            {"_id": existing["_id"]},
            {"$set": config}
        )
        print("Config updated successfully")
    else:
        config["created_at"] = datetime.utcnow()
        config["runs_count"] = 0
        config["last_run"] = None
        result = await db.scraper_configs.insert_one(config)
        print(f"Config created with id: {result.inserted_id}")

    # Verify
    final = await db.scraper_configs.find_one({"name": "ComprasApps Mendoza"})
    if final:
        print(f"\nVerification:")
        print(f"  Name: {final['name']}")
        print(f"  URL: {final.get('url', final.get('base_url', 'N/A'))}")
        print(f"  Active: {final.get('is_active', final.get('active'))}")
        print(f"  Selectors: {final.get('selectors', {})}")

    # Also list all active configs for context
    print(f"\nAll active scraper configs:")
    configs = await db.scraper_configs.find({"$or": [{"is_active": True}, {"active": True}]}).to_list(100)
    for c in sorted(configs, key=lambda x: x.get("name", "")):
        name = c.get("name", "?")
        url = str(c.get("url", c.get("base_url", "?")))[:60]
        print(f"  {name:35s} | {url}")
    print(f"  Total active: {len(configs)}")


asyncio.run(main())
