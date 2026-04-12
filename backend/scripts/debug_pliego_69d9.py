"""Debug why find_pliegos fails for 69d9f183abe5e93655909ba1."""
import asyncio
import os
import logging
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId

logging.basicConfig(level=logging.INFO)
LIC_ID = "69d9f183abe5e93655909ba1"


async def run():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    lic = await db.licitaciones.find_one({"_id": ObjectId(LIC_ID)})

    print(f"=== {lic.get('title', '')[:60]} ===")
    print(f"Fuente: {lic.get('fuente')}")
    print(f"Source URL: {str(lic.get('source_url', ''))[:80]}")
    print(f"Fuentes: {lic.get('fuentes', [])}")
    print(f"Proceso ID: {lic.get('proceso_id')}")
    print(f"Lic Number: {lic.get('licitacion_number')}")

    # Find related ComprasApps item
    print("\n--- ComprasApps related item ---")
    ca_item = None
    async for item in db.licitaciones.find({"fuente": "ComprasApps Mendoza"}):
        # Check if this matches by proceso_id or cross-merge
        if lic.get("proceso_id") and item.get("proceso_id") == lic.get("proceso_id"):
            ca_item = item
            break

    if not ca_item:
        # Try by licitacion number pattern
        lic_num = lic.get("licitacion_number", "")
        print(f"  Searching ComprasApps by lic_num pattern: {lic_num}")
        ca_item = await db.licitaciones.find_one({
            "fuente": "ComprasApps Mendoza",
            "licitacion_number": {"$regex": f"^{lic_num}/" if lic_num else "NOMATCH"},
        })

    if not ca_item:
        # Check source_urls for ComprasApps
        surls = lic.get("source_urls") or {}
        if "comprasapps_mendoza" in surls:
            print(f"  Has comprasapps source_url but no linked ComprasApps item")
            # The merge came from cross_source but we lost the reference
            # Try to find by title similarity
            title_words = lic.get("title", "").split()[:3]
            print(f"  Searching by title words: {title_words}")

    if ca_item:
        print(f"  Found: {ca_item.get('licitacion_number')} - {ca_item.get('title', '')[:50]}")
        print(f"  Source URL: {str(ca_item.get('source_url', ''))[:80]}")
        meta = ca_item.get("metadata") or {}
        print(f"  CUC: {meta.get('comprasapps_cuc')}")
        print(f"  Detail popup: {'yes' if meta.get('detail_popup') else 'no'}")
    else:
        print("  NO ComprasApps item found!")

    # Now run find_pliegos and see what happens
    print("\n--- find_pliegos result ---")
    from services.pliego_finder import find_pliegos
    result = await find_pliegos(db, LIC_ID)
    print(f"Strategy: {result.get('strategy_used')}")
    print(f"Pliegos: {len(result.get('pliegos', []))}")
    for p in result.get("pliegos", []):
        ptype = p.get("type", "?")
        if ptype == "metadata":
            meta = p.get("metadata", {})
            print(f"  [META] movs={len(meta.get('movimientos', []))} oc={len(meta.get('ordenes_compra', []))}")
        else:
            print(f"  [{p.get('priority')}] {p.get('label')}: {p.get('name', '?')[:40]} (src={p.get('source')})")
    text = result.get("text_extracted", "")
    print(f"Text: {len(text)} chars")
    if text:
        print(f"Preview: {text[:200]}")
    if result.get("hint"):
        print(f"Hint: {result['hint']}")

    # Check: does this item have COMPR.AR connection?
    print("\n--- COMPR.AR connection ---")
    source_url = str(lic.get("source_url", ""))
    print(f"Is COMPR.AR: {'comprar' in source_url.lower()}")
    print(f"Is BOE: {'boe.mendoza' in source_url.lower()}")

    # The problem: this is a BOE item, so Strategy 3 (COMPR.AR auth) won't trigger
    # And Strategy 3b (ComprasApps auth) checks if 'comprasapps' is in fuente
    fuente = str(lic.get("fuente", "")).lower()
    print(f"Fuente lower: {fuente}")
    print(f"  'compr' in fuente: {'compr' in fuente}")
    print(f"  'comprasapps' in fuente: {'comprasapps' in fuente}")
    print(f"  Strategy 3 would trigger: {'compr' in fuente and ('comprar.mendoza' in source_url or 'comprar.gob.ar' in source_url)}")
    print(f"  Strategy 3b would trigger: {'comprasapps' in fuente}")


asyncio.run(run())
