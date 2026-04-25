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


from db import get_db
from config.company import DEFAULT_COMPANY_ID


# ─── Company Profiles (multi-company) ───


@router.get("/profiles")
async def list_profiles(request: Request):
    """List all company profiles."""
    db = get_db(request)
    docs = await db.company_profiles.find().sort("nombre", 1).to_list(50)
    return [company_profile_entity(d) for d in docs]


@router.post("/profiles")
async def create_profile(body: CompanyProfileCreate, request: Request):
    """Create a new company profile."""
    db = get_db(request)
    now = datetime.now(timezone.utc)
    data = body.model_dump()
    # Generate unique company_id from ObjectId
    data["created_at"] = now
    data["updated_at"] = now
    result = await db.company_profiles.insert_one(data)
    # Set company_id to the generated _id string
    cid = str(result.inserted_id)
    await db.company_profiles.update_one(
        {"_id": result.inserted_id}, {"$set": {"company_id": cid}}
    )
    doc = await db.company_profiles.find_one({"_id": result.inserted_id})
    return company_profile_entity(doc)


@router.put("/profiles/{profile_id}")
async def update_profile_by_id(profile_id: str, body: CompanyProfileCreate, request: Request):
    """Update a company profile by ID."""
    db = get_db(request)
    try:
        existing = await db.company_profiles.find_one({"_id": ObjectId(profile_id)})
    except Exception:
        existing = None
    if not existing:
        raise HTTPException(404, "Empresa no encontrada")

    data = body.model_dump()
    data["updated_at"] = datetime.now(timezone.utc)
    data["company_id"] = existing.get("company_id", str(existing["_id"]))
    await db.company_profiles.update_one(
        {"_id": ObjectId(profile_id)}, {"$set": data}
    )
    doc = await db.company_profiles.find_one({"_id": ObjectId(profile_id)})
    return company_profile_entity(doc)


@router.delete("/profiles/{profile_id}")
async def delete_profile(profile_id: str, request: Request):
    """Delete a company profile."""
    db = get_db(request)
    result = await db.company_profiles.delete_one({"_id": ObjectId(profile_id)})
    if result.deleted_count == 0:
        raise HTTPException(404, "Empresa no encontrada")
    return {"deleted": True}


# ─── Legacy singleton endpoints (backward compat) ───


@router.get("/profile")
async def get_profile(request: Request):
    """Get company profile (singleton — backward compat)."""
    db = get_db(request)
    doc = await db.company_profiles.find_one({"company_id": DEFAULT_COMPANY_ID})
    if not doc:
        # Return first profile if exists
        doc = await db.company_profiles.find_one()
    if not doc:
        return {
            "id": None, "company_id": DEFAULT_COMPANY_ID, "nombre": "", "cuit": "",
            "email": "", "telefono": "", "domicilio": "",
            "numero_proveedor_estado": "", "rubros_inscriptos": [],
            "representante_legal": "", "cargo_representante": "",
            "onboarding_completed": False, "brand_config": None,
        }
    return company_profile_entity(doc)


@router.put("/profile")
async def upsert_profile(body: CompanyProfileCreate, request: Request):
    """Upsert company profile (singleton — backward compat)."""
    db = get_db(request)
    now = datetime.now(timezone.utc)
    data = body.model_dump()
    data["company_id"] = DEFAULT_COMPANY_ID
    data["updated_at"] = now

    existing = await db.company_profiles.find_one({"company_id": DEFAULT_COMPANY_ID})
    if existing:
        await db.company_profiles.update_one(
            {"company_id": DEFAULT_COMPANY_ID}, {"$set": data}
        )
    else:
        data["created_at"] = now
        await db.company_profiles.insert_one(data)

    doc = await db.company_profiles.find_one({"company_id": DEFAULT_COMPANY_ID})
    return company_profile_entity(doc)


@router.patch("/profile")
async def patch_profile(body: CompanyProfileUpdate, request: Request):
    """Partial update of company profile (singleton — backward compat)."""
    db = get_db(request)
    update_data = {k: v for k, v in body.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(400, "No fields to update")
    update_data["updated_at"] = datetime.now(timezone.utc)

    existing = await db.company_profiles.find_one({"company_id": DEFAULT_COMPANY_ID})
    if not existing:
        # Create with defaults + patch
        full = CompanyProfileCreate().model_dump()
        full.update(update_data)
        full["created_at"] = update_data["updated_at"]
        await db.company_profiles.insert_one(full)
    else:
        await db.company_profiles.update_one(
            {"company_id": DEFAULT_COMPANY_ID}, {"$set": update_data}
        )

    doc = await db.company_profiles.find_one({"company_id": DEFAULT_COMPANY_ID})
    return company_profile_entity(doc)


@router.get("/onboarding-status")
async def onboarding_status(request: Request):
    """Check if onboarding is completed."""
    db = get_db(request)
    doc = await db.company_profiles.find_one(
        {"company_id": DEFAULT_COMPANY_ID}, {"onboarding_completed": 1}
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
    db = get_db(request)
    cursor = db.company_contexts.find({"company_id": DEFAULT_COMPANY_ID}).sort("zona", 1)
    docs = await cursor.to_list(200)
    return [company_context_entity(d) for d in docs]


@router.get("/zones/available")
async def available_zones(request: Request):
    """Distinct organizations from licitaciones for zone picker."""
    db = get_db(request)
    orgs = await db.licitaciones.distinct("organization")
    # Filter empty/null and sort
    return sorted([o for o in orgs if o and o.strip()])


@router.post("/zones")
async def create_zone(body: CompanyContextCreate, request: Request):
    """Create a zone + process type context."""
    db = get_db(request)
    now = datetime.now(timezone.utc)
    data = body.model_dump()
    data["company_id"] = DEFAULT_COMPANY_ID
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
        "company_id": DEFAULT_COMPANY_ID,
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
    db = get_db(request)
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
    db = get_db(request)
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
    db = get_db(request)
    if not organization:
        return None

    from services.zone_matcher import find_best_zone
    doc = await find_best_zone(db, organization, tipo)
    if doc:
        return company_context_entity(doc)
    return None


# ─── Site Credentials (HUNTER integration) ───


@router.get("/credentials")
async def list_credentials(request: Request):
    """List all site credentials for HUNTER."""
    db = get_db(request)
    docs = await db.site_credentials.find().to_list(50)
    return [
        {
            "id": str(d["_id"]),
            "site_name": d.get("site_name", ""),
            "site_url": d.get("site_url", ""),
            "username": d.get("username", ""),
            "password": "••••••••",  # Never expose passwords in GET
            "enabled": d.get("enabled", True),
            "last_used": d.get("last_used"),
            "last_status": d.get("last_status", ""),
            "notes": d.get("notes", ""),
        }
        for d in docs
    ]


@router.post("/credentials")
async def create_credential(body: dict, request: Request):
    """Create a new site credential."""
    db = get_db(request)
    now = datetime.now(timezone.utc)
    doc = {
        "site_name": body.get("site_name", ""),
        "site_url": body.get("site_url", ""),
        "username": body.get("username", ""),
        "password": body.get("password", ""),
        "enabled": body.get("enabled", True),
        "notes": body.get("notes", ""),
        "created_at": now,
        "updated_at": now,
        "last_used": None,
        "last_status": "",
    }
    result = await db.site_credentials.insert_one(doc)
    doc["id"] = str(result.inserted_id)
    doc.pop("_id", None)
    doc["password"] = "••••••••"
    return doc


@router.put("/credentials/{cred_id}")
async def update_credential(cred_id: str, body: dict, request: Request):
    """Update a site credential."""
    db = get_db(request)
    update = {"updated_at": datetime.now(timezone.utc)}
    for field in ("site_name", "site_url", "username", "enabled", "notes"):
        if field in body:
            update[field] = body[field]
    # Only update password if provided and not masked
    if body.get("password") and body["password"] != "••••••••":
        update["password"] = body["password"]

    result = await db.site_credentials.update_one(
        {"_id": ObjectId(cred_id)}, {"$set": update}
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Credential not found")
    return {"ok": True}


@router.delete("/credentials/{cred_id}")
async def delete_credential(cred_id: str, request: Request):
    """Delete a site credential."""
    db = get_db(request)
    result = await db.site_credentials.delete_one({"_id": ObjectId(cred_id)})
    if result.deleted_count == 0:
        raise HTTPException(404, "Credential not found")
    return {"ok": True}


@router.get("/credentials/for-site")
async def get_credential_for_site(request: Request, site_url: str = Query("")):
    """Get active credential for a specific site URL (internal use by HUNTER)."""
    db = get_db(request)
    if not site_url:
        return None
    # Match by site_url substring
    doc = await db.site_credentials.find_one({
        "enabled": True,
        "site_url": {"$regex": re.escape(site_url.split("//")[-1].split("/")[0]), "$options": "i"},
    })
    if doc:
        return {
            "username": doc.get("username", ""),
            "password": doc.get("password", ""),
            "site_name": doc.get("site_name", ""),
        }
    return None


@router.get("/profiles/{company_id}/score/{licitacion_id}")
async def get_affinity_score(company_id: str, licitacion_id: str, request: Request):
    """Compute affinity score between a company profile and a licitacion's extracted requirements.

    Returns a 0-100 score with explainable reasons. The licitacion must have had
    POST /api/licitaciones/{id}/requisitos called first to populate the requisitos field.
    """
    db = get_db(request)
    profile = await db.company_profiles.find_one({"company_id": company_id})
    if not profile:
        raise HTTPException(404, f"Perfil de empresa '{company_id}' no encontrado")

    try:
        from bson import ObjectId as _OID
        lic = await db.licitaciones.find_one({"_id": _OID(licitacion_id)})
    except Exception:
        lic = None
    if not lic:
        raise HTTPException(404, "Licitación no encontrada")

    requisitos = lic.get("requisitos") or {}

    from services.match_score_service import match_score
    result = match_score(profile, requisitos)
    result["company_id"] = company_id
    result["licitacion_id"] = licitacion_id
    result["requisitos_available"] = bool(requisitos)
    return result
