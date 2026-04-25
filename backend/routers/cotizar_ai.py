"""CotizAR AI Router - AI-powered bid assistance endpoints."""

import asyncio
import json
import logging
import sys
from pathlib import Path
from typing import Any, Dict

from bson import ObjectId
from fastapi import APIRouter, HTTPException, Request

sys.path.insert(0, str(Path(__file__).parent.parent))

from services.enrichment.pdf_zip_enricher import (
    extract_text_from_pdf_url,
    extract_text_from_zip,
)
from services.groq_enrichment import get_groq_enrichment_service

logger = logging.getLogger("cotizar_ai")

router = APIRouter(
    prefix="/api/cotizar-ai",
    tags=["cotizar-ai"],
)


from db import get_db
from config.company import DEFAULT_COMPANY_ID


async def _get_company_context_str(db, organization: str = "", tipo_procedimiento: str = "") -> str:
    """Build company context string for AI prompts from company_profiles + company_contexts."""
    parts = []

    # Company profile
    profile = await db.company_profiles.find_one({"company_id": DEFAULT_COMPANY_ID})
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
        from services.zone_matcher import find_best_zone
        best = await find_best_zone(db, organization, tipo_procedimiento)

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

    # Knowledge base context
    try:
        from services.knowledge_service import get_knowledge_service
        km = get_knowledge_service()
        knowledge_ctx = await km.get_context_for_cotizar(db, category=tipo_procedimiento, objeto=organization)
        if knowledge_ctx:
            parts.append(knowledge_ctx)
    except Exception as e:
        logger.debug(f"knowledge context skipped: {e}")

    if not parts:
        return ""
    return "\n".join(parts)


@router.post("/pliego/{licitacion_id}/resumen")
async def pliego_resumen(licitacion_id: str, body: Dict[str, Any], request: Request):
    """Genera (o devuelve cacheado) un resumen estructurado del pliego.

    Body opcional: { "force_refresh": false }
    """
    db = get_db(request)
    from services.pliego_ai_service import get_pliego_ai_service
    svc = get_pliego_ai_service(db)
    force = bool(body.get("force_refresh"))
    return await svc.generate_resumen(licitacion_id, force_refresh=force)


@router.post("/pliego/{licitacion_id}/chat")
async def pliego_chat(licitacion_id: str, body: Dict[str, Any], request: Request):
    """Pregunta al pliego en lenguaje natural.

    Body: { "pregunta": "...", "history": [{role, content}, ...] }
    """
    db = get_db(request)
    pregunta = (body.get("pregunta") or "").strip()
    if not pregunta:
        raise HTTPException(400, "pregunta requerida")
    history = body.get("history") or []
    user_email = getattr(request.state, "user_email", None)
    from services.pliego_ai_service import get_pliego_ai_service
    svc = get_pliego_ai_service(db)
    return await svc.chat(licitacion_id, pregunta, history=history, user_email=user_email)


@router.get("/ai-usage")
async def get_ai_usage(request: Request):
    """Get AI usage stats for today (all providers)."""
    db = request.app.mongodb
    from services.ai_tracker import get_usage_today
    usage = await get_usage_today(db)
    tokens = usage["today_tokens"]
    calls = usage["today_calls"]
    # Check for rate_limited entries
    from datetime import datetime, timezone
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    rate_limited = 0
    try:
        rate_limited = await db.ai_usage.count_documents({
            "created_at": {"$gte": today_start},
            "endpoint": {"$regex": "^rate_limited"},
        })
    except Exception:
        pass
    token_limit = 100000
    if rate_limited > 0:
        status = "exhausted"
    elif tokens > 80000:
        status = "near_limit"
    else:
        status = "active"
    return {
        "today_calls": calls,
        "today_tokens": tokens,
        "token_limit": token_limit,
        "rate_limited": rate_limited,
        "providers": usage.get("providers", {}),
        "status": status,
    }


@router.post("/adjust-prices")
async def adjust_prices(body: Dict[str, Any], request: Request):
    """Adjust item prices: prorate to budget, AI instructions, or scale to target.

    Actions:
    - prorate: distribute budget evenly across items (no AI)
    - prorate_proportional: distribute weighted by quantity (no AI)
    - scale_to_target: scale current prices to hit a target total (no AI)
    - ai_adjust: use AI to adjust prices per user instruction
    """
    db = get_db(request)
    items = body.get("items", [])
    budget = float(body.get("budget", 0))
    iva_rate = float(body.get("iva_rate", 21))
    action = body.get("action", "prorate")  # prorate | prorate_proportional | scale_to_target | ai_adjust
    target_total = float(body.get("target_total", 0))  # for scale_to_target
    percentage = float(body.get("percentage", 100))  # % of budget (e.g. 80)
    instruction = body.get("instruction", "")  # for ai_adjust

    if not items:
        return {"items": [], "error": "No items"}

    budget_sin_iva = budget / (1 + iva_rate / 100) if budget > 0 else 0
    target = budget_sin_iva * (percentage / 100) if action.startswith("prorate") else target_total

    if action == "prorate":
        # Distribute evenly: each item gets equal share
        n = len(items)
        share_per_item = target / n if n > 0 and target > 0 else 0
        result_items = []
        for it in items:
            qty = float(it.get("cantidad", 1)) or 1
            result_items.append({
                **it,
                "precio_unitario": round(share_per_item / qty, 2),
            })
        return {"items": result_items, "method": "uniform", "target": target}

    elif action == "prorate_proportional":
        # Distribute weighted by quantity
        total_qty = sum(float(it.get("cantidad", 1)) or 1 for it in items)
        result_items = []
        for it in items:
            qty = float(it.get("cantidad", 1)) or 1
            weight = qty / total_qty if total_qty > 0 else 1 / len(items)
            item_total = target * weight
            result_items.append({
                **it,
                "precio_unitario": round(item_total / qty, 2),
            })
        return {"items": result_items, "method": "proportional", "target": target}

    elif action == "scale_to_target":
        # Scale existing prices to hit target_total (without IVA)
        if not target_total:
            target_total = budget_sin_iva
        current_total = sum((float(it.get("cantidad", 1)) or 1) * (float(it.get("precio_unitario", 0)) or 0) for it in items)
        if current_total <= 0:
            # No prices yet → fall back to uniform prorate
            n = len(items)
            share = target_total / n if n > 0 else 0
            return {"items": [{**it, "precio_unitario": round(share / (float(it.get("cantidad", 1)) or 1), 2)} for it in items], "method": "uniform_fallback"}
        scale = target_total / current_total
        result_items = [{**it, "precio_unitario": round((float(it.get("precio_unitario", 0)) or 0) * scale, 2)} for it in items]
        return {"items": result_items, "method": "scaled", "scale_factor": round(scale, 4)}

    elif action == "ai_adjust":
        # AI-assisted adjustment
        if not instruction:
            return {"error": "instruction required for ai_adjust"}
        groq = get_groq_enrichment_service(db)
        items_desc = "\n".join(f"{i+1}. {it.get('descripcion','')} — qty:{it.get('cantidad',1)} ud:{it.get('unidad','u.')} precio:{it.get('precio_unitario',0)}" for i, it in enumerate(items))
        prompt = f"""Sos un analista de precios de licitaciones publicas argentinas.

ITEMS ACTUALES:
{items_desc}

PRESUPUESTO OFICIAL (con IVA {iva_rate}%): ${budget:,.0f}
PRESUPUESTO SIN IVA: ${budget_sin_iva:,.0f}

INSTRUCCION DEL USUARIO: {instruction}

Ajusta los precios unitarios de cada item segun la instruccion. El total (suma de cantidad*precio_unitario) NO debe superar el presupuesto sin IVA.

Responde SOLO JSON valido (sin markdown):
[{{"descripcion": "...", "cantidad": N, "unidad": "...", "precio_unitario": N.NN}}]"""

        content = await groq._call_llm(
            [{"role": "user", "content": prompt}],
            max_tokens=1500, temperature=0.2, endpoint="adjust_prices",
        )
        if not content:
            return {"error": "AI no disponible"}
        result = groq._extract_json(content, expect_array=True)
        if result and isinstance(result, list):
            return {"items": result, "method": "ai_adjusted"}
        return {"error": "AI no pudo ajustar precios", "raw": content[:300]}

    elif action == "prorate_monthly":
        # Distribute budget across items AND months
        months = int(body.get("months", 12))
        if months < 1:
            months = 1
        n = len(items)
        if target <= 0:
            target = budget_sin_iva * (percentage / 100)
        monthly_budget = target / months
        share_per_item_month = monthly_budget / n if n > 0 else 0
        result_items = []
        for it in items:
            qty = float(it.get("cantidad", 1)) or 1
            # precio_unitario = price per unit per month × months / qty
            # total per item = share_per_item_month × months
            # precio_unitario = (share_per_item_month × months) / qty
            # But if qty represents months already, just use share
            unit = (it.get("unidad") or "").lower()
            if "mes" in unit or "month" in unit:
                # Quantity IS months — price per month
                result_items.append({**it, "precio_unitario": round(share_per_item_month, 2)})
            else:
                # Quantity is units — distribute across all months
                result_items.append({**it, "precio_unitario": round((share_per_item_month * months) / qty, 2)})
        return {
            "items": result_items,
            "method": "monthly",
            "months": months,
            "monthly_budget": round(monthly_budget, 2),
            "target": target,
        }

    return {"error": f"Action '{action}' not supported"}


@router.post("/suggest-propuesta")
async def suggest_propuesta(body: Dict[str, Any], request: Request):
    """Generate AI-powered technical proposal suggestion."""
    db = get_db(request)
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

    # Inject UMSA knowledge chunks as style/price reference
    try:
        from services.um_knowledge_service import get_um_knowledge_service
        km = get_um_knowledge_service()
        objeto = lic.get("objeto") or lic.get("title", "")
        km_chunks = await km.search(db, query=objeto, top_k=3)
        if km_chunks:
            ref_text = "\n\n".join(
                f"[Antecedente UMSA — {c['tipo']} · {c['fuente']}]\n{c['chunk_text'][:400]}"
                for c in km_chunks
            )
            context += f"\n\n--- PROPUESTAS ANTERIORES UMSA (estilo y términos de referencia) ---\n{ref_text}"
    except Exception as e:
        logger.warning(f"UMSA knowledge inject in suggest-propuesta failed: {e}")

    groq = get_groq_enrichment_service(db)
    result = await groq.suggest_propuesta(context)
    return result


@router.post("/search-antecedentes")
async def search_antecedentes(body: Dict[str, Any], request: Request):
    """Search for similar past tenders as reference using full-text search."""
    db = get_db(request)
    licitacion_id = body.get("licitacion_id")
    skip = body.get("skip", 0)
    limit = body.get("limit", 10)
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
    current_nodos = lic.get("nodos") or []

    # Budget magnitude filter: ±10x of current budget (avoids comparing $2K with $5B)
    budget_filter = {}
    if current_budget and current_budget > 0:
        budget_filter = {"budget": {"$gte": current_budget / 10, "$lte": current_budget * 10}}

    # Phase 1: $text search with relevance scoring
    if search_text:
        try:
            text_query = {
                "$text": {"$search": search_text},
                "_id": {"$ne": ObjectId(licitacion_id)},
                **budget_filter,
            }
            cursor = db.licitaciones.find(
                text_query,
                {"score": {"$meta": "textScore"}},
            ).sort([("score", {"$meta": "textScore"})]).limit(10)
            antecedentes = await cursor.to_list(10)

            # If budget filter was too strict, retry without it
            if not antecedentes and budget_filter:
                text_query_no_budget = {
                    "$text": {"$search": search_text},
                    "_id": {"$ne": ObjectId(licitacion_id)},
                }
                cursor = db.licitaciones.find(
                    text_query_no_budget,
                    {"score": {"$meta": "textScore"}},
                ).sort([("score", {"$meta": "textScore"})]).limit(10)
                antecedentes = await cursor.to_list(10)
        except Exception as e:
            logger.warning(f"Text search for antecedentes failed: {e}")

    # Phase 2: Nodo-based search (find items in same nodos regardless of text match)
    if current_nodos and len(antecedentes) < 10:
        try:
            existing_ids = {a["_id"] for a in antecedentes}
            existing_ids.add(ObjectId(licitacion_id))
            nodo_query = {
                "_id": {"$nin": list(existing_ids)},
                "nodos": {"$in": current_nodos},
                **budget_filter,
            }
            if not budget_filter:
                nodo_query["budget"] = {"$gt": 0}
            nodo_results = await db.licitaciones.find(nodo_query).sort(
                "publication_date", -1
            ).limit(10 - len(antecedentes)).to_list(10)
            antecedentes.extend(nodo_results)
        except Exception as e:
            logger.warning(f"Nodo search for antecedentes failed: {e}")

    # Phase 3: Fallback to category-only query if still nothing
    if not antecedentes and lic.get("category"):
        fallback_query = {
            "_id": {"$ne": ObjectId(licitacion_id)},
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

    # Apply skip/limit for pagination
    paginated = results[skip:skip + limit]
    return {"results": paginated, "total": len(results)}


@router.post("/analyze-bid")
async def analyze_bid(body: Dict[str, Any], request: Request):
    """Run comprehensive AI analysis on a bid."""
    db = get_db(request)
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

    budget = body.get("budget_override") or lic.get("budget") or "N/A"

    context = f"""LICITACIÓN:
Objeto: {lic.get('objeto') or lic.get('title', '')}
Presupuesto: ${budget}
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

    groq = get_groq_enrichment_service(db)
    return await groq.analyze_bid(context)


def _fmt_ars(n: float) -> str:
    """Format number as Argentine pesos."""
    return f"${n:,.0f}".replace(",", ".")


@router.post("/generate-section")
async def generate_section(body: Dict[str, Any], request: Request):
    """Generate content for an offer section. Data-first: uses real data, IA only for narrative."""
    db = get_db(request)
    licitacion_id = body.get("licitacion_id")
    section_slug = body.get("section_slug")
    if not licitacion_id or not section_slug:
        raise HTTPException(400, "licitacion_id and section_slug required")

    try:
        lic = await db.licitaciones.find_one({"_id": ObjectId(licitacion_id)})
    except Exception:
        lic = None
    if not lic:
        raise HTTPException(404, "Licitacion not found")

    cot = await db.cotizaciones.find_one({"licitacion_id": licitacion_id}) or {}
    company = cot.get("company_data", {}) or {}
    tech = cot.get("tech_data", {}) or {}
    items = cot.get("items", [])
    budget = cot.get("budget_override") or lic.get("budget") or 0
    subtotal = cot.get("subtotal", 0)
    iva_rate = cot.get("iva_rate", 21)
    iva_amount = cot.get("iva_amount", 0)
    total = cot.get("total", 0)
    objeto = lic.get("objeto") or lic.get("title", "")
    organismo = lic.get("organization", "")
    company_name = company.get("nombre", "ULTIMA MILLA S.A.")
    cuit = company.get("cuit", "")
    from datetime import datetime
    fecha = datetime.now().strftime("%d/%m/%Y")

    # ─── DATA-FIRST SECTIONS (no AI needed) ───

    if section_slug == "portada":
        lines = [
            objeto.upper(),
            "",
            "OFERTA TECNICA, ECONOMICA Y ESTRATEGICA",
            "",
            company_name,
            "",
            f"Expediente: {lic.get('licitacion_number', '')}",
            f"Objeto: {objeto}",
            f"Organismo contratante: {organismo}",
            f"Oferente: {company_name}",
            f"CUIT: {cuit}",
            f"Fecha de presentacion: {fecha}",
        ]
        return {"content": "\n".join(lines), "section_slug": section_slug}

    if section_slug == "oferta_economica":
        monthly_view = cot.get("monthly_view")  # int (months) or None
        lines = ["Detalle de la oferta economica:", ""]

        if monthly_view and isinstance(monthly_view, (int, float)) and monthly_view > 1:
            months = int(monthly_view)
            # ── Monthly breakdown table ──
            lines.append(f"Contrato: {months} meses | Total mensual: {_fmt_ars(subtotal / months)}/mes")
            lines.append("")

            # Header row
            header = f"{'Item':<50}"
            for m in range(1, months + 1):
                header += f" | {'Mes ' + str(m):>14}"
            header += f" | {'Total':>14}"
            lines.append(header)
            lines.append("-" * len(header))

            # Item rows
            for i, item in enumerate(items, 1):
                desc = item.get("descripcion", "-")
                cant = item.get("cantidad", 0)
                precio = item.get("precio_unitario", 0)
                item_total = cant * precio
                per_month = item_total / months if months > 0 else 0
                if desc.strip():
                    row = f"{i}. {desc[:47]:<50}"
                    for _m in range(months):
                        row += f" | {_fmt_ars(per_month):>14}"
                    row += f" | {_fmt_ars(item_total):>14}"
                    lines.append(row)

            # Total row
            lines.append("-" * len(header) if items else "")
            total_row = f"{'TOTAL MENSUAL':<50}"
            monthly_total = subtotal / months if months > 0 else 0
            for _m in range(months):
                total_row += f" | {_fmt_ars(monthly_total):>14}"
            total_row += f" | {_fmt_ars(subtotal):>14}"
            lines.append(total_row)
            lines.append("")

            # Also include flat summary
            lines.append("Resumen:")
            for i, item in enumerate(items, 1):
                desc = item.get("descripcion", "-")
                cant = item.get("cantidad", 0)
                unit = item.get("unidad", "u.")
                precio = item.get("precio_unitario", 0)
                sub = cant * precio
                if desc.strip():
                    lines.append(f"  {i}. {desc} — {cant} {unit} x {_fmt_ars(precio)} = {_fmt_ars(sub)}")
        else:
            # ── Flat list (no monthly) ──
            for i, item in enumerate(items, 1):
                desc = item.get("descripcion", "-")
                cant = item.get("cantidad", 0)
                unit = item.get("unidad", "u.")
                precio = item.get("precio_unitario", 0)
                sub = cant * precio
                if desc.strip():
                    lines.append(f"{i}. {desc} — {cant} {unit} x {_fmt_ars(precio)} = {_fmt_ars(sub)}")

        lines.append("")
        lines.append(f"Subtotal: {_fmt_ars(subtotal)}")
        lines.append(f"IVA ({iva_rate}%): {_fmt_ars(iva_amount)}")
        lines.append(f"TOTAL: {_fmt_ars(total)}")
        if monthly_view and isinstance(monthly_view, (int, float)) and monthly_view > 1:
            lines.append(f"Total mensual: {_fmt_ars(subtotal / int(monthly_view))}/mes x {int(monthly_view)} meses")
        lines.append("")
        lines.append(f"Presupuesto oficial: {_fmt_ars(budget)}")
        if tech.get("validez"):
            lines.append(f"Validez de la oferta: {tech['validez']} dias")
        return {"content": "\n".join(lines), "section_slug": section_slug}

    # equipo_trabajo and metodologia are now AI-generated based on the actual
    # licitacion category/objeto — NOT hardcoded for software. They fall through
    # to the AI-assisted section below.

    if section_slug in ("antecedentes", "perfil_empresa", "antecedentes_empresa"):
        # Build from REAL data: um_antecedentes + vinculados
        # First use vinculados (user-selected, highest relevance)
        vinc_ids = cot.get("antecedentes_vinculados") or []
        lines = [f"{company_name} es una empresa argentina radicada en Mendoza, con mas de 16 años de experiencia en diseño, desarrollo y mantenimiento de soluciones tecnologicas.", ""]
        lines.append("Antecedentes relevantes para esta contratacion:")
        lines.append("")

        try:
            from services.um_antecedentes import get_um_antecedente_service
            svc = get_um_antecedente_service(db)
            await svc.ensure_indexes()

            all_ants = []
            seen_ids = set()

            # Priority 1: User-linked antecedentes (manually selected = most relevant)
            if vinc_ids:
                vinc_results = await svc.get_by_ids(vinc_ids[:6])
                for a in vinc_results:
                    aid = str(a.get("id", a.get("_id", "")))
                    if aid not in seen_ids:
                        seen_ids.add(aid)
                        all_ants.append(a)

            # Priority 2: Search by thematic keywords from objeto + category
            if len(all_ants) < 4:
                # Build search with category-specific keywords
                category = lic.get("category", "")
                tipo = lic.get("tipo_procedimiento", "")
                search_terms = []
                # Extract meaningful words from objeto
                for w in objeto.split():
                    if len(w) > 4 and w.lower() not in ("para", "sobre", "desde", "hasta", "entre"):
                        search_terms.append(w)
                # Add category keywords
                if category:
                    search_terms.extend(w for w in category.split() if len(w) > 3)
                search_kw = " ".join(search_terms[:6]) or "software desarrollo tecnologia"
                result = await svc.search(keywords=search_kw, limit=8)
                for a in result.get("results", []):
                    aid = str(a.get("id", a.get("_id", "")))
                    if aid not in seen_ids:
                        seen_ids.add(aid)
                        all_ants.append(a)

            # Priority 3: Search by organismo type (gobierno, salud, etc.)
            if len(all_ants) < 3:
                org_lower = organismo.lower()
                org_search = "gobierno sector publico"
                if "salud" in org_lower or "hospital" in org_lower:
                    org_search = "salud hospital"
                elif "educacion" in org_lower or "escuela" in org_lower or "universidad" in org_lower:
                    org_search = "educacion universidad"
                elif "irrigacion" in org_lower or "agua" in org_lower:
                    org_search = "infraestructura agua riego"
                result2 = await svc.search(keywords=org_search, limit=4)
                for a in result2.get("results", []):
                    aid = str(a.get("id", a.get("_id", "")))
                    if aid not in seen_ids:
                        seen_ids.add(aid)
                        all_ants.append(a)

            # Format: max 5 antecedentes, with relevance note
            for i, ant in enumerate(all_ants[:5], 1):
                title = ant.get("title", "")
                client = ant.get("organization", "")
                sector = ant.get("category", "")
                detail_url = ant.get("detail_url") or ant.get("url", "")
                image_url = ant.get("image_url", "")
                budget = ant.get("budget_adjusted") or ant.get("budget")
                lines.append(f"{i}. {title}")
                if client:
                    lines.append(f"   Cliente: {client}")
                if sector:
                    lines.append(f"   Sector: {sector}")
                if budget and budget > 0:
                    lines.append(f"   Presupuesto: ${budget:,.0f}".replace(",", "."))
                if detail_url:
                    lines.append(f"   URL: {detail_url}")
                if image_url:
                    lines.append(f"   IMG: {image_url}")
                lines.append("")

        except Exception as e:
            logger.warning(f"Failed to load antecedentes: {e}")

        if len(lines) <= 4:
            lines.append("La empresa cuenta con amplia experiencia en proyectos similares.")

        return {"content": "\n".join(lines), "section_slug": section_slug}

    # ─── AI-ASSISTED SECTIONS (with verified real data as context) ───

    # Build context from VERIFIED data only — never expose internal pricing
    parts = [
        f"Empresa oferente: {company_name}",
        f"Objeto de la contratacion: {objeto}",
        f"Organismo contratante: {organismo}",
        f"Tipo de procedimiento: {lic.get('tipo_procedimiento', '')}",
    ]

    # Add category and budget context
    if lic.get("category"):
        parts.append(f"Categoria/rubro: {lic['category']}")
    if lic.get("budget"):
        parts.append(f"Presupuesto oficial: ${lic['budget']:,.0f}".replace(",", "."))

    # Add description from licitacion
    if lic.get("description") and len(lic["description"]) > 50:
        parts.append(f"\nDESCRIPCION DE LA LICITACION:\n{lic['description'][:2000]}")

    # Add pliego text if available (from uploaded PDFs or authenticated downloads)
    try:
        from services.pliego_finder import find_pliegos
        pliego_result = await find_pliegos(db, licitacion_id)
        pliego_text = pliego_result.get("text_extracted", "")
        if pliego_text and len(pliego_text) > 100:
            parts.append(f"\nTEXTO DEL PLIEGO (extraido del PDF — usar para detalles concretos):\n{pliego_text[:5000]}")
    except Exception:
        pass

    # Add methodology and plazo from what user filled in Step 2
    if tech.get("methodology"):
        parts.append(f"\nMETODOLOGIA PROPUESTA POR EL OFERENTE:\n{tech['methodology'][:500]}")
    if tech.get("plazo"):
        parts.append(f"PLAZO PROPUESTO: {tech['plazo'][:200]}")
    if tech.get("lugar"):
        parts.append(f"LUGAR DE PRESTACION: {tech['lugar'][:200]}")

    # Add dates from licitacion
    if lic.get("opening_date"):
        parts.append(f"Fecha apertura: {lic['opening_date']}")

    # Add items summary (what we're offering, not prices)
    valid_items = [i for i in items if i.get("descripcion", "").strip()]
    if valid_items:
        parts.append(f"\nITEMS COTIZADOS ({len(valid_items)} renglones):")
        for i, item in enumerate(valid_items, 1):
            parts.append(f"  {i}. {item['descripcion']} — {item.get('cantidad', 0)} {item.get('unidad', 'u.')}")

    # Add vinculados (real antecedentes linked to this offer)
    vinc_ids = cot.get("antecedentes_vinculados") or []
    if vinc_ids:
        try:
            lic_oids = [ObjectId(i) for i in vinc_ids[:10] if len(i) == 24]
            if lic_oids:
                vinc_docs = await db.licitaciones.find(
                    {"_id": {"$in": lic_oids}}, {"title": 1, "organization": 1}
                ).to_list(10)
                if vinc_docs:
                    parts.append(f"\nANTECEDENTES VINCULADOS ({len(vinc_docs)} proyectos previos de la empresa):")
                    for v in vinc_docs:
                        parts.append(f"  - {v.get('title', '')} ({v.get('organization', '')})")
        except Exception:
            pass

    # Circulares — inject with max priority
    if lic.get("circulares"):
        circ_lines = ["\nCIRCULARES (MÁXIMA PRIORIDAD — modifican el pliego):"]
        for c in lic["circulares"]:
            num = c.get("numero", "?")
            circ_lines.append(f"- Circular N° {num}: {c.get('descripcion', '')} {c.get('aclaracion', '')}")
        parts.append("\n".join(circ_lines))

    # Company context from profiles
    company_ctx = await _get_company_context_str(db, organismo, lic.get("tipo_procedimiento", ""))
    if company_ctx:
        parts.append(f"\n{company_ctx}")

    context = "\n".join(parts)
    groq = get_groq_enrichment_service(db)
    content = await groq.generate_offer_section(section_slug, context)
    return {"content": content, "section_slug": section_slug}


@router.get("/offer-template-default")
async def get_default_template(request: Request, slug: str = ""):
    """Get an offer template by slug (default: software_it)."""
    db = get_db(request)
    query = {"slug": slug} if slug else {"slug": "software_it"}
    template = await db.offer_templates.find_one(query)
    if not template:
        # Fallback to any template
        template = await db.offer_templates.find_one()
    if not template:
        return {"error": "No template found. Run seed script."}
    template["id"] = str(template.pop("_id"))
    return template


@router.get("/offer-templates-list")
async def list_offer_templates(request: Request):
    """List all available offer templates (summary)."""
    db = get_db(request)
    cursor = db.offer_templates.find({}, {
        "name": 1, "slug": 1, "template_type": 1, "description": 1,
        "tags": 1, "sections": 1, "usage_count": 1,
    }).sort("usage_count", -1)
    docs = await cursor.to_list(50)
    return [
        {
            "id": str(d["_id"]),
            "name": d.get("name", ""),
            "slug": d.get("slug", ""),
            "template_type": d.get("template_type", ""),
            "description": d.get("description", ""),
            "tags": d.get("tags", []),
            "sections_count": len(d.get("sections", [])),
            "usage_count": d.get("usage_count", 0),
        }
        for d in docs
    ]


@router.post("/find-pliegos")
async def find_pliegos_endpoint(body: Dict[str, Any], request: Request):
    """Find pliego documents for a licitacion using HUNTER strategies."""
    db = get_db(request)
    licitacion_id = body.get("licitacion_id")
    if not licitacion_id:
        raise HTTPException(400, "licitacion_id required")

    from services.pliego_finder import find_pliegos
    return await find_pliegos(db, licitacion_id)


@router.post("/hunter-unified")
async def hunter_unified(body: Dict[str, Any], request: Request):
    """Unified HUNTER endpoint — returns pliego + inteligencia + antecedentes in one call.

    Caches results in cotizacion for 1 hour.
    """
    db = get_db(request)
    licitacion_id = body.get("licitacion_id")
    action = body.get("action", "full")  # "full" | "pliego" | "inteligencia" | "antecedentes"
    if not licitacion_id:
        raise HTTPException(400, "licitacion_id required")

    from bson import ObjectId
    try:
        lic = await db.licitaciones.find_one({"_id": ObjectId(licitacion_id)})
    except Exception:
        lic = None
    if not lic:
        raise HTTPException(404, "Licitacion not found")

    cot = await db.cotizaciones.find_one({"licitacion_id": licitacion_id}) or {}

    # Check cache (1 hour TTL)
    from datetime import datetime, timezone, timedelta
    cache = cot.get("hunter_cache")
    cache_at = cot.get("hunter_cache_at")
    if cache and cache_at:
      try:
        # Handle both naive and aware datetimes from MongoDB
        now = datetime.now(timezone.utc)
        if cache_at.tzinfo is None:
            cache_at = cache_at.replace(tzinfo=timezone.utc)
        cache_valid = (now - cache_at) < timedelta(hours=1)
      except Exception:
        cache_valid = False
    else:
      cache_valid = False
    if cache_valid:
        if action == "full" or action in cache:
            return cache

    result = {}

    # ── PLIEGO ──
    if action in ("full", "pliego"):
        from services.pliego_finder import find_pliegos
        pliego_result = await find_pliegos(db, licitacion_id)
        pliegos = [p for p in pliego_result.get("pliegos", []) if p.get("type") != "metadata"]
        metadata_items = [p for p in pliego_result.get("pliegos", []) if p.get("type") == "metadata"]
        result["pliego"] = {
            "documents": pliegos,
            "text_extracted": pliego_result.get("text_extracted", ""),
            "metadata": [m.get("metadata", {}) for m in metadata_items],
            "hint": pliego_result.get("hint", ""),
        }

    # ── INTELIGENCIA ──
    if action in ("full", "inteligencia"):
        inteligencia = {"referencias": [], "adjudicaciones": [], "price_range": None, "proveedores": []}
        try:
            # Get cross-source matches with budgets
            from services.cross_source_service import CrossSourceService
            cross_svc = CrossSourceService(db)

            # Text search for similar items
            objeto = lic.get("objeto") or lic.get("title", "")
            category = lic.get("category", "")
            budget = lic.get("budget")

            # Similar by text
            keywords = [w for w in (objeto or "").split() if len(w) > 4][:6]
            if keywords:
                query_str = " ".join(keywords)
                try:
                    cursor = db.licitaciones.find(
                        {"$text": {"$search": query_str}, "_id": {"$ne": lic["_id"]}},
                        {"score": {"$meta": "textScore"}},
                    ).sort([("score", {"$meta": "textScore"})]).limit(20)
                    refs = await cursor.to_list(20)
                    for r in refs:
                        ref_data = {
                            "id": str(r["_id"]),
                            "title": r.get("objeto") or r.get("title", ""),
                            "organization": r.get("organization", ""),
                            "fuente": r.get("fuente", ""),
                            "budget": r.get("budget"),
                            "currency": r.get("currency", "ARS"),
                            "items_count": len(r.get("items") or []),
                            "adjudicatario": (r.get("metadata") or {}).get("adjudicatario"),
                            "monto_adjudicado": (r.get("metadata") or {}).get("monto_adjudicado"),
                            "confidence": "alta" if r.get("score", {}) == {"$meta": "textScore"} else "media",
                        }
                        if ref_data.get("adjudicatario") or ref_data.get("monto_adjudicado"):
                            inteligencia["adjudicaciones"].append(ref_data)
                        elif ref_data.get("budget"):
                            inteligencia["referencias"].append(ref_data)
                except Exception as e:
                    logger.warning(f"Hunter inteligencia text search failed: {e}")

            # Same category with budget
            if category and len(inteligencia["referencias"]) < 10:
                try:
                    cat_query = {"category": category, "_id": {"$ne": lic["_id"]}, "budget": {"$exists": True, "$gt": 0}}
                    if budget and budget > 0:
                        cat_query["budget"] = {"$gte": budget * 0.1, "$lte": budget * 10}
                    cat_refs = await db.licitaciones.find(cat_query).sort("publication_date", -1).limit(15).to_list(15)
                    existing_ids = {r["id"] for r in inteligencia["referencias"]} | {r["id"] for r in inteligencia["adjudicaciones"]}
                    for r in cat_refs:
                        rid = str(r["_id"])
                        if rid in existing_ids:
                            continue
                        ref_data = {
                            "id": rid,
                            "title": r.get("objeto") or r.get("title", ""),
                            "organization": r.get("organization", ""),
                            "fuente": r.get("fuente", ""),
                            "budget": r.get("budget"),
                            "currency": r.get("currency", "ARS"),
                            "items_count": len(r.get("items") or []),
                            "adjudicatario": (r.get("metadata") or {}).get("adjudicatario"),
                            "monto_adjudicado": (r.get("metadata") or {}).get("monto_adjudicado"),
                            "confidence": "baja",
                        }
                        if ref_data.get("adjudicatario"):
                            inteligencia["adjudicaciones"].append(ref_data)
                        elif ref_data.get("budget"):
                            inteligencia["referencias"].append(ref_data)
                except Exception as e:
                    logger.warning(f"Hunter inteligencia category search failed: {e}")

            # Query the dedicated adjudicaciones collection (historical references)
            try:
                from services.adjudicacion_service import get_adjudicacion_service
                adj_svc = get_adjudicacion_service(db)
                hist = await adj_svc.find_historical_references(lic, limit=15, min_score=2.0)
                existing_names = {a.get("adjudicatario") for a in inteligencia["adjudicaciones"] if a.get("adjudicatario")}
                for h in hist:
                    name = h.get("adjudicatario")
                    if not name or name in existing_names:
                        continue
                    existing_names.add(name)
                    inteligencia["adjudicaciones"].append({
                        "id": h.get("id"),
                        "title": h.get("objeto") or "",
                        "organization": h.get("organization") or "",
                        "fuente": f"adj:{h.get('fuente','')}",
                        "budget": h.get("budget_original"),
                        "currency": h.get("currency", "ARS"),
                        "items_count": 0,
                        "adjudicatario": name,
                        "monto_adjudicado": h.get("monto_adjudicado"),
                        "fecha_adjudicacion": h.get("fecha_adjudicacion"),
                        "confidence": "alta" if h.get("extraction_confidence", 0) >= 0.8 else (
                            "media" if h.get("extraction_confidence", 0) >= 0.5 else "baja"
                        ),
                        "match_type": h.get("match_type"),
                    })
            except Exception as e:
                logger.warning(f"Hunter inteligencia adjudicaciones collection query failed: {e}")

            # Calculate price range: prefer monto_adjudicado over budget when available
            all_montos = [
                r["monto_adjudicado"]
                for r in inteligencia["adjudicaciones"]
                if r.get("monto_adjudicado")
            ]
            all_budgets = [r["budget"] for r in inteligencia["referencias"] + inteligencia["adjudicaciones"] if r.get("budget")]
            all_budgets = all_montos + all_budgets if all_montos else all_budgets
            if all_budgets:
                all_budgets.sort()
                inteligencia["price_range"] = {
                    "min": all_budgets[0],
                    "median": all_budgets[len(all_budgets) // 2],
                    "max": all_budgets[-1],
                    "sample_size": len(all_budgets),
                }

            # Extract unique proveedores
            proveedores = {}
            for adj in inteligencia["adjudicaciones"]:
                name = adj.get("adjudicatario")
                if name:
                    if name not in proveedores:
                        proveedores[name] = {"name": name, "count": 0, "total": 0}
                    proveedores[name]["count"] += 1
                    if adj.get("monto_adjudicado"):
                        proveedores[name]["total"] += adj["monto_adjudicado"]
            inteligencia["proveedores"] = sorted(proveedores.values(), key=lambda p: p["count"], reverse=True)

        except Exception as e:
            logger.warning(f"Hunter inteligencia failed: {e}")

        result["inteligencia"] = inteligencia

    # ── ANTECEDENTES ──
    if action in ("full", "antecedentes"):
        antecedentes = {"empresa": [], "licitaciones": []}
        try:
            from services.um_antecedentes import get_um_antecedente_service
            svc = get_um_antecedente_service(db)
            await svc.ensure_indexes()

            # Search by keywords from objeto
            objeto = lic.get("objeto") or lic.get("title", "")
            category = lic.get("category", "")
            search_terms = [w for w in objeto.split() if len(w) > 4 and w.lower() not in ("para", "sobre", "desde")][:6]
            if category:
                search_terms.extend(w for w in category.split() if len(w) > 3)
            kw = " ".join(search_terms[:8]) or "software tecnologia desarrollo"

            search_result = await svc.search(keywords=kw, limit=10)
            for a in search_result.get("results", []):
                antecedentes["empresa"].append({
                    "id": str(a.get("id", a.get("_id", ""))),
                    "title": a.get("title", ""),
                    "organization": a.get("organization", ""),
                    "category": a.get("category", ""),
                    "budget": a.get("budget"),
                    "budget_adjusted": a.get("budget_adjusted"),
                    "detail_url": a.get("detail_url") or a.get("url", ""),
                    "image_url": a.get("image_url", ""),
                })

            # Also add user-linked vinculados
            vinc_ids = cot.get("antecedentes_vinculados") or []
            if vinc_ids:
                vinc_results = await svc.get_by_ids(vinc_ids[:10])
                existing_ids = {a["id"] for a in antecedentes["empresa"]}
                for a in vinc_results:
                    aid = str(a.get("id", a.get("_id", "")))
                    if aid not in existing_ids:
                        antecedentes["empresa"].insert(0, {
                            "id": aid,
                            "title": a.get("title", ""),
                            "organization": a.get("organization", ""),
                            "category": a.get("category", ""),
                            "budget": a.get("budget"),
                            "detail_url": a.get("detail_url") or a.get("url", ""),
                            "image_url": a.get("image_url", ""),
                            "vinculado": True,
                        })
        except Exception as e:
            logger.warning(f"Hunter antecedentes failed: {e}")

        result["antecedentes"] = antecedentes

    # ── UMSA KNOWLEDGE (base vectorial interna) ──
    if action in ("full", "antecedentes"):
        try:
            from services.um_knowledge_service import get_um_knowledge_service
            km = get_um_knowledge_service()
            objeto = lic.get("objeto") or lic.get("title", "")
            category = lic.get("category", "")
            km_chunks = await km.search(db, query=f"{objeto} {category}", top_k=5)
            if km_chunks:
                result["umsa_knowledge"] = [
                    {
                        "texto": c["chunk_text"][:600],
                        "fuente": c["filename"],
                        "tipo": c["tipo"],
                        "score": c["score"],
                    }
                    for c in km_chunks
                ]
        except Exception as e:
            logger.warning(f"UMSA knowledge search failed: {e}")

    # Cache result
    try:
        await db.cotizaciones.update_one(
            {"licitacion_id": licitacion_id},
            {"$set": {"hunter_cache": result, "hunter_cache_at": datetime.now(timezone.utc)}},
        )
    except Exception:
        pass

    return result


@router.post("/analyze-pliego-gaps")
async def analyze_pliego_gaps(body: Dict[str, Any], request: Request):
    """Analyze pliego text vs current offer sections to find gaps."""
    db = get_db(request)
    licitacion_id = body.get("licitacion_id")
    pliego_text = body.get("pliego_text", "")

    if not licitacion_id:
        raise HTTPException(400, "licitacion_id required")

    # If no text provided, try to find and extract from pliego
    if not pliego_text:
        from services.pliego_finder import find_pliegos
        result = await find_pliegos(db, licitacion_id)
        pliego_text = result.get("text_extracted", "")

    if not pliego_text or len(pliego_text) < 50:
        return {"gaps": [], "completeness": 0, "error": "No se pudo extraer texto del pliego. Subi el PDF manualmente."}

    # Load current offer sections
    cot = await db.cotizaciones.find_one({"licitacion_id": licitacion_id})
    current_sections = []
    if cot:
        current_sections = cot.get("offer_sections", [])

    filled_slugs = [s.get("slug") for s in current_sections if s.get("content", "").strip()]

    # Add circulares to gap analysis — they modify the pliego
    try:
        lic = await db.licitaciones.find_one(
            {"_id": __import__("bson").ObjectId(licitacion_id)}, {"circulares": 1}
        )
        if lic and lic.get("circulares"):
            circ_lines = ["\n\nCIRCULARES (modifican el pliego — MÁXIMA PRIORIDAD):"]
            for c in lic["circulares"]:
                num = c.get("numero", "?")
                circ_lines.append(f"- Circular N° {num}: {c.get('descripcion', '')} {c.get('aclaracion', '')}")
            pliego_text = "\n".join(circ_lines) + "\n\n" + pliego_text
    except Exception:
        pass  # Non-critical

    groq = get_groq_enrichment_service(db)
    sections_summary = ", ".join(filled_slugs) if filled_slugs else "ninguna"

    prompt = f"""Analiza este pliego de licitación y compara con las secciones ya completadas de la oferta.

PLIEGO (extracto):
{pliego_text[:4000]}

SECCIONES YA COMPLETADAS: {sections_summary}

Responde SOLO con JSON valido:
{{
  "requirements": [
    {{"requirement": "descripcion del requisito", "section_slug": "slug sugerido", "status": "missing|partial|complete", "importance": "alta|media|baja"}}
  ],
  "suggested_sections": [
    {{"slug": "nuevo_slug", "title": "Titulo sugerido", "reason": "por que se necesita"}}
  ],
  "completeness": 0-100
}}"""

    content = await groq._call_llm(
        [{"role": "user", "content": prompt}],
        max_tokens=1500, temperature=0.2, endpoint="analyze_pliego_gaps",
    )
    if not content:
        return {"gaps": [], "completeness": 0, "error": "IA no disponible (Groq + Cerebras agotados)"}
    result = groq._extract_json(content)
    if result and isinstance(result, dict):
        return result
    return {"gaps": [], "completeness": 0, "raw": content[:500]}


@router.post("/extract-pliego-info")
async def extract_pliego_info(body: Dict[str, Any], request: Request):
    """Deep extraction of pliego info for bidding."""
    db = get_db(request)
    licitacion_id = body.get("licitacion_id")
    if not licitacion_id:
        raise HTTPException(400, "licitacion_id required")

    try:
        lic = await db.licitaciones.find_one({"_id": ObjectId(licitacion_id)})
    except Exception:
        lic = None
    if not lic:
        raise HTTPException(404, "Licitacion not found")

    # --- HUNTER: fetch cross-source related licitaciones ---
    from services.cross_source_service import CrossSourceService
    cross_svc = CrossSourceService(db)
    related_sources = await cross_svc.find_related(lic, limit=15)
    # Merge richer data from related sources into our view
    cross_items = []
    cross_descriptions = []
    cross_attached = []
    for rel in related_sources:
        if rel.get("items"):
            cross_items.extend(rel["items"])
        if rel.get("description") and len(rel.get("description", "")) > len(lic.get("description") or ""):
            cross_descriptions.append(f"[{rel.get('fuente', 'Otra fuente')}]: {rel['description'][:5000]}")
        for f in (rel.get("attached_files") or []):
            ftype = (f.get("type") or "").lower()
            url = f.get("url", "")
            if url and ftype in ("pdf", "zip") and "javascript" not in url.lower() and "Manual" not in url and "Inscripcion" not in url:
                cross_attached.append(f)
    if related_sources:
        logger.info(f"CotizAR HUNTER: found {len(related_sources)} related sources, {len(cross_items)} items, {len(cross_attached)} files")

    # --- COMPR.AR auto-search: when any field references compras.mendoza.gov.ar ---
    comprar_pliego_text = ""
    desc_text = lic.get("description") or ""
    lic_number = lic.get("licitacion_number") or ""
    source_url = lic.get("source_url") or ""
    source_urls = lic.get("source_urls") or {}
    source_urls_str = " ".join(str(v) for v in source_urls.values())
    is_comprar = "comprar.mendoza.gov.ar" in source_url or "comprar.mendoza" in source_url
    refs_comprar = (
        "compras.mendoza.gov.ar" in desc_text or
        "comprar.mendoza.gov.ar" in desc_text or
        "comprar.mendoza.gov.ar" in source_urls_str  # Check source_urls too
    )

    if (refs_comprar or is_comprar) and not (lic.get("metadata") or {}).get("comprar_pliego_fields"):
        try:
            import re as _re
            pliego_url = None

            # First: check if source_urls already has a VistaPreviaPliegoCiudadano URL
            for su_val in source_urls.values():
                if isinstance(su_val, str) and "VistaPreviaPliegoCiudadano" in su_val:
                    pliego_url = su_val
                    logger.info(f"CotizAR: using existing COMPR.AR pliego URL from source_urls")
                    break

            # Second: search COMPR.AR by licitacion_number
            if not pliego_url and lic_number:
                core_num = _re.sub(r'-\d{1,3}$', '', lic_number).strip()
                logger.info(f"CotizAR: auto-searching COMPR.AR for process {core_num}")
                from routers.comprar import _search_and_resolve_pliego
                pliego_url = await _search_and_resolve_pliego(core_num, "https://comprar.mendoza.gov.ar/Compras.aspx?qs=W1HXHGHtH10=")

            if pliego_url and "VistaPreviaPliegoCiudadano" in pliego_url:
                logger.info(f"CotizAR: resolved COMPR.AR pliego URL: {pliego_url[:80]}")
                # Fetch and extract pliego labels
                from services.enrichment.comprar_enricher import enrich_comprar
                from scrapers.resilient_http import ResilientHttpClient
                http = ResilientHttpClient()
                try:
                    comprar_updates = await enrich_comprar(http, lic, pliego_url)
                    # Extract description and pliego fields for the AI
                    if comprar_updates.get("description"):
                        comprar_pliego_text = comprar_updates["description"][:8000]
                    comprar_meta = comprar_updates.get("metadata") or {}
                    cpf = comprar_meta.get("comprar_pliego_fields") or {}
                    if cpf:
                        pliego_lines = [f"  {k}: {v}" for k, v in cpf.items() if v]
                        if pliego_lines:
                            comprar_pliego_text += "\n\nDatos COMPR.AR:\n" + "\n".join(pliego_lines)

                    # Persist enrichment to DB so future calls don't re-fetch
                    if comprar_updates:
                        await db.licitaciones.update_one(
                            {"_id": lic["_id"]},
                            {"$set": comprar_updates}
                        )
                        logger.info(f"CotizAR: persisted COMPR.AR enrichment ({len(comprar_updates)} fields)")
                finally:
                    await http.close()
            else:
                logger.info(f"CotizAR: COMPR.AR search returned no pliego URL for {core_num}")
        except Exception as e:
            logger.warning(f"CotizAR: COMPR.AR auto-search failed: {e}")

    # Build known_fields for structured data the AI should NOT list as missing
    known_fields = []
    if lic.get("objeto"):
        known_fields.append(f"Objeto: {lic['objeto']}")
    if lic.get("budget"):
        currency = lic.get("currency", "ARS")
        known_fields.append(f"Presupuesto oficial: ${lic['budget']:,.2f} {currency}")
    if lic.get("opening_date"):
        known_fields.append(f"Fecha apertura: {lic['opening_date']}")
    if lic.get("organization"):
        known_fields.append(f"Organismo: {lic['organization']}")
    if lic.get("tipo_procedimiento"):
        known_fields.append(f"Procedimiento: {lic['tipo_procedimiento']}")
    if lic.get("duracion_contrato"):
        known_fields.append(f"Duración contrato: {lic['duracion_contrato']}")
    if lic.get("garantias"):
        known_fields.append(f"Garantías: {json.dumps(lic['garantias'], ensure_ascii=False)[:200]}")
    if lic.get("encuadre_legal"):
        known_fields.append(f"Encuadre legal: {lic['encuadre_legal']}")
    known_fields_text = "\n".join(known_fields)

    # --- Download and parse attached PDFs/ZIPs (own + cross-source + description URLs) ---
    all_attached = list(lic.get("attached_files") or []) + cross_attached

    # Extract URLs from description text and follow landing pages to find pliego PDFs
    desc_for_urls = (lic.get("description") or "") + " " + comprar_pliego_text
    import re as _re
    import aiohttp as _aiohttp
    from urllib.parse import urljoin as _urljoin
    desc_urls = _re.findall(r'https?://[^\s<>"\')\]]+', desc_for_urls)
    objeto_lower = (lic.get("objeto") or "").lower()

    for durl in desc_urls:
        durl_clean = durl.rstrip(".,;:")
        dl = durl_clean.lower()
        if dl.endswith(".pdf") or dl.endswith(".zip") or dl.endswith(".xlsx"):
            ftype = "zip" if dl.endswith(".zip") else "pdf"
            all_attached.append({"url": durl_clean, "type": ftype})
        elif any(kw in dl for kw in ("pliego", "licitacion", "descarga", "download")):
            all_attached.append({"url": durl_clean, "type": "pdf"})
        elif "/verpdf/" not in dl and "mendoza.gov.ar" not in dl:
            # Landing page — scrape for PDF links (1-2 levels deep)
            try:
                async with _aiohttp.ClientSession() as _sess:
                    async with _sess.get(durl_clean, timeout=_aiohttp.ClientTimeout(total=10), ssl=False) as _resp:
                        if _resp.status == 200 and "html" in _resp.headers.get("Content-Type", ""):
                            _html = await _resp.text()
                            from bs4 import BeautifulSoup as _BS
                            _soup = _BS(_html, "html.parser")
                            for _a in _soup.find_all("a", href=True):
                                _h = _a["href"]
                                _t = _a.get_text(strip=True).lower()
                                if _h.startswith("/") or not _h.startswith("http"):
                                    _h = _urljoin(durl_clean, _h)
                                _hl = _h.lower()
                                # Direct file links
                                if any(_hl.endswith(ext) for ext in (".pdf", ".xlsx", ".xls", ".zip")):
                                    all_attached.append({"url": _h, "type": "pdf" if _hl.endswith(".pdf") else "zip", "name": _a.get_text(strip=True)[:60]})
                                # Subpage that matches objeto keywords
                                elif any(kw in _hl or kw in _t for kw in ["licitacion", "obra", "pliego"]):
                                    import unicodedata as _ud
                                    obj_words = [_ud.normalize('NFD', w).encode('ascii', 'ignore').decode() for w in objeto_lower.split() if len(w) >= 5][:3]
                                    if any(w in _hl for w in obj_words):
                                        # Follow subpage
                                        try:
                                            async with _sess.get(_h, timeout=_aiohttp.ClientTimeout(total=10), ssl=False) as _sr:
                                                if _sr.status == 200 and "html" in _sr.headers.get("Content-Type", ""):
                                                    _sh = await _sr.text()
                                                    _ss = _BS(_sh, "html.parser")
                                                    for _a2 in _ss.find_all("a", href=True):
                                                        _h2 = _a2["href"]
                                                        if _h2.startswith("/") or not _h2.startswith("http"):
                                                            _h2 = _urljoin(_h, _h2)
                                                        if any(_h2.lower().endswith(ext) for ext in (".pdf", ".xlsx", ".xls", ".zip")):
                                                            all_attached.append({"url": _h2, "type": "pdf" if _h2.lower().endswith(".pdf") else "zip", "name": _a2.get_text(strip=True)[:60]})
                                        except Exception:
                                            pass
            except Exception as _e:
                logger.warning(f"Failed to scrape landing page {durl_clean}: {_e}")

    pdf_texts = []

    # Check manually uploaded pliego documents in cotizacion (read from disk, no HTTP)
    try:
        cot = await db.cotizaciones.find_one({"licitacion_id": licitacion_id})
        if cot:
            for pdoc in (cot.get("pliego_documents") or []):
                url = pdoc.get("url", "")
                if url and "/api/documentos/" in url and "download" in url:
                    import re as _re_doc
                    m = _re_doc.search(r'/api/documentos/([a-f0-9]+)/download', url)
                    if m:
                        try:
                            doc = await db.documentos.find_one({"_id": ObjectId(m.group(1))})
                            if doc and doc.get("file_path") and os.path.isfile(doc["file_path"]):
                                with open(doc["file_path"], "rb") as f:
                                    pdf_bytes = f.read()
                                from services.enrichment.pdf_zip_enricher import extract_text_from_pdf_bytes
                                text = extract_text_from_pdf_bytes(pdf_bytes)
                                if text and text.strip():
                                    pdf_texts.append(text)
                                    logger.info(f"CotizAR: extracted {len(text)} chars from uploaded pliego {pdoc.get('name', '')}")
                        except Exception as e:
                            logger.warning(f"Failed to extract text from uploaded pliego: {e}")
    except Exception as e:
        logger.warning(f"Failed to check cotizacion pliego_documents: {e}")

    download_tasks = []
    seen_urls = set()
    for f in all_attached:
        url = f.get("url", "")
        ftype = (f.get("type") or "").lower()
        if not url or "javascript" in url.lower() or url in seen_urls:
            continue
        # Skip gazette PDFs (huge multi-process docs, not the actual pliego)
        if "/verpdf/" in url and "boe.mendoza" in url:
            continue
        seen_urls.add(url)
        if ftype == "pdf" or url.lower().endswith(".pdf"):
            download_tasks.append(extract_text_from_pdf_url(None, url))
        elif ftype == "zip" or url.lower().endswith(".zip"):
            download_tasks.append(extract_text_from_zip(None, url))

    if download_tasks:
        logger.info(f"CotizAR pliego: downloading {len(download_tasks)} attachments for {licitacion_id}")
        results = await asyncio.gather(*download_tasks, return_exceptions=True)
        for r in results:
            if isinstance(r, str) and r.strip():
                pdf_texts.append(r)
        if pdf_texts:
            logger.info(f"CotizAR pliego: extracted {sum(len(t) for t in pdf_texts)} chars from {len(pdf_texts)} files")

    pliego_full_text = "\n\n".join(pdf_texts)

    # --- Smart section extraction: find relevant parts in large PDFs ---
    if pliego_full_text and len(pliego_full_text) > 30000:
        import re
        text_lower = pliego_full_text.lower()
        sections = []

        # Always include the beginning (presupuesto, objeto, conditions) — first 5K
        sections.append(pliego_full_text[:5000])

        # Find the ITEMS section — where renglones/items/planilla de cotización live
        items_markers = [
            r'planilla\s+de\s+cotizaci[oó]n', r'c[oó]mputo\s+(?:m[eé]trico|y\s+presupuesto)',
            r'planilla\s+de\s+precio', r'presupuesto\s+detallado',
            r'rengl[oó]n\s+n[°º]?\s*\d', r'item\s+n[°º]?\s*\d',
            r'descripci[oó]n\s+.*\s+cantidad', r'cant\.\s+unid',
            r'\bitem\b.*\bprecio\b', r'\bitemizado\b',
            r'unidad\s+de\s+medida', r'precio\s+unitario',
        ]
        items_pos = -1
        for pattern in items_markers:
            m = re.search(pattern, text_lower)
            if m:
                # Start a bit before the match for context
                items_pos = max(0, m.start() - 500)
                logger.info(f"CotizAR pliego: found items section via '{pattern}' at pos {items_pos}/{len(pliego_full_text)}")
                break

        if items_pos >= 0:
            sections.append(pliego_full_text[items_pos:items_pos + 18000])
        else:
            # Fallback: find section with highest density of price/number patterns
            price_pattern = re.compile(r'\$\s*[\d.,]+|\d+[\.,]\d{2}')
            best_pos, best_score = 0, 0
            for pos in range(5000, len(pliego_full_text) - 18000 + 1, 5000):
                chunk = pliego_full_text[pos:pos + 18000]
                score = len(price_pattern.findall(chunk))
                if score > best_score:
                    best_score = score
                    best_pos = pos
            if best_score > 5:
                logger.info(f"CotizAR pliego: using price-density fallback at pos {best_pos} (score={best_score})")
                sections.append(pliego_full_text[best_pos:best_pos + 18000])
            else:
                # Last resort: keyword search or middle of document
                search_terms = []
                for field in [lic.get("objeto"), lic.get("title")]:
                    if field:
                        stopwords = {"para", "como", "este", "esta", "todo", "decreto", "provincia", "mendoza", "gobierno"}
                        words = [w for w in re.findall(r'[a-záéíóúñü]{4,}', field.lower()) if w not in stopwords]
                        search_terms.extend(words[:6])
                search_terms = list(dict.fromkeys(search_terms))
                if search_terms:
                    for pos in range(5000, len(pliego_full_text) - 18000 + 1, 5000):
                        score = sum(text_lower[pos:pos + 18000].count(t) for t in search_terms)
                        if score > best_score:
                            best_score = score
                            best_pos = pos
                sections.append(pliego_full_text[best_pos:best_pos + 18000])

        # Deduplicate overlapping sections
        pliego_full_text = "\n\n[...]\n\n".join(sections)

    # --- Build structured text payload in sections ---
    parts = []

    # Section 1: Structured data
    parts.append("=== DATOS ESTRUCTURADOS ===")
    if lic.get("objeto"):
        parts.append(f"Objeto: {lic['objeto']}")
    if lic.get("title"):
        parts.append(f"Título: {lic['title']}")
    if lic.get("budget"):
        parts.append(f"Presupuesto oficial: ${lic['budget']}")
    if lic.get("organization"):
        parts.append(f"Organismo: {lic['organization']}")
    if lic.get("tipo_procedimiento"):
        parts.append(f"Tipo: {lic['tipo_procedimiento']}")
    if lic.get("opening_date"):
        parts.append(f"Fecha de apertura: {lic['opening_date']}")
    if lic.get("encuadre_legal"):
        parts.append(f"Encuadre legal: {lic['encuadre_legal']}")
    if lic.get("garantias"):
        parts.append(f"Garantías: {json.dumps(lic['garantias'], ensure_ascii=False)[:500]}")
    # Circulares — HIGH PRIORITY: these MODIFY the base pliego
    if lic.get("circulares"):
        circ_parts = []
        for c in lic["circulares"]:
            num = c.get("numero", "?")
            circ_parts.append(f"Circular N° {num}")
            if c.get("fecha_publicacion"):
                circ_parts.append(f"  Fecha: {c['fecha_publicacion']}")
            if c.get("tipo"):
                circ_parts.append(f"  Tipo: {c['tipo']}")
            if c.get("motivo"):
                circ_parts.append(f"  Motivo: {c['motivo']}")
            if c.get("aclaracion"):
                circ_parts.append(f"  Aclaración: {c['aclaracion']}")
            if c.get("descripcion"):
                circ_parts.append(f"  Descripción: {c['descripcion']}")
            circ_parts.append("")
        parts.append("\n=== CIRCULARES (MÁXIMA PRIORIDAD — modifican el pliego base) ===")
        parts.append("IMPORTANTE: Las circulares CORRIGEN y tienen PRIORIDAD sobre el pliego original.")
        parts.append("Si una circular contradice algo del pliego, la circular PREVALECE.")
        parts.append("\n".join(circ_parts))

    if lic.get("duracion_contrato"):
        parts.append(f"Duración contrato: {lic['duracion_contrato']}")
    if lic.get("items"):
        items_str = json.dumps(lic["items"], ensure_ascii=False)[:2000]
        parts.append(f"Items del pliego: {items_str}")

    # COMPR.AR pliego fields
    meta = lic.get("metadata") or {}
    pliego_fields = meta.get("comprar_pliego_fields") or {}
    if pliego_fields:
        pliego_parts = [f"  {k}: {v}" for k, v in pliego_fields.items() if v]
        if pliego_parts:
            parts.append("Datos del pliego COMPR.AR:\n" + "\n".join(pliego_parts))

    # Cross-source items and descriptions from HUNTER
    all_items = list(lic.get("items") or []) + cross_items
    if cross_items and not lic.get("items"):
        items_str = json.dumps(cross_items[:30], ensure_ascii=False)[:3000]
        parts.append(f"Items de fuentes relacionadas: {items_str}")
    if cross_descriptions:
        parts.append("\n=== DATOS DE FUENTES RELACIONADAS (HUNTER) ===")
        for cd in cross_descriptions[:3]:
            parts.append(cd[:3000])

    # Section 2: Description field (skip if we have real pliego text — BOE descriptions confuse AI)
    if lic.get("description") and not pliego_full_text:
        desc = lic["description"]
        if not desc.strip().startswith("AUTORIDADES") and not desc.strip().startswith("INDICE"):
            parts.append("\n=== DESCRIPCIÓN ===")
            parts.append(desc[:5000])

    # Section 3: COMPR.AR pliego data (from auto-search)
    if comprar_pliego_text:
        parts.append("\n=== PLIEGO COMPR.AR (obtenido automáticamente del portal) ===")
        parts.append(comprar_pliego_text[:10000])

    # Section 4: Full pliego text from PDFs
    if pliego_full_text:
        parts.append("\n=== TEXTO COMPLETO DEL PLIEGO (extraído de PDFs adjuntos) ===")
        parts.append(pliego_full_text[:25000])

    text = "\n".join(parts)
    if len(text) < 20:
        return {"error": "Información insuficiente en la licitación", "items": [], "info_faltante": ["Sin descripción disponible"]}

    company_ctx = await _get_company_context_str(
        db, lic.get("organization", ""), lic.get("tipo_procedimiento", "")
    )
    if company_ctx:
        text += f"\n\n{company_ctx}"

    groq = get_groq_enrichment_service(db)
    pliego_result = await groq.extract_pliego_info(text, known_fields=known_fields_text)

    # Persist pliego_info to metadata so budget-hints can use cached items
    if pliego_result and not pliego_result.get("error"):
        try:
            await db.licitaciones.update_one(
                {"_id": lic["_id"]},
                {"$set": {"metadata.pliego_info": pliego_result}}
            )
        except Exception as e:
            logger.warning(f"Failed to persist pliego_info: {e}")

    return pliego_result


@router.get("/company-antecedentes/sectors")
async def get_company_antecedentes_sectors(request: Request):
    """Get available sectors with counts from UM antecedentes."""
    db = get_db(request)
    from services.um_antecedentes import get_um_antecedente_service
    service = get_um_antecedente_service(db)
    await service.ensure_indexes()
    return await service.get_sectors()


@router.post("/antecedentes-by-ids")
async def get_antecedentes_by_ids(body: Dict[str, Any], request: Request):
    """Resolve antecedente IDs to full objects. Searches both licitaciones and um_antecedentes."""
    db = get_db(request)
    ids = body.get("ids", [])
    if not ids:
        return []

    results = []
    lic_oids = []
    for i in ids:
        try:
            lic_oids.append(ObjectId(i))
        except Exception:
            continue
    if lic_oids:
        docs = await db.licitaciones.find({"_id": {"$in": lic_oids}}).to_list(len(lic_oids))
        for d in docs:
            results.append({
                "id": str(d["_id"]),
                "title": d.get("title", ""),
                "objeto": d.get("objeto", ""),
                "organization": d.get("organization", ""),
                "budget": d.get("budget"),
                "category": d.get("category", ""),
                "image_url": "",
                "source": "licitaciones",
            })

    found_ids = {r["id"] for r in results}
    missing = [i for i in ids if i not in found_ids]
    if missing:
        from services.um_antecedentes import get_um_antecedente_service
        service = get_um_antecedente_service(db)
        um_results = await service.get_by_ids(missing)
        results.extend(um_results)

    return results


@router.post("/search-company-antecedentes")
async def search_company_antecedentes(body: Dict[str, Any], request: Request):
    """Search Ultima Milla company antecedentes from ultimamilla.com.ar + SGI."""
    db = get_db(request)
    licitacion_id = body.get("licitacion_id")
    keywords = body.get("keywords")
    sector = body.get("sector")
    skip = body.get("skip", 0)
    limit = body.get("limit", 15)

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
    return await service.search(keywords=keywords, sector=sector, limit=limit, skip=skip)


@router.post("/extract-marco-legal")
async def extract_marco_legal(body: Dict[str, Any], request: Request):
    """Extract legal framework analysis for bidding preparation."""
    db = get_db(request)
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
    budget = body.get("budget_override") or lic.get("budget")
    if budget:
        parts.append(f"Presupuesto oficial: ${budget}")
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

    groq = get_groq_enrichment_service(db)
    result = await groq.extract_marco_legal(context)

    # Attach threshold info to response if available
    if threshold_info:
        result["threshold_info"] = threshold_info

    return result


@router.post("/pliego-summary/{licitacion_id}")
async def pliego_summary(licitacion_id: str, request: Request):
    """Analyze a pliego and return a structured summary (legal framework, requirements, checklist)."""
    db = get_db(request)
    try:
        from services.pliego_finder import find_pliegos
        result = await find_pliegos(db, licitacion_id)
    except Exception as e:
        raise HTTPException(500, f"Error buscando pliego: {e}")

    text = result.get("text_extracted") or ""
    if not text or len(text) < 100:
        raise HTTPException(400, "Sin texto de pliego disponible. Enriquecé la licitación primero.")

    try:
        lic = await db.licitaciones.find_one({"_id": ObjectId(licitacion_id)})
    except Exception:
        lic = None

    context = ""
    if lic:
        context = (
            f"Objeto: {lic.get('objeto') or lic.get('title', '')}\n"
            f"Organismo: {lic.get('organization', '')}\n"
            f"Presupuesto: {lic.get('budget') or 'No informado'}\n\n"
        )
    context += f"TEXTO DEL PLIEGO:\n{text[:6000]}"

    groq = get_groq_enrichment_service(db)
    summary = await groq.extract_marco_legal(context)
    summary["pliegos_encontrados"] = len([p for p in result.get("pliegos", []) if p.get("type") != "metadata"])
    summary["strategy_used"] = result.get("strategy_used")
    return summary


class PliegoChatBody(dict):
    pass


@router.post("/pliego-chat/{licitacion_id}")
async def pliego_chat(licitacion_id: str, body: Dict[str, Any], request: Request):
    """Answer a free-form question about a pliego using AI."""
    message = (body.get("message") or "").strip()
    if not message:
        raise HTTPException(400, "message requerido")

    db = get_db(request)
    try:
        from services.pliego_finder import find_pliegos
        result = await find_pliegos(db, licitacion_id)
    except Exception as e:
        raise HTTPException(500, f"Error buscando pliego: {e}")

    text = result.get("text_extracted") or ""
    if not text or len(text) < 50:
        raise HTTPException(400, "Sin texto de pliego disponible. Enriquecé la licitación primero.")

    groq = get_groq_enrichment_service(db)
    response = await groq.pliego_chat(text, message)
    return {"response": response}
