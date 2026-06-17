import { buildPublicationSentOutcome, resolvePublicationDestinationView } from './publicationFlowModel';
import { buildPublicationTargets, defaultPublicationDestinations } from './publicationAdapter';

describe('publicationFlowModel', () => {
  const readyTargets = buildPublicationTargets({
    packageId: 'pkg-a',
    slug: 'tema-a',
    ready: true,
    blockers: 0,
    publicationPayload: {
      titulo: 'Tema A',
      resumen: 'Resumen A',
      contenido: 'Contenido A',
      categoria: 'tecnico',
      slug: 'tema-a',
      meta_title: 'Tema A',
      meta_description: 'Resumen A',
    },
    destinations: defaultPublicationDestinations,
  });

  it('resolves a valid destination only when its CMS target is ready', () => {
    expect(resolvePublicationDestinationView({
      selectedDestinationId: 'umsa-blog',
      destinations: defaultPublicationDestinations,
      publicationTargets: readyTargets,
      publicationStatus: 'listo_para_publicar',
    })).toMatchObject({
      selectValue: 'umsa-blog',
      canMarkSent: true,
      disabledReason: '',
      selectedDestination: { id: 'umsa-blog' },
      selectedTarget: { destinationId: 'umsa-blog', status: 'preview_listo' },
    });
  });

  it('does not fall back to another CMS when the selected destination id is invalid', () => {
    expect(resolvePublicationDestinationView({
      selectedDestinationId: 'destino-borrado',
      destinations: defaultPublicationDestinations,
      publicationTargets: readyTargets,
      publicationStatus: 'listo_para_publicar',
    })).toEqual({
      selectedDestination: undefined,
      selectedTarget: undefined,
      selectValue: '',
      canMarkSent: false,
      disabledReason: 'Selecciona un destino CMS habilitado antes de cerrar la publicacion manual.',
    });
  });

  it('blocks closeout when the destination exists but its target was not generated', () => {
    expect(resolvePublicationDestinationView({
      selectedDestinationId: 'licitometro-json',
      destinations: defaultPublicationDestinations,
      publicationTargets: readyTargets.filter((target) => target.destinationId !== 'licitometro-json'),
      publicationStatus: 'listo_para_publicar',
    })).toMatchObject({
      selectValue: 'licitometro-json',
      canMarkSent: false,
      disabledReason: 'El destino CMS seleccionado no tiene preview/payload generado.',
      selectedDestination: { id: 'licitometro-json' },
      selectedTarget: undefined,
    });
  });

  it('builds the full local publication closeout without external POST', () => {
    expect(buildPublicationSentOutcome({
      topicId: 'topic-a',
      topicTitle: 'Tema A',
      selectedDestinationId: 'umsa-blog',
      destinations: defaultPublicationDestinations,
      publicationStatus: 'listo_para_publicar',
      targetStatus: 'preview_listo',
    })).toEqual({
      status: 'marked-sent',
      topicId: 'topic-a',
      topicStatus: 'publicado',
      draftStatus: 'publicado',
      deliverableId: 'topic-a:cms:umsa-blog',
      distributionActionStatus: 'enviado',
      activeTab: 'publicacion',
      packageFileKey: 'public_export_bundle.json',
      packageStatus: 'public_export_bundle.json listo con payload, preview y manifiesto visual.',
      guidedFlowStatus: 'Publicacion local cerrada para Tema A. Exportar paquete o copiar payload.',
      distributionStatus: 'UMSA Blog para "Tema A" marcado como enviado/manual dentro de EDITARRA.',
      audit: {
        event: 'Publicacion manual marcada',
        detail: 'Tema A quedo marcado como enviado/manual para UMSA Blog; POST externo desactivado.',
      },
    });
  });

  it('blocks closeout when the selected destination is unavailable', () => {
    expect(buildPublicationSentOutcome({
      topicId: 'topic-a',
      topicTitle: 'Tema A',
      selectedDestinationId: 'missing-destination',
      destinations: defaultPublicationDestinations,
      publicationStatus: 'listo_para_publicar',
      targetStatus: 'preview_listo',
    })).toEqual({
      status: 'missing-destination',
      packageStatus: 'Destino CMS "missing-destination" no disponible para marcar publicacion.',
      distributionStatus: 'Selecciona un destino CMS habilitado antes de cerrar la publicacion manual.',
    });
  });

  it('returns an explicit blocked outcome when no destination exists', () => {
    expect(buildPublicationSentOutcome({
      topicId: 'topic-a',
      topicTitle: 'Tema A',
      selectedDestinationId: 'umsa-blog',
      destinations: [],
      publicationStatus: 'listo_para_publicar',
      targetStatus: 'preview_listo',
    })).toEqual({
      status: 'missing-destination',
      packageStatus: 'No hay destino CMS configurado para marcar publicacion.',
      distributionStatus: 'Configura un destino CMS antes de cerrar la publicacion manual.',
    });
  });

  it('blocks marking sent while publication preflight is not ready', () => {
    expect(buildPublicationSentOutcome({
      topicId: 'topic-a',
      topicTitle: 'Tema A',
      selectedDestinationId: 'umsa-blog',
      destinations: defaultPublicationDestinations,
      publicationStatus: 'bloqueado',
      targetStatus: 'preview_listo',
    })).toEqual({
      status: 'blocked-preflight',
      packageStatus: 'Publicacion bloqueada por preflight; falta resolver payload, preview, fuentes o imagen.',
      distributionStatus: 'UMSA Blog no puede marcarse enviado/manual hasta que el preflight quede listo.',
    });
  });

  it('blocks marking sent while the selected CMS target has no preview', () => {
    expect(buildPublicationSentOutcome({
      topicId: 'topic-a',
      topicTitle: 'Tema A',
      selectedDestinationId: 'umsa-blog',
      destinations: defaultPublicationDestinations,
      publicationStatus: 'listo_para_publicar',
      targetStatus: 'bloqueado',
    })).toMatchObject({
      status: 'blocked-preflight',
      distributionStatus: 'UMSA Blog no puede marcarse enviado/manual hasta que el preflight quede listo.',
    });
  });
});
