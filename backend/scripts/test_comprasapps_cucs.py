"""Test ComprasApps auth with REAL items from our database."""
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
        return

    # Get 5 real ComprasApps items from different CUCs
    pipeline = [
        {"$match": {"fuente": "ComprasApps Mendoza"}},
        {"$sort": {"publication_date": -1}},
        {"$group": {"_id": "$metadata.comprasapps_cuc", "lic": {"$first": "$$ROOT"}}},
        {"$limit": 8},
    ]
    results = await db.licitaciones.aggregate(pipeline).to_list(8)

    for r in results:
        lic = r["lic"]
        params = ComprasAppsAuthClient.build_detail_params_from_licitacion(lic)
        if not params:
            continue

        detail = await client.fetch_detail_authenticated(**params)
        desc = detail.get("descargas_visible")
        movs = detail.get("movimientos", [])
        ocs = detail.get("ordenes_compra", [])
        estado = (lic.get("metadata") or {}).get("comprasapps_estado", "?")
        print(f"{lic.get('licitacion_number'):20s} estado={estado:15s} descargas={desc} movs={len(movs)} OC={len(ocs)}")
        for m in movs[:2]:
            print(f"  Mov: {m}")

    await client.close()


asyncio.run(run())
