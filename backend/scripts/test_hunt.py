"""Test HUNT strategy for pliego finding."""
import asyncio
import os
import logging

logging.basicConfig(level=logging.INFO, format="%(name)s %(levelname)s %(message)s")

from motor.motor_asyncio import AsyncIOMotorClient

LIC_ID = "69dd052c63dc304b4209e5d9"


async def test():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]

    from services.pliego_finder import find_pliegos
    print("Starting pliego search...")
    result = await find_pliegos(db, LIC_ID)

    pliegos = [p for p in result.get("pliegos", []) if p.get("type") != "metadata"]
    meta = [p for p in result.get("pliegos", []) if p.get("type") == "metadata"]

    print(f"\nRESULTS:")
    print(f"  Pliegos: {len(pliegos)}")
    for p in pliegos:
        src = p.get("source", "")
        name = p.get("name", "")
        url = p.get("url", "")[:80]
        print(f"    [{src}] {name}")
        print(f"      URL: {url}")

    print(f"  Metadata items: {len(meta)}")
    for m in meta:
        md = m.get("metadata", {})
        oc = len(md.get("ordenes_compra", []))
        mov = len(md.get("movimientos", []))
        print(f"    OC: {oc}, Movimientos: {mov}")

    text = result.get("text_extracted", "")
    print(f"  Text extracted: {len(text)} chars")
    if text:
        print(f"    Preview: {text[:150]}")


asyncio.run(test())
