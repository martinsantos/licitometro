"""Inspect antecedentes data for the test case."""
import asyncio
import os
import json
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId

LIC_ID = "69d51c1bb00fe52f0fc3d753"

async def run():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    cot = await db.cotizaciones.find_one({"licitacion_id": LIC_ID})

    # 1. Check offer_sections for antecedentes content
    sections = cot.get("offer_sections", [])
    for s in sections:
        slug = s.get("slug", "")
        if "antecedente" in slug.lower() or "perfil" in slug.lower():
            content = s.get("content", "")
            title = s.get("title", "")
            print(f"=== Section: {slug} ({title}) ===")
            print(f"Content ({len(content)} chars):")
            print(content)
            print()

    # 2. Check vinculados (antecedentes linked to this cotizacion)
    vinc_ids = cot.get("antecedentes_vinculados", [])
    print(f"=== Vinculados: {len(vinc_ids)} IDs ===")

    # 3. Check what data um_antecedentes has
    if vinc_ids:
        for vid in vinc_ids[:5]:
            try:
                ant = await db.um_antecedentes.find_one({"_id": ObjectId(vid)})
                if ant:
                    print(f"\nAntecedente {vid}:")
                    for key in ["title", "objeto", "organization", "budget", "budget_adjusted",
                                "category", "unidad_negocio", "image_url", "detail_url",
                                "certificado_total", "estado_sgi", "fecha_inicio", "fecha_cierre"]:
                        val = ant.get(key)
                        if val:
                            print(f"  {key}: {val}")
                else:
                    # Try in licitaciones
                    lic = await db.licitaciones.find_one({"_id": ObjectId(vid)})
                    if lic:
                        print(f"\nAntecedente (licitacion) {vid}:")
                        print(f"  title: {lic.get('title', '')[:60]}")
                        print(f"  org: {lic.get('organization')}")
                        print(f"  budget: {lic.get('budget')}")
            except Exception as e:
                print(f"  Error: {e}")

    # 4. Check company profile for antecedentes context
    profile = await db.company_profiles.find_one({"company_id": "default"})
    if profile:
        print(f"\n=== Company Profile ===")
        print(f"  nombre: {profile.get('nombre')}")
        print(f"  rubros: {profile.get('rubros_inscriptos', [])[:5]}")

asyncio.run(run())
