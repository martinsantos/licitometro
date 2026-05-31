import asyncio
import re
from datetime import datetime

from services.mendoza_core_evidence_backfill import (
    backfill_mendoza_core_evidence,
    build_historical_source_evidence,
)


def test_build_historical_source_evidence_dedupes_urls_and_counts_kinds():
    summary = build_historical_source_evidence(
        {
            "source_url": "https://example.com/proceso/1",
            "canonical_url": "https://example.com/proceso/1",
            "attached_files": [{"url": "https://example.com/pliego.pdf"}],
            "pliegos_bases": [{"url": "https://example.com/anexo.html"}],
        },
        source_id="comprar_mendoza",
    )

    assert summary["contract"] == "historical_evidence_backfill"
    assert summary["source_id"] == "comprar_mendoza"
    assert summary["evidence_count"] == 3
    assert summary["evidence_coverage"] == 1.0
    assert summary["evidence_kind_counts"] == {"html": 1, "pdf": 1, "text": 1}
    assert summary["evidence_urls"][0] == "https://example.com/proceso/1"


def test_build_historical_source_evidence_returns_none_without_urls():
    assert build_historical_source_evidence({"title": "Sin URL"}, source_id="x") is None


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
                "fuente": "COMPR.AR Mendoza",
                "source_url": "https://example.com/1",
                "metadata": {},
            },
            {
                "_id": "doc-2",
                "fuente": "COMPR.AR Mendoza",
                "source_url": "https://example.com/2",
                "metadata": {"source_evidence": {"contract": "native_scrape_result"}},
            },
        ]
        self.bulk_ops = []

    def find(self, query, projection):
        fuente_regex = query["fuente"]["$regex"]
        pattern = re.compile(fuente_regex, re.I)
        docs = [
            doc for doc in self.docs
            if pattern.match(doc["fuente"])
            and not ((doc.get("metadata") or {}).get("source_evidence"))
        ]
        return _FakeCursor(docs)

    async def bulk_write(self, ops, ordered=False):
        self.bulk_ops.extend(ops)
        return _FakeBulkResult(len(ops))


class _FakeDB:
    def __init__(self):
        self.licitaciones = _FakeLicitaciones()


def test_backfill_dry_run_counts_candidates_without_writes():
    db = _FakeDB()

    result = asyncio.run(backfill_mendoza_core_evidence(db, source_names=["COMPR.AR Mendoza"], dry_run=True))

    assert result["dry_run"] is True
    assert result["matched"] == 1
    assert result["modified"] == 0
    assert db.licitaciones.bulk_ops == []


def test_backfill_apply_updates_only_missing_evidence():
    db = _FakeDB()

    result = asyncio.run(
        backfill_mendoza_core_evidence(
            db,
            source_names=["COMPR.AR Mendoza"],
            dry_run=False,
            now=datetime(2026, 5, 16),
        )
    )

    assert result["dry_run"] is False
    assert result["matched"] == 1
    assert result["modified"] == 1
    assert len(db.licitaciones.bulk_ops) == 1
