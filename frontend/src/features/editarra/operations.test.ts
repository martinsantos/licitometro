import { buildEditarraBatch, buildEditarraImageManifest, buildEditarraPackage } from './operations';

const topic = {
  id: 'topic-test',
  title: 'PostgreSQL auditado para pymes',
  status: 'aprobado',
  source: 'PostgreSQL docs',
  narrative: 'Explica auditoria, permisos y evidencia operativa.',
  seo: 'Keyword principal: PostgreSQL auditoria',
  depth: 'Media',
  tokens: 9000,
  publishAt: '2026-06-11T12:00:00-03:00',
  author: 'Editor UMSA Diaria',
};

const author = {
  name: 'Editor UMSA Diaria',
  voiceBrief: 'Didactico y verificable.',
  stance: 'tecnico',
  density: 'media',
  locality: 'Argentina',
  references: ['PostgreSQL docs'],
  antiReferences: ['marketing generico'],
};

const draft = {
  id: 'draft-test',
  topicId: 'topic-test',
  variant: 'humanizado' as const,
  status: 'aprobado',
  title: 'Borrador',
  seoTitle: 'PostgreSQL auditado para pymes',
  body: [
    'Lead con suficiente detalle para la nota.',
    '## Cómo funciona por dentro',
    'Primero se registra el dato. Segundo se audita. Tercero se restaura.',
    '## Qué se instala o configura primero',
    'PostgreSQL, permisos y backup.',
    '## Dónde se rompe y cómo probarlo',
    'La prueba mínima valida permisos, backup, auditoría, costo y entregable.',
    '## Para seguir leyendo',
    '- PostgreSQL docs',
  ].join('\n\n'),
  notes: 'Resumen listo',
  updatedAt: '12:00',
};

const imagePrompt = {
  id: 'img-test',
  title: 'Mesa tecnica documental',
  ratio: '16:9',
  status: 'Apto reutilización',
  prompt: 'Mesa tecnica con documentos de auditoria, notebook sin texto visible y evidencia fisica del trabajo.',
};

describe('operations image workflow', () => {
  it('builds a stable image manifest from a note and UMSA prompt rules', () => {
    const manifest = buildEditarraImageManifest({
      topic,
      imagePrompt,
      slug: 'postgresql-auditado-para-pymes',
      generatedAt: '2026-06-11T12:00:00-03:00',
    });

    expect(manifest.expectedFilename).toBe('postgresql-auditado-para-pymes-principal');
    expect(manifest.batchId).toBe('editarra-images-2026-06');
    expect(manifest.status).toBe('prompt_listo');
    expect(manifest.prompt).toContain('Sin texto visible');
    expect(manifest.prompt).toContain('No generar collage');
    expect(manifest.destinationPath).toContain('/images/editarra/generated/editarra-images-2026-06/');
  });

  it('exports image_manifest.json and image_prompt.json in the editorial package', () => {
    const pkg = buildEditarraPackage({
      topic,
      author,
      draft,
      imagePrompt,
      rules: [{ title: 'Regla', body: 'Toda fuente debe existir.', enabled: true }],
      variables: [],
      evidence: [],
      seoExperiments: [],
      analyticsRecords: [],
      draftVersions: [],
      auditEvents: [{ id: 'audit-test', event: 'Test', detail: 'Detalle', time: '12:00' }],
      hostUrl: 'www.ultimamilla.com.ar',
      route: '/editarra',
    });

    expect(pkg.files['image_manifest.json']).toContain('"expectedFilename"');
    expect(pkg.files['image_prompt.json']).toContain('"expected_filename"');
    expect(pkg.preflight.find((check) => check.id === 'image-prompt')?.passed).toBe(true);
    expect(pkg.preflight.find((check) => check.id === 'publication-preview')?.passed).toBe(true);
  });

  it('keeps the base package manifest aligned with exported files', () => {
    const pkg = buildEditarraPackage({
      topic,
      author,
      draft,
      imagePrompt,
      rules: [{ title: 'Regla', body: 'Toda fuente debe existir.', enabled: true }],
      variables: [],
      evidence: [],
      seoExperiments: [],
      analyticsRecords: [],
      draftVersions: [],
      auditEvents: [{ id: 'audit-test', event: 'Test', detail: 'Detalle', time: '12:00' }],
      hostUrl: 'www.ultimamilla.com.ar',
      route: '/editarra',
    });

    const manifest = JSON.parse(pkg.files['package_manifest.json']);
    const fileKeys = Object.keys(pkg.files).sort();

    expect(manifest.files.sort()).toEqual(fileKeys);
    expect(fileKeys).toContain('publication_payload.json');
    expect(fileKeys).toContain('image_manifest.json');
    expect(fileKeys).not.toContain('publication_targets.json');
  });

  it('blocks internal SEO instructions from package readiness and keeps public metadata clean', () => {
    const pkg = buildEditarraPackage({
      topic,
      author,
      draft,
      imagePrompt,
      rules: [{ title: 'Regla', body: 'Toda fuente debe existir.', enabled: true }],
      variables: [],
      evidence: [],
      seoExperiments: [{
        id: 'seo-bad',
        topicId: topic.id,
        title: 'BCRA: como corregir datos desactualizados',
        description: 'Descripcion SEO honesta.',
        focusKeyword: 'problema administrativo que revela falla tecnica',
        strategy: 'Mixto',
        ctr: 0,
        impressions: 0,
        selected: true,
        notes: 'Variante visible sin metricas historicas.',
      }],
      analyticsRecords: [],
      draftVersions: [],
      auditEvents: [{ id: 'audit-test', event: 'Test', detail: 'Detalle', time: '12:00' }],
      hostUrl: 'www.ultimamilla.com.ar',
      route: '/editarra',
    });

    const qualityGate = pkg.preflight.find((check) => check.id === 'content-quality-gate');
    const payload = JSON.parse(pkg.files['publication_payload.json']);
    const audit = JSON.parse(pkg.files['quality_audit.json']);

    expect(qualityGate?.passed).toBe(false);
    expect(qualityGate?.severity).toBe('bloqueante');
    expect(pkg.ready).toBe(false);
    expect(payload.meta_description).not.toMatch(/curiosity gap|promesa explicita|define hipotesis|descripcion seo honesta/i);
    expect(payload.editarra.content_quality.passed).toBe(true);
    expect(audit.content_quality.passed).toBe(false);
    expect(audit.content_quality.blocking_count).toBeGreaterThan(0);
  });

  it('keeps batch export renderable when a note has no image prompt yet', () => {
    const batch = buildEditarraBatch({
      topics: [topic],
      authors: [author],
      drafts: [draft],
      imagePrompts: [],
      rules: [{ title: 'Regla', body: 'Toda fuente debe existir.', enabled: true }],
      variables: [],
      evidence: [],
      seoExperiments: [],
      analyticsRecords: [],
      draftVersions: [],
      auditEvents: [{ id: 'audit-test', event: 'Test', detail: 'Detalle', time: '12:00' }],
      hostUrl: 'www.ultimamilla.com.ar',
      route: '/editarra',
    });

    expect(batch.topicCount).toBe(1);
    expect(batch.blockedCount).toBe(1);
    expect(batch.content).toContain('postgresql-auditado-para-pymes');
  });
});
