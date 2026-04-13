"""Fix licitacion 69dd052c: clean bad data, re-enrich from COMPR.AR."""
import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId

LIC_ID = "69dd052c63dc304b4209e5d9"


async def run():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]

    # 1. Clean bad attached_files (from wrong licitaciones via cross-source merge)
    result = await db.licitaciones.update_one(
        {"_id": ObjectId(LIC_ID)},
        {"$set": {"attached_files": [], "pliegos_bases": []}}
    )
    print(f"Cleaned attached_files: modified={result.modified_count}")

    # 2. Clean cotizacion pliego_documents
    result2 = await db.cotizaciones.update_one(
        {"licitacion_id": LIC_ID},
        {"$set": {"pliego_documents": []}}
    )
    print(f"Cleaned cotizacion pliego_docs: modified={result2.modified_count}")

    # 3. Verify cleanup
    lic = await db.licitaciones.find_one({"_id": ObjectId(LIC_ID)})
    print(f"Attached after cleanup: {len(lic.get('attached_files', []))}")

    # 4. Try enrichment (will re-fetch from COMPR.AR)
    print("\nRunning enrichment...")
    try:
        from services.generic_enrichment import GenericEnrichmentService
        svc = GenericEnrichmentService(db)
        enrich_result = await svc.enrich(LIC_ID)
        print(f"Enrichment result: {enrich_result}")
    except Exception as e:
        print(f"Enrichment error: {type(e).__name__}: {e}")

    # 5. Check what we got
    lic = await db.licitaciones.find_one({"_id": ObjectId(LIC_ID)})
    print(f"\nAfter enrichment:")
    print(f"  attached_files: {len(lic.get('attached_files', []))}")
    print(f"  enrichment_level: {lic.get('enrichment_level')}")
    print(f"  description length: {len(lic.get('description', '') or '')}")
    print(f"  items: {len(lic.get('items', []))}")
    for a in (lic.get("attached_files") or []):
        print(f"  file: {a.get('name','')} -> {a.get('url','')[:80]}")


asyncio.run(run())
