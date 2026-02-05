# LICITOMETRO - Reporte de Estado del Proyecto

**Fecha:** 2026-02-05
**Branch:** `claude/analyze-project-status-Esk47`

---

## 1. Resumen Ejecutivo

Licitometro es un sistema de scraping y analisis de licitaciones publicas argentinas, con foco inicial en la **Provincia de Mendoza**. El proyecto tiene una arquitectura full-stack (FastAPI + React) con soporte para multiples fuentes de datos gubernamentales.

**Estado general: MVP funcional con scraping COMPR.AR Mendoza operativo, pero lejos de la vision completa del README (v2.0).**

---

## 2. Grado de Avance por Componente

### 2.1 Backend (FastAPI) - 45% completado

| Modulo | Estado | Detalle |
|--------|--------|---------|
| API REST (CRUD licitaciones) | Funcional | Endpoints GET/POST/PUT/DELETE operativos |
| API REST (scraper configs) | Funcional | CRUD de configuraciones de scrapers |
| API COMPR.AR proxy | Funcional | `/api/comprar/proceso/open` y `/html` operativos |
| MongoDB como BD | Funcional | Motor async, modelos Pydantic definidos |
| Elasticsearch | Configurado | Definido en docker-compose pero sin integracion activa en el flujo de scraping |
| Autenticacion JWT | No implementado | Solo dependencias instaladas, sin endpoints de auth |
| Scheduling (Celery/cron) | No implementado | Los scrapers se ejecutan manualmente, sin programacion automatica |
| Notificaciones | No implementado | Arquitectura planteada en README pero sin codigo |
| PostgreSQL | No utilizado activamente | Definido en docker-compose, pero el codigo usa MongoDB |

### 2.2 Scrapers - Avance detallado

| Scraper | Fuente | Estado | Calidad |
|---------|--------|--------|---------|
| **MendozaCompraScraper** | COMPR.AR Mendoza | **Operativo** | Alta - 617 lineas, Selenium + BS4, paginacion, extraccion de PLIEGO |
| **BoletinOficialMendozaScraper** | Boletin Oficial Mendoza | **Operativo** | Media-Alta - 260 lineas, usa API del portal, filtrado por keywords |
| **ComprarGobArScraper** | COMPR.AR Nacional | **Esqueleto** | Baja - 162 lineas, selectores genericos, probablemente no funcional sin ajuste |
| **MendozaProvinciaScraper** | Mendoza Provincia (general) | **Esqueleto** | Baja - framework provincial generico, necesita validacion |
| **BuenosAiresProvinciaScraper** | Buenos Aires Provincia | **Esqueleto** | Baja - estructura base, sin validacion contra sitio real |
| **CabaScraper** | CABA | **Esqueleto** | Baja - estructura base, sin validacion contra sitio real |
| **CordobaProvinciaScraper** | Cordoba Provincia | **Esqueleto** | Baja - estructura base, sin validacion contra sitio real |
| **SantaFeProvinciaScraper** | Santa Fe Provincia | **Esqueleto** | Baja - estructura base, sin validacion contra sitio real |

**Resumen scrapers:**
- **2 scrapers funcionales** (COMPR.AR Mendoza + Boletin Oficial Mendoza)
- **6 scrapers esqueleto** (estructura base pero sin validacion real)
- **0 scrapers con ejecucion programada**

### 2.3 COMPR.AR Mendoza (Foco Principal) - 65% completado

Este es el componente mas avanzado del proyecto:

| Funcionalidad | Estado | Notas |
|---------------|--------|-------|
| Scraping del listado de procesos | Funcional | ~85 procesos extraidos |
| Extraccion de campos del listado | Funcional | Numero, titulo, tipo, apertura, estado, unidad, SAF |
| Paginacion ASP.NET (postback) | Funcional | Soporta multiples paginas via __doPostBack |
| Selenium para URLs PLIEGO | Funcional con limitaciones | ~23/85 procesos con URL directa (27%) |
| Proxy HTML de procesos | Funcional | Via `/api/comprar/proceso/html` |
| Auto-redirect a COMPR.AR | Funcional | Via `/api/comprar/proceso/open` |
| Extraccion de campos PLIEGO | Parcial | Labels basicos (titulo, expediente, procedimiento) |
| Caching de URLs PLIEGO | No implementado | Cada corrida recalcula todo con Selenium |
| Reintentos/resiliencia Selenium | Basico | Reintentos simples, sin tolerancia a stale elements |
| Filtro por fecha (ventana 3 dias habiles) | Funcional | Configurable via `business_days_window` |

### 2.4 Boletin Oficial Mendoza - 50% completado

| Funcionalidad | Estado | Notas |
|---------------|--------|-------|
| Consulta API de busqueda avanzada | Funcional | Usa `portalgateway.mendoza.gov.ar/api/boe/advance-search` |
| Filtrado por keywords | Funcional | 10 keywords predefinidas (licitacion, contratacion, etc.) |
| Filtro estricto regex | Funcional | Reduce ruido con patron regex |
| Parseo de resultados HTML | Funcional | Extrae tipo, norma, fechas, organizacion |
| Extraccion de PDFs | Parcial | Links a "Texto Publicado" con deep-link a pagina |
| Ventana de dias habiles | Funcional | Configurable |

### 2.5 Frontend (React) - 40% completado

| Funcionalidad | Estado | Notas |
|---------------|--------|-------|
| Listado de licitaciones | Funcional | Tabla con columnas, paginacion, filtros |
| Filtros (estado, org, ubicacion, fuente) | Funcional | Dropdowns con fetch dinamico |
| Busqueda por texto | Funcional | Endpoint `/search` |
| Detalle de licitacion | Basico | Muestra campos principales + PLIEGO si existe |
| Botones COMPR.AR | Funcional | "Ver detalle" (proxy) + "Ir a COMPR.AR" (PLIEGO/open) |
| Admin de scrapers | Esqueleto | Componente `ScraperList.js` basico |
| Admin de fuentes | Esqueleto | `AdminFuentes.tsx` basico |
| Responsive/mobile | Parcial | Tailwind CSS pero sin optimizacion mobile |
| Autenticacion UI | No implementado | Sin login/registro |
| Dashboard/metricas | No implementado | Sin graficos ni KPIs |

### 2.6 Infraestructura - 35% completado

| Componente | Estado | Notas |
|------------|--------|-------|
| Docker Compose (dev) | Funcional | PostgreSQL + Elasticsearch + Backend + Frontend |
| Dockerfile (produccion) | Definido | Multi-stage build con Nginx |
| Nginx config | Definido | Proxy reverso configurado |
| MongoDB | En uso | Pero no en docker-compose (conexion local/externa) |
| Redis | No integrado | Solo en requirements.txt |
| MinIO | No integrado | Mencionado en README, sin implementacion |
| Kubernetes | No integrado | Solo dependencia en requirements.txt |
| Monitoring (Prometheus) | No integrado | Solo dependencia en requirements.txt |
| CI/CD | No existe | Sin GitHub Actions ni pipelines |

---

## 3. Fuentes de Mendoza: Estado de Cobertura

De las 8 fuentes identificadas en `docs/fuentes_mendoza.md`:

| # | Fuente | Scraper | Estado |
|---|--------|---------|--------|
| 1 | **COMPR.AR Mendoza** | `mendoza_compra.py` | **Operativo** |
| 2 | **Direccion de Compras y Suministros** | -- | No iniciado |
| 3 | **Boletin Oficial Mendoza** | `boletin_oficial_mendoza_scraper.py` | **Operativo** |
| 4 | **IPV (Instituto Provincial de la Vivienda)** | -- | No iniciado |
| 5 | **AYSAM (Aguas Mendocinas)** | -- | No iniciado |
| 6 | **OSEP (Obra Social)** | -- | No iniciado |
| 7 | **Vialidad Provincial** | -- | No iniciado |
| 8 | **UNCuyo** | -- | No iniciado |

**Cobertura Mendoza: 2/8 fuentes (25%)**

---

## 4. Brechas Criticas (Vision vs Realidad)

El README describe una arquitectura "LICITOMETRO 2.0 con Modulo RECON" que incluye microservicios, CQRS, Event Sourcing, Celery, Documind, MinIO, RBAC, etc. La implementacion real es significativamente mas simple:

| Vision (README) | Realidad |
|-----------------|----------|
| Microservicios desacoplados | Monolito FastAPI unico |
| PostgreSQL + Elasticsearch + MinIO + Redis | MongoDB (principal), Elasticsearch (sin usar), PostgreSQL (definido sin uso) |
| Celery para scheduling | Sin scheduling automatico |
| Documind para OCR/analisis | Sin integracion |
| ASTRO con islas React | Create React App clasico (con algunos archivos .astro sin build) |
| JWT + RBAC | Sin autenticacion |
| Circuit Breaker + Event Sourcing | Sin patrones avanzados |
| 100k+ licitaciones | ~85 procesos COMPR.AR Mendoza |

---

## 5. Lo Que Funciona Hoy

1. **Scraping COMPR.AR Mendoza**: extrae ~85 procesos con datos del listado, ~23 con URL PLIEGO directa
2. **Scraping Boletin Oficial Mendoza**: busqueda por keywords en API oficial
3. **API REST**: CRUD completo de licitaciones con MongoDB
4. **Proxy COMPR.AR**: ver detalle HTML y abrir proceso en COMPR.AR
5. **Frontend basico**: tabla de licitaciones con filtros, busqueda, paginacion y botones de accion
6. **Docker Compose**: levanta el stack de desarrollo

---

## 6. Recomendaciones de Prioridad (Proximo Sprint)

### Prioridad 1 - Fundacional
1. **Implementar scheduling automatico** - Correr scrapers diariamente sin intervencion manual (cron o APScheduler, sin necesidad de Celery)
2. **Persistencia real** - Asegurar que cada corrida del scraper guarde en MongoDB y no solo en JSON local
3. **Deduplicacion** - Evitar registros duplicados entre corridas sucesivas

### Prioridad 2 - Cobertura Mendoza
4. **Completar fuentes Mendoza** - Priorizar IPV, AYSAM y Vialidad (publican licitaciones con adjuntos PDF)
5. **Mejorar cobertura PLIEGO** - Caching de URLs ya descubiertas, evitar re-scraping Selenium innecesario

### Prioridad 3 - Calidad
6. **Tests reales** - Los tests existentes son esqueletos; agregar tests de integracion con mocks
7. **Elasticsearch activo** - Conectar la indexacion al flujo de guardado para busqueda full-text real
8. **Error handling robusto** - Agregar Circuit Breaker basico y logging estructurado

### Prioridad 4 - UX
9. **Dashboard de estado** - Mostrar cuando se ejecuto cada scraper, cuantos resultados, errores
10. **Mejorar mobile** - La tabla actual no es usable en pantallas chicas

---

## 7. Metricas del Repositorio

| Metrica | Valor |
|---------|-------|
| Commits totales en main | ~20 |
| PRs mergeados | 2 |
| Issues abiertos | 0 |
| Branches activos | 4 (main + 3 feature) |
| Tests unitarios | ~6 archivos (esqueletos) |
| Lineas de codigo backend | ~2,500 |
| Lineas de codigo frontend | ~1,500 |
| Scrapers implementados | 8 (2 funcionales, 6 esqueleto) |
| Fuentes Mendoza cubiertas | 2/8 (25%) |
| Fecha inicio proyecto | 2025-05-17 |
| Ultimo push | 2026-02-05 |

---

## 8. Diagrama de Estado

```
LICITOMETRO - Estado Actual (Feb 2026)

FUNCIONAL                    EN PROGRESO              NO INICIADO
---------                    -----------              -----------
[x] API REST CRUD            [ ] Scheduling auto      [ ] Auth JWT/RBAC
[x] COMPR.AR Mza scraper     [ ] Tests reales         [ ] Notificaciones
[x] Boletin Mza scraper      [ ] Elasticsearch        [ ] Documind/OCR
[x] Proxy COMPR.AR           [ ] +6 fuentes Mza       [ ] CI/CD
[x] Frontend tabla+filtros   [ ] Mobile UX            [ ] Monitoring
[x] Docker Compose           [ ] Dashboard admin      [ ] Microservicios
[x] MongoDB storage          [ ] Deduplicacion        [ ] Redis/MinIO
```

---

*Generado automaticamente a partir del analisis del repositorio en 2026-02-05.*
