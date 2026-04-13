"""Diagnose why pliego can't be found for a licitacion."""
import asyncio, os, json
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId

LIC_ID = "69dd052c63dc304b4209e5d9"

async def run():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]

    # 1. Check licitacion data
    lic = await db.licitaciones.find_one({"_id": ObjectId(LIC_ID)})
    if not lic:
        print("LIC NOT FOUND")
        return

    print("=== LICITACION ===")
    print("title:", lic.get("title", "")[:80])
    print("objeto:", lic.get("objeto", "")[:80])
    print("fuente:", lic.get("fuente", ""))
    print("source_url:", lic.get("source_url", "")[:100])
    print("licitacion_number:", lic.get("licitacion_number", ""))
    print("expedient_number:", lic.get("expedient_number", ""))
    print("budget:", lic.get("budget"))
    print("enrichment_level:", lic.get("enrichment_level"))

    # 2. Check attached files
    attached = lic.get("attached_files") or []
    print(f"\n=== ATTACHED FILES: {len(attached)} ===")
    for a in attached:
        name = a.get("name", "?")
        url = a.get("url", "")[:100]
        ftype = a.get("type", "?")
        print(f"  [{ftype}] {name}")
        print(f"    URL: {url}")

    # 3. Check pliegos_bases
    pliegos = lic.get("pliegos_bases") or []
    print(f"\n=== PLIEGOS_BASES: {len(pliegos)} ===")
    for p in pliegos:
        print(f"  {json.dumps(p, default=str)[:120]}")

    # 4. Check items
    items = lic.get("items") or []
    print(f"\n=== ITEMS: {len(items)} ===")
    for i in items[:5]:
        print(f"  {json.dumps(i, default=str)[:120]}")

    # 5. Check metadata
    meta = lic.get("metadata") or {}
    print(f"\n=== METADATA ===")
    print("comprar_pliego_url:", meta.get("comprar_pliego_url", "N/A"))
    print("budget_source:", meta.get("budget_source", "N/A"))

    # 6. Check credentials
    creds = await db.site_credentials.find({"enabled": True}).to_list(10)
    print(f"\n=== CREDENTIALS: {len(creds)} enabled ===")
    for c in creds:
        print(f"  {c.get('site_name','')} - {c.get('site_url','')}")

    # 7. Check cotizacion
    cot = await db.cotizaciones.find_one({"licitacion_id": LIC_ID})
    if cot:
        pliego_docs = cot.get("pliego_documents") or []
        print(f"\n=== COTIZACION EXISTS, pliego_documents: {len(pliego_docs)} ===")
    else:
        print("\n=== NO COTIZACION ===")

    # 8. Try find_pliegos
    print("\n=== RUNNING find_pliegos() ===")
    try:
        from services.pliego_finder import find_pliegos
        result = await find_pliegos(db, LIC_ID)
        print(f"Result: {json.dumps(result, default=str)[:500]}")
    except Exception as e:
        print(f"ERROR: {e}")

asyncio.run(run())
