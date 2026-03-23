"""HTML-based enrichment: CSS selector extraction, OSEP postback, prorroga detection."""

import logging
import re
from datetime import datetime
from typing import Any, Dict, List, Optional
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from scrapers.resilient_http import ResilientHttpClient
from utils.dates import parse_date_guess
from utils.time import utc_now

logger = logging.getLogger("generic_enrichment")

MAX_DESCRIPTION_LEN = 10000

# Common content selectors (tried in order)
CONTENT_SELECTORS = [
    "article .entry-content", ".entry-content", "article",
    ".contenido", ".descripcion", ".objeto",
    "main .content", "main", "#content", "#contenido",
    ".post-content", ".page-content",
]

DOC_EXTENSIONS = {".pdf", ".doc", ".docx", ".xls", ".xlsx", ".zip", ".rar", ".odt", ".ods"}


def extract_description(soup: BeautifulSoup, sel: dict) -> Optional[str]:
    """Extract main content text from the page."""
    for key in ("detail_description_selector", "description_selector"):
        css = sel.get(key, "")
        if css:
            el = soup.select_one(css)
            if el:
                text = el.get_text(separator="\n", strip=True)
                if len(text) > 30:
                    return text

    for css in CONTENT_SELECTORS:
        el = soup.select_one(css)
        if el:
            text = el.get_text(separator="\n", strip=True)
            if len(text) > 50:
                return text

    return None


def extract_opening_date(soup: BeautifulSoup, sel: dict) -> Optional[datetime]:
    """Try to find an opening/apertura date on the page."""
    # 1. Try config selector
    for key in ("detail_opening_date_selector", "opening_date_selector"):
        css = sel.get(key, "")
        if css:
            el = soup.select_one(css)
            if el:
                dt = parse_date_guess(el.get_text(strip=True))
                if dt:
                    return dt

    # 2. Look for table cells / structured labels with 'apertura'
    for label_el in soup.find_all(["span", "td", "th", "label", "strong", "b"]):
        label_text = label_el.get_text(strip=True).lower()
        if "fecha" in label_text and "apertura" in label_text:
            value_el = label_el.find_next_sibling()
            if not value_el:
                value_el = label_el.find_next(["span", "td", "div", "p"])
            if value_el:
                dt = parse_date_guess(value_el.get_text(strip=True))
                if dt:
                    return _combine_date_time(dt, soup, label_el)
            parent = label_el.parent
            if parent:
                next_cell = parent.find_next_sibling("td")
                if next_cell:
                    dt = parse_date_guess(next_cell.get_text(strip=True))
                    if dt:
                        return dt

    # 3. Regex patterns on full page text
    text = re.sub(r'\s+', ' ', soup.get_text(separator=" "))
    patterns = [
        r"fecha\s*(?:de\s+)?(?:y\s+lugar\s+de\s+)?apertura\s*(?:de\s+ofertas)?\s*[:\s]+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}(?:\s+(?:a\s+las\s+)?\d{1,2}[:.]\d{2})?)",
        r"apertura\s+(?:de\s+(?:las\s+)?(?:propuestas|ofertas|sobres)\s+)?(?:se\s+realizará\s+el\s+)?(\d{1,2}\s+de\s+\w+\s+(?:de\s+)?\d{4}(?:\s*[,a]\s*las?\s*\d{1,2}[:.]\d{2})?)",
        r"fecha\s*(?:de\s+)?apertura\s*(?:de\s+ofertas)?\s*[:\s]+d[ií]a\s+(\d{1,2}\s+de\s+\w+\s+(?:de\s+)?\d{4}(?:\s+hora\s+\d{1,2}[:.]\d{2})?)",
        r"fecha\s+y\s+lugar\s+de\s+apertura\s*[:\s]+(?:(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\s+)?(\d{1,2}\s+de\s+\w+\s+(?:de\s+)?\d{4}(?:\s+a\s+las\s+\d{1,2}[:.]\d{2})?)",
        r"apertura\s*[:\s]+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})",
        r"apertura[^.]{0,30}?(\d{1,2}\s+de\s+\w+\s+(?:de\s+)?\d{4})",
    ]
    for pattern in patterns:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            dt = parse_date_guess(m.group(1).strip())
            if dt:
                return dt

    return None


def _combine_date_time(date_val: datetime, soup: BeautifulSoup, near_el) -> datetime:
    """Try to find 'hora de apertura' near the date element and combine."""
    for el in near_el.find_all_next(["span", "td", "label", "strong", "b"], limit=10):
        text = el.get_text(strip=True).lower()
        if "hora" in text and "apertura" in text:
            time_el = el.find_next(["span", "td", "div"])
            if time_el:
                time_text = time_el.get_text(strip=True)
                time_match = re.search(r'(\d{1,2})[:.:](\d{2})', time_text)
                if time_match:
                    h, m = int(time_match.group(1)), int(time_match.group(2))
                    return date_val.replace(hour=h, minute=m)
    return date_val


def extract_attachments(soup: BeautifulSoup, base_url: str) -> List[dict]:
    """Find all downloadable document links on the page."""
    attachments = []
    seen_urls: set = set()

    for a in soup.find_all("a", href=True):
        href = a.get("href", "")
        if not href or href.startswith("#") or href.startswith("javascript"):
            continue

        href_lower = href.lower()
        is_doc = any(href_lower.endswith(ext) or ext + "?" in href_lower for ext in DOC_EXTENSIONS)
        link_text = a.get_text(strip=True)
        if not is_doc and link_text:
            is_doc = any(kw in link_text.lower() for kw in ["descargar", "download", "pliego", "anexo", "documento"])

        if is_doc:
            full_url = urljoin(base_url, href)
            if full_url not in seen_urls:
                seen_urls.add(full_url)
                ext = ""
                for e in DOC_EXTENSIONS:
                    if e in href_lower:
                        ext = e.lstrip(".")
                        break
                attachments.append({
                    "name": link_text or href.split("/")[-1].split("?")[0],
                    "url": full_url,
                    "type": ext or "unknown",
                })

    return attachments


def extract_extra_metadata(soup: BeautifulSoup, sel: dict) -> Optional[dict]:
    """Extract any extra structured metadata (budget, expediente, etc.)."""
    from .text_analyzer import extract_budget_from_text

    meta: dict = {}
    text = soup.get_text()

    budget_val, _ = extract_budget_from_text(text)
    if budget_val:
        meta["budget_extracted"] = budget_val

    exp_match = re.search(
        r"(?:expediente|expte\.?|EX-)\s*[:\s]*([A-Z0-9][\w\-/]+)",
        text, re.IGNORECASE
    )
    if exp_match:
        meta["expediente"] = exp_match.group(1).strip()

    return meta if meta else None


def detect_prorroga(updates: Dict[str, Any], lic_doc: dict) -> None:
    """Detect prorroga (date extension) via keywords or date change. Mutates updates in-place."""
    new_opening = updates.get("opening_date")
    current_opening = lic_doc.get("opening_date")
    new_description = updates.get("description", lic_doc.get("description", "")) or ""

    prorroga_keywords = [
        "prorroga", "prórroga", "extension", "extensión",
        "modificacion de fecha", "modificación de fecha",
        "nuevo plazo", "ampliacion de plazo", "ampliación de plazo",
        "postergacion", "postergación"
    ]
    has_prorroga_keyword = any(kw in new_description.lower() for kw in prorroga_keywords)

    if new_opening and current_opening and new_opening > current_opening:
        updates["fecha_prorroga"] = new_opening
        updates["estado"] = "prorrogada"
        meta = updates.get("metadata", lic_doc.get("metadata", {})) or {}
        meta["circular_prorroga"] = {
            "old_date": current_opening, "new_date": new_opening,
            "detected_at": utc_now(), "detection_method": "date_change",
        }
        updates["metadata"] = meta
        logger.info(f"Prórroga detected (date change): {current_opening.date()} → {new_opening.date()}")
    elif has_prorroga_keyword and (new_opening or current_opening):
        effective_opening = new_opening or current_opening
        updates["fecha_prorroga"] = effective_opening
        updates["estado"] = "prorrogada"
        meta = updates.get("metadata", lic_doc.get("metadata", {})) or {}
        meta["circular_prorroga"] = {
            "old_date": current_opening, "new_date": effective_opening,
            "detected_at": utc_now(), "detection_method": "keyword",
        }
        updates["metadata"] = meta
        logger.info(f"Prórroga detected (keyword): fecha_prorroga = {effective_opening.date()}")


async def enrich_osep_postback(http: ResilientHttpClient, lic_doc: dict, list_url: str, target: str) -> Dict[str, Any]:
    """Enrich OSEP licitacion by fetching the list page and doing ASP.NET postback."""
    try:
        list_html = await http.fetch(list_url)
        if not list_html:
            logger.warning("OSEP enrichment: could not fetch list page")
            return {}

        soup = BeautifulSoup(list_html, "html.parser")
        fields = {}
        for name in ["__VIEWSTATE", "__EVENTVALIDATION", "__VIEWSTATEGENERATOR"]:
            inp = soup.find("input", {"name": name})
            if inp and inp.get("value") is not None:
                fields[name] = inp.get("value")

        if not fields.get("__VIEWSTATE"):
            logger.warning("OSEP enrichment: no __VIEWSTATE found")
            return {}

        fields["__EVENTTARGET"] = target
        fields["__EVENTARGUMENT"] = ""

        import aiohttp
        async with aiohttp.ClientSession(
            timeout=aiohttp.ClientTimeout(total=30),
            connector=aiohttp.TCPConnector(ssl=False),
        ) as session:
            async with session.post(list_url, data=fields) as resp:
                if resp.status != 200:
                    logger.warning(f"OSEP postback returned {resp.status}")
                    return {}
                raw = await resp.read()
                try:
                    detail_html = raw.decode("utf-8")
                except UnicodeDecodeError:
                    detail_html = raw.decode("latin-1", errors="replace")

        if not detail_html or len(detail_html) < 200:
            return {}

        detail_soup = BeautifulSoup(detail_html, "html.parser")
        updates: Dict[str, Any] = {}

        def value_by_label(label_texts):
            for lab in detail_soup.find_all("label"):
                text = lab.get_text(" ", strip=True)
                if any(t.lower() in text.lower() for t in label_texts):
                    nxt = lab.find_next_sibling()
                    if nxt:
                        return nxt.get_text(" ", strip=True)
            return None

        description = value_by_label(["Objeto de la contratación", "Objeto"])
        if description and description != lic_doc.get("description"):
            updates["description"] = description[:10000]

        expedient = value_by_label(["Número de expediente"])
        if expedient and not lic_doc.get("expedient_number"):
            updates["expedient_number"] = expedient

        lic_number = value_by_label(["Número de proceso", "Nº de proceso"])
        if lic_number and not lic_doc.get("licitacion_number"):
            updates["licitacion_number"] = lic_number

        contact = value_by_label(["Consultas", "Contacto"])
        if contact:
            updates["contact"] = contact

        tipo = value_by_label(["Procedimiento de selección"])
        if tipo and not lic_doc.get("tipo_procedimiento"):
            updates["tipo_procedimiento"] = tipo

        open_raw = value_by_label(["Fecha y hora acto de apertura", "Fecha de Apertura"])
        if open_raw:
            parsed = parse_date_guess(open_raw)
            if parsed and not lic_doc.get("opening_date"):
                updates["opening_date"] = parsed

        pub_raw = value_by_label(["Fecha y hora estimada de publicación", "Fecha de publicación"])
        if pub_raw:
            parsed = parse_date_guess(pub_raw)
            if parsed and not lic_doc.get("publication_date"):
                updates["publication_date"] = parsed

        attached = []
        for a in detail_soup.find_all("a", href=True):
            href = a.get("href", "")
            if any(ext in href.lower() for ext in [".pdf", ".doc", ".docx", ".xls", ".xlsx"]):
                attached.append({
                    "name": a.get_text(" ", strip=True) or href.split("/")[-1],
                    "url": urljoin(list_url, href),
                    "type": href.split(".")[-1].lower() if "." in href else "unknown",
                })
        if attached and not lic_doc.get("attached_files"):
            updates["attached_files"] = attached

        # Extract objeto and classify category
        if not lic_doc.get("objeto"):
            from utils.object_extractor import extract_objeto
            obj = extract_objeto(
                title=lic_doc.get("title", ""),
                description=updates.get("description", lic_doc.get("description", "") or ""),
                metadata=lic_doc.get("metadata", {}),
            )
            if obj:
                updates["objeto"] = obj

        if not lic_doc.get("category"):
            from services.category_classifier import get_category_classifier
            classifier = get_category_classifier()
            cat = classifier.classify(
                title=lic_doc.get("title", ""),
                objeto=updates.get("objeto", ""),
                description=updates.get("description", "")[:500],
            )
            if cat:
                updates["category"] = cat

        if updates:
            updates["enrichment_level"] = max(lic_doc.get("enrichment_level", 1), 2)

        logger.info(f"OSEP postback enrichment: {len(updates)} fields extracted")
        return updates

    except Exception as e:
        logger.error(f"OSEP postback enrichment failed: {e}")
        return {}
