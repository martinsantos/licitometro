#!/bin/bash

# Script de inicialización para LICITOMETRO
# Este script configura y arranca todos los servicios necesarios

echo "=== Iniciando LICITOMETRO ==="
echo "Verificando requisitos..."

# Buscar el ejecutable de Docker en ubicaciones comunes de macOS
DOCKER_CMD=""
if [ -f "/usr/local/bin/docker" ]; then
    DOCKER_CMD="/usr/local/bin/docker"
elif [ -f "$HOME/.docker/bin/docker" ]; then
    DOCKER_CMD="$HOME/.docker/bin/docker"
elif [ -f "/Applications/Docker.app/Contents/Resources/bin/docker" ]; then
    DOCKER_CMD="/Applications/Docker.app/Contents/Resources/bin/docker"
fi

# Verificar si se encontró Docker
if [ -z "$DOCKER_CMD" ]; then
    echo "Error: No se pudo encontrar el ejecutable de Docker. Verifique la instalación de Docker Desktop."
    exit 1
fi

echo "Usando Docker en: $DOCKER_CMD"

# Verificar que 'docker compose' está disponible
if ! $DOCKER_CMD compose version &> /dev/null; then
    echo "Error: '$DOCKER_CMD compose' no está disponible. Asegúrese de que Docker Desktop esté actualizado."
    exit 1
fi

echo "Creando directorios necesarios..."
mkdir -p storage

echo "Configurando variables de entorno..."
if [ ! -f backend/.env ]; then
    cp backend/.env.example backend/.env
    echo "Archivo .env creado en backend/. Por favor revise y ajuste las variables si es necesario."
fi

echo "Construyendo y levantando servicios con Docker Compose..."
$DOCKER_CMD compose build
$DOCKER_CMD compose up -d

echo "Esperando a que los servicios estén disponibles..."
sleep 10

echo "Inicializando base de datos..."
$DOCKER_CMD compose exec backend python scripts/init_db.py

echo "Inicializando Elasticsearch..."
$DOCKER_CMD compose exec backend python scripts/init_elasticsearch.py

echo "=== LICITOMETRO está listo ==="
echo "Acceda a la aplicación en: http://localhost:3000"
echo "API disponible en: http://localhost:8000"
echo "Documentación API: http://localhost:8000/docs"