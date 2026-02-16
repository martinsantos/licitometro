"""
Nodo (Semantic Search Map) models.

A Nodo groups licitaciones by keyword clouds. Each nodo has keyword groups
and configurable actions (email, telegram, tag) that fire when a match occurs.
"""

from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field, field_validator


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
    scope: str = Field("global", description="Scope: global|mendoza|argentina - determines which licitaciones can match")
    description: str = Field("", description="Short description")
    color: str = Field("#3B82F6", description="Hex color for UI badges")
    keyword_groups: List[KeywordGroup] = Field(default=[], description="Keyword groups")
    categories: List[str] = Field(default=[], description="Rubro/category names — licitaciones matching these categories auto-assign to this nodo")
    actions: List[NodoAction] = Field(default=[], description="Actions on match")
    active: bool = Field(True)
    digest_frequency: str = Field("daily", description="Digest frequency: none, daily, twice_daily")

    @field_validator('scope')
    @classmethod
    def validate_scope(cls, v: str) -> str:
        """Validate scope field - must be global, mendoza, or argentina."""
        allowed = {'global', 'mendoza', 'argentina'}
        if v not in allowed:
            raise ValueError(f"scope must be one of {allowed}, got '{v}'")
        return v


class NodoCreate(NodoBase):
    """Model for creating a nodo."""
    pass


class NodoUpdate(BaseModel):
    """Model for updating a nodo. All fields optional."""
    name: Optional[str] = None
    slug: Optional[str] = None
    scope: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    keyword_groups: Optional[List[KeywordGroup]] = None
    categories: Optional[List[str]] = None
    actions: Optional[List[NodoAction]] = None
    active: Optional[bool] = None
    digest_frequency: Optional[str] = None


class Nodo(NodoBase):
    """Nodo as stored in MongoDB (with id and timestamps)."""
    id: str
    matched_count: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
