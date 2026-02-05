"""
Router for scheduler management endpoints.

Provides API endpoints to control the scraper scheduler, view job status,
trigger manual executions, and review run history.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
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


def get_db(request):
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
