"""Clean contaminated data for licitacion 69dd052c."""
import asyncio, os
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId

LIC_ID = "69dd052c63dc304b4209e5d9"

async def run():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]

    # Clear bad attached_files and pliego_documents
    r1 = await db.licitaciones.update_one(
        {"_id": ObjectId(LIC_ID)},
        {"$set": {"attached_files": [], "pliegos_bases": []}}
    )
    r2 = await db.cotizaciones.update_one(
        {"licitacion_id": LIC_ID},
        {"$set": {"pliego_documents": []}}
    )
    print(f"Cleaned: lic={r1.modified_count} cot={r2.modified_count}")

    # Verify
    lic = await db.licitaciones.find_one({"_id": ObjectId(LIC_ID)})
    print(f"attached_files: {len(lic.get('attached_files', []))}")

asyncio.run(run())
