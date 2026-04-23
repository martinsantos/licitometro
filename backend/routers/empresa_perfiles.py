"""
Router: /api/empresa-perfiles — CRUD de perfiles de empresa.
Admin-only (enforced by server.py ADMIN_ONLY_PREFIXES for /api/empresa/).
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from bson import ObjectId
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from utils.time import utc_now

logger = logging.getLogger("empresa_perfiles_router")

router = APIRouter(prefix="/api/empresa-perfiles", tags=["empresa_perfiles"])


def _db(request: Request):
    return request.app.mongodb


def _serialize(doc: Dict[str, Any]) -> Dict[str, Any]:
    doc["id"] = str(doc.pop("_id"))
    return doc


# ── Pydantic models ───────────────────────────────────────────────────────────

class EmpresaPerfilBody(BaseModel):
    nombre: str
    cuit: Optional[str] = None
    rubro: Optional[str] = None
    descripcion: Optional[str] = None
    contacto: Optional[str] = None
    email: Optional[str] = None
    telefono: Optional[str] = None
    direccion: Optional[str] = None
    web: Optional[str] = None
    notas: Optional[str] = None
    activo: bool = True
    metadata: Optional[Dict[str, Any]] = None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("")
async def list_perfiles(request: Request):
    """Listar todos los perfiles de empresa."""
    db = _db(request)
    cursor = db.empresa_perfiles.find({}).sort("nombre", 1)
    docs = await cursor.to_list(200)
    return {"perfiles": [_serialize(d) for d in docs], "total": len(docs)}


@router.get("/{perfil_id}")
async def get_perfil(perfil_id: str, request: Request):
    """Obtener un perfil por ID."""
    db = _db(request)
    try:
        oid = ObjectId(perfil_id)
    except Exception:
        raise HTTPException(400, "ID inválido")
    doc = await db.empresa_perfiles.find_one({"_id": oid})
    if not doc:
        raise HTTPException(404, "Perfil no encontrado")
    return _serialize(doc)


@router.put("/{perfil_id}")
async def upsert_perfil(perfil_id: str, body: EmpresaPerfilBody, request: Request):
    """Crear o actualizar un perfil de empresa (upsert por ID).
    Para crear uno nuevo usar el literal 'new' como perfil_id."""
    db = _db(request)
    now = utc_now()

    if perfil_id == "new":
        # Create
        doc = body.model_dump()
        doc["created_at"] = now
        doc["updated_at"] = now
        result = await db.empresa_perfiles.insert_one(doc)
        created = await db.empresa_perfiles.find_one({"_id": result.inserted_id})
        return _serialize(created)

    try:
        oid = ObjectId(perfil_id)
    except Exception:
        raise HTTPException(400, "ID inválido")

    update_data = body.model_dump()
    update_data["updated_at"] = now

    result = await db.empresa_perfiles.find_one_and_update(
        {"_id": oid},
        {"$set": update_data, "$setOnInsert": {"created_at": now}},
        upsert=True,
        return_document=True,
    )
    return _serialize(result)


@router.delete("/{perfil_id}")
async def delete_perfil(perfil_id: str, request: Request):
    """Eliminar un perfil de empresa."""
    db = _db(request)
    try:
        oid = ObjectId(perfil_id)
    except Exception:
        raise HTTPException(400, "ID inválido")
    result = await db.empresa_perfiles.delete_one({"_id": oid})
    if result.deleted_count == 0:
        raise HTTPException(404, "Perfil no encontrado")
    return {"deleted": True, "id": perfil_id}
