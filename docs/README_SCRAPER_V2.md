# LICITOMETRO - Gran Scraper v2.0

## Resumen Ejecutivo

Se ha implementado una arquitectura completa de scraping escalable para LICITOMETRO con las siguientes capacidades:

✅ **Scheduling Automático** - Ejecución periódica según cron  
✅ **URLs Únicas Canónicas** - Cada licitación tiene URL directa al proceso  
✅ **Deduplicación Inteligente** - Fusiona licitaciones duplicadas de múltiples fuentes  
✅ **Tracking Completo** - Monitoreo de cada ejecución con métricas  
✅ **Arquitectura Escalable** - Lista para extender a otras provincias  

---

## 🏗️ Arquitectura

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         SCHEDULER (APScheduler)                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                  │
│  │ COMPR.AR Mza │  │ Boletín Mza  │  │ AYSAM        │  ...             │
│  │ Cada 4 horas │  │ Diario 6am   │  │ Por definir  │                  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘                  │
└─────────┼────────────────┼────────────────┼──────────────────────────┘
          │                │                │
          ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        SCRAPERS (Async)                                 │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  • Extracción de datos                                           │   │
│  │  • Generación de content_hash                                    │   │
│  │  • Resolución de URLs canónicas                                  │   │
│  │  • Detección de calidad de URL (direct/proxy/partial)           │   │
│  └────────────────────────────────┬────────────────────────────────┘   │
└────────────────────────────────────┼────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       PIPELINE DE PROCESAMIENTO                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                  │
│  │ Normalizar   │→ │ Deduplicar   │→ │ Enriquecer   │                  │
│  │ datos        │  │ (fuzzy match)│  │ URLs         │                  │
│  └──────────────┘  └──────────────┘  └──────────────┘                  │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           STORAGE                                       │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  MongoDB                                                         │   │
│  │  ├── licitaciones (con canonical_url, source_urls, url_quality) │   │
│  │  ├── scraper_configs (con schedule cron)                        │   │
│  │  └── scraper_runs (tracking de ejecuciones)                     │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 📋 Componentes Implementados

### 1. Models (`backend/models/`)

| Archivo | Cambios |
|---------|---------|
| `scraper_run.py` | NUEVO - Modelo para tracking de ejecuciones |
| `licitacion.py` | ACTUALIZADO - Campos: `canonical_url`, `source_urls`, `url_quality`, `content_hash` |
| `__init__.py` | ACTUALIZADO - Exporta ScraperRun |

### 2. Services (`backend/services/`)

| Archivo | Función |
|---------|---------|
| `scheduler_service.py` | Scheduling con APScheduler, tracking de ejecuciones |
| `deduplication_service.py` | Deduplicación fuzzy matching + merge de datos |
| `url_resolver.py` | Resolución y clasificación de URLs |
| `__init__.py` | Exporta todos los servicios |

### 3. Routers (`backend/routers/`)

| Archivo | Endpoints |
|---------|-----------|
| `scheduler.py` | `/api/scheduler/*` - Control de scheduling |
| `licitaciones.py` | `/api/licitaciones/{id}/redirect`, `/urls`, `/deduplicate` |
| `server.py` | Auto-inicio de scheduler |

### 4. Scrapers (`backend/scrapers/`)

| Archivo | Cambios |
|---------|---------|
| `mendoza_compra.py` | Genera `content_hash`, `canonical_url`, `source_urls` |

---

## 🚀 API Endpoints Nuevos

### Scheduler
```
POST   /api/scheduler/start
POST   /api/scheduler/stop
GET    /api/scheduler/status
GET    /api/scheduler/jobs
POST   /api/scheduler/trigger/{scraper_name}
GET    /api/scheduler/runs
GET    /api/scheduler/runs/{run_id}
GET    /api/scheduler/runs/{run_id}/logs
GET    /api/scheduler/stats
```

### Licitaciones (URLs)
```
GET    /api/licitaciones/{id}/redirect      # Redirección a URL canónica
GET    /api/licitaciones/{id}/urls          # Todas las URLs disponibles
POST   /api/licitaciones/{id}/resolve-url   # Resolver URL específica
GET    /api/licitaciones/stats/url-quality  # Estadísticas de calidad
POST   /api/licitaciones/deduplicate        # Ejecutar deduplicación
```

---

## 📊 Flujo de Datos

### URL Quality Hierarchy

```
┌────────────────────────────────────────────────────────────┐
│                    URL QUALITY                             │
├────────────────────────────────────────────────────────────┤
│ direct  → VistaPreviaPliegoCiudadano.aspx (URL única)     │
│ proxy   → /api/comprar/proceso/open (auto-submit form)    │
│ partial → Compras.aspx (solo lista)                       │
└────────────────────────────────────────────────────────────┘
```

### Deduplication Strategy

```
┌────────────────────────────────────────────────────────────┐
│              DEDUPLICATION MATCHING                        │
├────────────────────────────────────────────────────────────┤
│ 1. Expediente igual          → Match 100%                 │
│ 2. Número de proceso igual   → Match 100%                 │
│ 3. Content hash igual        → Match 100%                 │
│ 4. Título similar >85%       → Match fuzzy                │
│    + Organización igual                                   │
│    + Fechas cercanas (<7 días)                           │
└────────────────────────────────────────────────────────────┘
```

---

## 🔧 Instalación

### 1. Instalar Dependencias

```bash
cd /Applications/um/licitometro
pip install -r backend/requirements.txt
```

### 2. Verificar Instalación

```bash
python3 scripts/verify_scraper_v2.py
```

### 3. Iniciar Servidor

```bash
cd backend
python server.py
```

El scheduler se inicia automáticamente.

---

## 📈 Uso

### Ver Estado del Scheduler

```bash
curl http://localhost:8001/api/scheduler/status
```

Respuesta:
```json
{
  "running": true,
  "jobs": [
    {
      "id": "scraper_COMPR.AR Mendoza",
      "name": "COMPR.AR Mendoza",
      "next_run_time": "2026-02-05T13:00:00-03:00",
      "trigger": "cron[hour='7,13,19', minute='0']"
    }
  ]
}
```

### Ejecutar Scraper Manualmente

```bash
curl -X POST http://localhost:8001/api/scheduler/trigger/COMPR.AR%20Mendoza
```

### Ver Ejecuciones Recientes

```bash
curl http://localhost:8001/api/scheduler/runs
```

Respuesta:
```json
[
  {
    "id": "uuid",
    "scraper_name": "COMPR.AR Mendoza",
    "status": "success",
    "items_found": 85,
    "items_saved": 12,
    "items_updated": 73,
    "urls_with_pliego": 23,
    "duration_seconds": 245.3,
    "started_at": "2026-02-05T07:00:00",
    "ended_at": "2026-02-05T07:04:05"
  }
]
```

### Ejecutar Deduplicación

```bash
curl -X POST "http://localhost:8001/api/licitaciones/deduplicate?jurisdiccion=Mendoza"
```

### Ver Estadísticas de URLs

```bash
curl http://localhost:8001/api/licitaciones/stats/url-quality
```

Respuesta:
```json
{
  "total": 156,
  "by_quality": {
    "direct": 45,
    "proxy": 89,
    "partial": 22
  },
  "percentages": {
    "direct": 28.85,
    "proxy": 57.05,
    "partial": 14.1
  }
}
```

---

## 📁 Archivos de Documentación

| Archivo | Contenido |
|---------|-----------|
| `docs/PLAN_GRAN_SCRAPER.md` | Plan detallado de arquitectura |
| `docs/IMPLEMENTACION_SCRAPER_V2.md` | Guía de implementación técnica |
| `docs/PROGRESS_COMPRAR_MZA.md` | Estado actual COMPR.AR Mendoza |
| `scripts/verify_scraper_v2.py` | Script de verificación |

---

## 🎯 Próximos Pasos

### Inmediatos (Esta semana)
1. ✅ Testing del scheduler
2. ✅ Optimizar captura de URLs PLIEGO
3. ✅ Agregar scrapers: AYSAM, OSEP, UNCuyo

### Corto plazo (Próximas 2 semanas)
4. Dashboard de monitoreo en frontend
5. Sistema de alertas (email/webhook)
6. Escalar a otras provincias (Buenos Aires, CABA, Córdoba, Santa Fe)

### Mediano plazo (Próximo mes)
7. Integración con Elasticsearch para búsquedas avanzadas
8. Sistema de notificaciones a usuarios
9. API pública para consumo de datos

---

## 📞 Soporte

Para reportar problemas o sugerir mejoras:
- Revisar logs: `backend.log`, `comprar.log`
- Verificar scraper runs: `/api/scheduler/runs`
- Ejecutar verificación: `python3 scripts/verify_scraper_v2.py`

---

*Versión: 2.0*  
*Fecha: 2026-02-05*  
*Autor: Equipo Licitómetro*
