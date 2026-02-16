"""
Backfill jurisdiccion field for existing licitaciones based on fuente.

This script tags all licitaciones with the correct jurisdiccion:
- Mendoza sources → jurisdiccion = "Mendoza"
- comprar.gob.ar → jurisdiccion = "Argentina"

Run:
    docker exec -w /app -e PYTHONPATH=/app licitometro-backend-1 python3 scripts/backfill_jurisdiccion.py
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

MENDOZA_SOURCES = [
    "Maipu", "MPF Mendoza", "COPIG", "San Carlos", "OSEP",
    "ComprasApps Mendoza", "La Paz", "IPV Mendoza", "Santa Rosa",
    "Boletin Oficial Mendoza", "Godoy Cruz", "General Alvear",
    "Malargue", "Irrigacion", "Rivadavia", "Guaymallen",
    "Ciudad de Mendoza", "EPRE Mendoza", "AYSAM", "UNCuyo",
    "Las Heras", "EMESA", "Vialidad Mendoza", "Lujan de Cuyo", "Tupungato",
    "Junín", "Municipalidad de Junín",  # Both variants
    "COMPR.AR Mendoza"  # Mendoza-specific COMPR.AR
]

async def main():
    print("=" * 60)
    print("BACKFILL JURISDICCION - Tagging Licitaciones by Source")
    print("=" * 60)
    print()

    # Connect to MongoDB
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME", "licitaciones_db")

    if not mongo_url:
        print("❌ ERROR: MONGO_URL environment variable not set")
        sys.exit(1)

    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    collection = db.licitaciones

    # Count total records
    total_count = await collection.count_documents({})
    print(f"📊 Total licitaciones in database: {total_count}")
    print()

    # Count records without jurisdiccion
    missing_jurisdiccion = await collection.count_documents(
        {"jurisdiccion": {"$in": [None, ""]}}
    )
    print(f"⚠️  Records missing jurisdiccion: {missing_jurisdiccion}")
    print()

    # Tag Mendoza sources
    print("🏔️  Tagging Mendoza sources...")
    print("-" * 60)
    total_mendoza = 0
    for source in sorted(MENDOZA_SOURCES):
        result = await collection.update_many(
            {"fuente": source, "jurisdiccion": {"$in": [None, ""]}},
            {"$set": {"jurisdiccion": "Mendoza"}}
        )
        if result.modified_count > 0:
            print(f"  ✓ {source:<30} → {result.modified_count:>5} tagged")
            total_mendoza += result.modified_count

    print()
    print(f"✅ Total Mendoza tagged: {total_mendoza}")
    print()

    # Tag national sources (EVERYTHING not in Mendoza list = Argentina)
    # This captures ALL ~11 national sources, not just comprar.gob.ar
    print("🇦🇷 Tagging Argentina nacional sources...")
    print("-" * 60)
    print("   Strategy: All sources NOT in Mendoza list → Argentina")
    result = await collection.update_many(
        {
            "fuente": {"$nin": MENDOZA_SOURCES},  # NOT in Mendoza sources list
            "jurisdiccion": {"$in": [None, ""]}    # Missing jurisdiccion tag
        },
        {"$set": {"jurisdiccion": "Argentina"}}
    )
    total_argentina = result.modified_count
    print(f"  ✓ All non-Mendoza sources → {total_argentina} tagged as Argentina")
    print()

    # Count remaining untagged
    still_missing = await collection.count_documents(
        {"jurisdiccion": {"$in": [None, ""]}}
    )

    # Show summary
    print("=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"Total tagged:         {total_mendoza + total_argentina}")
    print(f"  - Mendoza:          {total_mendoza}")
    print(f"  - Argentina:        {total_argentina}")
    print(f"Still missing:        {still_missing}")
    print()

    # Show distribution by jurisdiccion
    print("📊 Distribution by jurisdiccion:")
    print("-" * 60)
    distribution = await collection.aggregate([
        {"$group": {"_id": "$jurisdiccion", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]).to_list(length=10)

    for doc in distribution:
        jurisdiccion = doc["_id"] or "(null)"
        count = doc["count"]
        print(f"  {jurisdiccion:<20} {count:>6}")

    print()
    print("✅ Backfill complete!")

    client.close()

if __name__ == "__main__":
    asyncio.run(main())
