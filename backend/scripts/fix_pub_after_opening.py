"""
Fix items where publication_date > opening_date.

When we don't have a real publication date, publication_date was set to
scraping time (datetime.utcnow()). For items with past aperturas, this
means pub > opening, which is logically impossible.

Fix: clamp publication_date to opening_date for affected items.
"""
import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient


async def fix():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    col = db.licitaciones

    # Find items where publication_date > opening_date (by more than 12 hours)
    pipeline = [
        {"$match": {
            "opening_date": {"$exists": True, "$ne": None},
            "publication_date": {"$exists": True, "$ne": None},
        }},
        {"$addFields": {
            "diff_ms": {"$subtract": ["$publication_date", "$opening_date"]}
        }},
        {"$match": {"diff_ms": {"$gt": 43200000}}},  # > 12 hours
    ]

    fixed = 0
    by_source = {}
    async for item in col.aggregate(pipeline, allowDiskUse=True):
        opening = item["opening_date"]
        fuente = item.get("fuente", "unknown")
        await col.update_one(
            {"_id": item["_id"]},
            {"$set": {"publication_date": opening}}
        )
        fixed += 1
        by_source[fuente] = by_source.get(fuente, 0) + 1

    print("Fixed by source:")
    for src, cnt in sorted(by_source.items(), key=lambda x: -x[1]):
        print(f"  {src}: {cnt}")
    print(f"\nTotal fixed: {fixed}")


if __name__ == "__main__":
    asyncio.run(fix())
