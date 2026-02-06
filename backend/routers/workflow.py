"""
Workflow Router - API endpoints for licitacion workflow management.
"""

from fastapi import APIRouter, HTTPException, Request, Body
from typing import Optional
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from services.workflow_service import get_workflow_service

router = APIRouter(
    prefix="/api/workflow",
    tags=["workflow"],
    responses={404: {"description": "Not found"}},
)


@router.post("/{lic_id}/transition")
async def transition_workflow(
    lic_id: str,
    request: Request,
    body: dict = Body(...),
):
    """Transition a licitacion to a new workflow state.

    Body:
        new_state: str - Target state
        notes: str (optional) - Notes for the transition
    """
    db = request.app.mongodb
    service = get_workflow_service(db)

    new_state = body.get("new_state")
    notes = body.get("notes", "")

    if not new_state:
        raise HTTPException(status_code=400, detail="new_state is required")

    try:
        result = await service.transition(lic_id, new_state, notes)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{lic_id}/history")
async def get_workflow_history(
    lic_id: str,
    request: Request,
):
    """Get workflow history for a licitacion."""
    db = request.app.mongodb
    service = get_workflow_service(db)

    result = await service.get_history(lic_id)
    if not result:
        raise HTTPException(status_code=404, detail="Licitacion not found")
    return result


@router.get("/summary")
async def get_workflow_summary(request: Request):
    """Get count of licitaciones by workflow state."""
    db = request.app.mongodb
    service = get_workflow_service(db)
    return await service.get_summary()
