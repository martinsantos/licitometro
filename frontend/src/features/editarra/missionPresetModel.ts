import type { EditorialProfile, EditarraRecipeKey, NoteRecipe } from './profileModel';
import type { DraftExecutableRecipe } from './operations';
import type {
  Author,
  NoteVariableOverride,
  OperationalWorkspaceSnapshot,
  VisibleNoteVariable,
  WorkflowVariable,
} from './workspaceModel';
import { operationalPlanVariableKeys, upsertNoteVariableOverride } from './workspaceModel';

export type EditarraMissionPreset = {
  id: string;
  name: string;
  profileId: string;
  profileName: string;
  recipeId: EditarraRecipeKey;
  recipeLabel: string;
  authorName: string;
  intent: string;
  sourcePlan: string;
  structure: string[];
  sourceChecklist: string[];
  voiceBrief: string;
  influenceMode: string;
  variables: Array<{
    key: string;
    value: string;
    description: string;
    enabled: boolean;
  }>;
  createdAt: string;
};

export type MissionPresetApplication = {
  selectedRecipeId: EditarraRecipeKey;
  selectedSiteId?: string;
  authorPatch?: Pick<Author, 'voiceBrief' | 'influenceMode'>;
  noteVariableOverrides: NoteVariableOverride[];
  status: string;
};

export const missionPresetToExecutableRecipe = (preset: EditarraMissionPreset): DraftExecutableRecipe => {
  const enabledVariables = preset.variables.filter((variable) => (
    variable.enabled && variable.value.trim().length > 0
  ));

  return {
    intent: preset.intent,
    sourcePlan: preset.sourcePlan,
    variableCoverage: {
      completed: enabledVariables.length,
      total: preset.variables.length,
      label: `${enabledVariables.length}/${preset.variables.length} variables listas`,
    },
    structure: preset.structure,
    sourceChecklist: preset.sourceChecklist,
    influenceDirectives: [],
  };
};

export const mergeMissionPresetVariables = (
  workflowVariables: WorkflowVariable[],
  preset: EditarraMissionPreset,
): WorkflowVariable[] => {
  let mergedVariables = workflowVariables;

  preset.variables.forEach((presetVariable) => {
    const existing = mergedVariables.find((variable) => variable.key === presetVariable.key);

    if (existing) {
      mergedVariables = mergedVariables.map((variable) => (
        variable.key === presetVariable.key
          ? {
              ...variable,
              value: presetVariable.value,
              description: presetVariable.description,
              enabled: presetVariable.enabled,
            }
          : variable
      ));
      return;
    }

    mergedVariables = [
      ...mergedVariables,
      {
        id: `var-mission-${preset.id}-${presetVariable.key}`,
        key: presetVariable.key,
        value: presetVariable.value,
        scope: 'editor',
        description: presetVariable.description,
        enabled: presetVariable.enabled,
      },
    ];
  });

  return mergedVariables;
};

const presetTimestamp = (now = new Date()) => (
  now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
);

export const buildMissionPresetId = ({
  topicId,
  recipeId,
  nowMs = Date.now(),
}: {
  topicId: string;
  recipeId: EditarraRecipeKey;
  nowMs?: number;
}) => `mission-${topicId}-${recipeId}-${nowMs}`;

export const buildMissionPresetName = ({
  recipe,
  profile,
  topicTitle,
}: {
  recipe: Pick<NoteRecipe, 'shortLabel'>;
  profile: Pick<EditorialProfile, 'name'>;
  topicTitle: string;
}) => `${recipe.shortLabel} · ${profile.name} · ${topicTitle.slice(0, 48)}`;

export const createMissionPresetFromWorkspace = ({
  id,
  name,
  profile,
  recipe,
  author,
  workspace,
  visibleVariables,
  now = new Date(),
}: {
  id: string;
  name?: string;
  profile: EditorialProfile;
  recipe: NoteRecipe;
  author: Author;
  workspace: OperationalWorkspaceSnapshot;
  visibleVariables: VisibleNoteVariable[];
  now?: Date;
}): EditarraMissionPreset => ({
  id,
  name: name || buildMissionPresetName({ recipe, profile, topicTitle: workspace.topic.title }),
  profileId: profile.id,
  profileName: profile.name,
  recipeId: recipe.id,
  recipeLabel: recipe.label,
  authorName: author.name,
  intent: workspace.plan.intent,
  sourcePlan: workspace.plan.sourcePlan,
  structure: workspace.plan.structure,
  sourceChecklist: workspace.plan.sourceChecklist,
  voiceBrief: author.voiceBrief,
  influenceMode: author.influenceMode,
  variables: visibleVariables.map(({ key, value, description, enabled }) => ({
    key,
    value,
    description,
    enabled,
  })),
  createdAt: presetTimestamp(now),
});

export const applyMissionPresetToNote = ({
  preset,
  topicId,
  currentOverrides,
  availableProfiles,
  availableAuthors,
}: {
  preset: EditarraMissionPreset;
  topicId: string;
  currentOverrides: NoteVariableOverride[];
  availableProfiles: Array<Pick<EditorialProfile, 'id'>>;
  availableAuthors: Array<Pick<Author, 'name'>>;
}): MissionPresetApplication => {
  const upsert = (
    overrides: NoteVariableOverride[],
    key: string,
    value: string,
    description: string,
    enabled = true,
  ) => upsertNoteVariableOverride(overrides, {
    topicId,
    recipeId: preset.recipeId,
    key,
    value,
    description,
    idFactory: () => `mission-var-${topicId}-${preset.recipeId}-${key}`,
  }).map((override) => (
    override.topicId === topicId && override.recipeId === preset.recipeId && override.key === key
      ? { ...override, enabled }
      : override
  ));

  let noteVariableOverrides = upsert(
    currentOverrides,
    operationalPlanVariableKeys.intent,
    preset.intent,
    'Intención ejecutable guardada en preset de misión.',
  );
  noteVariableOverrides = upsert(
    noteVariableOverrides,
    operationalPlanVariableKeys.sourcePlan,
    preset.sourcePlan,
    'Plan de fuentes guardado en preset de misión.',
  );
  noteVariableOverrides = upsert(
    noteVariableOverrides,
    operationalPlanVariableKeys.structure,
    preset.structure.join('\n'),
    'Estructura guardada en preset de misión.',
  );
  noteVariableOverrides = upsert(
    noteVariableOverrides,
    operationalPlanVariableKeys.sourceChecklist,
    preset.sourceChecklist.join('\n'),
    'Checklist de fuentes guardado en preset de misión.',
  );
  preset.variables.forEach((variable) => {
    noteVariableOverrides = upsert(
      noteVariableOverrides,
      variable.key,
      variable.value,
      variable.description,
      variable.enabled,
    );
  });

  const authorExists = availableAuthors.some((author) => author.name === preset.authorName);

  return {
    selectedRecipeId: preset.recipeId,
    selectedSiteId: availableProfiles.some((profile) => profile.id === preset.profileId) ? preset.profileId : undefined,
    authorPatch: authorExists
      ? {
          voiceBrief: preset.voiceBrief,
          influenceMode: preset.influenceMode,
        }
      : undefined,
    noteVariableOverrides,
    status: `Preset de misión "${preset.name}" aplicado a la nota activa.`,
  };
};
