"""
Scraper for Inter-American Development Bank (BID/IDB) Procurement Notices.
Uses CKAN DataStore API at data.iadb.org.

Resource ID: 856aabfd-2c6a-48fb-a8b8-19f3ff443618
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

logger = logging.getLogger("scraper.bid")

API_BASE = "https://data.iadb.org/api/action/datastore_search"
RESOURCE_ID = "856aabfd-2c6a-48fb-a8b8-19f3ff443618"


class BidScraper(BaseScraper):
    """Scraper for BID/IDB procurement notices via CKAN DataStore."""

    def __init__(self, config: ScraperConfig):
        super().__init__(config)
        self.resource_id = config.selectors.get("resource_id", RESOURCE_ID)

    async def run(self) -> List[LicitacionCreate]:
        """Override run to use API directly."""
        await self.setup()
        try:
            return await self._fetch_from_api()
        finally:
            await self.cleanup()

    async def _fetch_from_api(self) -> List[LicitacionCreate]:
        """Fetch procurement records from BID DataStore."""
        items = []
        max_items = self.config.max_items or 100
        offset = 0
        limit = 100

        while len(items) < max_items:
            # Filter for Argentina
            url = (
                f"{API_BASE}"
                f"?resource_id={self.resource_id}"
                f"&limit={limit}&offset={offset}"
                f"&q=Argentina"
            )

            raw = await self.fetch_page(url)
            if not raw:
                break

            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                logger.error("Invalid JSON from BID API")
                break

            if not data.get("success"):
                logger.error(f"BID API error: {data.get('error', {})}")
                break

            records = data.get("result", {}).get("records", [])
            if not records:
                break

            for record in records:
                # Filter: only Argentina-related records
                country = str(record.get("Country", "")).lower()
                if "argentin" not in country:
                    continue

                lic = self._record_to_licitacion(record)
                if lic:
                    items.append(lic)
                    if len(items) >= max_items:
                        break

            offset += limit
            total = data.get("result", {}).get("total", 0)
            if offset >= total:
                break

        logger.info(f"BID: fetched {len(items)} items for Argentina")
        return items

    def _record_to_licitacion(self, record: Dict[str, Any]) -> Optional[LicitacionCreate]:
        """Convert a BID DataStore record to LicitacionCreate."""
        try:
            record_id = record.get("_id", "")
            title = (
                record.get("Procurement Description")
                or record.get("Description")
                or record.get("Project Name")
                or ""
            ).strip()
            if not title:
                return None

            organization = record.get("Executing Agency", "BID / Argentina")
            project = record.get("Project Name", "")
            project_number = record.get("Project Number", "")

            # Dates
            pub_date = self._parse_bid_date(
                record.get("Publication Date") or record.get("Approval Date")
            )
            deadline = self._parse_bid_date(record.get("Deadline"))

            # Budget
            budget = None
            amount = record.get("Contract Amount") or record.get("Amount")
            if amount:
                try:
                    budget = float(str(amount).replace(",", "").replace("$", "").strip())
                except (ValueError, TypeError):
                    pass

            proc_type = record.get("Procurement Type", "No especificado")
            description = f"Proyecto BID: {project}\nNúmero: {project_number}" if project else ""

            source_url = f"https://data.iadb.org/dataset/project-procurement-bidding-notices-and-notification-of-contract-awards"

            publication_date = self._resolve_publication_date(
                parsed_date=pub_date, title=title,
                description=description, opening_date=deadline,
            )
            opening_date = self._resolve_opening_date(
                parsed_date=deadline, title=title,
                description=description, publication_date=publication_date,
            )
            estado = self._compute_estado(publication_date, opening_date)

            from utils.object_extractor import extract_objeto
            objeto = extract_objeto(title, description[:500] if description else "", proc_type)

            return LicitacionCreate(
                id_licitacion=f"bid-{record_id}",
                title=title[:500],
                organization=organization,
                publication_date=publication_date,
                opening_date=opening_date,
                description=description[:2000] if description else None,
                budget=budget,
                currency="USD",
                source_url=source_url,
                fuente=self.config.name,
                jurisdiccion="Internacional",
                tipo_procedimiento=proc_type,
                estado=estado,
                objeto=objeto,
                fecha_prorroga=None,
                status="active",
                metadata={
                    "bid_project": project,
                    "bid_project_number": project_number,
                },
            )
        except Exception as e:
            logger.warning(f"Error parsing BID record: {e}")
            return None

    def _parse_bid_date(self, raw: Any) -> Optional[datetime]:
        """Parse date from BID records."""
        if not raw:
            return None
        raw_str = str(raw).strip()
        for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y"):
            try:
                return datetime.strptime(raw_str[:len(fmt) + 5], fmt)
            except (ValueError, IndexError):
                continue
        return None

    async def extract_licitacion_data(self, html, url):
        return None

    async def extract_links(self, html):
        return []

    async def get_next_page_url(self, html, current_url):
        return None
