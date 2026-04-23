from fastapi import APIRouter, Query, Request
from bson import ObjectId

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
    return {"items": docs, "total": total, "page": page, "pages": max(1, (total + limit - 1) // limit)}


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


@router.post("/run-comprasapps")
async def run_comprasapps_adjudicaciones(request: Request):
    from services.comprasapps_adjudicaciones_service import run
    summary = await run(request.app.mongodb)
    return summary
