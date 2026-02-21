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

# Godoy Cruz Municipality (GeneXus webapp with embedded JSON grid)
from .godoy_cruz_scraper import GodoyCruzScraper

# MPF Mendoza (Ministerio Público Fiscal)
from .mpf_mendoza_scraper import MpfMendozaScraper

# Generic HTML scraper for config-driven sites
from .generic_html_scraper import GenericHtmlScraper

# === NATIONAL / AR SCRAPERS ===
from .datos_argentina_scraper import DatosArgentinaScraper
from .banco_mundial_scraper import BancoMundialScraper
from .bid_scraper import BidScraper
from .contrataciones_abiertas_mza_scraper import ContratacionesAbiertasMzaScraper
from .santa_fe_scraper import SantaFeScraper
from .contratar_gob_ar_scraper import ContratarGobArScraper
from .boletin_oficial_nacional_scraper import BoletinOficialNacionalScraper
from .pbac_buenos_aires_scraper import PbacBuenosAiresScraper

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

    # Godoy Cruz Municipality (GeneXus webapp - embedded JSON grid)
    if "godoycruz" in config_url_lower or "godoy cruz" in config_name_lower:
        logger.info(f"Using GodoyCruzScraper for {config.name}")
        return GodoyCruzScraper(config)

    # MPF Mendoza (Ministerio Público Fiscal)
    if "mpfmza" in config_url_lower or "mpf mendoza" in config_name_lower:
        logger.info(f"Using MpfMendozaScraper for {config.name}")
        return MpfMendozaScraper(config)

    # EMESA (Empresa Mendocina de Energía) - /concursos page works without Selenium
    # Falls through to GenericHtmlScraper via selectors config

    # Generic HTML scraper - MUST be before mendoza.gov.ar fallback so configs
    # with explicit scraper_type=generic_html are routed correctly (e.g. IPV at ipvmendoza.gov.ar)
    if config.selectors and (config.selectors.get("scraper_type") == "generic_html" or
                             config.selectors.get("link_selector") or
                             config.selectors.get("list_item_selector")):
        logger.info(f"Using GenericHtmlScraper for {config.name}")
        return GenericHtmlScraper(config)

    # Generic mendoza.gov.ar (fallback)
    if "mendoza.gov.ar" in config_url_lower:
        return MendozaCompraScraper(config)

    # === NACIONAL / AR SOURCES ===

    # Datos Argentina CKAN API
    if "datos.gob.ar" in config_url_lower or "datos_argentina" in config_name_lower:
        logger.info(f"Using DatosArgentinaScraper for {config.name}")
        return DatosArgentinaScraper(config)

    # Contrataciones Abiertas Mendoza (OCDS API)
    if "datosabiertos-compras.mendoza" in config_url_lower or "contrataciones_abiertas" in config_name_lower:
        logger.info(f"Using ContratacionesAbiertasMzaScraper for {config.name}")
        return ContratacionesAbiertasMzaScraper(config)

    # World Bank Procurement API
    if "worldbank.org" in config_url_lower or "banco_mundial" in config_name_lower:
        logger.info(f"Using BancoMundialScraper for {config.name}")
        return BancoMundialScraper(config)

    # BID/IDB Procurement DataStore
    if "data.iadb.org" in config_url_lower or "bid_procurement" in config_name_lower:
        logger.info(f"Using BidScraper for {config.name}")
        return BidScraper(config)

    # Santa Fe Province
    if "santafe.gov.ar" in config_url_lower or "santa_fe" in config_name_lower:
        logger.info(f"Using SantaFeScraper for {config.name}")
        return SantaFeScraper(config)

    # CONTRAT.AR (national public works)
    if "contratar.gob.ar" in config_url_lower or "contratar" in config_name_lower:
        logger.info(f"Using ContratarGobArScraper for {config.name}")
        return ContratarGobArScraper(config)

    # Boletín Oficial Nacional (3ra sección)
    if "boletinoficial.gob.ar" in config_url_lower or "boletin_oficial_nacional" in config_name_lower:
        logger.info(f"Using BoletinOficialNacionalScraper for {config.name}")
        return BoletinOficialNacionalScraper(config)

    # PBAC Buenos Aires
    if "pbac.cgp.gba.gov.ar" in config_url_lower or "pbac" in config_name_lower:
        logger.info(f"Using PbacBuenosAiresScraper for {config.name}")
        return PbacBuenosAiresScraper(config)

    # Comprar.gob.ar (nacional - legacy)
    if "comprar.gob.ar" in config_url_lower:
        return ComprarGobArScraper(config)

    # No matching scraper found
    logger.warning(f"No specific scraper found for URL {config.url} or name {config.name}")
    return None
