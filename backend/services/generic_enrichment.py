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
                meta["budget_source"] = "extracted_from_text"

        # Expediente
        exp_match = re.search(
            r"(?:expediente|expte\.?|EX-)\s*[:\s]*([A-Z0-9][\w\-/]+)",
            text, re.IGNORECASE
        )
        if exp_match:
            meta = updates.get("metadata", lic_doc.get("metadata", {}) or {})
            meta["expediente"] = exp_match.group(1).strip()
            updates["metadata"] = meta

        # Synthesize objeto if missing
        if not lic_doc.get("objeto"):
            from utils.object_extractor import extract_objeto
            obj = extract_objeto(
                title=lic_doc.get("title", ""),
                description=updates.get("description", lic_doc.get("description", "")),
                metadata=updates.get("metadata", lic_doc.get("metadata", {})),
            )
            if obj:
                updates["objeto"] = obj

        # Improve title if it's just a number/code
        from utils.object_extractor import is_poor_title
        current_title = lic_doc.get("title", "")
        if is_poor_title(current_title):
            meta = updates.get("metadata", lic_doc.get("metadata", {})) or {}
            pliego = meta.get("comprar_pliego_fields", {})
            if isinstance(pliego, dict):
                better = pliego.get("Nombre descriptivo del proceso") or pliego.get("Nombre descriptivo de proceso")
                if better and len(better.strip()) > 10:
                    updates["title"] = better.strip()

        # Auto-classify category if missing (title-first to avoid pliego boilerplate noise)
        if not lic_doc.get("category"):
            from services.category_classifier import get_category_classifier
            classifier = get_category_classifier()
            title = updates.get("title", lic_doc.get("title", ""))
            objeto = updates.get("objeto", lic_doc.get("objeto", ""))
            cat = classifier.classify(title=title, objeto=objeto)
            if not cat:
                desc_for_classify = (updates.get("description", lic_doc.get("description", "")) or "")[:500]
                cat = classifier.classify(title=title, objeto=objeto, description=desc_for_classify)
            if cat:
                updates["category"] = cat

        if updates:
            updates["last_enrichment"] = datetime.utcnow()
            updates["updated_at"] = datetime.utcnow()
            logger.info(f"PDF/ZIP enrichment extracted {len(updates)} fields")

        return updates

    # ---- COMPR.AR enrichment ----

    async def _enrich_comprar(self, lic_doc: dict, source_url: str) -> Dict[str, Any]:
        """Enrich COMPR.AR items using label-based extraction from pliego pages.

        VistaPreviaPliegoCiudadano URLs are stable and contain label/sibling pairs.
        ComprasElectronicas URLs are session-dependent — try metadata for a better URL.
        """
        # Determine the best URL to fetch
        fetch_url = source_url
        meta = lic_doc.get("metadata", {}) or {}

        if "VistaPreviaPliegoCiudadano" not in source_url:
            # source_url is ComprasElectronicas (session-dependent, useless).
            # Check metadata for a stable pliego URL.
            pliego_url = meta.get("comprar_pliego_url", "")
            if pliego_url and "VistaPreviaPliegoCiudadano" in pliego_url:
                fetch_url = pliego_url
            else:
                # No stable URL available — do title-only enrichment
                logger.debug(f"COMPR.AR: no stable pliego URL for {source_url[:60]}")
                return self._enrich_comprar_title_only(lic_doc)

        try:
            html = await self.http.fetch(fetch_url)
        except Exception as e:
            logger.warning(f"COMPR.AR fetch failed: {e}")
            return self._enrich_comprar_title_only(lic_doc)

        if not html:
            return self._enrich_comprar_title_only(lic_doc)

        soup = BeautifulSoup(html, "html.parser")
        labels = soup.find_all("label")
        if not labels:
            # Page didn't render properly (portal homepage instead of detail)
            logger.warning(f"COMPR.AR: no labels found at {fetch_url[:60]} — portal page?")
            return self._enrich_comprar_title_only(lic_doc)

        # Extract label → value pairs
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
            return self._enrich_comprar_title_only(lic_doc)

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
                budget_val, _ = self._extract_budget_from_text(f"presupuesto: {raw}")
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
            updates["last_enrichment"] = datetime.utcnow()
            updates["updated_at"] = datetime.utcnow()
            logger.info(f"COMPR.AR enrichment: {len(fields)} pliego fields, {len(updates)} updates")

        return updates

    def _enrich_comprar_title_only(self, lic_doc: dict) -> Dict[str, Any]:
        """Fallback enrichment for COMPR.AR items without stable pliego URL.
        Extracts objeto and category from existing title/description."""
        updates: Dict[str, Any] = {}

        if not lic_doc.get("objeto"):
            from utils.object_extractor import extract_objeto
            obj = extract_objeto(
                title=lic_doc.get("title", ""),
                description=lic_doc.get("description", "") or "",
                metadata=lic_doc.get("metadata", {}),
            )
            if obj:
                updates["objeto"] = obj

        if not lic_doc.get("category"):
            from services.category_classifier import get_category_classifier
            classifier = get_category_classifier()
            title = lic_doc.get("title", "")
            objeto = updates.get("objeto", lic_doc.get("objeto", ""))
            cat = classifier.classify(title=title, objeto=objeto)
            if cat:
                updates["category"] = cat

        return updates

    # Alias: title-only enrichment works the same for any source
    _enrich_title_only = _enrich_comprar_title_only

    def _find_best_alt_url(self, source_urls: dict) -> Optional[str]:
        """Find the best alternative URL from source_urls dict, skipping proxies and list pages."""
        if not source_urls:
            return None
        for key in sorted(source_urls.keys()):
            url = source_urls[key]
            if not url or not isinstance(url, str):
                continue
            if "localhost:" in url:
                continue
            # Prefer detail pages over list pages
            if "detail" in key or "pliego" in key:
                return url
        # Fallback: any non-proxy URL
        for url in source_urls.values():
            if url and isinstance(url, str) and "localhost:" not in url:
                return url
        return None

    async def _enrich_osep_postback(self, lic_doc: dict, list_url: str, target: str) -> Dict[str, Any]:
        """Enrich OSEP licitacion by fetching the list page and doing ASP.NET postback.
        OSEP uses the same COMPR.AR portal architecture — ASP.NET WebForms with __doPostBack."""
        import re
        try:
            # Step 1: Fetch the list page to get ASP.NET hidden fields
            list_html = await self.http.fetch(list_url)
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

            # Step 2: Postback to navigate to the process detail page
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

            # Step 3: Extract data from the detail page (same label-based extraction as OsepScraper)
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

            # Opening date
            from utils.dates import parse_date_guess
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

            # Attached files
            from urllib.parse import urljoin
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

            # Extract objeto
            if not lic_doc.get("objeto"):
                from utils.object_extractor import extract_objeto
                obj = extract_objeto(
                    title=lic_doc.get("title", ""),
                    description=updates.get("description", lic_doc.get("description", "") or ""),
                    metadata=lic_doc.get("metadata", {}),
                )
                if obj:
                    updates["objeto"] = obj

            # Classify category
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

            # Update enrichment level
            if updates:
                updates["enrichment_level"] = max(lic_doc.get("enrichment_level", 1), 2)

            logger.info(f"OSEP postback enrichment: {len(updates)} fields extracted")
            return updates

        except Exception as e:
            logger.error(f"OSEP postback enrichment failed: {e}")
            return {}

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
        source_urls = lic_doc.get("source_urls") or {}

        # No URL at all — title-only enrichment
        if not source_url and not source_urls:
            return self._enrich_title_only(lic_doc)

        # COMPR.AR: VistaPreviaPliegoCiudadano URLs are STABLE and contain rich data.
        # Works for both Mendoza (comprar.mendoza.gov.ar) and Nacional (comprar.gob.ar).
        if source_url and "qs=" in source_url and (
            "comprar.mendoza.gov.ar" in source_url or "comprar.gob.ar" in source_url
        ):
            return await self._enrich_comprar(lic_doc, source_url)

        # Handle binary URLs (PDF/ZIP) before attempting HTML fetch
        if source_url:
            url_lower = source_url.lower().split("?")[0].split("#")[0]
            is_pdf_url = url_lower.endswith(".pdf") or "/verpdf/" in url_lower or "/getpdf/" in url_lower or "/download/pdf" in url_lower
            if is_pdf_url:
                text = await self._extract_text_from_pdf_url(source_url)
                if text:
                    return self._analyze_extracted_text(text, lic_doc)
            elif url_lower.endswith(".zip"):
                text = await self._extract_text_from_zip(source_url)
                if text:
                    return self._analyze_extracted_text(text, lic_doc)

        # Broken proxy URLs (e.g., localhost:8001 for OSEP) — try real URL first
        if source_url and "localhost:" in source_url and ":8000" not in source_url:
            logger.debug(f"Proxy URL detected: {source_url[:60]}")
            # OSEP: try to fetch via real list URL + postback
            osep_list = source_urls.get("osep_list", "")
            osep_target = (lic_doc.get("metadata") or {}).get("osep_target", "")
            if osep_list and osep_target:
                logger.info(f"OSEP enrichment via postback: {osep_list[:60]}")
                result = await self._enrich_osep_postback(lic_doc, osep_list, osep_target)
                if result:
                    return result
            # Try any alternative URL from source_urls
            alt_url = self._find_best_alt_url(source_urls)
            if alt_url:
                source_url = alt_url
                logger.info(f"Using alternative URL: {alt_url[:80]}")
            else:
                return self._enrich_title_only(lic_doc)

        try:
            html = await self.http.fetch(source_url)
        except Exception as e:
            logger.warning(f"Failed to fetch {source_url}: {e}")
            # Fallback: try attached files, then title-only
            result = await self._enrich_from_attached_files(lic_doc)
            if not result:
                result = self._enrich_title_only(lic_doc)
            return result

        if not html:
            return self._enrich_title_only(lic_doc)

        # Safety: if fetched content looks like binary PDF (starts with %PDF), treat as PDF
        if html.lstrip()[:5] == "%PDF-":
            logger.info(f"Content-type mismatch: URL returned PDF binary: {source_url[:80]}")
            text = await self._extract_text_from_pdf_url(source_url)
            if text:
                return self._analyze_extracted_text(text, lic_doc)
            return self._enrich_title_only(lic_doc)

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
            merged_meta["budget_source"] = "extracted_from_text"
            updates["metadata"] = merged_meta

        # 6. Synthesize objeto if missing
        if not lic_doc.get("objeto"):
            from utils.object_extractor import extract_objeto
            obj = extract_objeto(
                title=lic_doc.get("title", ""),
                description=updates.get("description", lic_doc.get("description", "")),
                metadata=updates.get("metadata", lic_doc.get("metadata", {})),
            )
            if obj:
                updates["objeto"] = obj

        # 7. Improve title if it's just a number/code
        from utils.object_extractor import is_poor_title
        current_title = lic_doc.get("title", "")
        if is_poor_title(current_title):
            meta = updates.get("metadata", lic_doc.get("metadata", {})) or {}
            pliego = meta.get("comprar_pliego_fields", {})
            if isinstance(pliego, dict):
                better = pliego.get("Nombre descriptivo del proceso") or pliego.get("Nombre descriptivo de proceso")
                if better and len(better.strip()) > 10:
                    updates["title"] = better.strip()

        # 8. Auto-classify category if missing (title-first to avoid pliego boilerplate noise)
        if not lic_doc.get("category"):
            from services.category_classifier import get_category_classifier
            classifier = get_category_classifier()
            title = updates.get("title", lic_doc.get("title", ""))
            objeto = updates.get("objeto", lic_doc.get("objeto", ""))
            cat = classifier.classify(title=title, objeto=objeto)
            if not cat:
                desc_for_classify = (updates.get("description", lic_doc.get("description", "")) or "")[:500]
                cat = classifier.classify(title=title, objeto=objeto, description=desc_for_classify)
            if cat:
                updates["category"] = cat

        # 9. Check for prórroga (date extension) via keywords or date change
        new_opening = updates.get("opening_date")
        current_opening = lic_doc.get("opening_date")
        new_description = updates.get("description", lic_doc.get("description", "")) or ""

        # Keywords that indicate prórroga
        prorroga_keywords = [
            "prorroga", "prórroga", "extension", "extensión",
            "modificacion de fecha", "modificación de fecha",
            "nuevo plazo", "ampliacion de plazo", "ampliación de plazo",
            "postergacion", "postergación"
        ]
        has_prorroga_keyword = any(kw in new_description.lower() for kw in prorroga_keywords)

        # Detect prórroga if:
        # 1. Opening date increased, OR
        # 2. Prórroga keyword found AND opening date present
        if new_opening and current_opening and new_opening > current_opening:
            # Date increased - confirmed prórroga
            updates["fecha_prorroga"] = new_opening
            updates["estado"] = "prorrogada"
            meta = updates.get("metadata", lic_doc.get("metadata", {})) or {}
            meta["circular_prorroga"] = {
                "old_date": current_opening,
                "new_date": new_opening,
                "detected_at": datetime.utcnow(),
                "detection_method": "date_change"
            }
            updates["metadata"] = meta
            logger.info(f"Prórroga detected (date change): {current_opening.date()} → {new_opening.date()}")
        elif has_prorroga_keyword and (new_opening or current_opening):
            # Keyword found - mark as prórroga
            effective_opening = new_opening or current_opening
            updates["fecha_prorroga"] = effective_opening
            updates["estado"] = "prorrogada"
            meta = updates.get("metadata", lic_doc.get("metadata", {})) or {}
            meta["circular_prorroga"] = {
                "old_date": current_opening,
                "new_date": effective_opening,
                "detected_at": datetime.utcnow(),
                "detection_method": "keyword"
            }
            updates["metadata"] = meta
            logger.info(f"Prórroga detected (keyword): fecha_prorroga = {effective_opening.date()}")

        # GUARANTEE: Always try objeto+category extraction even if HTML yielded nothing new
        # This ensures every enrichment run produces at least title-derived fields
        if not updates.get("objeto") and not lic_doc.get("objeto"):
            from utils.object_extractor import extract_objeto
            obj = extract_objeto(
                title=lic_doc.get("title", ""),
                description=updates.get("description", lic_doc.get("description", "") or ""),
                metadata=updates.get("metadata", lic_doc.get("metadata", {})),
            )
            if obj:
                updates["objeto"] = obj

        if not updates.get("category") and not lic_doc.get("category"):
            from services.category_classifier import get_category_classifier
            classifier = get_category_classifier()
            title = updates.get("title", lic_doc.get("title", ""))
            objeto = updates.get("objeto", lic_doc.get("objeto", ""))
            desc_short = (updates.get("description", lic_doc.get("description", "")) or "")[:500]
            cat = classifier.classify(title=title, objeto=objeto, description=desc_short)
            if cat:
                updates["category"] = cat

        # Always bump enrichment_level if we extracted anything
        if updates:
            updates["enrichment_level"] = max(lic_doc.get("enrichment_level", 1), 2)
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

    async def _enrich_from_attached_files(self, lic_doc: dict) -> Dict[str, Any]:
        """Extract enrichment data from attached PDF/ZIP files."""
        attached = lic_doc.get("attached_files") or []
        if not attached:
            return {}

        for file_obj in attached:
            if not isinstance(file_obj, dict):
                continue
            file_url = file_obj.get("url", "")
            file_type = file_obj.get("type", "").lower()

            if file_type == "pdf":
                text = await self._extract_text_from_pdf_url(file_url)
                if text:
                    logger.info(f"Enriched from attached PDF: {file_url[:60]}...")
                    return self._analyze_extracted_text(text, lic_doc)
            elif file_type == "zip":
                text = await self._extract_text_from_zip(file_url)
                if text:
                    logger.info(f"Enriched from attached ZIP: {file_url[:60]}...")
                    return self._analyze_extracted_text(text, lic_doc)

        return {}

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
