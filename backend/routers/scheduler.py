"""
Router for scheduler management endpoints.

Provides API endpoints to control the scraper scheduler, view job status,
trigger manual executions, and review run history.
"""

import re

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from typing import List, Optional
from motor.motor_asyncio import AsyncIOMotorDatabase
import logging

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

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
            escaped_name = re.escape(name)
            total_records = await licitaciones_collection.count_documents(
                {"fuente": {"$regex": f"^{escaped_name}", "$options": "i"}}
            )

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
            })

        return {"sources": sources}
    except Exception as e:
        logger.error(f"Error getting source health: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get source health: {str(e)}")


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
        since = datetime.utcnow() - timedelta(hours=24)
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
            "generated_at": datetime.utcnow().isoformat(),
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
