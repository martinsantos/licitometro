"""Check cotizacion data for debugging."""
import asyncio, os, json
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId

LIC_ID = "69d9f183abe5e93655909ba1"

async def check():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    cot = await db.cotizaciones.find_one({"licitacion_id": LIC_ID})
    if not cot:
        print("NO COTIZACION FOUND")
        return

    print("=== SECTIONS ===")
    for s in (cot.get("offer_sections") or []):
        slug = s.get("slug", "")
        content = (s.get("content") or "")
        has_bold = "**" in content
        gen = s.get("generated_by", "?")
        print(f"  {slug}: {len(content)} chars, bold={has_bold}, gen={gen}")
        if slug in ("antecedentes", "perfil_empresa", "antecedentes_empresa"):
            print(f"    CONTENT PREVIEW: {content[:300]}")

    vinc = cot.get("antecedentes_vinculados", [])
    print(f"\n=== ANTECEDENTES_VINCULADOS: {len(vinc)} ===")
    for v in vinc:
        print(f"  - {v}")

    items = cot.get("items", [])
    print(f"\n=== ITEMS: {len(items)} ===")
    for it in items:
        d = it.get("descripcion", "")[:40]
        q = it.get("cantidad", 0)
        p = it.get("precio_unitario", 0)
        print(f"  - {d} qty={q} price={p}")

    cd = cot.get("company_data", {})
    print(f"\n=== COMPANY: {cd.get('nombre', '?')} ===")

    # Check licitacion lookup
    try:
        lic = await db.licitaciones.find_one({"_id": ObjectId(LIC_ID)})
        if lic:
            print(f"\n=== LIC FOUND: {lic.get('objeto', '')[:80]} ===")
            print(f"  organization: {lic.get('organization', '')}")
        else:
            print("\n=== LIC NOT FOUND by ObjectId ===")
    except Exception as e:
        print(f"\n=== LIC LOOKUP ERROR: {e} ===")

asyncio.run(check())
