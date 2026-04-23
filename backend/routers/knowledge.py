"""
Router: /api/knowledge — Base de conocimiento empresarial multi-fuente.
Protegido por middleware admin de server.py (solo santosma@gmail.com).
"""
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Request, UploadFile, File, Form
from pydantic import BaseModel

logger = logging.getLogger("knowledge_router")
router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])

MIME_MAP = {
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "xls": "application/vnd.ms-excel",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "doc": "application/msword",
    "pdf": "application/pdf",
    "csv": "text/csv",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
}


def _db(request: Request):
    return request.app.mongodb


# ── Pydantic models ──────────────────────────────────────────────────────────

class NodeCreate(BaseModel):
    name: str
    color: str = "#6366f1"
    description: str = ""
    keywords: list[str] = []

class NodeUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    description: Optional[str] = None
    keywords: Optional[list[str]] = None

class ImportLicitacionBody(BaseModel):
    licitacion_id: str
    node_id: str
    doc_type: str = "oferta"

class ImportUrlBody(BaseModel):
    url: str
    node_id: str
    doc_type: str = "referencia"

class ImportPasteBody(BaseModel):
    text: str
    title: str = ""
    node_id: str
    doc_type: str = "otro"


# ── Nodes ────────────────────────────────────────────────────────────────────

@router.get("/nodes")
async def list_nodes(request: Request):
    from services.knowledge_service import get_knowledge_service
    svc = get_knowledge_service()
    await svc.ensure_indexes(_db(request))
    return {"nodes": await svc.list_nodes(_db(request))}


@router.post("/nodes")
async def create_node(body: NodeCreate, request: Request):
    from services.knowledge_service import get_knowledge_service
    svc = get_knowledge_service()
    await svc.ensure_indexes(_db(request))
    node = await svc.create_node(_db(request), body.name, body.color, body.description, body.keywords)
    return node


@router.put("/nodes/{node_id}")
async def update_node(node_id: str, body: NodeUpdate, request: Request):
    from services.knowledge_service import get_knowledge_service
    svc = get_knowledge_service()
    ok = await svc.update_node(_db(request), node_id, **body.model_dump(exclude_none=True))
    if not ok:
        raise HTTPException(404, "Nodo no encontrado")
    return {"success": True}


@router.delete("/nodes/{node_id}")
async def delete_node(node_id: str, request: Request):
    from services.knowledge_service import get_knowledge_service
    svc = get_knowledge_service()
    deleted = await svc.delete_node(_db(request), node_id)
    return {"deleted_docs": deleted}


# ── Docs ─────────────────────────────────────────────────────────────────────

@router.get("/nodes/{node_id}/docs")
async def list_docs(node_id: str, request: Request,
                    doc_type: str = None, source: str = None,
                    limit: int = 50, skip: int = 0):
    from services.knowledge_service import get_knowledge_service
    svc = get_knowledge_service()
    docs = await svc.list_docs(_db(request), node_id, doc_type=doc_type, source=source,
                               limit=limit, skip=skip)
    return {"docs": docs, "total": len(docs)}


@router.delete("/docs/{doc_id}")
async def delete_doc(doc_id: str, request: Request):
    from services.knowledge_service import get_knowledge_service
    svc = get_knowledge_service()
    ok = await svc.delete_doc(_db(request), doc_id)
    if not ok:
        raise HTTPException(404, "Documento no encontrado")
    return {"success": True}


# ── Ingesta ───────────────────────────────────────────────────────────────────

@router.post("/nodes/{node_id}/upload")
async def upload_doc(
    node_id: str,
    request: Request,
    file: UploadFile = File(...),
    doc_type: str = Form("otro"),
):
    from services.knowledge_service import get_knowledge_service
    svc = get_knowledge_service()
    await svc.ensure_indexes(_db(request))
    file_bytes = await file.read()
    if len(file_bytes) > 30 * 1024 * 1024:
        raise HTTPException(413, "Archivo demasiado grande (máx. 30 MB)")
    filename = file.filename or "documento"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    mime_type = file.content_type or MIME_MAP.get(ext, "application/octet-stream")
    result = await svc.ingest_file(_db(request), file_bytes, filename, mime_type, node_id, doc_type)
    if result.get("error"):
        raise HTTPException(422, result["error"])
    return result


@router.post("/docs/import-licitacion")
async def import_licitacion(body: ImportLicitacionBody, request: Request):
    from bson import ObjectId
    from services.knowledge_service import get_knowledge_service
    db = _db(request)
    lic = await db.licitaciones.find_one({"_id": ObjectId(body.licitacion_id)})
    if not lic:
        raise HTTPException(404, "Licitación no encontrada")
    svc = get_knowledge_service()
    await svc.ensure_indexes(db)
    return await svc.ingest_licitacion(db, lic, body.node_id, body.doc_type)


@router.post("/docs/import-url")
async def import_url(body: ImportUrlBody, request: Request):
    from services.knowledge_service import get_knowledge_service
    svc = get_knowledge_service()
    await svc.ensure_indexes(_db(request))
    result = await svc.ingest_url(_db(request), body.url, body.node_id, body.doc_type)
    if result.get("error"):
        raise HTTPException(422, result["error"])
    return result


@router.post("/docs/import-paste")
async def import_paste(body: ImportPasteBody, request: Request):
    from services.knowledge_service import get_knowledge_service
    svc = get_knowledge_service()
    await svc.ensure_indexes(_db(request))
    result = await svc.ingest_paste(_db(request), body.text, body.title, body.node_id, body.doc_type)
    if result.get("error"):
        raise HTTPException(422, result["error"])
    return result


# ── Search ────────────────────────────────────────────────────────────────────

@router.get("/search")
async def search(request: Request, q: str = "", node_id: str = None,
                 doc_type: str = None, limit: int = 10):
    from services.knowledge_service import get_knowledge_service
    svc = get_knowledge_service()
    await svc.ensure_indexes(_db(request))
    results = await svc.search(_db(request), q, node_id=node_id, doc_type=doc_type, limit=limit)
    return {"results": results, "total": len(results)}


# ── Context para CotizAR ──────────────────────────────────────────────────────

@router.get("/context")
async def get_context(request: Request, category: str = "", objeto: str = ""):
    from services.knowledge_service import get_knowledge_service
    svc = get_knowledge_service()
    ctx = await svc.get_context_for_cotizar(_db(request), category=category, objeto=objeto)
    return {"context": ctx}
