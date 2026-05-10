"""Admin Query Copilot endpoints."""

from typing import Any, Dict

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from db import get_db
from services.query_copilot_service import get_query_copilot_service


router = APIRouter(prefix="/api/admin/query-copilot", tags=["admin-query-copilot"])


class QueryCopilotBody(BaseModel):
    question: str = Field(..., min_length=1)
    limit: int = Field(100, ge=1, le=500)


@router.post("")
async def query_copilot(body: QueryCopilotBody, request: Request) -> Dict[str, Any]:
    db = await get_db(request)
    svc = get_query_copilot_service(db)
    return await svc.ask(body.question, limit=body.limit)
