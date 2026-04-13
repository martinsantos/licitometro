"""Fix pliego data for licitacion 69dd052c — remove wrong attached files, trigger COMPR.AR download."""
import asyncio, os
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId

LIC_ID = "69dd052c63dc304b4209e5d9"

async def run():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]

    # 1. Remove incorrect attached_files (from wrong licitaciones)
    print("Removing incorrect attached_files...")
    await db.licitaciones.update_one(
        {"_id": ObjectId(LIC_ID)},
        {"$set": {"attached_files": []}}
    )
    print("  Cleared attached_files")

    # 2. Clear cotizacion pliego_documents too
    cot = await db.cotizaciones.find_one({"licitacion_id": LIC_ID})
    if cot:
        await db.cotizaciones.update_one(
            {"licitacion_id": LIC_ID},
            {"$set": {"pliego_documents": []}}
        )
        print("  Cleared cotizacion pliego_documents")

    # 3. Now try find_pliegos again — should hit Strategy 3 (COMPR.AR auth)
    print("\nRunning find_pliegos() without bad attachments...")
    try:
        from services.pliego_finder import find_pliegos
        result = await find_pliegos(db, LIC_ID)
        pliegos = result.get("pliegos", [])
        print(f"Found {len(pliegos)} pliegos:")
        for p in pliegos:
            print(f"  [{p.get('type','')}] {p.get('name','')[:60]}")
            print(f"    source: {p.get('source','')}, priority: {p.get('priority','')}")
            print(f"    url: {p.get('url','')[:100]}")

        text = result.get("text_extracted", "")
        print(f"\nText extracted: {len(text)} chars")
        if text:
            print(f"  Preview: {text[:200]}")

        hints = result.get("hints", [])
        if hints:
            print(f"\nHints: {hints}")
    except Exception as e:
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()

asyncio.run(run())
