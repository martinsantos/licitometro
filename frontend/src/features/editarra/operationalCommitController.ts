import type { EditarraDomainAction } from './domainReducer';
import type { EditarraOperationalCommit } from './operationalCommitModel';
import type { EditarraProductionAction } from './productionReducer';

export type EditarraOperationalCommitHandlers = {
  setWorkflowVariables: (variables: NonNullable<EditarraOperationalCommit['workflowVariables']>) => void;
  setSelectedRecipeId: (recipeId: NonNullable<EditarraOperationalCommit['selectedRecipeId']>) => void;
  dispatchDomainAction: (action: EditarraDomainAction) => void;
  dispatchProductionAction: (action: EditarraProductionAction) => void;
  updateTopic: (topic: NonNullable<EditarraOperationalCommit['topic']>) => void;
  setAiResponseBuffer: (value: string) => void;
  setDraftMode: (mode: NonNullable<EditarraOperationalCommit['draftMode']>) => void;
  setActiveTab: (tab: EditarraOperationalCommit['activeTab']) => void;
  setPackageFileKey: (fileKey: EditarraOperationalCommit['packageFileKey']) => void;
  setAiStatus: (status: string) => void;
  setDraftStatusMessage: (status: string) => void;
  setPackageStatus: (status: string) => void;
  setGuidedFlowStatus: (status: string) => void;
  recordAudit: (event: string, detail: string) => void;
};

export const applyEditarraOperationalCommit = (
  commit: EditarraOperationalCommit,
  handlers: EditarraOperationalCommitHandlers,
) => {
  if (commit.workflowVariables) {
    handlers.setWorkflowVariables(commit.workflowVariables);
  }

  if (commit.selectedRecipeId) {
    handlers.setSelectedRecipeId(commit.selectedRecipeId);
  }

  if (commit.addTopic) {
    handlers.dispatchDomainAction({ type: 'topic/add', topic: commit.addTopic });
  }

  if (commit.addTopics && commit.selectedTopicId) {
    handlers.dispatchDomainAction({
      type: 'topic/add-many',
      topics: commit.addTopics,
      selectedTopicId: commit.selectedTopicId,
    });
  }

  if (commit.topic) {
    handlers.updateTopic(commit.topic);
  }

  if (commit.productionPatch) {
    handlers.dispatchProductionAction({ type: 'state/patch', patch: commit.productionPatch });
  }

  if (commit.addEvidence && commit.addEvidence.length > 0) {
    handlers.dispatchProductionAction({ type: 'evidence/add-many', evidence: commit.addEvidence });
  }

  if (commit.addDraft) {
    handlers.dispatchProductionAction({ type: 'draft/upsert', draft: commit.addDraft });
  }

  if (commit.addDraftVersion) {
    handlers.dispatchProductionAction({ type: 'draft-version/add', version: commit.addDraftVersion });
  }

  if (commit.addGuidedRun) {
    handlers.dispatchProductionAction({ type: 'guided-run/record', run: commit.addGuidedRun });
  }

  if (commit.aiResponseBuffer) {
    handlers.setAiResponseBuffer(commit.aiResponseBuffer);
  }

  if (commit.draftMode) {
    handlers.setDraftMode(commit.draftMode);
  }

  handlers.setActiveTab(commit.activeTab);
  handlers.setPackageFileKey(commit.packageFileKey);
  handlers.setAiStatus(commit.statuses.ai);
  handlers.setDraftStatusMessage(commit.statuses.draft);
  handlers.setPackageStatus(commit.statuses.package);
  handlers.setGuidedFlowStatus(commit.statuses.guidedFlow);
  handlers.recordAudit(commit.audit.event, commit.audit.detail);
};
