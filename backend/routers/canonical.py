"""Licitometro 0.2 canonical tender inspection endpoints."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Dict, List, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, Query, Request, Response
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, Field

from services.canonical_projection_service import (
    detect_duplicate_candidates,
    merge_canonical_projections,
    upsert_many_canonical_projections,
)
from services.ai_extraction_cron_service import AIExtractionCronService
from utils.time import utc_now


router = APIRouter(prefix="/api/canonical", tags=["canonical"])


class CanonicalMergeRequest(BaseModel):
    primary_canonical_id: str
    duplicate_canonical_ids: List[str] = Field(default_factory=list)
    reason: str = "manual_duplicate_resolution"


class ReadinessActionRequest(BaseModel):
    owner: Optional[str] = None
    next_action: Optional[str] = None
    due_date: Optional[str] = None
    notes: Optional[str] = None
    resolved: bool = False


def get_db(request: Request):
    return request.app.mongodb


def _serialize_doc(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize Mongo/Python values before returning canonical projections."""

    out = dict(doc)
    if "_id" in out:
        out["id"] = str(out.pop("_id"))
    return jsonable_encoder(
        out,
        custom_encoder={
            datetime: lambda value: value.isoformat(),
            date: lambda value: value.isoformat(),
        },
    )


@router.get("/tenders")
async def list_canonical_tenders(
    q: Optional[str] = Query(None, description="Search canonical title/organization"),
    limit: int = Query(50, ge=1, le=200),
    skip: int = Query(0, ge=0),
    db=Depends(get_db),
):
    """List canonical tender side projections."""

    filters = {}
    if q:
        filters["$or"] = [
            {"title": {"$regex": q, "$options": "i"}},
            {"organization": {"$regex": q, "$options": "i"}},
            {"canonical_id": {"$regex": q, "$options": "i"}},
        ]

    total = await db.tender_canonical_projections.count_documents(filters)
    docs = await db.tender_canonical_projections.find(filters).sort("updated_at", -1).skip(skip).limit(limit).to_list(length=limit)
    return {
        "items": [_serialize_doc(doc) for doc in docs],
        "total": total,
        "skip": skip,
        "limit": limit,
    }


@router.get("/readiness")
async def list_offer_readiness(
    status: Optional[str] = Query(None, description="Filter by blocked/review/ready/risk/weak"),
    min_priority: Optional[int] = Query(None, ge=0, le=100),
    opening_days: Optional[int] = Query(None, ge=0, le=365),
    critical_only: bool = Query(False),
    resolved: Optional[bool] = Query(None),
    overdue: Optional[bool] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    db=Depends(get_db),
):
    """List persisted offer-readiness snapshots for admin triage."""

    filters: Dict[str, Any] = {}
    if status:
        filters["status"] = status
    if min_priority is not None:
        filters["priority_score"] = {"$gte": min_priority}
    if critical_only:
        filters["$or"] = [
            {"status": {"$in": ["blocked", "risk"]}},
            {"counts.missing_documents": {"$gt": 0}},
            {"counts.red_flags": {"$gt": 0}},
        ]
    if resolved is not None:
        filters["operator_action.resolved"] = resolved
    if overdue is not None:
        today = utc_now().date().isoformat()
        if overdue:
            filters["operator_action.resolved"] = {"$ne": True}
            filters["operator_action.due_date"] = {"$lt": today, "$ne": ""}
        else:
            filters["$or"] = [
                {"operator_action.due_date": {"$gte": today}},
                {"operator_action.due_date": ""},
                {"operator_action.due_date": {"$exists": False}},
                {"operator_action.resolved": True},
            ]

    candidate_limit = limit
    if opening_days is not None:
        candidate_limit = min(1000, max(limit * 5, 200))

    docs = await db.offer_readiness_snapshots.find(filters).sort([
        ("priority_score", -1),
        ("score", -1),
        ("updated_at", -1),
    ]).limit(candidate_limit).to_list(length=candidate_limit)

    lic_ids = []
    for doc in docs:
        raw_id = doc.get("licitacion_id")
        try:
            lic_ids.append(ObjectId(raw_id))
        except Exception:
            pass
    lic_docs = await db.licitaciones.find({"_id": {"$in": lic_ids}}).to_list(length=len(lic_ids)) if lic_ids else []
    lic_by_id = {str(lic["_id"]): lic for lic in lic_docs}

    items = []
    now_date = utc_now().date()
    for doc in docs:
        item = _serialize_doc(doc)
        lic = lic_by_id.get(str(doc.get("licitacion_id"))) or {}
        opening_date = lic.get("opening_date")
        days_until_opening = None
        if isinstance(opening_date, datetime):
            days_until_opening = (opening_date.date() - now_date).days
        elif isinstance(opening_date, date):
            days_until_opening = (opening_date - now_date).days
        elif isinstance(opening_date, str):
            try:
                days_until_opening = (datetime.fromisoformat(opening_date.replace("Z", "+00:00")).date() - now_date).days
            except ValueError:
                days_until_opening = None
        if opening_days is not None and (
            days_until_opening is None or days_until_opening < 0 or days_until_opening > opening_days
        ):
            continue
        item["licitacion"] = {
            "title": lic.get("title") or lic.get("objeto"),
            "organization": lic.get("organization"),
            "opening_date": opening_date,
            "days_until_opening": days_until_opening,
            "fuente": lic.get("fuente"),
            "jurisdiccion": lic.get("jurisdiccion"),
        }
        items.append(item)
        if len(items) >= limit:
            break

    summary_pipeline = [
        {"$group": {
            "_id": "$status",
            "count": {"$sum": 1},
            "missing_documents": {"$sum": "$counts.missing_documents"},
            "red_flags": {"$sum": "$counts.red_flags"},
        }}
    ]
    summary_docs = await db.offer_readiness_snapshots.aggregate(summary_pipeline).to_list(length=20)
    return {
        "items": items,
        "summary": {
            doc["_id"] or "unknown": {
                "count": doc.get("count", 0),
                "missing_documents": doc.get("missing_documents", 0),
                "red_flags": doc.get("red_flags", 0),
            }
            for doc in summary_docs
        },
        "limit": limit,
        "filters": {
            "status": status,
            "min_priority": min_priority,
            "opening_days": opening_days,
            "critical_only": critical_only,
            "resolved": resolved,
            "overdue": overdue,
        },
    }


@router.get("/readiness/export.csv")
async def export_offer_readiness_csv(
    status: Optional[str] = Query(None),
    min_priority: Optional[int] = Query(None, ge=0, le=100),
    opening_days: Optional[int] = Query(None, ge=0, le=365),
    critical_only: bool = Query(False),
    resolved: Optional[bool] = Query(None),
    overdue: Optional[bool] = Query(None),
    limit: int = Query(200, ge=1, le=1000),
    db=Depends(get_db),
):
    """Export filtered readiness queue as CSV."""

    data = await list_offer_readiness(
        status=status,
        min_priority=min_priority,
        opening_days=opening_days,
        critical_only=critical_only,
        resolved=resolved,
        overdue=overdue,
        limit=min(limit, 200),
        db=db,
    )
    headers = [
        "licitacion_id",
        "company_id",
        "status",
        "priority_score",
        "score",
        "missing_documents",
        "red_flags",
        "opening_date",
        "days_until_opening",
        "title",
        "organization",
        "owner",
        "next_action",
        "due_date",
        "resolved",
        "notes",
    ]

    def cell(value: Any) -> str:
        text = "" if value is None else str(value)
        return '"' + text.replace('"', '""').replace("\n", " ") + '"'

    rows = [",".join(headers)]
    for item in data["items"]:
        lic = item.get("licitacion") or {}
        counts = item.get("counts") or {}
        action = item.get("operator_action") or {}
        rows.append(",".join(cell(value) for value in [
            item.get("licitacion_id"),
            item.get("company_id"),
            item.get("status"),
            item.get("priority_score"),
            item.get("score"),
            counts.get("missing_documents", 0),
            counts.get("red_flags", 0),
            lic.get("opening_date"),
            lic.get("days_until_opening"),
            lic.get("title"),
            lic.get("organization"),
            action.get("owner"),
            action.get("next_action"),
            action.get("due_date"),
            action.get("resolved"),
            action.get("notes"),
        ]))
    return Response(
        "\n".join(rows) + "\n",
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="readiness-0.2.csv"'},
    )


@router.get("/readiness/{licitacion_id}/history")
async def get_offer_readiness_history(
    licitacion_id: str,
    company_id: Optional[str] = Query(None),
    limit: int = Query(25, ge=1, le=100),
    db=Depends(get_db),
):
    """List compact readiness audit events for one licitation."""

    filters: Dict[str, Any] = {"licitacion_id": licitacion_id}
    if company_id:
        filters["company_id"] = company_id
    docs = await db.offer_readiness_history.find(filters).sort("created_at", -1).limit(limit).to_list(length=limit)
    return {"items": [_serialize_doc(doc) for doc in docs], "limit": limit}


@router.post("/readiness/{licitacion_id}/refresh")
async def refresh_offer_readiness(
    licitacion_id: str,
    db=Depends(get_db),
):
    """Recompute readiness snapshots for one licitation across company profiles."""

    service = AIExtractionCronService(db)
    result = await service.refresh_readiness_for_licitaciones([licitacion_id])
    return {"ok": result.get("failed", 0) == 0, **result}


@router.put("/readiness/{licitacion_id}/action")
async def update_readiness_action(
    licitacion_id: str,
    body: ReadinessActionRequest,
    company_id: str = Query(...),
    db=Depends(get_db),
):
    """Persist operator action metadata for a readiness row."""

    action = {
        "owner": body.owner or "",
        "next_action": body.next_action or "",
        "due_date": body.due_date or "",
        "notes": body.notes or "",
        "resolved": body.resolved,
        "updated_at": utc_now(),
    }
    result = await db.offer_readiness_snapshots.update_one(
        {"licitacion_id": licitacion_id, "company_id": company_id},
        {"$set": {"operator_action": action}},
    )
    return {"ok": result.matched_count > 0, "operator_action": _serialize_doc(action)}


@router.get("/tenders/{canonical_id}")
async def get_canonical_tender(canonical_id: str, db=Depends(get_db)):
    """Get one canonical tender projection by canonical_id."""

    doc = await db.tender_canonical_projections.find_one({"canonical_id": canonical_id})
    if not doc:
        return {"found": False, "canonical_id": canonical_id}
    return {"found": True, "item": _serialize_doc(doc)}


@router.post("/rebuild")
async def rebuild_canonical_tenders(
    jurisdiction: str = Query("Mendoza", description="Jurisdiccion to rebuild first"),
    fuente: Optional[str] = Query(None, description="Optional source/fuente filter"),
    limit: int = Query(500, ge=1, le=5000),
    db=Depends(get_db),
):
    """Backfill canonical side projections from existing licitaciones."""

    filters: Dict[str, Any] = {"jurisdiccion": {"$regex": f"^{jurisdiction}$", "$options": "i"}}
    if fuente:
        filters["fuente"] = {"$regex": fuente, "$options": "i"}

    docs = await db.licitaciones.find(filters).sort("updated_at", -1).limit(limit).to_list(length=limit)
    result = await upsert_many_canonical_projections(db, docs)
    return {
        "ok": True,
        "jurisdiction": jurisdiction,
        "fuente": fuente,
        "matched": len(docs),
        **result,
    }


@router.get("/diagnostics/duplicates")
async def get_duplicate_diagnostics(
    jurisdiction: str = Query("Mendoza", description="Jurisdiccion to inspect first"),
    limit: int = Query(1000, ge=1, le=5000),
    db=Depends(get_db),
):
    """Return conservative duplicate candidates across canonical projections."""

    filters: Dict[str, Any] = {"jurisdiccion": {"$regex": f"^{jurisdiction}$", "$options": "i"}}
    docs = await db.tender_canonical_projections.find(filters).sort("updated_at", -1).limit(limit).to_list(length=limit)
    candidates = detect_duplicate_candidates(docs)
    return {
        "jurisdiction": jurisdiction,
        "inspected": len(docs),
        "count": len(candidates),
        "items": [_serialize_doc(candidate) for candidate in candidates],
    }


@router.post("/merge")
async def merge_canonical_tenders(
    body: CanonicalMergeRequest,
    request: Request,
    db=Depends(get_db),
):
    """Merge duplicate canonical side projections with audit metadata."""

    actor = getattr(request.state, "user_email", "") or "admin"
    return await merge_canonical_projections(
        db,
        primary_canonical_id=body.primary_canonical_id,
        duplicate_canonical_ids=body.duplicate_canonical_ids,
        actor=actor,
        reason=body.reason,
    )
