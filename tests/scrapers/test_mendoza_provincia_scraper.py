import unittest
import asyncio
from datetime import datetime, timezone
from typing import Optional, List, Any

from pydantic import HttpUrl

from backend.models.scraper_config import ScraperConfig
from backend.models.licitacion import LicitacionCreate
from backend.scrapers.mendoza_provincia_scraper import MendozaProvinciaScraper


class TestMendozaProvinciaScraper(unittest.IsolatedAsyncioTestCase):

    def setUp(self):
        """Set up test environment for MendozaProvinciaScraper."""
        self.config = ScraperConfig(
            name="Mendoza Provincia Test",
            url="https://mock.api.mendoza.gob.ar/ocds/releases", # Placeholder OCDS API URL
            frequency_seconds=3600,
            module_path="backend.scrapers.mendoza_provincia_scraper",
            enabled=True,
            headers={"User-Agent": "Test Scraper Mendoza"},
        )
        # Assuming MendozaProvinciaScraper's __init__ is updated to accept config
        self.scraper = MendozaProvinciaScraper(self.config)
        # self.scraper.base_api_url = self.config.url # Potentially set if scraper uses it

    async def test_extract_licitacion_data_ocds_release_success(self):
        """Test successful data extraction from a mock OCDS release structure."""
        mock_ocds_release = {
            "ocid": "ocds-xxxxx-001",
            "id": "release-001", # Release ID
            "date": "2023-11-01T10:00:00Z",
            "tag": ["tender"],
            "buyer": {
                "id": "buyer-01",
                "name": "Ministerio de Compras Públicas de Mendoza"
            },
            "tender": {
                "id": "tender-xyz-001", # Tender ID
                "title": "Adquisición de Equipamiento Informático Avanzado",
                "description": "Licitación para la compra de servidores y workstations.",
                "status": "active",
                "value": {
                    "amount": 5500000.50,
                    "currency": "ARS"
                },
                "procurementMethod": "open",
                "procurementMethodDetails": "Licitación Pública Nacional",
                "datePublished": "2023-10-15T12:00:00Z",
                # "items": [{"deliveryAddress": {"locality": "Godoy Cruz"}}] # Example for municipios_cubiertos
            }
        }
        mock_url = "https://mock.api.mendoza.gob.ar/ocds/release/ocds-xxxxx-001"

        licitacion = await self.scraper.extract_licitacion_data(mock_ocds_release, mock_url)

        self.assertIsNotNone(licitacion)
        self.assertIsInstance(licitacion, LicitacionCreate)

        self.assertEqual(licitacion.id_licitacion, "ocds-xxxxx-001") # Uses OCID
        self.assertEqual(licitacion.title, "Adquisición de Equipamiento Informático Avanzado")
        self.assertEqual(licitacion.organization, "Ministerio de Compras Públicas de Mendoza")
        self.assertEqual(licitacion.jurisdiccion, "Mendoza Provincia") # Defaulted by scraper
        
        expected_publication_date = datetime(2023, 10, 15, 12, 0, 0, tzinfo=timezone.utc)
        self.assertEqual(licitacion.publication_date, expected_publication_date)
        
        self.assertEqual(licitacion.licitacion_number, "tender-xyz-001") # tender.id
        self.assertEqual(licitacion.description, "Licitación para la compra de servidores y workstations.")
        self.assertEqual(licitacion.status, "active")
        self.assertEqual(licitacion.budget, 5500000.50)
        self.assertEqual(licitacion.currency, "ARS")
        self.assertEqual(licitacion.source_url, HttpUrl(mock_url))
        self.assertEqual(licitacion.tipo_procedimiento, "Licitación Pública Nacional")
        self.assertEqual(licitacion.tipo_acceso, "API/OCDS") # Hardcoded by scraper
        self.assertIsNone(licitacion.municipios_cubiertos) # Not directly mapped from standard OCDS in placeholder
        
        self.assertIsInstance(licitacion.fecha_scraping, datetime)

    async def test_extract_licitacion_data_direct_tender_success(self):
        """Test successful data extraction when api_data is a direct tender object."""
        mock_tender_object = {
            # No OCID at this level, id_licitacion might come from tender.id or generic _api if available
            "id": "tender-only-002", 
            "title": "Servicio de Mantenimiento Edilicio",
            "description": "Mantenimiento integral de edificios públicos.",
            "status": "planned",
            "value": {"amount": 120000.00, "currency": "USD"},
            "procurementMethodDetails": "Contratación Directa",
            "datePublished": "2023-11-20T09:30:00Z",
            "procuringEntity": {"name": "Secretaría de Obras Mendoza"} # Alternative to buyer.name
        }
        mock_url = "https://mock.api.mendoza.gob.ar/ocds/tender/tender-only-002"
        licitacion = await self.scraper.extract_licitacion_data(mock_tender_object, mock_url)

        self.assertIsNotNone(licitacion)
        self.assertEqual(licitacion.id_licitacion, "tender-only-002") # Falls back to tender.id
        self.assertEqual(licitacion.title, "Servicio de Mantenimiento Edilicio")
        self.assertEqual(licitacion.organization, "Secretaría de Obras Mendoza")
        self.assertEqual(licitacion.status, "planned")
        self.assertEqual(licitacion.budget, 120000.00)
        self.assertEqual(licitacion.currency, "USD")

    async def test_extract_licitacion_data_failure(self):
        """Test extraction with incomplete/malformed OCDS/API data."""
        mock_ocds_incomplete = {
            "ocid": "ocds-incomplete-003",
            "tender": {
                "title": "Licitación Incompleta",
                "value": {"amount": "doscientosmil"}, # Malformed budget
                "datePublished": "ayer", # Malformed date
            }
        }
        mock_url = "https://mock.api.mendoza.gob.ar/ocds/release/ocds-incomplete-003"
        licitacion = await self.scraper.extract_licitacion_data(mock_ocds_incomplete, mock_url)
        
        self.assertIsNotNone(licitacion) # Scraper returns object with defaults
        self.assertEqual(licitacion.id_licitacion, "ocds-incomplete-003")
        self.assertEqual(licitacion.title, "Licitación Incompleta")
        self.assertTrue(licitacion.organization.endswith("_UNKNOWN"))
        self.assertIsNone(licitacion.budget) # "doscientosmil" fails parsing
        self.assertIsInstance(licitacion.publication_date, datetime) # Defaults to now()

    async def test_extract_licitacion_data_not_dict(self):
        """Test extraction failure when input data is not a dictionary."""
        mock_api_response_not_dict = "This is a plain string."
        mock_url = "https://mock.api.mendoza.gob.ar/ocds/release/not-a-dict"
        
        licitacion = await self.scraper.extract_licitacion_data(mock_api_response_not_dict, mock_url)
        self.assertIsNone(licitacion)

    async def test_extract_links_ocds_placeholder(self):
        """Test placeholder implementation of extract_links for OCDS Release Package."""
        mock_ocds_package = {
            "releases": [
                {"ocid": "ocds-link-001"},
                {"ocid": "ocds-link-002", "tender": {"title": "Some Tender"}}
            ]
        }
        links = await self.scraper.extract_links(mock_ocds_package)
        self.assertEqual(links, ["ocds-link-001", "ocds-link-002"])

        links_empty = await self.scraper.extract_links({"releases": []})
        self.assertEqual(links_empty, [])
        links_no_releases = await self.scraper.extract_links({})
        self.assertEqual(links_no_releases, [])

    async def test_get_next_page_url_ocds_placeholder(self):
        """Test placeholder get_next_page_url for OCDS 'links.next'."""
        mock_ocds_package_with_next = {
            "links": {"next": "https://mock.api.mendoza.gob.ar/ocds/releases?page=2"}
        }
        next_url = await self.scraper.get_next_page_url(mock_ocds_package_with_next, self.config.url)
        self.assertEqual(next_url, "https://mock.api.mendoza.gob.ar/ocds/releases?page=2")

    async def test_get_next_page_url_api_fallback_placeholder(self):
        """Test placeholder get_next_page_url for generic API pagination fallback."""
        mock_api_response_generic_pagination = {
            "pagination": {"next_page_url_api": "https://other.api.mendoza.gob.ar?offset=10"}
        }
        next_url = await self.scraper.get_next_page_url(mock_api_response_generic_pagination, self.config.url)
        self.assertEqual(next_url, "https://other.api.mendoza.gob.ar?offset=10")
        
        mock_api_no_next = {"some_data": "value"}
        next_url_none = await self.scraper.get_next_page_url(mock_api_no_next, self.config.url)
        self.assertIsNone(next_url_none)

if __name__ == '__main__':
    unittest.main()
