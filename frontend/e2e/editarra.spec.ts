import { expect, Page, test } from '@playwright/test';

type OverflowReport = {
  viewportWidth: number;
  documentWidth: number;
  bodyWidth: number;
  rootWidth: number;
  overflowing: Array<{
    tag: string;
    label: string;
    left: number;
    right: number;
    width: number;
  }>;
};

let discoveryRequestBodies: Array<{ agendaId?: string; query?: string; urls?: string[] }> = [];

const editarraPackageFileKeys = [
  'article.md',
  'metadata.json',
  'image_prompt.json',
  'image_prompt.md',
  'image_manifest.json',
  'radar_run_report.json',
  'editorial_proposal.json',
  'public_export_bundle.json',
  'publication_targets.json',
  'profile_runtime.json',
  'note_run.json',
  'ai_request.json',
  'operational_contract.json',
  'automation_recipe.json',
  'ai_brief.json',
  'publication_payload.json',
  'quality_audit.json',
  'seo_experiments.json',
  'analytics_report.json',
  'evidence_log.json',
  'revision_history.json',
  'audit_log.json',
  'package_manifest.json',
] as const;

const approvedPublicationBody = [
  'La evidencia diaria en un depósito fiscal empieza con una decisión concreta: definir qué dato entra al sistema, quién lo registra y cómo queda disponible para una revisión posterior. En una pyme argentina, esa decisión ordena cámaras, stock, permisos y respaldo sin depender de una carpeta compartida sin dueño.',
  '',
  '## Cómo funciona por dentro',
  'PostgreSQL conserva registros estructurados con fechas, usuarios y estados. MinIO guarda archivos pesados como fotos, videos o planillas firmadas. Metabase permite consultar el tablero sin entregar permisos de edición. Primero se registra el movimiento, segundo se adjunta evidencia, tercero se valida el rol, cuarto se replica el backup y quinto se revisa la auditoría.',
  '',
  '## Qué se instala o configura primero',
  'Primero se configura una tabla de movimientos con identificadores estables. Segundo se crean roles de lectura y edición. Tercero se conecta un bucket de objetos para evidencia pesada. Cuarto se define una rutina de backup con restauración probada. Quinto se publica un tablero de control con métricas de cumplimiento y alertas operativas.',
  '',
  '## Dónde se rompe y cómo probarlo',
  'El flujo se rompe cuando una persona puede borrar evidencia sin dejar traza, cuando el archivo vive fuera del expediente o cuando el backup nunca se restaura. La prueba mínima incluye permiso de lectura, permiso de edición, baja de usuario, restauración de un objeto y consulta de auditoría. El costo inicial debe cerrar con un entregable verificable: tabla, bucket, roles, tablero y procedimiento.',
  '',
  '## Para seguir leyendo',
  'Revisar documentación oficial de ARCA, PostgreSQL, MinIO y Metabase antes de adaptar el esquema. La nota queda lista para publicación manual cuando fuentes, imagen, payload y trazabilidad están completos.',
].join('\n');

const approvedTopicFixture = {
  id: 'topic-umsa-reactiva',
  title: 'ARCA y depósitos fiscales: stock, CCTV y evidencia diaria',
  status: 'aprobado',
  priority: 94,
  depth: 'Alta',
  tokens: 10500,
  author: 'Editor UMSA Diaria',
  source: 'ARCA normativa oficial + PostgreSQL docs + MinIO docs + Metabase docs',
  narrative: 'Explicar cómo una obligación de evidencia diaria se traduce en datos, cámaras, permisos y respaldo verificable.',
  seo: 'Keyword principal: depósitos fiscales ARCA. Guía técnica para preparar stock, CCTV y evidencia diaria.',
  publishAt: '07:00 -03:00',
};

const approvedDraftFixture = {
  id: 'draft-topic-umsa-reactiva',
  topicId: 'topic-umsa-reactiva',
  variant: 'humanizado',
  status: 'aprobado',
  title: 'Borrador aprobado para publicación manual',
  seoTitle: 'Depósitos fiscales: evidencia diaria y datos auditables',
  body: approvedPublicationBody,
  notes: 'Borrador listo para preview, payload y exportación manual.',
  updatedAt: '10:00',
};

const validatedEvidenceFixture = [
  ['ARCA normativa oficial', 'https://www.argentina.gob.ar/arca'],
  ['PostgreSQL docs', 'https://www.postgresql.org/docs/'],
  ['MinIO docs', 'https://min.io/docs/minio/linux/index.html'],
  ['Metabase docs', 'https://www.metabase.com/docs/latest/'],
].map(([sourceName, sourceUrl], index) => ({
  id: `evidence-topic-umsa-reactiva-${index}`,
  topicId: 'topic-umsa-reactiva',
  sourceName,
  sourceUrl,
  claim: `Fuente primaria ${index + 1} validada para sostener datos auditables, permisos, evidencia y trazabilidad operativa.`,
  status: 'validado',
  confidence: 91,
  notes: 'Validada por fixture E2E del flujo operativo.',
}));

const approvedImagePromptFixture = {
  id: 'img-001',
  title: 'Evidencia técnica UMSA',
  ratio: '16:9',
  status: 'Apto reutilización',
  prompt: 'Mesa técnica realista en una pyme argentina con monitor mostrando un tablero abstracto sin texto legible, documentos de auditoría, servidor compacto y carpetas ordenadas. Fotografía documental sobria, luz natural lateral, paleta rojo UMSA, negro, azul y gris claro, profundidad de campo moderada, sin logos, sin marcas comerciales, sin rostros reconocibles, sin texto incrustado, sin estética stock, una sola imagen principal para acompañar una nota sobre evidencia diaria, datos auditables, permisos, stock y CCTV.',
};

async function seedApprovedPublicationState(page: Page, includeImage = true) {
  await page.addInitScript(({ topic, draft, evidence, image }) => {
    sessionStorage.setItem('editarra:e2e-storage-cleared', 'true');
    if (localStorage.getItem('editarra:studio-state:v2')) {
      return;
    }

    localStorage.setItem('editarra:studio-state:v2', JSON.stringify({
      product: 'editarra',
      schema: 'studio-state',
      version: 2,
      savedAt: '10:00',
      state: {
        topics: [topic],
        drafts: [draft],
        evidence,
        auditEvents: [{
          id: 'audit-e2e-ready',
          event: 'Auditoria aprobada',
          detail: 'Fuentes, borrador y payload revisados para flujo operativo E2E.',
          time: '10:00',
        }],
        ...(image ? {
          imagePrompts: [image],
          reusableImages: [image.id],
        } : {
          imagePrompts: [],
          reusableImages: [],
        }),
      },
    }));
  }, {
    topic: approvedTopicFixture,
    draft: approvedDraftFixture,
    evidence: validatedEvidenceFixture,
    image: includeImage ? approvedImagePromptFixture : null,
  });
}

async function seedAuditReadyPublicationState(page: Page) {
  await page.addInitScript(({ topic, draft, evidence, image }) => {
    sessionStorage.setItem('editarra:e2e-storage-cleared', 'true');
    if (localStorage.getItem('editarra:studio-state:v2')) {
      return;
    }

    localStorage.setItem('editarra:studio-state:v2', JSON.stringify({
      product: 'editarra',
      schema: 'studio-state',
      version: 2,
      savedAt: '10:00',
      state: {
        topics: [topic],
        drafts: [draft],
        evidence,
        auditEvents: [{
          id: 'audit-e2e-ready-for-closeout',
          event: 'Borrador listo para auditoria',
          detail: 'Fixture E2E con fuentes, imagen y estructura lista para aprobar.',
          time: '10:00',
        }],
        imagePrompts: [image],
        reusableImages: [image.id],
      },
    }));
  }, {
    topic: {
      ...approvedTopicFixture,
      status: 'redaccion',
      title: 'ARCA CCTV fiscal E2E',
    },
    draft: {
      ...approvedDraftFixture,
      status: 'listo',
      title: 'Borrador listo para auditoria E2E',
      seoTitle: 'ARCA CCTV fiscal E2E',
    },
    evidence: validatedEvidenceFixture,
    image: approvedImagePromptFixture,
  });
}

async function expectNoVisibleHorizontalOverflow(page: Page, scope = '.editarra-app') {
  let overflow: OverflowReport | undefined;

  await expect.poll(async () => {
    overflow = await page.evaluate((selector) => {
      const root = document.querySelector(selector);
      const viewportWidth = document.documentElement.clientWidth;
      const visibleElements = Array.from(root?.querySelectorAll('*') || []).filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          style.display !== 'none'
          && style.visibility !== 'hidden'
          && rect.width > 0
          && rect.height > 0
          && rect.top >= 0
          && rect.bottom <= window.innerHeight
        );
      });
      const overflowing = visibleElements
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            tag: element.tagName,
            label: element.getAttribute('aria-label') || element.textContent?.trim().slice(0, 80) || '',
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            width: Math.round(rect.width),
          };
        })
        .filter((item) => item.left < -1 || item.right > viewportWidth + 1);

      return {
        viewportWidth,
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        rootWidth: root?.scrollWidth || 0,
        overflowing,
      };
    }, scope);

    return {
      bodyFits: overflow.bodyWidth <= overflow.viewportWidth + 1,
      documentFits: overflow.documentWidth <= overflow.viewportWidth + 1,
      rootFits: overflow.rootWidth <= overflow.viewportWidth + 1,
    };
  }, { intervals: [250, 500, 1000], timeout: 10000 }).toEqual({
    bodyFits: true,
    documentFits: true,
    rootFits: true,
  });
}

async function clickTab(page: Page, label: string) {
  const tab = page.getByRole('tab', { name: new RegExp(label, 'i') });
  await expect(tab).toBeVisible();
  await tab.click();
}

async function visiblePanelTop(page: Page) {
  return page.evaluate(() => {
    const panel = document.querySelector('[role="tabpanel"]');
    return panel ? Math.round(panel.getBoundingClientRect().top) : null;
  });
}

async function expectActivePanelUsableGeometry(page: Page, minWidthRatio = 0.56) {
  const geometry = await page.getByRole('tabpanel').evaluate((panel) => {
    const rect = panel.getBoundingClientRect();
    return {
      viewportWidth: document.documentElement.clientWidth,
      top: Math.round(rect.top),
      left: Math.round(rect.left),
      width: Math.round(rect.width),
    };
  });

  expect(geometry.top).toBeLessThan(240);
  expect(geometry.left).toBeGreaterThanOrEqual(0);
  expect(geometry.width).toBeGreaterThanOrEqual(Math.floor(geometry.viewportWidth * minWidthRatio));
}

async function expectNoCollapsedReadableText(page: Page, scope = '[role="tabpanel"]') {
  const collapsed = await page.evaluate((selector) => {
    const root = document.querySelector(selector);
    const excludedSelector = [
      'button',
      'input',
      'select',
      'textarea',
      'pre',
      'code',
      '[role="tab"]',
      '[role="button"]',
      '[aria-hidden="true"]',
    ].join(',');

    return Array.from(root?.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6,p,li') || [])
      .filter((element) => {
        if (element.closest(excludedSelector)) {
          return false;
        }

        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        const text = element.textContent?.replace(/\s+/g, ' ').trim() || '';
        const hasReadablePhrase = text.length >= 24 && /\s/.test(text);

        return (
          hasReadablePhrase
          && style.display !== 'none'
          && style.visibility !== 'hidden'
          && Number.parseFloat(style.fontSize) >= 12
          && rect.width > 0
          && rect.height > 0
          && rect.bottom >= 0
          && rect.top <= window.innerHeight
          && rect.width < 170
        );
      })
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          text: element.textContent?.replace(/\s+/g, ' ').trim().slice(0, 120) || '',
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      });
  }, scope);

  expect(collapsed).toEqual([]);
}

async function expectNoCollapsedActionControls(page: Page, scope = '[role="tabpanel"]') {
  const collapsed = await page.evaluate((selector) => {
    const root = document.querySelector(selector);

    return Array.from(root?.querySelectorAll<HTMLElement>('button,a,[role="button"]') || [])
      .filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        const text = element.textContent?.replace(/\s+/g, ' ').trim() || element.getAttribute('aria-label') || '';
        const meaningfulControl = text.length >= 8 && /\s/.test(text);

        return (
          meaningfulControl
          && style.display !== 'none'
          && style.visibility !== 'hidden'
          && rect.width > 0
          && rect.height > 0
          && rect.bottom >= 0
          && rect.top <= window.innerHeight
          && rect.width < 104
        );
      })
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          text: element.textContent?.replace(/\s+/g, ' ').trim().slice(0, 120) || element.getAttribute('aria-label') || '',
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      });
  }, scope);

  expect(collapsed).toEqual([]);
}

async function expectPanelControlInFirstViewport(page: Page, controlLabel: string) {
  const report = await page.getByRole('tabpanel').evaluate((panel, needle) => {
    const viewportHeight = document.documentElement.clientHeight;
    const normalizedNeedle = needle.toLowerCase();
    const controls = Array.from(panel.querySelectorAll<HTMLElement>('button,a,input,select,textarea,[role="button"]'))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        const text = [
          element.textContent || '',
          element.getAttribute('aria-label') || '',
          element.getAttribute('placeholder') || '',
          element.getAttribute('title') || '',
        ].join(' ').replace(/\s+/g, ' ').trim();

        return {
          text,
          top: Math.round(rect.top),
          bottom: Math.round(rect.bottom),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          visible: (
            style.display !== 'none'
            && style.visibility !== 'hidden'
            && rect.width >= 72
            && rect.height >= 32
            && rect.bottom >= 0
            && rect.top <= viewportHeight
          ),
        };
      })
      .filter((item) => item.text.toLowerCase().includes(normalizedNeedle));

    return {
      controlLabel: needle,
      viewportHeight,
      matches: controls,
      usableMatches: controls.filter((item) => item.visible && item.top >= 0 && item.bottom <= viewportHeight + 1),
    };
  }, controlLabel);

  expect(report.matches, `${controlLabel} should exist in the active panel`).not.toEqual([]);
  expect(report.usableMatches, `${controlLabel} should be usable in the first viewport`).not.toEqual([]);
}

async function expectWorkspaceUsableGeometry(page: Page) {
  const report = await page.getByLabel('Perfil operativo de nota').first().evaluate((workspace) => {
    const workspaceRect = workspace.getBoundingClientRect();
    const supportPanel = workspace.querySelector<HTMLElement>('[aria-label="Atajos de soporte del workspace"]');
    const supportRect = supportPanel?.getBoundingClientRect();
    const buttons = Array.from(supportPanel?.querySelectorAll<HTMLElement>('button') || []).map((button) => {
      const rect = button.getBoundingClientRect();
      return {
        text: button.textContent?.replace(/\s+/g, ' ').trim() || '',
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        top: Math.round(rect.top),
        left: Math.round(rect.left),
      };
    });

    return {
      viewportWidth: document.documentElement.clientWidth,
      workspace: {
        left: Math.round(workspaceRect.left),
        top: Math.round(workspaceRect.top),
        width: Math.round(workspaceRect.width),
      },
      supportPanel: supportRect ? {
        left: Math.round(supportRect.left),
        top: Math.round(supportRect.top),
        width: Math.round(supportRect.width),
      } : null,
      buttons,
    };
  });

  expect(report.workspace.top).toBeLessThan(340);
  expect(report.workspace.width).toBeGreaterThanOrEqual(Math.floor(report.viewportWidth * 0.52));
  expect(report.supportPanel?.width || 0).toBeGreaterThanOrEqual(320);
  expect(report.buttons).toHaveLength(7);
  for (const button of report.buttons) {
    expect(button.width, `${button.text} should remain tappable and readable`).toBeGreaterThanOrEqual(104);
    expect(button.height, `${button.text} should remain tappable`).toBeGreaterThanOrEqual(36);
  }
}

async function expectModuleTabsWithinViewport(page: Page) {
  const report = await page.getByRole('tablist', { name: 'Modulos' }).evaluate((tablist) => {
    const viewportWidth = document.documentElement.clientWidth;
    return Array.from(tablist.querySelectorAll('[role="tab"]')).map((tab) => {
      const rect = tab.getBoundingClientRect();
      return {
        label: tab.textContent?.trim() || '',
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        width: Math.round(rect.width),
        visible: rect.width > 0 && rect.height > 0,
        inViewport: rect.left >= -1 && rect.right <= viewportWidth + 1,
      };
    });
  });

  expect(report).toHaveLength(8);
  for (const tab of report) {
    expect(tab.visible, `${tab.label} should be visible`).toBe(true);
    expect(tab.width, `${tab.label} should have a usable width`).toBeGreaterThanOrEqual(72);
    expect(tab.inViewport, `${tab.label} should not require horizontal scrolling`).toBe(true);
  }
}

async function expectDialogIsModalOverlay(page: Page, accessibleName: string | RegExp) {
  const dialog = page.getByRole('dialog', { name: accessibleName });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('aria-modal', 'true');

  const report = await dialog.evaluate((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      position: style.position,
      top: Math.round(rect.top),
      left: Math.round(rect.left),
      right: Math.round(rect.right),
      bottom: Math.round(rect.bottom),
      bodyOverflow: document.body.style.overflow,
      viewportWidth: document.documentElement.clientWidth,
      viewportHeight: document.documentElement.clientHeight,
    };
  });

  expect(report.position).toBe('fixed');
  expect(report.bodyOverflow).toBe('hidden');
  expect(report.top).toBeLessThanOrEqual(1);
  expect(report.left).toBeLessThanOrEqual(1);
  expect(report.right).toBeGreaterThanOrEqual(report.viewportWidth - 1);
  expect(report.bottom).toBeGreaterThanOrEqual(report.viewportHeight - 1);
}

async function expectDialogUsesInternalScroll(page: Page, accessibleName: string | RegExp) {
  const dialog = page.getByRole('dialog', { name: accessibleName });
  await expectDialogIsModalOverlay(page, accessibleName);

  const report = await dialog.evaluate((element) => {
    const dialogRect = element.getBoundingClientRect();
    const scrollContainers = Array.from(element.querySelectorAll<HTMLElement>('*')).filter((child) => {
      const style = getComputedStyle(child);
      return (
        (style.overflowY === 'auto' || style.overflowY === 'scroll')
        && child.scrollHeight > child.clientHeight
      );
    });

    return {
      dialogBottom: Math.round(dialogRect.bottom),
      viewportHeight: document.documentElement.clientHeight,
      bodyOverflow: document.body.style.overflow,
      scrollContainerCount: scrollContainers.length,
      maxScrollContainerHeight: Math.max(0, ...scrollContainers.map((child) => child.clientHeight)),
    };
  });

  expect(report.bodyOverflow).toBe('hidden');
  expect(report.dialogBottom).toBeGreaterThanOrEqual(report.viewportHeight - 1);
  expect(report.scrollContainerCount).toBeGreaterThanOrEqual(1);
  expect(report.maxScrollContainerHeight).toBeGreaterThan(120);
  await expectNoVisibleHorizontalOverflow(page);
}

async function expectBodyScrollUnlocked(page: Page) {
  await expect.poll(async () => page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
}

async function expectNoForbiddenVisibleText(page: Page, scope = '.editarra-app') {
  let matches: string[] | undefined;

  await expect.poll(async () => {
    matches = await page.evaluate((selector) => {
      const root = document.querySelector(selector);
      const patterns = [
        /curiosity\s+gap/i,
        /promesa\s+expl[ií]cita/i,
        /define\s+hip[oó]tesis/i,
        /canal\s+y\s+criterio/i,
        /criterio\s+de\s+[eé]xito/i,
        /descripci[oó]n\s+seo\s+honesta/i,
        /lorem\s+ipsum/i,
        /sin\s+implementar/i,
        /coming\s+soon/i,
        /mock\s+data/i,
      ];
      const visibleElements = Array.from(root?.querySelectorAll('*') || []).filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          style.display !== 'none'
          && style.visibility !== 'hidden'
          && rect.width > 0
          && rect.height > 0
          && rect.bottom >= 0
          && rect.top <= window.innerHeight
        );
      });

      return Array.from(new Set(visibleElements.flatMap((element) => {
        const text = element.textContent?.replace(/\s+/g, ' ').trim() || '';
        return patterns
          .filter((pattern) => pattern.test(text))
          .map((pattern) => `${pattern} => ${text.slice(0, 180)}`);
      })));
    }, scope);

    return matches;
  }, { intervals: [250, 500, 1000], timeout: 10000 }).toEqual([]);
}

async function expectNoForbiddenPanelText(page: Page) {
  const matches = await page.getByRole('tabpanel').evaluate((panel) => {
    const patterns = [
      /curiosity\s+gap/i,
      /promesa\s+expl[ií]cita/i,
      /define\s+hip[oó]tesis/i,
      /canal\s+y\s+criterio/i,
      /criterio\s+de\s+[eé]xito/i,
      /descripci[oó]n\s+seo\s+honesta/i,
      /lorem\s+ipsum/i,
      /sin\s+implementar/i,
      /coming\s+soon/i,
      /mock\s+data/i,
    ];
    const text = panel.textContent?.replace(/\s+/g, ' ').trim() || '';
    return patterns
      .filter((pattern) => pattern.test(text))
      .map((pattern) => `${pattern} => ${text.slice(0, 220)}`);
  });

  expect(matches).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  discoveryRequestBodies = [];
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('editarra:e2e-storage-cleared')) {
      localStorage.removeItem('editarra:studio-state:v1');
      localStorage.removeItem('editarra:studio-state:v2');
      localStorage.removeItem('editarra.operatorKey');
      sessionStorage.setItem('editarra:e2e-storage-cleared', 'true');
    }
  });
  await page.route('**/api/editarra/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    const json = (body: unknown) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });

    if (url.includes('/api/editarra/agendas') && method === 'GET') {
      await json({ agendas: [] });
      return;
    }

    if (url.includes('/api/editarra/agendas/') && method === 'PUT') {
      await json({ agenda: JSON.parse(route.request().postData() || '{}') });
      return;
    }

    if (url.includes('/api/editarra/candidates') && method === 'GET') {
      await json({ candidates: [] });
      return;
    }

    if (url.includes('/api/editarra/runs') && method === 'GET') {
      await json({ runs: [] });
      return;
    }

    if (url.includes('/api/editarra/discovery/run') && method === 'POST') {
      const requestBody = JSON.parse(route.request().postData() || '{}');
      discoveryRequestBodies.push(requestBody);
      if (requestBody.query === '22-seeds-e2e') {
        const urls = Array.isArray(requestBody.urls) ? requestBody.urls : [];
        const expandedUrls = urls.slice(0, 4).map((seedUrl: string, index: number) => `${seedUrl.replace(/\/+$/g, '')}/expanded-${index}`);
        await json({
          run: {
            id: 'run-e2e-22',
            agendaId: requestBody.agendaId,
            query: requestBody.query,
            urls: [...urls, ...expandedUrls],
            status: 'completo',
            sourceCount: urls.length + expandedUrls.length,
            candidateCount: 4,
            provider: 'native-web',
            llmModel: null,
            seedResults: urls.map((seedUrl: string, index: number) => ({
              url: seedUrl,
              resolvedUrl: seedUrl,
              host: new URL(seedUrl).host.replace(/^www\./, ''),
              kind: 'semilla',
              ok: index !== 5,
              status: index === 5 ? null : 200,
              contentType: index === 5 ? '' : 'text/html',
              warnings: index === 5 ? ['Timeout al consultar fuente.'] : [],
              error: index === 5 ? 'timeout' : '',
              candidateCount: index < 3 ? 1 : 0,
              maxCandidateScore: index < 3 ? 90 - index : null,
            })),
            expandedResults: expandedUrls.map((expandedUrl: string, index: number) => ({
              url: expandedUrl,
              resolvedUrl: expandedUrl,
              host: new URL(expandedUrl).host.replace(/^www\./, ''),
              kind: 'expandida',
              ok: true,
              status: 200,
              contentType: 'text/html',
              warnings: [],
              error: '',
              candidateCount: index === 3 ? 1 : 0,
              maxCandidateScore: index === 3 ? 72 : null,
            })),
            failedSources: [{
              url: urls[5],
              resolvedUrl: urls[5],
              host: new URL(urls[5]).host.replace(/^www\./, ''),
              kind: 'semilla',
              ok: false,
              status: null,
              contentType: '',
              warnings: ['Timeout al consultar fuente.'],
              error: 'timeout',
              candidateCount: 0,
              maxCandidateScore: null,
            }],
            candidateDistribution: {
              byHost: {
                'seed-0.example.com': 1,
                'seed-1.example.com': 1,
                'seed-2.example.com': 1,
                'seed-3.example.com': 1,
              },
              bySourceUrl: {
                [urls[0]]: 1,
                [urls[1]]: 1,
                [urls[2]]: 1,
                [expandedUrls[3]]: 1,
              },
              uniqueHosts: 4,
              maxCandidatesPerHost: 2,
            },
            warnings: [
              `Radar consultó ${urls.length} URLs semilla configuradas.`,
              `Radar expandió ${expandedUrls.length} URLs hijas desde fuentes semilla.`,
              'Timeout al consultar fuente.',
            ],
            createdAt: '2026-06-06T00:00:00Z',
            completedAt: '2026-06-06T00:00:00Z',
          },
          candidates: [0, 1, 2].map((index) => ({
            id: `cand-e2e-22-${index}`,
            runId: 'run-e2e-22',
            agendaId: requestBody.agendaId,
            title: `Tema variado ${index}`,
            summary: 'Resumen e2e con evidencia operativa.',
            sourceName: `seed-${index}.example.com`,
            sourceUrl: urls[index],
            snippet: 'Snippet con datos auditables y evidencia diaria.',
            detectedTrope: 'norma nueva que exige evidencia',
            matchedInterests: ['datos auditables'],
            recommendedAuthor: 'Editor UMSA Diaria',
            recommendedRecipeId: 'reactiva',
            recommendedOperationModeId: 'modo-alerta-regulatoria',
            score: 90 - index,
            warnings: [],
            status: 'descubierto',
            createdAt: '2026-06-06T00:00:00Z',
            updatedAt: '2026-06-06T00:00:00Z',
          })).concat([{
            id: 'cand-e2e-22-expanded',
            runId: 'run-e2e-22',
            agendaId: requestBody.agendaId,
            title: 'Tema expandido desde hija',
            summary: 'Resumen e2e expandido.',
            sourceName: 'seed-3.example.com',
            sourceUrl: expandedUrls[3],
            snippet: 'Snippet de URL hija con evidencia.',
            detectedTrope: 'caso local con aprendizaje transferible',
            matchedInterests: ['software libre aplicado'],
            recommendedAuthor: 'Editor Critico',
            recommendedRecipeId: 'caso',
            recommendedOperationModeId: 'modo-caso-cuyano',
            score: 72,
            warnings: [],
            status: 'descubierto',
            createdAt: '2026-06-06T00:00:00Z',
            updatedAt: '2026-06-06T00:00:00Z',
          }]),
        });
        return;
      }

      if (requestBody.query === 'weak-candidate-e2e') {
        await json({
          run: {
            id: 'run-e2e-weak',
            agendaId: 'agenda-umsa-diaria',
            query: requestBody.query,
            urls: ['https://blogs.worldbank.org/en/digital-development'],
            status: 'parcial',
            sourceCount: 1,
            candidateCount: 1,
            provider: 'native-web',
            llmModel: null,
            seedResults: [{
              url: 'https://blogs.worldbank.org/en/digital-development',
              resolvedUrl: 'https://blogs.worldbank.org/en/digital-development',
              host: 'blogs.worldbank.org',
              kind: 'semilla',
              ok: true,
              status: 200,
              contentType: 'text/html',
              warnings: ['Fuente auditada como índice editorial, revisar relevancia.'],
              error: '',
              candidateCount: 1,
              maxCandidateScore: 38,
            }],
            expandedResults: [],
            failedSources: [],
            candidateDistribution: {
              byHost: { 'blogs.worldbank.org': 1 },
              bySourceUrl: { 'https://blogs.worldbank.org/en/digital-development': 1 },
              uniqueHosts: 1,
              maxCandidatesPerHost: 2,
            },
            warnings: [
              'Radar consultó 1 URLs semilla configuradas.',
              'Radar auditó 1 fuentes consultadas sin convertirlas: eran portadas, índices o no tenían evidencia editorial suficiente.',
            ],
            createdAt: '2026-06-06T00:00:00Z',
            completedAt: '2026-06-06T00:00:00Z',
          },
          candidates: [{
            id: 'cand-e2e-weak',
            runId: 'run-e2e-weak',
            agendaId: 'agenda-umsa-diaria',
            title: 'Digital Development',
            summary: 'Página índice con navegación y poca evidencia editorial.',
            sourceName: 'blogs.worldbank.org',
            sourceUrl: 'https://blogs.worldbank.org/en/digital-development',
            snippet: 'Digital Development Skip to Main Navigation Page navigation Home All Blogs SEARCH SEARCH.',
            detectedTrope: 'norma nueva que exige evidencia',
            matchedInterests: [],
            recommendedAuthor: 'Editor UMSA Diaria',
            recommendedRecipeId: 'reactiva',
            recommendedOperationModeId: 'modo-alerta-regulatoria',
            score: 38,
            warnings: ['Candidato agregado para cobertura de fuente; revisar relevancia antes de convertir.'],
            status: 'descubierto',
            createdAt: '2026-06-06T00:00:00Z',
            updatedAt: '2026-06-06T00:00:00Z',
          }],
        });
        return;
      }

      await json({
        run: {
          id: 'run-e2e',
          agendaId: 'agenda-umsa-diaria',
          query: 'ARCA CCTV',
          urls: ['https://example.com/arca'],
          status: 'completo',
          sourceCount: 1,
          candidateCount: 1,
          warnings: [],
          createdAt: '2026-06-06T00:00:00Z',
          completedAt: '2026-06-06T00:00:00Z',
        },
        candidates: [{
          id: 'cand-e2e',
          runId: 'run-e2e',
          agendaId: 'agenda-umsa-diaria',
          title: 'ARCA CCTV fiscal E2E',
          summary: 'Resumen e2e con evidencia operativa.',
          sourceName: 'Example',
          sourceUrl: 'https://example.com/arca',
          snippet: 'Snippet con datos auditables y evidencia diaria.',
          detectedTrope: 'norma nueva que exige evidencia',
          matchedInterests: ['datos auditables'],
          recommendedAuthor: 'Editor UMSA Diaria',
          recommendedRecipeId: 'reactiva',
          recommendedOperationModeId: 'modo-alerta-regulatoria',
          score: 91,
          warnings: [],
          status: 'descubierto',
          createdAt: '2026-06-06T00:00:00Z',
          updatedAt: '2026-06-06T00:00:00Z',
        }],
      });
      return;
    }

    if (url.includes('/convert-topic')) {
      await json({ candidate: {}, topic: {} });
      return;
    }

    if (url.includes('/convert-noterun')) {
      await json({ candidate: {}, topic: {}, noteRun: {} });
      return;
    }

    if (method === 'PATCH') {
      await json({ candidate: {} });
      return;
    }

    await json({ ok: true });
  });
});

test('EDITARRA starts compact and does not call production APIs', async ({ page }) => {
  const apiRequests: string[] = [];
  const consoleErrors: string[] = [];

  page.on('request', (request) => {
    if (request.url().includes('/api/')) apiRequests.push(request.url());
  });
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  await page.goto('/editarra');
  await expect(page.getByRole('heading', { name: 'EDITARRA' })).toBeVisible();
  await expect(page.getByRole('tab', { name: /Operacion/i })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel', { name: /Operacion/i })).toBeVisible();
  await expect(page.getByText('Flujo guiado de nota')).toBeVisible();
  const journey = page.getByLabel('Pasos del flujo operativo');
  await expect(journey).toContainText('Radar');
  await expect(journey).toContainText('Candidatos');
  await expect(journey).toContainText('Nota');
  await expect(journey).toContainText('Imagenes');
  await expect(journey).toContainText('Publicacion');
  await expectNoVisibleHorizontalOverflow(page);
  expect(apiRequests.every((url) => url.includes('/api/editarra/'))).toBe(true);
  expect(consoleErrors).toEqual([]);
});

test('module navigation replaces the home in the first viewport', async ({ page }) => {
  await page.goto('/editarra');

  await clickTab(page, 'Autores');
  await expect(page.getByLabel('Inicio operativo EDITARRA')).toHaveCount(0);
  await expect(page.getByRole('tabpanel')).not.toHaveClass(/hidden/);
  await expect(page.getByText('MESA DE AUTORES')).toBeVisible();
  expect(await visiblePanelTop(page)).toBeLessThan(170);

  await page.getByRole('button', { name: 'Editar' }).first().click();
  await expectDialogIsModalOverlay(page, 'Editor UMSA Diaria');
  await page.getByLabel('Nombre Editor UMSA Diaria').fill('Editor UMSA Diario E2E');
  await expect(page.getByLabel('Nombre Editor UMSA Diario E2E')).toHaveValue('Editor UMSA Diario E2E');
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');

  await clickTab(page, 'Config');
  await expect(page.getByLabel('Inicio operativo EDITARRA')).toHaveCount(0);
  await expect(page.getByText('Config editable por sitio')).toBeVisible();
  expect(await visiblePanelTop(page)).toBeLessThan(170);

  await page.locator('article').filter({ hasText: 'site_id' }).getByRole('button', { name: 'Editar' }).click();
  await expectDialogIsModalOverlay(page, 'site_id');
  await page.getByLabel('Valor site_id').fill('editarra-e2e');
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
  await page.getByRole('button', { name: 'Lote y export' }).click();
  await page.getByRole('button', { name: 'Exportar JSON' }).click();
  await expect(page.getByLabel('Workflow JSON')).toContainText('editarra-e2e');
});

test('editor opens the advanced workspace and generates a note run', async ({ page }) => {
  await page.goto('/editarra');
  await clickTab(page, 'Editor');

  const workspace = page.getByLabel('Perfil operativo de nota').first();
  await expect(workspace).toContainText('Workspace operativo');
  await expect(workspace).toContainText('Soporte e inspección del run');
  await expect(page.getByText('Ver cockpit técnico, handoff y trazabilidad completa')).toBeVisible();
  await expect(page.getByLabel('Cockpit de corrida EDITARRA')).toBeHidden();

  const workspaceBox = await workspace.boundingBox();
  expect(workspaceBox?.y ?? 9999).toBeLessThan(330);
  expect(workspaceBox?.height ?? 9999).toBeLessThanOrEqual(820);

  await workspace.getByLabel('Título nueva corrida workspace').fill('E2E nota generada por perfil');
  await workspace.getByRole('button', { name: 'Crear nota por perfil' }).click();

  await expect(page.getByRole('tab', { name: /Editor/i })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('Estado operativo de corrida').first()).toContainText('Corrida creada');
  await page.getByRole('button', { name: 'Borrador' }).click();
  await expect(page.getByLabel('Cuerpo del borrador')).toHaveValue(/E2E nota generada por perfil/);
});

test('guided generator opens runtime artifacts and keeps the workflow portable', async ({ page }) => {
  await page.goto('/editarra');

  await page.getByRole('tab', { name: /Editor/i }).click();
  await page.getByRole('button', { name: 'Playbook' }).click();
  await page.getByRole('button', { name: 'Generar con perfil' }).first().click();
  await expect(page.getByRole('tab', { name: /Editor/i })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Borrador' }).first().click();
  await expect(page.getByLabel('Cuerpo del borrador')).toHaveValue(/Contrato de generación EDITARRA/);

  await page.getByRole('button', { name: 'Comando' }).click();
  await page.getByText('Ver cockpit técnico, handoff y trazabilidad completa').click();
  await page.getByLabel('Comando operativo de nota')
    .getByRole('button', { name: 'Abrir receta operativa automation_recipe.json' })
    .click();

  await expect(page.getByRole('tab', { name: /Config/i })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('Archivo del paquete editorial')).toContainText('"executionPreflight"');
  await expect(page.getByLabel('Archivo del paquete editorial')).toContainText('"recommendedCommand"');
});

test('global export opens the portable JSON modal from any module', async ({ page }) => {
  await page.goto('/editarra');
  await clickTab(page, 'Operacion');

  await page.getByRole('button', { name: 'Exportar' }).click();
  await expect(page.getByRole('tab', { name: /Operacion/i })).toHaveAttribute('aria-selected', 'true');
  await expectDialogIsModalOverlay(page, 'Export portable');
  await expect(page.getByLabel('Workflow JSON')).toContainText('"product": "editarra"');

  await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Export portable' })).toBeHidden();
  await expect(page.getByRole('tab', { name: /Operacion/i })).toHaveAttribute('aria-selected', 'true');
  await expectBodyScrollUnlocked(page);
  await expectNoVisibleHorizontalOverflow(page);
});

test('selected package artifact survives reload in Config', async ({ page }) => {
  await page.goto('/editarra');
  await clickTab(page, 'Config');

  await page.getByRole('button', { name: 'Paquete', exact: true }).click();
  await page.getByRole('button', { name: 'publication_targets.json' }).click();
  await expect(page.getByRole('button', { name: 'publication_targets.json' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Archivo del paquete editorial')).toContainText('"targets"');

  await expect.poll(async () => page.evaluate(() => {
    const rawState = window.localStorage.getItem('editarra:studio-state:v2');
    return rawState ? JSON.parse(rawState).state?.packageFileKey : null;
  })).toBe('publication_targets.json');

  await page.reload();
  await clickTab(page, 'Config');
  await expect(page.getByRole('button', { name: 'publication_targets.json' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Archivo del paquete editorial')).toContainText('"targets"');
  await expectNoVisibleHorizontalOverflow(page);
});

test('all Config package artifacts are populated and readable', async ({ page }) => {
  await page.goto('/editarra');
  await clickTab(page, 'Config');

  await page.getByRole('button', { name: 'Paquete', exact: true }).click();

  for (const fileKey of editarraPackageFileKeys) {
    await page.getByRole('button', { name: fileKey, exact: true }).click();
    await expect(page.getByRole('button', { name: fileKey, exact: true })).toHaveAttribute('aria-pressed', 'true');

    const content = (await page.getByLabel('Archivo del paquete editorial').textContent())?.trim() || '';
    expect(content, `${fileKey} should not be empty`).not.toHaveLength(0);
    expect(content, `${fileKey} should not show missing/undefined runtime content`).not.toMatch(/undefined|null|^\{\}$/i);

    if (fileKey.endsWith('.json')) {
      expect(() => JSON.parse(content), `${fileKey} should contain valid JSON`).not.toThrow();
    } else {
      expect(content.length, `${fileKey} should contain useful text`).toBeGreaterThan(80);
    }
  }

  await expectNoVisibleHorizontalOverflow(page);
});

test('agenda radar finds candidates, converts a topic and prepares a NoteRun', async ({ page }) => {
  await page.goto('/editarra');
  await clickTab(page, 'Agenda');

  const activeAgendaCard = page.getByLabel('Agenda activa');
  await expect(activeAgendaCard).toBeVisible();
  await expect(activeAgendaCard).toContainText('Destino');
  const agendaTextGeometry = await activeAgendaCard.evaluate((card) => {
    const heading = card.querySelector('h3');
    const audience = Array.from(card.querySelectorAll('p')).find((item) => item.textContent?.includes('Pymes'));
    return {
      headingWidth: Math.round(heading?.getBoundingClientRect().width || 0),
      audienceWidth: Math.round(audience?.getBoundingClientRect().width || 0),
    };
  });
  expect(agendaTextGeometry.headingWidth).toBeGreaterThan(220);
  expect(agendaTextGeometry.audienceWidth).toBeGreaterThan(220);

  await page.getByPlaceholder('ej: infraestructura abierta argentina').fill('ARCA CCTV');
  await page.getByRole('button', { name: 'Buscar temas' }).click();
  await expect(page.getByText('Discovery completado: 1 candidatos.')).toBeVisible();

  await page.getByRole('button', { name: 'Candidatos' }).click();
  const candidateCard = page.locator('article').filter({ hasText: 'ARCA CCTV fiscal E2E' }).first();
  await expect(candidateCard).toBeVisible();
  await expect(candidateCard.getByText('norma nueva que exige evidencia')).toBeVisible();

  await candidateCard.getByRole('button', { name: 'Preseleccionar' }).click();
  await candidateCard.getByRole('button', { name: 'Convertir en tema' }).click();
  await page.getByRole('button', { name: 'Parrilla' }).click();
  await expect(page.getByLabel('Parrilla de temas').getByText('ARCA CCTV fiscal E2E')).toBeVisible();

  await page.getByRole('button', { name: 'Candidatos' }).click();
  const convertedCandidateCard = page.locator('article').filter({ hasText: 'ARCA CCTV fiscal E2E' }).first();
  await convertedCandidateCard.getByRole('button', { name: 'Crear NoteRun' }).click();
  await expect(page.getByRole('tab', { name: /Editor/i })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText(/NoteRun preparado para "ARCA CCTV fiscal E2E"/)).toBeVisible();
  await expectNoVisibleHorizontalOverflow(page);
});

test('candidate status changes are visible, audited and persisted after reload', async ({ page }) => {
  await page.goto('/editarra');
  await clickTab(page, 'Agenda');

  await page.getByPlaceholder('ej: infraestructura abierta argentina').fill('ARCA CCTV');
  await page.getByRole('button', { name: 'Buscar temas' }).click();
  await expect(page.getByText('Discovery completado: 1 candidatos.')).toBeVisible();

  await page.getByRole('button', { name: 'Candidatos' }).click();
  const candidateCard = page.locator('article').filter({ hasText: 'ARCA CCTV fiscal E2E' }).first();
  await expect(candidateCard).toBeVisible();

  await candidateCard.getByRole('button', { name: 'Preseleccionar' }).click();
  await expect(candidateCard.getByText('preseleccionado', { exact: true })).toBeVisible();
  await expect.poll(async () => page.evaluate(() => {
    const rawState = window.localStorage.getItem('editarra:studio-state:v2');
    if (!rawState) return null;
    const parsed = JSON.parse(rawState);
    const candidate = (parsed.state?.discoveryCandidates || []).find((item: { id?: string }) => item.id === 'cand-e2e');
    const auditEvents = parsed.state?.auditEvents || [];
    return {
      status: candidate?.status,
      hasAudit: auditEvents.some((event: { event?: string; detail?: string }) => (
        event.event === 'Estado de candidato actualizado'
        && event.detail?.includes('ARCA CCTV fiscal E2E quedo como preseleccionado')
      )),
    };
  })).toEqual({
    status: 'preseleccionado',
    hasAudit: true,
  });

  await page.reload();
  await clickTab(page, 'Agenda');
  await page.getByRole('button', { name: 'Candidatos' }).click();
  const reloadedCandidateCard = page.locator('article').filter({ hasText: 'ARCA CCTV fiscal E2E' }).first();
  await expect(reloadedCandidateCard).toBeVisible();
  await expect(reloadedCandidateCard.getByText('preseleccionado', { exact: true })).toBeVisible();

  await reloadedCandidateCard.getByRole('button', { name: 'Descartar' }).click();
  await expect(reloadedCandidateCard.getByText('descartado', { exact: true })).toBeVisible();
  await expect.poll(async () => page.evaluate(() => {
    const rawState = window.localStorage.getItem('editarra:studio-state:v2');
    if (!rawState) return null;
    const parsed = JSON.parse(rawState);
    const candidate = (parsed.state?.discoveryCandidates || []).find((item: { id?: string }) => item.id === 'cand-e2e');
    const auditEvents = parsed.state?.auditEvents || [];
    return {
      status: candidate?.status,
      hasAudit: auditEvents.some((event: { event?: string; detail?: string }) => (
        event.event === 'Estado de candidato actualizado'
        && event.detail?.includes('ARCA CCTV fiscal E2E quedo como descartado')
      )),
    };
  })).toEqual({
    status: 'descartado',
    hasAudit: true,
  });
  await expectNoVisibleHorizontalOverflow(page);
});

test('repeated candidate conversion stays idempotent and does not duplicate topics', async ({ page }) => {
  await page.goto('/editarra');
  await clickTab(page, 'Agenda');

  await page.getByPlaceholder('ej: infraestructura abierta argentina').fill('ARCA CCTV');
  await page.getByRole('button', { name: 'Buscar temas' }).click();
  await expect(page.getByText('Discovery completado: 1 candidatos.')).toBeVisible();

  await page.getByRole('button', { name: 'Candidatos' }).click();
  const candidateCard = page.locator('article').filter({ hasText: 'ARCA CCTV fiscal E2E' }).first();
  await expect(candidateCard).toBeVisible();

  await candidateCard.getByRole('button', { name: 'Convertir en tema' }).click();
  await candidateCard.getByRole('button', { name: 'Convertir en tema' }).click();
  await candidateCard.getByRole('button', { name: 'Crear NoteRun' }).click();

  await expect.poll(async () => page.evaluate(() => {
    const rawState = window.localStorage.getItem('editarra:studio-state:v2');
    if (!rawState) return null;
    const parsed = JSON.parse(rawState);
    const topics = parsed.state?.topics || [];
    const convertedTopics = topics.filter((topic: { candidateId?: string }) => topic.candidateId === 'cand-e2e');
    const candidate = (parsed.state?.discoveryCandidates || []).find((item: { id?: string }) => item.id === 'cand-e2e');
    return {
      convertedTopicCount: convertedTopics.length,
      convertedTopicId: convertedTopics[0]?.id,
      candidateStatus: candidate?.status,
    };
  })).toEqual({
    convertedTopicCount: 1,
    convertedTopicId: 'topic-cand-e2e',
    candidateStatus: 'convertido',
  });

  await expect(page.getByRole('tab', { name: /Editor/i })).toHaveAttribute('aria-selected', 'true');
  await expectNoVisibleHorizontalOverflow(page);
});

test('converted candidate remains the active note after reload', async ({ page }) => {
  await page.goto('/editarra');
  await clickTab(page, 'Agenda');

  await page.getByPlaceholder('ej: infraestructura abierta argentina').fill('ARCA CCTV');
  await page.getByRole('button', { name: 'Buscar temas' }).click();
  await expect(page.getByText('Discovery completado: 1 candidatos.')).toBeVisible();

  await page.getByRole('button', { name: 'Candidatos' }).click();
  const candidateCard = page.locator('article').filter({ hasText: 'ARCA CCTV fiscal E2E' }).first();
  await expect(candidateCard).toBeVisible();
  await candidateCard.getByRole('button', { name: 'Convertir en tema' }).click();

  await expect.poll(async () => page.evaluate(() => {
    const rawState = window.localStorage.getItem('editarra:studio-state:v2');
    if (!rawState) return null;
    const parsed = JSON.parse(rawState);
    return {
      selectedTopicId: parsed.state?.selectedTopicId,
      hasConvertedTopic: (parsed.state?.topics || []).some((topic: { id?: string; title?: string }) => (
        topic.id === 'topic-cand-e2e' && topic.title === 'ARCA CCTV fiscal E2E'
      )),
    };
  })).toEqual({
    selectedTopicId: 'topic-cand-e2e',
    hasConvertedTopic: true,
  });

  await page.reload();
  await clickTab(page, 'Editor');
  const workspace = page.getByLabel('Perfil operativo de nota').first();
  await expect(workspace).toContainText('ARCA CCTV fiscal E2E');

  await clickTab(page, 'Imagenes');
  await expect(page.getByText(/Nota activa: ARCA CCTV fiscal E2E/)).toBeVisible();

  await clickTab(page, 'Publicacion');
  await expect(page.getByRole('tabpanel', { name: 'Publicacion' })).toContainText('ARCA CCTV fiscal E2E');
  await expectNoVisibleHorizontalOverflow(page);
});

test('candidate NoteRun carries through image prompt and publication preview', async ({ page }) => {
  await page.goto('/editarra');
  await clickTab(page, 'Agenda');

  await page.getByPlaceholder('ej: infraestructura abierta argentina').fill('ARCA CCTV');
  await page.getByRole('button', { name: 'Buscar temas' }).click();
  await expect(page.getByText('Discovery completado: 1 candidatos.')).toBeVisible();

  await page.getByRole('button', { name: 'Candidatos' }).click();
  const candidateCard = page.locator('article').filter({ hasText: 'ARCA CCTV fiscal E2E' }).first();
  await expect(candidateCard).toBeVisible();
  await candidateCard.getByRole('button', { name: 'Crear NoteRun' }).click();

  await expect(page.getByRole('tab', { name: /Editor/i })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText(/NoteRun preparado para "ARCA CCTV fiscal E2E"/)).toBeVisible();

  await clickTab(page, 'Imagenes');
  await expect(page.getByText(/Nota activa: ARCA CCTV fiscal E2E/)).toBeVisible();
  await expect(page.getByLabel('Prompt PIP imagen')).toContainText('ARCA CCTV fiscal E2E');
  await expectNoVisibleHorizontalOverflow(page);

  await clickTab(page, 'Publicacion');
  const publicationPanel = page.getByRole('tabpanel', { name: 'Publicacion' });
  await expect(publicationPanel).toContainText('ARCA CCTV fiscal E2E');
  await expect(publicationPanel).toContainText('public_export_bundle.json');
  await expect(publicationPanel).toContainText('POST externo desactivado');
  await expect(publicationPanel.getByRole('button', { name: 'Marcar enviado/manual' })).toBeDisabled();
  await expectNoVisibleHorizontalOverflow(page);
});

test('candidate view explains when latest run is empty but historical candidates exist', async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('editarra:e2e-storage-cleared', 'true');
    localStorage.setItem('editarra:studio-state:v2', JSON.stringify({
      product: 'editarra',
      schema: 'studio-state',
      version: 2,
      savedAt: '10:00',
      state: {
        selectedAgendaId: 'agenda-umsa-diaria',
        candidateRunScope: 'ultimo_run',
        discoveryRuns: [
          {
            id: 'run-empty-latest',
            agendaId: 'agenda-umsa-diaria',
            query: 'query sin hallazgos',
            urls: ['https://empty.example.com/news'],
            status: 'completo',
            sourceCount: 1,
            candidateCount: 0,
            warnings: [],
            createdAt: '2026-06-06T11:00:00Z',
            completedAt: '2026-06-06T11:00:00Z',
          },
          {
            id: 'run-old-with-candidate',
            agendaId: 'agenda-umsa-diaria',
            query: 'query anterior',
            urls: ['https://history.example.com/news'],
            status: 'completo',
            sourceCount: 1,
            candidateCount: 1,
            warnings: [],
            createdAt: '2026-06-06T10:00:00Z',
            completedAt: '2026-06-06T10:00:00Z',
          },
        ],
        discoveryCandidates: [{
          id: 'cand-history-only',
          runId: 'run-old-with-candidate',
          agendaId: 'agenda-umsa-diaria',
          title: 'Candidato historico visible',
          summary: 'Resumen historico con datos auditables.',
          sourceName: 'history.example.com',
          sourceUrl: 'https://history.example.com/news',
          snippet: 'Snippet historico con evidencia diaria.',
          detectedTrope: 'norma nueva que exige evidencia',
          matchedInterests: ['datos auditables'],
          recommendedAuthor: 'Editor UMSA Diaria',
          recommendedRecipeId: 'reactiva',
          recommendedOperationModeId: 'modo-alerta-regulatoria',
          score: 76,
          warnings: [],
          status: 'descubierto',
          createdAt: '2026-06-06T10:00:00Z',
          updatedAt: '2026-06-06T10:00:00Z',
        }],
      },
    }));
  });

  await page.goto('/editarra');
  await clickTab(page, 'Agenda');
  await page.getByRole('button', { name: 'Candidatos' }).click();

  await expect(page.getByText('El ultimo run no produjo candidatos visibles')).toBeVisible();
  await expect(page.getByText('Candidato historico visible')).toHaveCount(0);
  await page.getByRole('button', { name: 'Ver historico' }).click();
  await expect(page.getByText('Mostrando historico')).toBeVisible();
  await expect(page.getByText('Candidato historico visible')).toBeVisible();
  await expectNoCollapsedReadableText(page, '.editarra-app');
  await expectNoVisibleHorizontalOverflow(page);
});

test('operation primary control follows the converted candidate workflow stage', async ({ page }) => {
  await page.goto('/editarra');
  await clickTab(page, 'Agenda');

  await page.getByPlaceholder('ej: infraestructura abierta argentina').fill('ARCA CCTV');
  await page.getByRole('button', { name: 'Buscar temas' }).click();
  await expect(page.getByText('Discovery completado: 1 candidatos.')).toBeVisible();

  await page.getByRole('button', { name: 'Candidatos' }).click();
  const candidateCard = page.locator('article').filter({ hasText: 'ARCA CCTV fiscal E2E' }).first();
  await expect(candidateCard).toBeVisible();
  await candidateCard.getByRole('button', { name: 'Crear NoteRun' }).click();

  await clickTab(page, 'Operacion');
  const operationPanel = page.getByRole('tabpanel', { name: 'Operacion' });
  await expect(operationPanel).toContainText('Validar fuentes');
  await operationPanel.getByRole('button', { name: 'Validar fuentes' }).first().click();
  await expect(page.getByRole('tab', { name: /Auditoria/i })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel', { name: 'Auditoria' })).toContainText('ARCA CCTV fiscal E2E');

  await clickTab(page, 'Operacion');
  await operationPanel.getByRole('button', { name: 'Abrir imagenes' }).click();
  await expect(page.getByRole('tab', { name: /Imagenes/i })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText(/Nota activa: ARCA CCTV fiscal E2E/)).toBeVisible();
  await expectNoVisibleHorizontalOverflow(page);
});

test('agenda radar sends all edited seed URLs and renders auditable source coverage', async ({ page }) => {
  const seedUrls = Array.from({ length: 22 }, (_, index) => `https://seed-${index}.example.com/news`);

  await page.goto('/editarra');
  await clickTab(page, 'Agenda');

  const editAgenda = page.getByRole('button', { name: 'Editar agenda' });
  await expect(editAgenda).toHaveCount(1);
  await editAgenda.click();

  const agendaDialog = page.getByRole('dialog', { name: 'UMSA Diaria - Tecnologia abierta' });
  await expectDialogIsModalOverlay(page, 'UMSA Diaria - Tecnologia abierta');
  await expect(agendaDialog).toBeVisible();
  const sourceTextarea = agendaDialog.locator('label').filter({ hasText: 'URLs fuente' }).locator('textarea');
  await expect(sourceTextarea).toHaveCount(1);
  await sourceTextarea.fill(seedUrls.join('\n'));
  await agendaDialog.getByRole('button', { name: 'Guardar y cerrar' }).click();
  await expect(agendaDialog).toBeHidden();
  await expect(page.getByText(/Agenda guardada:/)).toBeVisible();
  await expect.poll(async () => page.evaluate(() => {
    const rawState = window.localStorage.getItem('editarra:studio-state:v2');
    if (!rawState) return false;
    const parsed = JSON.parse(rawState);
    const sourceUrls = parsed?.state?.editorialAgendas?.[0]?.sourceUrls || [];
    return sourceUrls.length === 22 && sourceUrls.includes('https://seed-21.example.com/news');
  })).toBe(true);

  await page.reload();
  await clickTab(page, 'Agenda');
  await page.getByRole('button', { name: 'Editar agenda' }).click();
  const reloadedAgendaDialog = page.getByRole('dialog', { name: 'UMSA Diaria - Tecnologia abierta' });
  await expectDialogIsModalOverlay(page, 'UMSA Diaria - Tecnologia abierta');
  await expect(reloadedAgendaDialog).toContainText(seedUrls[21]);
  await reloadedAgendaDialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await expect(reloadedAgendaDialog).toBeHidden();

  await page.getByPlaceholder('ej: infraestructura abierta argentina').fill('22-seeds-e2e');
  await page.getByRole('button', { name: 'Buscar temas' }).click();
  await expect(page.getByText('Discovery completado via native-web: 4 candidatos.')).toBeVisible();

  expect(discoveryRequestBodies).toHaveLength(1);
  expect(discoveryRequestBodies[0].urls).toHaveLength(22);
  expect(discoveryRequestBodies[0].urls).toEqual(seedUrls);

  await page.getByRole('button', { name: 'Ver URLs consultadas' }).click();
  const auditDialog = page.getByRole('dialog', { name: 'URLs consultadas por Radar' });
  await expect(auditDialog).toBeVisible();
  await expect(auditDialog).toContainText('Semillas');
  await expect(auditDialog).toContainText('22');
  await expect(auditDialog).toContainText(seedUrls[21]);
  await expect(auditDialog).toContainText(`${seedUrls[3]}/expanded-3`);
  await expect(auditDialog).toContainText('Timeout al consultar fuente.');
  await expect(auditDialog).toContainText('Tema expandido desde hija');
  await expectNoVisibleHorizontalOverflow(page);
});

test('weak Radar candidates stay auditable but cannot be converted into notes', async ({ page }) => {
  await page.goto('/editarra');
  await clickTab(page, 'Agenda');

  await page.getByPlaceholder('ej: infraestructura abierta argentina').fill('weak-candidate-e2e');
  await page.getByRole('button', { name: 'Buscar temas' }).click();
  await expect(page.getByText('Discovery completado via native-web: 1 candidatos.')).toBeVisible();

  await page.getByRole('button', { name: 'Candidatos' }).click();
  const weakCandidate = page.locator('article').filter({ hasText: 'Digital Development' }).first();
  await expect(weakCandidate).toBeVisible();
  await expect(weakCandidate).toContainText('requiere revision');
  await expect(weakCandidate).toContainText('Requiere revisión: Radar lo marcó como señal débil o fuente de cobertura.');
  await expect(weakCandidate.getByRole('button', { name: 'Preseleccionar' })).toBeEnabled();
  await expect(weakCandidate.getByRole('button', { name: 'Convertir en tema' })).toBeDisabled();
  await expect(weakCandidate.getByRole('button', { name: 'Crear NoteRun' })).toBeDisabled();
  await expectNoVisibleHorizontalOverflow(page);
});

test('agenda radar does not inject default seeds into a custom source list', async ({ page }) => {
  const customUrls = [
    'https://custom-radar-a.example.com/feed',
    'https://custom-radar-b.example.com/news',
  ];

  await page.goto('/editarra');
  await clickTab(page, 'Agenda');

  await page.getByRole('button', { name: 'Editar agenda' }).click();
  const agendaDialog = page.getByRole('dialog', { name: 'UMSA Diaria - Tecnologia abierta' });
  await expectDialogIsModalOverlay(page, 'UMSA Diaria - Tecnologia abierta');
  const sourceTextarea = agendaDialog.locator('label').filter({ hasText: 'URLs fuente' }).locator('textarea');
  await sourceTextarea.fill(customUrls.join('\n'));
  await agendaDialog.getByRole('button', { name: 'Guardar y cerrar' }).click();
  await expect(agendaDialog).toBeHidden();

  await page.getByPlaceholder('ej: infraestructura abierta argentina').fill('custom-sources-only');
  await page.getByRole('button', { name: 'Buscar temas' }).click();
  await expect(page.getByText('Discovery completado: 1 candidatos.')).toBeVisible();

  expect(discoveryRequestBodies).toHaveLength(1);
  expect(discoveryRequestBodies[0].urls).toEqual(customUrls);
  expect(discoveryRequestBodies[0].urls).not.toContain('https://www.argentina.gob.ar/jefatura/innovacion-ciencia-y-tecnologia/noticias');
  expect(discoveryRequestBodies[0].urls).not.toContain('https://www.postgresql.org/about/newsarchive/');
});

test('agenda source edits are not persisted until the operator saves the modal', async ({ page }) => {
  const unsavedUrl = 'https://unsaved-source.example.com/news';

  await page.goto('/editarra');
  await clickTab(page, 'Agenda');

  await page.getByRole('button', { name: 'Editar agenda' }).click();
  const agendaDialog = page.getByRole('dialog', { name: 'UMSA Diaria - Tecnologia abierta' });
  await expectDialogUsesInternalScroll(page, 'UMSA Diaria - Tecnologia abierta');
  const sourceTextarea = agendaDialog.locator('label').filter({ hasText: 'URLs fuente' }).locator('textarea');
  await sourceTextarea.fill(unsavedUrl);
  await agendaDialog.getByRole('button', { name: 'Cerrar sin guardar' }).click();
  await expect(agendaDialog).toBeHidden();

  await page.getByRole('button', { name: 'Editar agenda' }).click();
  const reopenedDialog = page.getByRole('dialog', { name: 'UMSA Diaria - Tecnologia abierta' });
  const reopenedSourceTextarea = reopenedDialog.locator('label').filter({ hasText: 'URLs fuente' }).locator('textarea');
  await expect(reopenedSourceTextarea).not.toHaveValue(new RegExp(unsavedUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  await reopenedDialog.getByRole('button', { name: 'Cerrar', exact: true }).click();

  await page.getByPlaceholder('ej: infraestructura abierta argentina').fill('unsaved-source-check');
  await page.getByRole('button', { name: 'Buscar temas' }).click();
  await expect(page.getByText('Discovery completado: 1 candidatos.')).toBeVisible();
  expect(discoveryRequestBodies).toHaveLength(1);
  expect(discoveryRequestBodies[0].urls || []).not.toContain(unsavedUrl);
});

test('editing surfaces open as real modals and restore page scroll', async ({ page }) => {
  await page.goto('/editarra');
  await clickTab(page, 'Agenda');

  await page.getByRole('button', { name: 'Editar agenda' }).click();
  const agendaDialog = page.getByRole('dialog', { name: 'UMSA Diaria - Tecnologia abierta' });
  await expectDialogIsModalOverlay(page, 'UMSA Diaria - Tecnologia abierta');

  await page.keyboard.press('Escape');
  await expect(agendaDialog).toBeHidden();
  await expectBodyScrollUnlocked(page);
  await expectNoVisibleHorizontalOverflow(page);

  await page.getByRole('button', { name: 'Editar agenda' }).click();
  await expectDialogUsesInternalScroll(page, 'UMSA Diaria - Tecnologia abierta');
  await page.mouse.click(8, 8);
  await expect(agendaDialog).toBeHidden();
  await expectBodyScrollUnlocked(page);
  await expectNoVisibleHorizontalOverflow(page);
});

test('mobile modules are reachable without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/editarra');
  await expectModuleTabsWithinViewport(page);
  await expectNoVisibleHorizontalOverflow(page);

  await clickTab(page, 'Auditoria');
  await page.getByRole('button', { name: 'Metricas' }).click();
  await expect(page.getByLabel('Monitor de metricas')).toBeVisible();
  await expect(page.getByRole('tabpanel')).not.toHaveClass(/hidden/);
  expect(await visiblePanelTop(page)).toBeLessThan(430);
  await expectNoVisibleHorizontalOverflow(page);
});

test('intermediate viewport keeps modules usable and editing surfaces modalized', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 760 });
  await page.goto('/editarra');
  await expectModuleTabsWithinViewport(page);

  for (const tab of ['Operacion', 'Agenda', 'Autores', 'Editor', 'Imagenes', 'Publicacion', 'Auditoria', 'Config']) {
    await clickTab(page, tab);
    await expect(page.getByRole('tabpanel')).not.toHaveClass(/hidden/);
    await expectActivePanelUsableGeometry(page);
    await expectNoCollapsedReadableText(page);
    await expectNoCollapsedReadableText(page, '.editarra-app');
    await expectNoVisibleHorizontalOverflow(page);
  }

  await clickTab(page, 'Agenda');
  await page.getByRole('button', { name: 'Editar agenda' }).click();
  await expectDialogUsesInternalScroll(page, 'UMSA Diaria - Tecnologia abierta');
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await expectBodyScrollUnlocked(page);

  await clickTab(page, 'Autores');
  await page.getByRole('button', { name: 'Editar' }).first().click();
  await expectDialogUsesInternalScroll(page, 'Editor UMSA Diaria');
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await expectBodyScrollUnlocked(page);
  await expectNoVisibleHorizontalOverflow(page);
});

test('editor workspace stays readable across desktop workbench widths', async ({ page }) => {
  for (const viewport of [
    { width: 1024, height: 760 },
    { width: 1280, height: 720 },
    { width: 1440, height: 820 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/editarra');
    await clickTab(page, 'Editor');

    await expect(page.getByRole('tabpanel', { name: 'Editor' })).toBeVisible();
    await expectWorkspaceUsableGeometry(page);
    await expectNoCollapsedReadableText(page);
    await expectNoCollapsedReadableText(page, '.editarra-app');
    await expectNoCollapsedActionControls(page);
    await expectNoVisibleHorizontalOverflow(page);
  }
});

test('seo variants are edited in a modal instead of expanding inline forms', async ({ page }) => {
  await page.goto('/editarra');
  await clickTab(page, 'Editor');
  await page.getByRole('button', { name: 'Borrador' }).click();

  const seoPanel = page.getByLabel('Experimentos SEO');
  await expect(seoPanel).toBeVisible();
  await expect(seoPanel.locator('input,textarea,select')).toHaveCount(0);

  await page.getByRole('button', { name: 'Nueva variante SEO' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toHaveCount(1);
  await expectDialogIsModalOverlay(page, /ARCA y depósitos fiscales|Variante SEO/);
  await expect(dialog).toContainText('Titulo');
  await expect(dialog).toContainText('Descripcion');
  await expect(dialog.locator('input,textarea,select')).not.toHaveCount(0);
  await expectNoForbiddenVisibleText(page);

  await dialog.getByRole('button', { name: 'Cerrar editor' }).click();
  await expect(dialog).toBeHidden();
  await expectBodyScrollUnlocked(page);

  const inlineEditorCount = await seoPanel.evaluate((panel) => (
    Array.from(panel.querySelectorAll('input,textarea,select'))
      .filter((element) => !element.closest('[role="dialog"]')).length
  ));
  expect(inlineEditorCount).toBe(0);
  await expectNoVisibleHorizontalOverflow(page);
});

test('desktop modules expose an actionable control in the first viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/editarra');

  const expectedControls: Array<[string, string]> = [
    ['Operacion', 'Buscar temas'],
    ['Agenda', 'Buscar temas'],
    ['Autores', 'Nuevo autor'],
    ['Editor', 'Siguiente control'],
    ['Imagenes', 'Nueva imagen'],
    ['Publicacion', 'Copiar payload'],
    ['Auditoria', 'Metricas'],
    ['Config', 'Paquete'],
  ];

  for (const [tab, control] of expectedControls) {
    await clickTab(page, tab);
    await expect(page.getByRole('tabpanel')).not.toHaveClass(/hidden/);
    await expectPanelControlInFirstViewport(page, control);
    await expectNoCollapsedReadableText(page);
    await expectNoCollapsedReadableText(page, '.editarra-app');
    await expectNoVisibleHorizontalOverflow(page);
  }
});

test('publication cannot be marked sent while preflight is blocked', async ({ page }) => {
  await page.goto('/editarra');
  await clickTab(page, 'Publicacion');

  const panel = page.getByRole('tabpanel', { name: 'Publicacion' });
  await expect(panel).toContainText('Previa publicable');
  await expect(panel).toContainText('bloqueado');
  await expect(panel.getByRole('button', { name: 'Marcar enviado/manual' })).toBeDisabled();
  await expectNoVisibleHorizontalOverflow(page);
});

test('operation primary control routes an approved note to image preparation', async ({ page }) => {
  await seedApprovedPublicationState(page, false);
  await page.goto('/editarra');

  const operationPanel = page.getByRole('tabpanel', { name: 'Operacion' });
  await expect(operationPanel).toContainText('Preparar imagen');
  await expect(operationPanel).toContainText('imagen sin prompt/manifiesto listo');
  await operationPanel.getByRole('button', { name: 'Preparar imagen' }).click();

  await expect(page.getByRole('tab', { name: /Imagenes/i })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel', { name: 'Imagenes' })).toContainText('Imagenes de nota');
  await expectNoVisibleHorizontalOverflow(page);
});

test('image prompt creation opens a modal editor and keeps the workflow usable', async ({ page }) => {
  await page.goto('/editarra');
  await clickTab(page, 'Imagenes');

  await page.getByRole('button', { name: 'Nueva imagen' }).click();
  const imageDialog = page.getByRole('dialog', { name: 'Nuevo prompt visual' });
  await expectDialogUsesInternalScroll(page, 'Nuevo prompt visual');

  await imageDialog.getByLabel('Prompt imagen', { exact: true }).fill(
    'Fotografia documental de una mesa tecnica argentina con evidencia operativa, sin texto visible, sin logos y sin rostros reconocibles.',
  );
  await imageDialog.getByLabel('Titulo imagen', { exact: true }).fill('Imagen documental E2E');
  const renamedImageDialog = page.getByRole('dialog', { name: 'Imagen documental E2E' });
  await renamedImageDialog.getByLabel('Prompt imagen', { exact: true }).fill(
    'Fotografia documental de una mesa tecnica argentina con evidencia operativa, sin texto visible, sin logos y sin rostros reconocibles.',
  );
  await renamedImageDialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(renamedImageDialog.getByRole('button', { name: 'En banco' })).toBeVisible();
  await renamedImageDialog.getByRole('button', { name: 'Cerrar', exact: true }).click();

  await expect(imageDialog).toBeHidden();
  await expectBodyScrollUnlocked(page);
  await expect(page.getByRole('tabpanel', { name: 'Imagenes' })).toContainText('Imagen documental E2E');
  await expect(page.getByRole('tabpanel', { name: 'Imagenes' })).toContainText('Fotografia documental de una mesa tecnica argentina');
  await expectNoCollapsedReadableText(page, '.editarra-app');
  await expectNoVisibleHorizontalOverflow(page);

  await expect.poll(async () => page.evaluate(() => {
    const rawState = window.localStorage.getItem('editarra:studio-state:v2');
    if (!rawState) return null;
    const parsed = JSON.parse(rawState);
    const image = (parsed.state?.imagePrompts || []).find((prompt: { title?: string }) => prompt.title === 'Imagen documental E2E');
    return image ? {
      prompt: image.prompt,
      reusable: parsed.state?.reusableImages?.includes(image.id),
    } : null;
  })).toEqual({
    prompt: 'Fotografia documental de una mesa tecnica argentina con evidencia operativa, sin texto visible, sin logos y sin rostros reconocibles.',
    reusable: true,
  });
});

test('operation primary control routes a ready package to publication preview', async ({ page }) => {
  await seedApprovedPublicationState(page, true);
  await page.goto('/editarra');

  const operationPanel = page.getByRole('tabpanel', { name: 'Operacion' });
  await expect(operationPanel).toContainText('Ver preview publicable');
  await expect(operationPanel).toContainText('listo');
  await operationPanel.getByRole('button', { name: 'Ver preview publicable' }).click();

  const publicationPanel = page.getByRole('tabpanel', { name: 'Publicacion' });
  await expect(page.getByRole('tab', { name: /Publicacion/i })).toHaveAttribute('aria-selected', 'true');
  await expect(publicationPanel).toContainText('Previa publicable');
  await expect(publicationPanel).toContainText('listo_para_publicar');
  await expect(publicationPanel.getByRole('heading', { name: 'Cómo funciona por dentro', exact: true })).toBeVisible();
  await expect(publicationPanel.getByRole('heading', { name: /Cómo funciona por dentro PostgreSQL/ })).toHaveCount(0);
  await expect(publicationPanel.getByText(/PostgreSQL conserva registros estructurados/)).toBeVisible();
  await expect(publicationPanel.getByRole('button', { name: 'Marcar enviado/manual' })).toBeEnabled();
  await expectNoVisibleHorizontalOverflow(page);
});

test('editor cockpit publication lane opens the publishable preview instead of raw config', async ({ page }) => {
  await seedApprovedPublicationState(page, true);
  await page.goto('/editarra');
  await clickTab(page, 'Editor');

  await page.getByRole('button', { name: 'Comando' }).click();
  await page.getByText('Ver cockpit técnico, handoff y trazabilidad completa').click();
  const cockpit = page.getByLabel('Cockpit operativo');
  await expect(cockpit).toBeVisible();
  await expect(cockpit).toContainText('Payload controlado');
  await cockpit.getByRole('button', { name: 'Ver preview' }).click();

  await expect(page.getByRole('tab', { name: /Publicacion/i })).toHaveAttribute('aria-selected', 'true');
  const publicationPanel = page.getByRole('tabpanel', { name: 'Publicacion' });
  await expect(publicationPanel).toContainText('Previa publicable');
  await expect(publicationPanel).toContainText('listo_para_publicar');
  await expectNoVisibleHorizontalOverflow(page);
});

test('editor next control approves audit and lands on publication preview', async ({ page }) => {
  await seedAuditReadyPublicationState(page);
  await page.goto('/editarra');
  await clickTab(page, 'Editor');

  await page.getByRole('button', { name: 'Comando' }).click();
  const workspace = page.getByLabel('Perfil operativo de nota');
  await expect(workspace).toContainText('Siguiente control');
  await expect(workspace).toContainText('Aprobar auditoría');
  await workspace.getByRole('button', { name: 'Siguiente control', exact: true }).click();

  await expect(page.getByRole('tab', { name: /Publicacion/i })).toHaveAttribute('aria-selected', 'true');
  const publicationPanel = page.getByRole('tabpanel', { name: 'Publicacion' });
  await expect(publicationPanel).toContainText('Previa publicable');
  await expect(publicationPanel).toContainText('publication_payload.json');
  await expect(publicationPanel).toContainText('ARCA CCTV fiscal E2E');
  await expect(page.getByRole('tab', { name: /Config/i })).not.toHaveAttribute('aria-selected', 'true');
  await expectNoVisibleHorizontalOverflow(page);
});

test('publication ready flow marks the note as sent and persists the closeout', async ({ page }) => {
  await seedApprovedPublicationState(page, true);

  await page.goto('/editarra');
  await clickTab(page, 'Publicacion');

  const panel = page.getByRole('tabpanel', { name: 'Publicacion' });
  await expect(panel).toContainText('listo_para_publicar');
  await expect(panel.getByRole('button', { name: 'Marcar enviado/manual' })).toBeEnabled();
  await panel.getByRole('button', { name: 'Marcar enviado/manual' }).click();

  await expect(panel).toContainText('publicado');
  await expect.poll(async () => page.evaluate(() => {
    const rawState = window.localStorage.getItem('editarra:studio-state:v2');
    if (!rawState) return null;
    const parsed = JSON.parse(rawState);
    const state = parsed.state || {};
    return {
      topicStatus: state.topics?.[0]?.status,
      draftStatus: state.drafts?.[0]?.status,
      distributionStatus: state.distributionActions?.['topic-umsa-reactiva:cms:umsa-blog'],
    };
  })).toEqual({
    topicStatus: 'publicado',
    draftStatus: 'publicado',
    distributionStatus: 'enviado',
  });
  await expectNoVisibleHorizontalOverflow(page);
});

test('publication destination selection survives reload and closes the selected CMS target', async ({ page }) => {
  await seedApprovedPublicationState(page, true);

  await page.goto('/editarra');
  await clickTab(page, 'Publicacion');

  const panel = page.getByRole('tabpanel', { name: 'Publicacion' });
  const destinationSelect = panel.getByLabel('Destino CMS');
  await expect(destinationSelect).toContainText('Licitometro JSON');
  await destinationSelect.selectOption('licitometro-json');
  await expect(panel).toContainText('Licitometro JSON');
  await expect(panel.getByText('Preview Licitometro JSON')).toBeVisible();
  await expect(panel.getByText('EDITARRA / Licitometro JSON')).toBeVisible();

  await expect.poll(async () => page.evaluate(() => {
    const rawState = window.localStorage.getItem('editarra:studio-state:v2');
    if (!rawState) return null;
    return JSON.parse(rawState).state?.selectedPublicationDestinationId;
  })).toBe('licitometro-json');

  await page.reload();
  await clickTab(page, 'Publicacion');
  const reloadedPanel = page.getByRole('tabpanel', { name: 'Publicacion' });
  await expect(reloadedPanel.getByLabel('Destino CMS')).toHaveValue('licitometro-json');
  await expect(reloadedPanel).toContainText('Licitometro JSON');
  await expect(reloadedPanel.getByText('Preview Licitometro JSON')).toBeVisible();
  await expect(reloadedPanel.getByText('EDITARRA / Licitometro JSON')).toBeVisible();

  await reloadedPanel.getByRole('button', { name: 'Marcar enviado/manual' }).click();
  await expect(reloadedPanel).toContainText('publicado');
  await expect.poll(async () => page.evaluate(() => {
    const rawState = window.localStorage.getItem('editarra:studio-state:v2');
    if (!rawState) return null;
    const parsed = JSON.parse(rawState);
    const state = parsed.state || {};
    return {
      selectedPublicationDestinationId: state.selectedPublicationDestinationId,
      licitometroJsonStatus: state.distributionActions?.['topic-umsa-reactiva:cms:licitometro-json'],
      umsaBlogStatus: state.distributionActions?.['topic-umsa-reactiva:cms:umsa-blog'],
    };
  })).toEqual({
    selectedPublicationDestinationId: 'licitometro-json',
    licitometroJsonStatus: 'enviado',
    umsaBlogStatus: undefined,
  });
  await expectNoVisibleHorizontalOverflow(page);
});

test('publication manual closeout is stable when the operator repeats the action', async ({ page }) => {
  await seedApprovedPublicationState(page, true);

  await page.goto('/editarra');
  await clickTab(page, 'Publicacion');

  const panel = page.getByRole('tabpanel', { name: 'Publicacion' });
  const closeoutButton = panel.getByRole('button', { name: 'Marcar enviado/manual' });
  await expect(closeoutButton).toBeEnabled();
  await closeoutButton.click();
  await expect(panel).toContainText('publicado');
  await closeoutButton.click();

  await expect.poll(async () => page.evaluate(() => {
    const rawState = window.localStorage.getItem('editarra:studio-state:v2');
    if (!rawState) return null;
    const parsed = JSON.parse(rawState);
    const state = parsed.state || {};
    const publicationEvents = (state.auditEvents || []).filter((event: { event?: string }) => event.event === 'Publicacion manual marcada');
    return {
      topicStatus: state.topics?.[0]?.status,
      draftStatus: state.drafts?.[0]?.status,
      distributionStatus: state.distributionActions?.['topic-umsa-reactiva:cms:umsa-blog'],
      publicationEventCount: publicationEvents.length,
    };
  })).toEqual({
    topicStatus: 'publicado',
    draftStatus: 'publicado',
    distributionStatus: 'enviado',
    publicationEventCount: 1,
  });
  await expectNoVisibleHorizontalOverflow(page);
});

test('main EDITARRA surfaces do not expose placeholders or internal instructions', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  await page.goto('/editarra');

  for (const tab of ['Operacion', 'Agenda', 'Autores', 'Editor', 'Imagenes', 'Publicacion', 'Auditoria', 'Config']) {
    await clickTab(page, tab);
    await expect(page.getByRole('tabpanel')).not.toHaveClass(/hidden/);
    await expectNoForbiddenVisibleText(page);
    await expectNoForbiddenPanelText(page);
    await expectNoVisibleHorizontalOverflow(page);
  }

  await clickTab(page, 'Editor');
  await page.getByRole('button', { name: 'Borrador' }).first().click();
  await page.getByRole('button', { name: 'Nueva variante SEO' }).click();
  await expectNoForbiddenVisibleText(page);
  await expectNoForbiddenPanelText(page);
  await expectNoVisibleHorizontalOverflow(page);
  expect(consoleErrors).toEqual([]);
});
