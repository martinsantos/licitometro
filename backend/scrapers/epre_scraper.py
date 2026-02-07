"""
EPRE (Ente Provincial Regulador Eléctrico) Scraper.

Source: https://epremendoza.gob.ar/compras-licitaciones-2/
Structure: Flatsome theme with div.row containers, each row has 6 columns:
  FECHA | EXPEDIENTE | TIPO | ESTADO | DETALLE | CONTACTO/LINKS
"""

import hashlib
import logging
import re
from datetime import datetime
from typing import List, Optional
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from models.licitacion import LicitacionCreate
from models.scraper_config import ScraperConfig
from scrapers.base_scraper import BaseScraper
from utils.dates import parse_date_guess

logger = logging.getLogger("scraper.epre")


class EpreScraper(BaseScraper):

    def __init__(self, config: ScraperConfig):
        super().__init__(config)

    async def extract_licitacion_data(self, html: str, url: str) -> Optional[LicitacionCreate]:
        return None

    async def extract_links(self, html: str) -> List[str]:
        return []

    async def get_next_page_url(self, html: str, current_url: str) -> Optional[str]:
        return None

    async def run(self) -> List[LicitacionCreate]:
        await self.setup()
        try:
            url = str(self.config.url)
            logger.info(f"Starting EPRE scraper from: {url}")
            html = await self.fetch_page(url)
            if not html:
                logger.error("Failed to fetch EPRE page")
                return []

            soup = BeautifulSoup(html, "html.parser")
            rows = soup.find_all("div", id=re.compile(r"row-"))
            licitaciones = []

            for row in rows:
                texts = [t.strip() for t in row.stripped_strings]
                # Skip headers and labels
                if len(texts) < 5 or texts[0] in ("LICITACIONES-COMPRAS", "FECHA"):
                    continue

                fecha_str = texts[0] if len(texts) > 0 else ""
                expediente = texts[1] if len(texts) > 1 else ""
                tipo = texts[2] if len(texts) > 2 else ""
                estado = texts[3] if len(texts) > 3 else ""
                detalle = texts[4] if len(texts) > 4 else ""

                if not expediente or not detalle:
                    continue

                pub_date = parse_date_guess(fecha_str.replace(" hs", "").strip())

                # Extract PDF links
                attached_files = []
                for a in row.find_all("a", href=True):
                    href = a.get("href", "")
                    name = a.get_text(strip=True)
                    if href and (".pdf" in href.lower() or "pliego" in href.lower()):
                        full_url = urljoin("https://epremendoza.gob.ar", href)
                        attached_files.append({
                            "name": name or href.split("/")[-1],
                            "url": full_url,
                            "type": "pdf",
                        })

                id_lic = f"epre:{expediente.replace(' ', '')}"
                content_hash = hashlib.md5(
                    f"{detalle.lower().strip()}|epre|{expediente}".encode()
                ).hexdigest()

                lic = LicitacionCreate(
                    id_licitacion=id_lic,
                    title=f"{tipo} - {detalle[:120]}",
                    organization="EPRE - Ente Provincial Regulador Eléctrico",
                    jurisdiccion="Mendoza",
                    publication_date=pub_date or datetime.utcnow(),
                    expedient_number=expediente,
                    description=detalle,
                    status="active" if estado == "VIGENTE" else "closed",
                    source_url=url,
                    fuente="EPRE Mendoza",
                    tipo_procedimiento=tipo or "Licitación Pública",
                    tipo_acceso="Portal Web",
                    fecha_scraping=datetime.utcnow(),
                    attached_files=attached_files,
                    content_hash=content_hash,
                    metadata={"epre_estado": estado, "epre_expediente": expediente},
                )
                licitaciones.append(lic)
                logger.info(f"Extracted: {lic.title[:60]}...")

            logger.info(f"EPRE scraper complete. Found {len(licitaciones)} licitaciones")
            return licitaciones
        finally:
            await self.cleanup()
