"""
Market data endpoints — exchange rates and inflation.

Proxies external APIs with in-memory caching to avoid
hammering third-party services on every request.
"""

import logging
from datetime import datetime, timedelta
from typing import Any, Optional

import aiohttp
from fastapi import APIRouter
from utils.time import utc_now

logger = logging.getLogger("licitometro.market")

router = APIRouter(
    prefix="/api/market",
    tags=["market"],
)

# ---------------------------------------------------------------------------
# In-memory cache: dict with "data" (the payload) and "ts" (datetime stamp)
# ---------------------------------------------------------------------------
_cache: dict[str, dict[str, Any]] = {}

RATES_TTL = timedelta(minutes=15)
INFLATION_TTL = timedelta(hours=1)


def _get_cached(key: str, ttl: timedelta) -> Optional[dict]:
    """Return cached data if it exists and hasn't expired."""
    entry = _cache.get(key)
    if entry and utc_now() - entry["ts"] < ttl:
        return entry["data"]
    return None


def _set_cached(key: str, data: dict) -> None:
    _cache[key] = {"data": data, "ts": utc_now()}


# ---------------------------------------------------------------------------
# GET /api/market/rates
# ---------------------------------------------------------------------------
@router.get("/rates")
async def get_exchange_rates():
    """Return USD/ARS and EUR/ARS official exchange rates.

    Source: https://dolarapi.com  (free, no key required).
    Cached for 15 minutes.
    """
    cached = _get_cached("rates", RATES_TTL)
    if cached:
        return cached

    usd_data: Optional[dict] = None
    eur_data: Optional[dict] = None

    try:
        async with aiohttp.ClientSession() as session:
            # Fetch USD official rate
            async with session.get(
                "https://dolarapi.com/v1/dolares/oficial",
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                if resp.status == 200:
                    usd_data = await resp.json()

            # Fetch EUR rate
            async with session.get(
                "https://dolarapi.com/v1/cotizaciones/eur",
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                if resp.status == 200:
                    eur_data = await resp.json()
    except Exception as exc:
        logger.warning("Failed to fetch exchange rates: %s", exc)

    # If both calls failed and we have stale cache, return it
    if usd_data is None and eur_data is None:
        stale = _cache.get("rates")
        if stale:
            return stale["data"]
        return {"error": "Exchange rate data temporarily unavailable"}

    result = {
        "usd": usd_data.get("venta") or usd_data.get("compra") if usd_data else None,
        "eur": eur_data.get("venta") or eur_data.get("compra") if eur_data else None,
        "updated_at": utc_now().isoformat() + "Z",
    }

    _set_cached("rates", result)
    return result


# ---------------------------------------------------------------------------
# GET /api/market/inflation
# ---------------------------------------------------------------------------
@router.get("/inflation")
async def get_inflation():
    """Return latest monthly inflation rate (IPC general, INDEC).

    Source: https://apis.datos.gob.ar  (free, no key required).
    Cached for 1 hour.
    """
    cached = _get_cached("inflation", INFLATION_TTL)
    if cached:
        return cached

    try:
        async with aiohttp.ClientSession() as session:
            url = (
                "https://apis.datos.gob.ar/series/api/series/"
                "?ids=148.3_INIVELGENERAL_DICI_M_26&limit=1"
            )
            async with session.get(
                url,
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                if resp.status != 200:
                    raise ValueError(f"API returned status {resp.status}")
                body = await resp.json()
    except Exception as exc:
        logger.warning("Failed to fetch inflation data: %s", exc)
        stale = _cache.get("inflation")
        if stale:
            return stale["data"]
        return {"error": "Inflation data temporarily unavailable"}

    # Parse datos.gob.ar response: {"data": [["2026-01-01", 3.7], ...]}
    data_rows = body.get("data", [])
    if not data_rows:
        return {"error": "No inflation data returned"}

    period, rate = data_rows[0]

    result = {
        "rate": rate,
        "period": period,
        "updated_at": utc_now().isoformat() + "Z",
    }

    _set_cached("inflation", result)
    return result
