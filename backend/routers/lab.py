"""
Lab router — Firecrawl experiment endpoints.
Completely isolated from production data. Admin-only (via auth middleware).
"""

import asyncio
import logging
import time
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

logger = logging.getLogger("lab_router")

router = APIRouter(
    prefix="/api/lab",
    tags=["lab"],
)


class FirecrawlAction(BaseModel):
    type: str  # wait, click, write, scroll, screenshot
    selector: Optional[str] = None
    milliseconds: Optional[int] = None
    text: Optional[str] = None


class FirecrawlTestRequest(BaseModel):
    url: str
    formats: List[str] = ["markdown", "html", "links"]
    actions: Optional[List[FirecrawlAction]] = None


class CompareRequest(BaseModel):
    config_id: str
    max_items: int = 5


LICITACION_EXTRACT_SCHEMA = {
    "type": "object",
    "properties": {
        "licitaciones": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "titulo": {"type": "string"},
                    "numero": {"type": "string"},
                    "organismo": {"type": "string"},
                    "presupuesto": {"type": "string"},
                    "fecha_publicacion": {"type": "string"},
                    "fecha_apertura": {"type": "string"},
                    "tipo_procedimiento": {"type": "string"},
                    "estado": {"type": "string"},
                    "url_detalle": {"type": "string"},
                },
            },
        }
    },
}

LICITACION_EXTRACT_PROMPT = (
    "Extraer todas las licitaciones, compras y contrataciones publicas de esta pagina. "
    "Para cada una incluir: titulo/objeto, numero de proceso, organismo, presupuesto estimado, "
    "fecha de publicacion, fecha de apertura, tipo de procedimiento, estado y URL de detalle."
)


class ExtractRequest(BaseModel):
    urls: List[str]
    prompt: str = LICITACION_EXTRACT_PROMPT
    extract_schema: Optional[Dict] = None
    use_default_schema: bool = True


@router.post("/firecrawl-test")
async def firecrawl_test(body: FirecrawlTestRequest):
    """Quick test: Firecrawl scrape a single URL, return raw data."""
    from services.firecrawl_service import FirecrawlService

    service = FirecrawlService()
    if not service.enabled:
        raise HTTPException(400, "FIRECRAWL_API_KEY not configured on server")

    actions = [a.model_dump(exclude_none=True) for a in body.actions] if body.actions else None
    result = await service.scrape(body.url, body.formats, timeout=60, actions=actions)
    return result


@router.post("/compare")
async def compare_scrapers(body: CompareRequest, request: Request):
    """Run current scraper + Firecrawl on same source, return side-by-side."""
    db = request.app.mongodb

    from bson import ObjectId

    # Load scraper config by ObjectId first, then fallback to name
    config_doc = None
    try:
        config_doc = await db.scraper_configs.find_one({"_id": ObjectId(body.config_id)})
    except Exception:
        pass
    if not config_doc:
        config_doc = await db.scraper_configs.find_one({
            "name": {"$regex": body.config_id, "$options": "i"}
        })
    if not config_doc:
        raise HTTPException(404, f"Scraper config not found: {body.config_id}")

    source_url = str(config_doc.get("url", ""))
    source_name = config_doc.get("name", "Unknown")

    # Run both in parallel
    scraper_result, firecrawl_result = await asyncio.gather(
        _run_scraper_safe(config_doc, body.max_items),
        _run_firecrawl_safe(source_url),
    )

    return {
        "source": source_name,
        "url": source_url,
        "scraper": scraper_result,
        "firecrawl": firecrawl_result,
    }


async def _run_scraper_safe(config_doc: dict, max_items: int) -> Dict[str, Any]:
    """Run existing scraper dry-run. Never saves to DB."""
    start = time.time()
    try:
        from models.scraper_config import ScraperConfig
        from scrapers.scraper_factory import create_scraper

        clean = {k: v for k, v in config_doc.items() if k != "_id"}
        config = ScraperConfig(**clean)
        if max_items:
            config.max_items = max_items

        scraper = create_scraper(config)
        if not scraper:
            return {
                "success": False,
                "error": "No scraper matched by factory",
                "timing_ms": 0,
                "item_count": 0,
                "items": [],
            }

        items = await asyncio.wait_for(scraper.run(), timeout=120)
        timing_ms = int((time.time() - start) * 1000)

        serialized = []
        for item in items[:20]:
            serialized.append({
                "title": item.title,
                "organization": item.organization,
                "publication_date": item.publication_date.isoformat() if item.publication_date else None,
                "opening_date": item.opening_date.isoformat() if item.opening_date else None,
                "budget": item.budget,
                "source_url": str(item.source_url) if item.source_url else None,
                "description": (item.description or "")[:300],
                "objeto": item.objeto,
                "category": item.category,
                "estado": getattr(item, "estado", None),
            })

        return {
            "success": True,
            "timing_ms": timing_ms,
            "item_count": len(items),
            "items": serialized,
        }

    except asyncio.TimeoutError:
        return {
            "success": False,
            "error": "Timeout (120s)",
            "timing_ms": int((time.time() - start) * 1000),
            "item_count": 0,
            "items": [],
        }
    except Exception as e:
        return {
            "success": False,
            "error": f"{type(e).__name__}: {str(e)[:300]}",
            "timing_ms": int((time.time() - start) * 1000),
            "item_count": 0,
            "items": [],
        }


async def _run_firecrawl_safe(url: str) -> Dict[str, Any]:
    """Run Firecrawl on URL. Returns clean result dict."""
    from services.firecrawl_service import FirecrawlService

    service = FirecrawlService()
    if not service.enabled:
        return {"success": False, "error": "FIRECRAWL_API_KEY not configured", "timing_ms": 0}

    return await service.scrape(url, formats=["markdown", "links"], timeout=45)


class OpenDataLoaderRequest(BaseModel):
    url: str
    timeout: int = 120


@router.post("/opendataloader-test")
async def opendataloader_test(body: OpenDataLoaderRequest):
    """Test opendataloader-pdf: download a PDF and parse it with structured output."""
    from services.opendataloader_service import OpenDataLoaderService

    service = OpenDataLoaderService()
    if not service.enabled:
        raise HTTPException(400, "opendataloader-pdf not installed on server (requires Java 11+)")

    return await service.parse_url(body.url, timeout=body.timeout)


@router.post("/pdf-compare")
async def pdf_compare(body: OpenDataLoaderRequest):
    """Side-by-side comparison: parse same PDF with pypdf AND opendataloader.

    Downloads PDF once, then runs both extractors and returns:
    - pypdf: plain text length, sample, timing
    - opendataloader: element count, types, text length, sample, timing
    """
    import time
    from services.enrichment.pdf_zip_enricher import (
        download_binary, _extract_with_pypdf, _extract_with_opendataloader, MAX_PDF_BYTES
    )

    # Download once
    start = time.time()
    pdf_bytes = await download_binary(None, body.url, MAX_PDF_BYTES)
    download_ms = int((time.time() - start) * 1000)

    if not pdf_bytes:
        return {"success": False, "error": "Could not download PDF", "download_ms": download_ms}

    pdf_size = len(pdf_bytes)

    # Run pypdf
    pypdf_result: Dict[str, Any] = {}
    try:
        pypdf_start = time.time()
        pypdf_text = _extract_with_pypdf(pdf_bytes)
        pypdf_ms = int((time.time() - pypdf_start) * 1000)
        pypdf_result = {
            "success": bool(pypdf_text),
            "timing_ms": pypdf_ms,
            "text_length": len(pypdf_text or ""),
            "sample": (pypdf_text or "")[:1500],
        }
    except Exception as e:
        pypdf_result = {"success": False, "error": f"{type(e).__name__}: {e}", "timing_ms": 0}

    # Run opendataloader
    odl_result: Dict[str, Any] = {}
    try:
        odl_start = time.time()
        odl_text = _extract_with_opendataloader(pdf_bytes)
        odl_ms = int((time.time() - odl_start) * 1000)
        # Also get full structured output for stats
        from services.opendataloader_service import OpenDataLoaderService
        svc = OpenDataLoaderService()
        # Build summary inline (re-parses but gets type counts)
        import json as _json
        import tempfile as _tf
        import os as _os
        import opendataloader_pdf
        with _tf.TemporaryDirectory() as td:
            p = _os.path.join(td, "i.pdf")
            o = _os.path.join(td, "out")
            _os.makedirs(o)
            with open(p, "wb") as f:
                f.write(pdf_bytes)
            opendataloader_pdf.convert(input_path=[p], output_dir=o, format="json")
            json_files = [f for f in _os.listdir(o) if f.endswith(".json")]
            structured = _json.load(open(_os.path.join(o, json_files[0]))) if json_files else {}
        summary = svc._build_summary(structured)
        odl_result = {
            "success": bool(odl_text),
            "timing_ms": odl_ms,
            "text_length": len(odl_text or ""),
            "sample": (odl_text or "")[:1500],
            "summary": summary.get("summary"),
            "metadata": summary.get("metadata"),
        }
    except Exception as e:
        odl_result = {"success": False, "error": f"{type(e).__name__}: {e}", "timing_ms": 0}

    return {
        "success": True,
        "pdf_size_bytes": pdf_size,
        "download_ms": download_ms,
        "pypdf": pypdf_result,
        "opendataloader": odl_result,
    }


@router.post("/extract")
async def firecrawl_extract(body: ExtractRequest):
    """Extract structured licitacion data from URLs via Firecrawl LLM."""
    from services.firecrawl_service import FirecrawlService

    service = FirecrawlService()
    if not service.enabled:
        raise HTTPException(400, "FIRECRAWL_API_KEY not configured on server")

    schema = body.extract_schema if body.extract_schema else (LICITACION_EXTRACT_SCHEMA if body.use_default_schema else None)
    result = await service.extract(body.urls, body.prompt, schema=schema, timeout=120)
    return result
