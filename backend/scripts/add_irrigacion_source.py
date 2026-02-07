#!/usr/bin/env python3
"""
Add Irrigación (Departamento General de Irrigación) scraper config.

WordPress blog at irrigacion.gov.ar/web/category/licitaciones/
Uses GenericHtmlScraper with inline_mode.

Usage (from Docker):
  docker exec -w /app -e PYTHONPATH=/app licitometro-backend-1 python scripts/add_irrigacion_source.py

Usage (local):
  cd backend && PYTHONPATH=. python scripts/add_irrigacion_source.py
"""

import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from db.repositories import ScraperConfigRepository
from models.scraper_config import ScraperConfigCreate

load_dotenv()

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "licitaciones_db")

CONFIG = ScraperConfigCreate(
    name="Irrigacion",
    url="https://www.irrigacion.gov.ar/web/category/licitaciones/",
    active=True,
    schedule="0 8 * * 1-5",
    max_items=50,
    selectors={
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
    pagination={"max_pages": 3},
    source_type="website",
)


async def main():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    repo = ScraperConfigRepository(db)

    # Check if already exists
    existing = await repo.get_by_name("Irrigacion")
    if existing:
        print(f"Irrigacion config already exists (id={existing['id']})")
        client.close()
        return

    result = await repo.create(CONFIG)
    print(f"Created Irrigacion config: id={result['id']}")
    print(f"  URL: {CONFIG.url}")
    print(f"  Schedule: {CONFIG.schedule}")
    print(f"  Max items: {CONFIG.max_items}")

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
