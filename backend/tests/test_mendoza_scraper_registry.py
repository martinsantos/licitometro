"""Tests for the Licitometro 0.2 Mendoza scraper registry."""

from unittest.mock import MagicMock
from typing import Optional

from models.scraper_config import ScraperConfig
from scrapers.registry.mendoza import MENDOZA_SOURCE_RULES, resolve_mendoza_scraper


def _config(name: str, url: str, selectors: Optional[dict] = None) -> ScraperConfig:
    cfg = MagicMock(spec=ScraperConfig)
    cfg.name = name
    cfg.url = url
    cfg.selectors = selectors or {}
    return cfg


def test_mendoza_registry_has_stable_unique_source_ids():
    ids = [rule.source_id for rule in MENDOZA_SOURCE_RULES]
    assert len(ids) == len(set(ids))


def test_generic_html_rule_precedes_mendoza_gov_fallback():
    ids = [rule.source_id for rule in MENDOZA_SOURCE_RULES]
    assert ids.index("generic_html_mendoza") < ids.index("mendoza_gov_fallback")


def test_comprar_mendoza_defaults_to_v2():
    from scrapers.mendoza_compra_v2 import MendozaCompraScraperV2

    scraper = resolve_mendoza_scraper(_config("COMPR.AR Mendoza", "https://comprar.mendoza.gov.ar/Compras.aspx"))

    assert isinstance(scraper, MendozaCompraScraperV2)


def test_comprar_mendoza_can_route_to_legacy_v1():
    from scrapers.mendoza_compra import MendozaCompraScraper

    scraper = resolve_mendoza_scraper(_config("COMPR.AR Mendoza legacy v1", "https://comprar.mendoza.gov.ar/Compras.aspx"))

    assert isinstance(scraper, MendozaCompraScraper)


def test_ipvmendoza_generic_html_does_not_hit_fallback():
    from scrapers.generic_html_scraper import GenericHtmlScraper

    scraper = resolve_mendoza_scraper(
        _config(
            "IPV Mendoza",
            "https://ipvmendoza.gov.ar/licitaciones",
            {"scraper_type": "generic_html", "list_item_selector": "article.post"},
        )
    )

    assert isinstance(scraper, GenericHtmlScraper)
