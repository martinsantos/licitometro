"""Tests for enrichment orchestrator — routing to correct sub-enricher."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from services.enrichment.orchestrator import GenericEnrichmentService
from services.enrichment.text_analyzer import enrich_title_only, extract_budget_from_text
from services.enrichment.url_helpers import is_unfetchable_url, find_best_alt_url


class TestUrlHelpers:
    def test_unfetchable_comprasapps(self):
        assert is_unfetchable_url("https://comprasapps.mendoza.gov.ar/Compras/servlet/Hli00049") is True

    def test_unfetchable_oracle_apex(self):
        assert is_unfetchable_url("https://apex.lasherasdigital.gob.ar/ords/app") is True

    def test_unfetchable_compraselectronicas(self):
        assert is_unfetchable_url("https://comprar.mendoza.gov.ar/ComprasElectronicas.aspx?qs=abc") is True

    def test_fetchable_normal_url(self):
        assert is_unfetchable_url("https://maipu.gob.ar/licitaciones/2024/01") is False

    def test_find_best_alt_url_prefers_detail(self):
        urls = {"list": "https://a.com/list", "pliego_detail": "https://a.com/pliego/123"}
        assert find_best_alt_url(urls) == "https://a.com/pliego/123"

    def test_find_best_alt_url_skips_localhost(self):
        urls = {"proxy": "http://localhost:8001/item", "real": "https://a.com/item"}
        assert find_best_alt_url(urls) == "https://a.com/item"

    def test_find_best_alt_url_empty(self):
        assert find_best_alt_url({}) is None
        assert find_best_alt_url(None) is None


class TestExtractBudget:
    def test_argentine_format(self):
        val, currency = extract_budget_from_text("Presupuesto oficial: $1.234.567,89")
        assert val == 1234567.89
        assert currency == "ARS"

    def test_usd_format(self):
        val, currency = extract_budget_from_text("Monto estimado: $50.000,00 USD")
        assert val == 50000.0
        assert currency == "USD"

    def test_below_threshold(self):
        val, _ = extract_budget_from_text("presupuesto: $50")
        assert val is None

    def test_no_budget(self):
        val, _ = extract_budget_from_text("Este documento no tiene presupuesto")
        assert val is None


class TestTitleOnlyEnrichment:
    def test_extracts_objeto_from_descriptive_title(self):
        lic_doc = {
            "title": "Licitación Pública N° 10/2026 - Adquisición de equipamiento informático",
            "description": "Se convoca a adquisición de equipamiento informático para el municipio",
        }
        result = enrich_title_only(lic_doc)
        # Should extract objeto from title+description
        assert "objeto" in result or "category" in result

    def test_skips_if_already_has_objeto(self):
        lic_doc = {"title": "Test", "description": "", "objeto": "Already set", "category": "IT"}
        result = enrich_title_only(lic_doc)
        assert result == {}
