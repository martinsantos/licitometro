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


async def _try_reresolve(
    numero_proceso: str,
    host_hint: str,
    doc: Optional[Dict[str, Any]] = None,
    db=None,
) -> Optional[str]:
    """Best-effort re-resolution. Priority:
    1. PliegoURLCache (last scrape result for this numero)
    2. ComprasApps hli00048 URL from a cross-source merged doc
    """
    # 1. PliegoURLCache — fastest, uses last scraper run
    try:
        from scrapers.mendoza_compra_v2 import PliegoURLCache
        cache = PliegoURLCache()
        # Invalidate dead entry so next scrape re-fetches
        cache.invalidate(numero_proceso)
        cached = cache.get(numero_proceso)
        if cached and "VistaPreviaPliegoCiudadano" in cached:
            return cached
    except Exception as e:
        logger.debug(f"PliegoURLCache re-resolve failed for {numero_proceso}: {e}")

    # 2. ComprasApps fallback — if this doc was merged with ComprasApps,
    #    use the hli00048 detail URL as a stable permanent fallback
    if db is not None and doc is not None:
        try:
            fuentes = doc.get("fuentes") or []
            cross_merges = (doc.get("metadata") or {}).get("cross_source_merges") or []
            comprasapps_ids = [
                m["from_id"] for m in cross_merges
                if m.get("from_fuente") == "ComprasApps Mendoza" and m.get("from_id")
            ]
            if "ComprasApps Mendoza" in fuentes and comprasapps_ids:
                from bson import ObjectId
                for cid in comprasapps_ids[:2]:
                    ca_doc = await db.licitaciones.find_one(
                        {"_id": ObjectId(cid)},
                        {"metadata": 1, "canonical_url": 1},
                    )
                    if not ca_doc:
                        continue
                    ca_meta = ca_doc.get("metadata") or {}
                    hli_url = ca_meta.get("comprasapps_detail_url") or ""
                    if hli_url and "hli00048" in hli_url:
                        logger.info(f"Re-resolved {numero_proceso} → ComprasApps {hli_url}")
                        return hli_url
        except Exception as e:
            logger.debug(f"ComprasApps fallback re-resolve failed: {e}")

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
                        candidate = await _try_reresolve(numero, host_hint, doc=it, db=db)
                        if candidate:
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
                        # --- Try re-downloading pliego via authenticated session ---
                        try:
                            pliego_url = str(it.get("canonical_url", ""))
                            if pliego_url and "VistaPreviaPliegoCiudadano" in pliego_url:
                                from services.comprar_pliego_downloader import ComprarPliegoDownloader
                                from services.pliego_storage_service import store_pliego
                                downloader = ComprarPliegoDownloader(db)
                                pdf_bytes = await downloader.download_pliego_pdf(pliego_url)
                                if pdf_bytes:
                                    local = await store_pliego(
                                        db=db,
                                        licitacion_id=it["_id"],
                                        pdf_bytes=pdf_bytes,
                                        fuente=it.get("fuente", "COMPR.AR"),
                                        numero=it.get("licitacion_number") or "",
                                        source_url=pliego_url,
                                    )
                                    if local:
                                        summary["rerolved"] += 1
                                        await db.licitaciones.update_one(
                                            {"_id": it["_id"]},
                                            {
                                                "$set": {"metadata.link_checked_at": now},
                                                "$unset": {"metadata.link_dead_at": "", "metadata.link_dead_reason": ""},
                                            },
                                        )
                                        logger.info(f"Pliego re-downloaded for {it['_id']}: {local}")
                                        continue
                        except Exception as e:
                            logger.debug(f"Pliego auth re-download failed for {it['_id']}: {e}")

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
