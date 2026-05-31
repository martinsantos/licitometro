"""Source quality metrics for Licitometro 0.2 ingestion.

The goal is to make scraper quality visible: field coverage, direct URL
coverage, document availability, and low-confidence records. The service works
with legacy ``LicitacionCreate`` outputs today and can later consume native
``ScrapeResult`` objects with richer evidence.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional


CORE_FIELDS = (
    "id_licitacion",
    "title",
    "organization",
    "jurisdiccion",
    "tipo_procedimiento",
    "source_url",
    "fuente",
)

VALUABLE_FIELDS = (
    "publication_date",
    "opening_date",
    "objeto",
    "description",
    "budget",
    "currency",
    "canonical_url",
    "url_quality",
    "content_hash",
    "proceso_id",
    "category",
)


@dataclass(frozen=True)
class ItemQuality:
    score: int
    missing_core: List[str]
    missing_valuable: List[str]
    has_documents: bool
    has_direct_url: bool


def _get(item: Any, field: str):
    if isinstance(item, dict):
        return item.get(field)
    return getattr(item, field, None)


def evaluate_item_quality(item: Any) -> ItemQuality:
    """Evaluate one normalized scraper item.

    Score is intentionally simple and explainable:
    - 50 points for core-field coverage
    - 30 points for valuable-field coverage
    - 10 points for document presence
    - 10 points for direct/canonical URL quality
    """

    missing_core = [field for field in CORE_FIELDS if not _get(item, field)]
    missing_valuable = [field for field in VALUABLE_FIELDS if not _get(item, field)]

    core_score = round(50 * (len(CORE_FIELDS) - len(missing_core)) / len(CORE_FIELDS))
    valuable_score = round(30 * (len(VALUABLE_FIELDS) - len(missing_valuable)) / len(VALUABLE_FIELDS))

    attached_files = _get(item, "attached_files") or []
    pliegos_bases = _get(item, "pliegos_bases") or []
    has_documents = bool(attached_files or pliegos_bases)

    canonical_url = _get(item, "canonical_url")
    url_quality = _get(item, "url_quality")
    has_direct_url = bool(canonical_url and url_quality in ("direct", "direct_pdf"))

    score = core_score + valuable_score
    if has_documents:
        score += 10
    if has_direct_url:
        score += 10

    return ItemQuality(
        score=max(0, min(100, score)),
        missing_core=missing_core,
        missing_valuable=missing_valuable,
        has_documents=has_documents,
        has_direct_url=has_direct_url,
    )


def summarize_items_quality(items: Iterable[Any], *, sample_limit: int = 10) -> Dict[str, Any]:
    """Aggregate field quality metrics for a scraper run."""

    evaluated = [evaluate_item_quality(item) for item in items]
    total = len(evaluated)
    if total == 0:
        return {
            "score": 0,
            "items_evaluated": 0,
            "document_coverage": 0.0,
            "direct_url_coverage": 0.0,
            "missing_core_counts": {},
            "missing_valuable_counts": {},
            "low_confidence_count": 0,
            "low_confidence_samples": [],
        }

    def _counts(attr: str) -> Dict[str, int]:
        counts: Dict[str, int] = {}
        for quality in evaluated:
            for field in getattr(quality, attr):
                counts[field] = counts.get(field, 0) + 1
        return dict(sorted(counts.items(), key=lambda kv: (-kv[1], kv[0])))

    low_confidence_samples = []
    for idx, quality in enumerate(evaluated):
        if quality.score < 60 and len(low_confidence_samples) < sample_limit:
            low_confidence_samples.append({
                "index": idx,
                "score": quality.score,
                "missing_core": quality.missing_core,
                "missing_valuable": quality.missing_valuable[:6],
            })

    return {
        "score": round(sum(q.score for q in evaluated) / total),
        "items_evaluated": total,
        "document_coverage": round(sum(1 for q in evaluated if q.has_documents) / total, 3),
        "direct_url_coverage": round(sum(1 for q in evaluated if q.has_direct_url) / total, 3),
        "missing_core_counts": _counts("missing_core"),
        "missing_valuable_counts": _counts("missing_valuable"),
        "low_confidence_count": sum(1 for q in evaluated if q.score < 60),
        "low_confidence_samples": low_confidence_samples,
    }
