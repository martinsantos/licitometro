"""
Scraper for PBAC (Provincia de Buenos Aires Compras).
Portal de compras electrónicas de la Provincia de Buenos Aires.
URL: https://pbac.cgp.gba.gov.ar/

Similar to COMPR.AR (ASP.NET WebForms), uses BuscarAvanzado for listings.
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

logger = logging.getLogger("scraper.pbac_buenos_aires")


class PbacBuenosAiresScraper(BaseScraper):
    """Scraper for Buenos Aires Province procurement portal (PBAC)."""

    def __init__(self, config: ScraperConfig):
        super().__init__(config)
        self.base_url = str(config.url).rstrip("/")

    async def run(self) -> List[LicitacionCreate]:
        """Override run for custom scraping."""
        await self.setup()
        try:
            return await self._scrape_listings()
        finally:
            await self.cleanup()

    async def _scrape_listings(self) -> List[LicitacionCreate]:
        """Scrape procurement listings from PBAC."""
        items = []
        max_items = self.config.max_items or 100

        # Try the electronic purchases page first
        urls_to_try = [
            f"{self.base_url}/ComprasElectronicas.aspx",
            f"{self.base_url}/BuscarAvanzado.aspx",
            self.base_url,
        ]

        for url in urls_to_try:
            html = await self.fetch_page(url)
            if not html:
                continue

            soup = BeautifulSoup(html, "html.parser")

            # Look for GridView tables (ASP.NET pattern)
            rows = (
                soup.select("table.GridView tr, table[id*='Grid'] tr")
                or soup.select(".items tr, .listado tr")
                or soup.select("table tr")
            )

            if len(rows) <= 1:  # Only header
                continue

            for row in rows[1:]:  # Skip header
                lic = self._row_to_licitacion(row, url)
                if lic:
                    items.append(lic)
                    if len(items) >= max_items:
                        break

            if items:
                break

        logger.info(f"PBAC Buenos Aires: fetched {len(items)} items")
        return items

    def _row_to_licitacion(self, row, base_url: str) -> Optional[LicitacionCreate]:
        """Convert a table row to LicitacionCreate."""
        try:
            cells = row.find_all("td")
            if len(cells) < 3:
                return None

            text = row.get_text(separator=" | ", strip=True)
            if len(text) < 15:
                return None

            # Extract link
            link = row.find("a")
            href = ""
            if link:
                href = urljoin(base_url, link.get("href", ""))

            # Try to extract meaningful fields from cells
            title = ""
            organization = "Gobierno de Buenos Aires"
            pub_date = None
            opening_date = None
            budget = None
            proc_number = ""

            for i, cell in enumerate(cells):
                cell_text = cell.get_text(strip=True)
                if not cell_text:
                    continue

                # First cell with substantial text is likely the title/description
                if len(cell_text) > 20 and not title:
                    title = cell_text[:500]
                    continue

                # Look for process numbers
                if re.match(r"^\d{1,4}[/\-]\d{2,4}", cell_text) and not proc_number:
                    proc_number = cell_text
                    continue

                # Look for dates
                date_match = re.search(r"(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})", cell_text)
                if date_match:
                    from utils.dates import parse_date_guess
                    parsed = parse_date_guess(date_match.group(1))
                    if parsed:
                        if pub_date is None:
                            pub_date = parsed
                        elif opening_date is None:
                            opening_date = parsed
                    continue

                # Look for money amounts
                money_match = re.search(r"\$\s*([\d.,]+)", cell_text)
                if money_match and budget is None:
                    try:
                        budget = float(money_match.group(1).replace(".", "").replace(",", "."))
                    except ValueError:
                        pass
                    continue

                # Look for organization names
                if any(kw in cell_text.lower() for kw in ["ministerio", "dirección", "secretaría", "hospital", "municipio"]):
                    organization = cell_text[:200]

            if not title:
                title = text[:200]

            if len(title) < 5:
                return None

            # Generate ID
            if proc_number:
                id_suffix = re.sub(r"[^a-zA-Z0-9]", "", proc_number)
            elif href:
                id_suffix = re.sub(r"[^a-zA-Z0-9]", "", href[-40:])
            else:
                id_suffix = str(abs(hash(title)))[:12]

            publication_date = self._resolve_publication_date(
                parsed_date=pub_date, title=title, opening_date=opening_date,
            )
            opening_date_resolved = self._resolve_opening_date(
                parsed_date=opening_date, title=title, publication_date=publication_date,
            )
            estado = self._compute_estado(publication_date, opening_date_resolved)

            from utils.object_extractor import extract_objeto
            objeto = extract_objeto(title, "", "Compra Electrónica")

            return LicitacionCreate(
                id_licitacion=f"pbac-ba-{id_suffix}",
                title=title,
                organization=organization,
                publication_date=publication_date,
                opening_date=opening_date_resolved,
                budget=budget,
                currency="ARS" if budget else None,
                licitacion_number=proc_number or None,
                source_url=href or base_url,
                fuente=self.config.name,
                jurisdiccion="Buenos Aires",
                tipo_procedimiento="Compra Electrónica",
                estado=estado,
                objeto=objeto,
                fecha_prorroga=None,
                status="active",
            )
        except Exception as e:
            logger.warning(f"Error parsing PBAC row: {e}")
            return None

    async def extract_licitacion_data(self, html, url):
        return None

    async def extract_links(self, html):
        return []

    async def get_next_page_url(self, html, current_url):
        return None
