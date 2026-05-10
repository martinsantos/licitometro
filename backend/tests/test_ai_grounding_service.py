from services.ai_grounding_service import get_ai_grounding_service


def test_grounding_supports_numbers_found_in_pliego_text():
    svc = get_ai_grounding_service()
    source = "La garantia de mantenimiento de oferta sera del 5% y el plazo de entrega 30 dias."
    result = svc.ground_response(
        {
            "garantia_mantenimiento_oferta": "5%",
            "plazo_entrega": "30 dias",
        },
        source_text=source,
        licitacion={"budget": 1500000},
    )

    assert result["confidence"] == 0.9
    assert result["claims_checked"] >= 2
    assert result["unsupported_claims"] == []
    assert "garantia_mantenimiento_oferta" in result["verified_fields"]


def test_grounding_flags_unsupported_material_claim():
    svc = get_ai_grounding_service()
    result = svc.ground_response(
        "La garantia es del 12% y el presupuesto es $999.000.",
        source_text="La garantia es del 5%.",
        licitacion={"budget": 1500000},
    )

    tokens = {item["token"] for item in result["unsupported_claims"]}
    assert any("12" in token for token in tokens)
    assert any("999" in token for token in tokens)
    assert result["confidence"] < 0.9


def test_grounding_without_material_claims_is_high_confidence_if_evidence_exists():
    svc = get_ai_grounding_service()
    result = svc.ground_response(
        "El pliego no informa contactos especificos.",
        source_text="Texto completo del pliego.",
    )

    assert result["confidence"] == 0.8
    assert result["claims_checked"] == 0
