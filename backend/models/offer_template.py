from typing import Optional, List, Dict, Any
from datetime import datetime
from uuid import uuid4
from pydantic import BaseModel, Field


class OfferTemplateSection(BaseModel):
    """A section within an offer template"""
    name: str = Field(..., description="Section name")
    description: Optional[str] = Field(None, description="Section description")
    required: bool = Field(True, description="Whether this section is required")
    order: int = Field(0, description="Display order")
    checklist_items: List[str] = Field(default=[], description="Checklist items for this section")


class OfferTemplateBase(BaseModel):
    """Base model for offer templates"""
    name: str = Field(..., description="Template name")
    template_type: str = Field(..., description="Template type: servicio, producto, obra")
    description: Optional[str] = Field(None, description="Template description")
    sections: List[OfferTemplateSection] = Field(default=[], description="Template sections")
    required_documents: List[str] = Field(default=[], description="List of required documents")
    budget_structure: Dict[str, Any] = Field(default={}, description="Budget structure template")
    tags: List[str] = Field(default=[], description="Tags for categorization")
    applicable_rubros: List[str] = Field(default=[], description="Applicable rubros/categories")


class OfferTemplate(OfferTemplateBase):
    """Full offer template model with database fields"""
    id: str = Field(default_factory=lambda: str(uuid4()))
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    usage_count: int = Field(0, description="Number of times this template has been used")


class OfferTemplateCreate(OfferTemplateBase):
    """Model for creating an offer template"""
    pass


class OfferTemplateUpdate(BaseModel):
    """Model for updating an offer template"""
    name: Optional[str] = None
    template_type: Optional[str] = None
    description: Optional[str] = None
    sections: Optional[List[OfferTemplateSection]] = None
    required_documents: Optional[List[str]] = None
    budget_structure: Optional[Dict[str, Any]] = None
    tags: Optional[List[str]] = None
    applicable_rubros: Optional[List[str]] = None
