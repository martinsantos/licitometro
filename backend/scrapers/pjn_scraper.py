"""Magistratura PJN Scraper — server-rendered HTML tables at srpcm.pjn.gov.ar/contrataciones.

Source: Poder Judicial de la Nacion — Consejo de la Magistratura
Portal: https://srpcm.pjn.gov.ar/contrataciones (Proveedores CM v1.9.0)
Type: Server-rendered HTML, clean table structure, no JS required.
Columns: Numero, Nombre, Fecha de Apertura, Tipo, Estado.
Scrape: listing pages (paginated) → extract rows → optional detail pages for description.
"""

import logging
import re
from datetime import datetime
from typing import Any, Dict, List, Optional
from urllib.parse import urljoin

from bs4 import BeautifulSoup, Tag

from scrapers.base_scraper import BaseScraper

logger = logging.getLogger("pjn_scraper")

BASE_URL = "https://srpcm.pjn.gov.ar"
LISTING_PATH = "/contrataciones"
ORGANIZATION = "Consejo de la Magistratura — Poder Judicial de la Nacion"

MONTHS_ES = {
    "ene": 1, "feb": 2, "mar": 3, "abr": 4, "may": 5, "jun": 6,
    "jul": 7, "ago": 8, "sep": 9, "oct": 10, "nov": 11, "dic": 12,
}


class PJNScraper(BaseScraper):
    """Scrape licitaciones from the PJN Magistratura procurement portal."""

    source_name = "magistratura_pjn"
    friendly_name = "Magistratura PJN"
    source_type = "website"
    max_items = 100

    async def run(self) -> List[Dict[str, Any]]:
        await self.setup()
        try:
            items = []
            for page in range(1, 6):  # Up to 5 pages; break early if no rows
                html = await self._fetch_page(page)
                if not html:
                    break
                rows = self._parse_listing(html)
                if not rows:
                    break
                for row in rows:
                    items.append(self._build_item(row))
                if len(rows) < 10:  # Last page (partial)
                    break
            logger.info(f"[PJN] Scraped {len(items)} items")
            return items
        finally:
            await self.cleanup()

    async def _fetch_page(self, page: int) -> Optional[str]:
        """Fetch one page of the contrataciones listing."""
        url = f"{BASE_URL}{LISTING_PATH}"
        if page > 1:
            url = f"{url}?page={page}"
        try:
            resp = await self.http.fetch(url)
            return resp
        except Exception as e:
            logger.warning(f"[PJN] Failed to fetch page {page}: {e}")
            return None

    def _parse_listing(self, html: str) -> List[Dict[str, Any]]:
        """Extract rows from the contrataciones table."""
        soup = BeautifulSoup(html, "lxml")
        rows = []

        # Try standard table structure first
        table = soup.find("table")
        if not table:
            logger.warning("[PJN] No table found in listing")
            return rows

        for tr in table.find_all("tr"):
            cells = tr.find_all("td")
            if len(cells) < 4:
                continue

            row_data = self._extract_row(cells)
            if row_data:
                rows.append(row_data)

        return rows

    def _extract_row(self, cells: List[Tag]) -> Optional[Dict[str, Any]]:
        """Parse a single table row into structured data."""
        if len(cells) < 5:
            return None

        numero = cells[0].get_text(strip=True)
        nombre_cell = cells[1]
        fecha_cell = cells[2]
        tipo = cells[3].get_text(strip=True)
        estado = cells[4].get_text(strip=True)

        if not numero or not nombre_cell.get_text(strip=True):
            return None

        # Extract detail URL from the link in the Nombre column
        detail_url = None
        link = nombre_cell.find("a")
        if link and link.get("href"):
            detail_url = urljoin(BASE_URL, link["href"])

        nombre = nombre_cell.get_text(strip=True)

        # Parse opening date
        opening_date = self._parse_date(fecha_cell.get_text(strip=True))

        return {
            "numero": numero,
            "nombre": nombre,
            "detail_url": detail_url,
            "opening_date": opening_date,
            "tipo_procedimiento": tipo,
            "estado": estado,
        }

    def _parse_date(self, text: str) -> Optional[str]:
        """Parse Spanish date like '6 de may. de 2026 9:00' or '06/05/2026 09:00'."""
        if not text:
            return None
        text = text.strip()

        # Try ISO format first (DD/MM/YYYY HH:MM)
        iso_match = re.match(r"(\d{2})/(\d{2})/(\d{4})\s+(\d{2}):(\d{2})", text)
        if iso_match:
            d, m, y, hh, mm = iso_match.groups()
            return datetime(int(y), int(m), int(d), int(hh), int(mm)).isoformat()

        # Try Spanish format "6 de may. de 2026 9:00"
        es_match = re.match(
            r"(\d{1,2})\s+de\s+(\w{3})\.?\s+de\s+(\d{4})\s+(\d{1,2}):(\d{2})", text
        )
        if es_match:
            d, mon_str, y, hh, mm = es_match.groups()
            mon = MONTHS_ES.get(mon_str.lower().replace(".", "").strip()[:3])
            if mon:
                return datetime(int(y), mon, int(d), int(hh), int(mm)).isoformat()

        return None

    def _build_item(self, row: Dict[str, Any]) -> Dict[str, Any]:
        """Convert a parsed row into a licitacion item dict."""
        title = row["nombre"]
        if row.get("numero"):
            title = f"{row['numero']} — {title}"

        return {
            "title": title,
            "description": row.get("nombre", ""),
            "organization": ORGANIZATION,
            "source_url": row.get("detail_url") or f"{BASE_URL}{LISTING_PATH}",
            "canonical_url": row.get("detail_url"),
            "opening_date": row.get("opening_date"),
            "fuente": self.friendly_name,
            "scraper_type": self.source_name,
            "tags": ["LIC_AR"],
            "metadata": {
                "pj_n_numero": row.get("numero"),
                "pj_n_tipo": row.get("tipo_procedimiento"),
                "pj_n_estado": row.get("estado"),
            },
        }
