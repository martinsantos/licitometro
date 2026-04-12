"""Debug what pliego data exists for DECRETOS 368."""
import asyncio
import os
import re
from motor.motor_asyncio import AsyncIOMotorClient


async def run():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]

    # Find the ComprasApps item
    ca = await db.licitaciones.find_one({
        "fuente": "ComprasApps Mendoza",
        "licitacion_number": {"$regex": "^368/2025"},
    })
    if ca:
        print("=== ComprasApps item ===")
        print(f"  Number: {ca.get('licitacion_number')}")
        print(f"  Title: {ca.get('title', '')[:60]}")
        print(f"  Source URL: {str(ca.get('source_url', ''))[:80]}")
        print(f"  Attached files: {len(ca.get('attached_files', []))}")
        meta = ca.get("metadata") or {}
        dp = meta.get("detail_popup") or {}
        print(f"  Has detail_popup: {'yes' if dp else 'no'}")
        if dp:
            print(f"  Budget: {dp.get('budget_raw')}")
            print(f"  Description: {(dp.get('description') or '')[:80]}")
        surls = ca.get("source_urls") or {}
        for k, v in surls.items():
            print(f"  source_urls[{k}]: {str(v)[:70]}")
        print(f"  proceso_id: {ca.get('proceso_id')}")
        print(f"  fuentes: {ca.get('fuentes', [])}")
    else:
        print("NO ComprasApps item found for 368/2025")

    # Check COMPR.AR items
    print("\n=== COMPR.AR items matching ===")
    async for item in db.licitaciones.find({
        "fuente": "COMPR.AR Mendoza",
        "$or": [
            {"proceso_id": "EX-2025-10538748-GDEMZA"},
            {"title": {"$regex": "medicamento.*508|508.*medicamento", "$options": "i"}},
        ]
    }).limit(5):
        print(f"  [{item.get('licitacion_number')}] {item.get('title', '')[:60]}")
        print(f"    source_url: {str(item.get('source_url', ''))[:70]}")
        print(f"    proceso_id: {item.get('proceso_id')}")

    # Check BOE item
    print("\n=== BOE source item ===")
    from bson import ObjectId
    boe = await db.licitaciones.find_one({"_id": ObjectId("69d9f183abe5e93655909ba1")})
    if boe:
        print(f"  Title: {boe.get('title', '')[:60]}")
        print(f"  Description: {(boe.get('description') or '')[:200]}")
        attached = boe.get("attached_files") or []
        print(f"  Attached: {len(attached)}")
        for f in attached:
            print(f"    - {f.get('name', '?')}: {f.get('url', '')[:60]}")

    # The actual problem: what pliego sources exist?
    print("\n=== DIAGNOSIS ===")
    print("This item is DECRETOS 368 from BOE (Boletin Oficial)")
    print("The BOE PDF (32571) is a 161-page gazette, NOT the actual pliego")
    print("The pliego should be on ComprasApps or COMPR.AR")
    if ca:
        print(f"ComprasApps item exists: {ca.get('licitacion_number')}")
        print(f"  But TBLDESCARGA_Visible was False (no pliego downloads)")
        print(f"  The pliego may need to be uploaded manually from ComprasApps portal")
    else:
        print("No ComprasApps item found — pliego must be manually uploaded")


asyncio.run(run())
