"""Backfill historical quality fields for Mendoza Core records."""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any, Dict, List, Optional

from pymongo import UpdateOne

from utils.object_extractor import extract_objeto
from utils.time import utc_now


def _url_from(value: Any) -> Optional[str]:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        url = value.get("url") or value.get("href") or value.get("source_url")
        return str(url) if url else None
    return None


def _is_pdf_url(url: Optional[str], metadata: Optional[dict] = None) -> bool:
    if not url:
        return False
    clean = str(url).lower().split("?")[0]
    if clean.endswith(".pdf") or "/verpdf/" in clean:
        return True
    meta = metadata or {}
    return str(meta.get("type") or meta.get("kind") or "").lower() == "pdf"


def _first_pdf_url(doc: dict) -> Optional[str]:
    source_url = _url_from(doc.get("source_url"))
    if _is_pdf_url(source_url):
        return source_url
    canonical_url = _url_from(doc.get("canonical_url"))
    if _is_pdf_url(canonical_url):
        return canonical_url
    for field in ("attached_files", "pliegos_bases"):
        for item in doc.get(field) or []:
            url = _url_from(item)
            if _is_pdf_url(url, item if isinstance(item, dict) else None):
                return url
    return None


def build_boletin_direct_pdf_updates(doc: dict) -> Dict[str, Any]:
    pdf_url = _first_pdf_url(doc)
    if not pdf_url:
        return {}
    updates: Dict[str, Any] = {}
    if str(doc.get("canonical_url") or "") != pdf_url:
        updates["canonical_url"] = pdf_url
    if doc.get("url_quality") != "direct_pdf":
        updates["url_quality"] = "direct_pdf"
    source_urls = doc.get("source_urls") if isinstance(doc.get("source_urls"), dict) else {}
    if source_urls.get("boletin_pdf") != pdf_url:
        updates["source_urls.boletin_pdf"] = pdf_url
    return updates


def build_comprar_objeto_updates(doc: dict) -> Dict[str, Any]:
    if doc.get("objeto"):
        return {}
    objeto = extract_objeto(
        title=doc.get("title"),
        description=doc.get("description"),
        metadata=doc.get("metadata") or {},
    )
    return {"objeto": objeto} if objeto else {}


async def _load_docs(db, query: dict, limit: int):
    cursor = db.licitaciones.find(
        query,
        {
            "_id": 1,
            "id_licitacion": 1,
            "fuente": 1,
            "title": 1,
            "description": 1,
            "objeto": 1,
            "source_url": 1,
            "canonical_url": 1,
            "source_urls": 1,
            "url_quality": 1,
            "attached_files": 1,
            "pliegos_bases": 1,
            "metadata": 1,
        },
    )
    if limit:
        cursor = cursor.limit(limit)
    return await cursor.to_list(length=limit or None)


async def backfill_mendoza_core_quality(
    db,
    *,
    dry_run: bool = True,
    limit_per_kind: int = 0,
    now: Optional[datetime] = None,
) -> Dict[str, Any]:
    timestamp = now or utc_now()
    totals = {
        "dry_run": dry_run,
        "matched": 0,
        "eligible": 0,
        "modified": 0,
        "kinds": [],
    }
    work = [
        (
            "boletin_direct_pdf",
            {"fuente": {"$regex": "^Boletin Oficial Mendoza", "$options": "i"}},
            build_boletin_direct_pdf_updates,
        ),
        (
            "comprar_objeto",
            {"fuente": {"$regex": "^COMPR\\.AR Mendoza$", "$options": "i"}},
            build_comprar_objeto_updates,
        ),
    ]

    for kind, query, builder in work:
        docs = await _load_docs(db, query, limit_per_kind)
        ops: List[UpdateOne] = []
        samples = []
        eligible = 0
        for doc in docs:
            updates = builder(doc)
            if not updates:
                continue
            updates["metadata.mendoza_core_quality_backfilled_at"] = timestamp
            eligible += 1
            if len(samples) < 5:
                samples.append({
                    "id": str(doc.get("_id")),
                    "id_licitacion": doc.get("id_licitacion"),
                    "fields": sorted(updates.keys()),
                })
            if not dry_run:
                ops.append(UpdateOne({"_id": doc["_id"]}, {"$set": updates}))

        modified = 0
        if ops:
            result = await db.licitaciones.bulk_write(ops, ordered=False)
            modified = int(getattr(result, "modified_count", 0))

        totals["matched"] += len(docs)
        totals["eligible"] += eligible
        totals["modified"] += modified
        totals["kinds"].append({
            "kind": kind,
            "matched": len(docs),
            "eligible": eligible,
            "modified": modified,
            "samples": samples,
        })

    return totals
