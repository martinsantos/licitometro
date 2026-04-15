"""Adjudicación (award) domain model.

Separate collection from `licitaciones` — one document per award event,
keyed by `ocds_ocid` or `(fuente + dedup_key)` for idempotency.
"""
from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from utils.time import utc_now


ESTADO_ADJUDICACION_VALUES = ["active", "cancelled", "pending", "unsuccessful"]
FUENTE_VALUES = ["ocds_mendoza", "boletin_oficial"]


class AdjudicacionBase(BaseModel):
    # Identidad / trazabilidad (cualquiera puede servir de dedup key)
    proceso_id: Optional[str] = None
    licitacion_id: Optional[str] = None
    ocds_ocid: Optional[str] = None
    expedient_number: Optional[str] = None
    licitacion_number: Optional[str] = None

    # Award core
    adjudicatario: str = Field(..., description="Nombre del proveedor ganador")
    supplier_id: Optional[str] = Field(None, description="CUIT si se extrajo")
    monto_adjudicado: Optional[float] = None
    currency: str = "ARS"
    fecha_adjudicacion: Optional[datetime] = None
    estado_adjudicacion: str = "active"

    # Contexto del proceso (denormalizado — evita joins)
    objeto: Optional[str] = None
    organization: Optional[str] = None
    category: Optional[str] = None
    tipo_procedimiento: Optional[str] = None
    budget_original: Optional[float] = None
    num_oferentes: Optional[int] = None

    # Audit
    fuente: str = Field(..., description="ocds_mendoza | boletin_oficial")
    fecha_ingesta: datetime = Field(default_factory=utc_now)
    extraction_confidence: float = Field(1.0, ge=0.0, le=1.0, description="1.0 para OCDS, <1.0 para parseo regex")
    dedup_key: Optional[str] = Field(None, description="Clave estable para idempotencia cuando no hay ocid")
    metadata: Dict[str, Any] = Field(default_factory=dict)


class AdjudicacionCreate(AdjudicacionBase):
    pass


class AdjudicacionInDB(AdjudicacionBase):
    id: str


class AdjudicacionUpdate(BaseModel):
    adjudicatario: Optional[str] = None
    supplier_id: Optional[str] = None
    monto_adjudicado: Optional[float] = None
    fecha_adjudicacion: Optional[datetime] = None
    estado_adjudicacion: Optional[str] = None
    objeto: Optional[str] = None
    category: Optional[str] = None
    budget_original: Optional[float] = None
    num_oferentes: Optional[int] = None
    extraction_confidence: Optional[float] = None
    metadata: Optional[Dict[str, Any]] = None
