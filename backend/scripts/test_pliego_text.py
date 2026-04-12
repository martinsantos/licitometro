"""Test pliego text extraction after fixes."""
import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient

LIC_ID = "69d51c1bb00fe52f0fc3d753"

async def run():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    from services.pliego_finder import find_pliegos

    result = await find_pliegos(db, LIC_ID)
    print("Strategy:", result.get("strategy_used"))
    pliegos = result.get("pliegos", [])
    print("Pliegos:", len(pliegos))
    for p in pliegos:
        if p.get("type") != "metadata":
            priority = p.get("priority", "?")
            label = p.get("label", "?")
            name = p.get("name", "?")[:40]
            lp = p.get("local_path", "none")[:50]
            src = p.get("source", "?")
            print(f"  [{priority}] {label}: {name} | src={src} | local={lp}")

    text = result.get("text_extracted", "")
    print(f"\nTexto extraido: {len(text)} chars")
    if text:
        print(f"Preview:\n{text[:500]}")
    else:
        print("NO TEXT EXTRACTED")

asyncio.run(run())
