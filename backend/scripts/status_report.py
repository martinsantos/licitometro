"""Status report — licitaciones por fuente, nuevas hoy, credenciales."""
import asyncio
import os
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient


async def run():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]

    # Stats by source
    pipeline = [
        {"$group": {"_id": "$fuente", "count": {"$sum": 1}, "latest": {"$max": "$fecha_scraping"}}},
        {"$sort": {"count": -1}},
    ]
    results = await db.licitaciones.aggregate(pipeline).to_list(50)

    total = 0
    print("\nLICITACIONES POR FUENTE:")
    print(f"{'Count':>7}  {'Fuente':<42} {'Ultimo scraping'}")
    print("-" * 75)
    for r in results:
        name = r["_id"] or "(sin fuente)"
        count = r["count"]
        latest = str(r.get("latest", ""))[:19]
        total += count
        print(f"{count:>7}  {name:<42} {latest}")
    print("-" * 75)
    print(f"{total:>7}  TOTAL")

    # New items today
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    new_today = await db.licitaciones.count_documents({"first_seen_at": {"$gte": today}})
    scraped_today = await db.licitaciones.count_documents({"fecha_scraping": {"$gte": today}})
    print(f"\nNuevas hoy (first_seen_at): {new_today}")
    print(f"Scrapeadas hoy (fecha_scraping): {scraped_today}")

    # 3 target sources detail
    print("\n3 FUENTES OBJETIVO:")
    for fuente in ["COMPR.AR Mendoza", "ComprasApps Mendoza", "COMPR.AR Nacional"]:
        count = await db.licitaciones.count_documents({"fuente": fuente})
        active = await db.licitaciones.count_documents({"fuente": fuente, "status": "active"})
        enriched = await db.licitaciones.count_documents({"fuente": fuente, "enrichment_level": {"$gte": 2}})
        print(f"  {fuente}: {count} total, {active} active, {enriched} enriched(L2+)")

    # Credentials status
    print("\nCREDENCIALES:")
    async for c in db.site_credentials.find():
        name = c.get("site_name", "?")
        status = c.get("last_status", "?")
        used = str(c.get("last_used", ""))[:19] if c.get("last_used") else "never"
        print(f"  {name:<25} status={status:<40} used={used}")

    # Latest scraper runs
    print("\nULTIMOS SCRAPER RUNS:")
    async for run_doc in db.scraper_runs.find().sort("started_at", -1).limit(5):
        name = run_doc.get("scraper_name", "?")
        status = run_doc.get("status", "?")
        items = run_doc.get("items_found", 0)
        started = str(run_doc.get("started_at", ""))[:19]
        print(f"  {name:<30} {status:<12} items={items:<5} started={started}")


asyncio.run(run())
