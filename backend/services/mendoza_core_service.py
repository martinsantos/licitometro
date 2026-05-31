"""Operational health summary for the Mendoza Core 3 source set."""

from __future__ import annotations

import re
from datetime import datetime, timedelta
from typing import Any, Awaitable, Callable, Dict, List, Optional, Tuple

from config.mendoza_core_sources import CONTRACTS_BY_NAME, MENDOZA_CORE_CONTRACTS, MendozaCoreContract
from utils.time import utc_now


Loader = Callable[[Any, str], Awaitable[Tuple[Optional[dict], List[dict], Dict[str, Any]]]]


def _iso(value: Any) -> Optional[str]:
    return value.isoformat() if hasattr(value, "isoformat") else value


def _ratio(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _issue_if_below(issues: list[str], coverage: dict, field: str, minimum: Optional[float], code: str) -> None:
    if minimum is None:
        return
    if _ratio(coverage.get(field)) < minimum:
        issues.append(code)


def _last_run_evidence_coverage(last_run: dict) -> float:
    metadata = last_run.get("metadata") or {}
    evidence = metadata.get("source_evidence") or {}
    return _ratio(evidence.get("evidence_coverage"))


def _coverage_from_last_run(last_run: Optional[dict], historical_coverage: Dict[str, Any]) -> Dict[str, Any]:
    """Prefer current-run quality metadata for ingestion status.

    Historical records can predate the evidence/canonical migration. They still
    matter as backlog, but should not mark today's absorption as degraded when
    the latest run is complete.
    """

    if not last_run:
        return dict(historical_coverage)
    quality = ((last_run.get("metadata") or {}).get("source_quality") or {})
    items_evaluated = int(quality.get("items_evaluated") or 0)
    if items_evaluated <= 0:
        return dict(historical_coverage)

    missing_core = quality.get("missing_core_counts") or {}
    missing_valuable = quality.get("missing_valuable_counts") or {}

    def field_coverage(field: str, *, valuable: bool = True, fallback: Optional[str] = None) -> float:
        missing = (missing_valuable if valuable else missing_core).get(field, 0)
        if missing is None:
            missing = 0
        try:
            missing_count = int(missing)
        except (TypeError, ValueError):
            missing_count = 0
        return round(max(0, items_evaluated - missing_count) / items_evaluated, 4)

    current = dict(historical_coverage)
    current["publication_date"] = field_coverage("publication_date")
    current["opening_date"] = field_coverage("opening_date")
    description = field_coverage("description")
    objeto = field_coverage("objeto")
    current["object_or_description"] = max(description, objeto)
    current["source_url"] = field_coverage("source_url", valuable=False)
    current["canonical_url"] = field_coverage("canonical_url")
    current["direct_url"] = _ratio(quality.get("direct_url_coverage"))
    current["documents"] = _ratio(quality.get("document_coverage"))
    current["evidence"] = _last_run_evidence_coverage(last_run)
    current["fecha_scraping"] = 1.0
    return current


def build_core_source_status(
    *,
    contract_name: str,
    config: Optional[dict],
    recent_runs: List[dict],
    coverage: Dict[str, Any],
    now: Optional[datetime] = None,
) -> Dict[str, Any]:
    """Build one source status from its contract, config, recent runs and record coverage."""

    current_time = now or utc_now()
    if isinstance(current_time, datetime) and current_time.tzinfo is not None:
        current_time = current_time.replace(tzinfo=None)
    contract = CONTRACTS_BY_NAME[contract_name]
    config = config or {}
    last_run = recent_runs[0] if recent_runs else None
    historical_coverage = dict(coverage)
    status_coverage = _coverage_from_last_run(last_run, historical_coverage)
    blocking_issues: list[str] = []
    quality_issues: list[str] = []
    backlog_issues: list[str] = []

    if not config.get("active", False):
        blocking_issues.append("source_inactive")
    if not last_run:
        blocking_issues.append("no_recent_runs")
    else:
        run_status = last_run.get("status")
        if run_status == "failed":
            blocking_issues.append("last_run_failed")
        elif run_status == "empty_suspicious":
            blocking_issues.append("last_run_empty_suspicious")
        elif run_status == "partial":
            blocking_issues.append("last_run_partial")

        started_at = last_run.get("started_at")
        if hasattr(started_at, "replace") and started_at.tzinfo is not None:
            started_at = started_at.replace(tzinfo=None)
        if isinstance(started_at, datetime):
            if current_time - started_at > timedelta(hours=contract.sla_hours):
                blocking_issues.append("outside_sla")

        if int(last_run.get("items_found") or 0) < contract.expected_min_items:
            blocking_issues.append("items_below_expected_min")

        if _last_run_evidence_coverage(last_run) < contract.run_evidence_min:
            quality_issues.append("run_evidence_below_contract")

    _issue_if_below(quality_issues, status_coverage, "publication_date", contract.publication_date_min, "publication_date_below_contract")
    _issue_if_below(quality_issues, status_coverage, "opening_date", contract.opening_date_min, "opening_date_below_contract")
    _issue_if_below(quality_issues, status_coverage, "object_or_description", contract.object_or_description_min, "object_or_description_below_contract")
    _issue_if_below(quality_issues, status_coverage, "source_url", contract.source_url_min, "source_url_below_contract")
    _issue_if_below(quality_issues, status_coverage, "canonical_url", contract.canonical_url_min, "canonical_url_below_contract")
    _issue_if_below(quality_issues, status_coverage, "direct_url", contract.direct_url_min, "direct_url_below_contract")
    _issue_if_below(quality_issues, status_coverage, "documents", contract.documents_min, "documents_below_contract")

    if historical_coverage.get("evidence", 0) and _ratio(historical_coverage.get("evidence")) < 0.80:
        backlog_issues.append("historical_evidence_backfill_needed")

    status = "up_perfect"
    if any(issue in blocking_issues for issue in ("source_inactive", "no_recent_runs", "last_run_failed", "last_run_empty_suspicious", "outside_sla")):
        status = "down"
    elif any(issue in blocking_issues for issue in ("items_below_expected_min", "last_run_partial")):
        status = "at_risk"
    elif quality_issues:
        status = "up_degraded"

    return {
        "source_id": contract.source_id,
        "name": contract.name,
        "display_name": contract.display_name,
        "status": status,
        "active": bool(config.get("active", False)),
        "schedule": config.get("schedule"),
        "url": config.get("url"),
        "url_policy": contract.url_policy,
        "expected_min_items": contract.expected_min_items,
        "sla_hours": contract.sla_hours,
        "last_run": {
            "status": last_run.get("status") if last_run else None,
            "items_found": last_run.get("items_found", 0) if last_run else 0,
            "items_saved": last_run.get("items_saved", 0) if last_run else 0,
            "items_updated": last_run.get("items_updated", 0) if last_run else 0,
            "duration_seconds": last_run.get("duration_seconds") if last_run else None,
            "started_at": _iso(last_run.get("started_at")) if last_run else None,
            "ended_at": _iso(last_run.get("ended_at")) if last_run else None,
        },
        "records": {
            "total": int(historical_coverage.get("total") or 0),
            "vigentes": int(historical_coverage.get("vigentes") or 0),
            "new_7d": int(historical_coverage.get("new_7d") or 0),
        },
        "coverage": {
            key: round(_ratio(status_coverage.get(key)), 4)
            for key in (
                "publication_date",
                "opening_date",
                "object_or_description",
                "source_url",
                "canonical_url",
                "direct_url",
                "documents",
                "evidence",
                "fecha_scraping",
            )
        },
        "historical_coverage": {
            key: round(_ratio(historical_coverage.get(key)), 4)
            for key in (
                "publication_date",
                "opening_date",
                "object_or_description",
                "source_url",
                "canonical_url",
                "direct_url",
                "documents",
                "evidence",
                "fecha_scraping",
            )
        },
        "blocking_issues": blocking_issues,
        "quality_issues": quality_issues,
        "backlog_issues": backlog_issues,
    }


def _repair_priority(source: Dict[str, Any]) -> Optional[int]:
    if source["status"] == "down":
        return 1
    if source["status"] == "at_risk":
        return 2
    if source["status"] == "up_degraded":
        return 3
    if source.get("backlog_issues"):
        return 5
    return None


def _repair_action(source: Dict[str, Any]) -> str:
    issues = source.get("blocking_issues") or source.get("quality_issues") or source.get("backlog_issues") or []
    if "last_run_empty_suspicious" in issues or "last_run_failed" in issues:
        return "Revisar scraper y relanzar corrida controlada."
    if "last_run_partial" in issues:
        return "Revisar warnings/errores parciales, corregir brecha y relanzar corrida controlada."
    if "items_below_expected_min" in issues:
        return "Comparar selector/paginacion contra volumen esperado y revisar portal origen."
    if "documents_below_contract" in issues:
        return "Revisar extraccion de pliegos/documentos y backfill de vigentes."
    if "run_evidence_below_contract" in issues:
        return "Asegurar evidencia en run actual y backfill de metadata reciente."
    return "Revisar brechas de contrato y documentar excepcion si la fuente no publica el campo."


def build_repair_queue(sources: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    queue = []
    for source in sources:
        priority = _repair_priority(source)
        if priority is None:
            continue
        queue.append({
            "source_id": source["source_id"],
            "source_name": source["name"],
            "status": source["status"],
            "priority": priority,
            "issues": source["blocking_issues"] + source["quality_issues"] + source["backlog_issues"],
            "recommended_action": _repair_action(source),
        })
    return sorted(queue, key=lambda item: (item["priority"], item["source_name"]))


async def _load_source_state(db, name: str) -> Tuple[Optional[dict], List[dict], Dict[str, Any]]:
    config = await db.scraper_configs.find_one({"name": name})
    recent_runs = await db.scraper_runs.find(
        {"scraper_name": name},
        {
            "status": 1,
            "items_found": 1,
            "items_saved": 1,
            "items_updated": 1,
            "duration_seconds": 1,
            "started_at": 1,
            "ended_at": 1,
            "metadata.source_evidence": 1,
            "metadata.source_quality": 1,
        },
    ).sort("started_at", -1).limit(12).to_list(length=12)

    docs = await db.licitaciones.find(
        {"fuente": {"$regex": f"^{re.escape(name)}", "$options": "i"}},
        {
            "publication_date": 1,
            "opening_date": 1,
            "objeto": 1,
            "description": 1,
            "source_url": 1,
            "canonical_url": 1,
            "url_quality": 1,
            "attached_files": 1,
            "pliegos_bases": 1,
            "metadata.source_evidence": 1,
            "fecha_scraping": 1,
            "estado": 1,
            "first_seen_at": 1,
        },
    ).to_list(length=10000)

    return config, recent_runs, _summarize_coverage(docs)


def _present(value: Any) -> bool:
    return value not in (None, "", [], {})


def _summarize_coverage(docs: List[dict]) -> Dict[str, Any]:
    total = len(docs)
    counts = {
        "total": total,
        "publication_date": 0,
        "opening_date": 0,
        "object_or_description": 0,
        "source_url": 0,
        "canonical_url": 0,
        "direct_url": 0,
        "documents": 0,
        "evidence": 0,
        "fecha_scraping": 0,
        "vigentes": 0,
        "new_7d": 0,
    }
    seven_days_ago = utc_now().replace(tzinfo=None) - timedelta(days=7)
    for doc in docs:
        counts["publication_date"] += int(_present(doc.get("publication_date")))
        counts["opening_date"] += int(_present(doc.get("opening_date")))
        counts["object_or_description"] += int(_present(doc.get("objeto")) or _present(doc.get("description")))
        counts["source_url"] += int(_present(doc.get("source_url")))
        counts["canonical_url"] += int(_present(doc.get("canonical_url")))
        counts["direct_url"] += int(doc.get("url_quality") in ("direct", "direct_pdf"))
        counts["documents"] += int(_present(doc.get("attached_files")) or _present(doc.get("pliegos_bases")))
        counts["evidence"] += int(_present((doc.get("metadata") or {}).get("source_evidence")))
        counts["fecha_scraping"] += int(_present(doc.get("fecha_scraping")))
        counts["vigentes"] += int(doc.get("estado") == "vigente")
        first_seen = doc.get("first_seen_at")
        if isinstance(first_seen, datetime):
            if first_seen.tzinfo is not None:
                first_seen = first_seen.replace(tzinfo=None)
            counts["new_7d"] += int(first_seen >= seven_days_ago)

    coverage = {
        key: (round(value / total, 4) if total else 0.0)
        for key, value in counts.items()
        if key not in ("total", "vigentes", "new_7d")
    }
    coverage["total"] = total
    coverage["vigentes"] = counts["vigentes"]
    coverage["new_7d"] = counts["new_7d"]
    return coverage


async def build_mendoza_core_summary(
    db,
    *,
    now: Optional[datetime] = None,
    loader: Optional[Loader] = None,
) -> Dict[str, Any]:
    current_time = now or utc_now().replace(tzinfo=None)
    load = loader or _load_source_state
    sources = []
    for contract in MENDOZA_CORE_CONTRACTS:
        config, recent_runs, coverage = await load(db, contract.name)
        sources.append(build_core_source_status(
            contract_name=contract.name,
            config=config,
            recent_runs=recent_runs,
            coverage=coverage,
            now=current_time,
        ))

    totals = {
        "sources": len(sources),
        "up_perfect": sum(1 for source in sources if source["status"] == "up_perfect"),
        "up_degraded": sum(1 for source in sources if source["status"] == "up_degraded"),
        "at_risk": sum(1 for source in sources if source["status"] == "at_risk"),
        "down": sum(1 for source in sources if source["status"] == "down"),
        "records_total": sum(source["records"]["total"] for source in sources),
        "vigentes_total": sum(source["records"]["vigentes"] for source in sources),
        "new_7d_total": sum(source["records"]["new_7d"] for source in sources),
    }

    return {
        "generated_at": _iso(current_time),
        "totals": totals,
        "sources": sources,
        "repair_queue": build_repair_queue(sources),
    }
