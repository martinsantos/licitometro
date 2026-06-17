import { noteRecipes } from './profileModel';
import type { EditorialOperationMode, EditorialProfile, NoteRecipe } from './profileModel';
import { completeRecipeVariables, upsertNoteVariableOverride } from './workspaceModel';
import type { Author, NoteVariableOverride, Topic, WorkflowVariable } from './workspaceModel';

export type OperationModeApplication = {
  mode: EditorialOperationMode;
  recipe: NoteRecipe;
  author: Author;
  profilePatch: Partial<EditorialProfile>;
  workflowVariables: WorkflowVariable[];
  authors: Author[];
  topics: Topic[];
  noteVariableOverrides: NoteVariableOverride[];
  statuses: {
    guidedFlow: string;
    draft: string;
    package: string;
    auditEvent: string;
    auditDetail: string;
  };
};

export type ProfileFromOperationModeResult = OperationModeApplication & {
  profile: EditorialProfile;
};

const patchTopicForOperationMode = ({
  topic,
  targetTopicId,
  authorName,
  recipe,
  mode,
}: {
  topic: Topic;
  targetTopicId: string;
  authorName: string;
  recipe: NoteRecipe;
  mode: EditorialOperationMode;
}) => (
  topic.id === targetTopicId
    ? {
        ...topic,
        author: authorName,
        source: recipe.sourcePlan,
        narrative: `${mode.intent} ${topic.narrative}`,
        publishAt: recipe.publishAt,
      }
    : topic
);

const buildModeOverrides = ({
  current,
  topicId,
  recipeId,
  mode,
}: {
  current: NoteVariableOverride[];
  topicId: string;
  recipeId: NoteRecipe['id'];
  mode: EditorialOperationMode;
}) => (
  mode.variables.reduce((nextOverrides, variable) => upsertNoteVariableOverride(nextOverrides, {
    topicId,
    recipeId,
    key: variable.key,
    value: variable.value,
    description: variable.description,
    idFactory: () => `note-var-${topicId}-${mode.id}-${variable.key}`,
  }), current)
);

const resolveModeTargets = ({
  mode,
  recipes,
  fallbackRecipe,
  authors,
  fallbackAuthor,
}: {
  mode: EditorialOperationMode;
  recipes?: NoteRecipe[];
  fallbackRecipe: NoteRecipe;
  authors: Author[];
  fallbackAuthor: Author;
}) => {
  const recipe = (recipes || noteRecipes).find((item) => item.id === mode.recipeId) || fallbackRecipe;
  const author = authors.find((item) => item.name === mode.authorName) || fallbackAuthor;

  return { recipe, author };
};

export const buildOperationModeApplication = ({
  mode,
  profile,
  fallbackRecipe,
  authors,
  fallbackAuthor,
  topics,
  targetTopic,
  workflowVariables,
  noteVariableOverrides,
  recipes,
}: {
  mode: EditorialOperationMode;
  profile: EditorialProfile;
  fallbackRecipe: NoteRecipe;
  authors: Author[];
  fallbackAuthor: Author;
  topics: Topic[];
  targetTopic: Topic;
  workflowVariables: WorkflowVariable[];
  noteVariableOverrides: NoteVariableOverride[];
  recipes?: NoteRecipe[];
}): OperationModeApplication => {
  const { recipe, author } = resolveModeTargets({
    mode,
    recipes,
    fallbackRecipe,
    authors,
    fallbackAuthor,
  });
  const profilePatch: Partial<EditorialProfile> = {
    sourceMinimum: mode.profilePatch.sourceMinimum,
    postingMode: mode.profilePatch.postingMode,
    tone: mode.profilePatch.tone,
    guardrails: mode.profilePatch.guardrails,
  };

  return {
    mode,
    recipe,
    author,
    profilePatch,
    workflowVariables: completeRecipeVariables(recipe, workflowVariables),
    authors: authors.map((item) => (
      item.id === author.id ? { ...item, ...mode.authorPatch } : item
    )),
    topics: topics.map((topic) => patchTopicForOperationMode({
      topic,
      targetTopicId: targetTopic.id,
      authorName: author.name,
      recipe,
      mode,
    })),
    noteVariableOverrides: buildModeOverrides({
      current: noteVariableOverrides,
      topicId: targetTopic.id,
      recipeId: recipe.id,
      mode,
    }),
    statuses: {
      guidedFlow: `Modo operativo "${mode.name}" aplicado: receta ${recipe.shortLabel}, ${mode.variables.length} variables y ${mode.profilePatch.sourceMinimum} fuentes mínimas.`,
      draft: `Corrida preparada con modo "${mode.name}" para ${author.name}.`,
      package: `Modo "${mode.name}" listo para generar nota, tanda o handoff AI.`,
      auditEvent: 'Modo operativo aplicado',
      auditDetail: `${mode.name}: receta ${recipe.shortLabel}, autor ${author.name}, ${mode.variables.length} variables.`,
    },
  };
};

export const buildProfileFromOperationMode = ({
  profileId,
  mode,
  currentProfile,
  fallbackRecipe,
  authors,
  fallbackAuthor,
  topics,
  targetTopic,
  workflowVariables,
  noteVariableOverrides,
  recipes,
}: {
  profileId: string;
  mode: EditorialOperationMode;
  currentProfile: EditorialProfile;
  fallbackRecipe: NoteRecipe;
  authors: Author[];
  fallbackAuthor: Author;
  topics: Topic[];
  targetTopic: Topic;
  workflowVariables: WorkflowVariable[];
  noteVariableOverrides: NoteVariableOverride[];
  recipes?: NoteRecipe[];
}): ProfileFromOperationModeResult => {
  const application = buildOperationModeApplication({
    mode,
    profile: currentProfile,
    fallbackRecipe,
    authors,
    fallbackAuthor,
    topics,
    targetTopic,
    workflowVariables,
    noteVariableOverrides,
    recipes,
  });
  const profileTitle = targetTopic.title.length > 46
    ? `${targetTopic.title.slice(0, 43)}...`
    : targetTopic.title;
  const profile: EditorialProfile = {
    ...currentProfile,
    id: profileId,
    name: `${mode.shortLabel} · ${profileTitle}`,
    sourceMinimum: mode.profilePatch.sourceMinimum,
    postingMode: mode.profilePatch.postingMode,
    tone: mode.profilePatch.tone,
    guardrails: mode.profilePatch.guardrails,
    defaultAuthor: application.author.name,
  };

  return {
    ...application,
    profile,
    statuses: {
      guidedFlow: `Perfil operativo "${profile.name}" creado desde ${mode.name}: receta ${application.recipe.shortLabel}, autor ${application.author.name} y ${mode.variables.length} variables.`,
      draft: `Perfil "${profile.name}" listo para generar nota desde la corrida activa.`,
      package: `profile_runtime.json actualizado: ${profile.name} preparado con ${mode.profilePatch.sourceMinimum} fuentes mínimas.`,
      auditEvent: 'Perfil operativo creado',
      auditDetail: `${profile.name}: modo ${mode.name}, receta ${application.recipe.shortLabel}, autor ${application.author.name}.`,
    },
  };
};
