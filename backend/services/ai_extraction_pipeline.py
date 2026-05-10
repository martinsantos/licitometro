"""AI extraction pipeline contracts for Licitometro 0.2.

This service is deliberately schema-first. It gives us a stable place to cache
document extractions by content hash and prompt/schema version before wiring it
into every pliego endpoint.
"""

from __future__ import annotations

import hashlib
import re
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from utils.time import utc_now


SCHEMA_VERSION = "licitometro.ai_extraction.v1"
PROMPT_VERSION = "pliego_requirements.v1"


class ExtractedItem(BaseModel):
    descripcion: str
    cantidad: float = 1
    unidad: str = "u."
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    evidence: Optional[str] = None


class ExtractedRequirementSet(BaseModel):
    """Structured AI output for one pliego or procurement document."""

    items: List[ExtractedItem] = Field(default_factory=list)
    requisitos_tecnicos: List[str] = Field(default_factory=list)
    documentacion_requerida: List[str] = Field(default_factory=list)
    plazo_ejecucion: Optional[str] = None
    lugar_entrega: Optional[str] = None
    garantias: Dict[str, Any] = Field(default_factory=dict)
    presupuesto_oficial: Optional[float] = None
    fecha_apertura: Optional[str] = None
    condiciones_especiales: List[str] = Field(default_factory=list)
    info_faltante: List[str] = Field(default_factory=list)
    red_flags: List[str] = Field(default_factory=list)


class AIExtractionRecord(BaseModel):
    document_hash: str
    schema_version: str = SCHEMA_VERSION
    prompt_version: str = PROMPT_VERSION
    source: str = "unknown"
    provider: str = "unknown"
    model: str = "unknown"
    result: ExtractedRequirementSet
    created_at: Any = Field(default_factory=utc_now)
    metadata: Dict[str, Any] = Field(default_factory=dict)


def document_hash(text: str) -> str:
    """Stable SHA-256 for document text cache keys."""

    normalized = " ".join((text or "").split())
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def normalize_ai_extraction(raw: Dict[str, Any]) -> ExtractedRequirementSet:
    """Normalize a raw LLM JSON dict into the v1 extraction schema."""

    items = []
    for item in raw.get("items") or []:
        if not isinstance(item, dict) or not item.get("descripcion"):
            continue
        try:
            cantidad = float(item.get("cantidad", 1) or 1)
        except (TypeError, ValueError):
            cantidad = 1
        items.append(ExtractedItem(
            descripcion=str(item.get("descripcion", ""))[:300],
            cantidad=cantidad,
            unidad=str(item.get("unidad", "u."))[:30],
            confidence=float(item.get("confidence", 0.0) or 0.0),
            evidence=item.get("evidence"),
        ))

    return ExtractedRequirementSet(
        items=items[:100],
        requisitos_tecnicos=[str(x)[:500] for x in (raw.get("requisitos_tecnicos") or []) if x],
        documentacion_requerida=[str(x)[:300] for x in (raw.get("documentacion_requerida") or []) if x],
        plazo_ejecucion=raw.get("plazo_ejecucion"),
        lugar_entrega=raw.get("lugar_entrega"),
        garantias=raw.get("garantias") if isinstance(raw.get("garantias"), dict) else {},
        presupuesto_oficial=raw.get("presupuesto_oficial") if isinstance(raw.get("presupuesto_oficial"), (int, float)) else None,
        fecha_apertura=raw.get("fecha_apertura"),
        condiciones_especiales=[str(x)[:500] for x in (raw.get("condiciones_especiales") or []) if x],
        info_faltante=[str(x)[:500] for x in (raw.get("info_faltante") or []) if x],
        red_flags=[str(x)[:500] for x in (raw.get("red_flags") or []) if x],
    )


def _parse_percentage(value: Any) -> Optional[float]:
    if value is None:
        return None
    match = re.search(r"(\d+(?:[.,]\d+)?)", str(value))
    if not match:
        return None
    try:
        return float(match.group(1).replace(",", "."))
    except ValueError:
        return None


def _parse_days(value: Any) -> Optional[int]:
    if value is None:
        return None
    match = re.search(r"(\d+)", str(value))
    if not match:
        return None
    try:
        return int(match.group(1))
    except ValueError:
        return None


def requirements_from_extraction(result: ExtractedRequirementSet) -> Dict[str, Any]:
    """Map AI 0.2 extraction to the existing requisitos scoring schema."""

    requisitos: Dict[str, Any] = {
        "capacidad_tecnica": result.requisitos_tecnicos,
        "zona_ejecucion": result.lugar_entrega or "",
        "red_flags": result.red_flags,
        "documentacion_requerida": result.documentacion_requerida,
        "source": "ai_extraction_v2",
        "schema_version": SCHEMA_VERSION,
        "prompt_version": PROMPT_VERSION,
    }
    garantia_oferta = _parse_percentage(result.garantias.get("oferta")) if result.garantias else None
    garantia_contrato = _parse_percentage(result.garantias.get("cumplimiento")) if result.garantias else None
    plazo_dias = _parse_days(result.plazo_ejecucion)
    if garantia_oferta is not None:
        requisitos["garantia_oferta_pct"] = garantia_oferta
    if garantia_contrato is not None:
        requisitos["garantia_contrato_pct"] = garantia_contrato
    if plazo_dias is not None:
        requisitos["plazo_entrega_dias"] = plazo_dias
    if result.presupuesto_oficial is not None:
        requisitos["presupuesto_oficial_estimado"] = result.presupuesto_oficial
    return requisitos


class AIExtractionPipeline:
    """Cache-aware schema wrapper for AI document extraction."""

    def __init__(self, db):
        self.db = db

    async def get_cached(self, text: str) -> Optional[AIExtractionRecord]:
        h = document_hash(text)
        doc = await self.db.ai_extractions.find_one({
            "document_hash": h,
            "schema_version": SCHEMA_VERSION,
            "prompt_version": PROMPT_VERSION,
        })
        if not doc:
            return None
        doc.pop("_id", None)
        return AIExtractionRecord(**doc)

    async def store(
        self,
        *,
        text: str,
        raw_result: Dict[str, Any],
        source: str,
        provider: str,
        model: str,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> AIExtractionRecord:
        record = AIExtractionRecord(
            document_hash=document_hash(text),
            source=source,
            provider=provider,
            model=model,
            result=normalize_ai_extraction(raw_result),
            metadata=metadata or {},
        )
        await self.db.ai_extractions.update_one(
            {
                "document_hash": record.document_hash,
                "schema_version": record.schema_version,
                "prompt_version": record.prompt_version,
            },
            {"$set": record.model_dump()},
            upsert=True,
        )
        return record
