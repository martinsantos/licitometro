"""
Scraper for Contrataciones Abiertas Mendoza (OCDS/EDCA API).
Fetches procurement data in Open Contracting Data Standard format.

API: https://datosabiertos-compras.mendoza.gov.ar/edca/contractingprocess/procurementmethod/{method}/{year}
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

logger = logging.getLogger("scraper.contrataciones_abiertas_mza")

API_BASE = "https://datosabiertos-compras.mendoza.gov.ar/edca/contractingprocess"


class ContratacionesAbiertasMzaScraper(BaseScraper):
    """Scraper for Mendoza OCDS open contracting data."""

    def __init__(self, config: ScraperConfig):
        super().__init__(config)

    async def run(self) -> List[LicitacionCreate]:
        """Override run to use OCDS API directly."""
        await self.setup()
        try:
            return await self._fetch_from_api()
        finally:
            await self.cleanup()

    async def _fetch_from_api(self) -> List[LicitacionCreate]:
        """Fetch procurement processes from OCDS API."""
        items = []
        max_items = self.config.max_items or 200

        # Procurement methods to query
        methods = ["open", "selective", "direct", "limited"]
        # Current year and previous
        years = [datetime.now().year, datetime.now().year - 1]

        for method in methods:
            for year in years:
                if len(items) >= max_items:
                    break

                url = f"{API_BASE}/procurementmethod/{method}/{year}"
                raw = await self.fetch_page(url)
                if not raw:
                    continue

                try:
                    data = json.loads(raw)
                except json.JSONDecodeError:
                    logger.warning(f"Invalid JSON for {method}/{year}")
                    continue

                # OCDS format: may be a list of releases or packagedReleases
                releases = []
                if isinstance(data, list):
                    releases = data
                elif isinstance(data, dict):
                    releases = data.get("releases", data.get("records", [data]))

                for release in releases:
                    lic = self._release_to_licitacion(release, method)
                    if lic:
                        items.append(lic)
                        if len(items) >= max_items:
                            break

        logger.info(f"ContratacionesAbiertasMza: fetched {len(items)} items")
        return items

    def _release_to_licitacion(
        self, release: Dict[str, Any], method: str
    ) -> Optional[LicitacionCreate]:
        """Convert an OCDS release to LicitacionCreate."""
        try:
            # OCDS structure: tender, planning, awards, contracts
            tender = release.get("tender", {})
            planning = release.get("planning", {})
            buyer = release.get("buyer", {})

            ocid = release.get("ocid", "")
            title = tender.get("title") or release.get("tag", [""])[0] if release.get("tag") else ""
            description = tender.get("description", "")

            if not title and not description:
                return None

            if not title:
                title = description[:200]

            organization = buyer.get("name", "Gobierno de Mendoza")

            # Tender period
            tender_period = tender.get("tenderPeriod", {})
            pub_date_raw = tender_period.get("startDate") or release.get("date")
            open_date_raw = tender_period.get("endDate")

            pub_date = self._parse_ocds_date(pub_date_raw)
            open_date = self._parse_ocds_date(open_date_raw)

            # Budget
            budget = None
            budget_data = planning.get("budget", {}).get("amount", {})
            if budget_data.get("amount"):
                try:
                    budget = float(budget_data["amount"])
                except (ValueError, TypeError):
                    pass
            currency = budget_data.get("currency", "ARS")

            # Procurement method
            proc_method = tender.get("procurementMethod", method)
            proc_method_detail = tender.get("procurementMethodDetails", "")

            id_licitacion = f"ocds-mza-{ocid}" if ocid else f"ocds-mza-{hash(title)}"

            source_url = f"https://datosabiertos-compras.mendoza.gov.ar/"

            publication_date = self._resolve_publication_date(
                parsed_date=pub_date, title=title,
                description=description[:500], opening_date=open_date,
            )
            opening_date = self._resolve_opening_date(
                parsed_date=open_date, title=title,
                description=description[:500], publication_date=publication_date,
            )
            estado = self._compute_estado(publication_date, opening_date)

            return LicitacionCreate(
                id_licitacion=id_licitacion,
                title=title[:500],
                organization=organization,
                publication_date=publication_date,
                opening_date=opening_date,
                description=description[:2000] if description else None,
                budget=budget,
                currency=currency,
                source_url=source_url,
                fuente=self.config.name,
                jurisdiccion="Mendoza",
                tipo_procedimiento=proc_method_detail or proc_method,
                estado=estado,
                fecha_prorroga=None,
                status="active",
                metadata={
                    "ocds_ocid": ocid,
                    "ocds_method": proc_method,
                },
            )
        except Exception as e:
            logger.warning(f"Error parsing OCDS release: {e}")
            return None

    def _parse_ocds_date(self, raw: Any) -> Optional[datetime]:
        """Parse ISO date from OCDS."""
        if not raw:
            return None
        raw_str = str(raw).strip()
        for fmt in (
            "%Y-%m-%dT%H:%M:%S.%fZ",
            "%Y-%m-%dT%H:%M:%SZ",
            "%Y-%m-%dT%H:%M:%S",
            "%Y-%m-%d",
        ):
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
