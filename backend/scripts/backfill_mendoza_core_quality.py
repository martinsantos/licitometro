#!/usr/bin/env python3
"""Backfill historical Mendoza Core quality fields."""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

from motor.motor_asyncio import AsyncIOMotorClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from services.mendoza_core_quality_backfill import backfill_mendoza_core_quality


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--apply", action="store_true", help="Write changes")
    mode.add_argument("--dry-run", action="store_true", help="Only report changes")
    parser.add_argument("--limit-per-kind", type=int, default=0)
    args = parser.parse_args()

    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ.get("DB_NAME", "licitaciones_db")]
    result = await backfill_mendoza_core_quality(
        db,
        dry_run=not args.apply,
        limit_per_kind=args.limit_per_kind,
    )
    print(json.dumps(result, ensure_ascii=False, default=str, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
