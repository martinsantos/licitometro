# Implementación Gran Scraper v2.0

## Resumen de Cambios

Este documento describe la implementación del sistema mejorado de scraping para LICITOMETRO, incluyendo scheduling automático, URLs canónicas y deduplicación.

---

## 🚀 Nuevas Funcionalidades

### 1. Sistema de Scheduling (APScheduler)

**Archivos creados:**
- `backend/services/scheduler_service.py` - Servicio de scheduling
- `backend/routers/scheduler.py` - Endpoints API para control del scheduler
- `backend/models/scraper_run.py` - Modelo para tracking de ejecuciones

**Características:**
- Ejecución automática según cron schedule de cada scraper
- Tracking detallado de cada ejecución (items_found, items_saved, errors, etc.)
- Reintentos automáticos con backoff
- API para control manual (`/api/scheduler/trigger/{scraper_name}`)
- Inicialización automática al iniciar el servidor

**Endpoints API:**
```
POST   /api/scheduler/start              # Iniciar scheduler
POST   /api/scheduler/stop               # Detener scheduler
GET    /api/scheduler/status             # Estado actual
GET    /api/scheduler/jobs               # Jobs programados
POST   /api/scheduler/trigger/{name}     # Ejecutar manualmente
GET    /api/scheduler/runs               # Historial de ejecuciones
GET    /api/scheduler/runs/{id}          # Detalle de ejecución
GET    /api/scheduler/runs/{id}/logs     # Logs de ejecución
GET    /api/scheduler/stats              # Estadísticas agregadas
```

### 2. URLs Canónicas Únicas

**Archivos creados:**
- `backend/services/url_resolver.py` - Resolución de URLs

**Modelo actualizado:**
- `backend/models/licitacion.py` - Nuevos campos: `canonical_url`, `source_urls`, `url_quality`

**Scraper actualizado:**
- `backend/scrapers/mendoza_compra.py` - Genera URLs canónicas y content_hash

**Jerarquía de URL Quality:**
1. **direct** - URL va directamente a la página del proceso (VistaPreviaPliego)
2. **proxy** - URL usa proxy/form submission (/api/comprar/proceso/open)
3. **partial** - URL solo va a la lista (Compras.aspx)

**Endpoints API:**
```
GET    /api/licitaciones/{id}/redirect   # Redirección a URL canónica
GET    /api/licitaciones/{id}/urls       # Todas las URLs disponibles
POST   /api/licitaciones/{id}/resolve-url # Resolver URL específica
GET    /api/licitaciones/stats/url-quality # Estadísticas de calidad de URLs
```

### 3. Sistema de Deduplicación

**Archivos creados:**
- `backend/services/deduplication_service.py` - Servicio de deduplicación

**Algoritmo de matching:**
1. **Mismo número de expediente** → Match exacto
2. **Mismo número de licitación** → Match exacto
3. **Content hash igual** → Match exacto
4. **Similaridad fuzzy > 85%** + misma organización + fechas cercanas → Match

**Estrategia de merge:**
- Conservar datos más completos
- Fusionar URLs de todas las fuentes
- Mantener historial de merges
- Marcar registro como `is_merged = true`

**Endpoints API:**
```
POST   /api/licitaciones/deduplicate?jurisdiccion=Mendoza
```

### 4. Dependencias Agregadas

```
apscheduler>=3.10.4
python-crontab>=1.2.0
fuzzywuzzy>=0.18.0
python-levenshtein>=0.21.0
```

---

## 📁 Estructura de Archivos

```
backend/
├── models/
│   ├── __init__.py              # Exporta ScraperRun
│   ├── licitacion.py            # Nuevos campos: canonical_url, source_urls, url_quality, content_hash
│   ├── scraper_config.py        # (existente)
│   └── scraper_run.py           # NUEVO - Modelo de ejecución
├── services/
│   ├── __init__.py              # Exporta servicios
│   ├── scheduler_service.py     # NUEVO - Scheduling con APScheduler
│   ├── deduplication_service.py # NUEVO - Deduplicación de licitaciones
│   └── url_resolver.py          # NUEVO - Resolución de URLs canónicas
├── routers/
│   ├── __init__.py
│   ├── scheduler.py             # NUEVO - Endpoints de scheduling
│   ├── licitaciones.py          # ACTUALIZADO - Endpoints de URL/deduplicación
│   ├── scraper_configs.py       # (existente)
│   └── comprar.py               # (existente)
├── scrapers/
│   ├── mendoza_compra.py        # ACTUALIZADO - URLs canónicas, content_hash
│   └── ...                      # (otros scrapers)
└── server.py                    # ACTUALIZADO - Auto-inicio de scheduler
```

---

## 🔧 Configuración

### Configuración de Scraper (ejemplo actualizado)

```json
{
  "name": "COMPR.AR Mendoza",
  "url": "https://comprar.mendoza.gov.ar/",
  "active": true,
  "schedule": "0 7,13,19 * * 1-5",
  "selectors": {
    "use_selenium_pliego": true,
    "selenium_max_pages": 9,
    "disable_date_filter": true
  },
  "pagination": {
    "list_urls": [
      "https://comprar.mendoza.gov.ar/Compras.aspx?qs=W1HXHGHtH10="
    ]
  }
}
```

### Variables de Entorno

```bash
# URL base para proxies (debe ser accesible públicamente)
API_BASE_URL=http://localhost:8001

# MongoDB
MONGO_URL=mongodb://localhost:27017
DB_NAME=licitaciones_db
```

---

## 📊 Métricas Esperadas

| Métrica | Antes | Después (Objetivo) |
|---------|-------|-------------------|
| Ejecución automática | Manual | Cada 4 horas (cron) |
| Tracking de ejecuciones | No | Completo con logs |
| URLs directas (PLIEGO) | ~27% | >80% |
| Deduplicación | Manual | Automática |
| Calidad de datos | Variable | Consistente |

---

## 🔄 Flujo de Datos

```
1. Scheduler ejecuta según cron
   ↓
2. Scraper extrae datos + genera URLs canónicas + content_hash
   ↓
3. Datos guardados en MongoDB
   ↓
4. Deduplicación automática (opcional/configurable)
   ↓
5. Frontend consume API con URLs canónicas
```

---

## 🚧 Próximos Pasos

1. **Testing** - Verificar funcionamiento del scheduler
2. **Mejorar captura de URLs PLIEGO** - Optimizar Selenium
3. **Agregar más scrapers** - AYSAM, OSEP, UNCuyo
4. **Dashboard de monitoreo** - UI para ver ejecuciones
5. **Alertas** - Notificaciones cuando scrapers fallan
6. **Escalar a otras provincias** - Buenos Aires, CABA, Córdoba, Santa Fe

---

## 📝 Comandos Útiles

```bash
# Instalar dependencias
pip install -r backend/requirements.txt

# Iniciar scheduler manualmente (ya se inicia automáticamente)
curl -X POST http://localhost:8001/api/scheduler/start

# Ejecutar scraper manualmente
curl -X POST http://localhost:8001/api/scheduler/trigger/COMPR.AR%20Mendoza

# Ver estado del scheduler
curl http://localhost:8001/api/scheduler/status

# Ver últimas ejecuciones
curl http://localhost:8001/api/scheduler/runs

# Ejecutar deduplicación
curl -X POST "http://localhost:8001/api/licitaciones/deduplicate?jurisdiccion=Mendoza"

# Estadísticas de URLs
curl http://localhost:8001/api/licitaciones/stats/url-quality
```

---

## ⚠️ Notas Importantes

1. **Selenium** requiere Chrome/ChromeDriver instalado
2. **Scheduler** se inicia automáticamente con el servidor
3. **Deduplicación** debe ejecutarse manualmente o programarse por separado
4. **URLs proxy** requieren que `API_BASE_URL` sea accesible desde el navegador del usuario

---

*Documento creado: 2026-02-05*
*Versión: 2.0*
