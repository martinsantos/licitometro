"""Operator-action reminders for offer readiness."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from utils.time import utc_now

logger = logging.getLogger("readiness_action_service")


class ReadinessActionService:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db

    async def send_overdue_digest(self, limit: int = 20) -> Dict[str, Any]:
        """Send one Telegram digest for overdue unresolved readiness actions."""

        today = utc_now().date().isoformat()
        cutoff = utc_now() - timedelta(hours=20)
        query = {
            "operator_action.resolved": {"$ne": True},
            "operator_action.due_date": {"$lt": today, "$ne": ""},
            "$or": [
                {"operator_action.overdue_alert_sent_at": {"$exists": False}},
                {"operator_action.overdue_alert_sent_at": {"$lt": cutoff}},
            ],
        }
        docs = await self.db.offer_readiness_snapshots.find(query).sort([
            ("priority_score", -1),
            ("operator_action.due_date", 1),
        ]).limit(limit).to_list(length=limit)
        if not docs:
            return {"processed": 0, "notifications_sent": 0}

        lic_ids = []
        for doc in docs:
            try:
                lic_ids.append(ObjectId(doc.get("licitacion_id")))
            except Exception:
                pass
        lic_docs = await self.db.licitaciones.find({"_id": {"$in": lic_ids}}).to_list(length=len(lic_ids)) if lic_ids else []
        lic_by_id = {str(lic["_id"]): lic for lic in lic_docs}

        lines = ["<b>Readiness 0.2: acciones vencidas</b>"]
        for doc in docs[:10]:
            action = doc.get("operator_action") or {}
            lic = lic_by_id.get(doc.get("licitacion_id")) or {}
            title = lic.get("title") or lic.get("objeto") or doc.get("licitacion_id")
            owner = action.get("owner") or "sin responsable"
            next_action = action.get("next_action") or "sin accion definida"
            lines.append(
                f"- P{doc.get('priority_score', doc.get('score', 0))} · "
                f"{action.get('due_date')} · {owner} · {title[:80]} · {next_action[:80]}"
            )

        sent = await self._send_telegram("\n".join(lines))
        if sent:
            now = utc_now()
            ids = [doc["_id"] for doc in docs if doc.get("_id")]
            await self.db.offer_readiness_snapshots.update_many(
                {"_id": {"$in": ids}},
                {"$set": {"operator_action.overdue_alert_sent_at": now}},
            )
        return {"processed": len(docs), "notifications_sent": 1 if sent else 0}

    async def send_source_coverage_digest(
        self,
        *,
        min_ai_coverage: float = 0.5,
        min_snapshot_coverage: float = 0.4,
    ) -> Dict[str, Any]:
        """Send a digest for sources with weak AI/readiness coverage."""

        try:
            from routers.scheduler import get_source_health
        except Exception as exc:
            logger.warning(f"Could not import source health endpoint: {exc}")
            return {"sources_checked": 0, "notifications_sent": 0}

        health = await get_source_health(self.db)
        weak = []
        for source in health.get("sources", []):
            readiness = source.get("readiness") or {}
            total_records = source.get("total_records") or 0
            if total_records == 0:
                continue
            ai_coverage = readiness.get("ai_coverage") or 0
            snapshot_coverage = readiness.get("snapshot_coverage") or 0
            if ai_coverage < min_ai_coverage or snapshot_coverage < min_snapshot_coverage:
                weak.append((source, ai_coverage, snapshot_coverage))

        if not weak:
            return {"sources_checked": len(health.get("sources", [])), "notifications_sent": 0}

        lines = ["<b>Readiness 0.2: cobertura baja por fuente</b>"]
        for source, ai_coverage, snapshot_coverage in weak[:10]:
            readiness = source.get("readiness") or {}
            lines.append(
                f"- {source.get('name')}: AI {ai_coverage:.0%} · "
                f"snapshots {snapshot_coverage:.0%} · "
                f"{readiness.get('ready', 0)} listas / {readiness.get('blocked', 0)} bloqueadas"
            )
        sent = await self._send_telegram("\n".join(lines))
        return {"sources_checked": len(health.get("sources", [])), "notifications_sent": 1 if sent else 0}

    async def snapshot_source_coverage(self) -> Dict[str, Any]:
        """Persist current source readiness coverage for historical governance."""

        from routers.scheduler import get_source_health

        health = await get_source_health(self.db)
        now = utc_now()
        docs = []
        for source in health.get("sources", []):
            readiness = source.get("readiness") or {}
            docs.append({
                "source_name": source.get("name"),
                "active": source.get("active"),
                "total_records": source.get("total_records", 0),
                "readiness": readiness,
                "created_at": now,
                "day": now.date().isoformat(),
            })
        if docs:
            await self.db.source_readiness_snapshots.insert_many(docs)
        return {"sources_snapshotted": len(docs)}

    async def send_backfill_retry_digest(
        self,
        *,
        min_success_rate: Optional[float] = None,
        max_rate_limit_share: Optional[float] = None,
        limit: int = 50,
    ) -> Dict[str, Any]:
        """Send a digest when AI 0.2 retry outcomes indicate operational trouble."""

        settings = await self.get_retry_alert_settings()
        min_success_rate = settings["min_success_rate"] if min_success_rate is None else min_success_rate
        max_rate_limit_share = settings["max_rate_limit_share"] if max_rate_limit_share is None else max_rate_limit_share
        if settings.get("disabled"):
            return {"runs_evaluated": 0, "notifications_sent": 0, "reason": "disabled"}

        analytics = await self._build_retry_analytics(limit=limit)
        totals = analytics.get("totals") or {}
        processed = totals.get("processed", 0)
        if not processed:
            return {"runs_evaluated": totals.get("runs", 0), "notifications_sent": 0, "reason": "no_retry_volume"}

        success_rate = totals.get("success_rate") or 0
        categories = {item.get("category"): item for item in analytics.get("by_category", [])}
        rate_limit_processed = (categories.get("rate_limit") or {}).get("processed", 0)
        rate_limit_share = (rate_limit_processed / processed) if processed else 0
        should_alert = success_rate < min_success_rate or rate_limit_share > max_rate_limit_share
        if not should_alert:
            return {
                "runs_evaluated": totals.get("runs", 0),
                "processed": processed,
                "success_rate": success_rate,
                "rate_limit_share": rate_limit_share,
                "notifications_sent": 0,
            }

        lines = [
            "<b>AI 0.2: retries con bajo rendimiento</b>",
            f"Recuperacion: {success_rate:.0%} ({totals.get('succeeded', 0)}/{processed})",
            f"Rate-limit: {rate_limit_share:.0%} del volumen reintentado",
        ]
        for item in analytics.get("by_category", [])[:5]:
            rate = item.get("success_rate")
            rate_text = f"{rate:.0%}" if rate is not None else "s/d"
            lines.append(
                f"- {item.get('category')}: {item.get('succeeded', 0)}/{item.get('processed', 0)} OK · {rate_text}"
            )
        sent = await self._send_telegram("\n".join(lines))
        await self._record_alert_event(
            event_type="ai_backfill_retry_digest",
            message="\n".join(lines),
            payload={
                "runs_evaluated": totals.get("runs", 0),
                "processed": processed,
                "success_rate": success_rate,
                "rate_limit_share": rate_limit_share,
                "min_success_rate": min_success_rate,
                "max_rate_limit_share": max_rate_limit_share,
                "analytics": analytics,
            },
            delivered=sent,
        )
        return {
            "runs_evaluated": totals.get("runs", 0),
            "processed": processed,
            "success_rate": success_rate,
            "rate_limit_share": rate_limit_share,
            "notifications_sent": 1 if sent else 0,
        }

    async def send_input_quality_repair_digest(
        self,
        *,
        min_open_items: int = 3,
        max_age_hours: int = 24,
    ) -> Dict[str, Any]:
        """Send a digest for stale AI 0.2 input-quality repair items."""

        from services.ai_extraction_cron_service import get_ai_extraction_cron_service

        svc = get_ai_extraction_cron_service(self.db)
        queue = await svc.build_input_quality_repair_queue(status="open", limit=100)
        items = queue.get("items") or []
        if not items:
            return {"open_items": 0, "notifications_sent": 0}

        now = utc_now()
        stale = []
        by_source: Dict[str, int] = {}
        for item in items:
            source = item.get("source_name") or "todas"
            by_source[source] = by_source.get(source, 0) + 1
            last_seen_raw = item.get("last_seen_at")
            age_hours = 0
            if last_seen_raw:
                try:
                    last_seen = datetime.fromisoformat(str(last_seen_raw).replace("Z", "+00:00"))
                    if last_seen.tzinfo is None:
                        last_seen = last_seen.replace(tzinfo=timezone.utc)
                    ref_now = now if now.tzinfo else now.replace(tzinfo=timezone.utc)
                    age_hours = int((ref_now - last_seen).total_seconds() // 3600)
                except Exception:
                    age_hours = 0
            if age_hours >= max_age_hours:
                stale.append({**item, "age_hours": age_hours})

        if len(items) < min_open_items and not stale:
            return {"open_items": len(items), "stale_items": 0, "notifications_sent": 0}

        lines = [
            "<b>AI 0.2: reparaciones input_quality abiertas</b>",
            f"Abiertas: {len(items)} · vencidas: {len(stale)}",
        ]
        for source, count in sorted(by_source.items(), key=lambda entry: entry[1], reverse=True)[:5]:
            lines.append(f"- {source}: {count} abiertas")
        for item in stale[:5]:
            title = item.get("title") or item.get("id_licitacion") or item.get("id")
            lines.append(f"- {item.get('age_hours')}h · {item.get('source_name')} · {str(title)[:80]}")

        sent = await self._send_telegram("\n".join(lines))
        await self._record_alert_event(
            event_type="input_quality_repair_digest",
            message="\n".join(lines),
            payload={
                "open_items": len(items),
                "stale_items": len(stale),
                "by_source": by_source,
                "min_open_items": min_open_items,
                "max_age_hours": max_age_hours,
            },
            delivered=sent,
        )
        return {"open_items": len(items), "stale_items": len(stale), "notifications_sent": 1 if sent else 0}

    async def get_retry_alert_settings(self) -> Dict[str, Any]:
        """Load configurable AI 0.2 retry alert thresholds."""

        doc = await self.db.operator_settings.find_one({"key": "ai_backfill_retry_alerts"})
        value = (doc or {}).get("value") or {}
        return {
            "min_success_rate": max(0.0, min(float(value.get("min_success_rate", 0.5)), 1.0)),
            "max_rate_limit_share": max(0.0, min(float(value.get("max_rate_limit_share", 0.5)), 1.0)),
            "disabled": bool(value.get("disabled", False)),
            "updated_at": doc.get("updated_at") if doc else None,
        }

    async def update_retry_alert_settings(self, settings: Dict[str, Any]) -> Dict[str, Any]:
        """Persist configurable AI 0.2 retry alert thresholds."""

        value = {
            "min_success_rate": max(0.0, min(float(settings.get("min_success_rate", 0.5)), 1.0)),
            "max_rate_limit_share": max(0.0, min(float(settings.get("max_rate_limit_share", 0.5)), 1.0)),
            "disabled": bool(settings.get("disabled", False)),
        }
        now = utc_now()
        await self.db.operator_settings.update_one(
            {"key": "ai_backfill_retry_alerts"},
            {"$set": {"key": "ai_backfill_retry_alerts", "value": value, "updated_at": now}},
            upsert=True,
        )
        return {**value, "updated_at": now}

    async def _record_alert_event(
        self,
        *,
        event_type: str,
        message: str,
        payload: Dict[str, Any],
        delivered: bool,
    ) -> None:
        """Persist an operator alert event regardless of delivery outcome."""

        try:
            await self.db.operator_alert_events.insert_one({
                "event_type": event_type,
                "channel": "telegram",
                "delivered": bool(delivered),
                "message": message,
                "payload": payload,
                "created_at": utc_now(),
            })
        except Exception as exc:
            logger.warning(f"Could not persist operator alert event {event_type}: {exc}")

    async def _build_retry_analytics(self, limit: int = 50) -> Dict[str, Any]:
        """Summarize recent source backfill retry outcomes."""

        limit = max(1, min(int(limit or 50), 200))
        docs = await self.db.source_backfill_runs.find(
            {"retry": True},
            {
                "source_name": 1,
                "processed": 1,
                "succeeded": 1,
                "failed": 1,
                "selected_items": 1,
                "failure_diagnostics": 1,
                "created_at": 1,
            },
        ).sort("created_at", -1).limit(limit).to_list(length=limit)

        by_category = {}
        by_source = {}
        totals = {"runs": len(docs), "processed": 0, "succeeded": 0, "failed": 0}
        for doc in docs:
            processed = int(doc.get("processed") or 0)
            succeeded = int(doc.get("succeeded") or 0)
            failed = int(doc.get("failed") or 0)
            totals["processed"] += processed
            totals["succeeded"] += succeeded
            totals["failed"] += failed

            source_name = doc.get("source_name") or "todas"
            source_entry = by_source.setdefault(source_name, {
                "source_name": source_name,
                "processed": 0,
                "succeeded": 0,
                "failed": 0,
            })
            source_entry["processed"] += processed
            source_entry["succeeded"] += succeeded
            source_entry["failed"] += failed

            selected_categories = {item.get("category") or "unknown" for item in (doc.get("selected_items") or [])}
            if not selected_categories:
                selected_categories = set((doc.get("failure_diagnostics") or {}).get("categories") or {"unknown": 0})
            for category in selected_categories:
                entry = by_category.setdefault(category, {
                    "category": category,
                    "runs": 0,
                    "processed": 0,
                    "succeeded": 0,
                    "failed": 0,
                })
                entry["runs"] += 1
                entry["processed"] += processed
                entry["succeeded"] += succeeded
                entry["failed"] += failed

        for entry in by_category.values():
            entry["success_rate"] = (entry["succeeded"] / entry["processed"]) if entry["processed"] else None
        for entry in by_source.values():
            entry["success_rate"] = (entry["succeeded"] / entry["processed"]) if entry["processed"] else None
        totals["success_rate"] = (totals["succeeded"] / totals["processed"]) if totals["processed"] else None
        return {
            "totals": totals,
            "by_category": sorted(by_category.values(), key=lambda item: item["processed"], reverse=True),
            "by_source": sorted(by_source.values(), key=lambda item: item["processed"], reverse=True),
        }

    async def _send_telegram(self, message: str) -> bool:
        try:
            from services.notification_service import get_notification_service

            notifier = get_notification_service(self.db)
            return await notifier.send_telegram(message)
        except Exception as exc:
            logger.warning(f"Readiness overdue digest notification failed: {exc}")
            return False


_instance: Optional[ReadinessActionService] = None


def get_readiness_action_service(db: AsyncIOMotorDatabase) -> ReadinessActionService:
    global _instance
    if _instance is None or _instance.db is not db:
        _instance = ReadinessActionService(db)
    return _instance
