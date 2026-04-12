"""Test improved AI prompts for section generation."""
import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId

LIC_ID = "69d51c1bb00fe52f0fc3d753"


async def run():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    from services.groq_enrichment import get_groq_enrichment_service
    groq = get_groq_enrichment_service()

    lic = await db.licitaciones.find_one({"_id": ObjectId(LIC_ID)})
    objeto = lic.get("objeto", "")
    org = lic.get("organization", "")
    desc = (lic.get("description") or "")[:1000]
    category = lic.get("category", "")

    context = f"""Empresa oferente: ULTIMA MILLA S.A.
Objeto de la contratacion: {objeto}
Organismo contratante: {org}
Tipo de procedimiento: {lic.get('tipo_procedimiento', '')}
Categoria: {category}

DESCRIPCION DE LA LICITACION:
{desc}

METODOLOGIA PROPUESTA POR EL OFERENTE:
Metodologia agil con sprints quincenales, CI/CD, pruebas automatizadas.

PLAZO PROPUESTO: 12 semanas

ANTECEDENTES VINCULADOS (proyectos previos):
- Desarrollo de Software para Gobierno de Mendoza
- Soporte IT para Municipalidad de Guaymallen
"""

    for slug in ["introduccion", "evaluacion_riesgos"]:
        sep = "=" * 60
        print(f"\n{sep}")
        print(f"SECCION: {slug}")
        print(sep)
        result = await groq.generate_offer_section(slug, context)
        print(result)
        print(f"\n[{len(result)} chars]")


asyncio.run(run())
