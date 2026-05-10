import asyncio

from services.source_readiness_metrics_service import build_source_readiness_summary


class _FakeCursor:
    def __init__(self, docs):
        self.docs = docs

    def limit(self, _limit):
        return self

    async def to_list(self, length):
        return self.docs[:length]


class _FakeLicitaciones:
    async def count_documents(self, filters):
        if filters.get("requisitos.source") == "ai_extraction_v2":
            return 1
        return 2

    def find(self, *_args, **_kwargs):
        return _FakeCursor([{"_id": "lic-1"}, {"_id": "lic-2"}])


class _FakeSnapshots:
    def aggregate(self, _pipeline):
        return _FakeCursor([{
            "snapshots": 2,
            "ready": 1,
            "blocked": 1,
            "missing_documents": 3,
            "red_flags": 2,
        }])


class _FakeDB:
    def __init__(self):
        self.licitaciones = _FakeLicitaciones()
        self.offer_readiness_snapshots = _FakeSnapshots()


def test_build_source_readiness_summary_counts_coverage():
    total, ids, summary = asyncio.run(build_source_readiness_summary(_FakeDB(), "Mendoza Compra"))

    assert total == 2
    assert ids == ["lic-1", "lic-2"]
    assert summary["ai_extracted"] == 1
    assert summary["ai_coverage"] == 0.5
    assert summary["snapshot_coverage"] == 1.0
    assert summary["ready"] == 1
    assert summary["blocked"] == 1
