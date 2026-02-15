"""
Scraper for World Bank Procurement Notices API.
Fetches procurement opportunities from projects financed by the World Bank in Argentina.

API: https://search.worldbank.org/api/v2/procnotices
"""
from typing import List, Dict, Any, Optional
import logging
import json
from datetime import datetime
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from models.scraper_config import ScraperConfig
from models.licitacion import LicitacionCreate
from scrapers.base_scraper import BaseScraper

logger = logging.getLogger("scraper.banco_mundial")

API_BASE = "https://search.worldbank.org/api/v2/procnotices"


class BancoMundialScraper(BaseScraper):
    """Scraper for World Bank Procurement Notices API."""

    def __init__(self, config: ScraperConfig):
        super().__init__(config)

    async def run(self) -> List[LicitacionCreate]:
        """Override run to use API directly."""
        await self.setup()
        try:
            return await self._fetch_from_api()
        finally:
            await self.cleanup()

    async def _fetch_from_api(self) -> List[LicitacionCreate]:
        """Fetch procurement notices from World Bank API."""
        items = []
        max_items = self.config.max_items or 100

        # Fields to request
        fields = "id,project_name,notice_type,notice_text,borrower,country,submission_date,notice_date,project_id,bid_description"

        offset = 0
        rows = 50

        while len(items) < max_items:
            url = (
                f"{API_BASE}?format=json"
                f"&fl={fields}"
                f"&countrycode_exact=AR"
                f"&rows={rows}&os={offset}"
                f"&srt=notice_date&order=desc"
            )

            raw = await self.fetch_page(url)
            if not raw:
                break

            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                logger.error("Invalid JSON from World Bank API")
                break

            notices = data.get("procnotices", {})
            total = data.get("total", 0)

            if not notices:
                break

            for key, notice in notices.items():
                if key in ("total",):
                    continue
                lic = self._notice_to_licitacion(notice)
                if lic:
                    items.append(lic)
                    if len(items) >= max_items:
                        break

            offset += rows
            if offset >= total:
                break

        logger.info(f"BancoMundial: fetched {len(items)} items")
        return items

    def _notice_to_licitacion(self, notice: Dict[str, Any]) -> Optional[LicitacionCreate]:
        """Convert a World Bank notice to LicitacionCreate."""
        try:
            notice_id = notice.get("id", "")
            title = (
                notice.get("bid_description")
                or notice.get("notice_text", "")[:200]
                or notice.get("project_name", "")
            ).strip()
            if not title:
                return None

            organization = notice.get("borrower", "Banco Mundial / Argentina")
            project_name = notice.get("project_name", "")
            project_id = notice.get("project_id", "")

            # Dates
            pub_date = self._parse_wb_date(notice.get("notice_date"))
            submission_date = self._parse_wb_date(notice.get("submission_date"))

            description = notice.get("notice_text", "")
            if project_name:
                description = f"Proyecto: {project_name}\n\n{description}"

            notice_type = notice.get("notice_type", "General")

            # Source URL
            source_url = f"https://projects.worldbank.org/en/projects-operations/procurement?id={notice_id}"

            publication_date = self._resolve_publication_date(
                parsed_date=pub_date,
                title=title,
                description=description[:500],
                opening_date=submission_date,
            )
            opening_date = self._resolve_opening_date(
                parsed_date=submission_date,
                title=title,
                description=description[:500],
                publication_date=publication_date,
            )
            estado = self._compute_estado(publication_date, opening_date)

            return LicitacionCreate(
                id_licitacion=f"wb-{notice_id}",
                title=title[:500],
                organization=organization,
                publication_date=publication_date,
                opening_date=opening_date,
                description=description[:2000] if description else None,
                source_url=source_url,
                fuente=self.config.name,
                jurisdiccion="Internacional",
                tipo_procedimiento=notice_type,
                estado=estado,
                fecha_prorroga=None,
                status="active",
                metadata={
                    "wb_project_id": project_id,
                    "wb_project_name": project_name,
                    "wb_notice_type": notice_type,
                },
            )
        except Exception as e:
            logger.warning(f"Error parsing WB notice: {e}")
            return None

    def _parse_wb_date(self, raw: Any) -> Optional[datetime]:
        """Parse date from World Bank API."""
        if not raw:
            return None
        raw_str = str(raw).strip()
        for fmt in ("%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%d", "%B %d, %Y"):
            try:
                return datetime.strptime(raw_str, fmt)
            except ValueError:
                continue
        return None

    async def extract_licitacion_data(self, html, url):
        return None

    async def extract_links(self, html):
        return []

    async def get_next_page_url(self, html, current_url):
        return None
