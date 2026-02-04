from typing import Optional, List, Dict, Any
from datetime import datetime
from uuid import uuid4
from pydantic import BaseModel, Field, HttpUrl


class LicitacionBase(BaseModel):
    """Base model for licitacion data"""
    title: str = Field(..., description="Title of the licitación")
    organization: str = Field(..., description="Organization publishing the licitación")
    publication_date: datetime = Field(..., description="Date when the licitación was published")
    opening_date: Optional[datetime] = Field(None, description="Date when the licitación will be opened")
    expiration_date: Optional[datetime] = Field(None, description="Deadline for the licitación")
    expedient_number: Optional[str] = Field(None, description="File or expedient number")
    licitacion_number: Optional[str] = Field(None, description="Licitación number")
    description: Optional[str] = Field(None, description="Description of the licitación")
    contact: Optional[str] = Field(None, description="Contact information")
    source_url: Optional[HttpUrl] = Field(None, description="URL where the licitación was found")
    status: str = Field("active", description="Status of the licitación (active, closed, awarded, etc.)")
    fuente: Optional[str] = Field(None, description="Source of the licitación (scraper name)")
    fecha_scraping: Optional[datetime] = Field(None, description="Date when the licitación was scraped")
    location: Optional[str] = Field(None, description="Geographical location")
    category: Optional[str] = Field(None, description="Category of the licitación")
    budget: Optional[float] = Field(None, description="Budget amount")
    currency: Optional[str] = Field(None, description="Currency of the budget")
    attached_files: Optional[List[Dict[str, Any]]] = Field(default=[], description="List of attached files")
    keywords: Optional[List[str]] = Field(default=[], description="Keywords extracted from the licitación")
    metadata: Optional[Dict[str, Any]] = Field(default={}, description="Additional metadata")


class LicitacionCreate(LicitacionBase):
    """Model for creating a new licitación"""
    id_licitacion: str = Field(..., description="Unique identifier for the licitación from the source")
    jurisdiccion: str = Field(..., description="Jurisdiction of the licitación")
    tipo_procedimiento: str = Field(..., description="Type of procedure for the licitación")
    tipo_acceso: Optional[str] = Field(None, description="Type of access for the licitación")
    municipios_cubiertos: Optional[str] = Field(None, description="Municipalities covered by the licitación")
    provincia: Optional[str] = Field(None, description="Province (specific to municipal sources)")
    cobertura: Optional[str] = Field(None, description="Coverage (specific to aggregator sources)")
    # fuente is inherited from LicitacionBase and is also required here


class LicitacionUpdate(BaseModel):
    """Model for updating an existing licitación"""
    title: Optional[str] = None
    organization: Optional[str] = None
    publication_date: Optional[datetime] = None
    opening_date: Optional[datetime] = None
    expiration_date: Optional[datetime] = None
    expedient_number: Optional[str] = None
    licitacion_number: Optional[str] = None
    description: Optional[str] = None
    contact: Optional[str] = None
    source_url: Optional[HttpUrl] = None
    fecha_scraping: Optional[datetime] = None
    status: Optional[str] = None
    location: Optional[str] = None
    category: Optional[str] = None
    budget: Optional[float] = None
    currency: Optional[str] = None
    attached_files: Optional[List[Dict[str, Any]]] = None
    keywords: Optional[List[str]] = None
    metadata: Optional[Dict[str, Any]] = None


class Licitacion(LicitacionBase):
    """Model for a licitación stored in the database"""
    id: str = Field(default_factory=lambda: str(uuid4()))
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        orm_mode = True
