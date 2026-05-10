"""Source-level readiness coverage metrics."""

from __future__ import annotations

import re
from typing import Any, Dict, Tuple


async def build_source_readiness_summary(db, source_name: str) -> Tuple[int, list[str], Dict[str, Any]]:
    """Compute AI/readiness coverage for one scraper source."""

    escaped_name = re.escape(source_name)
    licitaciones_collection = db.licitaciones
    total_records = await licitaciones_collection.count_documents(
        {"fuente": {"$regex": f"^{escaped_name}", "$options": "i"}}
    )
    ai_ready_records = await licitaciones_collection.count_documents({
        "fuente": {"$regex": f"^{escaped_name}", "$options": "i"},
        "requisitos.source": "ai_extraction_v2",
    })
    source_lics = await licitaciones_collection.find(
        {"fuente": {"$regex": f"^{escaped_name}", "$options": "i"}},
        {"_id": 1},
    ).limit(1000).to_list(length=1000)
    source_ids = [str(doc["_id"]) for doc in source_lics]
    readiness_summary: Dict[str, Any] = {
        "records_evaluated": len(source_ids),
        "ai_extracted": ai_ready_records,
        "snapshots": 0,
        "ready": 0,
        "blocked": 0,
        "missing_documents": 0,
        "red_flags": 0,
    }
    if source_ids:
        pipeline = [
            {"$match": {"licitacion_id": {"$in": source_ids}}},
            {"$group": {
                "_id": None,
                "snapshots": {"$sum": 1},
                "ready": {"$sum": {"$cond": [{"$eq": ["$status", "ready"]}, 1, 0]}},
                "blocked": {"$sum": {"$cond": [{"$eq": ["$status", "blocked"]}, 1, 0]}},
                "missing_documents": {"$sum": "$counts.missing_documents"},
                "red_flags": {"$sum": "$counts.red_flags"},
            }},
        ]
        readiness_docs = await db.offer_readiness_snapshots.aggregate(pipeline).to_list(length=1)
        if readiness_docs:
            summary = readiness_docs[0]
            readiness_summary.update({
                "snapshots": summary.get("snapshots", 0),
                "ready": summary.get("ready", 0),
                "blocked": summary.get("blocked", 0),
                "missing_documents": summary.get("missing_documents", 0),
                "red_flags": summary.get("red_flags", 0),
            })
    readiness_summary["ai_coverage"] = (ai_ready_records / total_records) if total_records else 0
    readiness_summary["snapshot_coverage"] = (
        readiness_summary["snapshots"] / len(source_ids)
    ) if source_ids else 0
    return total_records, source_ids, readiness_summary
