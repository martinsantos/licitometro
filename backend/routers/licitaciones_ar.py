"""
Router for Licitaciones AR (national Argentine procurement sources).
Isolated section with manual nodo/notification control.
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from typing import Dict, List, Optional, Any
from datetime import date, datetime, timedelta
import logging
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from db.repositories import LicitacionRepository
from db.models import licitacion_entity, licitaciones_entity
from dependencies import get_licitacion_repository

logger = logging.getLogger("licitaciones_ar_router")

router = APIRouter(
    prefix="/api/licitaciones-ar",
    tags=["licitaciones-ar"],
    responses={404: {"description": "Not found"}}
)

TAG_LIC_AR = "LIC_AR"


def _ar_base_filters() -> Dict[str, Any]:
    """Base filter to only include LIC_AR tagged items."""
    return {"tags": TAG_LIC_AR}


def _build_ar_filters(
    q: Optional[str] = None,
    status: Optional[str] = None,
    organization: Optional[str] = None,
    category: Optional[str] = None,
    fuente: Optional[str] = None,
    jurisdiccion: Optional[str] = None,
    estado: Optional[str] = None,
    workflow_state: Optional[str] = None,
    tipo_procedimiento: Optional[str] = None,
    nodo: Optional[str] = None,
    budget_min: Optional[float] = None,
    budget_max: Optional[float] = None,
    fecha_desde: Optional[date] = None,
    fecha_hasta: Optional[date] = None,
    fecha_campo: str = "publication_date",
    nuevas_desde: Optional[date] = None,
    year: Optional[int] = None,
) -> Dict[str, Any]:
    """Build MongoDB filter dict from query params, always scoped to LIC_AR."""
    filters = _ar_base_filters()

    if status:
        filters["status"] = status
    if organization:
        filters["organization"] = {"$regex": re.escape(organization), "$options": "i"}
    if category:
        filters["category"] = category
    if fuente:
        filters["fuente"] = {"$regex": re.escape(fuente), "$options": "i"}
    if jurisdiccion:
        filters["jurisdiccion"] = jurisdiccion
    if estado:
        filters["estado"] = estado
    if workflow_state:
        filters["workflow_state"] = workflow_state
    if tipo_procedimiento:
        filters["tipo_procedimiento"] = tipo_procedimiento
    if nodo:
        filters["nodos"] = nodo

    if budget_min is not None or budget_max is not None:
        bf = {}
        if budget_min is not None:
            bf["$gte"] = budget_min
        if budget_max is not None:
            bf["$lte"] = budget_max
        filters["budget"] = bf

    # Year filter (always on publication_date)
    if year:
        filters.setdefault("publication_date", {})
        if isinstance(filters["publication_date"], dict):
            filters["publication_date"]["$gte"] = datetime(year, 1, 1)
            filters["publication_date"]["$lte"] = datetime(year, 12, 31, 23, 59, 59)
        else:
            filters["publication_date"] = {
                "$gte": datetime(year, 1, 1),
                "$lte": datetime(year, 12, 31, 23, 59, 59),
            }

    # Date range filter
    allowed_date_fields = [
        "publication_date", "opening_date", "created_at",
        "fecha_scraping", "first_seen_at", "expiration_date",
    ]
    fc = fecha_campo if fecha_campo in allowed_date_fields else "publication_date"
    if fecha_desde or fecha_hasta:
        df = filters.get(fc, {}) if isinstance(filters.get(fc), dict) else {}
        if fecha_desde:
            df["$gte"] = datetime.combine(fecha_desde, datetime.min.time())
        if fecha_hasta:
            df["$lte"] = datetime.combine(fecha_hasta, datetime.max.time())
        if df:
            filters[fc] = df

    # nuevas_desde filter (first_seen_at >= date)
    if nuevas_desde:
        existing = filters.get("first_seen_at", {})
        if not isinstance(existing, dict):
            existing = {}
        existing["$gte"] = datetime.combine(nuevas_desde, datetime.min.time())
        filters["first_seen_at"] = existing

    return filters


@router.get("/", response_model=Dict[str, Any])
async def get_licitaciones_ar(
    page: int = Query(1, ge=1),
    size: int = Query(15, ge=1, le=100),
    q: Optional[str] = Query(None, min_length=1),
    status: Optional[str] = None,
    organization: Optional[str] = None,
    category: Optional[str] = None,
    fuente: Optional[str] = None,
    jurisdiccion: Optional[str] = None,
    estado: Optional[str] = None,
    workflow_state: Optional[str] = None,
    tipo_procedimiento: Optional[str] = None,
    nodo: Optional[str] = None,
    budget_min: Optional[float] = None,
    budget_max: Optional[float] = None,
    fecha_desde: Optional[date] = None,
    fecha_hasta: Optional[date] = None,
    fecha_campo: str = Query("publication_date"),
    nuevas_desde: Optional[date] = None,
    year: Optional[int] = None,
    sort_by: str = Query("publication_date"),
    sort_order: str = Query("desc"),
    repo: LicitacionRepository = Depends(get_licitacion_repository),
):
    """List LIC_AR tagged licitaciones with pagination and filters."""
    filters = _build_ar_filters(
        q=q, status=status, organization=organization, category=category,
        fuente=fuente, jurisdiccion=jurisdiccion, estado=estado,
        workflow_state=workflow_state, tipo_procedimiento=tipo_procedimiento,
        nodo=nodo, budget_min=budget_min, budget_max=budget_max,
        fecha_desde=fecha_desde, fecha_hasta=fecha_hasta, fecha_campo=fecha_campo,
        nuevas_desde=nuevas_desde, year=year,
    )

    skip = (page - 1) * size
    order_val = 1 if sort_order == "asc" else -1

    if q:
        items = await repo.search(
            q, skip=skip, limit=size,
            sort_by=sort_by, sort_order=order_val,
            extra_filters=filters,
        )
        total = await repo.search_count(q, extra_filters=filters)
    else:
        items = await repo.get_all(
            skip=skip, limit=size, filters=filters,
            sort_by=sort_by, sort_order=order_val,
        )
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


@router.get("/stats")
async def get_ar_stats(request: Request):
    """Stats for LIC_AR items only."""
    db = request.app.mongodb
    col = db.licitaciones
    base = _ar_base_filters()

    total = await col.count_documents(base)

    # By fuente
    pipeline = [
        {"$match": base},
        {"$group": {"_id": "$fuente", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]
    by_fuente = {doc["_id"]: doc["count"] async for doc in col.aggregate(pipeline)}

    # By jurisdiccion
    pipeline_jur = [
        {"$match": base},
        {"$group": {"_id": "$jurisdiccion", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]
    by_jurisdiccion = {doc["_id"]: doc["count"] async for doc in col.aggregate(pipeline_jur)}

    # By estado
    pipeline_estado = [
        {"$match": base},
        {"$group": {"_id": "$estado", "count": {"$sum": 1}}},
    ]
    by_estado = {doc["_id"]: doc["count"] async for doc in col.aggregate(pipeline_estado)}

    # Items with nodos assigned
    with_nodos = await col.count_documents({**base, "nodos": {"$exists": True, "$ne": []}})

    return {
        "total": total,
        "by_fuente": by_fuente,
        "by_jurisdiccion": by_jurisdiccion,
        "by_estado": by_estado,
        "with_nodos": with_nodos,
    }


@router.get("/facets")
async def get_ar_facets(
    request: Request,
    q: Optional[str] = None,
    status: Optional[str] = None,
    organization: Optional[str] = None,
    category: Optional[str] = None,
    fuente: Optional[str] = None,
    jurisdiccion: Optional[str] = None,
    estado: Optional[str] = None,
    workflow_state: Optional[str] = None,
    tipo_procedimiento: Optional[str] = None,
    nodo: Optional[str] = None,
    budget_min: Optional[float] = None,
    budget_max: Optional[float] = None,
    fecha_desde: Optional[date] = None,
    fecha_hasta: Optional[date] = None,
    fecha_campo: str = Query("publication_date"),
    nuevas_desde: Optional[date] = None,
    year: Optional[int] = None,
):
    """Facet counts for AR items with cross-filtering."""
    db = request.app.mongodb
    col = db.licitaciones

    base_filters = _build_ar_filters(
        q=q, status=status, organization=organization, category=category,
        fuente=fuente, jurisdiccion=jurisdiccion, estado=estado,
        workflow_state=workflow_state, tipo_procedimiento=tipo_procedimiento,
        nodo=nodo, budget_min=budget_min, budget_max=budget_max,
        fecha_desde=fecha_desde, fecha_hasta=fecha_hasta, fecha_campo=fecha_campo,
        nuevas_desde=nuevas_desde, year=year,
    )

    facets = {}
    facet_fields = [
        "fuente", "status", "category", "workflow_state",
        "jurisdiccion", "tipo_procedimiento", "organization", "estado",
    ]

    for field in facet_fields:
        pipeline = [
            {"$match": base_filters},
            {"$group": {"_id": f"${field}", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 50},
        ]
        facets[field] = [
            {"value": doc["_id"], "count": doc["count"]}
            async for doc in col.aggregate(pipeline)
            if doc["_id"]
        ]

    # Nodos facet (requires $unwind since nodos is an array)
    nodos_pipeline = [
        {"$match": {**base_filters, "nodos": {"$exists": True, "$ne": []}}},
        {"$unwind": "$nodos"},
        {"$group": {"_id": "$nodos", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 20},
    ]
    facets["nodos"] = [
        {"value": doc["_id"], "count": doc["count"]}
        async for doc in col.aggregate(nodos_pipeline)
        if doc["_id"]
    ]

    return facets


@router.post("/{licitacion_id}/assign-nodos")
async def assign_nodos_to_ar_item(
    licitacion_id: str,
    request: Request,
):
    """Manually trigger nodo matching for a single AR item."""
    db = request.app.mongodb
    col = db.licitaciones

    doc = await col.find_one({"_id": licitacion_id})
    if not doc:
        doc = await col.find_one({"id_licitacion": licitacion_id})
    if not doc:
        raise HTTPException(404, "Licitacion not found")

    tags = doc.get("tags", [])
    if TAG_LIC_AR not in tags:
        raise HTTPException(400, "Item is not tagged as LIC_AR")

    from services.nodo_matcher import get_nodo_matcher
    matcher = get_nodo_matcher(db)

    item_data = dict(doc)
    item_data.pop("_id", None)
    await matcher.assign_nodos_to_item_data(item_data)

    if item_data.get("nodos"):
        await col.update_one(
            {"_id": doc["_id"]},
            {"$set": {"nodos": item_data["nodos"]}}
        )

    return {
        "id_licitacion": doc.get("id_licitacion"),
        "nodos_assigned": item_data.get("nodos", []),
    }


@router.post("/batch-assign-nodos")
async def batch_assign_nodos(
    request: Request,
    limit: int = Query(100, ge=1, le=1000, description="Max items to process"),
    only_unassigned: bool = Query(True, description="Only process items without nodos"),
):
    """Manually trigger nodo matching for multiple AR items."""
    db = request.app.mongodb
    col = db.licitaciones

    query = _ar_base_filters()
    if only_unassigned:
        query["$or"] = [{"nodos": {"$exists": False}}, {"nodos": []}]

    from services.nodo_matcher import get_nodo_matcher
    matcher = get_nodo_matcher(db)

    cursor = col.find(query).limit(limit)
    processed = 0
    assigned = 0

    async for doc in cursor:
        item_data = dict(doc)
        item_data.pop("_id", None)
        await matcher.assign_nodos_to_item_data(item_data)

        if item_data.get("nodos"):
            await col.update_one(
                {"_id": doc["_id"]},
                {"$set": {"nodos": item_data["nodos"]}}
            )
            assigned += 1
        processed += 1

    return {
        "processed": processed,
        "assigned": assigned,
    }


@router.post("/send-digest")
async def send_ar_digest(
    request: Request,
    hours: int = Query(24, ge=1, le=168, description="Look back N hours for new items"),
):
    """Manually send a digest of recent AR items to configured notification channels."""
    db = request.app.mongodb
    col = db.licitaciones

    since = datetime.utcnow() - timedelta(hours=hours)
    query = {**_ar_base_filters(), "first_seen_at": {"$gte": since}}

    items = await col.find(query).sort("first_seen_at", -1).limit(50).to_list(length=50)

    if not items:
        return {"sent": False, "message": f"No new AR items in the last {hours} hours", "count": 0}

    try:
        from services.notification_service import get_notification_service
        ns = get_notification_service(db)

        summary_lines = [f"*Licitaciones AR - {len(items)} nuevas* (ultimas {hours}h)\n"]
        for item in items[:20]:
            title = item.get("objeto") or item.get("title", "Sin titulo")
            org = item.get("organization", "")
            fuente = item.get("fuente", "")
            summary_lines.append(f"- {title[:80]} ({org}) [{fuente}]")

        if len(items) > 20:
            summary_lines.append(f"\n... y {len(items) - 20} mas")

        message = "\n".join(summary_lines)
        await ns.send_telegram(message)

    except Exception as e:
        logger.error(f"Failed to send AR digest: {e}")
        return {"sent": False, "message": str(e), "count": len(items)}

    return {"sent": True, "count": len(items)}


@router.get("/sources")
async def get_ar_sources(request: Request):
    """List scraper configs with scope=ar_nacional."""
    db = request.app.mongodb
    configs = await db.scraper_configs.find(
        {"scope": "ar_nacional"}
    ).to_list(length=100)

    from db.models import scraper_config_entity
    return [scraper_config_entity(c) for c in configs]


@router.post("/trigger-all")
async def trigger_all_ar_scrapers(request: Request):
    """Trigger all active AR scrapers sequentially."""
    db = request.app.mongodb
    configs = await db.scraper_configs.find(
        {"scope": "ar_nacional", "active": True}
    ).to_list(length=100)

    if not configs:
        return {"triggered": 0, "message": "No active AR sources found"}

    from services.scheduler_service import get_scheduler_service
    scheduler = get_scheduler_service(db)

    triggered = []
    errors = []
    for config in configs:
        name = config.get("name", "")
        try:
            await scheduler.trigger_scraper(name)
            triggered.append(name)
        except Exception as e:
            errors.append({"name": name, "error": str(e)})

    return {
        "triggered": len(triggered),
        "triggered_names": triggered,
        "errors": errors,
    }
