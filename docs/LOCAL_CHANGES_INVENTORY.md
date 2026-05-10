# Inventario de cambios locales sin commit

Fecha: 2026-05-10

## Resumen

- Cambios tracked pendientes: 81 archivos, aprox. 4743 inserciones y 1126 borrados.
- Archivos untracked relevantes: servicios backend 0.2, routers admin/canonical, paneles frontend, tests, tooling local y docs de producto.
- El commit `56e4c53 refactor: stabilize national scraper ingestion` ya separo el bloque nacional/BAC/COMPR.AR; no mezclarlo con los bloques pendientes.

## Bloque A - Hygiene y tooling base

Objetivo: dejar el repo seguro para commitear y ejecutar checks locales.

Archivos candidatos:

- `.gitignore`
- `Makefile`
- `scripts/check-local.sh`
- `package.json`
- `pytest.ini`
- `requirements.txt`
- `frontend/package.json`
- `frontend/package-lock.json`
- `frontend/yarn.lock`
- `frontend/playwright.config.ts`
- `frontend/e2e/product-smoke.spec.ts`
- `frontend/eslint.config.js`
- `frontend/src/setupTests.ts`

Notas:

- `.gitignore` ahora ignora `.coverage`, `frontend/test-results/`, `frontend/playwright-report/`, envs locales y credenciales generadas.
- Se deja de ignorar `package.json`, `package-lock.json` y `yarn.lock`, por eso aparece `package.json` raiz como untracked.
- `pytest.ini` cambia a `tests backend/tests` y `--import-mode=importlib`; esto va junto con los borrados de `tests/__init__.py` y `backend/tests/__init__.py`.
- CI referencia `backend/requirements-dev.txt`; el archivo existe y ya esta trackeado.

Validacion recomendada:

- `make backend-test`
- `make frontend-build`
- `make e2e-smoke`

## Bloque B - AI extraction 0.2 y grounding

Objetivo: extraccion schema-first de pliegos, cache por hash, grounding de respuestas AI y persistencia compacta en licitaciones.

Archivos candidatos:

- `backend/services/ai_extraction_pipeline.py`
- `backend/services/ai_extraction_cron_service.py`
- `backend/services/ai_grounding_service.py`
- `backend/services/pliego_ai_service.py`
- `backend/routers/cotizar_ai.py`
- `backend/services/match_score_service.py`
- `backend/routers/company_context.py`
- `backend/tests/test_ai_extraction_pipeline.py`
- `backend/tests/test_ai_extraction_cron_service.py`
- `backend/tests/test_ai_grounding_service.py`
- `backend/tests/test_pliego_ai_v2_contract.py`
- `backend/tests/test_match_score_ai_v2.py`
- `backend/tests/test_company_context_score_context.py`

Dependencias:

- `backend/services/pliego_ai_service.py` importa `services.ai_extraction_pipeline` y `services.ai_grounding_service`.
- `backend/routers/cotizar_ai.py` importa `services.ai_extraction_cron_service` y `services.ai_grounding_service`.
- `backend/routers/company_context.py` importa `services.offer_readiness_service`.

Validacion observada:

- `backend/tests/test_ai_extraction_pipeline.py`, `test_ai_grounding_service.py`, `test_offer_readiness_service.py`, `test_source_readiness_metrics_service.py` y `test_query_copilot_service.py`: 16 tests pasaron.

## Bloque C - Readiness, acciones y scheduler admin

Objetivo: snapshots de readiness, metricas por fuente, backfills controlados y digest/alertas.

Archivos candidatos:

- `backend/services/offer_readiness_service.py`
- `backend/services/readiness_action_service.py`
- `backend/services/source_readiness_metrics_service.py`
- `backend/services/alertas_checker_service.py`
- `backend/services/cron_registry.py`
- `backend/routers/scheduler.py`
- `backend/routers/alertas.py`
- `backend/tests/test_offer_readiness_service.py`
- `backend/tests/test_readiness_action_service.py`
- `backend/tests/test_source_readiness_metrics_service.py`
- `backend/tests/test_cron_registry.py`

Dependencias:

- `backend/routers/scheduler.py` importa `build_source_readiness_summary` en top-level; no commitear sin `source_readiness_metrics_service.py`.
- `backend/services/cron_registry.py` activa jobs que importan `ai_extraction_cron_service`, `readiness_action_service` y `alertas_checker_service`; no desplegar parcial.

Riesgo:

- El registry pasa de 9 a 21 crons. Antes de produccion, revisar horarios, volumen y si cada job debe tener feature flag o batch limit.

## Bloque D - Canonical 0.2 y OpenArg/admin query

Objetivo: proyeccion canonical side-model, inspeccion admin, catalogo open-data y query copilot.

Archivos candidatos:

- `backend/models/tender_canonical.py`
- `backend/services/canonical_projection_service.py`
- `backend/services/open_data_catalog_service.py`
- `backend/services/query_copilot_service.py`
- `backend/routers/canonical.py`
- `backend/routers/admin_open_data.py`
- `backend/routers/admin_query.py`
- `backend/tests/test_canonical_projection_service.py`
- `backend/tests/test_canonical_router.py`
- `backend/tests/test_admin_openarg_plan_routes.py`
- `backend/tests/test_query_copilot_service.py`

Dependencias:

- `backend/server.py` ya incluye routers canonical/admin en el working tree base; como ese archivo quedo sin diff luego del commit anterior, verificar si esos includes ya estan en HEAD antes de commitear este bloque.
- Frontend admin usa `AdminOpenArgPanel` y `CanonicalTendersPanel`; coordinar con Bloque E si se quiere UI.

## Bloque E - Frontend producto/admin 0.2

Objetivo: cockpit admin, panels canonical/openarg/readiness, mejoras UX responsive, cotizar API client split y badges grounding/readiness.

Archivos candidatos:

- `frontend/src/services/api.ts`
- `frontend/src/hooks/cotizarApiClient.ts`
- `frontend/src/hooks/useCotizarAPI.ts`
- `frontend/src/hooks/useCotizarAPITypes.ts`
- `frontend/src/hooks/useLicitacionData.test.ts`
- `frontend/src/components/AIGroundingBadge.tsx`
- `frontend/src/components/admin/AdminCockpit.tsx`
- `frontend/src/components/admin/AdminCockpit.test.tsx`
- `frontend/src/components/admin/AdminOpenArgPanel.tsx`
- `frontend/src/components/admin/AdminOpenArgPanel.test.tsx`
- `frontend/src/components/admin/CanonicalTendersPanel.tsx`
- `frontend/src/components/admin/ReadinessDashboardPanel.tsx`
- `frontend/src/components/cotizar/CotizarProgressSummary.tsx`
- `frontend/src/components/cotizar/CotizarProgressSummary.test.tsx`
- `frontend/src/components/licitaciones/DecisionReadinessPanel.tsx`
- `frontend/src/components/licitaciones/DecisionReadinessPanel.test.tsx`
- `frontend/src/components/product/DecisionSummary.tsx`
- `frontend/src/components/product/DecisionSummary.test.tsx`
- `frontend/src/pages/AdminPage.js`
- `frontend/src/pages/CotizarPage.tsx`
- `frontend/src/pages/LicitacionDetailPage.js`
- `frontend/src/pages/LabPage.tsx`
- `frontend/src/App.js`
- `frontend/src/App.css`
- Otros componentes modificados menores listados por `git status`.

Dependencias:

- `AdminPage.js` importa paneles admin untracked; no commitear solo `AdminPage.js`.
- `useCotizarAPI.ts` depende de `cotizarApiClient.ts` y `useCotizarAPITypes.ts`.
- `App.js` migra de axios global a `api`; coordinar con `frontend/src/services/api.ts`.

Validacion recomendada:

- `npm --prefix frontend test -- --watchAll=false --passWithNoTests`
- `npm --prefix frontend run build`
- `npm --prefix frontend run e2e:smoke`

## Bloque F - Scraper contracts y Mendoza registry

Objetivo: contract tests y registry declarativo Mendoza pendiente, separado del commit nacional ya cerrado.

Archivos candidatos:

- `backend/scrapers/contracts.py`
- `backend/scrapers/registry/mendoza.py`
- `backend/scrapers/base_scraper.py`
- `backend/scrapers/boletin_oficial_mendoza_scraper.py`
- `backend/scrapers/datos_argentina_scraper.py`
- `backend/scrapers/mendoza_compra.py`
- `backend/scrapers/pjn_scraper.py`
- `backend/scrapers/resilient_http.py`
- `backend/tests/test_scraper_contracts.py`
- `backend/tests/test_mendoza_scraper_registry.py`
- `backend/tests/test_boletin_mendoza_evidence.py`
- `backend/tests/test_mendoza_compra_evidence.py`
- `backend/tests/test_pjn_scraper.py`

Riesgo:

- Parte de los cambios de scrapers pueden haber quedado historicamente solapados con el commit nacional. Revisar diffs puntuales antes de commitear.

## Bloque G - Scripts de backfill/operacion

Objetivo: scripts manuales para reparar pliegos, canonical URLs y objetos.

Archivos candidatos:

- `backend/scripts/add_bac_config.py`
- `backend/scripts/backfill_comprasapps_canonical_urls.py`
- `backend/scripts/backfill_comprasapps_pliegos.py`
- `backend/scripts/backfill_objeto_dedup.py`
- `backend/scripts/backfill_pliegos_universal.py`

Recomendacion:

- No mezclar con servicios/routers salvo que sean requeridos por tests.
- Marcar scripts como operativos/manuales y documentar prerequisitos (`MONGO_URL`, `DB_NAME`, dry-run si aplica).

## Bloque H - Docs/product docs

Objetivo: preservar analisis de producto sin mezclarlo con codigo ejecutable.

Archivos candidatos:

- `ANALISIS_GESTIONDELICITACIONES.md`
- `PROPUESTA_BUSQUEDA_Y_COTIZACION.md`
- `docs/licitometro-0.2.md`
- `CLAUDE.md`
- `README.md`
- `WORKING_WITH_BRANCHES.md`

Recomendacion:

- Commit docs separado, salvo fragmentos estrictamente ligados a un bloque de codigo.

## Fuera de commit

- Env locales y secretos.
- Artefactos generados de tests/cobertura.
- Capturas/reportes Playwright.
- Cambios parciales que importen archivos untracked no incluidos en el mismo bloque.
