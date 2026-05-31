from datetime import datetime, timedelta
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services.mendoza_core_service import build_core_source_status, build_mendoza_core_summary


def _run(status="success", items_found=100, started_at=None, quality=None, evidence=None):
    return {
        "status": status,
        "items_found": items_found,
        "items_saved": 0,
        "items_updated": 0,
        "duration_seconds": 12,
        "started_at": started_at or datetime.utcnow(),
        "metadata": {
            "source_quality": quality or {"score": 95},
            "source_evidence": evidence or {"evidence_coverage": 1.0},
        },
    }


def _coverage(**overrides):
    base = {
        "total": 100,
        "vigentes": 20,
        "new_7d": 4,
        "publication_date": 1.0,
        "opening_date": 1.0,
        "object_or_description": 1.0,
        "source_url": 1.0,
        "canonical_url": 1.0,
        "direct_url": 1.0,
        "documents": 1.0,
        "evidence": 1.0,
        "fecha_scraping": 1.0,
    }
    base.update(overrides)
    return base


def test_core_source_is_up_perfect_when_contract_is_met():
    source = build_core_source_status(
        contract_name="COMPR.AR Mendoza",
        config={"name": "COMPR.AR Mendoza", "active": True, "schedule": "0 * * * *"},
        recent_runs=[_run(items_found=62)],
        coverage=_coverage(total=955, documents=0.92, direct_url=0.94, canonical_url=0.94),
        now=datetime.utcnow(),
    )

    assert source["status"] == "up_perfect"
    assert source["blocking_issues"] == []
    assert source["expected_min_items"] == 50


def test_current_run_contract_separates_historical_backlog_from_ingestion_status():
    source = build_core_source_status(
        contract_name="COMPR.AR Mendoza",
        config={"name": "COMPR.AR Mendoza", "active": True, "schedule": "0 * * * *"},
        recent_runs=[_run(
            items_found=62,
            quality={
                "score": 84,
                "items_evaluated": 62,
                "document_coverage": 0.903,
                "direct_url_coverage": 0.903,
                "missing_core_counts": {},
                "missing_valuable_counts": {"canonical_url": 6, "objeto": 62},
            },
            evidence={"evidence_coverage": 1.0},
        )],
        coverage=_coverage(
            total=955,
            documents=0.634,
            direct_url=0.80,
            canonical_url=0.807,
            evidence=0.216,
        ),
        now=datetime.utcnow(),
    )

    assert source["status"] == "up_perfect"
    assert source["coverage"]["documents"] == 0.903
    assert source["historical_coverage"]["documents"] == 0.634
    assert "documents_below_contract" not in source["quality_issues"]
    assert source["backlog_issues"] == ["historical_evidence_backfill_needed"]


def test_empty_suspicious_marks_core_source_down():
    source = build_core_source_status(
        contract_name="ComprasApps Mendoza",
        config={"name": "ComprasApps Mendoza", "active": True, "schedule": "0 * * * *"},
        recent_runs=[_run(status="empty_suspicious", items_found=0)],
        coverage=_coverage(total=3766),
        now=datetime.utcnow(),
    )

    assert source["status"] == "down"
    assert "last_run_empty_suspicious" in source["blocking_issues"]


def test_partial_run_marks_core_source_at_risk_even_when_volume_is_ok():
    source = build_core_source_status(
        contract_name="COMPR.AR Mendoza",
        config={"name": "COMPR.AR Mendoza", "active": True, "schedule": "0 * * * *"},
        recent_runs=[_run(status="partial", items_found=62)],
        coverage=_coverage(total=955, documents=0.92, direct_url=0.94, canonical_url=0.94),
        now=datetime.utcnow(),
    )

    assert source["status"] == "at_risk"
    assert "last_run_partial" in source["blocking_issues"]


def test_volume_drop_marks_core_source_at_risk():
    source = build_core_source_status(
        contract_name="Boletin Oficial Mendoza",
        config={"name": "Boletin Oficial Mendoza", "active": True, "schedule": "0 * * * *"},
        recent_runs=[_run(items_found=12)],
        coverage=_coverage(total=816, documents=1.0, direct_url=0.0, canonical_url=0.0, opening_date=0.72),
        now=datetime.utcnow(),
    )

    assert source["status"] == "at_risk"
    assert "items_below_expected_min" in source["blocking_issues"]


def test_boletin_pdf_policy_does_not_require_direct_url():
    source = build_core_source_status(
        contract_name="Boletin Oficial Mendoza",
        config={"name": "Boletin Oficial Mendoza", "active": True, "schedule": "0 * * * *"},
        recent_runs=[_run(items_found=32)],
        coverage=_coverage(total=816, documents=1.0, direct_url=0.0, canonical_url=0.0, opening_date=0.72),
        now=datetime.utcnow(),
    )

    assert source["status"] == "up_perfect"
    assert "direct_url_below_contract" not in source["quality_issues"]


@pytest.mark.asyncio
async def test_summary_prioritizes_down_sources_in_repair_queue():
    now = datetime.utcnow()

    class FakeDB:
        pass

    async def fake_loader(_db, name):
        if name == "ComprasApps Mendoza":
            return (
                {"name": name, "active": True, "schedule": "0 * * * *"},
                [_run(status="failed", items_found=0, started_at=now)],
                _coverage(total=3766, documents=0.05, evidence=0.1),
            )
        if name == "COMPR.AR Mendoza":
            return (
                {"name": name, "active": True, "schedule": "0 * * * *"},
                [_run(items_found=62, started_at=now)],
                _coverage(total=955, documents=0.9, direct_url=0.95, canonical_url=0.95),
            )
        return (
            {"name": name, "active": True, "schedule": "0 * * * *"},
            [_run(items_found=32, started_at=now - timedelta(minutes=10))],
            _coverage(total=816, documents=1.0, direct_url=0.0, canonical_url=0.0, opening_date=0.72),
        )

    summary = await build_mendoza_core_summary(FakeDB(), now=now, loader=fake_loader)

    assert summary["totals"]["sources"] == 3
    assert summary["totals"]["down"] == 1
    assert summary["repair_queue"][0]["source_name"] == "ComprasApps Mendoza"
    assert summary["repair_queue"][0]["priority"] == 1
