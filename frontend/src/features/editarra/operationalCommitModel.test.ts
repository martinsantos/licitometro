import {
  buildCockpitDailyBatchCommit,
  buildCockpitGeneratedRunCommit,
  buildDailyBatchAutopilotCommit,
  buildProfileNoteCommit,
  buildSingleNoteAutopilotCommit,
} from './operationalCommitModel';
import { authorSeed, topicSeed } from './persistenceModel';
import type {
  CockpitDailyBatchResult,
  CockpitGeneratedRunResult,
  DailyBatchAutopilotResult,
  OperationalProfileNoteResult,
  SingleNoteAutopilotResult,
} from './operationalRunModel';
import type { DraftVersion, EditorialDraft, EvidenceRecord } from './productionReducer';
import type { WorkflowVariable } from './workspaceModel';
import type { GuidedRunRecord } from './guidedEngine';

const workflowVariables: WorkflowVariable[] = [
  { id: 'var-a', key: 'keyword_principal', value: 'test', scope: 'editor', description: 'Keyword', enabled: true },
];

const topic = { ...topicSeed[0], id: 'topic-a', title: 'Tema A', author: authorSeed[0].name };

const draft: EditorialDraft = {
  id: 'draft-topic-a',
  topicId: topic.id,
  variant: 'humanizado',
  status: 'listo',
  title: 'Draft A',
  seoTitle: 'SEO A',
  body: 'Body A',
  notes: 'Notes A',
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

const version: DraftVersion = {
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
};

const guidedRun: GuidedRunRecord = {
  id: 'run-a',
  topicId: topic.id,
  recipeId: 'reactiva',
  profileId: 'editarra-studio',
  status: 'pausado',
  steps: ['tema', 'fuentes'],
  nextControl: 'Validar fuentes',
  summary: 'Run A',
  time: '10:02',
};

const statuses = {
  ai: 'AI lista',
  draft: 'Draft listo',
  package: 'Paquete listo',
  guidedFlow: 'Flujo listo',
  auditEvent: 'Evento',
  auditDetail: 'Detalle',
};

describe('operationalCommitModel', () => {
  it('maps daily batch autopilot results to a config package commit', () => {
    const operation: DailyBatchAutopilotResult = {
      evidence: [evidence],
      drafts: [draft],
      draftVersions: [version],
      guidedRuns: [guidedRun],
      batchTopicCount: 1,
      statuses,
    };

    const commit = buildDailyBatchAutopilotCommit(operation);

    expect(commit).toMatchObject({
      activeTab: 'config',
      packageFileKey: 'package_manifest.json',
      draftMode: 'humanizado',
      statuses: {
        ai: 'AI lista',
        guidedFlow: 'Flujo listo',
      },
      audit: {
        event: 'Evento',
        detail: 'Detalle',
      },
    });
    expect(commit.productionPatch).toMatchObject({
      evidence: [evidence],
      drafts: [draft],
      draftVersions: [version],
      guidedRunRecords: [guidedRun],
    });
  });

  it('maps single note autopilot results and caps version/run histories', () => {
    const oldVersions = Array.from({ length: 130 }, (_, index) => ({ ...version, id: `version-old-${index}` }));
    const oldRuns = Array.from({ length: 90 }, (_, index) => ({ ...guidedRun, id: `run-old-${index}` }));
    const operation: SingleNoteAutopilotResult = {
      topic,
      evidence: [evidence],
      drafts: [draft],
      draftVersion: version,
      guidedRun,
      completedWorkflowVariables: workflowVariables,
      statuses,
    };

    const commit = buildSingleNoteAutopilotCommit({
      operation,
      existingDraftVersions: oldVersions,
      existingGuidedRunRecords: oldRuns,
    });

    expect(commit.workflowVariables).toBe(workflowVariables);
    expect(commit.topic).toBe(topic);
    expect(commit.activeTab).toBe('config');
    expect(commit.packageFileKey).toBe('publication_payload.json');
    expect(commit.productionPatch?.draftVersions).toHaveLength(120);
    expect(commit.productionPatch?.draftVersions?.[0]).toBe(version);
    expect(commit.productionPatch?.guidedRunRecords).toHaveLength(80);
    expect(commit.productionPatch?.guidedRunRecords?.[0]).toBe(guidedRun);
  });

  it('maps cockpit-created single runs to topic, draft, evidence and run additions', () => {
    const operation: CockpitGeneratedRunResult = {
      topic,
      draft,
      evidence: [evidence],
      guidedRun,
      completedWorkflowVariables: workflowVariables,
      statuses,
    };

    const commit = buildCockpitGeneratedRunCommit(operation);

    expect(commit).toMatchObject({
      addTopic: topic,
      addDraft: draft,
      addEvidence: [evidence],
      addGuidedRun: guidedRun,
      activeTab: 'editor',
      packageFileKey: 'ai_brief.json',
    });
  });

  it('maps cockpit daily batch results to append-only production patches', () => {
    const operation: CockpitDailyBatchResult = {
      topics: [topic],
      drafts: [draft],
      evidence: [evidence],
      guidedRuns: [guidedRun],
      completedWorkflowVariables: workflowVariables,
      selectedRecipeId: 'reactiva',
      statuses,
    };
    const existingDraft = { ...draft, id: 'draft-old' };
    const existingEvidence = { ...evidence, id: 'evidence-old' };
    const existingRun = { ...guidedRun, id: 'run-old' };

    const commit = buildCockpitDailyBatchCommit({
      operation,
      existingDrafts: [existingDraft],
      existingEvidence: [existingEvidence],
      existingGuidedRunRecords: [existingRun],
    });

    expect(commit.selectedRecipeId).toBe('reactiva');
    expect(commit.addTopics).toEqual([topic]);
    expect(commit.selectedTopicId).toBe(topic.id);
    expect(commit.productionPatch?.drafts).toEqual([existingDraft, draft]);
    expect(commit.productionPatch?.evidence).toEqual([existingEvidence, evidence]);
    expect(commit.productionPatch?.guidedRunRecords).toEqual([guidedRun, existingRun]);
  });

  it('maps profile-note operations to editor/audit commits with generated artifacts', () => {
    const operation: OperationalProfileNoteResult = {
      generation: {
        draft,
        variant: 'humanizado',
        topicPatch: {},
        recipeTopic: topic,
        recipeAuthor: authorSeed[0],
        completedWorkflowVariables: workflowVariables,
      },
      guidedEvidence: [evidence],
      localAiResponse: '{"provider":"local-dry-run"}',
      operationalDraft: draft,
      nextVersion: version,
      nextRun: guidedRun,
      targetSurface: 'auditoria',
      packageFileKey: 'evidence_log.json',
      statuses,
    };

    const commit = buildProfileNoteCommit(operation);

    expect(commit).toMatchObject({
      topic,
      aiResponseBuffer: '{"provider":"local-dry-run"}',
      addDraft: draft,
      addDraftVersion: version,
      addGuidedRun: guidedRun,
      addEvidence: [evidence],
      activeTab: 'auditoria',
      packageFileKey: 'evidence_log.json',
    });
  });
});
