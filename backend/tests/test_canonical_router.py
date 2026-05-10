"""Smoke tests for canonical router registration."""

import asyncio

import server
from routers import canonical


def test_canonical_router_prefix():
    assert canonical.router.prefix == "/api/canonical"


def test_canonical_routes_are_admin_only():
    assert "/api/canonical" in server.ADMIN_ONLY_PREFIXES


class _FakeCursor:
    def __init__(self, docs):
        self.docs = docs

    def sort(self, *_args):
        return self

    def limit(self, _limit):
        return self

    async def to_list(self, length):
        return self.docs[:length]


class _FakeLicitaciones:
    def __init__(self, docs):
        self.docs = docs
        self.last_filter = None

    def find(self, filters):
        self.last_filter = filters
        return _FakeCursor(self.docs)


class _FakeCanonicalCollection:
    def __init__(self, docs=None):
        self.docs = docs or []

    def find(self, _filters):
        return _FakeCursor(self.docs)

    async def find_one(self, _filters):
        return None

    async def update_one(self, *_args, **_kwargs):
        return None


class _FakeDB:
    def __init__(self, docs):
        self.licitaciones = _FakeLicitaciones(docs)
        self.tender_canonical_projections = _FakeCanonicalCollection(docs)


def test_rebuild_canonical_tenders_backfills_mendoza_docs():
    db = _FakeDB([
        {
            "_id": "abc",
            "id_licitacion": "MZA-1",
            "fuente": "Mendoza Compra",
            "jurisdiccion": "Mendoza",
            "title": "Compra de insumos",
            "organization": "Ministerio",
        }
    ])

    result = asyncio.run(canonical.rebuild_canonical_tenders(jurisdiction="Mendoza", fuente=None, limit=500, db=db))

    assert result["ok"] is True
    assert result["jurisdiction"] == "Mendoza"
    assert result["matched"] == 1
    assert result["upserted"] == 1
    assert db.licitaciones.last_filter == {
        "jurisdiccion": {"$regex": "^Mendoza$", "$options": "i"}
    }


def test_duplicate_diagnostics_returns_candidates():
    db = _FakeDB([
        {
            "canonical_id": "mza-1",
            "title": "Compra de insumos",
            "organization": "Ministerio",
            "jurisdiccion": "Mendoza",
            "opening_date": "2026-05-20",
            "source_records": [{"source_name": "Mendoza Compra"}],
        },
        {
            "canonical_id": "bol-77",
            "title": "Compra de insumos",
            "organization": "Ministerio",
            "jurisdiccion": "Mendoza",
            "opening_date": "2026-05-20",
            "source_records": [{"source_name": "Boletin Oficial Mendoza"}],
        },
    ])

    result = asyncio.run(canonical.get_duplicate_diagnostics(jurisdiction="Mendoza", limit=500, db=db))

    assert result["jurisdiction"] == "Mendoza"
    assert result["inspected"] == 2
    assert result["count"] == 1
    assert result["items"][0]["canonical_ids"] == ["mza-1", "bol-77"]
