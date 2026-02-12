"""
Fix Maipu scraper config: list_date_selector points to apertura column, not publication.

Change:
  list_date_selector: "td:nth-child(1)" → list_opening_date_selector: "td:nth-child(1)"

This way the generic_html_scraper will correctly store the date as opening_date
and use datetime.utcnow() for publication_date.

Also re-fixes all Maipu licitaciones where publication_date == opening_date.
"""
import asyncio
import os
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorClient


async def fix():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]

    # 1. Update Maipu scraper config
    result = await db.scraper_configs.update_one(
        {"name": {"$regex": "^Maip", "$options": "i"}},
        {
            "$set": {"selectors.list_opening_date_selector": "td:nth-child(1)"},
            "$unset": {"selectors.list_date_selector": ""},
        },
    )
    print(f"Config updated: matched={result.matched_count}, modified={result.modified_count}")

    # 2. Fix Maipu licitaciones where pub == opening
    col = db.licitaciones
    cursor = col.find({
        "fuente": {"$regex": "^Maip", "$options": "i"},
        "opening_date": {"$exists": True, "$ne": None},
        "publication_date": {"$exists": True, "$ne": None},
    })
    fixed = 0
    async for item in cursor:
        pub = item.get("publication_date")
        opening = item.get("opening_date")
        scraping = item.get("fecha_scraping")
        if pub and opening and abs((pub - opening).total_seconds()) < 60:
            new_pub = scraping or item.get("created_at") or datetime.utcnow()
            await col.update_one(
                {"_id": item["_id"]},
                {"$set": {"publication_date": new_pub}},
            )
            fixed += 1
            title = (item.get("title") or "")[:50]
            print(f"  Fixed: {title} | pub {pub.date()} -> {new_pub.date()}")

    print(f"\nDone: {fixed} Maipu items fixed")

    # 3. Also fix remaining OSEP items (51 affected from earlier audit)
    cursor2 = col.find({
        "fuente": "OSEP",
        "opening_date": {"$exists": True, "$ne": None},
        "publication_date": {"$exists": True, "$ne": None},
    })
    osep_fixed = 0
    async for item in cursor2:
        pub = item.get("publication_date")
        opening = item.get("opening_date")
        scraping = item.get("fecha_scraping")
        if pub and opening and abs((pub - opening).total_seconds()) < 60:
            new_pub = scraping or item.get("created_at") or datetime.utcnow()
            await col.update_one(
                {"_id": item["_id"]},
                {"$set": {"publication_date": new_pub}},
            )
            osep_fixed += 1

    print(f"OSEP items fixed: {osep_fixed}")
    print(f"Total corrected: {fixed + osep_fixed}")


if __name__ == "__main__":
    asyncio.run(fix())
