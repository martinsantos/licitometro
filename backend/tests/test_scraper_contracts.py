"""Tests for Licitometro 0.2 scraper contracts."""

import pytest

from models.licitacion import LicitacionCreate
from scrapers.contracts import (
    EvidenceKind,
    ScrapeResult,
    SourceEvidence,
    evidence_id,
    normalize_scraper_output,
    summarize_item_evidence,
    summarize_legacy_evidence,
)


def _item(**overrides):
    data = {
        "title": "Compra de insumos",
        "organization": "Gobierno de Mendoza",
        "id_licitacion": "mza-1",
        "jurisdiccion": "Mendoza",
        "tipo_procedimiento": "Licitacion",
        "source_url": "https://example.com/proceso/1",
        "fuente": "Fuente Mendoza",
    }
    data.update(overrides)
    return LicitacionCreate(**data)


def test_wraps_legacy_item_with_source_evidence():
    result = ScrapeResult.from_legacy_item(_item(), source_id="generic_html_mendoza")

    assert result.source_id == "generic_html_mendoza"
    assert result.extraction_version == "legacy"
    assert result.evidence[0].kind == EvidenceKind.HTML
    assert result.evidence[0].source_url == "https://example.com/proceso/1"


def test_contract_requires_source_id():
    with pytest.raises(ValueError):
        ScrapeResult.from_legacy_item(_item(), source_id="")


def test_contract_captures_pdf_attachments_as_evidence():
    result = ScrapeResult.from_legacy_item(
        _item(attached_files=[{"url": "https://example.com/pliego.pdf", "name": "Pliego"}]),
        source_id="generic_html_mendoza",
    )

    assert [ev.kind for ev in result.evidence] == [EvidenceKind.HTML, EvidenceKind.PDF]


def test_summarize_legacy_evidence_counts_wrapped_contract():
    summary = summarize_legacy_evidence(
        [
            _item(id_licitacion="mza-1", source_url="https://example.com/proceso/1", attached_files=[]),
            _item(
                id_licitacion="mza-2",
                source_url=None,
                attached_files=[{"url": "https://example.com/pliego.pdf", "name": "Pliego"}],
            ),
        ],
        source_id="generic_html_mendoza",
    )

    assert summary["contract"] == "legacy_wrapped_scrape_result"
    assert summary["items_evaluated"] == 2
    assert summary["items_with_evidence"] == 2
    assert summary["evidence_count"] == 2
    assert summary["evidence_kind_counts"] == {"html": 1, "pdf": 1}


def test_normalize_scraper_output_accepts_native_results():
    native = ScrapeResult(
        item=_item(id_licitacion="native-1"),
        source_id="native_mendoza",
        evidence=[SourceEvidence(kind=EvidenceKind.API_JSON, source_url="https://api.example.com/1")],
        extraction_confidence=0.91,
        extraction_version="mendoza_api_v2",
    )

    items, results, summary = normalize_scraper_output([native], source_id="fallback")

    assert items[0].id_licitacion == "native-1"
    assert results[0].source_id == "native_mendoza"
    assert summary["contract"] == "native_scrape_result"
    assert summary["native_result_count"] == 1
    assert summary["legacy_wrapped_count"] == 0
    assert summary["evidence_kind_counts"] == {"api_json": 1}


def test_normalize_scraper_output_accepts_mixed_legacy_and_native_results():
    legacy = _item(id_licitacion="legacy-1")
    native = ScrapeResult(
        item=_item(id_licitacion="native-1"),
        source_id="native_mendoza",
        evidence=[],
        extraction_version="mendoza_api_v2",
    )

    items, results, summary = normalize_scraper_output([legacy, native], source_id="legacy_source")

    assert [item.id_licitacion for item in items] == ["legacy-1", "native-1"]
    assert [result.source_id for result in results] == ["legacy_source", "native_mendoza"]
    assert summary["contract"] == "native_scrape_result"
    assert summary["native_result_count"] == 1
    assert summary["legacy_wrapped_count"] == 1


def test_summarize_item_evidence_builds_stable_ids():
    evidence = SourceEvidence(kind=EvidenceKind.PDF, source_url="https://example.com/pliego.pdf")
    result = ScrapeResult(
        item=_item(id_licitacion="mza-1"),
        source_id="mendoza",
        evidence=[evidence],
        extraction_confidence=0.88,
        extraction_version="native_v1",
    )

    summary = summarize_item_evidence(result)

    assert summary["contract"] == "native_scrape_result"
    assert summary["evidence_ids"] == [evidence_id(evidence)]
    assert summary["evidence_kind_counts"] == {"pdf": 1}
    assert summary["extraction_confidence"] == 0.88
