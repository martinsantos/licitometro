from fastapi import APIRouter, Query, Request
from datetime import datetime

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
