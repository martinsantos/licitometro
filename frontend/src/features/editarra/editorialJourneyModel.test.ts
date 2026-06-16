import { buildEditarraJourneyState } from './editorialJourneyModel';

const baseInput = {
  candidateCount: 0,
  selectedTopicStatus: 'idea',
  selectedTopicTitle: 'Tema editorial',
  selectedTopicCandidateId: '',
  sourceSeedCount: 22,
  sourcesValidated: 0,
  sourcesRequired: 4,
  draftStatus: 'borrador',
  draftReady: false,
  qualityStatus: 'requiere_revision',
  preflightBlockers: 0,
  preflightWarnings: 0,
  imageStatus: 'pendiente' as const,
  imageExpectedFilename: 'tema-editorial-principal',
  publicationStatus: 'bloqueado' as const,
  publicationNextAction: 'Resolver preflight antes de publicar.',
  publicationTargetCount: 1,
  publicExportReady: false,
};

describe('editorialJourneyModel', () => {
  it('starts with Radar as the only active macro step when there are no candidates', () => {
    const journey = buildEditarraJourneyState(baseInput);

    expect(journey.stages.map((stage) => stage.id)).toEqual([
      'radar',
      'candidatos',
      'nota',
      'imagenes',
      'publicacion',
    ]);
    expect(journey.currentStageId).toBe('radar');
    expect(journey.nextControl).toBe('Buscar temas');
    expect(journey.stages.find((stage) => stage.id === 'radar')).toMatchObject({
      status: 'activo',
      target: 'agenda:radar',
    });
    expect(journey.stages.find((stage) => stage.id === 'candidatos')?.status).toBe('pendiente');
    expect(journey.blockers).toContain('Radar sin candidatos utiles');
  });

  it('moves from Radar to candidate review when discovered candidates are not converted', () => {
    const journey = buildEditarraJourneyState({
      ...baseInput,
      candidateCount: 8,
      selectedTopicStatus: 'idea',
    });

    expect(journey.currentStageId).toBe('candidatos');
    expect(journey.nextControl).toBe('Revisar candidatos');
    expect(journey.stages.find((stage) => stage.id === 'radar')).toMatchObject({
      status: 'listo',
      detail: '8 candidatos detectados desde 22 semillas.',
    });
    expect(journey.stages.find((stage) => stage.id === 'candidatos')).toMatchObject({
      status: 'activo',
      actionLabel: 'Revisar candidatos',
      target: 'agenda:candidatos',
    });
  });

  it('collapses source, draft and audit work into a single Nota step', () => {
    const journey = buildEditarraJourneyState({
      ...baseInput,
      candidateCount: 8,
      selectedTopicStatus: 'redaccion',
      selectedTopicCandidateId: 'candidate-a',
      sourcesValidated: 2,
      sourcesRequired: 4,
      draftReady: false,
    });

    expect(journey.currentStageId).toBe('nota');
    expect(journey.nextControl).toBe('Validar fuentes');
    expect(journey.stages.find((stage) => stage.id === 'candidatos')?.status).toBe('listo');
    expect(journey.stages.find((stage) => stage.id === 'nota')).toMatchObject({
      status: 'activo',
      metric: '2/4 fuentes',
      target: 'auditoria',
    });
    expect(journey.blockers).toContain('2/4 fuentes validadas');
  });

  it('blocks the Nota step when preflight has unresolved blockers', () => {
    const journey = buildEditarraJourneyState({
      ...baseInput,
      candidateCount: 8,
      selectedTopicStatus: 'redaccion',
      selectedTopicCandidateId: 'candidate-a',
      sourcesValidated: 4,
      sourcesRequired: 4,
      draftReady: true,
      qualityStatus: 'requiere_revision',
      preflightBlockers: 2,
      preflightWarnings: 1,
    });

    expect(journey.status).toBe('bloqueado');
    expect(journey.currentStageId).toBe('nota');
    expect(journey.nextControl).toBe('Resolver auditoria');
    expect(journey.stages.find((stage) => stage.id === 'nota')).toMatchObject({
      status: 'bloqueado',
      actionLabel: 'Abrir auditoria',
    });
  });

  it('requires image prompt/manifest before publication can become active', () => {
    const journey = buildEditarraJourneyState({
      ...baseInput,
      candidateCount: 8,
      selectedTopicStatus: 'aprobado',
      selectedTopicCandidateId: 'candidate-a',
      sourcesValidated: 4,
      sourcesRequired: 4,
      draftReady: true,
      draftStatus: 'aprobado',
      imageStatus: 'pendiente',
      publicationStatus: 'revision',
    });

    expect(journey.currentStageId).toBe('imagenes');
    expect(journey.stages.find((stage) => stage.id === 'nota')?.status).toBe('listo');
    expect(journey.stages.find((stage) => stage.id === 'imagenes')).toMatchObject({
      status: 'activo',
      target: 'imagenes',
    });
    expect(journey.stages.find((stage) => stage.id === 'publicacion')?.status).toBe('pendiente');
  });

  it('marks the full journey ready when preview and manual export are ready', () => {
    const journey = buildEditarraJourneyState({
      ...baseInput,
      candidateCount: 8,
      selectedTopicStatus: 'publicado',
      selectedTopicCandidateId: 'candidate-a',
      sourcesValidated: 4,
      sourcesRequired: 4,
      draftReady: true,
      draftStatus: 'publicado',
      imageStatus: 'prompt_listo',
      publicationStatus: 'listo_para_publicar',
      publicationNextAction: 'Copiar payload manual.',
      publicationTargetCount: 2,
      publicExportReady: true,
    });

    expect(journey.status).toBe('listo');
    expect(journey.progress).toBe(100);
    expect(journey.nextControl).toBe('Lista para sacar');
    expect(journey.stages.every((stage) => stage.status === 'listo')).toBe(true);
    expect(journey.stages.find((stage) => stage.id === 'publicacion')).toMatchObject({
      detail: 'Preview y payload listos para 2 CMS.',
      target: 'publicacion',
    });
  });
});
