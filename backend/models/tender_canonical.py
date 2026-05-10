"""Canonical tender models for Licitometro 0.2.

These models are not a replacement for the existing ``licitaciones`` collection
yet. They define the target shape for separating the business opportunity from
source-specific records.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, model_validator

from utils.time import utc_now


class SourceRecord(BaseModel):
    """One source-specific appearance of a procurement opportunity."""

    source_id: str
    source_name: str
    source_record_id: str
    source_url: Optional[str] = None
    canonical_url: Optional[str] = None
    url_quality: Optional[str] = None
    raw_title: Optional[str] = None
    raw_organization: Optional[str] = None
    raw_dates: Dict[str, Any] = Field(default_factory=dict)
    evidence_ids: List[str] = Field(default_factory=list)
    extraction_confidence: float = Field(ge=0.0, le=1.0, default=0.75)
    first_seen_at: datetime = Field(default_factory=utc_now)
    last_seen_at: datetime = Field(default_factory=utc_now)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class TenderCanonical(BaseModel):
    """Canonical business opportunity merged from one or more source records."""

    canonical_id: str
    title: str
    organization: str
    jurisdiccion: str = "Mendoza"
    objeto: Optional[str] = None
    publication_date: Optional[datetime] = None
    opening_date: Optional[datetime] = None
    expiration_date: Optional[datetime] = None
    budget: Optional[float] = None
    currency: Optional[str] = None
    category: Optional[str] = None
    estado: str = "vigente"
    proceso_id: Optional[str] = None
    source_records: List[SourceRecord] = Field(default_factory=list)
    confidence: float = Field(ge=0.0, le=1.0, default=0.75)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)
    metadata: Dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_canonical_has_source(self):
        if not self.canonical_id.strip():
            raise ValueError("canonical_id is required")
        if not self.source_records:
            raise ValueError("at least one source_record is required")
        return self
