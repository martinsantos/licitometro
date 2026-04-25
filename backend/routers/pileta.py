"""
Pileta router — ingesta y consulta de documentos OCR.

Métodos de ingesta:
  A) POST /api/pileta/upload  — multipart desde el browser
  B) POST /api/pileta/ingest  — JSON con URL (API REST externa)
  C) Carpeta /opt/licitometro/inbox  — inbox_watcher_service.py
  D) Telegram bot — @Licitometrobot

Admin-only (enforced by server.py ADMIN_ONLY_PREFIXES).
"""
from __future__ import annotations

import logging
import mimetypes
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, File, Form, HTTPException, Query, Request, UploadFile
from pydantic import BaseModel

from services.ocr_service import get_ocr_service

logger = logging.getLogger("pileta_router")

router = APIRouter(prefix="/api/pileta", tags=["pileta"])


def _db(request: Request):
    return request.app.mongodb


# ── Upload desde browser ──────────────────────────────────────────────────────

@router.post("/upload")
async def upload_document(
    request: Request,
    file: UploadFile = File(...),
    pileta: str = Form("privada"),
    hint: str = Form(""),
):
    """Subir imagen o PDF, procesarlo con OCR y guardar en pileta_documentos."""
    svc = get_ocr_service()
    if not svc.enabled:
        raise HTTPException(503, "GEMINI_API_KEY not configured — OCR disabled")

    if pileta not in ("publica", "privada"):
        raise HTTPException(400, "pileta debe ser 'publica' o 'privada'")

    content_type = file.content_type or mimetypes.guess_type(file.filename or "")[0] or "image/jpeg"
    allowed = ("image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf")
    if content_type not in allowed:
        raise HTTPException(400, f"Tipo no soportado: {content_type}. Usa JPEG, PNG, PDF.")

    file_bytes = await file.read()
    if len(file_bytes) > 20 * 1024 * 1024:
        raise HTTPException(413, "Archivo demasiado grande (máx. 20 MB)")

    db = _db(request)
    doc_id = await svc.ingest(
        db=db,
        file_bytes=file_bytes,
        filename=file.filename or "upload",
        mime_type=content_type,
        pileta=pileta,
        fuente="upload",
        metadata={"hint": hint} if hint else {},
    )
    if not doc_id:
        raise HTTPException(500, "OCR processing failed")

    # Retornar el documento procesado
    doc = await db.pileta_documentos.find_one({"_id": ObjectId(doc_id)})
    return {
        "success": True,
        "id": doc_id,
        "tipo_doc": doc.get("tipo_doc"),
        "datos": doc.get("datos", {}),
        "ocr_success": doc.get("ocr_success"),
    }


# ── Ingest vía URL (API REST externa) ────────────────────────────────────────

class IngestRequest(BaseModel):
    url: str
    pileta: str = "privada"
    hint: str = ""


@router.post("/ingest")
async def ingest_from_url(body: IngestRequest, request: Request):
    """Descargar archivo desde URL y procesarlo con OCR."""
    import aiohttp

    svc = get_ocr_service()
    if not svc.enabled:
        raise HTTPException(503, "GEMINI_API_KEY not configured")

    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(body.url, timeout=aiohttp.ClientTimeout(total=30)) as resp:
                if resp.status != 200:
                    raise HTTPException(400, f"HTTP {resp.status} downloading {body.url}")
                content_type = resp.content_type or "application/octet-stream"
                file_bytes = await resp.read()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, f"Download error: {e}")

    filename = body.url.split("/")[-1].split("?")[0] or "document"
    db = _db(request)
    doc_id = await svc.ingest(
        db=db,
        file_bytes=file_bytes,
        filename=filename,
        mime_type=content_type,
        pileta=body.pileta,
        fuente="api",
        metadata={"url": body.url, "hint": body.hint},
    )
    if not doc_id:
        raise HTTPException(500, "OCR processing failed")

    doc = await db.pileta_documentos.find_one({"_id": ObjectId(doc_id)})
    return {"success": True, "id": doc_id, "tipo_doc": doc.get("tipo_doc"), "datos": doc.get("datos", {})}


# ── Listado ───────────────────────────────────────────────────────────────────

@router.get("/documentos")
async def list_documentos(
    request: Request,
    pileta: Optional[str] = None,
    tipo: Optional[str] = None,
    q: Optional[str] = None,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
):
    """Listar documentos de la pileta con filtros."""
    db = _db(request)
    filt = {}
    if pileta in ("publica", "privada"):
        filt["pileta"] = pileta
    if tipo:
        filt["tipo_doc"] = tipo
    if q:
        filt["$text"] = {"$search": q}

    total = await db.pileta_documentos.count_documents(filt)
    skip = (page - 1) * size
    cursor = db.pileta_documentos.find(filt, {"file_bytes": 0}).skip(skip).limit(size).sort("created_at", -1)
    docs = await cursor.to_list(size)

    for d in docs:
        d["id"] = str(d.pop("_id"))

    from utils.pagination import paginated_response
    return paginated_response(docs, total, page, size)


# ── Match doc ↔ licitación ────────────────────────────────────────────────────

@router.post("/match/{doc_id}")
async def match_doc_to_licitacion(doc_id: str, request: Request):
    """Intentar linkear un documento OCR a una licitación en la BD por texto/ID."""
    db = _db(request)
    try:
        doc = await db.pileta_documentos.find_one({"_id": ObjectId(doc_id)})
    except Exception:
        raise HTTPException(400, "Invalid doc_id")
    if not doc:
        raise HTTPException(404, "Documento no encontrado")

    datos = doc.get("datos", {})
    matches = []

    # Buscar por número de licitación
    if datos.get("numero_licitacion"):
        from utils.proceso_id import normalize_proceso_id
        pid = normalize_proceso_id(datos["numero_licitacion"])
        if pid:
            cursor = db.licitaciones.find({"proceso_id": pid}, {"title": 1, "organization": 1}).limit(3)
            matches.extend(await cursor.to_list(3))

    # Buscar por texto libre del objeto
    if not matches and datos.get("objeto"):
        cursor = db.licitaciones.find(
            {"$text": {"$search": datos["objeto"][:100]}},
            {"score": {"$meta": "textScore"}, "title": 1, "organization": 1},
        ).sort([("score", {"$meta": "textScore"})]).limit(3)
        matches.extend(await cursor.to_list(3))

    if not matches:
        return {"matches": [], "linked": False}

    # Auto-linkear al primero si hay match único
    best = matches[0]
    await db.pileta_documentos.update_one(
        {"_id": ObjectId(doc_id)},
        {"$set": {"licitacion_ref": best["_id"]}},
    )
    for m in matches:
        m["id"] = str(m.pop("_id"))

    return {"matches": matches, "linked": True, "linked_to": matches[0]["id"]}


# ── Stats ─────────────────────────────────────────────────────────────────────

@router.get("/stats")
async def pileta_stats(request: Request):
    """Conteos por pileta y tipo de documento."""
    db = _db(request)
    pipeline = [
        {"$group": {"_id": {"pileta": "$pileta", "tipo": "$tipo_doc"}, "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]
    rows = await db.pileta_documentos.aggregate(pipeline).to_list(50)
    total = await db.pileta_documentos.count_documents({})
    return {"total": total, "breakdown": [{"pileta": r["_id"]["pileta"], "tipo": r["_id"]["tipo"], "count": r["count"]} for r in rows]}
