from typing import Optional
from ..models.scraper_config import ScraperConfig
from .base_scraper import BaseScraper
from .comprar_gob_ar import ComprarGobArScraper
from .mendoza_compra import MendozaCompraScraper

def create_scraper(config: ScraperConfig) -> Optional[BaseScraper]:
    """Create a scraper based on the configuration"""
    
    # Check for known scrapers by URL or name
    if "comprar.gob.ar" in config.url:
        return ComprarGobArScraper(config)
    elif "mendoza.gov.ar" in config.url or "mendoza-compra" in config.url.lower():
        return MendozaCompraScraper(config)
    
    # For unknown URLs, use a generic scraper (not implemented yet)
    return None
