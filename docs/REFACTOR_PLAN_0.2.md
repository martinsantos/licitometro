# Refactor 0.2 - Estado y Ejecucion

## Baseline observado

- Produccion publica: `https://licitometro.ar` healthy, `www` redirige al dominio raiz.
- Verificado 2026-05-09: `/`, `/licitaciones`, `/argentina` y `/admin` sirven la SPA con HTTP 200.
- Backend productivo observado: imagen Docker construida el 2026-05-01, no bind mount de codigo.
- Frontend productivo: `frontend/build` servido por bind mount desde el VPS.
- GitHub `main`: `6a400b1 HOTFIX: Pliego persistence pipeline - download, store, serve local PDFs`.
- Repo local `/Applications/um/licitometro`: `dad3dfd FIX: await get_db() en 6 routers`.
- Repo VPS `/opt/licitometro`: `b58ce05 feat: Adjudicaciones router + AdjudicacionesPage`.

## Ya implementado

- Pliegos locales servidos desde `/pliegos/...`.
- AI 0.2 con resumen, chat, `extract-v2`, batches y cache por hash.
- Canonical 0.2 como side projection en `tender_canonical_projections`.
- Readiness operativo/admin en `offer_readiness_snapshots`.
- Adjudicaciones con endpoint publico y precios de referencia.
- Observatorio/open-data parcial.
- Catalogo y alertas existen en codigo, pero sin adopcion de datos.
- Registry declarativo Mendoza para routing de scrapers.
- Registry declarativo Argentina/global para COMPR.AR Nacional, BAC, PJN, Datos Argentina, PBAC, Santa Fe, CONTRAT.AR, Boletin Oficial Nacional, Banco Mundial y BID.

## Brechas actuales

- Versionado/deploy desalineado entre GitHub, repo local, repo VPS, frontend bind-mounted y backend baked image.
- `/api/open-data/licitaciones` fallaba con documentos que tienen `objeto` y `description` nulos.
- Health del scheduler podia dar falso negativo en workers que no sostienen el lock del scheduler.
- Nginx dependia de IP Docker fija para el backend.
- COMPR.AR Nacional y BAC Buenos Aires ya traen datos productivos por Selenium, pero son fuentes `list_only` porque sus URLs publicas son listados/portales, no detalle estable.
- Embeddings/search semantico estan en codigo, pero sin datos productivos.

## Bloque actual

- Hacer robusto el serializador OCDS ante campos nulos y fechas invalidas.
- Hacer `/api/health` menos dependiente del worker actual usando actividad reciente de `scraper_runs`.
- Cambiar nginx a DNS Docker (`backend:8000`) con resolver IPv4, evitando IP bridge fija.
- Mantener `licitaciones` como coleccion operativa y `canonical` como read-model 0.2.

## Siguientes bloques

- Reconstruir y desplegar backend desde un commit unico y trazable.
- Rotar/sanitizar credenciales del remote Git del VPS.
- Mantener monitoreo de COMPR.AR Nacional y BAC con `expected_min_items` y circuit breaker; evitar tratarlas como fuentes de detalle hasta resolver URLs estables por item.
- Poblar readiness y AI 0.2 con backfills acotados.
- Convertir Empresa/Catalogo/Cotizacion en flujo usable antes de invertir en hybrid search avanzado.

## Bloque 2 - Registry nacional

- `scraper_factory.py` queda como coordinador fino: primero intenta registry Mendoza, luego registry Argentina/global.
- Las fuentes nacionales se mueven a `backend/scrapers/registry/argentina.py` con `source_id`, estrategia, dominios y aliases.
- BAC acepta tanto `bac.buyarg.com` como `buenosairescompras.gob.ar`, pero produccion debe usar `www.buenosairescompras.gob.ar` porque `bac.buyarg.com` resuelve a loopback en el VPS.
- El ruteo nacional queda cubierto por tests focalizados para COMPR.AR Nacional, BAC, PJN y Datos Argentina.

## Bloque 3 - Scrapers nacionales productivos

- Se agrego `selectors.expected_min_items` para fuentes criticas: una corrida con 0 items queda como `empty_suspicious`, no como success silencioso.
- `COMPR.AR Nacional` queda como unica config activa para comprar.gob.ar; el duplicado `comprar_gob_ar_nacional` queda desactivado.
- COMPR.AR Nacional HTTP directo a `Compras.aspx` da `PantallaError`; Selenium sobre `Default.aspx` renderiza la grilla publica de apertura proxima.
- Smoke productivo COMPR.AR Nacional Selenium exitoso: 5 items encontrados/guardados con aperturas proximas 2026.
- COMPR.AR Nacional queda modelado como `url_quality=list_only`; `https://comprar.gob.ar/Default.aspx` se usa como procedencia, no como detalle enriquecible.
- `BAC Buenos Aires` queda activo con `www.buenosairescompras.gob.ar/BuscarAvanzado.aspx`.
- Smoke productivo BAC: DNS/host corregido; los listados `ListarAperturaProxima.aspx` y `ListarAperturaUltimos30Dias.aspx` redirigen a `Default.aspx` desde el VPS y `BuscarAvanzado.aspx` no entrega grilla SSR. Se resolvio usando navegador/Selenium.
- BAC Selenium implementado: entra por `Default.aspx`, abre `BuscarAvanzado.aspx`, busca terminos semilla, filtra estado `Publicado` y parsea la grilla renderizada.
- Smoke BAC Selenium productivo exitoso: 46 items productivos auditados con procesos publicados 2026.
- BAC queda activo en produccion con schedule acotado `30 8 * * 1-5`, `max_items=50` y terminos `servicio`, `obra`, `mantenimiento`, `adquisicion`, `insumos`.
- BAC queda modelado como `url_quality=list_only`; `BuscarAvanzado.aspx` se usa como procedencia, no como detalle enriquecible.

## Bloque 4 - Guardrails de enriquecimiento nacional

- `GenericEnrichmentService` corta temprano si `url_quality == "list_only"` y aplica enriquecimiento title-only sin fetch HTTP.
- `EnrichmentCronService` mueve `list_only` al pase title-only y lo excluye del pase HTTP.
- `url_helpers.is_unfetchable_url()` reconoce `comprar.gob.ar/Default.aspx` y `buenosairescompras.gob.ar/BuscarAvanzado.aspx` como listados no enriquecibles.
- Backfill productivo 2026-05-09: `COMPR.AR Nacional` 5 registros y `bac_buenos_aires` 46 registros quedaron en `url_quality=list_only`, `enrichment_level=2`.
- Limpieza productiva 2026-05-09: 25 registros nacionales con metadata `cross_source_merges`/HUNTER previa fueron saneados; conteo final `cross_merges_exact=0`.

## Riesgos abiertos

- El repo sigue con muchas modificaciones locales y archivos sin trackear; antes de consolidar release hay que separar cambios intencionales de trabajo experimental.
- `backend/.env` y `gha-creds-*.json` aparecen borrados en el working tree local; no revertir sin confirmar origen, pero no deben formar parte de un commit de refactor.
- COMPR.AR Nacional/BAC siguen siendo fuentes de lista: sirven para descubrimiento, no para pliego/detalle hasta encontrar URL estable por expediente.

## Manifiesto de commit recomendado

Incluir solo estos archivos para consolidar el refactor 0.2 desplegado:

- `backend/routers/open_data.py`
- `backend/server.py`
- `backend/scrapers/bac_scraper.py`
- `backend/scrapers/comprar_asp_base.py`
- `backend/scrapers/comprar_nacional_scraper.py`
- `backend/scrapers/scraper_factory.py`
- `backend/scrapers/registry/__init__.py`
- `backend/scrapers/registry/argentina.py`
- `backend/services/enrichment/orchestrator.py`
- `backend/services/enrichment/url_helpers.py`
- `backend/services/enrichment_cron_service.py`
- `backend/services/scheduler_service.py`
- `backend/services/scraper_health_monitor.py`
- `backend/tests/test_argentina_scraper_parsers.py`
- `backend/tests/test_argentina_scraper_registry.py`
- `backend/tests/test_enrichment_orchestrator.py`
- `backend/tests/test_open_data_router.py`
- `docs/REFACTOR_PLAN_0.2.md`
- `nginx/nginx.conf`

No incluir en este commit: `.env`, credenciales, cambios masivos de frontend, caches, coverage, Playwright output ni archivos experimentales no relacionados.
