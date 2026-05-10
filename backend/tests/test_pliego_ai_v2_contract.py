"""Contract smoke tests for Pliego AI v2 surface."""

from routers import cotizar_ai
from services.ai_extraction_pipeline import SCHEMA_VERSION, PROMPT_VERSION


def test_extract_v2_route_registered():
    paths = {route.path for route in cotizar_ai.router.routes}
    assert "/api/cotizar-ai/pliego/{licitacion_id}/extract-v2" in paths
    assert "/api/cotizar-ai/pliego/extract-v2-batch" in paths
    assert "/api/cotizar-ai/pliego/extract-v2-batch/runs" in paths


def test_ai_extraction_versions_are_nonempty():
    assert SCHEMA_VERSION
    assert PROMPT_VERSION
