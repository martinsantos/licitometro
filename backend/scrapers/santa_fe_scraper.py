"""
Scraper for Santa Fe Province procurement portal.
Uses RSS feed: https://www.santafe.gov.ar/index.php/guia/portal_compras?pagina=rss
Also scrapes the cartelera page for additional details.
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

logger = logging.getLogger("scraper.santa_fe")


class SantaFeScraper(BaseScraper):
    """Scraper for Santa Fe Province procurement via RSS + HTML."""

    def __init__(self, config: ScraperConfig):
        super().__init__(config)
        self.rss_url = config.selectors.get(
            "rss_url",
            "https://www.santafe.gov.ar/index.php/guia/portal_compras?pagina=rss",
        )
        self.cartelera_url = config.selectors.get(
            "cartelera_url",
            "https://www.santafe.gov.ar/index.php/guia/portal_compras",
        )

    async def run(self) -> List[LicitacionCreate]:
        """Override run to use RSS feed + cartelera scraping."""
        await self.setup()
        try:
            items = await self._fetch_from_rss()
            if not items:
                # Fallback to cartelera HTML scraping
                items = await self._fetch_from_cartelera()
            return items
        finally:
            await self.cleanup()

    async def _fetch_from_rss(self) -> List[LicitacionCreate]:
        """Parse RSS feed for procurement items."""
        items = []
        raw = await self.fetch_page(self.rss_url)
        if not raw:
            logger.warning("Failed to fetch Santa Fe RSS feed")
            return items

        try:
            soup = BeautifulSoup(raw, "xml")
        except Exception:
            soup = BeautifulSoup(raw, "html.parser")

        rss_items = soup.find_all("item")
        if not rss_items:
            logger.warning("No items in RSS feed, trying HTML parser")
            soup = BeautifulSoup(raw, "html.parser")
            rss_items = soup.find_all("item")

        max_items = self.config.max_items or 100

        for rss_item in rss_items[:max_items]:
            lic = self._rss_item_to_licitacion(rss_item)
            if lic:
                items.append(lic)

        logger.info(f"SantaFe RSS: fetched {len(items)} items")
        return items

    async def _fetch_from_cartelera(self) -> List[LicitacionCreate]:
        """Fallback: scrape cartelera HTML page."""
        items = []
        raw = await self.fetch_page(self.cartelera_url)
        if not raw:
            return items

        soup = BeautifulSoup(raw, "html.parser")
        max_items = self.config.max_items or 100

        # Look for table rows or list items with procurement data
        rows = soup.select("table tr") or soup.select(".listado li, .item")

        for row in rows[:max_items]:
            lic = self._html_row_to_licitacion(row)
            if lic:
                items.append(lic)

        logger.info(f"SantaFe cartelera: fetched {len(items)} items")
        return items

    def _rss_item_to_licitacion(self, item) -> Optional[LicitacionCreate]:
        """Convert an RSS item to LicitacionCreate."""
        try:
            title_elem = item.find("title")
            title = title_elem.text.strip() if title_elem else ""
            if not title:
                return None

            link_elem = item.find("link")
            link = link_elem.text.strip() if link_elem else ""

            desc_elem = item.find("description")
            description = desc_elem.text.strip() if desc_elem else ""

            pub_date_elem = item.find("pubDate")
            pub_date = None
            if pub_date_elem:
                pub_date = self._parse_rss_date(pub_date_elem.text.strip())

            # Extract organization from title/description
            org_match = re.search(r"(?:Organismo|Repartición|Ministerio)[:\s]+(.+?)(?:\.|$)", description, re.I)
            organization = org_match.group(1).strip() if org_match else "Gobierno de Santa Fe"

            # Extract opening date from description
            apertura_match = re.search(r"(?:Apertura|Fecha de apertura)[:\s]+(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})", description, re.I)
            opening_date_raw = None
            if apertura_match:
                from utils.dates import parse_date_guess
                opening_date_raw = parse_date_guess(apertura_match.group(1))

            # Generate unique ID from link or title
            if link:
                id_suffix = re.sub(r"[^a-zA-Z0-9]", "", link[-40:])
            else:
                id_suffix = str(hash(title))[:12]

            publication_date = self._resolve_publication_date(
                parsed_date=pub_date, title=title,
                description=description[:500], opening_date=opening_date_raw,
            )
            opening_date = self._resolve_opening_date(
                parsed_date=opening_date_raw, title=title,
                description=description[:500], publication_date=publication_date,
            )
            estado = self._compute_estado(publication_date, opening_date)

            return LicitacionCreate(
                id_licitacion=f"santafe-{id_suffix}",
                title=title[:500],
                organization=organization,
                publication_date=publication_date,
                opening_date=opening_date,
                description=description[:2000] if description else None,
                source_url=link or self.cartelera_url,
                fuente=self.config.name,
                jurisdiccion="Santa Fe",
                tipo_procedimiento="Licitación Pública",
                estado=estado,
                fecha_prorroga=None,
                status="active",
            )
        except Exception as e:
            logger.warning(f"Error parsing RSS item: {e}")
            return None

    def _html_row_to_licitacion(self, row) -> Optional[LicitacionCreate]:
        """Convert an HTML table row to LicitacionCreate."""
        try:
            cells = row.find_all(["td", "span", "div"])
            if len(cells) < 2:
                return None

            text = row.get_text(separator=" ", strip=True)
            if len(text) < 10:
                return None

            link = row.find("a")
            href = ""
            if link:
                href = urljoin(self.cartelera_url, link.get("href", ""))

            title = link.text.strip() if link else text[:200]
            if not title or title.lower() in ("ver", "detalle", "más"):
                title = text[:200]

            id_suffix = re.sub(r"[^a-zA-Z0-9]", "", href[-40:]) if href else str(hash(title))[:12]

            return LicitacionCreate(
                id_licitacion=f"santafe-html-{id_suffix}",
                title=title[:500],
                organization="Gobierno de Santa Fe",
                source_url=href or self.cartelera_url,
                fuente=self.config.name,
                jurisdiccion="Santa Fe",
                tipo_procedimiento="Licitación Pública",
                estado="vigente",
                fecha_prorroga=None,
                status="active",
            )
        except Exception as e:
            logger.warning(f"Error parsing HTML row: {e}")
            return None

    def _parse_rss_date(self, raw: str) -> Optional[datetime]:
        """Parse date from RSS pubDate."""
        if not raw:
            return None
        # RFC 2822 format: "Mon, 01 Jan 2026 00:00:00 +0000"
        for fmt in (
            "%a, %d %b %Y %H:%M:%S %z",
            "%a, %d %b %Y %H:%M:%S",
            "%d/%m/%Y",
            "%Y-%m-%d",
        ):
            try:
                return datetime.strptime(raw, fmt).replace(tzinfo=None)
            except ValueError:
                continue
        return None

    async def extract_licitacion_data(self, html, url):
        return None

    async def extract_links(self, html):
        return []

    async def get_next_page_url(self, html, current_url):
        return None
