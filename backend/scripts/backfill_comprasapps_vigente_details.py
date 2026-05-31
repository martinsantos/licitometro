#!/usr/bin/env python3
"""Backfill detail data for vigente ComprasApps Mendoza records."""

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

from services.comprasapps_detail_backfill import backfill_comprasapps_vigente_details


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--apply", action="store_true")
    mode.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--concurrency", type=int, default=4)
    args = parser.parse_args()

    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ.get("DB_NAME", "licitaciones_db")]
    result = await backfill_comprasapps_vigente_details(
        db,
        dry_run=not args.apply,
        limit=args.limit,
        concurrency=args.concurrency,
    )
    print(json.dumps(result, ensure_ascii=False, default=str, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
