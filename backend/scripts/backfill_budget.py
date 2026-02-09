#!/usr/bin/env python3
"""
Backfill budget from metadata.budget_extracted for existing licitaciones.
Also regex-scans titles/descriptions for budget amounts as a secondary pass.

Usage (from Docker):
  docker exec -w /app -e PYTHONPATH=/app licitometro-backend-1 python scripts/backfill_budget.py

Usage (local):
  cd backend && PYTHONPATH=. python scripts/backfill_budget.py
"""

import asyncio
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "licitaciones_db")


def extract_budget_from_text(text: str) -> tuple:
    """Extract budget amount and currency from text. Returns (amount, currency)."""
    currency = "ARS"
    if re.search(r"(?:USD|U\$S|dólar)", text, re.I):
        currency = "USD"

    patterns = [
        r"(?:presupuesto|monto|importe|valor)\s*(?:oficial|estimado|total|aproximado|referencial)?[:\s]*\$?\s*([\d]+(?:\.[\d]{3})*(?:,[\d]{1,2})?)",
        r"\$\s*([\d]+(?:\.[\d]{3})+(?:,[\d]{1,2})?)",
        r"(?:presupuesto|monto|importe)\s*(?:oficial|estimado)?[:\s]*\$?\s*([\d]+\.[\d]{2})\b",
    ]
    for pat in patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            try:
                amount_str = m.group(1).replace(".", "").replace(",", ".")
                val = float(amount_str)
                if val > 100:
                    return val, currency
            except (ValueError, IndexError):
                continue
    return None, currency


async def main():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    collection = db["licitaciones"]

    total = await collection.count_documents({})
    has_budget = await collection.count_documents({"budget": {"$gt": 0}})
    print(f"Total licitaciones: {total}")
    print(f"Already have budget: {has_budget}")
    print()

    # Pass 1: Promote metadata.budget_extracted → budget
    print("=== Pass 1: Promote metadata.budget_extracted ===")
    cursor = collection.find({
        "metadata.budget_extracted": {"$exists": True, "$gt": 0},
        "$or": [{"budget": None}, {"budget": {"$exists": False}}],
    })
    promoted = 0
    async for doc in cursor:
        budget_val = doc["metadata"]["budget_extracted"]
        await collection.update_one(
            {"_id": doc["_id"]},
            {"$set": {"budget": budget_val, "currency": doc.get("currency") or "ARS"}}
        )
        promoted += 1
        if promoted <= 5:
            print(f"  Promoted: {doc.get('title', '')[:60]} → ${budget_val:,.2f}")
    print(f"  Total promoted from metadata: {promoted}")
    print()

    # Pass 2: Regex scan title + description for remaining nulls
    print("=== Pass 2: Regex scan title/description ===")
    cursor = collection.find({
        "$or": [{"budget": None}, {"budget": {"$exists": False}}],
    })
    regex_found = 0
    async for doc in cursor:
        title = doc.get("title", "") or ""
        description = doc.get("description", "") or ""
        # Try title first (more reliable), then first 1000 chars of description
        budget_val, currency = extract_budget_from_text(title)
        if not budget_val:
            budget_val, currency = extract_budget_from_text(description[:1000])
        if budget_val:
            await collection.update_one(
                {"_id": doc["_id"]},
                {"$set": {
                    "budget": budget_val,
                    "currency": doc.get("currency") or currency,
                }}
            )
            regex_found += 1
            if regex_found <= 5:
                print(f"  Regex found: {title[:60]} → ${budget_val:,.2f}")
    print(f"  Total from regex scan: {regex_found}")
    print()

    # Final report
    final_has_budget = await collection.count_documents({"budget": {"$gt": 0}})
    still_missing = total - final_has_budget
    print("=== Summary ===")
    print(f"  Before: {has_budget}/{total} ({100*has_budget/total:.1f}%) had budget")
    print(f"  After:  {final_has_budget}/{total} ({100*final_has_budget/total:.1f}%) have budget")
    print(f"  Promoted from metadata: {promoted}")
    print(f"  Found via regex: {regex_found}")
    print(f"  Still missing: {still_missing}")

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
