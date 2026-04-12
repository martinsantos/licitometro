"""Clean error content from all cotizaciones."""
import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient


async def run():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]

    # Find all cotizaciones with error content
    total_cleaned = 0
    async for cot in db.cotizaciones.find():
        sections = cot.get("offer_sections", [])
        cleaned = 0
        for s in sections:
            content = s.get("content", "")
            if "[Error" in content or "api 400" in content or "api 500" in content:
                slug = s.get("slug", "?")
                s["content"] = ""
                s["generated_by"] = "manual"
                cleaned += 1
                print(f"  Cleaned: {cot.get('licitacion_id', '?')[:20]} / {slug}")

        if cleaned:
            await db.cotizaciones.update_one(
                {"_id": cot["_id"]},
                {"$set": {"offer_sections": sections}},
            )
            total_cleaned += cleaned

    print(f"\nTotal cleaned: {total_cleaned} sections across all cotizaciones")


asyncio.run(run())
