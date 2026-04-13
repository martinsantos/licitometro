"""Check cotizacion sections for quality issues."""
import asyncio, os, re
from motor.motor_asyncio import AsyncIOMotorClient

LIC_ID = "69d51c1bb00fe52f0fc3d753"

async def check():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    cot = await db.cotizaciones.find_one({"licitacion_id": LIC_ID})
    if not cot:
        print("NO COTIZACION")
        return

    print("=== SECTIONS ===")
    for s in (cot.get("offer_sections") or []):
        slug = s.get("slug", "")
        content = (s.get("content") or "")
        has_bold = "**" in content
        has_h2 = "## " in content
        has_num = bool(re.search(r"^\d+\.", content, re.MULTILINE))
        gen = s.get("generated_by", "?")
        preview = content[:80].replace("\n", " ")
        print(f"  {slug:30s} {len(content):5d}ch bold={has_bold} h2={has_h2} num={has_num} gen={gen}")
        print(f"    >>> {preview}")

    vinc = cot.get("antecedentes_vinculados") or []
    items = [i for i in cot.get("items", []) if i.get("descripcion")]
    print(f"\nVINCULADOS: {len(vinc)}")
    print(f"ITEMS: {len(items)}")
    for it in items:
        d = it.get("descripcion", "")[:40]
        print(f"  - {d} qty={it.get('cantidad')} price={it.get('precio_unitario')}")

asyncio.run(check())
