"""
Router for scheduler management endpoints.

Provides API endpoints to control the scraper scheduler, view job status,
trigger manual executions, and review run history.
"""

import re

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request, Response
from typing import List, Optional
from motor.motor_asyncio import AsyncIOMotorDatabase
import logging

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
from utils.time import utc_now
from services.source_readiness_metrics_service import build_source_readiness_summary

from services.scheduler_service import get_scheduler_service
from models.scraper_run import ScraperRun, ScraperRunSummary

logger = logging.getLogger("scheduler_router")

router = APIRouter(
    prefix="/api/scheduler",
    tags=["scheduler"],
    responses={404: {"description": "Not found"}},
)


def get_db(request: Request):
    """Get database from request app state"""
    return request.app.mongodb




@router.post("/start")
async def start_scheduler(db: AsyncIOMotorDatabase = Depends(get_db)):
    """Start the scraper scheduler"""
    try:
        service = get_scheduler_service(db)
        await service.initialize()
        
        # Load and schedule all active scrapers
        scheduled_count = await service.load_and_schedule_scrapers()
        
        # Start the scheduler
        service.start()
        
        return {
            "status": "started",
            "scheduled_jobs": scheduled_count,
            "message": f"Scheduler started with {scheduled_count} active scrapers"
        }
    except Exception as e:
        logger.error(f"Error starting scheduler: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to start scheduler: {str(e)}")


@router.post("/stop")
async def stop_scheduler(db: AsyncIOMotorDatabase = Depends(get_db)):
    """Stop the scraper scheduler"""
    try:
        service = get_scheduler_service(db)
        service.stop()
        return {
            "status": "stopped",
            "message": "Scheduler stopped successfully"
        }
    except Exception as e:
        logger.error(f"Error stopping scheduler: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to stop scheduler: {str(e)}")


@router.get("/status")
async def get_scheduler_status(db: AsyncIOMotorDatabase = Depends(get_db)):
    """Get current scheduler status and scheduled jobs"""
    try:
        service = get_scheduler_service(db)
        status = service.get_status()
        return status
    except Exception as e:
        logger.error(f"Error getting scheduler status: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get status: {str(e)}")


@router.get("/jobs")
async def list_scheduled_jobs(db: AsyncIOMotorDatabase = Depends(get_db)):
    """List all scheduled jobs with their next run times"""
    try:
        service = get_scheduler_service(db)
        status = service.get_status()
        return {
            "running": status["running"],
            "jobs": status["jobs"]
        }
    except Exception as e:
        logger.error(f"Error listing jobs: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to list jobs: {str(e)}")


@router.post("/trigger/{scraper_name}")
async def trigger_scraper(
    scraper_name: str,
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Manually trigger a scraper execution"""
    try:
        service = get_scheduler_service(db)
        await service.initialize()
        
        run_id = await service.trigger_scraper_now(scraper_name)
        if not run_id:
            raise HTTPException(status_code=404, detail=f"Scraper '{scraper_name}' not found")
        
        return {
            "status": "triggered",
            "scraper_name": scraper_name,
            "run_id": run_id,
            "message": f"Scraper '{scraper_name}' execution started"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error triggering scraper {scraper_name}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to trigger scraper: {str(e)}")


@router.get("/runs", response_model=List[ScraperRun])
async def get_scraper_runs(
    scraper_name: Optional[str] = Query(None, description="Filter by scraper name"),
    limit: int = Query(10, ge=1, le=100, description="Number of results to return"),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Get recent scraper runs with optional filtering"""
    try:
        service = get_scheduler_service(db)
        runs = await service.get_recent_runs(scraper_name=scraper_name, limit=limit)
        return runs
    except Exception as e:
        logger.error(f"Error getting scraper runs: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get runs: {str(e)}")


@router.get("/runs/{run_id}")
async def get_run_details(run_id: str, db: AsyncIOMotorDatabase = Depends(get_db)):
    """Get detailed information about a specific run"""
    try:
        service = get_scheduler_service(db)
        run = await service.get_run_by_id(run_id)
        if not run:
            raise HTTPException(status_code=404, detail=f"Run '{run_id}' not found")
        return run
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting run details: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get run details: {str(e)}")


@router.get("/runs/{run_id}/logs")
async def get_run_logs(run_id: str, db: AsyncIOMotorDatabase = Depends(get_db)):
    """Get logs for a specific run"""
    try:
        service = get_scheduler_service(db)
        run = await service.get_run_by_id(run_id)
        if not run:
            raise HTTPException(status_code=404, detail=f"Run '{run_id}' not found")
        return {
            "run_id": run_id,
            "logs": run.logs,
            "errors": run.errors,
            "warnings": run.warnings
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting run logs: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get logs: {str(e)}")


@router.get("/source-health")
async def get_source_health(db: AsyncIOMotorDatabase = Depends(get_db)):
    """Get health status for each scraper source"""
    try:
        configs_collection = db.scraper_configs
        runs_collection = db.scraper_runs
        licitaciones_collection = db.licitaciones

        configs = await configs_collection.find().to_list(length=100)
        sources = []

        for config in configs:
            name = config.get("name", "unknown")

            # Get last 5 runs for this scraper
            recent_runs = await runs_collection.find(
                {"scraper_name": name}
            ).sort("started_at", -1).limit(5).to_list(length=5)

            last_run = recent_runs[0] if recent_runs else None
            recent_errors = [
                r for r in recent_runs
                if r.get("status") in ("failed", "partial")
            ]

            # Count records from this source (exact match or starts-with for subtypes like "Boletin Oficial Mendoza (PDF)")
            total_records, _source_ids, readiness_summary = await build_source_readiness_summary(db, name)

            sources.append({
                "name": name,
                "active": config.get("active", False),
                "schedule": config.get("schedule", ""),
                "url": str(config.get("url", "")),
                "last_run": last_run.get("started_at").isoformat() if last_run and last_run.get("started_at") else None,
                "last_run_status": last_run.get("status") if last_run else None,
                "last_run_duration": last_run.get("duration_seconds") if last_run else None,
                "last_run_items_found": last_run.get("items_found", 0) if last_run else 0,
                "last_run_items_saved": last_run.get("items_saved", 0) if last_run else 0,
                "recent_errors": len(recent_errors),
                "total_records": total_records,
                "total_runs": len(recent_runs),
                "needs_repair": config.get("needs_repair", False),
                "needs_repair_since": config.get("needs_repair_since").isoformat() if config.get("needs_repair_since") else None,
                "source_quality": (last_run.get("metadata") or {}).get("source_quality") if last_run else None,
                "source_evidence": (last_run.get("metadata") or {}).get("source_evidence") if last_run else None,
                "readiness": readiness_summary,
            })

        return {"sources": sources}
    except Exception as e:
        logger.error(f"Error getting source health: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get source health: {str(e)}")


@router.get("/source-quality-trends")
async def get_source_quality_trends(
    scraper_name: Optional[str] = Query(None, description="Filter by scraper name"),
    limit: int = Query(20, ge=1, le=100, description="Runs per source"),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Return recent source quality trend points from scraper run metadata."""
    try:
        query = {"metadata.source_quality": {"$exists": True}}
        if scraper_name:
            query["scraper_name"] = scraper_name

        runs = await db.scraper_runs.find(
            query,
            {
                "scraper_name": 1,
                "status": 1,
                "started_at": 1,
                "items_found": 1,
                "metadata.source_quality": 1,
            },
        ).sort("started_at", -1).limit(limit if scraper_name else limit * 10).to_list(length=None)

        grouped = {}
        for run in runs:
            name = run.get("scraper_name", "unknown")
            grouped.setdefault(name, [])
            if len(grouped[name]) >= limit:
                continue
            quality = ((run.get("metadata") or {}).get("source_quality") or {})
            grouped[name].append({
                "run_id": str(run.get("_id")),
                "started_at": run.get("started_at").isoformat() if run.get("started_at") else None,
                "status": run.get("status"),
                "items_found": run.get("items_found", 0),
                "score": quality.get("score"),
                "document_coverage": quality.get("document_coverage"),
                "direct_url_coverage": quality.get("direct_url_coverage"),
                "low_confidence_count": quality.get("low_confidence_count"),
            })

        return {"sources": grouped}
    except Exception as e:
        logger.error(f"Error getting source quality trends: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get source quality trends: {str(e)}")


@router.get("/source-readiness-trends")
async def get_source_readiness_trends(
    limit: int = Query(5, ge=1, le=20, description="Recent snapshots per source"),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Return lightweight source-level readiness trend points."""

    try:
        configs = await db.scraper_configs.find({}, {"name": 1}).to_list(length=100)
        grouped = {}
        for config in configs:
            name = config.get("name", "unknown")
            escaped_name = re.escape(name)
            lic_docs = await db.licitaciones.find(
                {"fuente": {"$regex": f"^{escaped_name}", "$options": "i"}},
                {"_id": 1},
            ).limit(1000).to_list(length=1000)
            source_ids = [str(doc["_id"]) for doc in lic_docs]
            if not source_ids:
                grouped[name] = []
                continue
            snapshots = await db.offer_readiness_snapshots.find(
                {"licitacion_id": {"$in": source_ids}},
                {
                    "updated_at": 1,
                    "status": 1,
                    "score": 1,
                    "priority_score": 1,
                    "counts": 1,
                },
            ).sort("updated_at", -1).limit(limit).to_list(length=limit)
            grouped[name] = [
                {
                    "updated_at": snap.get("updated_at").isoformat() if snap.get("updated_at") else None,
                    "status": snap.get("status"),
                    "score": snap.get("score"),
                    "priority_score": snap.get("priority_score"),
                    "missing_documents": (snap.get("counts") or {}).get("missing_documents", 0),
                    "red_flags": (snap.get("counts") or {}).get("red_flags", 0),
                }
                for snap in snapshots
            ]
        return {"sources": grouped}
    except Exception as e:
        logger.error(f"Error getting source readiness trends: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get source readiness trends: {str(e)}")


@router.get("/source-readiness-history")
async def get_source_readiness_history(
    source_name: Optional[str] = Query(None),
    limit: int = Query(30, ge=1, le=180),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Return persisted source readiness coverage snapshots."""

    try:
        query = {}
        if source_name:
            query["source_name"] = source_name
        docs = await db.source_readiness_snapshots.find(query).sort("created_at", -1).limit(limit).to_list(length=limit)
        grouped = {}
        for doc in docs:
            name = doc.get("source_name", "unknown")
            grouped.setdefault(name, [])
            readiness = doc.get("readiness") or {}
            grouped[name].append({
                "created_at": doc.get("created_at").isoformat() if doc.get("created_at") else None,
                "day": doc.get("day"),
                "total_records": doc.get("total_records", 0),
                "ai_coverage": readiness.get("ai_coverage", 0),
                "snapshot_coverage": readiness.get("snapshot_coverage", 0),
                "ready": readiness.get("ready", 0),
                "blocked": readiness.get("blocked", 0),
                "missing_documents": readiness.get("missing_documents", 0),
                "red_flags": readiness.get("red_flags", 0),
            })
        return {"sources": grouped}
    except Exception as e:
        logger.error(f"Error getting source readiness history: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get source readiness history: {str(e)}")


@router.get("/source-readiness-export.csv")
async def export_source_readiness_csv(
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Export scraper source readiness coverage metrics as CSV."""

    health = await get_source_health(db)
    headers = [
        "source",
        "active",
        "total_records",
        "ai_extracted",
        "ai_coverage",
        "snapshots",
        "snapshot_coverage",
        "ready",
        "blocked",
        "missing_documents",
        "red_flags",
    ]

    def cell(value):
        text = "" if value is None else str(value)
        return '"' + text.replace('"', '""').replace("\n", " ") + '"'

    rows = [",".join(headers)]
    for source in health.get("sources", []):
        readiness = source.get("readiness") or {}
        rows.append(",".join(cell(value) for value in [
            source.get("name"),
            source.get("active"),
            source.get("total_records"),
            readiness.get("ai_extracted"),
            readiness.get("ai_coverage"),
            readiness.get("snapshots"),
            readiness.get("snapshot_coverage"),
            readiness.get("ready"),
            readiness.get("blocked"),
            readiness.get("missing_documents"),
            readiness.get("red_flags"),
        ]))
    return Response(
        "\n".join(rows) + "\n",
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="source-readiness-0.2.csv"'},
    )


@router.get("/source-readiness-backfill-candidates")
async def get_source_readiness_backfill_candidates(
    source_name: Optional[str] = Query(None),
    min_ai_coverage: float = Query(0.75, ge=0, le=1),
    limit_per_source: int = Query(5, ge=1, le=25),
    force_refresh: bool = Query(False),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """List under-covered Mendoza source candidates for AI 0.2 backfill."""

    try:
        from services.ai_extraction_cron_service import get_ai_extraction_cron_service

        svc = get_ai_extraction_cron_service(db)
        return await svc.find_undercovered_sources(
            source_name=source_name,
            jurisdiction="Mendoza",
            min_ai_coverage=min_ai_coverage,
            limit_per_source=limit_per_source,
            force_refresh=force_refresh,
        )
    except Exception as e:
        logger.error(f"Error getting source readiness backfill candidates: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get backfill candidates: {str(e)}")


@router.get("/source-readiness-backfill-candidates.csv")
async def export_source_readiness_backfill_candidates_csv(
    source_name: Optional[str] = Query(None),
    min_ai_coverage: float = Query(0.75, ge=0, le=1),
    limit_per_source: int = Query(5, ge=1, le=25),
    force_refresh: bool = Query(False),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Export under-covered Mendoza AI 0.2 backfill candidates as CSV."""

    try:
        from services.ai_extraction_cron_service import get_ai_extraction_cron_service

        svc = get_ai_extraction_cron_service(db)
        result = await svc.find_undercovered_sources(
            source_name=source_name,
            jurisdiction="Mendoza",
            min_ai_coverage=min_ai_coverage,
            limit_per_source=limit_per_source,
            force_refresh=force_refresh,
        )
    except Exception as e:
        logger.error(f"Error exporting source readiness backfill candidates: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to export backfill candidates: {str(e)}")

    headers = [
        "source",
        "ai_coverage",
        "min_ai_coverage",
        "snapshot_coverage",
        "candidate_id",
        "id_licitacion",
        "title",
        "fecha_apertura",
        "budget",
        "remediation_score",
    ]

    def cell(value):
        text = "" if value is None else str(value)
        return '"' + text.replace('"', '""').replace("\n", " ") + '"'

    rows = [",".join(headers)]
    for source in result.get("sources", []):
        for candidate in source.get("candidates", []):
            rows.append(",".join(cell(value) for value in [
                source.get("name"),
                source.get("ai_coverage"),
                source.get("min_ai_coverage"),
                source.get("snapshot_coverage"),
                candidate.get("id"),
                candidate.get("id_licitacion"),
                candidate.get("title"),
                candidate.get("fecha_apertura"),
                candidate.get("budget"),
                candidate.get("remediation_score"),
            ]))

    return Response(
        "\n".join(rows) + "\n",
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="ai-backfill-candidates-0.2.csv"'},
    )


@router.post("/source-readiness-backfill")
async def run_source_readiness_backfill(
    source_name: Optional[str] = Query(None),
    min_ai_coverage: float = Query(0.75, ge=0, le=1),
    limit_per_source: int = Query(3, ge=1, le=25),
    max_total: int = Query(10, ge=1, le=25),
    force_refresh: bool = Query(False),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Run a guarded AI 0.2 backfill for under-covered Mendoza sources."""

    try:
        from services.ai_extraction_cron_service import get_ai_extraction_cron_service

        svc = get_ai_extraction_cron_service(db)
        return await svc.run_undercovered_source_backfill(
            source_name=source_name,
            jurisdiction="Mendoza",
            min_ai_coverage=min_ai_coverage,
            limit_per_source=limit_per_source,
            max_total=max_total,
            force_refresh=force_refresh,
        )
    except Exception as e:
        logger.error(f"Error running source readiness backfill: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to run backfill: {str(e)}")


@router.get("/source-readiness-backfill-runs")
async def get_source_readiness_backfill_runs(
    source_name: Optional[str] = Query(None),
    limit: int = Query(10, ge=1, le=50),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Return recent guarded AI 0.2 source backfill runs."""

    try:
        query = {}
        if source_name:
            query["source_name"] = source_name
        docs = await db.source_backfill_runs.find(
            query,
            {
                "source_name": 1,
                "jurisdiction": 1,
                "processed": 1,
                "succeeded": 1,
                "failed": 1,
                "selected_ids": 1,
                "force_refresh": 1,
                "min_ai_coverage": 1,
                "candidates.total_candidates": 1,
                "readiness.snapshots": 1,
                "readiness.failed": 1,
                "failure_diagnostics": 1,
                "created_at": 1,
            },
        ).sort("created_at", -1).limit(limit).to_list(length=limit)
        return {
            "items": [
                {
                    "id": str(doc.get("_id")),
                    "source_name": doc.get("source_name"),
                    "jurisdiction": doc.get("jurisdiction"),
                    "processed": doc.get("processed", 0),
                    "succeeded": doc.get("succeeded", 0),
                    "failed": doc.get("failed", 0),
                    "selected_count": len(doc.get("selected_ids") or []),
                    "force_refresh": bool(doc.get("force_refresh")),
                    "min_ai_coverage": doc.get("min_ai_coverage"),
                    "total_candidates": ((doc.get("candidates") or {}).get("total_candidates") or 0),
                    "readiness_snapshots": ((doc.get("readiness") or {}).get("snapshots") or 0),
                    "readiness_failed": ((doc.get("readiness") or {}).get("failed") or 0),
                    "failure_diagnostics": doc.get("failure_diagnostics") or {},
                    "created_at": doc.get("created_at").isoformat() if doc.get("created_at") else None,
                }
                for doc in docs
            ]
        }
    except Exception as e:
        logger.error(f"Error getting source readiness backfill runs: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get backfill runs: {str(e)}")


@router.get("/source-backfill-failure-diagnostics")
async def get_source_backfill_failure_diagnostics(
    limit: int = Query(50, ge=1, le=200),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Aggregate recent AI 0.2 source backfill failures by category and source."""

    try:
        docs = await db.source_backfill_runs.find(
            {"failure_diagnostics.failed_count": {"$gt": 0}},
            {
                "source_name": 1,
                "processed": 1,
                "failed": 1,
                "failure_diagnostics": 1,
                "created_at": 1,
            },
        ).sort("created_at", -1).limit(limit).to_list(length=limit)

        categories = {}
        sources = {}
        recent_items = []
        repair_hints = {
            "rate_limit": "Revisar cuota/proveedor AI y reintentar fuera del pico; no tocar scraper salvo que se repita con bajo volumen.",
            "provider": "Verificar disponibilidad, timeouts y credenciales del proveedor AI antes de relanzar backfill.",
            "input_quality": "Priorizar reparación de scraper/pliego: falta texto, PDF vacío o contenido insuficiente para extracción.",
            "schema": "Revisar contrato AI 0.2, prompt/schema y ejemplos de salida antes de reintentar en lote.",
            "unknown": "Inspeccionar error puntual y clasificarlo antes de automatizar reintentos.",
        }
        for doc in docs:
            source_name = doc.get("source_name") or "todas"
            diagnostics = doc.get("failure_diagnostics") or {}
            for category, count in (diagnostics.get("categories") or {}).items():
                categories[category] = categories.get(category, 0) + int(count or 0)
                source_entry = sources.setdefault(source_name, {"source_name": source_name, "failed": 0, "categories": {}})
                source_entry["failed"] += int(count or 0)
                source_entry["categories"][category] = source_entry["categories"].get(category, 0) + int(count or 0)
            for item in (diagnostics.get("items") or [])[:5]:
                recent_items.append({
                    "source_name": source_name,
                    "category": item.get("category"),
                    "id": item.get("id"),
                    "id_licitacion": item.get("id_licitacion"),
                    "title": item.get("title"),
                    "error": item.get("error"),
                    "created_at": doc.get("created_at").isoformat() if doc.get("created_at") else None,
                })

        return {
            "runs_evaluated": len(docs),
            "categories": categories,
            "repair_hints": {category: repair_hints.get(category, repair_hints["unknown"]) for category in categories},
            "sources": sorted(sources.values(), key=lambda item: item["failed"], reverse=True),
            "recent_items": recent_items[:20],
        }
    except Exception as e:
        logger.error(f"Error getting source backfill failure diagnostics: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get backfill diagnostics: {str(e)}")


@router.post("/source-backfill-retry-failures")
async def retry_source_backfill_failures(
    source_name: Optional[str] = Query(None),
    limit: int = Query(10, ge=1, le=25),
    retry_window_hours: int = Query(6, ge=1, le=72),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Retry recent recoverable AI 0.2 source backfill failures."""

    try:
        from services.ai_extraction_cron_service import get_ai_extraction_cron_service

        svc = get_ai_extraction_cron_service(db)
        return await svc.retry_recent_backfill_failures(
            source_name=source_name,
            limit=limit,
            categories=["rate_limit", "provider", "schema", "unknown"],
            excluded_categories=["input_quality"],
            retry_window_hours=retry_window_hours,
        )
    except Exception as e:
        logger.error(f"Error retrying source backfill failures: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to retry backfill failures: {str(e)}")


@router.get("/input-quality-repair-queue")
async def get_input_quality_repair_queue(
    source_name: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Return AI 0.2 input-quality failures that need scraper/pliego repair."""

    try:
        from services.ai_extraction_cron_service import get_ai_extraction_cron_service

        svc = get_ai_extraction_cron_service(db)
        return await svc.build_input_quality_repair_queue(
            source_name=source_name,
            status=status,
            limit=limit,
        )
    except Exception as e:
        logger.error(f"Error getting input-quality repair queue: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get input-quality repair queue: {str(e)}")


@router.put("/input-quality-repair-queue/{licitacion_id}")
async def update_input_quality_repair_queue_item(
    licitacion_id: str,
    body: dict = Body(...),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Update operator action status for an input-quality repair item."""

    try:
        from services.ai_extraction_cron_service import get_ai_extraction_cron_service

        svc = get_ai_extraction_cron_service(db)
        return await svc.update_input_quality_repair_action(
            licitacion_id,
            status=body.get("status") or "open",
            owner=body.get("owner"),
            notes=body.get("notes"),
        )
    except Exception as e:
        logger.error(f"Error updating input-quality repair item: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update input-quality repair item: {str(e)}")


@router.post("/input-quality-repair-queue/{licitacion_id}/rerun")
async def rerun_input_quality_repair_item(
    licitacion_id: str,
    force_refresh: bool = Query(True),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Rerun AI 0.2 extraction after repairing an input-quality item."""

    try:
        from services.ai_extraction_cron_service import get_ai_extraction_cron_service

        svc = get_ai_extraction_cron_service(db)
        return await svc.rerun_input_quality_repair_item(
            licitacion_id,
            force_refresh=force_refresh,
        )
    except Exception as e:
        logger.error(f"Error rerunning input-quality repair item: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to rerun input-quality repair item: {str(e)}")


@router.get("/input-quality-repair-queue.csv")
async def export_input_quality_repair_queue_csv(
    source_name: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(200, ge=1, le=500),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Export AI 0.2 input-quality repair queue as CSV."""

    queue = await get_input_quality_repair_queue(source_name=source_name, status=status, limit=min(limit, 200), db=db)
    headers = [
        "last_seen_at",
        "source_name",
        "status",
        "owner",
        "id",
        "id_licitacion",
        "title",
        "occurrences",
        "age_hours",
        "rerun_count",
        "last_rerun_status",
        "last_rerun_at",
        "error",
        "notes",
    ]

    def cell(value):
        text = "" if value is None else str(value)
        return '"' + text.replace('"', '""').replace("\n", " ") + '"'

    rows = [",".join(headers)]
    for item in queue.get("items", []):
        rows.append(",".join(cell(value) for value in [
            item.get("last_seen_at"),
            item.get("source_name"),
            item.get("status"),
            item.get("owner"),
            item.get("id"),
            item.get("id_licitacion"),
            item.get("title"),
            item.get("occurrences"),
            item.get("age_hours"),
            item.get("rerun_count"),
            item.get("last_rerun_status"),
            item.get("last_rerun_at"),
            item.get("error"),
            item.get("notes"),
        ]))

    return Response(
        "\n".join(rows) + "\n",
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="input-quality-repair-queue-0.2.csv"'},
    )


@router.get("/source-backfill-retry-analytics")
async def get_source_backfill_retry_analytics(
    limit: int = Query(50, ge=1, le=200),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Summarize recent AI 0.2 source backfill retry outcomes."""

    try:
        from services.readiness_action_service import get_readiness_action_service

        service = get_readiness_action_service(db)
        return await service._build_retry_analytics(limit=limit)
    except Exception as e:
        logger.error(f"Error getting source backfill retry analytics: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get retry analytics: {str(e)}")


@router.get("/source-backfill-retry-analytics.csv")
async def export_source_backfill_retry_analytics_csv(
    limit: int = Query(50, ge=1, le=200),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Export recent AI 0.2 source backfill retry analytics by category."""

    result = await get_source_backfill_retry_analytics(limit=limit, db=db)
    headers = ["category", "runs", "processed", "succeeded", "failed", "success_rate"]

    def cell(value):
        text = "" if value is None else str(value)
        return '"' + text.replace('"', '""').replace("\n", " ") + '"'

    rows = [",".join(headers)]
    for item in result.get("by_category", []):
        rows.append(",".join(cell(value) for value in [
            item.get("category"),
            item.get("runs"),
            item.get("processed"),
            item.get("succeeded"),
            item.get("failed"),
            item.get("success_rate"),
        ]))

    return Response(
        "\n".join(rows) + "\n",
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="source-backfill-retry-analytics-0.2.csv"'},
    )


@router.get("/source-backfill-retry-alert-settings")
async def get_source_backfill_retry_alert_settings(
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Return configurable AI 0.2 retry alert thresholds."""

    try:
        from services.readiness_action_service import get_readiness_action_service

        service = get_readiness_action_service(db)
        settings = await service.get_retry_alert_settings()
        if settings.get("updated_at") and hasattr(settings["updated_at"], "isoformat"):
            settings["updated_at"] = settings["updated_at"].isoformat()
        return settings
    except Exception as e:
        logger.error(f"Error getting retry alert settings: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get retry alert settings: {str(e)}")


@router.put("/source-backfill-retry-alert-settings")
async def update_source_backfill_retry_alert_settings(
    body: dict = Body(...),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Update configurable AI 0.2 retry alert thresholds."""

    try:
        from services.readiness_action_service import get_readiness_action_service

        service = get_readiness_action_service(db)
        settings = await service.update_retry_alert_settings(body)
        if settings.get("updated_at") and hasattr(settings["updated_at"], "isoformat"):
            settings["updated_at"] = settings["updated_at"].isoformat()
        return settings
    except Exception as e:
        logger.error(f"Error updating retry alert settings: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update retry alert settings: {str(e)}")


@router.get("/operator-alert-events")
async def get_operator_alert_events(
    event_type: Optional[str] = Query(None),
    delivered: Optional[bool] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Return recent persisted operator alert events."""

    try:
        query = {}
        if event_type:
            query["event_type"] = event_type
        if delivered is not None:
            query["delivered"] = delivered
        docs = await db.operator_alert_events.find(
            query,
            {
                "event_type": 1,
                "channel": 1,
                "delivered": 1,
                "payload.processed": 1,
                "payload.success_rate": 1,
                "payload.rate_limit_share": 1,
                "created_at": 1,
            },
        ).sort("created_at", -1).limit(limit).to_list(length=limit)
        return {
            "items": [
                {
                    "id": str(doc.get("_id")),
                    "event_type": doc.get("event_type"),
                    "channel": doc.get("channel"),
                    "delivered": bool(doc.get("delivered")),
                    "processed": ((doc.get("payload") or {}).get("processed") or 0),
                    "success_rate": ((doc.get("payload") or {}).get("success_rate")),
                    "rate_limit_share": ((doc.get("payload") or {}).get("rate_limit_share")),
                    "created_at": doc.get("created_at").isoformat() if doc.get("created_at") else None,
                }
                for doc in docs
            ]
        }
    except Exception as e:
        logger.error(f"Error getting operator alert events: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get operator alert events: {str(e)}")


@router.get("/operator-alert-events.csv")
async def export_operator_alert_events_csv(
    event_type: Optional[str] = Query(None),
    delivered: Optional[bool] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Export recent persisted operator alert events as CSV."""

    query = {}
    if event_type:
        query["event_type"] = event_type
    if delivered is not None:
        query["delivered"] = delivered
    docs = await db.operator_alert_events.find(
        query,
        {
            "event_type": 1,
            "channel": 1,
            "delivered": 1,
            "payload.processed": 1,
            "payload.success_rate": 1,
            "payload.rate_limit_share": 1,
            "created_at": 1,
        },
    ).sort("created_at", -1).limit(limit).to_list(length=limit)

    headers = ["created_at", "event_type", "channel", "delivered", "processed", "success_rate", "rate_limit_share"]

    def cell(value):
        text = "" if value is None else str(value)
        return '"' + text.replace('"', '""').replace("\n", " ") + '"'

    rows = [",".join(headers)]
    for doc in docs:
        payload = doc.get("payload") or {}
        rows.append(",".join(cell(value) for value in [
            doc.get("created_at").isoformat() if doc.get("created_at") else None,
            doc.get("event_type"),
            doc.get("channel"),
            doc.get("delivered"),
            payload.get("processed"),
            payload.get("success_rate"),
            payload.get("rate_limit_share"),
        ]))

    return Response(
        "\n".join(rows) + "\n",
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="operator-alert-events-0.2.csv"'},
    )


@router.get("/source-remediation-leaderboard")
async def get_source_remediation_leaderboard(
    min_ai_coverage: float = Query(0.85, ge=0, le=1),
    limit_per_source: int = Query(5, ge=1, le=25),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Rank Mendoza sources by AI 0.2 remediation need."""

    try:
        from services.ai_extraction_cron_service import get_ai_extraction_cron_service

        svc = get_ai_extraction_cron_service(db)
        return await svc.build_source_remediation_leaderboard(
            jurisdiction="Mendoza",
            min_ai_coverage=min_ai_coverage,
            limit_per_source=limit_per_source,
        )
    except Exception as e:
        logger.error(f"Error getting source remediation leaderboard: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get remediation leaderboard: {str(e)}")


@router.get("/source-remediation-leaderboard.csv")
async def export_source_remediation_leaderboard_csv(
    min_ai_coverage: float = Query(0.85, ge=0, le=1),
    limit_per_source: int = Query(5, ge=1, le=25),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Export Mendoza source remediation leaderboard as CSV."""

    try:
        from services.ai_extraction_cron_service import get_ai_extraction_cron_service

        svc = get_ai_extraction_cron_service(db)
        result = await svc.build_source_remediation_leaderboard(
            jurisdiction="Mendoza",
            min_ai_coverage=min_ai_coverage,
            limit_per_source=limit_per_source,
        )
    except Exception as e:
        logger.error(f"Error exporting source remediation leaderboard: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to export remediation leaderboard: {str(e)}")

    headers = [
        "source",
        "remediation_score",
        "total_records",
        "ai_coverage",
        "min_ai_coverage",
        "coverage_gap",
        "snapshot_coverage",
        "candidate_count",
        "top_candidate_score",
        "recent_processed",
        "recent_succeeded",
        "recent_failed",
        "recent_success_rate",
    ]

    def cell(value):
        text = "" if value is None else str(value)
        return '"' + text.replace('"', '""').replace("\n", " ") + '"'

    rows = [",".join(headers)]
    for item in result.get("items", []):
        rows.append(",".join(cell(value) for value in [
            item.get("source_name"),
            item.get("remediation_score"),
            item.get("total_records"),
            item.get("ai_coverage"),
            item.get("min_ai_coverage"),
            item.get("coverage_gap"),
            item.get("snapshot_coverage"),
            item.get("candidate_count"),
            item.get("top_candidate_score"),
            item.get("recent_processed"),
            item.get("recent_succeeded"),
            item.get("recent_failed"),
            item.get("recent_success_rate"),
        ]))

    return Response(
        "\n".join(rows) + "\n",
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="source-remediation-leaderboard-0.2.csv"'},
    )


@router.put("/source-readiness-backfill-settings")
async def update_source_readiness_backfill_settings(
    source_name: str = Query(...),
    body: dict = Body(...),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Persist per-source guarded AI 0.2 backfill settings."""

    try:
        settings = {
            "min_ai_coverage": max(0.0, min(float(body.get("min_ai_coverage", 0.85)), 1.0)),
            "limit_per_source": max(1, min(int(body.get("limit_per_source", 3)), 25)),
            "disabled": bool(body.get("disabled", False)),
            "updated_at": utc_now(),
        }
        result = await db.scraper_configs.update_one(
            {"name": source_name},
            {"$set": {"ai_backfill": settings}},
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail=f"Scraper source '{source_name}' not found")
        return {"ok": True, "source_name": source_name, "ai_backfill": settings}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating source readiness backfill settings: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update backfill settings: {str(e)}")


@router.get("/needs-repair")
async def get_needs_repair(db: AsyncIOMotorDatabase = Depends(get_db)):
    """List scrapers flagged as needing repair (10+ consecutive failures)."""
    try:
        configs = await db.scraper_configs.find(
            {"needs_repair": True}
        ).to_list(length=50)

        result = []
        for config in configs:
            name = config.get("name", "unknown")
            service = get_scheduler_service(db)
            consecutive, last_success = await service._get_consecutive_failures(name)
            total_records = await db.licitaciones.count_documents(
                {"fuente": {"$regex": f"^{re.escape(name)}", "$options": "i"}}
            )
            result.append({
                "name": name,
                "needs_repair_since": config.get("needs_repair_since").isoformat() if config.get("needs_repair_since") else None,
                "consecutive_failures": consecutive,
                "last_success": last_success.isoformat() if last_success else None,
                "total_records": total_records,
                "url": str(config.get("url", "")),
            })

        return {"scrapers": result}
    except Exception as e:
        logger.error(f"Error getting needs-repair: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/repair/{scraper_name}")
async def clear_repair_flag(scraper_name: str, db: AsyncIOMotorDatabase = Depends(get_db)):
    """Manually clear the needs_repair flag for a scraper."""
    try:
        result = await db.scraper_configs.update_one(
            {"name": scraper_name},
            {"$unset": {"needs_repair": "", "needs_repair_since": ""}}
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail=f"Scraper '{scraper_name}' not found")
        return {"status": "cleared", "scraper_name": scraper_name}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error clearing repair flag: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats")
async def get_scheduler_stats(db: AsyncIOMotorDatabase = Depends(get_db)):
    """Get aggregate statistics for all scraper runs"""
    try:
        runs_collection = db.scraper_runs
        
        # Aggregate stats by scraper
        pipeline = [
            {
                "$group": {
                    "_id": "$scraper_name",
                    "total_runs": {"$sum": 1},
                    "successful_runs": {
                        "$sum": {"$cond": [{"$eq": ["$status", "success"]}, 1, 0]}
                    },
                    "failed_runs": {
                        "$sum": {"$cond": [{"$eq": ["$status", "failed"]}, 1, 0]}
                    },
                    "avg_items_found": {"$avg": "$items_found"},
                    "avg_items_saved": {"$avg": "$items_saved"},
                    "avg_duration": {"$avg": "$duration_seconds"},
                    "last_run": {"$max": "$started_at"}
                }
            },
            {"$sort": {"last_run": -1}}
        ]
        
        stats = await runs_collection.aggregate(pipeline).to_list(length=100)
        
        # Overall stats
        overall = await runs_collection.aggregate([
            {
                "$group": {
                    "_id": None,
                    "total_runs": {"$sum": 1},
                    "total_items_found": {"$sum": "$items_found"},
                    "total_items_saved": {"$sum": "$items_saved"},
                }
            }
        ]).to_list(length=1)
        
        return {
            "by_scraper": stats,
            "overall": overall[0] if overall else {}
        }
    except Exception as e:
        logger.error(f"Error getting stats: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get stats: {str(e)}")


@router.get("/stats/system")
async def get_system_stats(request: Request):
    """System monitoring stats: scraper health, embedding coverage, pending queues."""
    db = request.app.mongodb

    try:
        from datetime import datetime, timedelta

        # Scraper health last 24h
        since = utc_now() - timedelta(hours=24)
        pipeline_health = [
            {"$match": {"started_at": {"$gte": since}}},
            {
                "$group": {
                    "_id": "$scraper_name",
                    "success": {"$sum": {"$cond": [{"$eq": ["$status", "success"]}, 1, 0]}},
                    "fail": {"$sum": {"$cond": [{"$in": ["$status", ["error", "failed"]]}, 1, 0]}},
                    "skip": {"$sum": {"$cond": [{"$eq": ["$status", "skipped"]}, 1, 0]}},
                    "last_run": {"$max": "$started_at"},
                }
            },
            {"$sort": {"_id": 1}},
        ]
        scraper_24h = await db.scraper_runs.aggregate(pipeline_health).to_list(100)

        # Embedding coverage
        total_lic = await db.licitaciones.count_documents({"enrichment_level": {"$gte": 2}})
        embedded = await db.licitacion_embeddings.count_documents({})
        embedding_pct = round(embedded / total_lic * 100, 1) if total_lic > 0 else 0

        # Pending queues
        pending_enrichment = await db.licitaciones.count_documents({"enrichment_level": {"$lt": 2}})
        pending_embedding = max(0, total_lic - embedded)

        # MongoDB collection stats
        total_docs = await db.licitaciones.count_documents({})

        # Pending objeto
        pending_objeto = await db.licitaciones.count_documents({
            "$or": [{"objeto": None}, {"objeto": ""}]
        })

        return {
            "scraper_24h": [
                {
                    "name": s["_id"],
                    "success": s["success"],
                    "fail": s["fail"],
                    "skip": s.get("skip", 0),
                    "last_run": s["last_run"].isoformat() if s.get("last_run") else None,
                }
                for s in scraper_24h
            ],
            "embedding_coverage": {
                "total": total_lic,
                "embedded": embedded,
                "pct": embedding_pct,
            },
            "pending_enrichment": pending_enrichment,
            "pending_embedding": pending_embedding,
            "pending_objeto": pending_objeto,
            "mongo_stats": {
                "doc_count": total_docs,
            },
            "generated_at": utc_now().isoformat(),
        }
    except Exception as e:
        return {"error": str(e)}


@router.get("/stats/duplicates")
async def get_cross_source_duplicates(request: Request):
    """Find licitaciones appearing in multiple sources (cross-source duplicates)."""
    db = request.app.mongodb
    try:
        from services.deduplication_service import DeduplicationService
        svc = DeduplicationService(db)
        dupes = await svc.find_cross_source_dupes()
        return {"total": len(dupes), "duplicates": dupes}
    except Exception as e:
        return {"error": str(e)}


@router.get("/health")
async def get_scraper_health(request: Request, days: int = Query(7, ge=1, le=90)):
    """Health dashboard: success rates, circuit breakers, items/day per scraper."""
    db = request.app.mongodb
    from services.scraper_health_monitor import get_scraper_health_monitor
    monitor = get_scraper_health_monitor(db)
    return await monitor.get_health_report(days=days)


@router.get("/health/circuit-breakers")
async def get_circuit_breakers(request: Request):
    """List all circuit breaker states."""
    db = request.app.mongodb
    from services.scraper_health_monitor import get_scraper_health_monitor
    monitor = get_scraper_health_monitor(db)
    configs = await db.scraper_configs.find(
        {"active": True}, {"name": 1}
    ).to_list(200)
    states = {}
    for cfg in configs:
        name = cfg["name"]
        states[name] = await monitor.get_circuit_state(name)
    return {"circuit_breakers": states}


@router.post("/health/circuit-breakers/{scraper_name}/reset")
async def reset_circuit_breaker(scraper_name: str, request: Request):
    """Manually reset a circuit breaker (closed state, 0 failures)."""
    db = request.app.mongodb
    from services.scraper_health_monitor import get_scraper_health_monitor
    monitor = get_scraper_health_monitor(db)
    await monitor.record_success(scraper_name)
    return {"ok": True, "scraper": scraper_name, "state": "closed"}
