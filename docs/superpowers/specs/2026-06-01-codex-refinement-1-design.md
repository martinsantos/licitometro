# Codex Refinement 1.0 Design

## Goal

Convert LICITOMETRO from a broad Codex-inspired visual pass into a mature operational product UI: consistent, accessible, dense where it needs to be dense, and refined enough for repeated professional use across bidding, scraping, analysis, and administration workflows.

## Reference

The design direction follows Wikimedia Codex as the reference system, using its emphasis on design tokens, reusable components, accessible states, icons, and predictable interaction patterns. LICITOMETRO will remain its own product, but the interface should feel aligned with Codex's restrained, utilitarian, content-first style.

## Product Principles

1. **Operational density over decoration**
   LICITOMETRO is a workbench for evaluating tenders, not a landing page. The UI should prioritize scanning, comparison, triage, decision readiness, and fast navigation.

2. **One system, many workflows**
   Listado, single, cotizador, admin, observatorio, favoritos, adjudicaciones, nodos, templates, and public pages must share the same grammar for panels, tables, buttons, forms, tabs, badges, empty states, and errors.

3. **Semantic color only**
   Blue is primary/navigation, green is ready/success, amber is warning/pending, red is risk/destructive, neutral surfaces carry structure. Purple/indigo gradients, glass effects, decorative shadows, and oversized radii are treated as legacy unless a documented semantic case exists.

4. **The tender list is the center**
   The list must remain the primary examination surface. It should expose title, source, organism, category, dates, urgency, readiness, affinity, and actions without forcing the user into single pages too early.

5. **Detail pages are decision pages**
   A single tender view should answer: what is it, where is it from, when does it open, what is missing, what documents exist, what has IA extracted, what is the workflow state, and what is the next operator action.

6. **Admin is a cockpit**
   Admin must feel like a coherent operational surface for source health, scraping, scheduler state, canonicalization, data quality, and system checks, not a collection of disconnected tabs.

## Scope

### In Scope

- Visual inventory of all current pages and components.
- Token consolidation in `frontend/src/App.css` or a new adjacent visual-system CSS file.
- Extraction or normalization of shared UI primitives where the current codebase benefits from it.
- Refinement of:
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
  - `/perfil`
  - public pages under `/p`
- Responsive behavior for desktop, tablet, and mobile.
- Keyboard/focus states for core controls.
- Visual regression structure tests.
- Playwright screenshot QA over the core routes.

### Out of Scope

- Backend scraper logic.
- New business logic for tender scoring or IA extraction.
- Replacing React/CSS/Tailwind wholesale.
- Pixel-perfect implementation of Wikimedia Codex components. The goal is product alignment, not vendor lock-in.

## Architecture

The refinement should happen in three layers:

1. **Design tokens**
   A stable token layer defines color, typography, spacing, borders, radius, focus, and state styles. Existing `--codex-*` and `--lm-*` tokens should be reconciled into one clear naming strategy or bridged cleanly during migration.

2. **Reusable primitives**
   Shared classes and, where justified, React wrappers define buttons, panels, toolbars, tables, tabs, badges, form fields, empty states, drawers, and status cards. Existing components should adopt these without a broad rewrite.

3. **Route-level refinement**
   Each core route gets a focused pass to improve information hierarchy, density, action placement, responsive behavior, loading/error/empty states, and legacy style removal.

## Component Targets

### Buttons and Actions

- Primary actions use blue.
- Success actions use green only when they confirm a ready or completed action.
- Destructive actions use red and must be visually distinct.
- Quiet actions use neutral surfaces with clear hover/focus states.
- Icon-only buttons need accessible labels and stable square dimensions.

### Tables and Lists

- Tables use compact headers, neutral borders, and row hover affordance.
- Long text wraps or truncates intentionally; no accidental overflow.
- Mobile tables either become horizontal scroll tables or card summaries, depending on workflow.
- The tender list should expose enough metadata for first-pass triage.

### Panels and Cards

- Panels use 4px radius or less unless they are true pills.
- Shadows are removed except for overlays/dialogs where depth helps stacking.
- Nested cards are avoided; content groups use bands, sections, or bordered panels.

### Forms

- Inputs, selects, textareas, checkboxes, and toggles share size, border, focus, disabled, and error states.
- Form labels are concise and aligned.
- Validation errors are visually consistent.

### Tabs and Navigation

- Tabs should be readable on mobile through scroll or compact wrapping.
- Active state must be clear without relying only on color.
- Admin tabs need grouping or scannable density so they do not become an unstructured strip.

### Empty, Loading, and Error States

- Empty states should state what is empty and offer the next useful action.
- Loading states should preserve layout dimensions enough to avoid jumps.
- Errors should use red for user-impacting failures and amber for partial/unavailable optional data.

## Route Requirements

### `/licitaciones`

- Keep the list as the primary surface.
- Improve filter visibility without making the first viewport feel cluttered.
- Show the selected view mode, applied filters, result count, and sorting state.
- Tender records must have stable height, readable title, source/organism/category, opening date, status, and actions.

### `/licitacion/:id`

- Preserve the improved hero but refine spacing and information grouping.
- Tabs must not create incoherent overflow on mobile.
- Cronograma, documentos, items, IA, workflow, checklist, and sidebar cards should use shared primitives.
- Next action/readiness should remain visible without overpowering the tender title.

### `/cotizar`

- Remove remaining emoji-as-control patterns where icons or text labels are more appropriate.
- Make favorited tenders, active quotes, and search feel like one workbench.
- Oferta editor sections should share form and panel styles.

### `/admin`

- Treat admin as an operations cockpit.
- Group tabs or visually prioritize the most common tasks.
- Normalize all nested admin panels, tables, alert blocks, source cards, scheduler cards, canonical cards, and readiness cards.
- Maintain high density on desktop and scrollable controls on mobile.

### Secondary Routes

Favoritos, adjudicaciones, observatorio, stats, templates, nodos, perfil, public list, and public detail should inherit the same primitives and have route-level polish where content hierarchy is currently weaker.

## Testing Strategy

1. Unit/structure tests verify required visual-system class hooks are present on critical components.
2. Existing component tests must remain green.
3. `npm run build` must compile successfully.
4. `npm test -- --watchAll=false` must pass.
5. `git diff --check` must pass.
6. Playwright screenshot QA must cover desktop and mobile for:
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

## Acceptance Criteria

- No visible gradients, glass, heavy shadows, or large non-pill radii remain in core authenticated routes.
- Purple/indigo legacy styling is removed or mapped to primary blue.
- Core pages share button, form, table, panel, badge, tabs, and empty-state behavior.
- Desktop screenshots show coherent information hierarchy.
- Mobile screenshots show no incoherent overlaps, broken tabs, or clipped action labels.
- The design layer is documented enough that future pages can follow it without copying ad hoc CSS.

## Spec Self-Review

- No placeholder sections remain.
- The scope is limited to UI/UX refinement and does not include backend behavior.
- The architecture has three clear layers: tokens, primitives, route refinement.
- Each acceptance criterion is verifiable through tests, screenshots, or code inspection.
