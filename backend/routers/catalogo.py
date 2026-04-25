"""Catálogo de productos/servicios por empresa — CRUD + importador CSV/XLSX."""

import io
import logging
from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, HTTPException, Query, Request, UploadFile, File
from pydantic import BaseModel

from db.models import catalogo_entity
from models.producto_catalogo import ProductoCatalogo

logger = logging.getLogger("catalogo")

router = APIRouter(prefix="/api/catalogo", tags=["catalogo"])

UNIDADES_VALIDAS = {"UN", "M2", "M3", "ML", "KG", "TN", "LTS", "HS", "GL", "KM", "M", "CM", "MM"}


def _utcnow():
    return datetime.now(timezone.utc)


class ProductoUpdate(BaseModel):
    sku: Optional[str] = None
    descripcion: Optional[str] = None
    unidad_medida: Optional[str] = None
    precio_unitario: Optional[float] = None
    moneda: Optional[str] = None
    vigencia_hasta: Optional[datetime] = None
    categoria: Optional[str] = None
    notas: Optional[str] = None


@router.get("")
async def list_catalogo(
    request: Request,
    empresa_id: str = Query(...),
    categoria: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    limit: int = Query(200, le=500),
    page: int = Query(1, ge=1),
):
    db = request.app.mongodb
    query: dict = {"empresa_id": empresa_id}
    if categoria:
        query["categoria"] = categoria
    if q:
        query["$text"] = {"$search": q}

    skip = (page - 1) * limit
    total = await db.catalogo_productos.count_documents(query)
    sort = [("score", {"$meta": "textScore"})] if q else [("descripcion", 1)]
    projection = {"score": {"$meta": "textScore"}} if q else None

    cursor = db.catalogo_productos.find(query, projection).sort(sort).skip(skip).limit(limit)
    docs = await cursor.to_list(length=limit)
    from utils.pagination import paginated_response
    return paginated_response([catalogo_entity(d) for d in docs], total, page, limit)


@router.post("")
async def create_producto(body: ProductoCatalogo, request: Request):
    db = request.app.mongodb
    now = _utcnow()
    data = body.model_dump()
    data["created_at"] = now
    data["updated_at"] = now
    result = await db.catalogo_productos.insert_one(data)
    doc = await db.catalogo_productos.find_one({"_id": result.inserted_id})
    return catalogo_entity(doc)


@router.put("/{item_id}")
async def update_producto(item_id: str, body: ProductoUpdate, request: Request):
    db = request.app.mongodb
    try:
        oid = ObjectId(item_id)
    except Exception:
        raise HTTPException(400, "ID inválido")

    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "Sin campos para actualizar")
    updates["updated_at"] = _utcnow()

    result = await db.catalogo_productos.update_one({"_id": oid}, {"$set": updates})
    if result.matched_count == 0:
        raise HTTPException(404, "Producto no encontrado")
    doc = await db.catalogo_productos.find_one({"_id": oid})
    return catalogo_entity(doc)


@router.delete("/{item_id}")
async def delete_producto(item_id: str, request: Request):
    db = request.app.mongodb
    try:
        oid = ObjectId(item_id)
    except Exception:
        raise HTTPException(400, "ID inválido")
    result = await db.catalogo_productos.delete_one({"_id": oid})
    if result.deleted_count == 0:
        raise HTTPException(404, "Producto no encontrado")
    return {"deleted": item_id}


@router.post("/import")
async def import_catalogo(
    request: Request,
    empresa_id: str = Query(...),
    file: UploadFile = File(...),
):
    """Import products from CSV or XLSX. Returns count of imported items."""
    content = await file.read()
    filename = (file.filename or "").lower()

    rows = []
    if filename.endswith(".csv"):
        import csv
        text = content.decode("utf-8-sig", errors="replace")
        reader = csv.DictReader(io.StringIO(text))
        rows = list(reader)
    elif filename.endswith((".xlsx", ".xls")):
        import openpyxl
        wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
        ws = wb.active
        headers = None
        for row in ws.iter_rows(values_only=True):
            if headers is None:
                headers = [str(c).strip().lower() if c else "" for c in row]
                continue
            if not any(row):
                continue
            rows.append(dict(zip(headers, row)))
    else:
        raise HTTPException(400, "Formato no soportado. Usar .csv o .xlsx")

    # Column aliases for flexible headers
    COL_MAP = {
        "descripcion": ["descripcion", "descripción", "nombre", "producto", "servicio", "item", "detalle"],
        "unidad_medida": ["unidad_medida", "unidad", "um", "uom"],
        "precio_unitario": ["precio_unitario", "precio", "price", "costo", "valor"],
        "sku": ["sku", "codigo", "código", "code", "ref"],
        "categoria": ["categoria", "categoría", "rubro", "tipo"],
        "moneda": ["moneda", "currency"],
        "notas": ["notas", "observaciones", "obs", "notes"],
    }

    def _find_col(row_keys, aliases):
        for alias in aliases:
            for k in row_keys:
                if k == alias or k.startswith(alias):
                    return k
        return None

    db = request.app.mongodb
    now = _utcnow()
    inserted = 0
    errors = []

    for i, row in enumerate(rows, start=2):
        keys = list(row.keys())
        desc_col = _find_col(keys, COL_MAP["descripcion"])
        price_col = _find_col(keys, COL_MAP["precio_unitario"])

        if not desc_col:
            errors.append(f"Fila {i}: sin columna descripcion")
            continue

        desc = str(row.get(desc_col, "")).strip()
        if not desc:
            continue

        try:
            precio = float(str(row.get(price_col, 0) or 0).replace(",", ".").replace("$", "").strip()) if price_col else 0.0
        except (ValueError, TypeError):
            precio = 0.0

        um_col = _find_col(keys, COL_MAP["unidad_medida"])
        um = str(row.get(um_col, "UN") or "UN").strip().upper() if um_col else "UN"
        if um not in UNIDADES_VALIDAS:
            um = "UN"

        sku_col = _find_col(keys, COL_MAP["sku"])
        cat_col = _find_col(keys, COL_MAP["categoria"])
        mon_col = _find_col(keys, COL_MAP["moneda"])
        notes_col = _find_col(keys, COL_MAP["notas"])

        doc = {
            "empresa_id": empresa_id,
            "descripcion": desc,
            "unidad_medida": um,
            "precio_unitario": precio,
            "moneda": str(row.get(mon_col, "ARS") or "ARS").strip().upper() if mon_col else "ARS",
            "sku": str(row.get(sku_col, "") or "").strip() or None if sku_col else None,
            "categoria": str(row.get(cat_col, "") or "").strip() or None if cat_col else None,
            "notas": str(row.get(notes_col, "") or "").strip() or None if notes_col else None,
            "vigencia_desde": now,
            "vigencia_hasta": None,
            "created_at": now,
            "updated_at": now,
        }
        await db.catalogo_productos.insert_one(doc)
        inserted += 1

    # Ensure text index exists
    await db.catalogo_productos.create_index(
        [("descripcion", "text"), ("sku", "text"), ("categoria", "text")],
        name="catalogo_text_idx",
        default_language="spanish",
    )

    return {"imported": inserted, "errors": errors[:20], "total_rows": len(rows)}


@router.post("/match")
async def match_items_catalogo(
    request: Request,
    empresa_id: str = Query(...),
    items: list = None,
):
    """Given a list of pliego item strings, return top-3 catalog matches per item."""
    if not items:
        raise HTTPException(400, "items requeridos")

    db = request.app.mongodb
    results = []

    for item_text in items[:30]:  # cap at 30 items
        q = str(item_text)[:200]
        matches = await db.catalogo_productos.find(
            {"empresa_id": empresa_id, "$text": {"$search": q}},
            {"score": {"$meta": "textScore"}},
        ).sort([("score", {"$meta": "textScore"})]).limit(3).to_list(length=3)

        results.append({
            "item": item_text,
            "matches": [catalogo_entity(m) for m in matches],
        })

    return {"results": results}
