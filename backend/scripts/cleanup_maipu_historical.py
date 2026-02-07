"""
Cleanup historical Maipu licitaciones - keep only 2026+
Run: docker exec -w /app -e PYTHONPATH=/app backend python3 scripts/cleanup_maipu_historical.py
"""
import asyncio
import os
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorClient

MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017/licitaciones_db")

async def cleanup():
    client = AsyncIOMotorClient(MONGO_URL)
    db_name = MONGO_URL.rsplit("/", 1)[-1].split("?")[0]
    db = client[db_name]
    col = db["licitaciones"]

    cutoff = datetime(2026, 1, 1)

    # Count totals first
    total_maipu = await col.count_documents({"fuente": "Maipu"})
    old_maipu = await col.count_documents({
        "fuente": "Maipu",
        "$or": [
            {"publication_date": {"$lt": cutoff}},
            {"publication_date": None},
            {"publication_date": {"$exists": False}},
        ]
    })
    keep_maipu = await col.count_documents({
        "fuente": "Maipu",
        "publication_date": {"$gte": cutoff}
    })

    print(f"Maipú total:     {total_maipu}")
    print(f"Pre-2026 / null: {old_maipu} (will DELETE)")
    print(f"2026+:           {keep_maipu} (will KEEP)")

    if old_maipu == 0:
        print("\nNothing to delete.")
        client.close()
        return

    confirm = input(f"\nDelete {old_maipu} historical items? [y/N]: ").strip().lower()
    if confirm != "y":
        print("Aborted.")
        client.close()
        return

    result = await col.delete_many({
        "fuente": "Maipu",
        "$or": [
            {"publication_date": {"$lt": cutoff}},
            {"publication_date": None},
            {"publication_date": {"$exists": False}},
        ]
    })
    print(f"\nDeleted {result.deleted_count} historical Maipú items.")

    remaining = await col.count_documents({"fuente": "Maipu"})
    print(f"Remaining Maipú items: {remaining}")

    client.close()

if __name__ == "__main__":
    asyncio.run(cleanup())
