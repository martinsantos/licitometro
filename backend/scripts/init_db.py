import os
import sys
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv
import logging

# Configurar logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("init_db")

# Añadir directorio padre al path para importar modelos
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from models.models import Base, Categoria, EstadoLicitacion, Licitacion, Fuente
from utils.database import engine

def init_db():
    """
    Inicializa la base de datos creando todas las tablas y datos iniciales.
    """
    logger.info("Creando tablas en la base de datos...")
    
    # Crear todas las tablas definidas en los modelos
    Base.metadata.create_all(bind=engine)
    
    # Crear sesión
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()
    
    try:
        # Verificar si ya existen categorías
        if db.query(Categoria).count() == 0:
            logger.info("Creando categorías iniciales...")
            categorias = [
                Categoria(nombre="Infraestructura", descripcion="Proyectos de construcción y mantenimiento de infraestructura pública"),
                Categoria(nombre="Tecnología", descripcion="Adquisición de equipos y servicios tecnológicos"),
                Categoria(nombre="Salud", descripcion="Equipamiento médico y servicios de salud"),
                Categoria(nombre="Educación", descripcion="Material educativo y servicios para instituciones educativas"),
                Categoria(nombre="Transporte", descripcion="Vehículos y servicios de transporte"),
                Categoria(nombre="Consultoría", descripcion="Servicios de asesoría y consultoría"),
                Categoria(nombre="Suministros", descripcion="Provisión de insumos y materiales diversos"),
            ]
            db.add_all(categorias)
        
        # Verificar si ya existen fuentes
        if db.query(Fuente).count() == 0:
            logger.info("Creando fuentes iniciales...")
            fuentes = [
                Fuente(
                    nombre="Portal Nacional de Contrataciones",
                    url="https://www.contrataciones.gov.py",
                    tipo="web",
                    activa=True,
                    configuracion='{"selector": ".licitaciones-table", "pagination": true}'
                ),
                Fuente(
                    nombre="Ministerio de Obras Públicas",
                    url="https://www.mopc.gov.py/licitaciones",
                    tipo="web",
                    activa=True,
                    configuracion='{"selector": "#licitaciones", "pagination": false}'
                ),
            ]
            db.add_all(fuentes)
        
        # Verificar si ya existen licitaciones
        if db.query(Licitacion).count() == 0:
            logger.info("Creando licitaciones de ejemplo...")
            
            # Obtener fuentes y categorías para asociar
            fuente1 = db.query(Fuente).filter(Fuente.nombre == "Portal Nacional de Contrataciones").first()
            fuente2 = db.query(Fuente).filter(Fuente.nombre == "Ministerio de Obras Públicas").first()
            
            cat_infra = db.query(Categoria).filter(Categoria.nombre == "Infraestructura").first()
            cat_tech = db.query(Categoria).filter(Categoria.nombre == "Tecnología").first()
            cat_salud = db.query(Categoria).filter(Categoria.nombre == "Salud").first()
            
            from datetime import datetime, timedelta
            
            licitaciones = [
                Licitacion(
                    titulo="Construcción de puente peatonal en Avenida Principal",
                    descripcion="Proyecto para la construcción de un puente peatonal de 50 metros de longitud en la Avenida Principal, incluyendo rampas de acceso y iluminación LED.",
                    organismo="Ministerio de Obras Públicas",
                    fecha_publicacion=datetime.now() - timedelta(days=10),
                    fecha_cierre=datetime.now() + timedelta(days=20),
                    presupuesto=500000.00,
                    estado=EstadoLicitacion.ACTIVA,
                    url_fuente="https://www.mopc.gov.py/licitaciones/12345",
                    fuente_id=fuente2.id if fuente2 else None
                ),
                Licitacion(
                    titulo="Adquisición de equipos informáticos para escuelas públicas",
                    descripcion="Compra de 500 computadoras portátiles, 100 proyectores y 50 impresoras multifunción para escuelas públicas del país.",
                    organismo="Ministerio de Educación",
                    fecha_publicacion=datetime.now() - timedelta(days=15),
                    fecha_cierre=datetime.now() - timedelta(days=2),
                    presupuesto=750000.00,
                    estado=EstadoLicitacion.CERRADA,
                    url_fuente="https://www.contrataciones.gov.py/licitaciones/67890",
                    fuente_id=fuente1.id if fuente1 else None
                ),
                Licitacion(
                    titulo="Servicio de mantenimiento de áreas verdes",
                    descripcion="Contratación de servicios de mantenimiento de áreas verdes, incluyendo poda, riego y jardinería para parques municipales.",
                    organismo="Municipalidad de San Miguel",
                    fecha_publicacion=datetime.now() - timedelta(days=30),
                    fecha_cierre=datetime.now() - timedelta(days=10),
                    presupuesto=120000.00,
                    estado=EstadoLicitacion.ADJUDICADA,
                    url_fuente="https://www.contrataciones.gov.py/licitaciones/54321",
                    fuente_id=fuente1.id if fuente1 else None
                ),
                Licitacion(
                    titulo="Renovación de flota de vehículos oficiales",
                    descripcion="Adquisición de 20 vehículos tipo sedán para uso oficial de funcionarios de alto rango.",
                    organismo="Ministerio del Interior",
                    fecha_publicacion=datetime.now() - timedelta(days=45),
                    fecha_cierre=datetime.now() - timedelta(days=15),
                    presupuesto=600000.00,
                    estado=EstadoLicitacion.CANCELADA,
                    url_fuente="https://www.contrataciones.gov.py/licitaciones/98765",
                    fuente_id=fuente1.id if fuente1 else None
                ),
                Licitacion(
                    titulo="Construcción de centro de salud comunitario",
                    descripcion="Construcción de un centro de salud comunitario de 500m² con consultorios, sala de emergencias y laboratorio básico.",
                    organismo="Ministerio de Salud",
                    fecha_publicacion=datetime.now() - timedelta(days=5),
                    fecha_cierre=datetime.now() + timedelta(days=25),
                    presupuesto=850000.00,
                    estado=EstadoLicitacion.ACTIVA,
                    url_fuente="https://www.contrataciones.gov.py/licitaciones/24680",
                    fuente_id=fuente1.id if fuente1 else None
                ),
            ]
            
            # Agregar licitaciones
            for licitacion in licitaciones:
                db.add(licitacion)
            
            # Hacer commit para obtener IDs
            db.commit()
            
            # Asociar categorías a licitaciones
            licitaciones[0].categorias.append(cat_infra)  # Puente - Infraestructura
            licitaciones[1].categorias.append(cat_tech)   # Equipos - Tecnología
            licitaciones[4].categorias.append(cat_infra)  # Centro de salud - Infraestructura
            licitaciones[4].categorias.append(cat_salud)  # Centro de salud - Salud
        
        # Guardar cambios
        db.commit()
        logger.info("Base de datos inicializada correctamente.")
        
    except Exception as e:
        logger.error(f"Error al inicializar la base de datos: {e}")
        db.rollback()
        raise
    finally:
        db.close()

if __name__ == "__main__":
    init_db()
