"""Cron-friendly AI 0.2 extraction batch service."""

from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from bson import ObjectId

from utils.time import utc_now

logger = logging.getLogger("ai_extraction_cron")


class AIExtractionCronService:
    """Populate schema-first pliego extraction for high-value pending tenders."""

    def __init__(self, db):
        self.db = db

    def build_query(
        self,
        *,
        jurisdiction: str = "Mendoza",
        licitacion_ids: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        if licitacion_ids:
            object_ids = []
            legacy_ids = []
            for raw_id in licitacion_ids:
                try:
                    object_ids.append(ObjectId(str(raw_id)))
                except Exception:
                    legacy_ids.append(str(raw_id))
            clauses = []
            if object_ids:
                clauses.append({"_id": {"$in": object_ids}})
            if legacy_ids:
                clauses.append({"id_licitacion": {"$in": legacy_ids}})
            return {"$or": clauses} if clauses else {"_id": {"$exists": False}}

        return {
            "jurisdiccion": {"$regex": f"^{jurisdiction}$", "$options": "i"},
            "requisitos": {"$exists": False},
            "$or": [
                {"metadata.pliego_local_url": {"$exists": True}},
                {"metadata.full_pliego_text": {"$exists": True}},
                {"metadata.pliego_text": {"$exists": True}},
                {"metadata.comprar_pliego_text": {"$exists": True}},
                {"description": {"$exists": True}},
            ],
        }

    def build_source_backfill_query(
        self,
        source_name: str,
        *,
        jurisdiction: str = "Mendoza",
        force_refresh: bool = False,
    ) -> Dict[str, Any]:
        """Build a bounded source query for AI 0.2 backfill candidates."""

        query: Dict[str, Any] = {
            "fuente": {"$regex": f"^{re.escape(source_name)}", "$options": "i"},
            "jurisdiccion": {"$regex": f"^{jurisdiction}$", "$options": "i"},
            "$or": [
                {"metadata.pliego_local_url": {"$exists": True}},
                {"metadata.full_pliego_text": {"$exists": True}},
                {"metadata.pliego_text": {"$exists": True}},
                {"metadata.comprar_pliego_text": {"$exists": True}},
                {"description": {"$exists": True}},
            ],
        }
        if not force_refresh:
            query["requisitos.source"] = {"$ne": "ai_extraction_v2"}
        return query

    def score_source_backfill_candidate(
        self,
        doc: Dict[str, Any],
        *,
        ai_coverage: float,
        min_ai_coverage: float,
        snapshot_coverage: float,
        has_readiness_snapshot: bool = False,
    ) -> int:
        """Rank AI 0.2 remediation candidates by source gap and opportunity urgency."""

        score = 0
        coverage_gap = max(0.0, min_ai_coverage - ai_coverage)
        score += int(round(coverage_gap * 100))
        score += int(round(max(0.0, 1.0 - snapshot_coverage) * 20))
        if not has_readiness_snapshot:
            score += 20

        days_until_opening = self._days_until(doc.get("fecha_apertura") or doc.get("opening_date"))
        if days_until_opening is not None:
            if 0 <= days_until_opening <= 7:
                score += 30
            elif 8 <= days_until_opening <= 30:
                score += 20
            elif 31 <= days_until_opening <= 60:
                score += 10
        else:
            score += 5

        budget = self._numeric_value(doc.get("budget"))
        if budget:
            if budget >= 100_000_000:
                score += 15
            elif budget >= 20_000_000:
                score += 10
            elif budget >= 5_000_000:
                score += 5
        return score

    def _days_until(self, value: Any) -> Optional[int]:
        if not value:
            return None
        if isinstance(value, datetime):
            dt = value
        elif isinstance(value, str):
            try:
                dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
            except ValueError:
                return None
        else:
            return None
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        now = utc_now()
        if now.tzinfo is None:
            now = now.replace(tzinfo=timezone.utc)
        return (dt - now).days

    def _numeric_value(self, value: Any) -> Optional[float]:
        try:
            if value is None or value == "":
                return None
            return float(value)
        except (TypeError, ValueError):
            return None

    def classify_extraction_failure(self, error: Optional[str]) -> str:
        """Classify AI extraction failures for source backfill diagnostics."""

        text = (error or "").lower()
        if not text:
            return "unknown"
        if any(token in text for token in ["rate limit", "rate_limit", "429", "quota", "exhausted"]):
            return "rate_limit"
        if any(token in text for token in ["api", "provider", "groq", "openai", "timeout", "timed out", "connection"]):
            return "provider"
        if any(token in text for token in ["pliego", "texto", "text", "pdf", "empty", "sin contenido", "no content"]):
            return "input_quality"
        if any(token in text for token in ["schema", "json", "parse", "validation"]):
            return "schema"
        return "unknown"

    def summarize_batch_failures(self, batch: Dict[str, Any]) -> Dict[str, Any]:
        """Build compact failure diagnostics from a batch result."""

        categories: Dict[str, int] = {}
        failed_items = []
        for item in batch.get("items") or []:
            if item.get("ok"):
                continue
            category = self.classify_extraction_failure(item.get("error"))
            categories[category] = categories.get(category, 0) + 1
            failed_items.append({
                "id": item.get("id"),
                "id_licitacion": item.get("id_licitacion"),
                "title": item.get("title"),
                "category": category,
                "error": item.get("error"),
            })
        return {
            "failed_count": len(failed_items),
            "categories": categories,
            "items": failed_items[:20],
        }

    async def run_batch(
        self,
        *,
        jurisdiction: str = "Mendoza",
        limit: int = 10,
        force_refresh: bool = False,
        licitacion_ids: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        limit = max(1, min(int(limit or 10), 50))
        query = self.build_query(jurisdiction=jurisdiction, licitacion_ids=(licitacion_ids or [])[:limit])
        docs = await self.db.licitaciones.find(
            query,
            {"_id": 1, "id_licitacion": 1, "title": 1},
        ).limit(limit).to_list(length=limit)

        from services.pliego_ai_service import get_pliego_ai_service
        svc = get_pliego_ai_service(self.db)

        items = []
        refreshed_ids: List[str] = []
        ok_count = 0
        failed_count = 0
        for doc in docs:
            try:
                result = await svc.extract_v2(str(doc["_id"]), force_refresh=force_refresh)
            except Exception as exc:
                logger.warning(f"AI extraction v2 batch failed for {doc.get('_id')}: {exc}")
                result = {"ok": False, "error": str(exc)}
            ok = bool(result.get("ok"))
            ok_count += 1 if ok else 0
            failed_count += 0 if ok else 1
            if ok:
                refreshed_ids.append(str(doc["_id"]))
            extracted = result.get("result") or {}
            items.append({
                "id": str(doc["_id"]),
                "id_licitacion": doc.get("id_licitacion"),
                "title": doc.get("title"),
                "ok": ok,
                "cached": result.get("cached"),
                "error": result.get("error"),
                "schema_version": result.get("schema_version"),
                "items_count": len(extracted.get("items") or []),
                "docs_count": len(extracted.get("documentacion_requerida") or []),
                "red_flags_count": len(extracted.get("red_flags") or []),
            })

        readiness = await self.refresh_readiness_for_licitaciones(refreshed_ids) if refreshed_ids else {
            "processed": 0,
            "snapshots": 0,
            "failed": 0,
        }

        summary = {
            "ok": failed_count == 0,
            "jurisdiction": jurisdiction,
            "processed": len(items),
            "succeeded": ok_count,
            "failed": failed_count,
            "readiness": readiness,
            "items": items,
        }
        await self.db.ai_extraction_batch_runs.insert_one({
            **summary,
            "force_refresh": force_refresh,
            "licitacion_ids": licitacion_ids or [],
            "created_at": utc_now(),
        })
        return summary

    async def run_daily_mendoza_batch(self) -> Dict[str, Any]:
        """Small daily cron batch to avoid uncontrolled LLM spend."""

        return await self.run_batch(jurisdiction="Mendoza", limit=10, force_refresh=False)

    async def run_daily_undercovered_mendoza_backfill(self) -> Dict[str, Any]:
        """Conservative source-coverage backfill for Mendoza-only AI 0.2 gaps."""

        return await self.run_undercovered_source_backfill(
            jurisdiction="Mendoza",
            min_ai_coverage=0.85,
            limit_per_source=2,
            max_total=5,
            force_refresh=False,
        )

    async def find_undercovered_sources(
        self,
        *,
        source_name: Optional[str] = None,
        jurisdiction: str = "Mendoza",
        min_ai_coverage: float = 0.75,
        limit_per_source: int = 5,
        max_sources: int = 10,
        force_refresh: bool = False,
    ) -> Dict[str, Any]:
        """Find Mendoza sources that should receive AI 0.2 extraction backfill."""

        min_ai_coverage = max(0.0, min(float(min_ai_coverage), 1.0))
        limit_per_source = max(1, min(int(limit_per_source or 5), 25))
        max_sources = max(1, min(int(max_sources or 10), 50))

        config_query: Dict[str, Any] = {"scope": {"$ne": "ar_nacional"}}
        if source_name:
            config_query["name"] = source_name
        configs = await self.db.scraper_configs.find(
            config_query,
            {"name": 1, "active": 1, "scope": 1, "ai_backfill": 1},
        ).limit(max_sources if not source_name else 1).to_list(length=max_sources if not source_name else 1)

        from services.source_readiness_metrics_service import build_source_readiness_summary

        sources = []
        for config in configs:
            name = config.get("name")
            if not name:
                continue

            total_records, _source_ids, readiness = await build_source_readiness_summary(self.db, name)
            ai_coverage = float(readiness.get("ai_coverage") or 0)
            settings = config.get("ai_backfill") or {}
            source_min_ai_coverage = max(0.0, min(float(settings.get("min_ai_coverage", min_ai_coverage)), 1.0))
            source_limit_per_source = max(
                1,
                min(int(settings.get("limit_per_source", limit_per_source) or limit_per_source), 25),
            )
            disabled = bool(settings.get("disabled"))
            include_source = (
                not disabled
                and (bool(source_name) or (total_records > 0 and ai_coverage < source_min_ai_coverage))
            )
            if not include_source:
                continue

            query = self.build_source_backfill_query(
                name,
                jurisdiction=jurisdiction,
                force_refresh=force_refresh,
            )
            docs = await self.db.licitaciones.find(
                query,
                {
                    "_id": 1,
                    "id_licitacion": 1,
                    "title": 1,
                    "objeto": 1,
                    "fecha_apertura": 1,
                    "opening_date": 1,
                    "budget": 1,
                    "requisitos.source": 1,
                },
            ).sort("fecha_apertura", 1).limit(
                min(max(source_limit_per_source * 5, source_limit_per_source), 50)
            ).to_list(length=min(max(source_limit_per_source * 5, source_limit_per_source), 50))

            snapshot_ids = set()
            try:
                doc_ids = [str(doc.get("_id")) for doc in docs]
                snapshot_ids = set(await self.db.offer_readiness_snapshots.distinct(
                    "licitacion_id",
                    {"licitacion_id": {"$in": doc_ids}},
                ))
            except Exception:
                snapshot_ids = set()

            scored_candidates = []
            for doc in docs:
                doc_id = str(doc.get("_id"))
                remediation_score = self.score_source_backfill_candidate(
                    doc,
                    ai_coverage=ai_coverage,
                    min_ai_coverage=source_min_ai_coverage,
                    snapshot_coverage=float(readiness.get("snapshot_coverage") or 0),
                    has_readiness_snapshot=doc_id in snapshot_ids,
                )
                scored_candidates.append((remediation_score, doc))
            scored_candidates.sort(key=lambda item: item[0], reverse=True)
            selected_candidates = scored_candidates[:source_limit_per_source]

            sources.append({
                "name": name,
                "active": bool(config.get("active")),
                "total_records": total_records,
                "ai_coverage": ai_coverage,
                "min_ai_coverage": source_min_ai_coverage,
                "limit_per_source": source_limit_per_source,
                "snapshot_coverage": readiness.get("snapshot_coverage", 0),
                "candidate_count": len(selected_candidates),
                "candidates": [
                    {
                        "id": str(doc.get("_id")),
                        "id_licitacion": doc.get("id_licitacion"),
                        "title": doc.get("title") or doc.get("objeto"),
                        "budget": doc.get("budget"),
                        "remediation_score": score,
                        "fecha_apertura": doc.get("fecha_apertura").isoformat()
                        if hasattr(doc.get("fecha_apertura"), "isoformat")
                        else doc.get("fecha_apertura"),
                    }
                    for score, doc in selected_candidates
                ],
            })

        return {
            "jurisdiction": jurisdiction,
            "min_ai_coverage": min_ai_coverage,
            "limit_per_source": limit_per_source,
            "force_refresh": force_refresh,
            "sources": sources,
            "total_candidates": sum(source["candidate_count"] for source in sources),
        }

    async def run_undercovered_source_backfill(
        self,
        *,
        source_name: Optional[str] = None,
        jurisdiction: str = "Mendoza",
        min_ai_coverage: float = 0.75,
        limit_per_source: int = 3,
        max_total: int = 10,
        force_refresh: bool = False,
    ) -> Dict[str, Any]:
        """Run a guarded AI 0.2 backfill for under-covered source candidates."""

        max_total = max(1, min(int(max_total or 10), 25))
        candidates = await self.find_undercovered_sources(
            source_name=source_name,
            jurisdiction=jurisdiction,
            min_ai_coverage=min_ai_coverage,
            limit_per_source=limit_per_source,
            force_refresh=force_refresh,
        )
        selected_ids: List[str] = []
        for source in candidates.get("sources", []):
            for candidate in source.get("candidates", []):
                if len(selected_ids) >= max_total:
                    break
                selected_ids.append(candidate["id"])
            if len(selected_ids) >= max_total:
                break

        if not selected_ids:
            run_doc = {
                "source_name": source_name,
                "jurisdiction": jurisdiction,
                "min_ai_coverage": min_ai_coverage,
                "limit_per_source": limit_per_source,
                "max_total": max_total,
                "force_refresh": force_refresh,
                "selected_ids": [],
                "processed": 0,
                "succeeded": 0,
                "failed": 0,
                "candidates": candidates,
                "batch_run_id": None,
                "created_at": utc_now(),
            }
            inserted = await self.db.source_backfill_runs.insert_one(run_doc)
            return {
                "ok": True,
                "jurisdiction": jurisdiction,
                "processed": 0,
                "message": "No hay candidatas para backfill AI 0.2",
                "candidates": candidates,
                "batch": None,
                "run_id": str(inserted.inserted_id),
            }

        batch = await self.run_batch(
            jurisdiction=jurisdiction,
            limit=max_total,
            force_refresh=force_refresh,
            licitacion_ids=selected_ids,
        )
        failure_diagnostics = self.summarize_batch_failures(batch)
        run_doc = {
            "source_name": source_name,
            "jurisdiction": jurisdiction,
            "min_ai_coverage": min_ai_coverage,
            "limit_per_source": limit_per_source,
            "max_total": max_total,
            "force_refresh": force_refresh,
            "selected_ids": selected_ids,
            "processed": batch.get("processed", 0),
            "succeeded": batch.get("succeeded", 0),
            "failed": batch.get("failed", 0),
            "readiness": batch.get("readiness"),
            "failure_diagnostics": failure_diagnostics,
            "candidates": candidates,
            "batch": batch,
            "created_at": utc_now(),
        }
        inserted = await self.db.source_backfill_runs.insert_one(run_doc)
        return {
            "ok": batch.get("ok", False),
            "jurisdiction": jurisdiction,
            "processed": batch.get("processed", 0),
            "selected_ids": selected_ids,
            "candidates": candidates,
            "batch": batch,
            "failure_diagnostics": failure_diagnostics,
            "run_id": str(inserted.inserted_id),
        }

    async def build_source_remediation_leaderboard(
        self,
        *,
        jurisdiction: str = "Mendoza",
        min_ai_coverage: float = 0.85,
        limit_per_source: int = 5,
    ) -> Dict[str, Any]:
        """Rank sources by AI 0.2 remediation need and recent backfill outcome."""

        candidates = await self.find_undercovered_sources(
            jurisdiction=jurisdiction,
            min_ai_coverage=min_ai_coverage,
            limit_per_source=limit_per_source,
        )
        names = [source.get("name") for source in candidates.get("sources", []) if source.get("name")]
        recent_runs = await self.db.source_backfill_runs.find(
            {"source_name": {"$in": names}},
            {
                "source_name": 1,
                "processed": 1,
                "succeeded": 1,
                "failed": 1,
                "created_at": 1,
            },
        ).sort("created_at", -1).limit(100).to_list(length=100) if names else []

        by_source: Dict[str, List[Dict[str, Any]]] = {}
        for run in recent_runs:
            by_source.setdefault(run.get("source_name"), []).append(run)

        items = []
        for source in candidates.get("sources", []):
            name = source.get("name")
            coverage_gap = max(0.0, float(source.get("min_ai_coverage") or 0) - float(source.get("ai_coverage") or 0))
            source_runs = by_source.get(name, [])[:5]
            processed = sum(int(run.get("processed") or 0) for run in source_runs)
            succeeded = sum(int(run.get("succeeded") or 0) for run in source_runs)
            failed = sum(int(run.get("failed") or 0) for run in source_runs)
            success_rate = (succeeded / processed) if processed else None
            top_score = max((int(c.get("remediation_score") or 0) for c in source.get("candidates", [])), default=0)
            remediation_score = int(round(coverage_gap * 100)) + (source.get("candidate_count") or 0) * 5 + top_score
            if success_rate is not None and success_rate < 0.5:
                remediation_score -= 10

            items.append({
                "source_name": name,
                "active": source.get("active"),
                "total_records": source.get("total_records", 0),
                "ai_coverage": source.get("ai_coverage", 0),
                "min_ai_coverage": source.get("min_ai_coverage", min_ai_coverage),
                "coverage_gap": coverage_gap,
                "snapshot_coverage": source.get("snapshot_coverage", 0),
                "candidate_count": source.get("candidate_count", 0),
                "top_candidate_score": top_score,
                "recent_processed": processed,
                "recent_succeeded": succeeded,
                "recent_failed": failed,
                "recent_success_rate": success_rate,
                "remediation_score": remediation_score,
            })
        items.sort(key=lambda item: item["remediation_score"], reverse=True)
        return {
            "jurisdiction": jurisdiction,
            "min_ai_coverage": min_ai_coverage,
            "items": items,
        }

    async def retry_recent_backfill_failures(
        self,
        *,
        source_name: Optional[str] = None,
        limit: int = 10,
        categories: Optional[List[str]] = None,
        excluded_categories: Optional[List[str]] = None,
        retry_window_hours: int = 6,
    ) -> Dict[str, Any]:
        """Retry recent AI 0.2 source backfill failures with guarded category filters."""

        limit = max(1, min(int(limit or 10), 25))
        retry_window_hours = max(1, min(int(retry_window_hours or 6), 72))
        allowed = set(categories or ["rate_limit", "provider", "schema", "unknown"])
        excluded = set(excluded_categories or ["input_quality"])
        query: Dict[str, Any] = {"failure_diagnostics.failed_count": {"$gt": 0}}
        if source_name:
            query["source_name"] = source_name

        retry_since = utc_now() - timedelta(hours=retry_window_hours)
        recent_retry_runs = await self.db.source_backfill_runs.find(
            {
                "retry": True,
                "created_at": {"$gte": retry_since},
            },
            {"selected_ids": 1},
        ).limit(100).to_list(length=100)
        recently_retried = {
            str(item_id)
            for run in recent_retry_runs
            for item_id in (run.get("selected_ids") or [])
            if item_id
        }

        runs = await self.db.source_backfill_runs.find(
            query,
            {
                "source_name": 1,
                "failure_diagnostics.items": 1,
                "created_at": 1,
            },
        ).sort("created_at", -1).limit(50).to_list(length=50)

        selected_ids: List[str] = []
        selected_items = []
        seen = set()
        for run in runs:
            for item in ((run.get("failure_diagnostics") or {}).get("items") or []):
                category = item.get("category") or "unknown"
                item_id = item.get("id")
                if not item_id or item_id in seen:
                    continue
                if item_id in recently_retried:
                    continue
                if category in excluded or category not in allowed:
                    continue
                selected_ids.append(item_id)
                selected_items.append({
                    "id": item_id,
                    "id_licitacion": item.get("id_licitacion"),
                    "title": item.get("title"),
                    "category": category,
                    "source_name": run.get("source_name"),
                })
                seen.add(item_id)
                if len(selected_ids) >= limit:
                    break
            if len(selected_ids) >= limit:
                break

        if not selected_ids:
            return {
                "ok": True,
                "processed": 0,
            "message": "No hay fallas recuperables para reintentar",
                "selected_items": [],
                "skipped_recent_retry_count": len(recently_retried),
                "batch": None,
            }

        batch = await self.run_batch(
            jurisdiction="Mendoza",
            limit=limit,
            force_refresh=True,
            licitacion_ids=selected_ids,
        )
        failure_diagnostics = self.summarize_batch_failures(batch)
        run_doc = {
            "source_name": source_name,
            "jurisdiction": "Mendoza",
            "retry": True,
            "retry_categories": sorted(allowed),
            "excluded_categories": sorted(excluded),
            "retry_window_hours": retry_window_hours,
            "selected_ids": selected_ids,
            "selected_items": selected_items,
            "processed": batch.get("processed", 0),
            "succeeded": batch.get("succeeded", 0),
            "failed": batch.get("failed", 0),
            "readiness": batch.get("readiness"),
            "failure_diagnostics": failure_diagnostics,
            "batch": batch,
            "created_at": utc_now(),
        }
        inserted = await self.db.source_backfill_runs.insert_one(run_doc)
        return {
            "ok": batch.get("ok", False),
            "processed": batch.get("processed", 0),
            "selected_items": selected_items,
            "skipped_recent_retry_count": len(recently_retried),
            "batch": batch,
            "failure_diagnostics": failure_diagnostics,
            "run_id": str(inserted.inserted_id),
        }

    async def build_input_quality_repair_queue(
        self,
        *,
        source_name: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 50,
    ) -> Dict[str, Any]:
        """Build an operator queue for AI 0.2 input-quality failures."""

        limit = max(1, min(int(limit or 50), 200))
        query: Dict[str, Any] = {"failure_diagnostics.categories.input_quality": {"$gt": 0}}
        if source_name:
            query["source_name"] = source_name
        runs = await self.db.source_backfill_runs.find(
            query,
            {
                "source_name": 1,
                "failure_diagnostics.items": 1,
                "created_at": 1,
            },
        ).sort("created_at", -1).limit(200).to_list(length=200)

        by_id: Dict[str, Dict[str, Any]] = {}
        for run in runs:
            source = run.get("source_name") or "todas"
            created_at = run.get("created_at")
            for item in ((run.get("failure_diagnostics") or {}).get("items") or []):
                if item.get("category") != "input_quality" or not item.get("id"):
                    continue
                item_id = str(item.get("id"))
                current = by_id.get(item_id)
                if current and current.get("last_seen_at") and created_at and current["last_seen_at"] >= created_at:
                    current["occurrences"] += 1
                    continue
                by_id[item_id] = {
                    "id": item_id,
                    "id_licitacion": item.get("id_licitacion"),
                    "title": item.get("title"),
                    "source_name": source,
                    "error": item.get("error"),
                    "occurrences": (current or {}).get("occurrences", 0) + 1,
                    "last_seen_at": created_at,
                }

        ids = list(by_id.keys())
        actions = await self.db.input_quality_repair_actions.find(
            {"licitacion_id": {"$in": ids}},
            {
                "licitacion_id": 1,
                "status": 1,
                "owner": 1,
                "notes": 1,
                "updated_at": 1,
            },
        ).to_list(length=len(ids)) if ids else []
        action_by_id = {action.get("licitacion_id"): action for action in actions}
        reruns = await self.db.input_quality_repair_reruns.find(
            {"licitacion_id": {"$in": ids}},
            {
                "licitacion_id": 1,
                "status": 1,
                "created_at": 1,
            },
        ).sort("created_at", -1).limit(max(len(ids) * 5, 1)).to_list(length=max(len(ids) * 5, 1)) if ids else []
        rerun_by_id: Dict[str, Dict[str, Any]] = {}
        for rerun in reruns:
            lic_id = rerun.get("licitacion_id")
            if not lic_id:
                continue
            summary = rerun_by_id.setdefault(lic_id, {
                "rerun_count": 0,
                "last_rerun_status": None,
                "last_rerun_at": None,
            })
            summary["rerun_count"] += 1
            if not summary["last_rerun_at"]:
                summary["last_rerun_status"] = rerun.get("status")
                summary["last_rerun_at"] = rerun.get("created_at")

        items = []
        now = utc_now()
        for item in by_id.values():
            action = action_by_id.get(item["id"]) or {}
            rerun_summary = rerun_by_id.get(item["id"]) or {}
            item_status = action.get("status") or "open"
            if status and item_status != status:
                continue
            age_hours = 0
            last_seen = item.get("last_seen_at")
            if last_seen:
                try:
                    ref_now = now if now.tzinfo else now.replace(tzinfo=timezone.utc)
                    normalized = last_seen if last_seen.tzinfo else last_seen.replace(tzinfo=timezone.utc)
                    age_hours = int((ref_now - normalized).total_seconds() // 3600)
                except Exception:
                    age_hours = 0
            items.append({
                **item,
                "status": item_status,
                "owner": action.get("owner"),
                "notes": action.get("notes"),
                "age_hours": max(age_hours, 0),
                "rerun_count": rerun_summary.get("rerun_count", 0),
                "last_rerun_status": rerun_summary.get("last_rerun_status"),
                "last_rerun_at": rerun_summary.get("last_rerun_at"),
                "updated_at": action.get("updated_at"),
                "last_seen_at": item.get("last_seen_at"),
            })
        items.sort(key=lambda item: (item.get("status") != "open", item.get("last_seen_at") or datetime.min), reverse=True)
        by_source: Dict[str, Dict[str, Any]] = {}
        for item in items:
            source = item.get("source_name") or "todas"
            summary = by_source.setdefault(source, {
                "source_name": source,
                "open_items": 0,
                "occurrences": 0,
                "max_age_hours": 0,
                "age_sum": 0,
            })
            summary["open_items"] += 1
            summary["occurrences"] += int(item.get("occurrences") or 0)
            summary["max_age_hours"] = max(summary["max_age_hours"], int(item.get("age_hours") or 0))
            summary["age_sum"] += int(item.get("age_hours") or 0)
        source_summaries = []
        for summary in by_source.values():
            open_items = summary.pop("open_items")
            age_sum = summary.pop("age_sum")
            summary["open_items"] = open_items
            summary["avg_age_hours"] = int(age_sum / open_items) if open_items else 0
            source_summaries.append(summary)
        source_summaries.sort(key=lambda item: (item["open_items"], item["max_age_hours"]), reverse=True)
        return {
            "items": [
                {
                    **item,
                    "last_seen_at": item.get("last_seen_at").isoformat() if hasattr(item.get("last_seen_at"), "isoformat") else item.get("last_seen_at"),
                    "last_rerun_at": item.get("last_rerun_at").isoformat() if hasattr(item.get("last_rerun_at"), "isoformat") else item.get("last_rerun_at"),
                    "updated_at": item.get("updated_at").isoformat() if hasattr(item.get("updated_at"), "isoformat") else item.get("updated_at"),
                }
                for item in items[:limit]
            ],
            "total": len(items),
            "by_source": source_summaries,
        }

    async def update_input_quality_repair_action(
        self,
        licitacion_id: str,
        *,
        status: str = "open",
        owner: Optional[str] = None,
        notes: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Persist operator status for an input-quality repair item."""

        allowed = {"open", "in_progress", "resolved", "ignored"}
        clean_status = status if status in allowed else "open"
        now = utc_now()
        doc = {
            "licitacion_id": str(licitacion_id),
            "status": clean_status,
            "owner": owner or "",
            "notes": notes or "",
            "updated_at": now,
        }
        await self.db.input_quality_repair_actions.update_one(
            {"licitacion_id": str(licitacion_id)},
            {"$set": doc, "$setOnInsert": {"created_at": now}},
            upsert=True,
        )
        return {**doc, "updated_at": now.isoformat()}

    async def rerun_input_quality_repair_item(
        self,
        licitacion_id: str,
        *,
        force_refresh: bool = True,
    ) -> Dict[str, Any]:
        """Rerun AI 0.2 extraction for a repaired input-quality item."""

        batch = await self.run_batch(
            jurisdiction="Mendoza",
            limit=1,
            force_refresh=force_refresh,
            licitacion_ids=[str(licitacion_id)],
        )
        status = "resolved" if batch.get("succeeded", 0) > 0 else "open"
        action = await self.update_input_quality_repair_action(
            licitacion_id,
            status=status,
            notes="AI 0.2 rerun OK" if status == "resolved" else "AI 0.2 rerun failed; revisar pliego/texto",
        )
        await self.db.input_quality_repair_reruns.insert_one({
            "licitacion_id": str(licitacion_id),
            "force_refresh": force_refresh,
            "status": status,
            "batch": batch,
            "created_at": utc_now(),
        })
        return {
            "ok": status == "resolved",
            "status": status,
            "action": action,
            "batch": batch,
        }

    async def refresh_readiness_for_licitaciones(self, licitacion_ids: List[str]) -> Dict[str, int]:
        """Recompute offer-readiness snapshots for extracted licitaciones."""

        if not licitacion_ids:
            return {"processed": 0, "snapshots": 0, "failed": 0}

        object_ids = []
        for raw_id in licitacion_ids:
            try:
                object_ids.append(ObjectId(str(raw_id)))
            except Exception:
                pass
        if not object_ids:
            return {"processed": 0, "snapshots": 0, "failed": 0}

        licitaciones = await self.db.licitaciones.find({"_id": {"$in": object_ids}}).to_list(length=len(object_ids))
        profiles = await self.db.company_profiles.find({}).to_list(length=100)

        from services.match_score_service import match_score
        from services.offer_readiness_service import (
            build_offer_readiness_snapshot,
            upsert_offer_readiness_snapshot,
        )

        snapshots = 0
        failed = 0
        notifications_sent = 0
        for profile in profiles:
            company_id = profile.get("company_id")
            if not company_id:
                continue
            contexts = await self.db.company_contexts.find({"company_id": company_id}).to_list(length=100)
            documentos_disponibles = sorted({
                str(doc)
                for context in contexts
                for doc in (context.get("documentos_disponibles") or [])
                if doc
            })
            enriched_profile = dict(profile)
            if documentos_disponibles:
                enriched_profile["documentos_disponibles"] = documentos_disponibles

            for lic in licitaciones:
                try:
                    score_result = match_score(enriched_profile, lic.get("requisitos") or {})
                    snapshot = build_offer_readiness_snapshot(
                        licitacion=lic,
                        company_profile=enriched_profile,
                        score_result=score_result,
                    )
                    previous = await self.db.offer_readiness_snapshots.find_one({
                        "licitacion_id": snapshot["licitacion_id"],
                        "company_id": snapshot["company_id"],
                        "schema_version": snapshot["schema_version"],
                    })
                    await upsert_offer_readiness_snapshot(self.db, snapshot)
                    snapshots += 1
                    previous_status = previous.get("status") if previous else None
                    if snapshot.get("status") in {"ready", "blocked"} and previous_status != snapshot.get("status"):
                        sent = await self._notify_readiness_transition(snapshot, lic, previous_status)
                        notifications_sent += 1 if sent else 0
                except Exception as exc:
                    failed += 1
                    logger.warning(f"Readiness refresh failed for {lic.get('_id')} / {company_id}: {exc}")

        return {
            "processed": len(licitaciones),
            "snapshots": snapshots,
            "failed": failed,
            "notifications_sent": notifications_sent,
        }

    async def _notify_readiness_transition(
        self,
        snapshot: Dict[str, Any],
        licitacion: Dict[str, Any],
        previous_status: Optional[str],
    ) -> bool:
        try:
            from services.notification_service import get_notification_service
            from services.offer_readiness_service import build_readiness_notification_message

            notifier = get_notification_service(self.db)
            message = build_readiness_notification_message(
                snapshot=snapshot,
                licitacion=licitacion,
                previous_status=previous_status,
            )
            return await notifier.send_telegram(message)
        except Exception as exc:
            logger.warning(f"Readiness transition notification failed: {exc}")
            return False


_instance: Optional[AIExtractionCronService] = None


def get_ai_extraction_cron_service(db) -> AIExtractionCronService:
    global _instance
    if _instance is None or _instance.db is not db:
        _instance = AIExtractionCronService(db)
    return _instance
