"""Full test case for licitacion 69d51c1bb00fe52f0fc3d753.

Tests:
1. find_pliegos (ANTES vs AHORA — with manual uploads + ComprasApps auth)
2. HUNTER cross-source search
3. ComprasApps authenticated detail (movimientos, OC, descargas)
4. COMPR.AR authenticated pliego download
5. Uploaded PDF text extraction
"""
import asyncio
import os
import json
import time
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId

LIC_ID = "69d51c1bb00fe52f0fc3d753"


async def run():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    lic = await db.licitaciones.find_one({"_id": ObjectId(LIC_ID)})
    if not lic:
        print("NOT FOUND")
        return

    print("=" * 70)
    print(f"CASO: {lic.get('licitacion_number')} — {lic.get('title', '')[:60]}")
    print(f"Fuente: {lic.get('fuente')} | Budget: {lic.get('budget')} | Opening: {lic.get('opening_date')}")
    print(f"Fuentes cruzadas: {lic.get('fuentes', [])}")
    print("=" * 70)

    # ── TEST 1: find_pliegos (includes Strategy 1b manual uploads + 3b ComprasApps) ──
    print("\n" + "─" * 70)
    print("TEST 1: find_pliegos (todas las estrategias)")
    print("─" * 70)
    t0 = time.time()
    from services.pliego_finder import find_pliegos
    result = await find_pliegos(db, LIC_ID)
    elapsed = time.time() - t0

    print(f"  Tiempo: {elapsed:.1f}s")
    print(f"  Strategy: {result.get('strategy_used')}")
    pliegos = result.get("pliegos", [])
    print(f"  Pliegos encontrados: {len(pliegos)}")
    for p in pliegos:
        ptype = p.get("type", "?")
        if ptype == "metadata":
            meta = p.get("metadata", {})
            movs = meta.get("movimientos", [])
            ocs = meta.get("ordenes_compra", [])
            print(f"    📊 [METADATA ComprasApps] movimientos={len(movs)} OC={len(ocs)}")
            for m in movs[:5]:
                print(f"       📅 {m.get('fecha', '?')}: {m.get('descripcion', '?')}")
            for o in ocs[:3]:
                print(f"       💰 OC: {o}")
        else:
            src = p.get("source", "?")
            emoji = {"manual_upload": "📎", "attached_files": "📁", "comprar_authenticated": "🔐",
                     "comprasapps_authenticated": "🔐", "source_url_page": "🌐"}.get(src, "📄")
            print(f"    {emoji} [{p.get('priority')}] {p.get('label')}: {p.get('name', '?')[:50]} (src={src})")

    text = result.get("text_extracted", "")
    if text:
        print(f"  📝 Texto extraído: {len(text)} chars")
        print(f"     Preview: {text[:200]}...")
    hint = result.get("hint")
    if hint:
        print(f"  💡 Hint: {hint}")

    # ── TEST 2: HUNTER cross-source ──
    print("\n" + "─" * 70)
    print("TEST 2: HUNTER cross-source search")
    print("─" * 70)
    from services.cross_source_service import CrossSourceService
    cross = CrossSourceService(db)
    related = await cross.find_related(lic, limit=10)
    print(f"  Related sources encontrados: {len(related)}")
    for rel in related:
        fuente = rel.get("fuente", "?")
        title = rel.get("title", "")[:50]
        budget = rel.get("budget")
        files = len(rel.get("attached_files") or [])
        print(f"    🔗 [{fuente}] {title}")
        if budget:
            print(f"       Budget: ${budget:,.0f}")
        if files:
            print(f"       Archivos adjuntos: {files}")

    # ── TEST 3: ComprasApps authenticated detail ──
    print("\n" + "─" * 70)
    print("TEST 3: ComprasApps authenticated detail")
    print("─" * 70)
    # Find the ComprasApps related item
    source_urls = lic.get("source_urls") or {}
    comprasapps_related = None
    for rel in related:
        if rel.get("fuente") == "ComprasApps Mendoza":
            comprasapps_related = rel
            break

    if not comprasapps_related:
        # Search by licitacion_number
        lic_num = lic.get("licitacion_number", "")
        comprasapps_related = await db.licitaciones.find_one({
            "fuente": "ComprasApps Mendoza",
            "licitacion_number": {"$regex": lic_num.split("-")[0] if "-" in lic_num else lic_num},
        })

    if comprasapps_related:
        from services.comprasapps_pliego_downloader import ComprasAppsAuthClient
        params = ComprasAppsAuthClient.build_detail_params_from_licitacion(comprasapps_related)
        if params:
            print(f"  ComprasApps item: {comprasapps_related.get('licitacion_number')}")
            print(f"  Params: {params}")
            client = ComprasAppsAuthClient(db)
            await client._load_credentials()
            logged = await client.login()
            print(f"  Login: {'✅' if logged else '❌'}")
            if logged:
                detail = await client.fetch_detail_authenticated(**params)
                print(f"  Descargas visibles: {detail.get('descargas_visible')}")
                print(f"  Movimientos: {len(detail.get('movimientos', []))}")
                print(f"  Órdenes de Compra: {len(detail.get('ordenes_compra', []))}")
                for m in detail.get("movimientos", []):
                    print(f"    📅 {m.get('fecha', '?')}: {m.get('descripcion', '?')}")
                for o in detail.get("ordenes_compra", []):
                    print(f"    💰 {o}")
            await client.close()
        else:
            print(f"  Cannot build params for: {comprasapps_related.get('licitacion_number')}")
    else:
        print("  No ComprasApps related item found")

    # ── TEST 4: COMPR.AR authenticated pliego download ──
    print("\n" + "─" * 70)
    print("TEST 4: COMPR.AR authenticated pliego download")
    print("─" * 70)
    source_url = str(lic.get("source_url", ""))
    if "comprar.mendoza" in source_url:
        from services.comprar_pliego_downloader import ComprarPliegoDownloader
        downloader = ComprarPliegoDownloader(db)
        t0 = time.time()
        anexos = await downloader.download_anexos(source_url)
        elapsed = time.time() - t0
        print(f"  Tiempo: {elapsed:.1f}s")
        print(f"  Anexos descargados: {len(anexos)}")
        for a in anexos:
            print(f"    🔐 [{a.get('priority')}] {a.get('label')}: {a.get('name', '?')[:50]}")
            print(f"       Size: {a.get('size', 0)} bytes | Path: {a.get('local_path', '?')}")
    else:
        print("  Source URL not COMPR.AR")

    # ── TEST 5: Uploaded PDF text extraction ──
    print("\n" + "─" * 70)
    print("TEST 5: Uploaded pliego docs text extraction")
    print("─" * 70)
    cot = await db.cotizaciones.find_one({"licitacion_id": LIC_ID})
    if cot:
        pliego_docs = cot.get("pliego_documents", [])
        print(f"  Pliego docs en cotizacion: {len(pliego_docs)}")
        for pd in pliego_docs:
            print(f"    📎 {pd.get('name', '?')} (src={pd.get('source', '?')}) url={pd.get('url', '')[:60]}")
            # Try text extraction if it's a local upload
            url = pd.get("url", "")
            if "/api/documentos/" in url and "download" in url:
                import re
                m = re.search(r'/api/documentos/([a-f0-9]+)/download', url)
                if m:
                    doc = await db.documentos.find_one({"_id": ObjectId(m.group(1))})
                    if doc and doc.get("file_path") and os.path.isfile(doc["file_path"]):
                        from services.enrichment.pdf_zip_enricher import extract_text_from_pdf_bytes
                        with open(doc["file_path"], "rb") as f:
                            pdf_bytes = f.read()
                        text = extract_text_from_pdf_bytes(pdf_bytes)
                        if text:
                            print(f"       📝 Texto extraído: {len(text)} chars")
                            print(f"          Preview: {text[:150]}...")
                        else:
                            print(f"       ⚠️ No text extracted (might not be PDF)")
                    else:
                        fpath = doc.get("file_path", "?") if doc else "doc not found"
                        print(f"       ⚠️ File not on disk: {fpath}")
    else:
        print("  No cotizacion")

    # ── SUMMARY ──
    print("\n" + "=" * 70)
    print("RESUMEN COMPARATIVO")
    print("=" * 70)
    print(f"  Fuente principal: {lic.get('fuente')}")
    print(f"  Fuentes cruzadas: {len(lic.get('fuentes', []))}")
    print(f"  HUNTER related: {len(related)}")
    print(f"  Pliegos encontrados (find_pliegos): {len(pliegos)}")
    manual = sum(1 for p in pliegos if p.get("source") == "manual_upload")
    auth = sum(1 for p in pliegos if "authenticated" in (p.get("source") or ""))
    meta_items = sum(1 for p in pliegos if p.get("type") == "metadata")
    other = len(pliegos) - manual - auth - meta_items
    print(f"    📎 Subidos manualmente: {manual}")
    print(f"    🔐 Autenticados: {auth}")
    print(f"    📊 Metadata (movimientos/OC): {meta_items}")
    print(f"    📁 Otros (attached/cross): {other}")
    print(f"  Texto pliego: {len(text)} chars")
    print(f"  Cotizacion: items={len(cot.get('items', []))}, sections={len(cot.get('offer_sections', []))}")


asyncio.run(run())
