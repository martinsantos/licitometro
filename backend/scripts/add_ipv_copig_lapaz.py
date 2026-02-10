"""
Add IPV Mendoza, COPIG, and La Paz scraper configs.

Sources verified 2026-02-10:
- IPV Mendoza: WordPress blog, 60 pages, h2.entry-title links to detail pages
- COPIG: Custom theme, div.item cards with inline links, 13 pages, 20 items/page
- La Paz: WordPress Vantage theme, article.grid-post with h3 links, 6 pages
  NOTE: La Paz on 200.58.x.x ISP, blocks datacenter IPs. Config created inactive.

Usage: docker exec -w /app -e PYTHONPATH=/app licitometro-backend-1 python3 scripts/add_ipv_copig_lapaz.py
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
        "name": "IPV Mendoza",
        "url": "https://www.ipvmendoza.gov.ar/proveedores/licitaciones-y-pliegos/",
        "schedule": "0 10 * * *",
        "active": True,
        "max_items": 50,
        "wait_time": 2,
        "selectors": {
            "scraper_type": "generic_html",
            # Link mode: follow links to detail pages
            "link_selector": "h2.entry-title a[href], .entry-title a[rel='bookmark']",
            "link_pattern": "ipvmendoza\\.gov\\.ar/licitacion",
            "title_selector": "h1.entry-title, h2.entry-title, h1.cg-page-title",
            "description_selector": ".entry-content, .wpb_wrapper",
            "date_selector": "time.entry-date, .posted-on time, .date",
            "next_page_selector": "li.next a",
            "organization": "Instituto Provincial de la Vivienda (IPV)",
            "jurisdiccion": "Mendoza",
        },
        "pagination": {"max_pages": 5},
    },
    {
        "name": "COPIG Mendoza",
        "url": "https://www.copigmza.org.ar/licitaciones/",
        "schedule": "0 11 * * *",
        "active": True,
        "max_items": 50,
        "wait_time": 2,
        "selectors": {
            "scraper_type": "generic_html",
            # Link mode: each div.item wraps an <article><a> with full URL
            "link_selector": "div.item article a[href]",
            "link_pattern": "copigmza\\.org\\.ar/licitaciones/",
            "title_selector": "h1, h2, .entry-title, div.data p",
            "description_selector": ".entry-content, .content, article",
            "date_selector": "p.date, .date, time",
            "next_page_selector": "a.next.page-numbers",
            "organization": "COPIG - Consejo Profesional de Ingenieros y Geólogos",
            "jurisdiccion": "Mendoza",
        },
        "pagination": {"max_pages": 5},
    },
    {
        "name": "La Paz",
        "url": "https://lapazmendoza.gob.ar/licitaciones/",
        "schedule": "0 12 * * *",
        "active": False,  # ISP 200.58.x.x blocks datacenter IPs
        "max_items": 30,
        "wait_time": 2,
        "selectors": {
            "scraper_type": "generic_html",
            # Link mode: article.grid-post h3 > a links to detail pages
            "link_selector": "article.grid-post h3 a[href]",
            "link_pattern": "lapazmendoza\\.gob\\.ar/",
            "title_selector": "h1.entry-title, h3, .entry-title",
            "description_selector": ".entry-content, .excerpt, .panel-layout",
            "date_selector": "time, .posted-on, .entry-date",
            "next_page_selector": "a.next.page-numbers",
            "organization": "Municipalidad de La Paz",
            "jurisdiccion": "Mendoza",
        },
        "pagination": {"max_pages": 3},
    },
]


async def main():
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017/licitaciones_db")
    db_name = os.environ.get("DB_NAME", "licitaciones_db")

    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    col = db.scraper_configs

    added = 0
    skipped = 0
    for source in NEW_SOURCES:
        existing = await col.find_one({"name": source["name"]})
        if existing:
            print(f"  SKIP (exists): {source['name']}")
            skipped += 1
            continue

        source["created_at"] = datetime.utcnow()
        source["updated_at"] = datetime.utcnow()
        source["runs_count"] = 0
        await col.insert_one(source)
        print(f"  ADDED: {source['name']}")
        added += 1

    total = await col.count_documents({})
    print(f"\nDone: {added} added, {skipped} skipped, {total} total configs")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
