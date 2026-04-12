"""Regenerate all AI sections for a cotizacion using improved prompts."""
import asyncio
import os
import time
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId

LIC_ID = "69d51c1bb00fe52f0fc3d753"

# Sections to regenerate with AI (skip data-only sections like portada, oferta_economica)
AI_SECTIONS = [
    "introduccion", "resumen_ejecutivo", "antecedentes",
    "comprension_alcance", "propuesta_tecnica", "plan_trabajo",
    "metodologia", "equipo_trabajo", "evaluacion_riesgos",
    "plan_calidad", "estrategia_comunicacion",
]


async def run():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]

    cot = await db.cotizaciones.find_one({"licitacion_id": LIC_ID})
    if not cot:
        print("No cotizacion found")
        return

    lic = await db.licitaciones.find_one({"_id": ObjectId(LIC_ID)})
    if not lic:
        print("No licitacion found")
        return

    sections = cot.get("offer_sections", [])
    print(f"Cotizacion has {len(sections)} sections")
    print(f"Licitacion: {lic.get('objeto', '')[:60]}")
    print(f"Organismo: {lic.get('organization', '')}")
    print()

    # Use the generate-section endpoint logic directly
    from routers.cotizar_ai import generate_section
    from fastapi import Request
    from unittest.mock import MagicMock

    # Mock request with db
    mock_request = MagicMock()
    mock_request.app.mongodb = db

    regenerated = 0
    errors = 0

    for section in sections:
        slug = section.get("slug", "")
        title = section.get("title", slug)

        if slug not in AI_SECTIONS:
            print(f"  SKIP {slug} (data-only)")
            continue

        print(f"  Generating: {slug} ({title})...", end=" ", flush=True)
        t0 = time.time()

        try:
            body = {"licitacion_id": LIC_ID, "section_slug": slug}
            result = await generate_section(body, mock_request)
            content = result.get("content", "")

            if content and "[Error" not in content and len(content) > 20:
                section["content"] = content
                section["generated_by"] = "ai"
                elapsed = time.time() - t0
                print(f"OK ({len(content)} chars, {elapsed:.1f}s)")
                regenerated += 1
            else:
                print(f"EMPTY/ERROR ({len(content)} chars)")
                errors += 1
        except Exception as e:
            print(f"FAILED: {e}")
            errors += 1

        # Rate limit: wait between API calls
        await asyncio.sleep(3)

    # Save updated sections
    if regenerated > 0:
        await db.cotizaciones.update_one(
            {"licitacion_id": LIC_ID},
            {"$set": {"offer_sections": sections}},
        )
        print(f"\nSaved {regenerated} regenerated sections (errors: {errors})")
    else:
        print(f"\nNo sections regenerated (errors: {errors})")

    # Show preview of first 3 regenerated sections
    print("\n" + "=" * 60)
    print("PREVIEW OF REGENERATED SECTIONS")
    print("=" * 60)
    for section in sections:
        slug = section.get("slug", "")
        if slug in AI_SECTIONS and section.get("content"):
            content = section["content"]
            if len(content) > 30:
                print(f"\n--- {slug} ({len(content)} chars) ---")
                print(content[:300])
                if len(content) > 300:
                    print("...")


asyncio.run(run())
