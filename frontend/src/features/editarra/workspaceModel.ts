import { defaultNoteVariableValues } from './profileModel';
import type { EditorialProfile, EditarraRecipeKey, NoteRecipe } from './profileModel';

export type TopicStatus = 'sugerido' | 'aprobado' | 'redaccion' | 'publicado' | 'descartado';
export type VariableScope = 'agenda' | 'editor' | 'seo' | 'imagenes' | 'sistema';
export type InfluenceRelation = 'adherir' | 'consultar' | 'evitar';
export type StyleWeightKey = 'claridad' | 'evidencia' | 'opinion' | 'humanidad' | 'seo';

export type Topic = {
  id: string;
  title: string;
  status: TopicStatus;
  priority: number;
  depth: 'Alta' | 'Media' | 'Breve';
  tokens: number;
  author: string;
  source: string;
  narrative: string;
  seo: string;
  publishAt: string;
  agendaId?: string;
  candidateId?: string;
  destinationProfileId?: string;
  recipeId?: EditarraRecipeKey;
  operationModeId?: string;
  trope?: string;
  interests?: string[];
  discoverySourceUrl?: string;
};

export type AuthorInfluence = {
  id: string;
  reference: string;
  relation: InfluenceRelation;
  weight: number;
  notes: string;
};

export type Author = {
  id: string;
  name: string;
  role: string;
  active: boolean;
  models: string;
  tone: string[];
  banned: string[];
  mix: string;
  score: number;
  voiceBrief: string;
  register: string;
  rhythm: string;
  stance: string;
  density: string;
  locality: string;
  influenceMode: string;
  references: string[];
  antiReferences: string[];
  styleWeights: Record<StyleWeightKey, number>;
  influences: AuthorInfluence[];
};

export type AuthorField = keyof Pick<
  Author,
  'name' | 'role' | 'models' | 'mix' | 'score' | 'voiceBrief' | 'register' | 'rhythm' | 'stance' | 'density' | 'locality' | 'influenceMode'
>;

export type WorkflowVariable = {
  id: string;
  key: string;
  value: string;
  scope: VariableScope;
  description: string;
  enabled: boolean;
};

export type NoteVariableOverride = {
  id: string;
  topicId: string;
  recipeId: EditarraRecipeKey;
  key: string;
  value: string;
  description: string;
  enabled: boolean;
};

export type VisibleNoteVariable = {
  key: string;
  value: string;
  enabled: boolean;
  description: string;
  source: 'nota' | 'perfil';
};

export type OperationalWorkspacePlan = {
  intent: string;
  sourcePlan: string;
  defaultDepth: NoteRecipe['defaultDepth'];
  defaultTokens: number;
  variableCoverage: {
    completed: number;
    total: number;
    label: string;
  };
  structure: string[];
  sourceChecklist: string[];
  influenceDirectives: Array<{
    reference: string;
    relation: InfluenceRelation;
    weight: number;
  }>;
  overrideKeys: {
    intent: string;
    sourcePlan: string;
    structure: string;
    sourceChecklist: string;
  };
};

export const operationalPlanVariableKeys = {
  intent: 'editarra_plan_intent',
  sourcePlan: 'editarra_plan_source_plan',
  structure: 'editarra_plan_structure',
  sourceChecklist: 'editarra_plan_source_checklist',
} as const;

export type OperationalWorkspaceSnapshot = {
  readiness: {
    status: 'bloqueado' | 'preparacion' | 'listo';
    label: string;
    tone: 'emerald' | 'blue' | 'amber' | 'rose' | 'slate' | 'violet';
    blockers: string[];
  };
  profile: {
    id: string;
    name: string;
    site: string;
    postingMode: EditorialProfile['postingMode'];
    sourceMinimum: number;
    tone: string;
    guardrails: string[];
  };
  recipe: {
    id: EditarraRecipeKey;
    label: string;
    shortLabel: string;
    category: NoteRecipe['category'];
    publishAt: string;
  };
  topic: Pick<Topic, 'id' | 'title' | 'status' | 'priority' | 'publishAt'>;
  author: {
    id: string;
    name: string;
    active: boolean;
    score: number;
    tone: string[];
    influenceCount: number;
    primaryInfluences: string[];
  };
  counts: {
    activeAuthors: number;
    totalAuthors: number;
    enabledVariables: number;
    recipeVariables: number;
    noteOverrides: number;
    guardrails: number;
    sources: number;
    sourceMinimum: number;
    preflightBlockers: number;
  };
  variables: VisibleNoteVariable[];
  plan: OperationalWorkspacePlan;
};

const recipeStructureById: Record<EditarraRecipeKey, string[]> = {
  reactiva: [
    'Qué cambió, cuándo y fuente primaria.',
    'Impacto operativo inmediato y alcance.',
    'Qué falta verificar antes de decidir.',
    'Cierre con acción mínima auditable.',
  ],
  evergreen: [
    'Problema recurrente y contexto de búsqueda.',
    'Arquitectura o método con piezas claras.',
    'Costo, límite honesto y tradeoffs.',
    'Primer entregable reproducible.',
  ],
  caso: [
    'Situación local y protagonista anonimizado.',
    'Decisión tomada y fricción operativa.',
    'Herramientas, evidencia y prueba mínima.',
    'Aprendizaje transferible sin exageración.',
  ],
  empresa: [
    'Señal de mercado o decisión operativa.',
    'Costo, alternativa y límite.',
    'Evidencia primaria y caso contrastable.',
    'Cierre con postura editorial verificable.',
  ],
};

const splitSourceChecklist = (sourcePlan: string) => (
  sourcePlan
    .split('+')
    .map((source) => source.trim().replace(/\.$/, ''))
    .filter(Boolean)
);

const splitPlanLines = (value: string) => (
  value
    .split('\n')
    .map((item) => item.trim().replace(/^\d+[\).]\s*/, '').replace(/^[-*]\s*/, ''))
    .filter(Boolean)
);

const planOverrideValue = (
  overrides: NoteVariableOverride[],
  key: string,
  fallback: string,
) => overrides.find((override) => override.key === key && override.enabled)?.value.trim() || fallback;

export const buildOperationalWorkspacePlan = ({
  recipe,
  author,
  visibleVariables,
  noteVariableOverrides = [],
}: {
  recipe: NoteRecipe;
  author: Author;
  visibleVariables: VisibleNoteVariable[];
  noteVariableOverrides?: NoteVariableOverride[];
}): OperationalWorkspacePlan => {
  const completedRecipeVariables = visibleVariables.filter((variable) => (
    variable.enabled && variable.value.trim().length > 0
  )).length;
  const intent = planOverrideValue(noteVariableOverrides, operationalPlanVariableKeys.intent, recipe.intent);
  const sourcePlan = planOverrideValue(noteVariableOverrides, operationalPlanVariableKeys.sourcePlan, recipe.sourcePlan);
  const structureOverride = planOverrideValue(noteVariableOverrides, operationalPlanVariableKeys.structure, '');
  const sourceChecklistOverride = planOverrideValue(noteVariableOverrides, operationalPlanVariableKeys.sourceChecklist, '');
  const structure = structureOverride ? splitPlanLines(structureOverride) : recipeStructureById[recipe.id];
  const sourceChecklist = sourceChecklistOverride ? splitPlanLines(sourceChecklistOverride) : splitSourceChecklist(sourcePlan);

  return {
    intent,
    sourcePlan,
    defaultDepth: recipe.defaultDepth,
    defaultTokens: recipe.defaultTokens,
    variableCoverage: {
      completed: completedRecipeVariables,
      total: recipe.variableKeys.length,
      label: `${completedRecipeVariables}/${recipe.variableKeys.length} variables listas`,
    },
    structure,
    sourceChecklist,
    influenceDirectives: [...author.influences]
      .sort((left, right) => right.weight - left.weight)
      .slice(0, 4)
      .map(({ reference, relation, weight }) => ({ reference, relation, weight })),
    overrideKeys: operationalPlanVariableKeys,
  };
};

export const completeRecipeVariables = (recipe: NoteRecipe, current: WorkflowVariable[]): WorkflowVariable[] => {
  const existingKeys = new Set(current.map((variable) => variable.key));
  const missingVariables: WorkflowVariable[] = recipe.variableKeys
    .filter((key) => !existingKeys.has(key))
    .map((key) => ({
      id: `var-recipe-${key}`,
      key,
      value: defaultNoteVariableValues[key] || '',
      scope: 'editor',
      description: 'Variable especifica de esta receta.',
      enabled: true,
    }));

  return [...current, ...missingVariables];
};

export const mergeNoteVariableOverrides = (
  variables: WorkflowVariable[],
  overrides: NoteVariableOverride[],
): WorkflowVariable[] => {
  if (overrides.length === 0) {
    return variables;
  }

  const overrideByKey = new Map(overrides.map((override) => [override.key, override]));
  const variableKeys = new Set(variables.map((variable) => variable.key));
  const mergedVariables = variables.map((variable) => {
    const override = overrideByKey.get(variable.key);

    return override
      ? {
          ...variable,
          value: override.value,
          description: override.description || variable.description,
          enabled: override.enabled,
        }
      : variable;
  });
  const orphanOverrides = overrides
    .filter((override) => !variableKeys.has(override.key))
    .map((override): WorkflowVariable => ({
      id: `var-note-${override.topicId}-${override.recipeId}-${override.key}`,
      key: override.key,
      value: override.value,
      scope: 'editor',
      description: override.description,
      enabled: override.enabled,
    }));

  return [...mergedVariables, ...orphanOverrides];
};

export const buildVisibleNoteVariables = ({
  recipe,
  variables,
  overrides,
}: {
  recipe: NoteRecipe;
  variables: WorkflowVariable[];
  overrides: NoteVariableOverride[];
}): VisibleNoteVariable[] => {
  const overrideKeys = new Set(overrides.map((override) => override.key));

  return recipe.variableKeys.map((key) => {
    const variable = variables.find((item) => item.key === key);

    return {
      key,
      value: variable?.value || defaultNoteVariableValues[key] || '',
      enabled: variable?.enabled ?? true,
      description: variable?.description || 'Variable especifica de esta receta.',
      source: overrideKeys.has(key) ? 'nota' : 'perfil',
    };
  });
};

export const upsertNoteVariableOverride = (
  current: NoteVariableOverride[],
  input: {
    topicId: string;
    recipeId: EditarraRecipeKey;
    key: string;
    value: string;
    description?: string;
    idFactory?: () => string;
  },
): NoteVariableOverride[] => {
  const description = input.description || 'Variable especifica de esta receta.';
  const existing = current.find((override) => (
    override.topicId === input.topicId
    && override.recipeId === input.recipeId
    && override.key === input.key
  ));

  if (existing) {
    return current.map((override) => (
      override.id === existing.id
        ? { ...override, value: input.value, description, enabled: true }
        : override
    ));
  }

  return [
    ...current,
    {
      id: input.idFactory?.() || `note-var-${input.topicId}-${input.recipeId}-${input.key}-${Date.now()}`,
      topicId: input.topicId,
      recipeId: input.recipeId,
      key: input.key,
      value: input.value,
      description,
      enabled: true,
    },
  ];
};

export const buildOperationalWorkspace = ({
  profile,
  recipe,
  topic,
  author,
  authors,
  variables,
  noteVariableOverrides,
  sourceCount,
  preflightBlockers,
  hasDraft,
  hasPayload,
}: {
  profile: EditorialProfile;
  recipe: NoteRecipe;
  topic: Topic;
  author: Author;
  authors: Author[];
  variables: WorkflowVariable[];
  noteVariableOverrides: NoteVariableOverride[];
  sourceCount: number;
  preflightBlockers: number;
  hasDraft: boolean;
  hasPayload: boolean;
}): OperationalWorkspaceSnapshot => {
  const topicReady = ['aprobado', 'redaccion', 'publicado'].includes(topic.status);
  const sourcesReady = sourceCount >= profile.sourceMinimum;
  const visibleVariables = buildVisibleNoteVariables({ recipe, variables, overrides: noteVariableOverrides });
  const enabledRecipeVariables = visibleVariables.filter((variable) => variable.enabled).length;
  const activeAuthors = authors.filter((item) => item.active).length;
  const blockers = [
    !topicReady ? 'agenda' : '',
    !author.active ? 'autor' : '',
    !sourcesReady ? 'fuentes' : '',
    preflightBlockers > 0 ? 'auditoria' : '',
    enabledRecipeVariables < recipe.variableKeys.length ? 'variables' : '',
  ].filter(Boolean);
  const status = blockers.length > 0 ? 'bloqueado' : hasDraft && hasPayload ? 'listo' : 'preparacion';

  return {
    readiness: {
      status,
      label: status === 'listo' ? 'listo para payload' : status === 'preparacion' ? 'en preparacion' : 'requiere control',
      tone: status === 'listo' ? 'emerald' : status === 'preparacion' ? 'blue' : 'rose',
      blockers,
    },
    profile: {
      id: profile.id,
      name: profile.name,
      site: profile.site,
      postingMode: profile.postingMode,
      sourceMinimum: profile.sourceMinimum,
      tone: profile.tone,
      guardrails: profile.guardrails,
    },
    recipe: {
      id: recipe.id,
      label: recipe.label,
      shortLabel: recipe.shortLabel,
      category: recipe.category,
      publishAt: recipe.publishAt,
    },
    topic: {
      id: topic.id,
      title: topic.title,
      status: topic.status,
      priority: topic.priority,
      publishAt: topic.publishAt,
    },
    author: {
      id: author.id,
      name: author.name,
      active: author.active,
      score: author.score,
      tone: author.tone,
      influenceCount: author.influences.length,
      primaryInfluences: author.influences
        .filter((influence) => influence.relation !== 'evitar')
        .sort((left, right) => right.weight - left.weight)
        .slice(0, 3)
        .map((influence) => influence.reference),
    },
    counts: {
      activeAuthors,
      totalAuthors: authors.length,
      enabledVariables: variables.filter((variable) => variable.enabled).length,
      recipeVariables: recipe.variableKeys.length,
      noteOverrides: noteVariableOverrides.length,
      guardrails: profile.guardrails.length,
      sources: sourceCount,
      sourceMinimum: profile.sourceMinimum,
      preflightBlockers,
    },
    variables: visibleVariables,
    plan: buildOperationalWorkspacePlan({ recipe, author, visibleVariables, noteVariableOverrides }),
  };
};
