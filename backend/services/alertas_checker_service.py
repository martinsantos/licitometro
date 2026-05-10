"""
AlertasCheckerService — check new licitaciones against active alertas and send notifications.

Called from scheduler/scraper pipeline after inserting new licitaciones.
Rate-limit: skip alerta if ultima_notificacion was < 1 hour ago.
"""
from __future__ import annotations

import logging
import re
from datetime import timedelta
from typing import Any, Dict, List, Optional

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from utils.time import utc_now

logger = logging.getLogger("alertas_checker_service")

BASE_URL = "https://licitometro.ar/licitaciones"


def _build_alerta_query(alerta: Dict[str, Any]) -> Dict[str, Any]:
    """Build a MongoDB query dict from an alerta config document.
    Mirrors logic in routers/alertas.py — kept in sync manually.
    """
    query: Dict[str, Any] = {}

    keywords = alerta.get("keywords", "").strip()
    if keywords:
        query["$text"] = {"$search": keywords}

    presupuesto_min = alerta.get("presupuesto_min")
    presupuesto_max = alerta.get("presupuesto_max")
    if presupuesto_min is not None or presupuesto_max is not None:
        budget_filter: Dict[str, float] = {}
        if presupuesto_min is not None:
            budget_filter["$gte"] = presupuesto_min
        if presupuesto_max is not None:
            budget_filter["$lte"] = presupuesto_max
        query["budget"] = budget_filter

    fuente = alerta.get("fuente")
    if fuente:
        query["fuente"] = {"$regex": f"^{re.escape(fuente)}$", "$options": "i"}

    organization = alerta.get("organization")
    if organization:
        query["organization"] = {"$regex": re.escape(organization), "$options": "i"}

    nodos = alerta.get("nodos") or []
    if nodos:
        query["nodos"] = {"$in": nodos}

    if alerta.get("score_minimo") is not None:
        query["requisitos"] = {"$exists": True}

    return query


def _format_budget(budget: Optional[float]) -> str:
    if budget is None:
        return "S/P"
    if budget >= 1_000_000:
        return f"${budget / 1_000_000:.1f}M"
    if budget >= 1_000:
        return f"${budget / 1_000:.0f}K"
    return f"${budget:.0f}"


def _requirements_line(requisitos: Optional[Dict[str, Any]]) -> str:
    requisitos = requisitos or {}
    if not requisitos:
        return ""
    parts = []
    if requisitos.get("source") == "ai_extraction_v2":
        parts.append("AI 0.2")
    red_flags = requisitos.get("red_flags") or []
    if red_flags:
        parts.append(f"{len(red_flags)} riesgo(s)")
    docs = requisitos.get("documentacion_requerida") or []
    if docs:
        parts.append(f"{len(docs)} doc(s)")
    return " · ".join(parts)


class AlertasCheckerService:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db

    async def run_check_cycle(self) -> Dict[str, Any]:
        """Cron entry point: check recent licitaciones against active alertas.

        Queries licitaciones with fecha_scraping within the last 15 minutes
        and passes their IDs to check_new_licitaciones.
        """
        now = utc_now()
        cutoff = now - timedelta(minutes=15)
        recent_ids = await self.db.licitaciones.find(
            {"fecha_scraping": {"$gte": cutoff}},
            {"_id": 1},
        ).to_list(length=1000)

        str_ids = [str(doc["_id"]) for doc in recent_ids]
        logger.info(f"alertas_checker cron: {len(str_ids)} recent licitaciones to check")
        return await self.check_new_licitaciones(str_ids)

    async def check_new_licitaciones(self, new_licitacion_ids: List[str]) -> Dict[str, Any]:
        """
        For each active alerta, check if any of the new licitaciones match.
        Sends a Telegram notification for each alerta with matches.

        Args:
            new_licitacion_ids: List of string IDs of newly inserted licitaciones.

        Returns:
            Summary dict with counts of alertas checked and notifications sent.
        """
        if not new_licitacion_ids:
            return {"alertas_checked": 0, "notifications_sent": 0}

        # Convert IDs to ObjectIds — skip malformed ones
        oids: List[ObjectId] = []
        for sid in new_licitacion_ids:
            try:
                oids.append(ObjectId(sid))
            except Exception:
                logger.warning(f"alertas_checker: invalid ObjectId skipped: {sid!r}")

        if not oids:
            return {"alertas_checked": 0, "notifications_sent": 0}

        # Fetch the new licitaciones once (projection for notification rendering)
        new_docs = await self.db.licitaciones.find(
            {"_id": {"$in": oids}},
            {"title": 1, "objeto": 1, "organization": 1, "budget": 1, "nodos": 1,
             "fuente": 1, "tags": 1, "requisitos": 1},
        ).to_list(length=len(oids))

        if not new_docs:
            return {"alertas_checked": 0, "notifications_sent": 0}

        # Fetch all active alertas
        alertas = await self.db.alertas_personalizadas.find(
            {"activa": True}
        ).to_list(length=500)

        if not alertas:
            return {"alertas_checked": 0, "notifications_sent": 0}

        now = utc_now()
        one_hour_ago = now - timedelta(hours=1)

        notifications_sent = 0

        for alerta in alertas:
            alerta_id = alerta["_id"]
            nombre = alerta.get("nombre", "Sin nombre")

            # Rate-limit: skip if notified less than 1 hour ago
            ultima = alerta.get("ultima_notificacion")
            if ultima and ultima.tzinfo is None:
                # naive datetime — treat as UTC for comparison
                from datetime import timezone
                ultima = ultima.replace(tzinfo=timezone.utc)
            if ultima and ultima > one_hour_ago:
                logger.debug(f"alertas_checker: skipping alerta '{nombre}' (rate limited)")
                continue

            # Build the alerta query restricted to these new licitaciones
            alerta_query = _build_alerta_query(alerta)
            alerta_query["_id"] = {"$in": oids}

            try:
                if "$text" in alerta_query:
                    matched = await self.db.licitaciones.find(
                        alerta_query,
                        {"title": 1, "objeto": 1, "organization": 1, "budget": 1, "requisitos": 1},
                    ).sort([("score", {"$meta": "textScore"})]).limit(10).to_list(length=10)
                else:
                    matched = await self.db.licitaciones.find(
                        alerta_query,
                        {"title": 1, "objeto": 1, "organization": 1, "budget": 1, "requisitos": 1},
                    ).limit(10).to_list(length=10)
            except Exception as e:
                logger.error(f"alertas_checker: query failed for alerta '{nombre}': {e}")
                continue

            if not matched:
                continue

            count = len(matched)
            logger.info(f"alertas_checker: alerta '{nombre}' matched {count} new licitaciones")

            # Build Telegram notification
            lines = [f"🔔 <b>Alerta: {nombre}</b>"]
            lines.append(f"{count} nueva(s) licitación(es):")
            for doc in matched[:5]:
                display = doc.get("objeto") or doc.get("title") or "Sin título"
                display = display[:80]
                org = doc.get("organization", "")[:50]
                budget_str = _format_budget(doc.get("budget"))
                lic_id = str(doc["_id"])
                lines.append(f"• {display} — {org} — {budget_str}")
                req_line = _requirements_line(doc.get("requisitos"))
                if req_line:
                    lines.append(f"  Requisitos: {req_line}")
                lines.append(f"  {BASE_URL}/{lic_id}")

            if count > 5:
                lines.append(f"... y {count - 5} más")

            message = "\n".join(lines)

            sent = await self._send_telegram(message)
            if sent:
                notifications_sent += 1
                await self.db.alertas_personalizadas.update_one(
                    {"_id": alerta_id},
                    {"$set": {"ultima_notificacion": now, "updated_at": now}},
                )

        return {
            "alertas_checked": len(alertas),
            "notifications_sent": notifications_sent,
            "new_licitaciones": len(oids),
        }

    async def _send_telegram(self, message: str) -> bool:
        """Send a Telegram message using the existing notification service pattern."""
        try:
            from services.notification_service import get_notification_service
            notif = get_notification_service(self.db)
            return await notif.send_telegram(message)
        except Exception as e:
            logger.error(f"alertas_checker: telegram send failed: {e}")
            return False


_instance: Optional[AlertasCheckerService] = None


def get_alertas_checker_service(db: AsyncIOMotorDatabase) -> AlertasCheckerService:
    global _instance
    if _instance is None:
        _instance = AlertasCheckerService(db)
    return _instance
