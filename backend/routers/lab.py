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
