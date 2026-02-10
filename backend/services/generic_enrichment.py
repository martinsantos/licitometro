"""
Generic Enrichment Service - Re-fetches source_url for any licitacion source
and extracts description, dates, and document attachments.

For sources with scraper configs (GenericHtmlScraper), uses CSS selectors
for targeted extraction. Otherwise falls back to common HTML patterns.

Supports PDF and ZIP binary downloads for sources that link to pliegos
(e.g. Maipú ZIPs, Ciudad de Mendoza Google Drive PDFs, Tupungato).
"""

import io
import logging
import os
import re
import zipfile
from datetime import datetime
from typing import Dict, Any, List, Optional
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from scrapers.resilient_http import ResilientHttpClient
from utils.dates import parse_date_guess

logger = logging.getLogger("generic_enrichment")

MAX_PDF_BYTES = int(os.environ.get("MAX_PDF_BYTES", 25 * 1024 * 1024))    # 25 MB
MAX_ZIP_BYTES = int(os.environ.get("MAX_ZIP_BYTES", 50 * 1024 * 1024))    # 50 MB
MAX_PDF_PAGES = int(os.environ.get("MAX_PDF_PAGES", 200))
MAX_DESCRIPTION_LEN = int(os.environ.get("MAX_DESCRIPTION_LEN", 10000))

# Common content selectors (tried in order)
CONTENT_SELECTORS = [
    "article .entry-content",
    ".entry-content",
    "article",
    ".contenido",
    ".descripcion",
    ".objeto",
    "main .content",
    "main",
    "#content",
    "#contenido",
    ".post-content",
    ".page-content",
]

DOC_EXTENSIONS = {".pdf", ".doc", ".docx", ".xls", ".xlsx", ".zip", ".rar", ".odt", ".ods"}


class GenericEnrichmentService:
    """Fetches a licitacion's source_url and extracts additional data."""

    def __init__(self):
        self.http = ResilientHttpClient()

    @staticmethod
    def _extract_budget_from_text(text: str) -> tuple:
        """Extract budget amount and currency from text. Returns (amount, currency)."""
        currency = "ARS"
        if re.search(r"(?:USD|U\$S|dólar)", text, re.I):
            currency = "USD"

        patterns = [
            # "Presupuesto oficial: $1.234.567,89"
            r"(?:presupuesto|monto|importe|valor)\s*(?:oficial|estimado|total|aproximado|referencial)?[:\s]*\$?\s*([\d]+(?:\.[\d]{3})*(?:,[\d]{1,2})?)",
            # "$ 1.234.567,89" standalone large amounts
            r"\$\s*([\d]+(?:\.[\d]{3})+(?:,[\d]{1,2})?)",
            # Decimal format: "1234567.89"
            r"(?:presupuesto|monto|importe)\s*(?:oficial|estimado)?[:\s]*\$?\s*([\d]+\.[\d]{2})\b",
        ]
        for pat in patterns:
            m = re.search(pat, text, re.IGNORECASE)
            if m:
                try:
                    amount_str = m.group(1).replace(".", "").replace(",", ".")
                    val = float(amount_str)
                    if val > 100:  # Minimum threshold to avoid false positives
                        return val, currency
                except (ValueError, IndexError):
                    continue
        return None, currency

    # ---- Binary download & PDF/ZIP helpers ----

    async def _download_binary(self, url: str, max_bytes: int) -> Optional[bytes]:
        """Stream-download binary content with size limit."""
        try:
            import aiohttp
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            }
            async with aiohttp.ClientSession(headers=headers) as session:
                async with session.get(url, timeout=aiohttp.ClientTimeout(total=60), ssl=False) as resp:
                    if resp.status != 200:
                        logger.warning(f"Binary download failed ({resp.status}): {url}")
                        return None
                    content_length = int(resp.headers.get("Content-Length", 0))
                    if content_length > max_bytes:
                        logger.warning(f"Binary too large ({content_length / 1024 / 1024:.1f}MB): {url}")
                        return None
                    chunks = []
                    total = 0
                    async for chunk in resp.content.iter_chunked(64 * 1024):
                        total += len(chunk)
                        if total > max_bytes:
                            logger.warning(f"Binary exceeded size limit during download: {url}")
                            return None
                        chunks.append(chunk)
                    return b"".join(chunks)
        except Exception as e:
            logger.error(f"Error downloading binary {url}: {e}")
            return None

    def _extract_text_from_pdf_bytes(self, pdf_bytes: bytes) -> str:
        """Extract text from PDF bytes using pypdf. Page count capped."""
        from pypdf import PdfReader
        try:
            reader = PdfReader(io.BytesIO(pdf_bytes))
            num_pages = min(len(reader.pages), MAX_PDF_PAGES)
            parts = []
            for i in range(num_pages):
                page_text = reader.pages[i].extract_text()
                if page_text:
                    parts.append(page_text)
            if num_pages < len(reader.pages):
                logger.info(f"PDF capped at {num_pages}/{len(reader.pages)} pages")
            return "\n\n".join(parts)
        except Exception as e:
            logger.error(f"PDF text extraction failed: {e}")
            return ""

    async def _extract_text_from_pdf_url(self, url: str) -> Optional[str]:
        """Download a PDF and extract text."""
        data = await self._download_binary(url, MAX_PDF_BYTES)
        if not data:
            return None
        text = self._extract_text_from_pdf_bytes(data)
        return text if text else None

    async def _extract_text_from_zip(self, url: str) -> Optional[str]:
        """Download a ZIP, find PDFs inside, extract text from all."""
        data = await self._download_binary(url, MAX_ZIP_BYTES)
        if not data:
            return None
        try:
            zf = zipfile.ZipFile(io.BytesIO(data))
            texts = []
            for name in zf.namelist():
                if name.lower().endswith(".pdf"):
                    pdf_bytes = zf.read(name)
                    if len(pdf_bytes) <= MAX_PDF_BYTES:
                        text = self._extract_text_from_pdf_bytes(pdf_bytes)
                        if text:
                            texts.append(text)
            zf.close()
            return "\n\n".join(texts) if texts else None
        except Exception as e:
            logger.error(f"ZIP extraction failed for {url}: {e}")
            return None

    def _analyze_extracted_text(self, text: str, lic_doc: dict) -> Dict[str, Any]:
        """Run date/budget/expediente extraction on plain text from PDF/ZIP."""
        updates: Dict[str, Any] = {}

        # Description: use extracted text if longer than current
        current_desc = lic_doc.get("description", "") or ""
        if len(text) > len(current_desc) + 20:
            updates["description"] = text[:MAX_DESCRIPTION_LEN]

        # Opening date (only if missing)
        if not lic_doc.get("opening_date"):
            normalized = re.sub(r'\s+', ' ', text)
            patterns = [
                r"fecha\s*(?:de\s+)?(?:y\s+lugar\s+de\s+)?apertura\s*(?:de\s+ofertas)?\s*[:\s]+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}(?:\s+(?:a\s+las\s+)?\d{1,2}[:.]\d{2})?)",
                r"apertura\s+(?:de\s+(?:las\s+)?(?:propuestas|ofertas|sobres)\s+)?(?:se\s+realizará\s+el\s+)?(\d{1,2}\s+de\s+\w+\s+(?:de\s+)?\d{4}(?:\s*[,a]\s*las?\s*\d{1,2}[:.]\d{2})?)",
                r"apertura\s*[:\s]+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})",
                r"apertura[^.]{0,30}?(\d{1,2}\s+de\s+\w+\s+(?:de\s+)?\d{4})",
            ]
            for pat in patterns:
                m = re.search(pat, normalized, re.IGNORECASE)
                if m:
                    dt = parse_date_guess(m.group(1).strip())
                    if dt:
                        updates["opening_date"] = dt
                        break

        # Budget / presupuesto
        budget_val, budget_currency = self._extract_budget_from_text(text)
        if budget_val:
            meta = lic_doc.get("metadata", {}) or {}
            meta["budget_extracted"] = budget_val
            updates["metadata"] = meta
            # Promote to top-level field
            if not lic_doc.get("budget"):
                updates["budget"] = budget_val
                if not lic_doc.get("currency"):
                    updates["currency"] = budget_currency

        # Expediente
        exp_match = re.search(
            r"(?:expediente|expte\.?|EX-)\s*[:\s]*([A-Z0-9][\w\-/]+)",
            text, re.IGNORECASE
        )
        if exp_match:
            meta = updates.get("metadata", lic_doc.get("metadata", {}) or {})
            meta["expediente"] = exp_match.group(1).strip()
            updates["metadata"] = meta

        # Auto-classify category if missing (title-first to avoid pliego boilerplate noise)
        if not lic_doc.get("category"):
            from services.category_classifier import get_category_classifier
            classifier = get_category_classifier()
            title = lic_doc.get("title", "")
            cat = classifier.classify(title=title)
            if not cat:
                desc_for_classify = (updates.get("description", lic_doc.get("description", "")) or "")[:500]
                cat = classifier.classify(title=title, description=desc_for_classify)
            if cat:
                updates["category"] = cat

        if updates:
            updates["last_enrichment"] = datetime.utcnow()
            updates["updated_at"] = datetime.utcnow()
            logger.info(f"PDF/ZIP enrichment extracted {len(updates)} fields")

        return updates

    # ---- Main enrich method ----

    async def enrich(self, lic_doc: dict, selectors: Optional[dict] = None) -> Dict[str, Any]:
        """
        Fetch source_url, extract all available data.

        Args:
            lic_doc: The licitacion document from DB
            selectors: Optional CSS selectors from scraper config

        Returns:
            Dict of fields to update (empty if nothing new found)
        """
        source_url = str(lic_doc.get("source_url", "") or "")
        if not source_url:
            return {}

        # Handle binary URLs (PDF/ZIP) before attempting HTML fetch
        url_lower = source_url.lower().split("?")[0].split("#")[0]
        if url_lower.endswith(".pdf"):
            text = await self._extract_text_from_pdf_url(source_url)
            if text:
                return self._analyze_extracted_text(text, lic_doc)
        elif url_lower.endswith(".zip"):
            text = await self._extract_text_from_zip(source_url)
            if text:
                return self._analyze_extracted_text(text, lic_doc)

        try:
            html = await self.http.fetch(source_url)
        except Exception as e:
            logger.warning(f"Failed to fetch {source_url}: {e}")
            return {}

        if not html:
            return {}

        soup = BeautifulSoup(html, "html.parser")
        sel = selectors or {}
        updates: Dict[str, Any] = {}

        # 1. Extract description (update if longer than current)
        description = self._extract_description(soup, sel)
        current_desc = lic_doc.get("description", "") or ""
        if description and len(description) > len(current_desc) + 20:
            updates["description"] = description[:MAX_DESCRIPTION_LEN]

        # 2. Extract opening date (only if missing)
        if not lic_doc.get("opening_date"):
            opening = self._extract_opening_date(soup, sel)
            if opening:
                updates["opening_date"] = opening

        # 3. Extract document attachments
        attachments = self._extract_attachments(soup, source_url)
        existing = lic_doc.get("attached_files") or []
        existing_urls = {f.get("url", "") for f in existing if isinstance(f, dict)}
        new_attachments = [a for a in attachments if a["url"] not in existing_urls]
        if new_attachments:
            updates["attached_files"] = existing + new_attachments

        # 4. Extract any additional metadata from page
        extra = self._extract_extra_metadata(soup, sel)
        if extra:
            current_meta = lic_doc.get("metadata", {}) or {}
            current_meta.update(extra)
            updates["metadata"] = current_meta

        # 5. Promote budget from metadata to top-level field
        merged_meta = updates.get("metadata", lic_doc.get("metadata", {})) or {}
        if merged_meta.get("budget_extracted") and not lic_doc.get("budget"):
            updates["budget"] = merged_meta["budget_extracted"]
            if not lic_doc.get("currency"):
                updates["currency"] = "ARS"

        # 6. Auto-classify category if missing (title-first to avoid pliego boilerplate noise)
        if not lic_doc.get("category"):
            from services.category_classifier import get_category_classifier
            classifier = get_category_classifier()
            title = lic_doc.get("title", "")
            cat = classifier.classify(title=title)
            if not cat:
                desc_for_classify = (updates.get("description", lic_doc.get("description", "")) or "")[:500]
                cat = classifier.classify(title=title, description=desc_for_classify)
            if cat:
                updates["category"] = cat

        if updates:
            updates["last_enrichment"] = datetime.utcnow()
            updates["updated_at"] = datetime.utcnow()
            logger.info(f"Generic enrichment found {len(updates)} field updates for {source_url}")

        return updates

    def _extract_description(self, soup: BeautifulSoup, sel: dict) -> Optional[str]:
        """Extract main content text from the page."""
        # Try config selectors first
        for key in ("detail_description_selector", "description_selector"):
            css = sel.get(key, "")
            if css:
                el = soup.select_one(css)
                if el:
                    text = el.get_text(separator="\n", strip=True)
                    if len(text) > 30:
                        return text

        # Fallback to common selectors
        for css in CONTENT_SELECTORS:
            el = soup.select_one(css)
            if el:
                text = el.get_text(separator="\n", strip=True)
                if len(text) > 50:
                    return text

        return None

    def _extract_opening_date(self, soup: BeautifulSoup, sel: dict) -> Optional[datetime]:
        """Try to find an opening/apertura date on the page.

        Strategy:
        1. CSS selector from config (if set)
        2. Structured table cells with 'fecha de apertura' label (Rivadavia, etc.)
        3. Regex patterns on full page text (Junin, Santa Rosa, Malargue, etc.)
        """
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
                # Look for sibling or next element with the date value
                value_el = label_el.find_next_sibling()
                if not value_el:
                    value_el = label_el.find_next(["span", "td", "div", "p"])
                if value_el:
                    dt = parse_date_guess(value_el.get_text(strip=True))
                    if dt:
                        # Also look for hora de apertura nearby
                        return self._combine_date_time(dt, soup, label_el)
                # Also try parent's next sibling (for table layouts)
                parent = label_el.parent
                if parent:
                    next_cell = parent.find_next_sibling("td")
                    if next_cell:
                        dt = parse_date_guess(next_cell.get_text(strip=True))
                        if dt:
                            return dt

        # 3. Regex patterns on full page text (cleaned of HTML entities)
        text = soup.get_text(separator=" ")
        text = re.sub(r'\s+', ' ', text)  # normalize whitespace

        # Patterns ordered from most specific to least specific
        patterns = [
            # "fecha de apertura: DD/MM/YYYY" or "fecha apertura: DD/MM/YYYY HH:MM"
            r"fecha\s*(?:de\s+)?(?:y\s+lugar\s+de\s+)?apertura\s*(?:de\s+ofertas)?\s*[:\s]+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}(?:\s+(?:a\s+las\s+)?\d{1,2}[:.]\d{2})?)",
            # "apertura de las propuestas se realizará el DD de MONTH de YYYY"
            r"apertura\s+(?:de\s+(?:las\s+)?(?:propuestas|ofertas|sobres)\s+)?(?:se\s+realizará\s+el\s+)?(\d{1,2}\s+de\s+\w+\s+(?:de\s+)?\d{4}(?:\s*[,a]\s*las?\s*\d{1,2}[:.]\d{2})?)",
            # "fecha apertura de ofertas: día DD de MONTH de YYYY hora HH:MM"
            r"fecha\s*(?:de\s+)?apertura\s*(?:de\s+ofertas)?\s*[:\s]+d[ií]a\s+(\d{1,2}\s+de\s+\w+\s+(?:de\s+)?\d{4}(?:\s+hora\s+\d{1,2}[:.]\d{2})?)",
            # "fecha y lugar de apertura: [weekday] DD de MONTH de YYYY a las HH:MM"
            r"fecha\s+y\s+lugar\s+de\s+apertura\s*[:\s]+(?:(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\s+)?(\d{1,2}\s+de\s+\w+\s+(?:de\s+)?\d{4}(?:\s+a\s+las\s+\d{1,2}[:.]\d{2})?)",
            # Simple: "apertura: DD/MM/YYYY"
            r"apertura\s*[:\s]+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})",
            # "apertura ... DD de MONTH de YYYY" (looser match)
            r"apertura[^.]{0,30}?(\d{1,2}\s+de\s+\w+\s+(?:de\s+)?\d{4})",
        ]
        for pattern in patterns:
            m = re.search(pattern, text, re.IGNORECASE)
            if m:
                dt = parse_date_guess(m.group(1).strip())
                if dt:
                    return dt

        return None

    def _combine_date_time(self, date_val: datetime, soup: BeautifulSoup, near_el) -> datetime:
        """Try to find 'hora de apertura' near the date element and combine."""
        # Search nearby elements for time
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

    def _extract_attachments(self, soup: BeautifulSoup, base_url: str) -> List[dict]:
        """Find all downloadable document links on the page."""
        attachments = []
        seen_urls = set()

        for a in soup.find_all("a", href=True):
            href = a.get("href", "")
            if not href or href.startswith("#") or href.startswith("javascript"):
                continue

            # Check if it's a document link
            href_lower = href.lower()
            is_doc = any(href_lower.endswith(ext) or ext + "?" in href_lower for ext in DOC_EXTENSIONS)
            # Also check link text for document indicators
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

    def _extract_extra_metadata(self, soup: BeautifulSoup, sel: dict) -> Optional[dict]:
        """Extract any extra structured metadata (budget, expediente, etc.)."""
        meta = {}
        text = soup.get_text()

        # Look for budget/presupuesto
        budget_val, _ = self._extract_budget_from_text(text)
        if budget_val:
            meta["budget_extracted"] = budget_val

        # Look for expediente number
        exp_match = re.search(
            r"(?:expediente|expte\.?|EX-)\s*[:\s]*([A-Z0-9][\w\-/]+)",
            text, re.IGNORECASE
        )
        if exp_match:
            meta["expediente"] = exp_match.group(1).strip()

        return meta if meta else None

    async def close(self):
        """Close HTTP session."""
        if hasattr(self.http, 'close'):
            await self.http.close()
