from typing import Optional, List
from datetime import datetime, timezone
from pydantic import BaseModel, Field


def _utcnow():
    return datetime.now(timezone.utc)


TIPOS_PROCESO = [
    "Contratacion Directa",
    "Licitacion Privada",
    "Licitacion Publica",
    "Convenio Marco",
    "Concurso de Precios",
    "Otro",
]


class AntecedenteRef(BaseModel):
    id: str
    source: str = "um_antecedentes"  # "um_antecedentes" | "licitaciones" | "manual"
    relevance: str = "media"  # "alta" | "media" | "baja"
    title: Optional[str] = None


class CompanyProfileCreate(BaseModel):
    company_id: str = "default"
    nombre: str = ""
    cuit: str = ""
    email: str = ""
    telefono: str = ""
    domicilio: str = ""
    numero_proveedor_estado: str = ""
    rubros_inscriptos: List[str] = Field(default_factory=list)
    representante_legal: str = ""
    cargo_representante: str = ""
    onboarding_completed: bool = False
    brand_config: Optional[dict] = None  # {logo_svg, website_url, primary_color, accent_color}


class CompanyProfileUpdate(BaseModel):
    nombre: Optional[str] = None
    cuit: Optional[str] = None
    email: Optional[str] = None
    telefono: Optional[str] = None
    domicilio: Optional[str] = None
    numero_proveedor_estado: Optional[str] = None
    rubros_inscriptos: Optional[List[str]] = None
    representante_legal: Optional[str] = None
    cargo_representante: Optional[str] = None
    onboarding_completed: Optional[bool] = None
    brand_config: Optional[dict] = None


class CompanyContextCreate(BaseModel):
    company_id: str = "default"
    zona: str
    tipo_proceso: str = "Otro"

    # Documents
    documentos_requeridos: List[str] = Field(default_factory=list)
    documentos_disponibles: List[str] = Field(default_factory=list)

    # Legal rules
    normativa: str = ""
    garantia_oferta: str = ""
    garantia_cumplimiento: str = ""
    plazo_mantenimiento_oferta: str = ""
    vigencia_contrato_tipo: str = ""
    monto_minimo: Optional[float] = None
    monto_maximo: Optional[float] = None

    # Operational tips
    contacto_nombre: str = ""
    contacto_tel: str = ""
    contacto_email: str = ""
    horario_mesa: str = ""
    tips: List[str] = Field(default_factory=list)
    errores_comunes: List[str] = Field(default_factory=list)

    # Antecedentes
    antecedentes: List[AntecedenteRef] = Field(default_factory=list)

    notas: str = ""


class CompanyContextUpdate(BaseModel):
    zona: Optional[str] = None
    tipo_proceso: Optional[str] = None
    documentos_requeridos: Optional[List[str]] = None
    documentos_disponibles: Optional[List[str]] = None
    normativa: Optional[str] = None
    garantia_oferta: Optional[str] = None
    garantia_cumplimiento: Optional[str] = None
    plazo_mantenimiento_oferta: Optional[str] = None
    vigencia_contrato_tipo: Optional[str] = None
    monto_minimo: Optional[float] = None
    monto_maximo: Optional[float] = None
    contacto_nombre: Optional[str] = None
    contacto_tel: Optional[str] = None
    contacto_email: Optional[str] = None
    horario_mesa: Optional[str] = None
    tips: Optional[List[str]] = None
    errores_comunes: Optional[List[str]] = None
    antecedentes: Optional[List[AntecedenteRef]] = None
    notas: Optional[str] = None
