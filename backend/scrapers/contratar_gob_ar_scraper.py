"""
Scraper for CONTRAT.AR (contratar.gob.ar) - National public works procurement portal.
HTML scraping of the public search interface.
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

logger = logging.getLogger("scraper.contratar_gob_ar")


class ContratarGobArScraper(BaseScraper):
    """Scraper for contratar.gob.ar public works portal."""

    def __init__(self, config: ScraperConfig):
        super().__init__(config)
        self.base_url = str(config.url)

    async def run(self) -> List[LicitacionCreate]:
        """Override run for custom scraping flow."""
        await self.setup()
        try:
            return await self._scrape_listings()
        finally:
            await self.cleanup()

    async def _scrape_listings(self) -> List[LicitacionCreate]:
        """Scrape the main listings page."""
        items = []
        url = self.base_url
        max_items = self.config.max_items or 100
        page_num = 0

        while len(items) < max_items and page_num < 10:
            html = await self.fetch_page(url)
            if not html:
                break

            soup = BeautifulSoup(html, "html.parser")

            # Look for procurement listings - CONTRAT.AR uses ASP.NET GridView or tables
            rows = (
                soup.select("table.grid tr, .GridView tr, .listado tr")
                or soup.select(".proceso, .licitacion, .item")
                or soup.select("table tr")
            )

            if not rows:
                logger.warning(f"No rows found on page {page_num}")
                break

            for row in rows:
                lic = self._row_to_licitacion(row, soup)
                if lic:
                    items.append(lic)
                    if len(items) >= max_items:
                        break

            # Try to find next page
            next_url = self._find_next_page(soup, url)
            if not next_url or next_url == url:
                break
            url = next_url
            page_num += 1

        logger.info(f"CONTRAT.AR: fetched {len(items)} items")
        return items

    def _row_to_licitacion(self, row, soup) -> Optional[LicitacionCreate]:
        """Convert a table row to LicitacionCreate."""
        try:
            cells = row.find_all(["td", "th"])
            text = row.get_text(separator=" | ", strip=True)

            # Skip header rows and empty rows
            if len(text) < 20 or row.find("th"):
                return None

            # Extract link
            link = row.find("a")
            href = ""
            if link:
                href = urljoin(self.base_url, link.get("href", ""))

            # Extract title from first meaningful cell or link
            title = ""
            if link:
                title = link.text.strip()
            if not title and cells:
                for cell in cells:
                    cell_text = cell.get_text(strip=True)
                    if len(cell_text) > 15:
                        title = cell_text
                        break

            if not title or len(title) < 5:
                return None

            # Extract organization
            organization = "Gobierno Nacional - Obra Pública"
            for cell in cells:
                cell_text = cell.get_text(strip=True)
                if any(kw in cell_text.lower() for kw in ["ministerio", "secretaría", "dirección", "organismo"]):
                    organization = cell_text[:200]
                    break

            # Extract dates from cells
            pub_date = None
            opening_date = None
            for cell in cells:
                cell_text = cell.get_text(strip=True)
                date_match = re.search(r"(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})", cell_text)
                if date_match:
                    from utils.dates import parse_date_guess
                    parsed = parse_date_guess(date_match.group(1))
                    if parsed:
                        if pub_date is None:
                            pub_date = parsed
                        elif opening_date is None:
                            opening_date = parsed

            # Extract budget
            budget = None
            for cell in cells:
                cell_text = cell.get_text(strip=True)
                money_match = re.search(r"\$\s*([\d.,]+)", cell_text)
                if money_match:
                    try:
                        budget = float(money_match.group(1).replace(".", "").replace(",", "."))
                    except ValueError:
                        pass

            # Generate ID
            if href:
                id_suffix = re.sub(r"[^a-zA-Z0-9]", "", href[-50:])
            else:
                id_suffix = str(abs(hash(title)))[:12]

            publication_date = self._resolve_publication_date(
                parsed_date=pub_date, title=title,
                opening_date=opening_date,
            )
            opening_date_resolved = self._resolve_opening_date(
                parsed_date=opening_date, title=title,
                publication_date=publication_date,
            )
            estado = self._compute_estado(publication_date, opening_date_resolved)

            return LicitacionCreate(
                id_licitacion=f"contratar-{id_suffix}",
                title=title[:500],
                organization=organization,
                publication_date=publication_date,
                opening_date=opening_date_resolved,
                budget=budget,
                currency="ARS" if budget else None,
                source_url=href or self.base_url,
                fuente=self.config.name,
                jurisdiccion="Nacional",
                tipo_procedimiento="Obra Pública",
                estado=estado,
                fecha_prorroga=None,
                status="active",
            )
        except Exception as e:
            logger.warning(f"Error parsing CONTRAT.AR row: {e}")
            return None

    def _find_next_page(self, soup, current_url: str) -> Optional[str]:
        """Find next page link."""
        # ASP.NET pagination patterns
        next_link = (
            soup.select_one("a.next, a[rel='next'], .pagination a:last-child")
            or soup.select_one("a:contains('Siguiente'), a:contains('>')")
        )
        if next_link and next_link.get("href"):
            return urljoin(current_url, next_link["href"])
        return None

    async def extract_licitacion_data(self, html, url):
        return None

    async def extract_links(self, html):
        return []

    async def get_next_page_url(self, html, current_url):
        return None
