import {
  buildDailyBatchControl,
  buildEditarraSelectionModel,
} from './selectionModel';
import { authorSeed, imagePromptSeed, topicSeed } from './persistenceModel';
import { editorialProfiles } from './profileModel';
import type { EditorialDraft, EvidenceRecord } from './productionReducer';
import type { Author, Topic } from './workspaceModel';

const authorA: Author = {
  ...authorSeed[0],
  id: 'author-a',
  name: 'Autora A',
  score: 80,
  active: true,
};

const authorB: Author = {
  ...authorSeed[0],
  id: 'author-b',
  name: 'Autor B',
  score: 50,
  active: false,
};

const topicA: Topic = {
  ...topicSeed[0],
  id: 'topic-a',
  title: 'Tema principal de prueba',
  status: 'aprobado',
  priority: 90,
  tokens: 1200,
  author: authorA.name,
  source: 'Boletin oficial',
  seo: 'Keyword principal: prueba operativa.',
};

const topicB: Topic = {
  ...topicSeed[0],
  id: 'topic-b',
  title: 'Tema secundario filtrable',
  status: 'sugerido',
  priority: 40,
  tokens: 800,
  author: authorB.name,
  source: 'Repositorio tecnico',
  seo: 'Keyword principal: secundaria.',
};

const draftA: EditorialDraft = {
  id: 'draft-topic-a',
  topicId: topicA.id,
  variant: 'humanizado',
  status: 'listo',
  title: 'Draft activo',
  seoTitle: 'SEO activo',
  body: 'Cuerpo listo para prueba.',
  notes: 'Notas',
  updatedAt: '10:00',
};

const guidedPredicate = (record: Pick<EvidenceRecord, 'id' | 'sourceName'>) => (
  record.id.startsWith('evidence-guided-') || record.sourceName.startsWith('Fuente guiada')
);

describe('selectionModel', () => {
  it('resolves profile, recipe, selected topic and current draft with stable fallbacks', () => {
    const model = buildEditarraSelectionModel({
      profiles: editorialProfiles,
      selectedSiteId: 'missing-profile',
      selectedRecipeId: 'evergreen',
      selectedOperationModeId: 'missing-mode',
      authors: [authorA, authorB],
      topics: [topicA, topicB],
      drafts: [draftA],
      evidence: [],
      draftVersions: [],
      seoExperiments: [],
      analyticsRecords: [],
      imagePrompts: imagePromptSeed,
      reusableImages: [imagePromptSeed[0].id],
      selectedTopicId: topicA.id,
      draftMode: 'base',
      query: '',
      statusFilter: 'todos',
      getDailyBatchTopicPrefix: () => '',
      isGuidedEvidenceRecord: guidedPredicate,
    });

    expect(model.selectedWorkflowProfile.id).toBe(editorialProfiles[0].id);
    expect(model.selectedRecipe.id).toBe('evergreen');
    expect(model.selectedOperationMode.id).toBe('modo-alerta-regulatoria');
    expect(model.selectedTopic.id).toBe(topicA.id);
    expect(model.selectedAuthor.name).toBe(authorA.name);
    expect(model.currentDraft).toBe(draftA);
    expect(model.selectedTopicScore).toBe(85);
    expect(model.activeAuthors).toBe(1);
    expect(model.approvedTopics).toBe(1);
    expect(model.topicTokenBudget).toBe(2000);
  });

  it('prioritizes the operator-selected reusable image over catalog order', () => {
    const model = buildEditarraSelectionModel({
      profiles: editorialProfiles,
      selectedSiteId: editorialProfiles[0].id,
      selectedRecipeId: 'reactiva',
      selectedOperationModeId: 'modo-alerta-regulatoria',
      authors: [authorA],
      topics: [topicA],
      drafts: [],
      evidence: [],
      draftVersions: [],
      seoExperiments: [],
      analyticsRecords: [],
      imagePrompts: imagePromptSeed,
      reusableImages: [imagePromptSeed[2].id, imagePromptSeed[0].id],
      selectedTopicId: topicA.id,
      draftMode: 'humanizado',
      query: '',
      statusFilter: 'todos',
      getDailyBatchTopicPrefix: () => '',
      isGuidedEvidenceRecord: guidedPredicate,
    });

    expect(model.selectedImagePrompt.id).toBe(imagePromptSeed[2].id);
  });

  it('returns a pending topic image instead of a seed when the operator has no prompts', () => {
    const model = buildEditarraSelectionModel({
      profiles: editorialProfiles,
      selectedSiteId: editorialProfiles[0].id,
      selectedRecipeId: 'reactiva',
      selectedOperationModeId: 'modo-alerta-regulatoria',
      authors: [authorA],
      topics: [topicA],
      drafts: [],
      evidence: [],
      draftVersions: [],
      seoExperiments: [],
      analyticsRecords: [],
      imagePrompts: [],
      reusableImages: [],
      selectedTopicId: topicA.id,
      draftMode: 'humanizado',
      query: '',
      statusFilter: 'todos',
      getDailyBatchTopicPrefix: () => '',
      isGuidedEvidenceRecord: guidedPredicate,
    });

    expect(model.selectedImagePrompt).toMatchObject({
      id: 'image-pending-topic-a',
      title: 'Imagen pendiente - Tema principal de prueba',
      status: 'pendiente',
      prompt: '',
    });
  });

  it('filters topics and keeps the explicit selected topic as fallback when filtered out', () => {
    const model = buildEditarraSelectionModel({
      profiles: editorialProfiles,
      selectedSiteId: editorialProfiles[0].id,
      selectedRecipeId: 'reactiva',
      selectedOperationModeId: 'modo-alerta-regulatoria',
      authors: [authorA, authorB],
      topics: [topicA, topicB],
      drafts: [],
      evidence: [],
      draftVersions: [],
      seoExperiments: [],
      analyticsRecords: [],
      imagePrompts: imagePromptSeed,
      reusableImages: [],
      selectedTopicId: topicA.id,
      draftMode: 'humanizado',
      query: 'secundario',
      statusFilter: 'sugerido',
      getDailyBatchTopicPrefix: () => '',
      isGuidedEvidenceRecord: guidedPredicate,
    });

    expect(model.filteredTopics.map((topic) => topic.id)).toEqual([topicB.id]);
    expect(model.selectedTopic.id).toBe(topicB.id);
    expect(model.currentDraft.topicId).toBe(topicB.id);
    expect(model.currentDraft.status).toBe('borrador');
  });

  it('computes evidence, SEO, analytics and author performance for the active topic', () => {
    const evidence: EvidenceRecord[] = [
      {
        id: 'evidence-guided-a',
        topicId: topicA.id,
        sourceName: 'Fuente guiada 1',
        sourceUrl: 'https://example.com/a',
        claim: 'Claim A',
        status: 'validado',
        confidence: 90,
        notes: 'ok',
      },
      {
        id: 'evidence-guided-b',
        topicId: topicA.id,
        sourceName: 'Fuente guiada 2',
        sourceUrl: 'https://example.com/b',
        claim: 'Claim B',
        status: 'pendiente',
        confidence: 60,
        notes: 'pendiente',
      },
    ];

    const model = buildEditarraSelectionModel({
      profiles: editorialProfiles,
      selectedSiteId: editorialProfiles[0].id,
      selectedRecipeId: 'reactiva',
      selectedOperationModeId: 'modo-alerta-regulatoria',
      authors: [authorA, authorB],
      topics: [topicA, topicB],
      drafts: [draftA],
      evidence,
      draftVersions: [
        { id: 'v1', topicId: topicA.id, draftId: draftA.id, version: 1, variant: 'base', status: 'borrador', title: 'v1', seoTitle: 'v1', body: 'v1', notes: '', changeNote: '', snapshotAt: '09:00', authorName: authorA.name },
        { id: 'v2', topicId: topicA.id, draftId: draftA.id, version: 2, variant: 'base', status: 'listo', title: 'v2', seoTitle: 'v2', body: 'v2', notes: '', changeNote: '', snapshotAt: '10:00', authorName: authorA.name },
      ],
      seoExperiments: [
        { id: 'seo-a', topicId: topicA.id, title: 'SEO A', description: '', focusKeyword: 'prueba', strategy: 'Mixto', ctr: 4, impressions: 1000, selected: true, notes: '' },
      ],
      analyticsRecords: [
        { id: 'metric-a', topicId: topicA.id, period: 'Semana 1', trafficSource: 'organico', visits: 120, averageReadSeconds: 80, ctaClicks: 2, shares: 1, comments: 0, conversionRate: 1, successCriteria: '', performanceScore: 70, learningNote: '' },
        { id: 'metric-b', topicId: topicB.id, period: 'Semana 1', trafficSource: 'directo', visits: 30, averageReadSeconds: 50, ctaClicks: 1, shares: 0, comments: 0, conversionRate: 0, successCriteria: '', performanceScore: 40, learningNote: '' },
      ],
      imagePrompts: imagePromptSeed,
      reusableImages: [],
      selectedTopicId: topicA.id,
      draftMode: 'base',
      query: '',
      statusFilter: 'todos',
      getDailyBatchTopicPrefix: () => '',
      isGuidedEvidenceRecord: guidedPredicate,
    });

    expect(model.selectedTopicEvidence).toHaveLength(2);
    expect(model.validatedEvidenceCount).toBe(1);
    expect(model.pendingGuidedEvidence).toHaveLength(1);
    expect(model.selectedSeoExperiment?.id).toBe('seo-a');
    expect(model.latestTopicAnalytics?.id).toBe('metric-a');
    expect(model.totalAnalyticsVisits).toBe(150);
    expect(model.averagePerformanceScore).toBe(55);
    expect(model.authorPerformance.find((item) => item.author.id === authorA.id)).toMatchObject({
      visits: 120,
      records: 1,
      performanceScore: 70,
    });
    expect(model.latestDraftVersion?.id).toBe('v2');
  });

  it('builds daily batch control from topic prefix', () => {
    const batchTopics = [
      { ...topicA, id: 'topic-batch-999-reactiva', title: 'Reactiva' },
      { ...topicA, id: 'topic-batch-999-evergreen', title: 'Evergreen' },
    ];
    const batchEvidence: EvidenceRecord[] = [
      { id: 'evidence-guided-1', topicId: batchTopics[0].id, sourceName: 'Fuente guiada 1', sourceUrl: 'https://a.test', claim: 'A', status: 'validado', confidence: 90, notes: '' },
      { id: 'evidence-guided-2', topicId: batchTopics[1].id, sourceName: 'Fuente guiada 2', sourceUrl: 'https://b.test', claim: 'B', status: 'pendiente', confidence: 60, notes: '' },
    ];

    const control = buildDailyBatchControl({
      selectedTopic: batchTopics[0],
      selectedWorkflowProfile: editorialProfiles[0],
      topics: batchTopics,
      evidence: batchEvidence,
      drafts: [
        { ...draftA, topicId: batchTopics[0].id, status: 'listo' },
        { ...draftA, id: 'draft-batch-b', topicId: batchTopics[1].id, status: 'aprobado' },
      ],
      getDailyBatchTopicPrefix: () => 'topic-batch-999-',
      isGuidedEvidenceRecord: guidedPredicate,
    });

    expect(control).toMatchObject({
      active: true,
      topicCount: 2,
      validated: 1,
      pendingGuided: 1,
      sourceMinimum: editorialProfiles[0].sourceMinimum * 2,
      aiReady: 2,
      auditApproved: 1,
      payloadReady: 1,
    });
    expect(control.latestTitles).toEqual(['Reactiva', 'Evergreen']);
  });
});
