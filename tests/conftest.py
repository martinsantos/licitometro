"""
Pytest configuration for Licitometro tests.
"""

import sys
import os

# Ensure backend modules are importable from all test files
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))


LEGACY_SCRAPER_TESTS = {
    "test_buenos_aires_provincia_scraper.py",
    "test_caba_scraper.py",
    "test_cordoba_provincia_scraper.py",
    "test_mendoza_provincia_scraper.py",
    "test_santa_fe_provincia_scraper.py",
}


def pytest_ignore_collect(collection_path, config):
    """Skip scraper tests for modules that no longer exist in this codebase."""
    return collection_path.name in LEGACY_SCRAPER_TESTS
