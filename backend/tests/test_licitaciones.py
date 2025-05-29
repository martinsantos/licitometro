import os
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from main import app
from utils.database import get_db
from models.models import Base

# Crear base de datos en memoria para pruebas
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Sobrescribir la dependencia de base de datos
def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db

# Cliente de prueba
client = TestClient(app)

@pytest.fixture(scope="function")
def test_db():
    # Crear tablas
    Base.metadata.create_all(bind=engine)
    yield
    # Limpiar tablas
    Base.metadata.drop_all(bind=engine)

def test_health_check():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"

def test_create_licitacion(test_db):
    # Datos de prueba
    licitacion_data = {
        "titulo": "Licitación de prueba",
        "organismo": "Organismo de prueba",
        "fecha_publicacion": "2025-05-25T00:00:00.000Z",
        "estado": "activa"
    }
    
    # Crear licitación
    response = client.post("/api/licitaciones/", json=licitacion_data)
    assert response.status_code == 200
    
    # Verificar datos
    data = response.json()
    assert data["titulo"] == licitacion_data["titulo"]
    assert data["organismo"] == licitacion_data["organismo"]
    assert data["estado"] == licitacion_data["estado"]
    assert "id" in data
    
    # Verificar que se puede recuperar
    licitacion_id = data["id"]
    response = client.get(f"/api/licitaciones/{licitacion_id}")
    assert response.status_code == 200
    assert response.json()["id"] == licitacion_id

def test_list_licitaciones(test_db):
    # Crear varias licitaciones
    licitaciones = [
        {
            "titulo": "Licitación 1",
            "organismo": "Organismo 1",
            "fecha_publicacion": "2025-05-20T00:00:00.000Z",
            "estado": "activa"
        },
        {
            "titulo": "Licitación 2",
            "organismo": "Organismo 2",
            "fecha_publicacion": "2025-05-21T00:00:00.000Z",
            "estado": "cerrada"
        },
        {
            "titulo": "Licitación 3",
            "organismo": "Organismo 1",
            "fecha_publicacion": "2025-05-22T00:00:00.000Z",
            "estado": "activa"
        }
    ]
    
    for licitacion in licitaciones:
        client.post("/api/licitaciones/", json=licitacion)
    
    # Listar todas
    response = client.get("/api/licitaciones/")
    assert response.status_code == 200
    assert len(response.json()) == 3
    
    # Filtrar por organismo
    response = client.get("/api/licitaciones/?organismo=Organismo 1")
    assert response.status_code == 200
    assert len(response.json()) == 2
    
    # Filtrar por estado
    response = client.get("/api/licitaciones/?estado=cerrada")
    assert response.status_code == 200
    assert len(response.json()) == 1
    assert response.json()[0]["estado"] == "cerrada"

def test_update_licitacion(test_db):
    # Crear licitación
    licitacion_data = {
        "titulo": "Licitación original",
        "organismo": "Organismo original",
        "fecha_publicacion": "2025-05-25T00:00:00.000Z",
        "estado": "activa"
    }
    
    response = client.post("/api/licitaciones/", json=licitacion_data)
    licitacion_id = response.json()["id"]
    
    # Actualizar licitación
    update_data = {
        "titulo": "Licitación actualizada",
        "estado": "cerrada"
    }
    
    response = client.put(f"/api/licitaciones/{licitacion_id}", json=update_data)
    assert response.status_code == 200
    
    # Verificar actualización
    data = response.json()
    assert data["titulo"] == update_data["titulo"]
    assert data["estado"] == update_data["estado"]
    assert data["organismo"] == licitacion_data["organismo"]  # No debería cambiar

def test_delete_licitacion(test_db):
    # Crear licitación
    licitacion_data = {
        "titulo": "Licitación para eliminar",
        "organismo": "Organismo de prueba",
        "fecha_publicacion": "2025-05-25T00:00:00.000Z",
        "estado": "activa"
    }
    
    response = client.post("/api/licitaciones/", json=licitacion_data)
    licitacion_id = response.json()["id"]
    
    # Eliminar licitación
    response = client.delete(f"/api/licitaciones/{licitacion_id}")
    assert response.status_code == 200
    
    # Verificar que ya no existe
    response = client.get(f"/api/licitaciones/{licitacion_id}")
    assert response.status_code == 404
