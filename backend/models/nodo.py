"""
Nodo (Semantic Search Map) models.

A Nodo groups licitaciones by keyword clouds. Each nodo has keyword groups
and configurable actions (email, telegram, tag) that fire when a match occurs.
"""

from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field


class KeywordGroup(BaseModel):
    """A named group of keywords within a nodo."""
    name: str = Field(..., description="Group name (e.g. 'Software', 'Hardware')")
    keywords: List[str] = Field(default=[], description="Keywords in this group")


class NodoAction(BaseModel):
    """An action to execute when a nodo matches a licitacion."""
    type: str = Field(..., description="Action type: email, telegram, tag")
    enabled: bool = Field(True)
    config: Dict[str, Any] = Field(default={}, description="Type-specific config")


class NodoBase(BaseModel):
    """Base fields for a nodo."""
    name: str = Field(..., description="Display name")
    slug: str = Field("", description="URL-safe slug (auto-generated if empty)")
    description: str = Field("", description="Short description")
    color: str = Field("#3B82F6", description="Hex color for UI badges")
    keyword_groups: List[KeywordGroup] = Field(default=[], description="Keyword groups")
    actions: List[NodoAction] = Field(default=[], description="Actions on match")
    active: bool = Field(True)


class NodoCreate(NodoBase):
    """Model for creating a nodo."""
    pass


class NodoUpdate(BaseModel):
    """Model for updating a nodo. All fields optional."""
    name: Optional[str] = None
    slug: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    keyword_groups: Optional[List[KeywordGroup]] = None
    actions: Optional[List[NodoAction]] = None
    active: Optional[bool] = None


class Nodo(NodoBase):
    """Nodo as stored in MongoDB (with id and timestamps)."""
    id: str
    matched_count: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
