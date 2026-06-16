import { createGuidedRunRecord } from './guidedEngine';
import { buildDailyBatchAiDraft } from './operationalRunModel';
import type { EditarraOperationalTab } from './operationalCommitModel';
import type { EditorialPackageFileKey } from './operations';
import {
  createDraftVersionSnapshot,
  nextDraftVersionNumber,
} from './productionReducer';
import type {
  DraftStatus,
  DraftVersion,
  EditarraProductionAction,
  EditorialDraft,
  EvidenceRecord,
} from './productionReducer';
import type { EditorialProfile, EditarraRecipeKey, NoteRecipe } from './profileModel';
import type { Topic, WorkflowVariable } from './workspaceModel';

export type DailyBatchFlowControl = {
  active: boolean;
  topicIds: string[];
  topicCount: number;
  validated: number;
  sourceMinimum: number;
  aiReady: number;
  auditApproved: number;
  payloadReady: number;
};

export type DailyBatchFlowOutcome = {
  productionAction?: EditarraProductionAction;
  draftMode?: 'humanizado';
  activeTab?: EditarraOperationalTab;
  packageFileKey?: EditorialPackageFileKey;
  statuses: {
    ai?: string;
    draft?: string;
    package?: string;
    guidedFlow: string;
  };
  audit: {
    event: string;
    detail: string;
  };
  registerPackage?: boolean;
};

const inactiveBatchOutcome = ({
  ai,
  packageStatus,
  guidedFlow,
  auditEvent,
}: {
  ai?: string;
  packageStatus?: string;
  guidedFlow: string;
  auditEvent: string;
}): DailyBatchFlowOutcome => ({
  statuses: {
    ai,
    package: packageStatus,
    guidedFlow,
  },
  audit: {
    event: auditEvent,
    detail: 'Sin tanda diaria activa.',
  },
});

export const buildDailyBatchAiApplication = ({
  control,
  topics,
  selectedTopic,
  profile,
  selectedRecipe,
  recipes,
  evidence,
  drafts,
  effectiveVariables,
  existingGuidedRunRecords,
  getRecipeId,
  now = new Date(),
}: {
  control: DailyBatchFlowControl;
  topics: Topic[];
  selectedTopic: Topic;
  profile: EditorialProfile;
  selectedRecipe: NoteRecipe;
  recipes: NoteRecipe[];
  evidence: EvidenceRecord[];
  drafts: EditorialDraft[];
  effectiveVariables: WorkflowVariable[];
  existingGuidedRunRecords: ReturnType<typeof createGuidedRunRecord>[];
  getRecipeId: (topicId: string) => EditarraRecipeKey;
  now?: Date;
}): DailyBatchFlowOutcome => {
  if (!control.active || control.topicIds.length === 0) {
    return inactiveBatchOutcome({
      ai: 'No hay tanda diaria activa para aplicar AI por lote.',
      guidedFlow: 'Selecciona una nota creada por tanda diaria para operar AI por lote.',
      auditEvent: 'AI de tanda revisada',
    });
  }

  if (control.validated < control.sourceMinimum) {
    return {
      statuses: {
        ai: `Validar fuentes antes de AI de tanda: ${control.validated}/${control.sourceMinimum}.`,
        guidedFlow: 'AI de tanda bloqueada hasta validar todas las fuentes guiadas del lote.',
      },
      audit: {
        event: 'AI de tanda bloqueada',
        detail: `${control.validated}/${control.sourceMinimum} fuentes validadas.`,
      },
    };
  }

  const updatedAt = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  const batchTopics = topics.filter((topic) => control.topicIds.includes(topic.id));
  const nextDrafts = drafts.map((draft) => {
    if (!control.topicIds.includes(draft.topicId)) {
      return draft;
    }

    const topic = batchTopics.find((item) => item.id === draft.topicId) || selectedTopic;
    const recipe = recipes.find((item) => item.id === getRecipeId(topic.id)) || selectedRecipe;
    const topicEvidence = evidence.filter((item) => item.topicId === topic.id && item.status === 'validado');

    return buildDailyBatchAiDraft({
      draft,
      topic,
      recipe,
      topicEvidence,
      profile,
      effectiveVariables,
      updatedAt,
    });
  });
  const nextGuidedRuns = [
    ...batchTopics.map((topic) => createGuidedRunRecord({
      topicId: topic.id,
      recipeId: getRecipeId(topic.id),
      profileId: profile.id,
      now,
      run: {
        status: 'pausado',
        steps: ['fuentes validadas', 'ai aplicada'],
        nextControl: 'Aprobar auditoría asistida',
        summary: `AI de tanda aplicada para ${topic.title}.`,
      },
    })),
    ...existingGuidedRunRecords,
  ].slice(0, 80);

  return {
    productionAction: {
      type: 'state/patch',
      patch: {
        drafts: nextDrafts,
        guidedRunRecords: nextGuidedRuns,
      },
    },
    draftMode: 'humanizado',
    packageFileKey: 'quality_audit.json',
    statuses: {
      ai: `AI de tanda aplicada a ${batchTopics.length} notas. Revisar auditoría y payload por nota.`,
      draft: `AI de tanda aplicada; nota activa lista: "${selectedTopic.title}".`,
      guidedFlow: `AI de tanda aplicada a ${batchTopics.length} notas. Próximo control: auditoría asistida por nota.`,
    },
    audit: {
      event: 'AI de tanda aplicada',
      detail: `${batchTopics.length} borradores marcados como listos desde ${profile.name}.`,
    },
  };
};

export const buildDailyBatchAuditApproval = ({
  control,
  topics,
  selectedTopic,
  selectedAuthorName,
  profile,
  drafts,
  draftVersions,
  existingGuidedRunRecords,
  getRecipeId,
  now = new Date(),
}: {
  control: DailyBatchFlowControl;
  topics: Topic[];
  selectedTopic: Topic;
  selectedAuthorName: string;
  profile: EditorialProfile;
  drafts: EditorialDraft[];
  draftVersions: DraftVersion[];
  existingGuidedRunRecords: ReturnType<typeof createGuidedRunRecord>[];
  getRecipeId: (topicId: string) => EditarraRecipeKey;
  now?: Date;
}): DailyBatchFlowOutcome => {
  if (!control.active || control.topicIds.length === 0) {
    return inactiveBatchOutcome({
      packageStatus: 'No hay tanda diaria activa para aprobar.',
      guidedFlow: 'Selecciona una nota creada por tanda diaria para cerrar auditoría como lote.',
      auditEvent: 'Auditoría de tanda revisada',
    });
  }

  if (control.aiReady < control.topicCount || control.validated < control.sourceMinimum) {
    return {
      statuses: {
        package: `Auditoría de tanda pendiente: AI ${control.aiReady}/${control.topicCount}, fuentes ${control.validated}/${control.sourceMinimum}.`,
        guidedFlow: 'La tanda necesita fuentes validadas y AI aplicada antes de aprobar auditoría.',
      },
      audit: {
        event: 'Auditoría de tanda pendiente',
        detail: `AI ${control.aiReady}/${control.topicCount}; fuentes ${control.validated}/${control.sourceMinimum}.`,
      },
    };
  }

  const approvedAt = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  const batchDrafts = drafts.filter((draft) => control.topicIds.includes(draft.topicId));
  const nextDrafts = drafts.map((draft) => (
    control.topicIds.includes(draft.topicId)
      ? { ...draft, status: 'aprobado' as DraftStatus, updatedAt: approvedAt }
      : draft
  ));
  const batchTopics = topics.filter((topic) => control.topicIds.includes(topic.id));
  const nextVersions = batchDrafts.map((draft) => {
    const topic = batchTopics.find((item) => item.id === draft.topicId);

    return createDraftVersionSnapshot({
      id: `version-${draft.topicId}-batch-audit-${now.getTime()}`,
      draft,
      version: nextDraftVersionNumber(draftVersions, draft.topicId),
      status: 'aprobado',
      changeNote: `Auditoría de tanda: fuentes ${profile.sourceMinimum}/${profile.sourceMinimum}, AI aplicada y payload pendiente.`,
      snapshotAt: approvedAt,
      authorName: topic?.author || selectedAuthorName,
    });
  });

  return {
    productionAction: {
      type: 'state/patch',
      patch: {
        drafts: nextDrafts,
        draftVersions: [...nextVersions, ...draftVersions].slice(0, 120),
        guidedRunRecords: [
          ...batchTopics.map((topic) => createGuidedRunRecord({
            topicId: topic.id,
            recipeId: getRecipeId(topic.id),
            profileId: profile.id,
            now,
            run: {
              status: 'completo',
              steps: ['fuentes validadas', 'ai aplicada', 'auditoría aprobada'],
              nextControl: 'Preparar payload de tanda',
              summary: `Auditoría de tanda aprobada para ${topic.title}.`,
            },
          })),
          ...existingGuidedRunRecords,
        ].slice(0, 80),
      },
    },
    packageFileKey: 'quality_audit.json',
    statuses: {
      package: `Auditoría de tanda aprobó ${batchDrafts.length} borradores; publication_payload.json queda como próximo paso.`,
      draft: `Auditoría de tanda aprobada; nota activa: "${selectedTopic.title}".`,
      guidedFlow: `Auditoría de tanda aprobada para ${batchDrafts.length} notas. Próximo control: preparar payload de tanda.`,
    },
    audit: {
      event: 'Auditoría de tanda aprobada',
      detail: `${batchDrafts.length} borradores aprobados desde ${profile.name}.`,
    },
  };
};

export const buildDailyBatchPayloadPreparation = ({
  control,
}: {
  control: DailyBatchFlowControl;
}): DailyBatchFlowOutcome => {
  if (!control.active || control.topicIds.length === 0) {
    return inactiveBatchOutcome({
      packageStatus: 'No hay tanda diaria activa para preparar payload.',
      guidedFlow: 'Selecciona una nota creada por tanda diaria para preparar payload de lote.',
      auditEvent: 'Payload de tanda revisado',
    });
  }

  if (control.auditApproved < control.topicCount) {
    return {
      statuses: {
        package: `Payload de tanda bloqueado: auditoría ${control.auditApproved}/${control.topicCount}.`,
        guidedFlow: 'Aprobar auditoría de tanda antes de preparar payload de lote.',
      },
      audit: {
        event: 'Payload de tanda bloqueado',
        detail: `Auditoría ${control.auditApproved}/${control.topicCount}.`,
      },
    };
  }

  return {
    activeTab: 'config',
    packageFileKey: 'package_manifest.json',
    registerPackage: true,
    statuses: {
      package: `Manifest de tanda listo: ${control.payloadReady}/${control.topicCount} payloads publicables.`,
      guidedFlow: `Payload de tanda preparado para ${control.topicCount} notas. Exportar JSON o revisar distribution_plan.`,
    },
    audit: {
      event: 'Payload de tanda preparado',
      detail: `${control.topicCount} notas listas para exportar como JSON/payload.`,
    },
  };
};
