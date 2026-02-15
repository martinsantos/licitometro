"""
Seed scraper configurations for AR national procurement sources.
All configs have scope='ar_nacional' and are inactive by default (manual trigger).

Usage:
    python scripts/seed_ar_sources.py [--activate]
"""
import asyncio
import os
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from motor.motor_asyncio import AsyncIOMotorClient


AR_SOURCES = [
    {
        "name": "datos_argentina_contrataciones",
        "url": "https://datos.gob.ar/dataset?tags=Contrataciones",
        "active": False,
        "schedule": "0 8,14 * * 1-5",  # 8am and 2pm weekdays
        "selectors": {
            "dataset_id": "jgm-sistema-contrataciones-electronicas",
            "scraper_type": "datos_argentina",
        },
        "source_type": "api",
        "max_items": 200,
        "wait_time": 1.0,
        "scope": "ar_nacional",
    },
    {
        "name": "datos_argentina_contratar",
        "url": "https://datos.gob.ar/dataset/jgm-procesos-contratacion-obra-publica-gestionados-plataforma-contratar",
        "active": False,
        "schedule": "0 9 * * 1-5",
        "selectors": {
            "dataset_id": "jgm-procesos-contratacion-obra-publica-gestionados-plataforma-contratar",
            "scraper_type": "datos_argentina",
        },
        "source_type": "api",
        "max_items": 200,
        "wait_time": 1.0,
        "scope": "ar_nacional",
    },
    {
        "name": "contrataciones_abiertas_mendoza_ocds",
        "url": "https://datosabiertos-compras.mendoza.gov.ar/datosabiertos/",
        "active": False,
        "schedule": "0 10 * * 1-5",
        "selectors": {
            "scraper_type": "contrataciones_abiertas_mza",
        },
        "source_type": "api",
        "max_items": 200,
        "wait_time": 1.0,
        "scope": "ar_nacional",
    },
    {
        "name": "banco_mundial_argentina",
        "url": "https://search.worldbank.org/api/v2/procnotices",
        "active": False,
        "schedule": "0 7 * * 1-5",
        "selectors": {
            "scraper_type": "banco_mundial",
        },
        "source_type": "api",
        "max_items": 100,
        "wait_time": 2.0,
        "scope": "ar_nacional",
    },
    {
        "name": "bid_procurement_argentina",
        "url": "https://data.iadb.org/dataset/project-procurement-bidding-notices-and-notification-of-contract-awards",
        "active": False,
        "schedule": "0 7 * * 1-5",
        "selectors": {
            "resource_id": "856aabfd-2c6a-48fb-a8b8-19f3ff443618",
            "scraper_type": "bid",
        },
        "source_type": "api",
        "max_items": 100,
        "wait_time": 2.0,
        "scope": "ar_nacional",
    },
    {
        "name": "santa_fe_compras",
        "url": "https://www.santafe.gov.ar/index.php/guia/portal_compras",
        "active": False,
        "schedule": "0 8,14 * * 1-5",
        "selectors": {
            "rss_url": "https://www.santafe.gov.ar/index.php/guia/portal_compras?pagina=rss",
            "cartelera_url": "https://www.santafe.gov.ar/index.php/guia/portal_compras",
            "scraper_type": "santa_fe",
        },
        "source_type": "website",
        "max_items": 100,
        "wait_time": 2.0,
        "scope": "ar_nacional",
    },
    {
        "name": "comprar_gob_ar_nacional",
        "url": "https://comprar.gob.ar/BuscarAvanzado.aspx",
        "active": False,
        "schedule": "0 8,12,18 * * 1-5",
        "selectors": {
            "title": "h1.titulo",
            "organization": "div.organismo",
            "publication_date": "div.fecha-publicacion",
            "opening_date": "div.fecha-apertura",
            "links": "table.items a.ver-detalle",
        },
        "source_type": "website",
        "max_items": 100,
        "wait_time": 2.0,
        "scope": "ar_nacional",
    },
    {
        "name": "contratar_gob_ar",
        "url": "https://contratar.gob.ar/",
        "active": False,
        "schedule": "0 9,15 * * 1-5",
        "selectors": {
            "scraper_type": "contratar",
        },
        "source_type": "website",
        "max_items": 100,
        "wait_time": 3.0,
        "scope": "ar_nacional",
    },
    {
        "name": "boletin_oficial_nacional",
        "url": "https://www.boletinoficial.gob.ar/seccion/tercera",
        "active": False,
        "schedule": "0 8,13 * * 1-5",
        "selectors": {
            "section_url": "https://www.boletinoficial.gob.ar/seccion/tercera",
            "scraper_type": "boletin_oficial_nacional",
        },
        "source_type": "website",
        "max_items": 50,
        "wait_time": 3.0,
        "scope": "ar_nacional",
    },
    {
        "name": "pbac_buenos_aires",
        "url": "https://pbac.cgp.gba.gov.ar/",
        "active": False,
        "schedule": "0 8,14 * * 1-5",
        "selectors": {
            "scraper_type": "pbac",
        },
        "source_type": "website",
        "max_items": 100,
        "wait_time": 3.0,
        "scope": "ar_nacional",
    },
]


async def main():
    activate = "--activate" in sys.argv

    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "licitaciones_db")

    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    collection = db.scraper_configs

    print(f"Seeding {len(AR_SOURCES)} AR scraper configurations...")

    created = 0
    updated = 0
    for source in AR_SOURCES:
        existing = await collection.find_one({"name": source["name"]})

        if activate:
            source["active"] = True

        now = datetime.utcnow()

        if existing:
            await collection.update_one(
                {"name": source["name"]},
                {"$set": {**source, "updated_at": now}},
            )
            updated += 1
            print(f"  Updated: {source['name']}")
        else:
            source["created_at"] = now
            source["updated_at"] = now
            source["runs_count"] = 0
            source["last_run"] = None
            source["headers"] = {}
            source["cookies"] = {}
            await collection.insert_one(source)
            created += 1
            print(f"  Created: {source['name']}")

    print(f"\nDone: {created} created, {updated} updated")
    if not activate:
        print("Note: All sources are INACTIVE by default. Use --activate to enable them.")
        print("Or activate individually from the Admin panel.")

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
