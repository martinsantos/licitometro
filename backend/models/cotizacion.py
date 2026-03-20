from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from pydantic import BaseModel, Field


def _utcnow():
    return datetime.now(timezone.utc)


class CotizacionCreate(BaseModel):
    """Data for creating/updating a cotizacion."""
    licitacion_id: str
    licitacion_title: str = ""
    licitacion_objeto: Optional[str] = None
    organization: Optional[str] = None
    items: List[dict] = Field(default_factory=list)
    iva_rate: float = 21
    subtotal: float = 0
    iva_amount: float = 0
    total: float = 0
    tech_data: dict = Field(default_factory=dict)
    company_data: dict = Field(default_factory=dict)
    analysis: Optional[dict] = None
    pliego_info: Optional[dict] = None
    marco_legal: Optional[dict] = None
    antecedentes_vinculados: List[str] = Field(default_factory=list)
    price_intelligence: Optional[dict] = None
    status: str = "borrador"


class CotizacionInDB(CotizacionCreate):
    """Cotizacion as stored in MongoDB."""
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)
