"""
Auto-import Argentina nacional sources on first deploy.

This migration imports 11 curated Argentina nacional sources from the template.
Sources are documented in docs/comprasAR2026.md.

Run once:
    docker exec -w /app -e PYTHONPATH=/app licitometro-backend-1 python3 scripts/migrate_import_argentina_sources.py
"""
import asyncio
import json
import os
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from motor.motor_asyncio import AsyncIOMotorClient


async def main():
    # Load template
    template_path = Path(__file__).parent.parent / "data" / "argentina_nacional_sources.json"

    if not template_path.exists():
        print(f"❌ ERROR: Template file not found at {template_path}")
        sys.exit(1)

    with open(template_path) as f:
        sources = json.load(f)

    print("=" * 80)
    print("ARGENTINA NACIONAL SOURCES - Auto-Import Migration")
    print("=" * 80)
    print()
    print(f"📦 Loading {len(sources)} sources from template...")
    print()

    # Connect to MongoDB
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME", "licitaciones_db")

    if not mongo_url:
        print("❌ ERROR: MONGO_URL environment variable not set")
        sys.exit(1)

    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    collection = db.scraper_configs

    added = 0
    skipped = 0
    errors = []

    for source in sources:
        try:
            # Check if exists
            existing = await collection.find_one({"name": source["name"]})

            if existing:
                print(f"  ⏭️  {source['name']:<40} - already exists")
                skipped += 1
            else:
                # Insert new source
                await collection.insert_one(source)
                status = "✅ ACTIVE" if source.get("active", False) else "💤 inactive"
                print(f"  {status}  {source['name']:<40} - imported")
                added += 1

        except Exception as e:
            print(f"  ❌ {source['name']:<40} - ERROR: {e}")
            errors.append({"name": source["name"], "error": str(e)})

    print()
    print("=" * 80)
    print("SUMMARY")
    print("=" * 80)
    print(f"✅ Added:   {added}")
    print(f"⏭️  Skipped: {skipped}")
    print(f"❌ Errors:  {len(errors)}")

    if errors:
        print()
        print("ERRORS:")
        for err in errors:
            print(f"  - {err['name']}: {err['error']}")

    print()

    if added > 0:
        print(f"🎉 Successfully imported {added} new Argentina nacional sources!")
    elif skipped == len(sources):
        print("ℹ️  All sources already exist (migration previously completed)")
    else:
        print("⚠️  Migration completed with warnings")

    print()
    print("Next steps:")
    print("  1. Run backfill script: scripts/backfill_jurisdiccion.py")
    print("  2. Verify in admin UI: /admin → 'Fuentes de Datos'")
    print("  3. Test filtering: /licitaciones-ar should show only Argentina data")
    print()

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
