from fastapi import APIRouter, HTTPException, Body, Request
from typing import Dict, Any
from datetime import datetime
from bson import ObjectId
import logging
from utils.time import utc_now

logger = logging.getLogger("licitaciones_presets_router")

router = APIRouter(
    prefix="/api/licitaciones",
    tags=["licitaciones-presets"],
    responses={404: {"description": "Not found"}}
)


@router.get("/presets")
async def list_presets(request: Request):
    """List all saved filter presets."""
    db = request.app.mongodb
    cursor = db.filter_presets.find().sort("created_at", -1)
    docs = await cursor.to_list(length=20)
    presets = []
    for doc in docs:
        doc["_id"] = str(doc["_id"])
        presets.append(doc)
    return presets


@router.post("/presets")
async def create_preset(body: Dict[str, Any] = Body(...), request: Request = None):
    """Create a saved filter preset. Max 10."""
    db = request.app.mongodb
    count = await db.filter_presets.count_documents({})
    if count >= 10:
        raise HTTPException(status_code=400, detail="Maximo 10 presets permitidos")

    doc = {
        "name": body.get("name", "Sin nombre"),
        "filters": body.get("filters", {}),
        "sort_by": body.get("sort_by", "publication_date"),
        "sort_order": body.get("sort_order", "desc"),
        "is_default": body.get("is_default", False),
        "created_at": utc_now(),
    }
    result = await db.filter_presets.insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc


@router.delete("/presets/{preset_id}")
async def delete_preset(preset_id: str, request: Request = None):
    """Delete a saved filter preset."""
    db = request.app.mongodb
    try:
        oid = ObjectId(preset_id)
    except Exception:
        raise HTTPException(status_code=400, detail="ID invalido")
    result = await db.filter_presets.delete_one({"_id": oid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Preset no encontrado")
    return {"ok": True}


@router.get("/favorites")
async def get_favorites(request: Request):
    """Get all favorite licitacion IDs"""
    db = request.app.mongodb
    cursor = db.favorites.find({}, {"licitacion_id": 1, "_id": 0})
    docs = await cursor.to_list(length=5000)
    return [doc["licitacion_id"] for doc in docs]


@router.post("/favorites/{licitacion_id}")
async def add_favorite(licitacion_id: str, request: Request):
    """Add a licitacion to favorites"""
    db = request.app.mongodb
    await db.favorites.update_one(
        {"licitacion_id": licitacion_id},
        {"$set": {"licitacion_id": licitacion_id, "created_at": utc_now()}},
        upsert=True,
    )
    return {"ok": True, "licitacion_id": licitacion_id}


@router.delete("/favorites/{licitacion_id}")
async def remove_favorite(licitacion_id: str, request: Request):
    """Remove a licitacion from favorites"""
    db = request.app.mongodb
    await db.favorites.delete_one({"licitacion_id": licitacion_id})
    return {"ok": True, "licitacion_id": licitacion_id}
