"""
Migration script: Add workflow_state and enrichment_level to existing licitaciones.

Run once after deploying the new schema:
    python backend/scripts/migrate_add_workflow.py

This script:
1. Adds workflow_state='descubierta' to all licitaciones missing the field
2. Adds enrichment_level=1 to all licitaciones missing the field
3. Adds workflow_history=[] to all licitaciones missing the field
4. Adds document_count=0 to all licitaciones missing the field
5. Creates necessary indexes
"""

import asyncio
import os
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "licitaciones_db")


async def migrate():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    collection = db["licitaciones"]

    print(f"Connected to {MONGO_URL}/{DB_NAME}")

    # Count existing documents
    total = await collection.count_documents({})
    print(f"Total licitaciones: {total}")

    # 1. Add workflow_state where missing
    result = await collection.update_many(
        {"workflow_state": {"$exists": False}},
        {"$set": {"workflow_state": "descubierta"}}
    )
    print(f"Added workflow_state to {result.modified_count} documents")

    # 2. Add workflow_history where missing
    result = await collection.update_many(
        {"workflow_history": {"$exists": False}},
        {"$set": {"workflow_history": []}}
    )
    print(f"Added workflow_history to {result.modified_count} documents")

    # 3. Add enrichment_level where missing
    result = await collection.update_many(
        {"enrichment_level": {"$exists": False}},
        {"$set": {"enrichment_level": 1}}
    )
    print(f"Added enrichment_level to {result.modified_count} documents")

    # 4. Add document_count where missing
    result = await collection.update_many(
        {"document_count": {"$exists": False}},
        {"$set": {"document_count": 0}}
    )
    print(f"Added document_count to {result.modified_count} documents")

    # 5. Set enrichment_level=2 for already enriched documents
    result = await collection.update_many(
        {
            "enrichment_level": 1,
            "$or": [
                {"items": {"$exists": True, "$ne": []}},
                {"garantias": {"$exists": True, "$ne": []}},
                {"metadata.enriched_at": {"$exists": True}},
            ]
        },
        {"$set": {"enrichment_level": 2}}
    )
    print(f"Upgraded enrichment_level to 2 for {result.modified_count} already-enriched documents")

    # 6. Create indexes
    print("Creating indexes...")
    await collection.create_index("workflow_state")
    await collection.create_index("enrichment_level")
    await collection.create_index([("publication_date", -1), ("opening_date", -1)])
    print("Indexes created")

    # Summary
    for state in ["descubierta", "evaluando", "preparando", "presentada", "descartada"]:
        count = await collection.count_documents({"workflow_state": state})
        print(f"  {state}: {count}")

    for level in [1, 2, 3]:
        count = await collection.count_documents({"enrichment_level": level})
        print(f"  enrichment_level={level}: {count}")

    client.close()
    print("Migration complete!")


if __name__ == "__main__":
    asyncio.run(migrate())
