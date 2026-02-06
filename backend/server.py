from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
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
from routers import licitaciones, scraper_configs, comprar, scheduler, workflow

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

# Create FastAPI app
app = FastAPI(
    title="Licitometro API",
    description="API for the Licitometro application",
    version="1.0.0",
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For development - restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# MongoDB client instance
client = AsyncIOMotorClient(MONGO_URL)
database = client[DB_NAME]

# Include routers
app.include_router(licitaciones.router)
app.include_router(scraper_configs.router)
app.include_router(comprar.router)
app.include_router(scheduler.router)
app.include_router(workflow.router)

@app.on_event("startup")
async def startup_db_client():
    # Using the same client and database for the application
    # This ensures consistency across all components
    app.mongodb_client = client
    app.mongodb = database
    logger.info(f"Connected to MongoDB at {MONGO_URL}, database: {DB_NAME}")
    
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
