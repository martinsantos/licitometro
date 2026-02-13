from __future__ import annotations

import hashlib
import io
import logging
import re
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from models.licitacion import LicitacionCreate
from models.scraper_config import ScraperConfig
from scrapers.base_scraper import BaseScraper
from utils.dates import last_business_days_set, parse_date_guess

logger = logging.getLogger("scraper.boletin_oficial_mendoza")

# Patrones para detectar inicio de procesos de compras/contrataciones
PROCESS_START_PATTERNS = [
    # Licitaciones
    r"(?:LLAMADO\s+(?:A\s+)?)?LICITACI[OÓ]N\s+(?:P[UÚ]BLICA|PRIVADA|ABREVIADA)?\s*(?:N[°ºoO]?\.?\s*)?(\d+[/-]?\d*)",
    r"LICITACI[OÓ]N\s+(?:P[UÚ]BLICA|PRIVADA)?\s+(?:NACIONAL|INTERNACIONAL)?",
    # Contrataciones directas
    r"CONTRATACI[OÓ]N\s+DIRECTA\s*(?:N[°ºoO]?\.?\s*)?(\d+[/-]?\d*)?",
    r"CONTRATACI[OÓ]N\s+(?:MENOR|SIMPLIFICADA)",
    # Concursos
    r"CONCURSO\s+(?:DE\s+)?PRECIOS?\s*(?:N[°ºoO]?\.?\s*)?(\d+[/-]?\d*)?",
    r"CONCURSO\s+P[UÚ]BLICO",
    # Compulsas
    r"COMPULSA\s+(?:ABREVIADA|DE\s+PRECIOS?)",
    # Comparación de precios
    r"COMPARACI[OÓ]N\s+DE\s+PRECIOS?",
    # Llamados
    r"LLAMADO\s+(?:A\s+)?(?:LICITACI[OÓ]N|CONCURSO|COMPULSA)",
    # Adjudicaciones
    r"ADJUDICACI[OÓ]N\s+(?:DEFINITIVA|PROVISORIA)?",
    # Obras
    r"OBRA\s+(?:P[UÚ]BLICA)?\s*(?:N[°ºoO]?\.?\s*)?(\d+[/-]?\d*)?",
    # Decretos y resoluciones sobre compras
    r"(?:DECRETO|RESOLUCI[OÓ]N)\s*(?:N[°ºoO]?\.?\s*)?(\d+[/-]?\d*)\s*[-–]\s*(?:ADJUDIC|LICITA|CONTRAT)",
]

# Keywords para filtrar secciones relevantes
PROCUREMENT_KEYWORDS = [
    "licitación", "licitacion", "licitaciones",
    "contratación", "contratacion", "contrataciones",
    "concurso", "concursos",
    "compulsa", "compulsas",
    "adjudicación", "adjudicacion",
    "pliego", "pliegos",
    "presupuesto oficial",
    "apertura de ofertas", "apertura de sobres",
    "llamado", "llamados",
    "obra pública", "obras públicas",
    "adquisición", "adquisicion",
    "suministro", "suministros",
    "compra", "compras directas",
    "precio testigo",
    "contratista", "contratistas",
    "proveedor", "proveedores",
]


class BoletinOficialMendozaScraper(BaseScraper):
    """
    Scraper for Boletin Oficial de Mendoza.

    Uses the official Boletin Oficial API endpoints discovered in the front-end module:
    - https://portalgateway.mendoza.gov.ar/api/boe/advance-search
    - https://portalgateway.mendoza.gov.ar/api/boe/detail (optional)

    Enhanced with PDF text extraction to:
    - Download PDF documents
    - Extract full text content
    - Segment into individual procurement processes
    - Search for specific keywords in PDF content

    Optional selectors/config:
    - selectors.keywords: list of keyword strings for filtering (default includes licitaciones terms)
    - selectors.timezone: tz name (default America/Argentina/Mendoza)
    - selectors.business_days_window: int (default 4)
    - selectors.extract_pdf_content: bool (default True) - Enable PDF text extraction
    - selectors.segment_processes: bool (default True) - Segment PDFs into individual processes
    - pagination.advance_search_url: override API endpoint
    - pagination.tipo_boletin: 1 or 2 (required by API, default 2)
    """

    DEFAULT_TZ = "America/Argentina/Mendoza"
    DEFAULT_BUSINESS_DAYS_WINDOW = 4  # hoy + 3 dias habiles hacia atras

    def __init__(self, config: ScraperConfig):
        super().__init__(config)
        self._pdf_cache: Dict[str, str] = {}  # Cache PDF text to avoid re-downloads

    def _business_date_range(self) -> tuple[str, str]:
        days = sorted(
            last_business_days_set(
                count=self.config.selectors.get(
                    "business_days_window", self.DEFAULT_BUSINESS_DAYS_WINDOW
                ),
                tz_name=self.config.selectors.get("timezone", self.DEFAULT_TZ),
            )
        )
        if not days:
            now = datetime.utcnow().date()
            return now.isoformat(), now.isoformat()
        return days[0].isoformat(), days[-1].isoformat()

    def _parse_date_from_text(self, text: str) -> Optional[datetime]:
        parsed = parse_date_guess(text)
        if parsed:
            return parsed
        match = re.search(r"(\d{1,2}[/-]\d{1,2}[/-]\d{4})", text)
        if match:
            return parse_date_guess(match.group(1))
        return None

    def _in_business_window(self, dt: Optional[datetime]) -> bool:
        if not dt:
            return False
        tz_name = self.config.selectors.get("timezone", self.DEFAULT_TZ)
        window_days = self.config.selectors.get(
            "business_days_window", self.DEFAULT_BUSINESS_DAYS_WINDOW
        )
        allowed = last_business_days_set(count=window_days, tz_name=tz_name)
        return dt.date() in allowed

    # ==================== PDF EXTRACTION METHODS ====================

    MAX_PDF_BYTES = 25 * 1024 * 1024  # 25 MB max download (pypdf uses ~2x RAM)
    MAX_PDF_PAGES = 200  # max pages to process per PDF

    async def _download_pdf(self, url: str) -> Optional[bytes]:
        """Download PDF from URL with size limit to prevent OOM."""
        if not url:
            return None
        try:
            clean_url = url.split("#")[0]
            async with self.session.get(clean_url) as response:
                if response.status != 200:
                    logger.warning(f"Failed to download PDF: {url} (status {response.status})")
                    return None

                content_type = response.headers.get("Content-Type", "")
                if "pdf" not in content_type.lower() and not clean_url.endswith(".pdf"):
                    logger.warning(f"URL is not a PDF: {clean_url} (Content-Type: {content_type})")
                    return None

                # Check Content-Length before downloading
                content_length = int(response.headers.get("Content-Length", 0))
                if content_length > self.MAX_PDF_BYTES:
                    logger.warning(f"PDF too large ({content_length / 1024 / 1024:.1f}MB > {self.MAX_PDF_BYTES / 1024 / 1024:.0f}MB limit): {url}")
                    return None

                # Stream-read with size cap
                chunks = []
                total = 0
                async for chunk in response.content.iter_chunked(64 * 1024):
                    total += len(chunk)
                    if total > self.MAX_PDF_BYTES:
                        logger.warning(f"PDF exceeded size limit during download: {url}")
                        return None
                    chunks.append(chunk)

                return b"".join(chunks)
        except Exception as exc:
            logger.error(f"Error downloading PDF {url}: {exc}")
        return None

    def _extract_text_from_pdf(self, pdf_bytes: bytes) -> str:
        """Extract text from PDF using pypdf (memory-efficient). Max pages capped."""
        from pypdf import PdfReader

        try:
            reader = PdfReader(io.BytesIO(pdf_bytes))
            num_pages = min(len(reader.pages), self.MAX_PDF_PAGES)
            text_parts = []
            for i in range(num_pages):
                page_text = reader.pages[i].extract_text()
                if page_text:
                    text_parts.append(page_text)
            if num_pages < len(reader.pages):
                logger.info(f"Processed {num_pages}/{len(reader.pages)} pages (capped)")
            return "\n\n".join(text_parts)
        except Exception as exc:
            logger.error(f"PDF text extraction failed: {exc}")
            return ""

    def _extract_text_from_pdf_page(self, pdf_bytes: bytes, page_num: int) -> str:
        """Extract text from a specific page of PDF."""
        from pypdf import PdfReader

        try:
            reader = PdfReader(io.BytesIO(pdf_bytes))
            if 0 <= page_num - 1 < len(reader.pages):
                return reader.pages[page_num - 1].extract_text() or ""
        except Exception:
            pass
        return ""

    @staticmethod
    def _extract_objeto_from_text(text: str) -> Optional[str]:
        """Extract the procurement object from PDF/HTML section text."""
        if not text:
            return None
        # Pattern 1: Explicit "Objeto:" label
        m = re.search(r"objeto\s*(?:de\s+la\s+contrataci[oó]n)?\s*:\s*(.+?)(?:\.\s|$)", text, re.IGNORECASE | re.MULTILINE)
        if m and len(m.group(1).strip()) > 10:
            return m.group(1).strip()[:200]
        # Pattern 2: "para la/el ..." phrase
        m = re.search(r"para\s+(?:la|el|los|las)\s+(.+?)(?:\.|,\s*(?:por|en|con|seg[uú]n)|$)", text, re.IGNORECASE)
        if m and len(m.group(1).strip()) > 10:
            return m.group(1).strip()[:200]
        # Pattern 3: UPPERCASE procurement keywords
        m = re.search(
            r"((?:AMPLIACION|CONSTRUCCION|PROVISION|ADQUISICION|REPARACION|"
            r"MANTENIMIENTO|INSTALACION|CONTRATACION DE|EJECUCION DE|OBRA|"
            r"SERVICIO DE|SUMINISTRO DE)[^.]{5,100})",
            text,
        )
        if m:
            return m.group(1).strip()[:200]
        # Pattern 4: Verb-phrase intro
        m = re.search(
            r"(?:adquisici[oó]n\s+de|provisi[oó]n\s+de|construcci[oó]n\s+de|"
            r"ampliaci[oó]n\s+de|mantenimiento\s+de|prestaci[oó]n\s+de|"
            r"ejecuci[oó]n\s+de|reparaci[oó]n\s+de|instalaci[oó]n\s+de|"
            r"contrataci[oó]n\s+de|servicio\s+de|suministro\s+de)"
            r"(.{5,150}?)(?:\.|,|$)",
            text, re.IGNORECASE,
        )
        if m:
            full = m.group(0).strip()[:200]
            return full
        return None

    def _segment_processes(self, text: str, source_url: str, pub_date: datetime) -> List[Dict[str, Any]]:
        """
        Segment PDF text into individual procurement processes.

        Returns a list of dicts with:
        - process_type: type of process (licitación, contratación directa, etc.)
        - process_number: extracted number if available
        - title: extracted title
        - content: full text of the process section
        - organization: extracted organization if found
        - keywords_found: list of matching keywords
        """
        processes = []

        # Build combined pattern for process detection
        combined_pattern = "|".join(f"({p})" for p in PROCESS_START_PATTERNS)
        process_regex = re.compile(combined_pattern, re.IGNORECASE | re.MULTILINE)

        # Find all process starts
        matches = list(process_regex.finditer(text))

        if not matches:
            # No explicit process markers found, try to extract based on keywords
            return self._extract_by_keywords(text, source_url, pub_date)

        # Extract each process section
        for i, match in enumerate(matches):
            start_pos = match.start()
            # End position is either next match or end of text
            end_pos = matches[i + 1].start() if i + 1 < len(matches) else len(text)

            # Extract section with some context before
            context_start = max(0, start_pos - 200)
            section_text = text[context_start:end_pos].strip()

            # Limit section size
            if len(section_text) > 5000:
                section_text = section_text[:5000] + "..."

            # Determine process type
            matched_text = match.group(0).upper()
            process_type = self._classify_process_type(matched_text)

            # Extract process number
            process_number = self._extract_process_number(matched_text)

            # Extract organization
            organization = self._extract_organization(section_text)

            # Find matching keywords
            keywords_found = self._find_keywords(section_text)

            if not keywords_found:
                # Skip if no procurement keywords found
                continue

            # Build title
            title = f"{process_type}"
            if process_number:
                title = f"{process_type} N° {process_number}"

            # Extract objeto and enrich title
            objeto = self._extract_objeto_from_text(section_text)
            if objeto:
                title = f"{title} - {objeto[:100]}"

            processes.append({
                "process_type": process_type,
                "process_number": process_number,
                "title": title,
                "objeto": objeto,
                "content": section_text,
                "organization": organization,
                "keywords_found": keywords_found,
                "source_url": source_url,
                "publication_date": pub_date,
            })

        return processes

    def _extract_by_keywords(self, text: str, source_url: str, pub_date: datetime) -> List[Dict[str, Any]]:
        """
        Extract processes by searching for keyword clusters.
        Used when no explicit process markers are found.
        """
        processes = []

        # Split text into paragraphs
        paragraphs = re.split(r'\n{2,}', text)

        current_section = []
        current_keywords = []

        for para in paragraphs:
            para_keywords = self._find_keywords(para)
            if para_keywords:
                current_section.append(para)
                current_keywords.extend(para_keywords)
            elif current_section:
                # End of relevant section
                if len(current_keywords) >= 2:  # Require at least 2 keywords
                    section_text = "\n\n".join(current_section)
                    if len(section_text) > 100:  # Minimum content length
                        process_type = self._infer_process_type(current_keywords)
                        organization = self._extract_organization(section_text)
                        processes.append({
                            "process_type": process_type,
                            "process_number": None,
                            "title": process_type,
                            "content": section_text[:5000],
                            "organization": organization,
                            "keywords_found": list(set(current_keywords)),
                            "source_url": source_url,
                            "publication_date": pub_date,
                        })
                current_section = []
                current_keywords = []

        # Handle last section
        if current_section and len(current_keywords) >= 2:
            section_text = "\n\n".join(current_section)
            if len(section_text) > 100:
                process_type = self._infer_process_type(current_keywords)
                organization = self._extract_organization(section_text)
                processes.append({
                    "process_type": process_type,
                    "process_number": None,
                    "title": process_type,
                    "content": section_text[:5000],
                    "organization": organization,
                    "keywords_found": list(set(current_keywords)),
                    "source_url": source_url,
                    "publication_date": pub_date,
                })

        return processes

    def _is_decreto(self, process_type: str, text: str = "") -> bool:
        """Check if a process is a decreto/resolución (not an actual licitación)."""
        decree_types = ("Decreto", "Resolución")
        if process_type in decree_types:
            # Only mark as decreto if title doesn't also reference a licitación
            text_upper = text.upper()
            if not any(kw in text_upper for kw in ("LICITACI", "CONTRATACI", "CONCURSO", "COMPULSA")):
                return True
        return False

    def _classify_process_type(self, matched_text: str) -> str:
        """Classify the type of procurement process from matched text."""
        text_upper = matched_text.upper()
        if "LICITACI" in text_upper:
            if "PRIVADA" in text_upper:
                return "Licitación Privada"
            elif "ABREVIADA" in text_upper:
                return "Licitación Abreviada"
            return "Licitación Pública"
        elif "CONTRATACI" in text_upper:
            if "DIRECTA" in text_upper:
                return "Contratación Directa"
            elif "MENOR" in text_upper:
                return "Contratación Menor"
            return "Contratación"
        elif "CONCURSO" in text_upper:
            if "PRECIO" in text_upper:
                return "Concurso de Precios"
            return "Concurso Público"
        elif "COMPULSA" in text_upper:
            return "Compulsa de Precios"
        elif "COMPARACI" in text_upper:
            return "Comparación de Precios"
        elif "ADJUDICACI" in text_upper:
            return "Adjudicación"
        elif "OBRA" in text_upper:
            return "Obra Pública"
        elif "DECRETO" in text_upper:
            return "Decreto"
        elif "RESOLUCI" in text_upper:
            return "Resolución"
        return "Proceso de Compra"

    def _infer_process_type(self, keywords: List[str]) -> str:
        """Infer process type from found keywords."""
        keywords_lower = [k.lower() for k in keywords]
        if any("licitaci" in k for k in keywords_lower):
            return "Licitación"
        elif any("contrataci" in k for k in keywords_lower):
            return "Contratación"
        elif any("concurso" in k for k in keywords_lower):
            return "Concurso"
        elif any("compulsa" in k for k in keywords_lower):
            return "Compulsa"
        elif any("adjudicaci" in k for k in keywords_lower):
            return "Adjudicación"
        elif any("obra" in k for k in keywords_lower):
            return "Obra Pública"
        return "Proceso de Compra"

    def _extract_process_number(self, text: str) -> Optional[str]:
        """Extract process number from text."""
        # Look for N° followed by number
        match = re.search(r"N[°ºoO]?\s*\.?\s*(\d+[/-]?\d*(?:[/-]\d+)?)", text)
        if match:
            return match.group(1)
        # Look for standalone number pattern
        match = re.search(r"(\d+[/-]\d+(?:[/-]\d+)?)", text)
        if match:
            return match.group(1)
        return None

    def _extract_organization(self, text: str) -> str:
        """Extract organization name from text."""
        patterns = [
            r"(?:MINISTERIO|SECRETAR[IÍ]A|DIRECCI[OÓ]N|SUBSECRETAR[IÍ]A|MUNICIPALIDAD|GOBIERNO)\s+(?:DE\s+)?([A-ZÁÉÍÓÚÑ\s,]+?)(?:\.|,|\n|$)",
            r"Origen:\s*([A-ZÁÉÍÓÚÑ0-9\s,.-]+?)(?:\.|,|\n|$)",
            r"(?:Organismo|Repartición|Dependencia):\s*([A-ZÁÉÍÓÚÑ0-9\s,.-]+?)(?:\.|,|\n|$)",
        ]
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                org = match.group(1).strip()
                # Clean up
                org = re.sub(r'\s+', ' ', org)
                if len(org) > 5:
                    return org[:150]  # Limit length
        return "Gobierno de Mendoza"

    def _find_keywords(self, text: str) -> List[str]:
        """Find procurement keywords in text."""
        text_lower = text.lower()
        found = []
        for kw in PROCUREMENT_KEYWORDS:
            if kw.lower() in text_lower:
                found.append(kw)
        return found

    async def _process_pdf_for_licitaciones(
        self,
        pdf_url: str,
        boletin_num: str,
        pub_date: datetime,
        base_description: Optional[str] = None
    ) -> List[LicitacionCreate]:
        """
        Download and process a PDF to extract individual licitaciones.
        """
        licitaciones = []

        # Check cache
        cache_key = hashlib.md5(pdf_url.encode()).hexdigest()
        if cache_key in self._pdf_cache:
            full_text = self._pdf_cache[cache_key]
        else:
            # Download PDF
            pdf_bytes = await self._download_pdf(pdf_url)
            if not pdf_bytes:
                logger.warning(f"Could not download PDF: {pdf_url}")
                return []

            # Extract text
            full_text = self._extract_text_from_pdf(pdf_bytes)
            if not full_text:
                logger.warning(f"Could not extract text from PDF: {pdf_url}")
                return []

            self._pdf_cache[cache_key] = full_text
            logger.info(f"Extracted {len(full_text)} chars from PDF: {pdf_url}")

        # Segment into processes
        processes = self._segment_processes(full_text, pdf_url, pub_date)

        if not processes:
            logger.debug(f"No procurement processes found in PDF: {pdf_url}")
            return []

        logger.info(f"Found {len(processes)} processes in PDF: {pdf_url}")

        # Convert to LicitacionCreate objects
        for proc in processes:
            process_number = proc.get("process_number")

            # Generate stable ID based on boletin + expediente/number (preferred) or content hash (fallback)
            if process_number:
                stable_key = f"{boletin_num}:{process_number}"
            else:
                # Fallback: hash of title + pub_date
                stable_key = hashlib.md5(
                    f"{proc['title']}|{pub_date.strftime('%Y-%m-%d')}".encode()
                ).hexdigest()[:12]

            content_hash = hashlib.md5(
                f"{proc['title']}|{proc['content'][:200]}|{pub_date.isoformat()}".encode()
            ).hexdigest()[:12]

            id_licitacion = f"boletin-mza:pdf:{stable_key}"

            # Build description
            description = proc["content"]
            if base_description and base_description not in description:
                description = f"{base_description}\n\n{description}"

            # Detect decretos
            is_decreto = self._is_decreto(proc["process_type"], proc.get("content", ""))
            tipo = "decreto" if is_decreto else None

            # VIGENCIA MODEL: Resolve dates (PDF text-based extraction)
            # pub_date comes from Boletin publication date (reliable)
            # Try to extract opening_date from content
            opening_date = self._resolve_opening_date(
                parsed_date=None,
                title=proc["title"],
                description=proc.get("content", ""),
                publication_date=pub_date,
                attached_files=[{"name": f"Boletín {boletin_num}", "url": pdf_url, "type": "pdf", "filename": f"boletin_{boletin_num}.pdf"}]
            )

            # Compute estado
            estado = self._compute_estado(pub_date, opening_date, fecha_prorroga=None)

            licitacion = LicitacionCreate(
                id_licitacion=id_licitacion,
                title=proc["title"],
                objeto=proc.get("objeto"),
                organization=proc["organization"],
                jurisdiccion="Mendoza",
                publication_date=pub_date,
                opening_date=opening_date,
                licitacion_number=process_number,
                description=description[:3000],
                status="active",
                source_url=pdf_url,
                fuente="Boletin Oficial Mendoza (PDF)",
                tipo_procedimiento=f"Boletin Oficial - {proc['process_type']}",
                tipo_acceso="Boletin Oficial",
                tipo=tipo,
                fecha_scraping=datetime.utcnow(),
                attached_files=[{"name": f"Boletín {boletin_num}", "url": pdf_url, "type": "pdf"}],
                keywords=proc.get("keywords_found", []),
                content_hash=content_hash,
                metadata={"boe_apertura_raw": proc.get("content", "")[:500]},
                estado=estado,
                fecha_prorroga=None,
            )
            licitaciones.append(licitacion)

        return licitaciones

    # ==================== END PDF EXTRACTION METHODS ====================

    async def extract_licitacion_data(self, html: str, url: str) -> Optional[LicitacionCreate]:
        # Not used: Boletin is processed as a list page
        return None

    async def extract_links(self, html: str) -> List[str]:
        # Not used: Boletin is processed as a list page
        return []

    async def get_next_page_url(self, html: str, current_url: str) -> Optional[str]:
        # API-based search: no pagination handled here
        return None

    async def _fetch_advance_search(self, keyword: Optional[str] = None, tipo_busqueda: str = "NORMA") -> Optional[str]:
        pagination = self.config.pagination or {}
        advance_url = pagination.get(
            "advance_search_url",
            "https://portalgateway.mendoza.gov.ar/api/boe/advance-search",
        )
        tipo_boletin = pagination.get("tipo_boletin", 2)
        fecha_des, fecha_has = self._business_date_range()

        payload = {
            "tipo_busqueda": tipo_busqueda,
            "tipo_boletin": str(tipo_boletin),
            "fechaPubDes": fecha_des,
            "fechaPubHas": fecha_has,
            "texto": keyword or "",
        }

        try:
            async with self.session.post(advance_url, data=payload) as response:
                if response.status < 200 or response.status >= 300:
                    logger.error(f"Advance search failed {response.status} for keyword={keyword}")
                    return None
                return await response.text()
        except Exception as exc:
            logger.error(f"Advance search error: {exc}")
            return None

    def _parse_results_html(self, html: str, keyword: Optional[str]) -> List[LicitacionCreate]:
        soup = BeautifulSoup(html, "html.parser")
        items = soup.select("table#list-table tbody tr.toggle-head")
        licitaciones: List[LicitacionCreate] = []

        strict_pattern = self.config.selectors.get(
            "strict_filter_regex",
            r"\b(licitaci[oó]n|contrataci[oó]n|concurso|convocatoria|compulsa|comparaci[oó]n de precios|adjudicaci[oó]n)\b",
        )
        strict_re = None
        if strict_pattern:
            strict_re = re.compile(strict_pattern, re.IGNORECASE)

        for row in items:
            cols = row.find_all("td")
            if len(cols) < 5:
                continue

            tipo = cols[0].get_text(strip=True)
            norma = cols[1].get_text(strip=True)
            fec_pro = cols[2].get_text(strip=True)
            fec_pub = cols[3].get_text(strip=True)
            boletin_col = cols[4]
            boletin_link = None
            boletin_num = boletin_col.get_text(strip=True)
            link = boletin_col.find("a", href=True)
            if link:
                boletin_link = link.get("href")

            pub_dt = self._parse_date_from_text(fec_pub)
            if not self._in_business_window(pub_dt):
                continue

            # Find the next toggle-body for extra info
            details_row = row.find_next_sibling("tr", class_="toggle-body")
            description = None
            organization = "Boletin Oficial Mendoza"
            attached_files = []

            if details_row:
                details_text = details_row.get_text(" ", strip=True)
                description = details_text[:1000] if details_text else None
                # Try to extract Origen
                origin_match = re.search(r"Origen:\s*([A-ZÁÉÍÓÚÑ0-9 ,.-]+)", details_text or "")
                if origin_match:
                    organization = origin_match.group(1).strip()
                # Try to extract page number for PDF deep link
                page_num = None
                page_match = re.search(r"(?:Pág\.?|Página)\s*(\d+)", details_text or "", re.IGNORECASE)
                if page_match:
                    page_num = page_match.group(1)
                # Attach 'Texto Publicado' link if present
                texto_link = details_row.find("a", string=re.compile(r"Texto Publicado", re.IGNORECASE))
                if texto_link and texto_link.get("href"):
                    pdf_url = texto_link.get("href")
                    if page_num:
                        pdf_url = f"{pdf_url}#page={page_num}"
                    attached_files.append(
                        {
                            "name": "Texto Publicado",
                            "url": pdf_url,
                            "type": "pdf",
                        }
                    )

            # Second strict filter to reduce noise
            if strict_re:
                combined_text = " ".join(filter(None, [tipo, norma, description or "", keyword or ""]))
                if not strict_re.search(combined_text):
                    continue

            if boletin_link:
                pdf_url = boletin_link
                page_match = re.search(r"(?:Pág\.?|Página)\s*(\d+)", (description or ""), re.IGNORECASE)
                if page_match:
                    pdf_url = f"{boletin_link}#page={page_match.group(1)}"
                attached_files.append(
                    {"name": f"Boletin {boletin_num}", "url": pdf_url, "type": "pdf"}
                )

            title = f"{tipo} {norma}".strip()
            # Extract objeto and enrich title
            objeto = None
            if description:
                objeto = self._extract_objeto_from_text(description)
                if objeto:
                    title = f"{title} - {objeto[:100]}"

            # Stable ID: use norma number (unique per boletin)
            id_licitacion = f"boletin-mza:norma:{norma}" if norma else f"boletin-mza:norma:{boletin_num}:{hashlib.md5(title.encode()).hexdigest()[:8]}"

            # Detect decretos
            is_decreto = tipo.upper().startswith("DECRETO") or tipo.upper().startswith("RESOLUCI")
            # But not if the description references an actual licitación
            if is_decreto and description:
                desc_upper = description.upper()
                if any(kw in desc_upper for kw in ("LICITACI", "CONTRATACI", "CONCURSO", "COMPULSA")):
                    is_decreto = False

            # VIGENCIA MODEL: Resolve dates with multi-source fallback
            publication_date = self._resolve_publication_date(
                parsed_date=pub_dt,  # API publication date
                title=title or "",
                description=description or "",
                opening_date=None,
                attached_files=attached_files
            )

            opening_date = self._resolve_opening_date(
                parsed_date=None,
                title=title or "",
                description=description or "",
                publication_date=publication_date,
                attached_files=attached_files
            )

            # Compute estado
            estado = self._compute_estado(publication_date, opening_date, fecha_prorroga=None)

            licitacion = LicitacionCreate(
                id_licitacion=id_licitacion,
                title=title or "Boletin Oficial Mendoza",
                objeto=objeto,
                organization=organization,
                jurisdiccion="Mendoza",
                publication_date=publication_date,  # Can be None (no fallback!)
                opening_date=opening_date,
                licitacion_number=norma or None,
                description=description,
                status="active",
                source_url=boletin_link or self.config.url,
                fuente="Boletin Oficial Mendoza",
                tipo_procedimiento="Boletin Oficial - Norma",
                tipo_acceso="Boletin Oficial",
                tipo="decreto" if is_decreto else None,
                fecha_scraping=datetime.utcnow(),
                attached_files=attached_files,
                keywords=[keyword] if keyword else [],
                metadata={"boe_apertura_raw": description[:500] if description else ""},
                estado=estado,
                fecha_prorroga=None,
            )
            licitaciones.append(licitacion)

        return licitaciones

    async def run(self) -> List[LicitacionCreate]:
        await self.setup()
        try:
            include_all = self.config.selectors.get("include_all", False)
            extract_pdf = self.config.selectors.get("extract_pdf_content", True)
            segment_processes = self.config.selectors.get("segment_processes", True)

            keywords = self.config.selectors.get(
                "keywords",
                [
                    "licitacion",
                    "licitación",
                    "contratacion",
                    "contratación",
                    "concurso",
                    "convocatoria",
                    "compulsa",
                    "comparacion de precios",
                    "adjudicacion",
                    "adjudicación",
                ],
            )
            licitaciones: List[LicitacionCreate] = []
            pdf_urls_processed: set = set()

            if include_all:
                tipos = self.config.selectors.get("include_types", ["NORMA", "EDICTO"])
                for t in tipos:
                    html = await self._fetch_advance_search(keyword=None, tipo_busqueda=t)
                    if html:
                        parsed = self._parse_results_html(html, keyword=None)
                        licitaciones.extend(parsed)

                        # Extract PDFs for deep processing
                        if extract_pdf and segment_processes:
                            for lic in parsed:
                                for att in lic.attached_files or []:
                                    pdf_url = att.get("url", "")
                                    if pdf_url and pdf_url not in pdf_urls_processed:
                                        pdf_urls_processed.add(pdf_url)
                                        # Get boletin number from attachment name
                                        boletin_num = att.get("name", "").replace("Boletin ", "").strip()
                                        pdf_lics = await self._process_pdf_for_licitaciones(
                                            pdf_url,
                                            boletin_num or "unknown",
                                            lic.publication_date,
                                            lic.description
                                        )
                                        licitaciones.extend(pdf_lics)
            else:
                for keyword in keywords:
                    html = await self._fetch_advance_search(keyword=keyword, tipo_busqueda="NORMA")
                    if not html:
                        continue
                    parsed = self._parse_results_html(html, keyword=keyword)
                    licitaciones.extend(parsed)

                    # Extract PDFs for deep processing
                    if extract_pdf and segment_processes:
                        for lic in parsed:
                            for att in lic.attached_files or []:
                                pdf_url = att.get("url", "")
                                if pdf_url and pdf_url not in pdf_urls_processed:
                                    pdf_urls_processed.add(pdf_url)
                                    boletin_num = att.get("name", "").replace("Boletin ", "").strip()
                                    pdf_lics = await self._process_pdf_for_licitaciones(
                                        pdf_url,
                                        boletin_num or "unknown",
                                        lic.publication_date,
                                        lic.description
                                    )
                                    licitaciones.extend(pdf_lics)

                    if self.config.max_items and len(licitaciones) >= self.config.max_items:
                        break

                # Fallback: if no results with keywords, run a broad query and rely on strict filter
                if not licitaciones:
                    html = await self._fetch_advance_search(keyword=None, tipo_busqueda="NORMA")
                    if html:
                        parsed = self._parse_results_html(html, keyword=None)
                        licitaciones.extend(parsed)

                        if extract_pdf and segment_processes:
                            for lic in parsed:
                                for att in lic.attached_files or []:
                                    pdf_url = att.get("url", "")
                                    if pdf_url and pdf_url not in pdf_urls_processed:
                                        pdf_urls_processed.add(pdf_url)
                                        boletin_num = att.get("name", "").replace("Boletin ", "").strip()
                                        pdf_lics = await self._process_pdf_for_licitaciones(
                                            pdf_url,
                                            boletin_num or "unknown",
                                            lic.publication_date,
                                            lic.description
                                        )
                                        licitaciones.extend(pdf_lics)

            # Deduplicate by id_licitacion
            seen_ids = set()
            unique_lics = []
            for lic in licitaciones:
                if lic.id_licitacion not in seen_ids:
                    seen_ids.add(lic.id_licitacion)
                    unique_lics.append(lic)

            # Ordenar por fecha de publicacion (mas reciente primero)
            unique_lics.sort(key=lambda l: l.publication_date, reverse=True)

            logger.info(f"Boletin scraper found {len(unique_lics)} licitaciones ({len(pdf_urls_processed)} PDFs processed)")
            return unique_lics
        finally:
            await self.cleanup()
