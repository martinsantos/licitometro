"""Backfill historical source evidence for Mendoza Core records."""

from __future__ import annotations

import hashlib
import re
from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional

from pymongo import UpdateOne

from config.mendoza_core_sources import CONTRACTS_BY_NAME, MENDOZA_CORE_CONTRACTS
from utils.time import utc_now


def _url_from(value: Any) -> Optional[str]:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        url = value.get("url") or value.get("href") or value.get("source_url")
        return str(url) if url else None
    return None


def _evidence_kind(url: str, *, primary: bool = False) -> str:
    if primary:
        return "html"
    clean = url.lower().split("?")[0]
    if clean.endswith(".pdf"):
        return "pdf"
    return "text"


def _evidence_id(kind: str, url: str) -> str:
    return hashlib.sha256(f"{kind}|{url}|".encode("utf-8")).hexdigest()[:16]


def _iter_evidence_urls(doc: dict) -> Iterable[tuple[str, str]]:
    seen: set[str] = set()
    for field in ("source_url", "canonical_url"):
        url = _url_from(doc.get(field))
        if url and url not in seen:
            seen.add(url)
            yield "html", url
    for field in ("attached_files", "pliegos_bases"):
        for item in doc.get(field) or []:
            url = _url_from(item)
            if url and url not in seen:
                seen.add(url)
                yield _evidence_kind(url), url


def build_historical_source_evidence(doc: dict, *, source_id: str) -> Optional[Dict[str, Any]]:
    evidence = list(_iter_evidence_urls(doc))
    if not evidence:
        return None

    kind_counts: Dict[str, int] = {}
    urls: List[str] = []
    ids: List[str] = []
    for kind, url in evidence:
        kind_counts[kind] = kind_counts.get(kind, 0) + 1
        urls.append(url)
        ids.append(_evidence_id(kind, url))

    return {
        "contract": "historical_evidence_backfill",
        "source_id": source_id,
        "extraction_version": "historical_backfill_v1",
        "extraction_confidence": 0.55,
        "evidence_ids": ids,
        "evidence_count": len(evidence),
        "evidence_coverage": 1.0,
        "evidence_kind_counts": kind_counts,
        "evidence_urls": urls[:10],
        "warning_count": 0,
    }


async def backfill_mendoza_core_evidence(
    db,
    *,
    source_names: Optional[List[str]] = None,
    dry_run: bool = True,
    limit_per_source: int = 0,
    now: Optional[datetime] = None,
) -> Dict[str, Any]:
    selected_names = source_names or [contract.name for contract in MENDOZA_CORE_CONTRACTS]
    timestamp = now or utc_now()
    totals = {
        "dry_run": dry_run,
        "matched": 0,
        "eligible": 0,
        "modified": 0,
        "sources": [],
    }

    for name in selected_names:
        contract = CONTRACTS_BY_NAME[name]
        query = {
            "fuente": {"$regex": f"^{re.escape(name)}", "$options": "i"},
            "$or": [
                {"metadata.source_evidence": {"$exists": False}},
                {"metadata.source_evidence": None},
            ],
        }
        cursor = db.licitaciones.find(
            query,
            {
                "_id": 1,
                "id_licitacion": 1,
                "fuente": 1,
                "source_url": 1,
                "canonical_url": 1,
                "attached_files": 1,
                "pliegos_bases": 1,
                "metadata": 1,
            },
        )
        if limit_per_source:
            cursor = cursor.limit(limit_per_source)
        docs = await cursor.to_list(length=limit_per_source or None)

        ops = []
        samples = []
        eligible = 0
        for doc in docs:
            summary = build_historical_source_evidence(doc, source_id=contract.source_id)
            if not summary:
                continue
            eligible += 1
            if len(samples) < 5:
                samples.append({
                    "id": str(doc.get("_id")),
                    "id_licitacion": doc.get("id_licitacion"),
                    "evidence_count": summary["evidence_count"],
                })
            if not dry_run:
                ops.append(UpdateOne(
                    {
                        "_id": doc["_id"],
                        "$or": [
                            {"metadata.source_evidence": {"$exists": False}},
                            {"metadata.source_evidence": None},
                        ],
                    },
                    {"$set": {
                        "metadata.source_evidence": summary,
                        "metadata.mendoza_core_evidence_backfilled_at": timestamp,
                    }},
                ))

        modified = 0
        if ops:
            result = await db.licitaciones.bulk_write(ops, ordered=False)
            modified = int(getattr(result, "modified_count", 0))

        totals["matched"] += len(docs)
        totals["eligible"] += eligible
        totals["modified"] += modified
        totals["sources"].append({
            "source_name": name,
            "matched": len(docs),
            "eligible": eligible,
            "modified": modified,
            "samples": samples,
        })

    return totals
