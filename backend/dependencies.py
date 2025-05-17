from fastapi import Depends
from motor.motor_asyncio import AsyncIOMotorClient
import os
from .db.repositories import LicitacionRepository, ScraperConfigRepository

# Get MongoDB connection string from environment variable
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "licitaciones_db")

# MongoDB client instance
client = AsyncIOMotorClient(MONGO_URL)
database = client[DB_NAME]

# Repository instances
async def get_licitacion_repository():
    """Get the licitacion repository"""
    return LicitacionRepository(database)

async def get_scraper_config_repository():
    """Get the scraper config repository"""
    return ScraperConfigRepository(database)
