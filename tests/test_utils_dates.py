"""
Tests para utils/dates.py - utilidades de fecha compartidas por los scrapers.
"""

import sys
import os
import unittest
from datetime import datetime, date, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from utils.dates import parse_date_guess, last_business_days, last_business_days_set, now_in_tz


class TestParseDateGuess(unittest.TestCase):
    """Tests para parse_date_guess."""

    def test_dd_mm_yyyy_slash(self):
        result = parse_date_guess("15/03/2026")
        self.assertEqual(result, datetime(2026, 3, 15))

    def test_dd_mm_yyyy_dash(self):
        result = parse_date_guess("15-03-2026")
        self.assertEqual(result, datetime(2026, 3, 15))

    def test_yyyy_mm_dd(self):
        result = parse_date_guess("2026-03-15")
        self.assertEqual(result, datetime(2026, 3, 15))

    def test_dd_mm_yyyy_hhmm(self):
        result = parse_date_guess("15/03/2026 14:30")
        self.assertEqual(result, datetime(2026, 3, 15, 14, 30))

    def test_dd_mm_yyyy_hhmmss(self):
        result = parse_date_guess("15/03/2026 14:30:45")
        self.assertEqual(result, datetime(2026, 3, 15, 14, 30, 45))

    def test_yyyy_mm_dd_hhmm(self):
        result = parse_date_guess("2026-03-15 14:30")
        self.assertEqual(result, datetime(2026, 3, 15, 14, 30))

    def test_empty_string_returns_none(self):
        self.assertIsNone(parse_date_guess(""))

    def test_whitespace_returns_none(self):
        self.assertIsNone(parse_date_guess("   "))

    def test_invalid_format_returns_none(self):
        self.assertIsNone(parse_date_guess("not-a-date"))

    def test_partial_date_returns_none(self):
        self.assertIsNone(parse_date_guess("15/03"))


class TestLastBusinessDays(unittest.TestCase):
    """Tests para last_business_days y last_business_days_set."""

    def test_returns_correct_count(self):
        days = last_business_days(4, "America/Argentina/Mendoza")
        self.assertEqual(len(days), 4)

    def test_all_are_weekdays(self):
        days = last_business_days(10, "America/Argentina/Mendoza")
        for d in days:
            self.assertLess(d.weekday(), 5, f"{d} is not a weekday")

    def test_zero_count_returns_empty(self):
        days = last_business_days(0, "America/Argentina/Mendoza")
        self.assertEqual(len(days), 0)

    def test_negative_count_returns_empty(self):
        days = last_business_days(-1, "America/Argentina/Mendoza")
        self.assertEqual(len(days), 0)

    def test_set_version_returns_set(self):
        result = last_business_days_set(4, "America/Argentina/Mendoza")
        self.assertIsInstance(result, set)
        self.assertEqual(len(result), 4)

    def test_with_anchor_date(self):
        anchor = date(2026, 2, 5)  # Thursday
        days = last_business_days(3, "America/Argentina/Mendoza", anchor=anchor)
        self.assertEqual(len(days), 3)
        self.assertIn(anchor, days)

    def test_anchor_on_weekend_rolls_back(self):
        saturday = date(2026, 2, 7)
        days = last_business_days(1, "America/Argentina/Mendoza", anchor=saturday)
        self.assertEqual(len(days), 1)
        # Should be Friday Feb 6
        self.assertEqual(days[0].weekday(), 4)

    def test_days_are_in_descending_order(self):
        days = last_business_days(5, "America/Argentina/Mendoza")
        for i in range(len(days) - 1):
            self.assertGreater(days[i], days[i + 1])


class TestNowInTz(unittest.TestCase):
    """Tests para now_in_tz."""

    def test_returns_datetime(self):
        result = now_in_tz("America/Argentina/Mendoza")
        self.assertIsInstance(result, datetime)

    def test_invalid_tz_returns_utc(self):
        result = now_in_tz("Invalid/Timezone")
        self.assertIsInstance(result, datetime)

    def test_utc_works(self):
        result = now_in_tz("UTC")
        self.assertIsInstance(result, datetime)


if __name__ == "__main__":
    unittest.main()
