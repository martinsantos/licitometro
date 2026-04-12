"""Test ComprasApps authenticated detail with adjudicada items."""
import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient


async def run():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    from services.comprasapps_pliego_downloader import ComprasAppsAuthClient

    client = ComprasAppsAuthClient(db)
    await client._load_credentials()
    logged = await client.login()
    print("Login:", logged)

    if not logged:
        await client.close()
        return

    # Find items with different estados
    for estado in ["Adjudicada", "En Proceso", "Vigente"]:
        lic = await db.licitaciones.find_one({
            "fuente": "ComprasApps Mendoza",
            "metadata.comprasapps_estado": estado,
        }, sort=[("publication_date", -1)])

        if not lic:
            print(f"\nNo {estado} items found")
            continue

        print(f"\n=== {estado}: {lic.get('licitacion_number')} ===")
        print(f"  Title: {lic.get('title', '')[:60]}")
        params = ComprasAppsAuthClient.build_detail_params_from_licitacion(lic)
        if not params:
            print("  Cannot build params")
            continue

        detail = await client.fetch_detail_authenticated(**params)
        print(f"  descargas: {detail.get('descargas_visible')}")
        print(f"  movimientos: {len(detail.get('movimientos', []))}")
        print(f"  OC: {len(detail.get('ordenes_compra', []))}")
        for m in detail.get("movimientos", [])[:5]:
            print(f"    Mov: {m}")
        for o in detail.get("ordenes_compra", [])[:3]:
            print(f"    OC: {o}")

    # Check credential status
    c = await db.site_credentials.find_one({"site_url": "comprasapps.mendoza.gov.ar"})
    print(f"\nCredential status: {c.get('last_status')}")
    await client.close()


asyncio.run(run())
