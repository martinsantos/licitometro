import {
  applyAnalyticsLearning,
  createDefaultAnalyticsRecord,
  createDefaultSeoExperiment,
  createDraftVersionSnapshot,
  nextDraftVersionNumber,
  reduceEditarraProductionState,
} from './productionReducer';
import type { EditarraProductionState, EditorialDraft, EvidenceRecord, SeoExperiment } from './productionReducer';
import type { Topic } from './workspaceModel';

const draft: EditorialDraft = {
  id: 'draft-a',
  topicId: 'topic-a',
  variant: 'humanizado',
  status: 'borrador',
  title: 'Borrador A',
  seoTitle: 'SEO A',
  body: 'Cuerpo',
  notes: 'Notas',
  updatedAt: '10:00',
};

const topic: Topic = {
  id: 'topic-a',
  title: 'Tema A',
  status: 'redaccion',
  priority: 80,
  depth: 'Media',
  tokens: 9000,
  author: 'Editor',
  source: 'Fuente',
  narrative: 'Narrativa',
  seo: 'Keyword principal: MinIO PostgreSQL. Nota tecnica.',
  publishAt: '12:00',
};

const seoA: SeoExperiment = {
  id: 'seo-a',
  topicId: 'topic-a',
  title: 'SEO A',
  description: 'Descripcion A',
  focusKeyword: 'keyword-a',
  strategy: 'Busqueda',
  ctr: 1.2,
  impressions: 100,
  selected: true,
  notes: 'Notas',
};

const seoB: SeoExperiment = {
  ...seoA,
  id: 'seo-b',
  title: 'SEO B',
  selected: false,
};

const evidenceA: EvidenceRecord = {
  id: 'evidence-a',
  topicId: 'topic-a',
  sourceName: 'Fuente A',
  sourceUrl: 'https://example.com/a',
  claim: 'Claim A',
  status: 'pendiente',
  confidence: 40,
  notes: 'Pendiente',
};

const makeState = (): EditarraProductionState => ({
  drafts: [draft, { ...draft, id: 'draft-b', topicId: 'topic-b' }],
  draftVersions: [
    createDraftVersionSnapshot({
      id: 'version-a-1',
      draft,
      version: 1,
      changeNote: 'Inicial',
      snapshotAt: '10:10',
      authorName: 'Editor',
    }),
  ],
  seoExperiments: [seoA, seoB, { ...seoA, id: 'seo-c', topicId: 'topic-b' }],
  analyticsRecords: [{
    id: 'analytics-a',
    topicId: 'topic-a',
    period: '7 dias',
    trafficSource: 'organico',
    visits: 100,
    averageReadSeconds: 60,
    ctaClicks: 2,
    shares: 1,
    comments: 0,
    conversionRate: 1,
    successCriteria: 'Lectura',
    performanceScore: 70,
    learningNote: 'Aprender',
  }],
  evidence: [evidenceA, { ...evidenceA, id: 'evidence-b', topicId: 'topic-b' }],
  guidedRunRecords: [{
    id: 'run-a',
    topicId: 'topic-a',
    recipeId: 'reactiva',
    profileId: 'umsa-diaria',
    status: 'pausado',
    steps: ['agenda'],
    nextControl: 'Fuentes',
    summary: 'Corrida',
    time: '10:20',
  }],
  distributionActions: {
    'topic-a:cms:umsa-blog': 'enviado',
    'topic-a:cms:licitometro-json': 'copiado',
    'topic-b:cms:umsa-blog': 'pendiente',
    'newsletter-topic-a': 'copiado',
  },
});

describe('productionReducer', () => {
  it('creates operational defaults for SEO, analytics and draft versions', () => {
    expect(createDefaultSeoExperiment({ id: 'seo-new', topic, selected: true })).toMatchObject({
      id: 'seo-new',
      topicId: 'topic-a',
      description: 'Nota tecnica',
      focusKeyword: 'MinIO PostgreSQL',
      selected: true,
      notes: 'Variante nueva sin metricas historicas.',
    });
    expect(createDefaultSeoExperiment({ id: 'seo-new', topic, selected: true }).description).not.toMatch(/curiosity gap|promesa explicita/i);
    expect(createDefaultAnalyticsRecord({ id: 'analytics-new', topicId: 'topic-a', authorScore: 35 })).toMatchObject({
      id: 'analytics-new',
      topicId: 'topic-a',
      performanceScore: 40,
    });
    expect(nextDraftVersionNumber(makeState().draftVersions, 'topic-a')).toBe(2);
  });

  it('sanitizes SEO instructions when creating or updating visible SEO variants', () => {
    const unsafeTopic = {
      ...topic,
      seo: 'Keyword principal: problema administrativo que revela falla tecnica. Descripcion SEO honesta, con promesa explicita y sin curiosity gap.',
    };
    const created = createDefaultSeoExperiment({ id: 'seo-unsafe', topic: unsafeTopic, selected: true });

    expect(`${created.description} ${created.notes}`).not.toMatch(/curiosity gap|promesa explicita|define hipotesis/i);

    const updated = reduceEditarraProductionState(makeState(), {
      type: 'seo/update',
      experimentId: 'seo-a',
      patch: {
        description: 'Descripcion SEO honesta, con promesa explicita y sin curiosity gap.',
        notes: 'Define hipotesis, canal y criterio de exito antes de publicar.',
      },
    });
    const experiment = updated.seoExperiments.find((item) => item.id === 'seo-a');

    expect(experiment?.description).not.toMatch(/curiosity gap|promesa explicita/i);
    expect(experiment?.notes).toBe('Variante sin metricas historicas.');
  });

  it('upserts drafts and stores capped draft version snapshots', () => {
    const updatedDraft = { ...draft, title: 'Borrador editado' };
    const withDraft = reduceEditarraProductionState(makeState(), { type: 'draft/upsert', draft: updatedDraft });
    const withVersion = reduceEditarraProductionState(withDraft, {
      type: 'draft-version/add',
      version: createDraftVersionSnapshot({
        id: 'version-a-2',
        draft: updatedDraft,
        version: 2,
        changeNote: 'Editado',
        snapshotAt: '10:30',
        authorName: 'Editor',
        status: 'aprobado',
      }),
    });

    expect(withDraft.drafts.find((item) => item.id === 'draft-a')?.title).toBe('Borrador editado');
    expect(withVersion.draftVersions[0]).toMatchObject({
      id: 'version-a-2',
      status: 'aprobado',
      title: 'Borrador editado',
    });
  });

  it('selects one SEO experiment per topic and leaves other topics untouched', () => {
    const selected = reduceEditarraProductionState(makeState(), {
      type: 'seo/select',
      topicId: 'topic-a',
      experimentId: 'seo-b',
    });

    expect(selected.seoExperiments.filter((item) => item.topicId === 'topic-a' && item.selected).map((item) => item.id)).toEqual(['seo-b']);
    expect(selected.seoExperiments.find((item) => item.id === 'seo-c')?.selected).toBe(true);
  });

  it('updates evidence in batch, validates minimum confidence and records distribution state', () => {
    const bulkUpdated = reduceEditarraProductionState(makeState(), {
      type: 'evidence/bulk-update',
      updates: [{ evidenceId: 'evidence-a', patch: { sourceUrl: 'https://deep.example', notes: 'Validada por lote' } }],
    });
    const validated = reduceEditarraProductionState(bulkUpdated, {
      type: 'evidence/validate',
      evidenceId: 'evidence-a',
      minConfidence: 75,
    });
    const distributed = reduceEditarraProductionState(validated, {
      type: 'distribution/mark',
      deliverableId: 'newsletter-topic-a',
      status: 'copiado',
    });

    expect(distributed.evidence.find((item) => item.id === 'evidence-a')).toMatchObject({
      sourceUrl: 'https://deep.example',
      status: 'validado',
      confidence: 75,
    });
    expect(distributed.distributionActions['newsletter-topic-a']).toBe('copiado');
  });

  it('cascades topic removal across production artifacts', () => {
    const removed = reduceEditarraProductionState(makeState(), { type: 'topic/remove', topicId: 'topic-a' });

    expect(removed.drafts.map((item) => item.topicId)).toEqual(['topic-b']);
    expect(removed.draftVersions).toHaveLength(0);
    expect(removed.seoExperiments.map((item) => item.topicId)).toEqual(['topic-b']);
    expect(removed.analyticsRecords).toHaveLength(0);
    expect(removed.evidence.map((item) => item.topicId)).toEqual(['topic-b']);
    expect(removed.guidedRunRecords).toHaveLength(0);
    expect(removed.distributionActions).toEqual({
      'topic-b:cms:umsa-blog': 'pendiente',
      'newsletter-topic-a': 'copiado',
    });
  });

  it('records guided runs with stable uniqueness and applies analytics learning', () => {
    const state = makeState();
    const duplicatedRun = state.guidedRunRecords[0];
    const recorded = reduceEditarraProductionState(state, { type: 'guided-run/record', run: duplicatedRun });
    const learning = applyAnalyticsLearning({ authorScore: 80, topicPriority: 70, performanceScore: 90 });

    expect(recorded.guidedRunRecords[0].id).toBe('run-a-1');
    expect(learning).toEqual({ nextAuthorScore: 84, nextTopicPriority: 76 });
  });
});
