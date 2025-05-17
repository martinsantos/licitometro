from typing import Optional
import sys
from pathlib import Path

# Add parent directory to path so we can import modules
sys.path.insert(0, str(Path(__file__).parent.parent))

from models.scraper_config import ScraperConfig
from scrapers.base_scraper import BaseScraper
from scrapers.comprar_gob_ar import ComprarGobArScraper
from scrapers.mendoza_compra import MendozaCompraScraper

def create_scraper(config: ScraperConfig) -> Optional[BaseScraper]:
    """Create a scraper based on the configuration"""
    
    # Check for known scrapers by URL or name
    if "comprar.gob.ar" in config.url:
        return ComprarGobArScraper(config)
    elif "mendoza.gov.ar" in config.url or "mendoza-compra" in config.url.lower():
        return MendozaCompraScraper(config)
    
    # For unknown URLs, use a generic scraper (not implemented yet)
    return None
