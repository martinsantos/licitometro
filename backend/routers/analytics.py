"""Analytics endpoints for adjudicaciones (admin-only).

Mounted as /api/analytics/*. Admin-only enforced by server.py middleware
via the ADMIN_ONLY_PREFIXES tuple.
"""
from __future__ import annotations

from fastapi import APIRouter, Request, HTTPException, Query
from typing import Optional
from datetime import datetime, timedelta
import logging

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from services.adjudicacion_service import get_adjudicacion_service

logger = logging.getLogger("analytics_router")

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


def _get_db(request: Request):
    return request.app.mongodb


def _parse_since(days: Optional[int]) -> Optional[datetime]:
    if days and days > 0:
        return datetime.utcnow() - timedelta(days=days)
    return None


@router.get("/summary")
async def summary(request: Request):
    """Dashboard header: counts by source, unique suppliers, last ingest."""
    db = _get_db(request)
    svc = get_adjudicacion_service(db)
    return await svc.summary()


@router.get("/adjudicaciones/top-suppliers")
async def top_suppliers(
    request: Request,
    days: Optional[int] = Query(None, description="Ventana en días (ej: 365)"),
    category: Optional[str] = None,
    supplier: Optional[str] = None,
    organization: Optional[str] = None,
    limit: int = Query(20, ge=1, le=200),
    min_confidence: float = Query(0.0, ge=0.0, le=1.0),
):
    """Top adjudicatarios por monto total."""
    db = _get_db(request)
    svc = get_adjudicacion_service(db)
    return await svc.top_suppliers(
        since=_parse_since(days),
        category=category,
        supplier=supplier,
        organization=organization,
        limit=limit,
        min_confidence=min_confidence,
    )


@router.get("/adjudicaciones/price-ranges")
async def price_ranges(
    request: Request,
    days: Optional[int] = None,
    min_sample: int = Query(3, ge=1),
    min_confidence: float = Query(0.7, ge=0.0, le=1.0),
    supplier: Optional[str] = None,
):
    """Spread de precios por categoría (min/p25/median/p75/max)."""
    db = _get_db(request)
    svc = get_adjudicacion_service(db)
    return await svc.price_ranges_by_category(
        since=_parse_since(days),
        min_sample=min_sample,
        min_confidence=min_confidence,
        supplier=supplier,
    )


@router.get("/adjudicaciones/vacancias")
async def vacancias(
    request: Request,
    days: Optional[int] = None,
    min_count: int = Query(2, ge=1),
    max_suppliers_avg: float = Query(2.0, gt=0.0),
    supplier: Optional[str] = None,
):
    """Rubros con pocos competidores (oportunidades de entrada)."""
    db = _get_db(request)
    svc = get_adjudicacion_service(db)
    return await svc.vacancias(
        since=_parse_since(days),
        min_count=min_count,
        max_suppliers_avg=max_suppliers_avg,
        supplier=supplier,
    )


@router.get("/adjudicaciones/supplier")
async def supplier_detail(request: Request, name: str = Query(..., min_length=2)):
    """Todo sobre un proveedor específico: totales, por año, por rubro, historial reciente."""
    db = _get_db(request)
    svc = get_adjudicacion_service(db)
    return await svc.supplier_detail(name)


@router.get("/adjudicaciones/activity-by-year")
async def activity_by_year(
    request: Request,
    category: Optional[str] = None,
    supplier: Optional[str] = None,
):
    """Actividad año-a-año: cantidad, monto total, proveedores únicos."""
    db = _get_db(request)
    svc = get_adjudicacion_service(db)
    return await svc.activity_by_year(category=category, supplier=supplier)


@router.get("/adjudicaciones/categories")
async def categories(request: Request):
    """Lista de rubros disponibles con conteo — para dropdown de filtro."""
    db = _get_db(request)
    svc = get_adjudicacion_service(db)
    return await svc.list_categories()


@router.get("/adjudicaciones/monto-vs-budget")
async def monto_vs_budget(
    request: Request,
    days: Optional[int] = None,
):
    """Ratio adjudicado/presupuestado por organización."""
    db = _get_db(request)
    svc = get_adjudicacion_service(db)
    return await svc.monto_vs_budget(since=_parse_since(days))


@router.get("/adjudicaciones/search")
async def search(
    request: Request,
    q: Optional[str] = None,
    category: Optional[str] = None,
    supplier: Optional[str] = None,
    cuit: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
):
    """Buscador libre sobre adjudicaciones."""
    db = _get_db(request)
    svc = get_adjudicacion_service(db)
    if not any([q, category, supplier, cuit]):
        raise HTTPException(400, "Provide at least one filter: q, category, supplier, or cuit")
    return await svc.search(q=q, category=category, supplier=supplier, cuit=cuit, limit=limit)
