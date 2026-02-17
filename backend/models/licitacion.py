from typing import Optional, List, Dict, Any
from datetime import datetime
from uuid import uuid4
from pydantic import BaseModel, Field, HttpUrl, model_validator

# Workflow states
WORKFLOW_STATES = ["descubierta", "evaluando", "preparando", "presentada", "descartada"]
WORKFLOW_TRANSITIONS = {
    "descubierta": ["evaluando", "descartada"],
    "evaluando": ["preparando", "descartada"],
    "preparando": ["presentada", "descartada"],
    "presentada": [],
    "descartada": [],
}


class LicitacionBase(BaseModel):
    """Base model for licitacion data"""
    title: str = Field(..., description="Title of the licitación")
    organization: str = Field(..., description="Organization publishing the licitación")
    publication_date: Optional[datetime] = Field(None, description="Date when the licitación was published")
    opening_date: Optional[datetime] = Field(None, description="Date when the licitación will be opened (acto de apertura)")
    expiration_date: Optional[datetime] = Field(None, description="Deadline for the licitación")

    # CRONOGRAMA - Fechas críticas del proceso
    fecha_publicacion_portal: Optional[datetime] = Field(None, description="Fecha y hora estimada de publicación en el portal")
    fecha_inicio_consultas: Optional[datetime] = Field(None, description="Fecha y hora inicio de consultas")
    fecha_fin_consultas: Optional[datetime] = Field(None, description="Fecha y hora final de consultas")

    # Información adicional del proceso
    etapa: Optional[str] = Field(None, description="Etapa del proceso (Única, Multiple, etc.)")
    modalidad: Optional[str] = Field(None, description="Modalidad del proceso")
    alcance: Optional[str] = Field(None, description="Alcance (Nacional, Provincial, etc.)")
    encuadre_legal: Optional[str] = Field(None, description="Marco legal aplicable")
    tipo_cotizacion: Optional[str] = Field(None, description="Tipo de cotización permitida")
    tipo_adjudicacion: Optional[str] = Field(None, description="Tipo de adjudicación")
    plazo_mantenimiento_oferta: Optional[str] = Field(None, description="Plazo de mantenimiento de la oferta")
    requiere_pago: Optional[bool] = Field(None, description="Si el proceso requiere pago")

    # Información del contrato
    duracion_contrato: Optional[str] = Field(None, description="Duración estimada del contrato")
    fecha_inicio_contrato: Optional[str] = Field(None, description="Fecha estimada inicio del contrato")

    # Detalle de productos/servicios (lista de items)
    items: Optional[List[Dict[str, Any]]] = Field(default=[], description="Detalle de productos o servicios")

    # Garantias
    garantias: Optional[List[Dict[str, Any]]] = Field(default=[], description="Garantías requeridas")


    # Solicitudes de contratación asignadas
    solicitudes_contratacion: Optional[List[Dict[str, Any]]] = Field(default=[], description="Solicitudes de contratación asignadas al proceso")

    # Pliegos de bases y condiciones
    pliegos_bases: Optional[List[Dict[str, Any]]] = Field(default=[], description="Pliegos de bases y condiciones generales")

    # Requisitos mínimos de participación
    requisitos_participacion: Optional[List[str]] = Field(default=[], description="Requisitos mínimos de participación")

    # Actos administrativos
    actos_administrativos: Optional[List[Dict[str, Any]]] = Field(default=[], description="Actos administrativos vinculados")

    # Circulares
    circulares: Optional[List[Dict[str, Any]]] = Field(default=[], description="Circulares del proceso")

    expedient_number: Optional[str] = Field(None, description="File or expedient number")
    licitacion_number: Optional[str] = Field(None, description="Licitación number")
    description: Optional[str] = Field(None, description="Description of the licitación")
    objeto: Optional[str] = Field(None, description="Short synthesis of the procurement object (max 200 chars)")
    contact: Optional[str] = Field(None, description="Contact information")
    source_url: Optional[HttpUrl] = Field(None, description="URL where the licitación was found")
    
    # NEW: Canonical URL system
    canonical_url: Optional[HttpUrl] = Field(None, description="Canonical URL to the process in source system")
    source_urls: Optional[Dict[str, str]] = Field(default={}, description="URLs by source (comprar, boletin, etc.)")
    url_quality: Optional[str] = Field(None, description="URL quality: direct, proxy, partial")
    
    status: str = Field("active", description="Status of the licitación (active, closed, awarded, etc.)")
    fuente: Optional[str] = Field(None, description="Source of the licitación (scraper name)")
    fecha_scraping: Optional[datetime] = Field(None, description="Date when the licitación was scraped")
    tipo_procedimiento: Optional[str] = Field(None, description="Type of procedure for the licitación")
    tipo_acceso: Optional[str] = Field(None, description="Type of access for the licitación")
    tipo: Optional[str] = Field(None, description="Record type: None=licitación, 'decreto'=decreto/resolución")
    jurisdiccion: Optional[str] = Field(None, description="Jurisdiction of the licitación")
    location: Optional[str] = Field(None, description="Geographical location")
    category: Optional[str] = Field(None, description="Category of the licitación")
    budget: Optional[float] = Field(None, description="Budget amount")
    currency: Optional[str] = Field(None, description="Currency of the budget")
    attached_files: Optional[List[Dict[str, Any]]] = Field(default=[], description="List of attached files")
    keywords: Optional[List[str]] = Field(default=[], description="Keywords extracted from the licitación")
    metadata: Optional[Dict[str, Any]] = Field(default={}, description="Additional metadata")
    
    # NEW: Deduplication fields
    content_hash: Optional[str] = Field(None, description="Hash for deduplication")
    merged_from: Optional[List[str]] = Field(default=[], description="IDs of merged licitaciones")
    is_merged: bool = Field(False, description="If this is a merged record")

    # Workflow state
    workflow_state: str = Field("descubierta", description="Workflow state: descubierta, evaluando, preparando, presentada, descartada")
    workflow_history: List[Dict[str, Any]] = Field(default=[], description="History of workflow transitions")

    # Enrichment tracking
    enrichment_level: int = Field(1, description="Enrichment level: 1=basic, 2=detailed, 3=documents")
    last_enrichment: Optional[datetime] = Field(None, description="Timestamp of last enrichment")
    document_count: int = Field(0, description="Number of attached documents")

    # Auto-update tracking
    last_auto_update: Optional[datetime] = Field(None, description="Timestamp of last auto-update check")
    auto_update_changes: Optional[List[Dict[str, Any]]] = Field(default=[], description="History of auto-update detected changes")

    # Public sharing
    is_public: bool = Field(False, description="Whether this licitacion is publicly accessible without auth")
    public_slug: Optional[str] = Field(None, description="URL-safe slug for public access")

    # Nodos (semantic search maps)
    nodos: Optional[List[str]] = Field(default=[], description="IDs of matched nodos")

    # Tags (e.g., LIC_AR for national Argentine sources)
    tags: Optional[List[str]] = Field(default=[], description="Tags for categorization (e.g., LIC_AR)")

    # VIGENCIA MODEL: Estado and lifecycle management
    estado: str = Field("vigente", description="Estado: vigente | vencida | prorrogada | archivada")
    fecha_prorroga: Optional[datetime] = Field(None, description="Nueva fecha si extendida por circular")

    @model_validator(mode='after')
    def validate_dates_and_estado(self):
        """
        Validate date ranges and chronological order.

        Rules:
        1. opening_date >= publication_date (if both exist)
        2. Year range: 2024 <= year <= 2027 (items published < 2025-01-01 become archivada)
        3. NEVER use datetime.utcnow() as fallback
        """
        from utils.dates import validate_date_range, validate_date_order

        # Rule 1: Validate year ranges
        for field_name, date_value in [
            ('publication_date', self.publication_date),
            ('opening_date', self.opening_date),
            ('fecha_prorroga', self.fecha_prorroga),
        ]:
            is_valid, error_msg = validate_date_range(date_value, field_name)
            if not is_valid:
                raise ValueError(error_msg)

        # Rule 2: Validate chronological order
        is_valid, error_msg = validate_date_order(self.publication_date, self.opening_date)
        if not is_valid:
            raise ValueError(error_msg)

        return self


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
    objeto: Optional[str] = None
    contact: Optional[str] = None
    source_url: Optional[HttpUrl] = None
    fecha_scraping: Optional[datetime] = None
    tipo_procedimiento: Optional[str] = None
    tipo_acceso: Optional[str] = None
    tipo: Optional[str] = None
    jurisdiccion: Optional[str] = None
    status: Optional[str] = None
    location: Optional[str] = None
    category: Optional[str] = None
    budget: Optional[float] = None
    currency: Optional[str] = None
    attached_files: Optional[List[Dict[str, Any]]] = None
    keywords: Optional[List[str]] = None
    metadata: Optional[Dict[str, Any]] = None
    # Cronograma
    fecha_publicacion_portal: Optional[datetime] = None
    fecha_inicio_consultas: Optional[datetime] = None
    fecha_fin_consultas: Optional[datetime] = None
    # Info adicional
    etapa: Optional[str] = None
    modalidad: Optional[str] = None
    alcance: Optional[str] = None
    encuadre_legal: Optional[str] = None
    tipo_cotizacion: Optional[str] = None
    tipo_adjudicacion: Optional[str] = None
    plazo_mantenimiento_oferta: Optional[str] = None
    requiere_pago: Optional[bool] = None
    duracion_contrato: Optional[str] = None
    fecha_inicio_contrato: Optional[str] = None
    items: Optional[List[Dict[str, Any]]] = None
    solicitudes_contratacion: Optional[List[Dict[str, Any]]] = None
    pliegos_bases: Optional[List[Dict[str, Any]]] = None
    requisitos_participacion: Optional[List[str]] = None
    actos_administrativos: Optional[List[Dict[str, Any]]] = None
    circulares: Optional[List[Dict[str, Any]]] = None
    garantias: Optional[List[Dict[str, Any]]] = None
    # Workflow
    workflow_state: Optional[str] = None
    workflow_history: Optional[List[Dict[str, Any]]] = None
    # Enrichment
    enrichment_level: Optional[int] = None
    last_enrichment: Optional[datetime] = None
    document_count: Optional[int] = None
    # Auto-update
    last_auto_update: Optional[datetime] = None
    auto_update_changes: Optional[List[Dict[str, Any]]] = None
    # Public sharing
    is_public: Optional[bool] = None
    public_slug: Optional[str] = None
    # Nodos
    nodos: Optional[List[str]] = None
    # Tags
    tags: Optional[List[str]] = None
    # Vigencia
    estado: Optional[str] = None
    fecha_prorroga: Optional[datetime] = None


class Licitacion(LicitacionBase):
    """Model for a licitación stored in the database"""
    id: str = Field(default_factory=lambda: str(uuid4()))
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    first_seen_at: datetime = Field(
        default_factory=datetime.utcnow,
        description="When this item was FIRST discovered (never changes on re-index)"
    )
    
    class Config:
        orm_mode = True
