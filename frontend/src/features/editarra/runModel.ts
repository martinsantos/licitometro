import type { EditarraAiHandoffStatus } from './aiAdapter';
import type { EditarraPipelineState } from './pipelineModel';
import type { EditorialOperationMode, EditorialProfile, NoteRecipe } from './profileModel';
import type { Author, NoteVariableOverride, OperationalWorkspaceSnapshot, Topic, VisibleNoteVariable, WorkflowVariable } from './workspaceModel';

export type EditarraRuntimeReadiness = 'listo' | 'configurar' | 'bloqueado';
export type EditarraRunMode = 'single_note' | 'daily_batch';
export type EditarraRunVariableGroup = 'tono' | 'seo' | 'narrativa' | 'fuentes' | 'referencias' | 'sistema';

export type EditarraProfileRuntime = {
  id: string;
  profileId: string;
  profileName: string;
  site: string;
  model: string;
  endpoint: string;
  postingMode: EditorialProfile['postingMode'];
  readiness: EditarraRuntimeReadiness;
  label: string;
  blockers: string[];
  author: {
    id: string;
    name: string;
    active: boolean;
    voiceBrief: string;
    influenceMode: string;
    referencesToFollow: string[];
    referencesToAvoid: string[];
    influenceCount: number;
  };
  toneSystem: {
    profileTone: string;
    authorTone: string[];
    styleWeights: Author['styleWeights'];
    guardrails: string[];
  };
  controls: {
    sourceMinimum: number;
    cadence: string;
    externalPostEnabled: boolean;
  };
};

export type EditarraRunVariable = {
  key: string;
  value: string;
  description: string;
  enabled: boolean;
  source: VisibleNoteVariable['source'];
  group: EditarraRunVariableGroup;
};

export type EditarraNoteRun = {
  id: string;
  mode: EditarraRunMode;
  topicId: string;
  topicTitle: string;
  recipeId: NoteRecipe['id'];
  recipeLabel: string;
  operationModeId: string;
  operationModeLabel: string;
  executableRecipe: OperationalWorkspaceSnapshot['plan'];
  profileRuntime: EditarraProfileRuntime;
  pipeline: {
    status: EditarraPipelineState['status'];
    progress: number;
    currentStageId: EditarraPipelineState['currentStageId'];
    nextControl: string;
    blockers: string[];
  };
  variables: {
    total: number;
    noteOverrides: number;
    byGroup: Record<EditarraRunVariableGroup, EditarraRunVariable[]>;
  };
  ai: {
    handoffStatus: EditarraAiHandoffStatus;
    sendFile: string;
    expectedFile: string;
  };
  exportKeys: string[];
};

const variableGroups: EditarraRunVariableGroup[] = ['tono', 'seo', 'narrativa', 'fuentes', 'referencias', 'sistema'];

export const classifyRunVariable = (variable: Pick<WorkflowVariable, 'key' | 'scope' | 'description'>): EditarraRunVariableGroup => {
  const haystack = `${variable.key} ${variable.scope} ${variable.description}`.toLowerCase();

  if (haystack.includes('tono') || haystack.includes('voz') || haystack.includes('estilo')) {
    return 'tono';
  }

  if (variable.scope === 'seo' || haystack.includes('keyword') || haystack.includes('seo')) {
    return 'seo';
  }

  if (haystack.includes('fuente') || haystack.includes('norma') || haystack.includes('documentacion')) {
    return 'fuentes';
  }

  if (haystack.includes('referencia') || haystack.includes('influencia') || haystack.includes('autor')) {
    return 'referencias';
  }

  if (variable.scope === 'sistema') {
    return 'sistema';
  }

  return 'narrativa';
};

export const buildEditarraProfileRuntime = ({
  profile,
  author,
}: {
  profile: EditorialProfile;
  author: Author;
}): EditarraProfileRuntime => {
  const blockers = [
    profile.name.trim() ? '' : 'nombre de perfil',
    profile.tone.trim() ? '' : 'tono editorial',
    profile.guardrails.length > 0 ? '' : 'guardrails',
    author.active ? '' : 'autor pausado',
    author.voiceBrief.trim() ? '' : 'brief de voz',
    author.influenceMode.trim() || author.influences.length > 0 ? '' : 'influencias',
    profile.sourceMinimum > 0 ? '' : 'fuentes minimas',
  ].filter(Boolean);
  const readiness: EditarraRuntimeReadiness = blockers.length === 0
    ? 'listo'
    : blockers.includes('autor pausado')
      ? 'bloqueado'
      : 'configurar';

  return {
    id: `runtime-${profile.id}-${author.id}`,
    profileId: profile.id,
    profileName: profile.name,
    site: profile.site,
    model: profile.model,
    endpoint: profile.endpoint,
    postingMode: profile.postingMode,
    readiness,
    label: readiness === 'listo' ? 'perfil operativo listo' : readiness === 'bloqueado' ? 'perfil bloqueado' : 'perfil por configurar',
    blockers,
    author: {
      id: author.id,
      name: author.name,
      active: author.active,
      voiceBrief: author.voiceBrief,
      influenceMode: author.influenceMode,
      referencesToFollow: author.references,
      referencesToAvoid: author.antiReferences,
      influenceCount: author.influences.length,
    },
    toneSystem: {
      profileTone: profile.tone,
      authorTone: author.tone,
      styleWeights: author.styleWeights,
      guardrails: profile.guardrails,
    },
    controls: {
      sourceMinimum: profile.sourceMinimum,
      cadence: profile.cadence,
      externalPostEnabled: profile.postingMode === 'automatico',
    },
  };
};

const buildVariablesByGroup = ({
  visibleVariables,
  workflowVariables,
}: {
  visibleVariables: VisibleNoteVariable[];
  workflowVariables: WorkflowVariable[];
}): Record<EditarraRunVariableGroup, EditarraRunVariable[]> => {
  const workflowByKey = new Map(workflowVariables.map((variable) => [variable.key, variable]));
  const grouped = variableGroups.reduce((accumulator, group) => ({
    ...accumulator,
    [group]: [],
  }), {} as Record<EditarraRunVariableGroup, EditarraRunVariable[]>);

  visibleVariables.forEach((variable) => {
    const workflowVariable = workflowByKey.get(variable.key);
    const group = workflowVariable
      ? classifyRunVariable(workflowVariable)
      : classifyRunVariable({ key: variable.key, scope: 'editor', description: variable.description });

    grouped[group].push({
      key: variable.key,
      value: variable.value,
      description: variable.description,
      enabled: variable.enabled,
      source: variable.source,
      group,
    });
  });

  return grouped;
};

export const buildEditarraNoteRun = ({
  topic,
  recipe,
  operationMode,
  profileRuntime,
  pipelineState,
  visibleVariables,
  workflowVariables,
  noteVariableOverrides,
  aiHandoff,
  exportKeys,
  executableRecipe,
  mode = 'single_note',
}: {
  topic: Topic;
  recipe: NoteRecipe;
  operationMode: EditorialOperationMode;
  profileRuntime: EditarraProfileRuntime;
  pipelineState: EditarraPipelineState;
  visibleVariables: VisibleNoteVariable[];
  workflowVariables: WorkflowVariable[];
  noteVariableOverrides: NoteVariableOverride[];
  aiHandoff: {
    status: EditarraAiHandoffStatus;
    sendFile: string;
    expectedFile: string;
  };
  exportKeys: string[];
  executableRecipe: OperationalWorkspaceSnapshot['plan'];
  mode?: EditarraRunMode;
}): EditarraNoteRun => ({
  id: `run-${topic.id}-${recipe.id}-${profileRuntime.profileId}`,
  mode,
  topicId: topic.id,
  topicTitle: topic.title,
  recipeId: recipe.id,
  recipeLabel: recipe.shortLabel,
  operationModeId: operationMode.id,
  operationModeLabel: operationMode.shortLabel,
  executableRecipe,
  profileRuntime,
  pipeline: {
    status: pipelineState.status,
    progress: pipelineState.progress,
    currentStageId: pipelineState.currentStageId,
    nextControl: pipelineState.nextControl,
    blockers: pipelineState.blockers,
  },
  variables: {
    total: visibleVariables.length,
    noteOverrides: noteVariableOverrides.length,
    byGroup: buildVariablesByGroup({ visibleVariables, workflowVariables }),
  },
  ai: {
    handoffStatus: aiHandoff.status,
    sendFile: aiHandoff.sendFile,
    expectedFile: aiHandoff.expectedFile,
  },
  exportKeys,
});
