import os
import shutil
from fastapi import UploadFile
import uuid
from datetime import datetime

# Configuración de almacenamiento
STORAGE_DIR = os.getenv("STORAGE_DIR", "/home/ubuntu/licitometro/storage")

# Asegurar que el directorio de almacenamiento existe
os.makedirs(STORAGE_DIR, exist_ok=True)

async def save_file(file: UploadFile, subfolder: str = "") -> str:
    """
    Guarda un archivo subido y devuelve la ruta de almacenamiento.
    
    Args:
        file: Archivo subido
        subfolder: Subcarpeta opcional dentro del directorio de almacenamiento
        
    Returns:
        Ruta completa donde se guardó el archivo
    """
    # Crear nombre único para el archivo
    filename = f"{uuid.uuid4()}_{datetime.now().strftime('%Y%m%d%H%M%S')}_{file.filename}"
    
    # Crear directorio de destino
    dest_dir = os.path.join(STORAGE_DIR, subfolder)
    os.makedirs(dest_dir, exist_ok=True)
    
    # Ruta completa del archivo
    file_path = os.path.join(dest_dir, filename)
    
    # Guardar el archivo
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    return file_path

def get_file_url(file_path: str) -> str:
    """
    Convierte una ruta de archivo en una URL accesible.
    
    Args:
        file_path: Ruta del archivo en el sistema
        
    Returns:
        URL para acceder al archivo
    """
    # Extraer la parte relativa de la ruta
    if STORAGE_DIR in file_path:
        relative_path = file_path.replace(STORAGE_DIR, "").lstrip("/")
        return f"/api/files/{relative_path}"
    return file_path
