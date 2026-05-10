from services.match_score_service import match_score


def test_match_score_rewards_ai_v2_technical_and_document_matches():
    profile = {
        "nombre": "Urban Mining",
        "rubros_inscriptos": ["servicios ambientales", "gestion de residuos"],
        "certificaciones": ["RUPE", "ISO 9001"],
        "numero_proveedor_estado": "123",
        "cuit": "30-12345678-9",
    }
    requisitos = {
        "source": "ai_extraction_v2",
        "capacidad_tecnica": [
            "Gestion de residuos peligrosos",
            "Operacion ambiental certificada",
        ],
        "documentacion_requerida": [
            "Constancia de inscripcion RUPE",
            "Constancia de CUIT",
        ],
    }

    result = match_score(profile, requisitos)

    assert result["score"] == 62
    assert result["ai_v2"]["technical_matches"] == [
        "Gestion de residuos peligrosos",
        "Operacion ambiental certificada",
    ]
    assert result["ai_v2"]["document_matches"] == [
        "Constancia de inscripcion RUPE",
        "Constancia de CUIT",
    ]
    assert result["ai_v2"]["missing_documents"] == []
    assert result["ai_v2"]["document_inventory_available"] is False
    assert any(r["peso"] == 8 and "requisito(s)" in r["texto"] for r in result["razones"])
    assert any(r["peso"] == 4 and "documento(s)" in r["texto"] for r in result["razones"])


def test_match_score_does_not_penalize_ai_v2_requirements_without_profile_signals():
    result = match_score(
        {"nombre": "Proveedor sin ficha ampliada"},
        {
            "source": "ai_extraction_v2",
            "capacidad_tecnica": ["Laboratorio calibrado"],
            "documentacion_requerida": ["Certificado fiscal"],
        },
    )

    assert result["score"] == 50
    assert result["razones"] == []


def test_match_score_penalizes_missing_docs_when_inventory_exists():
    result = match_score(
        {
            "nombre": "Urban Mining",
            "documentos_disponibles": ["Constancia de CUIT"],
            "cuit": "30-12345678-9",
        },
        {
            "source": "ai_extraction_v2",
            "documentacion_requerida": [
                "Constancia de CUIT",
                "Certificado fiscal vigente",
                "Garantia de oferta",
            ],
        },
    )

    assert result["score"] == 46
    assert result["ai_v2"]["document_matches"] == ["Constancia de CUIT"]
    assert result["ai_v2"]["missing_documents"] == [
        "Certificado fiscal vigente",
        "Garantia de oferta",
    ]
    assert result["ai_v2"]["document_inventory_available"] is True
    assert any(r["peso"] == 2 and "documento(s) compatibles" in r["texto"] for r in result["razones"])
    assert any(r["peso"] == -6 and "no presentes en el inventario" in r["texto"] for r in result["razones"])
