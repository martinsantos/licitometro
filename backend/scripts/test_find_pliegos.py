"""Test find_pliegos on COMPR.AR and ComprasApps items."""
import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient


async def run():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]

    for fuente, label in [("COMPR.AR Mendoza", "COMPR.AR"), ("ComprasApps Mendoza", "ComprasApps")]:
        lic = await db.licitaciones.find_one(
            {"fuente": fuente, "status": "active"},
            sort=[("opening_date", -1)]
        )
        if not lic:
            print(f"\n{label}: No active items")
            continue

        lic_id = str(lic["_id"])
        title = lic.get("title", "")[:60]
        num = lic.get("licitacion_number", "?")
        src_url = str(lic.get("source_url", ""))[:80]
        print(f"\n{'='*60}")
        print(f"{label}: {num}")
        print(f"  Title: {title}")
        print(f"  URL: {src_url}")

        from services.pliego_finder import find_pliegos
        result = await find_pliegos(db, lic_id)

        strategy = result.get("strategy_used", "none")
        pliegos = result.get("pliegos", [])
        text = result.get("text_extracted", "")
        hint = result.get("hint")

        print(f"  Strategy: {strategy}")
        print(f"  Pliegos found: {len(pliegos)}")
        for p in pliegos[:5]:
            ptype = p.get("type", "?")
            if ptype == "metadata":
                meta = p.get("metadata", {})
                movs = meta.get("movimientos", [])
                ocs = meta.get("ordenes_compra", [])
                print(f"    [METADATA] movimientos={len(movs)} OC={len(ocs)}")
                for m in movs[:3]:
                    print(f"      {m}")
            else:
                src = p.get("source", "?")
                label_p = p.get("label", "?")
                name = p.get("name", "?")[:40]
                print(f"    [{p.get('priority')}] {label_p}: {name} (src={src})")
        if text:
            print(f"  Text extracted: {len(text)} chars")
            print(f"  Preview: {text[:200]}")
        if hint:
            print(f"  Hint: {hint}")

    print(f"\n{'='*60}")
    print("DONE")


asyncio.run(run())
