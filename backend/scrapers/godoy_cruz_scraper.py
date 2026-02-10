"""
Godoy Cruz Scraper - Extracts procurement data from the GeneXus web app.

The site at webapps.godoycruz.gob.ar/consultacompras/index embeds procurement
data as a JSON array in a hidden input field (GridlicitacionesContainerDataV).

Each row contains: [vigente_icon, title, opening_date, budget, organization,
tipo, number, year, expediente, pub_date, id, download_icon, detail_icon]

The server declares UTF-8 but sometimes returns Latin-1 encoded bytes,
so we handle encoding gracefully.
"""

import hashlib
import json
import logging
import re
from datetime import datetime
from typing import List, Optional

from bs4 import BeautifulSoup

from models.licitacion import LicitacionCreate
from models.scraper_config import ScraperConfig
from scrapers.base_scraper import BaseScraper
from utils.dates import parse_date_guess

logger = logging.getLogger("scraper.godoy_cruz")

# Column indices in the grid data array
COL_ICON = 0         # vigente/vencida icon path
COL_TITLE = 1        # descriptive title / objeto
COL_OPENING = 2      # opening date "DD/MM/YYYY HH:MM"
COL_BUDGET = 3       # budget string "$       325.250"
COL_ORG = 4          # organization name
COL_TIPO = 5         # tipo_procedimiento
COL_NUMBER = 6       # licitacion number (e.g. "1014,00000")
COL_YEAR = 7         # year
COL_EXPEDIENTE = 8   # expediente number (e.g. "2026/122/S1-GC")
COL_PUB_DATE = 9     # publication date "DD/MM/YYYY HH:MM"
COL_ID = 10          # internal ID


class GodoyCruzScraper(BaseScraper):
    """Scraper for Godoy Cruz GeneXus procurement system."""

    def __init__(self, config: ScraperConfig):
        super().__init__(config)

    async def extract_licitacion_data(self, html: str, url: str) -> Optional[LicitacionCreate]:
        # Not used - we extract inline from the grid
        return None

    async def extract_links(self, html: str) -> List[str]:
        # Not used - all data is inline
        return []

    async def get_next_page_url(self, html: str, current_url: str) -> Optional[str]:
        # Pagination requires GeneXus session state; not feasible without JS
        return None

    def _parse_budget(self, raw: str) -> Optional[float]:
        """Parse Godoy Cruz budget format: '$       325.250' -> 325250.0"""
        if not raw:
            return None
        cleaned = raw.replace("$", "").strip()
        # Remove thousand separators (dots), replace comma decimal
        cleaned = cleaned.replace(".", "").replace(",", ".")
        try:
            val = float(cleaned)
            return val if val > 0 else None
        except (ValueError, TypeError):
            return None

    def _parse_number(self, raw: str) -> Optional[str]:
        """Parse licitacion number: '1014,00000' -> '1014'"""
        if not raw:
            return None
        # Remove decimal part
        return raw.split(",")[0].strip()

    def _is_vigente(self, icon_path: str) -> bool:
        """Check if the row represents an active/vigente process."""
        if not icon_path:
            return True
        return "VIGENTE" in icon_path.upper()

    async def run(self) -> List[LicitacionCreate]:
        await self.setup()
        try:
            url = str(self.config.url)
            logger.info(f"Fetching Godoy Cruz page: {url}")

            html = await self._fetch_with_encoding_fallback(url)
            if not html:
                logger.error("Failed to fetch Godoy Cruz page")
                return []

            soup = BeautifulSoup(html, "html.parser")

            # Extract grid data from hidden input
            grid_input = soup.find("input", attrs={"name": "GridlicitacionesContainerDataV"})
            if not grid_input:
                logger.error("Grid data input not found on page")
                return []

            raw_value = grid_input.get("value", "")
            if not raw_value:
                logger.warning("Grid data is empty - no listings found")
                return []

            try:
                rows = json.loads(raw_value)
            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse grid JSON: {e}")
                return []

            if not isinstance(rows, list):
                logger.error(f"Grid data is not a list: {type(rows)}")
                return []

            logger.info(f"Found {len(rows)} rows in grid data")

            licitaciones = []
            for row in rows:
                if not isinstance(row, list) or len(row) < 11:
                    continue

                title = (row[COL_TITLE] or "").strip()
                if not title or len(title) < 3:
                    continue

                # Parse dates
                pub_date = parse_date_guess(row[COL_PUB_DATE]) if row[COL_PUB_DATE] else None
                opening_date = parse_date_guess(row[COL_OPENING]) if row[COL_OPENING] else None

                # Parse budget — Godoy Cruz publishes COSTO DEL PLIEGO, not presupuesto.
                # Pliego cost = 0.1% (1/1000) of presupuesto oficial in Godoy Cruz.
                # See: pliego_to_budget_ratio pattern in docs.
                costo_pliego = self._parse_budget(row[COL_BUDGET])
                budget = round(costo_pliego * 1000, 2) if costo_pliego else None

                # Parse number and expediente
                lic_number = self._parse_number(row[COL_NUMBER])
                expediente = (row[COL_EXPEDIENTE] or "").strip() or None
                internal_id = str(row[COL_ID]).strip()

                # Tipo procedimiento
                tipo = (row[COL_TIPO] or "Licitación Pública").strip()

                # Status
                is_active = self._is_vigente(row[COL_ICON])

                # Build stable ID
                id_licitacion = f"godoy-cruz:{internal_id}"

                # Content hash for dedup
                content_hash = hashlib.md5(
                    f"{title.lower()}|godoy cruz|{(pub_date or datetime.utcnow()).strftime('%Y%m%d')}".encode()
                ).hexdigest()

                lic = LicitacionCreate(
                    id_licitacion=id_licitacion,
                    title=title,
                    objeto=title,  # Title IS the objeto in Godoy Cruz
                    organization=row[COL_ORG] or "Municipalidad de Godoy Cruz",
                    jurisdiccion="Mendoza",
                    publication_date=pub_date or datetime.utcnow(),
                    opening_date=opening_date,
                    expedient_number=expediente,
                    licitacion_number=lic_number,
                    status="active" if is_active else "closed",
                    source_url=url,
                    fuente="Godoy Cruz",
                    tipo_procedimiento=tipo,
                    tipo_acceso="Portal Web",
                    fecha_scraping=datetime.utcnow(),
                    budget=budget,
                    currency="ARS" if budget else None,
                    content_hash=content_hash,
                    metadata={
                        "godoy_cruz_id": internal_id,
                        "godoy_cruz_year": row[COL_YEAR] if len(row) > COL_YEAR else None,
                        "costo_pliego": costo_pliego,
                        "budget_source": "estimated_from_pliego",
                        "pliego_to_budget_ratio": 1000,
                    },
                )
                licitaciones.append(lic)

            logger.info(f"Godoy Cruz scraper extracted {len(licitaciones)} licitaciones")
            return licitaciones

        finally:
            await self.cleanup()

    async def _fetch_with_encoding_fallback(self, url: str) -> Optional[str]:
        """Fetch URL reading raw bytes to avoid charset issues.

        The Godoy Cruz GeneXus server declares UTF-8 but sometimes sends
        Latin-1 bytes, so we always read raw bytes and decode manually.
        """
        import aiohttp
        try:
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",
            }
            timeout = aiohttp.ClientTimeout(total=30)
            async with aiohttp.ClientSession(headers=headers, timeout=timeout) as session:
                async with session.get(url, ssl=False) as resp:
                    if resp.status != 200:
                        logger.error(f"HTTP {resp.status} fetching {url}")
                        return None
                    raw = await resp.read()
                    # Try UTF-8 first, fall back to latin-1
                    try:
                        return raw.decode("utf-8")
                    except UnicodeDecodeError:
                        logger.warning(f"UTF-8 decode failed for {url}, using latin-1")
                        return raw.decode("latin-1", errors="replace")
        except Exception as e:
            logger.error(f"Failed to fetch {url}: {e}")
            return None
