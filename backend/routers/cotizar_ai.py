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

    # --- COMPR.AR auto-search: when description references compras.mendoza.gov.ar ---
    comprar_pliego_text = ""
    desc_text = lic.get("description") or ""
    lic_number = lic.get("licitacion_number") or ""
    source_url = lic.get("source_url") or ""
    is_comprar = "comprar.mendoza.gov.ar" in source_url or "comprar.mendoza" in source_url
    refs_comprar = "compras.mendoza.gov.ar" in desc_text or "comprar.mendoza.gov.ar" in desc_text

    if (refs_comprar or is_comprar) and lic_number and not (lic.get("metadata") or {}).get("comprar_pliego_fields"):
        try:
            import re as _re
            # Extract the core process number (strip trailing -N suffixes)
            core_num = _re.sub(r'-\d+$', '', lic_number).strip()
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

    # Extract URLs from description text that might be pliego download pages
    desc_for_urls = (lic.get("description") or "") + " " + comprar_pliego_text
    import re as _re
    desc_urls = _re.findall(r'https?://[^\s<>"\')\]]+', desc_for_urls)
    for durl in desc_urls:
        durl_clean = durl.rstrip(".,;:")
        if durl_clean.lower().endswith(".pdf") or durl_clean.lower().endswith(".zip"):
            all_attached.append({"url": durl_clean, "type": "pdf" if durl_clean.lower().endswith(".pdf") else "zip"})
        elif any(kw in durl_clean.lower() for kw in ("pliego", "licitacion", "descarga", "download")):
            all_attached.append({"url": durl_clean, "type": "pdf"})

    pdf_texts = []
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

    # Section 2: Description field (always include if available)
    if lic.get("description"):
        desc = lic["description"]
        # Skip gazette TOC (starts with AUTORIDADES or INDICE)
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

    groq = get_groq_enrichment_service()
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
