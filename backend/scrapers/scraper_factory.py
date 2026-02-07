"""
Scraper Factory - Creates appropriate scraper instances based on configuration.
"""

from typing import Optional
import logging

from models.scraper_config import ScraperConfig
from scrapers.base_scraper import BaseScraper
from scrapers.comprar_gob_ar import ComprarGobArScraper
from scrapers.boletin_oficial_mendoza_scraper import BoletinOficialMendozaScraper
from scrapers.mendoza_compra import MendozaCompraScraper

# Province scrapers
from .buenos_aires_provincia_scraper import BuenosAiresProvinciaScraper
from .caba_scraper import CabaScraper
from .cordoba_provincia_scraper import CordobaProvinciaScraper
from .santa_fe_provincia_scraper import SantaFeProvinciaScraper
from .mendoza_provincia_scraper import MendozaProvinciaScraper

# Mendoza-specific scrapers
from .aysam_scraper import AysamScraper
from .osep_scraper import OsepScraper
from .uncuyo_scraper import UncuyoScraper
from .vialidad_mendoza_scraper import VialidadMendozaScraper

# Enhanced Mendoza scraper with URL caching
from .mendoza_compra_v2 import MendozaCompraScraperV2

# ComprasApps Mendoza (hli00049 servlet)
from .comprasapps_mendoza_scraper import ComprasAppsMendozaScraper

# EPRE Mendoza
from .epre_scraper import EpreScraper

# Las Heras Municipality (Oracle APEX)
from .las_heras_scraper import LasHerasScraper

# EMESA (Empresa Mendocina de Energía) - Selenium WAF bypass
from .emesa_scraper import EmesaScraper

# Generic HTML scraper for config-driven sites
from .generic_html_scraper import GenericHtmlScraper

logger = logging.getLogger("scraper_factory")


def create_scraper(config: ScraperConfig) -> Optional[BaseScraper]:
    """
    Create a scraper based on the configuration.
    
    Matches by URL pattern first, then by name.
    """
    
    # Normalize name for easier matching
    config_name_lower = config.name.lower()
    config_url_lower = str(config.url).lower()
    
    # === MENDOZA - Provincia ===
    
    # ComprasApps Mendoza (hli00049 servlet - Buscador de Licitaciones)
    if "comprasapps.mendoza.gov.ar" in config_url_lower or "comprasapps" in config_name_lower:
        logger.info(f"Using ComprasAppsMendozaScraper for {config.name}")
        return ComprasAppsMendozaScraper(config)

    # COMPR.AR Mendoza (v2 with URL caching)
    if "comprar.mendoza.gov.ar" in config_url_lower:
        # Use v2 by default, v1 if explicitly requested
        if "v1" in config_name_lower or "legacy" in config_name_lower:
            logger.info(f"Using legacy MendozaCompraScraper for {config.name}")
            return MendozaCompraScraper(config)
        logger.info(f"Using MendozaCompraScraperV2 for {config.name}")
        return MendozaCompraScraperV2(config)
    
    # Boletín Oficial Mendoza
    if "boe.mendoza" in config_url_lower or "boletinoficial.mendoza" in config_url_lower or "boletin oficial" in config_name_lower:
        return BoletinOficialMendozaScraper(config)
    
    # AYSAM
    if "aysam" in config_url_lower or "aysam" in config_name_lower:
        return AysamScraper(config)
    
    # OSEP
    if "osep" in config_url_lower or "comprarosep" in config_url_lower or "osep" in config_name_lower:
        return OsepScraper(config)
    
    # UNCuyo
    if "uncuyo" in config_url_lower or "uncuyo" in config_name_lower:
        return UncuyoScraper(config)
    
    # Vialidad Mendoza
    if ("vialidad" in config_url_lower and "mendoza" in config_url_lower) or \
       "vialidad mendoza" in config_name_lower:
        return VialidadMendozaScraper(config)

    # EPRE Mendoza
    if "epremendoza" in config_url_lower or "epre" in config_name_lower:
        return EpreScraper(config)

    # Las Heras Municipality (Oracle APEX)
    if "lasheras" in config_url_lower or "las heras" in config_name_lower:
        logger.info(f"Using LasHerasScraper for {config.name}")
        return LasHerasScraper(config)

    # EMESA (Empresa Mendocina de Energía) - /concursos page works without Selenium
    # Falls through to GenericHtmlScraper via selectors config

    # Generic mendoza.gov.ar (fallback)
    if "mendoza.gov.ar" in config_url_lower:
        return MendozaCompraScraper(config)
    
    # === OTRAS PROVINCIAS ===
    
    # Buenos Aires
    if "compras.gba.gob.ar" in config_url_lower or "buenos-aires-provincia" in config_name_lower:
        return BuenosAiresProvinciaScraper(config)
    
    # CABA
    if "buenosairescompras.gob.ar" in config_url_lower or "caba" in config_name_lower:
        return CabaScraper(config)
    
    # Córdoba
    if "compras.cba.gov.ar" in config_url_lower or "cordoba-provincia" in config_name_lower:
        return CordobaProvinciaScraper(config)
    
    # Santa Fe
    if "santafe.gov.ar/portal_compras" in config_url_lower or "santa-fe-provincia" in config_name_lower:
        return SantaFeProvinciaScraper(config)
    
    # Mendoza Provincia (OCDS/API based)
    if "mendoza-provincia" in config_name_lower:
        return MendozaProvinciaScraper(config)
    
    # Comprar.gob.ar (nacional)
    if "comprar.gob.ar" in config_url_lower and "comprar" in config_name_lower:
        return ComprarGobArScraper(config)
    
    # Generic HTML scraper (fallback for any site with scraper_type=generic_html or selectors configured)
    if config.selectors and (config.selectors.get("scraper_type") == "generic_html" or
                             config.selectors.get("link_selector") or
                             config.selectors.get("list_item_selector")):
        logger.info(f"Using GenericHtmlScraper for {config.name}")
        return GenericHtmlScraper(config)

    # No matching scraper found
    logger.warning(f"No specific scraper found for URL {config.url} or name {config.name}")
    return None
