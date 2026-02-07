"""
Public API endpoints — no authentication required.

Serves publicly shared licitaciones for external viewers.
"""

from fastapi import APIRouter, HTTPException, Depends, Request

from db.repositories import LicitacionRepository
from dependencies import get_licitacion_repository

router = APIRouter(
    prefix="/api/public",
    tags=["public"],
    responses={404: {"description": "Not found"}},
)


@router.get("/licitaciones/")
async def list_public_licitaciones(
    page: int = 1,
    size: int = 20,
    repo: LicitacionRepository = Depends(get_licitacion_repository),
):
    """List all publicly shared licitaciones (no auth)."""
    filters = {"is_public": True}
    skip = (page - 1) * size
    items = await repo.get_all(skip=skip, limit=size, filters=filters)
    total = await repo.count(filters=filters)
    return {
        "items": items,
        "paginacion": {
            "pagina": page,
            "por_pagina": size,
            "total_items": total,
            "total_paginas": (total + size - 1) // size,
        },
    }


@router.get("/licitaciones/{slug}")
async def get_public_licitacion(
    slug: str,
    request: Request,
):
    """Get a single public licitacion by slug (no auth)."""
    db = request.app.mongodb
    doc = await db.licitaciones.find_one({"public_slug": slug, "is_public": True})
    if not doc:
        raise HTTPException(status_code=404, detail="Licitación no encontrada")

    from db.models import licitacion_entity
    return licitacion_entity(doc)
