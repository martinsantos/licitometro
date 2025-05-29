import unittest
import asyncio
from datetime import datetime, timezone
from typing import Optional, List, Any

from pydantic import HttpUrl

from backend.models.scraper_config import ScraperConfig
from backend.models.licitacion import LicitacionCreate
from backend.scrapers.santa_fe_provincia_scraper import SantaFeProvinciaScraper


class TestSantaFeProvinciaScraper(unittest.IsolatedAsyncioTestCase):

    def setUp(self):
        """Set up test environment for SantaFeProvinciaScraper."""
        self.config = ScraperConfig(
            name="Santa Fe Provincia Test",
            url="https://mock.api.santafe.gob.ar/licitaciones", # Placeholder API URL
            frequency_seconds=3600,
            module_path="backend.scrapers.santa_fe_provincia_scraper",
            enabled=True,
            headers={"User-Agent": "Test Scraper SantaFe"},
        )
        # Assuming SantaFeProvinciaScraper's __init__ is updated to accept config
        self.scraper = SantaFeProvinciaScraper(self.config)
        # self.scraper.base_api_url = self.config.url # Potentially set if scraper uses it

    async def test_extract_licitacion_data_api_success(self):
        """Test successful data extraction from a mock API response."""
        mock_api_response = {
            "id_api": "SF_LIC_2023_001",
            "titulo_api": "Adquisicion de Insumos Hospitalarios",
            "organismo_api": "Ministerio de Salud Provincial",
            # "jurisdiccion_api" is not in scraper's direct extraction, defaults to "Santa Fe Provincia"
            "fecha_publicacion_api": "2023-10-20T11:00:00Z", # ISO format with Z
            "numero_expediente_api": "EXP-SF-00123-2023",
            "objeto_licitacion_api": "Compra de materiales descartables y medicamentos.",
            "estado_api": "En Curso",
            "monto_oficial_api": "3500750.25", # String, to be converted to float
            "tipo_contratacion_api": "Licitación Pública",
            "lugar_entrega_api": "Hospital J.B. Iturraspe, Santa Fe Capital", # Maps to municipios_cubiertos
        }
        mock_url = "https://mock.api.santafe.gob.ar/licitaciones/SF_LIC_2023_001"

        licitacion = await self.scraper.extract_licitacion_data(mock_api_response, mock_url)

        self.assertIsNotNone(licitacion)
        self.assertIsInstance(licitacion, LicitacionCreate)

        self.assertEqual(licitacion.id_licitacion, "SF_LIC_2023_001")
        self.assertEqual(licitacion.title, "Adquisicion de Insumos Hospitalarios")
        self.assertEqual(licitacion.organization, "Ministerio de Salud Provincial")
        self.assertEqual(licitacion.jurisdiccion, "Santa Fe Provincia") # Defaulted by scraper
        
        # Updated expected_publication_date to be timezone-aware (UTC)
        expected_publication_date = datetime(2023, 10, 20, 11, 0, 0, tzinfo=timezone.utc)
        self.assertEqual(licitacion.publication_date, expected_publication_date)
        
        self.assertEqual(licitacion.licitacion_number, "EXP-SF-00123-2023")
        self.assertEqual(licitacion.description, "Compra de materiales descartables y medicamentos.")
        self.assertEqual(licitacion.status, "En Curso")
        self.assertEqual(licitacion.budget, 3500750.25)
        self.assertEqual(licitacion.source_url, HttpUrl(mock_url))
        self.assertEqual(licitacion.tipo_procedimiento, "Licitación Pública")
        self.assertEqual(licitacion.tipo_acceso, "API provincial") # Hardcoded by scraper
        self.assertEqual(licitacion.municipios_cubiertos, "Hospital J.B. Iturraspe, Santa Fe Capital")
        
        self.assertIsInstance(licitacion.fecha_scraping, datetime)

    async def test_extract_licitacion_data_api_failure(self):
        """Test extraction with incomplete/malformed API data."""
        mock_api_response_incomplete = {
            "titulo_api": "Licitación Incompleta",
            # Missing id_api, organismo_api, etc.
            "monto_oficial_api": "doscientosmil", # Malformed float
            "fecha_publicacion_api": "ayer", # Malformed date
        }
        mock_url = "https://mock.api.santafe.gob.ar/licitaciones/SF_LIC_FAIL_002"

        licitacion = await self.scraper.extract_licitacion_data(mock_api_response_incomplete, mock_url)
        
        self.assertIsNotNone(licitacion) # Scraper returns object with defaults
        self.assertTrue(licitacion.id_licitacion.endswith("_UNKNOWN"))
        self.assertEqual(licitacion.title, "Licitación Incompleta")
        self.assertTrue(licitacion.organization.endswith("_UNKNOWN"))
        self.assertIsNone(licitacion.budget) # "doscientosmil" fails parsing
        self.assertIsInstance(licitacion.publication_date, datetime) # Defaults to now()

    async def test_extract_licitacion_data_not_dict(self):
        """Test extraction failure when input data is not a dictionary."""
        mock_api_response_not_dict = ["esto", "es", "una", "lista"]
        mock_url = "https://mock.api.santafe.gob.ar/licitaciones/SF_LIC_NOT_DICT"
        
        licitacion = await self.scraper.extract_licitacion_data(mock_api_response_not_dict, mock_url)
        self.assertIsNone(licitacion) # Scraper should return None if data is not dict

    async def test_extract_links_api_placeholder(self):
        """Test placeholder implementation of extract_links for API data."""
        # Case 1: API response is a list of items
        mock_api_list_direct = [
            {"url_detalle_api": "url1"}, 
            {"id_api": "item2_no_url"} # Scraper currently only looks for url_detalle_api
        ]
        links1 = await self.scraper.extract_links(mock_api_list_direct)
        self.assertEqual(links1, ["url1"])

        # Case 2: API response is a dict with items under a common key
        mock_api_dict_with_list = {
            "data": [{"url_detalle_api": "url_dict_1"}, {"url_detalle_api": "url_dict_2"}],
            "total": 2
        }
        links2 = await self.scraper.extract_links(mock_api_dict_with_list)
        self.assertEqual(links2, ["url_dict_1", "url_dict_2"])
        
        # Case 3: Empty or no relevant data
        links_empty_list = await self.scraper.extract_links([])
        self.assertEqual(links_empty_list, [])
        links_empty_dict = await self.scraper.extract_links({})
        self.assertEqual(links_empty_dict, [])
        links_bad_format = await self.scraper.extract_links("not_a_list_or_dict")
        self.assertEqual(links_bad_format, [])


    async def test_get_next_page_url_api_placeholder(self):
        """Test placeholder implementation of get_next_page_url for API data."""
        # Case 1: next_page_url_api present
        mock_api_response_next_url = {
            "pagination": {"next_page_url_api": "https://mock.api.santafe.gob.ar/licitaciones?page=2"}
        }
        next_url1 = await self.scraper.get_next_page_url(mock_api_response_next_url, self.config.url)
        self.assertEqual(next_url1, "https://mock.api.santafe.gob.ar/licitaciones?page=2")

        # Case 2: nextLink present (alternative key)
        mock_api_response_next_link = {
            "paging": {"nextLink": "https://mock.api.santafe.gob.ar/licitaciones?cursor=xyz"}
        }
        next_url2 = await self.scraper.get_next_page_url(mock_api_response_next_link, self.config.url)
        self.assertEqual(next_url2, "https://mock.api.santafe.gob.ar/licitaciones?cursor=xyz")

        # Case 3: No next page info
        mock_api_response_no_next = {"pagination": {"currentPage": 5, "totalPages": 5}}
        next_url_none = await self.scraper.get_next_page_url(mock_api_response_no_next, self.config.url)
        self.assertIsNone(next_url_none)
        
        # Case 4: Input not a dict
        next_url_bad_format = await self.scraper.get_next_page_url("not_a_dict", self.config.url)
        self.assertIsNone(next_url_bad_format)

if __name__ == '__main__':
    unittest.main()
```
