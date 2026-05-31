import asyncio
import re
from datetime import datetime

from services.mendoza_core_quality_backfill import (
    backfill_mendoza_core_quality,
    build_boletin_direct_pdf_updates,
    build_comprar_objeto_updates,
)


def test_build_boletin_direct_pdf_updates_from_verpdf_source_url():
    updates = build_boletin_direct_pdf_updates(
        {
            "source_url": "https://boe.mendoza.gov.ar/default/public/publico/verpdf/32595",
            "attached_files": [{"url": "https://boe.mendoza.gov.ar/default/public/publico/verpdf/32595", "type": "pdf"}],
        }
    )

    assert updates["canonical_url"] == "https://boe.mendoza.gov.ar/default/public/publico/verpdf/32595"
    assert updates["url_quality"] == "direct_pdf"
    assert updates["source_urls.boletin_pdf"] == "https://boe.mendoza.gov.ar/default/public/publico/verpdf/32595"


def test_build_boletin_direct_pdf_updates_ignores_non_pdf_docs():
    assert build_boletin_direct_pdf_updates({"source_url": "https://example.com/norma/1"}) == {}


def test_build_comprar_objeto_updates_from_pliego_metadata():
    updates = build_comprar_objeto_updates(
        {
            "title": "Licitacion publica",
            "description": "Proceso de compra",
            "metadata": {
                "comprar_pliego_fields": {
                    "Objeto de la contratación": "adquisición de servidores para datacenter provincial"
                }
            },
        }
    )

    assert updates["objeto"] == "Adquisición de servidores para datacenter provincial"


def test_build_comprar_objeto_updates_skips_existing_objeto():
    assert build_comprar_objeto_updates({"objeto": "Ya existe"}) == {}


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
                "_id": "boe-1",
                "fuente": "Boletin Oficial Mendoza (PDF)",
                "source_url": "https://boe.mendoza.gov.ar/default/public/publico/verpdf/32595",
            },
            {
                "_id": "comprar-1",
                "fuente": "COMPR.AR Mendoza",
                "title": "Proceso de compra",
                "description": "Contratación del servicio de conectividad de datos.",
                "metadata": {},
            },
        ]
        self.bulk_ops = []

    def find(self, query, projection):
        pattern = re.compile(query["fuente"]["$regex"], re.I)
        return _FakeCursor([doc for doc in self.docs if pattern.match(doc["fuente"])])

    async def bulk_write(self, ops, ordered=False):
        self.bulk_ops.extend(ops)
        return _FakeBulkResult(len(ops))


class _FakeDB:
    def __init__(self):
        self.licitaciones = _FakeLicitaciones()


def test_backfill_mendoza_core_quality_dry_run_counts_without_writes():
    db = _FakeDB()

    result = asyncio.run(backfill_mendoza_core_quality(db, dry_run=True))

    assert result["dry_run"] is True
    assert result["eligible"] == 2
    assert result["modified"] == 0
    assert db.licitaciones.bulk_ops == []


def test_backfill_mendoza_core_quality_apply_writes_candidates():
    db = _FakeDB()

    result = asyncio.run(backfill_mendoza_core_quality(db, dry_run=False, now=datetime(2026, 5, 17)))

    assert result["dry_run"] is False
    assert result["eligible"] == 2
    assert result["modified"] == 2
    assert len(db.licitaciones.bulk_ops) == 2
