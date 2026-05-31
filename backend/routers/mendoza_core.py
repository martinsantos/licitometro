"""Mendoza Core 3 operational endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Request, Response

from services.mendoza_core_service import build_mendoza_core_summary


router = APIRouter(
    prefix="/api/mendoza-core",
    tags=["mendoza-core"],
    responses={404: {"description": "Not found"}},
)


@router.get("/summary")
async def get_mendoza_core_summary(request: Request):
    return await build_mendoza_core_summary(request.app.mongodb)


@router.get("/export.csv")
async def export_mendoza_core_csv(request: Request):
    summary = await build_mendoza_core_summary(request.app.mongodb)
    headers = [
        "source",
        "status",
        "last_run_status",
        "last_run_items_found",
        "records_total",
        "vigentes",
        "new_7d",
        "publication_date",
        "opening_date",
        "object_or_description",
        "source_url",
        "canonical_url",
        "direct_url",
        "documents",
        "evidence",
        "issues",
    ]

    def cell(value):
        text = "" if value is None else str(value)
        return '"' + text.replace('"', '""').replace("\n", " ") + '"'

    rows = [",".join(headers)]
    for source in summary.get("sources", []):
        issues = source.get("blocking_issues", []) + source.get("quality_issues", []) + source.get("backlog_issues", [])
        coverage = source.get("coverage") or {}
        last_run = source.get("last_run") or {}
        records = source.get("records") or {}
        rows.append(",".join(cell(value) for value in [
            source.get("name"),
            source.get("status"),
            last_run.get("status"),
            last_run.get("items_found"),
            records.get("total"),
            records.get("vigentes"),
            records.get("new_7d"),
            coverage.get("publication_date"),
            coverage.get("opening_date"),
            coverage.get("object_or_description"),
            coverage.get("source_url"),
            coverage.get("canonical_url"),
            coverage.get("direct_url"),
            coverage.get("documents"),
            coverage.get("evidence"),
            ";".join(issues),
        ]))

    return Response(
        "\n".join(rows) + "\n",
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="mendoza-core-3.csv"'},
    )
