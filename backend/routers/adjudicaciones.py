import logging

from fastapi import APIRouter, HTTPException, Query, Request
from bson import ObjectId

logger = logging.getLogger("adjudicaciones_router")

router = APIRouter(prefix="/api/adjudicaciones", tags=["adjudicaciones"])


@router.get("")
async def list_adjudicaciones(
    request: Request,
    organization: str = Query(None),
    fuente: str = Query(None),
    proveedor: str = Query(None),
    categoria: str = Query(None),
    limit: int = Query(50, le=200),
    page: int = Query(1, ge=1),
):
    db = request.app.mongodb
    query: dict = {}
    if organization:
        query["organization"] = {"$regex": organization, "$options": "i"}
    if fuente:
        query["fuente"] = fuente
    if proveedor:
        query["$or"] = [
            {"adjudicatario": {"$regex": proveedor, "$options": "i"}},
            {"supplier_id": proveedor},
        ]
    if categoria:
        query["category"] = categoria
    skip = (page - 1) * limit
    total = await db.adjudicaciones.count_documents(query)
    docs = await db.adjudicaciones.find(query).sort("fecha_adjudicacion", -1).skip(skip).limit(limit).to_list(length=limit)
    for d in docs:
        d["_id"] = str(d["_id"])
    from utils.pagination import paginated_response
    return paginated_response(docs, total, page, limit)


@router.get("/por-proveedor/{cuit}")
async def adjudicaciones_por_proveedor(cuit: str, request: Request, limit: int = Query(50, le=200)):
    db = request.app.mongodb
    docs = await db.adjudicaciones.find({"supplier_id": cuit}).sort("fecha_adjudicacion", -1).limit(limit).to_list(length=limit)
    for d in docs:
        d["_id"] = str(d["_id"])
    total_monto = sum(float(d.get("monto_adjudicado") or 0) for d in docs)
    return {"items": docs, "total": len(docs), "total_monto": total_monto}


@router.get("/precios-referencia")
async def precios_referencia(
    request: Request,
    q: str = Query(...),
    limit: int = Query(20, le=100),
):
    db = request.app.mongodb
    # Fallback to regex if no text index
    try:
        docs = await db.adjudicaciones.find(
            {"$text": {"$search": q}},
            {"score": {"$meta": "textScore"}}
        ).sort([("score", {"$meta": "textScore"})]).limit(limit).to_list(length=limit)
    except Exception:
        docs = await db.adjudicaciones.find(
            {"objeto": {"$regex": q, "$options": "i"}}
        ).sort("fecha_adjudicacion", -1).limit(limit).to_list(length=limit)
    for d in docs:
        d["_id"] = str(d["_id"])
    return {"items": docs, "query": q, "total": len(docs)}


@router.get("/competencia/{licitacion_id}")
async def panel_competencia(licitacion_id: str, request: Request):
    """
    For a given licitacion, find adjudicatarios that won similar tenders in the last 24 months.

    Returns top 8 adjudicatarios grouped by adjudicatario name, with count and total monto.
    Uses $text search on adjudicaciones collection with the objeto/title of the licitacion.
    """
    db = request.app.mongodb

    # Fetch the licitacion
    try:
        oid = ObjectId(licitacion_id)
    except Exception:
        raise HTTPException(status_code=400, detail="ID de licitación inválido")

    lic = await db.licitaciones.find_one(
        {"_id": oid},
        {"objeto": 1, "title": 1},
    )
    if not lic:
        raise HTTPException(status_code=404, detail="Licitación no encontrada")

    search_text = lic.get("objeto") or lic.get("title") or ""
    if not search_text.strip():
        return {"licitacion_id": licitacion_id, "competidores": [], "total": 0}

    # Date cutoff: last 24 months
    from datetime import timedelta
    from utils.time import utc_now
    cutoff = utc_now() - timedelta(days=730)

    # $text search on adjudicaciones
    text_query: dict = {
        "$text": {"$search": search_text},
        "fecha_adjudicacion": {"$gte": cutoff},
    }

    try:
        # Aggregate: group by adjudicatario
        pipeline = [
            {"$match": text_query},
            {"$group": {
                "_id": "$adjudicatario",
                "cuit": {"$first": "$supplier_id"},
                "count": {"$sum": 1},
                "monto_total": {"$sum": {"$ifNull": ["$monto_adjudicado", 0]}},
                "licitaciones": {
                    "$push": {
                        "titulo": {"$ifNull": ["$objeto", "$title"]},
                        "fecha": "$fecha_adjudicacion",
                        "monto": "$monto_adjudicado",
                    }
                },
            }},
            {"$sort": {"count": -1, "monto_total": -1}},
            {"$limit": 8},
        ]

        results = await db.adjudicaciones.aggregate(pipeline).to_list(length=8)
    except Exception as e:
        # Fallback: if no text index, return empty
        logger.warning(f"panel_competencia text search failed (no index?): {e}")
        return {"licitacion_id": licitacion_id, "competidores": [], "total": 0, "error": str(e)}

    competidores = []
    for r in results:
        # Trim licitaciones list to top 5 by monto (descending)
        lics = r.get("licitaciones", [])
        lics_sorted = sorted(
            lics,
            key=lambda x: (x.get("monto") or 0),
            reverse=True,
        )[:5]
        # Serialize datetimes
        for l in lics_sorted:
            if hasattr(l.get("fecha"), "isoformat"):
                l["fecha"] = l["fecha"].isoformat()

        competidores.append({
            "adjudicatario": r.get("_id") or "Desconocido",
            "cuit": r.get("cuit"),
            "count": r.get("count", 0),
            "monto_total": r.get("monto_total", 0),
            "licitaciones": lics_sorted,
        })

    return {
        "licitacion_id": licitacion_id,
        "search_text": search_text[:100],
        "competidores": competidores,
        "total": len(competidores),
    }


@router.post("/run-comprasapps")
async def run_comprasapps_adjudicaciones(request: Request):
    from services.comprasapps_adjudicaciones_service import run
    summary = await run(request.app.mongodb)
    return summary
