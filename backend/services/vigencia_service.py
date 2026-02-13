"""
Vigencia Service - Manages licitacion lifecycle and estado transitions.

This service handles:
1. Estado computation based on business rules
2. Batch updates (daily cron to mark vencidas)
3. Prórroga detection (when opening_date changes)
"""

from datetime import datetime, timedelta
from typing import Optional
import logging
from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger("services.vigencia")


class VigenciaService:
    """Service for managing licitacion lifecycle and estado."""

    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db

    async def compute_estado(
        self,
        publication_date: Optional[datetime],
        opening_date: Optional[datetime],
        fecha_prorroga: Optional[datetime]
    ) -> str:
        """
        Compute estado based on business rules.

        Logic:
        - archivada: publication_date < 2025-01-01
        - prorrogada: opening_date < today AND fecha_prorroga > today
        - vencida: opening_date < today AND NO prórroga
        - vigente: opening_date >= today (or missing)

        Returns: "vigente" | "vencida" | "prorrogada" | "archivada"
        """
        today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)

        # Rule 1: Historical archive
        if publication_date and publication_date < datetime(2025, 1, 1):
            return "archivada"

        # Rule 2: Prórroga
        if fecha_prorroga and fecha_prorroga > today:
            return "prorrogada"

        # Rule 3: Vencida
        if opening_date and opening_date < today:
            return "vencida"

        # Rule 4: Vigente (default)
        return "vigente"

    async def update_estados_batch(self) -> int:
        """
        Update estados for ALL licitaciones based on current date.

        Use case: Daily cron to mark vencidas when opening_date passes.

        Returns: count of updated items
        """
        today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)

        # Find items with opening_date < today AND estado != vencida/archivada
        filter_query = {
            "opening_date": {"$lt": today, "$ne": None},
            "estado": {"$in": ["vigente", "prorrogada"]},
            "$or": [
                {"fecha_prorroga": {"$lt": today}},
                {"fecha_prorroga": None}
            ]
        }

        # Update to vencida
        result = await self.db.licitaciones.update_many(
            filter_query,
            {"$set": {"estado": "vencida", "updated_at": datetime.utcnow()}}
        )

        if result.modified_count > 0:
            logger.info(f"Batch update: Marked {result.modified_count} licitaciones as vencida")

        return result.modified_count

    async def detect_prorroga(
        self,
        licitacion_id: str,
        new_opening_date: datetime
    ) -> bool:
        """
        Detect if a licitacion has been extended (prórroga).

        Logic:
        - If new_opening_date > current opening_date → prórroga
        - Update opening_date, add fecha_prorroga, set estado=prorrogada

        Args:
            licitacion_id: ID of the licitacion
            new_opening_date: New opening date (from circular/addenda)

        Returns: True if prórroga detected and applied
        """
        from db.models import str_to_mongo_id

        # Fetch current record
        item = await self.db.licitaciones.find_one({"_id": str_to_mongo_id(licitacion_id)})
        if not item:
            logger.warning(f"detect_prorroga: licitacion {licitacion_id} not found")
            return False

        current_opening = item.get("opening_date")
        if current_opening and new_opening_date > current_opening:
            # Prórroga detected
            logger.info(
                f"Prórroga detected for {licitacion_id}: "
                f"{current_opening.date()} → {new_opening_date.date()}"
            )

            await self.db.licitaciones.update_one(
                {"_id": str_to_mongo_id(licitacion_id)},
                {
                    "$set": {
                        "opening_date": new_opening_date,
                        "fecha_prorroga": new_opening_date,
                        "estado": "prorrogada",
                        "updated_at": datetime.utcnow(),
                        "metadata.circular_prorroga": {
                            "old_date": current_opening,
                            "new_date": new_opening_date,
                            "detected_at": datetime.utcnow()
                        }
                    }
                }
            )
            return True

        return False

    async def recompute_all_estados(self) -> dict:
        """
        Recompute estado for ALL licitaciones based on current dates.

        Use case: After migration or manual date fixes.

        Returns: {
            "processed": int,
            "vigente": int,
            "vencida": int,
            "prorrogada": int,
            "archivada": int
        }
        """
        cursor = self.db.licitaciones.find({})
        stats = {
            "processed": 0,
            "vigente": 0,
            "vencida": 0,
            "prorrogada": 0,
            "archivada": 0
        }

        async for doc in cursor:
            pub_date = doc.get("publication_date")
            open_date = doc.get("opening_date")
            prorroga = doc.get("fecha_prorroga")

            # Compute correct estado
            nuevo_estado = await self.compute_estado(pub_date, open_date, prorroga)

            # Update if changed
            current_estado = doc.get("estado", "vigente")
            if nuevo_estado != current_estado:
                await self.db.licitaciones.update_one(
                    {"_id": doc["_id"]},
                    {"$set": {"estado": nuevo_estado, "updated_at": datetime.utcnow()}}
                )
                logger.debug(
                    f"Recomputed estado for {doc['_id']}: {current_estado} → {nuevo_estado}"
                )

            stats["processed"] += 1
            stats[nuevo_estado] += 1

        logger.info(f"Recomputed estados: {stats}")
        return stats


# Singleton pattern
_vigencia_service_instance = None


def get_vigencia_service(db: AsyncIOMotorDatabase) -> VigenciaService:
    """Get or create VigenciaService singleton."""
    global _vigencia_service_instance
    if _vigencia_service_instance is None:
        _vigencia_service_instance = VigenciaService(db)
    return _vigencia_service_instance
