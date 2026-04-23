"""
Link Health Service — daily probe of COMPR.AR canonical URLs to detect
session-expired qs= tokens, mark them dead, and (best-effort) re-resolve
to a fresh stable URL by re-running the scraper's pliego search.

Runs as APScheduler cron at 5am daily.
"""
import asyncio
import logging
import re
from datetime import timedelta
from typing import Any, Dict, List, Optional

import aiohttp
from motor.motor_asyncio import AsyncIOMotorDatabase
from utils.time import utc_now

logger = logging.getLogger("link_health")

COMPRAR_HOSTS = ("comprar.gob.ar", "comprar.mendoza.gov.ar", "buenosairescompras.gob.ar")
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 LicitometroLinkHealth"

PROBE_BATCH = 20
PROBE_TIMEOUT_S = 10
RECHECK_INTERVAL_DAYS = 1  # only probe if last probe > N days ago


def _is_comprar_url(url: str) -> bool:
    if not url:
        return False
    return any(h in url for h in COMPRAR_HOSTS) and "VistaPreviaPliegoCiudadano.aspx" in url


async def _probe_one(session: aiohttp.ClientSession, url: str) -> Dict[str, Any]:
    """Returns {alive: bool, status: int, reason: str}."""
    try:
        async with session.get(
            url,
            timeout=aiohttp.ClientTimeout(total=PROBE_TIMEOUT_S),
            allow_redirects=False,
            ssl=False,
            headers={"User-Agent": USER_AGENT},
        ) as resp:
            status = resp.status
            # Dead signs: 4xx/5xx; 302→home page (session expired); empty body
            if status >= 400:
                return {"alive": False, "status": status, "reason": f"HTTP {status}"}
            if status in (301, 302, 303, 307, 308):
                loc = resp.headers.get("Location", "")
                if "VistaPreviaPliegoCiudadano" not in loc and "PLIEGO" not in loc:
                    return {"alive": False, "status": status, "reason": f"redirect to {loc[:60]}"}
            # Read up to 4KB of body to detect "session expired" / error page
            try:
                snippet = (await resp.content.read(4096)).decode("utf-8", errors="ignore")
            except Exception:
                snippet = ""
            if "sesi" in snippet.lower() and "expir" in snippet.lower():
                return {"alive": False, "status": status, "reason": "session expired marker"}
            if "iniciar sesi" in snippet.lower() or "login" in snippet.lower()[:300]:
                return {"alive": False, "status": status, "reason": "login page"}
            # COMPR.AR ASP.NET sends 200 with a form pointing to PantallaError when qs= is dead
            if "PantallaError" in snippet:
                return {"alive": False, "status": status, "reason": "PantallaError (qs expired)"}
            return {"alive": True, "status": status, "reason": "ok"}
    except asyncio.TimeoutError:
        return {"alive": False, "status": 0, "reason": "timeout"}
    except Exception as e:
        return {"alive": False, "status": 0, "reason": f"error: {type(e).__name__}"}


async def _try_reresolve(numero_proceso: str, host_hint: str) -> Optional[str]:
    """Best-effort re-resolution: ask the scraper's pliego URL cache to look up
    a fresh qs= token for this numero. Currently uses the existing
    PliegoURLCache mechanism via the comprar router; falls back to None.
    """
    try:
        from scrapers.mendoza_compra_v2 import PliegoURLCache
        cache = PliegoURLCache()
        # cache lookup is keyed by numero — if a recent scrape resolved it, use that
        cached = cache.get(numero_proceso)
        if cached:
            return cached
    except Exception as e:
        logger.debug(f"re-resolve failed for {numero_proceso}: {e}")
    return None


async def check_comprar_links(db: AsyncIOMotorDatabase, max_items: int = 500) -> Dict[str, Any]:
    """Probe COMPR.AR canonical URLs that haven't been checked recently.

    For each dead link: set metadata.link_dead_at = now, attempt re-resolution.
    For each alive link: clear metadata.link_dead_at, set metadata.link_checked_at.
    """
    cutoff = utc_now() - timedelta(days=RECHECK_INTERVAL_DAYS)
    query = {
        "canonical_url": {"$regex": r"VistaPreviaPliegoCiudadano\.aspx"},
        "$or": [
            {"metadata.link_checked_at": {"$lt": cutoff}},
            {"metadata.link_checked_at": {"$exists": False}},
        ],
        # skip clearly archived items — no point burning HTTP on them
        "workflow_state": {"$ne": "archivada"},
    }

    cursor = db.licitaciones.find(
        query,
        {"_id": 1, "canonical_url": 1, "licitacion_number": 1, "metadata": 1, "fuente": 1},
    ).limit(max_items)

    items: List[Dict[str, Any]] = await cursor.to_list(length=max_items)
    summary = {"probed": len(items), "alive": 0, "dead": 0, "rerolved": 0}

    if not items:
        return summary

    connector = aiohttp.TCPConnector(ssl=False, limit=PROBE_BATCH)
    async with aiohttp.ClientSession(connector=connector) as session:
        # Probe in batches
        for i in range(0, len(items), PROBE_BATCH):
            batch = items[i:i + PROBE_BATCH]
            results = await asyncio.gather(
                *[_probe_one(session, str(it["canonical_url"])) for it in batch],
                return_exceptions=False,
            )
            for it, res in zip(batch, results):
                now = utc_now()
                if res["alive"]:
                    summary["alive"] += 1
                    await db.licitaciones.update_one(
                        {"_id": it["_id"]},
                        {
                            "$set": {"metadata.link_checked_at": now},
                            "$unset": {"metadata.link_dead_at": "", "metadata.link_dead_reason": ""},
                        },
                    )
                else:
                    summary["dead"] += 1
                    # Try re-resolve first; if successful, treat as alive again
                    new_url = None
                    numero = it.get("licitacion_number") or ""
                    if numero:
                        host_hint = "mendoza" if "mendoza" in str(it.get("canonical_url", "")) else "nacional"
                        candidate = await _try_reresolve(numero, host_hint)
                        if candidate and "VistaPreviaPliegoCiudadano" in candidate:
                            new_url = candidate
                            summary["rerolved"] += 1

                    if new_url:
                        await db.licitaciones.update_one(
                            {"_id": it["_id"]},
                            {
                                "$set": {
                                    "metadata.link_checked_at": now,
                                    "canonical_url": new_url,
                                    "source_urls.comprar_pliego": new_url,
                                },
                                "$unset": {
                                    "metadata.link_dead_at": "",
                                    "metadata.link_dead_reason": "",
                                },
                            },
                        )
                    else:
                        await db.licitaciones.update_one(
                            {"_id": it["_id"]},
                            {
                                "$set": {
                                    "metadata.link_checked_at": now,
                                    "metadata.link_dead_at": now,
                                    "metadata.link_dead_reason": res["reason"][:100],
                                },
                            },
                        )

    logger.info(f"link_health: {summary}")
    return summary
