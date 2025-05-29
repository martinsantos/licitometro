#!/bin/bash

# Script de inicialización para LICITOMETRO
# Este script configura y arranca todos los servicios necesarios

echo "=== Iniciando LICITOMETRO ==="
echo "Verificando requisitos..."

# Verificar Docker y Docker Compose
if ! command -v docker &> /dev/null; then
    echo "Error: Docker no está instalado. Por favor instale Docker antes de continuar."
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "Error: Docker Compose no está instalado. Por favor instale Docker Compose antes de continuar."
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
docker-compose build
docker-compose up -d

echo "Esperando a que los servicios estén disponibles..."
sleep 10

echo "Inicializando base de datos..."
docker-compose exec backend python scripts/init_db.py

echo "Inicializando Elasticsearch..."
docker-compose exec backend python scripts/init_elasticsearch.py

echo "=== LICITOMETRO está listo ==="
echo "Acceda a la aplicación en: http://localhost:3000"
echo "API disponible en: http://localhost:8000"
echo "Documentación API: http://localhost:8000/docs"
