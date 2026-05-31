from datetime import datetime

import pytest

from routers.mendoza_core import get_mendoza_core_summary


class _FakeRequest:
    class App:
        mongodb = object()

    app = App()


@pytest.mark.asyncio
async def test_mendoza_core_summary_route_returns_core_shape(monkeypatch):
    async def fake_summary(_db):
        return {
            "generated_at": datetime(2026, 5, 16).isoformat(),
            "totals": {"sources": 3, "up_perfect": 1, "up_degraded": 1, "at_risk": 0, "down": 1},
            "sources": [{"name": "COMPR.AR Mendoza"}],
            "repair_queue": [{"source_name": "ComprasApps Mendoza", "priority": 1}],
        }

    monkeypatch.setattr("routers.mendoza_core.build_mendoza_core_summary", fake_summary)

    result = await get_mendoza_core_summary(_FakeRequest())

    assert result["totals"]["sources"] == 3
    assert result["sources"][0]["name"] == "COMPR.AR Mendoza"
    assert result["repair_queue"][0]["priority"] == 1
