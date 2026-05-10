# Licitometro

[![CI Checks](https://github.com/martinsantos/licitometro/actions/workflows/ci.yml/badge.svg)](https://github.com/martinsantos/licitometro/actions/workflows/ci.yml)
[![Main Guard](https://github.com/martinsantos/licitometro/actions/workflows/main-guard.yml/badge.svg)](https://github.com/martinsantos/licitometro/actions/workflows/main-guard.yml)
[![Production Deployment](https://github.com/martinsantos/licitometro/actions/workflows/production.yml/badge.svg)](https://github.com/martinsantos/licitometro/actions/workflows/production.yml)

**Plataforma de monitoreo de licitaciones públicas de Mendoza, Argentina**

🌐 **Producción:** [licitometro.ar](https://licitometro.ar)
📚 **Documentación técnica:** Ver [`CLAUDE.md`](./CLAUDE.md) para arquitectura actual
🔧 **CI/CD Guide:** Ver [`WORKING_WITH_BRANCHES.md`](./WORKING_WITH_BRANCHES.md) para desarrollo con branches

---

## Stack Actual

- **Backend:** FastAPI + MongoDB (Motor async driver)
- **Frontend:** React 19 + TypeScript (Create React App)
- **Scraping:** 24+ fuentes gubernamentales (aiohttp + Selenium + pypdf)
- **Deploy:** Docker Compose en VPS con preview automático por PR

---

## ARQUITECTURA LEGACY (DOCUMENTACIÓN DESACTUALIZADA)

> ⚠️ **Nota:** La siguiente documentación describe una arquitectura legacy con ASTRO y microservicios que **no refleja la implementación actual**.
> Para documentación actualizada, ver [`CLAUDE.md`](./CLAUDE.md)

---

**1. Arquitectura General**

- **Frontend:**
  - **Tecnología:** ASTRO con integración de componentes React y TypeScript.
  - **Características:**
    - Generación de páginas estáticas para un rendimiento óptimo.
    - Uso de islas interactivas con React donde se requiera funcionalidad dinámica.
    - Diseño responsive y accesible (WCAG 2.1).
    - Consumo de APIs RESTful proporcionadas por el backend.

- **Backend:**
  - **Tecnología:** Python 3.11+ con FastAPI.
  - **Estructura:**
    - Microservicios desacoplados para escalabilidad y fácil mantenimiento.
    - Comunicación entre servicios vía APIs REST y mensajería con Redis.

- **Almacenamiento y Bases de Datos:**
  - **PostgreSQL:** Gestión de datos estructurados y persistencia.
  - **Elasticsearch:** Búsquedas full-text y filtros avanzados.
  - **MinIO:** Almacenamiento y gestión de documentos.
  - **Redis:** Cacheo y colas de mensajes para tareas asíncronas.

---

**2. Microservicios Principales**

1. **Servicio de Autenticación:**
   - **Funcionalidad:** Gestión de usuarios, roles y autenticación mediante JWT.
   - **Base de Datos:** PostgreSQL.

2. **Servicio de Búsqueda:**
   - **Funcionalidad:** Búsquedas avanzadas utilizando Elasticsearch.
   - **Características:** Indexación en tiempo real y soporte para búsquedas guardadas.

3. **Servicio de Documentos:**
   - **Funcionalidad:** Almacenamiento, versionado y previsualización de documentos con MinIO.
   - **Características:** Control de acceso granular y verificación de integridad de archivos.

4. **Servicio de Notificaciones:**
   - **Funcionalidad:** Envío de alertas y notificaciones a los usuarios.
   - **Tecnología:** Redis para manejo eficiente de colas de mensajes.

5. **Servicio RECON (Scraping y ETL):**
   - **Funcionalidad:** Sistema de scraping configurable mediante plantillas personalizadas.
   - **Tecnologías:** Scrapy para scraping, Celery para tareas asíncronas, Documind para análisis de documentos.

---

**3. Módulo RECON Integrado**

- **Interfaz Visual de Plantillas:**
  - **Funcionalidad:** Creación y edición de plantillas para mapear campos de origen a destino.
  - **Características:**
    - Propuesta automática de campos de origen detectados.
    - Mapeo mediante drag-and-drop.
    - Definición de reglas de transformación y validación.

- **Plantilla de Ofertas (Campos de Destino):**
  - **Gestión:** Alta, baja y modificación de campos a indexar en la base de datos.
  - **Actualización Dinámica:** Cambios reflejados automáticamente en los procesos de scraping y análisis.

- **Automatización del Scraping:**
  - **Programación:** Escaneos programados N veces al día con Celery.
  - **Monitoreo:** Sistema de reintentos y manejo de errores.

- **Análisis de Documentos:**
  - **Integración con Documind:** Para extraer información de documentos subidos.
  - **Procesamiento:** Soporte para OCR, PDF, Excel, Word y HTML.

---

**4. Flujo de Trabajo**

1. **Configuración Inicial:**
   - El administrador define los campos en la Plantilla de Ofertas.
   - Crea plantillas de scraping específicas para cada fuente utilizando la interfaz visual.

2. **Proceso de Scraping y ETL:**
   - Tareas programadas ejecutan scrapers basados en las plantillas definidas.
   - Datos extraídos se mapean y almacenan en PostgreSQL.
   - Se indexan en Elasticsearch para habilitar búsquedas rápidas.

3. **Análisis de Documentos:**
   - Usuarios suben documentos al sistema.
   - Documind analiza y extrae información relevante según las plantillas.
   - Datos integrados en la base de datos siguiendo los campos definidos.

4. **Interacción del Usuario:**
   - Acceso a través de la interfaz web construida con ASTRO.
   - Visualización de licitaciones, documentos y notificaciones.
   - Funcionalidades interactivas implementadas con componentes React.

---

**5. Consideraciones Técnicas**

- **Seguridad:**
  - Autenticación con JWT y control de acceso basado en roles (RBAC).
  - Encriptación de datos sensibles.
  - Protección contra XSS/CSRF.
  - Registro de auditoría y monitoreo de actividad.

- **Performance:**
  - Carga inicial rápida gracias a la generación estática de ASTRO.
  - Búsquedas optimizadas (<1s) utilizando Elasticsearch.
  - Soporte para más de 100k licitaciones y procesamiento concurrente.

- **Despliegue y Escalabilidad:**
  - Uso de Docker para contenedores de microservicios.
  - Orquestación con Docker Compose o Kubernetes.
  - Balanceo de carga y escalabilidad horizontal.

- **Integraciones Externas:**
  - Conexión con APIs gubernamentales para obtener datos de licitaciones.
  - Servicios de geocodificación para funcionalidades basadas en ubicación.
  - Sistemas de notificaciones (email/SMS) mediante APIs externas.

---

**6. Patrones y Buenas Prácticas**

- **Patrones de Diseño:**
  - **Repository Pattern:** Para la abstracción del acceso a datos.
  - **CQRS:** Separación de operaciones de lectura y escritura para mejorar la escalabilidad.
  - **Event Sourcing:** Registro de cambios en el sistema para trazabilidad.

- **Resiliencia y Manejo de Errores:**
  - **Circuit Breaker:** Para manejar fallos en servicios externos.
  - **Retries con Backoff Exponencial:** En tareas asíncronas fallidas.

---

**7. Roadmap para Implementación Rápida**

- **Fase 1:** Configuración del entorno y desarrollo de microservicios base:
  - Servicio de Autenticación.
  - Servicio de Búsqueda.
  - Servicio de Documentos.

- **Fase 2:** Implementación del Módulo RECON:
  - Desarrollo de la interfaz visual de plantillas con ASTRO y React.
  - Configuración de scrapers básicos con Scrapy y Celery.

- **Fase 3:** Integración de Documind:
  - Configuración para análisis avanzado de documentos.
  - Implementación de OCR y procesamiento de diferentes formatos.

- **Fase 4:** Desarrollo de la Interfaz Frontend:
  - Utilización de ASTRO para generar páginas estáticas de listados y detalles.
  - Implementación de funcionalidades interactivas con islas de React (e.g., filtros dinámicos, mapas).

- **Fase 5:** Pruebas y Despliegue:
  - Realización de pruebas unitarias y de integración.
  - Optimización de performance y seguridad.
  - Despliegue en entorno de producción y monitoreo continuo.

---

**8. Módulo de Enriquecimiento (2025)**

- **Arquitectura Híbrida de Scraping:**
  - **Estrategia Principal:** Cliente HTTP asíncrono (`aiohttp`) para velocidad y eficiencia en portales estándar.
  - **Estrategia Fallback (Browser):** Integración de **Playwright** para sitios con ofuscación por JavaScript (ej. DevExpress en COMPR.AR).
  - **Flujo:** El sistema intenta primero la extracción estática ligera. Si detecta redirecciones a vistas de proveedor o falta de datos, activa automáticamente una instancia de navegador headless para simular la navegación humana y extraer la URL pública real.

---

## 🚀 Desarrollo

### Quick Start

```bash
# Crear branch para feature
git checkout -b feature/mi-feature

# Hacer cambios, commit, push
git add .
git commit -m "Add: Mi feature"
git push -u origin feature/mi-feature

# Crear PR en GitHub → Preview automático en ~2 min
```

### Workflows Automáticos

- **Preview Deploy**: Auto-deploy en cada PR → `pr-X.dev.licitometro.ar`
- **Production Deploy**: Auto-deploy en merge a main → `licitometro.ar`
- **Cleanup**: Auto-cleanup al cerrar PR

Ver guía completa: [`WORKING_WITH_BRANCHES.md`](./WORKING_WITH_BRANCHES.md)

---

## 📖 Documentación

| Archivo | Descripción |
|---------|-------------|
| [`CLAUDE.md`](./CLAUDE.md) | 📘 Documentación técnica completa y actualizada |
| [`WORKING_WITH_BRANCHES.md`](./WORKING_WITH_BRANCHES.md) | 🔧 Guía de desarrollo con branches |
| [`CICD_IMPLEMENTATION_STATUS.md`](./CICD_IMPLEMENTATION_STATUS.md) | ✅ Estado CI/CD pipeline |
| [`docs/CICD.md`](./docs/CICD.md) | 🏗️ Arquitectura CI/CD detallada |
| [`VPS_SETUP_COMPLETE.md`](./VPS_SETUP_COMPLETE.md) | 🖥️ Configuración VPS |

---

## 📊 Status

- **Licitaciones indexadas:** 3,231
- **Fuentes activas:** 24 (provincial + municipal + entes)
- **Uptime:** 99.9%
- **Costo mensual:** $4.99 USD (VPS) + $0 (CI/CD)

---

**Desarrollado con ❤️ en Mendoza, Argentina**
