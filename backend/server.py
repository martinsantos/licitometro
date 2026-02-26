from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.requests import Request
import logging
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
import sys
from pathlib import Path
import uvicorn

# Add parent directory to path so we can import modules
sys.path.insert(0, str(Path(__file__).parent))

# Import routers directly (not as relative imports)
from routers import licitaciones, licitaciones_ar, scraper_configs, comprar, scheduler, workflow, offer_templates, auth, public, nodos
from services.auth_service import verify_token

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
)
logger = logging.getLogger("licitometro")

# Get MongoDB connection string from environment variable
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "licitaciones_db")

# Auth-exempt paths (no login required)
AUTH_EXEMPT_PATHS = {
    "/api/health",
    "/api/auth/login",
    "/api/auth/check",
    "/api/auth/logout",
    "/api/auth/token-login",
    "/api/",
}

# Create FastAPI app
app = FastAPI(
    title="Licitometro API",
    description="API for the Licitometro application",
    version="1.0.0",
)

# Add CORS middleware
allowed_origins = os.environ.get("ALLOWED_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def cache_control_middleware(request: Request, call_next):
    """Add Cache-Control headers to GET responses for semi-static endpoints.
    Stats and reference data can be cached for a short period to reduce DB load."""
    response = await call_next(request)
    if request.method == "GET":
        path = request.url.path
        # Stats endpoints: cache 15 minutes (change infrequently)
        if "/stats/" in path:
            response.headers.setdefault("Cache-Control", "public, max-age=900, stale-while-revalidate=60")
        # Rubros list: cache 1 hour (loaded from static JSON)
        elif path.endswith("/rubros/list"):
            response.headers.setdefault("Cache-Control", "public, max-age=3600, stale-while-revalidate=300")
        # Distinct values (fuente, status lists): cache 30 minutes
        elif "/distinct/" in path:
            response.headers.setdefault("Cache-Control", "public, max-age=1800, stale-while-revalidate=120")
    return response


@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    """Require authentication for all API routes except exempt ones.
    Non-GET requests require admin role.
    GET requests to licitaciones are public (no auth required).

    Can be disabled entirely with DISABLE_AUTH=true env var (for previews/testing).
    """
    # Disable auth completely if DISABLE_AUTH is set (previews/testing)
    if os.environ.get("DISABLE_AUTH", "").lower() == "true":
        request.state.user_role = "admin"
        request.state.user_email = "preview@licitometro.ar"
        return await call_next(request)

    path = request.url.path

    # Skip auth for non-API routes, exempt paths, and public API
    if not path.startswith("/api") or path in AUTH_EXEMPT_PATHS or path.startswith("/api/public/"):
        return await call_next(request)

    # Allow public GET access to licitaciones, meta, and scraper-configs
    # (CotiZar container calls these without auth via internal Docker network)
    if request.method == "GET" and (
        path.startswith("/api/licitaciones")
        or path.startswith("/api/licitaciones-ar")
        or path.startswith("/api/meta/")
        or path.startswith("/api/scraper-configs")
    ):
        return await call_next(request)

    # Allow unauthenticated POST/DELETE on favorites (bookmarking is a user action, not admin)
    if path.startswith("/api/licitaciones/favorites/") and request.method in ("POST", "DELETE"):
        return await call_next(request)

    token = request.cookies.get("access_token")
    if not token:
        return JSONResponse(status_code=401, content={"detail": "Not authenticated"})

    token_data = verify_token(token)
    if not token_data["valid"]:
        return JSONResponse(status_code=401, content={"detail": "Not authenticated"})

    role = token_data.get("role", "reader")

    # Non-GET requests require admin (except auth-exempt paths already handled above)
    if request.method != "GET" and role != "admin":
        return JSONResponse(
            status_code=403,
            content={"detail": "Acceso de administrador requerido"},
        )

    request.state.user_role = role
    request.state.user_email = token_data.get("email", "")

    return await call_next(request)


# MongoDB client instance
client = AsyncIOMotorClient(MONGO_URL)
database = client[DB_NAME]

# Include routers
app.include_router(auth.router)
app.include_router(licitaciones.router)
app.include_router(licitaciones_ar.router)
app.include_router(scraper_configs.router)
app.include_router(comprar.router)
app.include_router(scheduler.router)
app.include_router(workflow.router)
app.include_router(offer_templates.router)
app.include_router(nodos.router)
app.include_router(public.router)

@app.on_event("startup")
async def startup_db_client():
    # Using the same client and database for the application
    # This ensures consistency across all components
    app.mongodb_client = client
    app.mongodb = database
    logger.info(f"Connected to MongoDB at {MONGO_URL}, database: {DB_NAME}")

    # Auto-seed admin user if users collection is empty
    try:
        from services.auth_service import AUTH_PASSWORD_HASH
        from datetime import datetime
        count = await database.users.count_documents({})
        if count == 0 and AUTH_PASSWORD_HASH:
            await database.users.insert_one({
                "email": "santosma@gmail.com",
                "password_hash": AUTH_PASSWORD_HASH,
                "role": "admin",
                "name": "Martin Santos",
                "active": True,
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow(),
            })
            await database.users.create_index("email", unique=True)
            logger.info("Admin user seeded: santosma@gmail.com")
        elif count == 0:
            logger.warning("No users and AUTH_PASSWORD_HASH not set - no admin seeded")
        else:
            # Ensure unique index exists even if users already present
            await database.users.create_index("email", unique=True)
    except Exception as e:
        logger.error(f"Failed to seed admin user: {e}")

    # Auto-seed AR national sources (always upsert so missing scope field gets patched)
    try:
        from datetime import datetime as dt_seed
        AR_SOURCES = [
            {"name": "datos_argentina_contrataciones", "url": "https://datos.gob.ar/dataset?tags=Contrataciones", "active": True, "schedule": "0 8,14 * * 1-5", "selectors": {"dataset_id": "jgm-sistema-contrataciones-electronicas", "scraper_type": "datos_argentina"}, "source_type": "api", "max_items": 200, "wait_time": 1.0, "scope": "ar_nacional"},
            {"name": "datos_argentina_contratar", "url": "https://datos.gob.ar/dataset/jgm-procesos-contratacion-obra-publica-gestionados-plataforma-contratar", "active": True, "schedule": "0 9 * * 1-5", "selectors": {"dataset_id": "jgm-procesos-contratacion-obra-publica-gestionados-plataforma-contratar", "scraper_type": "datos_argentina"}, "source_type": "api", "max_items": 200, "wait_time": 1.0, "scope": "ar_nacional"},
            {"name": "contrataciones_abiertas_mendoza_ocds", "url": "https://datosabiertos-compras.mendoza.gov.ar/datosabiertos/", "active": True, "schedule": "0 10 * * 1-5", "selectors": {"scraper_type": "contrataciones_abiertas_mza"}, "source_type": "api", "max_items": 200, "wait_time": 1.0, "scope": "ar_nacional"},
            {"name": "banco_mundial_argentina", "url": "https://search.worldbank.org/api/v2/procnotices", "active": True, "schedule": "0 7 * * 1-5", "selectors": {"scraper_type": "banco_mundial"}, "source_type": "api", "max_items": 100, "wait_time": 2.0, "scope": "ar_nacional"},
            {"name": "bid_procurement_argentina", "url": "https://data.iadb.org/dataset/project-procurement-bidding-notices-and-notification-of-contract-awards", "active": True, "schedule": "0 7 * * 1-5", "selectors": {"resource_id": "856aabfd-2c6a-48fb-a8b8-19f3ff443618", "scraper_type": "bid"}, "source_type": "api", "max_items": 100, "wait_time": 2.0, "scope": "ar_nacional"},
            {"name": "santa_fe_compras", "url": "https://www.santafe.gov.ar/index.php/guia/portal_compras", "active": True, "schedule": "0 8,14 * * 1-5", "selectors": {"rss_url": "https://www.santafe.gov.ar/index.php/guia/portal_compras?pagina=rss", "cartelera_url": "https://www.santafe.gov.ar/index.php/guia/portal_compras", "scraper_type": "santa_fe"}, "source_type": "website", "max_items": 100, "wait_time": 2.0, "scope": "ar_nacional"},
            {"name": "comprar_gob_ar_nacional", "url": "https://comprar.gob.ar/BuscarAvanzado.aspx", "active": True, "schedule": "0 8,12,18 * * 1-5", "selectors": {"title": "h1.titulo", "organization": "div.organismo", "publication_date": "div.fecha-publicacion", "opening_date": "div.fecha-apertura", "links": "table.items a.ver-detalle"}, "source_type": "website", "max_items": 100, "wait_time": 2.0, "scope": "ar_nacional"},
            {"name": "contratar_gob_ar", "url": "https://contratar.gob.ar/", "active": True, "schedule": "0 9,15 * * 1-5", "selectors": {"scraper_type": "contratar"}, "source_type": "website", "max_items": 100, "wait_time": 3.0, "scope": "ar_nacional"},
            {"name": "boletin_oficial_nacional", "url": "https://www.boletinoficial.gob.ar/seccion/tercera", "active": True, "schedule": "0 8,13 * * 1-5", "selectors": {"section_url": "https://www.boletinoficial.gob.ar/seccion/tercera", "scraper_type": "boletin_oficial_nacional"}, "source_type": "website", "max_items": 50, "wait_time": 3.0, "scope": "ar_nacional"},
            {"name": "pbac_buenos_aires", "url": "https://pbac.cgp.gba.gov.ar/", "active": True, "schedule": "0 8,14 * * 1-5", "selectors": {"scraper_type": "pbac"}, "source_type": "website", "max_items": 100, "wait_time": 3.0, "scope": "ar_nacional"},
            {"name": "gcba_bac_compras", "url": "https://buenosaires.gob.ar/jefaturadegabinete/compras-y-contrataciones", "active": False, "schedule": "0 9,15 * * 1-5", "selectors": {"scraper_type": "generic_html", "links": "a[href*='licitacion'], a[href*='contratacion']", "title": "h1, h2.titulo", "organization": "div.organismo, div.reparticion"}, "source_type": "website", "max_items": 100, "wait_time": 3.0, "scope": "ar_nacional"},
        ]
        now = dt_seed.utcnow()
        created_count = 0
        updated_count = 0
        for src in AR_SOURCES:
            existing = await database.scraper_configs.find_one({"name": src["name"]})
            if existing:
                await database.scraper_configs.update_one(
                    {"name": src["name"]},
                    {"$set": {**src, "updated_at": now}},
                )
                updated_count += 1
            else:
                src.update({"created_at": now, "updated_at": now, "runs_count": 0, "last_run": None, "headers": {}, "cookies": {}})
                await database.scraper_configs.insert_one(src)
                created_count += 1
        logger.info(f"AR scraper configs: {created_count} created, {updated_count} patched (scope field ensured)")
    except Exception as e:
        logger.error(f"Failed to auto-seed AR sources: {e}")

    # Ensure indexes are created
    try:
        from db.repositories import LicitacionRepository, ScraperConfigRepository
        lic_repo = LicitacionRepository(database)
        scraper_repo = ScraperConfigRepository(database)
        await lic_repo.ensure_indexes()
        await scraper_repo.ensure_indexes()
        logger.info("MongoDB indexes ensured")
    except Exception as e:
        logger.error(f"Failed to create indexes: {e}")

    # Initialize and start scheduler automatically
    try:
        from services.scheduler_service import get_scheduler_service
        scheduler_service = get_scheduler_service(database)
        await scheduler_service.initialize()
        await scheduler_service.load_and_schedule_scrapers()
        scheduler_service.start()
        logger.info("Scheduler initialized and started automatically")

        # Schedule daily storage cleanup at 3am
        from services.storage_cleanup_service import get_cleanup_service
        cleanup_service = get_cleanup_service(database)
        from apscheduler.triggers.cron import CronTrigger
        scheduler_service.scheduler.add_job(
            func=cleanup_service.run_cleanup,
            trigger=CronTrigger(hour=3, minute=0),
            id="storage_cleanup",
            name="Daily storage cleanup",
            replace_existing=True,
        )
        logger.info("Daily storage cleanup scheduled at 3:00 AM")

        # Schedule daily auto-update at 8am
        from services.auto_update_service import get_auto_update_service
        auto_update_service = get_auto_update_service(database)
        scheduler_service.scheduler.add_job(
            func=auto_update_service.run_auto_update,
            trigger=CronTrigger(hour=8, minute=0),
            id="auto_update_active",
            name="Auto-update active licitaciones",
            replace_existing=True,
            max_instances=1,
        )
        logger.info("Auto-update of active licitaciones scheduled at 8:00 AM")

        # Schedule enrichment cron every 30 minutes
        from services.enrichment_cron_service import get_enrichment_cron_service
        from apscheduler.triggers.interval import IntervalTrigger
        enrichment_cron = get_enrichment_cron_service(database)
        scheduler_service.scheduler.add_job(
            func=enrichment_cron.run_enrichment_cycle,
            trigger=IntervalTrigger(minutes=30),
            id="enrichment_cron",
            name="Enrichment cron (L1→L2)",
            replace_existing=True,
            max_instances=1,
        )
        logger.info("Enrichment cron scheduled every 30 minutes")

        # Schedule daily notification digest at 9am
        try:
            from services.notification_service import get_notification_service
            notification_service = get_notification_service(database)
            scheduler_service.scheduler.add_job(
                func=notification_service.send_daily_digest,
                trigger=CronTrigger(hour=9, minute=0),
                id="daily_digest",
                name="Daily notification digest",
                replace_existing=True,
            )
            logger.info("Daily notification digest scheduled at 9:00 AM")
        except Exception as e:
            logger.warning(f"Notification service not configured: {e}")

        # Schedule nodo digests
        try:
            from services.nodo_digest_service import get_nodo_digest_service
            nodo_digest = get_nodo_digest_service(database)

            # Morning digest (9:15am) - daily + twice_daily
            scheduler_service.scheduler.add_job(
                func=nodo_digest.run_digest,
                args=[["daily", "twice_daily"]],
                trigger=CronTrigger(hour=9, minute=15),
                id="nodo_digest_morning",
                name="Nodo digest morning (daily + twice_daily)",
                replace_existing=True,
                max_instances=1,
            )
            # Evening digest (6pm) - twice_daily only
            scheduler_service.scheduler.add_job(
                func=nodo_digest.run_digest,
                args=[["twice_daily"]],
                trigger=CronTrigger(hour=18, minute=0),
                id="nodo_digest_evening",
                name="Nodo digest evening (twice_daily)",
                replace_existing=True,
                max_instances=1,
            )
            logger.info("Nodo digests scheduled at 9:15 AM and 6:00 PM")
        except Exception as e:
            logger.warning(f"Nodo digest service not configured: {e}")

        # Schedule daily estado update at 6:00 AM
        try:
            from services.vigencia_service import get_vigencia_service
            vigencia_service = get_vigencia_service(database)
            scheduler_service.scheduler.add_job(
                func=vigencia_service.update_estados_batch,
                trigger=CronTrigger(hour=6, minute=0),
                id="daily_estado_update",
                name="Daily estado update (mark vencidas)",
                replace_existing=True,
                max_instances=1,
            )
            logger.info("Daily estado update scheduled at 6:00 AM")
        except Exception as e:
            logger.warning(f"Vigencia service not configured: {e}")

    except Exception as e:
        logger.error(f"Failed to auto-start scheduler: {e}")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
    logger.info("Disconnected from MongoDB")

@app.get("/api/")
async def root():
    return {"message": "Welcome to Licitometro API"}

@app.get("/api/health")
async def health_check():
    try:
        # Check if MongoDB is connected
        await app.mongodb.command("ping")

        # Get basic stats
        lic_count = await app.mongodb.licitaciones.estimated_document_count()
        scraper_count = await app.mongodb.scraper_configs.count_documents({"active": True})

        from services.scheduler_service import get_scheduler_service
        scheduler_service = get_scheduler_service(database)
        scheduler_status = scheduler_service.get_status()

        return {
            "status": "healthy",
            "database": "connected",
            "licitaciones_count": lic_count,
            "active_scrapers": scraper_count,
            "scheduler": scheduler_status["running"],
            "scheduled_jobs": len(scheduler_status["jobs"]),
        }
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        raise HTTPException(status_code=500, detail="Database connection error")


@app.get("/api/meta/jurisdicciones")
async def get_jurisdicciones():
    """List distinct jurisdicciones from licitaciones (consumed by CotiZar)."""
    values = await app.mongodb.licitaciones.distinct("jurisdiccion")
    return [v for v in values if v]


@app.get("/api/meta/rubros")
async def get_rubros():
    """List rubros/categories from config (consumed by CotiZar)."""
    import json
    rubros_path = Path(__file__).parent / "config" / "rubros_comprar.json"
    try:
        with open(rubros_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data.get("rubros", [])
    except FileNotFoundError:
        # Fallback: distinct categories from DB
        values = await app.mongodb.licitaciones.distinct("category")
        return [{"id": v, "nombre": v} for v in values if v]

if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=8001, reload=True)
