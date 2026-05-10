"""Admin endpoints for Datos Argentina/Open Data catalog discovery."""

from typing import Any, Dict

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

from db import get_db
from services.open_data_catalog_service import get_open_data_catalog_service


router = APIRouter(prefix="/api/admin/open-data", tags=["admin-open-data"])


class RunDatasetBody(BaseModel):
    dataset_id: str = Field(..., min_length=1)
    max_items: int = Field(200, ge=1, le=2000)
    active: bool = True
    run_now: bool = True


@router.get("/catalog")
async def catalog_search(
    request: Request,
    q: str = Query("Contrataciones", min_length=1),
    rows: int = Query(20, ge=1, le=50),
) -> Dict[str, Any]:
    db = await get_db(request)
    svc = get_open_data_catalog_service(db)
    return await svc.search_catalog(q, rows=rows)


@router.post("/run-dataset")
async def run_dataset(body: RunDatasetBody, request: Request) -> Dict[str, Any]:
    db = await get_db(request)
    svc = get_open_data_catalog_service(db)
    try:
        return await svc.upsert_dataset_config(
            dataset_id=body.dataset_id,
            max_items=body.max_items,
            active=body.active,
            run_now=body.run_now,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
