"""Quality contract tests for COMPR.AR Mendoza v2 normalization."""

from models.scraper_config import ScraperConfig
from scrapers.mendoza_compra_v2 import MendozaCompraScraperV2


def _config():
    return ScraperConfig(
        name="COMPR.AR Mendoza",
        url="https://comprar.mendoza.gov.ar",
        source_type="website",
        selectors={},
        active=True,
    )


def test_mendoza_compra_v2_extracts_objeto_from_pliego_fields():
    scraper = MendozaCompraScraperV2(_config())

    objeto = scraper._build_objeto(
        title="Licitacion publica",
        description="Licitacion publica",
        pliego_fields={"Objeto de la contratación": "adquisición de equipamiento informático para escuelas"},
    )

    assert objeto == "Adquisición de equipamiento informático para escuelas"


def test_mendoza_compra_v2_extracts_objeto_from_description_fallback():
    scraper = MendozaCompraScraperV2(_config())

    objeto = scraper._build_objeto(
        title="Proceso de compra",
        description="Contratación del servicio de mantenimiento de enlaces de fibra óptica.",
        pliego_fields={},
    )

    assert objeto == "Contratación del servicio de mantenimiento de enlaces de fibra óptica"
