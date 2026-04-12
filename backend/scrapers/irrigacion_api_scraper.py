"""
Irrigación Mendoza API Scraper — REST JSON API

Fetches licitaciones from DGI (Departamento General de Irrigación)
public REST API at serviciosweb.cloud.irrigacion.gov.ar.

Protocol:
1. GET /services/expedientes/api/public/licitacions → JSON array
2. Parse each item: numero, anio, objeto, presupuesto, apertura, archivos
3. Build LicitacionCreate objects
4. Archivo PDFs listed but may require auth to download

Source URL: https://serviciosweb.cloud.irrigacion.gov.ar/public/licitaciones/licitacion
"""

import logging
import sys
from datetime import datetime
from pathlib import Path
from typing import List

import aiohttp

sys.path.insert(0, str(Path(__file__).parent.parent))

from models.scraper_config import ScraperConfig
from models.licitacion import LicitacionCreate
from scrapers.base_scraper import BaseScraper
from utils.dates import parse_date_guess

logger = logging.getLogger("scraper.irrigacion_api")

API_URL = "https://serviciosweb.cloud.irrigacion.gov.ar/services/expedientes/api/public/licitacions"
PORTAL_URL = "https://serviciosweb.cloud.irrigacion.gov.ar/public/licitaciones/licitacion"


class IrrigacionApiScraper(BaseScraper):
    """Scraper for DGI Irrigación Mendoza — public REST API."""

    def __init__(self, config: ScraperConfig):
        super().__init__(config)

    async def extract_licitacion_data(self, html, url):
        return None  # Not used — API returns JSON directly

    async def extract_links(self, html):
        return []  # Not used

    async def get_next_page_url(self, html, current_url):
        return None  # Not used — single API call

    async def run(self) -> List[LicitacionCreate]:
        """Fetch all licitaciones from the Irrigación API."""
        await self.setup()
        items = []

        try:
            connector = aiohttp.TCPConnector(ssl=False)
            timeout = aiohttp.ClientTimeout(total=30)
            async with aiohttp.ClientSession(connector=connector, timeout=timeout) as session:
                async with session.get(API_URL) as resp:
                    if resp.status != 200:
                        logger.error(f"Irrigación API returned {resp.status}")
                        return []
                    data = await resp.json()

            logger.info(f"Irrigación API: {len(data)} items")

            for item in data:
                try:
                    lic = self._parse_item(item)
                    if lic:
                        items.append(lic)
                except Exception as e:
                    logger.warning(f"Failed to parse Irrigación item {item.get('id')}: {e}")

            logger.info(f"Irrigación: parsed {len(items)} licitaciones")

        except Exception as e:
            logger.error(f"Irrigación API scraper failed: {e}")

        return items

    def _parse_item(self, item: dict) -> LicitacionCreate:
        """Parse a single API item into LicitacionCreate."""
        numero = item.get("numero", 0)
        anio = item.get("anio", 0)
        objeto = item.get("objeto", "")
        presupuesto = item.get("presupuesto", 0)
        valor_pliego = item.get("valorPliego", 0)
        apertura_raw = item.get("aperturaFecha", "")
        apertura_lugar = item.get("aperturaLugar", "")
        fecha_pub = item.get("fechaPublicacion", "")

        # Expediente
        expediente = item.get("expediente") or {}
        exp_numero = expediente.get("numero", "")
        exp_anio = expediente.get("anio", "")
        exp_asunto = expediente.get("asunto", "")
        iniciador = expediente.get("iniciador", "")

        # Modalidad
        modalidad = (item.get("modalidadContratacion") or {}).get("nombre", "")

        # Archivos (PDFs del pliego)
        archivos = item.get("archivoLicitacions") or []
        attached_files = []
        for arch in archivos:
            nombre = arch.get("nombre", "")
            arch_id = arch.get("id")
            if nombre and arch_id:
                attached_files.append({
                    "name": nombre,
                    "url": f"https://serviciosweb.cloud.irrigacion.gov.ar/services/expedientes/api/public/archivo-licitacions/{arch_id}",
                    "type": "pdf" if nombre.lower().endswith(".pdf") else "doc",
                    "source": "irrigacion_api",
                })

        # Build title
        title = objeto or exp_asunto or f"Licitación {numero}/{anio}"

        # Parse dates (API returns ISO 8601 with timezone)
        opening_date = None
        if apertura_raw:
            try:
                opening_date = datetime.fromisoformat(apertura_raw.replace("Z", "+00:00"))
            except (ValueError, TypeError):
                opening_date = parse_date_guess(apertura_raw)

        publication_date = None
        if fecha_pub:
            try:
                publication_date = datetime.fromisoformat(fecha_pub)
            except (ValueError, TypeError):
                publication_date = parse_date_guess(fecha_pub)

        # Build description
        desc_parts = [objeto]
        if exp_asunto and exp_asunto != objeto:
            desc_parts.append(f"Asunto: {exp_asunto}")
        if iniciador:
            desc_parts.append(f"Iniciador: {iniciador}")
        if apertura_lugar:
            desc_parts.append(f"Lugar apertura: {apertura_lugar}")
        if archivos:
            desc_parts.append(f"Archivos adjuntos: {', '.join(a.get('nombre', '?') for a in archivos)}")
        description = "\n".join(desc_parts)

        # Expedient number
        expedient_number = f"{exp_numero}/{exp_anio}" if exp_numero and exp_anio else ""

        # Source URL (link to the specific licitacion in the portal)
        source_url = f"{PORTAL_URL}/{item.get('id', '')}" if item.get("id") else PORTAL_URL

        # Resolve dates
        publication_date = self._resolve_publication_date(
            parsed_date=publication_date,
            title=title,
            description=description,
            opening_date=opening_date,
            attached_files=attached_files,
        )
        opening_date = self._resolve_opening_date(
            parsed_date=opening_date,
            title=title,
            description=description,
            publication_date=publication_date,
            attached_files=attached_files,
        )
        estado = self._compute_estado(
            publication_date=publication_date,
            opening_date=opening_date,
        )

        return LicitacionCreate(
            title=title,
            description=description,
            source_url=source_url,
            publication_date=publication_date,
            opening_date=opening_date,
            budget=presupuesto if presupuesto and presupuesto > 0 else None,
            currency="ARS",
            organization="Departamento General de Irrigación",
            contact=apertura_lugar or None,
            status="active",
            fuente="Irrigación Mendoza",
            tipo_procedimiento=modalidad or "Licitación Pública",
            tipo_acceso="API REST",
            jurisdiccion="Mendoza",
            location="Mendoza",
            attached_files=attached_files,
            licitacion_number=f"{numero}/{anio}" if numero and anio else str(numero),
            expedient_number=expedient_number or None,
            id_licitacion=f"DGI-{numero}/{anio}",
            estado=estado,
            metadata={
                "irrigacion_id": item.get("id"),
                "irrigacion_numero": numero,
                "irrigacion_anio": anio,
                "valor_pliego": valor_pliego,
                "apertura_lugar": apertura_lugar,
                "iniciador": iniciador,
                "archivos_count": len(archivos),
            },
        )
