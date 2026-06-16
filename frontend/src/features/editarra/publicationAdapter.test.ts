import { buildEditarraPublicationManifest, buildPublicationTargets, defaultPublicationDestinations } from './publicationAdapter';

const publicationPayload = {
  titulo: 'Nota lista',
  categoria: 'tecnico',
  fecha_publicacion: '2026-06-05T12:00:00-03:00',
  slug: 'nota-lista',
};

const distributionManifest = {
  distribution_id: 'editarra-distribution-test',
  channels: [
    { channel: 'site', label: 'Sitio', items: 2 },
    { channel: 'newsletter', label: 'Newsletter', items: 1 },
  ],
};

describe('publicationAdapter', () => {
  it('builds a publishable manifest without enabling external POST', () => {
    const manifest = buildEditarraPublicationManifest({
      packageId: 'package-test',
      ready: true,
      blockers: 0,
      warnings: 0,
      postingMode: 'asistido',
      endpoint: 'https://www.ultimamilla.com.ar/api/blog',
      publicationPayload,
      distributionManifest,
    });

    expect(manifest.status).toBe('listo_para_publicar');
    expect(manifest.payloadFile).toBe('publication_payload.json');
    expect(manifest.packageFile).toBe('package_manifest.json');
    expect(manifest.externalPostEnabled).toBe(false);
    expect(manifest.activePayload.title).toBe('Nota lista');
    expect(manifest.channels).toHaveLength(2);
    expect(manifest.controls.find((control) => control.id === 'manual_publish')?.enabled).toBe(true);
    expect(manifest.controls.find((control) => control.id === 'external_post')?.enabled).toBe(false);
  });

  it('blocks publication controls when preflight has blockers', () => {
    const manifest = buildEditarraPublicationManifest({
      packageId: 'package-test',
      ready: false,
      blockers: 2,
      warnings: 1,
      postingMode: 'manual',
      endpoint: 'https://www.ultimamilla.com.ar/api/blog',
      publicationPayload,
      distributionManifest,
    });

    expect(manifest.status).toBe('bloqueado');
    expect(manifest.nextAction).toContain('2 bloqueos');
    expect(manifest.controls.find((control) => control.id === 'prepare_payload')?.enabled).toBe(false);
    expect(manifest.controls.find((control) => control.id === 'generate_distribution')?.enabled).toBe(false);
  });

  it('keeps review mode available for package export but not manual publishing', () => {
    const manifest = buildEditarraPublicationManifest({
      packageId: 'package-test',
      ready: false,
      blockers: 0,
      warnings: 3,
      postingMode: 'asistido',
      endpoint: 'https://www.ultimamilla.com.ar/api/blog',
      publicationPayload,
      distributionManifest,
    });

    expect(manifest.status).toBe('revision');
    expect(manifest.controls.find((control) => control.id === 'prepare_payload')?.enabled).toBe(true);
    expect(manifest.controls.find((control) => control.id === 'manual_publish')?.enabled).toBe(false);
    expect(manifest.controls.find((control) => control.id === 'external_post')?.reason).toContain('Deshabilitado');
  });

  it('builds publication targets for CMS previews without external POST', () => {
    const targets = buildPublicationTargets({
      packageId: 'package-test',
      slug: 'nota-lista',
      ready: true,
      blockers: 0,
      publicationPayload: {
        ...publicationPayload,
        resumen: 'Resumen listo',
        contenido: 'Cuerpo listo',
        meta_title: 'Meta lista',
        meta_description: 'Meta description lista',
      },
      destinations: defaultPublicationDestinations,
    });

    expect(targets).toHaveLength(2);
    expect(targets[0].destinationId).toBe('umsa-blog');
    expect(targets[0].status).toBe('preview_listo');
    expect(targets[0].missingFields).not.toContain('imagen_portada');
    expect(targets[0].externalPostEnabled).toBe(false);
    expect(targets[0].previewUrlLocal).toContain('/editarra/preview/umsa-blog/nota-lista');
    expect(targets[0].payload.destination).toEqual(expect.objectContaining({
      external_post_enabled: false,
      cms_type: 'umsa_blog',
    }));
    expect(targets[1].destinationId).toBe('licitometro-json');
    expect(targets[1].status).toBe('preview_listo');
    expect(targets[1].externalPostEnabled).toBe(false);
    expect(targets[1].previewUrlLocal).toContain('/editarra/preview/licitometro-json/nota-lista');
    expect(targets[1].payload.destination).toEqual(expect.objectContaining({
      external_post_enabled: false,
      cms_type: 'headless_json',
      posting_mode: 'manual',
    }));
  });

  it('keeps CMS preview available while preflight is still pending', () => {
    const targets = buildPublicationTargets({
      packageId: 'package-test',
      slug: 'nota-en-revision',
      ready: false,
      blockers: 2,
      publicationPayload: {
        ...publicationPayload,
        resumen: 'Resumen listo para revisar.',
        contenido: 'Cuerpo listo para preview.',
        meta_title: 'Meta lista',
        meta_description: 'Meta description lista',
      },
      destinations: defaultPublicationDestinations,
    });

    expect(targets[0].status).toBe('preview_listo');
    expect(targets[0].externalPostEnabled).toBe(false);
  });

  it('blocks CMS targets when required payload fields are missing', () => {
    const targets = buildPublicationTargets({
      packageId: 'package-test',
      slug: 'nota-incompleta',
      ready: true,
      blockers: 0,
      publicationPayload: { titulo: 'Incompleta' },
      destinations: defaultPublicationDestinations,
    });

    expect(targets[0].status).toBe('bloqueado');
    expect(targets[0].missingFields).toContain('contenido');
    expect(targets[0].externalPostEnabled).toBe(false);
  });
});
