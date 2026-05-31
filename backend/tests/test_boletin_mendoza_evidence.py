"""Tests for Boletin Oficial Mendoza evidence-aware output."""

import asyncio

from models.licitacion import LicitacionCreate
from models.scraper_config import ScraperConfig
from scrapers.boletin_oficial_mendoza_scraper import BoletinOficialMendozaScraper
from scrapers.contracts import EvidenceKind, ScrapeResult


def _config():
    return ScraperConfig(
        name="Boletin Oficial Mendoza",
        url="https://www.mendoza.gov.ar/boletinoficial",
        source_type="website",
        selectors={},
        active=True,
    )


def test_boletin_mendoza_run_with_evidence_wraps_pdf_results(monkeypatch):
    scraper = BoletinOficialMendozaScraper(_config())
    item = LicitacionCreate(
        id_licitacion="BOE-1",
        title="Licitacion publica",
        organization="Gobierno de Mendoza",
        fuente="Boletin Oficial Mendoza",
        jurisdiccion="Mendoza",
        tipo_procedimiento="Boletin Oficial - Norma",
        source_url="https://boe.mendoza.gov.ar/boletin.pdf",
        attached_files=[{"url": "https://boe.mendoza.gov.ar/boletin.pdf", "name": "Boletin 1"}],
    )

    async def fake_run():
        return [item]

    monkeypatch.setattr(scraper, "run", fake_run)

    results = asyncio.run(scraper.run_with_evidence())

    assert len(results) == 1
    assert isinstance(results[0], ScrapeResult)
    assert results[0].source_id == "boletin_oficial_mendoza"
    assert results[0].extraction_version == "boletin_mendoza_v1_evidence"
    assert results[0].extraction_confidence == 0.86
    assert {e.kind for e in results[0].evidence} == {EvidenceKind.PDF}
    assert len(results[0].evidence) == 1


def test_boletin_mendoza_run_with_evidence_treats_verpdf_urls_as_pdf(monkeypatch):
    scraper = BoletinOficialMendozaScraper(_config())
    item = LicitacionCreate(
        id_licitacion="BOE-VERPDF-1",
        title="Licitacion publica",
        organization="Gobierno de Mendoza",
        fuente="Boletin Oficial Mendoza",
        jurisdiccion="Mendoza",
        tipo_procedimiento="Boletin Oficial - Norma",
        source_url="https://boe.mendoza.gov.ar/default/public/publico/verpdf/32595",
        attached_files=[
            {
                "url": "https://boe.mendoza.gov.ar/default/public/publico/verpdf/32595",
                "name": "Boletin 32595",
                "type": "pdf",
            }
        ],
    )

    async def fake_run():
        return [item]

    monkeypatch.setattr(scraper, "run", fake_run)

    results = asyncio.run(scraper.run_with_evidence())

    assert results[0].item.canonical_url == item.source_url
    assert results[0].item.url_quality == "direct_pdf"
    assert {e.kind for e in results[0].evidence} == {EvidenceKind.PDF}
    assert results[0].extraction_confidence == 0.86
