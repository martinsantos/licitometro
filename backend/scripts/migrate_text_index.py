"""
Migration script: Expand the MongoDB text index on licitaciones collection.

MongoDB only allows ONE text index per collection. This script drops the old
text index (title + description only) and creates an expanded one that also
covers organization, category, keywords, expedient_number, licitacion_number,
and jurisdiccion.

Usage:
    cd backend
    python scripts/migrate_text_index.py
"""

import asyncio
import os
import sys
from pathlib import Path

# Add backend directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "licitaciones_db")


async def migrate():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    collection = db["licitaciones"]

    print(f"Connected to {MONGO_URL}/{DB_NAME}")

    # List current indexes
    indexes = await collection.index_information()
    print(f"\nCurrent indexes: {list(indexes.keys())}")

    # Find and drop existing text index
    text_index_name = None
    for name, info in indexes.items():
        key_dict = dict(info.get("key", []))
        if "_fts" in key_dict:
            text_index_name = name
            break

    if text_index_name:
        print(f"\nDropping old text index: {text_index_name}")
        await collection.drop_index(text_index_name)
        print("Old text index dropped.")
    else:
        print("\nNo existing text index found.")

    # Create expanded text index
    print("\nCreating expanded text index...")
    await collection.create_index(
        [
            ("title", "text"),
            ("description", "text"),
            ("organization", "text"),
            ("category", "text"),
            ("keywords", "text"),
            ("expedient_number", "text"),
            ("licitacion_number", "text"),
            ("jurisdiccion", "text"),
        ],
        weights={
            "title": 10,
            "licitacion_number": 8,
            "expedient_number": 8,
            "description": 5,
            "organization": 3,
            "category": 3,
            "keywords": 2,
            "jurisdiccion": 1,
        },
        default_language="spanish",
        name="text_search_expanded",
    )
    print("Expanded text index created successfully!")

    # Create budget index for range queries
    print("\nCreating budget index...")
    await collection.create_index("budget")
    print("Budget index created.")

    # Verify
    new_indexes = await collection.index_information()
    print(f"\nFinal indexes: {list(new_indexes.keys())}")

    client.close()
    print("\nMigration complete!")


if __name__ == "__main__":
    asyncio.run(migrate())
