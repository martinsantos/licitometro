"""
Scraper for Datos Argentina CKAN API.
Fetches procurement data from datos.gob.ar via CKAN Action API.

Datasets:
- jgm-sistema-contrataciones-electronicas (COMPR.AR data)
- jgm-procesos-contratacion-obra-publica-gestionados-plataforma-contratar (CONTRAT.AR)
"""
from typing import List, Dict, Any, Optional
import logging
import json
from datetime import datetime
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from models.scraper_config import ScraperConfig
from models.licitacion import LicitacionCreate
from scrapers.base_scraper import BaseScraper

logger = logging.getLogger("scraper.datos_argentina")

CKAN_BASE = "https://datos.gob.ar/api/3/action"


class DatosArgentinaScraper(BaseScraper):
    """Scraper for datos.gob.ar CKAN API datasets."""

    def __init__(self, config: ScraperConfig):
        super().__init__(config)
        self.dataset_id = config.selectors.get(
            "dataset_id", "jgm-sistema-contrataciones-electronicas"
        )

    async def run(self) -> List[LicitacionCreate]:
        """Override run to use API directly instead of HTML scraping."""
        await self.setup()
        try:
            return await self._fetch_from_ckan()
        finally:
            await self.cleanup()

    async def _fetch_from_ckan(self) -> List[LicitacionCreate]:
        """Fetch data from CKAN API."""
        items = []

        # Step 1: Get dataset metadata to find resource IDs
        package_url = f"{CKAN_BASE}/package_show?id={self.dataset_id}"
        raw = await self.fetch_page(package_url)
        if not raw:
            logger.error(f"Failed to fetch dataset metadata: {self.dataset_id}")
            return items

        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            logger.error(f"Invalid JSON from package_show: {self.dataset_id}")
            return items

        if not data.get("success"):
            logger.error(f"CKAN API error: {data.get('error', {})}")
            return items

        resources = data.get("result", {}).get("resources", [])
        if not resources:
            logger.warning(f"No resources found for dataset {self.dataset_id}")
            return items

        # Step 2: Find CSV/JSON resources with datastore
        for resource in resources:
            if not resource.get("datastore_active"):
                continue

            resource_id = resource.get("id")
            resource_name = resource.get("name", "")
            logger.info(f"Processing resource: {resource_name} ({resource_id})")

            # Step 3: Fetch records from DataStore
            offset = 0
            limit = 100
            max_items = self.config.max_items or 200

            while len(items) < max_items:
                ds_url = (
                    f"{CKAN_BASE}/datastore_search"
                    f"?resource_id={resource_id}"
                    f"&limit={limit}&offset={offset}"
                    f"&sort=_id desc"
                )
                ds_raw = await self.fetch_page(ds_url)
                if not ds_raw:
                    break

                try:
                    ds_data = json.loads(ds_raw)
                except json.JSONDecodeError:
                    break

                records = ds_data.get("result", {}).get("records", [])
                if not records:
                    break

                for record in records:
                    lic = self._record_to_licitacion(record, resource_name)
                    if lic:
                        items.append(lic)
                        if len(items) >= max_items:
                            break

                offset += limit

                # Safety: don't paginate beyond total
                total = ds_data.get("result", {}).get("total", 0)
                if offset >= total:
                    break

        logger.info(f"DatosArgentina: fetched {len(items)} items from {self.dataset_id}")
        return items

    def _record_to_licitacion(
        self, record: Dict[str, Any], resource_name: str
    ) -> Optional[LicitacionCreate]:
        """Convert a CKAN DataStore record to LicitacionCreate."""
        try:
            # Field mapping varies by dataset; try common field names
            title = (
                record.get("procedimiento_descripcion")
                or record.get("descripcion")
                or record.get("nombre")
                or record.get("titulo")
                or ""
            ).strip()
            if not title:
                return None

            organization = (
                record.get("unidad_operativa_contrataciones_descripcion")
                or record.get("organismo")
                or record.get("reparticion")
                or "Gobierno Nacional"
            ).strip()

            # ID
            proc_id = (
                record.get("procedimiento_id")
                or record.get("numero_procedimiento")
                or record.get("_id")
                or ""
            )
            id_licitacion = f"datos-ar-{self.dataset_id[:20]}-{proc_id}"

            # Dates
            pub_date_raw = record.get("fecha_publicacion") or record.get("fecha")
            pub_date = self._parse_ckan_date(pub_date_raw)

            open_date_raw = record.get("fecha_apertura") or record.get("fecha_apertura_ofertas")
            opening_date = self._parse_ckan_date(open_date_raw)

            # Budget
            budget = None
            budget_raw = record.get("monto_estimado") or record.get("presupuesto") or record.get("monto")
            if budget_raw:
                try:
                    budget = float(str(budget_raw).replace(",", ".").replace("$", "").strip())
                except (ValueError, TypeError):
                    pass

            description = record.get("descripcion_completa") or record.get("observaciones") or ""
            tipo_proc = record.get("tipo_procedimiento") or record.get("tipo_contratacion") or "No especificado"
            expediente = record.get("numero_expediente") or record.get("expediente")

            # Source URL
            source_url = None
            if proc_id:
                source_url = f"https://comprar.gob.ar/MostrarProceso.aspx?idProceso={proc_id}"
            else:
                source_url = f"https://datos.gob.ar/dataset/{self.dataset_id}"

            # Resolve dates via base scraper
            publication_date = self._resolve_publication_date(
                parsed_date=pub_date,
                title=title,
                description=description[:500],
                opening_date=opening_date,
            )
            opening_date_resolved = self._resolve_opening_date(
                parsed_date=opening_date,
                title=title,
                description=description[:500],
                publication_date=publication_date,
            )
            estado = self._compute_estado(publication_date, opening_date_resolved)

            return LicitacionCreate(
                id_licitacion=id_licitacion,
                title=title,
                organization=organization,
                publication_date=publication_date,
                opening_date=opening_date_resolved,
                description=description[:2000] if description else None,
                budget=budget,
                currency="ARS",
                source_url=source_url,
                fuente=self.config.name,
                jurisdiccion="Nacional",
                tipo_procedimiento=tipo_proc,
                expedient_number=expediente,
                estado=estado,
                fecha_prorroga=None,
                status="active",
                metadata={"ckan_dataset": self.dataset_id, "ckan_resource": resource_name},
            )
        except Exception as e:
            logger.warning(f"Error parsing CKAN record: {e}")
            return None

    def _parse_ckan_date(self, raw: Any) -> Optional[datetime]:
        """Parse date from CKAN record (various formats)."""
        if not raw:
            return None
        raw_str = str(raw).strip()
        for fmt in (
            "%Y-%m-%dT%H:%M:%S",
            "%Y-%m-%dT%H:%M:%S.%f",
            "%Y-%m-%d",
            "%d/%m/%Y",
            "%d-%m-%Y",
        ):
            try:
                return datetime.strptime(raw_str[:len(fmt) + 5], fmt)
            except (ValueError, IndexError):
                continue
        return None

    # Required abstract methods (not used when run() is overridden)
    async def extract_licitacion_data(self, html, url):
        return None

    async def extract_links(self, html):
        return []

    async def get_next_page_url(self, html, current_url):
        return None
