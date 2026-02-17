"""
Backfill Santa Rosa publication dates from title year.

Santa Rosa items had publication_date = scraping date because the site
has no date elements. This script extracts year from title (13/2024 -> 2024)
and sets publication_date = Jan 1 of that year.
"""

import asyncio
import os
import re
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorClient


async def main():
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "licitometro")

    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    collection = db.licitaciones

    # Find Santa Rosa items with publication_date = scraping date (likely wrong)
    cursor = collection.find({"fuente": "Santa Rosa"})

    updated_count = 0
    skipped_count = 0

    async for doc in cursor:
        title = doc.get("title", "")
        pub_date = doc.get("publication_date")
        fecha_scraping = doc.get("fecha_scraping")

        # If pub_date matches scraping date (within 1 day), likely wrong
        if pub_date and fecha_scraping:
            diff_days = abs((pub_date - fecha_scraping).days)
            if diff_days > 1:
                # Date looks legit, skip
                skipped_count += 1
                continue

        # Extract year from title
        m = re.search(r'/(\d{4})', title)
        if not m:
            print(f"  SKIP (no year in title): {title}")
            skipped_count += 1
            continue

        year = int(m.group(1))
        if year < 2024 or year > 2027:
            print(f"  SKIP (year out of range): {title} ({year})")
            skipped_count += 1
            continue

        new_pub_date = datetime(year, 1, 1)

        # Update
        result = await collection.update_one(
            {"_id": doc["_id"]},
            {"$set": {"publication_date": new_pub_date}}
        )

        if result.modified_count > 0:
            old_date = pub_date.strftime("%Y-%m-%d") if pub_date else "None"
            print(f"  UPDATED: {title}")
            print(f"    {old_date} -> {new_pub_date.strftime('%Y-%m-%d')}")
            updated_count += 1
        else:
            skipped_count += 1

    print(f"\nDone!")
    print(f"  Updated: {updated_count}")
    print(f"  Skipped: {skipped_count}")


if __name__ == "__main__":
    asyncio.run(main())
