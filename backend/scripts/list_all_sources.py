"""
List all unique fuentes in the database to identify Nacional vs Mendoza sources.

Run:
    docker exec -w /app -e PYTHONPATH=/app licitometro-backend-1 python3 scripts/list_all_sources.py
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

async def main():
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME", "licitaciones_db")

    if not mongo_url:
        print("❌ ERROR: MONGO_URL environment variable not set")
        sys.exit(1)

    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    # Get all unique fuentes with counts
    print("=" * 80)
    print("ALL FUENTES IN DATABASE")
    print("=" * 80)
    print()

    pipeline = [
        {"$group": {"_id": "$fuente", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]

    fuentes = await db.licitaciones.aggregate(pipeline).to_list(length=100)

    print(f"{'Fuente':<40} {'Count':>10} {'Jurisdiccion?'}")
    print("-" * 80)

    mendoza_keywords = ["mendoza", "maipu", "mpf", "copig", "san carlos", "osep",
                        "comprasapps", "la paz", "ipv", "santa rosa", "junin",
                        "vialidad", "godoy cruz", "general alvear", "malargue",
                        "irrigacion", "rivadavia", "guaymallen", "ciudad de mendoza",
                        "epre", "aysam", "uncuyo", "las heras", "emesa",
                        "lujan de cuyo", "tupungato", "boletin oficial"]

    nacional_count = 0
    mendoza_count = 0
    unknown_count = 0

    for doc in fuentes:
        fuente = doc["_id"] or "(null)"
        count = doc["count"]

        # Detect jurisdiction
        fuente_lower = fuente.lower()
        if any(kw in fuente_lower for kw in mendoza_keywords):
            jurisdiccion = "Mendoza"
            mendoza_count += count
        elif "comprar" in fuente_lower or "argentina" in fuente_lower or "gob.ar" in fuente_lower:
            jurisdiccion = "Argentina"
            nacional_count += count
        else:
            jurisdiccion = "???"
            unknown_count += count

        print(f"{fuente:<40} {count:>10}  {jurisdiccion}")

    print()
    print("=" * 80)
    print("SUMMARY")
    print("=" * 80)
    print(f"Mendoza sources:   {mendoza_count:>6} items")
    print(f"Nacional sources:  {nacional_count:>6} items")
    print(f"Unknown sources:   {unknown_count:>6} items")
    print(f"TOTAL:             {mendoza_count + nacional_count + unknown_count:>6} items")

    client.close()

if __name__ == "__main__":
    asyncio.run(main())
