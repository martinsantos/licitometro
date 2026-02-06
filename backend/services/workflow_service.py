"""
Workflow Service - State machine for licitacion offer workflow.

States:
  descubierta -> evaluando -> preparando -> presentada
  Any active state -> descartada (terminal)
  presentada and descartada are terminal states.
"""

import logging
from datetime import datetime
from typing import Optional, Dict, Any, List

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from models.licitacion import WORKFLOW_TRANSITIONS, WORKFLOW_STATES

logger = logging.getLogger("workflow_service")


class WorkflowService:
    """Manages workflow state transitions for licitaciones."""

    def __init__(self, database: AsyncIOMotorDatabase):
        self.db = database
        self.collection = database["licitaciones"]

    async def transition(self, lic_id: str, new_state: str, notes: str = "") -> Dict[str, Any]:
        """Transition a licitacion to a new workflow state.

        Returns dict with success status and updated licitacion data.
        Raises ValueError for invalid transitions.
        """
        if new_state not in WORKFLOW_STATES:
            raise ValueError(f"Invalid state: {new_state}. Must be one of {WORKFLOW_STATES}")

        # Get current licitacion
        query_id = lic_id
        try:
            query_id = ObjectId(lic_id)
        except Exception:
            pass

        lic = await self.collection.find_one({"_id": query_id})
        if not lic:
            raise ValueError(f"Licitacion not found: {lic_id}")

        current_state = lic.get("workflow_state", "descubierta")
        allowed = WORKFLOW_TRANSITIONS.get(current_state, [])

        if new_state not in allowed:
            raise ValueError(
                f"Cannot transition from '{current_state}' to '{new_state}'. "
                f"Allowed transitions: {allowed}"
            )

        # Build history entry
        history_entry = {
            "from_state": current_state,
            "to_state": new_state,
            "timestamp": datetime.utcnow().isoformat(),
            "notes": notes,
        }

        # Update in DB
        result = await self.collection.update_one(
            {"_id": query_id},
            {
                "$set": {
                    "workflow_state": new_state,
                    "updated_at": datetime.utcnow(),
                },
                "$push": {"workflow_history": history_entry},
            },
        )

        if result.modified_count == 0:
            raise ValueError("Failed to update workflow state")

        logger.info(f"Licitacion {lic_id}: {current_state} -> {new_state}")
        return {
            "success": True,
            "lic_id": lic_id,
            "previous_state": current_state,
            "new_state": new_state,
            "history_entry": history_entry,
        }

    async def get_history(self, lic_id: str) -> List[Dict[str, Any]]:
        """Get workflow history for a licitacion."""
        query_id = lic_id
        try:
            query_id = ObjectId(lic_id)
        except Exception:
            pass

        lic = await self.collection.find_one({"_id": query_id}, {"workflow_history": 1, "workflow_state": 1})
        if not lic:
            return []

        return {
            "current_state": lic.get("workflow_state", "descubierta"),
            "history": lic.get("workflow_history", []),
        }

    async def get_summary(self) -> Dict[str, int]:
        """Get count of licitaciones by workflow state."""
        pipeline = [
            {
                "$group": {
                    "_id": {"$ifNull": ["$workflow_state", "descubierta"]},
                    "count": {"$sum": 1},
                }
            }
        ]
        results = await self.collection.aggregate(pipeline).to_list(length=20)
        summary = {state: 0 for state in WORKFLOW_STATES}
        for r in results:
            state = r["_id"]
            if state in summary:
                summary[state] = r["count"]
        return summary


# Singleton
_workflow_service: Optional[WorkflowService] = None


def get_workflow_service(database: AsyncIOMotorDatabase) -> WorkflowService:
    global _workflow_service
    if _workflow_service is None:
        _workflow_service = WorkflowService(database)
    return _workflow_service
