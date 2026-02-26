"""
Scraper Factory - Registry-based scraper creation.

Uses a declarative URL_REGISTRY and NAME_REGISTRY for matching, replacing
the previous if/elif chain. Order matters: entries are checked top-to-bottom,
so specific patterns must come before broad ones.

CRITICAL: GenericHtmlScraper check MUST come before the mendoza.gov.ar fallback,
or configs like ipvmendoza.gov.ar get captured by the substring match.
"""

from typing import Optional, List, Tuple, Type
import logging

from models.scraper_config import ScraperConfig
from scrapers.base_scraper import BaseScraper

# --- Imports (all scrapers) ---
from scrapers.comprasapps_mendoza_scraper import ComprasAppsMendozaScraper
from scrapers.mendoza_compra_v2 import MendozaCompraScraperV2
from scrapers.mendoza_compra import MendozaCompraScraper
from scrapers.boletin_oficial_mendoza_scraper import BoletinOficialMendozaScraper
from scrapers.aysam_scraper import AysamScraper
from scrapers.osep_scraper import OsepScraper
from scrapers.uncuyo_scraper import UncuyoScraper
from scrapers.vialidad_mendoza_scraper import VialidadMendozaScraper
from scrapers.epre_scraper import EpreScraper
from scrapers.las_heras_scraper import LasHerasScraper
from scrapers.emesa_scraper import EmesaScraper
from scrapers.godoy_cruz_scraper import GodoyCruzScraper
from scrapers.mpf_mendoza_scraper import MpfMendozaScraper
from scrapers.generic_html_scraper import GenericHtmlScraper
from scrapers.comprar_gob_ar import ComprarGobArScraper
from scrapers.datos_argentina_scraper import DatosArgentinaScraper
from scrapers.banco_mundial_scraper import BancoMundialScraper
from scrapers.bid_scraper import BidScraper
from scrapers.contrataciones_abiertas_mza_scraper import ContratacionesAbiertasMzaScraper
from scrapers.santa_fe_scraper import SantaFeScraper
from scrapers.contratar_gob_ar_scraper import ContratarGobArScraper
from scrapers.boletin_oficial_nacional_scraper import BoletinOficialNacionalScraper
from scrapers.pbac_buenos_aires_scraper import PbacBuenosAiresScraper

logger = logging.getLogger("scraper_factory")


# ============================================================================
# REGISTRY: (url_substring, scraper_class)
# Checked in ORDER — specific patterns BEFORE generic ones.
# ============================================================================
URL_REGISTRY: List[Tuple[str, Type[BaseScraper]]] = [
    # === MENDOZA - Provincia (specific first) ===
    ("comprasapps.mendoza.gov.ar",      ComprasAppsMendozaScraper),
    ("comprar.mendoza.gov.ar",          MendozaCompraScraperV2),
    ("boe.mendoza",                     BoletinOficialMendozaScraper),
    ("boletinoficial.mendoza",          BoletinOficialMendozaScraper),
    ("aysam",                           AysamScraper),
    ("comprarosep",                     OsepScraper),
    ("osep",                            OsepScraper),
    ("uncuyo",                          UncuyoScraper),
    ("epremendoza",                     EpreScraper),
    ("lasheras",                        LasHerasScraper),
    ("godoycruz",                       GodoyCruzScraper),
    ("mpfmza",                          MpfMendozaScraper),
    # NOTE: vialidad requires both keywords
    # NOTE: mendoza.gov.ar fallback is handled separately after GenericHtml check

    # === NACIONAL / AR SOURCES ===
    ("datos.gob.ar",                    DatosArgentinaScraper),
    ("datosabiertos-compras.mendoza",   ContratacionesAbiertasMzaScraper),
    ("worldbank.org",                   BancoMundialScraper),
    ("data.iadb.org",                   BidScraper),
    ("santafe.gov.ar",                  SantaFeScraper),
    ("contratar.gob.ar",               ContratarGobArScraper),
    ("boletinoficial.gob.ar",          BoletinOficialNacionalScraper),
    ("pbac.cgp.gba.gov.ar",            PbacBuenosAiresScraper),
    ("comprar.gob.ar",                 ComprarGobArScraper),
]

# NAME_REGISTRY: (name_substring, scraper_class)
# Fallback when URL doesn't match — checked after URL_REGISTRY.
NAME_REGISTRY: List[Tuple[str, Type[BaseScraper]]] = [
    ("comprasapps",          ComprasAppsMendozaScraper),
    ("boletin oficial mend", BoletinOficialMendozaScraper),
    ("aysam",                AysamScraper),
    ("osep",                 OsepScraper),
    ("uncuyo",               UncuyoScraper),
    ("vialidad mendoza",     VialidadMendozaScraper),
    ("epre",                 EpreScraper),
    ("las heras",            LasHerasScraper),
    ("godoy cruz",           GodoyCruzScraper),
    ("mpf mendoza",          MpfMendozaScraper),
    ("datos_argentina",      DatosArgentinaScraper),
    ("contrataciones_abiertas", ContratacionesAbiertasMzaScraper),
    ("banco_mundial",        BancoMundialScraper),
    ("bid_procurement",      BidScraper),
    ("santa_fe",             SantaFeScraper),
    ("contratar",            ContratarGobArScraper),
    ("boletin_oficial_nacional", BoletinOficialNacionalScraper),
    ("pbac",                 PbacBuenosAiresScraper),
]


def create_scraper(config: ScraperConfig) -> Optional[BaseScraper]:
    """
    Create a scraper based on configuration.

    Resolution order:
    1. URL pattern match (URL_REGISTRY)
    2. Special case: Vialidad Mendoza (requires two URL keywords)
    3. Name pattern match (NAME_REGISTRY)
    4. GenericHtmlScraper (if selectors indicate generic_html)
    5. mendoza.gov.ar fallback (legacy v1)
    6. None
    """
    url = str(config.url).lower()
    name = config.name.lower()

    # --- 1. URL registry lookup ---
    for pattern, scraper_cls in URL_REGISTRY:
        if pattern in url:
            # Special case: COMPR.AR v1 override
            if scraper_cls is MendozaCompraScraperV2 and ("v1" in name or "legacy" in name):
                logger.info(f"[factory] {config.name} → MendozaCompraScraper (legacy v1)")
                return MendozaCompraScraper(config)
            logger.info(f"[factory] {config.name} → {scraper_cls.__name__} (url match: {pattern})")
            return scraper_cls(config)

    # --- 2. Special: Vialidad Mendoza (needs both keywords in URL) ---
    if "vialidad" in url and "mendoza" in url:
        logger.info(f"[factory] {config.name} → VialidadMendozaScraper (url combo)")
        return VialidadMendozaScraper(config)

    # --- 3. Name registry lookup ---
    for pattern, scraper_cls in NAME_REGISTRY:
        if pattern in name:
            logger.info(f"[factory] {config.name} → {scraper_cls.__name__} (name match: {pattern})")
            return scraper_cls(config)

    # --- 4. GenericHtmlScraper (config-driven, MUST be before mendoza.gov.ar fallback) ---
    if config.selectors and (
        config.selectors.get("scraper_type") == "generic_html"
        or config.selectors.get("link_selector")
        or config.selectors.get("list_item_selector")
    ):
        logger.info(f"[factory] {config.name} → GenericHtmlScraper (selectors config)")
        return GenericHtmlScraper(config)

    # --- 5. mendoza.gov.ar generic fallback ---
    if "mendoza.gov.ar" in url:
        logger.info(f"[factory] {config.name} → MendozaCompraScraper (mendoza.gov.ar fallback)")
        return MendozaCompraScraper(config)

    # --- 6. No match ---
    logger.warning(f"[factory] No scraper found for '{config.name}' (url={config.url})")
    return None
