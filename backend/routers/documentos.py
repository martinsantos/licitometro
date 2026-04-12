"""Document Repository — CRUD for reusable company documents (certificates, policies, etc.)."""

import logging
import os
import mimetypes
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import Response, StreamingResponse

from db.models import documento_entity
from models.documento import DOCUMENT_CATEGORIES, DocumentoUpdate

logger = logging.getLogger("documentos")

ALLOWED_MIME_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/png",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",  # DOCX
    "application/msword",  # DOC
    "application/vnd.ms-excel",  # XLS
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",  # XLSX
    "text/plain",
    "application/rtf",
    "application/zip",
    "application/x-zip-compressed",
    "application/octet-stream",  # Generic binary (browser fallback)
}
MAX_FILE_SIZE = 25 * 1024 * 1024  # 25MB

router = APIRouter(
    prefix="/api/documentos",
    tags=["documentos"],
)


def _get_db(request: Request):
    return request.app.mongodb


def _storage_dir():
    base = os.getenv("STORAGE_DIR", "/home/ubuntu/licitometro/storage")
    d = os.path.join(base, "documentos")
    os.makedirs(d, exist_ok=True)
    return d


@router.post("/upload")
async def upload_document(
    request: Request,
    file: UploadFile = File(...),
    category: str = Form("Otro"),
    tags: str = Form(""),
    description: str = Form(""),
    expiration_date: str = Form(""),
):
    """Upload a document with metadata."""
    db = _get_db(request)

    # Validate file size
    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(413, f"Archivo demasiado grande (max {MAX_FILE_SIZE // (1024*1024)}MB)")

    # Validate MIME type
    mime = file.content_type or mimetypes.guess_type(file.filename or "")[0] or "application/octet-stream"
    if mime not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            415,
            f"Tipo de archivo no permitido: {mime}. Permitidos: PDF, JPEG, PNG, DOCX, ZIP",
        )

    # Save file
    import uuid
    safe_name = f"{uuid.uuid4().hex}_{file.filename or 'document'}"
    file_path = os.path.join(_storage_dir(), safe_name)
    with open(file_path, "wb") as f:
        f.write(contents)

    now = datetime.now(timezone.utc)
    tag_list = [t.strip() for t in tags.split(",") if t.strip()] if tags else []

    exp_date = None
    if expiration_date:
        try:
            exp_date = datetime.fromisoformat(expiration_date.replace("Z", "+00:00"))
        except ValueError:
            pass

    doc_data = {
        "filename": file.filename or "document",
        "category": category if category in DOCUMENT_CATEGORIES else "Otro",
        "tags": tag_list,
        "description": description or None,
        "expiration_date": exp_date,
        "file_path": file_path,
        "mime_type": mime,
        "file_size": len(contents),
        "created_at": now,
        "updated_at": now,
    }

    result = await db.documentos.insert_one(doc_data)
    doc = await db.documentos.find_one({"_id": result.inserted_id})
    return documento_entity(doc)


@router.get("/")
async def list_documents(request: Request, category: str = Query(None)):
    """List documents, optionally filtered by category."""
    db = _get_db(request)
    query = {}
    if category:
        query["category"] = category
    cursor = db.documentos.find(query).sort("created_at", -1).limit(200)
    docs = await cursor.to_list(200)
    return [documento_entity(d) for d in docs]


@router.get("/categories")
async def get_categories():
    """Return available document categories."""
    return DOCUMENT_CATEGORIES


@router.get("/{doc_id}")
async def get_document(doc_id: str, request: Request):
    """Get document metadata."""
    db = _get_db(request)
    try:
        doc = await db.documentos.find_one({"_id": ObjectId(doc_id)})
    except Exception:
        doc = None
    if not doc:
        raise HTTPException(404, "Documento no encontrado")
    return documento_entity(doc)


@router.get("/{doc_id}/download")
async def download_document(doc_id: str, request: Request):
    """Download document file."""
    db = _get_db(request)
    try:
        doc = await db.documentos.find_one({"_id": ObjectId(doc_id)})
    except Exception:
        doc = None
    if not doc:
        raise HTTPException(404, "Documento no encontrado")

    file_path = doc.get("file_path", "")
    if not file_path or not os.path.isfile(file_path):
        raise HTTPException(404, "Archivo no encontrado en disco")

    def iter_file():
        with open(file_path, "rb") as f:
            while chunk := f.read(65536):
                yield chunk

    return StreamingResponse(
        iter_file(),
        media_type=doc.get("mime_type", "application/octet-stream"),
        headers={"Content-Disposition": f'attachment; filename="{doc.get("filename", "document")}"'},
    )


@router.get("/{doc_id}/extract-text")
async def extract_text(doc_id: str, request: Request):
    """Extract text from an uploaded PDF document using pypdf (0 AI tokens)."""
    db = _get_db(request)
    try:
        doc = await db.documentos.find_one({"_id": ObjectId(doc_id)})
    except Exception:
        doc = None
    if not doc:
        raise HTTPException(404, "Documento no encontrado")

    file_path = doc.get("file_path", "")
    if not file_path or not os.path.isfile(file_path):
        raise HTTPException(404, "Archivo no encontrado en disco")

    mime = doc.get("mime_type", "")
    if "pdf" not in mime.lower() and not file_path.lower().endswith(".pdf"):
        raise HTTPException(400, "Solo PDFs soportados para extraccion de texto")

    try:
        with open(file_path, "rb") as f:
            pdf_bytes = f.read()
        from services.enrichment.pdf_zip_enricher import extract_text_from_pdf_bytes
        text = extract_text_from_pdf_bytes(pdf_bytes)
        text = (text or "")[:15000]
        return {"text": text, "chars": len(text)}
    except Exception as e:
        logger.error(f"Failed to extract text from PDF {doc_id}: {e}")
        raise HTTPException(500, f"Error extrayendo texto: {type(e).__name__}")


@router.put("/{doc_id}")
async def update_document(doc_id: str, body: DocumentoUpdate, request: Request):
    """Update document metadata."""
    db = _get_db(request)
    try:
        existing = await db.documentos.find_one({"_id": ObjectId(doc_id)})
    except Exception:
        existing = None
    if not existing:
        raise HTTPException(404, "Documento no encontrado")

    update_data = {k: v for k, v in body.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc)

    await db.documentos.update_one({"_id": ObjectId(doc_id)}, {"$set": update_data})
    doc = await db.documentos.find_one({"_id": ObjectId(doc_id)})
    return documento_entity(doc)


@router.delete("/{doc_id}")
async def delete_document(doc_id: str, request: Request):
    """Delete document and its file."""
    db = _get_db(request)
    try:
        doc = await db.documentos.find_one({"_id": ObjectId(doc_id)})
    except Exception:
        doc = None
    if not doc:
        raise HTTPException(404, "Documento no encontrado")

    # Delete file from disk
    file_path = doc.get("file_path", "")
    if file_path and os.path.isfile(file_path):
        try:
            os.remove(file_path)
        except OSError:
            logger.warning(f"Could not delete file: {file_path}")

    await db.documentos.delete_one({"_id": ObjectId(doc_id)})
    return {"deleted": True}


@router.get("/pagare/{licitacion_id}")
async def generate_pagare(licitacion_id: str, request: Request):
    """Generate Pagare de Garantia de Oferta PDF for a licitacion."""
    db = _get_db(request)

    # Get cotizacion data
    cotizacion = await db.cotizaciones.find_one({"licitacion_id": licitacion_id})

    # Get licitacion data
    from db.models import str_to_mongo_id
    lic = await db.licitaciones.find_one({"_id": str_to_mongo_id(licitacion_id)})
    if not lic:
        raise HTTPException(404, "Licitacion no encontrada")

    # Extract company data from cotizacion
    company = (cotizacion or {}).get("company_data", {})
    marco = (cotizacion or {}).get("marco_legal", {}) or {}
    metadata = lic.get("metadata", {}) or {}

    # Calculate guarantee amount (5% of budget by default, or from marco_legal)
    budget = lic.get("budget") or 0
    monto_garantia = budget * 0.05
    garantias = marco.get("garantias_requeridas", [])
    for g in garantias:
        if "oferta" in (g.get("tipo") or "").lower():
            if g.get("monto_estimado"):
                monto_garantia = g["monto_estimado"]
                break
            pct_str = g.get("porcentaje", "")
            if pct_str:
                try:
                    pct = float(pct_str.replace("%", "").strip())
                    monto_garantia = budget * (pct / 100)
                except ValueError:
                    pass
                break

    # Extract fields
    domicilio_full = company.get("domicilio", "")
    localidad = ""
    if "," in domicilio_full:
        parts = domicilio_full.rsplit(",", 1)
        domicilio_full = parts[0].strip()
        localidad = parts[1].strip()

    from services.pagare_generator import PagareGenerator
    gen = PagareGenerator()
    pdf_bytes = gen.generate(
        monto_garantia=monto_garantia,
        razon_social=company.get("nombre", ""),
        cuit=company.get("cuit", ""),
        domicilio=domicilio_full,
        localidad=localidad,
        telefono=company.get("telefono", ""),
        numero_proveedor=metadata.get("numero_proveedor", ""),
        licitacion_numero=lic.get("licitacion_number") or lic.get("title", ""),
        expediente=lic.get("expedient_number") or metadata.get("expediente", ""),
        disposicion=metadata.get("disposicion", ""),
        rubros=lic.get("category", ""),
    )

    filename = f"pagare_garantia_{licitacion_id[:8]}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )
