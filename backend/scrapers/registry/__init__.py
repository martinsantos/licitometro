"""Scraper registry package."""

from .argentina import ARGENTINA_SOURCE_RULES, resolve_argentina_scraper
from .mendoza import MENDOZA_SOURCE_RULES, resolve_mendoza_scraper

__all__ = [
    "ARGENTINA_SOURCE_RULES",
    "MENDOZA_SOURCE_RULES",
    "resolve_argentina_scraper",
    "resolve_mendoza_scraper",
]
