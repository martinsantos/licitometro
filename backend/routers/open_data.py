from fastapi import APIRouter, Query, Request
from datetime import datetime, timezone, timedelta

router = APIRouter(prefix="/api/open-data", tags=["open-data"])


def _to_ocds(doc: dict) -> dict:
    pub = doc.get("publication_date")
    opening = doc.get("opening_date")
    return {
        "ocid": f"ocds-licitometro-{doc.get('proceso_id') or str(doc.get('_id', ''))}",
        "id": str(doc.get("_id", "")),
        "date": pub.isoformat() if isinstance(pub, datetime) else pub,
        "language": "es",
        "initiationType": "tender",
        "parties": [{"name": doc.get("organization", ""), "roles": ["buyer"]}],
        "tender": {
            "title": doc.get("title", ""),
            "description": (doc.get("objeto") or doc.get("description", ""))[:500],
            "status": doc.get("estado", "active"),
            "value": {"amount": doc.get("budget"), "currency": "ARS"} if doc.get("budget") else None,
            "tenderPeriod": {"endDate": opening.isoformat() if isinstance(opening, datetime) else opening},
        },
        "source": doc.get("fuente", ""),
        "url": doc.get("canonical_url") or doc.get("url"),
    }


@router.get("/licitaciones")
async def ocds_licitaciones(
    request: Request,
    fecha_desde: str = Query(None),
    fecha_hasta: str = Query(None),
    fuente: str = Query(None),
    limit: int = Query(100, le=500),
    page: int = Query(1, ge=1),
):
    db = request.app.mongodb
    query: dict = {}
    if fecha_desde:
        query.setdefault("publication_date", {})["$gte"] = datetime.fromisoformat(fecha_desde)
    if fecha_hasta:
        query.setdefault("publication_date", {})["$lte"] = datetime.fromisoformat(fecha_hasta)
    if fuente:
        query["fuente"] = fuente
    skip = (page - 1) * limit
    total = await db.licitaciones.count_documents(query)
    docs = await db.licitaciones.find(query).skip(skip).limit(limit).to_list(length=limit)
    return {
        "version": "1.1",
        "releases": [_to_ocds(d) for d in docs],
        "total": total,
        "page": page,
        "pages": (total + limit - 1) // limit,
    }


@router.get("/stats/resumen")
async def stats_resumen(request: Request):
    """Global counts for the observatorio hero section."""
    db = request.app.mongodb
    total = await db.licitaciones.count_documents({})
    con_presupuesto = await db.licitaciones.count_documents({"budget": {"$gt": 0}})
    organismos = await db.licitaciones.distinct("organization")
    fuentes = await db.licitaciones.distinct("fuente")

    pipeline_budget = [
        {"$match": {"budget": {"$gt": 0}}},
        {"$group": {"_id": None, "total": {"$sum": "$budget"}}},
    ]
    budget_res = await db.licitaciones.aggregate(pipeline_budget).to_list(1)
    total_budget = budget_res[0]["total"] if budget_res else 0

    return {
        "total_licitaciones": total,
        "con_presupuesto": con_presupuesto,
        "organismos_unicos": len([o for o in organismos if o]),
        "fuentes_activas": len([f for f in fuentes if f]),
        "presupuesto_total_ars": total_budget,
    }


@router.get("/stats/por-mes")
async def stats_por_mes(request: Request, meses: int = Query(12, le=24)):
    """Count of publications by month (last N months)."""
    db = request.app.mongodb
    since = datetime.now(timezone.utc) - timedelta(days=meses * 31)
    pipeline = [
        {"$match": {"publication_date": {"$gte": since}}},
        {"$group": {
            "_id": {
                "year": {"$year": "$publication_date"},
                "month": {"$month": "$publication_date"},
            },
            "count": {"$sum": 1},
            "presupuesto": {"$sum": {"$ifNull": ["$budget", 0]}},
        }},
        {"$sort": {"_id.year": 1, "_id.month": 1}},
    ]
    docs = await db.licitaciones.aggregate(pipeline).to_list(length=24)
    return [
        {
            "mes": f"{d['_id']['year']}-{d['_id']['month']:02d}",
            "label": f"{['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][d['_id']['month']-1]} {str(d['_id']['year'])[2:]}",
            "count": d["count"],
            "presupuesto": d["presupuesto"],
        }
        for d in docs
    ]


@router.get("/stats/por-organismo")
async def stats_por_organismo(request: Request, top: int = Query(15, le=30)):
    """Top N organisms by licitacion count."""
    db = request.app.mongodb
    pipeline = [
        {"$match": {"organization": {"$ne": None, "$ne": ""}}},
        {"$group": {
            "_id": "$organization",
            "count": {"$sum": 1},
            "presupuesto": {"$sum": {"$ifNull": ["$budget", 0]}},
        }},
        {"$sort": {"count": -1}},
        {"$limit": top},
    ]
    docs = await db.licitaciones.aggregate(pipeline).to_list(length=top)
    return [{"organismo": d["_id"], "count": d["count"], "presupuesto": d["presupuesto"]} for d in docs]


@router.get("/stats/por-fuente")
async def stats_por_fuente(request: Request):
    """Count by data source."""
    db = request.app.mongodb
    pipeline = [
        {"$match": {"fuente": {"$ne": None, "$ne": ""}}},
        {"$group": {
            "_id": "$fuente",
            "count": {"$sum": 1},
            "presupuesto": {"$sum": {"$ifNull": ["$budget", 0]}},
            "con_presupuesto": {"$sum": {"$cond": [{"$gt": ["$budget", 0]}, 1, 0]}},
        }},
        {"$sort": {"count": -1}},
    ]
    docs = await db.licitaciones.aggregate(pipeline).to_list(length=50)
    return [
        {"fuente": d["_id"], "count": d["count"], "presupuesto": d["presupuesto"], "con_presupuesto": d["con_presupuesto"]}
        for d in docs
    ]


@router.get("/stats/por-categoria")
async def stats_por_categoria(request: Request, top: int = Query(12, le=20)):
    """Count by category."""
    db = request.app.mongodb
    pipeline = [
        {"$match": {"category": {"$ne": None, "$ne": ""}}},
        {"$group": {"_id": "$category", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": top},
    ]
    docs = await db.licitaciones.aggregate(pipeline).to_list(length=top)
    return [{"categoria": d["_id"], "count": d["count"]} for d in docs]
