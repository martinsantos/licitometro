"""Tests for Mendoza Compra evidence-aware scraper output."""

import asyncio

from models.licitacion import LicitacionCreate
from models.scraper_config import ScraperConfig
from scrapers.contracts import EvidenceKind, ScrapeResult
from scrapers.mendoza_compra import MendozaCompraScraper


def _config():
    return ScraperConfig(
        name="COMPR.AR Mendoza",
        url="https://comprar.mendoza.gov.ar",
        source_type="website",
        selectors={},
        active=True,
    )


def test_mendoza_compra_run_with_evidence_wraps_existing_run(monkeypatch):
    scraper = MendozaCompraScraper(_config())
    item = LicitacionCreate(
        id_licitacion="MZA-1",
        title="Compra de insumos",
        organization="Gobierno de Mendoza",
        fuente="COMPR.AR Mendoza",
        jurisdiccion="Mendoza",
        tipo_procedimiento="Licitacion",
        source_url="https://comprar.mendoza.gov.ar/lista",
        canonical_url="https://comprar.mendoza.gov.ar/detalle",
        url_quality="direct",
        source_urls={"pliego": "https://comprar.mendoza.gov.ar/pliego"},
        attached_files=[{"url": "https://comprar.mendoza.gov.ar/pliego.pdf", "name": "Pliego"}],
    )

    async def fake_run():
        return [item]

    monkeypatch.setattr(scraper, "run", fake_run)

    results = asyncio.run(scraper.run_with_evidence())

    assert len(results) == 1
    assert isinstance(results[0], ScrapeResult)
    assert results[0].source_id == "comprar_mendoza"
    assert results[0].extraction_version == "mendoza_compra_v1_evidence"
    assert results[0].extraction_confidence == 0.82
    assert {e.kind for e in results[0].evidence} == {EvidenceKind.HTML, EvidenceKind.PDF}
    assert len(results[0].evidence) == 4
