"""
Storage Cleanup Service.

Manages automatic cleanup of ephemeral documents:
- Old scraper run records (>30 days)
- Expired pliego URL cache entries
- Storage directory size limits
"""

import logging
import os
import json
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, Dict, Any

from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger("storage_cleanup")

# Defaults (can be overridden via env vars)
STORAGE_MAX_MB = int(os.environ.get("STORAGE_MAX_MB", "500"))
RUN_HISTORY_KEEP = int(os.environ.get("RUN_HISTORY_KEEP", "10"))
CACHE_TTL_HOURS = int(os.environ.get("CACHE_TTL_HOURS", "168"))  # 7 days
LOG_RETENTION_DAYS = int(os.environ.get("LOG_RETENTION_DAYS", "7"))

STORAGE_DIR = Path(__file__).parent.parent / "storage"


class StorageCleanupService:
    """Service for cleaning up ephemeral storage and old records."""

    def __init__(self, database: AsyncIOMotorDatabase):
        self.db = database

    async def run_cleanup(self) -> Dict[str, Any]:
        """Run all cleanup tasks. Returns summary of actions taken."""
        results = {}

        results["old_runs"] = await self._cleanup_old_runs()
        results["cache"] = self._cleanup_expired_cache()
        results["storage_files"] = self._cleanup_old_files()
        results["storage_mb"] = self._get_storage_size_mb()

        logger.info(f"Cleanup completed: {results}")
        return results

    async def _cleanup_old_runs(self) -> Dict[str, int]:
        """Keep only the last N runs per scraper and remove runs older than 30 days."""
        runs_collection = self.db.scraper_runs
        deleted_count = 0

        # Delete runs older than 30 days
        cutoff = datetime.utcnow() - timedelta(days=30)
        result = await runs_collection.delete_many({"started_at": {"$lt": cutoff}})
        deleted_count += result.deleted_count

        # Per scraper: keep only the last RUN_HISTORY_KEEP runs
        pipeline = [
            {"$group": {"_id": "$scraper_name", "count": {"$sum": 1}}}
        ]
        scraper_counts = await runs_collection.aggregate(pipeline).to_list(length=100)

        trimmed = 0
        for sc in scraper_counts:
            name = sc["_id"]
            if sc["count"] > RUN_HISTORY_KEEP:
                # Find the Nth newest run's started_at
                cursor = runs_collection.find(
                    {"scraper_name": name}
                ).sort("started_at", -1).skip(RUN_HISTORY_KEEP).limit(1)
                oldest_to_keep = await cursor.to_list(length=1)
                if oldest_to_keep:
                    threshold = oldest_to_keep[0].get("started_at")
                    if threshold:
                        res = await runs_collection.delete_many({
                            "scraper_name": name,
                            "started_at": {"$lt": threshold}
                        })
                        trimmed += res.deleted_count

        return {"old_deleted": deleted_count, "trimmed": trimmed}

    def _cleanup_expired_cache(self) -> Dict[str, int]:
        """Remove expired entries from the pliego URL cache."""
        cache_file = STORAGE_DIR / "pliego_url_cache.json"
        if not cache_file.exists():
            return {"expired_removed": 0}

        try:
            with open(cache_file, "r", encoding="utf-8") as f:
                cache = json.load(f)
        except Exception:
            return {"expired_removed": 0}

        now = datetime.utcnow()
        ttl = timedelta(hours=CACHE_TTL_HOURS)
        expired_keys = []
        for key, entry in cache.items():
            try:
                ts = datetime.fromisoformat(entry["timestamp"])
                if now - ts > ttl:
                    expired_keys.append(key)
            except (KeyError, ValueError):
                expired_keys.append(key)

        for key in expired_keys:
            del cache[key]

        if expired_keys:
            try:
                with open(cache_file, "w", encoding="utf-8") as f:
                    json.dump(cache, f, ensure_ascii=False, indent=2)
            except Exception as e:
                logger.error(f"Error saving cleaned cache: {e}")

        return {"expired_removed": len(expired_keys)}

    def _cleanup_old_files(self) -> Dict[str, int]:
        """Remove old log files and run JSON files from storage."""
        if not STORAGE_DIR.exists():
            return {"files_removed": 0}

        removed = 0
        cutoff = datetime.utcnow() - timedelta(days=LOG_RETENTION_DAYS)

        for f in STORAGE_DIR.iterdir():
            if not f.is_file():
                continue
            # Skip the pliego cache
            if f.name == "pliego_url_cache.json":
                continue
            # Check if file is old enough to remove
            try:
                mtime = datetime.fromtimestamp(f.stat().st_mtime)
                if mtime < cutoff:
                    f.unlink()
                    removed += 1
            except Exception as e:
                logger.warning(f"Could not remove {f}: {e}")

        return {"files_removed": removed}

    def _get_storage_size_mb(self) -> float:
        """Get total size of storage directory in MB."""
        if not STORAGE_DIR.exists():
            return 0.0

        total = 0
        for f in STORAGE_DIR.rglob("*"):
            if f.is_file():
                total += f.stat().st_size

        return round(total / (1024 * 1024), 2)


# Singleton
_cleanup_service: Optional[StorageCleanupService] = None


def get_cleanup_service(database: AsyncIOMotorDatabase) -> StorageCleanupService:
    global _cleanup_service
    if _cleanup_service is None:
        _cleanup_service = StorageCleanupService(database)
    return _cleanup_service
