"""
Backfill first_seen_at for existing records.

Strategy:
- For records without first_seen_at, use created_at as the best guess
- This preserves the original discovery timestamp
- New records will have first_seen_at set automatically on insert
"""

import asyncio
import sys
from datetime import datetime
from pathlib import Path
from motor.motor_asyncio import AsyncIOMotorClient
import os

sys.path.insert(0, str(Path(__file__).parent.parent))
from utils.time import utc_now


async def backfill():
    """Backfill first_seen_at for existing licitaciones"""

    # Connect to MongoDB
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "licitometro")

    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    collection = db.licitaciones

    print("🔍 Finding records without first_seen_at...")

    # Count records without first_seen_at
    count = await collection.count_documents({"first_seen_at": {"$exists": False}})
    print(f"📊 Found {count} records to backfill")

    if count == 0:
        print("✅ All records already have first_seen_at")
        return

    # Process in batches for efficiency
    updated = 0
    batch_size = 100

    cursor = collection.find({"first_seen_at": {"$exists": False}})

    batch = []
    async for doc in cursor:
        # Use created_at as best guess (fallback to now if missing)
        first_seen = doc.get("created_at", utc_now())

        batch.append({
            "_id": doc["_id"],
            "first_seen_at": first_seen
        })

        # Process batch
        if len(batch) >= batch_size:
            for item in batch:
                await collection.update_one(
                    {"_id": item["_id"]},
                    {"$set": {"first_seen_at": item["first_seen_at"]}}
                )
            updated += len(batch)
            print(f"⏳ Processed {updated}/{count}...")
            batch = []

    # Process remaining items
    if batch:
        for item in batch:
            await collection.update_one(
                {"_id": item["_id"]},
                {"$set": {"first_seen_at": item["first_seen_at"]}}
            )
        updated += len(batch)

    print(f"✅ Backfilled first_seen_at for {updated} records")

    # Create index for performance
    print("🔧 Creating index on first_seen_at...")
    await collection.create_index([("first_seen_at", -1)])
    print("✅ Index created")

    client.close()


if __name__ == "__main__":
    asyncio.run(backfill())
