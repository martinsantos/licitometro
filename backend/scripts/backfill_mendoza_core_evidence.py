"""Backfill historical evidence metadata for Mendoza Core 3.

Usage:
  PYTHONPATH=backend python backend/scripts/backfill_mendoza_core_evidence.py --dry-run
  PYTHONPATH=backend python backend/scripts/backfill_mendoza_core_evidence.py --apply
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

from motor.motor_asyncio import AsyncIOMotorClient

sys.path.insert(0, str(Path(__file__).parent.parent))

from services.mendoza_core_evidence_backfill import backfill_mendoza_core_evidence


async def main():
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dry-run", action="store_true")
    mode.add_argument("--apply", action="store_true")
    parser.add_argument("--limit-per-source", type=int, default=0)
    args = parser.parse_args()

    client = AsyncIOMotorClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
    db = client[os.environ.get("DB_NAME", "licitaciones_db")]
    result = await backfill_mendoza_core_evidence(
        db,
        dry_run=not args.apply,
        limit_per_source=args.limit_per_source,
    )
    print(json.dumps(result, ensure_ascii=False, default=str, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
