import type { EditarraRecipeKey, EditorialOperationMode, NoteRecipe } from './profileModel';
import { candidateToTopic, type DiscoveryCandidate, type DiscoveryCandidateStatus, type EditorialAgenda } from './radarModel';
import type { EditorialPackageFileKey } from './operations';
import type { DraftVariantKey } from './operations';
import type { Topic } from './workspaceModel';

export type CandidateConversionTab = 'editor';
export type CandidateConversionEditorSurface = 'draft';

export type CandidateTopicConversion = {
  status: 'converted';
  candidateId: string;
  candidateStatus: DiscoveryCandidateStatus;
  topic: Topic;
  selectedTopicId: string;
  query: '';
  statusFilter: 'todos';
  workspaceOpen: true;
  discoveryStatus: string;
  audit: {
    event: string;
    detail: string;
  };
};

export type CandidateNoteRunConversion = CandidateTopicConversion & {
  activeTab: CandidateConversionTab;
  editorSurface: CandidateConversionEditorSurface;
  draftMode: DraftVariantKey;
  packageFileKey: EditorialPackageFileKey;
  selectedRecipeId?: EditarraRecipeKey;
  selectedOperationModeId?: string;
  draftStatusMessage: string;
  packageStatus: string;
  guidedFlowStatus: string;
};

export type CandidateConversionMissing = {
  status: 'missing-candidate';
  candidateId: string;
  discoveryStatus: string;
};

export type CandidateConversionReadiness = {
  ready: boolean;
  reason: string;
  warnings: string[];
};

const weakCandidateWarningPatterns = [
  'cobertura de fuente',
  'revisar relevancia',
  'sin detalles tecnicos',
  'sin detalles técnicos',
  'portadas',
  'indices',
  'índices',
  'sin evidencia editorial',
];

export const resolveCandidateConversionReadiness = (candidate: DiscoveryCandidate): CandidateConversionReadiness => {
  const warnings = candidate.warnings || [];
  const lowerWarnings = warnings.map((warning) => warning.toLowerCase());
  const hasWeakWarning = lowerWarnings.some((warning) => (
    weakCandidateWarningPatterns.some((pattern) => warning.includes(pattern))
  ));

  if (candidate.status === 'descartado') {
    return {
      ready: false,
      reason: 'Candidato descartado.',
      warnings,
    };
  }

  if (hasWeakWarning) {
    return {
      ready: false,
      reason: 'Requiere revisión: Radar lo marcó como señal débil o fuente de cobertura.',
      warnings,
    };
  }

  if (candidate.score < 52) {
    return {
      ready: false,
      reason: 'Score editorial bajo: preselecciona o ajusta antes de convertir.',
      warnings,
    };
  }

  if (candidate.matchedInterests.length === 0) {
    return {
      ready: false,
      reason: 'Sin intereses coincidentes de la agenda.',
      warnings,
    };
  }

  if (!candidate.sourceUrl.trim()) {
    return {
      ready: false,
      reason: 'Sin URL fuente auditable.',
      warnings,
    };
  }

  return {
    ready: true,
    reason: 'Listo para convertir con revisión humana.',
    warnings,
  };
};

export const buildCandidateTopicConversion = ({
  candidate,
  agenda,
}: {
  candidate?: DiscoveryCandidate;
  agenda: EditorialAgenda;
}): CandidateTopicConversion | CandidateConversionMissing => {
  if (!candidate) {
    return {
      status: 'missing-candidate',
      candidateId: '',
      discoveryStatus: 'Candidato no encontrado.',
    };
  }

  const topic = candidateToTopic(candidate, agenda);

  return {
    status: 'converted',
    candidateId: candidate.id,
    candidateStatus: 'convertido',
    topic,
    selectedTopicId: topic.id,
    query: '',
    statusFilter: 'todos',
    workspaceOpen: true,
    discoveryStatus: `Tema creado: ${topic.title}.`,
    audit: {
      event: 'Candidato convertido en tema',
      detail: `${candidate.title} paso a Parrilla desde ${agenda.name}.`,
    },
  };
};

export const buildCandidateNoteRunConversion = ({
  candidate,
  agenda,
  recipes,
  operationModes,
}: {
  candidate?: DiscoveryCandidate;
  agenda: EditorialAgenda;
  recipes: NoteRecipe[];
  operationModes: EditorialOperationMode[];
}): CandidateNoteRunConversion | CandidateConversionMissing => {
  const topicConversion = buildCandidateTopicConversion({ candidate, agenda });

  if (topicConversion.status === 'missing-candidate') {
    return topicConversion;
  }

  const selectedRecipeId = recipes.some((recipe) => recipe.id === candidate?.recommendedRecipeId)
    ? candidate?.recommendedRecipeId
    : undefined;
  const selectedOperationModeId = operationModes.some((mode) => mode.id === candidate?.recommendedOperationModeId)
    ? candidate?.recommendedOperationModeId
    : undefined;

  return {
    ...topicConversion,
    topic: {
      ...topicConversion.topic,
      status: 'redaccion',
    },
    activeTab: 'editor',
    editorSurface: 'draft',
    draftMode: 'humanizado',
    packageFileKey: 'note_run.json',
    selectedRecipeId,
    selectedOperationModeId,
    draftStatusMessage: `NoteRun preparado para "${topicConversion.topic.title}". Ejecuta Generar borrador cuando apruebes variables y fuentes.`,
    packageStatus: 'note_run.json recalculado desde candidato Radar.',
    guidedFlowStatus: `Candidato convertido en NoteRun manual: ${topicConversion.topic.title}.`,
    discoveryStatus: `NoteRun creado para ${topicConversion.topic.title}.`,
  };
};

export const upsertConvertedTopic = (topics: Topic[], topic: Topic): Topic[] => (
  topics.some((currentTopic) => currentTopic.id === topic.id)
    ? topics.map((currentTopic) => (currentTopic.id === topic.id ? { ...currentTopic, ...topic } : currentTopic))
    : [...topics, topic]
);
