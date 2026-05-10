"""
Scraper Factory - Creates appropriate scraper instances based on configuration.
"""

from typing import Optional
import logging

from models.scraper_config import ScraperConfig
from scrapers.base_scraper import BaseScraper
from .registry import resolve_argentina_scraper, resolve_mendoza_scraper

logger = logging.getLogger("scraper_factory")


def create_scraper(config: ScraperConfig) -> Optional[BaseScraper]:
    """
    Create a scraper based on the configuration.
    
    Matches by URL pattern first, then by name.
    """
    
    # === MENDOZA - Provincia ===
    # Licitometro 0.2 starts here: Mendoza routing is declarative and ordered.
    mendoza_scraper = resolve_mendoza_scraper(config)
    if mendoza_scraper:
        logger.info(f"Using {mendoza_scraper.__class__.__name__} for {config.name}")
        return mendoza_scraper

    # === NACIONAL / AR SOURCES ===
    argentina_scraper = resolve_argentina_scraper(config)
    if argentina_scraper:
        logger.info(f"Using {argentina_scraper.__class__.__name__} for {config.name}")
        return argentina_scraper

    # No matching scraper found
    logger.warning(f"No specific scraper found for URL {config.url} or name {config.name}")
    return None
