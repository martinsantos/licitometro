"""Run scrapers for ComprasApps, COMPR.AR Mendoza, and COMPR.AR Nacional.
Then test enrichment with new auth features on a sample item.
"""
import asyncio
import os
import logging
import time
from motor.motor_asyncio import AsyncIOMotorClient

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger("test_3_scrapers")


async def run():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]

    # Find configs for our 3 sources
    target_names = ["ComprasApps Mendoza", "COMPR.AR Mendoza", "COMPR.AR Nacional"]
    configs = []
    async for c in db.scraper_configs.find({"active": True}):
        name = c.get("name", "")
        if name in target_names:
            configs.append(c)

    print(f"\n{'='*60}")
    print(f"Found {len(configs)} configs:")
    for c in configs:
        print(f"  - {c.get('name')} ({str(c.get('url', ''))[:60]})")
    print(f"{'='*60}\n")

    # Count before
    before = {}
    for name in target_names:
        fuente_name = name
        # Map config name to fuente field in licitaciones
        if name == "ComprasApps Mendoza":
            fuente_name = "ComprasApps Mendoza"
        elif name == "COMPR.AR Mendoza":
            fuente_name = "COMPR.AR Mendoza"
        elif name == "COMPR.AR Nacional":
            fuente_name = "COMPR.AR Nacional"
        count = await db.licitaciones.count_documents({"fuente": fuente_name})
        before[name] = count
        print(f"  BEFORE: {name}: {count} items")

    # Run each scraper
    from scrapers.scraper_factory import create_scraper
    from models.scraper_config import ScraperConfig

    for config_doc in configs:
        name = config_doc.get("name", "?")
        print(f"\n{'='*60}")
        print(f"Running: {name}")
        print(f"{'='*60}")

        try:
            config = ScraperConfig(**{
                k: v for k, v in config_doc.items()
                if k != "_id"
            })
            scraper = create_scraper(config)
            if not scraper:
                print(f"  No scraper found for {name}")
                continue

            t0 = time.time()
            items = await scraper.run()
            elapsed = time.time() - t0

            print(f"  Result: {len(items)} items in {elapsed:.1f}s")

            # Insert/update items
            if items:
                from services.deduplication_service import DeduplicationService
                dedup = DeduplicationService(db)
                new_count = 0
                updated_count = 0
                for item in items:
                    result = await dedup.upsert_licitacion(item)
                    if result == "new":
                        new_count += 1
                    elif result == "updated":
                        updated_count += 1
                print(f"  New: {new_count}, Updated: {updated_count}, Skipped: {len(items) - new_count - updated_count}")

        except Exception as e:
            print(f"  ERROR: {type(e).__name__}: {e}")

    # Count after
    print(f"\n{'='*60}")
    print("AFTER SCRAPING:")
    print(f"{'='*60}")
    for name in target_names:
        fuente_name = name
        if name == "ComprasApps Mendoza":
            fuente_name = "ComprasApps Mendoza"
        elif name == "COMPR.AR Mendoza":
            fuente_name = "COMPR.AR Mendoza"
        elif name == "COMPR.AR Nacional":
            fuente_name = "COMPR.AR Nacional"
        count = await db.licitaciones.count_documents({"fuente": fuente_name})
        delta = count - before.get(name, 0)
        sign = "+" if delta > 0 else ""
        print(f"  {name}: {count} items ({sign}{delta})")

    # Test enrichment with auth on a ComprasApps item
    print(f"\n{'='*60}")
    print("ENRICHMENT TEST (ComprasApps auth)")
    print(f"{'='*60}")
    lic = await db.licitaciones.find_one(
        {"fuente": "ComprasApps Mendoza", "status": "active"},
        sort=[("first_seen_at", -1)]
    )
    if lic:
        lic_id = str(lic["_id"])
        print(f"  Testing find_pliegos on: {lic.get('licitacion_number')} - {lic.get('title', '')[:50]}")
        from services.pliego_finder import find_pliegos
        result = await find_pliegos(db, lic_id)
        print(f"  Strategy: {result.get('strategy_used')}")
        print(f"  Pliegos: {len(result.get('pliegos', []))}")
        for p in result.get("pliegos", []):
            ptype = p.get("type", "?")
            if ptype == "metadata":
                meta = p.get("metadata", {})
                movs = meta.get("movimientos", [])
                ocs = meta.get("ordenes_compra", [])
                print(f"    [METADATA] movimientos={len(movs)} OC={len(ocs)}")
                for m in movs[:3]:
                    print(f"      {m}")
            else:
                print(f"    [{p.get('priority')}] {p.get('label')}: {p.get('name', '')[:40]} ({p.get('source')})")
        text = result.get("text_extracted", "")
        if text:
            print(f"  Text: {len(text)} chars")

    # Test COMPR.AR Mendoza enrichment
    print(f"\n{'='*60}")
    print("ENRICHMENT TEST (COMPR.AR Mendoza auth)")
    print(f"{'='*60}")
    lic2 = await db.licitaciones.find_one(
        {"fuente": "COMPR.AR Mendoza", "status": "active"},
        sort=[("first_seen_at", -1)]
    )
    if lic2:
        lic_id2 = str(lic2["_id"])
        print(f"  Testing find_pliegos on: {lic2.get('licitacion_number', '?')} - {lic2.get('title', '')[:50]}")
        result2 = await find_pliegos(db, lic_id2)
        print(f"  Strategy: {result2.get('strategy_used')}")
        print(f"  Pliegos: {len(result2.get('pliegos', []))}")
        for p in result2.get("pliegos", [])[:5]:
            print(f"    [{p.get('priority')}] {p.get('label')}: {p.get('name', '')[:40]} ({p.get('source')})")
        text2 = result2.get("text_extracted", "")
        if text2:
            print(f"  Text: {len(text2)} chars")
            print(f"  Preview: {text2[:200]}")

    print(f"\n{'='*60}")
    print("DONE")


asyncio.run(run())
