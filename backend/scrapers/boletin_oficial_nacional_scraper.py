"""
Scraper for Boletín Oficial de la República Argentina - Tercera Sección (Contrataciones).
URL: https://www.boletinoficial.gob.ar/seccion/tercera

Extracts procurement notices from the daily gazette.
"""
from typing import List, Dict, Any, Optional
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
        """Override run for custom scraping."""
        await self.setup()
        try:
            return await self._scrape_section()
        finally:
            await self.cleanup()

    async def _scrape_section(self) -> List[LicitacionCreate]:
        """Scrape the third section (contrataciones) of the gazette."""
        items = []
        max_items = self.config.max_items or 100

        html = await self.fetch_page(self.section_url)
        if not html:
            logger.error("Failed to fetch Boletin Oficial Nacional")
            return items

        soup = BeautifulSoup(html, "html.parser")

        # The gazette page lists daily notices as cards/items
        notices = (
            soup.select(".detalle-aviso, .aviso, article.aviso")
            or soup.select(".item-seccion, .resultado")
            or soup.select("div[class*='aviso'], div[class*='item']")
        )

        if not notices:
            # Try broader selectors
            notices = soup.select("table tr, .listado li, .content-seccion > div")

        logger.info(f"Found {len(notices)} notices in Boletin Oficial Nacional")

        for notice in notices[:max_items]:
            lic = self._notice_to_licitacion(notice, soup)
            if lic:
                items.append(lic)

        # Try to follow detail links for more data
        detail_links = soup.select("a[href*='detalleAviso'], a[href*='aviso']")
        for link in detail_links[:max_items - len(items)]:
            href = urljoin(BASE_URL, link.get("href", ""))
            if not href or href == BASE_URL:
                continue

            detail_html = await self.fetch_page(href)
            if detail_html:
                detail_soup = BeautifulSoup(detail_html, "html.parser")
                lic = self._detail_to_licitacion(detail_soup, href)
                if lic:
                    items.append(lic)

        logger.info(f"BoletinOficialNacional: fetched {len(items)} items")
        return items

    def _notice_to_licitacion(self, notice, parent_soup) -> Optional[LicitacionCreate]:
        """Convert a notice element to LicitacionCreate."""
        try:
            text = notice.get_text(separator=" ", strip=True)
            if len(text) < 20:
                return None

            # Extract title
            title_elem = notice.find(["h3", "h4", "h2", "strong", ".titulo"])
            title = title_elem.text.strip() if title_elem else text[:200]

            # Skip non-procurement items
            procurement_keywords = [
                "licitaci", "contrataci", "concurso", "adquisici",
                "compra", "obra", "servicio", "suministro", "precio",
            ]
            text_lower = text.lower()
            if not any(kw in text_lower for kw in procurement_keywords):
                return None

            # Extract link
            link = notice.find("a")
            href = urljoin(BASE_URL, link.get("href", "")) if link else self.section_url

            # Extract organization
            org_match = re.search(
                r"(?:Ministerio|Secretaría|Dirección|Ente|Organismo|Administración)[^.]{5,100}",
                text, re.I,
            )
            organization = org_match.group(0).strip()[:200] if org_match else "Gobierno Nacional"

            # Extract dates
            date_match = re.search(r"(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})", text)
            pub_date = None
            if date_match:
                from utils.dates import parse_date_guess
                pub_date = parse_date_guess(date_match.group(1))

            # Extract expediente
            exp_match = re.search(r"(?:Exp(?:ediente)?\.?|EX)[:\s\-]*(\d[\d\-/]+)", text, re.I)
            expediente = exp_match.group(1) if exp_match else None

            id_suffix = re.sub(r"[^a-zA-Z0-9]", "", href[-50:]) if href != self.section_url else str(abs(hash(title)))[:12]

            publication_date = self._resolve_publication_date(
                parsed_date=pub_date, title=title, description=text[:500],
            )
            estado = self._compute_estado(publication_date, None)

            from utils.object_extractor import extract_objeto
            objeto = extract_objeto(title, text[:500] if text else "", "Contratación Pública")

            return LicitacionCreate(
                id_licitacion=f"bo-nac-{id_suffix}",
                title=title[:500],
                organization=organization,
                publication_date=publication_date,
                description=text[:2000],
                expedient_number=expediente,
                source_url=href,
                fuente=self.config.name,
                jurisdiccion="Nacional",
                tipo_procedimiento="Contratación Pública",
                estado=estado,
                objeto=objeto,
                fecha_prorroga=None,
                status="active",
            )
        except Exception as e:
            logger.warning(f"Error parsing BO notice: {e}")
            return None

    def _detail_to_licitacion(self, soup, url: str) -> Optional[LicitacionCreate]:
        """Extract licitacion from a detail page."""
        try:
            title_elem = soup.find(["h1", "h2", ".titulo-aviso"])
            title = title_elem.text.strip() if title_elem else ""
            if not title:
                return None

            body = soup.find(".cuerpo-aviso, .detalle, .contenido, article")
            text = body.get_text(separator=" ", strip=True) if body else ""

            # Same extraction as notice_to_licitacion
            org_match = re.search(
                r"(?:Ministerio|Secretaría|Dirección|Ente|Organismo)[^.]{5,100}",
                text, re.I,
            )
            organization = org_match.group(0).strip()[:200] if org_match else "Gobierno Nacional"

            date_match = re.search(r"(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})", text)
            pub_date = None
            if date_match:
                from utils.dates import parse_date_guess
                pub_date = parse_date_guess(date_match.group(1))

            exp_match = re.search(r"(?:Exp\.?|EX)[:\s\-]*(\d[\d\-/]+)", text, re.I)
            expediente = exp_match.group(1) if exp_match else None

            id_suffix = re.sub(r"[^a-zA-Z0-9]", "", url[-50:])

            publication_date = self._resolve_publication_date(
                parsed_date=pub_date, title=title, description=text[:500],
            )
            estado = self._compute_estado(publication_date, None)

            from utils.object_extractor import extract_objeto
            objeto = extract_objeto(title, text[:500] if text else "", "Contratación Pública")

            return LicitacionCreate(
                id_licitacion=f"bo-nac-det-{id_suffix}",
                title=title[:500],
                organization=organization,
                publication_date=publication_date,
                description=text[:2000],
                expedient_number=expediente,
                source_url=url,
                fuente=self.config.name,
                jurisdiccion="Nacional",
                tipo_procedimiento="Contratación Pública",
                estado=estado,
                objeto=objeto,
                fecha_prorroga=None,
                status="active",
            )
        except Exception as e:
            logger.warning(f"Error parsing BO detail: {e}")
            return None

    async def extract_licitacion_data(self, html, url):
        return None

    async def extract_links(self, html):
        return []

    async def get_next_page_url(self, html, current_url):
        return None
