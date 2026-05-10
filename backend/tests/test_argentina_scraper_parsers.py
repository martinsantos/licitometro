"""Parser tests for Argentina Selenium-backed scrapers."""

from unittest.mock import MagicMock
from typing import Optional

from models.scraper_config import ScraperConfig
from scrapers.bac_scraper import BACScraper
from scrapers.comprar_nacional_scraper import ComprarNacionalScraper


def _config(name: str, url: str, selectors: Optional[dict] = None, max_items: int = 10) -> ScraperConfig:
    cfg = MagicMock(spec=ScraperConfig)
    cfg.name = name
    cfg.url = url
    cfg.selectors = selectors or {}
    cfg.max_items = max_items
    cfg.headers = {}
    cfg.cookies = {}
    return cfg


def test_bac_row_to_licitacion_parses_opening_date_and_safe_source_url():
    scraper = BACScraper(_config("BAC Buenos Aires", "https://www.buenosairescompras.gob.ar/BuscarAvanzado.aspx"))

    item = scraper._row_to_licitacion(
        {
            "numero": "431-0739-LPU26",
            "title": "ADQUISICION DE TRAMPA DE AGUA",
            "href": None,
            "cells": [
                "431-0739-LPU26",
                "ADQUISICION DE TRAMPA DE AGUA",
                "Licitación Pública",
                "14/05/2026 10:00 Hrs.",
                "Publicado",
                "431 - HTAL. BERNARDINO RIVADAVIA",
            ],
        },
        "servicio",
    )

    assert item.id_licitacion == "bac-bsas-431-0739-LPU26"
    assert str(item.source_url) == "https://www.buenosairescompras.gob.ar/BuscarAvanzado.aspx"
    assert item.url_quality == "list_only"
    assert item.opening_date.year == 2026
    assert item.opening_date.month == 5
    assert item.opening_date.day == 14
    assert item.estado == "Publicado"
    assert item.metadata["bac_apertura_raw"] == "14/05/2026 10:00 Hrs."


def test_comprar_home_rows_build_national_items():
    scraper = ComprarNacionalScraper(_config("COMPR.AR Nacional", "https://comprar.gob.ar/Default.aspx"))

    items = scraper._build_items_from_rows(
        [
            {
                "numero": "340/1-0022-LPU26",
                "title": "SERVICIO DE GESTION DE TARJETAS CORPORATIVAS",
                "tipo": "Licitación Pública",
                "apertura": "11/05/2026 08:00 Hrs.",
                "servicio_admin": "340 - ADMINISTRACION DE PARQUES NACIONALES",
                "target": "ctl00$CPH1$CtrlConsultasFrecuentes$gvListadoPliegos$ctl06$lnkNumeroProceso",
            }
        ],
        "https://comprar.gob.ar/Default.aspx",
    )

    assert len(items) == 1
    assert items[0].id_licitacion == "comprar-nac-340/1-0022-LPU26"
    assert items[0].url_quality == "list_only"
    assert items[0].opening_date.year == 2026
    assert items[0].metadata["comprar_extraction"] == "selenium_home_grid"
    assert "LIC_AR" in items[0].tags
