import type { DraftVariantKey } from './operations';
import { authorSeed, draftCopies, imagePromptSeed, topicSeed } from './persistenceModel';
import type { ImagePrompt } from './persistenceModel';
import { editorialProfiles, noteRecipes, operationModes } from './profileModel';
import type { EditorialOperationMode, EditorialProfile, EditarraRecipeKey, NoteRecipe } from './profileModel';
import type {
  AnalyticsRecord,
  DraftVersion,
  EditorialDraft,
  EvidenceRecord,
  SeoExperiment,
} from './productionReducer';
import type { Author, Topic, TopicStatus } from './workspaceModel';

export type StatusFilter = TopicStatus | 'todos';

export type SelectedSiteSummary = {
  id: string;
  name: string;
  domain: string;
  cadence: string;
  approval: string;
  seoMode: string;
};

export type AuthorPerformanceSummary = {
  author: Author;
  visits: number;
  records: number;
  performanceScore: number;
};

export type DailyBatchControl = {
  active: boolean;
  topicIds: string[];
  topicCount: number;
  validated: number;
  pendingGuided: number;
  sourceMinimum: number;
  aiReady: number;
  auditApproved: number;
  payloadReady: number;
  latestTitles: string[];
};

export type EditarraSelectionModel = {
  selectedWorkflowProfile: EditorialProfile;
  selectedSite: SelectedSiteSummary;
  selectedRecipe: NoteRecipe;
  selectedOperationMode: EditorialOperationMode;
  activeAuthors: number;
  approvedTopics: number;
  topicTokenBudget: number;
  filteredTopics: Topic[];
  selectedTopic: Topic;
  selectedAuthor: Author;
  selectedTopicScore: number;
  selectedDraft?: EditorialDraft;
  currentDraft: EditorialDraft;
  selectedImagePrompt: ImagePrompt;
  selectedTopicEvidence: EvidenceRecord[];
  validatedEvidenceCount: number;
  guidedTopicEvidence: EvidenceRecord[];
  pendingGuidedEvidence: EvidenceRecord[];
  dailyBatchControl: DailyBatchControl;
  selectedTopicSeoExperiments: SeoExperiment[];
  selectedSeoExperiment?: SeoExperiment;
  selectedTopicAnalytics: AnalyticsRecord[];
  latestTopicAnalytics?: AnalyticsRecord;
  totalAnalyticsVisits: number;
  averagePerformanceScore: number;
  authorPerformance: AuthorPerformanceSummary[];
  selectedDraftVersions: DraftVersion[];
  latestDraftVersion?: DraftVersion;
};

export const postingModeLabels: Record<EditorialProfile['postingMode'], string> = {
  manual: 'Manual',
  asistido: 'Asistido',
  automatico: 'Automático',
};

const matchesTopicSearch = (topic: Topic, query: string) => {
  const normalizedQuery = query.trim().toLowerCase();

  return normalizedQuery.length === 0
    || `${topic.title} ${topic.author} ${topic.source} ${topic.seo}`.toLowerCase().includes(normalizedQuery);
};

const buildFallbackDraft = ({
  topic,
  draftMode,
}: {
  topic: Topic;
  draftMode: DraftVariantKey;
}): EditorialDraft => ({
  id: `draft-${topic.id}`,
  topicId: topic.id,
  variant: draftMode,
  status: 'borrador',
  title: draftCopies[draftMode].title,
  seoTitle: topic.title,
  body: draftCopies[draftMode].body,
  notes: 'Sin cambios guardados para este tema.',
  updatedAt: 'sin guardar',
});

export const buildPendingImagePrompt = (topic: Pick<Topic, 'id' | 'title'>): ImagePrompt => ({
  id: `image-pending-${topic.id}`,
  title: `Imagen pendiente - ${topic.title}`,
  ratio: '16:9',
  status: 'pendiente',
  prompt: '',
});

export const buildDailyBatchControl = ({
  selectedTopic,
  selectedWorkflowProfile,
  topics,
  evidence,
  drafts,
  getDailyBatchTopicPrefix,
  isGuidedEvidenceRecord,
}: {
  selectedTopic: Topic;
  selectedWorkflowProfile: EditorialProfile;
  topics: Topic[];
  evidence: EvidenceRecord[];
  drafts: EditorialDraft[];
  getDailyBatchTopicPrefix: (topicId: string) => string | null;
  isGuidedEvidenceRecord: (record: EvidenceRecord) => boolean;
}): DailyBatchControl => {
  const batchPrefix = getDailyBatchTopicPrefix(selectedTopic.id);

  if (!batchPrefix) {
    return {
      active: false,
      topicIds: [],
      topicCount: 0,
      validated: 0,
      pendingGuided: 0,
      sourceMinimum: 0,
      aiReady: 0,
      auditApproved: 0,
      payloadReady: 0,
      latestTitles: [],
    };
  }

  const batchTopics = topics.filter((topic) => topic.id.startsWith(batchPrefix));
  const batchTopicIds = new Set(batchTopics.map((topic) => topic.id));
  const batchEvidence = evidence.filter((item) => batchTopicIds.has(item.topicId));
  const batchGuidedEvidence = batchEvidence.filter(isGuidedEvidenceRecord);
  const aiReadyDrafts = drafts.filter((draft) => (
    batchTopicIds.has(draft.topicId) && ['listo', 'aprobado', 'publicado'].includes(draft.status)
  ));
  const auditApprovedDrafts = drafts.filter((draft) => (
    batchTopicIds.has(draft.topicId) && ['aprobado', 'publicado'].includes(draft.status)
  ));

  return {
    active: batchTopics.length > 0,
    topicIds: batchTopics.map((topic) => topic.id),
    topicCount: batchTopics.length,
    validated: batchEvidence.filter((item) => item.status === 'validado').length,
    pendingGuided: batchGuidedEvidence.filter((item) => item.status !== 'validado').length,
    sourceMinimum: selectedWorkflowProfile.sourceMinimum * batchTopics.length,
    aiReady: aiReadyDrafts.length,
    auditApproved: auditApprovedDrafts.length,
    payloadReady: auditApprovedDrafts.length,
    latestTitles: batchTopics.slice(0, 3).map((topic) => topic.title),
  };
};

export const buildEditarraSelectionModel = ({
  profiles,
  selectedSiteId,
  selectedRecipeId,
  selectedOperationModeId,
  authors,
  topics,
  drafts,
  evidence,
  draftVersions,
  seoExperiments,
  analyticsRecords,
  imagePrompts,
  reusableImages,
  selectedTopicId,
  draftMode,
  query,
  statusFilter,
  getDailyBatchTopicPrefix,
  isGuidedEvidenceRecord,
}: {
  profiles: EditorialProfile[];
  selectedSiteId: string;
  selectedRecipeId: EditarraRecipeKey;
  selectedOperationModeId: string;
  authors: Author[];
  topics: Topic[];
  drafts: EditorialDraft[];
  evidence: EvidenceRecord[];
  draftVersions: DraftVersion[];
  seoExperiments: SeoExperiment[];
  analyticsRecords: AnalyticsRecord[];
  imagePrompts: ImagePrompt[];
  reusableImages: string[];
  selectedTopicId: string;
  draftMode: DraftVariantKey;
  query: string;
  statusFilter: StatusFilter;
  getDailyBatchTopicPrefix: (topicId: string) => string | null;
  isGuidedEvidenceRecord: (record: EvidenceRecord) => boolean;
}): EditarraSelectionModel => {
  const selectedWorkflowProfile = profiles.find((profile) => profile.id === selectedSiteId) || profiles[0] || editorialProfiles[0];
  const selectedSite = {
    id: selectedWorkflowProfile.id,
    name: selectedWorkflowProfile.name,
    domain: selectedWorkflowProfile.site,
    cadence: selectedWorkflowProfile.cadence,
    approval: postingModeLabels[selectedWorkflowProfile.postingMode],
    seoMode: selectedWorkflowProfile.model,
  };
  const selectedRecipe = noteRecipes.find((recipe) => recipe.id === selectedRecipeId) || noteRecipes[0];
  const selectedOperationMode = operationModes.find((mode) => mode.id === selectedOperationModeId) || operationModes[0];
  const activeAuthors = authors.filter((author) => author.active).length;
  const approvedTopics = topics.filter((topic) => ['aprobado', 'redaccion', 'publicado'].includes(topic.status)).length;
  const topicTokenBudget = topics.reduce((sum, topic) => sum + topic.tokens, 0);
  const filteredTopics = topics.filter((topic) => (
    matchesTopicSearch(topic, query) && (statusFilter === 'todos' || topic.status === statusFilter)
  ));
  const selectedTopic = filteredTopics.find((topic) => topic.id === selectedTopicId)
    || filteredTopics[0]
    || topics.find((topic) => topic.id === selectedTopicId)
    || topicSeed[0];
  const selectedAuthor = authors.find((author) => author.name === selectedTopic.author) || authors[0] || authorSeed[0];
  const selectedTopicScore = Math.min(98, Math.round((selectedTopic.priority + selectedAuthor.score) / 2));
  const selectedDraft = drafts.find((draft) => draft.topicId === selectedTopic.id);
  const currentDraft = selectedDraft || buildFallbackDraft({ topic: selectedTopic, draftMode });
  const selectedReusableImage = reusableImages
    .map((imageId) => imagePrompts.find((image) => image.id === imageId))
    .find((image): image is ImagePrompt => Boolean(image));
  const selectedImagePrompt = selectedReusableImage || imagePrompts[0] || buildPendingImagePrompt(selectedTopic);
  const selectedTopicEvidence = evidence.filter((item) => item.topicId === selectedTopic.id);
  const validatedEvidenceCount = selectedTopicEvidence.filter((item) => item.status === 'validado').length;
  const guidedTopicEvidence = selectedTopicEvidence.filter(isGuidedEvidenceRecord);
  const pendingGuidedEvidence = guidedTopicEvidence.filter((item) => item.status !== 'validado');
  const dailyBatchControl = buildDailyBatchControl({
    selectedTopic,
    selectedWorkflowProfile,
    topics,
    evidence,
    drafts,
    getDailyBatchTopicPrefix,
    isGuidedEvidenceRecord,
  });
  const selectedTopicSeoExperiments = seoExperiments.filter((item) => item.topicId === selectedTopic.id);
  const selectedSeoExperiment = selectedTopicSeoExperiments.find((item) => item.selected);
  const selectedTopicAnalytics = analyticsRecords.filter((item) => item.topicId === selectedTopic.id);
  const latestTopicAnalytics = selectedTopicAnalytics[0];
  const totalAnalyticsVisits = analyticsRecords.reduce((sum, record) => sum + record.visits, 0);
  const averagePerformanceScore = Math.round(
    analyticsRecords.reduce((sum, record) => sum + record.performanceScore, 0) / Math.max(analyticsRecords.length, 1),
  );
  const authorPerformance = authors.map((author) => {
    const authorTopicIds = topics.filter((topic) => topic.author === author.name).map((topic) => topic.id);
    const authorMetrics = analyticsRecords.filter((record) => authorTopicIds.includes(record.topicId));
    const visits = authorMetrics.reduce((sum, record) => sum + record.visits, 0);
    const performanceScore = authorMetrics.length > 0
      ? Math.round(authorMetrics.reduce((sum, record) => sum + record.performanceScore, 0) / authorMetrics.length)
      : author.score;

    return {
      author,
      visits,
      records: authorMetrics.length,
      performanceScore,
    };
  });
  const selectedDraftVersions = draftVersions
    .filter((version) => version.topicId === selectedTopic.id)
    .sort((a, b) => b.version - a.version);

  return {
    selectedWorkflowProfile,
    selectedSite,
    selectedRecipe,
    selectedOperationMode,
    activeAuthors,
    approvedTopics,
    topicTokenBudget,
    filteredTopics,
    selectedTopic,
    selectedAuthor,
    selectedTopicScore,
    selectedDraft,
    currentDraft,
    selectedImagePrompt,
    selectedTopicEvidence,
    validatedEvidenceCount,
    guidedTopicEvidence,
    pendingGuidedEvidence,
    dailyBatchControl,
    selectedTopicSeoExperiments,
    selectedSeoExperiment,
    selectedTopicAnalytics,
    latestTopicAnalytics,
    totalAnalyticsVisits,
    averagePerformanceScore,
    authorPerformance,
    selectedDraftVersions,
    latestDraftVersion: selectedDraftVersions[0],
  };
};
