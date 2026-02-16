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
from db.models import licitacion_entity, licitaciones_entity, scraper_config_entity, scraper_configs_entity, str_to_mongo_id


class LicitacionRepository:
    def __init__(self, db):
        self.db = db
        self.collection = db["licitaciones"]

    async def ensure_indexes(self):
        """Create indexes — must be awaited from startup.
        NOTE: The text index is managed by scripts/migrate_text_index.py (v3).
        Do NOT create a text index here — it would overwrite the expanded one."""
        await self.collection.create_index("organization")
        await self.collection.create_index("publication_date")
        await self.collection.create_index("status")
        await self.collection.create_index("location")
        await self.collection.create_index("category")
        await self.collection.create_index("fuente")
        await self.collection.create_index("workflow_state")
        await self.collection.create_index("enrichment_level")
        await self.collection.create_index([("publication_date", pymongo.DESCENDING), ("opening_date", pymongo.DESCENDING)])
        await self.collection.create_index([("workflow_state", 1), ("opening_date", 1)])
        await self.collection.create_index("created_at")
        await self.collection.create_index("fecha_scraping")
        await self.collection.create_index("nodos")
    
    async def create(self, licitacion: LicitacionCreate) -> Licitacion:
        """Create a new licitacion with auto-classification"""
        licitacion_dict = licitacion.model_dump()
        # Convert HttpUrl to str for BSON compatibility
        for url_field in ("source_url", "canonical_url"):
            if licitacion_dict.get(url_field) is not None:
                licitacion_dict[url_field] = str(licitacion_dict[url_field])
        licitacion_dict["_id"] = uuid4()
        licitacion_dict["created_at"] = datetime.utcnow()
        licitacion_dict["updated_at"] = datetime.utcnow()

        # Auto-classify if no category set
        if not licitacion_dict.get("category"):
            try:
                from services.category_classifier import classify_licitacion
                category = classify_licitacion(licitacion_dict)
                if category:
                    licitacion_dict["category"] = category
            except Exception:
                pass

        await self.collection.insert_one(licitacion_dict)
        return licitacion_entity(licitacion_dict)
    
    async def get_all(self, skip: int = 0, limit: int = 100, filters: Dict = None,
                      sort_by: str = "publication_date", sort_order: int = pymongo.DESCENDING,
                      nulls_last: bool = False) -> List[Licitacion]:
        """Get all licitaciones with optional filtering and sorting.

        When nulls_last=True, records where sort_by field is null are pushed to the end.
        """
        query = filters or {}

        # Ensure sort_by is a valid field to prevent injection/errors
        if sort_by not in Licitacion.model_fields and sort_by != "_id":
            sort_by = "publication_date"

        if nulls_last:
            if sort_by == "budget":
                # Budget sort: group by currency (USD first), then by amount, nulls last
                pipeline = [
                    {"$match": query},
                    {"$addFields": {
                        "_has_sort_field": {"$cond": [{"$ifNull": ["$budget", False]}, 0, 1]},
                        "_currency_order": {"$cond": [{"$eq": ["$currency", "USD"]}, 0, 1]},
                    }},
                    {"$sort": {"_has_sort_field": 1, "_currency_order": 1, "budget": sort_order}},
                    {"$skip": skip},
                    {"$limit": limit},
                    {"$project": {"_has_sort_field": 0, "_currency_order": 0}},
                ]
            else:
                # Generic nulls-last sort
                pipeline = [
                    {"$match": query},
                    {"$addFields": {
                        "_has_sort_field": {"$cond": [{"$ifNull": [f"${sort_by}", False]}, 0, 1]}
                    }},
                    {"$sort": {"_has_sort_field": 1, sort_by: sort_order}},
                    {"$skip": skip},
                    {"$limit": limit},
                    {"$project": {"_has_sort_field": 0}},
                ]
            licitaciones = await self.collection.aggregate(pipeline).to_list(length=limit)
        else:
            cursor = self.collection.find(query).sort(sort_by, sort_order).skip(skip).limit(limit)
            licitaciones = await cursor.to_list(length=limit)

        return licitaciones_entity(licitaciones)
    
    async def get_by_id(self, id) -> Optional[Licitacion]:
        """Get a licitacion by id"""
        query_id = id
        if isinstance(id, str):
            try:
                query_id = ObjectId(id)
            except Exception:
                pass
        licitacion = await self.collection.find_one({"_id": query_id})
        if licitacion:
            return licitacion_entity(licitacion)
        return None
    
    async def update(self, id, licitacion: LicitacionUpdate) -> Optional[Licitacion]:
        """Update a licitacion"""
        update_data = {k: v for k, v in licitacion.model_dump().items() if v is not None}
        update_data["updated_at"] = datetime.utcnow()
        
        if update_data:
            query_id = id
            if isinstance(id, str):
                try:
                    query_id = ObjectId(id)
                except Exception:
                    pass
            result = await self.collection.update_one(
                {"_id": query_id},
                {"$set": update_data}
            )
            if result.modified_count:
                return await self.get_by_id(query_id)
        return None
    
    async def delete(self, id) -> bool:
        """Delete a licitacion"""
        query_id = id
        if isinstance(id, str):
            try:
                query_id = ObjectId(id)
            except Exception:
                pass
        result = await self.collection.delete_one({"_id": query_id})
        return result.deleted_count > 0
    
    def _build_regex_query(self, query: str, extra_filters: Dict = None) -> Dict:
        """Build an accent-agnostic regex search query across all relevant fields."""
        from utils.text_search import build_accent_regex

        tokens = query.strip().split()
        regex_fields = [
            "title", "objeto", "description", "organization",
            "expedient_number", "licitacion_number",
            "category", "keywords", "jurisdiccion", "fuente",
        ]

        token_conditions = []
        for token in tokens:
            accent_pattern = build_accent_regex(token)
            field_or = [
                {field: {"$regex": accent_pattern, "$options": "i"}}
                for field in regex_fields
            ]
            token_conditions.append({"$or": field_or})

        if not token_conditions:
            return extra_filters or {}

        regex_q = {"$and": token_conditions} if len(token_conditions) > 1 else token_conditions[0]
        if extra_filters:
            return {"$and": [regex_q, extra_filters]}
        return regex_q

    async def search(self, query: str, skip: int = 0, limit: int = 100,
                     sort_by: str = "publication_date", sort_order: int = pymongo.DESCENDING,
                     extra_filters: Dict = None) -> List[Licitacion]:
        """Hybrid search: $text + accent-agnostic regex, merged and deduped."""

        if sort_by not in Licitacion.model_fields and sort_by != "_id":
            sort_by = "publication_date"

        seen_ids = set()
        combined = []
        fetch_limit = limit + skip

        # --- Phase 1: MongoDB $text search (fast, indexed, Spanish stemming) ---
        text_query = {"$text": {"$search": query}}
        if extra_filters:
            text_query.update(extra_filters)
        try:
            cursor = self.collection.find(text_query).sort(sort_by, sort_order).limit(fetch_limit)
            for doc in await cursor.to_list(length=fetch_limit):
                if doc["_id"] not in seen_ids:
                    combined.append(doc)
                    seen_ids.add(doc["_id"])
        except Exception:
            pass

        # --- Phase 2: Regex (accent-agnostic, searches objeto + 9 more fields) ---
        regex_query = self._build_regex_query(query, extra_filters)
        if regex_query and len(combined) < fetch_limit:
            remaining = fetch_limit - len(combined)
            regex_cursor = self.collection.find(regex_query).sort(sort_by, sort_order).limit(fetch_limit)
            for doc in await regex_cursor.to_list(length=fetch_limit):
                if doc["_id"] not in seen_ids:
                    combined.append(doc)
                    seen_ids.add(doc["_id"])
                    if len(combined) >= fetch_limit:
                        break

        return licitaciones_entity(combined[skip:skip + limit])

    async def search_count(self, query: str, extra_filters: Dict = None) -> int:
        """Count results for hybrid search (max of $text and regex counts)."""

        text_count = 0
        try:
            text_query = {"$text": {"$search": query}}
            if extra_filters:
                text_query.update(extra_filters)
            text_count = await self.collection.count_documents(text_query)
        except Exception:
            pass

        regex_query = self._build_regex_query(query, extra_filters)
        regex_count = 0
        if regex_query:
            regex_count = await self.collection.count_documents(regex_query)

        return max(text_count, regex_count)
    
    async def count(self, filters: Dict = None) -> int:
        """Count licitaciones with optional filtering"""
        query = filters or {}
        return await self.collection.count_documents(query)

    async def get_distinct(self, field_name: str, only_national: bool = False) -> List[str]:
        """Get distinct values for a given field, optionally filtered by jurisdiction"""
        # Ensure the field exists and is safe to query for distinct values
        # This is a basic check; more robust validation might be needed
        # depending on the data model and security requirements.
        if field_name not in Licitacion.model_fields:
             # Or LicitacionCreate.model_fields depending on what fields are filterable
            raise ValueError(f"Field '{field_name}' is not a valid field for distinct query.")

        # Build filter query
        match_filter = {}
        if only_national:
            match_filter["jurisdiccion"] = "Argentina"
        else:
            # Exclude Argentina LIC_AR items when showing Mendoza sources
            match_filter["tags"] = {"$ne": "LIC_AR"}

        values = await self.collection.distinct(field_name, match_filter)
        # Filter out None or empty string values if necessary
        return [value for value in values if value]

    async def get_active_for_update(self) -> List[dict]:
        """Get licitaciones with active workflow states and future opening dates for auto-update."""
        now = datetime.utcnow()
        query = {
            "workflow_state": {"$in": ["evaluando", "preparando"]},
            "$or": [
                {"opening_date": {"$gte": now}},
                {"opening_date": None}
            ]
        }
        cursor = self.collection.find(query)
        licitaciones = await cursor.to_list(length=100)
        return licitaciones_entity(licitaciones)


class ScraperConfigRepository:
    def __init__(self, db):
        self.db = db
        self.collection = db["scraper_configs"]

    async def ensure_indexes(self):
        """Create indexes — must be awaited from startup."""
        await self.collection.create_index("name", unique=True)
        await self.collection.create_index("url")
        await self.collection.create_index("active")
    
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
    
    async def get_by_id(self, id) -> Optional[ScraperConfig]:
        """Get a scraper configuration by id"""
        query_id = str_to_mongo_id(id) if isinstance(id, str) else id
        config = await self.collection.find_one({"_id": query_id})
        if config:
            return scraper_config_entity(config)
        return None
    
    async def get_by_name(self, name: str) -> Optional[ScraperConfig]:
        """Get a scraper configuration by name"""
        config = await self.collection.find_one({"name": name})
        if config:
            return scraper_config_entity(config)
        return None
    
    async def update(self, id, config: ScraperConfigUpdate) -> Optional[ScraperConfig]:
        """Update a scraper configuration"""
        update_data = {k: v for k, v in config.model_dump().items() if v is not None}
        update_data["updated_at"] = datetime.utcnow()
        
        if update_data:
            query_id = str_to_mongo_id(id) if isinstance(id, str) else id
            result = await self.collection.update_one(
                {"_id": query_id},
                {"$set": update_data}
            )
            if result.modified_count:
                return await self.get_by_id(id)
        return None

    async def delete(self, id) -> bool:
        """Delete a scraper configuration"""
        query_id = str_to_mongo_id(id) if isinstance(id, str) else id
        result = await self.collection.delete_one({"_id": query_id})
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
