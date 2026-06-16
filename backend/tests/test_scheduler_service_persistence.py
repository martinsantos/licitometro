from datetime import datetime
import sys
from pathlib import Path

import pytest
from bson import ObjectId

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from models.licitacion import LicitacionCreate
from services import scheduler_service as scheduler_module
from services.scheduler_service import SchedulerService


class _Cursor:
    def __init__(self, docs=None):
        self.docs = docs or []

    def sort(self, *_args, **_kwargs):
        return self

    def limit(self, *_args, **_kwargs):
        return self

    async def to_list(self, length=None):
        return self.docs if length is None else self.docs[:length]


class _InsertResult:
    inserted_id = ObjectId()


class _Collection:
    def __init__(self, docs=None):
        self.docs = docs or []
        self.updates = []
        self.update_many_calls = []
        self.bulk_ops = []

    async def find_one(self, *_args, **_kwargs):
        return self.docs[0] if self.docs else None

    def find(self, *_args, **_kwargs):
        return _Cursor([])

    async def insert_one(self, doc):
        self.docs.append(doc)
        return _InsertResult()

    async def update_one(self, filter_doc, update_doc, upsert=False):
        self.updates.append((filter_doc, update_doc, upsert))

    async def update_many(self, filter_doc, update_doc, *_args, **_kwargs):
        self.update_many_calls.append((filter_doc, update_doc))

        class Result:
            modified_count = 0
        return Result()

    async def bulk_write(self, ops, ordered=False):
        self.bulk_ops.extend(ops)


class _Db:
    def __init__(self, config):
        self.scraper_configs = _Collection([config])
        self.scraper_runs = _Collection()
        self.licitaciones = _Collection()


class _Health:
    async def is_circuit_open(self, _scraper_name):
        return False

    async def record_success(self, _scraper_name):
        pass

    async def record_failure(self, _scraper_name):
        pass


class _Scraper:
    def __init__(self, items):
        self.items = items

    async def run(self):
        return self.items


def _config(name="Test Source", selectors=None):
    return {
        "name": name,
        "url": "https://example.com",
        "active": True,
        "schedule": "0 8 * * *",
        "selectors": selectors or {},
        "source_type": "website",
        "scope": "ar_nacional",
    }


def _item():
    return LicitacionCreate(
        id_licitacion="test-001",
        title="Compra de insumos",
        organization="Organismo",
        fuente="Test Source",
        jurisdiccion="Nacional",
        tipo_procedimiento="Licitacion Publica",
        source_url="https://example.com/test-001",
        publication_date=datetime(2026, 5, 18),
        opening_date=datetime(2026, 5, 20),
    )


def _final_run_update(db):
    run_updates = [
        update["$set"]
        for _filter, update, _upsert in db.scraper_runs.updates
        if "$set" in update and "items_found" in update["$set"]
    ]
    assert run_updates
    return run_updates[-1]


@pytest.mark.asyncio
async def test_execute_scraper_inserts_new_items(monkeypatch):
    db = _Db(_config())
    service = SchedulerService(db)

    monkeypatch.setattr(scheduler_module, "create_scraper", lambda _config: _Scraper([_item()]))
    monkeypatch.setattr(
        "services.scraper_health_monitor.get_scraper_health_monitor",
        lambda _db: _Health(),
    )

    await service._execute_scraper_with_tracking("Test Source", str(ObjectId()))

    assert len(db.licitaciones.bulk_ops) == 1
    final_update = _final_run_update(db)
    assert final_update["status"] == "success"
    assert final_update["items_found"] == 1
    assert final_update["items_saved"] == 1


@pytest.mark.asyncio
async def test_execute_scraper_empty_items_does_not_reference_batch_hashes(monkeypatch):
    db = _Db(_config())
    service = SchedulerService(db)

    monkeypatch.setattr(scheduler_module, "create_scraper", lambda _config: _Scraper([]))
    monkeypatch.setattr(
        "services.scraper_health_monitor.get_scraper_health_monitor",
        lambda _db: _Health(),
    )

    await service._execute_scraper_with_tracking("Test Source", str(ObjectId()))

    final_update = _final_run_update(db)
    assert final_update["status"] == "success"
    assert final_update["items_found"] == 0
    assert final_update["items_saved"] == 0


@pytest.mark.asyncio
async def test_execute_core_scraper_below_contract_minimum_is_partial(monkeypatch):
    db = _Db(_config(name="Boletin Oficial Mendoza"))
    service = SchedulerService(db)

    monkeypatch.setattr(scheduler_module, "create_scraper", lambda _config: _Scraper([_item()]))
    monkeypatch.setattr(
        "services.scraper_health_monitor.get_scraper_health_monitor",
        lambda _db: _Health(),
    )

    await service._execute_scraper_with_tracking("Boletin Oficial Mendoza", str(ObjectId()))

    final_update = _final_run_update(db)
    assert final_update["status"] == "partial"
    assert final_update["items_found"] == 1
    assert "Below expected volume: found 1 items, expected at least 20" in final_update["warnings"]


@pytest.mark.asyncio
async def test_cleanup_orphaned_runs_handles_pending_without_started_at():
    db = _Db(_config())
    service = SchedulerService(db)

    await service._cleanup_orphaned_runs()

    filter_doc, update_doc = db.scraper_runs.update_many_calls[-1]
    orphan_branches = filter_doc["$or"]

    assert filter_doc["status"] == {"$in": ["running", "pending"]}
    assert {"started_at": {"$exists": False}, "created_at": {"$lt": orphan_branches[0]["started_at"]["$lt"]}} in orphan_branches
    assert any(
        branch.get("started_at") is None
        and branch.get("created_at") == {"$exists": False}
        and "_id" in branch
        for branch in orphan_branches
    )
    assert update_doc["$set"]["status"] == "failed"
    assert update_doc["$set"]["error_message"] == "Orphaned run - process restarted"
