# Database modules

from fastapi import Request
from motor.motor_asyncio import AsyncIOMotorDatabase


async def get_db(request: Request) -> AsyncIOMotorDatabase:
    """FastAPI dependency: returns the MongoDB database from the app state."""
    return request.app.mongodb
