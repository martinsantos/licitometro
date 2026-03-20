"""CotizAR AI Router - AI-powered bid assistance endpoints."""

import json
import logging
import sys
from pathlib import Path
from typing import Any, Dict

from bson import ObjectId
from fastapi import APIRouter, HTTPException, Request

sys.path.insert(0, str(Path(__file__).parent.parent))

from services.groq_enrichment import get_groq_enrichment_service

logger = logging.getLogger("cotizar_ai")

router = APIRouter(
    prefix="/api/cotizar-ai",
    tags=["cotizar-ai"],
)


def _get_db(request: Request):
    return request.app.mongodb


@router.post("/suggest-propuesta")
async def suggest_propuesta(body: Dict[str, Any], request: Request):
    """Generate AI-powered technical proposal suggestion."""
    db = _get_db(request)
    licitacion_id = body.get("licitacion_id")
    if not licitacion_id:
        raise HTTPException(400, "licitacion_id required")

    try:
        lic = await db.licitaciones.find_one({"_id": ObjectId(licitacion_id)})
    except Exception:
        lic = None
    if not lic:
        raise HTTPException(404, "Licitacion not found")

    context = f"""Objeto: {lic.get('objeto') or lic.get('title', '')}
Descripción: {(lic.get('description') or '')[:2000]}
Categoría: {lic.get('category', 'N/A')}
Organismo: {lic.get('organization', 'N/A')}
Presupuesto: ${lic.get('budget', 'N/A')}"""

    groq = get_groq_enrichment_service()
    result = await groq.suggest_propuesta(context)
    return result


@router.post("/search-antecedentes")
async def search_antecedentes(body: Dict[str, Any], request: Request):
    """Search for similar past tenders as reference."""
    db = _get_db(request)
    licitacion_id = body.get("licitacion_id")
    if not licitacion_id:
        raise HTTPException(400, "licitacion_id required")

    try:
        lic = await db.licitaciones.find_one({"_id": ObjectId(licitacion_id)})
    except Exception:
        lic = None
    if not lic:
        raise HTTPException(404, "Licitacion not found")

    # Build query: same category + closed/archived
    query = {"estado": {"$in": ["vencida", "archivada"]}}
    if lic.get("category"):
        query["category"] = lic["category"]

    # Add keyword matching if available
    keywords = lic.get("keywords", [])
    if keywords:
        query["keywords"] = {"$in": keywords[:5]}

    antecedentes = await db.licitaciones.find(query).sort(
        "publication_date", -1
    ).limit(5).to_list(5)

    return [
        {
            "id": str(a["_id"]),
            "title": a.get("title", ""),
            "objeto": a.get("objeto", ""),
            "organization": a.get("organization", ""),
            "budget": a.get("budget"),
            "publication_date": str(a.get("publication_date", "")),
        }
        for a in antecedentes
    ]


@router.post("/analyze-bid")
async def analyze_bid(body: Dict[str, Any], request: Request):
    """Run comprehensive AI analysis on a bid."""
    db = _get_db(request)
    licitacion_id = body.get("licitacion_id")
    if not licitacion_id:
        raise HTTPException(400, "licitacion_id required")

    try:
        lic = await db.licitaciones.find_one({"_id": ObjectId(licitacion_id)})
    except Exception:
        lic = None
    if not lic:
        raise HTTPException(404, "Licitacion not found")

    items_str = json.dumps(body.get("items", []), ensure_ascii=False)[:500]

    context = f"""LICITACIÓN:
Objeto: {lic.get('objeto') or lic.get('title', '')}
Presupuesto: ${lic.get('budget', 'N/A')}
Tipo: {lic.get('tipo_procedimiento', 'N/A')}
Organismo: {lic.get('organization', 'N/A')}

COTIZACIÓN:
Total: ${body.get('total', 0)}
Items: {items_str}
Metodología: {body.get('metodologia', 'N/A')[:300]}
Empresa: {body.get('empresa_nombre', 'N/A')}"""

    groq = get_groq_enrichment_service()
    return await groq.analyze_bid(context)
