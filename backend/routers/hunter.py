"""
HUNTER Interactive Router — Cross-source search, deep search, and merge for licitaciones.

Provides an interactive endpoint for the frontend to search for related procurement items
across different data sources (COMPR.AR, Boletín Oficial, ComprasApps, etc.) and merge
data from them into the base licitación.
"""

from fastapi import APIRouter, HTTPException, Request, Body
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import logging
import re
from bson import ObjectId

from db.models import licitacion_entity
from utils.time import utc_now

logger = logging.getLogger("hunter_router")

router = APIRouter(
    prefix="/api/licitaciones",
    tags=["hunter"],
    responses={404: {"description": "Not found"}},
)


class HunterRequest(BaseModel):
    action: str  # "search" | "merge" | "deep_search"
    related_id: Optional[str] = None  # required for "merge"


# ── Field lists used for preview building ────────────────────────────

_MERGEABLE_FIELDS = [
    "description", "objeto", "expedient_number", "licitacion_number",
    "contact", "budget", "currency", "opening_date", "expiration_date",
    "location", "category", "tipo_procedimiento",
]

_PREVIEW_FIELDS = [
    "description", "objeto", "budget", "currency", "opening_date",
    "expiration_date", "expedient_number", "licitacion_number",
    "contact", "location", "category", "tipo_procedimiento",
    "organization", "items", "attached_files",
]


# ── Helpers ──────────────────────────────────────────────────────────

def _build_match_preview(match: dict, base: dict) -> dict:
    """Build a rich preview dict for a single match, relative to the base licitación."""
    match_id = match.get("id") or str(match.get("_id", ""))

    # Determine which non-empty fields exist on the match
    fields_available = [f for f in _PREVIEW_FIELDS if match.get(f)]

    # Which empty-on-base fields could this match fill?
    fields_would_fill = [
        f for f in _MERGEABLE_FIELDS
        if not base.get(f) and match.get(f)
    ]

    # Items count
    items = match.get("items") or []
    attached = match.get("attached_files") or []

    # Description preview
    desc = match.get("description") or match.get("objeto") or ""
    desc_preview = desc[:200] + ("…" if len(desc) > 200 else "")

    return {
        "id": match_id,
        "title": match.get("title", ""),
        "fuente": match.get("fuente", ""),
        "organization": match.get("organization", ""),
        "budget": match.get("budget"),
        "currency": match.get("currency"),
        "source_url": match.get("source_url"),
        "publication_date": match.get("publication_date"),
        "opening_date": match.get("opening_date"),
        "proceso_id": match.get("proceso_id"),
        "description_preview": desc_preview,
        "fields_available": fields_available,
        "fields_would_fill": fields_would_fill,
        "items_count": len(items),
        "attached_files_count": len(attached),
    }


def _extract_search_keywords(text: str, max_words: int = 8) -> List[str]:
    """Extract significant keywords from text, filtering Spanish stopwords."""
    stopwords = {
        "de", "del", "la", "las", "los", "el", "en", "y", "a", "para",
        "por", "con", "un", "una", "se", "al", "es", "que", "su", "o",
        "no", "lo", "le", "da", "e", "n", "varios", "varias", "sobre",
        "licitacion", "licitación", "publica", "pública", "privada",
        "contratacion", "contratación", "directa", "decreto", "resolucion",
        "resolución", "gobierno", "provincia", "mendoza", "municipal",
    }
    words = re.sub(r"[^\w\s]", " ", text.lower()).split()
    significant = [w for w in words if w not in stopwords and len(w) >= 4]
    # Deduplicate preserving order
    seen = set()
    unique = []
    for w in significant:
        if w not in seen:
            seen.add(w)
            unique.append(w)
    return unique[:max_words]


def _deduplicate_matches(base_matches: List[dict], extra_matches: List[dict]) -> List[dict]:
    """Return extra_matches that are not already in base_matches (by id)."""
    existing_ids = {m.get("id") or str(m.get("_id", "")) for m in base_matches}
    return [m for m in extra_matches if (m.get("id") or str(m.get("_id", ""))) not in existing_ids]


# ── Adjudicaciones search ────────────────────────────────────────────

async def _search_adjudicaciones(db, base: dict, exclude_id: str) -> List[dict]:
    """Search for adjudicación/decreto items that reference the same proceso/expediente/number."""
    proceso_id = base.get("proceso_id")
    expediente = base.get("expedient_number")
    lic_number = base.get("licitacion_number")

    or_clauses = []

    # By proceso_id
    if proceso_id:
        or_clauses.append({"proceso_id": proceso_id})

    # By expediente in description/title
    if expediente and len(expediente) >= 3:
        escaped = re.escape(expediente)
        or_clauses.append({"description": {"$regex": escaped, "$options": "i"}})
        or_clauses.append({"title": {"$regex": escaped, "$options": "i"}})

    # By licitacion_number in description/title
    if lic_number and len(str(lic_number)) >= 2:
        escaped = re.escape(str(lic_number))
        or_clauses.append({"description": {"$regex": escaped, "$options": "i"}})
        or_clauses.append({"title": {"$regex": escaped, "$options": "i"}})

    if not or_clauses:
        return []

    # Filter for adjudicación-type items
    adj_keywords = re.compile(r"adjudica|decreto|resoluci[oó]n", re.IGNORECASE)
    try:
        oid = ObjectId(exclude_id)
    except Exception:
        oid = None

    query: Dict[str, Any] = {
        "$or": or_clauses,
        "$and": [
            {"$or": [
                {"tipo_procedimiento": {"$regex": "adjudica", "$options": "i"}},
                {"title": {"$regex": "adjudica|decreto", "$options": "i"}},
            ]}
        ],
    }
    if oid:
        query["_id"] = {"$ne": oid}

    results = []
    cursor = db.licitaciones.find(query).limit(5)
    async for doc in cursor:
        results.append(licitacion_entity(doc))
    return results


# ── Deep search strategies ───────────────────────────────────────────

async def _deep_text_search(db, base: dict, exclude_id: str, exclude_fuente: str) -> List[dict]:
    """MongoDB $text search using objeto keywords (score >= 2.0)."""
    objeto = base.get("objeto") or base.get("title") or ""
    keywords = _extract_search_keywords(objeto, max_words=8)
    if len(keywords) < 3:
        return []

    text_query = " ".join(keywords)
    try:
        oid = ObjectId(exclude_id)
    except Exception:
        oid = None

    query: Dict[str, Any] = {
        "$text": {"$search": text_query},
        "fuente": {"$ne": exclude_fuente},
    }
    if oid:
        query["_id"] = {"$ne": oid}

    results = []
    try:
        cursor = db.licitaciones.find(
            query,
            {"score": {"$meta": "textScore"}},
        ).sort([("score", {"$meta": "textScore"})]).limit(10)

        async for doc in cursor:
            if doc.get("score", 0) >= 2.0:
                results.append(licitacion_entity(doc))
    except Exception as e:
        logger.debug(f"Deep text search failed: {e}")

    return results


async def _deep_category_budget_search(
    db, base: dict, exclude_id: str, exclude_fuente: str,
) -> List[dict]:
    """Search by same category + similar budget range (within 5x)."""
    category = base.get("category")
    budget = base.get("budget")

    if not category or not budget:
        return []

    try:
        budget_val = float(budget)
    except (TypeError, ValueError):
        return []

    if budget_val <= 0:
        return []

    budget_low = budget_val / 5.0
    budget_high = budget_val * 5.0

    try:
        oid = ObjectId(exclude_id)
    except Exception:
        oid = None

    query: Dict[str, Any] = {
        "category": category,
        "budget": {"$gte": budget_low, "$lte": budget_high},
        "fuente": {"$ne": exclude_fuente},
    }
    if oid:
        query["_id"] = {"$ne": oid}

    results = []
    try:
        cursor = db.licitaciones.find(query).sort("budget", -1).limit(10)
        async for doc in cursor:
            results.append(licitacion_entity(doc))
    except Exception as e:
        logger.debug(f"Deep category+budget search failed: {e}")

    return results


async def _deep_boe_adjudicaciones(
    db, base: dict, exclude_id: str,
) -> List[dict]:
    """Search BOE adjudicaciones by number patterns found in title/description."""
    from utils.proceso_id import extract_identifiers_from_text

    title = base.get("title", "")
    description = base.get("description", "")
    objeto = base.get("objeto", "")
    ids = extract_identifiers_from_text(title, description, objeto)

    if not ids.get("numbers"):
        return []

    or_clauses = []
    for number in ids["numbers"][:5]:
        escaped = re.escape(number)
        or_clauses.append({"title": {"$regex": escaped, "$options": "i"}})
        or_clauses.append({"description": {"$regex": escaped, "$options": "i"}})

    if not or_clauses:
        return []

    try:
        oid = ObjectId(exclude_id)
    except Exception:
        oid = None

    query: Dict[str, Any] = {
        "$or": or_clauses,
        "fuente": {"$regex": "boletin", "$options": "i"},
    }
    if oid:
        query["_id"] = {"$ne": oid}

    results = []
    try:
        cursor = db.licitaciones.find(query).limit(5)
        async for doc in cursor:
            results.append(licitacion_entity(doc))
    except Exception as e:
        logger.debug(f"Deep BOE adjudicaciones search failed: {e}")

    return results


# ── Main endpoint ────────────────────────────────────────────────────

@router.post("/{licitacion_id}/hunter")
async def hunter_interactive(
    licitacion_id: str,
    body: HunterRequest,
    request: Request,
):
    """
    Interactive HUNTER endpoint for cross-source search, deep search, and merge.

    Actions:
    - search: Find related items across sources (structured field matching)
    - deep_search: Everything from search + text/category/budget/BOE fallbacks
    - merge: Merge data from a related item + re-run nodo matching
    """
    db = request.app.mongodb

    # ── Validate licitacion exists ───────────────────────────────
    try:
        doc = await db.licitaciones.find_one({"_id": ObjectId(licitacion_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid licitacion_id format")

    if not doc:
        raise HTTPException(status_code=404, detail="Licitacion not found")

    base = licitacion_entity(doc)

    # ── ACTION: search ───────────────────────────────────────────
    if body.action == "search":
        return await _handle_search(db, base, doc, licitacion_id)

    # ── ACTION: deep_search ──────────────────────────────────────
    if body.action == "deep_search":
        return await _handle_deep_search(db, base, doc, licitacion_id)

    # ── ACTION: merge ────────────────────────────────────────────
    if body.action == "merge":
        return await _handle_merge(db, base, licitacion_id, body.related_id)

    raise HTTPException(status_code=400, detail=f"Unknown action: {body.action}. Use search, deep_search, or merge.")


async def _handle_search(db, base: dict, doc: dict, licitacion_id: str) -> dict:
    """Handle action=search: structured cross-source matching."""
    from services.cross_source_service import CrossSourceService

    cross_svc = CrossSourceService(db)
    related = await cross_svc.find_related(doc, limit=15)

    matches = [_build_match_preview(m, base) for m in related]

    # Search for adjudicaciones
    adjudicaciones_raw = await _search_adjudicaciones(db, base, licitacion_id)
    adjudicaciones = [_build_match_preview(a, base) for a in adjudicaciones_raw]

    # Deduplicate adjudicaciones against matches
    match_ids = {m["id"] for m in matches}
    adjudicaciones = [a for a in adjudicaciones if a["id"] not in match_ids]

    return {
        "licitacion_id": licitacion_id,
        "action": "search",
        "matches": matches,
        "adjudicaciones": adjudicaciones,
        "search_stats": {
            "matches_found": len(matches),
            "adjudicaciones_found": len(adjudicaciones),
            "search_fields_used": _describe_search_fields(base),
        },
    }


async def _handle_deep_search(db, base: dict, doc: dict, licitacion_id: str) -> dict:
    """Handle action=deep_search: structured + text + category/budget + BOE fallbacks."""
    from services.cross_source_service import CrossSourceService

    fuente = base.get("fuente", "")
    cross_svc = CrossSourceService(db)

    # Phase 1: Standard structured search (same as "search")
    related = await cross_svc.find_related(doc, limit=15)
    all_matches_raw = list(related)

    # Phase 2: $text search with objeto keywords
    text_results = await _deep_text_search(db, base, licitacion_id, fuente)
    new_text = _deduplicate_matches(all_matches_raw, text_results)
    all_matches_raw.extend(new_text)

    # Phase 3: Category + budget range search
    cat_results = await _deep_category_budget_search(db, base, licitacion_id, fuente)
    new_cat = _deduplicate_matches(all_matches_raw, cat_results)
    all_matches_raw.extend(new_cat)

    # Phase 4: BOE adjudicaciones by number patterns
    boe_results = await _deep_boe_adjudicaciones(db, base, licitacion_id)
    new_boe = _deduplicate_matches(all_matches_raw, boe_results)
    all_matches_raw.extend(new_boe)

    matches = [_build_match_preview(m, base) for m in all_matches_raw]

    # Adjudicaciones search
    adjudicaciones_raw = await _search_adjudicaciones(db, base, licitacion_id)
    adjudicaciones = [_build_match_preview(a, base) for a in adjudicaciones_raw]

    match_ids = {m["id"] for m in matches}
    adjudicaciones = [a for a in adjudicaciones if a["id"] not in match_ids]

    return {
        "licitacion_id": licitacion_id,
        "action": "deep_search",
        "matches": matches,
        "adjudicaciones": adjudicaciones,
        "search_stats": {
            "matches_found": len(matches),
            "adjudicaciones_found": len(adjudicaciones),
            "search_fields_used": _describe_search_fields(base),
            "strategies_used": {
                "structured": len(related),
                "text_search": len(new_text),
                "category_budget": len(new_cat),
                "boe_patterns": len(new_boe),
            },
        },
    }


async def _handle_merge(db, base: dict, licitacion_id: str, related_id: Optional[str]) -> dict:
    """Handle action=merge: merge data from related item + re-run nodo matching."""
    if not related_id:
        raise HTTPException(status_code=400, detail="related_id is required for merge action")

    from services.cross_source_service import CrossSourceService
    from services.nodo_matcher import get_nodo_matcher

    cross_svc = CrossSourceService(db)
    merged = await cross_svc.merge_source_data(licitacion_id, related_id)

    if not merged:
        raise HTTPException(status_code=404, detail="Base or related item not found")

    # Re-run nodo matching on the merged item
    nodo_ids = []
    try:
        matcher = get_nodo_matcher(db)
        nodo_ids = await matcher.assign_nodos_to_licitacion(
            lic_id=licitacion_id,
            title=merged.get("title", ""),
            objeto=merged.get("objeto", ""),
            description=merged.get("description", ""),
            organization=merged.get("organization", ""),
            category=merged.get("category", ""),
        )
    except Exception as e:
        logger.warning(f"Nodo re-matching failed after merge for {licitacion_id}: {e}")

    # Extract what was merged from the merge log
    meta = merged.get("metadata") or {}
    merges = meta.get("cross_source_merges") or []
    fields_merged = []
    if merges:
        last_merge = merges[-1]
        fields_merged = last_merge.get("fields_merged", [])

    return {
        "licitacion_id": licitacion_id,
        "action": "merge",
        "success": True,
        "related_id": related_id,
        "fields_merged": fields_merged,
        "nodos_matched": nodo_ids,
        "merged_item": merged,
    }


def _describe_search_fields(base: dict) -> dict:
    """Describe which structured fields were available for search."""
    return {
        "proceso_id": bool(base.get("proceso_id")),
        "expedient_number": bool(base.get("expedient_number")),
        "licitacion_number": bool(base.get("licitacion_number")),
        "category": bool(base.get("category")),
        "budget": bool(base.get("budget")),
        "objeto": bool(base.get("objeto")),
    }
