import type { EditorialPackageFileKey, EditarraImageStatus } from './operations';

export type EditarraPipelineStageId = 'agenda' | 'fuentes' | 'ai' | 'auditoria' | 'imagenes' | 'payload';
export type EditarraPipelineActionId = 'apply_recipe' | 'validate_sources' | 'generate_note' | 'approve_audit' | 'prepare_image' | 'prepare_payload';
export type EditarraPipelineStageStatus = 'listo' | 'activo' | 'bloqueado' | 'pendiente';
export type EditarraPipelineTone = 'emerald' | 'blue' | 'amber' | 'rose' | 'slate' | 'violet';
export type EditarraPipelineControlOperation =
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
export type EditarraPipelineTargetSurface = 'agenda' | 'autores' | 'editor' | 'imagenes' | 'auditoria' | 'publicacion' | 'config';

export type EditarraPipelineStage = {
  id: EditarraPipelineStageId;
  label: string;
  status: EditarraPipelineStageStatus;
  tone: EditarraPipelineTone;
  detail: string;
  control: string;
};

export type EditarraPipelineAction = {
  id: EditarraPipelineActionId;
  stageId: EditarraPipelineStageId;
  label: string;
  enabled: boolean;
  primary: boolean;
  reason: string;
};

export type EditarraPipelineState = {
  status: 'operando' | 'bloqueado' | 'control_humano' | 'listo';
  progress: number;
  currentStageId: EditarraPipelineStageId;
  nextControl: string;
  blockers: string[];
  stages: EditarraPipelineStage[];
  actions: EditarraPipelineAction[];
};

export type EditarraPipelineControlExecution = {
  operation: EditarraPipelineControlOperation;
  operations?: EditarraPipelineControlOperation[];
  targetSurface: EditarraPipelineTargetSurface;
  packageFileKey?: EditorialPackageFileKey;
  flowStatus: string;
  auditEvent: {
    event: string;
    detail: string;
  };
};

type BuildEditarraPipelineStateInput = {
  topicStatus: string;
  sourcesValidated: number;
  sourcesRequired: number;
  draftReady: boolean;
  draftStatus: string;
  qualityStatus: string;
  preflightBlockers: number;
  publicationStatus: string;
  payloadReady: boolean;
  imageStatus: EditarraImageStatus;
};

const statusTone: Record<EditarraPipelineStageStatus, EditarraPipelineTone> = {
  listo: 'emerald',
  activo: 'blue',
  bloqueado: 'rose',
  pendiente: 'slate',
};

const stageOrder: EditarraPipelineStageId[] = ['agenda', 'fuentes', 'ai', 'auditoria', 'imagenes', 'payload'];
const imageReadyStatuses = new Set<EditarraImageStatus>(['prompt_listo', 'generada_externa', 'aprobada']);

const firstOpenStage = (stages: EditarraPipelineStage[]) => (
  stages.find((stage) => stage.status === 'bloqueado' || stage.status === 'activo' || stage.status === 'pendiente')
  || stages[stages.length - 1]
);

const stage = ({
  id,
  label,
  status,
  detail,
  control,
}: Omit<EditarraPipelineStage, 'tone'>): EditarraPipelineStage => ({
  id,
  label,
  status,
  tone: statusTone[status],
  detail,
  control,
});

const actionConfig: Record<EditarraPipelineStageId, Pick<EditarraPipelineAction, 'id' | 'label'>> = {
  agenda: { id: 'apply_recipe', label: 'Aplicar receta' },
  fuentes: { id: 'validate_sources', label: 'Validar fuentes guiadas' },
  ai: { id: 'generate_note', label: 'Ejecutar AI local' },
  auditoria: { id: 'approve_audit', label: 'Aprobar auditoría' },
  imagenes: { id: 'prepare_image', label: 'Preparar imagen' },
  payload: { id: 'prepare_payload', label: 'Preparar payload' },
};

const buildActions = ({
  stages,
  currentStageId,
}: {
  stages: EditarraPipelineStage[];
  currentStageId: EditarraPipelineStageId;
}): EditarraPipelineAction[] => stages.map((item) => {
  const config = actionConfig[item.id];
  const primary = item.id === currentStageId;
  const enabled = primary && item.status !== 'pendiente';

  return {
    id: config.id,
    stageId: item.id,
    label: item.control === 'Listo para exportar' ? 'Abrir payload' : config.label,
    enabled,
    primary,
    reason: enabled
      ? `Control actual: ${item.control}.`
      : item.status === 'listo'
        ? `${item.label} ya está listo.`
        : item.status === 'pendiente'
          ? `${item.label} espera controles previos.`
          : `${item.label} queda después del control actual.`,
  };
});

export const buildEditarraPipelineState = ({
  topicStatus,
  sourcesValidated,
  sourcesRequired,
  draftReady,
  draftStatus,
  qualityStatus,
  preflightBlockers,
  publicationStatus,
  payloadReady,
  imageStatus,
}: BuildEditarraPipelineStateInput): EditarraPipelineState => {
  const agendaReady = ['aprobado', 'redaccion', 'publicado'].includes(topicStatus);
  const sourcesReady = sourcesValidated >= sourcesRequired;
  const auditApproved = ['aprobado', 'publicado'].includes(draftStatus);
  const qualityReady = qualityStatus === 'apto_para_revision';
  const imageReady = imageReadyStatuses.has(imageStatus);
  const imageBlocked = imageStatus === 'descartada';
  const hasPayload = payloadReady && publicationStatus !== 'bloqueado' && imageReady;
  const blockers = [
    !agendaReady ? 'agenda sin aprobar' : '',
    !sourcesReady ? `${sourcesValidated}/${sourcesRequired} fuentes validadas` : '',
    draftReady ? '' : 'nota sin estructura UMSA completa',
    preflightBlockers > 0 ? `${preflightBlockers} bloqueos preflight` : '',
    auditApproved && !imageReady ? 'imagen sin prompt/manifiesto listo' : '',
  ].filter(Boolean);

  const stages = [
    stage({
      id: 'agenda',
      label: 'Agenda',
      status: agendaReady ? 'listo' : 'activo',
      detail: agendaReady ? `Tema en ${topicStatus}.` : `Tema en ${topicStatus}; aplicar receta y aprobar agenda.`,
      control: agendaReady ? 'Agenda preparada' : 'Aplicar receta',
    }),
    stage({
      id: 'fuentes',
      label: 'Fuentes',
      status: sourcesReady ? 'listo' : agendaReady ? 'activo' : 'pendiente',
      detail: `${sourcesValidated}/${sourcesRequired} fuentes validadas.`,
      control: sourcesReady ? 'Fuentes listas' : 'Validar fuentes guiadas',
    }),
    stage({
      id: 'ai',
      label: 'AI',
      status: draftReady ? 'listo' : sourcesReady ? 'activo' : 'pendiente',
      detail: draftReady ? `Borrador ${draftStatus} con estructura UMSA.` : 'Ejecutar AI local, aplicar respuesta y dejar trazabilidad JSON.',
      control: draftReady ? 'Nota generada' : 'Ejecutar AI local',
    }),
    stage({
      id: 'auditoria',
      label: 'Auditoría',
      status: auditApproved
        ? 'listo'
        : !sourcesReady || !draftReady
          ? 'pendiente'
          : preflightBlockers > 0
            ? 'bloqueado'
            : 'activo',
      detail: auditApproved
        ? 'Control humano aprobado.'
        : !sourcesReady || !draftReady
          ? 'Esperando fuentes validadas y nota generada.'
          : `${qualityStatus}; ${preflightBlockers} bloqueos activos.`,
      control: auditApproved ? 'Auditoría aprobada' : qualityReady ? 'Aprobar auditoría' : 'Resolver auditoría',
    }),
    stage({
      id: 'imagenes',
      label: 'Imagenes',
      status: imageReady
        ? 'listo'
        : imageBlocked
          ? 'bloqueado'
          : auditApproved
            ? 'activo'
            : 'pendiente',
      detail: imageReady
        ? `Imagen ${imageStatus}; prompt/manifiesto listo.`
        : imageBlocked
          ? 'Imagen descartada; preparar un nuevo prompt antes de publicar.'
          : 'Preparar prompt y manifiesto visual antes de exportar.',
      control: imageReady ? 'Imagen preparada' : 'Preparar imagen',
    }),
    stage({
      id: 'payload',
      label: 'Payload',
      status: publicationStatus === 'listo_para_publicar' && imageReady
        ? 'listo'
        : auditApproved && imageReady && hasPayload
          ? 'activo'
          : auditApproved && imageReady
            ? 'activo'
            : 'pendiente',
      detail: publicationStatus === 'listo_para_publicar' && imageReady
        ? 'publication_payload.json listo para operar manualmente.'
        : hasPayload
          ? 'Payload preparado; confirmar paquete y export.'
          : imageReady
            ? 'Esperando auditoría aprobada.'
            : 'Esperando prompt/manifiesto visual.',
      control: publicationStatus === 'listo_para_publicar' && imageReady ? 'Listo para exportar' : 'Preparar payload',
    }),
  ];
  const current = firstOpenStage(stages);
  const completed = stages.filter((item) => item.status === 'listo').length;
  const activeCredit = stages.some((item) => item.status === 'activo') ? 0.5 : 0;
  const progress = Math.round(((completed + activeCredit) / stageOrder.length) * 100);
  const blocked = stages.some((item) => item.status === 'bloqueado');
  const status: EditarraPipelineState['status'] = publicationStatus === 'listo_para_publicar' && imageReady
    ? 'listo'
    : blocked
      ? 'bloqueado'
      : current.id === 'auditoria'
        ? 'control_humano'
        : 'operando';

  return {
    status,
    progress: Math.min(100, progress),
    currentStageId: current.id,
    nextControl: current.control,
    blockers,
    stages,
    actions: buildActions({ stages, currentStageId: current.id }),
  };
};

export const buildEditarraPipelineControlExecution = ({
  pipeline,
  topicTitle,
  recipeShortLabel,
  pendingGuidedEvidenceCount,
  canApproveGuidedAudit,
  guidedAuditRequirements,
  imageReady = false,
}: {
  pipeline: Pick<EditarraPipelineState, 'currentStageId'>;
  topicTitle: string;
  recipeShortLabel: string;
  pendingGuidedEvidenceCount: number;
  canApproveGuidedAudit: boolean;
  guidedAuditRequirements: string[];
  imageReady?: boolean;
}): EditarraPipelineControlExecution => {
  if (pipeline.currentStageId === 'agenda') {
    return {
      operation: 'apply_recipe',
      targetSurface: 'agenda',
      flowStatus: `Control pipeline: receta ${recipeShortLabel} aplicada a "${topicTitle}".`,
      auditEvent: {
        event: 'Control pipeline ejecutado',
        detail: `Agenda preparada para "${topicTitle}".`,
      },
    };
  }

  if (pipeline.currentStageId === 'fuentes') {
    const operation = pendingGuidedEvidenceCount > 0 ? 'complete_sources' : 'create_and_complete_source_slots';

    return {
      operation,
      operations: [operation],
      targetSurface: 'auditoria',
      flowStatus: operation === 'complete_sources'
        ? `Control pipeline: fuentes guiadas validadas para "${topicTitle}".`
        : `Control pipeline: fuentes guiadas preparadas y validadas para "${topicTitle}".`,
      auditEvent: {
        event: 'Control pipeline ejecutado',
        detail: operation === 'complete_sources'
          ? `Fuentes guiadas validadas para "${topicTitle}".`
          : `Fuentes guiadas preparadas y validadas para "${topicTitle}".`,
      },
    };
  }

  if (pipeline.currentStageId === 'ai') {
    return {
      operation: 'run_local_ai_and_apply',
      operations: ['run_local_ai_and_apply'],
      targetSurface: 'editor',
      flowStatus: `Control pipeline: AI local ejecutada y aplicada para "${topicTitle}".`,
      auditEvent: {
        event: 'Control pipeline ejecutado',
        detail: `AI local ejecutada y aplicada para "${topicTitle}".`,
      },
    };
  }

  if (pipeline.currentStageId === 'auditoria') {
    if (canApproveGuidedAudit && imageReady) {
      return {
        operation: 'approve_audit_and_prepare_payload',
        operations: ['approve_audit_and_prepare_payload'],
        targetSurface: 'publicacion',
        packageFileKey: 'publication_payload.json',
        flowStatus: `Control pipeline: auditoría aprobada y payload preparado para "${topicTitle}".`,
        auditEvent: {
          event: 'Control pipeline ejecutado',
          detail: `Auditoría aprobada, imagen lista y payload preparado para "${topicTitle}".`,
        },
      };
    }

    return {
      operation: 'approve_audit',
      operations: ['approve_audit'],
      targetSurface: canApproveGuidedAudit ? 'imagenes' : 'auditoria',
      packageFileKey: canApproveGuidedAudit ? 'image_prompt.json' : undefined,
      flowStatus: canApproveGuidedAudit
        ? `Control pipeline: auditoría aprobada para "${topicTitle}". Preparar prompt visual antes del payload.`
        : `Control pipeline pausado: ${guidedAuditRequirements.join(', ') || 'revisar auditoría'}.`,
      auditEvent: {
        event: 'Control pipeline ejecutado',
        detail: canApproveGuidedAudit
          ? `Auditoría aprobada para "${topicTitle}"; siguiente control visual.`
          : `Auditoría revisada para "${topicTitle}".`,
      },
    };
  }

  if (pipeline.currentStageId === 'imagenes') {
    return {
      operation: 'prepare_image',
      operations: ['prepare_image'],
      targetSurface: 'imagenes',
      packageFileKey: 'image_prompt.json',
      flowStatus: `Control pipeline: prompt visual preparado para "${topicTitle}".`,
      auditEvent: {
        event: 'Control pipeline ejecutado',
        detail: `Prompt visual preparado para "${topicTitle}".`,
      },
    };
  }

  return {
    operation: 'prepare_payload',
    targetSurface: 'publicacion',
    packageFileKey: 'publication_payload.json',
    flowStatus: `Payload final preparado para "${topicTitle}". Revisar preview y publication_payload.json antes de distribuir.`,
    auditEvent: {
      event: 'Control pipeline ejecutado',
      detail: `Payload preparado para "${topicTitle}".`,
    },
  };
};
