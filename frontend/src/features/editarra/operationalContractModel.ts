import type { EditarraAiHandoff } from './aiAdapter';
import type { EditarraPipelineState } from './pipelineModel';
import type { EditorialPackageFileKey } from './operations';
import type { EditorialProfile, NoteRecipe } from './profileModel';
import type { OperationalRunQueueItem } from './runQueueModel';
import type { EditarraNoteRun } from './runModel';
import type { OperationalWorkspaceSnapshot } from './workspaceModel';

export type EditarraOperationalContract = {
  product: 'editarra';
  version: 1;
  route: '/editarra';
  executionMode: 'manual-json-copy';
  externalPostEnabled: false;
  activeProfile: {
    id: string;
    name: string;
    postingMode: EditorialProfile['postingMode'];
    sourceMinimum: number;
  };
  activeRecipe: {
    id: NoteRecipe['id'];
    label: string;
    shortLabel: string;
  };
  activeNote: {
    topicId: string;
    title: string;
    status: string;
    nextControl: string;
    currentStageId: EditarraPipelineState['currentStageId'];
    progress: number;
  };
  ai: {
    sendFile: EditarraAiHandoff['sendFile'];
    expectedFile: EditarraAiHandoff['expectedFile'];
    status: EditarraAiHandoff['status'];
    checksum: string;
  };
  queue: Array<{
    id: string;
    topicId: string;
    title: string;
    action: string;
    artifact: EditorialPackageFileKey;
    stage: string;
    status: string;
  }>;
  criticalVariables: Array<{
    key: string;
    value: string;
    source: string;
  }>;
  requiredArtifacts: EditorialPackageFileKey[];
  nextOperatorAction: string;
  invariants: string[];
};

export const buildEditarraOperationalContract = ({
  workspace,
  profile,
  recipe,
  noteRun,
  pipeline,
  aiHandoff,
  runQueue,
  requiredArtifacts,
}: {
  workspace: OperationalWorkspaceSnapshot;
  profile: EditorialProfile;
  recipe: NoteRecipe;
  noteRun: EditarraNoteRun;
  pipeline: EditarraPipelineState;
  aiHandoff: EditarraAiHandoff;
  runQueue: OperationalRunQueueItem[];
  requiredArtifacts: EditorialPackageFileKey[];
}): EditarraOperationalContract => {
  const primaryRun = runQueue[0];
  const criticalVariables = workspace.variables
    .filter((variable) => variable.enabled)
    .slice(0, 8)
    .map((variable) => ({
      key: variable.key,
      value: variable.value,
      source: variable.source || 'workspace',
    }));

  return {
    product: 'editarra',
    version: 1,
    route: '/editarra',
    executionMode: 'manual-json-copy',
    externalPostEnabled: false,
    activeProfile: {
      id: profile.id,
      name: profile.name,
      postingMode: profile.postingMode,
      sourceMinimum: profile.sourceMinimum,
    },
    activeRecipe: {
      id: recipe.id,
      label: recipe.label,
      shortLabel: recipe.shortLabel,
    },
    activeNote: {
      topicId: noteRun.topicId,
      title: noteRun.topicTitle,
      status: workspace.topic.status,
      nextControl: pipeline.nextControl,
      currentStageId: pipeline.currentStageId,
      progress: pipeline.progress,
    },
    ai: {
      sendFile: aiHandoff.sendFile,
      expectedFile: aiHandoff.expectedFile,
      status: aiHandoff.status,
      checksum: aiHandoff.checksum,
    },
    queue: runQueue.slice(0, 8).map((run) => ({
      id: run.id,
      topicId: run.topicId,
      title: run.topicTitle,
      action: run.actionLabel,
      artifact: run.artifact,
      stage: run.stage,
      status: run.status,
    })),
    criticalVariables,
    requiredArtifacts,
    nextOperatorAction: primaryRun
      ? `${primaryRun.actionLabel}: ${primaryRun.topicTitle} (${primaryRun.artifact})`
      : `${pipeline.nextControl}: ${noteRun.topicTitle}`,
    invariants: [
      'external_post_enabled=false',
      'no publicar sin fuentes validadas',
      'mantener note_run.json y ai_request.json como contrato antes de payload',
      'publication_payload.json requiere control humano UMSA',
    ],
  };
};
