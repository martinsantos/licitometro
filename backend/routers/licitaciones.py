from fastapi import APIRouter, Depends, HTTPException, Query, Body, Request
from typing import List, Dict, Optional
from uuid import UUID
import sys
from pathlib import Path

# Add parent directory to path so we can import modules
sys.path.insert(0, str(Path(__file__).parent.parent))

from db.repositories import LicitacionRepository
from models.licitacion import Licitacion, LicitacionCreate, LicitacionUpdate
from dependencies import get_licitacion_repository

router = APIRouter(
    prefix="/api/licitaciones",
    tags=["licitaciones"],
    responses={404: {"description": "Not found"}}
)

@router.post("/", response_model=Licitacion)
async def create_licitacion(
    licitacion: LicitacionCreate,
    repo: LicitacionRepository = Depends(get_licitacion_repository)
):
    """Create a new licitacion"""
    return await repo.create(licitacion)

@router.get("/", response_model=List[Licitacion])
async def get_licitaciones(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    status: Optional[str] = None,
    organization: Optional[str] = None,
    location: Optional[str] = None,
    category: Optional[str] = None,
    fuente: Optional[str] = None, # Added fuente filter
    repo: LicitacionRepository = Depends(get_licitacion_repository)
):
    """Get all licitaciones with optional filtering"""
    
    # Build filter query
    filters = {}
    if status:
        filters["status"] = status
    if organization:
        filters["organization"] = organization
    if location:
        filters["location"] = location
    if category:
        filters["category"] = category
    if fuente: # Added fuente to filters
        filters["fuente"] = fuente
    
    return await repo.get_all(skip=skip, limit=limit, filters=filters)

@router.get("/search", response_model=List[Licitacion])
async def search_licitaciones(
    q: str = Query(..., min_length=1),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    repo: LicitacionRepository = Depends(get_licitacion_repository)
):
    """Search licitaciones by text"""
    return await repo.search(q, skip=skip, limit=limit)

@router.get("/count")
async def count_licitaciones(
    status: Optional[str] = None,
    organization: Optional[str] = None,
    location: Optional[str] = None,
    category: Optional[str] = None,
    fuente: Optional[str] = None, # Added fuente filter
    repo: LicitacionRepository = Depends(get_licitacion_repository)
):
    """Count licitaciones with optional filtering"""
    
    # Build filter query
    filters = {}
    if status:
        filters["status"] = status
    if organization:
        filters["organization"] = organization
    if location:
        filters["location"] = location
    if category:
        filters["category"] = category
    if fuente: # Added fuente to filters
        filters["fuente"] = fuente
    
    count = await repo.count(filters=filters)
    return {"count": count}

@router.get("/{licitacion_id}", response_model=Licitacion)
async def get_licitacion(
    licitacion_id: str,
    repo: LicitacionRepository = Depends(get_licitacion_repository)
):
    """Get a licitacion by id"""
    licitacion = await repo.get_by_id(licitacion_id)
    if not licitacion:
        raise HTTPException(status_code=404, detail="Licitación not found")
    return licitacion

@router.put("/{licitacion_id}", response_model=Licitacion)
async def update_licitacion(
    licitacion_id: str,
    licitacion: LicitacionUpdate,
    repo: LicitacionRepository = Depends(get_licitacion_repository)
):
    """Update a licitacion"""
    updated_licitacion = await repo.update(licitacion_id, licitacion)
    if not updated_licitacion:
        raise HTTPException(status_code=404, detail="Licitación not found")
    return updated_licitacion

@router.delete("/{licitacion_id}")
async def delete_licitacion(
    licitacion_id: str,
    repo: LicitacionRepository = Depends(get_licitacion_repository)
):
    """Delete a licitacion"""
    deleted = await repo.delete(licitacion_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Licitación not found")
    return {"message": "Licitación deleted successfully"}

@router.get("/distinct/{field_name}", response_model=List[str])
async def get_distinct_values(
    field_name: str,
    repo: LicitacionRepository = Depends(get_licitacion_repository)
):
    """Get distinct values for a given field"""
    # Validate field_name to prevent arbitrary field access if necessary
    allowed_fields = ["organization", "location", "category", "fuente", "status"]
    if field_name not in allowed_fields:
        raise HTTPException(status_code=400, detail=f"Filtering by field '{field_name}' is not allowed.")

    distinct_values = await repo.get_distinct(field_name)
    return distinct_values


# NEW ENDPOINTS FOR URL RESOLUTION AND DEDUPLICATION

@router.get("/{licitacion_id}/redirect")
async def redirect_to_canonical_url(
    licitacion_id: str,
    repo: LicitacionRepository = Depends(get_licitacion_repository)
):
    """Redirect to the canonical URL for a licitacion"""
    from fastapi.responses import RedirectResponse
    
    licitacion = await repo.get_by_id(licitacion_id)
    if not licitacion:
        raise HTTPException(status_code=404, detail="Licitación not found")
    
    # Get canonical URL
    url = None
    if licitacion.canonical_url:
        url = str(licitacion.canonical_url)
    elif licitacion.source_url:
        url = str(licitacion.source_url)
    
    if not url:
        raise HTTPException(status_code=404, detail="No URL available for this licitación")
    
    return RedirectResponse(url=url)


@router.get("/{licitacion_id}/urls")
async def get_licitacion_urls(
    licitacion_id: str,
    repo: LicitacionRepository = Depends(get_licitacion_repository)
):
    """Get all available URLs for a licitacion"""
    licitacion = await repo.get_by_id(licitacion_id)
    if not licitacion:
        raise HTTPException(status_code=404, detail="Licitación not found")
    
    return {
        "id_licitacion": licitacion.id_licitacion,
        "canonical_url": licitacion.canonical_url,
        "url_quality": licitacion.url_quality,
        "source_urls": licitacion.source_urls or {},
        "source_url": licitacion.source_url,
    }


@router.post("/deduplicate")
async def run_deduplication(
    jurisdiccion: Optional[str] = Query(None, description="Limit deduplication to a specific jurisdiction"),
    request: Request = None
):
    """Run deduplication on all licitaciones"""
    from services.deduplication_service import get_deduplication_service
    
    # Get database from request
    db = request.app.mongodb
    service = get_deduplication_service(db)
    
    stats = await service.run_deduplication(jurisdiccion=jurisdiccion)
    return stats


@router.post("/{licitacion_id}/resolve-url")
async def resolve_licitacion_url(
    licitacion_id: str,
    repo: LicitacionRepository = Depends(get_licitacion_repository)
):
    """Resolve and update the canonical URL for a specific licitacion"""
    from services.url_resolver import get_url_resolver
    from motor.motor_asyncio import AsyncIOMotorDatabase
    
    # We need to get the database from the repo
    # This is a bit hacky but works for now
    db = repo.collection.database
    
    resolver = get_url_resolver(db)
    url = await resolver.resolve_url(licitacion_id)
    
    if not url:
        raise HTTPException(status_code=404, detail="Could not resolve URL for this licitación")
    
    return {
        "id_licitacion": licitacion_id,
        "resolved_url": url,
        "quality": resolver.determine_url_quality(url)
    }


@router.get("/stats/url-quality")
async def get_url_quality_stats(
    request: Request
):
    """Get statistics about URL quality across all licitaciones"""
    db = request.app.mongodb
    collection = db.licitaciones
    
    pipeline = [
        {
            "$group": {
                "_id": "$url_quality",
                "count": {"$sum": 1}
            }
        }
    ]
    
    results = await collection.aggregate(pipeline).to_list(length=10)
    
    # Calculate totals
    total = sum(r["count"] for r in results)
    
    return {
        "total": total,
        "by_quality": {r["_id"] or "unknown": r["count"] for r in results},
        "percentages": {
            r["_id"] or "unknown": round(r["count"] / total * 100, 2) if total > 0 else 0
            for r in results
        }
    }
