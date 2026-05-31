"""Tests for source quality metrics."""

from models.licitacion import LicitacionCreate
from services.source_quality_service import evaluate_item_quality, summarize_items_quality


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


def test_core_complete_item_gets_nonzero_quality():
    quality = evaluate_item_quality(_item())

    assert quality.score >= 50
    assert quality.missing_core == []


def test_documents_and_direct_url_raise_quality():
    base = evaluate_item_quality(_item()).score
    richer = evaluate_item_quality(
        _item(
            canonical_url="https://example.com/direct/1",
            url_quality="direct",
            attached_files=[{"url": "https://example.com/pliego.pdf"}],
        )
    ).score

    assert richer > base


def test_direct_pdf_counts_as_direct_url_quality():
    quality = evaluate_item_quality(
        _item(
            canonical_url="https://boe.mendoza.gov.ar/default/public/publico/verpdf/32595",
            url_quality="direct_pdf",
            attached_files=[{"url": "https://boe.mendoza.gov.ar/default/public/publico/verpdf/32595", "type": "pdf"}],
        )
    )

    assert quality.has_direct_url is True


def test_quality_summary_counts_missing_fields():
    summary = summarize_items_quality([
        _item(opening_date=None),
        _item(canonical_url="https://example.com/direct/2", url_quality="direct"),
    ])

    assert summary["items_evaluated"] == 2
    assert "opening_date" in summary["missing_valuable_counts"]
    assert 0 <= summary["document_coverage"] <= 1
