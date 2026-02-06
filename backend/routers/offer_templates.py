"""
Offer Templates Router - API endpoints for managing offer templates and applications.
"""

from fastapi import APIRouter, HTTPException, Request, Body
from typing import Optional, List
from datetime import datetime
from bson import ObjectId
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from models.offer_template import OfferTemplateCreate, OfferTemplateUpdate
from models.offer_application import OfferChecklistItem
from db.models import offer_template_entity, offer_application_entity

router = APIRouter(
    prefix="/api/offer-templates",
    tags=["offer-templates"],
    responses={404: {"description": "Not found"}},
)


# ──────────────────────────────────────────────────────────────
# Template CRUD
# ──────────────────────────────────────────────────────────────

@router.post("/")
async def create_template(request: Request, body: dict = Body(...)):
    """Create a new offer template."""
    db = request.app.mongodb
    template_data = OfferTemplateCreate(**body)

    doc = template_data.dict()
    doc["created_at"] = datetime.utcnow()
    doc["updated_at"] = datetime.utcnow()
    doc["usage_count"] = 0

    result = await db.offer_templates.insert_one(doc)
    created = await db.offer_templates.find_one({"_id": result.inserted_id})
    return offer_template_entity(created)


@router.get("/")
async def list_templates(
    request: Request,
    template_type: Optional[str] = None,
    rubro: Optional[str] = None,
):
    """List all offer templates, optionally filtered by type or rubro."""
    db = request.app.mongodb
    query = {}

    if template_type:
        query["template_type"] = template_type
    if rubro:
        query["applicable_rubros"] = {"$in": [rubro]}

    cursor = db.offer_templates.find(query).sort("updated_at", -1)
    templates = []
    async for doc in cursor:
        templates.append(offer_template_entity(doc))
    return templates


@router.get("/applications/{licitacion_id}")
async def get_application_for_licitacion(
    licitacion_id: str,
    request: Request,
):
    """Get the active offer application for a licitacion."""
    db = request.app.mongodb
    app_doc = await db.offer_applications.find_one({
        "licitacion_id": licitacion_id,
        "status": {"$ne": "abandoned"},
    })
    if not app_doc:
        return None
    return offer_application_entity(app_doc)


@router.get("/{template_id}")
async def get_template(template_id: str, request: Request):
    """Get a single offer template by ID."""
    db = request.app.mongodb

    # Try ObjectId first, then string match
    try:
        doc = await db.offer_templates.find_one({"_id": ObjectId(template_id)})
    except Exception:
        doc = None

    if not doc:
        raise HTTPException(status_code=404, detail="Template not found")
    return offer_template_entity(doc)


@router.put("/{template_id}")
async def update_template(
    template_id: str,
    request: Request,
    body: dict = Body(...),
):
    """Update an offer template."""
    db = request.app.mongodb
    update_data = OfferTemplateUpdate(**body)

    # Build update dict, removing None values
    update_dict = {k: v for k, v in update_data.dict().items() if v is not None}
    if not update_dict:
        raise HTTPException(status_code=400, detail="No fields to update")

    update_dict["updated_at"] = datetime.utcnow()

    # Convert sections to dicts if present
    if "sections" in update_dict:
        update_dict["sections"] = [
            s if isinstance(s, dict) else s
            for s in update_dict["sections"]
        ]

    try:
        result = await db.offer_templates.update_one(
            {"_id": ObjectId(template_id)},
            {"$set": update_dict},
        )
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid template ID")

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Template not found")

    updated = await db.offer_templates.find_one({"_id": ObjectId(template_id)})
    return offer_template_entity(updated)


@router.delete("/{template_id}")
async def delete_template(template_id: str, request: Request):
    """Delete an offer template."""
    db = request.app.mongodb
    try:
        result = await db.offer_templates.delete_one({"_id": ObjectId(template_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid template ID")

    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Template not found")

    return {"success": True, "message": "Template deleted"}


# ──────────────────────────────────────────────────────────────
# Apply template to licitacion
# ──────────────────────────────────────────────────────────────

@router.post("/{template_id}/apply/{licitacion_id}")
async def apply_template(
    template_id: str,
    licitacion_id: str,
    request: Request,
):
    """Apply an offer template to a licitacion, creating an OfferApplication."""
    db = request.app.mongodb

    # Load the template
    try:
        template_doc = await db.offer_templates.find_one({"_id": ObjectId(template_id)})
    except Exception:
        template_doc = None

    if not template_doc:
        raise HTTPException(status_code=404, detail="Template not found")

    # Check the licitacion exists
    try:
        lic_doc = await db.licitaciones.find_one({"_id": ObjectId(licitacion_id)})
    except Exception:
        lic_doc = None

    if not lic_doc:
        raise HTTPException(status_code=404, detail="Licitacion not found")

    # Check if there's already an active application
    existing = await db.offer_applications.find_one({
        "licitacion_id": licitacion_id,
        "status": {"$ne": "abandoned"},
    })
    if existing:
        raise HTTPException(
            status_code=409,
            detail="An active application already exists for this licitacion",
        )

    # Build checklist from template sections
    checklist = []
    for section in template_doc.get("sections", []):
        for item_text in section.get("checklist_items", []):
            checklist.append({
                "section_name": section["name"],
                "item_text": item_text,
                "completed": False,
                "completed_at": None,
                "notes": None,
            })

    application_doc = {
        "licitacion_id": licitacion_id,
        "template_id": template_id,
        "template_name": template_doc["name"],
        "checklist": checklist,
        "progress_percent": 0.0,
        "status": "in_progress",
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }

    result = await db.offer_applications.insert_one(application_doc)

    # Increment usage count
    await db.offer_templates.update_one(
        {"_id": ObjectId(template_id)},
        {"$inc": {"usage_count": 1}},
    )

    created = await db.offer_applications.find_one({"_id": result.inserted_id})
    return offer_application_entity(created)


# ──────────────────────────────────────────────────────────────
# Update application checklist
# ──────────────────────────────────────────────────────────────

@router.put("/applications/{application_id}/checklist")
async def update_checklist(
    application_id: str,
    request: Request,
    body: dict = Body(...),
):
    """Update the checklist and progress of an offer application."""
    db = request.app.mongodb

    checklist_data = body.get("checklist", [])
    status = body.get("status")

    # Calculate progress
    total = len(checklist_data)
    completed = sum(1 for item in checklist_data if item.get("completed"))
    progress = (completed / total * 100) if total > 0 else 0.0

    update_dict = {
        "checklist": checklist_data,
        "progress_percent": round(progress, 1),
        "updated_at": datetime.utcnow(),
    }

    if status:
        update_dict["status"] = status

    # Auto-complete if all items are done
    if total > 0 and completed == total:
        update_dict["status"] = "completed"

    try:
        result = await db.offer_applications.update_one(
            {"_id": ObjectId(application_id)},
            {"$set": update_dict},
        )
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid application ID")

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Application not found")

    updated = await db.offer_applications.find_one({"_id": ObjectId(application_id)})
    return offer_application_entity(updated)
