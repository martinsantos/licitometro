from datetime import datetime
from typing import List, Dict, Any, Optional
from uuid import UUID, uuid4
import pymongo
from bson import ObjectId
import sys
from pathlib import Path

# Add parent directory to path so we can import modules
sys.path.insert(0, str(Path(__file__).parent.parent))

from models.licitacion import Licitacion, LicitacionCreate, LicitacionUpdate
from models.scraper_config import ScraperConfig, ScraperConfigCreate, ScraperConfigUpdate
from db.models import licitacion_entity, licitaciones_entity, scraper_config_entity, scraper_configs_entity


class LicitacionRepository:
    def __init__(self, db):
        self.db = db
        self.collection = db["licitaciones"]
        
        # Ensure indexes for better performance
        self.collection.create_index([("title", pymongo.TEXT), ("description", pymongo.TEXT)])
        self.collection.create_index("organization")
        self.collection.create_index("publication_date")
        self.collection.create_index("status")
        self.collection.create_index("location")
        self.collection.create_index("category")
        self.collection.create_index("fuente") # Added index for fuente
    
    async def create(self, licitacion: LicitacionCreate) -> Licitacion:
        """Create a new licitacion"""
        licitacion_dict = licitacion.model_dump()
        licitacion_dict["_id"] = uuid4()
        licitacion_dict["created_at"] = datetime.utcnow()
        licitacion_dict["updated_at"] = datetime.utcnow()
        
        await self.collection.insert_one(licitacion_dict)
        return licitacion_entity(licitacion_dict)
    
    async def get_all(self, skip: int = 0, limit: int = 100, filters: Dict = None) -> List[Licitacion]:
        """Get all licitaciones with optional filtering"""
        query = filters or {}
        cursor = self.collection.find(query).skip(skip).limit(limit)
        cursor = cursor.sort("publication_date", pymongo.DESCENDING)
        
        licitaciones = await cursor.to_list(length=limit)
        return licitaciones_entity(licitaciones)
    
    async def get_by_id(self, id: UUID) -> Optional[Licitacion]:
        """Get a licitacion by id"""
        licitacion = await self.collection.find_one({"_id": id})
        if licitacion:
            return licitacion_entity(licitacion)
        return None
    
    async def update(self, id: UUID, licitacion: LicitacionUpdate) -> Optional[Licitacion]:
        """Update a licitacion"""
        update_data = {k: v for k, v in licitacion.model_dump().items() if v is not None}
        update_data["updated_at"] = datetime.utcnow()
        
        if update_data:
            result = await self.collection.update_one(
                {"_id": id},
                {"$set": update_data}
            )
            if result.modified_count:
                return await self.get_by_id(id)
        return None
    
    async def delete(self, id: UUID) -> bool:
        """Delete a licitacion"""
        result = await self.collection.delete_one({"_id": id})
        return result.deleted_count > 0
    
    async def search(self, query: str, skip: int = 0, limit: int = 100) -> List[Licitacion]:
        """Search licitaciones by text"""
        cursor = self.collection.find(
            {"$text": {"$search": query}}
        ).skip(skip).limit(limit)
        
        licitaciones = await cursor.to_list(length=limit)
        return licitaciones_entity(licitaciones)
    
    async def count(self, filters: Dict = None) -> int:
        """Count licitaciones with optional filtering"""
        query = filters or {}
        return await self.collection.count_documents(query)

    async def get_distinct(self, field_name: str) -> List[str]:
        """Get distinct values for a given field"""
        # Ensure the field exists and is safe to query for distinct values
        # This is a basic check; more robust validation might be needed
        # depending on the data model and security requirements.
        if field_name not in Licitacion.model_fields:
             # Or LicitacionCreate.model_fields depending on what fields are filterable
            raise ValueError(f"Field '{field_name}' is not a valid field for distinct query.")

        values = await self.collection.distinct(field_name)
        # Filter out None or empty string values if necessary
        return [value for value in values if value]


class ScraperConfigRepository:
    def __init__(self, db):
        self.db = db
        self.collection = db["scraper_configs"]
        
        # Ensure indexes for better performance
        self.collection.create_index("name", unique=True)
        self.collection.create_index("url")
        self.collection.create_index("active")
    
    async def create(self, config: ScraperConfigCreate) -> ScraperConfig:
        """Create a new scraper configuration"""
        config_dict = config.model_dump()
        config_dict["_id"] = uuid4()
        config_dict["created_at"] = datetime.utcnow()
        config_dict["updated_at"] = datetime.utcnow()
        config_dict["last_run"] = None
        config_dict["runs_count"] = 0
        
        await self.collection.insert_one(config_dict)
        return scraper_config_entity(config_dict)
    
    async def get_all(self, skip: int = 0, limit: int = 100, active_only: bool = False) -> List[ScraperConfig]:
        """Get all scraper configurations"""
        query = {"active": True} if active_only else {}
        cursor = self.collection.find(query).skip(skip).limit(limit)
        
        configs = await cursor.to_list(length=limit)
        return scraper_configs_entity(configs)
    
    async def get_by_id(self, id: UUID) -> Optional[ScraperConfig]:
        """Get a scraper configuration by id"""
        config = await self.collection.find_one({"_id": id})
        if config:
            return scraper_config_entity(config)
        return None
    
    async def get_by_name(self, name: str) -> Optional[ScraperConfig]:
        """Get a scraper configuration by name"""
        config = await self.collection.find_one({"name": name})
        if config:
            return scraper_config_entity(config)
        return None
    
    async def update(self, id: UUID, config: ScraperConfigUpdate) -> Optional[ScraperConfig]:
        """Update a scraper configuration"""
        update_data = {k: v for k, v in config.model_dump().items() if v is not None}
        update_data["updated_at"] = datetime.utcnow()
        
        if update_data:
            result = await self.collection.update_one(
                {"_id": id},
                {"$set": update_data}
            )
            if result.modified_count:
                return await self.get_by_id(id)
        return None
    
    async def delete(self, id: UUID) -> bool:
        """Delete a scraper configuration"""
        result = await self.collection.delete_one({"_id": id})
        return result.deleted_count > 0
    
    async def update_last_run(self, id: UUID) -> None:
        """Update the last run time and increment runs count"""
        await self.collection.update_one(
            {"_id": id},
            {
                "$set": {"last_run": datetime.utcnow()},
                "$inc": {"runs_count": 1}
            }
        )
