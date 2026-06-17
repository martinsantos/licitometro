# Licitometro UI/UX Production Contract

This contract protects the current production product while UI/UX work continues in
branches and previews.

## Route Ownership

| Route | Status | Owner Boundary | Rollout Rule |
|---|---|---|---|
| `/licitaciones` | Production product | Main tender operations UI | Must preserve the stable operational interface until explicit approval. No hero redesigns, no "Radar de oportunidades", no `TENDEROPS` shell. |
| `/licitacion/:id` and `/licitaciones/:id` | Production product | Tender detail and quoting handoff | Refactors must keep detail, pliego, workflow, and cotizar actions reachable. |
| `/favoritos`, `/observatorio`, `/adjudicaciones` | Production product | Secondary operational routes | Can share the production shell, but must not drive changes into `/licitaciones` without review. |
| `/cotizar` | Admin-only product surface | Quoting workflow | Keep isolated behind auth/admin checks. Do not let cotizar visual experiments rewrite the tender list shell. |
| `/editarra` | Experiment | Editorial automation studio | Must remain isolated from `/licitaciones` components, CSS, and bundle rollout decisions. |
| `/psiweb20` | Static experiment | Nginx alias outside the SPA | Must stay outside React SPA fallback and outside production bundle changes. |

## Non-Negotiable Safety Rules

1. Do not edit, commit, or rsync `frontend/build` as part of UI/UX refactor work.
2. Nginx production must mount the stable frontend from `/opt/licitometro-prod-ui/build`, outside the rsynced repo.
3. Production deploys must preserve `frontend/build` unless an explicit frontend rollout is approved.
4. `scripts/guard-prod-frontend-source.sh` must pass before any production service restart.
5. `scripts/deploy-prod.sh` and `scripts/deploy-all.sh` must call the frontend guard before Docker actions.
6. The production workflow must exclude `frontend/build` by default and require a manual `deploy_frontend=true` input for frontend artifact rollout.
7. UI experiments must not introduce these markers into production `/licitaciones` source or build artifacts:
   - `Radar de oportunidades`
   - `Listado completo para examinar`
   - `TENDEROPS`
   - `licito-codex-shell`
   - `codex-hero`

## Production Visual Baseline

`/licitaciones` is an information-dense operations surface, not a marketing page.
The baseline to preserve while refactoring:

- Compact sticky dark header with clear active route.
- Dense tender workspace with filters, search, year presets, sorting, view toggle, active chips, and result list/table.
- Sidebar filters on desktop and drawer filters on mobile.
- First viewport focused on the work surface, not explanatory copy.
- Stable controls with predictable dimensions and no layout shift during loading, filtering, or hover.
- Functional affordances first: source, validity, opening date, budget, favorite, share, enrich, cotizar.

## Refactor Direction

Refactors should move the app toward a quieter operational system:

- Prefer restrained white/gray surfaces, 1px borders, and limited shadow.
- Use 8px radius or less for repeated operational components unless there is a local reason.
- Replace decorative gradients, oversized cards, and emoji labels in controls with consistent icons or text.
- Keep text at readable sizes; avoid viewport-scaled font sizes.
- Avoid `transition-all`; animate only color, opacity, transform, border-color, or box-shadow when needed.
- Keep hover effects subtle and gated by context; no row jumps or theatrical motion.
- Preserve dense scanning: titles, organism/source, dates, budget, and status must stay visible without opening a detail page.

## Required Evidence Before Any UI Rollout

Before proposing production rollout of a UI/UX change, collect all evidence below:

- Branch/PR is based on production guardrails.
- `frontend/build` is absent from the diff.
- `bash scripts/audit-uiux-production-boundaries.sh` passes.
- `bash scripts/test-prod-frontend-guard.sh` passes.
- Frontend unit/smoke checks relevant to changed components pass.
- `make uiux-preview-build uiux-preview-smoke` passes for `/licitaciones`, `/licitacion/:id`, and the admin `/cotizar` handoff, using `UIUX_BUILD_DIR` outside the repo and outside production paths.
- Desktop and mobile screenshots exist for `/licitaciones`, `/licitacion/:id`, `/cotizar`, `/editarra` if touched, and `/psiweb20` if nginx is touched.
- Production itself was not deployed or rebuilt during review unless explicitly approved.
