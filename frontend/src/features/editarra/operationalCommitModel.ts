import type { EditorialPackageFileKey } from './operations';
import type {
  CockpitDailyBatchResult,
  CockpitGeneratedRunResult,
  DailyBatchAutopilotResult,
  OperationalProfileNoteResult,
  SingleNoteAutopilotResult,
} from './operationalRunModel';
import type {
  DraftVersion,
  EditarraProductionState,
  EditorialDraft,
  EvidenceRecord,
} from './productionReducer';
import type { EditarraRecipeKey } from './profileModel';
import type { Topic, WorkflowVariable } from './workspaceModel';
import type { GuidedRunRecord } from './guidedEngine';

export type EditarraOperationalTab = 'agenda' | 'autores' | 'editor' | 'imagenes' | 'publicacion' | 'auditoria' | 'config';

export type EditarraOperationalCommit = {
  workflowVariables?: WorkflowVariable[];
  selectedRecipeId?: EditarraRecipeKey;
  topic?: Topic;
  addTopic?: Topic;
  addTopics?: Topic[];
  selectedTopicId?: string;
  productionPatch?: Partial<EditarraProductionState>;
  addEvidence?: EvidenceRecord[];
  addDraft?: EditorialDraft;
  addDraftVersion?: DraftVersion;
  addGuidedRun?: GuidedRunRecord;
  aiResponseBuffer?: string;
  draftMode?: 'humanizado';
  activeTab: EditarraOperationalTab;
  packageFileKey: EditorialPackageFileKey;
  statuses: {
    ai: string;
    draft: string;
    package: string;
    guidedFlow: string;
  };
  audit: {
    event: string;
    detail: string;
  };
};

const statusesFrom = (statuses: {
  ai: string;
  draft: string;
  package: string;
  guidedFlow: string;
  auditEvent: string;
  auditDetail: string;
}) => ({
  statuses: {
    ai: statuses.ai,
    draft: statuses.draft,
    package: statuses.package,
    guidedFlow: statuses.guidedFlow,
  },
  audit: {
    event: statuses.auditEvent,
    detail: statuses.auditDetail,
  },
});

export const buildDailyBatchAutopilotCommit = (
  operation: DailyBatchAutopilotResult,
): EditarraOperationalCommit => ({
  productionPatch: {
    evidence: operation.evidence,
    drafts: operation.drafts,
    draftVersions: operation.draftVersions,
    guidedRunRecords: operation.guidedRuns,
  },
  draftMode: 'humanizado',
  activeTab: 'config',
  packageFileKey: 'package_manifest.json',
  ...statusesFrom(operation.statuses),
});

export const buildSingleNoteAutopilotCommit = ({
  operation,
  existingDraftVersions,
  existingGuidedRunRecords,
}: {
  operation: SingleNoteAutopilotResult;
  existingDraftVersions: DraftVersion[];
  existingGuidedRunRecords: GuidedRunRecord[];
}): EditarraOperationalCommit => ({
  workflowVariables: operation.completedWorkflowVariables,
  topic: operation.topic,
  productionPatch: {
    evidence: operation.evidence,
    drafts: operation.drafts,
    draftVersions: [operation.draftVersion, ...existingDraftVersions].slice(0, 120),
    guidedRunRecords: [operation.guidedRun, ...existingGuidedRunRecords].slice(0, 80),
  },
  draftMode: 'humanizado',
  activeTab: 'config',
  packageFileKey: 'publication_payload.json',
  ...statusesFrom(operation.statuses),
});

export const buildCockpitGeneratedRunCommit = (
  operation: CockpitGeneratedRunResult,
): EditarraOperationalCommit => ({
  workflowVariables: operation.completedWorkflowVariables,
  addTopic: operation.topic,
  addEvidence: operation.evidence,
  addGuidedRun: operation.guidedRun,
  addDraft: operation.draft,
  draftMode: 'humanizado',
  activeTab: 'editor',
  packageFileKey: 'ai_brief.json',
  ...statusesFrom(operation.statuses),
});

export const buildCockpitDailyBatchCommit = ({
  operation,
  existingDrafts,
  existingEvidence,
  existingGuidedRunRecords,
}: {
  operation: CockpitDailyBatchResult;
  existingDrafts: EditorialDraft[];
  existingEvidence: EvidenceRecord[];
  existingGuidedRunRecords: GuidedRunRecord[];
}): EditarraOperationalCommit => ({
  workflowVariables: operation.completedWorkflowVariables,
  selectedRecipeId: operation.selectedRecipeId,
  addTopics: operation.topics,
  selectedTopicId: operation.topics[0]?.id,
  productionPatch: {
    drafts: [...existingDrafts, ...operation.drafts],
    evidence: [...existingEvidence, ...operation.evidence],
    guidedRunRecords: [...operation.guidedRuns, ...existingGuidedRunRecords].slice(0, 80),
  },
  draftMode: 'humanizado',
  activeTab: 'editor',
  packageFileKey: 'ai_brief.json',
  ...statusesFrom(operation.statuses),
});

export const buildProfileNoteCommit = (
  operation: OperationalProfileNoteResult,
): EditarraOperationalCommit => ({
  workflowVariables: operation.generation.completedWorkflowVariables,
  topic: operation.generation.recipeTopic,
  aiResponseBuffer: operation.localAiResponse,
  addDraft: operation.operationalDraft,
  addDraftVersion: operation.nextVersion,
  addGuidedRun: operation.nextRun,
  addEvidence: operation.guidedEvidence,
  draftMode: 'humanizado',
  activeTab: operation.targetSurface,
  packageFileKey: operation.packageFileKey,
  ...statusesFrom(operation.statuses),
});
