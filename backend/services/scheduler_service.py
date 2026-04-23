"""
Scraper Scheduler Service using APScheduler.

Manages automatic execution of scrapers based on their cron schedules.
Tracks execution history and provides monitoring capabilities.
"""

import asyncio
import logging
import re
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from utils.time import utc_now
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.date import DateTrigger
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.events import EVENT_JOB_EXECUTED, EVENT_JOB_ERROR, JobExecutionEvent

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from bson import ObjectId
from pymongo import InsertOne, UpdateOne
from motor.motor_asyncio import AsyncIOMotorDatabase
from models.scraper_config import ScraperConfig
from models.scraper_run import ScraperRun, ScraperRunCreate, ScraperRunUpdate
from scrapers.scraper_factory import create_scraper
from services.deduplication_service import DeduplicationService
from utils.proceso_id import normalize_proceso_id

logger = logging.getLogger("scheduler_service")


class SchedulerService:
    """Service for scheduling and managing scraper executions"""

    def __init__(self, database: AsyncIOMotorDatabase):
        self.db = database
        self.scheduler: Optional[AsyncIOScheduler] = None
        self._is_running = False
        self._active_jobs: Dict[str, str] = {}  # scraper_name -> job_id
        # Global concurrency limit: max 6 scrapers running simultaneously.
        # Prevents network overload when many scrapers fire at the same cron hour.
        self._scraper_semaphore = asyncio.Semaphore(6)
        
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
        cutoff = utc_now() - timedelta(minutes=15)
        result = await self.db.scraper_runs.update_many(
            {"status": {"$in": ["running", "pending"]}, "started_at": {"$lt": cutoff}},
            {"$set": {
                "status": "failed",
                "error_message": "Orphaned run - process restarted",
                "ended_at": utc_now(),
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
            # SGI sync — daily at 7am (before scraping runs)
            self.scheduler.add_job(
                func=self._sgi_sync_job,
                trigger=CronTrigger(hour=7, minute=0),
                id="sgi_sync_daily",
                name="SGI Sync Daily",
                replace_existing=True,
            )
            # Inbox watcher — every 5 minutes
            self.scheduler.add_job(
                func=self._inbox_watch_job,
                trigger="interval",
                minutes=5,
                id="inbox_watcher",
                name="Inbox folder watcher",
                replace_existing=True,
            )
            # Link health — daily 5am, probes COMPR.AR canonical URLs and re-resolves dead ones
            self.scheduler.add_job(
                func=self._link_health_job,
                trigger=CronTrigger(hour=5, minute=0),
                id="link_health_daily",
                name="COMPR.AR link health probe",
                replace_existing=True,
            )
            # ComprasApps adjudicaciones extractor — daily 7am
            self.scheduler.add_job(
                func=self._comprasapps_adj_job,
                trigger=CronTrigger(hour=7, minute=15),
                id="comprasapps_adjudicaciones_daily",
                name="ComprasApps adjudicaciones extraction",
                replace_existing=True,
            )
            # Boletín Oficial adjudicaciones — daily 7:30am, runs over recent BO items
            self.scheduler.add_job(
                func=self._boletin_adj_job,
                trigger=CronTrigger(hour=7, minute=30),
                id="boletin_adjudicaciones_daily",
                name="Boletín Oficial adjudicaciones extraction",
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
        
        logger.debug(f"Found {len(configs)} active scrapers in DB")
        for c in configs:
            logger.debug(f"Config in DB: {c.get('name')} active={c.get('active')}")

        scheduled_count = 0
        for config_data in configs:
            try:
                config_data.pop('_id', None)
                config = ScraperConfig(**config_data)
                logger.debug(f"Scheduling {config.name}")
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
            
            # Execute immediately (fire-and-forget) with error logging on failure
            task = asyncio.create_task(self._execute_scraper_with_tracking(scraper_name, run_id))
            task.add_done_callback(
                lambda t: logger.error(f"Scraper task '{scraper_name}' failed: {t.exception()}")
                if not t.cancelled() and t.exception() else None
            )

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
    
    async def _execute_scraper_with_tracking(self, scraper_name: str, run_id: str,
                                                retry_count: int = 0):
        """Execute a scraper and track its progress"""
        runs_collection = self.db.scraper_runs
        start_time = utc_now()
        
        logs: List[str] = []
        errors: List[str] = []
        warnings: List[str] = []
        
        def log(msg: str, level: str = "info"):
            timestamp = utc_now().isoformat()
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

            # Execute scraper with timeout (10 min default, 20 min for Selenium scrapers).
            # Global semaphore (max 6 concurrent) prevents network overload when many
            # scrapers fire at the same cron hour.
            is_heavy = (
                (getattr(config, 'selectors', None) and isinstance(config.selectors, dict) and config.selectors.get('use_selenium_pliego'))
                or 'comprasapps' in scraper_name.lower()
            )
            timeout_seconds = 1800 if is_heavy else 600  # 30 min for heavy scrapers (ComprasApps ~1040 items)
            try:
                async with self._scraper_semaphore:
                    log(f"Semaphore acquired for {scraper_name} (timeout={timeout_seconds}s)")
                    items = await asyncio.wait_for(scraper.run(), timeout=timeout_seconds)
            except asyncio.TimeoutError:
                raise TimeoutError(f"Scraper timed out after {timeout_seconds}s")
            
            duration = (utc_now() - start_time).total_seconds()
            
            # Calculate metrics
            items_found = len(items)
            items_saved = 0
            items_duplicated = 0
            items_updated = 0
            items_unchanged = 0
            duplicates_skipped = 0
            urls_with_pliego = 0
            record_errors: List[Dict] = []

            # Initialize dedup service for content-hash checking
            dedup_svc = DeduplicationService(self.db)

            # Save items to database
            if items:
                licitaciones_collection = self.db.licitaciones
                is_ar_scope = getattr(config, 'scope', None) == "ar_nacional"
                is_boletin = scraper_name.startswith("boletin")

                # ── Bulk pre-load: fetch ALL existing records for this batch in ONE query ──
                batch_ids = [i.id_licitacion for i in items if i.id_licitacion]
                batch_hashes = [i.content_hash for i in items if i.content_hash]

                existing_ids: set = set()
                existing_id_hashes: Dict[str, Optional[str]] = {}  # id_licitacion → content_hash
                existing_hashes: Dict[str, str] = {}  # hash → id_licitacion
                boe_existing_numbers: set = set()

                existing_estados: Dict[str, Optional[str]] = {}  # id_licitacion → estado
                if batch_ids:
                    existing_docs = await licitaciones_collection.find(
                        {"id_licitacion": {"$in": batch_ids}},
                        {"id_licitacion": 1, "content_hash": 1, "estado": 1}
                    ).to_list(length=None)
                    existing_ids = {doc["id_licitacion"] for doc in existing_docs}
                    existing_id_hashes = {doc["id_licitacion"]: doc.get("content_hash") for doc in existing_docs}
                    existing_estados = {doc["id_licitacion"]: doc.get("estado") for doc in existing_docs}

                if batch_hashes:
                    hash_docs = await licitaciones_collection.find(
                        {"content_hash": {"$in": batch_hashes}},
                        {"id_licitacion": 1, "content_hash": 1}
                    ).to_list(length=None)
                    existing_hashes = {doc["content_hash"]: doc["id_licitacion"] for doc in hash_docs}

                if is_boletin:
                    batch_numbers = [i.licitacion_number for i in items if i.licitacion_number]
                    if batch_numbers:
                        boe_docs = await licitaciones_collection.find(
                            {"licitacion_number": {"$in": batch_numbers}, "fuente": {"$regex": "Boletin", "$options": "i"}},
                            {"id_licitacion": 1, "licitacion_number": 1}
                        ).to_list(length=None)
                        boe_existing_numbers = {doc["licitacion_number"] for doc in boe_docs}

                # Pre-load nodo_matcher singleton once (not per-item)
                nodo_matcher = None
                if not is_ar_scope:
                    try:
                        from services.nodo_matcher import get_nodo_matcher
                        nodo_matcher = get_nodo_matcher(self.db)
                    except Exception as nm_err:
                        log(f"Nodo matcher init failed: {nm_err}", "warning")

                # Pre-load enrichment helpers once
                from utils.object_extractor import extract_objeto
                from services.category_classifier import get_category_classifier
                classifier = get_category_classifier()

                now = utc_now()
                bulk_ops = []
                enrichment_updates: List[Dict] = []  # list of {id_licitacion, updates}

                for item in items:
                    try:
                        id_exists = item.id_licitacion in existing_ids

                        # Content-hash dedup (new items only)
                        if not id_exists and item.content_hash:
                            matched_id = existing_hashes.get(item.content_hash)
                            if matched_id and matched_id != item.id_licitacion:
                                log(f"Skipped duplicate by content_hash: {item.id_licitacion} matches {matched_id}")
                                duplicates_skipped += 1
                                continue

                        # BOE-specific dedup (new items only)
                        if not id_exists and is_boletin and item.licitacion_number:
                            if item.licitacion_number in boe_existing_numbers:
                                log(f"Skipped BOE duplicate by licitacion_number: {item.id_licitacion}")
                                duplicates_skipped += 1
                                continue

                        # Compute content_hash if missing
                        if not item.content_hash:
                            item.content_hash = dedup_svc.compute_content_hash(
                                item.title, item.organization, item.publication_date
                            )

                        # Prepare item data
                        item_data = item.model_dump()
                        for url_field in ("source_url", "canonical_url"):
                            if item_data.get(url_field) is not None:
                                item_data[url_field] = str(item_data[url_field])
                        item_data["updated_at"] = now

                        # Populate fuentes[] from primary fuente
                        primary_fuente = item_data.get("fuente") or ""
                        existing_fuentes = item_data.get("fuentes") or []
                        if primary_fuente and primary_fuente not in existing_fuentes:
                            existing_fuentes = [primary_fuente] + existing_fuentes
                        item_data["fuentes"] = existing_fuentes

                        # Generate proceso_id for cross-source matching
                        if not item_data.get("proceso_id"):
                            item_data["proceso_id"] = normalize_proceso_id(
                                expedient_number=item_data.get("expedient_number"),
                                licitacion_number=item_data.get("licitacion_number"),
                                title=item_data.get("title", ""),
                                fuente=primary_fuente,
                            )

                        # AR scope: add LIC_AR tag
                        if is_ar_scope:
                            tags = item_data.get("tags") or []
                            if "LIC_AR" not in tags:
                                tags.append("LIC_AR")
                            item_data["tags"] = tags

                        # Nodo matching (pre-loaded singleton)
                        if nodo_matcher:
                            try:
                                await nodo_matcher.assign_nodos_to_item_data(item_data)
                            except Exception as nodo_err:
                                log(f"Nodo matching failed for {item.id_licitacion}: {nodo_err}", "warning")

                        if id_exists:
                            # Skip items whose content hasn't changed,
                            # but ALWAYS sync state-tracking metadata fields that
                            # source can change without touching title/org/numero
                            # (e.g. ComprasApps "Vigente" → "Adjudicada").
                            old_hash = existing_id_hashes.get(item.id_licitacion)
                            if old_hash and item.content_hash and old_hash == item.content_hash:
                                items_unchanged += 1
                                meta_only_set = {}
                                src_meta = item_data.get("metadata") or {}
                                for k in ("comprasapps_estado", "comprasapps_detail_url",
                                          "comprasapps_anio", "comprasapps_seq",
                                          "comprasapps_tipo_code"):
                                    if k in src_meta and src_meta[k] is not None:
                                        meta_only_set[f"metadata.{k}"] = src_meta[k]
                                # Sync canonical_url too if scraper produced a stable one
                                if item.url_quality == "direct" and item_data.get("canonical_url"):
                                    meta_only_set["canonical_url"] = item_data["canonical_url"]
                                    meta_only_set["url_quality"] = "direct"
                                if meta_only_set:
                                    bulk_ops.append(UpdateOne(
                                        {"id_licitacion": item.id_licitacion},
                                        {"$set": meta_only_set},
                                    ))
                                continue

                            # Skip re-processing vencida/archivada items — they're dead
                            old_estado = existing_estados.get(item.id_licitacion)
                            if old_estado in ("vencida", "archivada"):
                                items_unchanged += 1
                                continue

                            # Content changed — preserve immutable timestamps
                            item_data.pop("first_seen_at", None)
                            item_data.pop("created_at", None)
                            items_updated += 1
                            bulk_ops.append(UpdateOne(
                                {"id_licitacion": item.id_licitacion},
                                {"$set": item_data}
                            ))
                        else:
                            item_data["created_at"] = now
                            item_data["first_seen_at"] = now
                            items_saved += 1
                            bulk_ops.append(InsertOne(item_data))

                            # Collect inline enrichment for new items
                            _inline_updates = {}
                            if not item_data.get("objeto"):
                                obj = extract_objeto(
                                    title=item_data.get("title", ""),
                                    description=item_data.get("description", ""),
                                    metadata=item_data.get("metadata"),
                                )
                                if obj:
                                    _inline_updates["objeto"] = obj
                            if not item_data.get("category"):
                                _title = item_data.get("title", "")
                                _objeto = _inline_updates.get("objeto", item_data.get("objeto", ""))
                                cat = classifier.classify(title=_title, objeto=_objeto)
                                if not cat:
                                    _desc = (item_data.get("description", "") or "")[:500]
                                    cat = classifier.classify(title=_title, objeto=_objeto, description=_desc)
                                if cat:
                                    _inline_updates["category"] = cat
                            if _inline_updates:
                                enrichment_updates.append({"id_licitacion": item.id_licitacion, "updates": _inline_updates})

                        # Count URLs with PLIEGO
                        if item.metadata and item.metadata.get("comprar_pliego_url"):
                            urls_with_pliego += 1

                    except Exception as e:
                        log(f"Error preparing item {item.id_licitacion}: {e}", "error")
                        record_errors.append({
                            "id_licitacion": item.id_licitacion,
                            "error": str(e),
                            "timestamp": utc_now().isoformat()
                        })
                        items_duplicated += 1

                # ── Execute bulk write (all inserts + updates in one round-trip) ──
                if bulk_ops:
                    try:
                        await licitaciones_collection.bulk_write(bulk_ops, ordered=False)
                    except Exception as bw_err:
                        log(f"Bulk write error: {bw_err}", "error")

                # ── Batch enrichment updates for new items ──
                if enrichment_updates:
                    enrich_ops = [
                        UpdateOne({"id_licitacion": eu["id_licitacion"]}, {"$set": eu["updates"]})
                        for eu in enrichment_updates
                    ]
                    try:
                        await licitaciones_collection.bulk_write(enrich_ops, ordered=False)
                    except Exception as enrich_err:
                        log(f"Enrichment bulk write error: {enrich_err}", "warning")

                # ── HUNTER cross-source enrichment for new items ──
                if items_saved > 0 and enrichment_updates:
                    try:
                        from services.cross_source_service import CrossSourceService
                        cross_svc = CrossSourceService(self.db)

                        new_ids = [eu["id_licitacion"] for eu in enrichment_updates]
                        new_docs = await licitaciones_collection.find(
                            {"id_licitacion": {"$in": new_ids}}
                        ).to_list(length=200)

                        cross_enriched = 0
                        for doc in new_docs:
                            doc_id = str(doc["_id"])
                            try:
                                hunter_result = await cross_svc.hunt_cross_sources(
                                    doc_id, doc, {}
                                )
                                if hunter_result.get("matches_found", 0) > 0:
                                    cross_enriched += 1
                            except Exception:
                                pass

                        if cross_enriched:
                            log(f"HUNTER: {cross_enriched}/{len(new_docs)} new items enriched from cross-source matches")
                    except Exception as cs_err:
                        log(f"Cross-source HUNTER error: {cs_err}", "warning")

            # Determine status
            status = "success"
            if errors:
                status = "partial" if items_saved > 0 else "failed"

            # Detect silent failure: 0 items found with no errors
            # A scraper that used to return items but returns 0 is suspicious
            if status == "success" and items_found == 0:
                expected_doc = await configs_collection.find_one(
                    {"name": scraper_name}, {"last_items_found": 1}
                )
                last_items = (expected_doc or {}).get("last_items_found", 0)
                if last_items > 10:
                    status = "empty_suspicious"
                    log(f"Suspicious: 0 items found but last successful run had {last_items}", "warning")

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
                ended_at=utc_now(),
                errors=errors,
                warnings=warnings,
                logs=logs,
                record_errors=record_errors,
                duplicates_skipped=duplicates_skipped,
                metadata={"items_unchanged": items_unchanged},
            )

            # Use default mode (Python) — preserves datetime as BSON Date, not ISO string
            await runs_collection.update_one(
                {"_id": ObjectId(run_id)},
                {"$set": update.model_dump(exclude_unset=True)}
            )

            # Update scraper config last_run
            await configs_collection.update_one(
                {"name": scraper_name},
                {
                    "$set": {"last_run": utc_now()},
                    "$inc": {"runs_count": 1}
                }
            )

            # Track last_items_found for silent failure detection + clear needs_repair
            if items_found > 0:
                await configs_collection.update_one(
                    {"name": scraper_name},
                    {"$set": {"last_items_found": items_found}}
                )
                await configs_collection.update_one(
                    {"name": scraper_name, "needs_repair": True},
                    {"$unset": {"needs_repair": "", "needs_repair_since": ""}}
                )

            log(f"Scraper '{scraper_name}' completed. Found: {items_found}, Saved: {items_saved}, Updated: {items_updated}, Unchanged: {items_unchanged}, Dupes skipped: {duplicates_skipped}")

            # Handle failures and suspicious empties: alert + retry + escalation
            if status in ("failed", "empty_suspicious"):
                await self._handle_scraper_failure(
                    scraper_name, run_id, errors, config_data, status, retry_count
                )

            # Notify about new licitaciones (skip for AR scope - manual only)
            is_ar_scope = getattr(config, 'scope', None) == "ar_nacional"
            if items_saved > 0 and not is_ar_scope:
                try:
                    from services.notification_service import get_notification_service
                    ns = get_notification_service(self.db)
                    saved_items = [i.model_dump() for i in items[:items_saved]]
                    await ns.notify_new_licitaciones(saved_items, scraper_name)
                except Exception as notify_err:
                    log(f"Notification failed: {notify_err}", "warning")

        except Exception as e:
            duration = (utc_now() - start_time).total_seconds()
            error_msg = str(e)
            log(f"Scraper failed: {error_msg}", "error")

            await runs_collection.update_one(
                {"_id": ObjectId(run_id)},
                {
                    "$set": {
                        "status": "failed",
                        "error_message": error_msg,
                        "duration_seconds": duration,
                        "ended_at": utc_now(),
                        "errors": errors + [error_msg],
                        "logs": logs,
                    }
                }
            )

            # Enhanced failure handling: alert + retry + escalation
            try:
                configs_collection = self.db.scraper_configs
                config_data = await configs_collection.find_one({"name": scraper_name})
                await self._handle_scraper_failure(
                    scraper_name, run_id, errors + [error_msg], config_data, "failed", retry_count
                )
            except Exception as handle_err:
                logger.warning(f"Failure handler error: {handle_err}")
    
    async def _handle_scraper_failure(self, scraper_name: str, run_id: str,
                                       errors: List[str], config_data: Optional[Dict],
                                       status: str, retry_count: int):
        """Centralized failure handling: enhanced alert, auto-retry, escalation."""
        configs_collection = self.db.scraper_configs

        consecutive, last_success = await self._get_consecutive_failures(scraper_name)
        config_url = str(config_data.get("url", "")) if config_data else ""
        total_records = await self.db.licitaciones.count_documents(
            {"fuente": {"$regex": f"^{re.escape(scraper_name)}$", "$options": "i"}}
        )

        # Enhanced alert via Telegram
        try:
            from services.notification_service import get_notification_service
            ns = get_notification_service(self.db)
            last_items = (config_data or {}).get("last_items_found", 0)
            error_text = errors[0] if errors else f"0 items returned (expected ~{last_items})"
            await ns.notify_scraper_error_enhanced(
                scraper_name=scraper_name,
                error=error_text,
                consecutive_failures=consecutive,
                last_success_at=last_success,
                total_records=total_records,
                scraper_url=config_url,
                retry_count=retry_count,
            )
        except Exception as notify_err:
            logger.warning(f"Enhanced notification failed: {notify_err}")

        # Schedule retry (max 2 retries)
        if retry_count < 2 and self.scheduler:
            try:
                await self._schedule_retry(scraper_name, retry_count, run_id)
            except Exception as retry_err:
                logger.warning(f"Retry scheduling failed: {retry_err}")

        # Escalation: mark needs_repair after 10 consecutive failures
        if consecutive >= 10:
            await configs_collection.update_one(
                {"name": scraper_name},
                {"$set": {"needs_repair": True, "needs_repair_since": utc_now()}}
            )

    async def _get_consecutive_failures(self, scraper_name: str) -> tuple:
        """Count consecutive failures (including empty_suspicious) for a scraper.
        Returns (count, last_success_at)."""
        runs = await self.db.scraper_runs.find(
            {"scraper_name": scraper_name}
        ).sort("started_at", -1).limit(50).to_list(length=50)

        count = 0
        last_success_at = None
        for run in runs:
            if run.get("status") in ("failed", "empty_suspicious", "partial"):
                count += 1
            else:
                last_success_at = run.get("started_at")
                break
        return count, last_success_at

    async def _schedule_retry(self, scraper_name: str, retry_count: int, original_run_id: str):
        """Schedule a one-shot retry job with escalating delay."""
        delay_minutes = 15 if retry_count == 0 else 30
        run_at = utc_now() + timedelta(minutes=delay_minutes)
        job_id = f"retry_{scraper_name}_{retry_count + 1}"

        self.scheduler.add_job(
            func=self._execute_retry_job,
            trigger=DateTrigger(run_date=run_at),
            id=job_id,
            name=f"Retry {scraper_name} #{retry_count + 1}",
            args=[scraper_name, retry_count + 1, original_run_id],
            replace_existing=True,
        )
        logger.info(f"Scheduled retry #{retry_count + 1} for {scraper_name} in {delay_minutes}min")

    async def _sgi_sync_job(self):
        """Sync SGI proyectos activos → MongoDB sgi_proyectos collection."""
        try:
            from services.sgi_service import get_sgi_service
            svc = get_sgi_service()
            if svc.enabled:
                result = await svc.sync_to_mongo(self.db)
                logger.info(f"SGI sync completed: {result}")
        except Exception as e:
            logger.error(f"SGI sync job failed: {e}")

    async def _inbox_watch_job(self):
        """Process files dropped in /opt/licitometro/inbox/."""
        try:
            from services.inbox_watcher_service import watch_inbox
            result = await watch_inbox(self.db)
            if result["processed"] or result["failed"]:
                logger.info(f"Inbox watcher: {result}")
        except Exception as e:
            logger.error(f"Inbox watcher job failed: {e}")

    async def _link_health_job(self):
        """Daily probe of COMPR.AR canonical URLs; mark dead, attempt re-resolve."""
        try:
            from services.link_health_service import check_comprar_links
            result = await check_comprar_links(self.db)
            logger.info(f"Link health: {result}")
        except Exception as e:
            logger.error(f"Link health job failed: {e}")

    async def _comprasapps_adj_job(self):
        """Extract awards from ComprasApps Adjudicada items into adjudicaciones col."""
        try:
            from services import comprasapps_adjudicaciones_service as casvc
            result = await casvc.run(self.db)
            logger.info(f"ComprasApps adjudicaciones: {result}")
        except Exception as e:
            logger.error(f"ComprasApps adjudicaciones job failed: {e}")

    async def _boletin_adj_job(self):
        """Extract awards from recent Boletín Oficial items via regex extractor."""
        try:
            from services.adjudicacion_service import get_adjudicacion_service
            from services.boletin_adjudicacion_extractor import extract_adjudicaciones
            svc = get_adjudicacion_service(self.db)
            await svc.ensure_indexes()

            from datetime import timedelta
            cutoff = utc_now() - timedelta(days=14)
            cursor = self.db.licitaciones.find(
                {
                    "fuente": {"$regex": "boletin", "$options": "i"},
                    "description": {"$exists": True, "$nin": [None, ""]},
                    "fecha_scraping": {"$gte": cutoff},
                    "metadata.adj_extracted_at": {"$exists": False},
                },
                {"_id": 1, "description": 1, "objeto": 1, "organization": 1,
                 "category": 1, "tipo_procedimiento": 1, "budget": 1,
                 "licitacion_number": 1, "expedient_number": 1, "proceso_id": 1},
            ).limit(500)

            inserted = 0
            scanned = 0
            async for lic in cursor:
                scanned += 1
                text = lic.get("description") or ""
                for ext in extract_adjudicaciones(text):
                    d = ext.to_dict()
                    if d.get("extraction_confidence", 0) < 0.5:
                        continue
                    doc = {
                        **d,
                        "currency": "ARS",
                        "estado_adjudicacion": "active",
                        "objeto": lic.get("objeto"),
                        "organization": lic.get("organization"),
                        "category": lic.get("category"),
                        "tipo_procedimiento": lic.get("tipo_procedimiento"),
                        "budget_original": lic.get("budget"),
                        "licitacion_id": str(lic["_id"]),
                        "proceso_id": lic.get("proceso_id"),
                        "fuente": "boletin_oficial",
                        "dedup_key": f"boletin:{lic['_id']}:{(d['adjudicatario'] or '').lower()[:60]}",
                    }
                    try:
                        await svc.upsert(doc)
                        inserted += 1
                    except Exception as e:
                        logger.debug(f"BO upsert failed: {e}")
                await self.db.licitaciones.update_one(
                    {"_id": lic["_id"]},
                    {"$set": {"metadata.adj_extracted_at": utc_now()}},
                )
            logger.info(f"BO adj extract: scanned={scanned} inserted={inserted}")
        except Exception as e:
            logger.error(f"BO adjudicaciones job failed: {e}")

    async def _execute_retry_job(self, scraper_name: str, retry_count: int, original_run_id: str):
        """Execute a retry: create a new run record linked to the original, then run."""
        try:
            run_data = ScraperRunCreate(scraper_name=scraper_name, status="running")
            run_dict = run_data.model_dump()
            run_dict["metadata"] = {"retry_of": original_run_id, "retry_count": retry_count}
            result = await self.db.scraper_runs.insert_one(run_dict)
            run_id = str(result.inserted_id)

            logger.info(f"Starting retry #{retry_count} for '{scraper_name}', run_id: {run_id}")
            await self._execute_scraper_with_tracking(scraper_name, run_id, retry_count)
        except Exception as e:
            logger.error(f"Retry job for {scraper_name} failed: {e}")

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
