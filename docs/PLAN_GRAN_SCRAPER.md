# PLAN: GRAN SCRAPER LICITOMETRO

## Objetivo
Crear un sistema de scraping robusto, escalable y self-hosted para indexar diariamente licitaciones nacionales, comenzando por Mendoza, con URLs únicas para cada proceso.

---

## Estado Actual (Resumen)

### ✅ Lo que ya funciona
1. **Scraper COMPR.AR Mendoza** (`mendoza_compra.py`)
   - Extrae ~85 procesos del listado
   - Usa Selenium para obtener URLs PLIEGO (~23 procesos con URL única)
   - Proxy HTML para procesos sin URL directa
   - Guarda en MongoDB + JSON

2. **Scraper Boletín Oficial Mendoza** (`boletin_oficial_mendoza_scraper.py`)
   - Consume API oficial
   - Filtra por keywords de licitaciones
   - URLs directas a PDFs del boletín

3. **Scrapers base para otras provincias** (esqueletos)
   - Buenos Aires, CABA, Córdoba, Santa Fe

4. **Infraestructura base**
   - FastAPI backend con MongoDB
   - Modelo `ScraperConfig` con campo `schedule` (cron)
   - Sistema de factory de scrapers

### ⚠️ Problemas identificados
1. **No hay scheduler real** - el campo `schedule` existe pero no se ejecuta
2. **URLs no son 100% únicas/canónicas** - algunas usan proxy local
3. **No hay deduplicación** entre fuentes (misma licitación en COMPR.AR y Boletín)
4. **Selenium es lento e inestable** - ~23/85 URLs capturadas
5. **No hay monitoreo** de ejecuciones ni alertas de fallos

---

## Arquitectura Propuesta

### 1. Sistema de URLs Únicas Canónicas

Cada licitación DEBE tener una URL única que apunte al proceso en línea.

```
Formato ID único: {fuente}:{jurisdiccion}:{número_proceso}:{año}
Ejemplo: comprar:mendoza:20701-0020-LPU26:2026

URLs en el sistema:
- Canónica (si existe): https://comprar.mendoza.gov.ar/PLIEGO/VistaPreviaPliegoCiudadano.aspx?qs=...
- Proxy (fallback): /api/licitaciones/{id}/redirect
- Detalle API: /api/licitaciones/{id}
- Detalle UI: /licitacion/{id}
```

#### Estrategia de URL única por fuente:

| Fuente | URL Única | Método |
|--------|-----------|--------|
| COMPR.AR | VistaPreviaPliegoCiudadano.aspx | Selenium + cache |
| Boletín Oficial | PDF del boletín + página | Directa |
| AYSAM | Pliego digital | Scraping + parseo |
| OSEP | Portal COMPR.AR propio | Similar a COMPR.AR |
| UNCuyo | Portal de licitaciones | Scraping |

### 2. Sistema de Scheduling (APScheduler)

Nuevo servicio `scheduler_service.py`:

```python
# Ejecuta scrapers según su configuración cron
# Guarda estado de ejecuciones
# Reintentos con backoff exponencial
# Alertas por email/webhook si falla
```

Configuración de ejemplo:
```json
{
  "name": "COMPR.AR Mendoza",
  "schedule": "0 7,13,19 * * 1-5",
  "active": true,
  "retry_policy": {
    "max_retries": 3,
    "backoff_factor": 2
  }
}
```

### 3. Pipeline de Procesamiento

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐    ┌─────────────┐
│   Fuentes   │───▶│   Scrapers   │───▶│ Normalizer  │───▶│   Storage   │
│             │    │              │    │             │    │             │
│ - COMPR.AR  │    │ - Selenium   │    │ - Deduplic.│    │ - MongoDB   │
│ - Boletín   │    │ - API        │    │ - Enriquecer│    │ - Elastic   │
│ - AYSAM     │    │ - Scrapy     │    │ - Validar   │    │ - Cache     │
└─────────────┘    └──────────────┘    └─────────────┘    └─────────────┘
                                                              │
                                                              ▼
┌─────────────┐    ┌──────────────┐    ┌─────────────┐    ┌─────────────┐
│    Alert    │◀───│   Monitor    │◀───│  Scheduler  │◀───│   Queue     │
│             │    │              │    │             │    │  (Redis)    │
│ - Email     │    │ - Métricas   │    │ - Cron      │    │             │
│ - Webhook   │    │ - Logs       │    │ - Retries   │    │ - Jobs      │
└─────────────┘    └──────────────┘    └─────────────┘    └─────────────┘
```

### 4. Estrategia de Deduplicación

Dos licitaciones son la misma si:
- Mismo número de expediente, O
- Mismo número de proceso + año, O  
- Similaridad de título > 90% + misma organización + fecha cercana

Algoritmo:
```python
def es_misma_licitacion(lic1, lic2):
    # Caso 1: mismo expediente
    if lic1.expedient_number and lic1.expedient_number == lic2.expedient_number:
        return True
    
    # Caso 2: mismo número de proceso
    if lic1.licitacion_number and lic1.licitacion_number == lic2.licitacion_number:
        return True
    
    # Caso 3: similaridad por contenido
    if (similaridad(lic1.title, lic2.title) > 0.9 and 
        lic1.organization == lic2.organization and
        diferencia_dias(lic1.publication_date, lic2.publication_date) <= 7):
        return True
    
    return False
```

### 5. Enriquecimiento de URLs COMPR.AR

Para aumentar las URLs PLIEGO capturadas (~23/85 actualmente):

1. **Cache por proceso** - no recalcular si ya existe
2. **Múltiples puntos de entrada**:
   - VistaPreviaPliegoCiudadano.aspx
   - ComprasElectronicas.aspx
   - Detalle proceso vía API interna
3. **Fallback inteligente**:
   - Intentar URL directa primero
   - Si falla, usar proxy con auto-submit
   - Siempre mostrar badge "PLIEGO disponible" vs "Solo lista"

---

## Plan de Implementación

### Fase 1: Core del Scheduler (Semana 1)

1. **Instalar APScheduler** en el backend
2. **Crear `scheduler_service.py`**:
   - Cargar configuraciones activas
   - Programar jobs según cron
   - Guardar estado en MongoDB
3. **API endpoints**:
   - `POST /api/scheduler/start`
   - `POST /api/scheduler/stop`
   - `GET /api/scheduler/status`
   - `GET /api/scheduler/jobs`
4. **Integrar con docker-compose** (servicio scheduler)

### Fase 2: URLs Únicas y Deduplicación (Semana 1-2)

1. **Mejorar `mendoza_compra.py`**:
   - Cache de URLs PLIEGO (TTL 24h)
   - Reintentos con backoff
   - Parseo de más campos del PLIEGO
   
2. **Nuevo modelo `LicitacionCanonical`**:
   ```python
   class LicitacionCanonical(BaseModel):
       id: str  # comprar:mendoza:20701-0020-LPU26:2026
       urls: Dict[str, str]  # {fuente: url}
       sources: List[str]  # ["comprar", "boletin"]
       canonical_url: str  # La mejor URL disponible
       merged_from: List[str]  # IDs de licitaciones mergeadas
   ```

3. **Servicio de deduplicación**:
   - Ejecutar post-scraping
   - Merge de campos (priorizar el más completo)
   - Mantener historial de merges

### Fase 3: Nuevos Scrapers (Semana 2-3)

Prioridad para Mendoza:
1. **AYSAM Scraper** - pliegos digitales
2. **OSEP Scraper** - portal COMPR.AR propio
3. **UNCuyo Scraper** - portal universitario
4. **Vialidad Scraper** - sitio oficial

Cada uno con:
- Config JSON en `docs/`
- Clase Scraper en `backend/scrapers/`
- Test manual con `scripts/run_{nombre}_once.py`

### Fase 4: Monitoreo y Alertas (Semana 3)

1. **Dashboard de scrapers**:
   - Ejecuciones del día/semana/mes
   - Tasa de éxito por fuente
   - Licencias encontradas vs guardadas
   - URLs únicas capturadas

2. **Sistema de alertas**:
   - Scraper falla N veces seguidas
   - 0 licitaciones en ejecución (anomalía)
   - URLs PLIEGO bajan drásticamente

3. **Logs centralizados**:
   - Estructura JSON para análisis
   - Rotación automática

### Fase 5: Escalado Nacional (Semana 4+)

Replicar patrón para:
1. Buenos Aires (compras.gba.gob.ar)
2. CABA (buenosairescompras.gob.ar)
3. Córdoba (compras.cba.gov.ar)
4. Santa Fe (santafe.gov.ar)

---

## Especificación Técnica Detallada

### Modelo de Datos Actualizado

```python
# backend/models/licitacion.py

class LicitacionBase(BaseModel):
    # ... campos existentes ...
    
    # NUEVO: URL canónica
    canonical_url: Optional[HttpUrl] = Field(None, description="URL única al proceso")
    
    # NUEVO: URLs por fuente
    source_urls: Optional[Dict[str, str]] = Field(default={}, description="URLs por fuente")
    
    # NUEVO: Hash para deduplicación
    content_hash: Optional[str] = Field(None, description="Hash del título+organización+fecha")
    
    # NUEVO: Merge info
    merged_from: Optional[List[str]] = Field(default=[], description="IDs de licitaciones mergeadas")
    is_merged: bool = Field(False, description="Si esta licitación es resultado de merge")

class ScraperRun(BaseModel):
    """Nuevo: registro de ejecución de scraper"""
    id: str
    scraper_name: str
    started_at: datetime
    ended_at: Optional[datetime]
    status: str  # running, success, failed
    items_found: int
    items_saved: int
    items_duplicated: int
    errors: List[str]
    logs: List[str]
```

### API Endpoints Nuevos

```
# Scheduler
POST   /api/scheduler/start
POST   /api/scheduler/stop
GET    /api/scheduler/status
GET    /api/scheduler/jobs
POST   /api/scheduler/trigger/{scraper_name}  # Ejecutar manual

# Scraper runs
GET    /api/scraper-runs                    # Listar ejecuciones
GET    /api/scraper-runs/{id}               # Detalle de ejecución
GET    /api/scraper-runs/{id}/logs          # Logs de ejecución

# Licitaciones con URLs
GET    /api/licitaciones/{id}/redirect      # Redirect a URL canónica
GET    /api/licitaciones/{id}/urls          # Todas las URLs disponibles
POST   /api/licitaciones/deduplicate        # Ejecutar deduplicación manual
```

### Configuración de Scrapers

```json
// docs/comprar_mendoza_scraper_config.json
{
  "name": "COMPR.AR Mendoza",
  "url": "https://comprar.mendoza.gov.ar/",
  "active": true,
  "schedule": "0 7,13,19 * * 1-5",
  "retry_policy": {
    "max_retries": 3,
    "backoff_factor": 2,
    "timeout": 300
  },
  "selectors": {
    "use_selenium_pliego": true,
    "selenium_max_pages": 9,
    "disable_date_filter": true,
    "cache_ttl_hours": 24,
    "pliego_url_patterns": [
      "VistaPreviaPliegoCiudadano.aspx",
      "ComprasElectronicas.aspx"
    ]
  },
  "pagination": {
    "list_urls": [
      "https://comprar.mendoza.gov.ar/Compras.aspx?qs=W1HXHGHtH10="
    ]
  },
  "deduplication": {
    "enabled": true,
    "match_fields": ["licitacion_number", "expedient_number"],
    "similarity_threshold": 0.9
  }
}
```

---

## Métricas de Éxito

| Métrica | Actual | Objetivo |
|---------|--------|----------|
| Procesos COMPR.AR capturados | ~85 | 100% disponibles |
| URLs PLIEGO únicas | ~23 (27%) | >80% |
| Scrapers activos | 2 | 8+ (Mendoza completo) |
| Ejecución automática | Manual | Cada 4 horas |
| Deduplicación | Ninguna | Automática |
| Tiempo de ejecución | ~5 min | <2 min con cache |

---

## Próximos Pasos Inmediatos

1. **Aprobar este plan** ✅
2. **Implementar scheduler básico** con APScheduler
3. **Mejorar captura de URLs PLIEGO** con cache
4. **Implementar deduplicación** básica
5. **Agregar scrapers faltantes** de Mendoza
6. **Crear dashboard** de monitoreo

---

## Anexos

### A. Estructura de archivos propuesta

```
backend/
├── scrapers/
│   ├── __init__.py
│   ├── base_scraper.py
│   ├── scheduler_service.py       # NUEVO
│   ├── deduplication_service.py   # NUEVO
│   ├── comprar_gob_ar.py
│   ├── mendoza_compra.py          # MEJORADO
│   ├── boletin_oficial_mendoza_scraper.py
│   ├── aysam_scraper.py           # NUEVO
│   ├── osep_scraper.py            # NUEVO
│   └── ...
├── routers/
│   ├── __init__.py
│   ├── licitaciones.py            # MEJORADO
│   ├── scraper_configs.py
│   ├── comprar.py
│   └── scheduler.py               # NUEVO
├── models/
│   ├── __init__.py
│   ├── licitacion.py              # MEJORADO
│   ├── scraper_config.py          # MEJORADO
│   └── scraper_run.py             # NUEVO
└── services/
    ├── __init__.py
    ├── url_resolver.py            # NUEVO
    └── notification_service.py    # NUEVO
```

### B. Dependencias adicionales

```
# requirements.txt
apscheduler>=3.10.0
redis>=4.5.0
celery[redis]>=5.3.0  # opcional para scaling
python-crontab>=1.2.0
fuzzywuzzy>=0.18.0
python-levenshtein>=0.21.0  # para fuzzy matching
```

---

*Documento creado: 2026-02-05*
*Última actualización: 2026-02-05*
