"""Cotizaciones CRUD — MongoDB-backed persistence for CotizAR bids."""

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List

from bson import ObjectId
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import Response
from pydantic import BaseModel

from models.cotizacion import CotizacionCreate
from db.models import cotizacion_entity

logger = logging.getLogger("cotizaciones")

router = APIRouter(
    prefix="/api/cotizaciones",
    tags=["cotizaciones"],
)


def _get_db(request: Request):
    return request.app.mongodb


@router.put("/{licitacion_id}")
async def upsert_cotizacion(licitacion_id: str, body: CotizacionCreate, request: Request):
    """Upsert a cotizacion keyed by licitacion_id."""
    db = _get_db(request)
    now = datetime.now(timezone.utc)
    data = body.model_dump()
    data["licitacion_id"] = licitacion_id
    data["updated_at"] = now

    existing = await db.cotizaciones.find_one({"licitacion_id": licitacion_id})
    if existing:
        await db.cotizaciones.update_one(
            {"licitacion_id": licitacion_id},
            {"$set": data},
        )
        updated = await db.cotizaciones.find_one({"licitacion_id": licitacion_id})
        return cotizacion_entity(updated)
    else:
        data["created_at"] = now
        result = await db.cotizaciones.insert_one(data)
        doc = await db.cotizaciones.find_one({"_id": result.inserted_id})
        return cotizacion_entity(doc)


@router.get("/")
async def list_cotizaciones(request: Request, enrich: bool = Query(False)):
    """List all cotizaciones, newest first. When enrich=true, add licitacion data."""
    db = _get_db(request)
    cursor = db.cotizaciones.find().sort("updated_at", -1).limit(100)
    docs = await cursor.to_list(100)
    results = [cotizacion_entity(d) for d in docs]

    if enrich:
        for item in results:
            lic_id = item.get("licitacion_id")
            if lic_id:
                from db.models import str_to_mongo_id
                lic = await db.licitaciones.find_one(
                    {"_id": str_to_mongo_id(lic_id)},
                    {"opening_date": 1, "budget": 1, "estado": 1},
                )
                if lic:
                    item["opening_date"] = lic.get("opening_date")
                    item["budget"] = lic.get("budget")
                    item["estado"] = lic.get("estado")

    return results


@router.get("/{licitacion_id}")
async def get_cotizacion(licitacion_id: str, request: Request):
    """Get a single cotizacion by licitacion_id."""
    db = _get_db(request)
    doc = await db.cotizaciones.find_one({"licitacion_id": licitacion_id})
    if not doc:
        raise HTTPException(404, "Cotización no encontrada")
    return cotizacion_entity(doc)


@router.delete("/{licitacion_id}")
async def delete_cotizacion(licitacion_id: str, request: Request):
    """Delete a cotizacion."""
    db = _get_db(request)
    result = await db.cotizaciones.delete_one({"licitacion_id": licitacion_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "Cotización no encontrada")
    return {"deleted": True}


class VincularAntecedenteBody(BaseModel):
    antecedente_id: str


@router.post("/{licitacion_id}/vincular-antecedente")
async def vincular_antecedente(licitacion_id: str, body: VincularAntecedenteBody, request: Request):
    """Add an antecedente to a cotizacion."""
    db = _get_db(request)
    result = await db.cotizaciones.update_one(
        {"licitacion_id": licitacion_id},
        {"$addToSet": {"antecedentes_vinculados": body.antecedente_id}},
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Cotización no encontrada")
    doc = await db.cotizaciones.find_one({"licitacion_id": licitacion_id})
    return cotizacion_entity(doc)


@router.get("/{licitacion_id}/pdf")
async def generate_pdf(licitacion_id: str, request: Request):
    """Generate professional offer PDF for a cotizacion."""
    db = _get_db(request)
    cot = await db.cotizaciones.find_one({"licitacion_id": licitacion_id})
    if not cot:
        raise HTTPException(404, "Cotizacion not found")

    from db.models import str_to_mongo_id
    try:
        lic = await db.licitaciones.find_one({"_id": str_to_mongo_id(licitacion_id)})
    except Exception:
        lic = None
    if not lic:
        lic = {"title": cot.get("licitacion_title", ""), "organization": cot.get("organization", "")}
    else:
        lic["id"] = str(lic.pop("_id"))

    # Load company profile for brand identity
    company_profile = await db.company_profiles.find_one({"company_id": "default"})

    from services.offer_pdf_typst import generate_offer_pdf_typst
    pdf_bytes = generate_offer_pdf_typst(cot, lic, company_profile)

    filename = f"Oferta_{cot.get('licitacion_title', 'cotizacion')[:40]}.pdf".replace(" ", "_")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@router.get("/{licitacion_id}/price-intelligence")
async def get_price_intelligence(licitacion_id: str, request: Request):
    """Get price intelligence data for a licitacion."""
    db = _get_db(request)
    from services.price_intelligence import get_price_intelligence_service
    service = get_price_intelligence_service(db)
    return await service.get_price_intelligence(licitacion_id)


@router.delete("/{licitacion_id}/vincular-antecedente/{antecedente_id}")
async def desvincular_antecedente(licitacion_id: str, antecedente_id: str, request: Request):
    """Remove an antecedente from a cotizacion."""
    db = _get_db(request)
    result = await db.cotizaciones.update_one(
        {"licitacion_id": licitacion_id},
        {"$pull": {"antecedentes_vinculados": antecedente_id}},
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Cotización no encontrada")
    doc = await db.cotizaciones.find_one({"licitacion_id": licitacion_id})
    return cotizacion_entity(doc)
