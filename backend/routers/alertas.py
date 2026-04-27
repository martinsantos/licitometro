"""
Alertas hiperpersonalizadas — CRUD + test endpoint.

Admin-only (enforced by server.py ADMIN_ONLY_PREFIXES — add "/api/alertas" there).
MongoDB collection: alertas_personalizadas
"""
from __future__ import annotations

import logging
import re
from datetime import datetime
from typing import Any, Dict, List, Optional

from bson import ObjectId
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from utils.time import utc_now

logger = logging.getLogger("alertas_router")

router = APIRouter(prefix="/api/alertas", tags=["alertas"])


# ── Pydantic models ────────────────────────────────────────────────────────────

class AlertaCreate(BaseModel):
    nombre: str
    activa: bool = True
    keywords: str = ""
    presupuesto_min: Optional[float] = None
    presupuesto_max: Optional[float] = None
    fuente: Optional[str] = None
    organization: Optional[str] = None
    score_minimo: Optional[int] = None
    nodos: List[str] = []


class AlertaUpdate(BaseModel):
    nombre: Optional[str] = None
    activa: Optional[bool] = None
    keywords: Optional[str] = None
    presupuesto_min: Optional[float] = None
    presupuesto_max: Optional[float] = None
    fuente: Optional[str] = None
    organization: Optional[str] = None
    score_minimo: Optional[int] = None
    nodos: Optional[List[str]] = None


# ── Serialization helper ───────────────────────────────────────────────────────

def alertas_entity(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Convert MongoDB document to JSON-serializable dict."""
    doc = dict(doc)
    doc["id"] = str(doc.pop("_id"))
    # Serialize datetimes
    for field in ("created_at", "updated_at", "ultima_notificacion"):
        val = doc.get(field)
        if isinstance(val, datetime):
            doc[field] = val.isoformat()
    return doc


# ── Query builder ──────────────────────────────────────────────────────────────

def _build_alerta_query(alerta: Dict[str, Any]) -> Dict[str, Any]:
    """Build a MongoDB query dict from an alerta config document."""
    query: Dict[str, Any] = {}

    # Keywords → $text search
    keywords = alerta.get("keywords", "").strip()
    if keywords:
        query["$text"] = {"$search": keywords}

    # Budget range
    presupuesto_min = alerta.get("presupuesto_min")
    presupuesto_max = alerta.get("presupuesto_max")
    if presupuesto_min is not None or presupuesto_max is not None:
        budget_filter: Dict[str, float] = {}
        if presupuesto_min is not None:
            budget_filter["$gte"] = presupuesto_min
        if presupuesto_max is not None:
            budget_filter["$lte"] = presupuesto_max
        query["budget"] = budget_filter

    # Exact fuente match
    fuente = alerta.get("fuente")
    if fuente:
        query["fuente"] = {"$regex": f"^{re.escape(fuente)}$", "$options": "i"}

    # Organization (regex, partial match)
    organization = alerta.get("organization")
    if organization:
        query["organization"] = {"$regex": re.escape(organization), "$options": "i"}

    # Nodos (OR match — any of the listed slugs)
    nodos = alerta.get("nodos") or []
    if nodos:
        query["nodos"] = {"$in": nodos}

    return query


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("")
async def list_alertas(request: Request):
    """List all alertas (no pagination — expected few records)."""
    db = request.app.mongodb
    docs = await db.alertas_personalizadas.find({}).sort("created_at", -1).to_list(length=200)
    return [alertas_entity(d) for d in docs]


@router.post("")
async def create_alerta(alerta_in: AlertaCreate, request: Request):
    """Create a new alerta."""
    db = request.app.mongodb
    now = utc_now()
    doc = {
        **alerta_in.model_dump(),
        "created_at": now,
        "updated_at": now,
        "ultima_notificacion": None,
    }
    result = await db.alertas_personalizadas.insert_one(doc)
    created = await db.alertas_personalizadas.find_one({"_id": result.inserted_id})
    return alertas_entity(created)


@router.put("/{alerta_id}")
async def update_alerta(alerta_id: str, alerta_in: AlertaUpdate, request: Request):
    """Partial update of an alerta."""
    db = request.app.mongodb
    try:
        oid = ObjectId(alerta_id)
    except Exception:
        raise HTTPException(status_code=400, detail="ID inválido")

    existing = await db.alertas_personalizadas.find_one({"_id": oid})
    if not existing:
        raise HTTPException(status_code=404, detail="Alerta no encontrada")

    update_data = {k: v for k, v in alerta_in.model_dump().items() if v is not None}
    if not update_data:
        return alertas_entity(existing)

    update_data["updated_at"] = utc_now()
    await db.alertas_personalizadas.update_one({"_id": oid}, {"$set": update_data})
    updated = await db.alertas_personalizadas.find_one({"_id": oid})
    return alertas_entity(updated)


@router.delete("/{alerta_id}")
async def delete_alerta(alerta_id: str, request: Request):
    """Delete an alerta by ID."""
    db = request.app.mongodb
    try:
        oid = ObjectId(alerta_id)
    except Exception:
        raise HTTPException(status_code=400, detail="ID inválido")

    result = await db.alertas_personalizadas.delete_one({"_id": oid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Alerta no encontrada")
    return {"ok": True, "deleted": alerta_id}


@router.post("/{alerta_id}/test")
async def test_alerta(alerta_id: str, request: Request):
    """
    Manually test an alerta against recent licitaciones.
    Returns up to 5 matching licitaciones.
    If score_minimo is set, only licitaciones that have a `requisitos` field are considered.
    """
    db = request.app.mongodb
    try:
        oid = ObjectId(alerta_id)
    except Exception:
        raise HTTPException(status_code=400, detail="ID inválido")

    alerta = await db.alertas_personalizadas.find_one({"_id": oid})
    if not alerta:
        raise HTTPException(status_code=404, detail="Alerta no encontrada")

    query = _build_alerta_query(alerta)

    # If score_minimo is set, restrict to licitaciones that have requisitos
    score_minimo = alerta.get("score_minimo")
    if score_minimo is not None:
        query["requisitos"] = {"$exists": True}

    projection = {
        "title": 1,
        "objeto": 1,
        "organization": 1,
        "budget": 1,
        "opening_date": 1,
        "requisitos": 1,
    }

    try:
        # Use textScore sort when $text search is present
        if "$text" in query:
            cursor = (
                db.licitaciones.find(query, {**projection, "score": {"$meta": "textScore"}})
                .sort([("score", {"$meta": "textScore"})])
                .limit(5)
            )
        else:
            cursor = (
                db.licitaciones.find(query, projection)
                .sort("fecha_scraping", -1)
                .limit(5)
            )
        docs = await cursor.to_list(length=5)
    except Exception as e:
        logger.error(f"test_alerta query failed: {e}")
        raise HTTPException(status_code=500, detail=f"Error ejecutando búsqueda: {e}")

    results = []
    for doc in docs:
        item: Dict[str, Any] = {
            "id": str(doc["_id"]),
            "title": doc.get("title", ""),
            "objeto": doc.get("objeto"),
            "organization": doc.get("organization", ""),
            "budget": doc.get("budget"),
            "opening_date": doc.get("opening_date").isoformat() if doc.get("opening_date") else None,
        }
        if "score" in doc:
            item["score"] = doc["score"]
        results.append(item)

    return {
        "alerta_id": alerta_id,
        "alerta_nombre": alerta.get("nombre"),
        "query_summary": {
            "keywords": alerta.get("keywords", ""),
            "fuente": alerta.get("fuente"),
            "organization": alerta.get("organization"),
            "presupuesto_min": alerta.get("presupuesto_min"),
            "presupuesto_max": alerta.get("presupuesto_max"),
            "nodos": alerta.get("nodos", []),
            "score_minimo": score_minimo,
        },
        "total": len(results),
        "items": results,
    }
