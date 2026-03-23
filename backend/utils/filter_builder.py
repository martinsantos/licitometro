"""
Single source of truth for MongoDB query filter construction.

Used by: listing endpoint, facets endpoint, count endpoint, debug-filters.
Both the main listing and facets call build_base_filters() with identical
parameters so that sidebar counts always match listing totals.
"""
from datetime import date, datetime
from typing import Any, Dict, List, Optional
import re

ALLOWED_DATE_FIELDS = [
    "publication_date", "opening_date", "expiration_date",
    "fecha_publicacion_portal", "fecha_inicio_consultas", "fecha_fin_consultas",
    "created_at", "fecha_scraping", "first_seen_at",
]


def build_base_filters(
    *,
    fuente: Optional[str] = None,
    organization: Optional[str] = None,
    status: Optional[str] = None,
    category: Optional[str] = None,
    workflow_state: Optional[str] = None,
    jurisdiccion: Optional[str] = None,
    tipo_procedimiento: Optional[str] = None,
    nodo: Optional[str] = None,
    estado: Optional[str] = None,
    location: Optional[str] = None,
    budget_min: Optional[float] = None,
    budget_max: Optional[float] = None,
    fecha_desde: Optional[date] = None,
    fecha_hasta: Optional[date] = None,
    fecha_campo: str = "publication_date",
    nuevas_desde: Optional[date] = None,
    year: Optional[str] = None,
    only_national: bool = False,
    fuente_exclude: Optional[List[str]] = None,
    q: Optional[str] = None,
    auto_future_opening: bool = False,
) -> Dict[str, Any]:
    """Build MongoDB filter dict from all supported parameters.

    Returns a dict ready to be used as a MongoDB query filter.
    Both the listing and facets endpoints call this to ensure identical filtering.
    """
    filters: Dict[str, Any] = {}

    # Tags: LIC_AR handling
    if only_national:
        filters["tags"] = "LIC_AR"
    else:
        filters["tags"] = {"$ne": "LIC_AR"}

    # Exact match fields
    if status:
        filters["status"] = status
    if category:
        filters["category"] = category
    if workflow_state:
        filters["workflow_state"] = workflow_state
    if jurisdiccion:
        filters["jurisdiccion"] = jurisdiccion
    if tipo_procedimiento:
        filters["tipo_procedimiento"] = tipo_procedimiento
    if estado:
        if ',' in estado:
            filters["estado"] = {"$in": [s.strip() for s in estado.split(',')]}
        else:
            filters["estado"] = estado
    else:
        # Default: excluir archivadas. Usuario puede opt-in via sidebar EstadoFilter.
        filters["estado"] = {"$ne": "archivada"}
    if location:
        filters["location"] = location

    # Case-insensitive anchored regex
    if fuente:
        filters["fuente"] = {"$regex": f"^{re.escape(fuente)}$", "$options": "i"}
    if organization:
        filters["organization"] = {"$regex": f"^{re.escape(organization)}$", "$options": "i"}

    # Nodos (array field)
    if nodo:
        filters["nodos"] = nodo

    # Budget range
    if budget_min is not None or budget_max is not None:
        budget_filter: Dict[str, float] = {}
        if budget_min is not None:
            budget_filter["$gte"] = budget_min
        if budget_max is not None:
            budget_filter["$lte"] = budget_max
        filters["budget"] = budget_filter

    # Date range
    field = fecha_campo if fecha_campo in ALLOWED_DATE_FIELDS else "publication_date"
    if fecha_desde or fecha_hasta:
        date_filter: Dict[str, datetime] = {}
        if fecha_desde:
            date_filter["$gte"] = datetime.combine(fecha_desde, datetime.min.time())
        if fecha_hasta:
            date_filter["$lte"] = datetime.combine(fecha_hasta, datetime.max.time())
        if date_filter:
            filters[field] = date_filter

    # Year filter (always publication_date)
    if year and year != "all":
        try:
            year_num = int(year)
            year_start = datetime(year_num, 1, 1)
            year_end = datetime(year_num, 12, 31, 23, 59, 59)
            if "publication_date" in filters:
                existing = filters["publication_date"]
                filters["publication_date"] = {
                    "$gte": max(existing.get("$gte", year_start), year_start),
                    "$lte": min(existing.get("$lte", year_end), year_end),
                }
            else:
                filters["publication_date"] = {"$gte": year_start, "$lte": year_end}
        except (ValueError, TypeError):
            pass

    # Auto-filter: when sorting by opening_date, only show future openings OR items without opening_date
    if auto_future_opening and not q:
        today = date.today()
        if not fecha_desde or fecha_desde < today:
            today_dt = datetime.combine(today, datetime.min.time())
            filters.setdefault("$and", []).append({
                "$or": [
                    {"opening_date": {"$gte": today_dt}},
                    {"opening_date": None},
                ]
            })

    # Nuevas desde (first_seen_at >= date)
    if nuevas_desde:
        filters["first_seen_at"] = {"$gte": datetime.combine(nuevas_desde, datetime.min.time())}

    # Fuente exclude — ALWAYS via $and to avoid overwriting fuente filter
    if fuente_exclude:
        if "fuente" in filters:
            filters.setdefault("$and", []).append({"fuente": {"$nin": fuente_exclude}})
        else:
            filters["fuente"] = {"$nin": fuente_exclude}

    # Text search
    if q:
        filters["$text"] = {"$search": q}

    return filters


def build_cross_match(base_filters: Dict[str, Any], exclude_field: str) -> Dict[str, Any]:
    """Remove one logical dimension from filters for facet cross-counting.

    Removes the top-level key and any $and entries referencing the excluded field.
    """
    cross = {k: v for k, v in base_filters.items() if k != exclude_field}

    # Remove entries for the excluded field from $and (generalised, not just fuente)
    if "$and" in cross:
        cross["$and"] = [
            cond for cond in cross["$and"]
            if exclude_field not in cond
        ]
        if not cross["$and"]:
            del cross["$and"]

    return cross
