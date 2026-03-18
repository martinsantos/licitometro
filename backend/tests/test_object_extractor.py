"""Tests for extract_objeto() and is_poor_title() utilities."""
import pytest
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from utils.object_extractor import extract_objeto, is_poor_title


class TestIsPoorTitle:
    """Test is_poor_title() detects low-quality titles."""

    def test_numeric_only_title(self):
        assert is_poor_title("140/2025") is True
        assert is_poor_title("3/2026-616") is True
        assert is_poor_title("12345") is True

    def test_decree_title(self):
        assert is_poor_title("Decreto 140") is True

    def test_good_title(self):
        assert is_poor_title("Adquisición de materiales de construcción") is False
        assert is_poor_title("Servicio de limpieza integral del edificio") is False

    def test_empty_title(self):
        assert is_poor_title("") is True
        assert is_poor_title(None) is True


class TestExtractObjeto:
    """Test extract_objeto() priority chain."""

    def test_returns_none_for_empty_input(self):
        result = extract_objeto(title="", description="")
        # Should return None or empty string, not crash
        assert result is None or result == ""

    def test_extracts_from_good_description(self):
        desc = "Objeto: Provisión y colocación de luminarias LED en vía pública. Plazo 60 días."
        result = extract_objeto(title="EXP-100/2026", description=desc)
        assert result is not None
        assert "luminaria" in result.lower() or "LED" in result

    def test_max_length_200(self):
        desc = "Objeto: " + "A" * 300
        result = extract_objeto(title="", description=desc)
        if result:
            assert len(result) <= 200
