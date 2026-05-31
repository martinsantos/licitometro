from datetime import datetime, timezone
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services.scraper_health_monitor import ScraperHealthMonitor


class _Cursor:
    def __init__(self, docs):
        self.docs = docs

    async def to_list(self, _length):
        return self.docs

    def sort(self, *_args, **_kwargs):
        return self


class _Collection:
    def __init__(self, docs):
        self.docs = docs

    def find(self, *_args, **_kwargs):
        return _Cursor(self.docs)


class _Db:
    def __init__(self, runs, configs):
        self.scraper_runs = _Collection(runs)
        self.scraper_configs = _Collection(configs)


@pytest.mark.asyncio
async def test_health_report_counts_partial_runs_as_failed_for_success_rate():
    db = _Db(
        runs=[
            {
                "scraper_name": "Boletin Oficial Mendoza",
                "status": "partial",
                "items_found": 30,
                "started_at": datetime.now(timezone.utc),
            },
            {
                "scraper_name": "Boletin Oficial Mendoza",
                "status": "success",
                "items_found": 69,
                "started_at": datetime.now(timezone.utc),
            },
        ],
        configs=[
            {
                "name": "Boletin Oficial Mendoza",
                "active": True,
                "circuit_failures": 0,
            }
        ],
    )

    report = await ScraperHealthMonitor(db).get_health_report(days=7)

    [source] = report["scrapers"]
    assert source["name"] == "Boletin Oficial Mendoza"
    assert source["runs"] == 2
    assert source["success_rate"] == 50.0


@pytest.mark.asyncio
async def test_round_report_lists_partial_runs_as_degraded():
    db = _Db(
        runs=[
            {
                "scraper_name": "Boletin Oficial Mendoza",
                "status": "partial",
                "items_found": 69,
                "items_saved": 0,
                "duration_seconds": 36,
                "started_at": datetime.now(timezone.utc),
            }
        ],
        configs=[],
    )

    message = await ScraperHealthMonitor(db)._build_report()

    assert message is not None
    assert "*DEGRADADOS:*" in message
    assert "Boletin Oficial Mendoza: partial" in message
