import { applyEditarraOperationalCommit } from './operationalCommitController';
import type { EditarraOperationalCommitHandlers } from './operationalCommitController';
import type { EditarraOperationalCommit } from './operationalCommitModel';
import { authorSeed, topicSeed } from './persistenceModel';
import type { EditorialDraft, EvidenceRecord } from './productionReducer';
import type { WorkflowVariable } from './workspaceModel';

const topic = { ...topicSeed[0], id: 'topic-a', title: 'Tema A', author: authorSeed[0].name };

const workflowVariables: WorkflowVariable[] = [
  { id: 'var-a', key: 'keyword_principal', value: 'test', scope: 'editor', description: 'Keyword', enabled: true },
];

const draft: EditorialDraft = {
  id: 'draft-topic-a',
  topicId: topic.id,
  variant: 'humanizado',
  status: 'listo',
  title: 'Draft A',
  seoTitle: 'SEO A',
  body: 'Body A',
  notes: 'Notes',
  updatedAt: '10:00',
};

const evidence: EvidenceRecord = {
  id: 'evidence-a',
  topicId: topic.id,
  sourceName: 'Fuente A',
  sourceUrl: 'https://example.com/a',
  claim: 'Claim A',
  status: 'validado',
  confidence: 90,
  notes: 'ok',
};

const createHandlers = (): jest.Mocked<EditarraOperationalCommitHandlers> => ({
  setWorkflowVariables: jest.fn(),
  setSelectedRecipeId: jest.fn(),
  dispatchDomainAction: jest.fn(),
  dispatchProductionAction: jest.fn(),
  updateTopic: jest.fn(),
  setAiResponseBuffer: jest.fn(),
  setDraftMode: jest.fn(),
  setActiveTab: jest.fn(),
  setPackageFileKey: jest.fn(),
  setAiStatus: jest.fn(),
  setDraftStatusMessage: jest.fn(),
  setPackageStatus: jest.fn(),
  setGuidedFlowStatus: jest.fn(),
  recordAudit: jest.fn(),
});

const baseCommit = (): EditarraOperationalCommit => ({
  activeTab: 'editor',
  packageFileKey: 'ai_brief.json',
  statuses: {
    ai: 'AI lista',
    draft: 'Draft listo',
    package: 'Paquete listo',
    guidedFlow: 'Flujo listo',
  },
  audit: {
    event: 'Evento',
    detail: 'Detalle',
  },
});

describe('operationalCommitController', () => {
  it('applies UI statuses and audit for every operational commit', () => {
    const handlers = createHandlers();

    applyEditarraOperationalCommit(baseCommit(), handlers);

    expect(handlers.setActiveTab).toHaveBeenCalledWith('editor');
    expect(handlers.setPackageFileKey).toHaveBeenCalledWith('ai_brief.json');
    expect(handlers.setAiStatus).toHaveBeenCalledWith('AI lista');
    expect(handlers.setDraftStatusMessage).toHaveBeenCalledWith('Draft listo');
    expect(handlers.setPackageStatus).toHaveBeenCalledWith('Paquete listo');
    expect(handlers.setGuidedFlowStatus).toHaveBeenCalledWith('Flujo listo');
    expect(handlers.recordAudit).toHaveBeenCalledWith('Evento', 'Detalle');
  });

  it('routes domain commits through domain actions and selected recipe updates', () => {
    const handlers = createHandlers();
    const commit: EditarraOperationalCommit = {
      ...baseCommit(),
      workflowVariables,
      selectedRecipeId: 'reactiva',
      addTopic: topic,
      addTopics: [{ ...topic, id: 'topic-b' }],
      selectedTopicId: 'topic-b',
    };

    applyEditarraOperationalCommit(commit, handlers);

    expect(handlers.setWorkflowVariables).toHaveBeenCalledWith(workflowVariables);
    expect(handlers.setSelectedRecipeId).toHaveBeenCalledWith('reactiva');
    expect(handlers.dispatchDomainAction).toHaveBeenCalledWith({ type: 'topic/add', topic });
    expect(handlers.dispatchDomainAction).toHaveBeenCalledWith({
      type: 'topic/add-many',
      topics: [{ ...topic, id: 'topic-b' }],
      selectedTopicId: 'topic-b',
    });
  });

  it('routes production patch and generated artifacts through production actions', () => {
    const handlers = createHandlers();
    const commit: EditarraOperationalCommit = {
      ...baseCommit(),
      topic,
      productionPatch: {
        drafts: [draft],
        evidence: [evidence],
      },
      addEvidence: [evidence],
      addDraft: draft,
      addDraftVersion: {
        id: 'version-a',
        topicId: topic.id,
        draftId: draft.id,
        version: 1,
        variant: 'humanizado',
        status: 'listo',
        title: draft.title,
        seoTitle: draft.seoTitle,
        body: draft.body,
        notes: draft.notes,
        changeNote: 'Cambio',
        snapshotAt: '10:01',
        authorName: authorSeed[0].name,
      },
      addGuidedRun: {
        id: 'run-a',
        topicId: topic.id,
        recipeId: 'reactiva',
        profileId: 'editarra-studio',
        status: 'pausado',
        steps: ['tema'],
        nextControl: 'Validar fuentes',
        summary: 'Run A',
        time: '10:02',
      },
      aiResponseBuffer: '{"provider":"local-dry-run"}',
      draftMode: 'humanizado',
    };

    applyEditarraOperationalCommit(commit, handlers);

    expect(handlers.updateTopic).toHaveBeenCalledWith(topic);
    expect(handlers.dispatchProductionAction).toHaveBeenCalledWith({
      type: 'state/patch',
      patch: commit.productionPatch,
    });
    expect(handlers.dispatchProductionAction).toHaveBeenCalledWith({
      type: 'evidence/add-many',
      evidence: [evidence],
    });
    expect(handlers.dispatchProductionAction).toHaveBeenCalledWith({
      type: 'draft/upsert',
      draft,
    });
    expect(handlers.dispatchProductionAction).toHaveBeenCalledWith({
      type: 'guided-run/record',
      run: commit.addGuidedRun,
    });
    expect(handlers.setAiResponseBuffer).toHaveBeenCalledWith('{"provider":"local-dry-run"}');
    expect(handlers.setDraftMode).toHaveBeenCalledWith('humanizado');
  });

  it('does not dispatch empty optional artifact arrays', () => {
    const handlers = createHandlers();

    applyEditarraOperationalCommit({
      ...baseCommit(),
      addEvidence: [],
    }, handlers);

    expect(handlers.dispatchProductionAction).not.toHaveBeenCalledWith({
      type: 'evidence/add-many',
      evidence: [],
    });
  });
});
