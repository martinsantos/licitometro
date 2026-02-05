# Estado actual: COMPR.AR Mendoza (Scraper + UI)

Fecha: 2026-02-05

---

## ✅ Completado (Fase 1 y 2)

### Scraper COMPR.AR v2.0

- ✅ Scraper COMPR.AR consume el listado oficial en `Compras.aspx?qs=W1HXHGHtH10=`.
- ✅ **NUEVO**: Scraper v2 con caché persistente de URLs PLIEGO
- ✅ **NUEVO**: Sistema de scheduling automático (APScheduler)
- ✅ **NUEVO**: URLs canónicas únicas para cada proceso
- ✅ **NUEVO**: Tracking completo de ejecuciones
- ✅ **NUEVO**: Deduplicación automática

Campos extraídos:
- Número de proceso
- Título
- Tipo de procedimiento
- Fecha/hora de apertura
- Estado (COMPR.AR)
- Unidad ejecutora
- Servicio administrativo/financiero
- Expediente (del PLIEGO)
- Objeto/Descripción completa
- Moneda
- Lugar de recepción

### URLs únicas PLIEGO

COMPR.AR no expone URL única por proceso en el listado; se generan navegando el UI.

Implementación mejorada en v2:
- ✅ Caché persistente en `storage/pliego_url_cache.json` (TTL 24h)
- ✅ Múltiples estrategias de extracción de URLs
- ✅ Reintentos con backoff exponencial
- ✅ Mejor manejo de paginación en Selenium

Estado actual:
- Se detectan ~23 URLs PLIEGO (de ~85 procesos).
- URLs cacheadas no se recalculan (mejora de performance)
- El resto usa proxy HTML (no tiene URL única publicada).

### Sistema de Scheduling

- ✅ Scheduler con APScheduler
- ✅ Ejecución automática: 7am, 1pm, 7pm (días hábiles)
- ✅ Tracking de ejecuciones en MongoDB (`scraper_runs`)
- ✅ API para ejecución manual
- ✅ Estadísticas de ejecución

### URLs Canónicas

- ✅ Campo `canonical_url` en modelo Licitacion
- ✅ Campo `source_urls` (dict por fuente)
- ✅ Campo `url_quality`: direct/proxy/partial
- ✅ Redirección automática: `/api/licitaciones/{id}/redirect`

---

## Cambios clave en código

### `backend/scrapers/mendoza_compra_v2.py` (NUEVO)
- Scraper mejorado con caché de URLs PLIEGO
- Clase `PliegoURLCache` para persistencia
- Método `_collect_pliego_urls_selenium_v2` mejorado
- Estadísticas de ejecución
- Generación de `content_hash` para deduplicación

### `backend/scrapers/mendoza_compra.py` (ACTUALIZADO)
- Campos nuevos: `canonical_url`, `source_urls`, `url_quality`, `content_hash`
- Metadata enriquecida

### `backend/services/scheduler_service.py` (NUEVO)
- Scheduling con APScheduler
- Tracking de ejecuciones
- API de control

### `backend/services/url_resolver.py` (NUEVO)
- Resolución de URLs canónicas
- Clasificación de calidad de URL

### `backend/services/deduplication_service.py` (NUEVO)
- Deduplicación fuzzy matching
- Merge de licitaciones duplicadas

### `backend/routers/scheduler.py` (NUEVO)
- Endpoints para control de scheduler

### `backend/routers/licitaciones.py` (ACTUALIZADO)
- Endpoints de URL: `/redirect`, `/urls`
- Endpoint de deduplicación

### `backend/routers/comprar.py`
- `/api/comprar/proceso/open`: auto-post para abrir en COMPR.AR.
- `/api/comprar/proceso/html`: proxy HTML del proceso.

### Frontend
- `frontend/src/pages/LicitacionesPage.js` - Botones "Ver detalle" y "Ir a COMPR.AR".
- `frontend/src/pages/LicitacionDetailPage.js` - Muestra campos adicionales del PLIEGO.

---

## Configuración

### Scraper Config

`docs/comprar_mendoza_scraper_config.json`:
```json
{
  "name": "COMPR.AR Mendoza",
  "schedule": "0 7,13,19 * * 1-5",
  "selectors": {
    "use_selenium_pliego": true,
    "selenium_max_pages": 9,
    "disable_date_filter": true,
    "cache_ttl_hours": 24
  }
}
```

### Inicialización

```bash
# Cargar configs en MongoDB
python scripts/init_scraper_configs.py

# Verificar estado
curl http://localhost:8001/api/scheduler/status
```

---

## Dependencias / entorno

- Selenium requiere **ChromeDriver** compatible con Chrome.
- APScheduler: `pip install apscheduler`
- fuzzywuzzy: `pip install fuzzywuzzy python-levenshtein`

---

## Resultados actuales

- `storage/comprar_mendoza_run.json` contiene ~85 procesos.
- ~23 con URL PLIEGO real (27%).
- URLs cacheadas en `storage/pliego_url_cache.json`.
- Scheduler ejecutando automáticamente cada 4 horas.

---

## API Endpoints

### Scheduler
```
POST   /api/scheduler/start
POST   /api/scheduler/stop
GET    /api/scheduler/status
GET    /api/scheduler/jobs
POST   /api/scheduler/trigger/{scraper_name}
GET    /api/scheduler/runs
GET    /api/scheduler/runs/{run_id}
GET    /api/scheduler/stats
```

### Licitaciones (URLs)
```
GET    /api/licitaciones/{id}/redirect
GET    /api/licitaciones/{id}/urls
POST   /api/licitaciones/{id}/resolve-url
GET    /api/licitaciones/stats/url-quality
POST   /api/licitaciones/deduplicate
```

---

## 📈 Próximos Pasos (Fase 3)

### Optimización

1) **Aumentar cobertura de PLIEGO a >80%**
   - Analizar por qué ~62 procesos no tienen URL pública
   - Verificar si hay otra vista pública (ComprasElectronicas.aspx)
   - Implementar fallback a detalle vía API interna

2) **Performance**
   - Paralelizar scraping de múltiples fuentes
   - Optimizar tiempos de espera Selenium
   - Cache de páginas HTML

3) **Dashboard de monitoreo**
   - UI para ver ejecuciones en tiempo real
   - Gráficos de estadísticas
   - Alertas de fallos

### Escalado

4) **Nuevas fuentes de Mendoza** (✅ Implementado)
   - ✅ AYSAM (Aguas Mendocinas)
   - ✅ OSEP (Obra Social)
   - ✅ UNCuyo (Universidad)
   - ✅ Vialidad Provincial

5) **Otras provincias**
   - Buenos Aires (compras.gba.gob.ar)
   - CABA (buenosairescompras.gob.ar)
   - Córdoba (compras.cba.gov.ar)
   - Santa Fe (santafe.gov.ar)

---

## 📚 Documentación

- `docs/PLAN_GRAN_SCRAPER.md` - Plan de arquitectura
- `docs/IMPLEMENTACION_SCRAPER_V2.md` - Guía técnica
- `docs/README_SCRAPER_V2.md` - Documentación usuario
- `docs/PROGRESO_SCRAPER_V2.md` - Progreso completo

---

*Última actualización: 2026-02-05*
