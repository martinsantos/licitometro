"""Contracts for Licitometro 0.2 scraper outputs.

Existing scrapers still return ``list[LicitacionCreate]``. These contracts are
the migration target: a scraper should eventually return normalized items plus
evidence and confidence metadata so ingestion can be auditable.
"""

from __future__ import annotations

import hashlib
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple

from pydantic import BaseModel, Field, model_validator

from models.licitacion import LicitacionCreate
from utils.time import utc_now


class EvidenceKind(str, Enum):
    HTML = "html"
    PDF = "pdf"
    API_JSON = "api_json"
    API_XML = "api_xml"
    POSTBACK = "postback"
    BROWSER = "browser"
    TEXT = "text"


class SourceEvidence(BaseModel):
    """Raw or semi-raw evidence used to create a normalized tender."""

    kind: EvidenceKind
    source_url: str
    captured_at: datetime = Field(default_factory=utc_now)
    content_hash: Optional[str] = None
    storage_url: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class ScrapeWarning(BaseModel):
    """Non-fatal issue observed while scraping or normalizing one item."""

    code: str
    message: str
    field: Optional[str] = None


class ScrapeResult(BaseModel):
    """Auditable scraper result for one normalized licitacion."""

    item: LicitacionCreate
    source_id: str
    evidence: List[SourceEvidence] = Field(default_factory=list)
    extraction_confidence: float = Field(ge=0.0, le=1.0, default=0.75)
    warnings: List[ScrapeWarning] = Field(default_factory=list)
    extraction_version: str = "legacy"

    @model_validator(mode="after")
    def validate_minimum_contract(self):
        if not self.source_id.strip():
            raise ValueError("source_id is required")
        if not self.item.id_licitacion:
            raise ValueError("item.id_licitacion is required")
        if not self.item.fuente:
            raise ValueError("item.fuente is required")
        return self

    @classmethod
    def from_legacy_item(
        cls,
        item: LicitacionCreate,
        *,
        source_id: str,
        extraction_confidence: float = 0.65,
    ) -> "ScrapeResult":
        """Wrap an existing LicitacionCreate during the incremental migration."""

        evidence = []
        if item.source_url:
            evidence.append(SourceEvidence(kind=EvidenceKind.HTML, source_url=str(item.source_url)))
        for attached in item.attached_files or []:
            url = attached.get("url") if isinstance(attached, dict) else None
            if url:
                kind = EvidenceKind.PDF if str(url).lower().split("?")[0].endswith(".pdf") else EvidenceKind.TEXT
                evidence.append(SourceEvidence(kind=kind, source_url=str(url)))
        return cls(
            item=item,
            source_id=source_id,
            evidence=evidence,
            extraction_confidence=extraction_confidence,
        )


def evidence_id(evidence: SourceEvidence) -> str:
    """Stable local identifier for one evidence pointer."""

    seed = "|".join([
        evidence.kind.value,
        evidence.source_url,
        evidence.content_hash or "",
    ])
    return hashlib.sha256(seed.encode("utf-8")).hexdigest()[:16]


def summarize_item_evidence(result: ScrapeResult) -> Dict[str, Any]:
    """Compact per-item evidence summary safe to embed in licitacion metadata."""

    kind_counts: Dict[str, int] = {}
    ids: List[str] = []
    urls: List[str] = []
    for evidence in result.evidence:
        kind_counts[evidence.kind.value] = kind_counts.get(evidence.kind.value, 0) + 1
        ids.append(evidence_id(evidence))
        urls.append(evidence.source_url)
    return {
        "contract": "native_scrape_result" if result.extraction_version != "legacy" else "legacy_wrapped_scrape_result",
        "source_id": result.source_id,
        "extraction_version": result.extraction_version,
        "extraction_confidence": result.extraction_confidence,
        "evidence_ids": ids,
        "evidence_count": len(result.evidence),
        "evidence_kind_counts": kind_counts,
        "evidence_urls": urls[:10],
        "warning_count": len(result.warnings),
    }


def summarize_legacy_evidence(items: List[LicitacionCreate], source_id: str) -> Dict[str, Any]:
    """Summarize evidence coverage while scrapers migrate to ScrapeResult."""

    results = [
        ScrapeResult.from_legacy_item(item, source_id=source_id)
        for item in items
    ]
    return summarize_scrape_results(results, contract="legacy_wrapped_scrape_result")


def summarize_scrape_results(results: List[ScrapeResult], contract: str = "native_scrape_result") -> Dict[str, Any]:
    """Summarize evidence coverage for normalized scraper results."""

    total = len(results)
    with_evidence = 0
    evidence_count = 0
    kind_counts: Dict[str, int] = {}
    confidence_total = 0.0
    warning_count = 0

    source_ids = sorted({result.source_id for result in results})
    for result in results:
        confidence_total += result.extraction_confidence
        warning_count += len(result.warnings)
        if result.evidence:
            with_evidence += 1
        evidence_count += len(result.evidence)
        for evidence in result.evidence:
            kind_counts[evidence.kind.value] = kind_counts.get(evidence.kind.value, 0) + 1

    return {
        "contract": contract,
        "source_id": source_ids[0] if len(source_ids) == 1 else None,
        "source_ids": source_ids,
        "items_evaluated": total,
        "items_with_evidence": with_evidence,
        "evidence_count": evidence_count,
        "evidence_coverage": round(with_evidence / total, 4) if total else 0.0,
        "evidence_kind_counts": kind_counts,
        "avg_extraction_confidence": round(confidence_total / total, 4) if total else 0.0,
        "warning_count": warning_count,
    }


def normalize_scraper_output(raw_items: List[Any], source_id: str) -> Tuple[List[LicitacionCreate], List[ScrapeResult], Dict[str, Any]]:
    """Normalize scraper output to legacy items plus evidence-aware results."""

    items: List[LicitacionCreate] = []
    results: List[ScrapeResult] = []
    native_count = 0

    for raw in raw_items or []:
        if isinstance(raw, ScrapeResult):
            result = raw
            native_count += 1
        elif isinstance(raw, LicitacionCreate):
            result = ScrapeResult.from_legacy_item(raw, source_id=source_id)
        else:
            raise TypeError(f"Unsupported scraper output item: {type(raw).__name__}")
        items.append(result.item)
        results.append(result)

    summary = summarize_scrape_results(
        results,
        contract="native_scrape_result" if native_count else "legacy_wrapped_scrape_result",
    )
    summary["native_result_count"] = native_count
    summary["legacy_wrapped_count"] = len(results) - native_count
    return items, results, summary
