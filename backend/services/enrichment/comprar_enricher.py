"""COMPR.AR label-based extraction from pliego pages."""

import logging
from typing import Any, Dict

from bs4 import BeautifulSoup

from scrapers.resilient_http import ResilientHttpClient
from utils.dates import parse_date_guess
from utils.time import utc_now
from .text_analyzer import extract_budget_from_text, enrich_title_only

logger = logging.getLogger("generic_enrichment")

MAX_DESCRIPTION_LEN = 10000


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
        import aiohttp
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

    # Store pliego fields in metadata and update source_url if we used a better one
    meta_updates = dict(meta)
    meta_updates["comprar_pliego_fields"] = fields
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
