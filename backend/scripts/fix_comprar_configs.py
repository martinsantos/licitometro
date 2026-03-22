"""
Fix COMPR.AR scraper configs — March 2026

1. Disable Selenium in COMPR.AR Mendoza (HTTP-only is now sufficient)
2. Re-enable COMPR.AR Nacional with correct URL (Compras.aspx, not BuscarAvanzado)
3. Verify OCDS Mendoza is active (primary data source for Mendoza)

Run in production:
  docker exec -w /app -e PYTHONPATH=/app licitometro-backend-1 python3 scripts/fix_comprar_configs.py
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

    print("=== Fix COMPR.AR Configs ===\n")

    # 1. Disable Selenium in COMPR.AR Mendoza
    result = await db.scraper_configs.update_many(
        {"$or": [
            {"name": {"$regex": "COMPR\\.AR Mendoza", "$options": "i"}},
            {"url": {"$regex": "comprar\\.mendoza\\.gov\\.ar", "$options": "i"}},
        ]},
        {"$set": {
            "selectors.use_selenium_pliego": False,
            "selectors.selenium_max_pages": 0,
        }},
    )
    print(f"1. COMPR.AR Mendoza: disabled Selenium on {result.modified_count} config(s)")

    # 2. Re-enable COMPR.AR Nacional with Compras.aspx URL
    nac_config = await db.scraper_configs.find_one(
        {"$or": [
            {"name": {"$regex": "COMPR\\.AR$", "$options": "i"}},
            {"name": {"$regex": "comprar.*nacional", "$options": "i"}},
            {"url": {"$regex": "comprar\\.gob\\.ar", "$options": "i"}},
        ]}
    )
    if nac_config:
        result = await db.scraper_configs.update_one(
            {"_id": nac_config["_id"]},
            {"$set": {
                "active": True,
                "name": "COMPR.AR Nacional",
                "url": "https://comprar.gob.ar/Compras.aspx",
                "max_items": 200,
                "wait_time": 2.0,
                "selectors": {
                    **(nac_config.get("selectors") or {}),
                    "max_pages": 10,
                    "jurisdiccion": "Nacional",
                },
            }},
        )
        print(f"2. COMPR.AR Nacional: updated config (URL → Compras.aspx, active=True)")
    else:
        # Create new config
        await db.scraper_configs.insert_one({
            "name": "COMPR.AR Nacional",
            "url": "https://comprar.gob.ar/Compras.aspx",
            "active": True,
            "schedule": "0 8,12,18 * * *",
            "selectors": {
                "max_pages": 10,
                "jurisdiccion": "Nacional",
            },
            "source_type": "website",
            "max_items": 200,
            "wait_time": 2.0,
        })
        print("2. COMPR.AR Nacional: created new config")

    # 3. Verify OCDS Mendoza is active
    ocds = await db.scraper_configs.find_one(
        {"$or": [
            {"name": {"$regex": "contrataciones.abiertas", "$options": "i"}},
            {"url": {"$regex": "datosabiertos-compras\\.mendoza", "$options": "i"}},
        ]}
    )
    if ocds:
        active = ocds.get("active", False)
        print(f"3. OCDS Mendoza: {'ACTIVE' if active else 'INACTIVE'} — {ocds.get('name')}")
    else:
        print("3. OCDS Mendoza: NOT FOUND — needs to be created")

    # Summary
    print("\n--- Active COMPR.AR-related scrapers ---")
    async for cfg in db.scraper_configs.find(
        {"$or": [
            {"url": {"$regex": "comprar", "$options": "i"}},
            {"name": {"$regex": "compr|ocds|contrataciones", "$options": "i"}},
        ]},
        {"name": 1, "url": 1, "active": 1}
    ):
        status = "ACTIVE" if cfg.get("active") else "inactive"
        print(f"  [{status}] {cfg.get('name')} — {cfg.get('url')}")

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
