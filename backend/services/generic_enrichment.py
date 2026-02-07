"""
Generic Enrichment Service - Re-fetches source_url for any licitacion source
and extracts description, dates, and document attachments.

For sources with scraper configs (GenericHtmlScraper), uses CSS selectors
for targeted extraction. Otherwise falls back to common HTML patterns.
"""

import logging
import re
from datetime import datetime
from typing import Dict, Any, List, Optional
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from scrapers.resilient_http import ResilientHttpClient
from utils.dates import parse_date_guess

logger = logging.getLogger("generic_enrichment")

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
            updates["description"] = description[:5000]

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
        """Try to find an opening/apertura date on the page."""
        # Try config selector
        for key in ("detail_opening_date_selector", "opening_date_selector"):
            css = sel.get(key, "")
            if css:
                el = soup.select_one(css)
                if el:
                    dt = parse_date_guess(el.get_text(strip=True))
                    if dt:
                        return dt

        # Look for apertura text patterns in the page
        text = soup.get_text()
        patterns = [
            r"(?:apertura|fecha\s+de\s+apertura)[:\s]+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}(?:\s+\d{1,2}:\d{2})?)",
            r"(?:apertura|fecha\s+de\s+apertura)[:\s]+(\d{1,2}\s+de\s+\w+\s+(?:de\s+)?\d{4})",
        ]
        for pattern in patterns:
            m = re.search(pattern, text, re.IGNORECASE)
            if m:
                dt = parse_date_guess(m.group(1))
                if dt:
                    return dt

        return None

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
        budget_match = re.search(
            r"(?:presupuesto|monto|importe)\s*(?:oficial|estimado)?[:\s]*\$?\s*([\d.,]+)",
            text, re.IGNORECASE
        )
        if budget_match:
            try:
                amount_str = budget_match.group(1).replace(".", "").replace(",", ".")
                meta["budget_extracted"] = float(amount_str)
            except (ValueError, IndexError):
                pass

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
