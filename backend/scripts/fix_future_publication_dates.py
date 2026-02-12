"""
Fix publication_date for items where it was incorrectly set to opening_date.

ComprasApps and COMPR.AR scrapers used to do:
    publication_date = opening_date or datetime.utcnow()

This caused ~189 items to have future publication_dates (the apertura date),
making them sort to the top when sorted by publication_date DESC.

Fix: Set publication_date = fecha_scraping for affected items.
"""
import asyncio
import os
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorClient


async def fix():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    col = db.licitaciones
    now = datetime.utcnow()

    # Find items where publication_date is in the future
    cursor = col.find({"publication_date": {"$gt": now}})
    fixed = 0
    async for item in cursor:
        pub = item.get("publication_date")
        opening = item.get("opening_date")
        scraping = item.get("fecha_scraping")

        # Only fix if publication_date == opening_date (the known bug pattern)
        if pub and opening and abs((pub - opening).total_seconds()) < 60:
            new_pub = scraping or item.get("created_at") or now
            await col.update_one(
                {"_id": item["_id"]},
                {"$set": {"publication_date": new_pub}}
            )
            fixed += 1
            title = (item.get("title") or "")[:50]
            print(f"  Fixed: {title} | {pub.date()} -> {new_pub.date()} | {item.get('fuente')}")

    # Also handle items where pub_date == opening_date but opening is in the past
    # (these sort correctly but still have wrong data)
    cursor2 = col.find({
        "publication_date": {"$lte": now},
        "opening_date": {"$exists": True, "$ne": None},
    })
    fixed_past = 0
    async for item in cursor2:
        pub = item.get("publication_date")
        opening = item.get("opening_date")
        scraping = item.get("fecha_scraping")
        if pub and opening and abs((pub - opening).total_seconds()) < 60:
            new_pub = scraping or item.get("created_at") or now
            await col.update_one(
                {"_id": item["_id"]},
                {"$set": {"publication_date": new_pub}}
            )
            fixed_past += 1

    print(f"\nDone: {fixed} future dates fixed, {fixed_past} past duplicates fixed")
    print(f"Total corrected: {fixed + fixed_past}")


if __name__ == "__main__":
    asyncio.run(fix())
