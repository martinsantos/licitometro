"""
Add San Carlos (229 items) and Maipu (240+ items) scraper configs.

Usage: docker exec -w /app -e PYTHONPATH=/app backend python3 scripts/add_sancarlos_maipu.py
"""

import asyncio
import os
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from motor.motor_asyncio import AsyncIOMotorClient

NEW_SOURCES = [
    {
        "name": "San Carlos",
        "url": "https://sancarlos.gob.ar/licitaciones-msc/",
        "schedule": "0 8 * * 1-5",
        "active": True,
        "max_items": 100,
        "wait_time": 2,
        "selectors": {
            "scraper_type": "generic_html",
            "inline_mode": True,
            "list_item_selector": "table tbody tr, .jet-listing-grid__item",
            "list_title_selector": "a, td:nth-child(1) a",
            "list_date_selector": "td:nth-child(2)",
            "list_link_selector": "a[href*='licitacion']",
            "organization": "Municipalidad de San Carlos",
            "tipo_procedimiento": "Licitación Pública",
            "next_page_selector": "a.next.page-numbers, a.page-numbers:last-child",
        },
        "pagination": {"max_pages": 4},
    },
    {
        "name": "Maipu",
        "url": "https://www.maipu.gob.ar/compras-y-licitaciones/",
        "schedule": "0 8 * * 1-5",
        "active": True,
        "max_items": 300,
        "wait_time": 2,
        "selectors": {
            "scraper_type": "generic_html",
            "inline_mode": True,
            "list_item_selector": "table tbody tr",
            "list_title_selector": "td:nth-child(4)",
            "list_date_selector": "td:nth-child(1)",
            "list_link_selector": "td:nth-child(7) a[href*='.zip'], td a[href*='.pdf']",
            "organization": "Municipalidad de Maipú",
            "tipo_procedimiento": "Licitación Pública",
            "id_prefix": "maipu-lp-",
        },
        "pagination": {"max_pages": 1},
    },
]


async def main():
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017/licitaciones_db")
    db_name = os.environ.get("DB_NAME", "licitaciones_db")

    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    col = db.scraper_configs

    added = 0
    for source in NEW_SOURCES:
        existing = await col.find_one({"name": source["name"]})
        if existing:
            print(f"  SKIP (exists): {source['name']}")
            continue

        source["created_at"] = datetime.utcnow()
        source["updated_at"] = datetime.utcnow()
        source["runs_count"] = 0
        result = await col.insert_one(source)
        print(f"  ADDED: {source['name']} ({result.inserted_id})")
        added += 1

    total = await col.count_documents({})
    print(f"\nDone: {added} added, {total} total configs")


if __name__ == "__main__":
    asyncio.run(main())
