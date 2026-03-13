"""Quick DB status check."""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os

async def run():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    total = await db.licitaciones.count_documents({})
    print("Total:", total)

    ar = await db.licitaciones.count_documents({"jurisdiccion": "Argentina"})
    print("Argentina:", ar)

    mza = await db.licitaciones.count_documents({"jurisdiccion": "Mendoza"})
    print("Mendoza:", mza)

    no_j = await db.licitaciones.count_documents({"jurisdiccion": None})
    print("Null jurisdiccion:", no_j)

    no_field = await db.licitaciones.count_documents({"jurisdiccion": {"$exists": False}})
    print("No jurisdiccion field:", no_field)

    jurs = await db.licitaciones.distinct("jurisdiccion")
    print("Distinct jurisdicciones:", jurs)

    fuentes = await db.licitaciones.distinct("fuente")
    print("Fuentes count:", len(fuentes))
    for f in sorted(fuentes):
        c = await db.licitaciones.count_documents({"fuente": f})
        print(f"  {f}: {c}")

    # Tags
    tags = await db.licitaciones.distinct("tags")
    print("Distinct tags:", tags)

    # Items without LIC_AR tag (should be Mendoza)
    no_tag = await db.licitaciones.count_documents({"tags": {"$ne": "LIC_AR"}})
    print("Without LIC_AR tag:", no_tag)

asyncio.run(run())
