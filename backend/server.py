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
from routers import licitaciones, scraper_configs, comprar, scheduler, workflow, offer_templates, auth, public, nodos
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
async def auth_middleware(request: Request, call_next):
    """Require authentication for all API routes except exempt ones."""
    path = request.url.path

    # Skip auth for non-API routes, exempt paths, and public API
    if not path.startswith("/api") or path in AUTH_EXEMPT_PATHS or path.startswith("/api/public/"):
        return await call_next(request)

    token = request.cookies.get("access_token")
    if not token or not verify_token(token):
        return JSONResponse(
            status_code=401,
            content={"detail": "Not authenticated"},
        )

    return await call_next(request)


# MongoDB client instance
client = AsyncIOMotorClient(MONGO_URL)
database = client[DB_NAME]

# Include routers
app.include_router(auth.router)
app.include_router(licitaciones.router)
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

if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=8001, reload=True)
