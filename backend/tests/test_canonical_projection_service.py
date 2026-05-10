"""Tests for canonical tender projection."""

from services.canonical_projection_service import (
    build_canonical_projection,
    canonical_duplicate_key,
    detect_duplicate_candidates,
    merge_canonical_projections,
    merge_source_records,
)


def test_builds_canonical_projection_from_legacy_doc():
    canonical = build_canonical_projection({
        "_id": "abc",
        "id_licitacion": "mza-1",
        "title": "Compra de insumos",
        "organization": "Gobierno de Mendoza",
        "fuente": "COMPR.AR Mendoza",
        "source_url": "https://example.com/list",
        "canonical_url": "https://example.com/direct",
        "url_quality": "direct",
        "jurisdiccion": "Mendoza",
        "metadata": {
            "source_evidence": {
                "evidence_ids": ["ev-1"],
                "extraction_confidence": 0.91,
                "evidence_count": 1,
            }
        },
    })

    assert canonical.canonical_id
    assert canonical.title == "Compra de insumos"
    assert canonical.source_records[0].source_name == "COMPR.AR Mendoza"
    assert canonical.source_records[0].url_quality == "direct"
    assert canonical.source_records[0].evidence_ids == ["ev-1"]
    assert canonical.source_records[0].extraction_confidence == 0.91
    assert canonical.metadata["duplicate_key"]


def test_objeto_becomes_canonical_title_when_present():
    canonical = build_canonical_projection({
        "id_licitacion": "mza-2",
        "title": "Licitacion publica",
        "objeto": "Servicio de limpieza integral",
        "organization": "Municipalidad",
        "fuente": "Boletin Oficial Mendoza",
    })

    assert canonical.title == "Servicio de limpieza integral"


def test_merge_source_records_replaces_same_source_record():
    existing = [{
        "source_id": "comprar_mendoza",
        "source_record_id": "123",
        "source_url": "https://example.com/old",
        "first_seen_at": "first",
        "last_seen_at": "old",
    }]
    merged = merge_source_records(existing, {
        "source_id": "comprar_mendoza",
        "source_record_id": "123",
        "source_url": "https://example.com/new",
        "last_seen_at": "new",
    })

    assert len(merged) == 1
    assert merged[0]["source_url"] == "https://example.com/new"
    assert merged[0]["first_seen_at"] == "first"
    assert merged[0]["last_seen_at"] == "new"


def test_merge_source_records_appends_different_source():
    merged = merge_source_records(
        [{"source_id": "comprar_mendoza", "source_record_id": "123"}],
        {"source_id": "boletin_oficial_mendoza", "source_record_id": "456"},
    )

    assert len(merged) == 2


def test_duplicate_key_normalizes_text_noise():
    first = canonical_duplicate_key({
        "title": "Adquisición de Insumos Médicos",
        "organization": "Ministerio de Salud",
        "jurisdiccion": "Mendoza",
        "opening_date": "2026-05-20T10:00:00",
    })
    second = canonical_duplicate_key({
        "title": "Adquisicion de insumos medicos",
        "organization": "Ministerio Salud",
        "jurisdiccion": "Mendoza",
        "opening_date": "2026-05-20",
    })

    assert first == second


def test_detect_duplicate_candidates_groups_same_opportunity():
    candidates = detect_duplicate_candidates([
        {
            "canonical_id": "mza-1",
            "title": "Compra de insumos",
            "organization": "Ministerio",
            "jurisdiccion": "Mendoza",
            "opening_date": "2026-05-20",
            "source_records": [{"source_name": "Mendoza Compra", "evidence_ids": ["ev-1"]}],
        },
        {
            "canonical_id": "bol-77",
            "title": "Compra de insumos",
            "organization": "Ministerio",
            "jurisdiccion": "Mendoza",
            "opening_date": "2026-05-20",
            "source_records": [{"source_name": "Boletin Oficial Mendoza", "evidence_ids": ["ev-2"]}],
        },
        {
            "canonical_id": "other",
            "title": "Servicio de limpieza",
            "organization": "Municipalidad",
            "jurisdiccion": "Mendoza",
            "opening_date": "2026-05-21",
            "source_records": [{"source_name": "Mendoza Compra"}],
        },
    ])

    assert len(candidates) == 1
    assert candidates[0]["count"] == 2
    assert candidates[0]["confidence"] == 0.94
    assert candidates[0]["canonical_ids"] == ["mza-1", "bol-77"]
    assert candidates[0]["evidence_count"] == 2


class _MergeCollection:
    def __init__(self, docs):
        self.docs = {doc["canonical_id"]: dict(doc) for doc in docs}

    async def find_one(self, filters):
        doc = self.docs.get(filters.get("canonical_id"))
        return dict(doc) if doc else None

    async def update_one(self, filters, update, **_kwargs):
        doc = self.docs[filters["canonical_id"]]
        doc.update(update.get("$set", {}))


class _MergeDB:
    def __init__(self, docs):
        self.tender_canonical_projections = _MergeCollection(docs)


def test_merge_canonical_projections_marks_duplicates_and_combines_sources():
    import asyncio

    db = _MergeDB([
        {
            "canonical_id": "primary",
            "title": "Compra de insumos",
            "metadata": {},
            "source_records": [{"source_id": "comprar", "source_record_id": "1"}],
        },
        {
            "canonical_id": "duplicate",
            "title": "Compra de insumos",
            "metadata": {},
            "source_records": [{"source_id": "boletin", "source_record_id": "2"}],
        },
    ])

    result = asyncio.run(merge_canonical_projections(db, "primary", ["duplicate"], actor="tester"))

    primary = db.tender_canonical_projections.docs["primary"]
    duplicate = db.tender_canonical_projections.docs["duplicate"]
    assert result["ok"] is True
    assert result["merged"] == 1
    assert len(primary["source_records"]) == 2
    assert primary["metadata"]["merged_from"] == ["duplicate"]
    assert duplicate["estado"] == "merged"
    assert duplicate["metadata"]["merged_into"] == "primary"
