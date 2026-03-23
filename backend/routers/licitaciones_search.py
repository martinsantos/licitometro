from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel
from typing import Dict, Any, Optional
import logging

from db.repositories import LicitacionRepository
from dependencies import get_licitacion_repository

logger = logging.getLogger("licitaciones_search_router")

router = APIRouter(
    prefix="/api/licitaciones",
    tags=["licitaciones-search"],
    responses={404: {"description": "Not found"}}
)


@router.get("/search", response_model=Dict[str, Any])
async def search_licitaciones(
    q: str = Query(..., min_length=1),
    page: int = Query(1, ge=1),
    size: int = Query(15, ge=1, le=100),
    sort_by: str = Query("publication_date", description="Field to sort by"),
    sort_order: str = Query("desc", description="Sort order: asc or desc"),
    repo: LicitacionRepository = Depends(get_licitacion_repository)
):
    """Search licitaciones with pagination and sorting support"""
    # Handle sort order
    order_val = 1 if sort_order == "asc" else -1

    # Calculate skip
    skip = (page - 1) * size

    items = await repo.search(q, skip=skip, limit=size, sort_by=sort_by, sort_order=order_val)
    total_items = await repo.search_count(q)

    return {
        "items": items,
        "paginacion": {
            "pagina": page,
            "por_pagina": size,
            "total_items": total_items,
            "total_paginas": (total_items + size - 1) // size
        }
    }


@router.get("/search/smart")
async def smart_search(
    q: str = Query(..., min_length=1),
):
    """Parse a natural language query into structured filters.
    Returns the parsed filters that the frontend can apply."""
    from services.smart_search_parser import parse_smart_query
    parsed = parse_smart_query(q)
    return {"query": q, "parsed_filters": parsed}


@router.get("/similar/{licitacion_id}")
async def get_similar_licitaciones(
    licitacion_id: str,
    top_k: int = Query(8, ge=1, le=20),
    request: Request = None,
):
    """Return the K most semantically similar licitaciones (requires embeddings)."""
    from services.embedding_service import get_embedding_service
    from db.models import licitacion_entity
    db = request.app.mongodb
    svc = get_embedding_service(db)
    similar = await svc.find_similar(licitacion_id, top_k=top_k)
    return [licitacion_entity(s) for s in similar]


class SemanticSearchBody(BaseModel):
    q: str
    limit: int = 20


@router.post("/search/semantic")
async def semantic_search(
    body: SemanticSearchBody,
    request: Request = None,
):
    """Semantic search by free text (requires embeddings)."""
    from services.embedding_service import get_embedding_service
    from db.models import licitacion_entity
    db = request.app.mongodb
    svc = get_embedding_service(db)
    results = await svc.search_by_text(body.q, top_k=body.limit)
    return {"items": [licitacion_entity(r) for r in results], "total": len(results)}
