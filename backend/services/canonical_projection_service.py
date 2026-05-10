"""Build canonical tender projections from legacy licitacion documents.

This is intentionally side-effect free for now. It lets us test and iterate on
the 0.2 canonical model before introducing migrations or new collections.
"""

from __future__ import annotations

import hashlib
import re
import unicodedata
from typing import Any, Dict, List

from models.tender_canonical import SourceRecord, TenderCanonical
from utils.proceso_id import normalize_proceso_id
from utils.time import utc_now


def _normalize_match_text(value: Any) -> str:
    """Normalize noisy procurement text for conservative duplicate grouping."""

    raw = unicodedata.normalize("NFKD", str(value or ""))
    ascii_text = raw.encode("ascii", "ignore").decode("ascii").lower()
    ascii_text = re.sub(r"[^a-z0-9]+", " ", ascii_text)
    tokens = [
        token
        for token in ascii_text.split()
        if token not in {"de", "del", "la", "el", "los", "las", "y", "para", "por"}
    ]
    return " ".join(tokens[:18])


def canonical_duplicate_key(doc: Dict[str, Any]) -> str:
    """Build a conservative key for duplicate diagnostics across sources."""

    title = _normalize_match_text(doc.get("objeto") or doc.get("title"))
    organization = _normalize_match_text(doc.get("organization"))
    opening = doc.get("opening_date") or doc.get("expiration_date") or ""
    if hasattr(opening, "date"):
        opening = opening.date().isoformat()
    else:
        opening = str(opening)[:10]
    jurisdiction = _normalize_match_text(doc.get("jurisdiccion") or "Mendoza")
    return "|".join([jurisdiction, organization, opening, title])


def _stable_canonical_id(lic_doc: Dict[str, Any]) -> str:
    proceso_id = lic_doc.get("proceso_id") or normalize_proceso_id(
        expedient_number=lic_doc.get("expedient_number"),
        licitacion_number=lic_doc.get("licitacion_number"),
        title=lic_doc.get("title", ""),
        fuente=lic_doc.get("fuente", ""),
    )
    if proceso_id:
        return proceso_id
    seed = "|".join([
        str(lic_doc.get("id_licitacion") or ""),
        str(lic_doc.get("fuente") or ""),
        str(lic_doc.get("title") or ""),
    ])
    return "legacy:" + hashlib.sha256(seed.encode("utf-8")).hexdigest()[:16]


def build_canonical_projection(lic_doc: Dict[str, Any]) -> TenderCanonical:
    """Project one legacy licitacion document into the 0.2 canonical shape."""

    source_evidence = (lic_doc.get("metadata") or {}).get("source_evidence") or {}
    source_record = SourceRecord(
        source_id=str(lic_doc.get("fuente") or "unknown").lower().replace(" ", "_"),
        source_name=lic_doc.get("fuente") or "unknown",
        source_record_id=str(lic_doc.get("id_licitacion") or lic_doc.get("_id") or ""),
        source_url=str(lic_doc.get("source_url")) if lic_doc.get("source_url") else None,
        canonical_url=str(lic_doc.get("canonical_url")) if lic_doc.get("canonical_url") else None,
        url_quality=lic_doc.get("url_quality"),
        raw_title=lic_doc.get("title"),
        raw_organization=lic_doc.get("organization"),
        raw_dates={
            "publication_date": lic_doc.get("publication_date"),
            "opening_date": lic_doc.get("opening_date"),
            "expiration_date": lic_doc.get("expiration_date"),
        },
        evidence_ids=source_evidence.get("evidence_ids") or [],
        extraction_confidence=source_evidence.get("extraction_confidence") or 0.65,
        metadata={
            "legacy_id": str(lic_doc.get("_id", "")),
            "source_evidence": source_evidence,
        },
    )
    return TenderCanonical(
        canonical_id=_stable_canonical_id(lic_doc),
        title=lic_doc.get("objeto") or lic_doc.get("title") or "Sin titulo",
        organization=lic_doc.get("organization") or "Sin organizacion",
        jurisdiccion=lic_doc.get("jurisdiccion") or "Mendoza",
        objeto=lic_doc.get("objeto"),
        publication_date=lic_doc.get("publication_date"),
        opening_date=lic_doc.get("opening_date"),
        expiration_date=lic_doc.get("expiration_date"),
        budget=lic_doc.get("budget"),
        currency=lic_doc.get("currency"),
        category=lic_doc.get("category"),
        estado=lic_doc.get("estado") or "vigente",
        proceso_id=lic_doc.get("proceso_id"),
        source_records=[source_record],
        confidence=0.65,
        metadata={
            "projection": "legacy_licitacion_v1",
            "duplicate_key": canonical_duplicate_key(lic_doc),
        },
    )


def merge_source_records(existing: List[Dict[str, Any]], new_record: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Merge one source record into a canonical projection's source_records list."""

    merged = []
    replaced = False
    new_key = (
        new_record.get("source_id"),
        new_record.get("source_record_id"),
    )
    for record in existing or []:
        key = (
            record.get("source_id"),
            record.get("source_record_id"),
        )
        if key == new_key:
            combined = {**record, **new_record}
            combined["first_seen_at"] = record.get("first_seen_at") or new_record.get("first_seen_at")
            combined["last_seen_at"] = new_record.get("last_seen_at") or utc_now()
            merged.append(combined)
            replaced = True
        else:
            merged.append(record)
    if not replaced:
        merged.append(new_record)
    return merged


async def upsert_canonical_projection(db, lic_doc: Dict[str, Any]) -> TenderCanonical:
    """Upsert a side-collection canonical projection from one legacy licitacion."""

    projection = build_canonical_projection(lic_doc)
    collection = db.tender_canonical_projections
    existing = await collection.find_one({"canonical_id": projection.canonical_id})

    doc = projection.model_dump()
    if existing:
        source_record = projection.source_records[0].model_dump()
        source_record["last_seen_at"] = utc_now()
        doc["source_records"] = merge_source_records(existing.get("source_records") or [], source_record)
        doc["created_at"] = existing.get("created_at") or projection.created_at
        doc["updated_at"] = utc_now()
        # Preserve richer metadata already attached by future migrations.
        doc["metadata"] = {**(existing.get("metadata") or {}), **doc.get("metadata", {})}

    await collection.update_one(
        {"canonical_id": projection.canonical_id},
        {"$set": doc},
        upsert=True,
    )
    return TenderCanonical(**doc)


async def upsert_many_canonical_projections(db, lic_docs: List[Dict[str, Any]]) -> Dict[str, int]:
    """Best-effort batch upsert for legacy docs."""

    upserted = 0
    failed = 0
    for doc in lic_docs:
        try:
            await upsert_canonical_projection(db, doc)
            upserted += 1
        except Exception:
            failed += 1
    return {"upserted": upserted, "failed": failed}


async def merge_canonical_projections(
    db,
    primary_canonical_id: str,
    duplicate_canonical_ids: List[str],
    actor: str = "system",
    reason: str = "manual_duplicate_resolution",
) -> Dict[str, Any]:
    """Merge duplicate side projections into one primary canonical projection."""

    duplicate_ids = [cid for cid in duplicate_canonical_ids if cid and cid != primary_canonical_id]
    if not primary_canonical_id or not duplicate_ids:
        return {"ok": False, "reason": "primary and duplicate ids are required", "merged": 0}

    collection = db.tender_canonical_projections
    primary = await collection.find_one({"canonical_id": primary_canonical_id})
    if not primary:
        return {"ok": False, "reason": "primary not found", "merged": 0}

    merged_records = list(primary.get("source_records") or [])
    found_duplicates: List[Dict[str, Any]] = []
    for duplicate_id in duplicate_ids:
        duplicate = await collection.find_one({"canonical_id": duplicate_id})
        if not duplicate:
            continue
        found_duplicates.append(duplicate)
        for record in duplicate.get("source_records") or []:
            merged_records = merge_source_records(merged_records, record)

    if not found_duplicates:
        return {"ok": False, "reason": "no duplicate records found", "merged": 0}

    now = utc_now()
    merge_event = {
        "at": now,
        "actor": actor,
        "reason": reason,
        "primary": primary_canonical_id,
        "duplicates": [doc.get("canonical_id") for doc in found_duplicates],
    }
    primary_metadata = dict(primary.get("metadata") or {})
    primary_metadata["merged_from"] = sorted(set(primary_metadata.get("merged_from", []) + merge_event["duplicates"]))
    primary_metadata["merge_events"] = list(primary_metadata.get("merge_events", [])) + [merge_event]

    await collection.update_one(
        {"canonical_id": primary_canonical_id},
        {
            "$set": {
                "source_records": merged_records,
                "metadata": primary_metadata,
                "updated_at": now,
            }
        },
    )

    for duplicate in found_duplicates:
        duplicate_metadata = dict(duplicate.get("metadata") or {})
        duplicate_metadata["merged_into"] = primary_canonical_id
        duplicate_metadata["merge_event"] = merge_event
        await collection.update_one(
            {"canonical_id": duplicate.get("canonical_id")},
            {
                "$set": {
                    "estado": "merged",
                    "metadata": duplicate_metadata,
                    "updated_at": now,
                }
            },
        )

    return {
        "ok": True,
        "primary": primary_canonical_id,
        "merged": len(found_duplicates),
        "source_records": len(merged_records),
    }


def detect_duplicate_candidates(canonical_docs: List[Dict[str, Any]], min_group_size: int = 2) -> List[Dict[str, Any]]:
    """Find conservative duplicate candidates among canonical side projections."""

    groups: Dict[str, List[Dict[str, Any]]] = {}
    for doc in canonical_docs:
        key = (doc.get("metadata") or {}).get("duplicate_key") or canonical_duplicate_key(doc)
        if not key.strip("|"):
            continue
        groups.setdefault(key, []).append(doc)

    candidates: List[Dict[str, Any]] = []
    for key, docs in groups.items():
        if len(docs) < min_group_size:
            continue
        evidence_ids = sorted({
            evidence_id
            for doc in docs
            for record in doc.get("source_records", [])
            for evidence_id in record.get("evidence_ids", [])
        })
        source_names = sorted({
            record.get("source_name") or record.get("source_id") or "unknown"
            for doc in docs
            for record in doc.get("source_records", [])
        })
        base_confidence = 0.9 if len(source_names) > 1 else 0.75
        confidence = round(min(0.97, base_confidence + (0.04 if evidence_ids else 0.0)), 2)
        candidates.append({
            "duplicate_key": key,
            "count": len(docs),
            "confidence": confidence,
            "canonical_ids": [doc.get("canonical_id") for doc in docs],
            "title": docs[0].get("title"),
            "organization": docs[0].get("organization"),
            "sources": source_names,
            "evidence_ids": evidence_ids,
            "evidence_count": len(evidence_ids),
            "items": [
                {
                    "canonical_id": doc.get("canonical_id"),
                    "title": doc.get("title"),
                    "organization": doc.get("organization"),
                    "opening_date": doc.get("opening_date"),
                    "source_count": len(doc.get("source_records") or []),
                }
                for doc in docs
            ],
        })

    return sorted(candidates, key=lambda group: (-group["count"], group["duplicate_key"]))
