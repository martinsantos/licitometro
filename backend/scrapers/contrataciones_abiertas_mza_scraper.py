"""
Scraper for Contrataciones Abiertas Mendoza (OCDS data).
Fetches procurement data in Open Contracting Data Standard format.

Data source: JSON download files from
https://datosabiertos-compras.mendoza.gov.ar/datasets/

The OCDS API endpoints (/edca/contractingprocess/procurementmethod/...) are broken (404).
Instead, we download the latest OCDS release package JSON file and parse releases.
"""
from typing import List, Dict, Any, Optional
import logging
import json
import re
from datetime import datetime
from bs4 import BeautifulSoup
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from models.scraper_config import ScraperConfig
from models.licitacion import LicitacionCreate
from scrapers.base_scraper import BaseScraper

logger = logging.getLogger("scraper.contrataciones_abiertas_mza")

DATASETS_URL = "https://datosabiertos-compras.mendoza.gov.ar/datasets/"


class ContratacionesAbiertasMzaScraper(BaseScraper):
    """Scraper for Mendoza OCDS open contracting data via JSON downloads."""

    def __init__(self, config: ScraperConfig):
        super().__init__(config)

    async def run(self) -> List[LicitacionCreate]:
        await self.setup()
        try:
            return await self._fetch_from_json_download()
        finally:
            await self.cleanup()

    async def _fetch_from_json_download(self) -> List[LicitacionCreate]:
        """Download latest OCDS release package and parse releases."""
        max_items = self.config.max_items or 200

        # Step 1: Find the latest JSON download URL from datasets page
        json_url = await self._find_latest_json_url()
        if not json_url:
            logger.error("Could not find OCDS JSON download URL")
            return []

        logger.info(f"Downloading OCDS JSON from: {json_url}")

        # Step 2: Download the JSON file (may be large, ~11MB for recent period)
        raw = await self.fetch_page(json_url)
        if not raw:
            logger.error(f"Failed to download OCDS JSON from {json_url}")
            return []

        # Step 3: Parse releases
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            logger.error("Invalid JSON in OCDS download")
            return []

        releases = data.get("releases", [])
        logger.info(f"OCDS JSON contains {len(releases)} releases")

        # Step 4: Convert releases to LicitacionCreate objects
        items = []
        seen_ocids = set()
        for release in releases:
            if len(items) >= max_items:
                break

            # Deduplicate by ocid (multiple releases per process)
            ocid = release.get("ocid", "")
            if ocid in seen_ocids:
                continue
            seen_ocids.add(ocid)

            lic = self._release_to_licitacion(release)
            if lic:
                items.append(lic)

        logger.info(f"ContratacionesAbiertasMza: fetched {len(items)} items from {len(releases)} releases")
        return items

    async def _find_latest_json_url(self) -> Optional[str]:
        """Scrape the datasets page to find the most recent JSON download URL."""
        # Try configured URL first
        configured_url = self.config.selectors.get("json_download_url")
        if configured_url:
            return configured_url

        html = await self.fetch_page(DATASETS_URL)
        if not html:
            return None

        soup = BeautifulSoup(html, "html.parser")
        json_links = []
        for a in soup.find_all("a", href=True):
            href = a["href"]
            if "descargar-json" in href and href.endswith(".json"):
                # Extract period number from URL path (e.g., /descargar-json/03/...)
                m = re.search(r"/descargar-json/(\d+)/", href)
                period = int(m.group(1)) if m else 0
                full_url = href if href.startswith("http") else f"https://datosabiertos-compras.mendoza.gov.ar{href}"
                json_links.append((period, full_url))

        if not json_links:
            logger.warning("No JSON download links found on datasets page")
            return None

        # Use the highest period number (most recent)
        json_links.sort(key=lambda x: x[0], reverse=True)
        return json_links[0][1]

    def _release_to_licitacion(
        self, release: Dict[str, Any]
    ) -> Optional[LicitacionCreate]:
        """Convert an OCDS release to LicitacionCreate."""
        try:
            tender = release.get("tender", {})
            planning = release.get("planning", {})
            buyer = release.get("buyer", {})

            ocid = release.get("ocid", "")
            title = tender.get("title", "")
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
            proc_method = tender.get("procurementMethod", "")
            proc_method_detail = tender.get("procurementMethodDetails", "")

            id_licitacion = f"ocds-mza-{ocid}" if ocid else f"ocds-mza-{abs(hash(title))}"

            # Source URL: link to the portal's datasets page with ocid reference
            source_url = f"https://datosabiertos-compras.mendoza.gov.ar/datasets/"

            publication_date = self._resolve_publication_date(
                parsed_date=pub_date, title=title,
                description=description[:1000], opening_date=open_date,
            )
            opening_date = self._resolve_opening_date(
                parsed_date=open_date, title=title,
                description=description[:1000], publication_date=publication_date,
            )
            estado = self._compute_estado(publication_date, opening_date)

            from utils.object_extractor import extract_objeto
            objeto = extract_objeto(title, description[:1000] if description else "", None)

            # Extract awards and contracts (previously dormant OCDS data)
            awards = release.get("awards", [])
            contracts = release.get("contracts", [])
            adjudicatario = None
            monto_adjudicado = None
            fecha_adjudicacion = None
            proveedores = []

            for award in awards:
                if award.get("status") in ("active", ""):
                    # Award amount
                    award_val = award.get("value", {})
                    if award_val.get("amount"):
                        try:
                            monto_adjudicado = float(award_val["amount"])
                        except (ValueError, TypeError):
                            pass
                    # Award date
                    if award.get("date"):
                        fecha_adjudicacion = self._parse_ocds_date(award["date"])
                    # Suppliers
                    for supplier in award.get("suppliers", []):
                        name = supplier.get("name", "")
                        if name:
                            proveedores.append(name)
                            if not adjudicatario:
                                adjudicatario = name

            # Fallback: check contracts if no awards
            if not adjudicatario:
                for contract in contracts:
                    contract_val = contract.get("value", {})
                    if contract_val.get("amount") and not monto_adjudicado:
                        try:
                            monto_adjudicado = float(contract_val["amount"])
                        except (ValueError, TypeError):
                            pass
                    if contract.get("dateSigned") and not fecha_adjudicacion:
                        fecha_adjudicacion = self._parse_ocds_date(contract["dateSigned"])

            # Determine status from awards
            ocds_status = "active"
            if any(a.get("status") == "active" for a in awards):
                ocds_status = "awarded"

            meta = {
                "ocds_ocid": ocid,
                "ocds_method": proc_method,
            }
            if adjudicatario:
                meta["adjudicatario"] = adjudicatario
            if monto_adjudicado:
                meta["monto_adjudicado"] = monto_adjudicado
            if fecha_adjudicacion:
                meta["fecha_adjudicacion"] = fecha_adjudicacion.isoformat()
            if proveedores:
                meta["proveedores"] = proveedores

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
                tipo_procedimiento=proc_method_detail or proc_method or "No especificado",
                estado=estado,
                objeto=objeto,
                fecha_prorroga=None,
                status=ocds_status,
                metadata=meta,
            )
        except Exception as e:
            logger.warning(f"Error parsing OCDS release: {e}")
            return None

    def _parse_ocds_date(self, raw: Any) -> Optional[datetime]:
        """Parse ISO date from OCDS data."""
        if not raw:
            return None
        raw_str = str(raw).strip()
        # Strip timezone suffix: Z, +05:00, -03:00
        raw_str = re.sub(r'Z$', '', raw_str)
        raw_str = re.sub(r'[+-]\d{2}:\d{2}$', '', raw_str)
        for fmt in (
            "%Y-%m-%dT%H:%M:%S.%f",
            "%Y-%m-%dT%H:%M:%S",
            "%Y-%m-%d",
        ):
            try:
                return datetime.strptime(raw_str, fmt)
            except (ValueError, IndexError):
                continue
        return None

    async def extract_licitacion_data(self, html, url):
        return None

    async def extract_links(self, html):
        return []

    async def get_next_page_url(self, html, current_url):
        return None
