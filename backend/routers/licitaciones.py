from fastapi import APIRouter, Depends, HTTPException, Query, Body
from typing import List, Dict, Optional
from uuid import UUID
from ..db.repositories import LicitacionRepository
from ..models.licitacion import Licitacion, LicitacionCreate, LicitacionUpdate
from ..dependencies import get_licitacion_repository

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
    
    count = await repo.count(filters=filters)
    return {"count": count}

@router.get("/{licitacion_id}", response_model=Licitacion)
async def get_licitacion(
    licitacion_id: UUID,
    repo: LicitacionRepository = Depends(get_licitacion_repository)
):
    """Get a licitacion by id"""
    licitacion = await repo.get_by_id(licitacion_id)
    if not licitacion:
        raise HTTPException(status_code=404, detail="Licitación not found")
    return licitacion

@router.put("/{licitacion_id}", response_model=Licitacion)
async def update_licitacion(
    licitacion_id: UUID,
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
    licitacion_id: UUID,
    repo: LicitacionRepository = Depends(get_licitacion_repository)
):
    """Delete a licitacion"""
    deleted = await repo.delete(licitacion_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Licitación not found")
    return {"message": "Licitación deleted successfully"}
