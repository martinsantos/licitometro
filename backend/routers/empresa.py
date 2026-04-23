"""
Router: /api/empresa — Base de conocimiento vectorial UMSA.
Protegido con cookie sgi_unlocked (misma que Mi Empresa en analytics).
"""
import json
import logging
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Request, Response, UploadFile, File, Form
from pydantic import BaseModel

logger = logging.getLogger("empresa_router")

router = APIRouter(prefix="/api/empresa", tags=["empresa"])

MIME_MAP = {
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "xls": "application/vnd.ms-excel",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "doc": "application/msword",
    "pdf": "application/pdf",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
}


def _get_db(request: Request):
    return request.app.mongodb


def _require_empresa_access(request: Request):
    # Auth already enforced by server.py middleware for /api/empresa/*
    pass


class SearchRequest(BaseModel):
    query: str
    tipo: Optional[str] = None
    top_k: int = 5


@router.post("/conocimiento/upload")
async def upload_conocimiento(
    request: Request,
    file: UploadFile = File(...),
    tipo: str = Form("otro"),
    metadata: str = Form("{}"),
):
    """Subir documento a la base de conocimiento UMSA. Extrae texto, chunkea y embeds."""
    _require_empresa_access(request)
    db = _get_db(request)

    from services.um_knowledge_service import get_um_knowledge_service
    svc = get_um_knowledge_service()
    await svc.ensure_indexes(db)

    file_bytes = await file.read()
    if len(file_bytes) > 30 * 1024 * 1024:
        raise HTTPException(413, "Archivo demasiado grande (máx. 30 MB)")

    filename = file.filename or "documento"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    mime_type = file.content_type or MIME_MAP.get(ext, "application/octet-stream")

    try:
        meta = json.loads(metadata)
    except Exception:
        meta = {}

    result = await svc.ingest_file(
        db=db,
        file_bytes=file_bytes,
        filename=filename,
        mime_type=mime_type,
        tipo=tipo,
        metadata=meta,
    )

    if result.get("error"):
        raise HTTPException(422, result["error"])

    return result


@router.get("/conocimiento/docs")
async def list_docs(request: Request):
    """Lista documentos cargados en la base de conocimiento, agrupados por doc."""
    _require_empresa_access(request)
    db = _get_db(request)
    from services.um_knowledge_service import get_um_knowledge_service
    svc = get_um_knowledge_service()
    docs = await svc.list_docs(db)
    return {"docs": docs, "total": len(docs)}


@router.delete("/conocimiento/{doc_id}")
async def delete_doc(doc_id: str, request: Request):
    """Eliminar todos los chunks de un documento."""
    _require_empresa_access(request)
    db = _get_db(request)
    from services.um_knowledge_service import get_um_knowledge_service
    svc = get_um_knowledge_service()
    deleted = await svc.delete_doc(db, doc_id)
    if deleted == 0:
        raise HTTPException(404, "Documento no encontrado")
    return {"deleted_chunks": deleted}


@router.post("/conocimiento/search")
async def search_conocimiento(body: SearchRequest, request: Request):
    """Búsqueda semántica en la base de conocimiento UMSA."""
    _require_empresa_access(request)
    db = _get_db(request)
    from services.um_knowledge_service import get_um_knowledge_service
    svc = get_um_knowledge_service()
    results = await svc.search(db, query=body.query, tipo=body.tipo, top_k=body.top_k)
    return {"results": results, "total": len(results)}


@router.post("/conocimiento/search-docs")
async def search_docs(body: SearchRequest, request: Request):
    """Búsqueda semántica agrupada por documento — devuelve ofertas similares con síntesis."""
    _require_empresa_access(request)
    db = _get_db(request)
    from services.um_knowledge_service import get_um_knowledge_service
    svc = get_um_knowledge_service()
    docs = await svc.search_documents(db, query=body.query, top_k=body.top_k or 4)
    return {"docs": docs, "total": len(docs)}


@router.get("/conocimiento/stats")
async def get_stats(request: Request):
    """Estadísticas de la base de conocimiento."""
    _require_empresa_access(request)
    db = _get_db(request)
    from services.um_knowledge_service import get_um_knowledge_service
    svc = get_um_knowledge_service()
    return await svc.get_stats(db)
