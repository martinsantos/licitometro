# Licitometro - Documentacion del Proyecto

Plataforma de monitoreo de licitaciones publicas de Mendoza, Argentina. 24+ fuentes gubernamentales, enriquecimiento automatico, interfaz web con filtros, busqueda, nodos semanticos y notificaciones.

**Produccion**: https://licitometro.ar | **VPS**: 76.13.234.213 (srv1342577.hstgr.cloud) | **DNS**: Cloudflare (proxy enabled)

## Stack

| Capa | Tecnologia |
|------|-----------|
| Backend | FastAPI + Gunicorn (Python 3.11) |
| DB | MongoDB 7.0 (Motor async) |
| Frontend | React 18 + TypeScript |
| Infra | Docker Compose (mongodb + backend + nginx + certbot) |
| Proxy/SSL | Nginx 1.25 + Let's Encrypt |
| Notif | Telegram @Licitobot + Email (Postfix local relay) |
| IA | OpenClaw + Gemini 2.5 Flash — @Licitometrobot (systemd, fuera de Docker) |
| Scraping | aiohttp + Selenium (JS) + pypdf (PDFs) |

## Estructura del Proyecto

```
licitometro/
├── backend/
│   ├── server.py                  # FastAPI app, middleware, routers
│   ├── models/licitacion.py       # LicitacionCreate/InDB/Update (Pydantic)
│   ├── db/models.py               # MongoDB doc → dict entity mappers
│   ├── routers/
│   │   ├── licitaciones.py        # CRUD + search + filters + stats
│   │   ├── nodos.py               # Nodos CRUD + rematch
│   │   ├── scheduler.py           # Scraper scheduling
│   │   ├── workflow.py            # Workflow state transitions
│   │   ├── auth.py                # Login/logout/token-login (JWT cookie)
│   │   ├── comprar.py             # COMPR.AR proxy endpoints
│   │   └── public.py              # Public health/stats
│   ├── scrapers/
│   │   ├── base_scraper.py        # Base class (aiohttp + ResilientHttpClient)
│   │   ├── scraper_factory.py     # URL/name → scraper class routing
│   │   ├── resilient_http.py      # Anti-ban: UA rotation, backoff, circuit breaker
│   │   ├── mendoza_compra_v2.py   # COMPR.AR Mendoza (HTTP-only, ASP.NET postback)
│   │   ├── comprar_nacional_scraper.py  # COMPR.AR Nacional (fast-fail on 503)
│   │   ├── comprasapps_mendoza_scraper.py  # hli00049 servlet (GeneXus)
│   │   ├── generic_html_scraper.py # Config-driven CSS selector scraper
│   │   ├── boletin_oficial_mendoza_scraper.py  # PDF gazette
│   │   ├── godoy_cruz_scraper.py  # GeneXus JSON grid
│   │   ├── las_heras_scraper.py   # Selenium Oracle APEX
│   │   └── [aysam, osep, uncuyo, vialidad, emesa, epre]_scraper.py
│   ├── services/
│   │   ├── generic_enrichment.py  # HTML/PDF/ZIP enrichment pipeline
│   │   ├── cross_source_service.py # HUNTER cross-source search
│   │   ├── nodo_matcher.py        # Fuzzy keyword matching (Spanish stemming)
│   │   ├── nodo_digest_service.py # Per-nodo digest (9:15am + 6pm)
│   │   ├── notification_service.py # Daily digest 9am (Telegram + Email)
│   │   ├── scheduler_service.py   # Cron scheduling
│   │   ├── vigencia_service.py    # Estado computation + batch update
│   │   ├── category_classifier.py # Auto-classification (rubros)
│   │   ├── auth_service.py        # bcrypt + JWT
│   │   └── [workflow, enrichment, auto_update, smart_search, dedup, storage_cleanup, url_resolver]_service.py
│   └── utils/
│       ├── dates.py               # parse_date_guess (16 formats, Spanish months)
│       ├── object_extractor.py    # extract_objeto(), is_poor_title()
│       ├── text_search.py         # strip_accents(), build_accent_regex()
│       ├── proceso_id.py          # extract_identifiers_from_text(), normalize_proceso_id()
│       └── filter_builder.py      # build_base_filters() — single source of truth BE
├── frontend/src/
│   ├── components/licitaciones/   # LicitacionCard, LicitacionTable, FilterSidebar, MobileFilterDrawer, SearchBar, SortDropdown, ActiveFiltersChips, EstadoBadge
│   ├── components/nodos/          # NodoBadge, NodoCard, NodoForm
│   ├── hooks/                     # useLicitacionData, useLicitacionFilters, useFacetedFilters, useNodos, useDebounce
│   ├── types/licitacion.ts        # Licitacion, FilterState, SortField
│   ├── utils/filterParams.ts      # buildFilterParams() — single source of truth FE
│   └── pages/                     # LicitacionesList.tsx, NodosPage.tsx
├── docker-compose.prod.yml
├── nginx/nginx.conf               # SSL, rate limiting, gzip, SPA fallback
└── scripts/                       # deploy-prod.sh, backup-mongodb.sh, restore-mongodb.sh, health_monitor.sh
```

---

## Patrones Criticos

### Agregar un campo nuevo al modelo — 3 lugares obligatorios
1. `backend/models/licitacion.py` — Pydantic model
2. `backend/db/models.py` — `licitacion_entity()` mapper
3. `frontend/src/types/licitacion.ts` — TypeScript interface

### Routing de scrapers (`scraper_factory.py`)
Rutea por URL primero, luego por nombre. Rutas especificas ANTES de fallbacks genericos.
**CRITICO**: Check de `scraper_type=generic_html` DEBE ir ANTES del fallback `mendoza.gov.ar`, o URLs como `ipvmendoza.gov.ar` son capturadas por substring match.

### Route ordering en FastAPI
Rutas fijas (`/stats/*`, `/search/*`) ANTES de rutas con path params (`/{id}`) en `routers/licitaciones.py`.

### MongoDB: NUNCA usar model_dump(mode='json')
Convierte datetimes a ISO strings. MongoDB ordena strings y dates por separado (BSON types distintos). Usar `model_dump()` (modo python).

### COMPR.AR URLs (CRÍTICO)
- `VistaPreviaPliegoCiudadano.aspx?qs=...` → ESTABLE, datos ricos
- `ComprasElectronicas.aspx?qs=...` → SESSION-DEPENDENT, resuelve al homepage sin sesión
- NUNCA reintroducir Selenium para listing. HTTP postback extrae el mismo HTML en 82s vs 15 min.
- **VIEWSTATE es per-page**: guardar hidden fields por página para detail postbacks correctos
- **Pager rows**: filtrar con `_is_pager_row()` (regex `^[\d\s.…]+$`)
- **Retry-After**: capear a `max_delay` (120s). comprar.gob.ar envía 3600s.

### Encoding de servidores
Leer raw bytes con `response.read()`, decodificar con fallback UTF-8 → Latin-1. NUNCA `response.text()`.

### SSL en sitios gov.ar
`ResilientHttpClient` usa `TCPConnector(ssl=False)` globalmente (certs rotos).

### title_selector en GenericHtmlScraper
El primer match DOM gana. Si hay `<h2>` antes de `<h1>`, usar `title_selector: "h1"` (no `"h1, h2"`). Ejemplo: COPIG.

### Docker IPv6 para ISPs que bloquean datacenter (200.58.x.x)
3 configs necesarias simultáneamente:
1. `/etc/docker/daemon.json`: `{"ipv6": true, "fixed-cidr-v6": "...", "ip6tables": true}`
2. `sysctl net.ipv6.conf.all.forwarding=1` (persistir en `/etc/sysctl.conf`)
3. `docker-compose.prod.yml`: `enable_ipv6: true` + subnet IPv6. Subnet prod: `2a02:4780:6e:9b84:2::/80`
Fuentes afectadas: COPIG, La Paz, San Carlos.

### Pliego vs Presupuesto
Algunas fuentes publican costo del pliego (0.01%-0.5% del presupuesto real). Godoy Cruz: ratio 1:1000.
Guardar en `metadata.costo_pliego`, estimar como `pliego * ratio`, marcar `metadata.budget_source = "estimated_from_pliego"`.
Ver `memory/pliego_budget_pattern.md`.

### Objeto vs Title
`objeto` = objeto de la contratacion (max 200 chars). Frontend muestra `objeto || title`. Extracción via `utils/object_extractor.py` (5 estrategias en cadena).

### Dropdown "Agrupar por" en Mobile
Visible solo en `<lg` (`lg:hidden`), entre ViewToggle y botón "Filtros". Select nativo con emojis, bg-gray-100, text-xs. Permite cambiar `groupBy` sin abrir MobileFilterDrawer.

### GOLDEN RULE: ENRICHMENT NUNCA CAMBIA WORKFLOW STATE
`enrichment_level` (1→2→3) = completitud de datos. `workflow_state` = estado de negocio (solo MANUAL via PUT /workflow).
Enrichment services SOLO tocan: objeto, category, description, budget, enrichment_level. NUNCA workflow_state.

### Filtros — Pipeline (Single Source of Truth)
1. `FilterState` en `types/licitacion.ts` — 15 campos
2. `buildFilterParams()` en `utils/filterParams.ts` — FilterState → URLSearchParams
3. `build_base_filters()` en `backend/utils/filter_builder.py` — params → MongoDB query
Usado por: listing (`GET /`), facets (`GET /facets`), debug-filters, count.

---

## Taxonomía de Fechas

| Campo | Cuándo cambia | Uso correcto |
|-------|---------------|--------------|
| `first_seen_at` | NUNCA (solo en INSERT) | Badge "NUEVO", filtro "Nuevas de hoy" |
| `fecha_scraping` | En CADA scrape | DailyDigestStrip, actividad de indexación |
| `publication_date` | NUNCA (dato fuente) | Filtros de rango, year archival |
| `opening_date` | NUNCA (dato fuente, puede cambiar por circular) | Deadlines, urgencia |
| `created_at` | NUNCA | Debug, auditoría |

**Filtros de fecha sincronizados**: `nuevasDesde` + `fechaDesde/fechaHasta` se sincronizan para días únicos (activar uno activa ambos). Implementado en `handleToggleTodayFilter()`, `handleDaySelect()`, `handleFilterChange()`, `handleLoadPreset()`.

API params: `fecha_desde`+`fecha_hasta`+`fecha_campo` (genérico) | `nuevas_desde` (first_seen_at específico) | `year` (publication_date del año).

---

## Fuentes de Datos

| Fuente | Scraper | Items | Notas |
|--------|---------|-------|-------|
| ComprasApps Mendoza | comprasapps_mendoza | ~2601 | GeneXus servlet, multi-year, estado V+P, 37 CUCs |
| COMPR.AR Mendoza | mendoza_compra_v2 | ~101 | HTTP-only, ASP.NET postback, 82s, cache 7d |
| COMPR.AR Nacional | comprar_nacional | ~0 | fast-fail on 503, comprar.gob.ar blocked |
| Boletin Oficial Mendoza | boletin_oficial_mendoza | ~54 | PDF gazette, pypdf |
| COPIG Mendoza | generic_html | ~50 | title_selector=h1, IPv6 |
| San Carlos | generic_html | ~50 | WordPress+Elementor, IPv6 |
| OSEP | osep | ~45 | |
| Maipu | generic_html (inline) | ~41 | ZIP enrichment |
| La Paz | generic_html | ~30 | IPv6 required |
| IPV Mendoza | generic_html | ~28 | h2.entry-title links |
| Santa Rosa/Junin/Rivadavia/Guaymallen/Malargue/General Alvear/Ciudad Mza/Lujan/Tupungato | generic_html | varios | CMS |
| Vialidad Mendoza | vialidad_mendoza | ~10 | |
| Godoy Cruz | godoy_cruz | ~10 | GeneXus JSON grid, pliego→budget 1:1000 |
| Irrigacion | generic_html | ~9 | JHipster (limitado) |
| EPRE Mendoza | epre | ~4 | Flatsome layout |
| AYSAM | aysam | ~3 | |
| UNCuyo | uncuyo | ~3 | |
| Las Heras | las_heras | ~3 | Selenium Oracle APEX |
| EMESA | generic_html | ~3 | WAF solo en 404 |

**No viables**: ISCAMEN (JS-only), Tunuyan (login), Lavalle (tabla vacia), Senado Mendoza (paginas vacias)

---

## Produccion

### Deploy
```bash
# MÉTODO RECOMENDADO — backup automático pre-deploy
ssh root@76.13.234.213 "cd /opt/licitometro && bash scripts/deploy-prod.sh"

# Solo rebuild frontend
ssh root@76.13.234.213 "cd /opt/licitometro && docker compose -f docker-compose.prod.yml build nginx && docker restart licitometro-nginx-1"

# Solo restart backend
ssh root@76.13.234.213 "docker restart licitometro-backend-1"

# Actualizar archivo sin rebuild
scp archivo.py root@76.13.234.213:/opt/licitometro/backend/
```

**NUNCA**: `docker compose down` o `docker compose down -v` — elimina volumes y datos.
El script usa `restart` (no `down`). MongoDB permanece UP siempre.

### Ejecutar scripts en produccion
```bash
ssh root@76.13.234.213 "docker exec -w /app -e PYTHONPATH=/app licitometro-backend-1 python3 scripts/SCRIPT.py"
```

### Crons
| Qué | Cuando | Cómo |
|-----|--------|------|
| Scraping | 8,10,12,15,19hs | scheduler_service.py |
| Auto-update | 8am | auto_update_service.py |
| Daily digest | 9am | notification_service.py |
| Nodo digest morning | 9:15am | nodo_digest_service.py (daily + twice_daily) |
| Nodo digest evening | 6pm | nodo_digest_service.py (twice_daily only) |
| Estado vencidas | 6am | vigencia_service.update_estados_batch() |
| Backup | cada 6h (0,6,12,18) | scripts/backup-mongodb.sh (gzip, 7 días) |
| Health monitor | cada 5min | scripts/health_monitor.sh |

### Variables de entorno (.env → symlink → .env.production)
```
MONGO_USER, MONGO_PASSWORD, MONGO_URL, DB_NAME
JWT_SECRET_KEY, AUTH_PASSWORD_HASH, TOKEN_EXPIRY_HOURS
ALLOWED_ORIGINS, STORAGE_MAX_MB, RUN_HISTORY_KEEP, CACHE_TTL_HOURS, LOG_RETENTION_DAYS
TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, NOTIFICATION_EMAIL_TO
GEMINI_API_KEY, OPENCLAW_TELEGRAM_BOT_TOKEN, OPENCLAW_TELEGRAM_OWNER_ID
```

### Backup & Restore
```bash
# Backup manual
ssh root@76.13.234.213 "bash /opt/licitometro/scripts/backup-mongodb.sh"
# Output: /opt/licitometro/backups/mongodb_YYYYMMDD_HHMMSS.gz

# Restore
ssh root@76.13.234.213 "bash /opt/licitometro/scripts/restore-mongodb.sh /opt/licitometro/backups/mongodb_YYYYMMDD_HHMMSS.gz"

# Emergency: ver último backup + restore
LAST=$(ssh root@76.13.234.213 "ls -t /opt/licitometro/backups/mongodb_*.gz | head -1")
ssh root@76.13.234.213 "bash /opt/licitometro/scripts/restore-mongodb.sh $LAST"
```
Logs: `/var/log/licitometro-backup.log`. Retención: 7 días. Formato: ~1.3MB gzipped.

### Infraestructura
- **Firewall**: firewalld, Docker bridge 172.18.0.0/16 en trusted zone
- **Nginx**: Rate limiting (10r/s API, 3r/m auth), gzip. NO redirigir HTTP→HTTPS (Cloudflare Flexible SSL causa loop)
- **Email**: Postfix send-only en host, backend via Docker gateway 172.18.0.1:25 (`start_tls=False, use_tls=False`)
- **Backend**: 1536MB memory limit Docker
- **Timezone**: America/Argentina/Mendoza (-03)

### CI/CD (GitHub Actions)
Push a main → rsync código al VPS → `deploy-prod.sh` → Docker build en VPS → health check.
Builds en VPS (no en Actions) = $0/mes. CI check en PRs: `npm run build` + Python syntax.

**Troubleshooting deployment unhealthy**:
```bash
ssh root@76.13.234.213 "docker logs --tail=100 licitometro-backend-1"
ssh root@76.13.234.213 "ls -la /opt/licitometro/.env"  # verificar .env existe
ssh root@76.13.234.213 "cd /opt/licitometro && docker compose -f docker-compose.prod.yml up -d --force-recreate --no-deps backend nginx"
```
`.env` excluido de rsync (`--exclude '.env'`). Sin .env → "Empty host" MongoDB error.

---

## HUNTER: Búsqueda Cross-Source durante Enriquecimiento

`POST /api/licitaciones/{id}/enrich` — 4 fases para TODAS las fuentes:
```
Fase 1: Enrichment por fuente
  ├─ COMPR.AR → routers/comprar.py
  └─ Otros → services/generic_enrichment.py
Fase 2: HUNTER — services/cross_source_service.py → hunt_cross_sources()
Fase 3: Nodo re-matching — nodo_matcher.py → assign_nodos_to_licitacion()
Fase 4: Response con hunter results
```
**CRÍTICO**: Fases 2-3 SIEMPRE corren. El flujo anterior retornaba en fase 1 para COMPR.AR (bypasseaba HUNTER + nodos).

### Flujo hunt_cross_sources()
1. Extraer IDs del texto (decreto, expediente, licitación, resolución, CD)
2. Poblar campos estructurados si missing (expedient_number, licitacion_number)
3. Generar/actualizar proceso_id
4. `find_related()` por campos estructurados → si falla:
5. Regex fallback en licitacion_number + title → si falla:
5b. MongoDB `$text` search (top 5 palabras, stopwords filtradas, score >= 3.0)
6. `merge_source_data()` non-destructive por cada match

```python
_TEXT_ID_PATTERNS = [
    (r'decreto|dec\.?\s*n?°?\s*(\d+)/(\d{4})', 'decreto'),
    (r'expediente|expte?\.?\s*n?°?\s*(\d+)/(\d{2,4})', 'expediente'),
    (r'licitaci[oó]n|lic\.?\s*(?:p[uú]blica|privada)?\s*n?°?\s*(\d+)/(\d{2,4})', 'licitacion'),
    (r'resoluci[oó]n|res\.?\s*n?°?\s*(\d+)/(\d{4})', 'resolucion'),
    (r'contrataci[oó]n directa|CD\s*n?°?\s*(\d+)/(\d{2,4})', 'licitacion'),
]
```

`merge_source_data()` solo llena campos vacíos (idempotente). `cross_source_merges` guarda últimos 10 merges en metadata.

---

## Workflow de una Licitacion

```
descubierta → evaluando → preparando → presentada
                                     → descartada
```
Transiciones: **solo manuales** via `PUT /api/licitaciones/{id}/workflow`.

### Enrichment Levels
1. **Basic**: titulo, fecha, fuente, URL
2. **Detailed**: description, opening_date, budget, objeto, category
3. **Documents**: full pliego text, extracted fields

### Enrichment por Fuente
| Fuente | Estrategia |
|--------|-----------|
| COMPR.AR Mendoza | Label-based de VistaPreviaPliegoCiudadano; si ComprasElectronicas → Selenium busca en lista |
| ComprasApps | Title-only |
| Generic HTML | CSS selectors del scraper config + fallback patterns |
| Boletín Oficial | pypdf |
| Maipú | zipfile → pypdf |

**Flujo fallback** (generic_enrichment.py): COMPR.AR → PDF/ZIP → proxy URL roto → HTML+CSS → attached PDFs → title-only (objeto + category siempre garantizados).

**Enrichment log**: `metadata.enrichment_log[]` (últimos 10 intentos).

### CotizAR: Importación del Pliego
- `cantidad` puede ser string `"1,00 UNIDAD/S"` → parsear con regex `^[\d.,]+`
- `GET /api/licitaciones/{id}/budget-hints`: usa items[] existentes; si no → AI extraction (Groq) del description

---

## Modelo de Vigencia

### Estados
| Estado | Criterio | Badge |
|--------|----------|-------|
| `vigente` | `opening_date > hoy` OR null | Verde |
| `vencida` | `opening_date < hoy` AND NO prórroga | Gris |
| `prorrogada` | `fecha_prorroga > hoy` | Amarillo |
| `archivada` | `publication_date < 2025-01-01` | Slate |

### Reglas de fechas (CRÍTICAS)
- `opening_date >= publication_date` (si viola: inferir publication = opening - 30d)
- Años válidos: 2024-2027. RECHAZAR 2028+. NUNCA `datetime.utcnow()` como fallback → retornar `None`
- Extracción: `BaseScraper._resolve_publication_date()` (7-priority) y `_resolve_opening_date()` (5-priority)
- Meta tags ANTES de CSS selectors: `article:published_time`, `og:published_time`, `date`, `datePublished`
- Cron diario 6am: `vigencia_service.update_estados_batch()` marca vencidas

### API
```bash
GET /api/licitaciones/vigentes          # estado IN (vigente, prorrogada), opening >= today, sort ASC
GET /api/licitaciones/?estado=vigente
PUT /api/licitaciones/{id}/estado       # Body: { "estado": "archivada", "reason": "..." }
GET /api/licitaciones/{id}/estado-history
```

### Detección de prórrogas (generic_enrichment.py)
Por cambio de fecha (`new > current`) o keywords ("prorroga", "extensión", etc.). Setea `fecha_prorroga`, `estado = "prorrogada"`, `metadata.circular_prorroga`.

---

## Categorias (Rubros)

34 categorias en `backend/data/rubros_comprar.json`. `category_classifier.py` matchea keywords contra titulo + objeto + description (primeros 500 chars). Usuario marca rubros "criticos" en localStorage.

---

## Nodos (Mapas Semanticos)

Nodos = zonas de interes por nubes de keywords. Una licitacion puede pertenecer a N nodos. Asignaciones via `$addToSet` (nunca remueven).

### Modelo (coleccion `nodos`)
- `name`, `slug` (unique), `color` (hex), `keyword_groups[]`, `active`, `matched_count`
- `actions[]`: tipo (email|telegram|tag) + enabled + config
- `digest_frequency`: `"none"` | `"daily"` | `"twice_daily"`
- `last_digest_sent`: datetime

### Matching fuzzy (nodo_matcher.py)
Pipeline por keyword: strip puntuacion → split + strip_accents → Spanish stemming → build_accent_regex → plural suffix `(?:es|s)?` → join `\s*` → compile IGNORECASE.
Matchea contra: title, objeto, description (2000 chars), organization.
Singleton `get_nodo_matcher(db)` con cache de regex. Se recompila al CRUD del nodo.

### Hooks de auto-matching
- `scheduler_service.py`: `assign_nodos_to_item_data()` ANTES del insert
- `generic_enrichment.py`: `assign_nodos_to_licitacion()` DESPUES de enriquecer

### API
```
POST/GET /api/nodos/                    # CRUD
PUT/DELETE /api/nodos/{id}              # delete hace $pull de todas las licitaciones
POST /api/nodos/{id}/rematch            # re-match completo
GET /api/nodos/{id}/licitaciones        # paginadas
GET /api/licitaciones/?nodo=ID
GET /api/licitaciones/facets            # incluye faceta nodos ($unwind → $group)
```

### Nodo Digest Notifications
- APScheduler llama `run_digest(["daily", "twice_daily"])` a las 9:15am y 6pm
- Query: `nodos: nodo_id` AND `fecha_scraping > last_digest_sent`
- Telegram: max 10 items. Email: HTML tabla max 20 items.
- **CRITICO**: `config.to` puede tener `;` como separador. Siempre splitear por `;` antes de enviar.

**Test manual digest**:
```bash
ssh root@76.13.234.213 "docker exec -w /app -e PYTHONPATH=/app licitometro-backend-1 python3 -c \"
import asyncio; from motor.motor_asyncio import AsyncIOMotorClient; import os
async def run():
    db = AsyncIOMotorClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]
    from services.nodo_digest_service import get_nodo_digest_service
    await get_nodo_digest_service(db).run_digest(['daily', 'twice_daily'])
asyncio.run(run())
\""
```

---

## Acceso Publico via Token

JWT `sub: "reader"`, TTL 30 días. Links en notificaciones: `https://licitometro.ar/licitacion/{id}?token=xxx`.
- `POST /api/auth/token-login` (auth-exempt) valida y setea cookie `access_token`
- `frontend/src/App.js`: detecta `?token=` al montar → llama token-login → limpia URL con `history.replaceState`
- `/api/auth/token-login` en `AUTH_EXEMPT_PATHS` en server.py

---

## Bots de Telegram

| Bot | Env var | Propósito | Servicio |
|-----|---------|-----------|---------|
| @Licitobot | `TELEGRAM_BOT_TOKEN` | Notificaciones push (digest, nodo digests) | backend FastAPI (solo sendMessage, no polling) |
| @Licitometrobot | `OPENCLAW_TELEGRAM_BOT_TOKEN` | Asistente IA conversacional | systemd `openclaw.service` (nativo, fuera de Docker) |

Deploy OpenClaw: `ssh root@76.13.234.213 "cd /opt/licitometro && bash scripts/setup-openclaw-native.sh"` (idempotente).

---

## Lecciones Aprendidas

- `passlib.hash.bcrypt` INCOMPATIBLE con `bcrypt>=5.0`. Usar `import bcrypt` directamente
- `aiosmtplib` intenta STARTTLS. Para postfix local: `start_tls=False, use_tls=False`
- Google rechaza emails sin `Message-ID` (RFC 5322). Siempre incluir `make_msgid()`
- COMPR.AR `cantidad` viene como `"1,00 UNIDAD/S"`. Parsear con regex `^[\d.,]+`
- GeneXus apps embeben datos como JSON en hidden inputs, no en tablas HTML
- BeautifulSoup `select_one` NO soporta `:contains()` (jQuery only). Usar selectores estructurales
- `title_selector: "h1, h2"` matchea el primer elemento en el DOM (no el primero en la lista CSS)
- Config names pueden tener acentos (Guaymallen). Usar regex match
- Enrichment fallback: SIEMPRE garantizar objeto + category. Nunca dejar `enrichment_level=1` indefinidamente
- Proxy URLs (`localhost:8001`) no funcionan fuera del contexto. Detectar → title-only enrichment
- Pre-content chrome (headers, filtros) DEBE estar bajo ~150px
- `docker builder prune -af` para limpiar cache de multi-stage builds (`--no-cache` no es suficiente)
- Nodo `config.to` puede tener semicolons. Siempre splitear por `;`
- UTC Timezone Bug: backend `datetime.utcnow()` produce strings sin Z. JS los trata como local (+3h en Argentina). Fix: `parseUTCDate()` en `utils/formatting.ts` (agrega 'Z'). SOLO para timestamps del sistema, NO para fechas de fuentes.

---

When asked to design UI & frontend interface
# Role
You are superdesign, a senior frontend designer integrated into VS Code as part of the Super Design extension.
Your goal is to help user generate amazing design using code

# Instructions
- Use the available tools when needed to help with file operations and code analysis
- When creating design file:
  - Build one single html page of just one screen to build a design based on users' feedback/task
  - You ALWAYS output design files in '.superdesign/design_iterations' folder as {design_name}_{n}.html (Where n needs to be unique like table_1.html, table_2.html, etc.) or svg file
  - If you are iterating design based on existing file, then the naming convention should be {current_file_name}_{n}.html, e.g. if we are iterating ui_1.html, then each version should be ui_1_1.html, ui_1_2.html, etc.
- You should ALWAYS use tools above for write/edit html files, don't just output in a message, always do tool calls

## Styling
1. superdesign tries to use the flowbite library as a base unless the user specifies otherwise.
2. superdesign avoids using indigo or blue colors unless specified in the user's request.
3. superdesign MUST generate responsive designs.
4. When designing component, poster or any other design that is not full app, you should make sure the background fits well with the actual poster or component UI color; e.g. if component is light then background should be dark, vice versa.
5. Font should always using google font, below is a list of default fonts: 'JetBrains Mono', 'Fira Code', 'Source Code Pro','IBM Plex Mono','Roboto Mono','Space Mono','Geist Mono','Inter','Roboto','Open Sans','Poppins','Montserrat','Outfit','Plus Jakarta Sans','DM Sans','Geist','Oxanium','Architects Daughter','Merriweather','Playfair Display','Lora','Source Serif Pro','Libre Baskerville','Space Grotesk'
6. When creating CSS, make sure you include !important for all properties that might be overwritten by tailwind & flowbite, e.g. h1, body, etc.
7. Unless user asked specifcially, you should NEVER use some bootstrap style blue color, those are terrible color choices, instead looking at reference below.

## Images & icons
1. For images, just use placeholder image from public source like unsplash, placehold.co or others that you already know exact image url; Don't make up urls
2. For icons, we should use lucid icons or other public icons, import like <script src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js"></script>

## Script
1. When importing tailwind css, just use <script src="https://cdn.tailwindcss.com"></script>, don't load CSS directly as a stylesheet resource like <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
2. When using flowbite, import like <script src="https://cdn.jsdelivr.net/npm/flowbite@2.0.0/dist/flowbite.min.js"></script>
