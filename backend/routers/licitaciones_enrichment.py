from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from typing import Dict, Any, Optional
from datetime import datetime
from bson import ObjectId
from utils.time import utc_now
from pathlib import Path
import logging
import re

from db.repositories import LicitacionRepository
from models.licitacion import Licitacion, LicitacionUpdate
from dependencies import get_licitacion_repository

logger = logging.getLogger("licitaciones_enrichment_router")

router = APIRouter(
    prefix="/api/licitaciones",
    tags=["licitaciones-enrichment"],
    responses={404: {"description": "Not found"}}
)


@router.post("/{licitacion_id}/enrich")
async def enrich_licitacion_universal(
    licitacion_id: str,
    level: int = Query(2, ge=2, le=3, description="Enrichment level"),
    repo: LicitacionRepository = Depends(get_licitacion_repository),
):
    """
    Universal enrichment: re-fetch source page and extract additional data.
    Works for ALL sources. COMPR.AR delegates to its specialized enrichment.
    """
    lic = await repo.get_by_id(licitacion_id)
    if not lic:
        raise HTTPException(status_code=404, detail="Licitación no encontrada")

    fuente = lic.get("fuente", "") if isinstance(lic, dict) else getattr(lic, "fuente", "")
    lic_dict = lic if isinstance(lic, dict) else lic.dict()

    # Phase 1: Source-specific enrichment
    comprar_response = None
    updates = {}

    if "COMPR.AR" in fuente:
        # COMPR.AR: delegate to specialized enrichment, capture response
        from routers.comprar import enrich_licitacion as comprar_enrich
        comprar_response = await comprar_enrich(licitacion_id, level, repo)
        # Re-read the enriched doc for HUNTER + nodo matching
        enriched_doc = await repo.get_by_id(licitacion_id)
        if enriched_doc:
            enriched_dict = enriched_doc if isinstance(enriched_doc, dict) else enriched_doc.dict()
            # Build updates dict from what changed vs original
            for k in ("description", "objeto", "category", "opening_date", "budget",
                       "expedient_number", "licitacion_number", "title"):
                new_val = enriched_dict.get(k)
                old_val = lic_dict.get(k)
                if new_val and new_val != old_val:
                    updates[k] = new_val
            lic_dict = enriched_dict
    else:
        # Generic enrichment for all other sources
        source_url = lic_dict.get("source_url", "") or ""

        try:
            from dependencies import database as db
            from services.generic_enrichment import GenericEnrichmentService
            service = GenericEnrichmentService()

            # Look up scraper config for CSS selectors
            selectors = None
            if db is not None and fuente:
                config_doc = await db.scraper_configs.find_one({
                    "name": {"$regex": re.escape(fuente), "$options": "i"},
                    "active": True,
                })
                if config_doc:
                    selectors = config_doc.get("selectors", {})

            source_urls = lic_dict.get("source_urls") or {}
            if source_url or source_urls:
                updates = await service.enrich(lic_dict, selectors)
            else:
                updates = service._enrich_title_only(lic_dict)

            if not updates:
                updates = service._enrich_title_only(lic_dict)

            if not updates:
                updates = {}

            if updates:
                # Set enrichment level
                current_level = lic_dict.get("enrichment_level", 1)
                if current_level < 2:
                    updates["enrichment_level"] = 2

                # Apply updates
                update_obj = LicitacionUpdate(**{k: v for k, v in updates.items()
                                                 if k in LicitacionUpdate.__fields__})
                extra_fields = {k: v for k, v in updates.items()
                                if k not in LicitacionUpdate.__fields__}

                await repo.update(licitacion_id, update_obj)

                if extra_fields:
                    query_id = licitacion_id
                    try:
                        query_id = ObjectId(licitacion_id)
                    except Exception:
                        pass
                    await db.licitaciones.update_one(
                        {"_id": query_id},
                        {"$set": extra_fields}
                    )

                field_names = list(updates.keys())
                logger.info(f"Enriched {licitacion_id} ({fuente}): {field_names}")

                # Log enrichment attempt in metadata
                enrichment_log_entry = {
                    "timestamp": utc_now().isoformat(),
                    "method": "manual",
                    "level": level,
                    "fields_updated": field_names,
                    "source_url": source_url[:100] if source_url else None,
                }
                if db is not None:
                    try:
                        await db.licitaciones.update_one(
                            {"_id": ObjectId(licitacion_id)},
                            {"$push": {"metadata.enrichment_log": {
                                "$each": [enrichment_log_entry],
                                "$slice": -10,
                            }}}
                        )
                    except Exception:
                        pass

        except Exception as e:
            logger.error(f"Error enriching {licitacion_id}: {e}", exc_info=True)
            return JSONResponse(content={
                "success": False,
                "message": f"Error al enriquecer: {str(e)}",
            })

    # Phase 2: HUNTER cross-source search (runs for ALL sources including COMPR.AR)
    from dependencies import database as db
    hunter_result = {"matches_found": 0, "merged_from": [], "fields_merged": []}
    try:
        from services.cross_source_service import CrossSourceService
        if db is not None:
            cross_svc = CrossSourceService(db)
            hunter_result = await cross_svc.hunt_cross_sources(
                licitacion_id, lic_dict, updates
            )
    except Exception as hunter_err:
        logger.warning(f"Hunter failed for {licitacion_id}: {hunter_err}")

    # Phase 3: Re-match nodos (runs for ALL sources including COMPR.AR)
    try:
        from services.nodo_matcher import get_nodo_matcher
        if db is not None:
            matcher = get_nodo_matcher(db)
            title_val = updates.get("title", lic_dict.get("title", ""))
            objeto_val = updates.get("objeto", lic_dict.get("objeto", ""))
            desc_val = updates.get("description", lic_dict.get("description", ""))
            org_val = lic_dict.get("organization", "")
            cat_val = updates.get("category", lic_dict.get("category", ""))
            await matcher.assign_nodos_to_licitacion(
                licitacion_id, title_val, objeto_val, desc_val, org_val, category=cat_val
            )
    except Exception as nodo_err:
        logger.warning(f"Nodo re-matching after enrichment failed: {nodo_err}")

    # Phase 4: Return response
    if comprar_response:
        # Inject hunter results into COMPR.AR response
        try:
            body = comprar_response.body
            import json as _json
            data = _json.loads(body)
            data["hunter"] = hunter_result
            return JSONResponse(content=data)
        except Exception:
            return comprar_response

    if not updates:
        return JSONResponse(content={
            "success": True,
            "message": "No se encontraron datos adicionales en la fuente",
            "fields_updated": 0,
            "hunter": hunter_result,
        })

    field_names = list(updates.keys())
    return JSONResponse(content={
        "success": True,
        "message": f"Enriquecido con {len(updates)} campos: {', '.join(field_names)}",
        "fields_updated": len(updates),
        "fields": field_names,
        "hunter": hunter_result,
    })


@router.get("/{licitacion_id}/budget-hints")
async def get_budget_hints(licitacion_id: str, request: Request):
    """Budget suggestions based on official budget + procurement type + pliego items."""
    db = request.app.mongodb
    try:
        lic = await db.licitaciones.find_one({"_id": ObjectId(licitacion_id)})
    except Exception:
        lic = None
    if not lic:
        raise HTTPException(status_code=404, detail="Licitación not found")

    # Determine if Mendoza provincial (UF) or federal (módulos)
    import json as _json
    data_dir = Path(__file__).parent.parent / "data"
    jurisdiccion = (lic.get("jurisdiccion") or "").lower()
    fuente = (lic.get("fuente") or "").lower()
    encuadre = (lic.get("encuadre_legal") or "").lower()
    is_mendoza = "mendoza" in jurisdiccion or "mendoza" in fuente or "8706" in encuadre

    budget = lic.get("budget")
    tipo = (lic.get("tipo_procedimiento") or "").lower().strip()

    # Normalize tipo to threshold key
    tipo_key = None
    range_min = None
    range_max = None
    threshold_label = None
    uf_value = None
    budget_in_ufs = None
    threshold_system = "modulo_federal"

    if "directa" in tipo:
        tipo_key = "contratacion_directa"
    elif "privada" in tipo:
        tipo_key = "licitacion_privada"
    elif "publica" in tipo or "pública" in tipo:
        tipo_key = "licitacion_publica"

    if is_mendoza:
        threshold_system = "uf_mendoza"
        try:
            with open(data_dir / "mendoza_uf.json") as f:
                uf_data = _json.load(f)
            uf_value = uf_data["uf_value"]
            if budget:
                budget_in_ufs = round(budget / uf_value, 1)
            thresholds = uf_data.get("thresholds_mendoza", {})
            if tipo_key and tipo_key in thresholds:
                th = thresholds[tipo_key]
                threshold_label = th.get("label")
                if th.get("max_ars_calc"):
                    range_max = th["max_ars_calc"]
                    keys = list(thresholds.keys())
                    idx = keys.index(tipo_key)
                    if idx > 0:
                        prev = thresholds[keys[idx - 1]]
                        range_min = prev.get("max_ars_calc", 0)
                    else:
                        range_min = 0
        except Exception:
            pass
    else:
        try:
            with open(data_dir / "procurement_thresholds.json") as f:
                thresholds_data = _json.load(f)
            thresholds = thresholds_data.get("thresholds", {})
            if tipo_key and tipo_key in thresholds:
                th = thresholds[tipo_key]
                threshold_label = th.get("label")
                if th.get("max_ars"):
                    range_max = th["max_ars"]
                    keys = list(thresholds.keys())
                    idx = keys.index(tipo_key)
                    if idx > 0:
                        prev = thresholds[keys[idx - 1]]
                        range_min = prev.get("max_ars", 0)
                    else:
                        range_min = 0
        except Exception:
            pass

    # Extract items: prefer structured items from scraping, fall back to AI extraction
    items_from_pliego = []
    enrichment_level = lic.get("enrichment_level", 1)

    # 1. Use existing structured items if available
    lic_items = lic.get("items") or []
    if lic_items:
        for it in lic_items:
            desc = it.get("descripcion", "")
            if not desc:
                continue
            # Clean up descripcion: remove "Presentación: X  Solicitado: Y"
            desc_clean = re.sub(r'\s+Presentaci[oó]n:\s*.+$', '', desc, flags=re.IGNORECASE).strip()
            # Parse cantidad: "1,00 UNIDAD/S" → number + unit
            cant_raw = it.get("cantidad", "1")
            cantidad = 1.0
            unidad = it.get("unidad", "") or ""
            if isinstance(cant_raw, str):
                num_match = re.match(r'^[\d.,]+', cant_raw)
                if num_match:
                    cantidad = float(num_match.group(0).replace('.', '').replace(',', '.') or '1')
                unit_part = re.sub(r'^[\d.,\s]+', '', cant_raw).strip()
                if unit_part and not unidad:
                    unidad = unit_part
            else:
                cantidad = float(cant_raw) if cant_raw else 1.0
            if not unidad:
                pres_match = re.search(r'Presentaci[oó]n:\s*(\S+)', desc, re.IGNORECASE)
                if pres_match:
                    unidad = pres_match.group(1)
            if not unidad:
                unidad = "u."
            items_from_pliego.append({
                "descripcion": desc_clean,
                "cantidad": cantidad,
                "unidad": unidad,
            })

    # 2. Fallback: try AI extraction from description text
    if not items_from_pliego and enrichment_level >= 2 and lic.get("description"):
        try:
            from services.groq_enrichment import get_groq_enrichment_service
            groq = get_groq_enrichment_service()
            items_from_pliego = await groq.extract_items_from_pliego(
                lic["description"][:3000]
            )
        except Exception as e:
            logger.warning(f"Failed to extract pliego items via AI: {e}")

    # 3. Use cached pliego_info from extract-pliego-info (deep AI extraction)
    if not items_from_pliego:
        pliego_info = (lic.get("metadata") or {}).get("pliego_info")
        if pliego_info and isinstance(pliego_info, dict):
            for it in pliego_info.get("items", []):
                if it.get("descripcion"):
                    items_from_pliego.append({
                        "descripcion": str(it["descripcion"])[:200],
                        "cantidad": float(it.get("cantidad", 1) or 1),
                        "unidad": str(it.get("unidad", "u."))[:20],
                    })

    return {
        "budget": budget,
        "budget_source": "official" if budget else "estimated_from_pliego",
        "tipo_procedimiento": lic.get("tipo_procedimiento"),
        "range_min": range_min,
        "range_max": range_max,
        "threshold_label": threshold_label,
        "items_from_pliego": items_from_pliego or [],
        "enrichment_level": enrichment_level,
        "uf_value": uf_value,
        "budget_in_ufs": budget_in_ufs,
        "threshold_system": threshold_system,
    }


@router.post("/{licitacion_id}/classify")
async def classify_licitacion_category(
    licitacion_id: str,
    repo: LicitacionRepository = Depends(get_licitacion_repository)
):
    """Classify a licitacion into a rubro category based on its content"""
    from services.category_classifier import get_category_classifier

    licitacion = await repo.get_by_id(licitacion_id)
    if not licitacion:
        raise HTTPException(status_code=404, detail="Licitación not found")

    classifier = get_category_classifier()
    category = classifier.classify(
        title=licitacion.title,
        description=licitacion.description,
        keywords=licitacion.keywords
    )

    if category:
        # Update the licitacion with the classified category
        from models.licitacion import LicitacionUpdate
        update_data = LicitacionUpdate(category=category)
        await repo.update(licitacion_id, update_data)

    return {
        "id_licitacion": licitacion_id,
        "category": category,
        "classified": category is not None
    }


@router.post("/deduplicate")
async def run_deduplication(
    jurisdiccion: Optional[str] = Query(None, description="Limit deduplication to a specific jurisdiction"),
    request: Request = None
):
    """Run deduplication on all licitaciones"""
    from services.deduplication_service import get_deduplication_service

    # Get database from request
    db = request.app.mongodb
    service = get_deduplication_service(db)

    stats = await service.run_deduplication(jurisdiccion=jurisdiccion)
    return stats


@router.post("/{licitacion_id}/resolve-url")
async def resolve_licitacion_url(
    licitacion_id: str,
    repo: LicitacionRepository = Depends(get_licitacion_repository)
):
    """Resolve and update the canonical URL for a specific licitacion"""
    from services.url_resolver import get_url_resolver
    from motor.motor_asyncio import AsyncIOMotorDatabase

    # We need to get the database from the repo
    # This is a bit hacky but works for now
    db = repo.collection.database

    resolver = get_url_resolver(db)
    url = await resolver.resolve_url(licitacion_id)

    if not url:
        raise HTTPException(status_code=404, detail="Could not resolve URL for this licitación")

    return {
        "id_licitacion": licitacion_id,
        "resolved_url": url,
        "quality": resolver.determine_url_quality(url)
    }


@router.post("/{licitacion_id}/requisitos")
async def extract_requisitos(
    licitacion_id: str,
    repo: LicitacionRepository = Depends(get_licitacion_repository),
):
    """Extract structured participation requirements from the pliego text using Gemini AI.

    Populates the `requisitos` field on the licitacion. Used by match_score_service
    to compute per-company affinity scores without an LLM call at score time.
    """
    db = repo.collection.database
    try:
        lic = await db.licitaciones.find_one({"_id": ObjectId(licitacion_id)})
    except Exception:
        lic = None
    if not lic:
        raise HTTPException(404, "Licitación no encontrada")

    # Build text from all available sources — prefer full pliego text when stored
    meta = lic.get("metadata") or {}
    text_parts = []
    pliego_full = meta.get("comprar_pliego_text") or ""
    if pliego_full:
        text_parts.append(pliego_full[:15000])
    else:
        description = lic.get("description") or ""
        if description:
            text_parts.append(description[:6000])
        for k, v in meta.get("comprar_pliego_fields", {}).items():
            if v:
                text_parts.append(f"{k}: {v}")
    if lic.get("objeto"):
        text_parts.append(f"Objeto: {lic['objeto']}")
    pliego_text = "\n".join(text_parts)

    if not pliego_text or len(pliego_text) < 100:
        raise HTTPException(400, "Sin texto de pliego suficiente. Enriquecé la licitación primero.")

    from services.requisitos_extractor import get_requisitos_extractor
    extractor = get_requisitos_extractor()
    requisitos = await extractor.extract(pliego_text)

    if requisitos is None:
        raise HTTPException(503, "Servicio de IA no disponible (GEMINI_API_KEY no configurada)")

    await db.licitaciones.update_one(
        {"_id": ObjectId(licitacion_id)},
        {"$set": {"requisitos": requisitos, "updated_at": utc_now()}},
    )

    return {"requisitos": requisitos, "licitacion_id": licitacion_id}


@router.post("/{licitacion_id}/match-catalogo")
async def match_catalogo_items(
    licitacion_id: str,
    empresa_id: str,
    repo: LicitacionRepository = Depends(get_licitacion_repository),
):
    """Extract pliego items via Gemini and match each against company catalog.

    Returns list of {item, matches} for display in cotizar flow.
    """
    db = repo.collection.database
    try:
        lic = await db.licitaciones.find_one({"_id": ObjectId(licitacion_id)})
    except Exception:
        lic = None
    if not lic:
        raise HTTPException(404, "Licitación no encontrada")

    text_parts = []
    if lic.get("description"):
        text_parts.append(lic["description"][:6000])
    if lic.get("objeto"):
        text_parts.append(f"Objeto: {lic['objeto']}")
    for f in (lic.get("metadata") or {}).get("comprar_pliego_fields", {}).items():
        if f[1]:
            text_parts.append(f"{f[0]}: {f[1]}")
    pliego_text = "\n".join(text_parts)

    if not pliego_text or len(pliego_text) < 50:
        raise HTTPException(400, "Sin texto de pliego. Enriquecé la licitación primero.")

    from services.items_matcher_service import get_items_matcher
    matcher = get_items_matcher()
    result = await matcher.run(pliego_text, empresa_id, db)
    return {**result, "licitacion_id": licitacion_id, "empresa_id": empresa_id}
