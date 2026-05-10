from datetime import timedelta

from services.offer_readiness_service import (
    build_offer_readiness_snapshot,
    build_readiness_notification_message,
    calculate_priority_score,
    record_readiness_history,
)
from utils.time import utc_now


def test_build_offer_readiness_snapshot_blocks_on_missing_documents():
    snapshot = build_offer_readiness_snapshot(
        licitacion={
            "_id": "lic-1",
            "budget": 25000000,
            "requisitos": {
                "source": "ai_extraction_v2",
                "schema_version": "licitometro.ai_extraction.v1",
                "documentacion_requerida": ["CUIT", "Garantia"],
                "capacidad_tecnica": ["Gestion ambiental"],
                "red_flags": ["Visita obligatoria"],
            },
        },
        company_profile={"company_id": "co-1"},
        score_result={
            "score": 54,
            "nivel": "medio",
            "ai_v2": {
                "document_inventory_available": True,
                "document_matches": ["CUIT"],
                "missing_documents": ["Garantia"],
                "technical_matches": ["Gestion ambiental"],
            },
        },
    )

    assert snapshot["schema_version"] == "licitometro.offer_readiness.v1"
    assert snapshot["status"] == "blocked"
    assert snapshot["priority_score"] == 73
    assert snapshot["ai_v2"]["document_coverage"] == 0.5
    assert snapshot["counts"] == {
        "red_flags": 1,
        "document_matches": 1,
        "missing_documents": 1,
        "technical_matches": 1,
    }


def test_build_offer_readiness_snapshot_ready_without_gaps_or_risks():
    snapshot = build_offer_readiness_snapshot(
        licitacion={
            "id": "lic-2",
            "budget": 1000000,
            "requisitos": {
                "source": "ai_extraction_v2",
                "documentacion_requerida": ["CUIT"],
            },
        },
        company_profile={"company_id": "co-1"},
        score_result={
            "score": 78,
            "nivel": "alto",
            "ai_v2": {
                "document_inventory_available": True,
                "document_matches": ["CUIT"],
                "missing_documents": [],
                "technical_matches": [],
            },
        },
    )

    assert snapshot["status"] == "ready"
    assert snapshot["priority_score"] == 93
    assert snapshot["ai_v2"]["document_coverage"] == 1.0


def test_build_readiness_notification_message_includes_transition_and_gaps():
    message = build_readiness_notification_message(
        snapshot={
            "status": "blocked",
            "licitacion_id": "64f000000000000000000001",
            "score": 46,
            "nivel": "medio",
            "counts": {
                "missing_documents": 2,
                "red_flags": 1,
                "technical_matches": 1,
            },
            "ai_v2": {
                "missing_documents": ["Garantia de oferta"],
                "red_flags": ["Visita obligatoria"],
            },
        },
        licitacion={
            "title": "Servicio de gestion ambiental",
            "organization": "Gobierno de Mendoza",
        },
        previous_status="review",
    )

    assert "Readiness 0.2: BLOQUEADA" in message
    assert "Transicion: review -> blocked" in message
    assert "Garantia de oferta" in message
    assert "https://licitometro.ar/licitaciones/64f000000000000000000001" in message


def test_priority_score_includes_opening_urgency_when_parseable():
    base_snapshot = {
        "score": 60,
        "status": "review",
        "counts": {"missing_documents": 0, "red_flags": 0},
    }

    urgent = calculate_priority_score(
        licitacion={"opening_date": (utc_now() + timedelta(days=2)).isoformat()},
        snapshot=base_snapshot,
    )
    stale = calculate_priority_score(
        licitacion={"opening_date": (utc_now() - timedelta(days=1)).isoformat()},
        snapshot=base_snapshot,
    )
    unknown = calculate_priority_score(
        licitacion={"opening_date": "fecha a confirmar"},
        snapshot=base_snapshot,
    )

    assert urgent == 78
    assert stale == 40
    assert unknown == 60


class _FakeHistory:
    def __init__(self):
        self.inserted = []

    async def insert_one(self, doc):
        self.inserted.append(doc)


class _FakeDB:
    def __init__(self):
        self.offer_readiness_history = _FakeHistory()


def test_record_readiness_history_only_records_material_changes():
    import asyncio

    db = _FakeDB()
    snapshot = {
        "schema_version": "licitometro.offer_readiness.v1",
        "licitacion_id": "lic-1",
        "company_id": "co-1",
        "status": "ready",
        "score": 82,
        "priority_score": 95,
        "counts": {"missing_documents": 0},
        "updated_at": utc_now(),
    }

    asyncio.run(record_readiness_history(
        db,
        snapshot=snapshot,
        previous={"status": "ready", "score": 82, "priority_score": 95, "counts": {"missing_documents": 0}},
    ))
    asyncio.run(record_readiness_history(
        db,
        snapshot=snapshot,
        previous={"status": "review", "score": 72, "priority_score": 80, "counts": {"missing_documents": 1}},
    ))

    assert len(db.offer_readiness_history.inserted) == 1
    event = db.offer_readiness_history.inserted[0]
    assert event["previous"]["status"] == "review"
    assert event["current"]["status"] == "ready"
