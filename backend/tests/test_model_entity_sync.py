"""
test_model_entity_sync.py

Verifies that licitacion_entity() in db/models.py covers ALL fields declared in
LicitacionBase (and the extra fields from LicitacionCreate and Licitacion).

If this test fails it prints the exact set of missing field names so the developer
knows precisely what to add to licitacion_entity().
"""

import sys
from pathlib import Path
from datetime import datetime
from bson import ObjectId

# conftest.py already inserts backend/ into sys.path, but be defensive here too.
_backend_dir = Path(__file__).resolve().parent.parent
if str(_backend_dir) not in sys.path:
    sys.path.insert(0, str(_backend_dir))

from db.models import licitacion_entity
# Import the classes purely to inspect class-level metadata — no instantiation,
# so the @model_validator (which imports utils.dates) is never triggered.
from models.licitacion import LicitacionBase, LicitacionCreate, Licitacion


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _build_mock_document() -> dict:
    """
    Return a minimal-but-complete MongoDB document (plain dict with _id).
    Every field is given a harmless default value so licitacion_entity() can
    run without KeyError or None-related surprises.
    """
    now = datetime.utcnow()
    return {
        "_id": ObjectId(),
        # LicitacionBase fields
        "title": "Test Licitacion",
        "organization": "Test Org",
        "publication_date": now,
        "opening_date": now,
        "expiration_date": now,
        "fecha_publicacion_portal": now,
        "fecha_inicio_consultas": now,
        "fecha_fin_consultas": now,
        "etapa": "Única",
        "modalidad": "Electronica",
        "alcance": "Nacional",
        "encuadre_legal": "Ley 123",
        "tipo_cotizacion": "Global",
        "tipo_adjudicacion": "Simple",
        "plazo_mantenimiento_oferta": "30 días",
        "requiere_pago": False,
        "duracion_contrato": "12 meses",
        "fecha_inicio_contrato": "2026-01-01",
        "items": [],
        "garantias": [],
        "solicitudes_contratacion": [],
        "pliegos_bases": [],
        "requisitos_participacion": [],
        "actos_administrativos": [],
        "circulares": [],
        "expedient_number": "EXP-001",
        "licitacion_number": "LIC-001",
        "description": "Descripción de prueba",
        "objeto": "Objeto de prueba",
        "contact": "contacto@ejemplo.com",
        "source_url": "https://ejemplo.com/licitacion/1",
        "canonical_url": "https://ejemplo.com/licitacion/1",
        "source_urls": {},
        "url_quality": "direct",
        "status": "active",
        "fuente": "test_scraper",
        "fuentes": [],
        "proceso_id": None,
        "fecha_scraping": now,
        "tipo_procedimiento": "Licitación Pública",
        "tipo_acceso": "Público",
        "tipo": None,
        "jurisdiccion": "Municipal",
        "location": "Mendoza",
        "category": "Obras",
        "budget": 1000000.0,
        "currency": "ARS",
        "attached_files": [],
        "keywords": [],
        "metadata": {},
        "content_hash": "abc123",
        "merged_from": [],
        "is_merged": False,
        "workflow_state": "descubierta",
        "workflow_history": [],
        "enrichment_level": 1,
        "last_enrichment": None,
        "document_count": 0,
        "last_auto_update": None,
        "auto_update_changes": [],
        "is_public": False,
        "public_slug": None,
        "nodos": [],
        "tags": [],
        "estado": "vigente",
        "fecha_prorroga": None,
        # LicitacionCreate extra fields
        "id_licitacion": "TEST-001",
        "municipios_cubiertos": None,
        "provincia": None,
        "cobertura": None,
        # Licitacion timestamp fields
        "created_at": now,
        "updated_at": now,
        "first_seen_at": now,
    }


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestModelEntitySync:
    """Ensures licitacion_entity() output keys cover every model field."""

    def test_all_licitacion_base_fields_present(self):
        """Every field declared in LicitacionBase must appear in the entity dict."""
        base_fields = set(LicitacionBase.model_fields.keys())

        doc = _build_mock_document()
        entity = licitacion_entity(doc)
        entity_keys = set(entity.keys())

        missing = base_fields - entity_keys
        assert not missing, (
            f"licitacion_entity() is missing {len(missing)} field(s) from LicitacionBase:\n"
            + "\n".join(f"  - {f}" for f in sorted(missing))
            + "\n\nAdd these keys to the dict returned by licitacion_entity() in backend/db/models.py"
        )

    def test_licitacion_create_extra_fields_present(self):
        """Fields added in LicitacionCreate (not in LicitacionBase) must be present."""
        base_fields = set(LicitacionBase.model_fields.keys())
        create_fields = set(LicitacionCreate.model_fields.keys())
        extra_fields = create_fields - base_fields  # fields ONLY in LicitacionCreate

        doc = _build_mock_document()
        entity = licitacion_entity(doc)
        entity_keys = set(entity.keys())

        missing = extra_fields - entity_keys
        assert not missing, (
            f"licitacion_entity() is missing {len(missing)} field(s) from LicitacionCreate:\n"
            + "\n".join(f"  - {f}" for f in sorted(missing))
            + "\n\nAdd these keys to the dict returned by licitacion_entity() in backend/db/models.py"
        )

    def test_licitacion_timestamp_fields_present(self):
        """Timestamp fields added in Licitacion (created_at, updated_at, first_seen_at) must be present."""
        base_fields = set(LicitacionBase.model_fields.keys())
        db_fields = set(Licitacion.model_fields.keys())
        timestamp_fields = db_fields - base_fields  # 'id', 'created_at', 'updated_at', 'first_seen_at'

        # We always expect at least these three:
        required_timestamps = {"created_at", "updated_at", "first_seen_at"}
        # Also include 'id' if it appears in Licitacion.model_fields
        fields_to_check = (timestamp_fields | required_timestamps) - {"id"}

        doc = _build_mock_document()
        entity = licitacion_entity(doc)
        entity_keys = set(entity.keys())

        missing = fields_to_check - entity_keys
        assert not missing, (
            f"licitacion_entity() is missing {len(missing)} timestamp field(s) from Licitacion:\n"
            + "\n".join(f"  - {f}" for f in sorted(missing))
            + "\n\nAdd these keys to the dict returned by licitacion_entity() in backend/db/models.py"
        )

    def test_entity_always_has_id_key(self):
        """The entity dict must always have an 'id' key derived from _id."""
        doc = _build_mock_document()
        entity = licitacion_entity(doc)
        assert "id" in entity, (
            "licitacion_entity() must always return an 'id' key (derived from MongoDB _id)"
        )
        assert entity["id"], "entity 'id' must be a non-empty string"

    def test_no_extra_unexpected_keys(self):
        """
        The entity dict should not contain keys that are completely unknown to the
        model.  This catches copy-paste typos (e.g. 'tittle' instead of 'title').

        Allowed keys = all model fields + 'id' (mapped from _id).
        """
        all_model_fields = (
            set(LicitacionBase.model_fields.keys())
            | set(LicitacionCreate.model_fields.keys())
            | set(Licitacion.model_fields.keys())
            | {"id"}  # always present, mapped from _id
        )

        doc = _build_mock_document()
        entity = licitacion_entity(doc)
        entity_keys = set(entity.keys())

        unexpected = entity_keys - all_model_fields
        assert not unexpected, (
            f"licitacion_entity() returns {len(unexpected)} key(s) not present in any model:\n"
            + "\n".join(f"  - {k}" for k in sorted(unexpected))
            + "\n\nEither remove these keys or add them to the appropriate Pydantic model."
        )

    def test_entity_returns_string_for_source_url(self):
        """
        source_url is stored as a plain string in MongoDB (HttpUrl in Pydantic).
        The entity mapper must pass it through as-is (string, not a Pydantic HttpUrl).
        """
        doc = _build_mock_document()
        doc["source_url"] = "https://ejemplo.gov.ar/licitacion/42"
        entity = licitacion_entity(doc)

        assert entity.get("source_url") == "https://ejemplo.gov.ar/licitacion/42", (
            "source_url must be returned as a plain string from licitacion_entity(), "
            "not wrapped in a Pydantic HttpUrl object"
        )

    def test_entity_handles_missing_optional_fields_gracefully(self):
        """
        licitacion_entity() uses .get() — it must not raise KeyError when optional
        fields are absent from the MongoDB document.
        """
        minimal_doc = {
            "_id": ObjectId(),
            "title": "Minimal",
            "organization": "Org",
        }
        # Should not raise
        entity = licitacion_entity(minimal_doc)
        assert entity["title"] == "Minimal"
        assert entity["organization"] == "Org"
        # Optional fields must default to None or an empty collection
        assert entity.get("description") is None
        assert entity.get("items") == []
        assert entity.get("keywords") == []
        assert entity.get("metadata") == {}
