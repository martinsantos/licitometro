"""
Repair licitaciones where opening_date is earlier than publication_date.

Default mode is dry-run. Use --apply to persist repairs.
The previous opening_date is preserved under metadata.date_repairs.
"""

import argparse
import asyncio
import os
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from motor.motor_asyncio import AsyncIOMotorClient

sys.path.insert(0, str(Path(__file__).parent.parent))


def build_invalid_dates_query() -> dict[str, Any]:
    d = "$"
    return {
        "publication_date": {d + "ne": None},
        "opening_date": {d + "ne": None},
        d + "expr": {d + "lt": [d + "opening_date", d + "publication_date"]},
    }


def build_repair_update(doc: dict[str, Any]) -> Optional[dict[str, Any]]:
    publication_date = doc.get("publication_date")
    opening_date = doc.get("opening_date")
    if not publication_date or not opening_date or opening_date >= publication_date:
        return None

    now = datetime.now(timezone.utc)
    return {
        "$set": {
            "opening_date": None,
            "updated_at": now,
        },
        "$push": {
            "metadata.date_repairs": {
                "field": "opening_date",
                "old_value": opening_date,
                "publication_date": publication_date,
                "repaired_at": now,
                "reason": "opening_date was earlier than publication_date and breaks response validation",
                "method": "repair_invalid_opening_dates.py",
            }
        },
    }


async def repair_invalid_opening_dates(apply: bool, limit: Optional[int] = None) -> dict[str, Any]:
    db_name = os.environ.get("DB_NAME", "licitaciones_db")
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[db_name]
    col = db.licitaciones

    query = build_invalid_dates_query()
    cursor = col.find(
        query,
        {
            "title": 1,
            "fuente": 1,
            "publication_date": 1,
            "opening_date": 1,
            "licitacion_number": 1,
            "expedient_number": 1,
        },
    ).sort("publication_date", -1)
    if limit:
        cursor = cursor.limit(limit)

    scanned = 0
    repaired = 0
    by_source: Counter[str] = Counter()
    examples: list[dict[str, Any]] = []

    async for doc in cursor:
        scanned += 1
        update = build_repair_update(doc)
        if not update:
            continue

        fuente = doc.get("fuente") or "unknown"
        by_source[fuente] += 1
        if len(examples) < 10:
            examples.append(
                {
                    "id": str(doc["_id"]),
                    "fuente": fuente,
                    "publication_date": doc.get("publication_date"),
                    "opening_date": doc.get("opening_date"),
                    "licitacion_number": doc.get("licitacion_number"),
                    "title": (doc.get("title") or "")[:100],
                }
            )

        if apply:
            result = await col.update_one({"_id": doc["_id"]}, update)
            repaired += result.modified_count
        else:
            repaired += 1

    return {
        "mode": "apply" if apply else "dry-run",
        "scanned": scanned,
        "would_repair" if not apply else "repaired": repaired,
        "by_source": dict(by_source.most_common()),
        "examples": examples,
    }


def _format_summary(summary: dict[str, Any]) -> None:
    print(f"mode: {summary['mode']}")
    print(f"scanned: {summary['scanned']}")
    print(f"{'repaired' if summary['mode'] == 'apply' else 'would_repair'}: {summary.get('repaired', summary.get('would_repair', 0))}")
    print("by_source:")
    for source, count in summary["by_source"].items():
        print(f"  {source}: {count}")
    print("examples:")
    for item in summary["examples"]:
        print(f"  {item}")


async def main() -> None:
    parser = argparse.ArgumentParser(description="Repair invalid opening_date values.")
    parser.add_argument("--apply", action="store_true", help="Persist updates. Default is dry-run.")
    parser.add_argument("--limit", type=int, default=None, help="Limit number of documents to scan.")
    args = parser.parse_args()

    summary = await repair_invalid_opening_dates(apply=args.apply, limit=args.limit)
    _format_summary(summary)


if __name__ == "__main__":
    asyncio.run(main())
