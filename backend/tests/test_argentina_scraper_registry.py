"""Tests for the Licitometro 0.2 Argentina scraper registry."""

from typing import Optional
from unittest.mock import MagicMock

from models.scraper_config import ScraperConfig
from scrapers.registry.argentina import ARGENTINA_SOURCE_RULES, resolve_argentina_scraper


def _config(name: str, url: str, selectors: Optional[dict] = None) -> ScraperConfig:
    cfg = MagicMock(spec=ScraperConfig)
    cfg.name = name
    cfg.url = url
    cfg.selectors = selectors or {}
    return cfg


def test_argentina_registry_has_stable_unique_source_ids():
    ids = [rule.source_id for rule in ARGENTINA_SOURCE_RULES]
    assert len(ids) == len(set(ids))


def test_comprar_nacional_routes_to_aspnet_scraper():
    from scrapers.comprar_nacional_scraper import ComprarNacionalScraper

    scraper = resolve_argentina_scraper(
        _config("COMPR.AR Nacional", "https://comprar.gob.ar/Compras.aspx")
    )

    assert isinstance(scraper, ComprarNacionalScraper)


def test_bac_routes_by_current_and_legacy_domains():
    from scrapers.bac_scraper import BACScraper

    current = resolve_argentina_scraper(
        _config("BAC Buenos Aires", "https://bac.buyarg.com/Compras.aspx")
    )
    legacy = resolve_argentina_scraper(
        _config("Buenos Aires Compras", "https://www.buenosairescompras.gob.ar/Compras.aspx")
    )

    assert isinstance(current, BACScraper)
    assert isinstance(legacy, BACScraper)


def test_pjn_routes_to_rest_scraper():
    from scrapers.pjn_scraper import PJNScraper

    scraper = resolve_argentina_scraper(
        _config("Magistratura PJN", "https://srpcm.pjn.gov.ar/contrataciones")
    )

    assert isinstance(scraper, PJNScraper)


def test_datos_argentina_routes_by_selector_type_without_domain():
    from scrapers.datos_argentina_scraper import DatosArgentinaScraper

    scraper = resolve_argentina_scraper(
        _config(
            "Dataset contrataciones",
            "https://example.com/catalog",
            {"scraper_type": "datos_argentina"},
        )
    )

    assert isinstance(scraper, DatosArgentinaScraper)
