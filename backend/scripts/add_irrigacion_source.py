#!/usr/bin/env python3
"""
Add Irrigación (Departamento General de Irrigación) scraper config.

WordPress blog at irrigacion.gov.ar/web/category/licitaciones/
Uses GenericHtmlScraper with inline_mode.

Usage (from Docker):
  docker exec -w /app -e PYTHONPATH=/app licitometro-backend-1 python scripts/add_irrigacion_source.py
"""

import asyncio
import os
import sys
from datetime import datetime
from pathlib import Path
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).parent.parent))
from motor.motor_asyncio import AsyncIOMotorClient


async def main():
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017/licitaciones_db")
    db_name = os.environ.get("DB_NAME", "licitaciones_db")

    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    existing = await db.scraper_configs.find_one({"name": "Irrigacion"})
    if existing:
        print(f"SKIP (exists): Irrigacion (id={existing.get('_id')})")
        client.close()
        return

    doc = {
        "_id": str(uuid4()),
        "name": "Irrigacion",
        "url": "https://www.irrigacion.gov.ar/web/category/licitaciones/",
        "active": True,
        "schedule": "0 8 * * 1-5",
        "max_items": 50,
        "selectors": {
            "scraper_type": "generic_html",
            "inline_mode": True,
            "list_item_selector": "article, .vc_gitem-zone-mini",
            "list_title_selector": "h4 a, .entry-title a, h2 a",
            "list_date_selector": ".vc_gitem-post-date, time, .published",
            "list_link_selector": "h4 a[href], .entry-title a[href], h2 a[href]",
            "organization": "Departamento General de Irrigación",
            "tipo_procedimiento": "Licitación",
            "id_prefix": "irrigacion-",
        },
        "pagination": {"max_pages": 3},
        "source_type": "website",
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }

    await db.scraper_configs.insert_one(doc)
    print(f"Created Irrigacion config: id={doc['_id']}")
    print(f"  URL: {doc['url']}")
    print(f"  Schedule: {doc['schedule']}")
    print(f"  Max items: {doc['max_items']}")

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
