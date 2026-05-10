"""Tests for AI extraction pipeline contracts."""

from services.ai_extraction_pipeline import (
    PROMPT_VERSION,
    SCHEMA_VERSION,
    document_hash,
    normalize_ai_extraction,
    requirements_from_extraction,
)


def test_document_hash_normalizes_whitespace():
    assert document_hash("pliego\n  texto") == document_hash("pliego texto")


def test_normalize_ai_extraction_limits_and_defaults_items():
    result = normalize_ai_extraction({
        "items": [
            {"descripcion": "Servicio de mantenimiento", "cantidad": "2", "unidad": "mes"},
            {"cantidad": 1},
        ],
        "documentacion_requerida": ["Certificado fiscal"],
        "garantias": {"oferta": "5%"},
    })

    assert len(result.items) == 1
    assert result.items[0].cantidad == 2
    assert result.items[0].unidad == "mes"
    assert result.documentacion_requerida == ["Certificado fiscal"]
    assert result.garantias == {"oferta": "5%"}


def test_versions_are_explicit():
    assert SCHEMA_VERSION.startswith("licitometro.ai_extraction.")
    assert PROMPT_VERSION.startswith("pliego_requirements.")


def test_requirements_from_extraction_maps_to_scoring_schema():
    result = normalize_ai_extraction({
        "requisitos_tecnicos": ["Habilitacion municipal", "Equipo tecnico certificado"],
        "documentacion_requerida": ["Constancia fiscal"],
        "lugar_entrega": "Gran Mendoza",
        "garantias": {"oferta": "5%", "cumplimiento": "10,5%"},
        "plazo_ejecucion": "30 dias corridos",
        "presupuesto_oficial": 1500000,
        "red_flags": ["Visita obligatoria"],
    })

    requisitos = requirements_from_extraction(result)

    assert requisitos["source"] == "ai_extraction_v2"
    assert requisitos["capacidad_tecnica"] == ["Habilitacion municipal", "Equipo tecnico certificado"]
    assert requisitos["documentacion_requerida"] == ["Constancia fiscal"]
    assert requisitos["zona_ejecucion"] == "Gran Mendoza"
    assert requisitos["garantia_oferta_pct"] == 5
    assert requisitos["garantia_contrato_pct"] == 10.5
    assert requisitos["plazo_entrega_dias"] == 30
    assert requisitos["presupuesto_oficial_estimado"] == 1500000
    assert requisitos["red_flags"] == ["Visita obligatoria"]
