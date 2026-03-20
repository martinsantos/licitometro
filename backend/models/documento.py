from typing import Optional, List
from datetime import datetime, timezone
from pydantic import BaseModel, Field


DOCUMENT_CATEGORIES = [
    "AFIP", "ATM", "Proveedor Estado", "Poliza Caucion",
    "Garantia Bancaria", "Estatuto", "Acta Autoridades", "Poder",
    "Balance", "Habilitacion Municipal", "Seguro", "Antecedente", "Otro",
]


def _utcnow():
    return datetime.now(timezone.utc)


class DocumentoCreate(BaseModel):
    filename: str
    category: str = "Otro"
    tags: List[str] = Field(default_factory=list)
    description: Optional[str] = None
    expiration_date: Optional[datetime] = None


class DocumentoUpdate(BaseModel):
    category: Optional[str] = None
    tags: Optional[List[str]] = None
    description: Optional[str] = None
    expiration_date: Optional[datetime] = None


class DocumentoInDB(DocumentoCreate):
    file_path: str = ""
    mime_type: str = "application/octet-stream"
    file_size: int = 0
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)
