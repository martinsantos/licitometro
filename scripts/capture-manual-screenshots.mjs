#!/usr/bin/env node
/**
 * Auto-captures screenshots for the Licitómetro manual.
 *
 * Usage:
 *   npm install -g playwright && npx playwright install chromium
 *   LICITOMETRO_PASSWORD=xxx node scripts/capture-manual-screenshots.mjs
 *
 * Optional env vars:
 *   BASE_URL       (default: https://licitometro.ar)
 *   OUT_DIR        (default: ./manual/assets/img)
 *   ONLY           (comma-separated filenames to capture; skip others)
 *   HEADLESS       (default: true; set to "false" to watch)
 */

import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const BASE_URL = process.env.BASE_URL || 'https://licitometro.ar';
const PASSWORD = process.env.LICITOMETRO_PASSWORD;
const READER_TOKEN = process.env.LICITOMETRO_READER_TOKEN;
const ADMIN_JWT = process.env.LICITOMETRO_ADMIN_JWT;
const OUT_DIR = process.env.OUT_DIR || resolve(ROOT, 'manual/assets/img');
const ONLY = (process.env.ONLY || '').split(',').map(s => s.trim()).filter(Boolean);
const HEADLESS = process.env.HEADLESS !== 'false';

if (!PASSWORD && !READER_TOKEN && !ADMIN_JWT) {
  console.error('ERROR: set LICITOMETRO_PASSWORD, LICITOMETRO_READER_TOKEN or LICITOMETRO_ADMIN_JWT');
  process.exit(1);
}

// Viewports
const DESKTOP = { width: 1440, height: 900, deviceScaleFactor: 2 };
const MOBILE  = { width: 390,  height: 844, deviceScaleFactor: 3 };

/**
 * Each shot:
 *   file        — output filename (relative to OUT_DIR/<device>/)
 *   device      — 'desktop' | 'mobile'
 *   path        — URL path to visit (relative to BASE_URL)
 *   wait        — CSS selector to wait for before capture (optional)
 *   setup       — async (page) => {} — clicks, scrolls, etc. before shot
 *   clip        — { x, y, width, height } to crop (optional, full page otherwise)
 *   fullPage    — boolean (default false)
 */
// Helper: click a tab by visible text, tolerant of casing/icon prefixes
async function clickTab(page, text) {
  const selectors = [
    `button:has-text("${text}")`,
    `[role="tab"]:has-text("${text}")`,
    `a:has-text("${text}")`,
    `[class*="tab"]:has-text("${text}")`,
  ];
  for (const sel of selectors) {
    const loc = page.locator(sel).first();
    if (await loc.count()) {
      await loc.click({ timeout: 2500 }).catch(() => {});
      return true;
    }
  }
  return false;
}

// Helper: click any button matching text
async function clickButton(page, text) {
  const loc = page.locator(`button:has-text("${text}")`).first();
  if (await loc.count()) {
    await loc.click({ timeout: 2500 }).catch(() => {});
    return true;
  }
  return false;
}

const SHOTS = [
  // ============================================================
  // LISTADO — core views of the main /licitaciones page
  // ============================================================
  {
    file: 'listado-cards.png',
    device: 'desktop',
    path: '/licitaciones',
    wait: '[data-testid="licitacion-card"], .licitacion-card, article',
  },
  {
    file: 'listado-tabla.png',
    device: 'desktop',
    path: '/licitaciones',
    setup: async (page) => {
      const btn = page.locator('button[aria-label*="tabla" i], button:has-text("Tabla")').first();
      if (await btn.count()) await btn.click();
      await page.waitForTimeout(1000);
    },
  },
  {
    file: 'filtros-sidebar.png',
    device: 'desktop',
    path: '/licitaciones',
    wait: 'aside, [class*="FilterSidebar" i]',
  },
  {
    file: 'busqueda.png',
    device: 'desktop',
    path: '/licitaciones',
    setup: async (page) => {
      const s = page.locator('input[type="search"], input[placeholder*="uscar" i]').first();
      if (await s.count()) { await s.fill('obra pública'); await page.waitForTimeout(1200); }
    },
  },
  {
    file: 'vigentes-hoy.png',
    device: 'desktop',
    path: '/licitaciones',
    setup: async (page) => {
      await clickButton(page, 'Nuevas de hoy').catch(() => {});
      await page.waitForTimeout(1200);
    },
  },

  // ============================================================
  // FAVORITOS / PERFIL
  // ============================================================
  { file: 'favoritos.png',         device: 'desktop', path: '/favoritos', wait: 'main, article, h1' },
  { file: 'perfil.png',            device: 'desktop', path: '/perfil',    wait: 'main, h1' },

  // ============================================================
  // STATS — multiple views
  // ============================================================
  { file: 'stats.png',             device: 'desktop', path: '/stats',     wait: 'main, h1, canvas, svg', fullPage: true },
  {
    file: 'stats-by-source.png',
    device: 'desktop',
    path: '/stats',
    setup: async (page) => { await clickTab(page, 'Por fuente'); await page.waitForTimeout(1200); },
  },
  {
    file: 'stats-by-state.png',
    device: 'desktop',
    path: '/stats',
    setup: async (page) => { await clickTab(page, 'Estado'); await page.waitForTimeout(1200); },
  },

  // ============================================================
  // COTIZAR — wizard steps
  // ============================================================
  { file: 'cotizar-home.png',      device: 'desktop', path: '/cotizar', wait: 'main, h1' },
  {
    file: 'cotizar-paso-1-items.png',
    device: 'desktop',
    path: '/cotizar',
    setup: async (page) => {
      // Open the first active licitación if visible
      const first = page.locator('a[href*="/cotizar/"], .licitacion-card a, [class*="card"] a').first();
      if (await first.count()) await first.click();
      await page.waitForTimeout(1500);
    },
    fullPage: true,
  },

  // ============================================================
  // EMPRESA
  // ============================================================
  { file: 'empresa.png',           device: 'desktop', path: '/empresa', wait: 'main, h1', fullPage: true },

  // ============================================================
  // NODOS — list + form
  // ============================================================
  { file: 'nodos.png',             device: 'desktop', path: '/nodos', wait: 'main, h1', fullPage: true },
  {
    file: 'nodos-form.png',
    device: 'desktop',
    path: '/nodos',
    setup: async (page) => {
      await clickButton(page, 'Nuevo').catch(() => {});
      await clickButton(page, '+ Nuevo nodo').catch(() => {});
      await clickButton(page, 'Crear').catch(() => {});
      await page.waitForTimeout(1200);
    },
  },

  // ============================================================
  // ADMIN — overview + individual tabs
  // ============================================================
  { file: 'admin.png',             device: 'desktop', path: '/admin', wait: 'main, h1' },
  {
    file: 'admin-monitor.png',
    device: 'desktop',
    path: '/admin',
    setup: async (page) => { await clickTab(page, 'Monitor'); await page.waitForTimeout(1500); },
  },
  {
    file: 'admin-fuentes.png',
    device: 'desktop',
    path: '/admin',
    setup: async (page) => { await clickTab(page, 'Fuentes'); await page.waitForTimeout(1500); },
  },
  {
    file: 'admin-logs.png',
    device: 'desktop',
    path: '/admin',
    setup: async (page) => { await clickTab(page, 'Logs'); await page.waitForTimeout(1500); },
  },
  {
    file: 'admin-calidad.png',
    device: 'desktop',
    path: '/admin',
    setup: async (page) => { await clickTab(page, 'Calidad'); await page.waitForTimeout(1500); },
  },

  // ============================================================
  // LAB
  // ============================================================
  { file: 'lab.png',               device: 'desktop', path: '/lab', wait: 'main, h1', fullPage: true },

  // ============================================================
  // DETALLE — header + each tab
  // ============================================================
  {
    file: 'detalle-header.png',
    device: 'desktop',
    path: '__DETALLE__',
    wait: 'main, h1',
  },
  {
    file: 'detalle-info.png',
    device: 'desktop',
    path: '__DETALLE__',
    setup: async (page) => { await clickTab(page, 'Info'); await page.waitForTimeout(1000); },
    fullPage: true,
  },
  {
    file: 'detalle-items.png',
    device: 'desktop',
    path: '__DETALLE__',
    setup: async (page) => { await clickTab(page, 'Items'); await page.waitForTimeout(1000); },
  },
  {
    file: 'detalle-documentos.png',
    device: 'desktop',
    path: '__DETALLE__',
    setup: async (page) => { await clickTab(page, 'Documentos'); await page.waitForTimeout(1000); },
  },
  {
    file: 'detalle-cronograma.png',
    device: 'desktop',
    path: '__DETALLE__',
    setup: async (page) => { await clickTab(page, 'Cronograma'); await page.waitForTimeout(1000); },
  },
  {
    file: 'workflow-stepper.png',
    device: 'desktop',
    path: '__DETALLE__',
    setup: async (page) => {
      await clickTab(page, 'Workflow');
      await page.waitForTimeout(1500);
      const stepper = page.locator('[class*="stepper" i], [class*="Workflow" i]').first();
      if (await stepper.count()) await stepper.scrollIntoViewIfNeeded().catch(() => {});
    },
  },
  {
    file: 'detalle-similares.png',
    device: 'desktop',
    path: '__DETALLE__',
    setup: async (page) => { await clickTab(page, 'Similares'); await page.waitForTimeout(1500); },
  },

  // ============================================================
  // HUNTER — panel opened
  // ============================================================
  {
    file: 'hunter-panel.png',
    device: 'desktop',
    path: '__DETALLE__',
    setup: async (page) => {
      await clickButton(page, 'Hunter').catch(() => {});
      await clickButton(page, '🎯 Hunter').catch(() => {});
      await clickButton(page, '🎯').catch(() => {});
      await page.waitForTimeout(2500);
    },
  },

  // ============================================================
  // MOBILE
  // ============================================================
  { file: 'listado-mobile.png',    device: 'mobile', path: '/licitaciones', wait: 'main, article' },
  {
    file: 'filtros-drawer.png',
    device: 'mobile',
    path: '/licitaciones',
    setup: async (page) => {
      const b = page.locator('button:has-text("Filtros")').first();
      if (await b.count()) await b.click();
      await page.waitForTimeout(800);
    },
  },
  {
    file: 'menu-mobile.png',
    device: 'mobile',
    path: '/licitaciones',
    setup: async (page) => {
      const b = page.locator('button[aria-label*="enú" i], button.mobile-toggle, button:has-text("☰")').first();
      if (await b.count()) await b.click();
      await page.waitForTimeout(800);
    },
  },
  { file: 'detalle-mobile.png',    device: 'mobile', path: '__DETALLE__',  wait: 'main, h1' },
  { file: 'favoritos-mobile.png',  device: 'mobile', path: '/favoritos',   wait: 'main, h1' },
  { file: 'cotizar-mobile.png',    device: 'mobile', path: '/cotizar',     wait: 'main, h1' },
  { file: 'nodos-mobile.png',      device: 'mobile', path: '/nodos',       wait: 'main, h1' },
  { file: 'stats-mobile.png',      device: 'mobile', path: '/stats',       wait: 'main, h1' },
  { file: 'perfil-mobile.png',     device: 'mobile', path: '/perfil',      wait: 'main, h1' },
];

async function ensureDir(p) {
  await mkdir(p, { recursive: true });
}

async function login(context, page) {
  // Highest priority: inject an admin JWT directly as the access_token cookie.
  // This bypasses /api/auth/token-login which always downgrades to reader role.
  if (ADMIN_JWT) {
    const host = new URL(BASE_URL).hostname;
    await context.addCookies([{
      name: 'access_token',
      value: ADMIN_JWT,
      domain: host,
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
    }]);
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    return;
  }

  // Preferred path: exchange a reader token for a session cookie via API.
  if (READER_TOKEN) {
    const res = await page.request.post(`${BASE_URL}/api/auth/token-login`, {
      data: { token: READER_TOKEN },
      headers: { 'content-type': 'application/json' },
    });
    if (!res.ok()) throw new Error(`token-login failed: ${res.status()} ${await res.text()}`);
    // Cookies set via API are stored on the request context; propagate to browser context
    const storage = await context.storageState();
    if (!storage.cookies.some(c => c.name === 'access_token')) {
      // Some stacks attach API cookies only to the APIRequestContext; copy them explicitly
      const apiCookies = await page.context().cookies(BASE_URL);
      if (apiCookies.length) await context.addCookies(apiCookies);
    }
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    return;
  }

  // Fallback: interactive password login
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  const pwd = page.locator('input[type="password"]').first();
  await pwd.waitFor({ state: 'visible', timeout: 15000 });
  await pwd.fill(PASSWORD);
  const submit = page.locator('button[type="submit"], button:has-text("Ingresar"), button:has-text("Entrar"), button:has-text("Login")').first();
  await submit.click();
  await pwd.waitFor({ state: 'hidden', timeout: 15000 });
  await page.waitForLoadState('networkidle');
}

async function getSampleLicitacionId(page) {
  const res = await page.request.get(`${BASE_URL}/api/licitaciones/?limit=1&sort_field=fecha_scraping&sort_order=desc`);
  if (!res.ok()) throw new Error(`API returned ${res.status()}`);
  const data = await res.json();
  const first = (data.items || data.licitaciones || data)[0];
  if (!first) throw new Error('No licitaciones found via API');
  return first._id || first.id;
}

async function capture(context, shot, licitacionId) {
  if (ONLY.length && !ONLY.includes(shot.file)) return;

  const page = await context.newPage();
  const urlPath = shot.path === '__DETALLE__' ? `/licitacion/${licitacionId}` : shot.path;
  const url = `${BASE_URL}${urlPath}`;

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

    if (shot.wait) {
      try { await page.waitForSelector(shot.wait, { timeout: 10000 }); }
      catch { /* best-effort */ }
    }

    // Let animations/fonts settle
    await page.waitForTimeout(1200);

    if (shot.setup) {
      try { await shot.setup(page); }
      catch (e) { console.warn(`  ⚠ setup failed for ${shot.file}: ${e.message}`); }
    }

    const dir = resolve(OUT_DIR, shot.device);
    await ensureDir(dir);
    const out = resolve(dir, shot.file);

    await page.screenshot({
      path: out,
      fullPage: shot.fullPage || false,
      clip: shot.clip,
    });
    console.log(`  ✓ ${shot.device}/${shot.file}`);
  } catch (e) {
    console.error(`  ✗ ${shot.device}/${shot.file}: ${e.message}`);
  } finally {
    await page.close();
  }
}

async function main() {
  console.log(`→ Base URL: ${BASE_URL}`);
  console.log(`→ Output:   ${OUT_DIR}`);
  if (ONLY.length) console.log(`→ Only:     ${ONLY.join(', ')}`);

  const browser = await chromium.launch({ headless: HEADLESS });

  // Desktop context — login happens once here
  const desktopCtx = await browser.newContext({ viewport: DESKTOP });
  const loginPage = await desktopCtx.newPage();
  console.log('→ Logging in (desktop)…');
  await login(desktopCtx, loginPage);
  const licitacionId = await getSampleLicitacionId(loginPage);
  console.log(`→ Sample licitación id: ${licitacionId}`);
  await loginPage.close();

  // Mobile context — reuse cookies from desktop
  const cookies = await desktopCtx.cookies();
  const mobileCtx = await browser.newContext({
    viewport: MOBILE,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    deviceScaleFactor: MOBILE.deviceScaleFactor,
    isMobile: true,
    hasTouch: true,
  });
  await mobileCtx.addCookies(cookies);

  console.log('\n→ Capturing desktop shots…');
  for (const shot of SHOTS.filter(s => s.device === 'desktop')) {
    await capture(desktopCtx, shot, licitacionId);
  }

  console.log('\n→ Capturing mobile shots…');
  for (const shot of SHOTS.filter(s => s.device === 'mobile')) {
    await capture(mobileCtx, shot, licitacionId);
  }

  await browser.close();
  console.log('\n✅ Done');
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
