import {
  buildGuidedEvidenceCompletionUpdates,
  buildGuidedEvidenceSlots,
  isGuidedEvidenceRecord,
} from './generationFlow';
import type { EditorialProfile, NoteRecipe } from './profileModel';
import type { EvidenceRecord } from './productionReducer';
import type { Topic } from './workspaceModel';

export type EvidenceFlowOutcome = {
  productionAction?: (
    | { type: 'evidence/add'; evidence: EvidenceRecord }
    | { type: 'evidence/add-many'; evidence: EvidenceRecord[] }
    | { type: 'evidence/bulk-update'; updates: Array<{ evidenceId: string; patch: Partial<EvidenceRecord> }> }
    | { type: 'evidence/validate'; evidenceId: string; minConfidence?: number }
  );
  productionActions?: Array<
    | { type: 'evidence/add'; evidence: EvidenceRecord }
    | { type: 'evidence/add-many'; evidence: EvidenceRecord[] }
    | { type: 'evidence/bulk-update'; updates: Array<{ evidenceId: string; patch: Partial<EvidenceRecord> }> }
    | { type: 'evidence/validate'; evidenceId: string; minConfidence?: number }
  >;
  activeTab?: 'auditoria';
  packageFileKey?: 'evidence_log.json';
  packageStatus?: string;
  guidedFlowStatus?: string;
  audit: {
    event: string;
    detail: string;
  };
};

export type DailyBatchEvidenceControl = {
  active: boolean;
  topicIds: string[];
};

export const buildManualEvidenceCreation = ({
  id,
  topic,
}: {
  id: string;
  topic: Topic;
}): EvidenceFlowOutcome => ({
  productionAction: {
    type: 'evidence/add',
    evidence: {
      id,
      topicId: topic.id,
      sourceName: 'Nueva fuente',
      sourceUrl: 'https://',
      claim: 'Afirmacion a verificar antes de publicar.',
      status: 'pendiente',
      confidence: 50,
      notes: 'Describe alcance, fecha de consulta y limitaciones.',
    },
  },
  audit: {
    event: 'Evidencia agregada',
    detail: `Nueva evidencia para "${topic.title}".`,
  },
});

export const buildGuidedEvidenceSlotCreation = ({
  topic,
  recipe,
  profile,
  selectedTopicEvidence,
}: {
  topic: Topic;
  recipe: NoteRecipe;
  profile: EditorialProfile;
  selectedTopicEvidence: EvidenceRecord[];
}): EvidenceFlowOutcome => {
  const missingSources = Math.max(0, profile.sourceMinimum - selectedTopicEvidence.length);

  if (missingSources === 0) {
    return {
      activeTab: 'auditoria',
      packageFileKey: 'evidence_log.json',
      packageStatus: 'La matriz ya tiene la cantidad minima de fuentes; validar evidencia pendiente.',
      audit: {
        event: 'Evidencias guiadas revisadas',
        detail: `Matriz abierta para "${topic.title}".`,
      },
    };
  }

  const guidedEvidence = buildGuidedEvidenceSlots({
    topic,
    recipe,
    profile,
    existingEvidence: selectedTopicEvidence,
  }).evidence;

  return {
    productionAction: {
      type: 'evidence/add-many',
      evidence: guidedEvidence,
    },
    activeTab: 'auditoria',
    packageFileKey: 'evidence_log.json',
    packageStatus: `${guidedEvidence.length} evidencias guiadas creadas para completar ${profile.sourceMinimum} fuentes.`,
    audit: {
      event: 'Evidencias guiadas creadas',
      detail: `${guidedEvidence.length} slots para "${topic.title}" con receta ${recipe.shortLabel}.`,
    },
  };
};

export const buildEvidenceValidation = ({
  evidenceId,
  evidence,
  topic,
}: {
  evidenceId: string;
  evidence: EvidenceRecord[];
  topic: Topic;
}): EvidenceFlowOutcome => {
  const target = evidence.find((item) => item.id === evidenceId);

  return {
    productionAction: {
      type: 'evidence/validate',
      evidenceId,
      minConfidence: 75,
    },
    audit: {
      event: 'Evidencia validada',
      detail: `${target?.sourceName || evidenceId} para "${topic.title}".`,
    },
  };
};

export const buildGuidedEvidenceCompletion = ({
  topic,
  evidence,
  pendingGuidedEvidence,
}: {
  topic: Topic;
  evidence: EvidenceRecord[];
  pendingGuidedEvidence: EvidenceRecord[];
}): EvidenceFlowOutcome => {
  if (pendingGuidedEvidence.length === 0) {
    return {
      packageStatus: 'No hay evidencias guiadas pendientes para este tema.',
      guidedFlowStatus: `Sin fuentes guiadas pendientes para "${topic.title}".`,
      audit: {
        event: 'Evidencias guiadas revisadas',
        detail: `Sin pendientes para "${topic.title}".`,
      },
    };
  }

  const updates = buildGuidedEvidenceCompletionUpdates({
    topic,
    evidence,
    pendingGuidedEvidence,
  });

  return {
    productionAction: {
      type: 'evidence/bulk-update',
      updates,
    },
    packageFileKey: 'evidence_log.json',
    packageStatus: `${pendingGuidedEvidence.length} evidencias guiadas completadas y validadas para ${topic.title}.`,
    guidedFlowStatus: `${pendingGuidedEvidence.length} fuentes guiadas validadas para "${topic.title}". Próximo control: auditoría asistida.`,
    audit: {
      event: 'Evidencias guiadas validadas',
      detail: `${pendingGuidedEvidence.length} fuentes guiadas completadas para "${topic.title}".`,
    },
  };
};

export const buildGuidedEvidenceSlotCreationAndCompletion = ({
  topic,
  recipe,
  profile,
  selectedTopicEvidence,
}: {
  topic: Topic;
  recipe: NoteRecipe;
  profile: EditorialProfile;
  selectedTopicEvidence: EvidenceRecord[];
}): EvidenceFlowOutcome => {
  const slotCreation = buildGuidedEvidenceSlots({
    topic,
    recipe,
    profile,
    existingEvidence: selectedTopicEvidence,
  });

  if (slotCreation.evidence.length === 0) {
    return buildGuidedEvidenceCompletion({
      topic,
      evidence: selectedTopicEvidence,
      pendingGuidedEvidence: selectedTopicEvidence.filter((item) => isGuidedEvidenceRecord(item) && item.status !== 'validado'),
    });
  }

  const nextEvidence = [...selectedTopicEvidence, ...slotCreation.evidence];
  const updates = buildGuidedEvidenceCompletionUpdates({
    topic,
    evidence: nextEvidence,
    pendingGuidedEvidence: slotCreation.evidence,
  });

  return {
    productionActions: [
      {
        type: 'evidence/add-many',
        evidence: slotCreation.evidence,
      },
      {
        type: 'evidence/bulk-update',
        updates,
      },
    ],
    activeTab: 'auditoria',
    packageFileKey: 'evidence_log.json',
    packageStatus: `${slotCreation.evidence.length} evidencias guiadas creadas, completadas y validadas para ${topic.title}.`,
    guidedFlowStatus: `${slotCreation.evidence.length} fuentes guiadas preparadas y validadas para "${topic.title}". Próximo control: AI por perfil.`,
    audit: {
      event: 'Evidencias guiadas preparadas y validadas',
      detail: `${slotCreation.evidence.length} fuentes creadas y validadas para "${topic.title}" con receta ${recipe.shortLabel}.`,
    },
  };
};

export const buildDailyBatchGuidedEvidenceCompletion = ({
  control,
  topics,
  evidence,
  profileName,
}: {
  control: DailyBatchEvidenceControl;
  topics: Topic[];
  evidence: EvidenceRecord[];
  profileName: string;
}): EvidenceFlowOutcome => {
  if (!control.active || control.topicIds.length === 0) {
    return {
      packageStatus: 'No hay tanda diaria activa para validar.',
      guidedFlowStatus: 'Selecciona una nota creada por tanda diaria para operar sus fuentes como lote.',
      audit: {
        event: 'Fuentes de tanda revisadas',
        detail: 'Sin tanda diaria activa.',
      },
    };
  }

  const batchTopics = topics.filter((topic) => control.topicIds.includes(topic.id));
  const pendingBatchGuidedEvidence = evidence.filter((item) => (
    control.topicIds.includes(item.topicId)
    && isGuidedEvidenceRecord(item)
    && item.status !== 'validado'
  ));

  if (pendingBatchGuidedEvidence.length === 0) {
    return {
      packageStatus: 'No hay evidencias guiadas pendientes para esta tanda diaria.',
      guidedFlowStatus: 'Sin fuentes guiadas pendientes para la tanda diaria activa.',
      audit: {
        event: 'Fuentes de tanda revisadas',
        detail: 'Sin pendientes para la tanda diaria activa.',
      },
    };
  }

  const updates = batchTopics.flatMap((topic) => buildGuidedEvidenceCompletionUpdates({
    topic,
    evidence,
    pendingGuidedEvidence: pendingBatchGuidedEvidence.filter((item) => item.topicId === topic.id),
  }));

  return {
    productionAction: {
      type: 'evidence/bulk-update',
      updates,
    },
    packageFileKey: 'evidence_log.json',
    packageStatus: `${updates.length} evidencias guiadas completadas y validadas para la tanda diaria ${profileName}.`,
    guidedFlowStatus: `${updates.length} fuentes guiadas validadas para la tanda diaria (${batchTopics.length} notas). Próximo control: AI por nota.`,
    audit: {
      event: 'Fuentes de tanda validadas',
      detail: `${updates.length} fuentes guiadas completadas para ${batchTopics.map((topic) => `"${topic.title}"`).join(', ')}.`,
    },
  };
};
