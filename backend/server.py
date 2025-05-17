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
from routers import licitaciones, scraper_configs

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

@app.on_event("startup")
async def startup_db_client():
    # Using the same client and database for the application
    # This ensures consistency across all components
    app.mongodb_client = client
    app.mongodb = database
    logger.info(f"Connected to MongoDB at {MONGO_URL}, database: {DB_NAME}")

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
        return {"status": "healthy", "database": "connected"}
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        raise HTTPException(status_code=500, detail="Database connection error")

if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=8001, reload=True)
