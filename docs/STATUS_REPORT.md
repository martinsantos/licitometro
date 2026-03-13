
# LICITOMETRO - Reporte de Estado del Proyecto

**Fecha:** 2026-03-13
**Branch:** `main`

---

## 1. Resumen Ejecutivo

Licitometro es un sistema de monitoreo y análisis de licitaciones públicas argentinas, con foco en la **Provincia de Mendoza** y fuentes nacionales (COMPR.AR / comprar.gob.ar). El proyecto es un sistema de producción activo en **https://licitometro.ar**.

**Estado general: Sistema en producción con 25+ fuentes activas, ~3200+ licitaciones indexadas, notificaciones automáticas y CI/CD completo.**

---

## 2. Grado de Avance por Componente

### 2.1 Backend (FastAPI) - ✅ Completo

| Módulo | Estado | Detalle |
|--------|--------|---------|
| API REST (CRUD licitaciones) | ✅ Funcional | Endpoints GET/POST/PUT/DELETE con filtros avanzados |
| API REST (scraper configs) | ✅ Funcional | CRUD de configuraciones + trigger manual |
| API COMPR.AR proxy | ✅ Funcional | Proxy para pliego/proceso endpoints |
| MongoDB 7.0 | ✅ Funcional | Motor async, índices de texto, 3200+ documentos |
| Autenticación JWT | ✅ Funcional | Cookie-based JWT + bcrypt, token público para links |
| Scheduling (APScheduler) | ✅ Funcional | 5x diario (8,10,12,15,19hs), 7 días/sem |
| Notificaciones Telegram | ✅ Funcional | @Licitobot, digest diario 9am, digest por nodo |
| Notificaciones Email | ✅ Funcional | Postfix relay, HTML digest con tabla |
| Enrichment pipeline | ✅ Funcional | HTML/PDF/ZIP, objeto, categoría, nodo matching |
| Workflow state machine | ✅ Funcional | descubierta→evaluando→preparando→presentada |
| Vigencia (estados) | ✅ Funcional | vigente/vencida/prorrogada/archivada, cron 6am |
| Nodos semánticos | ✅ Funcional | Fuzzy matching, digest por nodo, CRUD |
| /api/licitaciones-ar | ✅ Funcional | Router independiente filtrado por tag LIC_AR |
| CI/CD GitHub Actions | ✅ Funcional | Build check en PRs, deploy a producción en push main |

### 2.2 Frontend (React/TypeScript) - ✅ Completo

| Módulo | Estado | Detalle |
|--------|--------|---------|
| /licitaciones (Mendoza) | ✅ Funcional | Filtros facetados, cards/tabla, sort adaptativo |
| /licitaciones-ar (Nacional) | ✅ Funcional | Stats strip, filtros, misma UI que Mendoza |
| /nodos | ✅ Funcional | CRUD de nodos semánticos con grupos de keywords |
| Filtros avanzados | ✅ Funcional | Booking.com-style sidebar, mobile drawer |
| Notificaciones in-app | ✅ Funcional | DailyDigestStrip, NovedadesStrip |
| Autenticación | ✅ Funcional | Login, JWT cookie, token-login via URL |
| "Nuevas de hoy" | ✅ Funcional | Botón quick preset, filtra por first_seen_at |
| Workflow UI | ✅ Funcional | Badge, Stepper, transiciones manuales |
| Estado/Vigencia UI | ✅ Funcional | EstadoBadge, filtro por estado |
| Offer templates | ✅ Funcional | CRUD + checklist en tab preparando |

### 2.3 Scrapers - ✅ 25+ Fuentes Activas

| Categoría | Fuentes | Total items |
|-----------|---------|-------------|
| ComprasApps Mendoza | 37 CUCs (servlet hli00049) | ~2601 |
| COMPR.AR Mendoza | mendoza_compra_v2 | ~91 |
| Municipios Mendoza | 12 municipios (generic_html) | ~200 |
| Organismos Mendoza | OSEP, EMESA, EPRE, IPV, COPIG, AYSAM, UNCuyo, Vialidad | ~160 |
| Nacional (COMPR.AR) | comprar_gob_ar | ~100+ |
| Boletin Oficial | PDF gazette | ~54 |
| **Total** | **25+ fuentes** | **~3200+** |

### 2.4 Infraestructura - ✅ Producción

| Componente | Estado |
|------------|--------|
| VPS Hostinger 76.13.234.213 | ✅ Activo |
| Docker Compose (4 servicios) | ✅ Activo: mongodb + backend + nginx + certbot |
| SSL/TLS Let's Encrypt | ✅ Auto-renew via certbot |
| Cloudflare CDN/Proxy | ✅ Activo (Flexible SSL) |
| Backup automático MongoDB | ✅ Cada 6h, retención 7 días |
| IPv6 Docker | ✅ Para fuentes en 200.58.x.x (San Carlos, La Paz, COPIG) |
| CI/CD GitHub Actions | ✅ Build check + deploy automático |

---

## 3. Cambios Recientes (Febrero-Marzo 2026)

### Marzo 2026
- **Fix /licitaciones-ar**: Filtro por tags (LIC_AR) en vez de jurisdicción, corrige 0 resultados
- **Stats strip en página AR**: Header con total, vigentes, fuentes, nodos, jurisdicciones
- **Consolidación páginas AR**: LicitacionesARPage.tsx unificada en LicitacionesArgentinaPage.tsx

### Febrero 2026
- **Sistema de Nodos**: Mapas semánticos con fuzzy matching, digest por nodo, CRUD completo
- **Workflow state**: descubierta→evaluando→preparando→presentada/descartada
- **Vigencia/Estado**: vigente/vencida/prorrogada/archivada con cron diario
- **CI/CD completo**: GitHub Actions, deploy automático en push main, build check en PRs
- **Backup automatizado**: Pre-deploy + cron 6h, scripts restore
- **Taxonomía de fechas**: first_seen_at vs fecha_scraping vs publication_date bien separados
- **"Nuevas de hoy"**: Filtra por first_seen_at, botón prominente en toolbar
- **25+ fuentes**: IPv6 para ISPs argentinos, 7 nuevos municipios, COMPR.AR nacional
- **Fix crítico workflow**: Removido auto-transition descubierta→evaluando en enrichment cron

---

## 4. Pendiente / Roadmap

| Item | Prioridad | Estado |
|------|-----------|--------|
| /cotizar integración | Media | Pendiente - repo separado `martinsantos/cotiza` |
| Branch protection en GitHub | Media | Pendiente - guía en docs/BRANCH_PROTECTION_SETUP.md |
| Más fuentes nacionales | Baja | comprar.gob.ar tiene más organismos disponibles |
| Prórrogas automáticas | Media | detect_prorroga() implementado, validar en producción |
| Offer applications tracking | Baja | Modelo existe, UI pendiente |
