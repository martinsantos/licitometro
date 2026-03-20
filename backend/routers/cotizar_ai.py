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


async def _get_company_context_str(db, organization: str = "", tipo_procedimiento: str = "") -> str:
    """Build company context string for AI prompts from company_profiles + company_contexts."""
    parts = []

    # Company profile
    profile = await db.company_profiles.find_one({"company_id": "default"})
    if profile and profile.get("nombre"):
        p_parts = [f"Empresa: {profile['nombre']}"]
        if profile.get("cuit"):
            p_parts.append(f"CUIT: {profile['cuit']}")
        if profile.get("numero_proveedor_estado"):
            p_parts.append(f"Proveedor Estado N°: {profile['numero_proveedor_estado']}")
        if profile.get("rubros_inscriptos"):
            p_parts.append(f"Rubros: {', '.join(profile['rubros_inscriptos'])}")
        parts.append("DATOS EMPRESA: " + " | ".join(p_parts))

    # Zone context matching
    if organization:
        org_lower = organization.lower()
        all_ctx = await db.company_contexts.find({"company_id": "default"}).to_list(200)
        best = None
        best_score = 0
        for ctx in all_ctx:
            zona_lower = (ctx.get("zona") or "").lower()
            if not zona_lower:
                continue
            if zona_lower in org_lower or org_lower in zona_lower:
                score = len(zona_lower)
                if tipo_procedimiento and ctx.get("tipo_proceso", "").lower() in tipo_procedimiento.lower():
                    score += 100
                if score > best_score:
                    best = ctx
                    best_score = score
        if not best:
            best = await db.company_contexts.find_one({"company_id": "default", "zona": "General"})

        if best:
            if best.get("documentos_requeridos"):
                # Check which docs are available
                doc_ids = best.get("documentos_disponibles", [])
                available_cats = set()
                if doc_ids:
                    from bson import ObjectId as ObjId
                    docs = await db.documentos.find(
                        {"_id": {"$in": [ObjId(d) for d in doc_ids if len(d) == 24]}}
                    ).to_list(50)
                    available_cats = {d.get("category", "") for d in docs}
                required = best["documentos_requeridos"]
                available = [r for r in required if r in available_cats]
                missing = [r for r in required if r not in available_cats]
                if available:
                    parts.append(f"DOCS DISPONIBLES ({best.get('zona', '')}): {', '.join(available)}")
                if missing:
                    parts.append(f"DOCS FALTANTES ({best.get('zona', '')}): {', '.join(missing)}")

            if best.get("tips"):
                parts.append(f"TIPS ({best.get('zona', '')}): {'; '.join(best['tips'][:5])}")
            if best.get("errores_comunes"):
                parts.append(f"ERRORES COMUNES: {'; '.join(best['errores_comunes'][:5])}")
            if best.get("normativa"):
                parts.append(f"NORMATIVA: {best['normativa']}")
            if best.get("garantia_oferta"):
                parts.append(f"GARANTIA OFERTA: {best['garantia_oferta']}")

            # Count antecedentes
            ant_count = len(best.get("antecedentes", []))
            if ant_count:
                parts.append(f"ANTECEDENTES EMPRESA EN ZONA: {ant_count} proyectos previos")

    if not parts:
        return ""
    return "\n".join(parts)


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

    company_ctx = await _get_company_context_str(
        db, lic.get("organization", ""), lic.get("tipo_procedimiento", "")
    )
    if company_ctx:
        context += f"\n\n{company_ctx}"

    groq = get_groq_enrichment_service()
    result = await groq.suggest_propuesta(context)
    return result


@router.post("/search-antecedentes")
async def search_antecedentes(body: Dict[str, Any], request: Request):
    """Search for similar past tenders as reference using full-text search."""
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

    current_budget = lic.get("budget")

    # Build full-text search string from objeto + title + category
    search_parts = []
    if lic.get("objeto"):
        search_parts.append(lic["objeto"])
    if lic.get("title"):
        search_parts.append(lic["title"])
    if lic.get("category"):
        search_parts.append(lic["category"])
    search_text = " ".join(search_parts).strip()

    antecedentes = []

    # Phase 1: $text search with relevance scoring
    if search_text:
        try:
            text_query = {
                "$text": {"$search": search_text},
                "_id": {"$ne": ObjectId(licitacion_id)},
                "estado": {"$in": ["vencida", "archivada"]},
            }
            cursor = db.licitaciones.find(
                text_query,
                {"score": {"$meta": "textScore"}},
            ).sort([("score", {"$meta": "textScore"})]).limit(10)
            antecedentes = await cursor.to_list(10)
        except Exception as e:
            logger.warning(f"Text search for antecedentes failed: {e}")

    # Phase 2: Fallback to category-only query if text search yielded nothing
    if not antecedentes and lic.get("category"):
        fallback_query = {
            "_id": {"$ne": ObjectId(licitacion_id)},
            "estado": {"$in": ["vencida", "archivada"]},
            "category": lic["category"],
        }
        antecedentes = await db.licitaciones.find(fallback_query).sort(
            "publication_date", -1
        ).limit(10).to_list(10)

    # Build rich response
    results = []
    for a in antecedentes:
        entry = {
            "id": str(a["_id"]),
            "title": a.get("title", ""),
            "objeto": a.get("objeto", ""),
            "organization": a.get("organization", ""),
            "budget": a.get("budget"),
            "publication_date": str(a.get("publication_date", "")),
            "category": a.get("category"),
            "tipo_procedimiento": a.get("tipo_procedimiento"),
            "relevance_score": a.get("score"),
        }
        # Include first 5 items with prices if available
        items = a.get("items", [])
        if items:
            entry["items"] = [
                {
                    "descripcion": it.get("descripcion", ""),
                    "cantidad": it.get("cantidad"),
                    "unidad": it.get("unidad"),
                    "precio_unitario": it.get("precio_unitario"),
                }
                for it in items[:5]
            ]
        # Compute price_ratio if both have budget
        a_budget = a.get("budget")
        if current_budget and a_budget and current_budget > 0:
            entry["price_ratio"] = round(a_budget / current_budget, 4)

        results.append(entry)

    return results


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

    company_ctx = await _get_company_context_str(
        db, lic.get("organization", ""), lic.get("tipo_procedimiento", "")
    )
    if company_ctx:
        context += f"\n\n{company_ctx}"

    groq = get_groq_enrichment_service()
    return await groq.analyze_bid(context)


@router.post("/extract-pliego-info")
async def extract_pliego_info(body: Dict[str, Any], request: Request):
    """Deep extraction of pliego info for bidding."""
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

    # Build text from all available sources
    parts = []
    if lic.get("objeto"):
        parts.append(f"Objeto: {lic['objeto']}")
    if lic.get("title"):
        parts.append(f"Título: {lic['title']}")
    if lic.get("description"):
        parts.append(f"Descripción:\n{lic['description'][:4000]}")
    if lic.get("items"):
        items_str = json.dumps(lic["items"], ensure_ascii=False)[:2000]
        parts.append(f"Items del pliego: {items_str}")
    if lic.get("budget"):
        parts.append(f"Presupuesto oficial: ${lic['budget']}")
    if lic.get("organization"):
        parts.append(f"Organismo: {lic['organization']}")
    if lic.get("tipo_procedimiento"):
        parts.append(f"Tipo: {lic['tipo_procedimiento']}")
    # Include ALL COMPR.AR pliego fields (not just 10 hardcoded keys)
    meta = lic.get("metadata") or {}
    pliego_fields = meta.get("comprar_pliego_fields") or {}
    if pliego_fields:
        pliego_parts = [f"  {k}: {v}" for k, v in pliego_fields.items() if v]
        if pliego_parts:
            parts.append("Datos del pliego COMPR.AR:\n" + "\n".join(pliego_parts))

    # Include structured fields already parsed on the licitacion
    if lic.get("opening_date"):
        parts.append(f"Fecha de apertura: {lic['opening_date']}")
    if lic.get("encuadre_legal"):
        parts.append(f"Encuadre legal: {lic['encuadre_legal']}")
    if lic.get("garantias"):
        parts.append(f"Garantías: {json.dumps(lic['garantias'], ensure_ascii=False)[:500]}")
    if lic.get("duracion_contrato"):
        parts.append(f"Duración contrato: {lic['duracion_contrato']}")

    text = "\n".join(parts)
    if len(text) < 20:
        return {"error": "Información insuficiente en la licitación", "items": [], "info_faltante": ["Sin descripción disponible"]}

    company_ctx = await _get_company_context_str(
        db, lic.get("organization", ""), lic.get("tipo_procedimiento", "")
    )
    if company_ctx:
        text += f"\n\n{company_ctx}"

    groq = get_groq_enrichment_service()
    return await groq.extract_pliego_info(text)


@router.get("/company-antecedentes/sectors")
async def get_company_antecedentes_sectors(request: Request):
    """Get available sectors with counts from UM antecedentes."""
    db = _get_db(request)
    from services.um_antecedentes import get_um_antecedente_service
    service = get_um_antecedente_service(db)
    await service.ensure_indexes()
    return await service.get_sectors()


@router.post("/search-company-antecedentes")
async def search_company_antecedentes(body: Dict[str, Any], request: Request):
    """Search Ultima Milla company antecedentes from ultimamilla.com.ar + SGI."""
    db = _get_db(request)
    licitacion_id = body.get("licitacion_id")
    keywords = body.get("keywords")
    sector = body.get("sector")

    # If only licitacion_id, derive keywords from licitacion
    if licitacion_id and not keywords:
        try:
            lic = await db.licitaciones.find_one({"_id": ObjectId(licitacion_id)})
        except Exception:
            lic = None
        if lic:
            parts = []
            if lic.get("category"):
                parts.append(lic["category"])
            if lic.get("objeto"):
                parts.append(lic["objeto"][:100])
            elif lic.get("title"):
                parts.append(lic["title"][:100])
            keywords = " ".join(parts) if parts else None

    from services.um_antecedentes import get_um_antecedente_service
    service = get_um_antecedente_service(db)
    await service.ensure_indexes()
    results = await service.search(keywords=keywords, sector=sector, limit=15)
    return results


@router.post("/extract-marco-legal")
async def extract_marco_legal(body: Dict[str, Any], request: Request):
    """Extract legal framework analysis for bidding preparation."""
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

    # Build context from legal-relevant fields
    parts = []
    metadata = lic.get("metadata", {}) or {}

    if metadata.get("encuadre_legal"):
        parts.append(f"Encuadre legal: {metadata['encuadre_legal']}")
    if lic.get("tipo_procedimiento"):
        parts.append(f"Tipo de procedimiento: {lic['tipo_procedimiento']}")
    if metadata.get("modalidad"):
        parts.append(f"Modalidad: {metadata['modalidad']}")
    if metadata.get("alcance"):
        parts.append(f"Alcance: {metadata['alcance']}")
    if metadata.get("garantias"):
        parts.append(f"Garantías: {json.dumps(metadata['garantias'], ensure_ascii=False)}")
    if metadata.get("requisitos_participacion"):
        parts.append(f"Requisitos de participación: {json.dumps(metadata['requisitos_participacion'], ensure_ascii=False)}")
    if lic.get("description"):
        parts.append(f"Descripción:\n{lic['description'][:3000]}")
    if lic.get("objeto"):
        parts.append(f"Objeto: {lic['objeto']}")
    if lic.get("organization"):
        parts.append(f"Organismo: {lic['organization']}")
    if lic.get("budget"):
        parts.append(f"Presupuesto oficial: ${lic['budget']}")
    if lic.get("duracion_contrato"):
        parts.append(f"Duración contrato: {lic['duracion_contrato']}")
    if lic.get("opening_date"):
        parts.append(f"Fecha de apertura: {lic['opening_date']}")

    # Include ALL COMPR.AR pliego fields for richer legal context
    pliego_fields = metadata.get("comprar_pliego_fields") or {}
    if pliego_fields:
        pliego_parts = [f"  {k}: {v}" for k, v in pliego_fields.items() if v]
        if pliego_parts:
            parts.append("Datos del pliego COMPR.AR:\n" + "\n".join(pliego_parts))

    context = "\n".join(parts)
    if len(context) < 20:
        return {"error": "Información insuficiente para análisis legal"}

    # Determine if Mendoza provincial (UF) or federal (módulos)
    threshold_info = None
    budget = lic.get("budget")
    encuadre = (metadata.get("encuadre_legal") or lic.get("encuadre_legal") or "").lower()
    jurisdiccion = (lic.get("jurisdiccion") or "").lower()
    fuente = (lic.get("fuente") or "").lower()
    is_mendoza = "mendoza" in jurisdiccion or "mendoza" in fuente or "8706" in encuadre

    if budget:
        try:
            data_dir = Path(__file__).parent.parent / "data"
            if is_mendoza:
                with open(data_dir / "mendoza_uf.json", "r") as f:
                    uf_data = json.load(f)
                uf_value = uf_data["uf_value"]
                budget_in_ufs = round(budget / uf_value, 1)
                thresholds = uf_data.get("thresholds_mendoza", {})
                for key in ["contratacion_directa", "licitacion_privada", "licitacion_publica"]:
                    t = thresholds.get(key, {})
                    max_uf = t.get("max_uf")
                    if max_uf is None or budget_in_ufs <= max_uf:
                        threshold_info = {
                            "tipo_segun_monto": t.get("label", key),
                            "uf_value": uf_value,
                            "budget_in_ufs": budget_in_ufs,
                            "max_uf": max_uf,
                            "tope_ars": t.get("max_ars_calc"),
                            "threshold_system": "uf_mendoza",
                        }
                        break
                if threshold_info:
                    context += f"\n\nContexto legal provincial: Ley 8706 de Mendoza. UF {uf_data.get('uf_year', 2026)} = ${uf_value}."
                    context += f" Presupuesto = {budget_in_ufs} UF → {threshold_info['tipo_segun_monto']}."
            else:
                with open(data_dir / "procurement_thresholds.json", "r") as f:
                    thresholds_data = json.load(f)
                thresholds = thresholds_data.get("thresholds", {})
                for key in ["contratacion_directa", "licitacion_privada", "licitacion_publica"]:
                    t = thresholds.get(key, {})
                    max_ars = t.get("max_ars")
                    if max_ars is None or budget <= max_ars:
                        threshold_info = {
                            "tipo_segun_monto": t.get("label", key),
                            "modulos": t.get("modulos"),
                            "tope_ars": max_ars,
                            "modulo_value": thresholds_data.get("modulo_value"),
                            "threshold_system": "modulo_federal",
                        }
                        break
                if threshold_info:
                    context += f"\n\nUmbrales de contratación: El presupuesto de ${budget} corresponde a {threshold_info['tipo_segun_monto']}."
                    if threshold_info.get("modulos"):
                        context += f" (hasta {threshold_info['modulos']} módulos, módulo = ${threshold_info['modulo_value']})"
        except Exception as e:
            logger.warning(f"Could not load procurement thresholds: {e}")

    company_ctx = await _get_company_context_str(
        db, lic.get("organization", ""), lic.get("tipo_procedimiento", "")
    )
    if company_ctx:
        context += f"\n\n{company_ctx}"

    groq = get_groq_enrichment_service()
    result = await groq.extract_marco_legal(context)

    # Attach threshold info to response if available
    if threshold_info:
        result["threshold_info"] = threshold_info

    return result
