# Codex Skin 2.0 Design

## Goal

Improve the current LICITOMETRO Codex theme into a more legible, balanced, mature product interface. The goal is not to add decoration; it is to make the existing system easier to read, scan, compare, and operate across the critical tender workflows.

## Current Problem

The Codex-inspired skin is visible across the app, but it still feels uneven in places:

- Some labels, tabs, table cells, and metadata are too small for repeated operational use.
- Headers, cards, panels, and tables do not yet share a fully consistent rhythm.
- Several screens still feel technically correct rather than product-finished.
- Dense pages such as listado, single, admin, cotizador, observatorio, adjudicaciones, and stats need better hierarchy.
- Mobile is mostly stable, but the layout needs a final pass for comfortable reading and action selection.

## Product Direction

LICITOMETRO should feel like an operational procurement workbench:

- Quiet and utilitarian.
- Dense enough for scanning and comparison.
- Clear enough for non-technical users to understand tender status, urgency, source, workflow, and next action.
- Restrained in color and chrome.
- Consistent across authenticated, admin, analytical, and public surfaces.

## Design Principles

1. **Legibility first**
   Main reading text should be no smaller than 15-16px where possible. Functional labels can be smaller only when they are secondary and not required for primary decisions.

2. **Balance over density**
   Dense screens should remain compact, but they need stable gutters, clear section breaks, and enough vertical rhythm to avoid looking cramped.

3. **Semantic color only**
   Blue is primary/navigation, green is ready/success, amber is pending/warning, red is risk/destructive, and neutrals carry structure. Purple, decorative gradients, glass effects, and heavy shadows remain legacy.

4. **Fewer competing badges**
   Status chips should explain meaningful state. Repeated low-value chips should be collapsed, softened, or moved into metadata rows.

5. **Tables as professional ledgers**
   Tables need readable row height, predictable action slots, clearer headers, and better mobile fallbacks.

6. **Mobile as a designed layout**
   Mobile should not be a squeezed desktop. Tabs, actions, readiness panels, filters, and tables should use compact but readable patterns.

## Scope

### In Scope

- Recalibrate type scale, line-height, spacing, and control heights.
- Refine shared CSS primitives in `frontend/src/App.css`.
- Improve route-level hierarchy for:
  - `/licitaciones`
  - `/licitacion/:id`
  - `/cotizar`
  - `/admin`
  - `/favoritos`
  - `/adjudicaciones`
  - `/observatorio`
  - `/stats`
  - `/templates`
  - `/nodos`
- Improve visible empty, loading, and error states.
- Add or update structural tests that protect key visual hooks.
- Validate with build, Jest, `git diff --check`, and Playwright screenshots.

### Out of Scope

- Backend scraper behavior.
- Authentication behavior.
- New business logic for scoring, IA, enrichment, or quoting.
- A full component library rewrite.
- Pixel-perfect Wikimedia Codex cloning.

## Target Improvements

### Type And Spacing

- Increase base readability on critical controls and metadata.
- Reduce oversized display text inside panels.
- Normalize section spacing across routes.
- Keep letter spacing at 0 except small uppercase kickers.

### Listado

- Make the tender list the most polished product surface.
- Improve toolbar hierarchy, filters, group headers, record density, table view, and mobile view.
- Ensure titles, organisms, source, urgency, opening date, and actions are immediately scannable.

### Single Tender

- Refine hero balance, action column, readiness panel, workflow, tabs, sidebar sections, tables, and document blocks.
- Ensure next action is visible without overpowering the title.
- Keep mobile tabs readable without incoherent horizontal overflow.

### Cotizador

- Make the cotizador feel like a guided workbench.
- Improve progress summary, favorites/search tabs, quote cards, editor sections, form fields, and export actions.

### Admin

- Make admin a cockpit with clear priority, not a pile of tabs.
- Improve cockpit cards, scheduler, fuente panels, logs, quality panels, canonical/readiness panels, and nested tables.

### Secondary Routes

- Bring favoritos, adjudicaciones, observatorio, stats, templates, nodos, perfil, and public pages into the same visual rhythm.
- Replace remaining ad hoc styles where they cause inconsistent proportions.

## Acceptance Criteria

- Critical interactive text is readable at desktop and mobile sizes.
- Buttons, inputs, selects, tabs, chips, tables, and panels share consistent sizing.
- Listado and single feel visually finished in desktop and mobile screenshots.
- Admin, cotizador, observatorio, favoritos, adjudicaciones, stats, templates, and nodos no longer feel like separate visual systems.
- Playwright QA reports no incoherent overflow on the core routes.
- `npm run build` passes.
- `npm test -- --watchAll=false` passes.
- `git diff --check` passes.
- Known backend/environment issues are documented separately and not confused with UI failures.

## Validation Routes

- `/licitaciones`
- `/licitacion/69f495d00d3bb8702c04d1fc`
- `/cotizar`
- `/admin`
- `/favoritos`
- `/adjudicaciones`
- `/observatorio`
- `/stats`
- `/templates`
- `/nodos`

## Spec Self-Review

- All requirements are concrete and verifiable.
- The scope is limited to UI/UX refinement.
- The goal is measurable through screenshots, tests, build output, and QA metrics.
- Backend and environment failures are explicitly out of scope.
