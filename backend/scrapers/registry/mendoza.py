"""Declarative Mendoza scraper registry.

This is the first step of Licitometro 0.2: source routing moves from a long
if/elif factory into explicit source rules that can later carry health checks,
contracts, extraction strategy, and source quality metadata.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Iterable, Optional, Type

from models.scraper_config import ScraperConfig
from scrapers.base_scraper import BaseScraper

from scrapers.aysam_scraper import AysamScraper
from scrapers.boletin_oficial_mendoza_scraper import BoletinOficialMendozaScraper
from scrapers.comprasapps_mendoza_scraper import ComprasAppsMendozaScraper
from scrapers.contrataciones_abiertas_mza_scraper import ContratacionesAbiertasMzaScraper
from scrapers.emesa_scraper import EmesaScraper
from scrapers.epre_scraper import EpreScraper
from scrapers.generic_html_scraper import GenericHtmlScraper
from scrapers.godoy_cruz_scraper import GodoyCruzScraper
from scrapers.irrigacion_api_scraper import IrrigacionApiScraper
from scrapers.las_heras_scraper import LasHerasScraper
from scrapers.mendoza_compra import MendozaCompraScraper
from scrapers.mendoza_compra_v2 import MendozaCompraScraperV2
from scrapers.mpf_mendoza_scraper import MpfMendozaScraper
from scrapers.osep_scraper import OsepScraper
from scrapers.uncuyo_scraper import UncuyoScraper
from scrapers.vialidad_mendoza_scraper import VialidadMendozaScraper


Predicate = Callable[[ScraperConfig, str, str], bool]
ScraperFactory = Callable[[ScraperConfig], BaseScraper]


@dataclass(frozen=True)
class SourceRule:
    """Routing rule for one scraper family."""

    source_id: str
    scraper_cls: Type[BaseScraper]
    domains: tuple[str, ...] = ()
    name_contains: tuple[str, ...] = ()
    selector_flags: tuple[str, ...] = ()
    predicate: Optional[Predicate] = None
    scope: str = "mendoza"
    strategy: str = "http"
    notes: str = ""
    factory: Optional[ScraperFactory] = field(default=None, compare=False)

    def matches(self, config: ScraperConfig, name_lower: str, url_lower: str) -> bool:
        if self.predicate and self.predicate(config, name_lower, url_lower):
            return True
        if any(domain in url_lower for domain in self.domains):
            return True
        if any(token in name_lower for token in self.name_contains):
            return True
        selectors = getattr(config, "selectors", None) or {}
        return any(selectors.get(flag) for flag in self.selector_flags)

    def create(self, config: ScraperConfig) -> BaseScraper:
        if self.factory:
            return self.factory(config)
        return self.scraper_cls(config)


def _generic_html(config: ScraperConfig, _name: str, _url: str) -> bool:
    selectors = getattr(config, "selectors", None) or {}
    return (
        selectors.get("scraper_type") == "generic_html"
        or bool(selectors.get("link_selector"))
        or bool(selectors.get("list_item_selector"))
    )


def _comprar_mendoza_factory(config: ScraperConfig) -> BaseScraper:
    name_lower = config.name.lower()
    if "v1" in name_lower or "legacy" in name_lower:
        return MendozaCompraScraper(config)
    return MendozaCompraScraperV2(config)


MENDOZA_SOURCE_RULES: tuple[SourceRule, ...] = (
    SourceRule(
        source_id="irrigacion_mendoza",
        scraper_cls=IrrigacionApiScraper,
        domains=("irrigacion.gov.ar",),
        name_contains=("irrigacion",),
        strategy="api",
    ),
    SourceRule(
        source_id="comprasapps_mendoza",
        scraper_cls=ComprasAppsMendozaScraper,
        domains=("comprasapps.mendoza.gov.ar",),
        name_contains=("comprasapps",),
        strategy="genexus",
    ),
    SourceRule(
        source_id="comprar_mendoza",
        scraper_cls=MendozaCompraScraperV2,
        domains=("comprar.mendoza.gov.ar",),
        strategy="aspnet-postback",
        factory=_comprar_mendoza_factory,
    ),
    SourceRule(
        source_id="boletin_oficial_mendoza",
        scraper_cls=BoletinOficialMendozaScraper,
        domains=("boe.mendoza", "boletinoficial.mendoza"),
        name_contains=("boletin oficial",),
        strategy="api-pdf",
    ),
    SourceRule("aysam", AysamScraper, domains=("aysam",), name_contains=("aysam",)),
    SourceRule("osep", OsepScraper, domains=("comprarosep", "osep"), name_contains=("osep",)),
    SourceRule("uncuyo", UncuyoScraper, domains=("uncuyo",), name_contains=("uncuyo",)),
    SourceRule(
        "vialidad_mendoza",
        VialidadMendozaScraper,
        name_contains=("vialidad mendoza",),
        predicate=lambda _cfg, name, url: "vialidad" in url and "mendoza" in url or "vialidad mendoza" in name,
    ),
    SourceRule("epre", EpreScraper, domains=("epremendoza",), name_contains=("epre",)),
    SourceRule("las_heras", LasHerasScraper, domains=("lasheras",), name_contains=("las heras",), strategy="browser"),
    SourceRule("godoy_cruz", GodoyCruzScraper, domains=("godoycruz",), name_contains=("godoy cruz",), strategy="genexus-json"),
    SourceRule("mpf_mendoza", MpfMendozaScraper, domains=("mpfmza",), name_contains=("mpf mendoza",)),
    SourceRule(
        "emesa",
        EmesaScraper,
        domains=("emesa",),
        name_contains=("emesa",),
        predicate=lambda cfg, _name, _url: (getattr(cfg, "selectors", None) or {}).get("scraper_type") == "emesa",
        strategy="browser",
    ),
    SourceRule(
        "contrataciones_abiertas_mza",
        ContratacionesAbiertasMzaScraper,
        domains=("datosabiertos-compras.mendoza",),
        name_contains=("contrataciones_abiertas",),
        strategy="ocds",
    ),
    SourceRule(
        "generic_html_mendoza",
        GenericHtmlScraper,
        predicate=_generic_html,
        strategy="generic-html",
        notes="Must run before the mendoza.gov.ar fallback.",
    ),
    SourceRule(
        "mendoza_gov_fallback",
        MendozaCompraScraper,
        domains=("mendoza.gov.ar",),
        strategy="legacy-fallback",
    ),
)


def iter_mendoza_source_rules() -> Iterable[SourceRule]:
    return MENDOZA_SOURCE_RULES


def resolve_mendoza_scraper(config: ScraperConfig) -> Optional[BaseScraper]:
    """Resolve Mendoza scraper using ordered declarative rules."""

    name_lower = config.name.lower()
    url_lower = str(config.url).lower()
    for rule in MENDOZA_SOURCE_RULES:
        if rule.matches(config, name_lower, url_lower):
            return rule.create(config)
    return None
