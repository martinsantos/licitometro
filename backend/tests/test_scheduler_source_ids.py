"""Tests for stable source ids stored in scraper run evidence."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services.scheduler_service import canonical_scraper_source_id
from services.scheduler_service import expected_min_items_for_scraper
from services.scheduler_service import unchanged_item_sync_fields


def test_canonical_scraper_source_id_uses_mendoza_core_contracts():
    assert canonical_scraper_source_id("ComprasApps Mendoza") == "comprasapps_mendoza"
    assert canonical_scraper_source_id("COMPR.AR Mendoza") == "comprar_mendoza"
    assert canonical_scraper_source_id("Boletin Oficial Mendoza") == "boletin_oficial_mendoza"


def test_canonical_scraper_source_id_falls_back_to_slug():
    assert canonical_scraper_source_id("Fuente Nueva.X") == "fuente_nueva_x"


def test_expected_min_items_uses_explicit_config_first():
    assert expected_min_items_for_scraper(
        "Boletin Oficial Mendoza",
        {"expected_min_items": 7},
    ) == 7


def test_expected_min_items_uses_mendoza_core_contract():
    assert expected_min_items_for_scraper("Boletin Oficial Mendoza", {}) == 20
    assert expected_min_items_for_scraper("ComprasApps Mendoza", {}) == 900


def test_unchanged_item_sync_fields_persists_evidence_direct_pdf_and_object():
    class Item:
        url_quality = "direct_pdf"

    item_data = {
        "canonical_url": "https://boe.mendoza.gov.ar/default/public/publico/verpdf/32595",
        "source_urls": {"boletin_pdf": "https://boe.mendoza.gov.ar/default/public/publico/verpdf/32595"},
        "objeto": "Adquisición de insumos",
        "publication_date": "2026-01-01",
        "opening_date": "2026-05-27",
        "estado": "vigente",
        "pliegos_bases": [{"url": "https://boe.mendoza.gov.ar/default/public/publico/verpdf/32595"}],
        "budget": 123.0,
        "currency": "ARS",
        "metadata": {"boe_apertura_raw": "texto"},
    }
    evidence = {"contract": "native_scrape_result", "source_id": "boletin_oficial_mendoza"}

    fields = unchanged_item_sync_fields(Item(), item_data, source_evidence=evidence)

    assert fields["canonical_url"] == item_data["canonical_url"]
    assert fields["url_quality"] == "direct_pdf"
    assert fields["metadata.source_evidence"] == evidence
    assert fields["objeto"] == "Adquisición de insumos"
    assert fields["publication_date"] == "2026-01-01"
    assert fields["opening_date"] == "2026-05-27"
    assert fields["estado"] == "vigente"
    assert fields["pliegos_bases"] == item_data["pliegos_bases"]
    assert fields["budget"] == 123.0


def test_unchanged_item_sync_fields_preserves_richer_existing_evidence():
    class Item:
        url_quality = "direct"

    existing = {
        "contract": "native_scrape_result",
        "source_id": "comprasapps_mendoza",
        "extraction_version": "comprasapps_detail_backfill_v1",
        "evidence_count": 3,
    }
    lighter = {
        "contract": "native_scrape_result",
        "source_id": "comprasapps_mendoza",
        "extraction_version": "comprasapps_mendoza_v1_evidence",
        "evidence_count": 1,
    }

    fields = unchanged_item_sync_fields(
        Item(),
        {"canonical_url": "https://example.com/detail", "metadata": {}},
        source_evidence=lighter,
        existing_source_evidence=existing,
    )

    assert fields["metadata.source_evidence"] == existing
