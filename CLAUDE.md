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
backend/
  server.py, models/licitacion.py, db/models.py
  routers/: licitaciones.py, nodos.py, scheduler.py, workflow.py, auth.py, comprar.py, public.py, cotizar_ai.py
  scrapers/: base_scraper.py, scraper_factory.py, resilient_http.py, mendoza_compra_v2.py,
             comprasapps_mendoza_scraper.py, generic_html_scraper.py, boletin_oficial_mendoza_scraper.py,
             godoy_cruz_scraper.py, las_heras_scraper.py, [aysam, osep, uncuyo, vialidad, emesa, epre]_scraper.py
  services/: generic_enrichment.py, cross_source_service.py, nodo_matcher.py, nodo_digest_service.py,
             notification_service.py, scheduler_service.py, vigencia_service.py, category_classifier.py,
             auth_service.py, pliego_ai_service.py, pliego_storage_service.py, link_health_service.py,
             [workflow, enrichment, auto_update, smart_search, dedup, storage_cleanup, url_resolver]_service.py
  utils/: dates.py, object_extractor.py, text_search.py, proceso_id.py, filter_builder.py
frontend/src/
  components/licitaciones/: LicitacionCard, LicitacionTable, FilterSidebar, MobileFilterDrawer,
                             SearchBar, SortDropdown, ActiveFiltersChips, EstadoBadge, PliegoChatPanel
  components/nodos/: NodoBadge, NodoCard, NodoForm
  hooks/: useLicitacionData, useLicitacionFilters, useFacetedFilters, useNodos, useDebounce
  types/licitacion.ts, utils/filterParams.ts, pages/
```

---

## Patrones Criticos

### Agregar un campo nuevo al modelo — 3 lugares obligatorios
1. `backend/models/licitacion.py` — Pydantic model
2. `backend/db/models.py` — `licitacion_entity()` mapper
3. `frontend/src/types/licitacion.ts` — TypeScript interface

### Routing de scrapers (`scraper_factory.py`)
Rutea por URL primero, luego por nombre. **CRITICO**: Check `scraper_type=generic_html` ANTES del fallback `mendoza.gov.ar`, o `ipvmendoza.gov.ar` es capturada por substring match.

### Route ordering en FastAPI
Rutas fijas (`/stats/*`, `/search/*`) ANTES de rutas con path params (`/{id}`) en `routers/licitaciones.py`.

### MongoDB: NUNCA usar model_dump(mode='json')
Convierte datetimes a ISO strings → MongoDB ordena strings y dates por separado. Usar `model_dump()` (modo python).

### COMPR.AR URLs (CRÍTICO)
- `VistaPreviaPliegoCiudadano.aspx?qs=...` → ESTABLE, datos ricos
- `ComprasElectronicas.aspx?qs=...` → SESSION-DEPENDENT, resuelve al homepage sin sesión
- NUNCA reintroducir Selenium para listing. HTTP postback = 82s vs 15 min.
- **VIEWSTATE es per-page**: guardar hidden fields por página para detail postbacks.
- **Retry-After**: capear a 120s. comprar.gob.ar envía 3600s.
- **Tokens expirados**: retornan HTTP 200 con `PantallaError.aspx` en form action — no son 4xx.

### ComprasApps GeneXus (`hli00048`)
URL estable: `hli00048?{anio},{cuc},{tipo_code},{seq}` — permanente, sin sesión.
`canonical_url` y `url_quality="direct"` se setean al scraper. Columnas: COL_ANIO=14, COL_SEQ=15, COL_TIPO_CODE=17, COL_CUC=18.
`vESTFILTRO=A` (Adjudicadas) retorna 0 filas — portal no expone adjudicadas públicamente.

### Encoding de servidores
Leer raw bytes con `response.read()`, decodificar con fallback UTF-8 → Latin-1. NUNCA `response.text()`.

### SSL en sitios gov.ar
`ResilientHttpClient` usa `TCPConnector(ssl=False)` globalmente (certs rotos).

### title_selector en GenericHtmlScraper
El primer match DOM gana. Usar `title_selector: "h1"` (no `"h1, h2"`). Ejemplo: COPIG.

### Docker IPv6 para ISPs que bloquean datacenter (200.58.x.x)
3 configs simultáneas: `daemon.json` (ipv6+ip6tables) + `sysctl net.ipv6.conf.all.forwarding=1` + `docker-compose.prod.yml` (enable_ipv6 + subnet `2a02:4780:6e:9b84:2::/80`). Afecta: COPIG, La Paz, San Carlos.

### Pliego vs Presupuesto
Algunas fuentes publican costo del pliego (0.01%-0.5% del presupuesto real). Guardar en `metadata.costo_pliego`, marcar `metadata.budget_source = "estimated_from_pliego"`. Godoy Cruz: ratio 1:1000.

### GOLDEN RULE: ENRICHMENT NUNCA CAMBIA WORKFLOW STATE
`enrichment_level` (1→2→3) = completitud de datos. `workflow_state` = estado de negocio (solo MANUAL via PUT /workflow).
Enrichment services SOLO tocan: objeto, category, description, budget, enrichment_level. NUNCA workflow_state.

### Filtros — Pipeline (Single Source of Truth)
1. `FilterState` en `types/licitacion.ts` — 15 campos
2. `buildFilterParams()` en `utils/filterParams.ts` — FilterState → URLSearchParams
3. `build_base_filters()` en `backend/utils/filter_builder.py` — params → MongoDB query

### Link permanence
- **ComprasApps GeneXus**: URL estable forever (path params, sin sesión). Reconstruir `canonical_url` al scraper.
- **COMPR.AR ASP.NET**: `qs=` es session-hash; re-validar diariamente vía `link_health_service.py` (cron 5am); usar `numero_proceso` para re-resolución vía `PliegoURLCache`.
- **Boletín Oficial**: PDFs con URL estable mientras viva el portal — copia local imprescindible.

### Pliego storage (`pliego_storage_service.py`)
`store_pliego()`: path `/app/storage/pliegos/{fuente}/{numero}.pdf`, límite 10 MB/archivo, retorna URL pública `/pliegos/...`. Marca `metadata.pliego_local_url`, `pliego_local_size`, `pliego_stored_at`. LRU eviction en cron 4am.

---

## Taxonomía de Fechas

| Campo | Cuándo cambia | Uso correcto |
|-------|---------------|--------------|
| `first_seen_at` | NUNCA (solo INSERT) | Badge "NUEVO", filtro "Nuevas de hoy" |
| `fecha_scraping` | Cada scrape | DailyDigestStrip, actividad de indexación |
| `publication_date` | NUNCA (dato fuente) | Filtros de rango, year archival |
| `opening_date` | NUNCA (dato fuente) | Deadlines, urgencia |
| `created_at` | NUNCA | Debug, auditoría |

API params: `fecha_desde`+`fecha_hasta`+`fecha_campo` | `nuevas_desde` (first_seen_at) | `year` (publication_date).

---

## Fuentes de Datos

| Fuente | Scraper | Notas |
|--------|---------|-------|
| ComprasApps Mendoza | comprasapps_mendoza | GeneXus servlet, multi-year, estado V+P, 37 CUCs |
| COMPR.AR Mendoza | mendoza_compra_v2 | HTTP-only, ASP.NET postback, 82s |
| COMPR.AR Nacional | comprar_nacional | fast-fail on 503, comprar.gob.ar blocked |
| Boletin Oficial Mendoza | boletin_oficial_mendoza | PDF gazette, pypdf |
| COPIG, San Carlos, La Paz | generic_html | IPv6 required |
| OSEP, Maipu, IPV, Godoy Cruz, Irrigacion, EPRE, AYSAM, UNCuyo | varios | ver scrapers/ |
| Las Heras | las_heras | Selenium Oracle APEX |
| Municipios (8) | generic_html | Santa Rosa, Junin, Rivadavia, Guaymallen, Malargue, Gral Alvear, Ciudad Mza, Lujan, Tupungato |

**No viables**: ISCAMEN (JS-only), Tunuyan (login), Lavalle (tabla vacía), Senado Mendoza (páginas vacías)

---

## Produccion

### Deploy
```bash
# MÉTODO RECOMENDADO
ssh root@76.13.234.213 "cd /opt/licitometro && bash scripts/deploy-prod.sh"

# Solo rebuild frontend
ssh root@76.13.234.213 "cd /opt/licitometro && docker compose -f docker-compose.prod.yml build nginx && docker restart licitometro-nginx-1"

# Solo restart backend (NO recarga código — se requiere build)
ssh root@76.13.234.213 "docker restart licitometro-backend-1"

# Código baked en imagen: cambios en backend requieren:
# scp + docker compose build backend + up -d --no-deps backend
```

**NUNCA**: `docker compose down` o `docker compose down -v` — elimina volumes y datos.

### Ejecutar scripts en produccion
```bash
ssh root@76.13.234.213 "docker exec -w /app -e PYTHONPATH=/app licitometro-backend-1 python3 scripts/SCRIPT.py"
```

### Crons
| Qué | Cuando |
|-----|--------|
| Scraping | 8,10,12,15,19hs |
| Auto-update | 8am |
| Daily digest | 9am |
| Nodo digest | 9:15am + 6pm |
| Estado vencidas | 6am |
| COMPR.AR link health | 5am |
| Backup | cada 6h |
| Health monitor | cada 5min |

### Variables de entorno (.env → symlink → .env.production)
`MONGO_USER/PASSWORD/URL, DB_NAME, JWT_SECRET_KEY, AUTH_PASSWORD_HASH, TOKEN_EXPIRY_HOURS,
ALLOWED_ORIGINS, STORAGE_MAX_MB, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID,
SMTP_*, NOTIFICATION_EMAIL_TO, GEMINI_API_KEY, OPENCLAW_TELEGRAM_BOT_TOKEN`

### Backup & Restore
```bash
ssh root@76.13.234.213 "bash /opt/licitometro/scripts/backup-mongodb.sh"
ssh root@76.13.234.213 "bash /opt/licitometro/scripts/restore-mongodb.sh /opt/licitometro/backups/mongodb_YYYYMMDD_HHMMSS.gz"
```

### Infraestructura
- **Nginx**: Rate limiting (10r/s API, 3r/m auth). NO redirigir HTTP→HTTPS (Cloudflare Flexible SSL causa loop)
- **Email**: Postfix send-only, backend via Docker gateway 172.18.0.1:25 (`start_tls=False, use_tls=False`)
- **Troubleshooting**: `docker logs --tail=100 licitometro-backend-1` | Sin .env → "Empty host" MongoDB error

---

## HUNTER: Búsqueda Cross-Source durante Enriquecimiento

`POST /api/licitaciones/{id}/enrich` — 4 fases para TODAS las fuentes (Fases 2-3 SIEMPRE corren):
1. Enrichment por fuente (COMPR.AR → comprar.py, otros → generic_enrichment.py)
2. HUNTER — `cross_source_service.hunt_cross_sources()`
3. Nodo re-matching
4. Response

`hunt_cross_sources()`: extrae IDs (decreto/expediente/licitación/resolución/CD) → busca por campos estructurados → regex fallback en licitacion_number+title → MongoDB `$text` search (score >= 3.0). `merge_source_data()` es idempotente (solo llena vacíos).

---

## Workflow de una Licitacion

```
descubierta → evaluando → preparando → presentada / descartada
```
Transiciones: **solo manuales** via `PUT /api/licitaciones/{id}/workflow`.

**Enrichment Levels**: 1=Basic (titulo+URL), 2=Detailed (description+budget+objeto), 3=Documents (pliego text).

**Flujo fallback enrichment**: COMPR.AR → PDF/ZIP → HTML+CSS → title-only. `objeto` + `category` siempre garantizados.

---

## Modelo de Vigencia

| Estado | Criterio |
|--------|----------|
| `vigente` | `opening_date > hoy` OR null |
| `vencida` | `opening_date < hoy` AND NO prórroga |
| `prorrogada` | `fecha_prorroga > hoy` |
| `archivada` | `publication_date < 2025-01-01` |

Años válidos: 2024-2027. NUNCA `datetime.utcnow()` como fallback de fecha → retornar `None`.
Cron 6am: `vigencia_service.update_estados_batch()`.

---

## Nodos (Mapas Semanticos)

Zonas de interés por keywords. Una licitación → N nodos. Matching fuzzy: strip puntuacion → stemming español → build_accent_regex → plural suffix. Matchea: title, objeto, description (2000 chars), organization.

- Auto-match en INSERT (`scheduler_service`) y post-enrichment (`generic_enrichment`)
- Digest: 9:15am + 6pm. **CRITICO**: `config.to` puede tener `;` — siempre splitear.
- Nodo delete hace `$pull` de todas las licitaciones. Slug único.

---

## IA del Pliego (`pliego_ai_service.py`)

`PliegoAIService`: Groq (`llama-3.3-70b`) → fallback Cerebras en 429. Gemini OCR para PDFs escaneados.
- `generate_resumen()`: 6 campos estructurados, cache 30d en `metadata.ia_resumen`
- `chat()`: Q&A con history (últimas 3 exchanges), rate limit 30 req/usuario/día
- `get_pliego_text()`: prioridad local → cached metadata → description fallback
- Endpoints: `POST /api/cotizar-ai/pliego/{id}/resumen` y `/chat`

---

## Bots de Telegram

| Bot | Propósito |
|-----|-----------|
| @Licitobot (`TELEGRAM_BOT_TOKEN`) | Notificaciones push (solo sendMessage) |
| @Licitometrobot (`OPENCLAW_TELEGRAM_BOT_TOKEN`) | Asistente IA — systemd `openclaw.service` |

---

## Lecciones Aprendidas

- `passlib.hash.bcrypt` INCOMPATIBLE con `bcrypt>=5.0`. Usar `import bcrypt` directamente
- `aiosmtplib` intenta STARTTLS. Para postfix local: `start_tls=False, use_tls=False`
- Google rechaza emails sin `Message-ID` (RFC 5322). Siempre incluir `make_msgid()`
- GeneXus apps embeben datos como JSON en hidden inputs, no en tablas HTML
- BeautifulSoup `select_one` NO soporta `:contains()` (jQuery only)
- Config names pueden tener acentos (Guaymallen). Usar regex match
- `docker builder prune -af` para limpiar cache de multi-stage builds
- UTC Timezone Bug: `datetime.utcnow()` produce strings sin Z → JS los trata como local (+3h). Fix: `parseUTCDate()` en `utils/formatting.ts`. SOLO para timestamps del sistema, NO para fechas de fuentes.
- Nodo `config.to` puede tener semicolons. Siempre splitear por `;`
- COMPR.AR `cantidad` viene como `"1,00 UNIDAD/S"`. Parsear con regex `^[\d.,]+`
