"""Tests for ComprasApps Mendoza evidence-aware output."""

import asyncio

from models.licitacion import LicitacionCreate
from models.scraper_config import ScraperConfig
from scrapers.comprasapps_mendoza_scraper import ComprasAppsMendozaScraper
from scrapers.contracts import EvidenceKind, ScrapeResult
from scrapers.comprasapps_mendoza_scraper import (
    COL_ANIO,
    COL_APERTURA_DATE,
    COL_APERTURA_TIME,
    COL_CUC,
    COL_ESTADO,
    COL_NUMERO,
    COL_ORG_NAME,
    COL_SEQ,
    COL_TIPO,
    COL_TIPO_CODE,
    COL_TITULO_FULL,
)


def _config():
    return ScraperConfig(
        name="ComprasApps Mendoza",
        url="https://comprasapps.mendoza.gov.ar/Compras/servlet/hli00049",
        source_type="website",
        selectors={},
        active=True,
    )


def test_comprasapps_run_with_evidence_returns_native_direct_html(monkeypatch):
    scraper = ComprasAppsMendozaScraper(_config())
    item = LicitacionCreate(
        id_licitacion="867/2026-508",
        title="Compra de insumos",
        organization="OSEP",
        fuente="ComprasApps Mendoza",
        jurisdiccion="Mendoza",
        tipo_procedimiento="Compra Directa",
        source_url="https://comprasapps.mendoza.gov.ar/Compras/servlet/hli00048?2026,508,1,867",
        canonical_url="https://comprasapps.mendoza.gov.ar/Compras/servlet/hli00048?2026,508,1,867",
        url_quality="direct",
    )

    async def fake_run():
        return [item]

    monkeypatch.setattr(scraper, "run", fake_run)

    results = asyncio.run(scraper.run_with_evidence())

    assert len(results) == 1
    assert isinstance(results[0], ScrapeResult)
    assert results[0].source_id == "comprasapps_mendoza"
    assert results[0].extraction_version == "comprasapps_mendoza_v1_evidence"
    assert results[0].extraction_confidence == 0.8
    assert {e.kind for e in results[0].evidence} == {EvidenceKind.HTML}
    assert len(results[0].evidence) == 1


def test_comprasapps_row_publication_date_uses_process_year_not_visit_or_opening_dates():
    scraper = ComprasAppsMendozaScraper(_config())
    row = [""] * 21
    row[COL_NUMERO] = "1005/2026-1"
    row[COL_TIPO] = "Licitación pública"
    row[COL_ORG_NAME] = "Hab. Cámara de Senadores"
    row[COL_APERTURA_DATE] = "27/05/26"
    row[COL_APERTURA_TIME] = "10:00"
    row[COL_ESTADO] = "Vigente"
    row[COL_TITULO_FULL] = "MATERIALES Y MANO DE OBRA - FECHA VISITA DE OBRA: 20/5/2026 A LAS 10:00HS"
    row[COL_ANIO] = "2026"
    row[COL_SEQ] = "1005"
    row[COL_TIPO_CODE] = "4"
    row[COL_CUC] = "1"

    item = scraper._row_to_licitacion(row)

    assert item.publication_date.year == 2026
    assert item.publication_date.month == 1
    assert item.publication_date.day == 1
    assert item.opening_date.year == 2026
    assert item.opening_date.month == 5
    assert item.opening_date.day == 27
