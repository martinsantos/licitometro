import { expect, Page, test } from '@playwright/test';

const sampleLicitacion = {
  id: 'lic-1',
  title: 'Compra de equipamiento informatico',
  objeto: 'Compra de notebooks para escuelas',
  organization: 'Ministerio de Educacion',
  publication_date: '2026-05-01T00:00:00Z',
  opening_date: '2026-12-31T00:00:00Z',
  budget: 1200000,
  fuente: 'ComprasApps Mendoza',
  estado: 'vigente',
  status: 'active',
  workflow_state: 'evaluando',
  enrichment_level: 2,
  source_url: 'https://example.com/source',
  canonical_url: 'https://example.com/pliego.pdf',
  items: [{ name: 'Notebook' }],
};

async function mockApi(page: Page) {
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path === '/api/auth/check') {
      return route.fulfill({ json: { role: 'admin', email: 'admin@test.local' } });
    }
    if (path === '/api/licitaciones/' || path === '/api/licitaciones') {
      return route.fulfill({
        json: {
          items: [sampleLicitacion],
          paginacion: { pagina: 1, total_paginas: 1, total_items: 1, por_pagina: 25 },
          auto_filters: {},
        },
      });
    }
    if (path === '/api/licitaciones/lic-1') {
      return route.fulfill({ json: sampleLicitacion });
    }
    if (path === '/api/licitaciones/facets') {
      return route.fulfill({ json: { fuente: {}, category: {}, estado: {}, organization: {} } });
    }
    if (path === '/api/scheduler/runs') {
      return route.fulfill({ json: [] });
    }
    if (path === '/api/scheduler/status') {
      return route.fulfill({ json: { running: true, jobs: [] } });
    }
    if (path === '/api/scheduler/stats') {
      return route.fulfill({ json: { total_runs: 0, success_rate: 0 } });
    }
    if (path.includes('/stats/') || path.includes('/scheduler/') || path.includes('/canonical/')) {
      return route.fulfill({ json: { items: [], sources: {}, jobs: [], running: true, total: 0 } });
    }
    if (path === '/api/nodos/') {
      return route.fulfill({ json: [] });
    }
    if (path === '/api/cotizaciones/') {
      return route.fulfill({ json: [] });
    }
    if (path === '/api/cotizaciones/stats/resumen') {
      return route.fulfill({ json: { total: 0 } });
    }

    return route.fulfill({ json: {} });
  });
}

test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    viewport: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
  }));
  expect(overflow.documentWidth).toBeLessThanOrEqual(overflow.viewport + 1);
  expect(overflow.bodyWidth).toBeLessThanOrEqual(overflow.viewport + 1);
}

test('loads list, detail, cotizar and admin cockpit', async ({ page }) => {
  await page.goto('/licitaciones');
  await expect(page.getByRole('heading', { name: 'Licitaciones', exact: true })).toBeVisible();
  await expect(page.getByText('Resultados', { exact: true })).toBeVisible();
  await expect(page.getByText('Compra de notebooks para escuelas')).toBeVisible();

  await page.goto('/licitacion/lic-1');
  await expect(page.getByText('Qué falta para cotizar')).toBeVisible();
  await expect(page.getByRole('link', { name: /cotizar/i })).toBeVisible();

  await page.goto('/cotizar?licitacion_id=lic-1');
  await expect(page.getByText('Resumen para cotizar')).toBeVisible();
  await expect(page.getByText('Armar Cotización')).toBeVisible();

  await page.goto('/admin');
  await expect(page.getByLabel('Cockpit operativo')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Fuentes de Datos' })).toBeVisible();
});

test('top navigation stays inside responsive viewports', async ({ page }) => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
    { width: 768, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/licitaciones');
    await expect(page.getByRole('banner')).toBeVisible();
    await expectNoHorizontalOverflow(page);

    if (viewport.width < 768) {
      await page.getByRole('button', { name: /abrir menú/i }).click();
      await expect(page.getByRole('navigation')).toBeVisible();
      await expectNoHorizontalOverflow(page);
    }
  }
});
