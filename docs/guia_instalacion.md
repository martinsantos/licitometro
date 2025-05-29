# Guía de Instalación y Ejecución del LICITOMETRO

## Requisitos Previos

Para ejecutar el LICITOMETRO en su entorno local, necesitará tener instalado:

- Docker y Docker Compose
- Git (opcional, para clonar el repositorio)

## Pasos de Instalación

### 1. Obtener el Código Fuente

Clone el repositorio o descargue los archivos del proyecto:

```bash
git clone https://github.com/su-usuario/licitometro.git
cd licitometro
```

### 2. Configuración Inicial

El sistema utiliza variables de entorno para su configuración. Ya se incluyen valores predeterminados adecuados para un entorno de desarrollo local:

```bash
# Si desea personalizar la configuración
cp backend/.env.example backend/.env
# Edite el archivo .env según sus necesidades
```

### 3. Iniciar el Sistema

Ejecute el script de inicialización que configurará y arrancará todos los servicios necesarios:

```bash
chmod +x init.sh
./init.sh
```

Este script realizará las siguientes acciones:
- Verificar que Docker y Docker Compose estén instalados
- Crear los directorios necesarios
- Configurar las variables de entorno
- Construir y levantar los servicios con Docker Compose
- Inicializar la base de datos y Elasticsearch con datos de ejemplo

### 4. Acceder al Sistema

Una vez que todos los servicios estén en funcionamiento, puede acceder al sistema a través de:

- **Interfaz de Usuario**: http://localhost:3000
- **API Backend**: http://localhost:8000
- **Documentación API**: http://localhost:8000/docs

## Estructura del Sistema

El LICITOMETRO está compuesto por los siguientes servicios:

- **Frontend**: Interfaz de usuario desarrollada con ASTRO y React
- **Backend**: API REST desarrollada con FastAPI
- **Base de Datos**: PostgreSQL para almacenamiento persistente
- **Elasticsearch**: Motor de búsqueda para consultas avanzadas

## Funcionalidades Principales

### Gestión de Licitaciones
- Visualización de licitaciones en formato de lista y detalle
- Filtrado por organismo, estado, fechas y texto
- Carga manual de nuevas licitaciones
- Adjuntar documentos a licitaciones

### Administración
- Gestión de fuentes de datos
- Configuración de scraping (próximamente)

## Solución de Problemas

### Servicios no disponibles
Si alguno de los servicios no está disponible después de ejecutar el script de inicialización:

```bash
# Verificar el estado de los contenedores
docker-compose ps

# Ver logs de un servicio específico
docker-compose logs backend
docker-compose logs frontend
```

### Reiniciar el sistema
Si necesita reiniciar el sistema:

```bash
docker-compose down
./init.sh
```

### Limpiar datos y empezar de nuevo
Si desea eliminar todos los datos y comenzar desde cero:

```bash
docker-compose down -v
./init.sh
```

## Desarrollo y Pruebas

Para ejecutar las pruebas del backend:

```bash
cd backend
chmod +x run_tests.sh
./run_tests.sh
```
