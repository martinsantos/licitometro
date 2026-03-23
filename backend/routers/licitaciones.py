from fastapi import APIRouter, Depends, HTTPException, Query, Body, Request
from pydantic import BaseModel
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
from typing import List, Dict, Optional, Any
from uuid import UUID
from datetime import date, datetime
import logging
import re
import sys
from bson import ObjectId
from pathlib import Path

# Add parent directory to path so we can import modules
sys.path.insert(0, str(Path(__file__).parent.parent))

from db.repositories import LicitacionRepository
from models.licitacion import Licitacion, LicitacionCreate, LicitacionUpdate
from dependencies import get_licitacion_repository
from utils.filter_builder import build_base_filters, build_cross_match

logger = logging.getLogger("licitaciones_router")

router = APIRouter(
    prefix="/api/licitaciones",
    tags=["licitaciones"],
    responses={404: {"description": "Not found"}}
)

@router.post("/", response_model=Licitacion)
async def create_licitacion(
    licitacion: LicitacionCreate,
    repo: LicitacionRepository = Depends(get_licitacion_repository)
):
    """Create a new licitacion"""
    # Auto-classify category if not provided
    if not licitacion.category:
        from services.category_classifier import get_category_classifier
        classifier = get_category_classifier()
        cat = classifier.classify(
            title=licitacion.title,
            description=licitacion.description or "",
        )
        if cat:
            licitacion.category = cat
    return await repo.create(licitacion)

@router.get("/", response_model=Dict[str, Any])
async def get_licitaciones(
    page: int = Query(1, ge=1),
    size: int = Query(15, ge=1, le=100),
    q: Optional[str] = Query(None, min_length=1, description="Search query (partial match)"),
    status: Optional[str] = None,
    organization: Optional[str] = None,
    location: Optional[str] = None,
    category: Optional[str] = None,
    fuente: Optional[str] = None,
    workflow_state: Optional[str] = None,
    jurisdiccion: Optional[str] = None,
    tipo_procedimiento: Optional[str] = None,
    nodo: Optional[str] = Query(None, description="Filter by nodo ID"),
    estado: Optional[str] = Query(None, description="Filter by estado: vigente | vencida | prorrogada | archivada"),
    budget_min: Optional[float] = Query(None, description="Minimum budget"),
    budget_max: Optional[float] = Query(None, description="Maximum budget"),
    fecha_desde: Optional[date] = Query(None, description="Filter from date (inclusive)"),
    fecha_hasta: Optional[date] = Query(None, description="Filter to date (inclusive)"),
    fecha_campo: str = Query("publication_date", description="Date field to filter on"),
    nuevas_desde: Optional[date] = Query(None, description="Filter by first_seen_at >= date (truly new items)"),
    year: Optional[str] = Query(None, description="Filter by publication year (e.g., '2026' or 'all')"),
    only_national: Optional[bool] = Query(False, description="Only show Argentina nacional sources (~11 sources)"),
    fuente_exclude: Optional[List[str]] = Query(None, description="Exclude these sources"),
    sort_by: str = Query("publication_date", description="Field to sort by"),
    sort_order: str = Query("desc", description="Sort order: asc or desc"),
    repo: LicitacionRepository = Depends(get_licitacion_repository)
):
    """Get all licitaciones with pagination, filtering and sorting.
    When q is provided, runs smart parsing first then hybrid search."""

    try:
        return await _get_licitaciones_impl(
            page, size, q, status, organization, location, category, fuente,
            workflow_state, jurisdiccion, tipo_procedimiento, nodo, estado,
            budget_min, budget_max, fecha_desde, fecha_hasta, fecha_campo,
            nuevas_desde, year, only_national, fuente_exclude, sort_by, sort_order, repo
        )
    except Exception as e:
        logger.error(f"GET /api/licitaciones/ failed: {type(e).__name__}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error interno: {type(e).__name__}: {str(e)[:200]}")


async def _get_licitaciones_impl(
    page, size, q, status, organization, location, category, fuente,
    workflow_state, jurisdiccion, tipo_procedimiento, nodo, estado,
    budget_min, budget_max, fecha_desde, fecha_hasta, fecha_campo,
    nuevas_desde, year, only_national, fuente_exclude, sort_by, sort_order, repo
):
    auto_filters = {}
    search_text = ""

    # If there's a search query, run smart parsing to extract structured filters
    if q:
        from services.smart_search_parser import parse_smart_query
        parsed = parse_smart_query(q)
        auto_filters = parsed.get("auto_filters", {})
        search_text = parsed.get("text", "")

        # Apply parsed structured filters as defaults (explicit params override)
        if not status and parsed.get("status"):
            status = parsed["status"]
        if not organization and parsed.get("organization"):
            organization = parsed["organization"]
        # Only apply auto-category when query was fully consumed (no remaining text).
        if not category and parsed.get("category") and not search_text:
            category = parsed["category"]
        if not fuente and parsed.get("fuente"):
            fuente = parsed["fuente"]
        if not jurisdiccion and parsed.get("jurisdiccion"):
            jurisdiccion = parsed["jurisdiccion"]
        if not budget_min and parsed.get("budget_min"):
            budget_min = parsed["budget_min"]
        if not budget_max and parsed.get("budget_max"):
            budget_max = parsed["budget_max"]
        if not fecha_desde and parsed.get("fecha_desde"):
            fecha_desde = date.fromisoformat(parsed["fecha_desde"])
        if not fecha_hasta and parsed.get("fecha_hasta"):
            fecha_hasta = date.fromisoformat(parsed["fecha_hasta"])

    # Build filters using shared function (no q — text search handled by repo.search)
    filters = build_base_filters(
        fuente=fuente, organization=organization, status=status, category=category,
        workflow_state=workflow_state, jurisdiccion=jurisdiccion,
        tipo_procedimiento=tipo_procedimiento, nodo=nodo, estado=estado,
        location=location, budget_min=budget_min, budget_max=budget_max,
        fecha_desde=fecha_desde, fecha_hasta=fecha_hasta, fecha_campo=fecha_campo,
        nuevas_desde=nuevas_desde, year=year,
        only_national=bool(only_national), fuente_exclude=fuente_exclude,
        q=q, auto_future_opening=(fecha_campo == "opening_date"),
    )

    order_val = 1 if sort_order == "asc" else -1
    skip = (page - 1) * size

    if q:
        effective_search = search_text or q
        items = await repo.search(effective_search, skip=skip, limit=size,
                                   sort_by=sort_by, sort_order=order_val,
                                   extra_filters=filters)
        total_items = await repo.search_count(effective_search, extra_filters=filters)
        response = {
            "items": items,
            "paginacion": {
                "pagina": page, "por_pagina": size,
                "total_items": total_items,
                "total_paginas": (total_items + size - 1) // size,
            }
        }
        if auto_filters:
            response["auto_filters"] = auto_filters
        return response

    # Non-search path
    nullable_sort_fields = ["opening_date", "fecha_scraping", "budget"]
    import asyncio as _asyncio
    items, total_items = await _asyncio.gather(
        repo.get_all(
            skip=skip, limit=size, filters=filters,
            sort_by=sort_by, sort_order=order_val,
            nulls_last=sort_by in nullable_sort_fields,
            projection=repo.LIST_PROJECTION
        ),
        repo.count(filters=filters)
    )

    return {
        "items": items,
        "paginacion": {
            "pagina": page, "por_pagina": size,
            "total_items": total_items,
            "total_paginas": (total_items + size - 1) // size,
        }
    }


@router.get("/vigentes", response_model=Dict[str, Any])
async def get_vigentes(
    page: int = Query(1, ge=1),
    size: int = Query(15, ge=1, le=100),
    jurisdiccion: Optional[str] = Query(None, description="Filter by jurisdiction"),
    only_national: Optional[bool] = Query(False, description="Only show Argentina nacional sources"),
    repo: LicitacionRepository = Depends(get_licitacion_repository)
):
    """
    Shortcut endpoint for vigent licitaciones (active today).

    Criteria:
    - estado = vigente OR prorrogada
    - opening_date >= today (or missing)
    - publication_date in [2024, 2027]

    Sort: opening_date ASC (nearest deadline first)
    """
    today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)

    filters = {
        "tags": {"$ne": "LIC_AR"},
        "estado": {"$in": ["vigente", "prorrogada"]},
        "publication_date": {
            "$gte": datetime(2024, 1, 1),
            "$lte": datetime(2027, 12, 31)
        },
        "$or": [
            {"opening_date": {"$gte": today}},
            {"opening_date": None}  # Missing opening_date
        ]
    }

    # Add jurisdiccion filtering
    if only_national:
        filters["tags"] = "LIC_AR"
    elif jurisdiccion:
        filters["jurisdiccion"] = jurisdiccion

    skip = (page - 1) * size

    # Sort by opening_date ASC (nearest deadline first), nulls last
    items = await repo.get_all(
        skip=skip,
        limit=size,
        filters=filters,
        sort_by="opening_date",
        sort_order=1,  # ASC
        nulls_last=True
    )
    total_items = await repo.count(filters=filters)

    return {
        "items": items,
        "paginacion": {
            "pagina": page,
            "por_pagina": size,
            "total_items": total_items,
            "total_paginas": (total_items + size - 1) // size
        }
    }


@router.get("/count")
async def count_licitaciones(
    status: Optional[str] = None,
    organization: Optional[str] = None,
    location: Optional[str] = None,
    category: Optional[str] = None,
    fuente: Optional[str] = None,
    repo: LicitacionRepository = Depends(get_licitacion_repository)
):
    """Count licitaciones with optional filtering"""
    filters = build_base_filters(
        status=status, organization=organization, location=location,
        category=category, fuente=fuente,
    )
    count = await repo.count(filters=filters)
    return {"count": count}

@router.get("/facets")
async def get_facets(
    q: Optional[str] = Query(None),
    status: Optional[str] = None,
    organization: Optional[str] = None,
    category: Optional[str] = None,
    fuente: Optional[str] = None,
    workflow_state: Optional[str] = None,
    jurisdiccion: Optional[str] = None,
    tipo_procedimiento: Optional[str] = None,
    nodo: Optional[str] = None,
    estado: Optional[str] = Query(None, description="Filter by estado: vigente | vencida | prorrogada | archivada"),
    location: Optional[str] = None,
    budget_min: Optional[float] = None,
    budget_max: Optional[float] = None,
    fecha_desde: Optional[date] = None,
    fecha_hasta: Optional[date] = None,
    fecha_campo: str = Query("publication_date"),
    nuevas_desde: Optional[date] = Query(None, description="Filter by first_seen_at >= date (truly new items)"),
    year: Optional[str] = Query(None, description="Filter by publication year (e.g., '2026' or 'all')"),
    only_national: Optional[bool] = Query(False, description="Only Argentina nacional sources (~11 sources)"),
    fuente_exclude: Optional[List[str]] = Query(None, description="Exclude these sources"),
    request: Request = None,
):
    """Return value counts for each filterable field, applying cross-filters.
    Each facet applies ALL filters except its own field."""
    try:
        db = request.app.mongodb
    except AttributeError:
        logger.error("request.app.mongodb not available - DB not initialized")
        return {f: [] for f in ["fuente", "status", "category", "workflow_state", "jurisdiccion", "tipo_procedimiento", "organization", "nodos", "estado"]}
    collection = db.licitaciones

    # Build base match using shared filter builder (identical to listing)
    base_match = build_base_filters(
        fuente=fuente, organization=organization, status=status, category=category,
        workflow_state=workflow_state, jurisdiccion=jurisdiccion,
        tipo_procedimiento=tipo_procedimiento, nodo=nodo, estado=estado,
        location=location, budget_min=budget_min, budget_max=budget_max,
        fecha_desde=fecha_desde, fecha_hasta=fecha_hasta, fecha_campo=fecha_campo,
        nuevas_desde=nuevas_desde, year=year,
        only_national=bool(only_national), fuente_exclude=fuente_exclude, q=q,
        auto_future_opening=(fecha_campo == "opening_date"),
    )

    # Facet fields to compute (including estado)
    facet_fields = {
        "fuente": "fuente",
        "status": "status",
        "category": "category",
        "workflow_state": "workflow_state",
        "jurisdiccion": "jurisdiccion",
        "tipo_procedimiento": "tipo_procedimiento",
        "organization": "organization",
        "estado": "estado",
    }

    import asyncio as _asyncio

    async def _compute_facet(facet_name: str, field: str) -> tuple:
        """Run a single facet aggregation and return (name, results)."""
        cross_match = build_cross_match(base_match, field)
        pipeline = [
            {"$match": cross_match} if cross_match else {"$match": {}},
            {"$group": {"_id": f"${field}", "count": {"$sum": 1}}},
            {"$match": {"_id": {"$ne": None}}},
            {"$sort": {"count": -1}},
            {"$limit": 50},
        ]
        try:
            docs = await collection.aggregate(pipeline).to_list(length=50)
            return facet_name, [{"value": d["_id"], "count": d["count"]} for d in docs]
        except Exception:
            return facet_name, []

    async def _compute_nodos_facet() -> tuple:
        """Compute nodos facet (needs $unwind for array field)."""
        try:
            nodos_cross = build_cross_match(base_match, "nodos")
            nodos_pipeline = [
                {"$match": nodos_cross} if nodos_cross else {"$match": {}},
                {"$unwind": "$nodos"},
                {"$group": {"_id": "$nodos", "count": {"$sum": 1}}},
                {"$match": {"_id": {"$ne": None}}},
                {"$sort": {"count": -1}},
                {"$limit": 50},
            ]
            nodos_docs = await collection.aggregate(nodos_pipeline).to_list(length=50)
            return "nodos", [{"value": d["_id"], "count": d["count"]} for d in nodos_docs]
        except Exception:
            return "nodos", []

    # Run all facet aggregations concurrently
    tasks = [_compute_facet(name, field) for name, field in facet_fields.items()]
    tasks.append(_compute_nodos_facet())
    facet_results = await _asyncio.gather(*tasks)

    return {name: data for name, data in facet_results}


@router.get("/debug-filters")
async def debug_filters(
    q: Optional[str] = Query(None),
    status: Optional[str] = None,
    organization: Optional[str] = None,
    location: Optional[str] = None,
    category: Optional[str] = None,
    fuente: Optional[str] = None,
    workflow_state: Optional[str] = None,
    jurisdiccion: Optional[str] = None,
    tipo_procedimiento: Optional[str] = None,
    nodo: Optional[str] = None,
    estado: Optional[str] = None,
    budget_min: Optional[float] = None,
    budget_max: Optional[float] = None,
    fecha_desde: Optional[date] = None,
    fecha_hasta: Optional[date] = None,
    fecha_campo: str = Query("publication_date"),
    nuevas_desde: Optional[date] = None,
    year: Optional[str] = None,
    only_national: Optional[bool] = Query(False),
    fuente_exclude: Optional[List[str]] = Query(None),
    request: Request = None,
):
    """Debug zero-results: show how many results appear when removing each filter."""
    db = request.app.mongodb
    collection = db.licitaciones

    # All params as a dict for easy per-dimension removal
    all_params = dict(
        fuente=fuente, organization=organization, status=status, category=category,
        workflow_state=workflow_state, jurisdiccion=jurisdiccion,
        tipo_procedimiento=tipo_procedimiento, nodo=nodo, estado=estado,
        location=location, budget_min=budget_min, budget_max=budget_max,
        fecha_desde=fecha_desde, fecha_hasta=fecha_hasta, fecha_campo=fecha_campo,
        nuevas_desde=nuevas_desde, year=year,
        only_national=bool(only_national), fuente_exclude=fuente_exclude, q=q,
        auto_future_opening=(fecha_campo == "opening_date"),
    )

    # Identify which filter dimensions are actually active
    active_keys = []
    for k, v in all_params.items():
        if k in ("fecha_campo",):
            continue  # not a real filter dimension
        if k == "only_national" and not v:
            continue
        if v is not None and v != "" and v != []:
            active_keys.append(k)

    if len(active_keys) < 2:
        return {"total_with_all": 0, "without_each": {}}

    all_match = build_base_filters(**all_params)
    total_all = await collection.count_documents(all_match)

    # Count removing each filter dimension
    without_each = {}
    for remove_key in active_keys:
        params_without = {**all_params, remove_key: None}
        if remove_key == "only_national":
            params_without[remove_key] = False
        if remove_key == "fecha_desde":
            params_without["fecha_hasta"] = None  # remove date range together
        if remove_key == "fecha_hasta":
            params_without["fecha_desde"] = None
        partial_match = build_base_filters(**params_without)
        without_each[remove_key] = await collection.count_documents(partial_match)

    return {"total_with_all": total_all, "without_each": without_each}
@router.get("/{licitacion_id}/related-sources")
async def get_related_sources(
    licitacion_id: str,
    request: Request = None,
):
    """Find licitaciones from OTHER sources that match this one (by proceso_id, expedient, or licitacion number)."""
    from services.cross_source_service import CrossSourceService
    db = request.app.mongodb
    cross_svc = CrossSourceService(db)
    related = await cross_svc.find_related_by_id(licitacion_id, limit=10)
    return {
        "licitacion_id": licitacion_id,
        "related_count": len(related),
        "related": [
            {
                "id": r["id"],
                "title": r.get("title", ""),
                "fuente": r.get("fuente", ""),
                "organization": r.get("organization", ""),
                "source_url": r.get("source_url"),
                "publication_date": r.get("publication_date"),
                "budget": r.get("budget"),
                "proceso_id": r.get("proceso_id"),
            }
            for r in related
        ],
    }


@router.post("/{licitacion_id}/merge-source")
async def merge_source(
    licitacion_id: str,
    body: Dict[str, Any] = Body(...),
    request: Request = None,
):
    """Merge data from a related item into this one. Requires related_id in body."""
    from services.cross_source_service import CrossSourceService
    related_id = body.get("related_id")
    if not related_id:
        raise HTTPException(status_code=400, detail="related_id is required")
    db = request.app.mongodb
    cross_svc = CrossSourceService(db)
    result = await cross_svc.merge_source_data(licitacion_id, related_id)
    if not result:
        raise HTTPException(status_code=404, detail="Item not found")
    return result


@router.post("/{licitacion_id}/toggle-public")
async def toggle_public(
    licitacion_id: str,
    repo: LicitacionRepository = Depends(get_licitacion_repository),
):
    """Toggle public visibility of a licitacion (requires auth)."""
    import re as _re
    import hashlib
    from unicodedata import normalize, category as ucat

    def _make_slug(title: str, id_str: str) -> str:
        nfkd = normalize("NFKD", title.lower())
        ascii_text = "".join(c for c in nfkd if ucat(c) != "Mn")
        slug = _re.sub(r"[^a-z0-9\s]", "", ascii_text)
        slug = _re.sub(r"\s+", "-", slug.strip())
        slug = slug[:60].rstrip("-")
        short_hash = hashlib.md5(id_str.encode()).hexdigest()[:6]
        return f"{slug}-{short_hash}"

    lic = await repo.get_by_id(licitacion_id)
    if not lic:
        raise HTTPException(status_code=404, detail="Licitación no encontrada")

    currently_public = lic.get("is_public", False) if isinstance(lic, dict) else getattr(lic, "is_public", False)
    new_public = not currently_public

    update_data = {"is_public": new_public}
    if new_public:
        title = lic.get("title", "") if isinstance(lic, dict) else getattr(lic, "title", "")
        lid = lic.get("id", licitacion_id) if isinstance(lic, dict) else getattr(lic, "id", licitacion_id)
        update_data["public_slug"] = _make_slug(title, str(lid))

    update = LicitacionUpdate(**update_data)
    updated = await repo.update(licitacion_id, update)

    slug = None
    if updated:
        slug = updated.get("public_slug") if isinstance(updated, dict) else getattr(updated, "public_slug", None)

    return {
        "id": licitacion_id,
        "is_public": new_public,
        "public_slug": slug,
    }


@router.get("/{licitacion_id}", response_model=Licitacion)
async def get_licitacion(
    licitacion_id: str,
    repo: LicitacionRepository = Depends(get_licitacion_repository)
):
    """Get a licitacion by id"""
    licitacion = await repo.get_by_id(licitacion_id)
    if not licitacion:
        raise HTTPException(status_code=404, detail="Licitación not found")
    return licitacion

@router.put("/{licitacion_id}", response_model=Licitacion)
async def update_licitacion(
    licitacion_id: str,
    licitacion: LicitacionUpdate,
    repo: LicitacionRepository = Depends(get_licitacion_repository)
):
    """Update a licitacion"""
    updated_licitacion = await repo.update(licitacion_id, licitacion)
    if not updated_licitacion:
        raise HTTPException(status_code=404, detail="Licitación not found")
    return updated_licitacion

@router.delete("/{licitacion_id}")
async def delete_licitacion(
    licitacion_id: str,
    repo: LicitacionRepository = Depends(get_licitacion_repository)
):
    """Delete a licitacion"""
    deleted = await repo.delete(licitacion_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Licitación not found")
    return {"message": "Licitación deleted successfully"}


@router.put("/{licitacion_id}/estado")
async def update_estado(
    licitacion_id: str,
    estado: str = Body(..., description="vigente | vencida | prorrogada | archivada", embed=True),
    reason: Optional[str] = Body(None, description="Reason for manual change", embed=True),
    repo: LicitacionRepository = Depends(get_licitacion_repository)
):
    """
    Manually update estado for a licitacion (admin only).

    This endpoint allows admins to override the automatic estado computation
    when the automatic calculation is incorrect or needs manual adjustment.
    """
    # Validate estado value
    valid_estados = ["vigente", "vencida", "prorrogada", "archivada"]
    if estado not in valid_estados:
        raise HTTPException(400, f"Invalid estado value. Must be one of: {', '.join(valid_estados)}")

    # Fetch current licitacion
    item = await repo.get_by_id(licitacion_id)
    if not item:
        raise HTTPException(404, "Licitacion not found")

    # Build update document
    from datetime import datetime
    old_estado = item.get("estado", "vigente")

    # Update estado + add to history
    await repo.collection.update_one(
        {"_id": ObjectId(licitacion_id)},
        {
            "$set": {
                "estado": estado,
                "updated_at": datetime.utcnow()
            },
            "$push": {
                "metadata.estado_history": {
                    "old_estado": old_estado,
                    "new_estado": estado,
                    "changed_at": datetime.utcnow(),
                    "reason": reason or "Manual override via admin API",
                    "method": "admin_api"
                }
            }
        }
    )

    logger.info(f"Estado manually updated for {licitacion_id}: {old_estado} → {estado} (reason: {reason})")

    return {
        "success": True,
        "licitacion_id": licitacion_id,
        "old_estado": old_estado,
        "new_estado": estado
    }


@router.get("/{licitacion_id}/estado-history")
async def get_estado_history(
    licitacion_id: str,
    repo: LicitacionRepository = Depends(get_licitacion_repository)
):
    """
    Get estado change history for a licitacion.

    Returns the full history of estado transitions, including automatic
    and manual changes, with timestamps and reasons.
    """
    item = await repo.get_by_id(licitacion_id)
    if not item:
        raise HTTPException(404, "Licitacion not found")

    metadata = item.get("metadata", {})
    history = metadata.get("estado_history", [])

    return {
        "licitacion_id": licitacion_id,
        "current_estado": item.get("estado", "vigente"),
        "history": history,
        "history_count": len(history)
    }


@router.get("/distinct/{field_name}", response_model=List[str])
async def get_distinct_values(
    field_name: str,
    only_national: Optional[bool] = Query(False, description="Only show Argentina nacional sources"),
    repo: LicitacionRepository = Depends(get_licitacion_repository)
):
    """Get distinct values for a given field"""
    # Validate field_name to prevent arbitrary field access if necessary
    allowed_fields = ["organization", "location", "category", "fuente", "status", "workflow_state", "jurisdiccion", "tipo_procedimiento"]
    if field_name not in allowed_fields:
        raise HTTPException(status_code=400, detail=f"Filtering by field '{field_name}' is not allowed.")

    distinct_values = await repo.get_distinct(field_name, only_national=only_national)
    return distinct_values


@router.get("/rubros/list")
async def get_rubros_list(
    only_national: Optional[bool] = Query(False, description="Only show Argentina nacional sources"),
    request: Request = None
):
    """Get list of all COMPR.AR rubros (categories) for filtering"""
    from services.category_classifier import get_category_classifier

    # If only_national is set, filter rubros to only those with Argentina items
    if only_national:
        db = request.app.mongodb
        collection = db.licitaciones

        # Get distinct categories from Argentina items only
        pipeline = [
            {"$match": {"tags": "LIC_AR"}},
            {"$group": {"_id": "$category"}},
            {"$match": {"_id": {"$ne": None}}},
            {"$sort": {"_id": 1}}
        ]
        result = await collection.aggregate(pipeline).to_list(length=100)
        argentina_categories = [doc["_id"] for doc in result]

        # Filter classifier rubros to only those present in Argentina items
        classifier = get_category_classifier()
        all_rubros = classifier.get_all_rubros()
        filtered_rubros = [r for r in all_rubros if r.get("nombre") in argentina_categories]

        return {
            "rubros": filtered_rubros,
            "total": len(filtered_rubros)
        }
    else:
        classifier = get_category_classifier()
        return {
            "rubros": classifier.get_all_rubros(),
            "total": len(classifier.rubros)
        }


@router.get("/{licitacion_id}/redirect")
async def redirect_to_canonical_url(
    licitacion_id: str,
    repo: LicitacionRepository = Depends(get_licitacion_repository)
):
    """Redirect to the canonical URL for a licitacion"""
    from fastapi.responses import RedirectResponse
    
    licitacion = await repo.get_by_id(licitacion_id)
    if not licitacion:
        raise HTTPException(status_code=404, detail="Licitación not found")
    
    # Get canonical URL
    url = None
    if licitacion.canonical_url:
        url = str(licitacion.canonical_url)
    elif licitacion.source_url:
        url = str(licitacion.source_url)
    
    if not url:
        raise HTTPException(status_code=404, detail="No URL available for this licitación")
    
    return RedirectResponse(url=url)


@router.get("/{licitacion_id}/urls")
async def get_licitacion_urls(
    licitacion_id: str,
    repo: LicitacionRepository = Depends(get_licitacion_repository)
):
    """Get all available URLs for a licitacion"""
    licitacion = await repo.get_by_id(licitacion_id)
    if not licitacion:
        raise HTTPException(status_code=404, detail="Licitación not found")
    
    return {
        "id_licitacion": licitacion.id_licitacion,
        "canonical_url": licitacion.canonical_url,
        "url_quality": licitacion.url_quality,
        "source_urls": licitacion.source_urls or {},
        "source_url": licitacion.source_url,
    }


