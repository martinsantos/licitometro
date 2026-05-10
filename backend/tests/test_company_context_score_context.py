from routers.company_context import _requirements_score_context


def test_requirements_score_context_summarizes_ai_v2_requirements():
    context = _requirements_score_context({
        "source": "ai_extraction_v2",
        "schema_version": "licitometro.ai_extraction.v1",
        "prompt_version": "pliego_requirements.v1",
        "red_flags": ["Visita obligatoria"],
        "documentacion_requerida": ["Constancia fiscal", "Garantia"],
        "capacidad_tecnica": ["Equipo certificado"],
        "presupuesto_oficial_estimado": 1200000,
        "zona_ejecucion": "Mendoza",
    })

    assert context == {
        "source": "ai_extraction_v2",
        "schema_version": "licitometro.ai_extraction.v1",
        "prompt_version": "pliego_requirements.v1",
        "score_basis": "ai_extraction_v2",
        "red_flags_count": 1,
        "documentacion_count": 2,
        "capacidad_tecnica_count": 1,
        "has_budget": True,
        "has_zone": True,
    }


def test_requirements_score_context_handles_legacy_empty_lists():
    context = _requirements_score_context({
        "certificaciones_exigidas": ["ISO 9001"],
        "documentacion_requerida": None,
        "capacidad_tecnica": "legacy text",
    })

    assert context["source"] == "legacy"
    assert context["score_basis"] == "legacy"
    assert context["documentacion_count"] == 0
    assert context["capacidad_tecnica_count"] == 0
    assert context["red_flags_count"] == 0
