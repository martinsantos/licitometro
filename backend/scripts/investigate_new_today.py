import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from datetime import datetime, date

async def investigate():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]

    today = date(2026, 2, 13)
    today_start = datetime.combine(today, datetime.min.time())
    today_end = datetime.combine(today, datetime.max.time())

    pipeline = [
        {"$match": {"first_seen_at": {"$gte": today_start, "$lte": today_end}}},
        {"$project": {"title": 1, "source": 1, "publication_date": 1, "first_seen_at": 1, "created_at": 1, "numero": 1}},
        {"$sort": {"first_seen_at": -1}},
        {"$limit": 20}
    ]

    print("Items con first_seen_at = hoy (2026-02-13):")
    print("=" * 80)
    count = 0
    async for doc in db.licitaciones.aggregate(pipeline):
        count += 1
        pub_date = doc.get("publication_date", "N/A")
        if isinstance(pub_date, datetime):
            pub_date = pub_date.strftime("%Y-%m-%d")
        first_seen = doc.get("first_seen_at", "N/A")
        if isinstance(first_seen, datetime):
            first_seen = first_seen.strftime("%Y-%m-%d %H:%M")
        created = doc.get("created_at", "N/A")
        if isinstance(created, datetime):
            created = created.strftime("%Y-%m-%d %H:%M")

        title = doc.get("title", "")[:70]
        print(f"{count}. {doc.get('source')}")
        print(f"   {title}...")
        print(f"   Numero: {doc.get('numero')} | Pub: {pub_date}")
        print(f"   First seen: {first_seen} | Created: {created}")
        print("-" * 80)

    print("\nCount by source (first_seen_at = hoy):")
    pipeline2 = [
        {"$match": {"first_seen_at": {"$gte": today_start, "$lte": today_end}}},
        {"$group": {"_id": "$source", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]
    async for doc in db.licitaciones.aggregate(pipeline2):
        print(f"  {doc['_id']}: {doc['count']}")

    # Total count
    total = await db.licitaciones.count_documents({"first_seen_at": {"$gte": today_start, "$lte": today_end}})
    print(f"\nTotal items con first_seen_at = hoy: {total}")

asyncio.run(investigate())
