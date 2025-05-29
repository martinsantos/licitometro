import unittest
import asyncio
from datetime import datetime
from typing import Optional, List, Any

from pydantic import HttpUrl

# Corrected import paths assuming 'backend' is a top-level package for models and scrapers
# and 'tests' is at the same level as 'backend'.
# This requires __init__.py in relevant directories and proper PYTHONPATH setup if run directly.
# For a typical project structure where tests are outside the main package, adjustments might be needed
# or running via a test runner that handles paths (e.g. python -m unittest)
from backend.models.scraper_config import ScraperConfig
from backend.models.licitacion import LicitacionCreate
from backend.scrapers.buenos_aires_provincia_scraper import BuenosAiresProvinciaScraper


class TestBuenosAiresProvinciaScraper(unittest.IsolatedAsyncioTestCase):

    def setUp(self):
        """Set up test environment for BuenosAiresProvinciaScraper."""
        self.config = ScraperConfig(
            name="Buenos Aires Provincia Test",
            url="https://mock.api.gba.gob.ar/licitaciones", # Placeholder API URL
            frequency_seconds=3600,
            module_path="backend.scrapers.buenos_aires_provincia_scraper", # For reference
            enabled=True,
            headers={"User-Agent": "Test Scraper"},
            params={"param1": "value1"}
        )
        # Assuming BuenosAiresProvinciaScraper is updated to accept config
        # If not, this line would need to be self.scraper = BuenosAiresProvinciaScraper()
        # And the scraper's __init__ would need to match.
        # Based on factory changes, it should accept config.
        self.scraper = BuenosAiresProvinciaScraper(self.config)
        # self.scraper = BuenosAiresProvinciaScraper() # Use this if scraper __init__ doesn't take config

    async def test_extract_licitacion_data_api_success(self):
        """Test successful data extraction from a mock API response."""
        mock_api_response = {
            "id_licitacion_api": "BAP_LIC_2023_001",
            "titulo_api": "Construcción de Escuela Primaria Nro 123",
            "organismo_api": "Dirección General de Cultura y Educación PBA",
            "jurisdiccion_api": "Provincia de Buenos Aires",
            "fecha_publicacion_api": "2023-10-15T10:00:00", # ISO format
            "numero_licitacion_api": "EXP-2023-0012345-GDEBA-DGCYE",
            "estado_licitacion_api": "Publicada",
            "monto_estimado_api": "12500000.75", # String, to be converted to float
            "tipo_procedimiento_api": "Licitación Pública",
            "tipo_acceso_api": "Electrónico",
            "municipios_cubiertos_api": "La Plata, Berazategui",
            "descripcion_api": "Obra completa para la nueva escuela." # Added for completeness if LicitacionBase needs it
        }
        mock_url = "https://mock.api.gba.gob.ar/licitaciones/BAP_LIC_2023_001"

        licitacion = await self.scraper.extract_licitacion_data(mock_api_response, mock_url)

        self.assertIsNotNone(licitacion)
        self.assertIsInstance(licitacion, LicitacionCreate)

        self.assertEqual(licitacion.id_licitacion, "BAP_LIC_2023_001")
        self.assertEqual(licitacion.title, "Construcción de Escuela Primaria Nro 123")
        self.assertEqual(licitacion.organization, "Dirección General de Cultura y Educación PBA")
        self.assertEqual(licitacion.jurisdiccion, "Provincia de Buenos Aires")
        
        expected_publication_date = datetime(2023, 10, 15, 10, 0, 0)
        self.assertEqual(licitacion.publication_date, expected_publication_date)
        
        self.assertEqual(licitacion.licitacion_number, "EXP-2023-0012345-GDEBA-DGCYE")
        self.assertEqual(licitacion.status, "Publicada")
        self.assertEqual(licitacion.budget, 12500000.75)
        self.assertEqual(licitacion.source_url, HttpUrl(mock_url))
        self.assertEqual(licitacion.tipo_procedimiento, "Licitación Pública")
        self.assertEqual(licitacion.tipo_acceso, "Electrónico")
        self.assertEqual(licitacion.municipios_cubiertos, "La Plata, Berazategui")
        
        # fecha_scraping is set to datetime.now(), so we check its type
        self.assertIsInstance(licitacion.fecha_scraping, datetime)
        # description is an optional field in LicitacionBase, ensure it's handled
        # The scraper current placeholder does not map description_api, so it should be None
        # If it were mapped: self.assertEqual(licitacion.description, "Obra completa para la nueva escuela.")
        self.assertIsNone(licitacion.description) # Based on current scraper impl.

    async def test_extract_licitacion_data_api_failure_missing_required(self):
        """Test extraction failure when required API data is missing."""
        mock_api_response_missing = {
            # Missing "id_licitacion_api", "titulo_api", etc.
            "organismo_api": "Dirección General de Cultura y Educación PBA",
            "fecha_publicacion_api": "2023-10-15T10:00:00",
        }
        mock_url = "https://mock.api.gba.gob.ar/licitaciones/BAP_LIC_FAIL_002"
        
        # The current scraper implementation fills missing required fields with "_UNKNOWN"
        # and does not return None unless the input `data` is not a dict.
        # So, we expect an object, but with placeholder values for critical fields.
        licitacion = await self.scraper.extract_licitacion_data(mock_api_response_missing, mock_url)
        
        self.assertIsNotNone(licitacion) # It will return an object
        self.assertTrue(licitacion.id_licitacion.endswith("_UNKNOWN"))
        self.assertTrue(licitacion.title.endswith("_UNKNOWN"))
        # ... and so on for other fields that would be missing and are required by LicitacionCreate.

    async def test_extract_licitacion_data_api_failure_bad_types(self):
        """Test extraction failure with incorrect data types from API."""
        mock_api_response_bad_type = {
            "id_licitacion_api": "BAP_LIC_BAD_003",
            "titulo_api": "Test Bad Types",
            "organismo_api": "Test Org",
            "jurisdiccion_api": "Test Juris",
            "fecha_publicacion_api": "esto-no-es-una-fecha", # Invalid date format
            "numero_licitacion_api": "NUM-BAD-003",
            "estado_licitacion_api": "Estado Malo",
            "monto_estimado_api": "unmillon", # Invalid float
            "tipo_procedimiento_api": "Procedimiento Malo",
        }
        mock_url = "https://mock.api.gba.gob.ar/licitaciones/BAP_LIC_BAD_003"

        licitacion = await self.scraper.extract_licitacion_data(mock_api_response_bad_type, mock_url)
        
        self.assertIsNotNone(licitacion) # Scraper tries to parse, defaults on failure
        self.assertNotEqual(licitacion.publication_date, datetime(1,1,1)) # Default is now()
        self.assertIsInstance(licitacion.publication_date, datetime) # Should default to now()
        self.assertIsNone(licitacion.budget) # Parsing "unmillon" to float fails, results in None

    async def test_extract_licitacion_data_not_dict(self):
        """Test extraction failure when input data is not a dictionary."""
        mock_api_response_not_dict = "This is a string, not a dict"
        mock_url = "https://mock.api.gba.gob.ar/licitaciones/BAP_LIC_NOT_DICT"
        
        licitacion = await self.scraper.extract_licitacion_data(mock_api_response_not_dict, mock_url)
        self.assertIsNone(licitacion) # Scraper should return None if data is not dict

    async def test_extract_links_placeholder(self):
        """Test placeholder implementation of extract_links."""
        # Placeholder expects a list or dict, returns [] if not matching or empty
        mock_api_response_for_links = {"items": [{"detail_url_api": "url1"}, {"no_url": "data"}]} 
        links = await self.scraper.extract_links(mock_api_response_for_links)
        self.assertEqual(links, ["url1"])

        links_empty = await self.scraper.extract_links([])
        self.assertEqual(links_empty, [])
        
        links_bad_format = await self.scraper.extract_links("not a list or dict")
        self.assertEqual(links_bad_format, [])


    async def test_get_next_page_url_placeholder(self):
        """Test placeholder implementation of get_next_page_url."""
        mock_api_response_with_next = {
            "pagination": {"next_page_url_api": "https://mock.api.gba.gob.ar/licitaciones?page=2"}
        }
        next_url = await self.scraper.get_next_page_url(mock_api_response_with_next, self.config.url)
        self.assertEqual(next_url, "https://mock.api.gba.gob.ar/licitaciones?page=2")

        mock_api_response_no_next = {"pagination": {"other_info": "data"}}
        next_url_none = await self.scraper.get_next_page_url(mock_api_response_no_next, self.config.url)
        self.assertIsNone(next_url_none)

        next_url_bad_format = await self.scraper.get_next_page_url("not a dict", self.config.url)
        self.assertIsNone(next_url_bad_format)

if __name__ == '__main__':
    unittest.main()
```
