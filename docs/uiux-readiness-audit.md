# UI/UX Refactor Readiness Audit

This audit maps the protected Licitometro UI/UX refactor goal to current
evidence in PR #106. It is a review artifact, not a production rollout request.

## Scope

- Branch: `feat/uiux-protected-refactor`
- Base: `fix/prod-ui-deploy-guardrails`
- PR: <https://github.com/martinsantos/licitometro/pull/106>
- Production rollout: not requested and not performed
- Production `/licitaciones`: remains protected by the stable external frontend
  mount and deployment guardrails

## Requirement Matrix

| Requirement | Status | Current evidence |
|---|---:|---|
| Do not touch or deploy production `/licitaciones` without explicit approval. | Satisfied for this PR | PR remains draft; no production deploy was run; `frontend/build` is untracked; production workflow preserves `frontend/build` unless `deploy_frontend=true`; `docker-compose.prod.yml` mounts `/opt/licitometro-prod-ui/build` into nginx. |
| Re-establish a stable production UI baseline for `/licitaciones`. | Satisfied for review | `docs/uiux-production-contract.md` defines the operational baseline: dense workspace, dark compact header, filters/search/year/sort/view controls, sidebar/drawer filters, result list/table, and no hero redesign markers. |
| Prevent known experimental redesign markers from leaking into production tender UI source. | Satisfied by guard | `scripts/audit-uiux-production-boundaries.sh` rejects `Radar de oportunidades`, `Listado completo para examinar`, `TENDEROPS`, `licito-codex-shell`, and `codex-hero` in the production tender source set. |
| Define a production-compatible visual system. | Satisfied for current touched surfaces | `frontend/src/App.css` defines `lic-toolbar-surface`, `lic-table-shell`, `lic-panel`, `lic-card`, `lic-empty-state`, `lic-popover`, `lic-control-transition`, and reduced-motion handling. Touched list/detail/cotizar components consume these primitives. |
| Refactor `/licitaciones` without changing data flow or API contracts. | Satisfied by review scope and tests | Changes are in list/detail UI components and shared visual primitives. Preview smoke uses mocked existing API responses and verifies list controls, results, detail, and pliego panel render correctly. |
| Keep `/cotizar` isolated behind admin access and prevent it from rewriting the tender list shell. | Satisfied by route and smoke | `frontend/src/App.js` keeps `/cotizar` admin-gated. `scripts/uiux-licitaciones-preview-smoke.mjs` validates the `/cotizar?licitacion_id=mock-2145-2025` handoff on desktop and mobile. |
| Restore and isolate `/editarra`. | Satisfied by route and smoke | `frontend/src/App.js` routes `/editarra/*` outside the authenticated product shell and bypasses startup auth checks. Smoke validates `.editarra-app`, desktop/mobile render, and `outsideProductShell: true`. |
| Keep `/psiweb20` outside the React SPA. | Satisfied by nginx/docker guard | `docker-compose.prod.yml` mounts `/opt/psicole-static/psiweb20` read-only. The boundary audit requires nginx aliases and noindex headers in both production app server blocks and verifies `/psiweb20` appears before the SPA fallback. |
| Validate with screenshots before any rollout proposal. | Satisfied for covered routes | Local smoke writes desktop/mobile screenshots for `/licitaciones`, `/licitacion/:id`, `/cotizar`, and `/editarra` to `/tmp/licitometro-uiux-screenshots`. `/psiweb20` was not visually changed; its evidence is nginx/docker isolation. |
| Avoid production build artifact churn. | Satisfied by guard and repository state | `git ls-files frontend/build` returns zero tracked files. Preview builds use `/tmp/licitometro-uiux-preview-build`, not `frontend/build` or production paths. |

## Required Commands

Run this set before moving the PR out of draft or proposing any rollout:

```bash
make uiux-boundaries
bash scripts/test-prod-frontend-guard.sh
git diff --check
node --check scripts/uiux-licitaciones-preview-smoke.mjs
CI=true npm --prefix frontend test -- --watchAll=false --passWithNoTests
make uiux-preview-build
make uiux-preview-smoke
```

Expected current evidence:

- `make uiux-boundaries`: passes.
- `bash scripts/test-prod-frontend-guard.sh`: passes.
- Frontend tests: 51 suites, 250 tests.
- Preview build directory: `/tmp/licitometro-uiux-preview-build`.
- Preview smoke report: `/tmp/licitometro-uiux-screenshots/licitaciones-smoke-report.json`.
- Preview smoke routes: `/licitaciones`, `/licitacion/mock-2145-2025`,
  `/cotizar?licitacion_id=mock-2145-2025`, and `/editarra`.
- Preview smoke failure list: `[]`.
- Horizontal overflow: `0` for all checked desktop/mobile views.

## Screenshot Artifacts

Current smoke screenshot paths:

- `/tmp/licitometro-uiux-screenshots/licitaciones-desktop.png`
- `/tmp/licitometro-uiux-screenshots/licitaciones-mobile.png`
- `/tmp/licitometro-uiux-screenshots/licitacion-detail-desktop.png`
- `/tmp/licitometro-uiux-screenshots/licitacion-detail-mobile.png`
- `/tmp/licitometro-uiux-screenshots/cotizar-detail-desktop.png`
- `/tmp/licitometro-uiux-screenshots/cotizar-detail-mobile.png`
- `/tmp/licitometro-uiux-screenshots/editarra-desktop.png`
- `/tmp/licitometro-uiux-screenshots/editarra-mobile.png`

## Rollout Gate

This PR is not self-authorizing. Production rollout still requires explicit
approval to deploy frontend artifacts. Until that approval exists, production
continues serving the stable frontend from `/opt/licitometro-prod-ui/build`.
