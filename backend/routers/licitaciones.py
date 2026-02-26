from fastapi import APIRouter, Depends, HTTPException, Query, Body, Request
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

    # If there's a search query, run smart parsing then hybrid search
    if q:
        from services.smart_search_parser import parse_smart_query
        parsed = parse_smart_query(q)
        auto_filters = parsed.get("auto_filters", {})

        # Apply parsed structured filters as defaults (explicit params override)
        if not status and parsed.get("status"):
            status = parsed["status"]
        if not organization and parsed.get("organization"):
            organization = parsed["organization"]
        if not category and parsed.get("category"):
            category = parsed["category"]
        if not fuente and parsed.get("fuente"):
            # Fuente from smart parser is a partial name; use regex match
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

        # Use remaining text as actual search query
        search_text = parsed.get("text", "")

        skip = (page - 1) * size
        order_val = 1 if sort_order == "asc" else -1

        # Build additional filters
        extra_filters = {}
        # Exclude LIC_AR items ONLY when not requesting national sources
        # (Argentina page needs LIC_AR tagged items, Mendoza page excludes them)
        if not only_national:
            extra_filters["tags"] = {"$ne": "LIC_AR"}
        if status: extra_filters["status"] = status
        if organization: extra_filters["organization"] = {"$regex": re.escape(organization), "$options": "i"}
        if category: extra_filters["category"] = category
        if fuente: extra_filters["fuente"] = {"$regex": re.escape(fuente), "$options": "i"}
        if workflow_state: extra_filters["workflow_state"] = workflow_state
        if jurisdiccion: extra_filters["jurisdiccion"] = jurisdiccion
        if tipo_procedimiento: extra_filters["tipo_procedimiento"] = tipo_procedimiento
        if nodo: extra_filters["nodos"] = nodo
        if estado:
            # "vigente" is the default, so include docs where field is absent
            if estado == "vigente":
                extra_filters["$or"] = [{"estado": "vigente"}, {"estado": {"$exists": False}}]
            else:
                extra_filters["estado"] = estado

        # National/source exclusion filters
        if only_national:
            extra_filters["jurisdiccion"] = "Argentina"
        if fuente_exclude:
            extra_filters["fuente"] = {"$nin": fuente_exclude}

        # Budget range
        if budget_min is not None or budget_max is not None:
            budget_filter = {}
            if budget_min is not None: budget_filter["$gte"] = budget_min
            if budget_max is not None: budget_filter["$lte"] = budget_max
            extra_filters["budget"] = budget_filter

        # Date range
        if fecha_desde or fecha_hasta:
            date_filter = {}
            if fecha_desde: date_filter["$gte"] = datetime.combine(fecha_desde, datetime.min.time())
            if fecha_hasta: date_filter["$lte"] = datetime.combine(fecha_hasta, datetime.max.time())
            if date_filter:
                field = fecha_campo if fecha_campo in ["publication_date", "opening_date", "created_at", "fecha_scraping"] else "publication_date"
                extra_filters[field] = date_filter

        if search_text:
            items = await repo.search(search_text, skip=skip, limit=size,
                                       sort_by=sort_by, sort_order=order_val,
                                       extra_filters=extra_filters)
            total_items = await repo.search_count(search_text, extra_filters=extra_filters)
        else:
            # Smart query consumed all text into filters — no text search needed
            items = await repo.get_all(skip=skip, limit=size, filters=extra_filters,
                                        sort_by=sort_by, sort_order=order_val,
                                        nulls_last=sort_by in ["opening_date", "fecha_scraping", "budget"])
            total_items = await repo.count(filters=extra_filters)

        response = {
            "items": items,
            "paginacion": {
                "pagina": page,
                "por_pagina": size,
                "total_items": total_items,
                "total_paginas": (total_items + size - 1) // size
            }
        }
        if auto_filters:
            response["auto_filters"] = auto_filters
        return response

    # Build filter query
    filters = {}
    # Exclude LIC_AR items ONLY when not requesting national sources
    # (Argentina page needs LIC_AR tagged items, Mendoza page excludes them)
    if not only_national:
        filters["tags"] = {"$ne": "LIC_AR"}
    if status:
        filters["status"] = status
    if organization:
        filters["organization"] = {"$regex": re.escape(organization), "$options": "i"}
    if location:
        filters["location"] = location
    if category:
        filters["category"] = category
    if fuente:
        filters["fuente"] = {"$regex": re.escape(fuente), "$options": "i"}
    if workflow_state:
        filters["workflow_state"] = workflow_state
    if jurisdiccion:
        filters["jurisdiccion"] = jurisdiccion
    if tipo_procedimiento:
        filters["tipo_procedimiento"] = tipo_procedimiento
    if nodo:
        filters["nodos"] = nodo
    if estado:
        if estado == "vigente":
            filters["$or"] = [{"estado": "vigente"}, {"estado": {"$exists": False}}]
        else:
            filters["estado"] = estado

    # National/source exclusion filters (applied to both search and non-search paths)
    if only_national:
        filters["jurisdiccion"] = "Argentina"
    if fuente_exclude:
        filters["fuente"] = {"$nin": fuente_exclude}

    # Budget range filter
    if budget_min is not None or budget_max is not None:
        budget_filter = {}
        if budget_min is not None:
            budget_filter["$gte"] = budget_min
        if budget_max is not None:
            budget_filter["$lte"] = budget_max
        filters["budget"] = budget_filter

    # Date range filter
    allowed_date_fields = ["publication_date", "opening_date", "expiration_date",
                           "fecha_publicacion_portal", "fecha_inicio_consultas", "fecha_fin_consultas",
                           "created_at", "fecha_scraping", "first_seen_at"]
    if fecha_campo not in allowed_date_fields:
        fecha_campo = "publication_date"

    # When filtering by opening_date, enforce fecha_desde >= today
    # (aperturas view should never show past opening dates)
    today = date.today()
    if fecha_campo == "opening_date":
        if not fecha_desde or fecha_desde < today:
            fecha_desde = today

    if fecha_desde or fecha_hasta:
        date_filter = {}
        if fecha_desde:
            date_filter["$gte"] = datetime.combine(fecha_desde, datetime.min.time())
        if fecha_hasta:
            date_filter["$lte"] = datetime.combine(fecha_hasta, datetime.max.time())
        if date_filter:
            filters[fecha_campo] = date_filter

    # Year archival filter (enforces publication_date within year range)
    if year and year != "all":
        try:
            year_num = int(year)
            year_start = datetime(year_num, 1, 1)
            year_end = datetime(year_num, 12, 31, 23, 59, 59)
            # Use publication_date for year filtering (not fecha_scraping)
            if "publication_date" in filters:
                # Merge with existing date filter
                existing = filters["publication_date"]
                filters["publication_date"] = {
                    "$gte": max(existing.get("$gte", year_start), year_start),
                    "$lte": min(existing.get("$lte", year_end), year_end)
                }
            else:
                filters["publication_date"] = {
                    "$gte": year_start,
                    "$lte": year_end
                }
        except (ValueError, TypeError):
            pass  # Invalid year format, ignore

    # "Nuevas desde" filter (first_seen_at >= date) - for "Nuevas de hoy" button
    if nuevas_desde:
        filters["first_seen_at"] = {"$gte": datetime.combine(nuevas_desde, datetime.min.time())}


    # Handle sort order
    order_val = 1 if sort_order == "asc" else -1

    # Calculate skip
    skip = (page - 1) * size

    # For nullable date fields, use aggregation to push nulls to end
    nullable_sort_fields = ["opening_date", "fecha_scraping", "budget"]
    use_nulls_last = sort_by in nullable_sort_fields

    # Get data and count in parallel, using list projection to reduce payload size
    import asyncio as _asyncio
    items, total_items = await _asyncio.gather(
        repo.get_all(
            skip=skip, limit=size, filters=filters,
            sort_by=sort_by, sort_order=order_val,
            nulls_last=use_nulls_last,
            projection=repo.LIST_PROJECTION
        ),
        repo.count(filters=filters)
    )
    
    return {
        "items": items,
        "paginacion": {
            "pagina": page,
            "por_pagina": size,
            "total_items": total_items,
            "total_paginas": (total_items + size - 1) // size
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
        # Include docs with estado field absent (default = vigente)
        "$and": [
            {"$or": [
                {"estado": {"$in": ["vigente", "prorrogada"]}},
                {"estado": {"$exists": False}}
            ]},
            {"$or": [
                {"opening_date": {"$gte": today}},
                {"opening_date": None}  # Missing opening_date
            ]}
        ],
        "publication_date": {
            "$gte": datetime(2024, 1, 1),
            "$lte": datetime(2027, 12, 31)
        },
    }

    # Add jurisdiccion filtering
    if only_national:
        filters["jurisdiccion"] = "Argentina"
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

@router.get("/count")
async def count_licitaciones(
    status: Optional[str] = None,
    organization: Optional[str] = None,
    location: Optional[str] = None,
    category: Optional[str] = None,
    fuente: Optional[str] = None, # Added fuente filter
    repo: LicitacionRepository = Depends(get_licitacion_repository)
):
    """Count licitaciones with optional filtering"""
    
    # Build filter query
    filters = {}
    if status:
        filters["status"] = status
    if organization:
        filters["organization"] = organization
    if location:
        filters["location"] = location
    if category:
        filters["category"] = category
    if fuente: # Added fuente to filters
        filters["fuente"] = fuente
    
    count = await repo.count(filters=filters)
    return {"count": count}

@router.get("/search/smart")
async def smart_search(
    q: str = Query(..., min_length=1),
):
    """Parse a natural language query into structured filters.
    Returns the parsed filters that the frontend can apply."""
    from services.smart_search_parser import parse_smart_query
    parsed = parse_smart_query(q)
    return {"query": q, "parsed_filters": parsed}


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
    budget_min: Optional[float] = None,
    budget_max: Optional[float] = None,
    fecha_desde: Optional[date] = None,
    fecha_hasta: Optional[date] = None,
    fecha_campo: str = Query("publication_date"),
    nuevas_desde: Optional[date] = Query(None, description="Filter by first_seen_at >= date (truly new items)"),
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
        return {"fuente": [], "status": [], "category": [], "workflow_state": [], "jurisdiccion": [], "tipo_procedimiento": [], "organization": [], "nodos": []}
    collection = db.licitaciones

    # Build base match from all explicit filters
    base_match: Dict[str, Any] = {}
    # Exclude LIC_AR items from main feed facets
    base_match["tags"] = {"$ne": "LIC_AR"}
    if status: base_match["status"] = status
    if organization: base_match["organization"] = {"$regex": re.escape(organization), "$options": "i"}
    if category: base_match["category"] = category
    if fuente: base_match["fuente"] = {"$regex": re.escape(fuente), "$options": "i"}
    if workflow_state: base_match["workflow_state"] = workflow_state
    if jurisdiccion: base_match["jurisdiccion"] = jurisdiccion
    if tipo_procedimiento: base_match["tipo_procedimiento"] = tipo_procedimiento
    if nodo: base_match["nodos"] = nodo
    if budget_min is not None or budget_max is not None:
        bf = {}
        if budget_min is not None: bf["$gte"] = budget_min
        if budget_max is not None: bf["$lte"] = budget_max
        base_match["budget"] = bf

    allowed_date_fields = ["publication_date", "opening_date", "created_at", "fecha_scraping"]
    fc = fecha_campo if fecha_campo in allowed_date_fields else "publication_date"
    if fecha_desde or fecha_hasta:
        df = {}
        if fecha_desde: df["$gte"] = datetime.combine(fecha_desde, datetime.min.time())
        if fecha_hasta: df["$lte"] = datetime.combine(fecha_hasta, datetime.max.time())
        if df: base_match[fc] = df

    # Filter by first_seen_at for "Nuevas de hoy" functionality
    if nuevas_desde:
        base_match["first_seen_at"] = {"$gte": datetime.combine(nuevas_desde, datetime.min.time())}

    # National/source exclusion filters
    if only_national:
        base_match["jurisdiccion"] = "Argentina"
    if fuente_exclude:
        base_match["fuente"] = {"$nin": fuente_exclude}

    # Text search adds $text match
    if q:
        base_match["$text"] = {"$search": q}

    # Facet fields to compute
    facet_fields = {
        "fuente": "fuente",
        "status": "status",
        "category": "category",
        "workflow_state": "workflow_state",
        "jurisdiccion": "jurisdiccion",
        "tipo_procedimiento": "tipo_procedimiento",
        "organization": "organization",
    }

    import asyncio as _asyncio

    async def _compute_facet(facet_name: str, field: str) -> tuple:
        """Run a single facet aggregation and return (name, results)."""
        cross_match = {k: v for k, v in base_match.items() if k != field}
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
            nodos_cross = {k: v for k, v in base_match.items() if k != "nodos"}
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

    # Run all facet aggregations concurrently instead of sequentially
    tasks = [_compute_facet(name, field) for name, field in facet_fields.items()]
    tasks.append(_compute_nodos_facet())
    facet_results = await _asyncio.gather(*tasks)

    result = {name: data for name, data in facet_results}
    return result


@router.get("/debug-filters")
async def debug_filters(
    q: Optional[str] = Query(None),
    status: Optional[str] = None,
    organization: Optional[str] = None,
    category: Optional[str] = None,
    fuente: Optional[str] = None,
    workflow_state: Optional[str] = None,
    jurisdiccion: Optional[str] = None,
    tipo_procedimiento: Optional[str] = None,
    budget_min: Optional[float] = None,
    budget_max: Optional[float] = None,
    fecha_desde: Optional[date] = None,
    fecha_hasta: Optional[date] = None,
    fecha_campo: str = Query("publication_date"),
    request: Request = None,
):
    """Debug zero-results: show how many results appear when removing each filter."""
    db = request.app.mongodb
    collection = db.licitaciones

    # Build all active filters as a dict of {filter_key: match_condition}
    active_filters: Dict[str, Dict] = {}
    if q: active_filters["q"] = {"$text": {"$search": q}}
    if status: active_filters["status"] = {"status": status}
    if organization: active_filters["organization"] = {"organization": {"$regex": re.escape(organization), "$options": "i"}}
    if category: active_filters["category"] = {"category": category}
    if fuente: active_filters["fuente"] = {"fuente": fuente}
    if workflow_state: active_filters["workflow_state"] = {"workflow_state": workflow_state}
    if jurisdiccion: active_filters["jurisdiccion"] = {"jurisdiccion": jurisdiccion}
    if tipo_procedimiento: active_filters["tipo_procedimiento"] = {"tipo_procedimiento": tipo_procedimiento}
    if budget_min is not None or budget_max is not None:
        bf = {}
        if budget_min is not None: bf["$gte"] = budget_min
        if budget_max is not None: bf["$lte"] = budget_max
        active_filters["budget"] = {"budget": bf}

    allowed_date_fields = ["publication_date", "opening_date", "created_at", "fecha_scraping"]
    fc = fecha_campo if fecha_campo in allowed_date_fields else "publication_date"
    if fecha_desde or fecha_hasta:
        df = {}
        if fecha_desde: df["$gte"] = datetime.combine(fecha_desde, datetime.min.time())
        if fecha_hasta: df["$lte"] = datetime.combine(fecha_hasta, datetime.max.time())
        if df: active_filters["fecha"] = {fc: df}

    if len(active_filters) < 2:
        return {"total_with_all": 0, "without_each": {}}

    # Total with all filters
    all_match = {}
    for cond in active_filters.values():
        all_match.update(cond)
    total_all = await collection.count_documents(all_match)

    # Count removing each filter
    without_each = {}
    for remove_key in active_filters:
        partial_match = {}
        for k, cond in active_filters.items():
            if k != remove_key:
                partial_match.update(cond)
        if partial_match:
            without_each[remove_key] = await collection.count_documents(partial_match)
        else:
            without_each[remove_key] = await collection.count_documents({})

    return {"total_with_all": total_all, "without_each": without_each}


@router.get("/presets")
async def list_presets(request: Request):
    """List all saved filter presets."""
    db = request.app.mongodb
    cursor = db.filter_presets.find().sort("created_at", -1)
    docs = await cursor.to_list(length=20)
    presets = []
    for doc in docs:
        doc["_id"] = str(doc["_id"])
        presets.append(doc)
    return presets


@router.post("/presets")
async def create_preset(body: Dict[str, Any] = Body(...), request: Request = None):
    """Create a saved filter preset. Max 10."""
    db = request.app.mongodb
    count = await db.filter_presets.count_documents({})
    if count >= 10:
        raise HTTPException(status_code=400, detail="Maximo 10 presets permitidos")

    doc = {
        "name": body.get("name", "Sin nombre"),
        "filters": body.get("filters", {}),
        "sort_by": body.get("sort_by", "publication_date"),
        "sort_order": body.get("sort_order", "desc"),
        "is_default": body.get("is_default", False),
        "created_at": datetime.utcnow(),
    }
    result = await db.filter_presets.insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc


@router.delete("/presets/{preset_id}")
async def delete_preset(preset_id: str, request: Request = None):
    """Delete a saved filter preset."""
    db = request.app.mongodb
    try:
        oid = ObjectId(preset_id)
    except Exception:
        raise HTTPException(status_code=400, detail="ID invalido")
    result = await db.filter_presets.delete_one({"_id": oid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Preset no encontrado")
    return {"ok": True}


@router.get("/favorites")
async def get_favorites(
    request: Request,
    full: bool = Query(False, description="Return full licitacion data (for CotiZar)"),
):
    """Get favorite licitaciones. With full=true returns complete data for CotiZar."""
    db = request.app.mongodb
    cursor = db.favorites.find({}, {"licitacion_id": 1, "_id": 0})
    docs = await cursor.to_list(length=5000)
    ids = [doc["licitacion_id"] for doc in docs]

    if not full:
        return ids

    # Full mode: return complete licitacion data (consumed by CotiZar container)
    # Favorites store MongoDB _id as string (from frontend lic.id)
    if not ids:
        return []
    from db.models import licitacion_entity, str_to_mongo_id
    mongo_ids = [str_to_mongo_id(id_str) for id_str in ids]
    licitaciones = await db.licitaciones.find(
        {"_id": {"$in": mongo_ids}}
    ).to_list(length=5000)
    return [licitacion_entity(lic) for lic in licitaciones]


@router.get("/sync")
async def sync_for_cotizar(request: Request):
    """Sync endpoint for CotiZar: returns favorites with full data + total count."""
    db = request.app.mongodb
    from db.models import licitacion_entity, str_to_mongo_id

    # Get favorite IDs
    cursor = db.favorites.find({}, {"licitacion_id": 1, "_id": 0})
    docs = await cursor.to_list(length=5000)
    ids = [doc["licitacion_id"] for doc in docs]

    # Fetch full licitacion data for favorites
    licitaciones = []
    if ids:
        mongo_ids = [str_to_mongo_id(id_str) for id_str in ids]
        licitaciones_docs = await db.licitaciones.find(
            {"_id": {"$in": mongo_ids}}
        ).to_list(length=5000)
        licitaciones = [licitacion_entity(lic) for lic in licitaciones_docs]

    # Total licitaciones in the system
    total = await db.licitaciones.count_documents({})

    return {
        "favorites": licitaciones,
        "favorites_count": len(licitaciones),
        "total_licitaciones": total,
    }


@router.post("/favorites/{licitacion_id}")
async def add_favorite(licitacion_id: str, request: Request):
    """Add a licitacion to favorites"""
    db = request.app.mongodb
    await db.favorites.update_one(
        {"licitacion_id": licitacion_id},
        {"$set": {"licitacion_id": licitacion_id, "created_at": datetime.utcnow()}},
        upsert=True,
    )
    return {"ok": True, "licitacion_id": licitacion_id}


@router.delete("/favorites/{licitacion_id}")
async def remove_favorite(licitacion_id: str, request: Request):
    """Remove a licitacion from favorites"""
    db = request.app.mongodb
    await db.favorites.delete_one({"licitacion_id": licitacion_id})
    return {"ok": True, "licitacion_id": licitacion_id}


@router.get("/stats/daily-counts")
async def get_daily_counts(
    days: int = Query(14, ge=1, le=30),
    fecha_campo: str = Query("publication_date"),
    only_national: Optional[bool] = Query(False, description="Only Argentina nacional sources (~11 sources)"),
    jurisdiccion: Optional[str] = Query(None, description="Filter by jurisdiccion"),
    request: Request = None,
):
    """Get count of licitaciones per day for the last N days"""
    from datetime import timedelta

    allowed_date_fields = ["publication_date", "opening_date", "expiration_date",
                           "fecha_publicacion_portal", "fecha_inicio_consultas", "fecha_fin_consultas",
                           "created_at", "fecha_scraping", "first_seen_at"]
    if fecha_campo not in allowed_date_fields:
        fecha_campo = "publication_date"

    db = request.app.mongodb
    collection = db.licitaciones

    start_date = datetime.combine(date.today() - timedelta(days=days - 1), datetime.min.time())

    # Build match stage with jurisdiction/source filtering
    match_stage: dict = {fecha_campo: {"$gte": start_date}}
    if only_national:
        match_stage["jurisdiccion"] = "Argentina"
    else:
        match_stage["tags"] = {"$ne": "LIC_AR"}
        if jurisdiccion:
            match_stage["jurisdiccion"] = jurisdiccion

    pipeline = [
        {"$match": match_stage},
        {"$group": {
            "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": f"${fecha_campo}"}},
            "count": {"$sum": 1}
        }},
        {"$sort": {"_id": 1}}
    ]

    results = await collection.aggregate(pipeline).to_list(length=days + 1)
    counts = {r["_id"]: r["count"] for r in results}

    return {
        "days": days,
        "fecha_campo": fecha_campo,
        "counts": counts,
    }


@router.get("/stats/data-quality")
async def get_data_quality_stats(
    only_national: Optional[bool] = Query(False, description="Only Argentina nacional sources (~11 sources)"),
    jurisdiccion: Optional[str] = Query(None, description="Filter by jurisdiccion"),
    request: Request = None
):
    """Get data quality statistics: completeness by source, opening_date coverage, duplicates"""
    db = request.app.mongodb
    collection = db.licitaciones

    # Build match filter for jurisdiction/source
    base_match = {}
    if only_national:
        base_match["jurisdiccion"] = "Argentina"
    elif jurisdiccion:
        base_match["jurisdiccion"] = jurisdiccion

    # Records by source
    pipeline_stages = []
    if base_match:
        pipeline_stages.append({"$match": base_match})

    pipeline_stages.extend([
        {"$group": {
            "_id": "$fuente",
            "total": {"$sum": 1},
            "with_opening_date": {
                "$sum": {"$cond": [{"$ifNull": ["$opening_date", False]}, 1, 0]}
            },
            "with_description": {
                "$sum": {"$cond": [{"$and": [
                    {"$ne": ["$description", None]},
                    {"$ne": ["$description", ""]}
                ]}, 1, 0]}
            },
            "with_budget": {
                "$sum": {"$cond": [{"$ifNull": ["$budget", False]}, 1, 0]}
            },
            "with_content_hash": {
                "$sum": {"$cond": [{"$ifNull": ["$content_hash", False]}, 1, 0]}
            },
            "decretos": {
                "$sum": {"$cond": [{"$eq": ["$tipo", "decreto"]}, 1, 0]}
            },
        }},
        {"$sort": {"total": -1}}
    ])

    by_source = await collection.aggregate(pipeline_stages).to_list(length=50)

    total = sum(r["total"] for r in by_source)
    total_with_opening = sum(r["with_opening_date"] for r in by_source)

    # Potential duplicates: same content_hash appearing more than once
    dup_hashes = await collection.aggregate([
        {"$match": {"content_hash": {"$ne": None}}},
        {"$group": {"_id": "$content_hash", "count": {"$sum": 1}}},
        {"$match": {"count": {"$gt": 1}}},
        {"$count": "duplicate_groups"}
    ]).to_list(length=1)
    duplicate_groups = dup_hashes[0]["duplicate_groups"] if dup_hashes else 0

    sources = []
    for r in by_source:
        t = r["total"]
        sources.append({
            "fuente": r["_id"] or "Desconocida",
            "total": t,
            "with_opening_date": r["with_opening_date"],
            "opening_date_pct": round(r["with_opening_date"] / t * 100, 1) if t else 0,
            "with_description": r["with_description"],
            "with_budget": r["with_budget"],
            "decretos": r["decretos"],
        })

    return {
        "total_records": total,
        "total_with_opening_date": total_with_opening,
        "opening_date_pct": round(total_with_opening / total * 100, 1) if total else 0,
        "duplicate_groups": duplicate_groups,
        "by_source": sources,
    }


@router.get("/stats/url-quality")
async def get_url_quality_stats(
    request: Request
):
    """Get statistics about URL quality across all licitaciones"""
    db = request.app.mongodb
    collection = db.licitaciones

    pipeline = [
        {"$group": {"_id": "$url_quality", "count": {"$sum": 1}}}
    ]

    results = await collection.aggregate(pipeline).to_list(length=10)
    total = sum(r["count"] for r in results)

    return {
        "total": total,
        "by_quality": {r["_id"] or "unknown": r["count"] for r in results},
        "percentages": {
            r["_id"] or "unknown": round(r["count"] / total * 100, 2) if total > 0 else 0
            for r in results
        }
    }


@router.get("/stats/recent-activity")
async def get_recent_activity(
    hours: int = Query(24, ge=1, le=168),
    request: Request = None,
):
    """Get recent scraping activity: new licitaciones grouped by source"""
    from datetime import timedelta

    db = request.app.mongodb
    collection = db.licitaciones

    since = datetime.utcnow() - timedelta(hours=hours)

    pipeline = [
        {"$match": {"first_seen_at": {"$gte": since}}},
        {"$sort": {"first_seen_at": -1}},
        {"$group": {
            "_id": "$fuente",
            "count": {"$sum": 1},
            "latest": {"$first": "$first_seen_at"},
            "sample_titles": {"$push": "$title"},
        }},
        {"$sort": {"count": -1}}
    ]

    results = await collection.aggregate(pipeline).to_list(length=50)
    total_new = sum(r["count"] for r in results)

    by_source = []
    for r in results:
        by_source.append({
            "fuente": r["_id"] or "Desconocida",
            "count": r["count"],
            "latest": r["latest"].isoformat() if r["latest"] else None,
            "sample_titles": r["sample_titles"][:3],
        })

    return {
        "hours": hours,
        "total_new": total_new,
        "by_source": by_source,
    }


@router.get("/stats/scraping-activity")
async def get_scraping_activity(
    request: Request,
    hours: int = 24,
    only_national: Optional[bool] = Query(False, description="Only Argentina nacional sources"),
    fuente_exclude: Optional[List[str]] = Query(None, description="Exclude these sources"),
):
    """Get categorized scraping activity: truly new, re-indexed, and updated items"""
    from datetime import timedelta

    db = request.app.mongodb
    collection = db.licitaciones

    since = datetime.utcnow() - timedelta(hours=hours)

    # Build jurisdiction filter
    jurisdiction_filter: dict = {}
    if only_national:
        jurisdiction_filter["jurisdiccion"] = "Argentina"
    else:
        jurisdiction_filter["tags"] = {"$ne": "LIC_AR"}
    if fuente_exclude:
        jurisdiction_filter["fuente"] = {"$nin": fuente_exclude}

    # Count truly new items (first_seen_at >= since)
    truly_new_pipeline = [
        {"$match": {"first_seen_at": {"$gte": since}, **jurisdiction_filter}},
        {"$group": {
            "_id": "$fuente",
            "count": {"$sum": 1}
        }}
    ]
    truly_new_results = await collection.aggregate(truly_new_pipeline).to_list(100)
    truly_new_by_source = {r["_id"]: r["count"] for r in truly_new_results}
    total_truly_new = sum(truly_new_by_source.values())

    # Count re-indexed items (fecha_scraping >= since AND first_seen_at < since)
    re_indexed_pipeline = [
        {"$match": {
            **jurisdiction_filter,
            "fecha_scraping": {"$gte": since},
            "$or": [
                {"first_seen_at": {"$lt": since}},
                {"first_seen_at": {"$exists": False}}
            ]
        }},
        {"$group": {
            "_id": "$fuente",
            "count": {"$sum": 1}
        }}
    ]
    re_indexed_results = await collection.aggregate(re_indexed_pipeline).to_list(100)
    re_indexed_by_source = {r["_id"]: r["count"] for r in re_indexed_results}
    total_re_indexed = sum(re_indexed_by_source.values())

    # Count updated items (updated_at >= since AND created_at < since AND fecha_scraping < since)
    updated_pipeline = [
        {"$match": {
            **jurisdiction_filter,
            "updated_at": {"$gte": since},
            "created_at": {"$lt": since},
            "$or": [
                {"fecha_scraping": {"$lt": since}},
                {"fecha_scraping": {"$exists": False}}
            ]
        }},
        {"$group": {
            "_id": "$fuente",
            "count": {"$sum": 1}
        }}
    ]
    updated_results = await collection.aggregate(updated_pipeline).to_list(100)
    updated_by_source = {r["_id"]: r["count"] for r in updated_results}
    total_updated = sum(updated_by_source.values())

    # Combine all sources
    all_sources = set(truly_new_by_source.keys()) | set(re_indexed_by_source.keys()) | set(updated_by_source.keys())
    by_source = []
    for source in sorted(all_sources):
        by_source.append({
            "fuente": source or "Desconocida",
            "truly_new": truly_new_by_source.get(source, 0),
            "re_indexed": re_indexed_by_source.get(source, 0),
            "updated": updated_by_source.get(source, 0)
        })

    # Sort by total activity
    by_source.sort(key=lambda x: x["truly_new"] + x["re_indexed"] + x["updated"], reverse=True)

    return {
        "hours": hours,
        "truly_new": total_truly_new,
        "re_indexed": total_re_indexed,
        "updated": total_updated,
        "by_source": by_source
    }


@router.get("/stats/truly-new-count")
async def get_truly_new_count(
    since_date: date = Query(..., description="Count items where first_seen_at >= this date"),
    only_national: Optional[bool] = Query(False, description="Only Argentina nacional sources"),
    fuente_exclude: Optional[List[str]] = Query(None, description="Exclude these sources"),
    request: Request = None
):
    """Return count of items truly discovered since given date.

    This endpoint provides accurate count for "Nuevas de hoy" badge,
    independent of pagination and current filter state.
    """
    db = request.app.mongodb
    collection = db.licitaciones

    # Convert date to datetime for MongoDB comparison
    since_datetime = datetime.combine(since_date, datetime.min.time())

    # Build jurisdiction filter
    jf: dict = {}
    if only_national:
        jf["jurisdiccion"] = "Argentina"
    else:
        jf["tags"] = {"$ne": "LIC_AR"}
    if fuente_exclude:
        jf["fuente"] = {"$nin": fuente_exclude}

    count = await collection.count_documents({
        "first_seen_at": {"$gte": since_datetime},
        **jf,
    })

    # Optional: breakdown by source for debugging
    pipeline = [
        {"$match": {"first_seen_at": {"$gte": since_datetime}, **jf}},
        {"$group": {"_id": "$fuente", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 10}
    ]

    by_source = []
    async for doc in collection.aggregate(pipeline):
        by_source.append({"fuente": doc["_id"] or "Desconocida", "count": doc["count"]})

    return {
        "total": count,
        "since": since_date.isoformat(),
        "top_sources": by_source
    }


@router.get("/stats/year-range")
async def get_year_range(request: Request):
    """Get min/max publication years for dynamic year selector"""
    db = request.app.mongodb
    collection = db.licitaciones

    pipeline = [
        {"$match": {"publication_date": {"$ne": None}}},
        {"$group": {
            "_id": None,
            "min_date": {"$min": "$publication_date"},
            "max_date": {"$max": "$publication_date"}
        }}
    ]

    result = await collection.aggregate(pipeline).to_list(1)

    if not result or not result[0].get("min_date") or not result[0].get("max_date"):
        current_year = datetime.now().year
        return {"min_year": current_year, "max_year": current_year}

    min_year = result[0]["min_date"].year
    max_year = result[0]["max_date"].year

    return {"min_year": min_year, "max_year": max_year}


@router.get("/stats/storage")
async def get_storage_stats(request: Request):
    """Get storage usage statistics: MongoDB collections, indexes, disk, and growth projections."""
    import bson
    db = request.app.mongodb

    # --- MongoDB per-collection stats ---
    db_stats = await db.command("dbStats")
    collection_names = await db.list_collection_names()
    collections = []
    for coll_name in sorted(collection_names):
        try:
            cs = await db.command("collStats", coll_name)
            collections.append({
                "name": coll_name,
                "documents": cs.get("count", 0),
                "data_kb": round(cs.get("size", 0) / 1024, 1),
                "index_kb": round(cs.get("totalIndexSize", 0) / 1024, 1),
                "avg_doc_bytes": round(cs.get("avgObjSize", 0)),
            })
        except Exception:
            pass

    total_data_kb = round(db_stats.get("dataSize", 0) / 1024, 1)
    total_index_kb = round(db_stats.get("indexSize", 0) / 1024, 1)
    total_kb = total_data_kb + total_index_kb

    # --- Largest licitaciones (top 5) ---
    largest = []
    cursor = db.licitaciones.find().sort("enrichment_level", -1).limit(10)
    docs = await cursor.to_list(length=10)
    for doc in docs:
        size = len(bson.BSON.encode(doc))
        largest.append({
            "title": (doc.get("title") or "")[:60],
            "size_bytes": size,
            "enrichment_level": doc.get("enrichment_level", 1),
            "attached_files": len(doc.get("attached_files", [])),
            "fuente": doc.get("fuente"),
        })
    largest.sort(key=lambda x: x["size_bytes"], reverse=True)
    largest = largest[:5]

    # --- Enrichment level distribution (treat None as level 1) ---
    enrichment_dist = await db.licitaciones.aggregate([
        {"$group": {
            "_id": {"$ifNull": ["$enrichment_level", 1]},
            "count": {"$sum": 1},
        }},
        {"$sort": {"_id": 1}}
    ]).to_list(length=10)

    # --- Size by enrichment level ---
    size_by_enrichment = {}
    for level_data in enrichment_dist:
        level = level_data["_id"] or 1
        sample_cursor = db.licitaciones.find(
            {"$or": [{"enrichment_level": level}, {"enrichment_level": None}]}
            if level == 1 else {"enrichment_level": level}
        ).limit(20)
        sample_docs = await sample_cursor.to_list(length=20)
        if sample_docs:
            sizes = [len(bson.BSON.encode(d)) for d in sample_docs]
            avg_size = sum(sizes) / len(sizes)
            size_by_enrichment[str(level)] = {
                "count": level_data["count"],
                "avg_doc_bytes": round(avg_size),
                "total_estimated_kb": round(avg_size * level_data["count"] / 1024, 1),
            }

    # --- Disk storage ---
    from services.storage_cleanup_service import STORAGE_DIR, STORAGE_MAX_MB
    disk_mb = 0.0
    disk_files = 0
    if STORAGE_DIR.exists():
        for f in STORAGE_DIR.rglob("*"):
            if f.is_file():
                disk_mb += f.stat().st_size
                disk_files += 1
        disk_mb = round(disk_mb / (1024 * 1024), 2)

    # --- Growth projection ---
    lic_count = await db.licitaciones.count_documents({})
    runs_count = await db.scraper_runs.count_documents({})

    # Average doc size across all licitaciones
    avg_lic_bytes = 0
    if lic_count > 0:
        lic_coll = next((c for c in collections if c["name"] == "licitaciones"), None)
        if lic_coll:
            avg_lic_bytes = lic_coll["avg_doc_bytes"]

    # Projection: if we add 50 licitaciones/week, how much growth per month?
    weekly_new = 50  # estimate
    monthly_new = weekly_new * 4
    monthly_growth_kb = round(monthly_new * avg_lic_bytes / 1024, 1)

    # Projected sizes at milestones
    projections = {}
    for target in [500, 1000, 5000, 10000]:
        proj_data_kb = round(target * avg_lic_bytes / 1024, 1)
        proj_index_kb = round(total_index_kb * (target / max(lic_count, 1)), 1)
        projections[str(target)] = {
            "data_kb": proj_data_kb,
            "index_kb": proj_index_kb,
            "total_mb": round((proj_data_kb + proj_index_kb) / 1024, 1),
        }

    return {
        "mongodb": {
            "total_data_kb": total_data_kb,
            "total_index_kb": total_index_kb,
            "total_kb": total_kb,
            "total_mb": round(total_kb / 1024, 2),
            "collections": collections,
        },
        "disk": {
            "storage_dir_mb": disk_mb,
            "storage_files": disk_files,
            "max_mb": STORAGE_MAX_MB,
            "usage_pct": round(disk_mb / STORAGE_MAX_MB * 100, 1) if STORAGE_MAX_MB > 0 else 0,
        },
        "licitaciones": {
            "total": lic_count,
            "avg_doc_bytes": avg_lic_bytes,
            "largest": largest,
            "by_enrichment_level": size_by_enrichment,
            "enrichment_distribution": [
                {"level": e["_id"] or 1, "count": e["count"]} for e in enrichment_dist
            ],
        },
        "scraper_runs": {
            "total": runs_count,
        },
        "growth_projection": {
            "avg_doc_bytes": avg_lic_bytes,
            "estimated_weekly_new": weekly_new,
            "monthly_growth_kb": monthly_growth_kb,
            "at_milestones": projections,
        },
    }


@router.get("/stats/estado-distribution")
async def get_estado_distribution(
    request: Request,
    jurisdiccion: Optional[str] = Query(None, description="Filter by jurisdiction"),
    only_national: Optional[bool] = Query(False, description="Only show Argentina nacional sources")
):
    """
    Return counts by estado + year.

    Example response:
    {
        "by_estado": {
            "vigente": 245,
            "vencida": 1203,
            "prorrogada": 12,
            "archivada": 3156
        },
        "by_year": {
            "2024": 1890,
            "2025": 2301,
            "2026": 425
        },
        "vigentes_hoy": 245
    }
    """
    db = request.app.mongodb

    # Build base match filter
    base_match = {}
    if only_national:
        base_match["jurisdiccion"] = "Argentina"
    elif jurisdiccion:
        base_match["jurisdiccion"] = jurisdiccion

    # Count by estado
    estado_pipeline = [
        {"$match": base_match} if base_match else {"$match": {}},
        {"$group": {"_id": "$estado", "count": {"$sum": 1}}},
        {"$sort": {"_id": 1}}
    ]
    estado_result = await db.licitaciones.aggregate(estado_pipeline).to_list(100)
    by_estado = {doc["_id"]: doc["count"] for doc in estado_result}

    # Count by publication year
    year_match = {**base_match, "publication_date": {"$exists": True, "$ne": None}}
    year_pipeline = [
        {"$match": year_match},
        {"$group": {"_id": {"$year": "$publication_date"}, "count": {"$sum": 1}}},
        {"$sort": {"_id": 1}}
    ]
    year_result = await db.licitaciones.aggregate(year_pipeline).to_list(100)
    by_year = {str(doc["_id"]): doc["count"] for doc in year_result}

    # Count vigentes hoy (vigente + prorrogada, with future or missing opening_date)
    today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    vigentes_filter = {
        **base_match,
        "estado": {"$in": ["vigente", "prorrogada"]},
        "$or": [
            {"opening_date": {"$gte": today}},
            {"opening_date": None}
        ]
    }
    vigentes_count = await db.licitaciones.count_documents(vigentes_filter)

    return {
        "by_estado": by_estado,
        "by_year": by_year,
        "vigentes_hoy": vigentes_count
    }


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


@router.post("/{licitacion_id}/enrich")
async def enrich_licitacion_universal(
    licitacion_id: str,
    level: int = Query(2, ge=2, le=3, description="Enrichment level"),
    repo: LicitacionRepository = Depends(get_licitacion_repository),
):
    """
    Universal enrichment: re-fetch source page and extract additional data.
    Works for ALL sources. COMPR.AR delegates to its specialized enrichment.
    """
    lic = await repo.get_by_id(licitacion_id)
    if not lic:
        raise HTTPException(status_code=404, detail="Licitación no encontrada")

    fuente = lic.get("fuente", "") if isinstance(lic, dict) else getattr(lic, "fuente", "")

    # COMPR.AR: delegate to specialized enrichment
    if "COMPR.AR" in fuente:
        from routers.comprar import enrich_licitacion as comprar_enrich
        return await comprar_enrich(licitacion_id, level, repo)

    # Generic enrichment for all other sources
    source_url = lic.get("source_url", "") if isinstance(lic, dict) else getattr(lic, "source_url", "")
    if not source_url:
        return JSONResponse(content={
            "success": False,
            "message": "Esta licitación no tiene URL de origen para re-consultar",
        })

    try:
        # Look up scraper config for CSS selectors
        from dependencies import database as db
        selectors = None
        if db is not None:
            config_doc = await db.scraper_configs.find_one({
                "name": {"$regex": re.escape(fuente), "$options": "i"},
                "active": True,
            })
            if config_doc:
                selectors = config_doc.get("selectors", {})

        from services.generic_enrichment import GenericEnrichmentService
        service = GenericEnrichmentService()
        lic_dict = lic if isinstance(lic, dict) else lic.dict()
        updates = await service.enrich(lic_dict, selectors)

        if not updates:
            return JSONResponse(content={
                "success": True,
                "message": "No se encontraron datos adicionales en la fuente",
                "fields_updated": 0,
            })

        # Set enrichment level
        current_level = lic_dict.get("enrichment_level", 1)
        if current_level < 2:
            updates["enrichment_level"] = 2

        # Apply updates
        update_obj = LicitacionUpdate(**{k: v for k, v in updates.items()
                                         if k in LicitacionUpdate.__fields__})
        # For fields not in LicitacionUpdate, update directly
        extra_fields = {k: v for k, v in updates.items()
                        if k not in LicitacionUpdate.__fields__}

        updated = await repo.update(licitacion_id, update_obj)

        if extra_fields:
            from bson import ObjectId
            query_id = licitacion_id
            try:
                query_id = ObjectId(licitacion_id)
            except Exception:
                pass
            await db.licitaciones.update_one(
                {"_id": query_id},
                {"$set": extra_fields}
            )

        field_names = list(updates.keys())
        logger.info(f"Enriched {licitacion_id} ({fuente}): {field_names}")

        # Re-match nodos after enrichment (description/objeto may have changed)
        try:
            from services.nodo_matcher import get_nodo_matcher
            from dependencies import database as nodo_db
            if nodo_db is not None:
                matcher = get_nodo_matcher(nodo_db)
                title_val = updates.get("title", lic_dict.get("title", ""))
                objeto_val = updates.get("objeto", lic_dict.get("objeto", ""))
                desc_val = updates.get("description", lic_dict.get("description", ""))
                org_val = lic_dict.get("organization", "")
                cat_val = updates.get("category", lic_dict.get("category", ""))
                await matcher.assign_nodos_to_licitacion(
                    licitacion_id, title_val, objeto_val, desc_val, org_val, category=cat_val
                )
        except Exception as nodo_err:
            logger.warning(f"Nodo re-matching after enrichment failed: {nodo_err}")

        return JSONResponse(content={
            "success": True,
            "message": f"Enriquecido con {len(updates)} campos: {', '.join(field_names)}",
            "fields_updated": len(updates),
        })

    except Exception as e:
        logger.error(f"Error enriching {licitacion_id}: {e}", exc_info=True)
        return JSONResponse(content={
            "success": False,
            "message": f"Error al enriquecer: {str(e)}",
        })


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
            {"$match": {"jurisdiccion": "Argentina"}},
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


@router.post("/{licitacion_id}/classify")
async def classify_licitacion_category(
    licitacion_id: str,
    repo: LicitacionRepository = Depends(get_licitacion_repository)
):
    """Classify a licitacion into a rubro category based on its content"""
    from services.category_classifier import get_category_classifier

    licitacion = await repo.get_by_id(licitacion_id)
    if not licitacion:
        raise HTTPException(status_code=404, detail="Licitación not found")

    classifier = get_category_classifier()
    category = classifier.classify(
        title=licitacion.title,
        description=licitacion.description,
        keywords=licitacion.keywords
    )

    if category:
        # Update the licitacion with the classified category
        from models.licitacion import LicitacionUpdate
        update_data = LicitacionUpdate(category=category)
        await repo.update(licitacion_id, update_data)

    return {
        "id_licitacion": licitacion_id,
        "category": category,
        "classified": category is not None
    }


# NEW ENDPOINTS FOR URL RESOLUTION AND DEDUPLICATION

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


@router.post("/deduplicate")
async def run_deduplication(
    jurisdiccion: Optional[str] = Query(None, description="Limit deduplication to a specific jurisdiction"),
    request: Request = None
):
    """Run deduplication on all licitaciones"""
    from services.deduplication_service import get_deduplication_service
    
    # Get database from request
    db = request.app.mongodb
    service = get_deduplication_service(db)
    
    stats = await service.run_deduplication(jurisdiccion=jurisdiccion)
    return stats


@router.post("/{licitacion_id}/resolve-url")
async def resolve_licitacion_url(
    licitacion_id: str,
    repo: LicitacionRepository = Depends(get_licitacion_repository)
):
    """Resolve and update the canonical URL for a specific licitacion"""
    from services.url_resolver import get_url_resolver
    from motor.motor_asyncio import AsyncIOMotorDatabase
    
    # We need to get the database from the repo
    # This is a bit hacky but works for now
    db = repo.collection.database
    
    resolver = get_url_resolver(db)
    url = await resolver.resolve_url(licitacion_id)
    
    if not url:
        raise HTTPException(status_code=404, detail="Could not resolve URL for this licitación")
    
    return {
        "id_licitacion": licitacion_id,
        "resolved_url": url,
        "quality": resolver.determine_url_quality(url)
    }


