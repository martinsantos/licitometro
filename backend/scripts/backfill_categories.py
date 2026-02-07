#!/usr/bin/env python3
"""
Backfill categories for all unclassified licitaciones.

Usage (from Docker):
  docker exec -w /app -e PYTHONPATH=/app licitometro-backend-1 python scripts/backfill_categories.py

Usage (local):
  cd backend && PYTHONPATH=. python scripts/backfill_categories.py
"""

import asyncio
import os
import sys
from pathlib import Path
from collections import Counter

sys.path.insert(0, str(Path(__file__).parent.parent))

from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from services.category_classifier import get_category_classifier

load_dotenv()

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "licitaciones_db")


async def main():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    collection = db["licitaciones"]

    classifier = get_category_classifier()

    # Find unclassified licitaciones
    query = {"$or": [{"category": None}, {"category": ""}, {"category": {"$exists": False}}]}
    total_unclassified = await collection.count_documents(query)
    print(f"Found {total_unclassified} unclassified licitaciones")

    if total_unclassified == 0:
        print("Nothing to do!")
        client.close()
        return

    classified_count = 0
    failed_count = 0
    rubro_counts = Counter()

    cursor = collection.find(query)
    async for doc in cursor:
        title = doc.get("title", "")
        description = (doc.get("description", "") or "")[:500]  # Limit to avoid boilerplate noise
        keywords = doc.get("keywords", [])

        # Title-first: try title alone, then title+short description
        category = classifier.classify(title=title)
        if not category:
            category = classifier.classify(title=title, description=description, keywords=keywords)

        if category:
            await collection.update_one(
                {"_id": doc["_id"]},
                {"$set": {"category": category}}
            )
            classified_count += 1
            rubro_counts[category] += 1
        else:
            failed_count += 1

    print(f"\n--- Results ---")
    print(f"Classified: {classified_count}/{total_unclassified}")
    print(f"Unclassified: {failed_count}")

    if rubro_counts:
        print(f"\nBy rubro:")
        for rubro, count in rubro_counts.most_common():
            print(f"  {rubro}: {count}")

    # Show remaining unclassified sample
    if failed_count > 0:
        print(f"\nSample unclassified titles:")
        remaining = collection.find(query).limit(10)
        async for doc in remaining:
            print(f"  - {doc.get('title', 'N/A')[:80]} [{doc.get('fuente', '?')}]")

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
