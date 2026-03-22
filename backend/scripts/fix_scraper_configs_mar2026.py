"""
Fix scraper configs — March 2026

1. Disable COMPR.AR Nacional (stub, never worked, data covered by CONTRAT.AR)
2. Disable Datos Argentina API (stale 2021 data, no DataStore active)
3. Fix OCDS Mendoza scope (was ar_nacional, should be Mendoza)
4. Ensure Boletin Oficial Nacional config is active with correct selectors

Run in production:
  docker exec -w /app -e PYTHONPATH=/app licitometro-backend-1 python3 scripts/fix_scraper_configs_mar2026.py
"""
import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from motor.motor_asyncio import AsyncIOMotorClient


async def main():
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "licitaciones_db")
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    print("=== Fix Scraper Configs (March 2026) ===\n")

    # 1. Disable COMPR.AR Nacional
    result = await db.scraper_configs.update_many(
        {"$or": [
            {"name": "COMPR.AR"},
            {"url": {"$regex": "comprar\\.gob\\.ar", "$options": "i"}},
        ]},
        {"$set": {"active": False}},
    )
    print(f"1. COMPR.AR Nacional: disabled {result.modified_count} config(s)")

    # 2. Disable Datos Argentina API
    result = await db.scraper_configs.update_many(
        {"$or": [
            {"name": {"$regex": "datos.argentina", "$options": "i"}},
            {"url": {"$regex": "datos\\.gob\\.ar", "$options": "i"}},
        ]},
        {"$set": {"active": False}},
    )
    print(f"2. Datos Argentina: disabled {result.modified_count} config(s)")

    # 3. Fix OCDS Mendoza scope + URL (API broken, use JSON downloads)
    result = await db.scraper_configs.update_many(
        {"$or": [
            {"name": {"$regex": "contrataciones.abiertas", "$options": "i"}},
            {"url": {"$regex": "datosabiertos-compras\\.mendoza", "$options": "i"}},
        ]},
        {
            "$unset": {"scope": ""},
            "$set": {
                "active": True,
                "url": "https://datosabiertos-compras.mendoza.gov.ar/datasets/",
                "max_items": 200,
            },
        },
    )
    print(f"3. OCDS Mendoza: fixed scope+URL on {result.modified_count} config(s)")

    # 4. Ensure Boletin Oficial Nacional is active with correct URL
    bo_config = await db.scraper_configs.find_one(
        {"$or": [
            {"name": {"$regex": "boletin.*oficial.*nac", "$options": "i"}},
            {"url": {"$regex": "boletinoficial\\.gob\\.ar", "$options": "i"}},
        ]}
    )
    if bo_config:
        await db.scraper_configs.update_one(
            {"_id": bo_config["_id"]},
            {"$set": {
                "active": True,
                "selectors": {
                    **(bo_config.get("selectors") or {}),
                    "section_url": "https://www.boletinoficial.gob.ar/seccion/tercera",
                    "max_pages": 3,
                },
            }},
        )
        print(f"4. Boletin Oficial Nacional: ensured active with correct selectors")
    else:
        print("4. Boletin Oficial Nacional: no config found (may need to create one)")

    # Summary
    print("\n--- Active scrapers ---")
    active = await db.scraper_configs.count_documents({"active": True})
    inactive = await db.scraper_configs.count_documents({"active": False})
    print(f"Active: {active}, Inactive: {inactive}")

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
