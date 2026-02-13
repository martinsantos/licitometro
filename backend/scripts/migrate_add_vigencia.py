#!/usr/bin/env python3
"""
Migration script to add vigencia fields to existing licitaciones.

This script:
1. Adds 'estado' field (vigente/vencida/prorrogada/archivada)
2. Adds 'fecha_prorroga' field (None by default)
3. Recomputes estado for all records based on dates
4. Fixes date order violations where possible
5. Flags records with impossible years for review

Usage:
    python3 scripts/migrate_add_vigencia.py --dry-run  # Preview changes
    python3 scripts/migrate_add_vigencia.py            # Apply changes
"""

import argparse
import asyncio
import logging
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from motor.motor_asyncio import AsyncIOMotorClient

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("migrate_vigencia")


def compute_estado(publication_date, opening_date, fecha_prorroga):
    """Compute estado based on business rules."""
    today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)

    # Rule 1: Historical archive
    if publication_date and publication_date < datetime(2025, 1, 1):
        return "archivada"

    # Rule 2: Prórroga
    if fecha_prorroga and fecha_prorroga > today:
        return "prorrogada"

    # Rule 3: Vencida
    if opening_date and opening_date < today:
        return "vencida"

    # Rule 3.5: Old items without opening_date are probably vencida
    # If published >60 days ago and no opening_date, mark as vencida
    if opening_date is None and publication_date:
        days_since_pub = (today - publication_date).days
        if days_since_pub > 45:
            return "vencida"

    # Rule 4: Vigente (default)
    return "vigente"


async def migrate(dry_run=False):
    """Run the migration."""

    # Connect to MongoDB
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "licitometro")

    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    logger.info(f"Connected to MongoDB: {db_name}")
    logger.info(f"Dry-run mode: {dry_run}")

    # Phase 1: Add default fields to records missing them
    logger.info("\n=== Phase 1: Adding default fields ===")

    missing_estado = await db.licitaciones.count_documents({"estado": {"$exists": False}})
    logger.info(f"Records missing 'estado' field: {missing_estado}")

    if not dry_run and missing_estado > 0:
        result = await db.licitaciones.update_many(
            {"estado": {"$exists": False}},
            {"$set": {"estado": "vigente", "fecha_prorroga": None}}
        )
        logger.info(f"✅ Added default fields to {result.modified_count} records")

    # Phase 2: Recompute estado for all records
    logger.info("\n=== Phase 2: Recomputing estado ===")

    total = await db.licitaciones.count_documents({})
    logger.info(f"Total records to process: {total}")

    updated = 0
    date_fixes = 0
    impossible_years = []
    estado_counts = {"vigente": 0, "vencida": 0, "prorrogada": 0, "archivada": 0}
    debug_count = 0

    cursor = db.licitaciones.find({})

    async for doc in cursor:
        doc_id = doc["_id"]
        pub_date = doc.get("publication_date")
        open_date = doc.get("opening_date")
        fecha_prorroga = doc.get("fecha_prorroga")
        current_estado = doc.get("estado", "vigente")

        # Check for impossible years
        if pub_date and pub_date.year >= 2028:
            impossible_years.append({
                "id": str(doc_id),
                "title": doc.get("title", "")[:50],
                "publication_date": pub_date.isoformat(),
                "issue": f"Impossible publication year: {pub_date.year}"
            })

        if open_date and open_date.year >= 2028:
            impossible_years.append({
                "id": str(doc_id),
                "title": doc.get("title", "")[:50],
                "opening_date": open_date.isoformat(),
                "issue": f"Impossible opening year: {open_date.year}"
            })

        # Check date order violation
        needs_fix = False
        if pub_date and open_date and open_date < pub_date:
            # Try to fix: infer publication_date from opening_date
            new_pub = open_date - timedelta(days=30)
            logger.warning(f"Date order violation for {doc_id}: pub {pub_date.date()} > open {open_date.date()} → fixing to {new_pub.date()}")
            pub_date = new_pub
            needs_fix = True
            date_fixes += 1

        # Compute new estado
        new_estado = compute_estado(pub_date, open_date, fecha_prorroga)
        estado_counts[new_estado] += 1

        # Debug first 5 vigente items
        if current_estado == 'vigente' and debug_count < 5:
            debug_count += 1
            logger.info(f"DEBUG: {doc.get('title', 'N/A')[:50]}")
            logger.info(f"  Pub: {pub_date}, Open: {open_date}")
            logger.info(f"  Current: {current_estado}, New: {new_estado}")
            if pub_date and not open_date:
                days = (datetime.now().replace(hour=0, minute=0, second=0, microsecond=0) - pub_date).days
                logger.info(f"  Days since pub: {days}, Threshold: >45")

        # Update if changed or needs fix
        if new_estado != current_estado or needs_fix:
            update_doc = {"estado": new_estado}
            if needs_fix:
                update_doc["publication_date"] = pub_date
                update_doc["metadata.vigencia_migration"] = {
                    "migrated_at": datetime.utcnow(),
                    "original_estado": current_estado,
                    "date_order_fixed": True,
                    "original_publication_date": doc.get("publication_date")
                }
            else:
                update_doc["metadata.vigencia_migration"] = {
                    "migrated_at": datetime.utcnow(),
                    "original_estado": current_estado
                }

            if not dry_run:
                await db.licitaciones.update_one(
                    {"_id": doc_id},
                    {"$set": update_doc}
                )

            updated += 1

    logger.info(f"\n{'Would update' if dry_run else 'Updated'} {updated} records")
    logger.info(f"Fixed {date_fixes} date order violations")

    # Phase 3: Report estado distribution
    logger.info("\n=== Phase 3: Estado Distribution ===")
    for estado, count in sorted(estado_counts.items(), key=lambda x: x[1], reverse=True):
        percentage = (count / total * 100) if total > 0 else 0
        logger.info(f"  {estado:12s}: {count:5d} ({percentage:5.1f}%)")

    # Phase 4: Report impossible years
    if impossible_years:
        logger.warning(f"\n⚠️  Found {len(impossible_years)} records with impossible years:")
        for item in impossible_years[:10]:  # Show first 10
            logger.warning(f"  - {item['id']}: {item['title']} → {item.get('issue', 'Unknown issue')}")
        if len(impossible_years) > 10:
            logger.warning(f"  ... and {len(impossible_years) - 10} more")
    else:
        logger.info("\n✅ No records with impossible years found")

    # Summary
    logger.info("\n=== Migration Summary ===")
    logger.info(f"Total records: {total}")
    logger.info(f"Records updated: {updated}")
    logger.info(f"Date fixes: {date_fixes}")
    logger.info(f"Impossible years flagged: {len(impossible_years)}")
    logger.info(f"Mode: {'DRY-RUN (no changes made)' if dry_run else 'APPLIED'}")

    # Verification queries
    if not dry_run:
        logger.info("\n=== Verification ===")

        # Check for records still missing estado
        missing = await db.licitaciones.count_documents({"estado": {"$exists": False}})
        logger.info(f"Records still missing estado: {missing}")

        # Count by estado
        logger.info("\nFinal estado counts:")
        for estado in ["vigente", "vencida", "prorrogada", "archivada"]:
            count = await db.licitaciones.count_documents({"estado": estado})
            logger.info(f"  {estado}: {count}")

    client.close()
    logger.info("\n✅ Migration complete!")


def main():
    parser = argparse.ArgumentParser(description="Migrate licitaciones to add vigencia fields")
    parser.add_argument("--dry-run", action="store_true", help="Preview changes without applying them")
    args = parser.parse_args()

    asyncio.run(migrate(dry_run=args.dry_run))


if __name__ == "__main__":
    main()
