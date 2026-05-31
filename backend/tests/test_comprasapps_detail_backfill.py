import asyncio
import re
from datetime import datetime

from services.comprasapps_detail_backfill import (
    backfill_comprasapps_vigente_details,
    build_comprasapps_detail_updates,
)


def test_build_comprasapps_detail_updates_adds_budget_currency_and_pliegos():
    updates = build_comprasapps_detail_updates(
        {
            "budget": None,
            "currency": None,
            "pliegos_bases": [],
            "metadata": {},
        },
        {
            "budget_parsed": 123456.78,
            "currency": "ARS",
            "expedient_number": "123/2026",
            "description": "Adquisición de equipamiento informático.",
            "pliego_urls": [
                "https://www.mendoza.gov.ar/compras/files/Licita/pliego.zip",
                "https://www.mendoza.gov.ar/compras/files/Licita/anexo.pdf",
            ],
            "licapresup": "123456,78",
        },
    )

    assert updates["budget"] == 123456.78
    assert updates["currency"] == "ARS"
    assert updates["expedient_number"] == "123/2026"
    assert updates["description"] == "Adquisición de equipamiento informático."
    assert updates["objeto"] == "Adquisición de equipamiento informático"
    assert len(updates["pliegos_bases"]) == 2
    assert updates["pliegos_bases"][0]["tipo"] == "ZIP"
    assert updates["metadata.detail_popup"]["licapresup"] == "123456,78"


def test_build_comprasapps_detail_updates_does_not_overwrite_existing_budget():
    updates = build_comprasapps_detail_updates(
        {"budget": 10.0, "currency": "ARS", "metadata": {}},
        {"budget_parsed": 999.0, "currency": "ARS"},
    )

    assert "budget" not in updates
    assert "currency" not in updates


class _FakeCursor:
    def __init__(self, docs):
        self.docs = docs

    def limit(self, limit):
        self.docs = self.docs[:limit] if limit else self.docs
        return self

    async def to_list(self, length):
        return self.docs if length is None else self.docs[:length]


class _FakeBulkResult:
    def __init__(self, modified_count):
        self.modified_count = modified_count


class _FakeLicitaciones:
    def __init__(self):
        self.docs = [
            {
                "_id": "doc-1",
                "id_licitacion": "1/2026-508",
                "fuente": "ComprasApps Mendoza",
                "estado": "vigente",
                "canonical_url": "https://comprasapps.mendoza.gov.ar/Compras/servlet/hli00048?2026,508,1,1",
                "metadata": {},
            }
        ]
        self.bulk_ops = []

    def find(self, query, projection):
        pattern = re.compile(query["canonical_url"]["$regex"])
        docs = [doc for doc in self.docs if pattern.search(doc["canonical_url"])]
        return _FakeCursor(docs)

    async def bulk_write(self, ops, ordered=False):
        self.bulk_ops.extend(ops)
        return _FakeBulkResult(len(ops))


class _FakeDB:
    def __init__(self):
        self.licitaciones = _FakeLicitaciones()


async def _fake_detail_fetcher(_url):
    return {
        "budget_parsed": 100.0,
        "currency": "ARS",
        "pliego_urls": ["https://www.mendoza.gov.ar/compras/files/Licita/pliego.pdf"],
    }


def test_backfill_comprasapps_vigente_details_dry_run_counts_without_writes():
    db = _FakeDB()

    result = asyncio.run(
        backfill_comprasapps_vigente_details(
            db,
            dry_run=True,
            detail_fetcher=_fake_detail_fetcher,
            now=datetime(2026, 5, 17),
        )
    )

    assert result["dry_run"] is True
    assert result["matched"] == 1
    assert result["eligible"] == 1
    assert result["modified"] == 0
    assert db.licitaciones.bulk_ops == []


def test_backfill_comprasapps_vigente_details_apply_writes_candidates():
    db = _FakeDB()

    result = asyncio.run(
        backfill_comprasapps_vigente_details(
            db,
            dry_run=False,
            detail_fetcher=_fake_detail_fetcher,
            now=datetime(2026, 5, 17),
        )
    )

    assert result["modified"] == 1
    assert len(db.licitaciones.bulk_ops) == 1
