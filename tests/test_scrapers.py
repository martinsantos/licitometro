import pytest
import asyncio
from unittest.mock import MagicMock, patch

from bs4 import BeautifulSoup

from backend.models.scraper_config import ScraperConfig
from backend.models.licitacion import LicitacionCreate
from backend.scrapers.base_scraper import BaseScraper
from backend.scrapers.comprar_gob_ar import ComprarGobArScraper
from backend.scrapers.mendoza_compra import MendozaCompraScraper

# Minimal concrete subclass of BaseScraper for testing _determine_status
class MinimalScraper(BaseScraper):
    async def extract_licitacion_data(self, html: str, url: str):
        pass
    async def extract_links(self, html: str):
        pass
    async def get_next_page_url(self, html: str, current_url: str):
        pass

@pytest.fixture
def minimal_scraper_factory():
    def _create_scraper(config_data: dict):
        config = ScraperConfig(**config_data)
        scraper = MinimalScraper(config)
        return scraper
    return _create_scraper

# Tests for BaseScraper._determine_status
def test_determine_status_default_active(minimal_scraper_factory):
    scraper = minimal_scraper_factory({
        "name": "Test",
        "url": "http://example.com",
        "selectors": {}
    })
    soup = BeautifulSoup("", 'html.parser')
    assert scraper._determine_status(soup) == "active"

def test_determine_status_selector_no_mapping_keyword_match(minimal_scraper_factory):
    scraper = minimal_scraper_factory({
        "name": "Test",
        "url": "http://example.com",
        "selectors": {"status_selector": "div.status_here"}
    })

    soup_closed = BeautifulSoup("<div class='status_here'>Cerrada</div>", 'html.parser')
    assert scraper._determine_status(soup_closed) == "closed"

    soup_active = BeautifulSoup("<div class='status_here'>En Curso</div>", 'html.parser')
    assert scraper._determine_status(soup_active) == "active"
    
    soup_active_alt = BeautifulSoup("<div class='status_here'>abierta</div>", 'html.parser')
    assert scraper._determine_status(soup_active_alt) == "active"

    soup_unknown = BeautifulSoup("<div class='status_here'>Unknown Status Text</div>", 'html.parser')
    assert scraper._determine_status(soup_unknown) == "active" # Fallback

def test_determine_status_selector_and_mapping(minimal_scraper_factory):
    scraper = minimal_scraper_factory({
        "name": "Test",
        "url": "http://example.com",
        "selectors": {"status_selector": "span.status"},
        "status_mapping": {"Open": "active", "Ended": "closed", "Publicada": "active"}
    })

    soup_open = BeautifulSoup("<span class='status'>Open</span>", 'html.parser')
    assert scraper._determine_status(soup_open) == "active"

    soup_ended = BeautifulSoup("<span class='status'>Ended</span>", 'html.parser')
    assert scraper._determine_status(soup_ended) == "closed"
    
    soup_published = BeautifulSoup("<span class='status'>Publicada</span>", 'html.parser')
    assert scraper._determine_status(soup_published) == "active"

    soup_not_mapped = BeautifulSoup("<span class='status'>NotMapped</span>", 'html.parser')
    assert scraper._determine_status(soup_not_mapped) == "active" # Fallback after mapping miss

def test_determine_status_selector_finds_nothing(minimal_scraper_factory):
    scraper = minimal_scraper_factory({
        "name": "Test",
        "url": "http://example.com",
        "selectors": {"status_selector": "div.non_existent"}
    })
    soup = BeautifulSoup("<div class='real_status'>Some text</div>", 'html.parser')
    assert scraper._determine_status(soup) == "active"


# Tests for Specific Scrapers
@pytest.mark.asyncio
async def test_comprar_gob_ar_scraper_status_mocked_determine():
    config_data = {
        "name": "ComprarGobAr Test",
        "url": "http://comprar.gob.ar",
        "selectors": {
            "title": "h1.title", # Dummy selector
            "status_selector": "div.status" # Dummy selector
        }
    }
    config = ScraperConfig(**config_data)
    scraper = ComprarGobArScraper(config)

    # Mock HTML that has at least a title to prevent early exit
    mock_html = "<html><body><h1 class='title'>Test Title</h1><div class='status'>Estado Actual</div></body></html>"
    
    with patch.object(ComprarGobArScraper, '_determine_status', return_value='closed') as mock_method:
        result = await scraper.extract_licitacion_data(mock_html, "http://example.com/detail")
        assert result is not None
        assert result.status == 'closed'
        mock_method.assert_called_once()

@pytest.mark.asyncio
async def test_mendoza_compra_scraper_status_mocked_determine():
    config_data = {
        "name": "MendozaCompra Test",
        "url": "http://mendoza.compra.com",
        "selectors": {
            "title": "h1.title", # Dummy selector
            "status_selector": "div.status-info" # Dummy selector
        }
    }
    config = ScraperConfig(**config_data)
    scraper = MendozaCompraScraper(config)

    mock_html = "<html><body><h1 class='title'>Test Licitacion Mendoza</h1><div class='status-info'>Finalizada</div></body></html>"

    with patch.object(MendozaCompraScraper, '_determine_status', return_value='active') as mock_method:
        result = await scraper.extract_licitacion_data(mock_html, "http://example.com/mendoza/detail")
        assert result is not None
        assert result.status == 'active'
        mock_method.assert_called_once()

# More comprehensive test for ComprarGobArScraper (closer to integration)
@pytest.mark.asyncio
async def test_comprar_gob_ar_scraper_status_integration():
    config_data = {
        "name": "ComprarGobAr Test Integration",
        "url": "http://comprar.gob.ar",
        "selectors": {
            "title": "h1.lic-title",
            "status_selector": "div.estado-proceso",
            # Add other necessary selectors if extract_licitacion_data relies on them
            "organization": "div.org",
            "publication_date": "div.pub-date",
            "opening_date": "div.open-date",
        },
        "status_mapping": {"En Adjudicación": "closed"} # Example mapping
    }
    config = ScraperConfig(**config_data)
    scraper = ComprarGobArScraper(config)

    # Mock HTML
    mock_html = """
    <html><body>
        <h1 class='lic-title'>Super Licitacion</h1>
        <div class='estado-proceso'>En Adjudicación</div>
        <div class='org'>Organismo X</div>
        <div class='pub-date'>01/01/2024</div>
        <div class='open-date'>10/01/2024</div>
    </body></html>
    """
    # No need to mock session or fetch_page as we pass HTML directly
    
    result = await scraper.extract_licitacion_data(mock_html, "http://example.com/detail_comprar")
    
    assert result is not None
    assert result.title == "Super Licitacion"
    assert result.status == "closed" # Based on status_selector and status_mapping

@pytest.mark.asyncio
async def test_mendoza_compra_scraper_status_integration():
    config_data = {
        "name": "MendozaCompra Test Integration",
        "url": "http://compras.mendoza.gov.ar",
        "selectors": {
            "title": "h1.main-title",
            "status_selector": "span#statusText",
            # Add other necessary selectors
            "organization": "p.agency",
            "publication_date": "span.date-pub",
            "opening_date": "span.date-open",
        },
        "status_mapping": {"Publicada": "active", "Cerrada Oficialmente": "closed"}
    }
    config = ScraperConfig(**config_data)
    scraper = MendozaCompraScraper(config)

    mock_html = """
    <html><body>
        <h1 class='main-title'>Licitacion Mendoza Grande</h1>
        <span id='statusText'>Cerrada Oficialmente</span>
        <p class='agency'>Ministerio de Compras</p>
        <span class='date-pub'>05/02/2024</span>
        <span class='date-open'>15/02/2024</span>
    </body></html>
    """
    
    result = await scraper.extract_licitacion_data(mock_html, "http://example.com/detail_mendoza")
    
    assert result is not None
    assert result.title == "Licitacion Mendoza Grande"
    assert result.status == "closed"
