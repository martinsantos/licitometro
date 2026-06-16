import {
  decideGuidedAssistedAction,
  type GuidedAssistedAction,
  type GuidedAssistedDecision,
  type GuidedNextStep,
  type GuidedPipelineSnapshot,
  type GuidedTargetSurface,
} from './guidedEngine';
import {
  buildEditarraPipelineControlExecution,
  type EditarraPipelineAction,
  type EditarraPipelineActionId,
  type EditarraPipelineState,
  type EditarraPipelineTargetSurface,
} from './pipelineModel';
import type { EditorialPackageFileKey } from './operations';
import type { EditorialProfile, NoteRecipe } from './profileModel';

export type GuidedExecutionTargetSurface = GuidedTargetSurface | EditarraPipelineTargetSurface;

export type GuidedExecutionOperation =
  | 'apply_recipe'
  | 'create_source_slots'
  | 'create_and_complete_source_slots'
  | 'complete_sources'
  | 'generate_note'
  | 'run_local_ai_and_apply'
  | 'approve_audit'
  | 'approve_audit_and_prepare_payload'
  | 'prepare_image'
  | 'prepare_payload';

export type GuidedExecutionPlan = {
  source: 'next-step' | 'assisted-flow' | 'pipeline-control';
  operations: GuidedExecutionOperation[];
  targetSurface: GuidedExecutionTargetSurface;
  packageFileKey?: EditorialPackageFileKey;
  draftStatusMessage?: string;
  flowStatus?: string;
  auditEvent: {
    event: string;
    detail: string;
  };
  run?: GuidedAssistedDecision['run'];
};

export type GuidedExecutionOutcome = {
  operations: GuidedExecutionOperation[];
  targetSurface: GuidedExecutionTargetSurface;
  packageFileKey?: EditorialPackageFileKey;
  draftStatusMessage?: string;
  guidedFlowStatus?: string;
  auditEvent: {
    event: string;
    detail: string;
  };
  run?: GuidedAssistedDecision['run'];
};

export type PipelineActionExecutionResult =
  | { status: 'blocked'; guidedFlowStatus: string }
  | { status: 'ready'; plan: GuidedExecutionPlan; outcome: GuidedExecutionOutcome };

export const operationsForGuidedAction = (action: GuidedAssistedAction): GuidedExecutionOperation[] => {
  if (action === 'complete_sources_and_generate_note') {
    return ['complete_sources', 'generate_note'];
  }

  if (action === 'complete_sources') {
    return ['complete_sources'];
  }

  if (action === 'create_source_slots') {
    return ['create_source_slots'];
  }

  if (action === 'generate_note') {
    return ['generate_note'];
  }

  if (action === 'approve_audit') {
    return ['approve_audit'];
  }

  if (action === 'prepare_payload') {
    return ['prepare_payload'];
  }

  return ['apply_recipe'];
};

export const buildGuidedNextStepExecution = ({
  nextStep,
  recipe,
  topicTitle,
}: {
  nextStep: GuidedNextStep;
  recipe: NoteRecipe;
  topicTitle: string;
}): GuidedExecutionPlan => {
  if (nextStep.id === 'agenda') {
    return {
      source: 'next-step',
      operations: ['apply_recipe'],
      targetSurface: 'agenda',
      draftStatusMessage: `Siguiente paso ejecutado: receta ${recipe.shortLabel} aplicada.`,
      auditEvent: {
        event: 'Siguiente paso guiado',
        detail: `Agenda preparada para "${topicTitle}".`,
      },
    };
  }

  if (nextStep.id === 'ai') {
    return {
      source: 'next-step',
      operations: ['generate_note'],
      targetSurface: 'editor',
      auditEvent: {
        event: 'Siguiente paso guiado',
        detail: `Nota generada para "${topicTitle}".`,
      },
    };
  }

  if (nextStep.id === 'sources') {
    return {
      source: 'next-step',
      operations: ['create_source_slots'],
      targetSurface: 'auditoria',
      packageFileKey: 'evidence_log.json',
      auditEvent: {
        event: 'Siguiente paso guiado',
        detail: `Slots de evidencia preparados para "${topicTitle}".`,
      },
    };
  }

  if (nextStep.id === 'audit') {
    return {
      source: 'next-step',
      operations: ['approve_audit'],
      targetSurface: 'auditoria',
      packageFileKey: 'quality_audit.json',
      auditEvent: {
        event: 'Siguiente paso guiado',
        detail: `Auditoría asistida ejecutada para "${topicTitle}".`,
      },
    };
  }

  return {
    source: 'next-step',
    operations: ['prepare_payload'],
    targetSurface: 'publicacion',
    packageFileKey: 'publication_payload.json',
    auditEvent: {
      event: 'Siguiente paso guiado',
      detail: `publication_payload.json preparado para "${topicTitle}".`,
    },
  };
};

export const buildGuidedAssistedExecution = ({
  profile,
  recipe,
  snapshot,
  nextStep,
  pendingGuidedEvidenceCount,
}: {
  profile: EditorialProfile;
  recipe: NoteRecipe;
  snapshot: GuidedPipelineSnapshot;
  nextStep: GuidedNextStep;
  pendingGuidedEvidenceCount: number;
}): GuidedExecutionPlan => {
  const decision = decideGuidedAssistedAction({
    profile,
    recipe,
    snapshot,
    nextStep,
    pendingGuidedEvidenceCount,
  });

  return {
    source: 'assisted-flow',
    operations: operationsForGuidedAction(decision.action),
    targetSurface: decision.targetSurface,
    packageFileKey: decision.packageFileKey,
    flowStatus: decision.flowStatus,
    auditEvent: {
      event: 'Flujo asistido',
      detail: decision.auditDetail,
    },
    run: decision.run,
  };
};

export const buildGuidedExecutionOutcome = (plan: GuidedExecutionPlan): GuidedExecutionOutcome => ({
  operations: plan.operations,
  targetSurface: plan.targetSurface,
  packageFileKey: plan.packageFileKey,
  draftStatusMessage: plan.draftStatusMessage,
  guidedFlowStatus: plan.flowStatus,
  auditEvent: plan.auditEvent,
  run: plan.run,
});

export const buildPipelineControlExecutionPlan = ({
  pipeline,
  topicTitle,
  recipeShortLabel,
  pendingGuidedEvidenceCount,
  canApproveGuidedAudit,
  guidedAuditRequirements,
  imageReady,
}: {
  pipeline: Pick<EditarraPipelineState, 'currentStageId'>;
  topicTitle: string;
  recipeShortLabel: string;
  pendingGuidedEvidenceCount: number;
  canApproveGuidedAudit: boolean;
  guidedAuditRequirements: string[];
  imageReady?: boolean;
}): GuidedExecutionPlan => {
  const control = buildEditarraPipelineControlExecution({
    pipeline,
    topicTitle,
    recipeShortLabel,
    pendingGuidedEvidenceCount,
    canApproveGuidedAudit,
    guidedAuditRequirements,
    imageReady,
  });

  return {
    source: 'pipeline-control',
    operations: control.operations || [control.operation],
    targetSurface: control.targetSurface,
    packageFileKey: control.packageFileKey,
    flowStatus: control.flowStatus,
    auditEvent: control.auditEvent,
  };
};

export const buildPipelineActionExecution = ({
  actionId,
  actions,
  pipeline,
  topicTitle,
  recipeShortLabel,
  pendingGuidedEvidenceCount,
  canApproveGuidedAudit,
  guidedAuditRequirements,
  imageReady,
}: {
  actionId: EditarraPipelineActionId;
  actions: EditarraPipelineAction[];
  pipeline: Pick<EditarraPipelineState, 'currentStageId'>;
  topicTitle: string;
  recipeShortLabel: string;
  pendingGuidedEvidenceCount: number;
  canApproveGuidedAudit: boolean;
  guidedAuditRequirements: string[];
  imageReady?: boolean;
}): PipelineActionExecutionResult => {
  const action = actions.find((item) => item.id === actionId);

  if (!action?.enabled) {
    return {
      status: 'blocked',
      guidedFlowStatus: `Acción pipeline en espera: ${action?.reason || 'control no disponible en esta etapa'}`,
    };
  }

  const plan = buildPipelineControlExecutionPlan({
    pipeline,
    topicTitle,
    recipeShortLabel,
    pendingGuidedEvidenceCount,
    canApproveGuidedAudit,
    guidedAuditRequirements,
    imageReady,
  });

  return {
    status: 'ready',
    plan,
    outcome: buildGuidedExecutionOutcome(plan),
  };
};
