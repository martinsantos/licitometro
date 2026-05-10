import pytest

from services.query_copilot_service import (
    QueryCopilotService,
    QueryCopilotValidationError,
    validate_readonly_pipeline,
)


def test_readonly_pipeline_allows_simple_grouping():
    validate_readonly_pipeline([
        {"$match": {"estado": "vigente"}},
        {"$group": {"_id": "$fuente", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 10},
    ])


def test_readonly_pipeline_rejects_lookup_and_function():
    with pytest.raises(QueryCopilotValidationError):
        validate_readonly_pipeline([{"$lookup": {"from": "users"}}])

    with pytest.raises(QueryCopilotValidationError):
        validate_readonly_pipeline([
            {"$project": {"x": {"$function": {"body": "return 1", "args": [], "lang": "js"}}}}
        ])


def test_query_copilot_builds_filters_from_smart_parser_output():
    svc = QueryCopilotService(db=None)
    filters = svc._filters_from_parsed({
        "text": "software",
        "jurisdiccion": "Mendoza",
        "budget_min": 1000000,
        "fecha_desde": "2026-03-01",
        "fecha_hasta": "2026-03-31",
    })

    assert filters["$and"][0]["jurisdiccion"] == "Mendoza"
    assert filters["$and"][0]["budget"]["$gte"] == 1000000
    assert "publication_date" in filters["$and"][0]
    assert "$or" in filters["$and"][1]
