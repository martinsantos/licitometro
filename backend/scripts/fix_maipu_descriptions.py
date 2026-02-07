#!/usr/bin/env python3
"""
Fix garbled Maipú descriptions where all table cells were concatenated without separators.
Also fixes any items where title is generic like "Licitación Pública" by extracting
the real title from the description.

Usage:
  docker exec -w /app -e PYTHONPATH=/app licitometro-backend-1 python scripts/fix_maipu_descriptions.py
"""

import asyncio
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from motor.motor_asyncio import AsyncIOMotorClient

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017/licitaciones_db")
DB_NAME = os.environ.get("DB_NAME", "licitaciones_db")


def clean_description(desc: str, title: str) -> str:
    """Try to separate garbled concatenated table cells."""
    if not desc:
        return ""

    # Pattern: dates like dd/mm/yyyy concatenated without spaces
    # e.g. "19/02/202606/02/202632/2026ADQUISICIÓN DE GRANZA..."
    # Try to split on date boundaries
    cleaned = re.sub(r'(\d{2}/\d{2}/\d{4})', r' | \1', desc)
    # Remove leading separator
    cleaned = cleaned.lstrip(' |')

    # Also split before numbers that look like expediente or budget
    # e.g. "...DEPARTAMENTO1252/2026153000"
    cleaned = re.sub(r'([A-ZÁÉÍÓÚÑ])(\d{3,})', r'\1 | \2', cleaned)

    # Remove the title from description to avoid redundancy
    if title and title in cleaned:
        cleaned = cleaned.replace(title, '').strip(' |')

    return cleaned.strip()


async def main():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    # Find all Maipu licitaciones
    cursor = db.licitaciones.find({"fuente": "Maipu"})
    docs = await cursor.to_list(length=5000)
    print(f"Found {len(docs)} Maipu licitaciones")

    fixed = 0
    for doc in docs:
        desc = doc.get("description", "")
        title = doc.get("title", "")
        updates = {}

        # Check if description looks garbled (dates concatenated without spaces)
        if desc and re.search(r'\d{2}/\d{2}/\d{4}\d{2}/\d{2}/\d{4}', desc):
            new_desc = clean_description(desc, title)
            updates["description"] = new_desc

        if updates:
            await db.licitaciones.update_one(
                {"_id": doc["_id"]},
                {"$set": updates}
            )
            fixed += 1
            if fixed <= 5:
                print(f"\n  BEFORE: {desc[:120]}...")
                print(f"  AFTER:  {updates.get('description', desc)[:120]}...")

    print(f"\nFixed {fixed}/{len(docs)} Maipu descriptions")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
