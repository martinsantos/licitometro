# Codex Refinement 1.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine LICITOMETRO into a consistent, accessible, Codex-aligned operational UI across all core tender, quoting, admin, analytics, and secondary routes.

**Architecture:** Implement the refinement in layers: first establish tokens and visual-system primitives, then migrate core routes to those primitives, then harden responsive behavior and regression tests. Keep the existing React app and CSS architecture, but split visual-system concerns into focused files if `App.css` becomes too broad to reason about safely.

**Tech Stack:** React, TypeScript/JavaScript, Create React App, CSS, Tailwind utility classes already present in components, Jest/React Testing Library, Playwright for visual QA.

---

## File Structure

- Modify: `frontend/src/App.css`
  Owns global CSS imports and compatibility bridge while migration is in progress.
- Create: `frontend/src/styles/codex-tokens.css`
  Defines LICITOMETRO/Codex tokens for color, type, spacing, radius, state, focus, and overlay.
- Create: `frontend/src/styles/codex-primitives.css`
  Defines reusable primitive classes for buttons, panels, forms, tabs, tables, badges, toolbars, drawers, alerts, and empty states.
- Modify: `frontend/src/App.js`
  Imports the new CSS files after `App.css` or updates CSS import order if the team prefers `App.css` to import them.
- Modify: `frontend/src/components/LicitacionesList.tsx`
  Applies refined list/workbench hooks.
- Modify: `frontend/src/components/licitaciones/LicitacionTable.tsx`
  Applies table primitive hooks.
- Modify: `frontend/src/pages/LicitacionDetailPage.js`
  Applies refined detail hooks and mobile tab structure.
- Modify: `frontend/src/pages/CotizarPage.tsx`
  Applies workbench primitives and removes remaining emoji-as-control labels where they function as UI controls.
- Modify: `frontend/src/pages/AdminPage.js`
  Applies cockpit grouping and admin tab primitives.
- Modify: `frontend/src/pages/FavoritosPage.js`
  Applies empty/list/card primitives.
- Modify: `frontend/src/pages/AdjudicacionesPage.tsx`
  Applies table/form/search primitives.
- Modify: `frontend/src/pages/ObservatorioPage.tsx`
  Applies metric/panel/chart primitives over current inline-heavy layout.
- Modify: `frontend/src/pages/StatsPage.js`
  Applies metric/panel primitives.
- Modify: `frontend/src/pages/OfferTemplatesPage.tsx`
  Applies template card/form primitives.
- Modify: `frontend/src/pages/NodosPage.tsx`
  Applies node panel/form primitives.
- Modify: `frontend/src/pages/PerfilPage.tsx`
  Applies account summary primitives.
- Modify: `frontend/src/pages/PublicListPage.tsx`
  Applies public list primitives.
- Modify: `frontend/src/pages/PublicLicitacionPage.tsx`
  Applies public detail primitives.
- Create or modify: `frontend/src/App.visual-system.test.js`
  Verifies app-level visual-system imports and global class availability.
- Create or modify: route-specific structure tests under `frontend/src/pages/*.structure.test.js`
  Verifies core routes expose visual-system hooks.
- Create: `frontend/scripts/qa-codex-refinement.mjs`
  Runs Playwright screenshots and basic visual metrics against desktop/mobile routes.

---

### Task 1: Token Layer

**Files:**
- Create: `frontend/src/styles/codex-tokens.css`
- Modify: `frontend/src/App.js`
- Test: `frontend/src/App.visual-system.test.js`

- [ ] **Step 1: Write the failing import test**

Add or update `frontend/src/App.visual-system.test.js`:

```js
import fs from 'fs';
import path from 'path';

describe('LICITOMETRO Codex visual system imports', () => {
  const appJs = fs.readFileSync(path.join(__dirname, 'App.js'), 'utf8');

  test('loads token and primitive stylesheets', () => {
    expect(appJs).toContain('./styles/codex-tokens.css');
    expect(appJs).toContain('./styles/codex-primitives.css');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --watchAll=false App.visual-system.test.js`

Expected before implementation: FAIL because `App.js` does not import both new stylesheets.

- [ ] **Step 3: Create token CSS**

Create `frontend/src/styles/codex-tokens.css`:

```css
:root {
  --lm-canvas: #f8f9fa;
  --lm-paper: #ffffff;
  --lm-paper-muted: #f1f4f7;
  --lm-ink: #202122;
  --lm-subtle: #54595d;
  --lm-muted: #72777d;
  --lm-line: #a2a9b1;
  --lm-line-soft: #d8dee4;
  --lm-blue: #3366cc;
  --lm-blue-hover: #447ff5;
  --lm-blue-soft: #eaf3ff;
  --lm-green: #14866d;
  --lm-green-soft: #d5fdf4;
  --lm-amber: #ac6600;
  --lm-amber-soft: #fff3d6;
  --lm-red: #d73333;
  --lm-red-soft: #ffe9e5;
  --lm-focus: 0 0 0 2px rgb(51 102 204 / 0.22);
  --lm-radius: 4px;
  --lm-radius-tight: 2px;
  --lm-radius-pill: 999px;
  --lm-font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
```

- [ ] **Step 4: Import token and primitive styles**

Modify the top of `frontend/src/App.js`:

```js
import React, { useState, useEffect, lazy, Suspense } from "react";
import "./App.css";
import "./styles/codex-tokens.css";
import "./styles/codex-primitives.css";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- --watchAll=false App.visual-system.test.js`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.js frontend/src/styles/codex-tokens.css frontend/src/App.visual-system.test.js
git commit -m "feat(ui): add codex refinement token layer"
```

---

### Task 2: Primitive CSS Layer

**Files:**
- Create: `frontend/src/styles/codex-primitives.css`
- Test: `frontend/src/App.visual-system.test.js`

- [ ] **Step 1: Extend primitive test**

Add to `frontend/src/App.visual-system.test.js`:

```js
describe('LICITOMETRO Codex primitive CSS', () => {
  const primitives = fs.readFileSync(path.join(__dirname, 'styles/codex-primitives.css'), 'utf8');

  test('defines core reusable primitives', () => {
    [
      '.lm-button',
      '.lm-panel',
      '.lm-toolbar',
      '.lm-tabs',
      '.lm-table',
      '.lm-form-field',
      '.lm-badge',
      '.lm-empty-state'
    ].forEach(selector => {
      expect(primitives).toContain(selector);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --watchAll=false App.visual-system.test.js`

Expected before implementation: FAIL because `codex-primitives.css` does not yet define every primitive.

- [ ] **Step 3: Create primitive CSS**

Create `frontend/src/styles/codex-primitives.css`:

```css
.lm-panel {
  background: var(--lm-paper);
  border: 1px solid var(--lm-line-soft);
  border-radius: var(--lm-radius);
  box-shadow: none;
}

.lm-toolbar {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.lm-button {
  align-items: center;
  border: 1px solid var(--lm-line);
  border-radius: var(--lm-radius-tight);
  display: inline-flex;
  font-weight: 700;
  gap: 0.35rem;
  justify-content: center;
  min-height: 2rem;
  padding: 0.35rem 0.7rem;
}

.lm-button--primary {
  background: var(--lm-blue);
  border-color: var(--lm-blue);
  color: #fff;
}

.lm-button--quiet {
  background: var(--lm-paper);
  color: var(--lm-ink);
}

.lm-tabs {
  align-items: center;
  display: flex;
  gap: 0.25rem;
  overflow-x: auto;
}

.lm-tab {
  border: 1px solid transparent;
  border-radius: var(--lm-radius-tight);
  color: var(--lm-subtle);
  flex: 0 0 auto;
  min-height: 2rem;
  padding: 0.35rem 0.65rem;
}

.lm-tab[aria-selected="true"],
.lm-tab--active {
  background: var(--lm-blue-soft);
  border-color: var(--lm-blue);
  color: var(--lm-blue);
}

.lm-table {
  background: var(--lm-paper);
  border: 1px solid var(--lm-line-soft);
  border-collapse: separate;
  border-spacing: 0;
  width: 100%;
}

.lm-table th {
  background: var(--lm-paper-muted);
  color: var(--lm-subtle);
  font-size: 0.72rem;
  font-weight: 850;
  text-transform: uppercase;
}

.lm-table th,
.lm-table td {
  border-bottom: 1px solid var(--lm-line-soft);
  padding: 0.55rem 0.65rem;
}

.lm-form-field {
  display: grid;
  gap: 0.3rem;
}

.lm-form-field :is(input, select, textarea) {
  background: var(--lm-paper);
  border: 1px solid var(--lm-line);
  border-radius: var(--lm-radius-tight);
  color: var(--lm-ink);
  min-height: 2.25rem;
  padding: 0.35rem 0.55rem;
}

.lm-badge {
  align-items: center;
  border: 1px solid var(--lm-line-soft);
  border-radius: var(--lm-radius-tight);
  display: inline-flex;
  font-size: 0.72rem;
  font-weight: 800;
  min-height: 1.35rem;
  padding: 0.1rem 0.4rem;
}

.lm-empty-state {
  background: var(--lm-paper);
  border: 1px dashed var(--lm-line);
  border-radius: var(--lm-radius);
  color: var(--lm-subtle);
  padding: 1rem;
  text-align: center;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --watchAll=false App.visual-system.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/styles/codex-primitives.css frontend/src/App.visual-system.test.js
git commit -m "feat(ui): add codex refinement primitives"
```

---

### Task 3: Core List and Detail Refinement

**Files:**
- Modify: `frontend/src/components/LicitacionesList.tsx`
- Modify: `frontend/src/components/licitaciones/LicitacionTable.tsx`
- Modify: `frontend/src/pages/LicitacionDetailPage.js`
- Test: `frontend/src/components/licitaciones/ListControls.structure.test.js`
- Test: `frontend/src/pages/LicitacionDetailPage.structure.test.js`

- [ ] **Step 1: Add structure assertions**

Ensure tests assert these hooks:

```js
expect(container.querySelector('.licitometro-codex-list')).toBeTruthy();
expect(container.querySelector('.codex-list-toolbar, .lm-toolbar')).toBeTruthy();
expect(container.querySelector('.codex-tender-record, .lm-panel')).toBeTruthy();
```

For detail:

```js
expect(container.querySelector('.codex-detail-shell')).toBeTruthy();
expect(container.querySelector('.codex-detail-tabs, .lm-tabs')).toBeTruthy();
expect(container.querySelector('.codex-detail-sidebar')).toBeTruthy();
```

- [ ] **Step 2: Run tests to establish baseline**

Run: `npm test -- --watchAll=false ListControls.structure.test.js LicitacionDetailPage.structure.test.js`

Expected: PASS if hooks already exist, FAIL where a hook is missing.

- [ ] **Step 3: Apply primitives**

Update list/detail class names so major surfaces include both current hooks and primitive hooks:

```tsx
<div className="licitometro-codex-list lm-workbench">
```

```tsx
<div className="codex-list-toolbar lm-toolbar lm-panel">
```

```js
<div className="codex-detail-shell lm-panel">
```

```js
<nav className="codex-detail-tabs lm-tabs">
```

- [ ] **Step 4: Run focused tests**

Run: `npm test -- --watchAll=false ListControls.structure.test.js LicitacionDetailPage.structure.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/LicitacionesList.tsx frontend/src/components/licitaciones/LicitacionTable.tsx frontend/src/pages/LicitacionDetailPage.js frontend/src/components/licitaciones/ListControls.structure.test.js frontend/src/pages/LicitacionDetailPage.structure.test.js
git commit -m "feat(ui): refine tender list and detail surfaces"
```

---

### Task 4: Cotizador and Admin Refinement

**Files:**
- Modify: `frontend/src/pages/CotizarPage.tsx`
- Modify: `frontend/src/pages/AdminPage.js`
- Modify: `frontend/src/components/cotizar/OfertaEditor.tsx`
- Modify: `frontend/src/components/AdminFuentes.tsx`
- Test: `frontend/src/pages/CotizarVisualSystem.structure.test.js`
- Test: `frontend/src/pages/AdminAnalyticsVisualSystem.structure.test.js`

- [ ] **Step 1: Add tests for workbench hooks**

In cotizar structure test, assert:

```js
expect(container.querySelector('.codex-page, .lm-workbench')).toBeTruthy();
expect(container.querySelector('.lm-tabs, .codex-tabs')).toBeTruthy();
expect(container.querySelector('.lm-empty-state, .codex-empty-state')).toBeTruthy();
```

In admin structure test, assert:

```js
expect(container.querySelector('.admin-workspace')).toBeTruthy();
expect(container.querySelector('.admin-tabs, .lm-tabs')).toBeTruthy();
expect(container.querySelector('.admin-panel, .lm-panel')).toBeTruthy();
```

- [ ] **Step 2: Run tests to establish baseline**

Run: `npm test -- --watchAll=false CotizarVisualSystem.structure.test.js AdminAnalyticsVisualSystem.structure.test.js`

Expected: FAIL only for missing hooks.

- [ ] **Step 3: Replace emoji-as-control labels**

In `CotizarPage.tsx`, convert tab/action labels from emoji-led controls to text/icon-safe labels:

```tsx
const tabs = [
  { id: 'favoritos' as const, label: 'Favoritos' },
  { id: 'cotizaciones' as const, label: 'Mis cotizaciones' },
  { id: 'activas' as const, label: 'Buscar' },
];
```

- [ ] **Step 4: Apply admin tab primitives**

Ensure `AdminPage.js` tab navigation uses:

```js
<nav className="admin-tabs lm-tabs">
```

And buttons use:

```js
className={`admin-tab lm-tab ${activeTab === tab.key ? 'lm-tab--active' : ''}`}
```

- [ ] **Step 5: Run focused tests**

Run: `npm test -- --watchAll=false CotizarVisualSystem.structure.test.js AdminAnalyticsVisualSystem.structure.test.js`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/CotizarPage.tsx frontend/src/pages/AdminPage.js frontend/src/components/cotizar/OfertaEditor.tsx frontend/src/components/AdminFuentes.tsx frontend/src/pages/CotizarVisualSystem.structure.test.js frontend/src/pages/AdminAnalyticsVisualSystem.structure.test.js
git commit -m "feat(ui): refine cotizador and admin cockpit"
```

---

### Task 5: Secondary Route Refinement

**Files:**
- Modify: `frontend/src/pages/FavoritosPage.js`
- Modify: `frontend/src/pages/AdjudicacionesPage.tsx`
- Modify: `frontend/src/pages/ObservatorioPage.tsx`
- Modify: `frontend/src/pages/StatsPage.js`
- Modify: `frontend/src/pages/OfferTemplatesPage.tsx`
- Modify: `frontend/src/pages/NodosPage.tsx`
- Modify: `frontend/src/pages/PerfilPage.tsx`
- Modify: `frontend/src/pages/PublicListPage.tsx`
- Modify: `frontend/src/pages/PublicLicitacionPage.tsx`
- Test: `frontend/src/pages/SecondaryPagesVisualSystem.structure.test.js`
- Test: `frontend/src/pages/AuxiliaryVisualSystem.structure.test.js`
- Test: `frontend/src/pages/PublicPages.structure.test.js`

- [ ] **Step 1: Add secondary route assertions**

Add assertions that each rendered route contains at least one of:

```js
expect(
  container.querySelector('.codex-page, .lm-panel, .codex-panel, .codex-public-card')
).toBeTruthy();
```

For empty states:

```js
expect(
  container.querySelector('.lm-empty-state, .codex-empty-state, [data-testid="empty-state"]')
).toBeTruthy();
```

- [ ] **Step 2: Run route structure tests**

Run: `npm test -- --watchAll=false SecondaryPagesVisualSystem.structure.test.js AuxiliaryVisualSystem.structure.test.js PublicPages.structure.test.js`

Expected: FAIL where route hooks or empty-state hooks are missing.

- [ ] **Step 3: Apply primitives to secondary routes**

Use these class additions consistently:

```tsx
<main className="codex-page lm-workbench">
```

```tsx
<section className="lm-panel">
```

```tsx
<div className="lm-empty-state">
```

```tsx
<table className="lm-table">
```

- [ ] **Step 4: Run route structure tests**

Run: `npm test -- --watchAll=false SecondaryPagesVisualSystem.structure.test.js AuxiliaryVisualSystem.structure.test.js PublicPages.structure.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/FavoritosPage.js frontend/src/pages/AdjudicacionesPage.tsx frontend/src/pages/ObservatorioPage.tsx frontend/src/pages/StatsPage.js frontend/src/pages/OfferTemplatesPage.tsx frontend/src/pages/NodosPage.tsx frontend/src/pages/PerfilPage.tsx frontend/src/pages/PublicListPage.tsx frontend/src/pages/PublicLicitacionPage.tsx frontend/src/pages/SecondaryPagesVisualSystem.structure.test.js frontend/src/pages/AuxiliaryVisualSystem.structure.test.js frontend/src/pages/PublicPages.structure.test.js
git commit -m "feat(ui): refine secondary codex routes"
```

---

### Task 6: Playwright Visual QA Script

**Files:**
- Create: `frontend/scripts/qa-codex-refinement.mjs`
- Modify: `frontend/package.json`

- [ ] **Step 1: Add package script**

Modify `frontend/package.json` scripts:

```json
"qa:codex-refinement": "node scripts/qa-codex-refinement.mjs"
```

- [ ] **Step 2: Create QA script**

Create `frontend/scripts/qa-codex-refinement.mjs`:

```js
const { chromium } = require('playwright');

const base = process.env.QA_BASE_URL || 'http://localhost:3001';
const routes = [
  '/licitaciones',
  '/licitacion/69f495d00d3bb8702c04d1fc',
  '/cotizar',
  '/admin',
  '/favoritos',
  '/adjudicaciones',
  '/observatorio',
  '/stats',
  '/templates',
  '/nodos',
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.route('**/api/auth/check', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ role: 'admin', email: 'qa@licitometro.local' }),
  }));

  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 950 : 1100 });
    for (const route of routes) {
      await page.goto(`${base}${route}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1000);
      const label = `${width}-${route.replaceAll('/', '-').replace(/^-/, '') || 'home'}`;
      await page.screenshot({ path: `/private/tmp/licitometro-codex-${label}.png`, fullPage: true });
      const metrics = await page.evaluate(() => {
        const visible = [...document.querySelectorAll('body *')].filter(el => {
          const rect = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          return rect.width > 1 && rect.height > 1 && style.display !== 'none' && style.visibility !== 'hidden';
        });
        return {
          gradients: visible.filter(el => /gradient/i.test(getComputedStyle(el).backgroundImage)).length,
          heavyShadows: visible.filter(el => {
            const shadow = getComputedStyle(el).boxShadow;
            return shadow && shadow !== 'none' && !shadow.includes('0px 0px 0px 2px');
          }).length,
          largeRadius: visible.filter(el => {
            const radius = Number.parseFloat(getComputedStyle(el).borderTopLeftRadius || '0');
            return radius > 8 && !String(el.className).includes('rounded-full');
          }).length,
        };
      });
      if (metrics.gradients > 0 || metrics.largeRadius > 0) {
        throw new Error(`${route} failed visual metrics: ${JSON.stringify(metrics)}`);
      }
    }
  }

  await browser.close();
})();
```

- [ ] **Step 3: Run QA script against local app**

Run: `npm run qa:codex-refinement`

Expected: screenshots are written to `/private/tmp` and the process exits 0.

- [ ] **Step 4: Commit**

```bash
git add frontend/package.json frontend/scripts/qa-codex-refinement.mjs
git commit -m "test(ui): add codex refinement visual qa"
```

---

### Task 7: Final Verification and Review

**Files:**
- All files modified by Tasks 1-6.

- [ ] **Step 1: Run build**

Run: `npm run build`

Expected: exit code 0 and `Compiled successfully.`

- [ ] **Step 2: Run full frontend tests**

Run: `npm test -- --watchAll=false`

Expected: all suites and tests pass.

- [ ] **Step 3: Run diff whitespace check**

Run: `git diff --check`

Expected: no output and exit code 0.

- [ ] **Step 4: Run visual QA**

Run: `npm run qa:codex-refinement`

Expected: exit code 0 and screenshots in `/private/tmp`.

- [ ] **Step 5: Request code review**

Use the `superpowers:requesting-code-review` workflow with:

```bash
BASE_SHA=$(git rev-parse HEAD~6)
HEAD_SHA=$(git rev-parse HEAD)
```

Description: `Codex Refinement 1.0 UI/UX pass across tokens, primitives, core routes, secondary routes, tests, and Playwright QA.`

- [ ] **Step 6: Fix review findings**

Apply fixes for Critical and Important review findings, then rerun:

```bash
npm run build
npm test -- --watchAll=false
git diff --check
npm run qa:codex-refinement
```

- [ ] **Step 7: Final commit if review fixes were needed**

```bash
git add frontend
git commit -m "fix(ui): address codex refinement review"
```

---

## Self-Review

- Spec coverage: every route and component family from the approved design has at least one task.
- Placeholder scan: no task uses open-ended placeholder language.
- Type consistency: CSS primitive names use the `lm-*` prefix throughout the plan.
- Verification: build, tests, diff check, Playwright QA, and code review are explicit final gates.
