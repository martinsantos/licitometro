import {
  buildAnalyticsFeedbackApplication,
  buildAnalyticsRecordCreation,
  buildAnalyticsRecordRemoval,
  buildSeoExperimentCreation,
  buildSeoExperimentRemoval,
  buildSeoExperimentSelection,
} from './seoAnalyticsModel';
import { authorSeed, topicSeed } from './persistenceModel';
import type { AnalyticsRecord, SeoExperiment } from './productionReducer';
import type { Author, Topic } from './workspaceModel';

const topic: Topic = {
  ...topicSeed[0],
  id: 'topic-a',
  title: 'Tema SEO operativo',
  priority: 70,
  seo: 'Keyword principal: MinIO PostgreSQL. Nota técnica.',
};

const author: Author = {
  ...authorSeed[0],
  id: 'author-a',
  name: 'Editor UMSA Diaria',
  score: 80,
};

const seoExperiment: SeoExperiment = {
  id: 'seo-a',
  topicId: topic.id,
  title: 'SEO A',
  description: 'Descripción de prueba',
  focusKeyword: 'minio postgres',
  strategy: 'Busqueda',
  ctr: 2,
  impressions: 100,
  selected: false,
  notes: 'Notas',
};

const analyticsRecord: AnalyticsRecord = {
  id: 'analytics-a',
  topicId: topic.id,
  period: '7 días',
  trafficSource: 'organico',
  visits: 100,
  averageReadSeconds: 80,
  ctaClicks: 3,
  shares: 1,
  comments: 0,
  conversionRate: 1,
  successCriteria: 'Lectura',
  performanceScore: 90,
  learningNote: 'Subir prioridad',
};

describe('seoAnalyticsModel', () => {
  it('creates SEO experiments with selected state based on current topic variants', () => {
    const first = buildSeoExperimentCreation({
      id: 'seo-new',
      topic,
      selectedExperimentCount: 0,
    });
    const later = buildSeoExperimentCreation({
      id: 'seo-later',
      topic,
      selectedExperimentCount: 2,
    });

    expect(first.experiment).toMatchObject({
      id: 'seo-new',
      topicId: topic.id,
      selected: true,
      focusKeyword: 'MinIO PostgreSQL',
    });
    expect(later.experiment.selected).toBe(false);
    expect(first.audit).toMatchObject({
      event: 'Variante SEO creada',
      detail: `Nueva variante para "${topic.title}".`,
    });
  });

  it('builds draft and topic patches when selecting an existing SEO experiment', () => {
    const selection = buildSeoExperimentSelection({
      experimentId: seoExperiment.id,
      experiments: [seoExperiment],
      topic,
    });

    expect(selection.draftPatch).toEqual({ seoTitle: 'SEO A' });
    expect(selection.topicPatch).toEqual({
      seo: 'Keyword principal: minio postgres. Descripción de prueba',
    });
    expect(selection.audit?.detail).toBe('"SEO A" aplicada a "Tema SEO operativo".');
  });

  it('sanitizes legacy SEO instructions before applying a variant', () => {
    const selection = buildSeoExperimentSelection({
      experimentId: 'seo-unsafe',
      experiments: [{
        ...seoExperiment,
        id: 'seo-unsafe',
        description: 'Descripcion SEO honesta, con promesa explicita y sin curiosity gap.',
        notes: 'Define hipotesis, canal y criterio de exito antes de publicar.',
      }],
      topic,
    });

    expect(selection.topicPatch?.seo).not.toMatch(/curiosity gap|promesa explicita|define hipotesis/i);
    expect(selection.experiment?.notes).toBe('Variante sin metricas historicas.');
  });

  it('does not build edit patches for missing SEO experiments', () => {
    const selection = buildSeoExperimentSelection({
      experimentId: 'missing',
      experiments: [seoExperiment],
      topic,
    });

    expect(selection.experiment).toBeUndefined();
    expect(selection.draftPatch).toBeUndefined();
    expect(selection.topicPatch).toBeUndefined();
    expect(selection.audit).toBeUndefined();
  });

  it('builds removal and analytics creation audit descriptors', () => {
    expect(buildSeoExperimentRemoval({
      experimentId: seoExperiment.id,
      experiments: [seoExperiment],
    }).audit).toEqual({
      event: 'Variante SEO eliminada',
      detail: 'SEO A removida.',
    });

    const creation = buildAnalyticsRecordCreation({
      id: 'analytics-new',
      topic,
      authorScore: 35,
    });

    expect(creation.record).toMatchObject({
      id: 'analytics-new',
      topicId: topic.id,
      performanceScore: 40,
    });
    expect(creation.audit.detail).toBe(`Nuevo registro de rendimiento para "${topic.title}".`);

    expect(buildAnalyticsRecordRemoval({
      recordId: 'missing-record',
      records: [analyticsRecord],
    }).audit.detail).toBe('missing-record removido.');
  });

  it('builds analytics feedback patches for author score and topic priority', () => {
    const feedback = buildAnalyticsFeedbackApplication({
      recordId: analyticsRecord.id,
      records: [analyticsRecord],
      selectedAuthor: author,
      selectedTopic: topic,
    });

    expect(feedback).toMatchObject({
      authorName: author.name,
      authorPatch: { score: 84 },
      topicPatch: { priority: 76 },
      audit: {
        event: 'Aprendizaje aplicado',
        detail: '7 días: score 90/100 ajusto autor y prioridad de "Tema SEO operativo".',
      },
    });
  });

  it('returns undefined when feedback record does not exist', () => {
    expect(buildAnalyticsFeedbackApplication({
      recordId: 'missing',
      records: [analyticsRecord],
      selectedAuthor: author,
      selectedTopic: topic,
    })).toBeUndefined();
  });
});
