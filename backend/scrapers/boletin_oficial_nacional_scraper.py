"""
Scraper for Boletín Oficial de la República Argentina - Tercera Sección (Contrataciones).
URL: https://www.boletinoficial.gob.ar/seccion/tercera

The site uses server-rendered HTML with AJAX infinite scroll pagination.
List page has <a href="/detalleAviso/tercera/{ID}/{DATE}"> links grouped under <h5> categories.
Detail pages have structured fields in table cells within #detalleAviso.
"""
from typing import List, Dict, Any, Optional
import asyncio
import logging
import re
from datetime import datetime
from bs4 import BeautifulSoup
from urllib.parse import urljoin
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from models.scraper_config import ScraperConfig
from models.licitacion import LicitacionCreate
from scrapers.base_scraper import BaseScraper
from utils.dates import utc_now

logger = logging.getLogger("scraper.boletin_oficial_nacional")

BASE_URL = "https://www.boletinoficial.gob.ar"


class BoletinOficialNacionalScraper(BaseScraper):
    """Scraper for Argentina's national official gazette (3rd section - procurements)."""

    def __init__(self, config: ScraperConfig):
        super().__init__(config)
        self.section_url = config.selectors.get(
            "section_url",
            f"{BASE_URL}/seccion/tercera",
        )

    async def run(self) -> List[LicitacionCreate]:
        await self.setup()
        try:
            return await self._scrape_section()
        finally:
            await self.cleanup()

    async def _scrape_section(self) -> List[LicitacionCreate]:
        """Scrape the third section (contrataciones) of the gazette."""
        max_items = self.config.max_items or 100

        html = await self.fetch_page(self.section_url)
        if not html:
            logger.error("Failed to fetch Boletin Oficial Nacional")
            return []

        # Parse notice links from list page
        notices = self._parse_notice_links(html)
        logger.info(f"Found {len(notices)} notice links on first page")

        if not notices:
            return []

        # Fetch AJAX pages for more notices if needed
        max_pages = int(self.config.selectors.get("max_pages", 3))
        if len(notices) < max_items and max_pages > 1:
            for page_num in range(1, max_pages):
                ajax_url = f"{BASE_URL}/seccion/actualizar/0?pag={page_num}"
                raw = await self.fetch_page(ajax_url)
                if not raw:
                    break
                # AJAX response may be JSON with 'html' field or raw HTML
                ajax_html = raw
                if raw.strip().startswith("{"):
                    try:
                        import json
                        data = json.loads(raw)
                        ajax_html = data.get("html", "")
                        if not data.get("hayMasResultadosSeccion", True):
                            break
                    except Exception:
                        pass
                more = self._parse_notice_links(ajax_html)
                if not more:
                    break
                notices.extend(more)
                logger.info(f"AJAX page {page_num}: {len(more)} notices (total: {len(notices)})")

        notices = notices[:max_items]

        # Parallel detail page fetching with semaphore
        sem = asyncio.Semaphore(5)

        async def _fetch_detail(notice):
            async with sem:
                detail_html = await self.fetch_page(notice["url"])
                if detail_html:
                    notice["detail_html"] = detail_html
                return notice

        notices = await asyncio.gather(*[_fetch_detail(n) for n in notices])

        # Build LicitacionCreate objects
        items = []
        for notice in notices:
            lic = self._build_licitacion(notice)
            if lic:
                items.append(lic)

        logger.info(f"BoletinOficialNacional: fetched {len(items)} items")
        return items

    def _parse_notice_links(self, html: str) -> List[Dict[str, Any]]:
        """Extract notice links and category from HTML."""
        soup = BeautifulSoup(html, "html.parser")
        notices = []
        current_category = ""

        # Walk through elements to track h5 categories
        for elem in soup.find_all(["h5", "a"]):
            if elem.name == "h5":
                current_category = elem.get_text(strip=True)
                continue

            href = elem.get("href", "")
            if "/detalleAviso/tercera/" not in href:
                continue

            full_url = urljoin(BASE_URL, href)
            link_text = elem.get_text(" ", strip=True)

            # Extract org and title from link text
            # Format: "ORG_NAME Licitación Tipo Number" or "ORG_NAME Contratación Directa Number"
            org, title = self._split_org_title(link_text)

            # Extract aviso ID from URL: /detalleAviso/tercera/{ID}/{DATE}
            id_match = re.search(r"/detalleAviso/tercera/(\d+)/(\d+)", href)
            aviso_id = id_match.group(1) if id_match else ""
            date_str = id_match.group(2) if id_match else ""

            notices.append({
                "url": full_url,
                "aviso_id": aviso_id,
                "date_str": date_str,
                "org": org,
                "title": title,
                "full_text": link_text,
                "category": current_category,
            })

        return notices

    def _split_org_title(self, text: str) -> tuple:
        """Split link text into organization and procurement title."""
        # Try to split on procurement type keywords
        patterns = [
            r"(.*?)\s+(Licitaci[oó]n\s+.+)",
            r"(.*?)\s+(Contrataci[oó]n\s+.+)",
            r"(.*?)\s+(Concurso\s+.+)",
            r"(.*?)\s+(Subasta\s+.+)",
            r"(.*?)\s+(Adquisici[oó]n\s+.+)",
        ]
        for pat in patterns:
            m = re.match(pat, text, re.I)
            if m and len(m.group(1)) > 3:
                return m.group(1).strip(), m.group(2).strip()

        # Fallback: use full text as title
        return "Gobierno Nacional", text

    def _build_licitacion(self, notice: Dict[str, Any]) -> Optional[LicitacionCreate]:
        """Build LicitacionCreate from notice dict with optional detail HTML."""
        try:
            title = notice["title"]
            org = notice["org"]
            aviso_id = notice.get("aviso_id", "")
            category = notice.get("category", "")
            detail_html = notice.get("detail_html")

            # Parse detail page for structured fields
            description = ""
            expediente = None
            budget = None
            opening_date_parsed = None
            pub_date_parsed = None
            objeto = None

            attached_files: List[Dict[str, Any]] = []
            if detail_html:
                detail = self._parse_detail_page(detail_html, base_url=notice.get("url") or BASE_URL)
                description = detail.get("description", "")
                expediente = detail.get("expediente")
                budget = detail.get("budget")
                opening_date_parsed = detail.get("opening_date")
                pub_date_parsed = detail.get("publication_date")
                objeto = detail.get("objeto")
                attached_files = detail.get("attached_files", []) or []
                if detail.get("org"):
                    org = detail["org"]
                if detail.get("title") and len(detail["title"]) > len(title):
                    title = detail["title"]

            # Extract licitacion_number from title (e.g. "LPU-1-2026", "Licitación Pública N° 5/2024")
            licitacion_number = None
            lic_num_match = re.search(
                r"\b(LP[UN]?|CD|LPR|CP)\s*[-\s]?\s*(\d+[-/]\d+(?:[-/]\d{2,4})?)",
                title,
                re.I,
            )
            if lic_num_match:
                licitacion_number = f"{lic_num_match.group(1).upper()}-{lic_num_match.group(2)}"
            else:
                num_match = re.search(
                    r"(?:Licitaci[oó]n\s+(?:P[uú]blica|Privada)|Contrataci[oó]n\s+Directa|Concurso)\s*(?:N[°º.]?)?\s*([\d]+[-/][\d]+(?:[-/][\d]{2,4})?)",
                    title,
                    re.I,
                )
                if num_match:
                    licitacion_number = num_match.group(1)

            # Parse publication date from URL date string (YYYYMMDD)
            if not pub_date_parsed and notice.get("date_str"):
                try:
                    pub_date_parsed = datetime.strptime(notice["date_str"], "%Y%m%d")
                except ValueError:
                    pass

            publication_date = self._resolve_publication_date(
                parsed_date=pub_date_parsed, title=title,
                description=description[:1000],
            )
            opening_date = self._resolve_opening_date(
                parsed_date=opening_date_parsed, title=title,
                description=description[:1000],
                publication_date=publication_date,
            )
            estado = self._compute_estado(publication_date, opening_date)

            from utils.object_extractor import extract_objeto
            if not objeto:
                objeto = extract_objeto(title, description[:1000] if description else "", None)

            # Determine tipo_procedimiento from title
            tipo = "Contratación Pública"
            title_lower = title.lower()
            if "directa" in title_lower:
                tipo = "Contratación Directa"
            elif "privada" in title_lower:
                tipo = "Licitación Privada"
            elif "pública" in title_lower:
                tipo = "Licitación Pública"
            elif "concurso" in title_lower:
                tipo = "Concurso"

            return LicitacionCreate(
                id_licitacion=f"bo-nac-{aviso_id}" if aviso_id else f"bo-nac-{abs(hash(title))}",
                title=title[:500],
                organization=org[:200],
                publication_date=publication_date,
                opening_date=opening_date,
                description=description[:2000] if description else None,
                expedient_number=expediente,
                licitacion_number=licitacion_number,
                budget=budget,
                currency="ARS" if budget else None,
                source_url=notice["url"],
                fuente=self.config.name,
                jurisdiccion="Nacional",
                tipo_procedimiento=tipo,
                estado=estado,
                objeto=objeto,
                fecha_prorroga=None,
                fecha_scraping=utc_now(),
                attached_files=attached_files,
                status="active",
                metadata={
                    "bo_aviso_id": aviso_id,
                    "bo_category": category,
                },
            )
        except Exception as e:
            logger.warning(f"Error building BO notice: {e}")
            return None

    def _parse_detail_page(self, html: str, base_url: str = BASE_URL) -> Dict[str, Any]:
        """Extract structured fields from a detail page."""
        soup = BeautifulSoup(html, "html.parser")
        result: Dict[str, Any] = {}

        # Get all text from the detail container
        detail_div = soup.find(id="detalleAviso") or soup.find("body")
        if not detail_div:
            return result

        # Extract PDF / downloadable attachments
        attached_files: List[Dict[str, Any]] = []
        seen_urls = set()
        for a in detail_div.select("a[href]"):
            href = (a.get("href") or "").strip()
            if not href:
                continue
            href_lower = href.lower()
            is_pdf = href_lower.endswith(".pdf") or ".pdf?" in href_lower
            is_download = "descargar" in href_lower or "download" in href_lower
            if not (is_pdf or is_download):
                continue
            full_url = urljoin(base_url, href)
            if full_url in seen_urls:
                continue
            seen_urls.add(full_url)
            name = a.get_text(strip=True) or href.rsplit("/", 1)[-1]
            attached_files.append({
                "name": name[:200],
                "url": full_url,
                "type": "pdf" if is_pdf else "link",
            })
        if attached_files:
            result["attached_files"] = attached_files

        full_text = detail_div.get_text(" ", strip=True)
        result["description"] = full_text[:2000]

        # Extract title from h2
        h2 = soup.find("h2")
        if h2:
            result["title"] = h2.get_text(strip=True)

        # Extract structured fields from table cells or text patterns
        # Fields appear as "Label: Value" in table cells or plain text
        field_patterns = {
            "expediente": r"(?:Expediente\s*N[°º]?|EX)[:\s\-]*([\w\-/]+(?:\s*[\w\-/]+)*)",
            "objeto": r"Objeto\s*:\s*(.+?)(?:\.|$)",
            "budget_str": r"(?:Presupuesto\s+(?:Oficial|Estimado)|Monto\s+Estimado)[:\s]*\$?\s*([\d.,]+)",
            "opening_date_str": r"(?:Fecha\s+de\s+(?:apertura|vencimiento)|Vence)[:\s]*([\d/\-]+(?:\s+[\d:]+)?)",
            "pub_date_str": r"Fecha\s+de\s+publicaci[oó]n[:\s]*([\d/\-]+)",
        }

        for field, pattern in field_patterns.items():
            m = re.search(pattern, full_text, re.I)
            if m:
                result[field] = m.group(1).strip()

        # Parse extracted dates
        if result.get("opening_date_str"):
            from utils.dates import parse_date_guess
            result["opening_date"] = parse_date_guess(result["opening_date_str"])

        if result.get("pub_date_str"):
            from utils.dates import parse_date_guess
            result["publication_date"] = parse_date_guess(result["pub_date_str"])

        # Parse budget
        if result.get("budget_str"):
            try:
                budget_clean = result["budget_str"].replace(".", "").replace(",", ".")
                result["budget"] = float(budget_clean)
            except (ValueError, TypeError):
                pass

        # Extract organization from breadcrumb or heading
        # Often the org is the first line before the licitacion type
        org_patterns = [
            r"^((?:Ministerio|Secretar[ií]a|Direcci[oó]n|Administraci[oó]n|Empresa|Ente|Instituto|Jefatura|Servicio|Hospital|Universidad|Armada|Gendarmer[ií]a|Polic[ií]a|Fuerza)[^.]{5,150})",
        ]
        for pat in org_patterns:
            m = re.search(pat, full_text, re.I)
            if m:
                result["org"] = m.group(1).strip()[:200]
                break

        return result

    async def extract_licitacion_data(self, html, url):
        return None

    async def extract_links(self, html):
        return []

    async def get_next_page_url(self, html, current_url):
        return None
