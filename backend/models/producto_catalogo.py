from typing import Optional
from datetime import datetime, timezone
from pydantic import BaseModel, Field


def _utcnow():
    return datetime.now(timezone.utc)


class ProductoCatalogo(BaseModel):
    empresa_id: str
    sku: Optional[str] = None
    descripcion: str
    unidad_medida: str = "UN"  # UN, M2, KG, LTS, HS, ML, M3, TN
    precio_unitario: float
    moneda: str = "ARS"
    vigencia_desde: datetime = Field(default_factory=_utcnow)
    vigencia_hasta: Optional[datetime] = None
    categoria: Optional[str] = None
    notas: Optional[str] = None


class ProductoCatalogoInDB(ProductoCatalogo):
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)
