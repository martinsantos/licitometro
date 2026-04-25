"""Test the shared zone_matcher service."""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

from services.zone_matcher import find_best_zone


def test_exact_match():
    """Phase 1: exact organization match returns the zone doc."""
    async def _test():
        mock_db = MagicMock()
        expected = {"company_id": "default", "zona": "Godoy Cruz", "tipo_proceso": "municipio"}
        mock_db.company_contexts.find_one = AsyncMock(return_value=expected)

        result = await find_best_zone(mock_db, "Godoy Cruz", None)
        assert result == expected
    asyncio.run(_test())


def test_containment_match():
    """Phase 2: containment match when no exact match."""
    async def _test():
        mock_db = MagicMock()
        docs = [
            {"company_id": "default", "zona": "Capital", "tipo_proceso": "municipio"},
        ]
        # Phase 1: no exact match → None
        mock_db.company_contexts.find_one = AsyncMock(return_value=None)
        # Phase 2: load all contexts
        cursor = MagicMock()
        cursor.to_list = AsyncMock(return_value=docs)
        mock_db.company_contexts.find.return_value = cursor

        result = await find_best_zone(mock_db, "Municipio de Capital", None)
        assert result is not None
        assert result.get("zona") == "Capital"
    asyncio.run(_test())


def test_general_fallback():
    """Phase 3: no containment match falls back to 'General'."""
    async def _test():
        mock_db = MagicMock()
        docs = [{"company_id": "default", "zona": "Mendoza", "tipo_proceso": "provincia"}]
        general = {"company_id": "default", "zona": "General", "tipo_proceso": ""}
        # Phase 1: miss → None, Phase 3: General
        mock_db.company_contexts.find_one = AsyncMock(side_effect=[None, general])
        # Phase 2: no containment match
        cursor = MagicMock()
        cursor.to_list = AsyncMock(return_value=docs)
        mock_db.company_contexts.find.return_value = cursor

        result = await find_best_zone(mock_db, "Unknown", None)
        assert result == general
    asyncio.run(_test())


def test_empty_db_returns_general():
    """Empty DB still tries General fallback, returns None if missing."""
    async def _test():
        mock_db = MagicMock()
        mock_db.company_contexts.find_one = AsyncMock(side_effect=[None, None, None])
        cursor = MagicMock()
        cursor.to_list = AsyncMock(return_value=[])
        mock_db.company_contexts.find.return_value = cursor

        result = await find_best_zone(mock_db, "Anything", None)
        assert result is None
    asyncio.run(_test())


def test_none_organization():
    """None organization returns None without querying."""
    async def _test():
        mock_db = MagicMock()
        result = await find_best_zone(mock_db, None, None)
        assert result is None
        mock_db.company_contexts.find_one.assert_not_called()
    asyncio.run(_test())
