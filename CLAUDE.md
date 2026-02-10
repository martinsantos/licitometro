# Licitometro - Documentacion del Proyecto

Plataforma de monitoreo de licitaciones publicas de Mendoza, Argentina. Agrega datos de 21+ fuentes gubernamentales, los enriquece automaticamente y los presenta en una interfaz web con filtros, busqueda y notificaciones.

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
│   │   ├── scraper_config.py      # ScraperConfig model
│   │   ├── scraper_run.py         # ScraperRun tracking
│   │   ├── offer_template.py      # Offer templates CRUD
│   │   └── offer_application.py   # Offer applications
│   ├── db/
│   │   └── models.py              # MongoDB doc → dict entity mappers
│   ├── routers/
│   │   ├── licitaciones.py        # CRUD + search + filters + stats
│   │   ├── scheduler.py           # Scraper scheduling + manual triggers
│   │   ├── scraper_configs.py     # Scraper config CRUD
│   │   ├── workflow.py            # Workflow state transitions
│   │   ├── offer_templates.py     # Offer templates CRUD
│   │   ├── auth.py                # Login/logout (JWT cookie)
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
│   │   ├── workflow_service.py    # State machine (descubierta→evaluando→...)
│   │   ├── enrichment_service.py  # Enrichment orchestration
│   │   ├── notification_service.py # Telegram + Email (daily digest 9am)
│   │   ├── auto_update_service.py # Re-enrich active licitaciones (8am cron)
│   │   ├── smart_search_parser.py # NLP search query parsing
│   │   ├── deduplication_service.py # Content hash dedup
│   │   ├── auth_service.py        # bcrypt + JWT
│   │   ├── storage_cleanup_service.py # Disk cleanup
│   │   └── url_resolver.py        # URL resolution
│   ├── utils/
│   │   ├── dates.py               # parse_date_guess (14 formats, Spanish months)
│   │   └── object_extractor.py    # extract_objeto(), is_poor_title()
│   └── scripts/                   # One-off migration/backfill scripts
│       ├── backfill_objeto.py     # Populate objeto field for existing records
│       ├── backfill_opening_date.py
│       ├── backfill_categories.py
│       ├── backfill_budget.py
│       ├── migrate_add_workflow.py
│       ├── migrate_text_index.py
│       ├── discover_sources.py    # Probe URLs for new procurement sources
│       └── ...
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   └── licitaciones/
│   │   │       ├── LicitacionCard.tsx    # Card view (objeto||title heading)
│   │   │       ├── LicitacionTable.tsx   # Table view
│   │   │       ├── FilterSidebar.tsx     # Booking.com-style faceted filters
│   │   │       ├── MobileFilterDrawer.tsx # Slide-out drawer (<lg)
│   │   │       ├── SearchBar.tsx         # Text + mode toggle (A/AI/+)
│   │   │       ├── SortDropdown.tsx      # Sort field selector
│   │   │       ├── ViewToggle.tsx        # Card/table toggle
│   │   │       ├── ActiveFiltersChips.tsx
│   │   │       ├── CriticalRubrosConfig.tsx
│   │   │       ├── ListSkeleton.tsx
│   │   │       ├── Pagination.tsx
│   │   │       └── PresetSelector.tsx
│   │   ├── hooks/
│   │   │   ├── useLicitacionData.ts      # API fetching (AbortController)
│   │   │   ├── useLicitacionFilters.ts   # useReducer filter state
│   │   │   ├── useLicitacionPreferences.ts
│   │   │   ├── useFacetedFilters.ts
│   │   │   ├── useFilterOptions.ts
│   │   │   ├── useLocalStorage.ts
│   │   │   └── useDebounce.ts            # 700ms text search debounce
│   │   ├── types/
│   │   │   └── licitacion.ts             # Licitacion, FilterState, SortField, etc.
│   │   ├── utils/
│   │   │   └── formatting.ts             # Date formatting, urgency helpers
│   │   └── pages/
│   │       └── LicitacionesList.tsx      # Orchestrator (480 lines)
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

### Route ordering en FastAPI
Rutas con prefijo fijo (`/stats/*`, `/search/*`) deben registrarse ANTES de rutas con path params (`/{licitacion_id}`) en `backend/routers/licitaciones.py`. FastAPI matchea en orden de registro.

### MongoDB: NUNCA usar model_dump(mode='json')
`model_dump(mode='json')` convierte datetimes a ISO strings. MongoDB almacena strings y dates como BSON types distintos y los ordena por separado. Usar `model_dump()` (modo python) y convertir solo campos no-BSON (HttpUrl → str).

### Busqueda frontend
`LicitacionesList.tsx` envia parametro `q` a `GET /api/licitaciones/`. El endpoint DEBE tener param `q` o la busqueda se ignora silenciosamente.

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

---

## Fuentes de Datos (21 activas)

| Fuente | Scraper | Items aprox | Notas |
|--------|---------|-------------|-------|
| COMPR.AR Mendoza | mendoza_compra_v2 | ~91 | ASP.NET WebForms, pliego parsing |
| Boletin Oficial Mendoza | boletin_oficial_mendoza | ~54 | PDF gazette, pypdf extraction |
| Maipu | generic_html (inline) | ~2272 | WordPress table, ZIP enrichment |
| OSEP | osep | ~43 | Obra social |
| Santa Rosa | generic_html | ~25 | CMS |
| Junin | generic_html | ~13 | CMS |
| Godoy Cruz | godoy_cruz | ~10 | GeneXus JSON grid, pliego→budget |
| Irrigacion | generic_html | ~9 | JHipster (limitado) |
| General Alvear | generic_html | ~9 | CMS |
| Malargue | generic_html | ~9 | CMS |
| Vialidad Mendoza | vialidad_mendoza | ~10 | Dedicado |
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

**No viables**: Irrigacion (microservicio roto), Tunuyan (login requerido), Lavalle (tabla vacia)
**Bloqueados por ISP**: San Carlos, La Paz (200.58.x.x bloquea IPs de datacenter)

---

## Produccion

### Deploy
```bash
ssh root@76.13.234.213 "cd /opt/licitometro && bash deploy.sh"
```
El script hace: `git pull` → `docker compose build` → stop → start → healthcheck.

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

---

## Categorias (Rubros)

34 categorias en `backend/data/rubros_comprar.json`. Clasificacion automatica via `category_classifier.py` usando keywords match contra titulo + objeto + description (primeros 500 chars para evitar falsos positivos de boilerplate).

El usuario puede marcar hasta N rubros como "criticos" (localStorage). Las cards muestran badges de urgencia para licitaciones en rubros criticos.

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
