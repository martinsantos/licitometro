"""
ComprasApps Mendoza adjudicaciones extractor.

Iterates over `licitaciones` in fuente="ComprasApps Mendoza" with
status awarded (metadata.comprasapps_estado == "Adjudicada"), fetches
the public hli00048 detail page, and parses adjudicatario data.

Inserts/updates documents in the `adjudicaciones` collection (idempotent
via dedup_key on adjudicacion_service.upsert).
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import re
from typing import Any, Dict, List, Optional

import aiohttp
from bs4 import BeautifulSoup
from motor.motor_asyncio import AsyncIOMotorDatabase

from services.adjudicacion_service import get_adjudicacion_service
from services.boletin_adjudicacion_extractor import (
    extract_adjudicaciones,
    _parse_monto,
)
from utils.time import utc_now

logger = logging.getLogger("comprasapps_adj")

USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
FETCH_TIMEOUT_S = 15
MAX_CONCURRENT = 5

# Patterns specific to GeneXus hli00048 detail format
_RE_ADJ = re.compile(
    r"Adjudic(?:atari|ad)[oa][:\s]+([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑñ0-9\s\.\,&\-']{3,120})",
    re.IGNORECASE,
)
_RE_RAZON = re.compile(
    r"Raz[oó]n\s+social[:\s]+([A-Za-zÁÉÍÓÚÑñ0-9\s\.\,&\-']{3,120})",
    re.IGNORECASE,
)
_RE_CUIT = re.compile(r"C\.?U\.?I\.?T\.?[\s\-:°Nn°º]*(\d{2}[\-\.\s]?\d{8}[\-\.\s]?\d)", re.IGNORECASE)
_RE_MONTO = re.compile(r"Monto\s+(?:total\s+)?adjudicado[:\s]+\$?\s*([\d][\d\.,]+)", re.IGNORECASE)
_RE_FECHA = re.compile(r"Fecha\s+(?:de\s+)?adjudicaci[oó]n[:\s]+(\d{1,2}/\d{1,2}/\d{2,4})", re.IGNORECASE)


async def _fetch(session: aiohttp.ClientSession, url: str) -> Optional[str]:
    try:
        async with session.get(
            url,
            timeout=aiohttp.ClientTimeout(total=FETCH_TIMEOUT_S),
            ssl=False,
            headers={"User-Agent": USER_AGENT},
        ) as resp:
            if resp.status != 200:
                return None
            raw = await resp.read()
            try:
                return raw.decode("utf-8")
            except UnicodeDecodeError:
                return raw.decode("latin-1", errors="ignore")
    except Exception as e:
        logger.debug(f"fetch failed {url}: {e}")
        return None


def _parse_detail_for_award(html: str) -> List[Dict[str, Any]]:
    """Parse hli00048 detail HTML; return list of award dicts (may be empty)."""
    if not html:
        return []
    soup = BeautifulSoup(html, "html.parser")
    text = soup.get_text(" ", strip=True)
    if not text:
        return []

    awards: List[Dict[str, Any]] = []

    # Strategy 1: GeneXus-specific labeled fields
    cuit_match = _RE_CUIT.search(text)
    monto_match = _RE_MONTO.search(text)
    fecha_match = _RE_FECHA.search(text)
    name_match = _RE_RAZON.search(text) or _RE_ADJ.search(text)

    if name_match:
        name = name_match.group(1).strip()
        # Truncate at next field-like marker
        name = re.split(r"\s+(?:CUIT|C\.U\.I\.T|Monto|Fecha|Domicilio)", name)[0].strip(" .,;:")
        if len(name) >= 4:
            monto = _parse_monto(monto_match.group(1)) if monto_match else None
            from utils.dates import parse_date_guess
            fecha = parse_date_guess(fecha_match.group(1)) if fecha_match else None
            cuit = re.sub(r"[\-\.\s]", "", cuit_match.group(1)) if cuit_match else None
            awards.append({
                "adjudicatario": name,
                "monto_adjudicado": monto,
                "fecha_adjudicacion": fecha,
                "supplier_id": cuit,
                "extraction_confidence": 1.0 if (monto and fecha) else (0.8 if monto else 0.6),
            })

    # Strategy 2: fall back to free-text extractor (broader patterns)
    if not awards:
        for ext in extract_adjudicaciones(text):
            awards.append(ext.to_dict())

    return awards


def _build_dedup_key(licitacion_number: str, name: str, monto: Optional[float]) -> str:
    parts = [
        "comprasapps",
        (licitacion_number or "").lower().strip()[:60],
        (name or "").lower().strip()[:80],
        f"{monto:.2f}" if monto else "nomonto",
    ]
    return "comprasapps:hash:" + hashlib.md5("|".join(parts).encode("utf-8")).hexdigest()[:16]


async def extract_for_licitacion(
    db: AsyncIOMotorDatabase,
    session: aiohttp.ClientSession,
    lic: Dict[str, Any],
) -> int:
    """Fetch + parse + upsert. Returns count of awards inserted/updated."""
    detail_url = (
        (lic.get("metadata") or {}).get("comprasapps_detail_url")
        or lic.get("canonical_url")
    )
    if not detail_url or "hli00048" not in detail_url:
        return 0

    html = await _fetch(session, detail_url)
    awards = _parse_detail_for_award(html or "")
    if not awards:
        return 0

    svc = get_adjudicacion_service(db)
    n = 0
    for award in awards:
        doc = {
            "adjudicatario": award["adjudicatario"],
            "supplier_id": award.get("supplier_id"),
            "monto_adjudicado": award.get("monto_adjudicado"),
            "currency": "ARS",
            "fecha_adjudicacion": award.get("fecha_adjudicacion"),
            "estado_adjudicacion": "active",
            "objeto": lic.get("objeto"),
            "organization": lic.get("organization"),
            "category": lic.get("category"),
            "tipo_procedimiento": lic.get("tipo_procedimiento"),
            "budget_original": lic.get("budget"),
            "licitacion_id": str(lic["_id"]),
            "licitacion_number": lic.get("licitacion_number"),
            "expedient_number": lic.get("expedient_number"),
            "proceso_id": lic.get("proceso_id"),
            "fuente": "comprasapps_mendoza",
            "extraction_confidence": award.get("extraction_confidence", 0.6),
            "dedup_key": _build_dedup_key(
                lic.get("licitacion_number", ""),
                award["adjudicatario"],
                award.get("monto_adjudicado"),
            ),
            "metadata": {
                "source_url": detail_url,
                "comprasapps_numero": (lic.get("metadata") or {}).get("comprasapps_numero"),
            },
        }
        try:
            await svc.upsert(doc)
            n += 1
        except Exception as e:
            logger.warning(f"upsert award failed: {e}")
    return n


async def run(db: AsyncIOMotorDatabase, max_items: int = 200) -> Dict[str, Any]:
    """Process recently awarded ComprasApps items."""
    cursor = db.licitaciones.find(
        {
            "fuente": "ComprasApps Mendoza",
            "metadata.comprasapps_estado": {"$regex": "Adjudic", "$options": "i"},
            "metadata.comprasapps_detail_url": {"$exists": True},
            "metadata.adj_extracted_at": {"$exists": False},
        },
        {
            "_id": 1, "canonical_url": 1, "metadata": 1, "objeto": 1,
            "organization": 1, "category": 1, "tipo_procedimiento": 1,
            "budget": 1, "licitacion_number": 1, "expedient_number": 1,
            "proceso_id": 1,
        },
    ).limit(max_items)

    items: List[Dict[str, Any]] = await cursor.to_list(length=max_items)
    summary = {"scanned": len(items), "awards_inserted": 0, "items_with_award": 0}
    if not items:
        return summary

    sem = asyncio.Semaphore(MAX_CONCURRENT)
    connector = aiohttp.TCPConnector(ssl=False, limit=MAX_CONCURRENT)
    async with aiohttp.ClientSession(connector=connector) as session:
        async def worker(lic):
            async with sem:
                n = await extract_for_licitacion(db, session, lic)
                if n:
                    summary["awards_inserted"] += n
                    summary["items_with_award"] += 1
                # Always mark as visited so we don't re-process
                await db.licitaciones.update_one(
                    {"_id": lic["_id"]},
                    {"$set": {"metadata.adj_extracted_at": utc_now()}},
                )
        await asyncio.gather(*[worker(it) for it in items])

    logger.info(f"comprasapps_adj run: {summary}")
    return summary
