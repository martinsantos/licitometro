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

    # Strategy 2b: If no pliegos found yet and we have a licitacion_number,
    # search our DB for the EXACT same process in another source
    if not all_pliegos and lic.get("licitacion_number"):
        try:
            lic_num = lic["licitacion_number"]
            # Search for exact licitacion_number match (same process, different source)
            similar = await db.licitaciones.find({
                "licitacion_number": lic_num,
                "_id": {"$ne": lic["_id"]},
                "attached_files": {"$exists": True, "$ne": []},
            }).limit(3).to_list(3)
            # Also try proceso_id if available
            if not similar and lic.get("metadata", {}).get("proceso_id"):
                pid = lic["metadata"]["proceso_id"]
                similar = await db.licitaciones.find({
                    "metadata.proceso_id": pid,
                    "_id": {"$ne": lic["_id"]},
                    "attached_files": {"$exists": True, "$ne": []},
                }).limit(3).to_list(3)
            for sim in similar:
                for f in (sim.get("attached_files") or []):
                    url = f.get("url", "")
                    if url and url not in seen_urls:
                        seen_urls.add(url)
                        priority, label = classify_pliego(f.get("name", ""))
                        all_pliegos.append({
                            "name": f.get("name", ""),
                            "url": url,
                            "type": f.get("type", "pdf"),
                            "priority": priority,
                            "label": f"De {sim.get('fuente', 'otra fuente')}: {label}",
                            "source": f"db_cross:{sim.get('fuente', '')}",
                        })
            if all_pliegos:
                logger.info(f"Strategy 2b: found {len(all_pliegos)} pliegos from DB by exact lic_number {lic_num}")
        except Exception as e:
            logger.warning(f"Strategy 2b failed: {e}")

    # Detect ALL connected sources (not just primary fuente)
    fuente = str(lic.get("fuente", "")).lower()
    all_fuentes = " ".join([fuente] + [f.lower() for f in (lic.get("fuentes") or [])])
    all_source_urls = " ".join([source_url] + [str(v) for v in (lic.get("source_urls") or {}).values()])
    has_comprar = "comprar.mendoza" in all_source_urls or "comprar.gob.ar" in all_source_urls
    has_comprasapps = "comprasapps" in all_fuentes or "comprasapps" in all_source_urls

    # Strategy 3: COMPR.AR authenticated download (Mendoza + Nacional)
    comprar_url = source_url if "comprar.mendoza" in source_url or "comprar.gob.ar" in source_url else ""
    if not comprar_url and has_comprar:
        # Find COMPR.AR pliego URL from source_urls or metadata
        for v in (lic.get("source_urls") or {}).values():
            if isinstance(v, str) and ("comprar.mendoza" in v or "comprar.gob.ar" in v):
                comprar_url = v
                break
        if not comprar_url:
            meta = lic.get("metadata") or {}
            comprar_url = meta.get("comprar_pliego_url", "")
    if comprar_url and ("comprar.mendoza" in comprar_url or "comprar.gob.ar" in comprar_url):
        try:
            from services.comprar_pliego_downloader import ComprarPliegoDownloader
            downloader = ComprarPliegoDownloader(db)
            comprar_pliegos = await downloader.download_anexos(comprar_url)
            for p in comprar_pliegos:
                if p.get("url") and p["url"] not in seen_urls:
                    seen_urls.add(p["url"])
                    all_pliegos.append(p)
        except Exception as e:
            logger.warning(f"COMPR.AR authenticated download failed: {e}")

    # Strategy 3c: Search COMPR.AR + detect pliego URLs in description
    real_pliegos_so_far = [p for p in all_pliegos if p.get("type") != "metadata" and p.get("priority", 99) <= 6]
    if not real_pliegos_so_far:
        desc = lic.get("description", "")
        objeto = lic.get("objeto", "") or lic.get("title", "")
        org = lic.get("organization", "")

        # A) Detect pliego download URLs in description — ONLY near this licitacion's context
        # For BOE items, description may contain the FULL gazette (multiple licitaciones)
        # Extract only the segment relevant to THIS licitacion
        relevant_desc = desc
        if len(desc) > 1000 and objeto:
            # Find the section of description that mentions this licitacion's objeto
            obj_words = [w for w in objeto.split() if len(w) > 4][:3]
            best_pos = -1
            for word in obj_words:
                pos = desc.lower().find(word.lower())
                if pos >= 0:
                    best_pos = pos
                    break
            if best_pos >= 0:
                # Take 800 chars around the match (tight window to avoid other licitaciones)
                start = max(0, best_pos - 200)
                relevant_desc = desc[start:start + 800]
            elif org:
                # Try organization name
                pos = desc.lower().find(org.lower()[:20])
                if pos >= 0:
                    start = max(0, pos - 200)
                    relevant_desc = desc[start:start + 1500]
                else:
                    relevant_desc = desc[:500]  # Just the beginning if nothing matches
            else:
                relevant_desc = desc[:500]

        desc_urls = re.findall(r'(?:www\.[a-z0-9.-]+\.[a-z]{2,}(?:/[^\s,;)]*)?|https?://[^\s,;)]+)', relevant_desc, re.I)
        for durl in desc_urls:
            if not durl.startswith("http"):
                durl = "https://" + durl
            if durl not in seen_urls:
                seen_urls.add(durl)
                domain = re.sub(r'https?://(www\.)?', '', durl).split('/')[0]
                all_pliegos.append({
                    "name": f"Pliego en {domain}",
                    "url": durl,
                    "type": "link",
                    "priority": 3,
                    "label": "Portal de Pliegos",
                    "source": "description_url",
                })
                logger.info(f"Strategy 3c: found pliego URL near objeto context: {durl[:60]}")

        # B) Search COMPR.AR portal if we have identifiers and no comprar_url
        if not comprar_url:
            lic_number = lic.get("licitacion_number", "")
            proceso_id = lic.get("proceso_id", "")

            search_number = ""
            # Extract lic number from description
            m = re.search(r'LICITACI[OÓ]N\s+P[UÚ]BLICA\s+N[°º]?\s*:?\s*(\d+\s*/\s*\d{4})', desc, re.I)
            if m:
                search_number = m.group(1).replace(" ", "")
            elif lic_number and "/" in lic_number:
                search_number = lic_number

            if search_number:
                try:
                    logger.info(f"Strategy 3c: searching COMPR.AR portal for '{search_number}'")
                    from routers.comprar import _search_and_resolve_pliego
                    resolved = await _search_and_resolve_pliego(
                        search_number,
                        "https://comprar.mendoza.gov.ar/Compras.aspx?qs=W1HXHGHtH10=",
                    )
                    if resolved and "VistaPreviaPliego" in resolved:
                        logger.info(f"Strategy 3c: found COMPR.AR pliego: {resolved[:60]}")
                        from services.comprar_pliego_downloader import ComprarPliegoDownloader
                        downloader = ComprarPliegoDownloader(db)
                        dl_pliegos = await downloader.download_anexos(resolved)
                        for p in dl_pliegos:
                            if p.get("url") and p["url"] not in seen_urls:
                                seen_urls.add(p["url"])
                                all_pliegos.append(p)
                        if not dl_pliegos:
                            all_pliegos.append({
                                "name": f"Pliego COMPR.AR ({search_number})",
                                "url": resolved,
                                "type": "pdf",
                                "priority": 2,
                                "label": "Pliego Particular",
                                "source": "comprar_search",
                            })
                except Exception as e:
                    logger.warning(f"Strategy 3c COMPR.AR search failed: {e}")

    # Strategy 3b: ComprasApps authenticated download (pliegos + OC + movimientos)
    if has_comprasapps:
        try:
            from services.comprasapps_pliego_downloader import ComprasAppsAuthClient
            client = ComprasAppsAuthClient(db)
            # Build detail URL params — try current item first, then find related ComprasApps item
            params = ComprasAppsAuthClient.build_detail_params_from_licitacion(lic)
            if not params:
                # Current item isn't from ComprasApps — find the linked one
                lic_num = lic.get("licitacion_number", "")
                proceso_id = lic.get("proceso_id", "")
                ca_item = None
                if proceso_id:
                    ca_item = await db.licitaciones.find_one({"fuente": "ComprasApps Mendoza", "proceso_id": proceso_id})
                if not ca_item and lic_num:
                    ca_item = await db.licitaciones.find_one({
                        "fuente": "ComprasApps Mendoza",
                        "licitacion_number": {"$regex": f"^{re.escape(lic_num)}/"},
                    })
                if ca_item:
                    params = ComprasAppsAuthClient.build_detail_params_from_licitacion(ca_item)
                    logger.info(f"Found ComprasApps item {ca_item.get('licitacion_number')} for cross-source pliego search")
            if params:
                if await client._load_credentials():
                    if await client.login():
                        detail = await client.fetch_detail_authenticated(**params)
                        # Collect metadata (OC, movimientos)
                        metadata_extra = {}
                        if detail.get("ordenes_compra"):
                            metadata_extra["ordenes_compra"] = detail["ordenes_compra"]
                        if detail.get("movimientos"):
                            metadata_extra["movimientos"] = detail["movimientos"]
                        if metadata_extra:
                            all_pliegos.append({
                                "name": "__metadata__",
                                "url": "",
                                "type": "metadata",
                                "priority": 999,
                                "label": "Datos autenticados",
                                "source": "comprasapps_authenticated",
                                "metadata": metadata_extra,
                            })
                        # Download pliegos if available
                        if detail.get("descargas_visible"):
                            pliegos = await client._download_anexos(params)
                            for p in pliegos:
                                if p.get("url") and p["url"] not in seen_urls:
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

    # Try to extract text from the highest-priority PDFs (try multiple if first fails)
    text_extracted = None
    from services.enrichment.pdf_zip_enricher import extract_text_from_pdf_bytes

    for best in [p for p in all_pliegos if p.get("type") == "pdf" and p.get("url")]:
        if text_extracted and len(text_extracted) > 200:
            break  # Got good text, stop trying

        url = best.get("url", "")
        local_path = best.get("local_path", "")

        # Priority A: Read from local disk (authenticated downloads + manual uploads)
        if local_path and os.path.isfile(local_path):
            try:
                with open(local_path, "rb") as f:
                    pdf_bytes = f.read()
                text_extracted = extract_text_from_pdf_bytes(pdf_bytes)
                if text_extracted:
                    text_extracted = text_extracted[:10000]
                    logger.info(f"Extracted {len(text_extracted)} chars from local pliego: {local_path}")
                    break
            except Exception as e:
                logger.warning(f"Failed to read local pliego {local_path}: {e}")

        # Priority B: Manual uploads stored in /api/documentos/
        if not text_extracted and "/api/documentos/" in url:
            try:
                doc_id_match = re.search(r'/api/documentos/([a-f0-9]+)/download', url)
                if doc_id_match:
                    from bson import ObjectId as _OID
                    doc = await db.documentos.find_one({"_id": _OID(doc_id_match.group(1))})
                    if doc and doc.get("file_path") and os.path.isfile(doc["file_path"]):
                        with open(doc["file_path"], "rb") as f:
                            pdf_bytes = f.read()
                        text_extracted = extract_text_from_pdf_bytes(pdf_bytes)
                        if text_extracted:
                            text_extracted = text_extracted[:10000]
                            logger.info(f"Extracted {len(text_extracted)} chars from uploaded pliego")
                            break
            except Exception as e:
                logger.warning(f"Failed to extract text from uploaded pliego: {e}")

        # Priority C: Authenticated downloads stored in /api/storage/pliegos/
        if not text_extracted and "/api/storage/pliegos/" in url:
            try:
                filename = url.split("/")[-1]
                storage_dir = os.environ.get("STORAGE_DIR", "/home/ubuntu/licitometro/storage")
                local = os.path.join(storage_dir, "pliegos", filename)
                if os.path.isfile(local):
                    with open(local, "rb") as f:
                        pdf_bytes = f.read()
                    text_extracted = extract_text_from_pdf_bytes(pdf_bytes)
                    if text_extracted:
                        text_extracted = text_extracted[:10000]
                        logger.info(f"Extracted {len(text_extracted)} chars from storage pliego: {local}")
                        break
            except Exception as e:
                logger.warning(f"Failed to read storage pliego: {e}")

        # Priority D: Remote HTTP fetch (for external URLs)
        if not text_extracted and url.startswith("http"):
            try:
                from scrapers.resilient_http import ResilientHttpClient
                http = ResilientHttpClient()
                from services.enrichment.pdf_zip_enricher import extract_text_from_pdf_url
                text_extracted = await extract_text_from_pdf_url(http, url)
                await http.close()
                if text_extracted:
                    text_extracted = text_extracted[:10000]
                    break
            except Exception as e:
                logger.warning(f"Failed to extract text from pliego PDF {url[:60]}: {e}")

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

    # Smart hint based on what was found
    hint = None
    real_pliegos = [p for p in all_pliegos if p.get("type") != "metadata" and p.get("priority", 99) <= 6]
    only_generic = all_pliegos and not real_pliegos  # only boletines/generic attachments

    if not all_pliegos:
        if has_comprasapps:
            hint = "ComprasApps no tiene pliego descargable para esta licitacion. Descargalo desde el portal y subilo manualmente."
        elif has_comprar:
            hint = "COMPR.AR requiere sesion activa para acceder al pliego. Descargalo desde el portal y subilo manualmente."
        else:
            hint = "No se encontraron pliegos. Subi el PDF del pliego manualmente."
    elif only_generic:
        names = ", ".join(p.get("name", "?")[:30] for p in all_pliegos if p.get("type") != "metadata")
        hint = f"Se encontraron adjuntos genericos ({names}) pero no el pliego especifico. Subi el PDF del pliego para mejor analisis."

    return {
        "pliegos": all_pliegos,
        "text_extracted": text_extracted,
        "hint": hint,
        "strategy_used": strategy,
    }
