# Licitometro - Documentacion del Proyecto

Plataforma de monitoreo de licitaciones publicas de Mendoza, Argentina. Agrega datos de 24+ fuentes gubernamentales, los enriquece automaticamente y los presenta en una interfaz web con filtros, busqueda, nodos semanticos y notificaciones.

**Produccion**: https://licitometro.ar
**VPS**: Hostinger 76.13.234.213 (srv1342577.hstgr.cloud)
**DNS**: Cloudflare (proxy enabled)

---

## Stack Tecnologico

| Capa | Tecnologia |
|------|-----------|
| Backend | FastAPI + Gunicorn (Python 3.11) |
| Base de datos | MongoDB 7.0 (Motor async driver) |
| Frontend | React 18 + TypeScript |
| Contenedores | Docker Compose (prod: mongodb + backend + nginx + certbot) |
| Proxy/SSL | Nginx 1.25 + Let's Encrypt (certbot auto-renew) |
| Notificaciones | Telegram Bot (@Licitobot) + Email (Postfix local relay) |
| Scraping | aiohttp + Selenium (para sitios con JS) + pypdf (para PDFs) |

---

## Estructura del Proyecto

```
licitometro/
├── backend/
│   ├── server.py                  # FastAPI app, middleware, routers
│   ├── models/
│   │   ├── licitacion.py          # LicitacionCreate/InDB/Update (Pydantic)
│   │   ├── nodo.py                # Nodo semantic keyword maps (CRUD models)
│   │   ├── scraper_config.py      # ScraperConfig model
│   │   ├── scraper_run.py         # ScraperRun tracking
│   │   ├── offer_template.py      # Offer templates CRUD
│   │   └── offer_application.py   # Offer applications
│   ├── db/
│   │   └── models.py              # MongoDB doc → dict entity mappers
│   ├── routers/
│   │   ├── licitaciones.py        # CRUD + search + filters + stats
│   │   ├── nodos.py               # Nodos CRUD + rematch + per-nodo licitaciones
│   │   ├── scheduler.py           # Scraper scheduling + manual triggers
│   │   ├── scraper_configs.py     # Scraper config CRUD
│   │   ├── workflow.py            # Workflow state transitions
│   │   ├── offer_templates.py     # Offer templates CRUD
│   │   ├── auth.py                # Login/logout/token-login (JWT cookie)
│   │   ├── comprar.py             # COMPR.AR proxy endpoints
│   │   └── public.py              # Public health/stats endpoints
│   ├── scrapers/
│   │   ├── base_scraper.py        # Base class (aiohttp + ResilientHttpClient)
│   │   ├── scraper_factory.py     # URL/name → scraper class routing
│   │   ├── resilient_http.py      # Anti-ban: UA rotation, backoff, circuit breaker
│   │   ├── browser_scraper.py     # Selenium base for JS-heavy sites
│   │   ├── mendoza_compra_v2.py   # COMPR.AR Mendoza (ASP.NET, pliego parsing)
│   │   ├── boletin_oficial_mendoza_scraper.py  # PDF gazette scraper
│   │   ├── godoy_cruz_scraper.py  # GeneXus JSON grid parser
│   │   ├── generic_html_scraper.py # Config-driven CSS selector scraper
│   │   ├── las_heras_scraper.py   # Selenium Oracle APEX
│   │   ├── emesa_scraper.py       # EMESA with WAF handling
│   │   ├── epre_scraper.py        # EPRE Flatsome layout
│   │   ├── comprar_gob_ar.py      # Nacional comprar.gob.ar
│   │   ├── comprasapps_mendoza_scraper.py  # hli00049 servlet
│   │   ├── aysam_scraper.py       # AYSAM
│   │   ├── osep_scraper.py        # OSEP
│   │   ├── uncuyo_scraper.py      # UNCuyo
│   │   ├── vialidad_mendoza_scraper.py     # Vialidad Mendoza
│   │   └── mendoza_compra.py      # Legacy v1 (deprecated)
│   ├── services/
│   │   ├── scheduler_service.py   # Cron scheduling (5x daily, 7 days/week)
│   │   ├── generic_enrichment.py  # HTML/PDF/ZIP enrichment pipeline
│   │   ├── category_classifier.py # Auto-classification by rubros
│   │   ├── nodo_matcher.py        # Fuzzy keyword matching for nodos (Spanish stemming, accent-tolerant)
│   │   ├── workflow_service.py    # State machine (descubierta→evaluando→...)
│   │   ├── enrichment_service.py  # Enrichment orchestration
│   │   ├── notification_service.py # Telegram + Email (daily digest 9am)
│   │   ├── nodo_digest_service.py # Per-nodo digest notifications (9:15am + 6pm)
│   │   ├── auto_update_service.py # Re-enrich active licitaciones (8am cron)
│   │   ├── smart_search_parser.py # NLP search query parsing
│   │   ├── deduplication_service.py # Content hash dedup
│   │   ├── auth_service.py        # bcrypt + JWT (user + reader tokens)
│   │   ├── storage_cleanup_service.py # Disk cleanup
│   │   └── url_resolver.py        # URL resolution
│   ├── utils/
│   │   ├── dates.py               # parse_date_guess (16 formats, Spanish months, US dates)
│   │   ├── object_extractor.py    # extract_objeto(), is_poor_title()
│   │   └── text_search.py         # strip_accents(), build_accent_regex() for fuzzy matching
│   └── scripts/                   # One-off migration/backfill scripts
│       ├── backfill_objeto.py     # Populate objeto field for existing records
│       ├── backfill_opening_date.py
│       ├── backfill_categories.py
│       ├── backfill_budget.py
│       ├── migrate_add_workflow.py
│       ├── migrate_text_index.py
│       ├── discover_sources.py    # Probe URLs for new procurement sources
│       ├── add_ipv_copig_lapaz.py # Add IPV/COPIG/La Paz/San Carlos configs
│       ├── seed_nodos.py          # Create initial nodos (IT + Vivero)
│       ├── backfill_nodos.py      # Match existing licitaciones against nodos
│       └── ...
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── licitaciones/
│   │   │   │   ├── LicitacionCard.tsx    # Card view (objeto||title heading, nodo badges)
│   │   │   │   ├── LicitacionTable.tsx   # Table view
│   │   │   │   ├── FilterSidebar.tsx     # Booking.com-style faceted filters (incl. nodos)
│   │   │   │   ├── MobileFilterDrawer.tsx # Slide-out drawer (<lg, incl. nodos)
│   │   │   │   ├── SearchBar.tsx         # Text + mode toggle (A/AI/+)
│   │   │   │   ├── SortDropdown.tsx      # Sort field selector
│   │   │   │   ├── ViewToggle.tsx        # Card/table toggle
│   │   │   │   ├── ActiveFiltersChips.tsx # Filter chips (nodo name via nodoMap)
│   │   │   │   ├── CriticalRubrosConfig.tsx
│   │   │   │   ├── ListSkeleton.tsx
│   │   │   │   ├── Pagination.tsx
│   │   │   │   └── PresetSelector.tsx
│   │   │   └── nodos/
│   │   │       ├── NodoBadge.tsx          # Colored dot + name badge
│   │   │       ├── NodoCard.tsx           # Card with groups, actions, matched_count
│   │   │       └── NodoForm.tsx           # CRUD form (keywords, actions, color)
│   │   ├── hooks/
│   │   │   ├── useLicitacionData.ts      # API fetching (AbortController)
│   │   │   ├── useLicitacionFilters.ts   # useReducer filter state
│   │   │   ├── useLicitacionPreferences.ts
│   │   │   ├── useFacetedFilters.ts      # Faceted filter counts (incl. nodos)
│   │   │   ├── useFilterOptions.ts
│   │   │   ├── useNodos.ts               # Fetch active nodos, nodoMap lookup
│   │   │   ├── useLocalStorage.ts
│   │   │   └── useDebounce.ts            # 700ms text search debounce
│   │   ├── types/
│   │   │   └── licitacion.ts             # Licitacion, FilterState, SortField, etc.
│   │   ├── utils/
│   │   │   └── formatting.ts             # Date formatting, urgency helpers
│   │   └── pages/
│   │       ├── LicitacionesList.tsx      # Orchestrator (480 lines)
│   │       └── NodosPage.tsx             # Nodos CRUD management page
│   └── package.json
├── docker-compose.prod.yml
├── deploy.sh                    # 5-step: pull → build → stop → start → healthcheck
├── nginx/
│   ├── nginx.conf               # SSL config, rate limiting, gzip, SPA fallback
│   ├── nginx-initial.conf       # HTTP-only (pre-SSL)
│   └── entrypoint.sh            # Auto-detect SSL certs
└── scripts/
    ├── backup.sh                # mongodump (cron 2am)
    └── health_monitor.sh        # Health check (cron 5min)
```

---

## Patrones Criticos

### Agregar un campo nuevo al modelo
Se debe modificar en **3 lugares** o el campo se pierde silenciosamente:
1. `backend/models/licitacion.py` - Pydantic model (LicitacionCreate/InDB/Update)
2. `backend/db/models.py` - `licitacion_entity()` mapper (MongoDB doc → dict)
3. `frontend/src/types/licitacion.ts` - TypeScript interface

### Routing de scrapers
`backend/scrapers/scraper_factory.py` rutea por URL primero, luego por nombre.
Las rutas especificas deben ir ANTES de los fallbacks genericos (ej: `godoycruz.gob.ar` antes de `mendoza.gov.ar`).
**CRITICO**: El check de GenericHtmlScraper (por `scraper_type=generic_html` en selectors) DEBE ir ANTES del fallback `mendoza.gov.ar`, o URLs como `ipvmendoza.gov.ar` son capturadas por el substring match.

### Route ordering en FastAPI
Rutas con prefijo fijo (`/stats/*`, `/search/*`) deben registrarse ANTES de rutas con path params (`/{licitacion_id}`) en `backend/routers/licitaciones.py`. FastAPI matchea en orden de registro.

### MongoDB: NUNCA usar model_dump(mode='json')
`model_dump(mode='json')` convierte datetimes a ISO strings. MongoDB almacena strings y dates como BSON types distintos y los ordena por separado. Usar `model_dump()` (modo python) y convertir solo campos no-BSON (HttpUrl → str).

### Busqueda frontend
`LicitacionesList.tsx` envia parametro `q` a `GET /api/licitaciones/`. El endpoint DEBE tener param `q` o la busqueda se ignora silenciosamente.

### Dropdown "Agrupar por" en Mobile
**Ubicación**: Toolbar principal, visible solo en mobile (`lg:hidden`), entre ViewToggle y botón "Filtros".
**Funcionalidad**: Permite cambiar `groupBy` (none, organization, fuente, status, jurisdiccion, procedimiento, category) sin abrir el MobileFilterDrawer.
**Razón**: En mobile, tener que abrir el drawer y scrollear hasta "Agrupar por" es tedioso. El dropdown directo en toolbar mejora UX significativamente.
**Implementación** (Feb 13, 2026): Select nativo con emojis para cada opción, bg-gray-100, text-xs, visible solo en `<lg` breakpoint.

### Pliego vs Presupuesto
Algunas fuentes publican el **costo del pliego** (precio del documento de licitacion), NO el presupuesto oficial. El pliego es tipicamente 0.01%-0.5% del presupuesto real.

**Fuentes conocidas**:
- Godoy Cruz: ratio 1:1000 (pliego = 0.1% del presupuesto)

**Implementacion**: Guardar costo_pliego en `metadata.costo_pliego`, estimar budget como `pliego * ratio`, marcar `metadata.budget_source = "estimated_from_pliego"`.

Ver detalle completo en `memory/pliego_budget_pattern.md`.

### Objeto vs Title
El campo `objeto` sintetiza el objeto de la contratacion (max 200 chars). Frontend muestra `objeto || title` como heading principal. `title` puede ser solo un numero de proceso (COMPR.AR) o "Decreto 140" (Boletin). El `objeto` se extrae via `utils/object_extractor.py` con 5 estrategias en cadena de prioridad.

### Encoding de servidores
Algunos servidores declaran UTF-8 pero envian Latin-1. `ResilientHttpClient.fetch()` lee raw bytes con `response.read()` y decodifica manualmente con fallback UTF-8 → Latin-1. NUNCA usar `response.text()` directamente.

### SSL en sitios gov.ar
Muchos sitios gov.ar tienen cadenas de certificados SSL rotas. `ResilientHttpClient` usa `TCPConnector(ssl=False)` globalmente para evitar fallos de verificacion.

### title_selector en GenericHtmlScraper
El primer match del CSS selector gana. Si una pagina tiene `<h2>Licitaciones</h2>` (header de seccion) antes del `<h1>Titulo Real</h1>`, usar `title_selector: "h1"` en vez de `"h1, h2"`. Ejemplo: COPIG Mendoza.

### Docker IPv6 para ISPs que bloquean datacenter
Algunos ISPs argentinos (200.58.x.x) bloquean IPs de datacenter via IPv4 pero permiten IPv6. Docker puede usar IPv6 con:
1. `/etc/docker/daemon.json`: `{"ipv6": true, "fixed-cidr-v6": "...", "ip6tables": true}`
2. `sysctl net.ipv6.conf.all.forwarding=1` (persistir en `/etc/sysctl.conf`)
3. `docker-compose.prod.yml`: `enable_ipv6: true` + subnet IPv6 en la red
Los 3 pasos son necesarios. Fuentes afectadas: COPIG, La Paz, San Carlos.

### Taxonomía de Fechas: first_seen_at vs fecha_scraping vs publication_date
**CRÍTICO**: El sistema maneja 5 campos de fecha con semántica DIFERENTE. Confundirlos causa bugs graves.

| Campo | Significado | Cuándo cambia | Uso correcto |
|-------|-------------|---------------|--------------|
| `first_seen_at` | Primera vez que descubrimos el item | NUNCA (se setea solo en INSERT) | Badge "NUEVO", filtro "Nuevas de hoy" |
| `fecha_scraping` | Última vez que scrapeamos | En CADA scrape (UPDATE) | DailyDigestStrip "Hoy/Ayer", actividad de indexación |
| `publication_date` | Fecha oficial de publicación | NUNCA (dato de fuente) | Filtros de rango, sort default, year archival |
| `opening_date` | Fecha de apertura de ofertas | NUNCA (dato de fuente) | Deadlines, urgencia |
| `created_at` | Cuándo se insertó en BD | NUNCA (timestamp MongoDB) | Debug, auditoría |

**Implementación correcta**:
- **QuickPresetButton "Nuevas de hoy"**: Filtra por `nuevas_desde` (backend usa `first_seen_at >= date`)
- **DailyDigestStrip "Hoy/Ayer"**: Cuenta por `fecha_scraping` (muestra actividad de scraping)
- **Badge "NUEVO"**: Compara `first_seen_at > lastVisitTimestamp` (no `created_at` ni `fecha_scraping`)
- **NovedadesStrip categorías**:
  - Nuevas: `first_seen_at >= since`
  - Reindexadas: `fecha_scraping >= since AND first_seen_at < since`
  - Actualizadas: `updated_at >= since AND fecha_scraping < since`

**Error común corregido (Feb 13, 2026)**:
- ❌ ANTES: "Nuevas de hoy" filtraba por `fecha_scraping = hoy` → mostraba 5329 items (todas las scrapeadas)
- ✅ AHORA: Filtra por `first_seen_at >= hoy` → muestra ~10-50 items (verdaderamente nuevas)

### Filtros de Fecha Mutuamente Exclusivos (Feb 13, 2026)
**CRÍTICO**: Los filtros `nuevasDesde` (first_seen_at) y `fechaDesde/fechaHasta` (fecha_scraping/fecha_campo) son **mutuamente exclusivos**. Activar uno LIMPIA el otro automáticamente para evitar confusión.

**Implementación en `LicitacionesList.tsx`**:
- `handleToggleTodayFilter()`: Al activar "Nuevas de hoy" (nuevasDesde), limpia fechaDesde/fechaHasta con `setMany()`
- `handleDaySelect()`: Al activar DailyDigest day (fechaDesde/fechaHasta), limpia nuevasDesde con `setMany()`

**Por qué**: Ambos filtros usan campos de fecha DIFERENTES (`first_seen_at` vs `fecha_scraping`). Permitir que estén activos simultáneamente causa resultados inesperados y UX confusa.

**Indicadores visuales**:
- QuickPresetButton: Verde sólido cuando activo, verde claro cuando inactivo
- DailyDigestStrip: Botón "Hoy"/"Ayer" con bg-emerald-600 cuando seleccionado
- ActiveFiltersChips: Muestra chip emerald "✨ Nuevas desde YYYY-MM-DD" o chip verde "YYYY-MM-DD a YYYY-MM-DD"

**Parámetros de API**:
- `fecha_desde` + `fecha_hasta` + `fecha_campo` → Filtro genérico de rango por campo elegido
- `nuevas_desde` → Filtro específico por `first_seen_at >= date` (independiente de `fecha_campo`)
- `year` → Fuerza `publication_date` dentro del año (no afecta otros filtros)

**Frontend**: DateRangeFilter ofrece 6 opciones de fecha:
1. `publication_date` - Publicación (fecha oficial del gobierno)
2. `opening_date` - Apertura (deadline para ofertas)
3. `expiration_date` - Vencimiento
4. `first_seen_at` - Descubierta (1ra vez) ⭐ Para encontrar items "nuevos en el sistema"
5. `fecha_scraping` - Indexada (última) ⭐ Para actividad de scraping
6. `created_at` - Creada en BD (debug)

**Backfill**: `backend/scripts/backfill_first_seen.py` setea `first_seen_at = created_at` para records existentes.

---

## Fuentes de Datos (24 activas, 3231 licitaciones)

| Fuente | Scraper | Items aprox | Notas |
|--------|---------|-------------|-------|
| ComprasApps Mendoza | comprasapps_mendoza | ~2601 | GeneXus servlet, multi-year, estado V+P, 37 CUCs |
| COMPR.AR Mendoza | mendoza_compra_v2 | ~91 | ASP.NET WebForms, pliego parsing |
| Boletin Oficial Mendoza | boletin_oficial_mendoza | ~54 | PDF gazette, pypdf extraction |
| COPIG Mendoza | generic_html | ~50 | Custom WP, div.item cards, title_selector=h1 only, IPv6 |
| San Carlos | generic_html | ~50 | WordPress+Elementor, h2 structured fields, IPv6 |
| OSEP | osep | ~45 | Obra social |
| Maipu | generic_html (inline) | ~41 | WordPress table, ZIP enrichment |
| La Paz | generic_html | ~30 | WordPress Vantage, IPv6 required |
| IPV Mendoza | generic_html | ~28 | WordPress blog, h2.entry-title links |
| Santa Rosa | generic_html | ~25 | CMS |
| Junin | generic_html | ~13 | CMS |
| Vialidad Mendoza | vialidad_mendoza | ~10 | Dedicado |
| Godoy Cruz | godoy_cruz | ~10 | GeneXus JSON grid, pliego→budget |
| General Alvear | generic_html | ~9 | CMS |
| Malargue | generic_html | ~9 | CMS |
| Irrigacion | generic_html | ~9 | JHipster (limitado) |
| Rivadavia | generic_html | ~6 | CMS |
| Guaymallen | generic_html | ~6 | CMS |
| Ciudad de Mendoza | generic_html | ~5 | CMS |
| EPRE Mendoza | epre | ~4 | Flatsome layout |
| AYSAM | aysam | ~3 | Dedicado |
| UNCuyo | uncuyo | ~3 | Universidad |
| Las Heras | las_heras (Selenium) | ~3 | Oracle APEX |
| EMESA | generic_html | ~3 | WAF solo en 404 |
| Lujan de Cuyo | generic_html | ~1 | CMS |
| Tupungato | generic_html | ~1 | CMS |

**No viables**: ISCAMEN (JS-only DOM), Tunuyan (login requerido), Lavalle (tabla vacia), Senado Mendoza (paginas vacias)
**Resueltos con IPv6**: San Carlos, La Paz, COPIG (200.58.x.x ISP bloquea IPv4 datacenter, IPv6 funciona)

---

## Produccion

### Deploy
```bash
# Opcion 1: deploy.sh (requiere git credentials en VPS - actualmente NO configurado)
ssh root@76.13.234.213 "cd /opt/licitometro && bash deploy.sh"

# Opcion 2: SCP + rebuild manual (metodo actual, VPS sin git credentials)
scp <archivos_modificados> root@76.13.234.213:/opt/licitometro/<ruta>/
ssh root@76.13.234.213 "cd /opt/licitometro && docker compose -f docker-compose.prod.yml build && docker compose -f docker-compose.prod.yml down && docker compose -f docker-compose.prod.yml up -d"
```
El script deploy.sh hace: `git pull` → `docker compose build` → stop → start → healthcheck.
**NOTA**: El VPS no tiene credenciales HTTPS de git. Usar SCP para sincronizar archivos y luego rebuild.

### Ejecutar scripts en produccion
```bash
ssh root@76.13.234.213 "docker exec -w /app -e PYTHONPATH=/app licitometro-backend-1 python3 scripts/SCRIPT.py"
```
Auth middleware bloquea requests localhost en Docker; siempre usar `docker exec`.

### Crons en produccion
| Que | Cuando | Como |
|-----|--------|------|
| Scraping | 8,10,12,15,19hs (7 dias/sem) | scheduler_service.py |
| Auto-update | 8am | auto_update_service.py |
| Daily digest | 9am | notification_service.py (Telegram + Email) |
| Nodo digest morning | 9:15am | nodo_digest_service.py (daily + twice_daily) |
| Nodo digest evening | 6pm | nodo_digest_service.py (twice_daily only) |
| Backup | 2am | scripts/backup.sh (mongodump) |
| Health monitor | cada 5min | scripts/health_monitor.sh |

### Variables de entorno (.env.production)
```
MONGO_USER, MONGO_PASSWORD, MONGO_URL, DB_NAME
JWT_SECRET_KEY, AUTH_PASSWORD_HASH, TOKEN_EXPIRY_HOURS
ALLOWED_ORIGINS, STORAGE_MAX_MB, RUN_HISTORY_KEEP
CACHE_TTL_HOURS, LOG_RETENTION_DAYS
TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, NOTIFICATION_EMAIL_TO
```
Docker Compose lee `.env` (NO `.env.production`). En prod hay symlink `.env → .env.production`.

### Infraestructura
- **Firewall**: firewalld, Docker bridge 172.18.0.0/16 en trusted zone
- **SSL**: Let's Encrypt via certbot container, auto-renew
- **Nginx**: Rate limiting (10r/s API, 3r/m auth), gzip, security headers, HTTP→HTTPS redirect
- **Email**: Postfix send-only en host, backend conecta via Docker gateway 172.18.0.1:25 (sin auth, `start_tls=False`)
- **Backend memory**: 1536MB limit en Docker
- **IPv6**: Docker con IPv6 habilitado (daemon.json + sysctl + compose network). Subnet: `2a02:4780:6e:9b84:2::/80`
- **Timezone**: America/Argentina/Mendoza (-03), NTP sincronizado

---

## Lecciones Aprendidas

- `passlib.hash.bcrypt` es INCOMPATIBLE con `bcrypt>=5.0`. Usar `import bcrypt` directamente
- `aiosmtplib` intenta STARTTLS automaticamente. Para postfix local: `start_tls=False, use_tls=False`
- Google rechaza emails sin header `Message-ID` (RFC 5322). Siempre incluir `make_msgid()`
- `react-window` v2 usa `rowComponent` prop (no children render), requiere `rowProps`, exporta `List` (no FixedSizeList)
- `@types/react-window@1.x` es INCOMPATIBLE con `react-window@2.x`. Borrar @types, usar built-in
- Config names pueden tener acentos (Guaymallen). Usar regex match
- COMPR.AR: solo URLs de `VistaPreviaPliegoCiudadano` son estables. Las demas dependen de session state ASP.NET
- GeneXus apps embeben datos como JSON en hidden inputs, no en tablas HTML
- Pre-content chrome (headers, filtros, stats) DEBE estar bajo ~150px. Colapsar por defecto
- BeautifulSoup `select_one` NO soporta `:contains()` (es jQuery only). Usar selectores estructurales como `li.next a`
- `title_selector: "h1, h2"` matchea el primer elemento en el DOM, no el primero en la lista CSS. Si hay `<h2>` antes de `<h1>`, h2 gana
- Docker IPv6 requiere 3 configs simultaneas: daemon.json + sysctl forwarding + compose network. Si falta una, no funciona
- VPS Hostinger no tiene git credentials HTTPS. Usar `scp` para deploy y `docker compose build` para rebuild
- SSL verificacion deshabilitada globalmente en ResilientHttpClient (`ssl=False`) por certs rotos en sitios gov.ar
- Nodo email `config.to` puede tener semicolons (`"a@x;b@x"` como un solo string en el array). Siempre splitear por `;` antes de enviar via SMTP
- **CRITICAL - Workflow State is Business-Critical**: NUNCA hacer auto-transiciones de workflow_state basadas en enriquecimiento. Being enriched ≠ being in evaluation status. Las transiciones de estado deben ser EXPLÍCITAS y MANUALES (validadas por usuario/API). enrichment_cron_service debe SOLO enriquecer datos (objeto, category, enrichment_level), NUNCA cambiar workflow_state.

---

## Workflow de una Licitacion

```
descubierta → evaluando → preparando → presentada
                                     → descartada
```

### Enrichment Levels
1. **Basic** (scraping): titulo, fecha, fuente, URL
2. **Detailed** (enrichment): description, opening_date, budget, objeto, category
3. **Documents** (PDF/ZIP): full pliego text, extracted fields

### CRITICAL: Workflow State Transitions Rules

**GOLDEN RULE: ENRICHMENT MUST NEVER CHANGE WORKFLOW STATE**

- `enrichment_level` (1→2→3) = data completeness, NOT workflow state
- `workflow_state` (descubierta→evaluando→preparando→presentada) = business status, MUST be manual
- Being enriched ≠ Being under evaluation
- Enrichment services (`enrichment_cron_service`, `generic_enrichment`, `auto_update_service`) MUST ONLY enrich data fields (objeto, category, description, budget, etc.)
- They NEVER touch `workflow_state`

**Transition Rules**:
1. **descubierta** (default): New item, recently scraped, waiting for review
2. **evaluando** (manual only): User/system explicitly marks for evaluation
3. **preparando** (manual only): Item under active preparation, proposals coming in
4. **presentada** (manual): Completed, proposals received, closed
5. **descartada** (manual): Rejected, no longer relevant

**Implementation**:
- Workflow transitions happen via explicit API calls (not automatic)
- Frontend: workflow.py router has `PUT /api/licitaciones/{id}/workflow` endpoint
- Admin action required: User clicks button → HTTP PUT → state changes
- Never as side-effect of enrichment or cron jobs

**Why This Matters**:
- Workflow state affects business logic downstream (notifications, deadlines, UI flags)
- Auto-transitions cause data corruption (as discovered in Feb 12 emergency)
- Manual control = data integrity = business alignment

---

## Modelo de Vigencia de Licitaciones

### Campos de Fecha (3 tipos)

| Campo | Tipo | Propósito | Fuente | Mutable |
|-------|------|-----------|--------|---------|
| `fecha_scraping` | datetime | Tracking interno (cuándo descubrimos el item) | Sistema | Sí (cada scrape) |
| `publication_date` | datetime? | Fecha oficial de publicación del gobierno | Scraping | No (dato oficial) |
| `opening_date` | datetime? | Deadline para ofertas | Scraping | **SÍ (puede cambiar por circular)** |
| `fecha_prorroga` | datetime? | Nueva fecha si extendida | Circular | Sí |

### Estados de Vigencia

| Estado | Criterio | UI Badge | Significado |
|--------|----------|----------|-------------|
| `vigente` | `opening_date > hoy` OR `opening_date = null` | Verde (CheckCircle) | Activa, acepta ofertas |
| `vencida` | `opening_date < hoy` AND NO prórroga | Gris (XCircle) | Cerrada, no acepta ofertas |
| `prorrogada` | `fecha_prorroga > hoy` | Amarillo (Clock) | Extendida por circular |
| `archivada` | `publication_date < 2025-01-01` | Slate (Archive) | Histórica, solo consulta |

### Reglas de Validación (CRÍTICAS)

**Regla 1: Orden cronológico**
```
opening_date >= publication_date
```
- La apertura NO puede ser antes de la publicación
- Si se viola: RECHAZAR o INFERIR publicación = opening - 30 días

**Regla 2: Rango de tiempo**
```
2024 <= year(publication_date) <= 2027
2024 <= year(opening_date) <= 2027
```
- NO permitir años imposibles (2028+)
- NO permitir años muy antiguos (< 2024, excepto archivadas)
- Si se viola: RECHAZAR, buscar en otros campos

**Regla 3: NO usar datetime.utcnow() como fallback**
- CRÍTICO: Retornar `None` si no se puede resolver fecha
- NUNCA usar `datetime.utcnow()` - causa corrupción masiva de datos

### Extracción de Fechas (Source-Specific)

Cada fuente tiene su propia convención de año:
- **ComprasApps**: `3/2026-616` → año 2026
- **Boletin**: `Decreto 140/2024` → año 2024
- **Santa Rosa**: `13/2024` → año 2024
- **MPF**: `Resolución 100-2024` → año 2024

**Implementación en scrapers**:

Usar `BaseScraper._resolve_publication_date()` con 7-priority fallback:

```python
publication_date = self._resolve_publication_date(
    parsed_date=parse_date_guess(raw_date),  # Priority 1
    title=title,                               # Priority 2-4
    description=description,                   # Priority 3-5
    opening_date=opening_date_parsed,         # Priority 6 (constraint + estimate)
    attached_files=attached_files             # Priority 7
)
# Returns None if no valid date found (NEVER datetime.utcnow())
```

Usar `BaseScraper._resolve_opening_date()` con 5-priority fallback:

```python
opening_date = self._resolve_opening_date(
    parsed_date=parse_date_guess(raw_apertura),  # Priority 1
    title=title,                                   # Priority 3
    description=description,                       # Priority 2-3
    publication_date=publication_date,            # Constraint + estimate base
    attached_files=attached_files                 # Priority 4
)
# Returns None if no valid date found
```

Computar estado:

```python
estado = self._compute_estado(
    publication_date=publication_date,
    opening_date=opening_date,
    fecha_prorroga=None  # Detectar en enrichment phase
)
# Returns: "vigente" | "vencida" | "prorrogada" | "archivada"
```

### API Endpoints

```bash
# Vigentes hoy (shortcut)
GET /api/licitaciones/vigentes
# Filters: estado IN (vigente, prorrogada), pub_date [2024-2027], opening >= today
# Sort: opening_date ASC (nearest deadline first)

# Filtro por estado
GET /api/licitaciones/?estado=vigente

# Stats por estado
GET /api/licitaciones/stats/estado-distribution
# Returns: { "by_estado": {...}, "by_year": {...}, "vigentes_hoy": N }
```

### Validación en Pydantic

El modelo `LicitacionBase` incluye validador automático:

```python
@model_validator(mode='after')
def validate_dates_and_estado(self):
    # Rule 1: Validate year ranges [2024-2027]
    # Rule 2: Validate chronological order (opening >= publication)
    # Raises ValueError if violations detected
```

### Migración

Script: `backend/scripts/migrate_add_vigencia.py`

```bash
# Dry run (no changes)
python scripts/migrate_add_vigencia.py --dry-run

# Execute migration
python scripts/migrate_add_vigencia.py
```

Pasos de migración:
1. Agregar campos `estado` y `fecha_prorroga` con defaults
2. Validar y corregir violaciones de orden cronológico
3. Recomputar estado correcto para TODOS los items
4. Flagear años imposibles (≥2028) para revisión manual

### Frontend Components

- **`EstadoBadge.tsx`**: Badge con color/icono por estado
- **`EstadoFilter.tsx`**: Filtros de sidebar (4 botones de estado)
- **`useLicitacionFilters.ts`**: Incluye `estadoFiltro` en reducer
- **Quick button**: "Vigentes Hoy" llama a `/vigentes` endpoint

### Servicio de Vigencia

**`backend/services/vigencia_service.py`**:

- `compute_estado()` - Lógica de estado
- `update_estados_batch()` - Cron diario (6am) marca vencidas
- `detect_prorroga()` - Detecta extensiones de fecha
- `recompute_all_estados()` - Re-cálculo masivo (migración)

### Lecciones Críticas

1. **NUNCA** usar `datetime.utcnow()` como fallback → retornar `None`
2. **Source-specific patterns** son esenciales (cada fuente tiene su formato de año)
3. **Multi-source date search** es crítico (title + description + attachments)
4. **Cross-field validation** previene corrupción (opening >= publication)
5. **Estado is business-critical** - auto-transiciones son peligrosas
6. **2-digit year normalization**: 24-27 → 2024-2027, REJECT 28+

### Implementación Completa (Feb 13, 2026)

**Estado**: ✅ COMPLETADO - Todas las 6 fases críticas implementadas

#### Fase 1: Extracción de Meta Tags (CRÍTICA)
- **Archivo**: `backend/scrapers/generic_html_scraper.py`
- **Método**: `_extract_date_from_meta_tags()`
- **Patrón**: Busca fechas en meta tags HTML ANTES de CSS selectors:
  1. `<meta property="article:published_time">`
  2. `<meta property="og:published_time">`
  3. `<meta name="date">`
  4. `<meta name="publishdate">`
  5. `<time itemprop="datePublished">`
- **Impacto**: Previene bugs como General Alvear (fechas de 2021 aparecían como 2026)

#### Fase 2: Cron Diario de Estado
- **Archivo**: `backend/server.py`
- **Schedule**: 6:00 AM diario
- **Función**: `vigencia_service.update_estados_batch()`
- **Acción**: Marca automáticamente `estado = "vencida"` cuando `opening_date < today`

#### Fase 3: Estados Visibles en UI
- **Archivos**: `EstadoBadge.tsx`, `LicitacionTable.tsx`
- **Props**: `size = 'xs' | 'sm' | 'md'`
- **Colores**:
  - Vigente: verde (emerald)
  - Vencida: gris (gray)
  - Prorrogada: amarillo (yellow)
  - Archivada: slate

#### Fase 4: Detección Automática de Prórrogas
- **Archivo**: `backend/services/generic_enrichment.py`
- **Detección por**:
  1. Cambio de fecha: `new_opening_date > current_opening_date`
  2. Keywords: "prorroga", "prórroga", "extensión", "modificación de fecha", etc.
- **Resultado**: Setea `fecha_prorroga`, `estado = "prorrogada"`, `metadata.circular_prorroga`

#### Fase 5: Endpoints Admin para Estado
**Nuevos endpoints en** `backend/routers/licitaciones.py`:

```bash
# Override manual de estado (admin only)
PUT /api/licitaciones/{id}/estado
Body: { "estado": "archivada", "reason": "Manual correction" }

# Historial de cambios
GET /api/licitaciones/{id}/estado-history
Returns: { "current_estado": "vigente", "history": [...] }
```

- Registra en `metadata.estado_history[]`: old_estado, new_estado, timestamp, reason, method

#### Fase 6: Fechas de Expiración
- **Archivo**: `backend/utils/dates.py` → `extract_expiration_date()`
- **Busca en description**:
  - "Vence: DD/MM/YYYY"
  - "Plazo hasta: DD/MM/YYYY"
  - "Fecha límite: DD/MM/YYYY"
- **Fallback**: `opening_date + 30 días`
- **Integrado en**: `GenericHtmlScraper` (extract + inline modes)

#### Archivos Modificados (Total: 10)
**Backend (7 files):**
1. `scrapers/generic_html_scraper.py` - Meta tags + expiration_date
2. `server.py` - Daily cron
3. `services/generic_enrichment.py` - Prórroga detection
4. `routers/licitaciones.py` - Admin endpoints
5. `utils/dates.py` - extract_expiration_date()
6. `services/vigencia_service.py` - (ya existía, sin cambios)
7. `scrapers/base_scraper.py` - (ya existía, sin cambios)

**Frontend (2 files):**
1. `components/licitaciones/EstadoBadge.tsx` - Size prop
2. `components/licitaciones/LicitacionTable.tsx` - Estado column

**Infraestructura ya existente (80%):**
- ✅ `utils/dates.py`: extract_year, extract_date, validate_date_range, validate_date_order
- ✅ `base_scraper.py`: _resolve_publication_date, _resolve_opening_date, _compute_estado
- ✅ `vigencia_service.py`: compute_estado, update_estados_batch, detect_prorroga
- ✅ `EstadoBadge.tsx`: Badge component
- ✅ Pydantic validators en models/licitacion.py

---

## Categorias (Rubros)

34 categorias en `backend/data/rubros_comprar.json`. Clasificacion automatica via `category_classifier.py` usando keywords match contra titulo + objeto + description (primeros 500 chars para evitar falsos positivos de boilerplate).

El usuario puede marcar hasta N rubros como "criticos" (localStorage). Las cards muestran badges de urgencia para licitaciones en rubros criticos.

---

## Nodos (Mapas Semanticos de Busqueda)

Nodos son zonas de interes definidas por nubes de keywords. Cada nodo agrupa licitaciones automaticamente via fuzzy matching. Una licitacion puede pertenecer a N nodos Y mantener su rubro/categoria (no exclusivo). Los nodos solo AGREGAN asignaciones (`$addToSet`), nunca remueven.

### Modelo (coleccion `nodos`)
- `name`, `slug` (unique), `description`, `color` (hex)
- `keyword_groups[]`: nombre + keywords[] (subcategorias semanticas)
- `actions[]`: tipo (email|telegram|tag) + enabled + config
  - email: `config.to` (lista), `config.subject_prefix`
  - telegram: `config.chat_id`
  - tag: `config.keyword` (auto-agrega al campo keywords de la licitacion)
- `digest_frequency`: `"none"` | `"daily"` (default) | `"twice_daily"`
- `last_digest_sent`: datetime (se actualiza al enviar digest, se inicializa al crear nodo)
- `active`, `matched_count`, timestamps

### Campo en licitaciones
- `nodos: List[str]` — IDs de nodos matcheados. Se agrega en 3 lugares:
  1. `models/licitacion.py` (LicitacionBase + LicitacionUpdate)
  2. `db/models.py` (licitacion_entity)
  3. `types/licitacion.ts` (Licitacion interface)

### Matching fuzzy (nodo_matcher.py)
Pipeline de normalizacion por keyword:
1. Strip puntuacion (apostrofes, guiones, puntos)
2. Split en palabras + `strip_accents()`
3. Spanish stemming: `_spanish_stem()` (iones→ion, ces→z, es→stem, s→stem)
4. `build_accent_regex()` por palabra (de `utils/text_search.py`)
5. Sufijo plural `(?:es|s)?`
6. Join con `\s*` (flexible spacing)
7. Compile `re.IGNORECASE`

Matchea contra: title, objeto, description (2000 chars), organization.
Patron singleton `get_nodo_matcher(db)` con cache de regex compilados. Se recompila al CRUD del nodo.

### Hooks de auto-matching
- **scheduler_service.py**: `assign_nodos_to_item_data()` ANTES del insert (modifica dict in-place)
- **generic_enrichment.py**: `assign_nodos_to_licitacion()` DESPUES de enriquecer (description/objeto pueden cambiar)
- **routers/nodos.py POST /{id}/rematch**: Re-matchea TODAS las licitaciones contra un nodo

### API
- `POST/GET /api/nodos/` — CRUD
- `PUT/DELETE /api/nodos/{id}` — Update/delete (delete hace `$pull` de todas las licitaciones)
- `POST /api/nodos/{id}/rematch` — Re-match completo
- `GET /api/nodos/{id}/licitaciones` — Licitaciones paginadas del nodo
- `GET /api/licitaciones/?nodo=ID` — Filtro por nodo
- `GET /api/licitaciones/facets` — Incluye faceta nodos (`$unwind` antes de `$group`)

### Frontend
- `/nodos` — Pagina de gestion (NodosPage.tsx)
- NodoForm: keyword groups + acciones + color picker + digest frequency selector
- NodoCard: frequency badge (violet "1x/dia"/"2x/dia"), last digest timestamp
- NodoBadge: Badge con color dot en cards y detail page
- FilterSidebar/MobileFilterDrawer: Seccion "Nodos" con faceted counts
- ActiveFiltersChips: Muestra nombre del nodo (via nodoMap)
- useNodos hook: Fetch + nodoMap (Record<id, Nodo>)
- LicitacionesList.tsx pasa nodoMap a FilterSidebar, MobileFilterDrawer, LicitacionCard, ActiveFiltersChips

### Nodos iniciales (seed_nodos.py)
- **Servicios IT Ultima Milla** (azul, 4 grupos, 93 keywords): Modernizacion, Software, Infraestructura IT, Telecomunicaciones
- **Vivero** (verde, 5 grupos, 88 keywords): Plantas, Insumos, Infraestructura, Servicios, Equipamiento

### Datos actuales
- 1,495/3,231 licitaciones matcheadas (46%)
- IT: 1,296 matches | Vivero: 259 matches

### Nodo Digest Notifications (nodo_digest_service.py)

Envia digests periodicos por nodo con licitaciones nuevas desde `last_digest_sent`.

**Frecuencias** (campo `digest_frequency` en nodo):
- `"none"` — sin notificaciones
- `"daily"` — 1x/dia a las 9:15am (default)
- `"twice_daily"` — 2x/dia a las 9:15am y 6pm

**Flujo**:
1. APScheduler llama `run_digest(["daily", "twice_daily"])` a las 9:15am
2. Query nodos activos con frecuencia matcheante
3. Para cada nodo: query licitaciones con `nodos: nodo_id` AND `fecha_scraping > last_digest_sent`
4. Si hay items nuevos: genera token publico, construye mensaje, envia por acciones habilitadas
5. Actualiza `last_digest_sent` en el nodo

**Telegram**: Max 10 items, titulo+org+presupuesto, link clickeable con token.
**Email**: HTML con tabla (max 20 items), header con color del nodo, columnas: licitacion, organizacion, presupuesto, apertura.

**CRITICO**: Email `config.to` puede contener direcciones separadas por `;` (legacy). El digest service normaliza splitting por `;` antes de enviar. El NodoForm frontend tambien splitea por `,` y `;`.

**Test manual**:
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

Los links en notificaciones de nodo incluyen `?token=xxx` (JWT con `sub: "reader"`, TTL 30 dias).

### Flujo
1. `create_public_access_token(ttl_days=30)` en `auth_service.py` genera JWT reader
2. Links: `https://licitometro.ar/licitacion/{id}?token=xxx`
3. `POST /api/auth/token-login` (auth-exempt) valida token y setea cookie `access_token`
4. Frontend `App.js`: al montar, si URL tiene `?token=xxx`, llama token-login, recibe cookie, limpia URL con `history.replaceState`
5. SPA funciona normalmente con la cookie de sesion

### Archivos involucrados
- `backend/services/auth_service.py`: `create_public_access_token()`, `verify_token()` acepta `sub: "reader"`
- `backend/routers/auth.py`: `POST /api/auth/token-login`
- `backend/server.py`: `/api/auth/token-login` en `AUTH_EXEMPT_PATHS`
- `frontend/src/App.js`: Token exchange en `handleStartup()`

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
