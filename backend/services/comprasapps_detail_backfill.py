"""Backfill detail data for vigente ComprasApps Mendoza records."""

from __future__ import annotations

import asyncio
from datetime import datetime
from typing import Any, Awaitable, Callable, Dict, List, Optional

from pymongo import UpdateOne

from models.scraper_config import ScraperConfig
from scrapers.comprasapps_mendoza_scraper import ComprasAppsMendozaScraper
from scrapers.contracts import EvidenceKind, SourceEvidence, evidence_id
from utils.object_extractor import extract_objeto
from utils.time import utc_now


DetailFetcher = Callable[[str], Awaitable[Dict[str, Any]]]


def _pliego_docs(urls: List[str]) -> List[Dict[str, Any]]:
    docs = []
    seen = set()
    for url in urls or []:
        if not url or url in seen:
            continue
        seen.add(url)
        fname = str(url).rsplit("/", 1)[-1]
        ext = fname.rsplit(".", 1)[-1].lower() if "." in fname else ""
        docs.append({
            "url": url,
            "titulo": f"Pliego/Adjuntos - {fname}",
            "tipo": "ZIP" if ext == "zip" else "PDF",
            "fuente": "comprasapps",
        })
    return docs


def build_comprasapps_detail_updates(doc: dict, detail: dict) -> Dict[str, Any]:
    if not detail:
        return {}

    updates: Dict[str, Any] = {}
    if detail.get("budget_parsed") and not doc.get("budget"):
        updates["budget"] = detail["budget_parsed"]
        updates["currency"] = detail.get("currency") or "ARS"
    if detail.get("expedient_number") and not doc.get("expedient_number"):
        updates["expedient_number"] = detail["expedient_number"]
    if detail.get("description") and detail.get("description") != doc.get("description"):
        updates["description"] = detail["description"]

    docs = _pliego_docs(detail.get("pliego_urls") or [])
    if docs and not (doc.get("pliegos_bases") or []):
        updates["pliegos_bases"] = docs

    if not doc.get("objeto"):
        objeto = extract_objeto(
            title=doc.get("title"),
            description=detail.get("description") or doc.get("description"),
            metadata=doc.get("metadata") or {},
        )
        if objeto:
            updates["objeto"] = objeto

    popup = {
        key: value
        for key, value in detail.items()
        if key not in ("budget_parsed", "pliego_urls") and value not in (None, "", [], {})
    }
    if popup:
        updates["metadata.detail_popup"] = popup
    return updates


def build_comprasapps_source_evidence(doc: dict, updates: dict) -> Dict[str, Any]:
    evidence = []
    canonical_url = doc.get("canonical_url") or doc.get("source_url")
    if canonical_url:
        evidence.append(SourceEvidence(
            kind=EvidenceKind.HTML,
            source_url=str(canonical_url),
            metadata={"role": "comprasapps_detail"},
        ))
    for pliego in updates.get("pliegos_bases") or doc.get("pliegos_bases") or []:
        if not isinstance(pliego, dict) or not pliego.get("url"):
            continue
        url = str(pliego["url"])
        kind = EvidenceKind.PDF if url.lower().split("?")[0].endswith(".pdf") else EvidenceKind.TEXT
        evidence.append(SourceEvidence(
            kind=kind,
            source_url=url,
            metadata={"role": "pliego_base", "titulo": pliego.get("titulo")},
        ))

    kind_counts: Dict[str, int] = {}
    ids = []
    urls = []
    for item in evidence:
        kind_counts[item.kind.value] = kind_counts.get(item.kind.value, 0) + 1
        ids.append(evidence_id(item))
        urls.append(item.source_url)

    return {
        "contract": "native_scrape_result",
        "source_id": "comprasapps_mendoza",
        "extraction_version": "comprasapps_detail_backfill_v1",
        "extraction_confidence": 0.82 if evidence else 0.55,
        "evidence_ids": ids,
        "evidence_count": len(evidence),
        "evidence_coverage": 1.0 if evidence else 0.0,
        "evidence_kind_counts": kind_counts,
        "evidence_urls": urls[:10],
        "warning_count": 0,
    }


async def default_detail_fetcher(url: str) -> Dict[str, Any]:
    config = ScraperConfig(
        name="ComprasApps Mendoza",
        url="https://comprasapps.mendoza.gov.ar/Compras/servlet/hli00049",
        source_type="website",
        selectors={},
        active=True,
    )
    scraper = ComprasAppsMendozaScraper(config)
    await scraper.setup()
    try:
        html = await scraper.fetch_page(url)
        return scraper._parse_detail_html(html) if html else {}
    finally:
        await scraper.cleanup()


async def backfill_comprasapps_vigente_details(
    db,
    *,
    dry_run: bool = True,
    limit: int = 0,
    concurrency: int = 4,
    now: Optional[datetime] = None,
    detail_fetcher: Optional[DetailFetcher] = None,
) -> Dict[str, Any]:
    timestamp = now or utc_now()
    fetcher = detail_fetcher or default_detail_fetcher
    query = {
        "fuente": "ComprasApps Mendoza",
        "estado": "vigente",
        "canonical_url": {"$regex": "hli00048"},
    }
    cursor = db.licitaciones.find(
        query,
        {
            "_id": 1,
            "id_licitacion": 1,
            "title": 1,
            "description": 1,
            "objeto": 1,
            "canonical_url": 1,
            "source_url": 1,
            "budget": 1,
            "currency": 1,
            "expedient_number": 1,
            "pliegos_bases": 1,
            "metadata": 1,
        },
    )
    if limit:
        cursor = cursor.limit(limit)
    docs = await cursor.to_list(length=limit or None)

    sem = asyncio.Semaphore(max(1, concurrency))
    ops: List[UpdateOne] = []
    samples = []
    errors = []
    eligible = 0

    async def process(doc: dict):
        nonlocal eligible
        url = doc.get("canonical_url")
        if not url:
            return
        try:
            async with sem:
                detail = await fetcher(str(url))
                await asyncio.sleep(0.2)
            updates = build_comprasapps_detail_updates(doc, detail)
            if not updates:
                return
            updates["metadata.comprasapps_detail_backfilled_at"] = timestamp
            evidence = build_comprasapps_source_evidence(doc, updates)
            if evidence:
                updates["metadata.source_evidence"] = evidence
            eligible += 1
            if len(samples) < 5:
                samples.append({
                    "id": str(doc.get("_id")),
                    "id_licitacion": doc.get("id_licitacion"),
                    "fields": sorted(updates.keys()),
                })
            if not dry_run:
                ops.append(UpdateOne({"_id": doc["_id"]}, {"$set": updates}))
        except Exception as exc:
            if len(errors) < 10:
                errors.append({
                    "id": str(doc.get("_id")),
                    "id_licitacion": doc.get("id_licitacion"),
                    "error": f"{type(exc).__name__}: {exc}",
                })

    await asyncio.gather(*(process(doc) for doc in docs))

    modified = 0
    if ops:
        result = await db.licitaciones.bulk_write(ops, ordered=False)
        modified = int(getattr(result, "modified_count", 0))

    return {
        "dry_run": dry_run,
        "matched": len(docs),
        "eligible": eligible,
        "modified": modified,
        "errors": errors,
        "samples": samples,
    }
