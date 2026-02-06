import unittest
import asyncio
from datetime import datetime
from typing import Optional, List, Any

from pydantic import HttpUrl
from bs4 import BeautifulSoup

from backend.models.scraper_config import ScraperConfig
from backend.models.licitacion import LicitacionCreate
from backend.scrapers.cordoba_provincia_scraper import CordobaProvinciaScraper


class TestCordobaProvinciaScraper(unittest.IsolatedAsyncioTestCase):

    def setUp(self):
        """Set up test environment for CordobaProvinciaScraper."""
        self.config = ScraperConfig(
            name="Cordoba Provincia Test",
            url="https://mock.compras.cba.gov.ar/portal", # Main portal URL
            frequency_seconds=3600,
            module_path="backend.scrapers.cordoba_provincia_scraper",
            enabled=True,
            headers={"User-Agent": "Test Scraper Cordoba"},
        )
        # Assuming CordobaProvinciaScraper's __init__ is updated to accept config
        self.scraper = CordobaProvinciaScraper(self.config)
        # The scraper uses self.base_url for urljoin, let's ensure it's set for tests
        # Typically, the scraper would set this from config.url or a hardcoded value.
        # The CordobaProvinciaScraper has a hardcoded placeholder for self.base_url.
        # We can override it here for deterministic tests if needed, or rely on its default.
        # self.scraper.base_url = "https://compraspublicas.cba.gov.ar/" # Example of overriding
        # For this test, we'll rely on the scraper's own placeholder base_url or ensure config.url is used.
        # The scraper's current __init__ hardcodes `self.base_url = "https://placeholder.cordoba.gov.ar"`
        # So, link joining will use that.

    async def test_extract_licitacion_data_html_success(self):
        """Test successful data extraction from mock HTML matching placeholder selectors."""
        # This HTML is crafted to match the *placeholder selectors* in CordobaProvinciaScraper
        mock_html_content = """
        <html><body>
            <h1 class='licitacion-titulo'>Adquisición de Equipamiento Médico</h1>
            <div class='licitacion-id'><label>ID:</label><span class='valor'>LIC-CBA-2023-001</span></div>
            <div class='info-organismo'><p>Ministerio de Salud de Córdoba</p></div>
            <span class='fecha-publicacion'>2023-11-10T10:00:00</span>
            <div class='numero-expediente'><label>Expediente:</label><span class='valor'>EXP-2023-ABC-01</span></div>
            <div class='descripcion-licitacion'>Equipamiento completo para nuevo hospital regional.</div>
            <span class='estado-actual'>Abierta</span>
            <div class='monto-estimado'><label>Monto:</label><span class='valor'>$ 2.500.000,50</span></div>
            <div class='tipo-procedimiento'><label>Tipo:</label><span class='valor'>Licitación Pública Nacional</span></div>
            <div class='municipios'><label>Cobertura:</label><span class='valor'>Toda la provincia</span></div>
        </body></html>
        """
        mock_url = f"{self.scraper.base_url}/detalle/LIC-CBA-2023-001"

        licitacion = await self.scraper.extract_licitacion_data(mock_html_content, mock_url)

        self.assertIsNotNone(licitacion)
        self.assertIsInstance(licitacion, LicitacionCreate)

        self.assertEqual(licitacion.id_licitacion, "LIC-CBA-2023-001")
        self.assertEqual(licitacion.title, "Adquisición de Equipamiento Médico")
        self.assertEqual(licitacion.organization, "Ministerio de Salud de Córdoba")
        self.assertEqual(licitacion.jurisdiccion, "Córdoba Provincia") # Hardcoded in scraper
        
        expected_publication_date = datetime(2023, 11, 10, 10, 0, 0)
        self.assertEqual(licitacion.publication_date, expected_publication_date)
        
        self.assertEqual(licitacion.licitacion_number, "EXP-2023-ABC-01")
        self.assertEqual(licitacion.description, "Equipamiento completo para nuevo hospital regional.")
        self.assertEqual(licitacion.status, "Abierta")
        self.assertEqual(licitacion.budget, 2500000.50) # Parsed from '$ 2.500.000,50'
        self.assertEqual(licitacion.source_url, HttpUrl(mock_url))
        self.assertEqual(licitacion.tipo_procedimiento, "Licitación Pública Nacional")
        self.assertEqual(licitacion.tipo_acceso, "Web scraping") # Hardcoded in scraper
        self.assertEqual(licitacion.municipios_cubiertos, "Toda la provincia")
        
        self.assertIsInstance(licitacion.fecha_scraping, datetime)

    async def test_extract_licitacion_data_html_incomplete(self):
        """Test HTML data extraction when some elements are missing."""
        mock_html_content = """
        <html><body>
            <h1 class='licitacion-titulo'>Título Incompleto</h1>
            <div class='licitacion-id'><span class='valor'>LIC-INC-002</span></div>
            {/* Missing organism, fecha_publicacion, etc. */}
        </body></html>
        """
        mock_url = f"{self.scraper.base_url}/detalle/LIC-INC-002"
        licitacion = await self.scraper.extract_licitacion_data(mock_html_content, mock_url)

        self.assertIsNotNone(licitacion)
        self.assertEqual(licitacion.id_licitacion, "LIC-INC-002")
        self.assertEqual(licitacion.title, "Título Incompleto")
        self.assertTrue(licitacion.organization.endswith("_UNKNOWN")) # Defaulted
        self.assertIsInstance(licitacion.publication_date, datetime) # Defaults to now()
        self.assertIsNone(licitacion.budget) # Missing element

    async def test_extract_licitacion_data_html_malformed(self):
        """Test HTML data extraction with malformed date and budget values."""
        mock_html_content = """
        <html><body>
            <h1 class='licitacion-titulo'>Test Malformed</h1>
            <div class='licitacion-id'><span class='valor'>LIC-MAL-003</span></div>
            <span class='fecha-publicacion'>Esto no es una fecha</span>
            <div class='monto-estimado'><span class='valor'>cien pesos</span></div>
            <div class='info-organismo'><p>Org Test</p></div>
            <div class='numero-expediente'><span class='valor'>N/A</span></div>
             <span class='estado-actual'>Activa</span>
            <div class='tipo-procedimiento'><span class='valor'>Alguno</span></div>
        </body></html>
        """
        mock_url = f"{self.scraper.base_url}/detalle/LIC-MAL-003"
        licitacion = await self.scraper.extract_licitacion_data(mock_html_content, mock_url)
        
        self.assertIsNotNone(licitacion)
        self.assertEqual(licitacion.id_licitacion, "LIC-MAL-003")
        self.assertIsInstance(licitacion.publication_date, datetime) # Defaults to now()
        self.assertIsNone(licitacion.budget) # "cien pesos" fails to parse

    async def test_extract_links_html_placeholder(self):
        """Test HTML link extraction using placeholder selectors."""
        # Assumes self.scraper.base_url is "https://placeholder.cordoba.gov.ar" from scraper's __init__
        mock_listing_html = f"""
        <html><body>
            <a class="placeholder-licitacion-link-selector" href="/detalle/lic1">Licitacion 1</a>
            <a class="placeholder-licitacion-link-selector" href="https://externo.com/lic2">Licitacion 2 Externa</a>
            <a class="other-link" href="/no-select">No Select</a>
            <a class="placeholder-licitacion-link-selector" href="detalle/lic3_relative_path">Licitacion 3 Relative</a>
        </body></html>
        """
        expected_links = [
            f"{self.scraper.base_url}/detalle/lic1",
            "https://externo.com/lic2", # Absolute URL should remain unchanged
            f"{self.scraper.base_url}/detalle/lic3_relative_path"
        ]
        links = await self.scraper.extract_links(mock_listing_html)
        self.assertListEqual(links, expected_links)

    async def test_get_next_page_url_html_placeholder(self):
        """Test HTML next page URL extraction using placeholder selectors."""
        mock_pagination_html = f"""
        <html><body>
            <a class="placeholder-next-page-selector" href="?page=2">Siguiente</a>
        </body></html>
        """
        # current_url for context, though not strictly used by urljoin if href is relative path without domain
        current_page_url = f"{self.scraper.base_url}/listado?page=1" 
        expected_next_url = f"{self.scraper.base_url}/listado?page=2" # urljoin behavior with path
        
        # Need to adjust expectation if href is just "?page=2"
        # urljoin("https://placeholder.cordoba.gov.ar/listado?page=1", "?page=2") -> "https://placeholder.cordoba.gov.ar/listado?page=2"
        
        next_url = await self.scraper.get_next_page_url(mock_pagination_html, current_page_url)
        self.assertEqual(next_url, expected_next_url)

    async def test_get_next_page_url_html_no_link_placeholder(self):
        """Test HTML next page URL extraction when no link matches placeholder."""
        mock_no_pagination_html = "<html><body><p>No hay más páginas</p></body></html>"
        current_page_url = f"{self.scraper.base_url}/listado?page=10"
        next_url = await self.scraper.get_next_page_url(mock_no_pagination_html, current_page_url)
        self.assertIsNone(next_url)

if __name__ == '__main__':
    unittest.main()
