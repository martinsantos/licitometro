"""
Nodos CRUD router — manage semantic search maps (nodos).
"""

import re
import logging
from datetime import datetime
from typing import Optional, Dict, Any, List

from fastapi import APIRouter, HTTPException, Query, Request
from bson import ObjectId

from models.nodo import NodoCreate, NodoUpdate, Nodo
from db.models import nodo_entity, nodos_entity, licitacion_entity, licitaciones_entity

logger = logging.getLogger("nodos_router")

router = APIRouter(
    prefix="/api/nodos",
    tags=["nodos"],
    responses={404: {"description": "Not found"}},
)


def _make_slug(name: str) -> str:
    """Generate URL-safe slug from name."""
    import unicodedata
    nfkd = unicodedata.normalize("NFKD", name.lower())
    ascii_text = "".join(c for c in nfkd if unicodedata.category(c) != "Mn")
    slug = re.sub(r"[^a-z0-9\s]", "", ascii_text)
    slug = re.sub(r"\s+", "-", slug.strip())
    return slug[:80].rstrip("-")


@router.post("/")
async def create_nodo(nodo: NodoCreate, request: Request):
    """Create a new nodo."""
    db = request.app.mongodb

    # Auto-generate slug if empty
    slug = nodo.slug.strip() if nodo.slug else ""
    if not slug:
        slug = _make_slug(nodo.name)

    doc = nodo.model_dump()
    doc["slug"] = slug
    doc["matched_count"] = 0
    doc["created_at"] = datetime.utcnow()
    doc["updated_at"] = datetime.utcnow()

    result = await db.nodos.insert_one(doc)
    doc["_id"] = result.inserted_id

    # Reload matcher cache
    from services.nodo_matcher import get_nodo_matcher
    matcher = get_nodo_matcher(db)
    await matcher.reload_nodos()

    return nodo_entity(doc)


@router.get("/")
async def list_nodos(
    active_only: bool = Query(False),
    request: Request = None,
):
    """List all nodos."""
    db = request.app.mongodb
    query = {"active": True} if active_only else {}
    cursor = db.nodos.find(query).sort("name", 1)
    docs = await cursor.to_list(length=200)
    return nodos_entity(docs)


@router.get("/{nodo_id}")
async def get_nodo(nodo_id: str, request: Request):
    """Get a nodo by ID."""
    db = request.app.mongodb
    try:
        oid = ObjectId(nodo_id)
    except Exception:
        raise HTTPException(status_code=400, detail="ID inválido")
    doc = await db.nodos.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Nodo no encontrado")
    return nodo_entity(doc)


@router.put("/{nodo_id}")
async def update_nodo(nodo_id: str, update: NodoUpdate, request: Request):
    """Update a nodo."""
    db = request.app.mongodb
    try:
        oid = ObjectId(nodo_id)
    except Exception:
        raise HTTPException(status_code=400, detail="ID inválido")

    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No hay datos para actualizar")

    # If keyword_groups is provided, convert Pydantic models to dicts
    if "keyword_groups" in update_data:
        update_data["keyword_groups"] = [
            g.model_dump() if hasattr(g, "model_dump") else g
            for g in update_data["keyword_groups"]
        ]
    if "actions" in update_data:
        update_data["actions"] = [
            a.model_dump() if hasattr(a, "model_dump") else a
            for a in update_data["actions"]
        ]

    update_data["updated_at"] = datetime.utcnow()

    result = await db.nodos.update_one({"_id": oid}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Nodo no encontrado")

    # Reload matcher cache
    from services.nodo_matcher import get_nodo_matcher
    matcher = get_nodo_matcher(db)
    await matcher.reload_nodos()

    doc = await db.nodos.find_one({"_id": oid})
    return nodo_entity(doc)


@router.delete("/{nodo_id}")
async def delete_nodo(nodo_id: str, request: Request):
    """Delete a nodo and remove it from all licitaciones."""
    db = request.app.mongodb
    try:
        oid = ObjectId(nodo_id)
    except Exception:
        raise HTTPException(status_code=400, detail="ID inválido")

    result = await db.nodos.delete_one({"_id": oid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Nodo no encontrado")

    # Remove this nodo ID from all licitaciones
    await db.licitaciones.update_many(
        {"nodos": nodo_id},
        {"$pull": {"nodos": nodo_id}}
    )

    # Reload matcher cache
    from services.nodo_matcher import get_nodo_matcher
    matcher = get_nodo_matcher(db)
    await matcher.reload_nodos()

    return {"ok": True, "id": nodo_id}


@router.post("/{nodo_id}/rematch")
async def rematch_nodo(nodo_id: str, request: Request):
    """Re-match ALL licitaciones against this nodo. Returns count of new matches."""
    db = request.app.mongodb
    try:
        oid = ObjectId(nodo_id)
    except Exception:
        raise HTTPException(status_code=400, detail="ID inválido")

    nodo_doc = await db.nodos.find_one({"_id": oid})
    if not nodo_doc:
        raise HTTPException(status_code=404, detail="Nodo no encontrado")

    from services.nodo_matcher import get_nodo_matcher, _build_flexible_pattern

    # Build patterns for this nodo only
    patterns = []
    for group in nodo_doc.get("keyword_groups", []):
        for kw in group.get("keywords", []):
            if kw.strip():
                try:
                    patterns.append(_build_flexible_pattern(kw.strip()))
                except Exception:
                    pass

    if not patterns:
        return {"matched": 0, "message": "No keywords configured"}

    from services.nodo_matcher import _normalize_text

    matched = 0
    cursor = db.licitaciones.find(
        {},
        {"_id": 1, "title": 1, "objeto": 1, "description": 1, "organization": 1, "nodos": 1}
    )
    async for lic in cursor:
        parts = [
            _normalize_text(lic.get("title", "") or ""),
            _normalize_text(lic.get("objeto", "") or ""),
            _normalize_text((lic.get("description", "") or "")[:2000]),
            _normalize_text(lic.get("organization", "") or ""),
        ]
        combined = " ".join(parts)

        hit = any(p.search(combined) for p in patterns)
        if hit:
            existing_nodos = lic.get("nodos", []) or []
            if nodo_id not in existing_nodos:
                await db.licitaciones.update_one(
                    {"_id": lic["_id"]},
                    {"$addToSet": {"nodos": nodo_id}}
                )
            matched += 1

    # Update matched_count
    await db.nodos.update_one({"_id": oid}, {"$set": {"matched_count": matched}})

    return {"matched": matched, "nodo": nodo_doc.get("name")}


@router.get("/{nodo_id}/licitaciones")
async def get_nodo_licitaciones(
    nodo_id: str,
    page: int = Query(1, ge=1),
    size: int = Query(15, ge=1, le=100),
    request: Request = None,
):
    """List licitaciones matched to this nodo (paginated)."""
    db = request.app.mongodb

    query = {"nodos": nodo_id}
    skip = (page - 1) * size

    cursor = db.licitaciones.find(query).sort("fecha_scraping", -1).skip(skip).limit(size)
    docs = await cursor.to_list(length=size)
    total = await db.licitaciones.count_documents(query)

    return {
        "items": licitaciones_entity(docs),
        "paginacion": {
            "pagina": page,
            "por_pagina": size,
            "total_items": total,
            "total_paginas": (total + size - 1) // size,
        },
    }
