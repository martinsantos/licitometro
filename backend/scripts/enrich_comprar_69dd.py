"""Trigger COMPR.AR enrichment for licitacion 69dd052c."""
import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId

LIC_ID = "69dd052c63dc304b4209e5d9"


async def run():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]

    lic = await db.licitaciones.find_one({"_id": ObjectId(LIC_ID)})
    if not lic:
        print("NOT FOUND")
        return

    print(f"LIC: {lic.get('objeto', '')[:60]}")
    print(f"source_url: {lic.get('source_url', '')[:80]}")
    print(f"attached_files: {len(lic.get('attached_files', []))}")

    # Call COMPR.AR enrichment directly
    from services.enrichment.comprar_enricher import ComprarEnricher
    enricher = ComprarEnricher(db)
    print("\nRunning COMPR.AR enrichment...")
    try:
        result = await enricher.enrich(lic)
        print(f"Result: {result}")
    except Exception as e:
        print(f"Error: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()

    # Check result
    lic2 = await db.licitaciones.find_one({"_id": ObjectId(LIC_ID)})
    print(f"\nAfter enrichment:")
    print(f"  description: {len(lic2.get('description', '') or '')} chars")
    print(f"  items: {len(lic2.get('items', []))}")
    print(f"  attached_files: {len(lic2.get('attached_files', []))}")
    for a in (lic2.get("attached_files") or [])[:5]:
        print(f"    {a.get('name', '')[:40]} -> {a.get('url', '')[:60]}")

asyncio.run(run())
