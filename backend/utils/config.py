import os
from dotenv import load_dotenv

# Cargar variables de entorno
load_dotenv()

# Configuración general
APP_NAME = "LICITOMETRO"
APP_VERSION = "1.0.0"
APP_DESCRIPTION = "Sistema de gestión y análisis de licitaciones públicas"

# Configuración de la API
API_PREFIX = "/api"
API_HOST = os.getenv("API_HOST", "0.0.0.0")
API_PORT = int(os.getenv("API_PORT", "8000"))
API_DEBUG = os.getenv("API_DEBUG", "True").lower() in ("true", "1", "t")

# Configuración de CORS
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "*").split(",")

# Configuración de seguridad
SECRET_KEY = os.getenv("SECRET_KEY", "licitometro_secret_key_change_in_production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

# Configuración de logging
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
