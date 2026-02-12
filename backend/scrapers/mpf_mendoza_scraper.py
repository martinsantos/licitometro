"""
Ministerio Público Fiscal de Mendoza scraper.

Scrapes procurement resolutions from abogados.mpfmza.gob.ar.
Table at /resoluciones/5/{year} has columns: Título, Número, Fecha, PDF.
"""

import hashlib
import logging
import re
import unicodedata
from datetime import datetime
from typing import List, Optional
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from models.licitacion import LicitacionCreate
from models.scraper_config import ScraperConfig
from scrapers.base_scraper import BaseScraper
from utils.dates import parse_date_guess

logger = logging.getLogger("scraper.mpf_mendoza")

BASE_URL = "https://abogados.mpfmza.gob.ar"

PROCUREMENT_KEYWORDS = [
    "contratacion", "adquisicion", "licitacion", "compra",
    "provision", "suministro", "servicio de", "locacion",
    "alquiler", "arrendamiento", "mantenimiento", "reparacion",
    "obra", "refaccion", "ampliacion", "instalacion",
    "renovacion de licencia", "renovacion de contrato de",
]

NON_PROCUREMENT = [
    "modificacion presupuestaria", "modificaciones presupuestarias",
    "pago de deuda", "pago de indemnizacion", "pago por diferencia",
    "liquidacion de adicionales", "partidas presupuestarias",
    "subrogancia", "incremento de honorarios",
    "contratos profesionales", "dejar sin efecto",
]


def _strip_accents(text: str) -> str:
    nfkd = unicodedata.normalize("NFKD", text)
    return "".join(c for c in nfkd if not unicodedata.combining(c))


def _is_procurement(title: str) -> bool:
    normalized = _strip_accents(title.lower().strip())
    # Exclude non-procurement first
    for excl in NON_PROCUREMENT:
        if excl in normalized:
            return False
    # Include if matches procurement keywords
    for kw in PROCUREMENT_KEYWORDS:
        if kw in normalized:
            return True
    return False


class MpfMendozaScraper(BaseScraper):
    """Scraper for Ministerio Público Fiscal de Mendoza resolutions."""

    def __init__(self, config: ScraperConfig):
        super().__init__(config)
        sel = config.selectors or {}
        self.years = sel.get("years", [2026, 2025])
        self.org = sel.get("organization", "Ministerio Público Fiscal de Mendoza")

    def _make_id(self, number: str, year: int) -> str:
        return f"mpf-mza:{number}/{year}"

    def _content_hash(self, title: str, number: str, year: int) -> str:
        s = f"{title.lower().strip()}|mpf|{number}|{year}"
        return hashlib.md5(s.encode()).hexdigest()

    def _parse_date(self, text: str) -> Optional[datetime]:
        """Parse DD-MM-YY format used by MPF."""
        text = text.strip()
        if not text:
            return None
        # Try DD-MM-YY first (MPF format)
        m = re.match(r"(\d{1,2})-(\d{1,2})-(\d{2,4})", text)
        if m:
            day, month, year = int(m.group(1)), int(m.group(2)), int(m.group(3))
            if year < 100:
                year += 2000
            try:
                return datetime(year, month, day)
            except ValueError:
                pass
        # Fallback to generic parser
        return parse_date_guess(text)

    async def _scrape_year(self, year: int) -> List[LicitacionCreate]:
        """Scrape all procurement resolutions for a given year."""
        url = f"{BASE_URL}/resoluciones/5/{year}"
        logger.info(f"Fetching MPF resolutions for {year}: {url}")

        html = await self.fetch_page(url)
        if not html:
            logger.warning(f"No HTML for MPF {year}")
            return []

        soup = BeautifulSoup(html, "html.parser")
        table = soup.find("table", id="tabla_resultado_resoluciones")
        if not table:
            logger.warning(f"No table found for MPF {year}")
            return []

        rows = table.find_all("tr")[1:]  # skip header
        logger.info(f"MPF {year}: {len(rows)} rows found")

        items = []
        for row in rows:
            tds = row.find_all("td")
            if len(tds) < 4:
                continue

            title = tds[0].get_text(strip=True)
            if not title or len(title) < 10:
                continue

            if not _is_procurement(title):
                continue

            number = re.sub(r"\s+", "", tds[1].get_text(strip=True))
            date_text = tds[2].get_text(strip=True)
            pub_date = self._parse_date(date_text)

            # PDF link
            pdf_link = None
            pdf_el = tds[3].find("a", href=True)
            if pdf_el:
                pdf_link = urljoin(BASE_URL, pdf_el["href"])

            source_url = pdf_link or url
            id_lic = self._make_id(number, year)

            attached_files = []
            if pdf_link:
                attached_files.append({
                    "name": f"Resolución {number}/{year}.pdf",
                    "url": pdf_link,
                    "type": "pdf",
                })

            items.append(LicitacionCreate(
                id_licitacion=id_lic,
                title=title,
                organization=self.org,
                jurisdiccion="Mendoza",
                publication_date=pub_date or datetime(year, 1, 1),
                description=f"Resolución SAF Nro. {number}/{year} - {title}",
                status="active",
                source_url=source_url,
                fuente="MPF Mendoza",
                tipo_procedimiento="Resolución",
                tipo_acceso="Portal Web",
                fecha_scraping=datetime.utcnow(),
                content_hash=self._content_hash(title, number, year),
                attached_files=attached_files,
            ))

        logger.info(f"MPF {year}: {len(items)} procurement items extracted")
        return items

    # Abstract method stubs (not used - we override run() directly)
    async def extract_licitacion_data(self, html: str, url: str) -> Optional[LicitacionCreate]:
        return None

    async def extract_links(self, html: str) -> List[str]:
        return []

    async def get_next_page_url(self, html: str, current_url: str) -> Optional[str]:
        return None

    async def run(self) -> List[LicitacionCreate]:
        await self.setup()
        try:
            all_items = []
            for year in self.years:
                items = await self._scrape_year(year)
                all_items.extend(items)

            # Deduplicate by id_licitacion
            seen = set()
            unique = []
            for item in all_items:
                if item.id_licitacion not in seen:
                    seen.add(item.id_licitacion)
                    unique.append(item)

            logger.info(f"MPF Mendoza total: {len(unique)} items across {len(self.years)} years")
            return unique
        finally:
            await self.cleanup()
