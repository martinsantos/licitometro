"""
Add new Mendoza data sources to the scraper_configs collection.
Skips sources that already exist (by name).

Usage: docker exec backend python3 scripts/add_new_sources.py
"""

import asyncio
import os
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from motor.motor_asyncio import AsyncIOMotorClient


NEW_SOURCES = [
    # ---- Organismos descentralizados ----
    {
        "name": "EPRE Mendoza",
        "url": "https://epremendoza.gob.ar/compras-licitaciones-2/",
        "schedule": "0 9 * * 1-5",
        "active": True,
        "max_items": 30,
        "wait_time": 2,
        "selectors": {
            "scraper_type": "generic_html",
            "inline_mode": True,
            "list_item_selector": "tr[id^='row-'], table tbody tr",
            "list_title_selector": "td:nth-child(5), td:nth-child(4)",
            "list_date_selector": "td:nth-child(1)",
            "list_link_selector": "a[href*='.pdf'], a[href]",
            "organization": "EPRE - Ente Provincial Regulador Eléctrico",
            "tipo_procedimiento": "Licitación Pública",
        },
        "pagination": {"max_pages": 1},
    },
    {
        "name": "Ciudad de Mendoza",
        "url": "https://ciudaddemendoza.gob.ar/licitaciones-publicas/",
        "schedule": "0 10 * * 1-5",
        "active": True,
        "max_items": 20,
        "wait_time": 2,
        "selectors": {
            "scraper_type": "generic_html",
            "inline_mode": True,
            "list_item_selector": ".jet-listing-grid__item, .jet-listing-dynamic-post",
            "list_title_selector": "h2, h3, .elementor-heading-title",
            "list_date_selector": ".elementor-heading-title",
            "list_link_selector": "a[href*='drive.google'], a[href*='.pdf']",
            "organization": "Municipalidad de la Ciudad de Mendoza",
            "tipo_procedimiento": "Licitación de Obra Pública",
        },
        "pagination": {"max_pages": 5},
    },
    {
        "name": "Guaymallén",
        "url": "https://www.guaymallen.gob.ar/category/liciataciones/",
        "schedule": "0 10 * * 1-5",
        "active": True,
        "max_items": 20,
        "wait_time": 2,
        "selectors": {
            "scraper_type": "generic_html",
            "link_selector": "article a[href], .entry-title a[href], h2 a[href]",
            "link_pattern": "guaymallen\\.gob\\.ar/\\d{4}/",
            "title_selector": "h1.entry-title, h1, h2.entry-title",
            "description_selector": ".entry-content, article",
            "date_selector": "time, .posted-on, .entry-date",
            "organization": "Municipalidad de Guaymallén",
            "next_page_selector": "a.next, .nav-previous a",
        },
        "pagination": {"max_pages": 3},
    },
    {
        "name": "FTyC Mendoza",
        "url": "https://ftyc.gob.ar/licitaciones/",
        "schedule": "0 11 * * 1-5",
        "active": True,
        "max_items": 20,
        "wait_time": 2,
        "selectors": {
            "scraper_type": "generic_html",
            "link_selector": "article a[href], .entry-title a[href], h2 a[href], a[href*='licitacion']",
            "link_pattern": "ftyc\\.gob\\.ar/",
            "title_selector": "h1.entry-title, h1, .entry-title",
            "description_selector": ".entry-content, .post-content, article",
            "date_selector": "time, .date, .published",
            "organization": "Fondo para la Transformación y el Crecimiento",
            "next_page_selector": "a.next, .nav-next a",
        },
        "pagination": {"max_pages": 3},
    },
    {
        "name": "Luján de Cuyo",
        "url": "https://licitaciones.lujandecuyo.gob.ar/",
        "schedule": "0 11 * * 1-5",
        "active": True,
        "max_items": 20,
        "wait_time": 2,
        "selectors": {
            "scraper_type": "generic_html",
            "link_selector": "a[href*='licitacion'], table a[href], .entry-title a",
            "link_pattern": "lujandecuyo",
            "title_selector": "h1, h2, .titulo, .entry-title",
            "description_selector": ".entry-content, .descripcion, article",
            "date_selector": "time, .fecha, .date",
            "organization": "Municipalidad de Luján de Cuyo",
            "next_page_selector": "a.next, .pagination .next a",
        },
        "pagination": {"max_pages": 3},
    },
    {
        "name": "Godoy Cruz",
        "url": "https://webapps.godoycruz.gob.ar/consultacompras/index",
        "schedule": "0 12 * * 1-5",
        "active": True,
        "max_items": 30,
        "wait_time": 2,
        "selectors": {
            "scraper_type": "generic_html",
            "link_selector": "table a[href], a[href*='detalle'], a[href*='compra']",
            "title_selector": "h1, h2, .titulo",
            "description_selector": ".detalle, .descripcion, table",
            "date_selector": ".fecha, time, td:first-child",
            "organization": "Municipalidad de Godoy Cruz",
        },
        "pagination": {"max_pages": 3},
    },
    {
        "name": "Tribunal de Cuentas Mendoza",
        "url": "https://www.tribunaldecuentas.mendoza.gov.ar/compras-y-presupuesto",
        "schedule": "0 12 * * 1-5",
        "active": True,
        "max_items": 20,
        "wait_time": 2,
        "selectors": {
            "scraper_type": "generic_html",
            "link_selector": "a[href*='.pdf'], a[href*='compra'], article a",
            "link_pattern": "tribunaldecuentas",
            "title_selector": "h1, h2, .entry-title",
            "description_selector": ".entry-content, article",
            "date_selector": "time, .date",
            "organization": "Tribunal de Cuentas de Mendoza",
        },
        "pagination": {"max_pages": 2},
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
        source["runs_count"] = 0
        await col.insert_one(source)
        print(f"  ADDED: {source['name']}")
        added += 1

    # Re-enable Boletin PDF extraction (now memory-safe)
    result = await col.update_one(
        {"name": "Boletin Oficial Mendoza"},
        {"$set": {
            "selectors.extract_pdf_content": True,
            "selectors.segment_processes": True,
        }},
    )
    if result.modified_count:
        print("  UPDATED: Boletin Oficial Mendoza - PDF extraction re-enabled")

    total = await col.count_documents({})
    print(f"\nDone: {added} added, {skipped} skipped, {total} total configs")


if __name__ == "__main__":
    asyncio.run(main())
