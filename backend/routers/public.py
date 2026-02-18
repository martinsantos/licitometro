"""
Public API endpoints — no authentication required.

Serves publicly shared licitaciones for external viewers.
"""

import traceback
import os
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends, Request

from db.repositories import LicitacionRepository
from dependencies import get_licitacion_repository

router = APIRouter(
    prefix="/api/public",
    tags=["public"],
    responses={404: {"description": "Not found"}},
)


@router.get("/diagnostics")
async def diagnostics(request: Request):
    """Server diagnostics — no auth required. For mobile troubleshooting."""
    results = {
        "timestamp": datetime.utcnow().isoformat(),
        "checks": {},
        "errors": [],
    }

    # 1. Check app.mongodb is set
    try:
        db = request.app.mongodb
        results["checks"]["app_mongodb"] = "OK"
    except AttributeError:
        results["checks"]["app_mongodb"] = "FAIL - not set"
        results["errors"].append("app.mongodb not initialized")
        return results

    # 2. MongoDB ping
    try:
        await db.command("ping")
        results["checks"]["mongodb_ping"] = "OK"
    except Exception as e:
        results["checks"]["mongodb_ping"] = f"FAIL - {type(e).__name__}: {e}"
        results["errors"].append(f"MongoDB unreachable: {e}")
        return results

    # 3. Count licitaciones
    try:
        count = await db.licitaciones.estimated_document_count()
        results["checks"]["licitaciones_count"] = count
    except Exception as e:
        results["checks"]["licitaciones_count"] = f"FAIL - {e}"
        results["errors"].append(f"Count failed: {e}")

    # 4. Try fetching 1 document (the actual query that /api/licitaciones/ does)
    try:
        doc = await db.licitaciones.find_one({}, {"_id": 1, "title": 1, "organization": 1, "publication_date": 1})
        if doc:
            results["checks"]["sample_doc"] = {
                "id": str(doc["_id"]),
                "has_title": "title" in doc,
                "has_org": "organization" in doc,
                "has_pub_date": "publication_date" in doc,
                "title_type": type(doc.get("title")).__name__,
                "pub_date_type": type(doc.get("publication_date")).__name__,
            }
        else:
            results["checks"]["sample_doc"] = "No documents found"
    except Exception as e:
        results["checks"]["sample_doc"] = f"FAIL - {e}"
        results["errors"].append(f"Find one failed: {e}")

    # 5. Try the entity mapper on that document
    try:
        if doc:
            from db.models import licitacion_entity
            entity = licitacion_entity(doc)
            results["checks"]["entity_mapper"] = "OK"
    except Exception as e:
        results["checks"]["entity_mapper"] = f"FAIL - {type(e).__name__}: {e}"
        results["errors"].append(f"Entity mapper crash: {e}")
        results["errors"].append(traceback.format_exc())

    # 6. Try the actual paginated query (same as GET /api/licitaciones/)
    try:
        from db.models import licitaciones_entity
        cursor = db.licitaciones.find({}).sort("publication_date", -1).skip(0).limit(3)
        docs = await cursor.to_list(length=3)
        entities = licitaciones_entity(docs)
        results["checks"]["paginated_query"] = f"OK - {len(entities)} items"
    except Exception as e:
        results["checks"]["paginated_query"] = f"FAIL - {type(e).__name__}: {e}"
        results["errors"].append(f"Paginated query crash: {e}")
        results["errors"].append(traceback.format_exc())

    # 7. Try repo.get_all (full path through repository)
    try:
        repo = LicitacionRepository(db)
        items = await repo.get_all(skip=0, limit=2, filters={}, sort_by="publication_date", sort_order=-1)
        results["checks"]["repo_get_all"] = f"OK - {len(items)} items"
    except Exception as e:
        results["checks"]["repo_get_all"] = f"FAIL - {type(e).__name__}: {e}"
        results["errors"].append(f"repo.get_all crash: {e}")
        results["errors"].append(traceback.format_exc())

    # 8. Check scraper configs
    try:
        sc_count = await db.scraper_configs.count_documents({"active": True})
        results["checks"]["active_scrapers"] = sc_count
    except Exception as e:
        results["checks"]["active_scrapers"] = f"FAIL - {e}"

    # 9. Container info
    results["checks"]["python_env"] = {
        "MONGO_URL_set": bool(os.environ.get("MONGO_URL")),
        "DB_NAME": os.environ.get("DB_NAME", "NOT SET"),
        "MONGO_URL_host": os.environ.get("MONGO_URL", "")[:30] + "..." if os.environ.get("MONGO_URL") else "NOT SET",
    }

    results["status"] = "HEALTHY" if not results["errors"] else "UNHEALTHY"
    return results


@router.get("/licitaciones/")
async def list_public_licitaciones(
    page: int = 1,
    size: int = 20,
    repo: LicitacionRepository = Depends(get_licitacion_repository),
):
    """List all publicly shared licitaciones (no auth)."""
    filters = {"is_public": True}
    skip = (page - 1) * size
    items = await repo.get_all(skip=skip, limit=size, filters=filters)
    total = await repo.count(filters=filters)
    return {
        "items": items,
        "paginacion": {
            "pagina": page,
            "por_pagina": size,
            "total_items": total,
            "total_paginas": (total + size - 1) // size,
        },
    }


@router.get("/licitaciones/{slug}")
async def get_public_licitacion(
    slug: str,
    request: Request,
):
    """Get a single public licitacion by slug (no auth)."""
    db = request.app.mongodb
    doc = await db.licitaciones.find_one({"public_slug": slug, "is_public": True})
    if not doc:
        raise HTTPException(status_code=404, detail="Licitación no encontrada")

    from db.models import licitacion_entity
    return licitacion_entity(doc)
