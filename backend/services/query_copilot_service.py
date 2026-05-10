"""Admin-only natural language query helper for Licitometro.

This is a deterministic first version of the OpenArg-style query pipeline:
parse filters, choose a safe read-only MongoDB query, and return a compact
answer plus records/aggregates. LLM orchestration can be layered on top later.
"""

from __future__ import annotations

import re
from datetime import date, datetime
from typing import Any, Dict, List, Optional

from db.models import licitacion_entity
from utils.text_search import build_accent_regex, strip_accents


ALLOWED_PIPELINE_STAGES = {"$match", "$project", "$group", "$sort", "$limit", "$count"}
FORBIDDEN_OPERATORS = {"$lookup", "$out", "$merge", "$function", "$accumulator", "$where"}


class QueryCopilotValidationError(ValueError):
    pass


def validate_readonly_pipeline(pipeline: List[Dict[str, Any]], *, max_limit: int = 500) -> None:
    """Validate a restricted read-only Mongo aggregation pipeline."""

    if not isinstance(pipeline, list):
        raise QueryCopilotValidationError("pipeline must be a list")
    for stage in pipeline:
        if not isinstance(stage, dict) or len(stage) != 1:
            raise QueryCopilotValidationError("each pipeline stage must contain exactly one operator")
        op = next(iter(stage))
        if op not in ALLOWED_PIPELINE_STAGES:
            raise QueryCopilotValidationError(f"stage {op} is not allowed")
        _scan_forbidden(stage)
        if op == "$limit":
            try:
                limit = int(stage[op])
            except Exception as exc:
                raise QueryCopilotValidationError("$limit must be numeric") from exc
            if limit < 1 or limit > max_limit:
                raise QueryCopilotValidationError(f"$limit must be between 1 and {max_limit}")


def _scan_forbidden(value: Any) -> None:
    if isinstance(value, dict):
        for key, item in value.items():
            if key in FORBIDDEN_OPERATORS:
                raise QueryCopilotValidationError(f"operator {key} is not allowed")
            _scan_forbidden(item)
    elif isinstance(value, list):
        for item in value:
            _scan_forbidden(item)


def _parse_iso_date(raw: Any) -> Optional[date]:
    if not raw:
        return None
    try:
        return datetime.fromisoformat(str(raw)).date()
    except ValueError:
        return None


def _date_range_filter(start: Optional[str], end: Optional[str]) -> Optional[Dict[str, datetime]]:
    d_start = _parse_iso_date(start)
    d_end = _parse_iso_date(end)
    if not d_start and not d_end:
        return None
    filt: Dict[str, datetime] = {}
    if d_start:
        filt["$gte"] = datetime.combine(d_start, datetime.min.time())
    if d_end:
        filt["$lte"] = datetime.combine(d_end, datetime.max.time())
    return filt


def _text_query(text: str) -> Optional[Dict[str, Any]]:
    tokens = [t for t in re.split(r"\s+", (text or "").strip()) if len(t) > 2]
    if not tokens:
        return None
    fields = ("title", "objeto", "description", "organization", "category", "fuente")
    clauses = []
    for token in tokens[:6]:
        pat = build_accent_regex(token)
        clauses.append({"$or": [{field: {"$regex": pat, "$options": "i"}} for field in fields]})
    return {"$and": clauses} if len(clauses) > 1 else clauses[0]


class QueryCopilotService:
    def __init__(self, db):
        self.db = db

    async def ask(self, question: str, *, limit: int = 100) -> Dict[str, Any]:
        from services.smart_search_parser import parse_smart_query

        question = (question or "").strip()
        if not question:
            return {
                "answer": "No recibi una pregunta para consultar.",
                "items": [],
                "aggregate": [],
                "applied_filters": {},
                "pipeline": [],
                "confidence": 0.0,
                "warnings": ["empty_question"],
            }

        limit = max(1, min(int(limit or 100), 500))
        parsed = parse_smart_query(question)
        filters = self._filters_from_parsed(parsed)
        intent = self._detect_intent(question)

        if intent.startswith("group:"):
            field = intent.split(":", 1)[1]
            return await self._run_group(question, filters, field, limit)
        if intent == "budget_summary":
            return await self._run_budget_summary(question, filters)
        if intent == "count":
            total = await self.db.licitaciones.count_documents(filters)
            return {
                "answer": f"Hay {total} licitaciones que coinciden con la consulta.",
                "items": [],
                "aggregate": [{"metric": "count", "value": total}],
                "applied_filters": filters,
                "pipeline": [{"$match": filters}, {"$count": "total"}],
                "confidence": 0.85,
                "warnings": [],
            }
        return await self._run_list(question, filters, limit)

    def _filters_from_parsed(self, parsed: Dict[str, Any]) -> Dict[str, Any]:
        filters: Dict[str, Any] = {}
        for key in ("status", "category", "jurisdiccion", "tipo_procedimiento"):
            if parsed.get(key):
                filters[key] = parsed[key]
        if parsed.get("organization"):
            filters["organization"] = {"$regex": f"^{re.escape(parsed['organization'])}$", "$options": "i"}
        if parsed.get("fuente"):
            filters["fuente"] = {"$regex": re.escape(parsed["fuente"]), "$options": "i"}
        if parsed.get("budget_min") is not None or parsed.get("budget_max") is not None:
            filters["budget"] = {}
            if parsed.get("budget_min") is not None:
                filters["budget"]["$gte"] = float(parsed["budget_min"])
            if parsed.get("budget_max") is not None:
                filters["budget"]["$lte"] = float(parsed["budget_max"])
        date_filter = _date_range_filter(parsed.get("fecha_desde"), parsed.get("fecha_hasta"))
        if date_filter:
            filters["publication_date"] = date_filter
        text = parsed.get("text")
        text_clause = _text_query(text) if text else None
        if text_clause:
            if filters:
                filters = {"$and": [filters, text_clause]}
            else:
                filters = text_clause
        return filters

    def _detect_intent(self, question: str) -> str:
        q = strip_accents(question.lower())
        if "por fuente" in q or "fuentes" in q:
            return "group:fuente"
        if "por organismo" in q or "organismos" in q:
            return "group:organization"
        if "por categoria" in q or "por rubro" in q or "rubros" in q:
            return "group:category"
        if any(word in q for word in ("presupuesto total", "monto total", "suma", "sumatoria")):
            return "budget_summary"
        if any(word in q for word in ("cuantas", "cuantos", "cantidad", "total")):
            return "count"
        return "list"

    async def _run_group(
        self,
        question: str,
        filters: Dict[str, Any],
        field: str,
        limit: int,
    ) -> Dict[str, Any]:
        pipeline = [
            {"$match": {**filters, field: {"$nin": [None, ""]}}},
            {"$group": {
                "_id": f"${field}",
                "count": {"$sum": 1},
                "presupuesto": {"$sum": {"$ifNull": ["$budget", 0]}},
            }},
            {"$sort": {"count": -1}},
            {"$limit": min(limit, 50)},
        ]
        validate_readonly_pipeline(pipeline)
        docs = await self.db.licitaciones.aggregate(pipeline).to_list(length=min(limit, 50))
        aggregate = [
            {"key": d.get("_id") or "Sin dato", "count": d.get("count", 0), "presupuesto": d.get("presupuesto", 0)}
            for d in docs
        ]
        label = {"fuente": "fuente", "organization": "organismo", "category": "categoria"}[field]
        lead = aggregate[0]["key"] if aggregate else "sin resultados"
        return {
            "answer": f"Agrupe la consulta por {label}. El principal resultado es {lead}.",
            "items": [],
            "aggregate": aggregate,
            "applied_filters": filters,
            "pipeline": pipeline,
            "confidence": 0.85,
            "warnings": [],
        }

    async def _run_budget_summary(self, question: str, filters: Dict[str, Any]) -> Dict[str, Any]:
        pipeline = [
            {"$match": filters},
            {"$group": {
                "_id": None,
                "count": {"$sum": 1},
                "con_presupuesto": {"$sum": {"$cond": [{"$gt": ["$budget", 0]}, 1, 0]}},
                "presupuesto": {"$sum": {"$ifNull": ["$budget", 0]}},
            }},
        ]
        validate_readonly_pipeline(pipeline)
        docs = await self.db.licitaciones.aggregate(pipeline).to_list(length=1)
        row = docs[0] if docs else {"count": 0, "con_presupuesto": 0, "presupuesto": 0}
        return {
            "answer": (
                f"La consulta encuentra {row['count']} licitaciones; "
                f"{row['con_presupuesto']} tienen presupuesto cargado."
            ),
            "items": [],
            "aggregate": [{
                "metric": "budget_summary",
                "count": row["count"],
                "con_presupuesto": row["con_presupuesto"],
                "presupuesto": row["presupuesto"],
            }],
            "applied_filters": filters,
            "pipeline": pipeline,
            "confidence": 0.85,
            "warnings": [],
        }

    async def _run_list(self, question: str, filters: Dict[str, Any], limit: int) -> Dict[str, Any]:
        projection = {
            "title": 1,
            "objeto": 1,
            "organization": 1,
            "budget": 1,
            "currency": 1,
            "publication_date": 1,
            "opening_date": 1,
            "fuente": 1,
            "estado": 1,
            "status": 1,
            "category": 1,
            "source_url": 1,
            "canonical_url": 1,
        }
        pipeline = [
            {"$match": filters},
            {"$project": projection},
            {"$sort": {"publication_date": -1}},
            {"$limit": limit},
        ]
        validate_readonly_pipeline(pipeline)
        docs = await self.db.licitaciones.find(filters, projection).sort("publication_date", -1).limit(limit).to_list(length=limit)
        items = [licitacion_entity(doc) for doc in docs]
        return {
            "answer": f"Encontre {len(items)} licitaciones relevantes. Devuelvo las mas recientes.",
            "items": items,
            "aggregate": [],
            "applied_filters": filters,
            "pipeline": pipeline,
            "confidence": 0.8,
            "warnings": [],
        }


def get_query_copilot_service(db) -> QueryCopilotService:
    return QueryCopilotService(db)
