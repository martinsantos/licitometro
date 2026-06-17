import type { GuidedRunRecord } from './guidedEngine';
import type { DraftVariantKey } from './operations';
import {
  hasBlockingQualityIssues,
  scanEditarraText,
} from './qualityGate';
import type { Topic } from './workspaceModel';

export type DraftStatus = 'borrador' | 'listo' | 'aprobado' | 'publicado';
export type DistributionActionStatus = 'pendiente' | 'copiado' | 'enviado';
export type DistributionActions = Record<string, DistributionActionStatus>;
export type EvidenceStatus = 'pendiente' | 'validado' | 'riesgo';
export type SeoStrategy = 'Discover' | 'Busqueda' | 'Newsletter' | 'Mixto';
export type TrafficSource = 'organico' | 'discover' | 'newsletter' | 'social' | 'directo';

export type EditorialDraft = {
  id: string;
  topicId: string;
  variant: DraftVariantKey;
  status: DraftStatus;
  title: string;
  seoTitle: string;
  body: string;
  notes: string;
  updatedAt: string;
};

export type DraftVersion = {
  id: string;
  topicId: string;
  draftId: string;
  version: number;
  variant: DraftVariantKey;
  status: DraftStatus;
  title: string;
  seoTitle: string;
  body: string;
  notes: string;
  changeNote: string;
  snapshotAt: string;
  authorName: string;
};

export type SeoExperiment = {
  id: string;
  topicId: string;
  title: string;
  description: string;
  focusKeyword: string;
  strategy: SeoStrategy;
  ctr: number;
  impressions: number;
  selected: boolean;
  notes: string;
};

export type EvidenceRecord = {
  id: string;
  topicId: string;
  sourceName: string;
  sourceUrl: string;
  claim: string;
  status: EvidenceStatus;
  confidence: number;
  notes: string;
};

export type AnalyticsRecord = {
  id: string;
  topicId: string;
  period: string;
  trafficSource: TrafficSource;
  visits: number;
  averageReadSeconds: number;
  ctaClicks: number;
  shares: number;
  comments: number;
  conversionRate: number;
  successCriteria: string;
  performanceScore: number;
  learningNote: string;
};

export type EditarraProductionState = {
  drafts: EditorialDraft[];
  draftVersions: DraftVersion[];
  seoExperiments: SeoExperiment[];
  analyticsRecords: AnalyticsRecord[];
  evidence: EvidenceRecord[];
  guidedRunRecords: GuidedRunRecord[];
  distributionActions: DistributionActions;
};

export type EditarraProductionAction =
  | { type: 'state/patch'; patch: Partial<EditarraProductionState> }
  | { type: 'topic/remove'; topicId: string }
  | { type: 'draft/upsert'; draft: EditorialDraft }
  | { type: 'draft-version/add'; version: DraftVersion; limit?: number }
  | { type: 'draft-version/remove'; versionId: string }
  | { type: 'seo/update'; experimentId: string; patch: Partial<SeoExperiment> }
  | { type: 'seo/add'; experiment: SeoExperiment }
  | { type: 'seo/select'; topicId: string; experimentId: string }
  | { type: 'seo/remove'; experimentId: string }
  | { type: 'analytics/update'; recordId: string; patch: Partial<AnalyticsRecord> }
  | { type: 'analytics/add'; record: AnalyticsRecord }
  | { type: 'analytics/remove'; recordId: string }
  | { type: 'evidence/update'; evidenceId: string; patch: Partial<EvidenceRecord> }
  | { type: 'evidence/add'; evidence: EvidenceRecord }
  | { type: 'evidence/add-many'; evidence: EvidenceRecord[] }
  | { type: 'evidence/bulk-update'; updates: Array<{ evidenceId: string; patch: Partial<EvidenceRecord> }> }
  | { type: 'evidence/validate'; evidenceId: string; minConfidence?: number }
  | { type: 'evidence/remove'; evidenceId: string }
  | { type: 'guided-run/record'; run: GuidedRunRecord; limit?: number }
  | { type: 'distribution/mark'; deliverableId: string; status: DistributionActionStatus };

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, Math.round(value)));

const upsertDraft = (drafts: EditorialDraft[], draft: EditorialDraft) => (
  drafts.some((item) => item.id === draft.id)
    ? drafts.map((item) => (item.id === draft.id ? draft : item))
    : [...drafts, draft]
);

const removeDistributionActionsForTopic = (
  distributionActions: DistributionActions,
  topicId: string,
): DistributionActions => (
  Object.fromEntries(
    Object.entries(distributionActions)
      .filter(([deliverableId]) => !deliverableId.startsWith(`${topicId}:`)),
  )
);

export const nextDraftVersionNumber = (versions: DraftVersion[], topicId: string) => (
  Math.max(0, ...versions.filter((version) => version.topicId === topicId).map((version) => version.version)) + 1
);

export const createDraftVersionSnapshot = ({
  id,
  draft,
  version,
  changeNote,
  snapshotAt,
  authorName,
  status = draft.status,
}: {
  id: string;
  draft: EditorialDraft;
  version: number;
  changeNote: string;
  snapshotAt: string;
  authorName: string;
  status?: DraftStatus;
}): DraftVersion => ({
  id,
  topicId: draft.topicId,
  draftId: draft.id,
  version,
  variant: draft.variant,
  status,
  title: draft.title,
  seoTitle: draft.seoTitle,
  body: draft.body,
  notes: draft.notes,
  changeNote,
  snapshotAt,
  authorName,
});

const trimSeoText = (value: string, maxLength: number) => {
  const cleaned = value.replace(/\s+/g, ' ').trim();
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 1).trimEnd()}.` : cleaned;
};

const hasUnsafeSeoText = (value: string, path: string) => (
  hasBlockingQualityIssues(scanEditarraText(value, { surface: 'seo', path }))
);

const fallbackSeoDescription = (title: string, focusKeyword: string) => {
  const base = `Resumen publicable sobre ${title}, con foco en ${focusKeyword} y decisiones operativas verificables.`;
  return trimSeoText(base, 155);
};

const seoPartsFromTopic = (topic: Pick<Topic, 'title' | 'seo'>) => {
  const seoText = topic.seo.replace(/^Keyword principal:\s*/i, '').trim();
  const [keywordPart, ...descriptionParts] = seoText.split('.').map((part) => part.trim()).filter(Boolean);
  const unsafeFocusKeyword = keywordPart || topic.title;
  const focusKeyword = hasUnsafeSeoText(unsafeFocusKeyword, 'seo.focusKeyword') ? topic.title : unsafeFocusKeyword;
  const rawDescription = descriptionParts.join('. ') || `Nota tecnica sobre ${topic.title} con foco en ${focusKeyword} y decisiones operativas verificables.`;
  const description = hasUnsafeSeoText(rawDescription, 'seo.description')
    ? fallbackSeoDescription(topic.title, focusKeyword)
    : rawDescription;

  return {
    focusKeyword: trimSeoText(focusKeyword, 72),
    description: trimSeoText(description, 155),
  };
};

export const sanitizeSeoExperiment = (experiment: SeoExperiment): SeoExperiment => {
  const safeTitle = hasUnsafeSeoText(experiment.title, 'seo.title')
    ? trimSeoText(experiment.focusKeyword || 'Variante SEO operativa', 70)
    : trimSeoText(experiment.title, 70);
  const safeFocusKeyword = hasUnsafeSeoText(experiment.focusKeyword, 'seo.focusKeyword')
    ? trimSeoText(safeTitle, 72)
    : trimSeoText(experiment.focusKeyword, 72);
  const safeDescription = hasUnsafeSeoText(experiment.description, 'seo.description')
    ? fallbackSeoDescription(safeTitle, safeFocusKeyword)
    : trimSeoText(experiment.description, 155);
  const safeNotes = hasUnsafeSeoText(experiment.notes, 'seo.notes')
    ? 'Variante sin metricas historicas.'
    : trimSeoText(experiment.notes, 180);

  return {
    ...experiment,
    title: safeTitle || 'Variante SEO operativa',
    description: safeDescription,
    focusKeyword: safeFocusKeyword || safeTitle || 'tema operativo',
    notes: safeNotes,
  };
};

export const createDefaultSeoExperiment = ({
  id,
  topic,
  selected,
}: {
  id: string;
  topic: Pick<Topic, 'id' | 'title' | 'seo'>;
  selected: boolean;
}): SeoExperiment => {
  const seo = seoPartsFromTopic(topic);

  return sanitizeSeoExperiment({
    id,
    topicId: topic.id,
    title: trimSeoText(topic.title, 70),
    description: seo.description,
    focusKeyword: seo.focusKeyword,
    strategy: 'Mixto',
    ctr: 0,
    impressions: 0,
    selected,
    notes: 'Variante nueva sin metricas historicas.',
  });
};

export const createDefaultAnalyticsRecord = ({
  id,
  topicId,
  authorScore,
}: {
  id: string;
  topicId: string;
  authorScore: number;
}): AnalyticsRecord => ({
  id,
  topicId,
  period: 'Periodo nuevo',
  trafficSource: 'organico',
  visits: 0,
  averageReadSeconds: 0,
  ctaClicks: 0,
  shares: 0,
  comments: 0,
  conversionRate: 0,
  successCriteria: 'Define lecturas, permanencia, interacciones y conversiones esperadas.',
  performanceScore: Math.max(40, Math.min(100, authorScore)),
  learningNote: 'Registra que debe cambiar en agenda, tono o distribucion.',
});

export const reduceEditarraProductionState = (
  state: EditarraProductionState,
  action: EditarraProductionAction,
): EditarraProductionState => {
  switch (action.type) {
    case 'state/patch':
      return { ...state, ...action.patch };

    case 'topic/remove':
      return {
        ...state,
        drafts: state.drafts.filter((draft) => draft.topicId !== action.topicId),
        draftVersions: state.draftVersions.filter((version) => version.topicId !== action.topicId),
        seoExperiments: state.seoExperiments.filter((experiment) => experiment.topicId !== action.topicId),
        analyticsRecords: state.analyticsRecords.filter((record) => record.topicId !== action.topicId),
        evidence: state.evidence.filter((record) => record.topicId !== action.topicId),
        guidedRunRecords: state.guidedRunRecords.filter((record) => record.topicId !== action.topicId),
        distributionActions: removeDistributionActionsForTopic(state.distributionActions, action.topicId),
      };

    case 'draft/upsert':
      return {
        ...state,
        drafts: upsertDraft(state.drafts, action.draft),
      };

    case 'draft-version/add':
      return {
        ...state,
        draftVersions: [action.version, ...state.draftVersions].slice(0, action.limit ?? 120),
      };

    case 'draft-version/remove':
      return {
        ...state,
        draftVersions: state.draftVersions.filter((version) => version.id !== action.versionId),
      };

    case 'seo/update':
      return {
        ...state,
        seoExperiments: state.seoExperiments.map((experiment) => (
          experiment.id === action.experimentId ? sanitizeSeoExperiment({ ...experiment, ...action.patch }) : experiment
        )),
      };

    case 'seo/add':
      return {
        ...state,
        seoExperiments: [...state.seoExperiments, sanitizeSeoExperiment(action.experiment)],
      };

    case 'seo/select':
      return {
        ...state,
        seoExperiments: state.seoExperiments.map((experiment) => (
          experiment.topicId === action.topicId
            ? { ...experiment, selected: experiment.id === action.experimentId }
            : experiment
        )),
      };

    case 'seo/remove':
      return {
        ...state,
        seoExperiments: state.seoExperiments.filter((experiment) => experiment.id !== action.experimentId),
      };

    case 'analytics/update':
      return {
        ...state,
        analyticsRecords: state.analyticsRecords.map((record) => (
          record.id === action.recordId ? { ...record, ...action.patch } : record
        )),
      };

    case 'analytics/add':
      return {
        ...state,
        analyticsRecords: [action.record, ...state.analyticsRecords],
      };

    case 'analytics/remove':
      return {
        ...state,
        analyticsRecords: state.analyticsRecords.filter((record) => record.id !== action.recordId),
      };

    case 'evidence/update':
      return {
        ...state,
        evidence: state.evidence.map((record) => (
          record.id === action.evidenceId ? { ...record, ...action.patch } : record
        )),
      };

    case 'evidence/add':
      return {
        ...state,
        evidence: [...state.evidence, action.evidence],
      };

    case 'evidence/add-many':
      return {
        ...state,
        evidence: [...state.evidence, ...action.evidence],
      };

    case 'evidence/bulk-update': {
      const updatesById = new Map(action.updates.map((update) => [update.evidenceId, update.patch]));

      return {
        ...state,
        evidence: state.evidence.map((record) => (
          updatesById.has(record.id) ? { ...record, ...updatesById.get(record.id) } : record
        )),
      };
    }

    case 'evidence/validate':
      return {
        ...state,
        evidence: state.evidence.map((record) => (
          record.id === action.evidenceId
            ? { ...record, status: 'validado', confidence: Math.max(record.confidence, action.minConfidence ?? 75) }
            : record
        )),
      };

    case 'evidence/remove':
      return {
        ...state,
        evidence: state.evidence.filter((record) => record.id !== action.evidenceId),
      };

    case 'guided-run/record': {
      const uniqueRun = state.guidedRunRecords.some((record) => record.id === action.run.id)
        ? { ...action.run, id: `${action.run.id}-${state.guidedRunRecords.length}` }
        : action.run;

      return {
        ...state,
        guidedRunRecords: [uniqueRun, ...state.guidedRunRecords].slice(0, action.limit ?? 80),
      };
    }

    case 'distribution/mark':
      return {
        ...state,
        distributionActions: {
          ...state.distributionActions,
          [action.deliverableId]: action.status,
        },
      };

    default:
      return state;
  }
};

export const applyAnalyticsLearning = ({
  authorScore,
  topicPriority,
  performanceScore,
}: {
  authorScore: number;
  topicPriority: number;
  performanceScore: number;
}) => ({
  nextAuthorScore: clamp((authorScore * 0.6) + (performanceScore * 0.4)),
  nextTopicPriority: clamp((topicPriority * 0.7) + (performanceScore * 0.3)),
});
