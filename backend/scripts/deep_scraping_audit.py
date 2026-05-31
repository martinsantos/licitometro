#!/usr/bin/env python3
"""Deep non-ingesting scraper audit for the Mendoza Core sources."""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

import aiohttp
from motor.motor_asyncio import AsyncIOMotorClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from config.mendoza_core_sources import CONTRACTS_BY_NAME, MENDOZA_CORE_CONTRACTS
from models.scraper_config import ScraperConfig
from scrapers.contracts import normalize_scraper_output
from scrapers.scraper_factory import create_scraper
from services.mendoza_core_service import build_mendoza_core_summary
from services.source_quality_service import summarize_items_quality


DEFAULT_TARGETS = [contract.name for contract in MENDOZA_CORE_CONTRACTS]


def _json_default(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


def _ratio(count: int, total: int) -> float:
    return round(count / total, 4) if total else 0.0


def _is_present(value: Any) -> bool:
    return value not in (None, "", [], {})


def _field_coverage(items: Iterable[Any]) -> Dict[str, Any]:
    fields = [
        "id_licitacion",
        "title",
        "organization",
        "jurisdiccion",
        "tipo_procedimiento",
        "publication_date",
        "opening_date",
        "objeto",
        "description",
        "source_url",
        "canonical_url",
        "url_quality",
        "attached_files",
        "pliegos_bases",
        "budget",
        "currency",
        "content_hash",
    ]
    items = list(items)
    total = len(items)
    coverage: Dict[str, Any] = {"total": total}
    for field in fields:
        count = 0
        for item in items:
            value = getattr(item, field, None)
            count += int(_is_present(value))
        coverage[field] = _ratio(count, total)
    coverage["direct_url"] = _ratio(
        sum(1 for item in items if getattr(item, "url_quality", None) in ("direct", "direct_pdf")),
        total,
    )
    coverage["with_documents"] = _ratio(
        sum(
            1
            for item in items
            if _is_present(getattr(item, "attached_files", None))
            or _is_present(getattr(item, "pliegos_bases", None))
        ),
        total,
    )
    return coverage


def _sample_items(items: List[Any], limit: int) -> List[Dict[str, Any]]:
    sample = []
    for item in items[:limit]:
        sample.append(
            {
                "id_licitacion": getattr(item, "id_licitacion", None),
                "title": (getattr(item, "title", "") or "")[:140],
                "organization": getattr(item, "organization", None),
                "publication_date": getattr(item, "publication_date", None),
                "opening_date": getattr(item, "opening_date", None),
                "estado": getattr(item, "estado", None),
                "url_quality": getattr(item, "url_quality", None),
                "source_url": str(getattr(item, "source_url", "") or "")[:220],
                "canonical_url": str(getattr(item, "canonical_url", "") or "")[:220],
                "documents": len(getattr(item, "attached_files", None) or [])
                + len(getattr(item, "pliegos_bases", None) or []),
            }
        )
    return sample


async def _probe_urls(items: List[Any], *, sample_size: int, timeout_seconds: int) -> Dict[str, Any]:
    urls: List[str] = []
    for item in items:
        for attr in ("canonical_url", "source_url"):
            value = getattr(item, attr, None)
            if value and str(value).startswith(("http://", "https://")):
                urls.append(str(value))
                break
        if len(urls) >= sample_size:
            break

    results = []
    timeout = aiohttp.ClientTimeout(total=timeout_seconds)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        for url in urls:
            started = time.monotonic()
            try:
                async with session.get(url, allow_redirects=True) as response:
                    content = await response.content.read(2048)
                    results.append(
                        {
                            "url": url[:240],
                            "status": response.status,
                            "ok": 200 <= response.status < 400,
                            "content_type": response.headers.get("Content-Type"),
                            "bytes_sampled": len(content),
                            "elapsed_seconds": round(time.monotonic() - started, 2),
                        }
                    )
            except Exception as exc:
                results.append(
                    {
                        "url": url[:240],
                        "status": None,
                        "ok": False,
                        "error": f"{type(exc).__name__}: {exc}",
                        "elapsed_seconds": round(time.monotonic() - started, 2),
                    }
                )

    return {
        "sample_size": len(results),
        "ok": sum(1 for result in results if result.get("ok")),
        "failed": sum(1 for result in results if not result.get("ok")),
        "results": results,
    }


async def _recent_runs(db, name: str) -> Dict[str, Any]:
    runs = await db.scraper_runs.find(
        {"scraper_name": name},
        {
            "status": 1,
            "items_found": 1,
            "items_saved": 1,
            "items_updated": 1,
            "duration_seconds": 1,
            "started_at": 1,
            "ended_at": 1,
            "errors": 1,
            "warnings": 1,
            "metadata.source_quality": 1,
            "metadata.source_evidence": 1,
        },
    ).sort("started_at", -1).limit(12).to_list(length=12)
    statuses = Counter(run.get("status") for run in runs)
    last = runs[0] if runs else None
    return {
        "last": last,
        "status_counts_12": dict(statuses),
        "runs_12": len(runs),
        "items_found_12": [run.get("items_found") for run in runs],
        "duration_seconds_12": [run.get("duration_seconds") for run in runs],
    }


async def _audit_one(
    db,
    name: str,
    *,
    timeout_seconds: int,
    probe_urls: int,
    sample_items: int,
) -> Dict[str, Any]:
    config_doc = await db.scraper_configs.find_one({"name": name})
    if not config_doc:
        return {"name": name, "error": "config_not_found"}

    config_payload = {key: value for key, value in config_doc.items() if key != "_id"}
    config = ScraperConfig(**config_payload)
    scraper = create_scraper(config)
    if not scraper:
        return {"name": name, "error": "scraper_factory_returned_none"}

    history = await _recent_runs(db, name)
    contract = CONTRACTS_BY_NAME.get(name)
    started = time.monotonic()
    live: Dict[str, Any] = {
        "ok": False,
        "timeout_seconds": timeout_seconds,
        "started_at": datetime.now(timezone.utc).isoformat(),
    }

    try:
        runner = getattr(scraper, "run_with_evidence", scraper.run)
        raw_items = await asyncio.wait_for(runner(), timeout=timeout_seconds)
        source_id = contract.source_id if contract else name.lower().replace(" ", "_")
        items, scrape_results, evidence = normalize_scraper_output(raw_items, source_id=source_id)
        ids = [item.id_licitacion for item in items if item.id_licitacion]
        duplicates = len(ids) - len(set(ids))
        quality = summarize_items_quality(items)
        coverage = _field_coverage(items)
        live.update(
            {
                "ok": True,
                "duration_seconds": round(time.monotonic() - started, 2),
                "raw_count": len(raw_items or []),
                "items_count": len(items),
                "scrape_results_count": len(scrape_results),
                "duplicate_id_count": duplicates,
                "expected_min_items": contract.expected_min_items if contract else None,
                "meets_expected_min": bool(contract and len(items) >= contract.expected_min_items),
                "quality": quality,
                "coverage": coverage,
                "evidence": evidence,
                "estado_counts": dict(Counter(getattr(item, "estado", None) for item in items)),
                "url_quality_counts": dict(Counter(getattr(item, "url_quality", None) for item in items)),
                "sample_items": _sample_items(items, sample_items),
            }
        )
        if probe_urls:
            live["url_probe"] = await _probe_urls(
                items,
                sample_size=probe_urls,
                timeout_seconds=12,
            )
    except asyncio.TimeoutError:
        live.update(
            {
                "duration_seconds": round(time.monotonic() - started, 2),
                "error": "timeout",
            }
        )
    except Exception as exc:
        live.update(
            {
                "duration_seconds": round(time.monotonic() - started, 2),
                "error": f"{type(exc).__name__}: {exc}",
            }
        )

    selectors = dict(config_payload.get("selectors") or {})
    selectors_safe = {
        key: selectors.get(key)
        for key in sorted(selectors)
        if key
        in {
            "business_days_window",
            "disable_date_filter",
            "estado_filters",
            "expected_min_items",
            "fetch_details",
            "include_all",
            "include_types",
            "max_pages",
            "selenium_max_pages",
            "use_selenium_pliego",
            "years",
        }
    }
    return {
        "name": name,
        "class": type(scraper).__name__,
        "config": {
            "active": config_payload.get("active"),
            "schedule": config_payload.get("schedule"),
            "url": str(config_payload.get("url")),
            "max_items": config_payload.get("max_items"),
            "wait_time": config_payload.get("wait_time"),
            "selectors": selectors_safe,
        },
        "contract": contract.__dict__ if contract else None,
        "history": history,
        "live_run": live,
    }


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", action="append", choices=DEFAULT_TARGETS)
    parser.add_argument("--timeout", type=int, default=1800)
    parser.add_argument("--probe-urls", type=int, default=8)
    parser.add_argument("--sample-items", type=int, default=5)
    args = parser.parse_args()

    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "licitaciones_db")
    db = AsyncIOMotorClient(mongo_url)[db_name]
    targets = args.source or DEFAULT_TARGETS

    report: Dict[str, Any] = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "db_name": db_name,
        "targets": targets,
        "sources": [],
    }
    report["mendoza_core_before"] = await build_mendoza_core_summary(db)

    for name in targets:
        report["sources"].append(
            await _audit_one(
                db,
                name,
                timeout_seconds=args.timeout,
                probe_urls=args.probe_urls,
                sample_items=args.sample_items,
            )
        )

    report["mendoza_core_after"] = await build_mendoza_core_summary(db)
    print(json.dumps(report, ensure_ascii=False, indent=2, default=_json_default))


if __name__ == "__main__":
    asyncio.run(main())
