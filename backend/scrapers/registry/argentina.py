"""Declarative Argentina-wide scraper registry.

National and cross-jurisdiction sources should not keep growing the factory
with one-off branches. This registry mirrors the Mendoza registry so source
coverage, strategy, and routing stay inspectable as Licitometro expands beyond
provincial discovery.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Iterable, Optional, Type

from models.scraper_config import ScraperConfig
from scrapers.base_scraper import BaseScraper

from scrapers.bac_scraper import BACScraper
from scrapers.banco_mundial_scraper import BancoMundialScraper
from scrapers.bid_scraper import BidScraper
from scrapers.boletin_oficial_nacional_scraper import BoletinOficialNacionalScraper
from scrapers.comprar_nacional_scraper import ComprarNacionalScraper
from scrapers.contratar_gob_ar_scraper import ContratarGobArScraper
from scrapers.contrataciones_abiertas_mza_scraper import ContratacionesAbiertasMzaScraper
from scrapers.datos_argentina_scraper import DatosArgentinaScraper
from scrapers.pbac_buenos_aires_scraper import PbacBuenosAiresScraper
from scrapers.pjn_scraper import PJNScraper
from scrapers.santa_fe_scraper import SantaFeScraper


Predicate = Callable[[ScraperConfig, str, str], bool]


@dataclass(frozen=True)
class ArgentinaSourceRule:
    """Routing rule for one non-Mendoza or Argentina-wide scraper family."""

    source_id: str
    scraper_cls: Type[BaseScraper]
    domains: tuple[str, ...] = ()
    name_contains: tuple[str, ...] = ()
    selector_types: tuple[str, ...] = ()
    predicate: Optional[Predicate] = None
    scope: str = "ar_nacional"
    strategy: str = "http"
    notes: str = ""

    def matches(self, config: ScraperConfig, name_lower: str, url_lower: str) -> bool:
        if self.predicate and self.predicate(config, name_lower, url_lower):
            return True
        if any(domain in url_lower for domain in self.domains):
            return True
        if any(token in name_lower for token in self.name_contains):
            return True
        selectors = getattr(config, "selectors", None) or {}
        scraper_type = str(selectors.get("scraper_type") or "").lower()
        return scraper_type in self.selector_types

    def create(self, config: ScraperConfig) -> BaseScraper:
        return self.scraper_cls(config)


ARGENTINA_SOURCE_RULES: tuple[ArgentinaSourceRule, ...] = (
    ArgentinaSourceRule(
        source_id="datos_argentina",
        scraper_cls=DatosArgentinaScraper,
        domains=("datos.gob.ar",),
        name_contains=("datos_argentina",),
        selector_types=("datos_argentina",),
        strategy="ckan-api",
    ),
    ArgentinaSourceRule(
        source_id="comprar_nacional",
        scraper_cls=ComprarNacionalScraper,
        domains=("comprar.gob.ar",),
        name_contains=("comprar_nacional", "compr.ar nacional"),
        selector_types=("comprar_nacional", "comprar_asp"),
        strategy="aspnet-postback",
        notes="Same ASP.NET WebForms family as COMPR.AR Mendoza.",
    ),
    ArgentinaSourceRule(
        source_id="bac_buenos_aires",
        scraper_cls=BACScraper,
        domains=("bac.buyarg.com", "buenosairescompras.gob.ar"),
        name_contains=("bac_buenos_aires", "buenos aires compras"),
        selector_types=("bac_buenos_aires", "bac", "comprar_asp_bac"),
        strategy="aspnet-postback",
        notes="COMPR.AR engine deployed for Buenos Aires Compras.",
    ),
    ArgentinaSourceRule(
        source_id="magistratura_pjn",
        scraper_cls=PJNScraper,
        domains=("srpcm.pjn.gov.ar",),
        name_contains=("magistratura_pjn", "pjn"),
        selector_types=("magistratura_pjn", "pjn"),
        strategy="rest-api",
    ),
    ArgentinaSourceRule(
        source_id="contratar_gob_ar",
        scraper_cls=ContratarGobArScraper,
        domains=("contratar.gob.ar",),
        name_contains=("contratar",),
        selector_types=("contratar_gob_ar",),
        strategy="api",
    ),
    ArgentinaSourceRule(
        source_id="boletin_oficial_nacional",
        scraper_cls=BoletinOficialNacionalScraper,
        domains=("boletinoficial.gob.ar",),
        name_contains=("boletin_oficial_nacional",),
        selector_types=("boletin_oficial_nacional",),
        strategy="html-pdf",
    ),
    ArgentinaSourceRule(
        source_id="pbac_buenos_aires",
        scraper_cls=PbacBuenosAiresScraper,
        domains=("pbac.cgp.gba.gov.ar",),
        name_contains=("pbac",),
        selector_types=("pbac_buenos_aires",),
        strategy="html",
    ),
    ArgentinaSourceRule(
        source_id="santa_fe",
        scraper_cls=SantaFeScraper,
        domains=("santafe.gov.ar",),
        name_contains=("santa_fe",),
        selector_types=("santa_fe",),
        strategy="api",
    ),
    ArgentinaSourceRule(
        source_id="contrataciones_abiertas_mza",
        scraper_cls=ContratacionesAbiertasMzaScraper,
        domains=("datosabiertos-compras.mendoza",),
        name_contains=("contrataciones_abiertas",),
        selector_types=("contrataciones_abiertas_mza",),
        strategy="ocds",
    ),
    ArgentinaSourceRule(
        source_id="banco_mundial",
        scraper_cls=BancoMundialScraper,
        domains=("worldbank.org",),
        name_contains=("banco_mundial",),
        selector_types=("banco_mundial",),
        scope="global",
        strategy="api",
    ),
    ArgentinaSourceRule(
        source_id="bid_procurement",
        scraper_cls=BidScraper,
        domains=("data.iadb.org",),
        name_contains=("bid_procurement",),
        selector_types=("bid_procurement",),
        scope="global",
        strategy="api",
    ),
)


def iter_argentina_source_rules() -> Iterable[ArgentinaSourceRule]:
    return ARGENTINA_SOURCE_RULES


def resolve_argentina_scraper(config: ScraperConfig) -> Optional[BaseScraper]:
    """Resolve Argentina-wide scraper using ordered declarative rules."""

    name_lower = config.name.lower()
    url_lower = str(config.url).lower()
    for rule in ARGENTINA_SOURCE_RULES:
        if rule.matches(config, name_lower, url_lower):
            return rule.create(config)
    return None
