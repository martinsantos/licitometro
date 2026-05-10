"""Tests for AI extraction 0.2 batch service."""

import asyncio
from datetime import timedelta
from unittest.mock import patch

from services.ai_extraction_cron_service import AIExtractionCronService
from utils.time import utc_now


def test_batch_query_targets_mendoza_without_requisitos():
    svc = AIExtractionCronService(db=None)

    query = svc.build_query(jurisdiction="Mendoza")

    assert query["jurisdiccion"] == {"$regex": "^Mendoza$", "$options": "i"}
    assert query["requisitos"] == {"$exists": False}
    assert {"metadata.comprar_pliego_text": {"$exists": True}} in query["$or"]


def test_batch_query_accepts_object_and_legacy_ids():
    svc = AIExtractionCronService(db=None)

    query = svc.build_query(
        licitacion_ids=[
            "64f000000000000000000001",
            "MZA-2026-1",
        ]
    )

    assert "$or" in query
    assert any("_id" in clause for clause in query["$or"])
    assert {"id_licitacion": {"$in": ["MZA-2026-1"]}} in query["$or"]


def test_source_backfill_query_targets_source_and_skips_ai_v2():
    svc = AIExtractionCronService(db=None)

    query = svc.build_source_backfill_query("Boletin Oficial Mendoza (PDF)")

    assert query["fuente"] == {
        "$regex": "^Boletin\\ Oficial\\ Mendoza\\ \\(PDF\\)",
        "$options": "i",
    }
    assert query["jurisdiccion"] == {"$regex": "^Mendoza$", "$options": "i"}
    assert query["requisitos.source"] == {"$ne": "ai_extraction_v2"}
    assert {"metadata.pliego_text": {"$exists": True}} in query["$or"]


def test_source_backfill_query_allows_force_refresh():
    svc = AIExtractionCronService(db=None)

    query = svc.build_source_backfill_query("COMPR.AR Mendoza", force_refresh=True)

    assert "requisitos.source" not in query


def test_source_backfill_candidate_score_prioritizes_gap_urgency_and_budget():
    svc = AIExtractionCronService(db=None)

    high = svc.score_source_backfill_candidate(
        {
            "fecha_apertura": utc_now() + timedelta(days=3),
            "budget": 120_000_000,
        },
        ai_coverage=0.2,
        min_ai_coverage=0.9,
        snapshot_coverage=0.1,
        has_readiness_snapshot=False,
    )
    low = svc.score_source_backfill_candidate(
        {
            "fecha_apertura": utc_now() + timedelta(days=90),
            "budget": 1_000_000,
        },
        ai_coverage=0.8,
        min_ai_coverage=0.9,
        snapshot_coverage=0.9,
        has_readiness_snapshot=True,
    )

    assert high > low


def test_batch_failure_diagnostics_classify_errors():
    svc = AIExtractionCronService(db=None)

    summary = svc.summarize_batch_failures({
        "items": [
            {"id": "1", "ok": False, "error": "429 rate limit exceeded"},
            {"id": "2", "ok": False, "error": "pliego sin contenido"},
            {"id": "3", "ok": False, "error": "JSON schema validation failed"},
            {"id": "4", "ok": True},
        ]
    })

    assert summary["failed_count"] == 3
    assert summary["categories"]["rate_limit"] == 1
    assert summary["categories"]["input_quality"] == 1
    assert summary["categories"]["schema"] == 1


class _FakeCursor:
    def __init__(self, docs):
        self.docs = docs

    def sort(self, *_args, **_kwargs):
        return self

    def limit(self, _limit):
        return self

    async def to_list(self, length):
        return self.docs[:length]


class _FakeLicitaciones:
    def __init__(self, docs):
        self.docs = docs

    def find(self, *_args, **_kwargs):
        return _FakeCursor(self.docs)


class _FakeBatchRuns:
    def __init__(self):
        self.inserted = []

    async def insert_one(self, doc):
        self.inserted.append(doc)


class _FakeDB:
    def __init__(self, docs):
        self.licitaciones = _FakeLicitaciones(docs)
        self.ai_extraction_batch_runs = _FakeBatchRuns()


class _FakeCollection:
    def __init__(self, docs):
        self.docs = docs
        self.find_calls = []
        self.inserted = []
        self.updated = None

    def find(self, *args, **kwargs):
        self.find_calls.append((args, kwargs))
        return _FakeCursor(self.docs)

    async def insert_one(self, doc):
        self.inserted.append(doc)

        class Result:
            inserted_id = "fake-run-id"

        return Result()

    async def update_one(self, filters, update, upsert=False):
        self.updated = {"filters": filters, "update": update, "upsert": upsert}


class _FakeBackfillDB:
    def __init__(self, configs, licitaciones):
        self.scraper_configs = _FakeCollection(configs)
        self.licitaciones = _FakeCollection(licitaciones)
        self.source_backfill_runs = _FakeCollection([])
        self.input_quality_repair_actions = _FakeCollection([])
        self.input_quality_repair_reruns = _FakeCollection([])
        self.ai_extraction_batch_runs = _FakeBatchRuns()


def test_batch_records_empty_run_summary():
    db = _FakeDB([])
    svc = AIExtractionCronService(db)

    result = asyncio.run(svc.run_batch(jurisdiction="Mendoza", limit=5))

    assert result["processed"] == 0
    assert result["succeeded"] == 0
    assert result["failed"] == 0
    assert result["readiness"] == {"processed": 0, "snapshots": 0, "failed": 0}
    assert db.ai_extraction_batch_runs.inserted[0]["jurisdiction"] == "Mendoza"


def test_undercovered_sources_honor_disabled_source_setting():
    db = _FakeBackfillDB(
        configs=[{"name": "Boletin", "active": True, "ai_backfill": {"disabled": True}}],
        licitaciones=[{"_id": "1", "title": "Obra"}],
    )
    svc = AIExtractionCronService(db)

    async def fake_summary(_db, _name):
        return 10, ["1"], {"ai_coverage": 0.1, "snapshot_coverage": 0}

    with patch("services.source_readiness_metrics_service.build_source_readiness_summary", fake_summary):
        result = asyncio.run(svc.find_undercovered_sources(min_ai_coverage=0.85))

    assert result["sources"] == []
    assert db.licitaciones.find_calls == []


def test_undercovered_sources_use_per_source_threshold_and_limit():
    db = _FakeBackfillDB(
        configs=[{
            "name": "COMPR.AR Mendoza",
            "active": True,
            "ai_backfill": {"min_ai_coverage": 0.95, "limit_per_source": 1},
        }],
        licitaciones=[
            {"_id": "1", "title": "Obra 1"},
            {"_id": "2", "title": "Obra 2"},
        ],
    )
    svc = AIExtractionCronService(db)

    async def fake_summary(_db, _name):
        return 10, ["1", "2"], {"ai_coverage": 0.9, "snapshot_coverage": 0.2}

    with patch("services.source_readiness_metrics_service.build_source_readiness_summary", fake_summary):
        result = asyncio.run(svc.find_undercovered_sources(min_ai_coverage=0.85, limit_per_source=5))

    assert result["sources"][0]["min_ai_coverage"] == 0.95
    assert result["sources"][0]["limit_per_source"] == 1
    assert result["sources"][0]["candidate_count"] == 1


def test_source_remediation_leaderboard_orders_by_need():
    db = _FakeBackfillDB(
        configs=[
            {"name": "Alta brecha", "active": True},
            {"name": "Baja brecha", "active": True},
        ],
        licitaciones=[{"_id": "1", "title": "Obra", "budget": 120_000_000}],
    )
    svc = AIExtractionCronService(db)

    async def fake_summary(_db, name):
        if name == "Alta brecha":
            return 10, ["1"], {"ai_coverage": 0.1, "snapshot_coverage": 0.1}
        return 10, ["2"], {"ai_coverage": 0.8, "snapshot_coverage": 0.8}

    with patch("services.source_readiness_metrics_service.build_source_readiness_summary", fake_summary):
        result = asyncio.run(svc.build_source_remediation_leaderboard(min_ai_coverage=0.85))

    assert result["items"][0]["source_name"] == "Alta brecha"
    assert result["items"][0]["remediation_score"] > result["items"][1]["remediation_score"]


def test_retry_recent_backfill_failures_filters_input_quality():
    db = _FakeBackfillDB(configs=[], licitaciones=[])
    db.source_backfill_runs = _FakeCollection([
        {
            "source_name": "COMPR.AR",
            "failure_diagnostics": {
                "items": [
                    {"id": "64f000000000000000000001", "category": "rate_limit"},
                    {"id": "64f000000000000000000002", "category": "input_quality"},
                ],
            },
        }
    ])
    svc = AIExtractionCronService(db)

    async def fake_run_batch(**kwargs):
        return {
            "ok": True,
            "processed": 1,
            "succeeded": 1,
            "failed": 0,
            "items": [{"id": kwargs["licitacion_ids"][0], "ok": True}],
            "readiness": {"processed": 1, "snapshots": 0, "failed": 0},
        }

    with patch.object(svc, "run_batch", fake_run_batch):
        result = asyncio.run(svc.retry_recent_backfill_failures(limit=10))

    assert result["processed"] == 1
    assert [item["id"] for item in result["selected_items"]] == ["64f000000000000000000001"]


def test_retry_recent_backfill_failures_skips_recent_retries():
    retry_id = "64f000000000000000000001"
    db = _FakeBackfillDB(configs=[], licitaciones=[])
    db.source_backfill_runs = _FakeCollection([
        {
            "retry": True,
            "created_at": utc_now(),
            "selected_ids": [retry_id],
        },
        {
            "source_name": "COMPR.AR",
            "failure_diagnostics": {
                "items": [
                    {"id": retry_id, "category": "rate_limit"},
                ],
            },
        },
    ])
    svc = AIExtractionCronService(db)

    result = asyncio.run(svc.retry_recent_backfill_failures(limit=10, retry_window_hours=6))

    assert result["processed"] == 0
    assert result["selected_items"] == []
    assert result["skipped_recent_retry_count"] == 1


def test_input_quality_repair_queue_deduplicates_items():
    item_id = "64f000000000000000000001"
    db = _FakeBackfillDB(configs=[], licitaciones=[])
    db.source_backfill_runs = _FakeCollection([
        {
            "source_name": "COMPR.AR",
            "created_at": utc_now(),
            "failure_diagnostics": {
                "categories": {"input_quality": 1},
                "items": [
                    {
                        "id": item_id,
                        "id_licitacion": "MZA-1",
                        "title": "Obra",
                        "category": "input_quality",
                        "error": "pliego sin contenido",
                    }
                ],
            },
        },
        {
            "source_name": "COMPR.AR",
            "created_at": utc_now() - timedelta(hours=1),
            "failure_diagnostics": {
                "categories": {"input_quality": 1},
                "items": [
                    {
                        "id": item_id,
                        "category": "input_quality",
                        "error": "pliego sin contenido",
                    }
                ],
            },
        },
    ])
    db.input_quality_repair_reruns = _FakeCollection([
        {
            "licitacion_id": item_id,
            "status": "open",
            "created_at": utc_now(),
        }
    ])
    svc = AIExtractionCronService(db)

    result = asyncio.run(svc.build_input_quality_repair_queue())

    assert result["total"] == 1
    assert result["items"][0]["id"] == item_id
    assert result["items"][0]["occurrences"] == 2
    assert result["items"][0]["status"] == "open"
    assert result["items"][0]["rerun_count"] == 1
    assert result["items"][0]["last_rerun_status"] == "open"
    assert result["by_source"][0]["source_name"] == "COMPR.AR"
    assert result["by_source"][0]["open_items"] == 1
    assert "max_age_hours" in result["by_source"][0]


def test_update_input_quality_repair_action_persists_status():
    db = _FakeBackfillDB(configs=[], licitaciones=[])
    svc = AIExtractionCronService(db)

    result = asyncio.run(svc.update_input_quality_repair_action(
        "64f000000000000000000001",
        status="resolved",
        owner="ops",
        notes="pliego reparado",
    ))

    assert result["status"] == "resolved"
    assert db.input_quality_repair_actions.updated["upsert"] is True


def test_rerun_input_quality_repair_item_marks_resolved_on_success():
    db = _FakeBackfillDB(configs=[], licitaciones=[])
    svc = AIExtractionCronService(db)

    async def fake_run_batch(**_kwargs):
        return {"ok": True, "processed": 1, "succeeded": 1, "failed": 0, "items": []}

    with patch.object(svc, "run_batch", fake_run_batch):
        result = asyncio.run(svc.rerun_input_quality_repair_item("64f000000000000000000001"))

    assert result["ok"] is True
    assert result["status"] == "resolved"
    assert db.input_quality_repair_actions.updated["update"]["$set"]["status"] == "resolved"
    assert db.input_quality_repair_reruns.inserted[0]["status"] == "resolved"


def test_refresh_readiness_no_ids_is_empty_summary():
    svc = AIExtractionCronService(db=None)

    result = asyncio.run(svc.refresh_readiness_for_licitaciones([]))

    assert result == {"processed": 0, "snapshots": 0, "failed": 0}
