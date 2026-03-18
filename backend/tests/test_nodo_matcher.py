"""Tests for NodoMatcher keyword matching."""
import pytest
import re
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from services.nodo_matcher import _build_flexible_pattern, _normalize_text, _spanish_stem


class TestSpanishStem:
    """Test Spanish stemming."""

    def test_plural_to_singular(self):
        assert _spanish_stem("computadoras") == "computadora"
        assert _spanish_stem("servicios") == "servicio"

    def test_iones_ending(self):
        assert _spanish_stem("licitaciones") == "licitacion"
        assert _spanish_stem("contrataciones") == "contratacion"

    def test_ces_ending(self):
        assert _spanish_stem("raices") == "raiz"

    def test_no_change_for_short_words(self):
        assert _spanish_stem("el") == "el"
        assert _spanish_stem("la") == "la"


class TestBuildFlexiblePattern:
    """Test pattern building."""

    def test_basic_keyword(self):
        pattern = _build_flexible_pattern("computadora")
        assert pattern.search("adquisición de computadoras") is not None
        assert pattern.search("texto irrelevante") is None

    def test_accent_tolerance(self):
        """'licitacion' should match 'licitación'."""
        pattern = _build_flexible_pattern("licitacion")
        assert pattern.search("licitación pública") is not None

    def test_short_keyword_word_boundary(self):
        """'PC' should NOT match 'precio' or 'poco'."""
        pattern = _build_flexible_pattern("PC")
        assert pattern.search("adquisición de PC para oficina") is not None
        assert pattern.search("precio de compra") is None

    def test_multi_word_keyword(self):
        pattern = _build_flexible_pattern("servicios informaticos")
        assert pattern.search("contratación de servicios informáticos") is not None

    def test_case_insensitive(self):
        pattern = _build_flexible_pattern("Software")
        assert pattern.search("desarrollo de software municipal") is not None
        assert pattern.search("ADQUISICION DE SOFTWARE") is not None


class TestNormalizeText:
    """Test text normalization."""

    def test_strips_punctuation(self):
        result = _normalize_text("test-word.another")
        assert "-" not in result
        assert "." not in result

    def test_lowercases(self):
        result = _normalize_text("UPPERCASE TEXT")
        assert result == result.lower()
