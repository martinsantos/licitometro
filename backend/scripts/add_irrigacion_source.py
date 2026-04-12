"""Add Irrigacion Mendoza as a scraper source and run initial scrape."""
import asyncio
import os
import time
import hashlib
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient


async def run():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]

    existing = await db.scraper_configs.find_one({"name": {"$regex": "Irrigaci"}})
    if existing:
        print(f"Config exists: {existing.get('name')}")
    else:
        config = {
            "name": "Irrigacion Mendoza API",
            "url": "https://serviciosweb.cloud.irrigacion.gov.ar/services/expedientes/api/public/licitacions",
            "active": True,
            "schedule": "0 8,12,19 * * *",
            "created_at": datetime.now(timezone.utc),
            "selectors": {},
        }
        result = await db.scraper_configs.insert_one(config)
        print(f"Created config: {result.inserted_id}")

    print("\nRunning scraper...")
    from scrapers.irrigacion_api_scraper import IrrigacionApiScraper
    from models.scraper_config import ScraperConfig

    config_doc = await db.scraper_configs.find_one({"name": {"$regex": "Irrigaci"}})
    sc = ScraperConfig(**{k: v for k, v in config_doc.items() if k != "_id"})
    scraper = IrrigacionApiScraper(sc)

    t0 = time.time()
    items = await scraper.run()
    elapsed = time.time() - t0
    print(f"Scraped: {len(items)} items in {elapsed:.1f}s")

    new_ct, upd_ct = 0, 0
    for item in items:
        try:
            d = item.model_dump()
            if d.get("source_url"):
                d["source_url"] = str(d["source_url"])
            h = hashlib.md5(f"{d.get('title','')}|{d.get('licitacion_number','')}|Irrigacion".encode()).hexdigest()
            d["content_hash"] = h
            d["fecha_scraping"] = datetime.now(timezone.utc)
            ex = await db.licitaciones.find_one({"content_hash": h})
            if ex:
                await db.licitaciones.update_one({"_id": ex["_id"]}, {"$set": {"fecha_scraping": datetime.now(timezone.utc)}})
                upd_ct += 1
            else:
                d["first_seen_at"] = d["created_at"] = d["updated_at"] = datetime.now(timezone.utc)
                d["enrichment_level"] = 2
                d["workflow_state"] = "descubierta"
                d["nodos"] = []
                d["keywords"] = []
                await db.licitaciones.insert_one(d)
                new_ct += 1
        except Exception as e:
            print(f"  Insert error: {e}")

    print(f"New: {new_ct}, Updated: {upd_ct}")
    count = await db.licitaciones.count_documents({"fuente": {"$regex": "Irrigaci"}})
    print(f"Total Irrigacion in DB: {count}")

asyncio.run(run())
