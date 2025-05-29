from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum

class EstadoLicitacion(str, Enum):
    ACTIVA = "activa"
    CERRADA = "cerrada"
    ADJUDICADA = "adjudicada"
    CANCELADA = "cancelada"

class DocumentoBase(BaseModel):
    nombre: str
    tipo: Optional[str] = None
    tamano: Optional[float] = None
    url: Optional[str] = None
    ruta_almacenamiento: Optional[str] = None

class Documento(DocumentoBase):
    id: int
    licitacion_id: int
    fecha_creacion: datetime
    
    class Config:
        orm_mode = True

class DocumentoCreate(DocumentoBase):
    pass

class CategoriaBase(BaseModel):
    nombre: str
    descripcion: Optional[str] = None

class Categoria(CategoriaBase):
    id: int
    
    class Config:
        orm_mode = True

class LicitacionBase(BaseModel):
    titulo: str
    descripcion: Optional[str] = None
    organismo: str
    fecha_publicacion: datetime
    fecha_cierre: Optional[datetime] = None
    presupuesto: Optional[float] = None
    estado: EstadoLicitacion = EstadoLicitacion.ACTIVA
    url_fuente: Optional[str] = None
    fuente_id: Optional[int] = None

class LicitacionCreate(LicitacionBase):
    pass

class LicitacionUpdate(BaseModel):
    titulo: Optional[str] = None
    descripcion: Optional[str] = None
    organismo: Optional[str] = None
    fecha_publicacion: Optional[datetime] = None
    fecha_cierre: Optional[datetime] = None
    presupuesto: Optional[float] = None
    estado: Optional[EstadoLicitacion] = None
    url_fuente: Optional[str] = None
    fuente_id: Optional[int] = None

class LicitacionDetalle(LicitacionBase):
    id: int
    fecha_creacion: datetime
    fecha_actualizacion: datetime
    documentos: List[Documento] = []
    categorias: List[Categoria] = []
    
    class Config:
        orm_mode = True

class FuenteBase(BaseModel):
    nombre: str
    url: str
    tipo: str
    activa: bool = True
    configuracion: Optional[str] = None

class Fuente(FuenteBase):
    id: int
    fecha_creacion: datetime
    fecha_actualizacion: datetime
    
    class Config:
        orm_mode = True

class FuenteCreate(FuenteBase):
    pass

class FuenteUpdate(BaseModel):
    nombre: Optional[str] = None
    url: Optional[str] = None
    tipo: Optional[str] = None
    activa: Optional[bool] = None
    configuracion: Optional[str] = None
