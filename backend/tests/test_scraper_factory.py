"""Tests for scraper factory routing — URL-first, then name-based."""

import pytest
from unittest.mock import MagicMock

bs4 = pytest.importorskip("bs4", reason="bs4 not installed (CI-light env)")

from models.scraper_config import ScraperConfig
from scrapers.scraper_factory import create_scraper


def _config(name: str, url: str, selectors: dict = None) -> ScraperConfig:
    """Helper to create a ScraperConfig with mock fields."""
    cfg = MagicMock(spec=ScraperConfig)
    cfg.name = name
    cfg.url = url
    cfg.selectors = selectors or {}
    cfg.active = True
    cfg.schedule_hours = [8, 12, 18]
    return cfg


class TestUrlRouting:
    """URL-based routing should match before name-based."""

    def test_comprasapps_mendoza_by_url(self):
        from scrapers.comprasapps_mendoza_scraper import ComprasAppsMendozaScraper
        scraper = create_scraper(_config("Whatever", "https://comprasapps.mendoza.gov.ar/Compras/servlet/Hli00049"))
        assert isinstance(scraper, ComprasAppsMendozaScraper)

    def test_comprar_mendoza_v2_by_url(self):
        from scrapers.mendoza_compra_v2 import MendozaCompraScraperV2
        scraper = create_scraper(_config("Whatever", "https://comprar.mendoza.gov.ar/Compras.aspx"))
        assert isinstance(scraper, MendozaCompraScraperV2)

    def test_boletin_oficial_by_url(self):
        from scrapers.boletin_oficial_mendoza_scraper import BoletinOficialMendozaScraper
        scraper = create_scraper(_config("Whatever", "https://boe.mendoza.gov.ar/"))
        assert isinstance(scraper, BoletinOficialMendozaScraper)

    def test_godoy_cruz_by_url(self):
        from scrapers.godoy_cruz_scraper import GodoyCruzScraper
        scraper = create_scraper(_config("Whatever", "https://webapps.godoycruz.gob.ar/consultacompras/"))
        assert isinstance(scraper, GodoyCruzScraper)

    def test_osep_by_url(self):
        from scrapers.osep_scraper import OsepScraper
        scraper = create_scraper(_config("Whatever", "https://comprarosep.mendoza.gov.ar/"))
        assert isinstance(scraper, OsepScraper)

    def test_aysam_by_url(self):
        from scrapers.aysam_scraper import AysamScraper
        scraper = create_scraper(_config("Whatever", "https://aysam.com.ar/licitaciones"))
        assert isinstance(scraper, AysamScraper)

    def test_las_heras_by_url(self):
        from scrapers.las_heras_scraper import LasHerasScraper
        scraper = create_scraper(_config("Whatever", "https://apex.lasherasdigital.gob.ar/ords/"))
        assert isinstance(scraper, LasHerasScraper)

    def test_epre_by_url(self):
        from scrapers.epre_scraper import EpreScraper
        scraper = create_scraper(_config("Whatever", "https://epremendoza.gov.ar/licitaciones"))
        assert isinstance(scraper, EpreScraper)


class TestGenericHtmlBeforeFallback:
    """CRITICAL: GenericHtmlScraper check MUST come before mendoza.gov.ar fallback."""

    def test_ipv_mendoza_uses_generic_html(self):
        """IPV (ipvmendoza.gov.ar) has selectors -> GenericHtml, not mendoza.gov.ar fallback."""
        from scrapers.generic_html_scraper import GenericHtmlScraper
        selectors = {"scraper_type": "generic_html", "list_item_selector": "article.post"}
        scraper = create_scraper(_config("IPV Mendoza", "https://ipvmendoza.gov.ar/licitaciones", selectors))
        assert isinstance(scraper, GenericHtmlScraper)

    def test_generic_html_with_link_selector(self):
        """Config with link_selector should use GenericHtmlScraper."""
        from scrapers.generic_html_scraper import GenericHtmlScraper
        selectors = {"link_selector": "a.title-link"}
        scraper = create_scraper(_config("Test Source", "https://something.mendoza.gov.ar/page", selectors))
        assert isinstance(scraper, GenericHtmlScraper)

    def test_plain_mendoza_gov_ar_uses_fallback(self):
        """Plain mendoza.gov.ar WITHOUT selectors falls back to MendozaCompraScraper."""
        from scrapers.mendoza_compra import MendozaCompraScraper
        scraper = create_scraper(_config("Random Mendoza", "https://something.mendoza.gov.ar/page"))
        assert isinstance(scraper, MendozaCompraScraper)

    def test_contrataciones_abiertas_before_mendoza_fallback(self):
        """Contrataciones Abiertas is at mendoza.gov.ar but should match BEFORE fallback."""
        from scrapers.contrataciones_abiertas_mza_scraper import ContratacionesAbiertasMzaScraper
        scraper = create_scraper(_config("OCDS", "https://datosabiertos-compras.mendoza.gov.ar/api/"))
        assert isinstance(scraper, ContratacionesAbiertasMzaScraper)


class TestNameRouting:
    """Name-based routing when URL doesn't match patterns."""

    def test_comprar_nacional_by_name(self):
        from scrapers.comprar_nacional_scraper import ComprarNacionalScraper
        scraper = create_scraper(_config("comprar_nacional", "https://comprar.gob.ar/"))
        assert isinstance(scraper, ComprarNacionalScraper)

    def test_vialidad_mendoza_by_name(self):
        from scrapers.vialidad_mendoza_scraper import VialidadMendozaScraper
        scraper = create_scraper(_config("Vialidad Mendoza", "https://vialidad.mendoza.gov.ar/"))
        assert isinstance(scraper, VialidadMendozaScraper)


class TestNoMatch:
    """Unknown URLs/names should return None."""

    def test_unknown_url_returns_none(self):
        scraper = create_scraper(_config("Unknown Source", "https://example.com/proc"))
        assert scraper is None
