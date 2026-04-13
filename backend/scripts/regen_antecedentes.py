"""Regenerate perfil_empresa section with real antecedentes data."""
import asyncio, os
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId

LIC_ID = "69d9f183abe5e93655909ba1"

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

    # Call the generate_section endpoint logic directly
    from routers.cotizar_ai import generate_section
    from unittest.mock import MagicMock

    mock_request = MagicMock()
    mock_request.app.mongodb = db

    body = {"licitacion_id": LIC_ID, "section_slug": "perfil_empresa"}
    result = await generate_section(body, mock_request)
    content = result.get("content", "")

    print(f"Generated content: {len(content)} chars")
    print(f"Has numbered projects: {'1.' in content}")
    print(f"Has URLs: {'URL:' in content}")
    print(f"Has bold: {'**' in content}")
    print()
    print("PREVIEW:")
    print(content[:500])
    print("...")

    # Save to cotizacion
    sections = cot.get("offer_sections", [])
    for sec in sections:
        if sec.get("slug") == "perfil_empresa":
            sec["content"] = content
            sec["generated_by"] = "ai"
            print("\nUpdated perfil_empresa section")
            break

    await db.cotizaciones.update_one(
        {"licitacion_id": LIC_ID},
        {"$set": {"offer_sections": sections}},
    )
    print("Saved to DB")

asyncio.run(run())
