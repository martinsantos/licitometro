#!/usr/bin/env node
/**
 * Local UI/UX smoke for /licitaciones and /licitacion/:id.
 *
 * Serves a built React bundle with mocked API responses, captures desktop/mobile
 * screenshots, and fails on blank render, JS errors, failed requests, or missing
 * core list content. It never contacts production.
 *
 * Usage:
 *   UIUX_BUILD_DIR=/tmp/licitometro-uiux-preview-build \
 *   UIUX_SCREENSHOT_DIR=/tmp/licitometro-uiux-screenshots \
 *   node scripts/uiux-licitaciones-preview-smoke.mjs
 */

import http from 'node:http';
import { createRequire } from 'node:module';
import { access, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const require = createRequire(path.join(ROOT, 'frontend/package.json'));

const BUILD_DIR = path.resolve(process.env.UIUX_BUILD_DIR || '/tmp/licitometro-uiux-preview-build');
const OUT_DIR = path.resolve(process.env.UIUX_SCREENSHOT_DIR || '/tmp/licitometro-uiux-screenshots');
const HEADLESS = process.env.HEADLESS !== 'false';
const TARGET_PATH = '/licitaciones';
const DETAIL_ID = 'mock-2145-2025';
const today = new Date().toISOString().slice(0, 10);
const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

const FORBIDDEN_BUILD_DIRS = [
  '/usr/share/nginx/html',
  '/opt/licitometro-prod-ui/build',
  '/opt/licitometro/frontend/build',
];

const licitaciones = [
  {
    id: 'mock-2145-2025',
    title: 'ADQUISICION DE MATERIALES P/ TAREAS VIALES EN TULUMAYA Y COSTA DE ARAUJO',
    organization: 'MUNICIPALIDAD DE LAVALLE',
    publication_date: today,
    opening_date: '2026-07-02T10:00:00',
    expedient_number: '2145/2025',
    licitacion_number: '2145/2025',
    objeto: 'Compra de materiales para mantenimiento vial urbano y rural.',
    budget: 6927500,
    currency: 'ARS',
    fuente: 'Boletin Oficial Mendoza (PDF)',
    fuentes: ['Boletin Oficial Mendoza (PDF)'],
    status: 'active',
    estado: 'vigente',
    jurisdiccion: 'Mendoza',
    tipo_procedimiento: 'Licitacion Publica',
    category: 'Obra publica',
    workflow_state: 'descubierta',
    fecha_scraping: today,
    first_seen_at: today,
    tags: ['Turismo'],
    nodos: ['mendoza'],
    metadata: {
      budget_source: 'scraper',
      sgi_antecedentes: [
        { nombre: 'Mantenimiento vial 2024', cliente: 'Lavalle', presupuesto: 5400000, sgi_id: 'sgi-1' },
      ],
    },
  },
  {
    id: 'mock-129-lpu26',
    title: 'ADQUISICION DE IMPLANTE COCLEAR UNILATERAL',
    organization: 'OSEP - OBRA SOCIAL DE EMPLEADOS PUBLICOS',
    publication_date: today,
    opening_date: '2026-06-26T12:00:00',
    expedient_number: '129-LPU26',
    licitacion_number: '129-LPU26',
    objeto: 'Provision de implante coclear unilateral con accesorios.',
    budget: 60000000,
    currency: 'ARS',
    fuente: 'Boletin Oficial Mendoza (PDF)',
    fuentes: ['Boletin Oficial Mendoza (PDF)'],
    status: 'active',
    estado: 'vigente',
    jurisdiccion: 'Mendoza',
    tipo_procedimiento: 'Licitacion Publica',
    category: 'Salud',
    workflow_state: 'descubierta',
    fecha_scraping: today,
    first_seen_at: yesterday,
    tags: ['Servicios IT Ultima Milla'],
    nodos: ['salud'],
  },
  {
    id: 'mock-maipu-3321',
    title: 'PROVISION DE EQUIPAMIENTO PARA RED DE DATOS MUNICIPAL',
    organization: 'Municipalidad de Maipu',
    publication_date: yesterday,
    opening_date: '2026-07-10T09:30:00',
    licitacion_number: '3321/2026',
    objeto: 'Switches, racks y soporte de instalacion para dependencias municipales.',
    budget: 18450000,
    currency: 'ARS',
    fuente: 'Maipu',
    fuentes: ['Maipu'],
    status: 'active',
    estado: 'vigente',
    jurisdiccion: 'Mendoza',
    tipo_procedimiento: 'Compra Directa',
    category: 'Tecnologia',
    workflow_state: 'en_revision',
    fecha_scraping: today,
    first_seen_at: today,
    tags: ['Infraestructura'],
    nodos: ['mendoza', 'tech'],
  },
];

const nodos = [
  {
    id: 'mendoza',
    name: 'Mendoza',
    slug: 'mendoza',
    scope: 'mendoza',
    description: 'Oportunidades provinciales',
    color: '#059669',
    keyword_groups: [],
    categories: [],
    actions: [],
    active: true,
    digest_frequency: 'daily',
    matched_count: 1677,
    created_at: today,
    updated_at: today,
  },
  {
    id: 'tech',
    name: 'Tecnologia',
    slug: 'tecnologia',
    scope: 'global',
    description: 'Infraestructura y software',
    color: '#2563eb',
    keyword_groups: [],
    categories: [],
    actions: [],
    active: true,
    digest_frequency: 'daily',
    matched_count: 104,
    created_at: today,
    updated_at: today,
  },
];

function detailLicitacion(id = DETAIL_ID) {
  const base = licitaciones.find((item) => item.id === id) || licitaciones[0];
  return {
    ...base,
    description: 'Detalle de obra vial con documentacion tecnica, pliego adjunto y requisitos de entrega.',
    source_url: 'https://example.test/pliegos/mock-2145-2025.pdf',
    canonical_url: 'https://example.test/licitaciones/mock-2145-2025',
    enrichment_level: 2,
    workflow_state: 'evaluando',
    workflow_history: [
      { to_state: 'descubierta', timestamp: `${today}T09:00:00Z`, notes: 'Detectada por scraper' },
      { to_state: 'evaluando', timestamp: `${today}T11:00:00Z`, notes: 'Revisión inicial' },
    ],
    items: [
      { descripcion: 'Ripio seleccionado', cantidad: 120, unidad: 'm3' },
      { descripcion: 'Arena gruesa', cantidad: 80, unidad: 'm3' },
    ],
    attached_files: [
      { name: 'Anexo tecnico.pdf', url: 'https://example.test/anexo.pdf', size: 120000 },
    ],
    pliegos_bases: [
      { nombre: 'Pliego base', url: 'https://example.test/pliego.pdf', fuente: 'local' },
    ],
    requisitos: {
      documentacion: ['Constancia fiscal', 'Declaracion jurada'],
      capacidad_tecnica: ['Antecedentes en obras viales'],
      red_flags: [],
    },
    requisitos_participacion: ['Inscripcion vigente', 'Garantia de mantenimiento de oferta'],
    garantias: [{ tipo: 'Mantenimiento de oferta', monto: 350000 }],
    fecha_publicacion_portal: today,
    fecha_inicio_consultas: today,
    fecha_fin_consultas: '2026-06-25T10:00:00',
    metadata: {
      ...base.metadata,
      ia_resumen: {
        items_principales: ['Materiales viales', 'Entrega en Lavalle'],
        documentacion: ['Constancia fiscal', 'Oferta economica'],
      },
      ia_resumen_provider: 'mock',
      pliego_local_url: 'https://example.test/pliego-local.pdf',
    },
  };
}

function sendJson(res, body, status = 200) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

function apiResponse(req, res, url) {
  const pathname = url.pathname;

  if (pathname === '/api/auth/check') {
    sendJson(res, { role: 'admin', email: 'uiux-preview@example.test' });
    return true;
  }
  if (pathname === '/api/cotizar-ai/ai-usage') {
    sendJson(res, { today_calls: 2, today_tokens: 0, token_limit: 100000, status: 'ok', providers: {} });
    return true;
  }
  if (pathname === '/api/licitaciones/favorites') {
    sendJson(res, []);
    return true;
  }
  if (pathname === '/api/nodos/' || pathname === '/api/nodos') {
    sendJson(res, nodos);
    return true;
  }
  if (pathname === '/api/company-context/profiles') {
    sendJson(res, [
      { company_id: 'ultima-milla', nombre: 'Ultima Milla' },
    ]);
    return true;
  }
  if (pathname === `/api/company-context/profiles/ultima-milla/score/${DETAIL_ID}`) {
    sendJson(res, {
      score: 82,
      nivel: 'alto',
      razones: [
        { peso: 18, texto: 'Antecedentes compatibles con obra publica' },
        { peso: 12, texto: 'Zona de entrega cubierta' },
      ],
      company_id: 'ultima-milla',
      requisitos_available: true,
      requirements_context: {
        source: 'ai_extraction_v2',
        documentacion_count: 2,
        capacidad_tecnica_count: 1,
        has_budget: true,
        has_zone: true,
      },
    });
    return true;
  }
  if (pathname === '/api/licitaciones/stats/daily-counts') {
    sendJson(res, { counts: { [today]: 28, [yesterday]: 1 } });
    return true;
  }
  if (pathname === '/api/licitaciones/stats/scraping-activity') {
    sendJson(res, {
      hours: Number(url.searchParams.get('hours') || 24),
      truly_new: 29,
      re_indexed: 0,
      updated: 803,
      by_source: [
        { fuente: 'Maipu', truly_new: 8, re_indexed: 0, updated: 50 },
        { fuente: 'Boletin Oficial Mendoza (PDF)', truly_new: 14, re_indexed: 0, updated: 349 },
        { fuente: 'ComprasApps Mendoza', truly_new: 7, re_indexed: 0, updated: 111 },
      ],
    });
    return true;
  }
  if (pathname === '/api/licitaciones/stats/truly-new-count') {
    sendJson(res, { total: 29 });
    return true;
  }
  if (pathname === '/api/licitaciones/facets') {
    sendJson(res, {
      fuente: [
        { value: 'Maipu', count: 1677 },
        { value: 'Boletin Oficial Mendoza (PDF)', count: 349 },
        { value: 'ComprasApps Mendoza', count: 111 },
        { value: 'MPF Mendoza', count: 104 },
      ],
      status: [{ value: 'active', count: 2524 }],
      estado: [{ value: 'vigente', count: 2524 }],
      category: [
        { value: 'Obra publica', count: 830 },
        { value: 'Salud', count: 420 },
        { value: 'Tecnologia', count: 290 },
      ],
      workflow_state: [
        { value: 'descubierta', count: 1700 },
        { value: 'en_revision', count: 824 },
      ],
      jurisdiccion: [{ value: 'Mendoza', count: 2524 }],
      tipo_procedimiento: [
        { value: 'Licitacion Publica', count: 1550 },
        { value: 'Compra Directa', count: 640 },
      ],
      organization: [
        { value: 'Municipalidad de Maipu', count: 1677 },
        { value: 'MUNICIPALIDAD DE LAVALLE', count: 82 },
        { value: 'OSEP - OBRA SOCIAL DE EMPLEADOS PUBLICOS', count: 61 },
      ],
      nodos: [
        { value: 'mendoza', count: 1677 },
        { value: 'tech', count: 104 },
      ],
    });
    return true;
  }
  if (pathname === '/api/licitaciones/distinct/fuente') {
    sendJson(res, ['Maipu', 'Boletin Oficial Mendoza (PDF)', 'ComprasApps Mendoza', 'MPF Mendoza']);
    return true;
  }
  if (pathname === '/api/licitaciones/distinct/status') {
    sendJson(res, ['active', 'closed']);
    return true;
  }
  if (pathname === '/api/licitaciones/rubros/list') {
    sendJson(res, {
      rubros: [
        { id: 'obra-publica', nombre: 'Obra publica' },
        { id: 'salud', nombre: 'Salud' },
        { id: 'tecnologia', nombre: 'Tecnologia' },
      ],
    });
    return true;
  }
  if (pathname === '/api/licitaciones/presets') {
    sendJson(res, []);
    return true;
  }
  if (pathname === `/api/licitaciones/${DETAIL_ID}`) {
    sendJson(res, detailLicitacion(DETAIL_ID));
    return true;
  }
  if (pathname === `/api/licitaciones/similar/${DETAIL_ID}`) {
    sendJson(res, [licitaciones[1], licitaciones[2]]);
    return true;
  }
  if (pathname === `/api/adjudicaciones/competencia/${DETAIL_ID}`) {
    sendJson(res, {
      query: 'materiales viales',
      total_adjudicaciones: 0,
      proveedores: [],
    });
    return true;
  }
  if (pathname === '/api/licitaciones/' || pathname === '/api/licitaciones') {
    sendJson(res, {
      items: licitaciones,
      paginacion: {
        pagina: Number(url.searchParams.get('page') || 1),
        total_paginas: 101,
        total_items: 2524,
        por_pagina: Number(url.searchParams.get('size') || 25),
      },
      auto_filters: {},
    });
    return true;
  }

  sendJson(res, { ok: true });
  return true;
}

async function sendStatic(req, res, pathname) {
  const normalized = pathname === '/' ? '/index.html' : pathname;
  const candidate = path.normalize(path.join(BUILD_DIR, normalized));
  if (!candidate.startsWith(path.normalize(BUILD_DIR))) {
    res.writeHead(403);
    res.end('forbidden');
    return;
  }

  try {
    const data = await readFile(candidate);
    const ext = path.extname(candidate);
    const type = ext === '.html' ? 'text/html; charset=utf-8'
      : ext === '.js' ? 'text/javascript; charset=utf-8'
      : ext === '.css' ? 'text/css; charset=utf-8'
      : ext === '.json' ? 'application/json; charset=utf-8'
      : ext === '.svg' ? 'image/svg+xml'
      : 'application/octet-stream';
    res.writeHead(200, { 'content-type': type });
    res.end(data);
  } catch {
    const fallback = await readFile(path.join(BUILD_DIR, 'index.html'));
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(fallback);
  }
}

async function assertBuildDir() {
  const normalized = path.normalize(BUILD_DIR);
  if (FORBIDDEN_BUILD_DIRS.some((dir) => normalized === path.normalize(dir))) {
    throw new Error(`Refusing to smoke-test production build dir: ${BUILD_DIR}`);
  }
  await access(path.join(BUILD_DIR, 'index.html'), fsConstants.R_OK);
}

function loadChromium() {
  try {
    return require('playwright').chromium;
  } catch {
    return require('@playwright/test').chromium;
  }
}

async function firstExisting(paths) {
  for (const candidate of paths) {
    try {
      await stat(candidate);
      return candidate;
    } catch {
      // try next
    }
  }
  return null;
}

async function launchBrowser() {
  const chromium = loadChromium();
  const executablePath = process.env.PLAYWRIGHT_CHROME_PATH || await firstExisting([
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ]);
  const options = { headless: HEADLESS };
  if (executablePath) options.executablePath = executablePath;
  return chromium.launch(options);
}

function startServer() {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
    if (url.pathname.startsWith('/api/')) {
      apiResponse(req, res, url);
      return;
    }
    await sendStatic(req, res, url.pathname);
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${address.port}` });
    });
  });
}

async function collectPageEvidence(page, url, screenshotPath, fullPage) {
  const consoleErrors = [];
  const pageErrors = [];
  const requestFailures = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(String(err)));
  page.on('requestfailed', (req) => {
    requestFailures.push(`${req.method()} ${req.url()} ${req.failure()?.errorText || ''}`);
  });

  await page.goto(url, { waitUntil: 'networkidle' });
  await page.locator('text=/ADQUISICION DE MATERIALES|Compra de materiales/i').first().waitFor({ timeout: 15000 });
  const screenshot = await page.screenshot({ path: screenshotPath, fullPage });
  const bodyText = await page.locator('body').innerText();
  const overflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  return {
    checks: {
      titleVisible: await page.locator('h1:has-text("Licitaciones"), h2:has-text("Licitaciones")').first().isVisible(),
      resultCountVisible: await page.locator('text=2524').first().isVisible(),
      firstResultVisible: await page.locator('text=/ADQUISICION DE MATERIALES|Compra de materiales|Provision de implante/i').first().isVisible(),
      filterButtonVisible: await page.locator('button:has-text("Filtros")').first().isVisible().catch(() => false),
      screenshotBytes: screenshot.length,
      horizontalOverflowPx: Math.max(0, overflow.scrollWidth - overflow.clientWidth),
      bodyTextSample: bodyText.slice(0, 500),
    },
    consoleErrors,
    pageErrors,
    requestFailures,
  };
}

async function collectDetailEvidence(page, url, screenshotPath, fullPage) {
  const consoleErrors = [];
  const pageErrors = [];
  const requestFailures = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(String(err)));
  page.on('requestfailed', (req) => {
    requestFailures.push(`${req.method()} ${req.url()} ${req.failure()?.errorText || ''}`);
  });

  await page.goto(url, { waitUntil: 'networkidle' });
  await page.locator('text=/ADQUISICION DE MATERIALES|Compra de materiales/i').first().waitFor({ timeout: 15000 });

  const pliegoTab = page.locator('button:has-text("Pliego IA")').first();
  await pliegoTab.click({ timeout: 10000 });
  await page.waitForSelector('text=Asistente de Pliego', { timeout: 10000 });

  const screenshot = await page.screenshot({ path: screenshotPath, fullPage });
  const bodyText = await page.locator('body').innerText();
  const overflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  return {
    checks: {
      titleVisible: await page.locator('h1', { hasText: /ADQUISICION DE MATERIALES|Compra de materiales/i }).first().isVisible(),
      scoreVisible: await page.locator('text=Ultima Milla').first().isVisible(),
      pliegoPanelVisible: await page.locator('text=Asistente de Pliego').first().isVisible(),
      pliegoButtonVisible: await page.locator('button:has-text("Analizar pliego")').first().isVisible(),
      screenshotBytes: screenshot.length,
      horizontalOverflowPx: Math.max(0, overflow.scrollWidth - overflow.clientWidth),
      bodyTextSample: bodyText.slice(0, 500),
    },
    consoleErrors,
    pageErrors,
    requestFailures,
  };
}

function assertEvidence(label, evidence, { requireFilterButton = false } = {}) {
  const failures = [];
  const { checks } = evidence;
  if (!checks.titleVisible) failures.push(`${label}: title not visible`);
  if (!checks.resultCountVisible) failures.push(`${label}: result count not visible`);
  if (!checks.firstResultVisible) failures.push(`${label}: first result not visible`);
  if (requireFilterButton && !checks.filterButtonVisible) failures.push(`${label}: mobile filter button not visible`);
  if (checks.screenshotBytes < 5000) failures.push(`${label}: screenshot looks too small/blank`);
  if (checks.horizontalOverflowPx > 2) failures.push(`${label}: horizontal overflow ${checks.horizontalOverflowPx}px`);
  if (evidence.consoleErrors.length) failures.push(`${label}: console errors: ${evidence.consoleErrors.join(' | ')}`);
  if (evidence.pageErrors.length) failures.push(`${label}: page errors: ${evidence.pageErrors.join(' | ')}`);
  if (evidence.requestFailures.length) failures.push(`${label}: request failures: ${evidence.requestFailures.join(' | ')}`);
  return failures;
}

function assertDetailEvidence(label, evidence) {
  const failures = [];
  const { checks } = evidence;
  if (!checks.titleVisible) failures.push(`${label}: detail title not visible`);
  if (!checks.scoreVisible) failures.push(`${label}: score panel not visible`);
  if (!checks.pliegoPanelVisible) failures.push(`${label}: Pliego IA panel not visible`);
  if (!checks.pliegoButtonVisible) failures.push(`${label}: analyze pliego button not visible`);
  if (checks.screenshotBytes < 5000) failures.push(`${label}: screenshot looks too small/blank`);
  if (checks.horizontalOverflowPx > 2) failures.push(`${label}: horizontal overflow ${checks.horizontalOverflowPx}px`);
  if (evidence.consoleErrors.length) failures.push(`${label}: console errors: ${evidence.consoleErrors.join(' | ')}`);
  if (evidence.pageErrors.length) failures.push(`${label}: page errors: ${evidence.pageErrors.join(' | ')}`);
  if (evidence.requestFailures.length) failures.push(`${label}: request failures: ${evidence.requestFailures.join(' | ')}`);
  return failures;
}

async function main() {
  await assertBuildDir();
  await mkdir(OUT_DIR, { recursive: true });

  const { server, baseUrl } = await startServer();
  const browser = await launchBrowser();

  try {
    const desktopPath = path.join(OUT_DIR, 'licitaciones-desktop.png');
    const mobilePath = path.join(OUT_DIR, 'licitaciones-mobile.png');
    const detailDesktopPath = path.join(OUT_DIR, 'licitacion-detail-desktop.png');
    const detailMobilePath = path.join(OUT_DIR, 'licitacion-detail-mobile.png');

    const desktopPage = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const desktop = await collectPageEvidence(desktopPage, `${baseUrl}${TARGET_PATH}`, desktopPath, false);

    const mobilePage = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 2 });
    const mobile = await collectPageEvidence(mobilePage, `${baseUrl}${TARGET_PATH}`, mobilePath, true);

    const detailDesktopPage = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const detailDesktop = await collectDetailEvidence(
      detailDesktopPage,
      `${baseUrl}/licitacion/${DETAIL_ID}`,
      detailDesktopPath,
      true,
    );

    const detailMobilePage = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 2 });
    const detailMobile = await collectDetailEvidence(
      detailMobilePage,
      `${baseUrl}/licitacion/${DETAIL_ID}`,
      detailMobilePath,
      true,
    );

    const failures = [
      ...assertEvidence('desktop', desktop),
      ...assertEvidence('mobile', mobile, { requireFilterButton: true }),
      ...assertDetailEvidence('detail desktop', detailDesktop),
      ...assertDetailEvidence('detail mobile', detailMobile),
    ];

    const report = {
      ok: failures.length === 0,
      baseUrl,
      buildDir: BUILD_DIR,
      screenshotDir: OUT_DIR,
      screenshots: {
        desktop: desktopPath,
        mobile: mobilePath,
        detailDesktop: detailDesktopPath,
        detailMobile: detailMobilePath,
      },
      desktop,
      mobile,
      detailDesktop,
      detailMobile,
      failures,
    };

    await writeFile(path.join(OUT_DIR, 'licitaciones-smoke-report.json'), `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify({
      ok: report.ok,
      screenshots: report.screenshots,
      failures: report.failures,
    }, null, 2));

    if (failures.length) process.exitCode = 1;
  } finally {
    await browser.close().catch(() => {});
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
