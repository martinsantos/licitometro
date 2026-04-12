"""Pliego Finder — Searches and downloads pliego PDFs for CotizAR offers.

Strategies (in priority order):
1. Check existing attached_files on the licitacion
2. Fetch the source_url page and extract document links
3. For COMPR.AR: parse pliego page for PDF download links
4. Cross-source search via HUNTER for related items with pliegos

Priority for pliego classification:
  - Pliego de Especificaciones Técnicas (PET)
  - Pliego de Especificaciones / Pliego Particular
  - Pliego General / Pliego de Condiciones
  - Anexos
  - Plantilla de Cotización
  - Otros adjuntos
"""

import logging
import os
import re
from typing import List, Optional, Tuple
from urllib.parse import urljoin

import aiohttp
from bs4 import BeautifulSoup

logger = logging.getLogger("pliego_finder")

# Priority keywords for pliego classification (lower = higher priority)
PLIEGO_PRIORITY = [
    (1, ["pliego de especificaciones tecnicas", "pliego especificaciones tecnicas", "pet", "especificaciones tecnicas"]),
    (2, ["pliego de especificaciones", "pliego particular", "pliego de condiciones particulares"]),
    (3, ["pliego general", "pliego de condiciones", "pliego de bases", "bases y condiciones"]),
    (4, ["anexo", "anexos"]),
    (5, ["plantilla de cotizacion", "formulario de cotizacion", "planilla de cotizacion", "formulario oferta"]),
    (6, ["pliego"]),  # Generic pliego mention
]


def classify_pliego(name: str) -> Tuple[int, str]:
    """Classify a file by pliego type. Returns (priority, label). Lower priority = more important."""
    name_lower = (name or "").lower()
    name_lower = re.sub(r'[áàä]', 'a', name_lower)
    name_lower = re.sub(r'[éèë]', 'e', name_lower)
    name_lower = re.sub(r'[íìï]', 'i', name_lower)
    name_lower = re.sub(r'[óòö]', 'o', name_lower)
    name_lower = re.sub(r'[úùü]', 'u', name_lower)

    for priority, keywords in PLIEGO_PRIORITY:
        for kw in keywords:
            if kw in name_lower:
                labels = {1: "Especificaciones Tecnicas", 2: "Pliego Particular",
                          3: "Pliego General", 4: "Anexo", 5: "Plantilla Cotizacion", 6: "Pliego"}
                return priority, labels.get(priority, "Documento")
    return 99, "Otro adjunto"


async def find_pliegos(db, licitacion_id: str, http_session=None) -> dict:
    """Find pliego documents for a licitacion.

    Returns:
        {
            "pliegos": [{"name", "url", "type", "priority", "label", "source"}],
            "text_extracted": str | None,  # Text from highest-priority PDF
            "strategy_used": str,
        }
    """
    from bson import ObjectId

    try:
        lic = await db.licitaciones.find_one({"_id": ObjectId(licitacion_id)})
    except Exception:
        return {"pliegos": [], "text_extracted": None, "strategy_used": "error"}

    if not lic:
        return {"pliegos": [], "text_extracted": None, "strategy_used": "not_found"}

    all_pliegos: List[dict] = []
    seen_urls: set = set()

    # Strategy 1: Check existing attached_files
    attached = lic.get("attached_files") or []
    for f in attached:
        url = f.get("url", "")
        if url and url not in seen_urls:
            seen_urls.add(url)
            priority, label = classify_pliego(f.get("name", ""))
            all_pliegos.append({
                "name": f.get("name", ""),
                "url": url,
                "type": f.get("type", "pdf"),
                "priority": priority,
                "label": label,
                "source": "attached_files",
            })

    # Strategy 1b: Check manually uploaded pliego documents in cotizacion
    try:
        cot = await db.cotizaciones.find_one({"licitacion_id": licitacion_id})
        if cot:
            for pdoc in (cot.get("pliego_documents") or []):
                url = pdoc.get("url", "")
                if url and url not in seen_urls:
                    seen_urls.add(url)
                    priority, label = classify_pliego(pdoc.get("name", ""))
                    all_pliegos.append({
                        "name": pdoc.get("name", ""),
                        "url": url,
                        "type": pdoc.get("type", "pdf"),
                        "priority": min(priority, 1),  # manual uploads get highest priority
                        "label": pdoc.get("label", label),
                        "source": "manual_upload",
                    })
    except Exception as e:
        logger.warning(f"Failed to check pliego_documents in cotizacion: {e}")

    # Strategy 2: Fetch source_url and extract document links
    source_url = str(lic.get("source_url", ""))
    if source_url and source_url.startswith("http"):
        try:
            own_session = http_session is None
            if own_session:
                http_session = aiohttp.ClientSession(
                    timeout=aiohttp.ClientTimeout(total=20),
                    connector=aiohttp.TCPConnector(ssl=False),
                )
            try:
                async with http_session.get(source_url) as resp:
                    if resp.status == 200:
                        raw = await resp.read()
                        html = raw.decode("utf-8", errors="replace")
                        soup = BeautifulSoup(html, "html.parser")
                        from services.enrichment.html_enricher import extract_attachments
                        new_attachments = extract_attachments(soup, source_url)
                        for f in new_attachments:
                            url = f.get("url", "")
                            if url and url not in seen_urls:
                                seen_urls.add(url)
                                priority, label = classify_pliego(f.get("name", ""))
                                all_pliegos.append({
                                    **f,
                                    "priority": priority,
                                    "label": label,
                                    "source": "source_url_page",
                                })
            finally:
                if own_session:
                    await http_session.close()
        except Exception as e:
            logger.warning(f"Failed to fetch source_url for pliegos: {e}")

    # Strategy 3: COMPR.AR authenticated download (Mendoza + Nacional)
    fuente = str(lic.get("fuente", "")).lower()
    if "compr" in fuente and source_url and ("comprar.mendoza" in source_url or "comprar.gob.ar" in source_url):
        try:
            from services.comprar_pliego_downloader import ComprarPliegoDownloader
            downloader = ComprarPliegoDownloader(db)
            comprar_pliegos = await downloader.download_anexos(source_url)
            for p in comprar_pliegos:
                if p.get("url") and p["url"] not in seen_urls:
                    seen_urls.add(p["url"])
                    all_pliegos.append(p)
        except Exception as e:
            logger.warning(f"COMPR.AR authenticated download failed: {e}")

    # Strategy 3b: ComprasApps authenticated download (pliegos + OC + movimientos)
    if "comprasapps" in (source_url or "").lower():
        try:
            from services.comprasapps_pliego_downloader import ComprasAppsAuthClient
            client = ComprasAppsAuthClient(db)
            ca_results = await client.download_pliegos(source_url)
            for p in ca_results:
                if p.get("type") == "metadata":
                    # Store OC and movimientos separately — caller will persist to metadata
                    all_pliegos.append(p)
                elif p.get("url") and p["url"] not in seen_urls:
                    seen_urls.add(p["url"])
                    all_pliegos.append(p)
            await client.close()
        except Exception as e:
            logger.warning(f"ComprasApps authenticated download failed: {e}")

    # Strategy 4: Cross-source search for related items with pliegos
    from services.cross_source_service import CrossSourceService
    cross_svc = CrossSourceService(db)
    related = await cross_svc.find_related(lic)
    for rel in related[:5]:
        rel_files = rel.get("attached_files") or []
        for f in rel_files:
            url = f.get("url", "")
            if url and url not in seen_urls:
                seen_urls.add(url)
                priority, label = classify_pliego(f.get("name", ""))
                all_pliegos.append({
                    "name": f.get("name", ""),
                    "url": url,
                    "type": f.get("type", "pdf"),
                    "priority": priority,
                    "label": label,
                    "source": f"cross_source:{rel.get('fuente', '?')}",
                })

    # Sort by priority
    all_pliegos.sort(key=lambda p: p["priority"])

    # Try to extract text from the highest-priority PDF
    text_extracted = None
    if all_pliegos:
        best = all_pliegos[0]
        if best.get("type") == "pdf" and best.get("url"):
            url = best["url"]
            # Manual uploads: read from disk directly (avoids auth middleware in Docker)
            if best.get("source") == "manual_upload" and "/api/documentos/" in url:
                try:
                    doc_id_match = re.search(r'/api/documentos/([a-f0-9]+)/download', url)
                    if doc_id_match:
                        from bson import ObjectId as _OID
                        doc = await db.documentos.find_one({"_id": _OID(doc_id_match.group(1))})
                        if doc and doc.get("file_path") and os.path.isfile(doc["file_path"]):
                            with open(doc["file_path"], "rb") as f:
                                pdf_bytes = f.read()
                            from services.enrichment.pdf_zip_enricher import extract_text_from_pdf_bytes
                            text_extracted = extract_text_from_pdf_bytes(pdf_bytes)
                            if text_extracted:
                                text_extracted = text_extracted[:10000]
                                logger.info(f"Extracted {len(text_extracted)} chars from uploaded pliego")
                except Exception as e:
                    logger.warning(f"Failed to extract text from uploaded pliego: {e}")
            # Remote/downloaded pliegos: fetch via HTTP
            if not text_extracted:
                try:
                    from scrapers.resilient_http import ResilientHttpClient
                    http = ResilientHttpClient()
                    from services.enrichment.pdf_zip_enricher import extract_text_from_pdf_url
                    text_extracted = await extract_text_from_pdf_url(http, url)
                    await http.close()
                    if text_extracted:
                        text_extracted = text_extracted[:10000]
                except Exception as e:
                    logger.warning(f"Failed to extract text from pliego PDF: {e}")

    # Fallback: use licitacion description + metadata as context if no PDF text
    if not text_extracted:
        parts = []
        desc = lic.get("description", "")
        if desc and len(desc) > 50:
            parts.append(desc[:5000])
        meta = lic.get("metadata") or {}
        cpf = meta.get("comprar_pliego_fields") or {}
        for k, v in cpf.items():
            if v:
                parts.append(f"{k}: {v}")
        if lic.get("objeto"):
            parts.append(f"Objeto: {lic['objeto']}")
        if lic.get("organization"):
            parts.append(f"Organismo: {lic['organization']}")
        if parts:
            text_extracted = "\n".join(parts)[:10000]

    strategy = "none"
    if all_pliegos:
        strategy = all_pliegos[0].get("source", "unknown")

    # Add hint about COMPR.AR requiring manual upload
    hint = None
    fuente = str(lic.get("fuente", "")).lower()
    if "compr" in fuente and not all_pliegos:
        hint = "COMPR.AR requiere sesion activa para acceder al pliego. Descargalo desde el portal y subilo manualmente."

    return {
        "pliegos": all_pliegos,
        "text_extracted": text_extracted,
        "hint": hint,
        "strategy_used": strategy,
    }
