from elasticsearch import Elasticsearch
import os
from dotenv import load_dotenv
import json

# Cargar variables de entorno
load_dotenv()

# Configuración de Elasticsearch
ELASTICSEARCH_URL = os.getenv("ELASTICSEARCH_URL", "http://localhost:9200")
ELASTICSEARCH_INDEX = os.getenv("ELASTICSEARCH_INDEX", "licitaciones")

# Cliente de Elasticsearch
es_client = Elasticsearch(ELASTICSEARCH_URL)

def create_index_if_not_exists():
    """
    Crea el índice de Elasticsearch si no existe.
    """
    if not es_client.indices.exists(index=ELASTICSEARCH_INDEX):
        # Configuración del índice
        settings = {
            "settings": {
                "number_of_shards": 1,
                "number_of_replicas": 0,
                "analysis": {
                    "analyzer": {
                        "spanish_analyzer": {
                            "type": "spanish"
                        }
                    }
                }
            },
            "mappings": {
                "properties": {
                    "id": {"type": "integer"},
                    "titulo": {"type": "text", "analyzer": "spanish_analyzer"},
                    "descripcion": {"type": "text", "analyzer": "spanish_analyzer"},
                    "organismo": {"type": "text", "analyzer": "spanish_analyzer", "fields": {"keyword": {"type": "keyword"}}},
                    "fecha_publicacion": {"type": "date"},
                    "fecha_cierre": {"type": "date"},
                    "presupuesto": {"type": "float"},
                    "estado": {"type": "keyword"},
                    "url_fuente": {"type": "keyword"},
                    "fecha_creacion": {"type": "date"},
                    "fecha_actualizacion": {"type": "date"}
                }
            }
        }
        es_client.indices.create(index=ELASTICSEARCH_INDEX, body=settings)
        return True
    return False

def index_licitacion(licitacion):
    """
    Indexa una licitación en Elasticsearch.
    
    Args:
        licitacion: Objeto licitación a indexar
    
    Returns:
        Resultado de la operación
    """
    # Convertir el objeto a diccionario si es necesario
    if hasattr(licitacion, "__dict__"):
        licitacion_dict = {k: v for k, v in licitacion.__dict__.items() if not k.startswith('_')}
    else:
        licitacion_dict = licitacion
    
    # Asegurar que el índice existe
    create_index_if_not_exists()
    
    # Indexar documento
    return es_client.index(
        index=ELASTICSEARCH_INDEX,
        id=licitacion_dict["id"],
        body=licitacion_dict
    )

def search_licitaciones(query, filters=None, page=0, size=10):
    """
    Busca licitaciones en Elasticsearch.
    
    Args:
        query: Texto a buscar
        filters: Diccionario con filtros adicionales
        page: Número de página (0-based)
        size: Tamaño de página
    
    Returns:
        Resultados de la búsqueda
    """
    # Asegurar que el índice existe
    create_index_if_not_exists()
    
    # Construir consulta
    search_query = {
        "from": page * size,
        "size": size,
        "query": {
            "bool": {
                "must": []
            }
        },
        "sort": [
            {"fecha_publicacion": {"order": "desc"}}
        ]
    }
    
    # Agregar búsqueda de texto si se proporciona
    if query:
        search_query["query"]["bool"]["must"].append({
            "multi_match": {
                "query": query,
                "fields": ["titulo^3", "descripcion", "organismo^2"]
            }
        })
    else:
        search_query["query"]["bool"]["must"].append({"match_all": {}})
    
    # Agregar filtros si se proporcionan
    if filters:
        for field, value in filters.items():
            if value:
                if field in ["fecha_desde", "fecha_hasta"]:
                    # Manejar filtros de fecha
                    date_field = "fecha_publicacion"
                    range_filter = {"range": {date_field: {}}}
                    
                    if field == "fecha_desde":
                        range_filter["range"][date_field]["gte"] = value
                    else:
                        range_filter["range"][date_field]["lte"] = value
                    
                    search_query["query"]["bool"]["must"].append(range_filter)
                else:
                    # Filtros regulares
                    search_query["query"]["bool"]["must"].append({"term": {field: value}})
    
    # Ejecutar búsqueda
    result = es_client.search(index=ELASTICSEARCH_INDEX, body=search_query)
    
    # Procesar resultados
    hits = result["hits"]["hits"]
    total = result["hits"]["total"]["value"] if "total" in result["hits"] else 0
    
    licitaciones = [hit["_source"] for hit in hits]
    
    return {
        "results": licitaciones,
        "total": total,
        "page": page,
        "size": size
    }

def delete_licitacion(licitacion_id):
    """
    Elimina una licitación del índice.
    
    Args:
        licitacion_id: ID de la licitación a eliminar
    
    Returns:
        Resultado de la operación
    """
    try:
        return es_client.delete(index=ELASTICSEARCH_INDEX, id=licitacion_id)
    except Exception as e:
        print(f"Error al eliminar licitación {licitacion_id}: {e}")
        return None
