import {
  buildEditarraLocalAiResponse,
  parseEditarraAiResponse,
  type EditarraAiHandoff,
  type EditarraAiRunRequest,
} from './aiAdapter';
import type { EditarraOperationalTab } from './operationalCommitModel';
import type { EditorialPackageFileKey } from './operations';
import {
  createDraftVersionSnapshot,
  nextDraftVersionNumber,
} from './productionReducer';
import type {
  DraftVersion,
  EditarraProductionAction,
  EditorialDraft,
} from './productionReducer';
import type { EditorialProfile, NoteRecipe } from './profileModel';
import type { Topic } from './workspaceModel';

export type SingleNoteFlowOutcome = {
  productionActions?: EditarraProductionAction[];
  activeTab?: EditarraOperationalTab;
  packageFileKey?: EditorialPackageFileKey;
  aiResponseBuffer?: string;
  draftMode?: 'humanizado';
  registerPackage?: boolean;
  statuses: {
    ai?: string;
    draft?: string;
    package?: string;
    guidedFlow?: string;
  };
  audit?: {
    event: string;
    detail: string;
  };
};

export const buildAiBriefSelection = ({
  handoff,
  request,
  topic,
}: {
  handoff: EditarraAiHandoff;
  request: EditarraAiRunRequest;
  topic: Pick<Topic, 'title'>;
}): SingleNoteFlowOutcome => ({
  activeTab: 'config',
  packageFileKey: 'ai_brief.json',
  statuses: {
    ai: `Handoff AI preparado: ${handoff.nextAction} Request: ${request.id}.`,
  },
  audit: {
    event: 'Brief AI exportado',
    detail: `Brief provider-agnostic preparado para "${topic.title}" (${handoff.status}).`,
  },
});

export const buildLocalAiResponseGeneration = ({
  publicationPayload,
  currentDraft,
  operationModeName,
  recipe,
  request,
  topic,
}: {
  publicationPayload: Record<string, unknown>;
  currentDraft: Pick<EditorialDraft, 'body' | 'notes'>;
  operationModeName: string;
  recipe: Pick<NoteRecipe, 'shortLabel'>;
  request: Pick<EditarraAiRunRequest, 'id'>;
  topic: Pick<Topic, 'title'>;
}): SingleNoteFlowOutcome => ({
  aiResponseBuffer: buildEditarraLocalAiResponse({
    publicationPayload,
    fallbackBody: currentDraft.body,
    fallbackSummary: currentDraft.notes,
    sourceLabel: `${operationModeName} / ${recipe.shortLabel}`,
  }),
  packageFileKey: 'ai_brief.json',
  statuses: {
    ai: `Respuesta AI local generada sin POST externo. Revisar y aplicar desde cockpit (${request.id}).`,
  },
  audit: {
    event: 'Respuesta AI local generada',
    detail: `${operationModeName} para "${topic.title}" sin POST externo.`,
  },
});

export const buildLocalAiResponseGenerationAndApplication = ({
  publicationPayload,
  currentDraft,
  operationModeName,
  recipe,
  request,
  topic,
  handoff,
  now = new Date(),
}: {
  publicationPayload: Record<string, unknown>;
  currentDraft: EditorialDraft;
  operationModeName: string;
  recipe: Pick<NoteRecipe, 'shortLabel'>;
  request: Pick<EditarraAiRunRequest, 'id' | 'blocked'>;
  topic: Pick<Topic, 'title'>;
  handoff: Pick<EditarraAiHandoff, 'expectedFile' | 'nextAction' | 'status'>;
  now?: Date;
}): SingleNoteFlowOutcome => {
  if (handoff.status === 'requiere_fuentes') {
    return {
      activeTab: 'config',
      packageFileKey: 'ai_brief.json',
      statuses: {
        ai: `AI local no aplicada: request ${request.id} bloqueado (${handoff.status}). ${handoff.nextAction}`,
      },
      audit: {
        event: 'AI local bloqueada',
        detail: `Request ${request.id} para "${topic.title}" requiere completar controles previos.`,
      },
    };
  }

  const rawResponse = buildEditarraLocalAiResponse({
    publicationPayload,
    fallbackBody: currentDraft.body,
    fallbackSummary: currentDraft.notes,
    sourceLabel: `${operationModeName} / ${recipe.shortLabel}`,
  });
  const appliedOutcome = buildAiResponseApplication({
    rawResponse,
    currentDraft,
    topic,
    handoff,
    now,
  });

  if (!appliedOutcome.productionActions) {
    return {
      ...appliedOutcome,
      aiResponseBuffer: rawResponse,
      statuses: {
        ...appliedOutcome.statuses,
        ai: appliedOutcome.statuses.ai || `AI local generó respuesta pero no pudo aplicar "${topic.title}".`,
      },
    };
  }

  return {
    ...appliedOutcome,
    aiResponseBuffer: rawResponse,
    activeTab: 'editor',
    statuses: {
      ...appliedOutcome.statuses,
      ai: `AI local ejecutada y aplicada sin POST externo (${request.id}). ${appliedOutcome.statuses.ai || ''}`.trim(),
    },
    audit: {
      event: 'AI local ejecutada y aplicada',
      detail: `${operationModeName} aplicó respuesta local a "${topic.title}" desde ${handoff.expectedFile}.`,
    },
  };
};

export const buildAiResponseApplication = ({
  rawResponse,
  currentDraft,
  topic,
  handoff,
  now = new Date(),
}: {
  rawResponse: string;
  currentDraft: EditorialDraft;
  topic: Pick<Topic, 'title'>;
  handoff: Pick<EditarraAiHandoff, 'expectedFile'>;
  now?: Date;
}): SingleNoteFlowOutcome => {
  const parsed = parseEditarraAiResponse({
    raw: rawResponse,
    fallbackTitle: currentDraft.seoTitle,
    fallbackSummary: currentDraft.notes,
  });

  if (!parsed.ok) {
    return {
      statuses: {
        ai: parsed.error,
      },
    };
  }

  const updatedDraft: EditorialDraft = {
    ...currentDraft,
    title: `AI aplicado - ${parsed.value.title}`,
    seoTitle: parsed.value.metaTitle,
    body: parsed.value.body,
    notes: parsed.value.summary,
    status: 'listo',
    updatedAt: now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
  };

  return {
    productionActions: [{ type: 'draft/upsert', draft: updatedDraft }],
    draftMode: 'humanizado',
    activeTab: 'editor',
    statuses: {
      draft: `Respuesta AI aplicada y marcada como lista para "${topic.title}".`,
      ai: parsed.value.warnings.length > 0
        ? `Respuesta AI aplicada con advertencias: ${parsed.value.warnings.join(', ')}. Revisar quality_audit.json.`
        : 'Respuesta AI aplicada al borrador. Revisar quality_audit.json antes de publicar.',
    },
    audit: {
      event: 'Respuesta AI aplicada',
      detail: `JSON externo aplicado a "${topic.title}" desde ${handoff.expectedFile}.`,
    },
  };
};

export const buildGuidedAuditApproval = ({
  canApprove,
  requirements,
  currentDraft,
  draftVersions,
  selectedAuthorName,
  topic,
  profile,
  validatedEvidenceCount,
  openPackageFile = true,
  now = new Date(),
}: {
  canApprove: boolean;
  requirements: string[];
  currentDraft: EditorialDraft;
  draftVersions: DraftVersion[];
  selectedAuthorName: string;
  topic: Pick<Topic, 'title'>;
  profile: Pick<EditorialProfile, 'name'>;
  validatedEvidenceCount: number;
  openPackageFile?: boolean;
  now?: Date;
}): SingleNoteFlowOutcome => {
  const pendingDetail = requirements.join(', ') || 'revisar preflight editorial';
  const baseOutcome: SingleNoteFlowOutcome = {
    activeTab: openPackageFile ? 'config' : undefined,
    packageFileKey: 'quality_audit.json',
    statuses: {},
  };

  if (!canApprove) {
    return {
      ...baseOutcome,
      statuses: {
        package: `Auditoría pendiente: ${pendingDetail}.`,
      },
      audit: {
        event: 'Auditoría asistida pendiente',
        detail: `${requirements.join(', ') || 'preflight incompleto'} para "${topic.title}".`,
      },
    };
  }

  const approvedAt = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  const approvedDraft: EditorialDraft = {
    ...currentDraft,
    status: 'aprobado',
    updatedAt: approvedAt,
  };
  const nextVersion = createDraftVersionSnapshot({
    id: `version-${currentDraft.topicId}-audit-${now.getTime()}`,
    draft: currentDraft,
    version: nextDraftVersionNumber(draftVersions, currentDraft.topicId),
    status: 'aprobado',
    changeNote: `Auditoría asistida: estructura, quality_audit y ${validatedEvidenceCount} fuentes validadas.`,
    snapshotAt: approvedAt,
    authorName: selectedAuthorName,
  });

  return {
    ...baseOutcome,
    productionActions: [
      { type: 'draft/upsert', draft: approvedDraft },
      { type: 'draft-version/add', version: nextVersion },
    ],
    statuses: {
      draft: `Auditoría asistida aprobó "${topic.title}".`,
      package: `Auditoría asistida aprobó el borrador con ${validatedEvidenceCount} fuentes validadas; publication_payload.json queda como próximo paso.`,
    },
    audit: {
      event: 'Auditoría asistida aprobada',
      detail: `${topic.title} pasó a aprobado con perfil ${profile.name}.`,
    },
  };
};

export const buildAuditApprovalAndPayloadPreparation = ({
  canApprove,
  requirements,
  currentDraft,
  draftVersions,
  selectedAuthorName,
  topic,
  profile,
  validatedEvidenceCount,
  now = new Date(),
}: {
  canApprove: boolean;
  requirements: string[];
  currentDraft: EditorialDraft;
  draftVersions: DraftVersion[];
  selectedAuthorName: string;
  topic: Pick<Topic, 'title'>;
  profile: Pick<EditorialProfile, 'name'>;
  validatedEvidenceCount: number;
  now?: Date;
}): SingleNoteFlowOutcome => {
  const auditOutcome = buildGuidedAuditApproval({
    canApprove,
    requirements,
    currentDraft,
    draftVersions,
    selectedAuthorName,
    topic,
    profile,
    validatedEvidenceCount,
    openPackageFile: false,
    now,
  });

  if (!canApprove) {
    return auditOutcome;
  }

  return {
    ...auditOutcome,
    activeTab: 'publicacion',
    packageFileKey: 'publication_payload.json',
    registerPackage: true,
    statuses: {
      ...auditOutcome.statuses,
      package: `Auditoría asistida aprobó el borrador con ${validatedEvidenceCount} fuentes validadas; publication_payload.json quedó preparado.`,
      guidedFlow: `Payload final preparado para "${topic.title}" después de aprobar auditoría asistida. Revisar preview publicable antes de distribuir.`,
    },
    audit: {
      event: 'Auditoría y payload preparados',
      detail: `${topic.title} pasó a aprobado con perfil ${profile.name} y payload final listo.`,
    },
  };
};

export const buildFinalPayloadPreparation = ({
  topic,
}: {
  topic: Pick<Topic, 'title'>;
}): SingleNoteFlowOutcome => ({
  activeTab: 'publicacion',
  packageFileKey: 'publication_payload.json',
  registerPackage: true,
  statuses: {
    guidedFlow: `Payload final preparado para "${topic.title}". Revisar preview publicable y publication_payload.json antes de distribuir.`,
  },
});
