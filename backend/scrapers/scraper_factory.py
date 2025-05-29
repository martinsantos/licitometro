from typing import Optional
import sys
from pathlib import Path

# Add parent directory to path so we can import modules
sys.path.insert(0, str(Path(__file__).parent.parent))

from models.scraper_config import ScraperConfig
from scrapers.base_scraper import BaseScraper
from scrapers.comprar_gob_ar import ComprarGobArScraper
# Existing specific scrapers
from scrapers.mendoza_compra import MendozaCompraScraper # Keep for now as per instructions

# Newly added scrapers
from backend.scrapers.buenos_aires_provincia_scraper import BuenosAiresProvinciaScraper
from backend.scrapers.caba_scraper import CabaScraper
from backend.scrapers.cordoba_provincia_scraper import CordobaProvinciaScraper
from backend.scrapers.santa_fe_provincia_scraper import SantaFeProvinciaScraper
from backend.scrapers.mendoza_provincia_scraper import MendozaProvinciaScraper


def create_scraper(config: ScraperConfig) -> Optional[BaseScraper]:
    """Create a scraper based on the configuration"""
    
    # Normalize name for easier matching
    config_name_lower = config.name.lower()

    # Check for known scrapers by URL or name
    # Ordered from more specific URL patterns where possible, then by name
    if "comprar.gob.ar" in config.url and "comprar" in config_name_lower: # Existing ComprarGobArScraper
        return ComprarGobArScraper(config)
    
    # New Scrapers
    elif "compras.gba.gob.ar" in config.url or "buenos-aires-provincia" in config_name_lower:
        return BuenosAiresProvinciaScraper(config)
    elif "buenosairescompras.gob.ar" in config.url or "caba" in config_name_lower:
        return CabaScraper(config)
    elif "compras.cba.gov.ar" in config.url or "cordoba-provincia" in config_name_lower:
        return CordobaProvinciaScraper(config)
    elif "santafe.gov.ar/portal_compras" in config.url or "santa-fe-provincia" in config_name_lower:
        return SantaFeProvinciaScraper(config)
    # New Mendoza scraper - specific URL first
    elif "comprar.mendoza.gov.ar" in config.url or "mendoza-provincia" in config_name_lower: # This is for the new OCDS-focused one
        return MendozaProvinciaScraper(config)
    
    # Existing Mendoza scraper (potentially more general or different part of mendoza.gov.ar)
    elif "mendoza.gov.ar" in config.url or "mendoza-compra" in config_name_lower: # Keep this for MendozaCompraScraper
        return MendozaCompraScraper(config)
    
    # For unknown URLs or names, log or raise error, or return None
    # For now, returning None as per original structure for unhandled cases.
    # Consider adding logging here: logger.warning(f"No specific scraper found for URL {config.url} or name {config.name}")
    return None
