"""Clear cached pliego_documents and test find_pliegos fresh."""
import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient

LIC_ID = "69d9f183abe5e93655909ba1"

async def run():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]

    # Clear cached pliego_documents
    r = await db.cotizaciones.update_one(
        {"licitacion_id": LIC_ID},
        {"$set": {"pliego_documents": []}},
    )
    print(f"Cleared pliego_documents: {r.modified_count}")

    # Test fresh
    from services.pliego_finder import find_pliegos
    result = await find_pliegos(db, LIC_ID)
    pliegos = [p for p in result.get("pliegos", []) if p.get("type") != "metadata"]
    print(f"\nPliegos: {len(pliegos)}")
    for p in pliegos:
        pri = p.get("priority", "?")
        name = p.get("name", "?")[:40]
        src = p.get("source", "?")
        url = p.get("url", "")[:50]
        print(f"  [{pri}] {name} | src={src} | url={url}")
    print(f"\nHint: {result.get('hint')}")

asyncio.run(run())
