"""Company Context — Profile + Zone/Process configuration for CotizAR."""

import logging
import re
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, HTTPException, Query, Request

from db.models import company_profile_entity, company_context_entity
from models.company_context import (
    TIPOS_PROCESO,
    CompanyProfileCreate,
    CompanyProfileUpdate,
    CompanyContextCreate,
    CompanyContextUpdate,
)

logger = logging.getLogger("company_context")

router = APIRouter(
    prefix="/api/company-context",
    tags=["company-context"],
)


def _get_db(request: Request):
    return request.app.mongodb


# ─── Company Profile (singleton for Phase 1) ───


@router.get("/profile")
async def get_profile(request: Request):
    """Get company profile (singleton)."""
    db = _get_db(request)
    doc = await db.company_profiles.find_one({"company_id": "default"})
    if not doc:
        return {
            "id": None, "company_id": "default", "nombre": "", "cuit": "",
            "email": "", "telefono": "", "domicilio": "",
            "numero_proveedor_estado": "", "rubros_inscriptos": [],
            "representante_legal": "", "cargo_representante": "",
            "onboarding_completed": False,
        }
    return company_profile_entity(doc)


@router.put("/profile")
async def upsert_profile(body: CompanyProfileCreate, request: Request):
    """Upsert company profile."""
    db = _get_db(request)
    now = datetime.now(timezone.utc)
    data = body.model_dump()
    data["company_id"] = "default"
    data["updated_at"] = now

    existing = await db.company_profiles.find_one({"company_id": "default"})
    if existing:
        await db.company_profiles.update_one(
            {"company_id": "default"}, {"$set": data}
        )
    else:
        data["created_at"] = now
        await db.company_profiles.insert_one(data)

    doc = await db.company_profiles.find_one({"company_id": "default"})
    return company_profile_entity(doc)


@router.patch("/profile")
async def patch_profile(body: CompanyProfileUpdate, request: Request):
    """Partial update of company profile."""
    db = _get_db(request)
    update_data = {k: v for k, v in body.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(400, "No fields to update")
    update_data["updated_at"] = datetime.now(timezone.utc)

    existing = await db.company_profiles.find_one({"company_id": "default"})
    if not existing:
        # Create with defaults + patch
        full = CompanyProfileCreate().model_dump()
        full.update(update_data)
        full["created_at"] = update_data["updated_at"]
        await db.company_profiles.insert_one(full)
    else:
        await db.company_profiles.update_one(
            {"company_id": "default"}, {"$set": update_data}
        )

    doc = await db.company_profiles.find_one({"company_id": "default"})
    return company_profile_entity(doc)


@router.get("/onboarding-status")
async def onboarding_status(request: Request):
    """Check if onboarding is completed."""
    db = _get_db(request)
    doc = await db.company_profiles.find_one(
        {"company_id": "default"}, {"onboarding_completed": 1}
    )
    return {"completed": bool(doc and doc.get("onboarding_completed"))}


# ─── Process Types ───


@router.get("/tipos-proceso")
async def get_tipos_proceso():
    """Return available process types."""
    return TIPOS_PROCESO


# ─── Zone Contexts ───


@router.get("/zones")
async def list_zones(request: Request):
    """List all configured zone contexts."""
    db = _get_db(request)
    cursor = db.company_contexts.find({"company_id": "default"}).sort("zona", 1)
    docs = await cursor.to_list(200)
    return [company_context_entity(d) for d in docs]


@router.get("/zones/available")
async def available_zones(request: Request):
    """Distinct organizations from licitaciones for zone picker."""
    db = _get_db(request)
    orgs = await db.licitaciones.distinct("organization")
    # Filter empty/null and sort
    return sorted([o for o in orgs if o and o.strip()])


@router.post("/zones")
async def create_zone(body: CompanyContextCreate, request: Request):
    """Create a zone + process type context."""
    db = _get_db(request)
    now = datetime.now(timezone.utc)
    data = body.model_dump()
    data["company_id"] = "default"
    data["created_at"] = now
    data["updated_at"] = now

    # Serialize antecedentes (list of dicts)
    if data.get("antecedentes"):
        data["antecedentes"] = [
            a if isinstance(a, dict) else a.model_dump()
            for a in data["antecedentes"]
        ]

    # Check for duplicate zona + tipo_proceso
    existing = await db.company_contexts.find_one({
        "company_id": "default",
        "zona": body.zona,
        "tipo_proceso": body.tipo_proceso,
    })
    if existing:
        raise HTTPException(409, f"Ya existe configuracion para {body.zona} + {body.tipo_proceso}")

    result = await db.company_contexts.insert_one(data)
    doc = await db.company_contexts.find_one({"_id": result.inserted_id})
    return company_context_entity(doc)


@router.put("/zones/{zone_id}")
async def update_zone(zone_id: str, body: CompanyContextUpdate, request: Request):
    """Update a zone context."""
    db = _get_db(request)
    try:
        existing = await db.company_contexts.find_one({"_id": ObjectId(zone_id)})
    except Exception:
        existing = None
    if not existing:
        raise HTTPException(404, "Contexto de zona no encontrado")

    update_data = {k: v for k, v in body.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(400, "No fields to update")
    update_data["updated_at"] = datetime.now(timezone.utc)

    # Serialize antecedentes
    if "antecedentes" in update_data and update_data["antecedentes"]:
        update_data["antecedentes"] = [
            a if isinstance(a, dict) else a.model_dump()
            for a in update_data["antecedentes"]
        ]

    await db.company_contexts.update_one(
        {"_id": ObjectId(zone_id)}, {"$set": update_data}
    )
    doc = await db.company_contexts.find_one({"_id": ObjectId(zone_id)})
    return company_context_entity(doc)


@router.delete("/zones/{zone_id}")
async def delete_zone(zone_id: str, request: Request):
    """Delete a zone context."""
    db = _get_db(request)
    result = await db.company_contexts.delete_one({"_id": ObjectId(zone_id)})
    if result.deleted_count == 0:
        raise HTTPException(404, "Contexto de zona no encontrado")
    return {"deleted": True}


@router.get("/zones/match")
async def match_zone(
    request: Request,
    organization: str = Query(""),
    tipo: str = Query(""),
):
    """Find best matching context for a licitacion's organization + tipo_procedimiento."""
    db = _get_db(request)
    if not organization:
        return None

    # 1. Exact match
    query = {"company_id": "default", "zona": organization}
    if tipo:
        query["tipo_proceso"] = tipo
    doc = await db.company_contexts.find_one(query)
    if doc:
        return company_context_entity(doc)

    # 2. Contains match (organization contains zona or vice versa)
    all_contexts = await db.company_contexts.find(
        {"company_id": "default"}
    ).to_list(200)

    org_lower = organization.lower()
    best = None
    best_score = 0
    for ctx in all_contexts:
        zona_lower = ctx.get("zona", "").lower()
        if not zona_lower:
            continue
        # Check containment both ways
        if zona_lower in org_lower or org_lower in zona_lower:
            score = len(zona_lower)  # Longer match = more specific
            if tipo and ctx.get("tipo_proceso") == tipo:
                score += 100  # Boost for tipo match
            if score > best_score:
                best = ctx
                best_score = score

    # 3. Fallback to "General" zona
    if not best:
        fallback_query = {"company_id": "default", "zona": "General"}
        if tipo:
            fallback_query["tipo_proceso"] = tipo
        best = await db.company_contexts.find_one(fallback_query)
        if not best:
            best = await db.company_contexts.find_one(
                {"company_id": "default", "zona": "General"}
            )

    if best:
        return company_context_entity(best)
    return None
