from fastapi import APIRouter, Depends, HTTPException, Query, Body, Request
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
from typing import List, Dict, Optional, Any
from uuid import UUID
from datetime import date, datetime
import logging
import re
import sys
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
    budget_min: Optional[float] = Query(None, description="Minimum budget"),
    budget_max: Optional[float] = Query(None, description="Maximum budget"),
    fecha_desde: Optional[date] = Query(None, description="Filter from date (inclusive)"),
    fecha_hasta: Optional[date] = Query(None, description="Filter to date (inclusive)"),
    fecha_campo: str = Query("publication_date", description="Date field to filter on"),
    sort_by: str = Query("publication_date", description="Field to sort by"),
    sort_order: str = Query("desc", description="Sort order: asc or desc"),
    repo: LicitacionRepository = Depends(get_licitacion_repository)
):
    """Get all licitaciones with pagination, filtering and sorting.
    When q is provided, uses hybrid search (text index + regex fallback)."""

    # If there's a search query, use hybrid search with filters
    if q:
        skip = (page - 1) * size
        order_val = 1 if sort_order == "asc" else -1

        # Build additional filters
        extra_filters = {}
        if status: extra_filters["status"] = status
        if organization: extra_filters["organization"] = organization
        if category: extra_filters["category"] = category
        if fuente: extra_filters["fuente"] = fuente
        if workflow_state: extra_filters["workflow_state"] = workflow_state
        if jurisdiccion: extra_filters["jurisdiccion"] = jurisdiccion
        if tipo_procedimiento: extra_filters["tipo_procedimiento"] = tipo_procedimiento

        items = await repo.search(q, skip=skip, limit=size,
                                   sort_by=sort_by, sort_order=order_val,
                                   extra_filters=extra_filters)
        total_items = await repo.search_count(q, extra_filters=extra_filters)
        return {
            "items": items,
            "paginacion": {
                "pagina": page,
                "por_pagina": size,
                "total_items": total_items,
                "total_paginas": (total_items + size - 1) // size
            }
        }

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
    if fuente:
        filters["fuente"] = fuente
    if workflow_state:
        filters["workflow_state"] = workflow_state
    if jurisdiccion:
        filters["jurisdiccion"] = jurisdiccion
    if tipo_procedimiento:
        filters["tipo_procedimiento"] = tipo_procedimiento

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
                           "created_at", "fecha_scraping"]
    if fecha_campo not in allowed_date_fields:
        fecha_campo = "publication_date"

    if fecha_desde or fecha_hasta:
        date_filter = {}
        if fecha_desde:
            date_filter["$gte"] = datetime.combine(fecha_desde, datetime.min.time())
        if fecha_hasta:
            date_filter["$lte"] = datetime.combine(fecha_hasta, datetime.max.time())
        if date_filter:
            filters[fecha_campo] = date_filter

    # Handle sort order
    order_val = 1 if sort_order == "asc" else -1

    # Calculate skip
    skip = (page - 1) * size

    # For nullable date fields, use aggregation to push nulls to end
    nullable_sort_fields = ["opening_date", "fecha_scraping", "budget"]
    use_nulls_last = sort_by in nullable_sort_fields

    # Get data and count
    items = await repo.get_all(
        skip=skip, limit=size, filters=filters,
        sort_by=sort_by, sort_order=order_val,
        nulls_last=use_nulls_last
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


@router.get("/stats/daily-counts")
async def get_daily_counts(
    days: int = Query(14, ge=1, le=30),
    fecha_campo: str = Query("publication_date"),
    request: Request = None,
):
    """Get count of licitaciones per day for the last N days"""
    from datetime import timedelta

    allowed_date_fields = ["publication_date", "opening_date", "expiration_date",
                           "fecha_publicacion_portal", "fecha_inicio_consultas", "fecha_fin_consultas",
                           "created_at", "fecha_scraping"]
    if fecha_campo not in allowed_date_fields:
        fecha_campo = "publication_date"

    db = request.app.mongodb
    collection = db.licitaciones

    start_date = datetime.combine(date.today() - timedelta(days=days - 1), datetime.min.time())

    pipeline = [
        {"$match": {fecha_campo: {"$gte": start_date}}},
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
async def get_data_quality_stats(request: Request):
    """Get data quality statistics: completeness by source, opening_date coverage, duplicates"""
    db = request.app.mongodb
    collection = db.licitaciones

    # Records by source
    by_source = await collection.aggregate([
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
    ]).to_list(length=50)

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
        {"$match": {"created_at": {"$gte": since}}},
        {"$sort": {"created_at": -1}},
        {"$group": {
            "_id": "$fuente",
            "count": {"$sum": 1},
            "latest": {"$first": "$created_at"},
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

@router.get("/distinct/{field_name}", response_model=List[str])
async def get_distinct_values(
    field_name: str,
    repo: LicitacionRepository = Depends(get_licitacion_repository)
):
    """Get distinct values for a given field"""
    # Validate field_name to prevent arbitrary field access if necessary
    allowed_fields = ["organization", "location", "category", "fuente", "status", "workflow_state", "jurisdiccion", "tipo_procedimiento"]
    if field_name not in allowed_fields:
        raise HTTPException(status_code=400, detail=f"Filtering by field '{field_name}' is not allowed.")

    distinct_values = await repo.get_distinct(field_name)
    return distinct_values


@router.get("/rubros/list")
async def get_rubros_list():
    """Get list of all COMPR.AR rubros (categories) for filtering"""
    from services.category_classifier import get_category_classifier

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


