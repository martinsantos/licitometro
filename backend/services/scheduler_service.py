"""
Scraper Scheduler Service using APScheduler.

Manages automatic execution of scrapers based on their cron schedules.
Tracks execution history and provides monitoring capabilities.
"""

import asyncio
import logging
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.events import EVENT_JOB_EXECUTED, EVENT_JOB_ERROR, JobExecutionEvent

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
from models.scraper_config import ScraperConfig
from models.scraper_run import ScraperRun, ScraperRunCreate, ScraperRunUpdate
from scrapers.scraper_factory import create_scraper
from services.deduplication_service import DeduplicationService

logger = logging.getLogger("scheduler_service")


class SchedulerService:
    """Service for scheduling and managing scraper executions"""
    
    def __init__(self, database: AsyncIOMotorDatabase):
        self.db = database
        self.scheduler: Optional[AsyncIOScheduler] = None
        self._is_running = False
        self._active_jobs: Dict[str, str] = {}  # scraper_name -> job_id
        
    async def initialize(self):
        """Initialize the scheduler"""
        if self.scheduler is None:
            self.scheduler = AsyncIOScheduler(timezone='America/Argentina/Mendoza')
            self.scheduler.add_listener(
                self._on_job_executed,
                EVENT_JOB_EXECUTED | EVENT_JOB_ERROR
            )
            # Clean up orphaned runs stuck in "running" from previous crashes
            await self._cleanup_orphaned_runs()
            logger.info("Scheduler initialized")

    async def _cleanup_orphaned_runs(self):
        """Mark runs stuck in 'running' as failed (from previous crashes/restarts).
        Runs every 10 min via scheduler + on startup."""
        # Only clean up runs older than 15 minutes to avoid killing legitimately running scrapers
        cutoff = datetime.utcnow() - timedelta(minutes=15)
        result = await self.db.scraper_runs.update_many(
            {"status": {"$in": ["running", "pending"]}, "started_at": {"$lt": cutoff}},
            {"$set": {
                "status": "failed",
                "error_message": "Orphaned run - process restarted",
                "ended_at": datetime.utcnow(),
            }}
        )
        if result.modified_count:
            logger.info(f"Cleaned up {result.modified_count} orphaned scraper runs")
    
    def start(self):
        """Start the scheduler"""
        if self.scheduler and not self._is_running:
            # Add periodic orphan cleanup (every 10 min, catches runs orphaned by restarts)
            self.scheduler.add_job(
                func=self._cleanup_orphaned_runs,
                trigger=IntervalTrigger(minutes=10),
                id="orphan_cleanup",
                name="Orphan Run Cleanup",
                replace_existing=True,
            )
            self.scheduler.start()
            self._is_running = True
            logger.info("Scheduler started")
    
    def stop(self):
        """Stop the scheduler"""
        if self.scheduler and self._is_running:
            self.scheduler.shutdown()
            self._is_running = False
            logger.info("Scheduler stopped")
    
    async def load_and_schedule_scrapers(self):
        """Load active scraper configs and schedule them"""
        configs_collection = self.db.scraper_configs
        configs = await configs_collection.find({"active": True}).to_list(length=100)
        
        logger.info(f"DEBUG: Found {len(configs)} active scrapers in DB")
        for c in configs:
            logger.info(f"DEBUG: Config in DB: {c.get('name')} active={c.get('active')}")
        
        scheduled_count = 0
        for config_data in configs:
            try:
                config_data.pop('_id', None)
                config = ScraperConfig(**config_data)
                logger.info(f"DEBUG: Scheduling {config.name}")
                if await self.schedule_scraper(config):
                    scheduled_count += 1
            except Exception as e:
                logger.error(f"Error scheduling scraper {config_data.get('name')}: {e}")
        
        logger.info(f"Scheduled {scheduled_count} active scrapers")
        return scheduled_count
    
    async def schedule_scraper(self, config: ScraperConfig) -> bool:
        """Schedule a single scraper based on its cron schedule"""
        if not self.scheduler:
            logger.error("Scheduler not initialized")
            return False
        
        try:
            # Parse cron schedule
            # Expected format: "minute hour day month day_of_week"
            # Example: "0 7,13,19 * * 1-5" (7am, 1pm, 7pm on weekdays)
            cron_parts = config.schedule.split()
            if len(cron_parts) != 5:
                logger.error(f"Invalid cron schedule for {config.name}: {config.schedule}")
                return False
            
            minute, hour, day, month, day_of_week = cron_parts
            
            # Remove existing job if present
            await self.unschedule_scraper(config.name)
            
            # Create trigger
            trigger = CronTrigger(
                minute=minute,
                hour=hour,
                day=day,
                month=month,
                day_of_week=day_of_week
            )
            
            # Add job
            job = self.scheduler.add_job(
                func=self._execute_scraper_job,
                trigger=trigger,
                id=f"scraper_{config.name}",
                name=config.name,
                args=[config.name],
                replace_existing=True,
                max_instances=1,  # Prevent overlapping executions
                coalesce=True,    # Coalesce missed executions into one
            )
            
            self._active_jobs[config.name] = job.id
            logger.info(f"Scheduled scraper '{config.name}' with schedule: {config.schedule}")
            return True
            
        except Exception as e:
            logger.error(f"Error scheduling scraper {config.name}: {e}")
            return False
    
    async def unschedule_scraper(self, scraper_name: str) -> bool:
        """Remove a scraper from the schedule"""
        if not self.scheduler:
            return False
        
        job_id = self._active_jobs.get(scraper_name)
        if job_id:
            try:
                self.scheduler.remove_job(job_id)
                del self._active_jobs[scraper_name]
                logger.info(f"Unscheduled scraper '{scraper_name}'")
                return True
            except Exception as e:
                logger.error(f"Error unscheduling scraper {scraper_name}: {e}")
        
        return False
    
    async def trigger_scraper_now(self, scraper_name: str) -> Optional[str]:
        """Manually trigger a scraper execution"""
        if not self.scheduler:
            logger.error("Scheduler not initialized")
            return None
        
        try:
            # Get config from DB
            configs_collection = self.db.scraper_configs
            config_data = await configs_collection.find_one({"name": scraper_name})
            if not config_data:
                logger.error(f"Scraper config not found: {scraper_name}")
                return None
            
            # Create run record
            run = ScraperRunCreate(scraper_name=scraper_name, status="pending")
            runs_collection = self.db.scraper_runs
            result = await runs_collection.insert_one(run.model_dump())
            run_id = str(result.inserted_id)
            
            # Execute immediately (don't wait)
            asyncio.create_task(self._execute_scraper_with_tracking(scraper_name, run_id))
            
            logger.info(f"Triggered manual execution of '{scraper_name}', run_id: {run_id}")
            return run_id
            
        except Exception as e:
            logger.error(f"Error triggering scraper {scraper_name}: {e}")
            return None
    
    async def _execute_scraper_job(self, scraper_name: str):
        """Job wrapper that creates tracking record before execution"""
        try:
            # Create run record
            run = ScraperRunCreate(scraper_name=scraper_name, status="running")
            runs_collection = self.db.scraper_runs
            result = await runs_collection.insert_one(run.model_dump())
            run_id = str(result.inserted_id)
            
            logger.info(f"Starting scheduled execution of '{scraper_name}', run_id: {run_id}")
            
            # Execute
            await self._execute_scraper_with_tracking(scraper_name, run_id)
            
        except Exception as e:
            logger.error(f"Error in scraper job {scraper_name}: {e}")
    
    async def _execute_scraper_with_tracking(self, scraper_name: str, run_id: str):
        """Execute a scraper and track its progress"""
        runs_collection = self.db.scraper_runs
        start_time = datetime.utcnow()
        
        logs: List[str] = []
        errors: List[str] = []
        warnings: List[str] = []
        
        def log(msg: str, level: str = "info"):
            timestamp = datetime.utcnow().isoformat()
            formatted = f"[{timestamp}] [{level.upper()}] {msg}"
            logs.append(formatted)
            if level == "error":
                errors.append(msg)
                logger.error(msg)
            elif level == "warning":
                warnings.append(msg)
                logger.warning(msg)
            else:
                logger.info(msg)
        
        try:
            # Update status to running
            await runs_collection.update_one(
                {"_id": ObjectId(run_id)},
                {"$set": {"status": "running", "started_at": start_time}}
            )
            
            # Get config
            configs_collection = self.db.scraper_configs
            config_data = await configs_collection.find_one({"name": scraper_name})
            if not config_data:
                raise ValueError(f"Scraper config not found: {scraper_name}")
            
            config_data.pop('_id', None)
            config = ScraperConfig(**config_data)
            
            # Create and run scraper
            scraper = create_scraper(config)
            if not scraper:
                raise ValueError(f"Could not create scraper for: {scraper_name}")
            
            log(f"Created scraper instance for {scraper_name}")

            # Execute scraper with timeout (10 min default, 20 min for Selenium scrapers)
            is_heavy = (
                (getattr(config, 'selectors', None) and isinstance(config.selectors, dict) and config.selectors.get('use_selenium_pliego'))
                or 'comprasapps' in scraper_name.lower()
            )
            timeout_seconds = 1200 if is_heavy else 600
            try:
                items = await asyncio.wait_for(scraper.run(), timeout=timeout_seconds)
            except asyncio.TimeoutError:
                raise TimeoutError(f"Scraper timed out after {timeout_seconds}s")
            
            duration = (datetime.utcnow() - start_time).total_seconds()
            
            # Calculate metrics
            items_found = len(items)
            items_saved = 0
            items_duplicated = 0
            items_updated = 0
            duplicates_skipped = 0
            urls_with_pliego = 0
            record_errors: List[Dict] = []

            # Initialize dedup service for content-hash checking
            dedup_svc = DeduplicationService(self.db)

            # Pre-load nodo matcher once (singleton with compiled regex cache)
            is_ar_scope_global = getattr(config, 'scope', None) == "ar_nacional"
            nodo_matcher = None
            if not is_ar_scope_global:
                try:
                    from services.nodo_matcher import get_nodo_matcher
                    nodo_matcher = get_nodo_matcher(self.db)
                except Exception as _nm_err:
                    log(f"Failed to load nodo_matcher: {_nm_err}", "warning")

            # Save items to database
            if items:
                licitaciones_collection = self.db.licitaciones
                for item in items:
                    try:
                        # Check if exists by id_licitacion
                        existing = await licitaciones_collection.find_one({
                            "id_licitacion": item.id_licitacion
                        })

                        # Content-hash dedup: check if a different record has the same hash
                        if not existing and item.content_hash:
                            hash_match = await licitaciones_collection.find_one({
                                "content_hash": item.content_hash,
                                "id_licitacion": {"$ne": item.id_licitacion}
                            })
                            if hash_match:
                                log(f"Skipped duplicate by content_hash: {item.id_licitacion} matches {hash_match.get('id_licitacion')}")
                                duplicates_skipped += 1
                                continue

                        # BOE-specific dedup: same expediente + similar title
                        if not existing and scraper_name.startswith("boletin"):
                            title_words = (item.title or "").lower().split()[:5]
                            if item.licitacion_number:
                                boe_match = await licitaciones_collection.find_one({
                                    "licitacion_number": item.licitacion_number,
                                    "fuente": {"$regex": "Boletin", "$options": "i"},
                                    "id_licitacion": {"$ne": item.id_licitacion}
                                })
                                if boe_match:
                                    log(f"Skipped BOE duplicate: {item.id_licitacion} matches {boe_match.get('id_licitacion')} by licitacion_number")
                                    duplicates_skipped += 1
                                    continue

                        # Compute content_hash if missing
                        if not item.content_hash:
                            item.content_hash = dedup_svc.compute_content_hash(
                                item.title, item.organization, item.publication_date
                            )

                        # Use default mode to preserve datetime as native objects for MongoDB
                        item_data = item.model_dump()
                        # Convert HttpUrl to str for BSON compatibility
                        for url_field in ("source_url", "canonical_url"):
                            if item_data.get(url_field) is not None:
                                item_data[url_field] = str(item_data[url_field])
                        item_data["updated_at"] = datetime.utcnow()

                        # AR scope: add LIC_AR tag and skip auto nodo matching
                        if is_ar_scope_global:
                            tags = item_data.get("tags") or []
                            if "LIC_AR" not in tags:
                                tags.append("LIC_AR")
                            item_data["tags"] = tags

                        # Match nodos before insert/update (skip for AR scope - manual only)
                        if nodo_matcher is not None:
                            try:
                                await nodo_matcher.assign_nodos_to_item_data(item_data)
                            except Exception as nodo_err:
                                log(f"Nodo matching failed for {item.id_licitacion}: {nodo_err}", "warning")

                        if existing:
                            # Update
                            await licitaciones_collection.update_one(
                                {"id_licitacion": item.id_licitacion},
                                {"$set": item_data}
                            )
                            items_updated += 1
                        else:
                            # Inline lightweight enrichment (CPU only, no HTTP) — BEFORE insert
                            # to avoid a second update_one round-trip to MongoDB
                            try:
                                if not item_data.get("objeto"):
                                    from utils.object_extractor import extract_objeto
                                    obj = extract_objeto(
                                        title=item_data.get("title", ""),
                                        description=item_data.get("description", ""),
                                        metadata=item_data.get("metadata"),
                                    )
                                    if obj:
                                        item_data["objeto"] = obj
                                if not item_data.get("category"):
                                    from services.category_classifier import get_category_classifier
                                    classifier = get_category_classifier()
                                    _title = item_data.get("title", "")
                                    _objeto = item_data.get("objeto", "")
                                    cat = classifier.classify(title=_title, objeto=_objeto)
                                    if not cat:
                                        _desc = (item_data.get("description", "") or "")[:500]
                                        cat = classifier.classify(title=_title, objeto=_objeto, description=_desc)
                                    if cat:
                                        item_data["category"] = cat
                            except Exception as inline_err:
                                log(f"Inline enrichment failed for {item.id_licitacion}: {inline_err}", "warning")

                            # Insert - set both created_at AND first_seen_at
                            now = datetime.utcnow()
                            item_data["created_at"] = now
                            item_data["first_seen_at"] = now
                            await licitaciones_collection.insert_one(item_data)
                            items_saved += 1

                        # Count URLs with PLIEGO
                        if item.metadata and item.metadata.get("comprar_pliego_url"):
                            urls_with_pliego += 1

                    except Exception as e:
                        log(f"Error saving item {item.id_licitacion}: {e}", "error")
                        record_errors.append({
                            "id_licitacion": item.id_licitacion,
                            "error": str(e),
                            "timestamp": datetime.utcnow().isoformat()
                        })
                        items_duplicated += 1
            
            # Determine status
            status = "success"
            if errors:
                status = "partial" if items_saved > 0 else "failed"
            
            # Update run record
            update = ScraperRunUpdate(
                status=status,
                items_found=items_found,
                items_saved=items_saved,
                items_duplicated=items_duplicated,
                items_updated=items_updated,
                urls_discovered=items_found,
                urls_with_pliego=urls_with_pliego,
                duration_seconds=duration,
                ended_at=datetime.utcnow(),
                errors=errors,
                warnings=warnings,
                logs=logs,
                record_errors=record_errors,
                duplicates_skipped=duplicates_skipped,
            )
            
            await runs_collection.update_one(
                {"_id": ObjectId(run_id)},
                {"$set": update.model_dump(exclude_unset=True, mode='json')}
            )
            
            # Update scraper config last_run
            await configs_collection.update_one(
                {"name": scraper_name},
                {
                    "$set": {"last_run": datetime.utcnow()},
                    "$inc": {"runs_count": 1}
                }
            )
            
            log(f"Scraper '{scraper_name}' completed. Found: {items_found}, Saved: {items_saved}, Updated: {items_updated}")

            # Notify about new licitaciones (skip for AR scope - manual only)
            is_ar_scope = getattr(config, 'scope', None) == "ar_nacional"
            if items_saved > 0 and not is_ar_scope:
                try:
                    from services.notification_service import get_notification_service
                    ns = get_notification_service(self.db)
                    saved_items = [i.model_dump(mode='json') for i in items[:items_saved]]
                    await ns.notify_new_licitaciones(saved_items, scraper_name)
                except Exception as notify_err:
                    log(f"Notification failed: {notify_err}", "warning")

        except Exception as e:
            duration = (datetime.utcnow() - start_time).total_seconds()
            error_msg = str(e)
            log(f"Scraper failed: {error_msg}", "error")

            await runs_collection.update_one(
                {"_id": ObjectId(run_id)},
                {
                    "$set": {
                        "status": "failed",
                        "error_message": error_msg,
                        "duration_seconds": duration,
                        "ended_at": datetime.utcnow(),
                        "errors": errors + [error_msg],
                        "logs": logs,
                    }
                }
            )

            # Notify about scraper error
            try:
                from services.notification_service import get_notification_service
                ns = get_notification_service(self.db)
                await ns.notify_scraper_error(scraper_name, error_msg)
            except Exception as notify_err:
                logger.warning(f"Error notification failed: {notify_err}")
    
    def _on_job_executed(self, event: JobExecutionEvent):
        """Handle job execution events"""
        if event.exception:
            logger.error(f"Job {event.job_id} failed: {event.exception}")
        else:
            logger.info(f"Job {event.job_id} completed successfully")
    
    def get_status(self) -> Dict[str, Any]:
        """Get current scheduler status"""
        if not self.scheduler:
            return {"running": False, "jobs": []}
        
        jobs = []
        for job in self.scheduler.get_jobs():
            jobs.append({
                "id": job.id,
                "name": job.name,
                "next_run_time": job.next_run_time.isoformat() if job.next_run_time else None,
                "trigger": str(job.trigger),
            })
        
        return {
            "running": self._is_running,
            "jobs": jobs,
        }
    
    async def get_recent_runs(self, scraper_name: Optional[str] = None, 
                              limit: int = 10) -> List[ScraperRun]:
        """Get recent scraper runs"""
        runs_collection = self.db.scraper_runs
        
        query = {}
        if scraper_name:
            query["scraper_name"] = scraper_name
        
        cursor = runs_collection.find(query).sort("started_at", -1).limit(limit)
        runs = await cursor.to_list(length=limit)

        result = []
        for run in runs:
            run["id"] = str(run.pop("_id"))
            result.append(ScraperRun(**run))
        return result
    
    async def get_run_by_id(self, run_id: str) -> Optional[ScraperRun]:
        """Get a specific run by ID"""
        runs_collection = self.db.scraper_runs
        run_data = await runs_collection.find_one({"_id": ObjectId(run_id)})
        if run_data:
            run_data["id"] = str(run_data.pop("_id"))
            return ScraperRun(**run_data)
        return None


# Singleton instance
_scheduler_service: Optional[SchedulerService] = None


def get_scheduler_service(database: AsyncIOMotorDatabase) -> SchedulerService:
    """Get or create scheduler service singleton"""
    global _scheduler_service
    if _scheduler_service is None:
        _scheduler_service = SchedulerService(database)
    return _scheduler_service
