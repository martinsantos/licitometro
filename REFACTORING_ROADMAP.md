# Licitometro - Roadmap de Refactoring

**Fecha**: 26 de Febrero 2026
**Estado del sistema**: Produccion estable, 7,083 licitaciones, 24+ fuentes activas

---

## Diagnostico Actual

### Scrapers (28 archivos, 9,483 lineas)

**Lo que funciona bien**:
- Semaforo de concurrencia global (max 6 scrapers simultaneos)
- Circuit breaker por dominio (5 fallos → cooldown 5 min)
- Bulk operations en MongoDB (pre-load + bulk_write)
- Resolucion de fechas con 8 niveles de fallback
- Deduplicacion por content_hash + id_licitacion
- Metricas detalladas por run (items, errores, duracion)
- Limpieza de runs huerfanos (cada 10 min)
- Timeout diferenciado (600s normal, 1200s heavy)

**Lo que necesita mejora**:
| Problema | Impacto | Ubicacion |
|----------|---------|-----------|
| Factory con if/elif de 188 lineas | Mantenibilidad baja | scraper_factory.py |
| Date parsing duplicado en 5 scrapers | Bugs, inconsistencia | mendoza_compra_v2, comprasapps, etc. |
| Budget parsing duplicado (2 implementaciones) | Resultados inconsistentes | generic_html + generic_enrichment |
| Sin health score por scraper | No hay visibilidad de degradacion | scheduler_service.py |
| Scheduling fijo, no adaptivo | Scraping innecesario | scraper_configs |
| Legacy v1 scraper sin usar (1,084 lineas) | Codigo muerto | mendoza_compra.py |
| Sin alertas por degradacion | Problemas no detectados | Falta scraper_health_service |
| Tests limitados (6 scraper tests) | Riesgo de regresiones | tests/scrapers/ |

### CotiZar (3 componentes desconectados)

| Componente | Estado | Problema |
|-----------|--------|---------|
| Frontend CotizarPage.js | Iframe a GitHub Pages | Sin conexion a API, sin datos reales |
| Docker cotizar-api | Container corriendo | Frontend no lo usa (apunta a GitHub) |
| Offer Templates API | Backend funcional | Sin conexion a CotiZar |
| Header.js navigation | Sin link a /cotizar | Usuario no puede descubrir la pagina |
| Variables .env | No documentadas | COTIZAR_COMPANY_NAME, COTIZAR_COMPANY_TAX_ID |

**Resultado**: CotiZar es una maqueta visual (iframe) sin funcionalidad real integrada. Hay un container Docker listo pero no conectado, y una API de templates funcional pero aislada.

---

## Roadmap de Refactoring

### FASE 1: Scrapers - Salud y Observabilidad
**Prioridad**: Alta | **Esfuerzo**: 1-2 dias

#### 1.1 Health Score por Scraper
Crear servicio que calcule salud de cada scraper automaticamente:
- **Success rate**: % de runs exitosos en ultimas 20 ejecuciones
- **Avg duration**: tiempo promedio vs timeout configurado
- **Freshness**: tiempo desde ultimo run exitoso
- **Score**: 0-100, con semaforo visual (verde >80, amarillo 50-80, rojo <50)

```
GET /api/scheduler/health
→ [
    { name: "ComprasApps Mendoza", score: 95, success_rate: 0.95, avg_duration: 45.2 },
    { name: "Boletin Oficial", score: 72, success_rate: 0.80, avg_duration: 120.0 },
    ...
  ]
```

#### 1.2 Alertas de Degradacion
- Si scraper falla 3 runs consecutivos → alerta Telegram + auto-pause
- Si scraper no encuentra items nuevos en 5 runs → warning
- Endpoint manual para reactivar scrapers pausados

#### 1.3 Semaforo Configurable
- Leer `MAX_CONCURRENT_SCRAPERS` de env (default 6)
- Separar por peso: heavy (Selenium/ComprasApps) max 2, light max 6
- Timeout configurable por scraper en ScraperConfig

---

### FASE 2: Scrapers - Limpieza de Codigo
**Prioridad**: Media | **Esfuerzo**: 2-3 dias

#### 2.1 Factory con Registry Pattern
Reemplazar if/elif chain por registro declarativo:
```python
# Antes (188 lineas de if/elif)
if "comprasapps.mendoza.gov.ar" in url: return ComprasApps(config)
elif "comprar.mendoza.gov.ar" in url: return MendozaCompraV2(config)
...

# Despues (~60 lineas)
@register_scraper(url="comprasapps.mendoza.gov.ar")
class ComprasAppsMendozaScraper(BaseScraper): ...
```

#### 2.2 Consolidar Date Parsing
- Toda logica de fecha en `utils/dates.py` (ya existe parcialmente)
- `base_scraper._resolve_publication_date()` como unico punto de entrada
- Eliminar parseo duplicado en scrapers individuales

#### 2.3 Consolidar Budget Parsing
- Crear `utils/budget_parser.py`
- Merge de `generic_html_scraper._parse_budget_text()` y `generic_enrichment._extract_budget_from_text()`
- Una sola funcion: `parse_budget(text) → Optional[float]`

#### 2.4 Eliminar Legacy mendoza_compra.py
- Verificar que MendozaCompraV2 cubre 100% de funcionalidad
- Eliminar v1 (-1,084 lineas de codigo muerto)

---

### FASE 3: Scrapers - Scheduling Inteligente
**Prioridad**: Media | **Esfuerzo**: 1-2 dias

#### 3.1 Frecuencia Adaptiva
- Si scraper no encuentra items nuevos en 3 runs → reducir frecuencia automaticamente
- 5x/dia → 3x/dia → 1x/dia → 1x/semana
- Reset a frecuencia normal cuando encuentra items nuevos
- Campo nuevo: `adaptive_schedule`, `min_interval_hours` en ScraperConfig

#### 3.2 Window de Operacion
- No scrapear entre 22:00-06:00 (reduce carga en VPS y en sitios gov.ar)
- Configurable por scraper (algunos sitios se actualizan de noche)

#### 3.3 Priority Queue
- Scrapers con mas items nuevos recientes → mas prioridad
- ComprasApps (2,601 items) siempre primero
- Scrapers sin items nuevos en 30 dias → baja prioridad

---

### FASE 4: CotiZar - Integracion Real
**Prioridad**: Alta | **Esfuerzo**: 3-5 dias

#### 4.1 Decidir Arquitectura
**Opcion recomendada**: Usar el container Docker existente, eliminando iframe.

El container `cotizar-api` ya esta configurado con:
- `LICITOMETRO_API_URL=http://backend:8000/api` (conexion a API)
- Nginx proxy en `/cotizar`
- Volume persistente para bids
- Health check funcional

#### 4.2 Conectar Frontend
1. **Header.js**: Agregar link "Cotizador" en navegacion
2. **CotizarPage.js**: Reemplazar iframe GitHub Pages por proxy al container Docker
3. Verificar que el container responde correctamente en `/cotizar/`

#### 4.3 Integrar con Datos Reales
- CotiZar debe poder buscar licitaciones de la DB
- Al seleccionar una licitacion → cargar datos (titulo, presupuesto, pliego)
- Generar cotizacion basada en datos reales
- Guardar en offer_applications via API

#### 4.4 Eliminar Zeros y Maquetas
- [ ] Eliminar referencia a `https://martinsantos.github.io/cotizar`
- [ ] Verificar que NO queden datos mock/hardcodeados
- [ ] Documentar variables .env necesarias
- [ ] Test end-to-end: buscar licitacion → cotizar → guardar

---

### FASE 5: Tests y Calidad
**Prioridad**: Media | **Esfuerzo**: 2-3 dias

#### 5.1 Tests de Scrapers
- Test para cada scraper: mock HTTP response → verificar extraccion correcta
- Test de scraper_factory: todas las rutas de routing
- Test de scheduler_service: semaforo, timeout, bulk operations
- Test de enrichment pipeline: nivel 1 → 2 → 3

#### 5.2 Tests de CotiZar
- Test de integracion: frontend → API → DB
- Test de generacion de oferta
- Test de offer_templates CRUD

#### 5.3 Health Check Integral
Script que verifica todo el sistema:
```bash
# Scrapers funcionando
# DB accesible
# CotiZar container respondiendo
# Nginx routing correcto
# SSL valido
```

---

## Metricas de Exito

| Metrica | Actual | Objetivo |
|---------|--------|---------|
| Scraper success rate | Sin medicion | >90% global |
| Lineas de codigo scrapers | 9,483 | <8,000 (-15%) |
| Tests de scrapers | 6 | 15+ |
| CotiZar datos reales | 0% | 100% |
| Maquetas/zeros en CotiZar | 3 componentes | 0 |
| Health dashboard | No existe | Dashboard en /admin/scrapers |
| Scheduling adaptivo | No | Si, con metricas |

---

## Como Empezar

### Para refactoring de scrapers:
```bash
# 1. Leer arquitectura actual
cat memory/refactoring_plan.md

# 2. Empezar por health scoring (Fase 1.1)
# Archivo: backend/services/scraper_health_service.py (nuevo)
# Endpoint: backend/routers/scheduler.py (agregar /health)

# 3. Luego factory refactor (Fase 2.1)
# Archivo: backend/scrapers/scraper_factory.py (reescribir)
```

### Para refactoring de CotiZar:
```bash
# 1. Verificar que container Docker responde
curl http://localhost:3000/cotizar/health

# 2. Agregar link en Header
# Archivo: frontend/src/components/Header.js

# 3. Reemplazar iframe
# Archivo: frontend/src/pages/CotizarPage.js

# 4. Test end-to-end
```

---

## Referencia Rapida: Archivos Clave

### Scrapers
| Archivo | Lineas | Funcion |
|---------|--------|---------|
| `backend/scrapers/base_scraper.py` | 417 | Clase base, date resolution, estado |
| `backend/scrapers/scraper_factory.py` | 188 | Routing URL → scraper class |
| `backend/scrapers/resilient_http.py` | 199 | HTTP client, circuit breaker |
| `backend/services/scheduler_service.py` | 615 | Scheduling, semaforo, bulk ops |
| `backend/services/enrichment_cron_service.py` | 264 | Enrichment periodico |
| `backend/services/generic_enrichment.py` | 615 | Enrichment detallado + PDF/ZIP |

### CotiZar
| Archivo | Funcion |
|---------|---------|
| `frontend/src/pages/CotizarPage.js` | Iframe a GitHub Pages (reemplazar) |
| `frontend/src/components/Header.js` | Navigation (agregar link) |
| `docker-compose.prod.yml:113-144` | Container cotizar-api |
| `nginx/nginx.conf:85-99` | Proxy /cotizar |
| `backend/routers/offer_templates.py` | API templates (conectar) |
| `scripts/deploy-cotizar.sh` | Deploy script |
