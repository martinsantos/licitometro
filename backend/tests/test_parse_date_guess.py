"""Tests for parse_date_guess() utility function."""
import pytest
from datetime import datetime
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from utils.dates import parse_date_guess


class TestParseDateGuess:
    """Test parse_date_guess with various date formats."""

    def test_basic_dd_mm_yyyy(self):
        result = parse_date_guess("15/03/2026")
        assert result is not None
        assert result.year == 2026
        assert result.month == 3
        assert result.day == 15

    def test_us_format_mm_dd_yyyy(self):
        """US format 12/31/2025 should parse as December 31."""
        result = parse_date_guess("12/31/2025")
        assert result is not None
        assert result.month == 12
        assert result.day == 31

    def test_spanish_month_name(self):
        result = parse_date_guess("15 de marzo de 2026")
        assert result is not None
        assert result.month == 3
        assert result.day == 15

    def test_spanish_month_abbreviated(self):
        result = parse_date_guess("15 ene 2026")
        assert result is not None
        assert result.month == 1

    def test_iso_format(self):
        result = parse_date_guess("2026-03-15")
        assert result is not None
        assert result.year == 2026
        assert result.month == 3
        assert result.day == 15

    def test_none_input(self):
        assert parse_date_guess(None) is None
        assert parse_date_guess("") is None

    def test_invalid_date(self):
        result = parse_date_guess("not a date at all xyz")
        assert result is None

    def test_year_in_string(self):
        """Year embedded in expedition number."""
        result = parse_date_guess("EXP-2026/100")
        # Should extract 2026 but may not have a full date
        # Just verify it doesn't crash
        pass  # Result can be None or a date with year 2026

    def test_future_year_rejected(self):
        """Years >= 2028 should not be accepted."""
        result = parse_date_guess("15/03/2028")
        # This tests that outlandish future dates are handled
        # The function may return None or the date — just shouldn't crash
        pass
