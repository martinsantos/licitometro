import os
import sys
import logging
from elasticsearch import Elasticsearch
from dotenv import load_dotenv

# Configurar logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("init_elasticsearch")

# Añadir directorio padre al path para importar modelos
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from utils.elasticsearch import create_index_if_not_exists, index_licitacion
from utils.database import get_db
from models.models import Licitacion

def init_elasticsearch():
    """
    Inicializa Elasticsearch creando el índice y indexando las licitaciones existentes.
    """
    logger.info("Inicializando Elasticsearch...")
    
    # Crear índice si no existe
    created = create_index_if_not_exists()
    if created:
        logger.info("Índice de Elasticsearch creado correctamente.")
    else:
        logger.info("El índice de Elasticsearch ya existe.")
    
    # Obtener sesión de base de datos
    db = next(get_db())
    
    try:
        # Obtener todas las licitaciones
        licitaciones = db.query(Licitacion).all()
        
        if licitaciones:
            logger.info(f"Indexando {len(licitaciones)} licitaciones en Elasticsearch...")
            
            # Indexar cada licitación
            for licitacion in licitaciones:
                result = index_licitacion(licitacion)
                if result:
                    logger.debug(f"Licitación {licitacion.id} indexada correctamente.")
                else:
                    logger.warning(f"Error al indexar licitación {licitacion.id}.")
            
            logger.info("Indexación completada.")
        else:
            logger.info("No hay licitaciones para indexar.")
        
    except Exception as e:
        logger.error(f"Error al inicializar Elasticsearch: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    init_elasticsearch()
