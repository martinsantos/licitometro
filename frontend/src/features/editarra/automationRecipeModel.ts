import type { EditarraAiRunRequest } from './aiAdapter';
import type { EditarraPipelineState } from './pipelineModel';
import type { EditarraNoteRun } from './runModel';
import type { OperationalRunQueueItem } from './runQueueModel';
import type { OperationalWorkspaceSnapshot } from './workspaceModel';

export type EditarraAutomationRecipe = {
  product: 'editarra';
  version: 1;
  executionMode: 'manual-json-copy';
  externalPostEnabled: false;
  runId: string;
  topic: {
    id: string;
    title: string;
    status: string;
  };
  profile: {
    id: string;
    name: string;
    site: string;
    postingMode: string;
  };
  recipe: {
    id: string;
    label: string;
  };
  pipeline: {
    status: EditarraPipelineState['status'];
    progress: number;
    currentStageId: EditarraPipelineState['currentStageId'];
    nextControl: string;
    blockers: string[];
  };
  recommendedCommand: {
    actionId: string;
    label: string;
    reason: string;
    targetArtifact: string;
    expectedInput: string;
    expectedOutput: string;
  };
  executionPreflight: {
    state: 'ready' | 'blocked' | 'complete';
    canRunNow: boolean;
    humanReviewRequired: boolean;
    blockedBy: string[];
    nextMutation: string;
    willUpdate: string[];
  };
  criticalVariables: Array<{
    key: string;
    value: string;
    source: string;
    description: string;
  }>;
  queue: Array<Pick<OperationalRunQueueItem, 'id' | 'topicTitle' | 'stage' | 'stageLabel' | 'actionLabel' | 'artifact' | 'reason'>>;
  artifacts: {
    readFirst: string[];
    produceOrUpdate: string[];
    importBackTarget: string;
  };
  invariants: string[];
};

const artifactByStage: Record<EditarraPipelineState['currentStageId'], string> = {
  agenda: 'metadata.json',
  fuentes: 'evidence_log.json',
  ai: 'ai_request.json',
  auditoria: 'quality_audit.json',
  imagenes: 'image_prompt.json',
  payload: 'publication_payload.json',
};

const outputByStage: Record<EditarraPipelineState['currentStageId'], string> = {
  agenda: 'note_run.json',
  fuentes: 'evidence_log.json',
  ai: 'publication_payload.json',
  auditoria: 'quality_audit.json',
  imagenes: 'image_manifest.json',
  payload: 'publication_payload.json',
};

const fallbackCommandByStage: Record<EditarraPipelineState['currentStageId'], { actionId: string; label: string }> = {
  agenda: { actionId: 'apply_recipe', label: 'Aplicar receta' },
  fuentes: { actionId: 'validate_sources', label: 'Validar fuentes guiadas' },
  ai: { actionId: 'generate_note', label: 'Ejecutar AI local' },
  auditoria: { actionId: 'approve_audit', label: 'Aprobar auditoría' },
  imagenes: { actionId: 'prepare_image', label: 'Preparar imagen' },
  payload: { actionId: 'prepare_payload', label: 'Preparar payload' },
};

export const buildEditarraAutomationRecipe = ({
  workspace,
  noteRun,
  pipeline,
  aiRunRequest,
  runQueue,
  importBackTarget,
}: {
  workspace: OperationalWorkspaceSnapshot;
  noteRun: EditarraNoteRun;
  pipeline: EditarraPipelineState;
  aiRunRequest: EditarraAiRunRequest;
  runQueue: OperationalRunQueueItem[];
  importBackTarget: string;
}): EditarraAutomationRecipe => {
  const primaryAction = pipeline.actions.find((action) => action.primary && action.enabled)
    || pipeline.actions.find((action) => action.enabled);
  const fallbackCommand = fallbackCommandByStage[pipeline.currentStageId];
  const targetArtifact = artifactByStage[pipeline.currentStageId];
  const expectedOutput = outputByStage[pipeline.currentStageId];
  const willUpdate = Array.from(new Set([expectedOutput, aiRunRequest.expectedFile, 'package_manifest.json']));
  const state = pipeline.status === 'listo'
    ? 'complete'
    : primaryAction
      ? 'ready'
      : 'blocked';
  const blockedBy = state === 'blocked'
    ? (pipeline.blockers.length > 0 ? pipeline.blockers : [primaryAction?.reason || pipeline.nextControl])
    : [];
  const criticalVariables = workspace.variables
    .filter((variable) => variable.enabled)
    .slice(0, 12)
    .map((variable) => ({
      key: variable.key,
      value: variable.value,
      source: variable.source,
      description: variable.description,
    }));

  return {
    product: 'editarra',
    version: 1,
    executionMode: 'manual-json-copy',
    externalPostEnabled: false,
    runId: noteRun.id,
    topic: {
      id: noteRun.topicId,
      title: noteRun.topicTitle,
      status: workspace.topic.status,
    },
    profile: {
      id: workspace.profile.id,
      name: workspace.profile.name,
      site: workspace.profile.site,
      postingMode: workspace.profile.postingMode,
    },
    recipe: {
      id: noteRun.recipeId,
      label: noteRun.recipeLabel,
    },
    pipeline: {
      status: pipeline.status,
      progress: pipeline.progress,
      currentStageId: pipeline.currentStageId,
      nextControl: pipeline.nextControl,
      blockers: pipeline.blockers,
    },
    recommendedCommand: {
      actionId: primaryAction?.id || fallbackCommand.actionId,
      label: primaryAction?.label || fallbackCommand.label,
      reason: primaryAction?.reason || pipeline.blockers[0] || pipeline.nextControl,
      targetArtifact,
      expectedInput: pipeline.currentStageId === 'ai' ? aiRunRequest.sendFile : targetArtifact,
      expectedOutput,
    },
    executionPreflight: {
      state,
      canRunNow: state === 'ready',
      humanReviewRequired: pipeline.status === 'control_humano' || pipeline.currentStageId === 'auditoria' || pipeline.currentStageId === 'payload',
      blockedBy,
      nextMutation: primaryAction
        ? `${primaryAction.label} -> ${expectedOutput}`
        : state === 'complete'
          ? `Abrir ${expectedOutput}`
          : `Resolver ${pipeline.nextControl}`,
      willUpdate,
    },
    criticalVariables,
    queue: runQueue.slice(0, 8).map((item) => ({
      id: item.id,
      topicTitle: item.topicTitle,
      stage: item.stage,
      stageLabel: item.stageLabel,
      actionLabel: item.actionLabel,
      artifact: item.artifact,
      reason: item.reason,
    })),
    artifacts: {
      readFirst: ['profile_runtime.json', 'note_run.json', targetArtifact, 'operational_contract.json'],
      produceOrUpdate: willUpdate,
      importBackTarget,
    },
    invariants: [
      'external_post_enabled=false',
      'no publicar sin control humano UMSA',
      'mantener trazabilidad en audit_log.json',
      'si cambia una variable crítica, regenerar note_run.json y ai_request.json',
    ],
  };
};
