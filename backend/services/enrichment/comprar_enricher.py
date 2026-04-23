"""COMPR.AR label-based extraction from pliego pages."""

import logging
import re
from typing import Any, Dict, List
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from scrapers.resilient_http import ResilientHttpClient
from utils.dates import parse_date_guess
from utils.time import utc_now
from .text_analyzer import extract_budget_from_text, enrich_title_only

logger = logging.getLogger("generic_enrichment")

MAX_DESCRIPTION_LEN = 10000
PLIEGO_TEXT_MAX = 60_000  # chars saved to metadata for AI use
DOC_DOWNLOAD_TIMEOUT_S = 25
DOC_MAX_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB


def _extract_doc_links(html: str, base_url: str) -> List[Dict[str, str]]:
    """Extract embedded document links from VistaPreviaPliegoCiudadano HTML.

    Returns list of {url, titulo, tipo} dicts (deduplicated, up to 5).
    Targets: GetDoc.aspx, .pdf hrefs, iframe PDF src.
    """
    soup = BeautifulSoup(html, "html.parser")
    seen: set = set()
    docs: List[Dict[str, str]] = []

    def _add(url: str, titulo: str, tipo: str):
        abs_url = urljoin(base_url, url)
        if abs_url in seen:
            return
        seen.add(abs_url)
        docs.append({"url": abs_url, "titulo": titulo or "Pliego", "tipo": tipo})

    # <a href="...GetDoc.aspx..."> or href ending in .pdf / .docx
    # Skip javascript: hrefs entirely — they are ASP.NET postback buttons, not real URLs
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if href.lower().startswith("javascript:"):
            continue
        text = a.get_text(" ", strip=True)[:100]
        if "GetDoc.aspx" in href or "GetDocumento.aspx" in href:
            ext = "PDF" if "pdf" in href.lower() else "DOC"
            _add(href, text or "Documento", ext)
        elif re.search(r"\.(pdf|docx|doc|zip)(\?|$)", href, re.I):
            ext = re.search(r"\.(pdf|docx?|zip)", href, re.I).group(1).upper()
            _add(href, text or "Pliego", ext)

    # <iframe src="...pdf...">
    for fr in soup.find_all("iframe", src=True):
        src = fr["src"]
        if re.search(r"\.(pdf)(\?|$)", src, re.I):
            _add(src, "Pliego PDF", "PDF")

    return docs[:5]


async def enrich_comprar(http: ResilientHttpClient, lic_doc: dict, source_url: str) -> Dict[str, Any]:
    """Enrich COMPR.AR items using label-based extraction from pliego pages.

    VistaPreviaPliegoCiudadano URLs are stable and contain label/sibling pairs.
    ComprasElectronicas URLs are session-dependent -- try metadata for a better URL.
    """
    fetch_url = source_url
    meta = lic_doc.get("metadata", {}) or {}

    if "VistaPreviaPliegoCiudadano" not in source_url:
        pliego_url = meta.get("comprar_pliego_url", "")
        if pliego_url and "VistaPreviaPliegoCiudadano" in pliego_url:
            fetch_url = pliego_url
        else:
            logger.debug(f"COMPR.AR: no stable pliego URL for {source_url[:60]}")
            return enrich_title_only(lic_doc)

    try:
        # VistaPreviaPliegoCiudadano pages are ~400KB and accessible without proxy.
        # The Cloudflare Worker proxy truncates large responses, causing 0 labels.
        # Fetch directly with ssl=False (gov.ar certs are often broken).
        # Keep session open to download embedded docs (GetDoc.aspx cookies required).
        import aiohttp
        downloaded_docs: List[Dict[str, Any]] = []  # {url, titulo, tipo, local_url}
        if "VistaPreviaPliegoCiudadano" in fetch_url:
            try:
                connector = aiohttp.TCPConnector(ssl=False)
                async with aiohttp.ClientSession(connector=connector) as session:
                    async with session.get(
                        fetch_url,
                        timeout=aiohttp.ClientTimeout(total=30),
                        headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"},
                    ) as resp:
                        if resp.status == 200:
                            html = await resp.text()
                        else:
                            html = None

                    # R4: download embedded docs within the SAME session (cookies intact)
                    if html:
                        doc_links = _extract_doc_links(html, fetch_url)
                        fuente = lic_doc.get("fuente", "COMPR.AR Mendoza")
                        numero = lic_doc.get("licitacion_number", "") or lic_doc.get("numero_proceso", "")
                        doc_id = lic_doc.get("_id")
                        for i, dlink in enumerate(doc_links[:3]):
                            try:
                                async with session.get(
                                    dlink["url"],
                                    timeout=aiohttp.ClientTimeout(total=DOC_DOWNLOAD_TIMEOUT_S),
                                ) as dresp:
                                    if dresp.status != 200:
                                        continue
                                    ctype = dresp.headers.get("Content-Type", "")
                                    is_binary = "pdf" in ctype.lower() or "octet" in ctype.lower() or "zip" in ctype.lower()
                                    if not is_binary and dlink["tipo"] not in ("PDF", "ZIP"):
                                        continue
                                    data = await dresp.content.read(DOC_MAX_SIZE_BYTES + 1)
                                    if len(data) > DOC_MAX_SIZE_BYTES:
                                        logger.debug(f"COMPR.AR doc too large: {dlink['url'][:60]}")
                                        continue
                                    if len(data) < 500:
                                        continue
                                    # Store locally — suffix with index to distinguish multiple docs
                                    suffix = f"_doc{i}" if i > 0 else ""
                                    try:
                                        from services.pliego_storage_service import store_pliego
                                        local_url = await store_pliego(
                                            None, doc_id, data, fuente,
                                            f"{numero}{suffix}", source_url=dlink["url"]
                                        )
                                    except Exception as se:
                                        logger.debug(f"store_pliego failed: {se}")
                                        local_url = None
                                    downloaded_docs.append({
                                        "url": local_url or dlink["url"],
                                        "titulo": dlink["titulo"],
                                        "tipo": dlink["tipo"],
                                        "fuente": "local" if local_url else "comprar_ar",
                                        "source_url": dlink["url"],
                                    })
                            except Exception as de:
                                logger.debug(f"COMPR.AR doc download failed {dlink['url'][:60]}: {de}")
            except Exception:
                html = await http.fetch(fetch_url)  # fallback to proxy
        else:
            html = await http.fetch(fetch_url)
    except Exception as e:
        logger.warning(f"COMPR.AR fetch failed: {e}")
        return enrich_title_only(lic_doc)

    if not html:
        return enrich_title_only(lic_doc)

    soup = BeautifulSoup(html, "html.parser")
    labels = soup.find_all("label")
    if not labels:
        logger.warning(f"COMPR.AR: no labels found at {fetch_url[:60]} -- portal page?")
        return enrich_title_only(lic_doc)

    # Extract label -> value pairs
    fields: Dict[str, str] = {}
    for lab in labels:
        key = lab.get_text(" ", strip=True)
        if not key:
            continue
        nxt = lab.find_next_sibling()
        val = nxt.get_text(" ", strip=True) if nxt else ""
        if val:
            fields[key] = val

    if not fields:
        return enrich_title_only(lic_doc)

    updates: Dict[str, Any] = {}

    # Extract structured fields
    description = fields.get("Objeto de la contratación") or fields.get("Objeto")
    if description:
        current_desc = lic_doc.get("description", "") or ""
        if len(description) > len(current_desc) + 10:
            updates["description"] = description[:MAX_DESCRIPTION_LEN]
        if not lic_doc.get("objeto"):
            updates["objeto"] = description[:200]

    nombre = fields.get("Nombre descriptivo del proceso") or fields.get("Nombre descriptivo de proceso")
    if nombre and len(nombre.strip()) > 10:
        from utils.object_extractor import is_poor_title
        if is_poor_title(lic_doc.get("title", "")):
            updates["title"] = nombre.strip()

    exp = fields.get("Número de expediente") or fields.get("Número de Expediente")
    if exp and not lic_doc.get("expedient_number"):
        updates["expedient_number"] = exp.replace("&nbsp", " ").strip()

    contact = fields.get("Lugar de recepción de documentación física")
    if contact and not lic_doc.get("contact"):
        updates["contact"] = contact

    currency = fields.get("Moneda")
    if currency and not lic_doc.get("currency"):
        updates["currency"] = currency

    # Budget from pliego fields
    for budget_key in ["Presupuesto oficial", "Monto estimado", "Presupuesto"]:
        raw = fields.get(budget_key, "")
        if raw:
            budget_val, _ = extract_budget_from_text(f"presupuesto: {raw}")
            if budget_val and not lic_doc.get("budget"):
                updates["budget"] = budget_val
                if not lic_doc.get("currency"):
                    updates["currency"] = currency or "ARS"
                break

    # Opening date from pliego (if missing)
    if not lic_doc.get("opening_date"):
        raw_apertura = fields.get("Fecha y hora acto de apertura") or fields.get("Fecha de Apertura")
        if raw_apertura:
            dt = parse_date_guess(raw_apertura)
            if dt:
                updates["opening_date"] = dt

    # Publication date from pliego (if missing)
    if not lic_doc.get("publication_date"):
        raw_pub = fields.get("Fecha y hora estimada de publicación en el portal") or fields.get("Fecha de publicación")
        if raw_pub:
            dt = parse_date_guess(raw_pub)
            if dt:
                updates["publication_date"] = dt

    # R4: save pliego text for AI use (survives qs= expiry)
    soup_text = soup.get_text(" ", strip=True)
    meta_pliego_text = soup_text[:PLIEGO_TEXT_MAX] if soup_text else ""

    # R4: merge downloaded docs into pliegos_bases (deduplicate by url)
    if downloaded_docs:
        existing_bases = list(lic_doc.get("pliegos_bases") or [])
        existing_urls = {p.get("url") for p in existing_bases}
        for d in downloaded_docs:
            if d["url"] not in existing_urls:
                existing_bases.append({
                    "url": d["url"],
                    "titulo": d["titulo"],
                    "tipo": d["tipo"],
                    "fuente": d["fuente"],
                })
                existing_urls.add(d["url"])
        updates["pliegos_bases"] = existing_bases
        logger.info(f"COMPR.AR R4: stored {len(downloaded_docs)} docs locally for {lic_doc.get('licitacion_number', '')}")

    # Store pliego fields in metadata and update source_url if we used a better one
    meta_updates = dict(meta)
    meta_updates["comprar_pliego_fields"] = fields
    if meta_pliego_text:
        meta_updates["comprar_pliego_text"] = meta_pliego_text
    if fetch_url != source_url:
        meta_updates["comprar_pliego_url"] = fetch_url
        updates["source_url"] = fetch_url
        updates["canonical_url"] = fetch_url
        updates["url_quality"] = "direct"
        source_urls = lic_doc.get("source_urls", {}) or {}
        source_urls["comprar_pliego"] = fetch_url
        updates["source_urls"] = source_urls
    updates["metadata"] = meta_updates

    # Auto-classify category
    if not lic_doc.get("category"):
        from services.category_classifier import get_category_classifier
        classifier = get_category_classifier()
        title = updates.get("title", lic_doc.get("title", ""))
        objeto = updates.get("objeto", lic_doc.get("objeto", ""))
        cat = classifier.classify(title=title, objeto=objeto)
        if not cat:
            desc_short = (updates.get("description", lic_doc.get("description", "")) or "")[:500]
            cat = classifier.classify(title=title, objeto=objeto, description=desc_short)
        if cat:
            updates["category"] = cat

    if updates:
        updates["last_enrichment"] = utc_now()
        updates["updated_at"] = utc_now()
        logger.info(f"COMPR.AR enrichment: {len(fields)} pliego fields, {len(updates)} updates")

    return updates


async def enrich_comprar_authenticated(db, lic_doc: dict, source_url: str) -> Dict[str, Any]:
    """Try authenticated enrichment via VistaPreviaPliego (internal view).

    Only runs when credentials exist for the domain. Extracts additional fields
    not visible in the public VistaPreviaPliegoCiudadano view (cronograma,
    garantías, items, requisitos, circulares).

    This is called AFTER enrich_comprar() during manual enrichment only.
    Anti-ban: 2.5s delay, never called from cron.
    """
    import re
    from urllib.parse import urlparse

    if not db:
        return {}

    parsed = urlparse(source_url)
    domain = parsed.netloc
    if not domain:
        return {}

    # Check if credentials exist for this domain
    cred = await db.site_credentials.find_one({
        "enabled": True,
        "site_url": {"$regex": re.escape(domain), "$options": "i"},
    })
    if not cred:
        return {}

    try:
        from services.comprar_pliego_downloader import ComprarPliegoDownloader
        downloader = ComprarPliegoDownloader(db)
        pliegos = await downloader.download_anexos(source_url)
        if pliegos:
            logger.info(f"COMPR.AR auth enrichment: downloaded {len(pliegos)} anexos from {domain}")
            return {"attached_files_extra": pliegos}
    except Exception as e:
        logger.warning(f"COMPR.AR auth enrichment failed: {e}")

    return {}
