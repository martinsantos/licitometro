"""
Declarative cron job registry.

All scheduled jobs are defined here. server.py calls register_all_crons()
at startup to register them with the APScheduler instance.
"""
import logging
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

logger = logging.getLogger("cron_registry")

# Declarative job definitions: (id, name, trigger, service_factory, method_name)
CRON_JOBS = [
    {
        "id": "storage_cleanup",
        "name": "Daily storage cleanup",
        "trigger": CronTrigger(hour=3, minute=0),
        "service_module": "services.storage_cleanup_service",
        "service_factory": "get_cleanup_service",
        "method": "run_cleanup",
    },
    {
        "id": "auto_update_active",
        "name": "Auto-update active licitaciones",
        "trigger": CronTrigger(hour=8, minute=0),
        "service_module": "services.auto_update_service",
        "service_factory": "get_auto_update_service",
        "method": "run_auto_update",
        "max_instances": 1,
    },
    {
        "id": "enrichment_cron",
        "name": "Enrichment cron (L1->L2)",
        "trigger": IntervalTrigger(minutes=30),
        "service_module": "services.enrichment_cron_service",
        "service_factory": "get_enrichment_cron_service",
        "method": "run_enrichment_cycle",
        "max_instances": 1,
    },
    {
        "id": "daily_digest",
        "name": "Daily notification digest",
        "trigger": CronTrigger(hour=9, minute=0),
        "service_module": "services.notification_service",
        "service_factory": "get_notification_service",
        "method": "send_daily_digest",
    },
    {
        "id": "nodo_digest_morning",
        "name": "Nodo digest morning (daily + twice_daily)",
        "trigger": CronTrigger(hour=9, minute=15),
        "service_module": "services.nodo_digest_service",
        "service_factory": "get_nodo_digest_service",
        "method": "run_digest",
        "args": [["daily", "twice_daily"]],
        "max_instances": 1,
    },
    {
        "id": "nodo_digest_evening",
        "name": "Nodo digest evening (twice_daily)",
        "trigger": CronTrigger(hour=18, minute=0),
        "service_module": "services.nodo_digest_service",
        "service_factory": "get_nodo_digest_service",
        "method": "run_digest",
        "args": [["twice_daily"]],
        "max_instances": 1,
    },
    {
        "id": "daily_estado_update",
        "name": "Daily estado update (mark vencidas)",
        "trigger": CronTrigger(hour=6, minute=0),
        "service_module": "services.vigencia_service",
        "service_factory": "get_vigencia_service",
        "method": "update_estados_batch",
        "max_instances": 1,
    },
    {
        "id": "embedding_batch",
        "name": "Nightly embedding batch",
        "trigger": CronTrigger(hour=23, minute=0),
        "service_module": "services.embedding_service",
        "service_factory": "get_embedding_service",
        "method": "embed_batch",
        "max_instances": 1,
    },
    {
        "id": "deadline_alerts",
        "name": "Deadline alerts (48h before opening)",
        "trigger": CronTrigger(hour="8,20", minute=0),
        "service_module": "services.notification_service",
        "service_factory": "get_notification_service",
        "method": "send_deadline_alerts",
        "max_instances": 1,
    },
    {
        "id": "scraper_health_check",
        "name": "Scraper health check (post-round)",
        "trigger": CronTrigger(hour="7,8,9,10,11,12,13,15,19", minute=30),
        "service_module": "services.scraper_health_monitor",
        "service_factory": "get_scraper_health_monitor",
        "method": "run_health_check",
        "max_instances": 1,
    },
    {
        "id": "scraper_daily_digest",
        "name": "Scraper daily digest (end of day)",
        "trigger": CronTrigger(hour=21, minute=0),
        "service_module": "services.scraper_health_monitor",
        "service_factory": "get_scraper_health_monitor",
        "method": "run_daily_digest",
        "max_instances": 1,
    },
    {
        "id": "circular_daily_check",
        "name": "Daily circular check (vigente + cotizando)",
        "trigger": CronTrigger(hour=20, minute=0),
        "service_module": "services.circular_extractor",
        "service_factory": "get_circular_extractor",
        "method": "run_daily_check",
        "max_instances": 1,
    },
]


def register_all_crons(scheduler, database):
    """Register all cron jobs with the APScheduler instance.

    Each job is loaded lazily (import + instantiation happens inside the loop).
    Failures are logged but don't block other jobs from registering.
    """
    import importlib

    registered = 0
    for job_def in CRON_JOBS:
        try:
            mod = importlib.import_module(job_def["service_module"])
            factory = getattr(mod, job_def["service_factory"])
            service = factory(database)
            func = getattr(service, job_def["method"])

            kwargs = {
                "func": func,
                "trigger": job_def["trigger"],
                "id": job_def["id"],
                "name": job_def["name"],
                "replace_existing": True,
            }
            if "args" in job_def:
                kwargs["args"] = job_def["args"]
            if "max_instances" in job_def:
                kwargs["max_instances"] = job_def["max_instances"]

            scheduler.add_job(**kwargs)
            logger.info(f"Registered cron '{job_def['id']}' ({job_def['name']})")
            registered += 1
        except Exception as e:
            logger.warning(f"Failed to register cron '{job_def['id']}': {e}")

    logger.info(f"Cron registry: {registered}/{len(CRON_JOBS)} jobs registered")
