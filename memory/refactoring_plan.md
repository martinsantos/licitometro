# Refactoring Plan - Internal Memory

**Fecha**: 2026-02-26
**Sesion**: claude/fix-nginx-config-uciAf
**Estado DB**: 7,083 licitaciones, 24+ fuentes activas, sistema en produccion

---

## Cambios Ejecutados (Sesion Actual)

### Arquitectura Licitometro vs CotiZar (Definida)
- **Licitometro** = scrapea, enriquece, almacena, presenta licitaciones
- **CotiZar** = consume SOLO licitaciones marcadas como favoritas en Licitometro
- Favoritos: sistema dual (localStorage + MongoDB coleccion `favorites`)
- API: `GET /api/licitaciones/favorites?full=true` devuelve datos completos para CotiZar
- CotiZar container accede via `LICITOMETRO_API_URL=http://backend:8000/api`

### CotiZar: Iframe eliminado, Docker conectado
- **CotizarPage.js**: Ruta React eliminada (ya no carga iframe a GitHub Pages)
- **App.js**: Ruta `/cotizar` removida del React Router (nginx la sirve directamente)
- **Header.js**: Link "Cotizador" agregado al nav (usa `<a href>` externo, no React Router)
  - Apunta a `/cotizar/` → nginx proxea a container Docker `cotizar-api:3000`
  - Funciona en desktop y mobile nav
- **Arquitectura final**: `/cotizar/*` es servido enteramente por el container Docker
  - Container tiene `LICITOMETRO_API_URL=http://backend:8000/api` (datos reales)
  - Volume persistente para bids generados
  - Health check funcional

### Scrapers: Health Service + Factory Refactor
- **scraper_health_service.py** (NUEVO): Servicio de salud con score 0-100
  - 4 componentes: success_rate (40%), freshness (30%), yield (20%), stability (10%)
  - Auto-pause si 3+ fallos consecutivos
  - Endpoint de reactivacion manual
- **scraper_factory.py**: Refactorizado de if/elif chain a registry pattern
  - URL_REGISTRY: lista ordenada de (url_pattern, scraper_class)
  - NAME_REGISTRY: fallback por nombre
  - GenericHtmlScraper sigue antes del fallback mendoza.gov.ar
  - Misma semantica, mejor mantenibilidad
- **scheduler_service.py**: Health check cada 30 min como job de APScheduler
  - Auto-pausa + notificacion Telegram si scrapers fallan
- **scheduler.py (router)**: 3 nuevos endpoints
  - `GET /api/scheduler/health` — reporte completo con scores
  - `POST /api/scheduler/health/check-and-pause` — trigger manual de auto-pause
  - `POST /api/scheduler/health/reactivate/{name}` — reactivar scraper pausado

---

## Estado Actual del Sistema (Snapshot)

### Scrapers: Arquitectura Actual

**28 archivos, 9,483 lineas totales** en `backend/scrapers/`

| Componente | Lineas | Complejidad | Estado |
|-----------|--------|-------------|--------|
| base_scraper.py | 417 | Alta (date resolution 8-priority) | Produccion estable |
| resilient_http.py | 199 | Alta (circuit breaker, UA rotation) | Produccion estable |
| scraper_factory.py | 188 | Media (if/elif chain) | Funcional, refactorizable |
| scheduler_service.py | 615 | Muy alta (bulk ops, semaforo) | Produccion optimizado |
| generic_html_scraper.py | 455 | Media (config-driven) | Produccion, 10+ sitios |
| mendoza_compra_v2.py | 842 | Muy alta (ASP.NET) | Produccion |
| boletin_oficial_mendoza.py | 890 | Alta (PDF parsing) | Produccion |
| comprasapps_mendoza.py | 583 | Muy alta (GeneXus) | Produccion, 2601 items |
| las_heras_scraper.py | 689 | Muy alta (Selenium) | Produccion |
| Otros 19 scrapers | ~2,500 | Baja-Media | Produccion |

**Concurrencia**:
- Semaforo global: `asyncio.Semaphore(6)` en scheduler_service.py:42
- Per-job: `max_instances=1` + `coalesce=True` en APScheduler
- Per-domain: rate limit 1s min + circuit breaker 5 fails → 5 min cooldown
- Timeout: 600s default, 1200s para Selenium/ComprasApps

**Metricas por run**: items_found, items_saved, items_updated, items_duplicated, duplicates_skipped, duration_seconds, errors[], warnings[], logs[]

### CotiZar: Estado Actual

**Dos implementaciones paralelas desconectadas**:

1. **Frontend iframe** (`CotizarPage.js`):
   - Embeds external: `https://martinsantos.github.io/cotizar`
   - Sin link en Header.js (ruta `/cotizar` existe pero oculta)
   - Sin conexion a API backend
   - Si GitHub Pages bloquea iframe → fallback a link externo

2. **Docker container** (`cotizar-api` en docker-compose.prod.yml):
   - Imagen: `ghcr.io/martinsantos/cotiza:latest`
   - Puerto 3000, proxied por nginx en `/cotizar`
   - Env: `LICITOMETRO_API_URL=http://backend:8000/api`
   - Volume: `cotizar_bids:/app/bids`
   - Health check: `/cotizar/health`
   - **PERO**: Frontend no lo usa (apunta a GitHub Pages)

3. **Offer Templates API** (backend, separado):
   - Router: `/api/offer-templates/*` (277 lineas)
   - Modelos: OfferTemplate, OfferApplication
   - Frontend: OfferTemplatesPage.tsx (admin-only en `/templates`)
   - **Sin conexion** al iframe de CotiZar

**Problemas criticos CotiZar**:
- Navigation disconnect: no hay link en Header
- Iframe apunta a GitHub Pages, Docker container no se usa
- Templates API y CotiZar no comparten datos
- Variables .env (COTIZAR_COMPANY_NAME, COTIZAR_COMPANY_TAX_ID) no documentadas
- Cero datos reales: el iframe carga app externa sin integracion API

### Enrichment Pipeline

**3 niveles**:
1. Basic (scraping): titulo, fecha, fuente, URL
2. Detailed (enrichment cron cada 30 min): objeto, category, description, budget
3. Documents (PDF/ZIP): pliego text, extracted fields

**Servicios**: enrichment_service.py (111 loc), enrichment_cron_service.py (264 loc), generic_enrichment.py (615 loc)

**Regla de oro**: Enrichment NUNCA cambia workflow_state

### Tests

**11 archivos test**:
- `tests/test_utils_dates.py` - Date parsing
- `tests/routers/test_licitaciones_router.py` - API endpoints
- `tests/scrapers/test_*.py` - 6 scraper tests (mock HTTP)
- `scripts/test_scrapers.py` - CLI validation
- `.devcontainer/playwright_test.py` - E2E browser

**Cobertura**: Baja. Sin tests para scheduler_service, enrichment, nodo_matcher.

### CI/CD

**6 workflows** (.github/workflows/):
- ci.yml - Build check en PRs
- production.yml - Deploy a VPS
- preview.yml - Preview por PR
- cleanup.yml - Cleanup previews
- main-guard.yml - Auto-revert commits rotos
- pr-guard.yml - Bloquea PRs con CI rojo

---

## Plan de Refactoring: Scrapers

### Fase 1: Infraestructura Base (Prioridad Alta)

#### 1.1 Health Score por Scraper
**Donde**: Nuevo `backend/services/scraper_health_service.py`
**Que**:
- Calcular health score por scraper: success_rate (last 20 runs), avg_duration, error_rate
- Endpoint: `GET /api/scheduler/health` → dashboard de salud
- Alertas: si success_rate < 70% en last 5 runs → Telegram alert
- Almacenar en coleccion `scraper_health` o como campo en `scraper_configs`

#### 1.2 Semaforo Configurable
**Donde**: scheduler_service.py:42
**Que**:
- Leer MAX_CONCURRENT_SCRAPERS de env var (default 6)
- Semaforo por categoria: heavy (Selenium) = 2 max, light (HTML) = 6 max
- Timeout por categoria: heavy = 1200s, medium = 600s, light = 300s

#### 1.3 Periodos de Scraping Inteligentes
**Donde**: scheduler_service.py + scraper_configs
**Que**:
- Frecuencia adaptiva: si scraper no encuentra items nuevos en 3 runs → reducir frecuencia
- Backoff exponencial por fuente: 5x/dia → 3x/dia → 1x/dia si sin novedades
- Window de operacion: no scrapear entre 22:00-06:00 (reduce carga)
- Campo nuevo en ScraperConfig: `adaptive_schedule: bool`, `min_interval_hours: int`

#### 1.4 Circuit Breaker por Scraper (no solo por dominio)
**Donde**: scheduler_service.py
**Que**:
- Si scraper falla 3 runs consecutivos → pause automatico
- Endpoint manual para re-enable
- Notificacion Telegram cuando se pausa

### Fase 2: Refactoring de Codigo (Prioridad Media)

#### 2.1 Factory Pattern con Registry
**Donde**: scraper_factory.py (188 → ~60 lineas)
**Que**:
```python
SCRAPER_REGISTRY = {
    "comprasapps.mendoza.gov.ar": ComprasAppsMendozaScraper,
    "comprar.mendoza.gov.ar": MendozaCompraScraperV2,
    ...
}
# Decorator pattern para registro automatico
@register_scraper(url_pattern="comprasapps.mendoza.gov.ar")
class ComprasAppsMendozaScraper(BaseScraper): ...
```

#### 2.2 Consolidar Date Parsing
**Donde**: utils/dates.py (unico lugar)
**Que**:
- Mover toda logica de parseo de fecha a utils/dates.py
- Eliminar parseo duplicado en mendoza_compra_v2, comprasapps, generic_enrichment
- base_scraper._resolve_publication_date() ya es canonico → hacer que TODOS lo usen

#### 2.3 Consolidar Budget Parsing
**Donde**: utils/budget_parser.py (nuevo)
**Que**:
- Merge: generic_html_scraper._parse_budget_text() + generic_enrichment._extract_budget_from_text()
- Una sola funcion: `parse_budget(text) -> Optional[float]`
- Soporta formato argentino ($1.234.567,89), USD, montos con palabras

#### 2.4 Eliminar mendoza_compra.py (Legacy v1)
**Donde**: scrapers/mendoza_compra.py (1,084 lineas)
**Que**: Verificar que v2 cubre todos los casos, eliminar v1
**Impacto**: -1,084 lineas

### Fase 3: Observabilidad (Prioridad Media)

#### 3.1 Dashboard de Scrapers
**Donde**: Frontend nueva pagina `/admin/scrapers`
**Que**:
- Tabla con: nombre, last_run, success_rate, items_found_avg, health_score
- Semaforo visual: verde (>80% success), amarillo (50-80%), rojo (<50%)
- Boton trigger manual por scraper
- Log viewer con filtros por nivel

#### 3.2 Metricas de Enrichment
**Donde**: Backend endpoint + frontend
**Que**:
- Enrichment pipeline status: items en level 1, 2, 3
- Colas: items pendientes de enrichment
- Velocidad: items enriquecidos por hora

---

## Plan de Refactoring: CotiZar

### Fase 1: Definir Arquitectura (Decision Requerida)

**Opcion A**: CotiZar como servicio Docker integrado (RECOMENDADO)
- Frontend usa `/cotizar/*` via nginx proxy al container Docker
- Eliminar iframe, usar container existente
- Conectar con API de licitaciones via LICITOMETRO_API_URL

**Opcion B**: CotiZar como pagina React nativa
- Eliminar container Docker + iframe
- Reconstruir UI en React dentro del frontend de Licitometro
- Usar offer_templates API existente como backend

**Opcion C**: CotiZar hibrido (container + integracion frontend)
- Container Docker maneja logica de negocio
- Frontend React agrega UI de seleccion/búsqueda de licitaciones
- API bridge entre ambos

### Fase 2: Eliminar Maquetas y Zeros

**Items a resolver**:
1. **Header.js**: Agregar link `/cotizar` al nav
2. **CotizarPage.js**: Reemplazar iframe por integracion real
3. **OfferTemplatesPage.tsx**: Conectar con CotiZar o eliminar si redundante
4. **.env variables**: Documentar COTIZAR_COMPANY_NAME, COTIZAR_COMPANY_TAX_ID
5. **API contract**: Definir endpoints que CotiZar consume de Licitometro
6. **Datos reales**: Asegurar que CotiZar muestra licitaciones reales de la DB

### Fase 3: Funcionalidad Completa

**Flujo deseado**:
1. Usuario navega licitaciones en Licitometro
2. Selecciona una licitacion → "Cotizar"
3. CotiZar carga datos de la licitacion (titulo, presupuesto, pliego)
4. Usuario configura cotizacion (items, precios, margenes)
5. Genera PDF de oferta
6. Guarda aplicacion en offer_applications

**Endpoints necesarios**:
- `GET /api/licitaciones/{id}` - datos completos (ya existe)
- `GET /api/licitaciones/{id}/documents` - pliegos descargados
- `POST /api/offer-templates/` - guardar template (ya existe)
- `POST /api/offer-templates/{id}/apply/{lic_id}` - aplicar a licitacion (ya existe)

---

## Archivos Clave a Modificar

### Scrapers Refactoring
| Archivo | Accion | Estimacion |
|---------|--------|-----------|
| scraper_factory.py | Reescribir con registry pattern | 2h |
| base_scraper.py | Extraer helpers, limpiar | 1h |
| scheduler_service.py | Health scoring, semaforo configurable | 3h |
| resilient_http.py | Sin cambios (bien implementado) | 0h |
| mendoza_compra.py | Eliminar si v2 es completo | 1h |
| utils/dates.py | Consolidar date parsing | 2h |
| utils/budget_parser.py | Nuevo, merge logica duplicada | 1h |

### CotiZar Refactoring
| Archivo | Accion | Estimacion |
|---------|--------|-----------|
| CotizarPage.js | Reescribir (iframe → integracion real) | 4h |
| Header.js | Agregar link /cotizar | 0.5h |
| docker-compose.prod.yml | Revisar config cotizar-api | 1h |
| nginx.conf | Ya configurado | 0h |
| offer_templates.py | Conectar con CotiZar | 2h |
| .env | Documentar variables | 0.5h |

---

## Decisiones Pendientes

1. **CotiZar**: Opcion A (Docker), B (React nativo), o C (hibrido)?
2. **mendoza_compra.py v1**: Confirmar que v2 cubre 100% de funcionalidad antes de eliminar
3. **Scraper health alerts**: Telegram o email? Umbrales?
4. **Adaptive scheduling**: Activar por default o opt-in por scraper?
5. **Testing**: Invertir en tests unitarios o integration tests primero?

---

## Contexto para Continuar

Al retomar este trabajo, el punto de partida es:
1. Leer este archivo (`memory/refactoring_plan.md`)
2. Leer `REFACTORING_ROADMAP.md` (version usuario)
3. Branch actual: `claude/fix-nginx-config-uciAf`
4. DB: 7,083 licitaciones, produccion estable
5. No hay cambios pendientes de commit
6. Scrapers funcionan, CotiZar esta desconectado
