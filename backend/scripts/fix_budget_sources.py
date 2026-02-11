#!/usr/bin/env python3
"""
Fix corrupt budgets and backfill budget_source for all existing licitaciones.

1. Fix 2 Santa Rosa items with inflated budgets (parser bug: $63.000.000.00 → 6.3B instead of 63M)
2. Backfill metadata.budget_source for all items that have a budget but no source tag:
   - "estimated_from_pliego" → already tagged by Godoy Cruz scraper
   - "extracted_from_text" → has metadata.budget_extracted
   - "direct" → budget came from scraper directly

Usage (from Docker):
  docker exec -w /app -e PYTHONPATH=/app licitometro-backend-1 python3 scripts/fix_budget_sources.py

Usage (local):
  cd backend && PYTHONPATH=. python scripts/fix_budget_sources.py
"""

import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "licitaciones_db")


async def main():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    collection = db["licitaciones"]

    total = await collection.count_documents({})
    has_budget = await collection.count_documents({"budget": {"$gt": 0}})
    print(f"Total licitaciones: {total}")
    print(f"With budget: {has_budget}")
    print()

    # === Pass 1: Fix corrupt Santa Rosa budgets ===
    print("=== Pass 1: Fix corrupt Santa Rosa budgets ===")
    # These 2 items have budget ~6.3B and ~6.2B but should be ~63M and ~62M
    # Bug: old parser interpreted $63.000.000.00 as 63000000.00 → but actually stored 6300000000
    corrupt_cursor = collection.find({
        "organization": {"$regex": "Santa Rosa", "$options": "i"},
        "budget": {"$gt": 1_000_000_000}  # > 1 billion ARS is suspicious
    })
    fixed_corrupt = 0
    async for doc in corrupt_cursor:
        old_budget = doc["budget"]
        # The bug multiplied by 100x — $63.000.000.00 was parsed as 6,300,000,000 instead of 63,000,000
        new_budget = old_budget / 100
        print(f"  FIX: {doc.get('title', '')[:60]}")
        print(f"    Old: ${old_budget:,.2f} → New: ${new_budget:,.2f}")
        await collection.update_one(
            {"_id": doc["_id"]},
            {"$set": {"budget": new_budget}}
        )
        fixed_corrupt += 1
    print(f"  Fixed {fixed_corrupt} corrupt budgets")
    print()

    # === Pass 2: Backfill budget_source ===
    print("=== Pass 2: Backfill budget_source ===")

    # Count current state
    has_source = await collection.count_documents({"metadata.budget_source": {"$exists": True}})
    print(f"  Already have budget_source: {has_source}")

    # Tag items that have budget but no budget_source
    cursor = collection.find({
        "budget": {"$gt": 0},
        "$or": [
            {"metadata.budget_source": {"$exists": False}},
            {"metadata.budget_source": None},
        ]
    })

    tagged_direct = 0
    tagged_extracted = 0
    async for doc in cursor:
        meta = doc.get("metadata", {}) or {}

        if meta.get("budget_extracted"):
            source = "extracted_from_text"
            tagged_extracted += 1
        else:
            source = "direct"
            tagged_direct += 1

        await collection.update_one(
            {"_id": doc["_id"]},
            {"$set": {"metadata.budget_source": source}}
        )

        if tagged_direct + tagged_extracted <= 5:
            print(f"    {source}: {doc.get('title', '')[:60]} (${doc.get('budget', 0):,.0f})")

    print(f"  Tagged as 'direct': {tagged_direct}")
    print(f"  Tagged as 'extracted_from_text': {tagged_extracted}")
    print()

    # === Summary ===
    print("=== Summary ===")
    for source_type in ["direct", "extracted_from_text", "estimated_from_pliego"]:
        count = await collection.count_documents({"metadata.budget_source": source_type})
        print(f"  {source_type}: {count}")

    no_budget = await collection.count_documents({
        "$or": [{"budget": None}, {"budget": {"$exists": False}}, {"budget": 0}]
    })
    print(f"  No budget: {no_budget}")
    print(f"  Fixed corrupt: {fixed_corrupt}")

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
