import {
  applyAnalyticsLearning,
  createDefaultAnalyticsRecord,
  createDefaultSeoExperiment,
  sanitizeSeoExperiment,
} from './productionReducer';
import type { AnalyticsRecord, SeoExperiment } from './productionReducer';
import type { Author, Topic } from './workspaceModel';

export type EditarraAuditDescriptor = {
  event: string;
  detail: string;
};

export const buildSeoExperimentCreation = ({
  id,
  topic,
  selectedExperimentCount,
}: {
  id: string;
  topic: Topic;
  selectedExperimentCount: number;
}) => ({
  experiment: createDefaultSeoExperiment({
    id,
    topic,
    selected: selectedExperimentCount === 0,
  }),
  audit: {
    event: 'Variante SEO creada',
    detail: `Nueva variante para "${topic.title}".`,
  } satisfies EditarraAuditDescriptor,
});

export const buildSeoExperimentSelection = ({
  experimentId,
  experiments,
  topic,
}: {
  experimentId: string;
  experiments: SeoExperiment[];
  topic: Topic;
}) => {
  const experiment = experiments.find((item) => item.id === experimentId);

  if (!experiment) {
    return {
      experiment: undefined,
      draftPatch: undefined,
      topicPatch: undefined,
      audit: undefined,
    };
  }

  const safeExperiment = sanitizeSeoExperiment(experiment);

  return {
    experiment: safeExperiment,
    draftPatch: {
      seoTitle: safeExperiment.title,
    },
    topicPatch: {
      seo: `Keyword principal: ${safeExperiment.focusKeyword}. ${safeExperiment.description}`,
    },
    audit: {
      event: 'Variante SEO seleccionada',
      detail: `"${safeExperiment.title}" aplicada a "${topic.title}".`,
    } satisfies EditarraAuditDescriptor,
  };
};

export const buildSeoExperimentRemoval = ({
  experimentId,
  experiments,
}: {
  experimentId: string;
  experiments: SeoExperiment[];
}) => {
  const removedExperiment = experiments.find((item) => item.id === experimentId);

  return {
    audit: {
      event: 'Variante SEO eliminada',
      detail: `${removedExperiment?.title || experimentId} removida.`,
    } satisfies EditarraAuditDescriptor,
  };
};

export const buildAnalyticsRecordCreation = ({
  id,
  topic,
  authorScore,
}: {
  id: string;
  topic: Topic;
  authorScore: number;
}) => ({
  record: createDefaultAnalyticsRecord({
    id,
    topicId: topic.id,
    authorScore,
  }),
  audit: {
    event: 'Metricas creadas',
    detail: `Nuevo registro de rendimiento para "${topic.title}".`,
  } satisfies EditarraAuditDescriptor,
});

export const buildAnalyticsRecordRemoval = ({
  recordId,
  records,
}: {
  recordId: string;
  records: AnalyticsRecord[];
}) => {
  const removedRecord = records.find((record) => record.id === recordId);

  return {
    audit: {
      event: 'Metricas eliminadas',
      detail: `${removedRecord?.period || recordId} removido.`,
    } satisfies EditarraAuditDescriptor,
  };
};

export const buildAnalyticsFeedbackApplication = ({
  recordId,
  records,
  selectedAuthor,
  selectedTopic,
}: {
  recordId: string;
  records: AnalyticsRecord[];
  selectedAuthor: Author;
  selectedTopic: Topic;
}) => {
  const record = records.find((item) => item.id === recordId);

  if (!record) {
    return undefined;
  }

  const { nextAuthorScore, nextTopicPriority } = applyAnalyticsLearning({
    authorScore: selectedAuthor.score,
    topicPriority: selectedTopic.priority,
    performanceScore: record.performanceScore,
  });

  return {
    record,
    authorName: selectedAuthor.name,
    authorPatch: {
      score: nextAuthorScore,
    },
    topicPatch: {
      priority: nextTopicPriority,
    },
    audit: {
      event: 'Aprendizaje aplicado',
      detail: `${record.period}: score ${record.performanceScore}/100 ajusto autor y prioridad de "${selectedTopic.title}".`,
    } satisfies EditarraAuditDescriptor,
  };
};
