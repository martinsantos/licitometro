from typing import Optional, List, Dict, Any
from datetime import datetime
from uuid import uuid4
from pydantic import BaseModel, Field


class OfferChecklistItem(BaseModel):
    """A checklist item in an offer application"""
    section_name: str = Field(..., description="Section this item belongs to")
    item_text: str = Field(..., description="Checklist item text")
    completed: bool = Field(False, description="Whether this item is completed")
    completed_at: Optional[datetime] = Field(None, description="When the item was completed")
    notes: Optional[str] = Field(None, description="Additional notes")


class OfferApplicationBase(BaseModel):
    """Base model for applying a template to a licitacion"""
    licitacion_id: str = Field(..., description="ID of the licitacion")
    template_id: str = Field(..., description="ID of the template used")
    template_name: str = Field(..., description="Name of the template (denormalized)")
    checklist: List[OfferChecklistItem] = Field(default=[], description="Checklist items")
    progress_percent: float = Field(0.0, description="Completion progress 0-100")
    status: str = Field("in_progress", description="Status: in_progress, completed, abandoned")


class OfferApplication(OfferApplicationBase):
    """Full offer application model with database fields"""
    id: str = Field(default_factory=lambda: str(uuid4()))
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class OfferApplicationCreate(OfferApplicationBase):
    """Model for creating an offer application"""
    pass


class OfferApplicationUpdate(BaseModel):
    """Model for updating an offer application"""
    checklist: Optional[List[OfferChecklistItem]] = None
    progress_percent: Optional[float] = None
    status: Optional[str] = None
