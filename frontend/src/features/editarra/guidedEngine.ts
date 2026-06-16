import type { EditorialProfile, EditarraRecipeKey, NoteRecipe } from './profileModel';

export type GuidedTone = 'emerald' | 'blue' | 'amber' | 'rose' | 'slate' | 'violet';
export type GuidedNextStepId = 'agenda' | 'sources' | 'ai' | 'audit' | 'payload';
export type GuidedRunStatus = 'pausado' | 'bloqueado' | 'completo';
export type GuidedTargetSurface = 'agenda' | 'auditoria' | 'editor' | 'publicacion' | 'config';
export type GuidedAssistedAction =
  | 'apply_recipe'
  | 'create_source_slots'
  | 'complete_sources_and_generate_note'
  | 'complete_sources'
  | 'generate_note'
  | 'approve_audit'
  | 'prepare_payload';

export type GuidedNextStep = {
  id: GuidedNextStepId;
  label: string;
  detail: string;
  badge: string;
  tone: GuidedTone;
};

export type GuidedRunRecord = {
  id: string;
  topicId: string;
  recipeId: EditarraRecipeKey;
  profileId: string;
  status: GuidedRunStatus;
  steps: string[];
  nextControl: string;
  summary: string;
  time: string;
};

export type GuidedRunSummary = Pick<GuidedRunRecord, 'id' | 'topicId' | 'recipeId' | 'profileId' | 'status' | 'summary' | 'nextControl' | 'time'> & {
  topicTitle: string;
  isActiveTopic: boolean;
};
export type GuidedAutopilotStageStatus = 'listo' | 'activo' | 'bloqueado' | 'pendiente';

export type GuidedAutopilotStage = {
  id: GuidedNextStepId;
  label: string;
  status: GuidedAutopilotStageStatus;
  detail: string;
  tone: GuidedTone;
};

export type GuidedAutopilotPlan = {
  mode: 'operando' | 'control_humano' | 'listo';
  progress: number;
  primaryActionLabel: string;
  primaryActionDetail: string;
  humanControl: string;
  stages: GuidedAutopilotStage[];
};

export type GuidedPipelineSnapshot = {
  topicTitle: string;
  topicStatus: string;
  topicEvidenceCount: number;
  validatedEvidenceCount: number;
  selectedTopicReady: boolean;
  selectedSourcesReady: boolean;
  selectedDraftReady: boolean;
  selectedQualityReady: boolean;
  selectedPayloadReady: boolean;
  canApproveGuidedAudit: boolean;
  preflightBlockers: number;
  preflightWarnings: number;
  guidedAuditRequirements: string[];
};

export type GuidedAssistedDecision = {
  action: GuidedAssistedAction;
  targetSurface: GuidedTargetSurface;
  packageFileKey?: 'publication_payload.json' | 'quality_audit.json' | 'evidence_log.json';
  flowStatus: string;
  auditDetail: string;
  run: {
    status: GuidedRunStatus;
    steps: string[];
    nextControl: string;
    summary: string;
  };
};

type BuildGuidedNextStepInput = {
  profile: EditorialProfile;
  recipe: NoteRecipe;
  snapshot: GuidedPipelineSnapshot;
};

type DecideGuidedAssistedActionInput = BuildGuidedNextStepInput & {
  nextStep: GuidedNextStep;
  pendingGuidedEvidenceCount: number;
};

const statusTone: Record<GuidedAutopilotStageStatus, GuidedTone> = {
  listo: 'emerald',
  activo: 'blue',
  bloqueado: 'rose',
  pendiente: 'slate',
};

const actionLabels: Record<GuidedAssistedAction, string> = {
  apply_recipe: 'Aplicar receta',
  create_source_slots: 'Crear fuentes guiadas',
  complete_sources_and_generate_note: 'Validar fuentes y generar',
  complete_sources: 'Validar fuentes guiadas',
  generate_note: 'Generar nota',
  approve_audit: 'Aprobar auditoría',
  prepare_payload: 'Preparar payload',
};

const blockedOrActive = (isBlocked: boolean): GuidedAutopilotStageStatus => (
  isBlocked ? 'bloqueado' : 'activo'
);

export const buildGuidedNextStep = ({
  profile,
  recipe,
  snapshot,
}: BuildGuidedNextStepInput): GuidedNextStep => {
  if (!snapshot.selectedTopicReady) {
    return {
      id: 'agenda',
      label: 'Aplicar receta y pasar a redacción',
      detail: `El tema está en ${snapshot.topicStatus}. La próxima acción carga profundidad, horario, autor y variables de ${recipe.shortLabel}.`,
      badge: 'agenda',
      tone: 'amber',
    };
  }

  if (!snapshot.selectedSourcesReady) {
    return {
      id: 'sources',
      label: 'Completar fuentes antes de publicar',
      detail: `${snapshot.validatedEvidenceCount}/${profile.sourceMinimum} fuentes validadas (${snapshot.topicEvidenceCount} cargadas). Abre auditoría para validar o agregar evidencia primaria antes de generar con AI.`,
      badge: 'fuentes',
      tone: 'rose',
    };
  }

  if (!snapshot.selectedDraftReady) {
    return {
      id: 'ai',
      label: 'Generar nota con el perfil activo',
      detail: `Crea el borrador UMSA con ${profile.name}, receta ${recipe.shortLabel} y variables visibles.`,
      badge: 'AI',
      tone: 'blue',
    };
  }

  if (snapshot.preflightBlockers > 0 || !snapshot.selectedQualityReady) {
    return {
      id: 'audit',
      label: snapshot.canApproveGuidedAudit ? 'Aprobar auditoría asistida' : 'Revisar auditoría y bloqueos',
      detail: snapshot.canApproveGuidedAudit
        ? `Estructura UMSA, quality_audit.json y ${snapshot.validatedEvidenceCount}/${profile.sourceMinimum} fuentes validadas están listas. La próxima acción marca el borrador como aprobado.`
        : `${snapshot.preflightBlockers} bloqueos y ${snapshot.preflightWarnings} avisos detectados: ${snapshot.guidedAuditRequirements.join(', ') || 'revisar preflight'}.`,
      badge: snapshot.canApproveGuidedAudit ? 'aprobar' : 'auditoría',
      tone: snapshot.canApproveGuidedAudit ? 'emerald' : snapshot.preflightBlockers > 0 ? 'rose' : 'amber',
    };
  }

  return {
    id: 'payload',
    label: 'Preparar paquete publicable',
    detail: snapshot.selectedPayloadReady
      ? 'El payload está disponible. La próxima acción selecciona publication_payload.json y registra el paquete.'
      : 'El borrador está listo; la próxima acción prepara el payload y el paquete portable.',
    badge: 'payload',
    tone: 'emerald',
  };
};

export const decideGuidedAssistedAction = ({
  profile,
  recipe,
  snapshot,
  nextStep,
  pendingGuidedEvidenceCount,
}: DecideGuidedAssistedActionInput): GuidedAssistedDecision => {
  const title = snapshot.topicTitle;

  if (!snapshot.selectedTopicReady) {
    return {
      action: 'apply_recipe',
      targetSurface: 'agenda',
      flowStatus: `Receta ${recipe.shortLabel} aplicada. El flujo asistido continuará por fuentes.`,
      auditDetail: `Agenda preparada para "${title}".`,
      run: {
        status: 'pausado',
        steps: ['agenda'],
        nextControl: 'Completar fuentes',
        summary: `Receta ${recipe.shortLabel} aplicada sobre "${title}".`,
      },
    };
  }

  if (!snapshot.selectedSourcesReady) {
    if (pendingGuidedEvidenceCount > 0) {
      const validatedAfterGuided = snapshot.validatedEvidenceCount + pendingGuidedEvidenceCount;

      if (validatedAfterGuided >= profile.sourceMinimum && !snapshot.selectedDraftReady) {
        return {
          action: 'complete_sources_and_generate_note',
          targetSurface: 'editor',
          packageFileKey: 'evidence_log.json',
          flowStatus: `Fuentes guiadas validadas y nota generada para "${title}". Próximo control: auditoría.`,
          auditDetail: `Fuentes guiadas validadas y nota generada para "${title}".`,
          run: {
            status: 'pausado',
            steps: ['fuentes validadas', 'nota generada'],
            nextControl: 'Auditoría asistida',
            summary: `Fuentes validadas y nota generada para "${title}".`,
          },
        };
      }

      return {
        action: 'complete_sources',
        targetSurface: 'auditoria',
        packageFileKey: 'evidence_log.json',
        flowStatus: `${validatedAfterGuided}/${profile.sourceMinimum} fuentes validadas. Revisar matriz antes de continuar.`,
        auditDetail: `Fuentes guiadas completadas para "${title}".`,
        run: {
          status: 'bloqueado',
          steps: ['fuentes validadas'],
          nextControl: 'Completar fuentes faltantes',
          summary: `${validatedAfterGuided}/${profile.sourceMinimum} fuentes validadas para "${title}".`,
        },
      };
    }

    return {
      action: 'create_source_slots',
      targetSurface: 'auditoria',
      packageFileKey: 'evidence_log.json',
      flowStatus: `Fuentes guiadas creadas para "${title}". Revisar o completar antes de AI.`,
      auditDetail: `Slots de evidencia creados para "${title}".`,
      run: {
        status: 'pausado',
        steps: ['slots de evidencia'],
        nextControl: 'Validar fuentes guiadas',
        summary: `Slots de evidencia creados para "${title}".`,
      },
    };
  }

  if (!snapshot.selectedDraftReady) {
    return {
      action: 'generate_note',
      targetSurface: 'editor',
      flowStatus: `Nota generada con ${profile.name}. Próximo control: auditoría.`,
      auditDetail: `Nota generada para "${title}".`,
      run: {
        status: 'pausado',
        steps: ['nota generada'],
        nextControl: 'Auditoría asistida',
        summary: `Nota generada con ${profile.name} para "${title}".`,
      },
    };
  }

  if (nextStep.id === 'audit') {
    const pendingRequirements = snapshot.guidedAuditRequirements.join(', ') || 'revisar preflight editorial';

    return {
      action: 'approve_audit',
      targetSurface: 'auditoria',
      packageFileKey: 'quality_audit.json',
      flowStatus: snapshot.canApproveGuidedAudit
        ? 'Auditoría asistida aprobada. Próximo paso: publication_payload.json.'
        : `Flujo pausado en auditoría: ${pendingRequirements}.`,
      auditDetail: `Auditoría ejecutada para "${title}".`,
      run: {
        status: snapshot.canApproveGuidedAudit ? 'pausado' : 'bloqueado',
        steps: ['auditoría asistida'],
        nextControl: snapshot.canApproveGuidedAudit ? 'Preparar payload' : 'Resolver preflight',
        summary: snapshot.canApproveGuidedAudit
          ? `Auditoría asistida aprobada para "${title}".`
          : `Auditoría pausada para "${title}": ${pendingRequirements}.`,
      },
    };
  }

  return {
    action: 'prepare_payload',
    targetSurface: 'publicacion',
    packageFileKey: 'publication_payload.json',
    flowStatus: `Payload publicable preparado para "${title}".`,
    auditDetail: `publication_payload.json preparado para "${title}".`,
    run: {
      status: 'completo',
      steps: ['payload preparado'],
      nextControl: 'Listo para exportar',
      summary: `Payload publicable preparado para "${title}".`,
    },
  };
};

export const buildGuidedAutopilotPlan = ({
  profile,
  recipe,
  snapshot,
  nextStep,
  pendingGuidedEvidenceCount,
}: DecideGuidedAssistedActionInput): GuidedAutopilotPlan => {
  const decision = decideGuidedAssistedAction({
    profile,
    recipe,
    snapshot,
    nextStep,
    pendingGuidedEvidenceCount,
  });
  const agendaStatus: GuidedAutopilotStageStatus = snapshot.selectedTopicReady ? 'listo' : 'activo';
  const sourcesCanRun = snapshot.selectedTopicReady || agendaStatus === 'listo';
  const sourcesStatus: GuidedAutopilotStageStatus = snapshot.selectedSourcesReady
    ? 'listo'
    : sourcesCanRun
      ? 'activo'
      : 'pendiente';
  const aiStatus: GuidedAutopilotStageStatus = snapshot.selectedDraftReady
    ? 'listo'
    : snapshot.selectedSourcesReady || decision.action === 'complete_sources_and_generate_note'
      ? 'activo'
      : 'pendiente';
  const auditBlocked = snapshot.preflightBlockers > 0 && !snapshot.canApproveGuidedAudit;
  const auditStatus: GuidedAutopilotStageStatus = snapshot.selectedQualityReady && snapshot.preflightBlockers === 0
    ? 'listo'
    : snapshot.selectedDraftReady
      ? blockedOrActive(auditBlocked)
      : 'pendiente';
  const payloadStatus: GuidedAutopilotStageStatus = decision.action === 'prepare_payload' && snapshot.selectedPayloadReady
    ? 'listo'
    : nextStep.id === 'payload'
      ? 'activo'
    : snapshot.selectedPayloadReady && snapshot.selectedQualityReady && snapshot.preflightBlockers === 0
      ? 'listo'
      : 'pendiente';
  const stages: GuidedAutopilotStage[] = [
    {
      id: 'agenda',
      label: 'Agenda',
      status: agendaStatus,
      detail: snapshot.selectedTopicReady
        ? `${snapshot.topicStatus} con receta operativa.`
        : `Cargar ${recipe.shortLabel}, autor, profundidad y horario.`,
      tone: statusTone[agendaStatus],
    },
    {
      id: 'sources',
      label: 'Fuentes',
      status: sourcesStatus,
      detail: `${snapshot.validatedEvidenceCount}/${profile.sourceMinimum} validadas; ${snapshot.topicEvidenceCount} cargadas.`,
      tone: statusTone[sourcesStatus],
    },
    {
      id: 'ai',
      label: 'AI',
      status: aiStatus,
      detail: snapshot.selectedDraftReady
        ? 'Borrador estructurado y listo para control.'
        : `Generar nota con ${profile.name} y ${recipe.shortLabel}.`,
      tone: statusTone[aiStatus],
    },
    {
      id: 'audit',
      label: 'Auditoría',
      status: auditStatus,
      detail: auditBlocked
        ? snapshot.guidedAuditRequirements.join(', ') || 'Resolver preflight editorial.'
        : snapshot.canApproveGuidedAudit
          ? 'Control humano listo para aprobar.'
          : `${snapshot.preflightBlockers} bloqueos y ${snapshot.preflightWarnings} avisos.`,
      tone: statusTone[auditStatus],
    },
    {
      id: 'payload',
      label: 'Payload',
      status: payloadStatus,
      detail: payloadStatus === 'listo'
        ? 'publication_payload.json disponible para revisar/exportar.'
        : payloadStatus === 'activo'
          ? 'Preparar publication_payload.json y registrar paquete.'
          : 'Esperando auditoría y paquete publicable.',
      tone: statusTone[payloadStatus],
    },
  ];
  const completedStages = stages.filter((stage) => stage.status === 'listo').length;
  const progress = Math.round(((completedStages + (stages.some((stage) => stage.status === 'activo') ? 0.5 : 0)) / stages.length) * 100);
  const mode: GuidedAutopilotPlan['mode'] = decision.action === 'prepare_payload'
    ? 'listo'
    : decision.run.status === 'bloqueado' || auditBlocked
      ? 'control_humano'
      : 'operando';

  return {
    mode,
    progress: Math.min(100, progress),
    primaryActionLabel: decision.action === 'approve_audit' && !snapshot.canApproveGuidedAudit
      ? 'Revisar auditoría'
      : actionLabels[decision.action],
    primaryActionDetail: decision.flowStatus,
    humanControl: mode === 'control_humano'
      ? snapshot.guidedAuditRequirements.join(', ') || decision.run.nextControl
      : decision.run.nextControl,
    stages,
  };
};

export const createGuidedRunRecord = ({
  topicId,
  recipeId,
  profileId,
  run,
  now = new Date(),
}: {
  topicId: string;
  recipeId: EditarraRecipeKey;
  profileId: string;
  run: GuidedAssistedDecision['run'];
  now?: Date;
}): GuidedRunRecord => ({
  id: `guided-run-${topicId}-${now.getTime()}`,
  topicId,
  recipeId,
  profileId,
  status: run.status,
  steps: run.steps,
  nextControl: run.nextControl,
  summary: run.summary,
  time: now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
});
