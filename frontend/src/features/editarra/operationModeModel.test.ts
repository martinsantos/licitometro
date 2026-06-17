import {
  buildOperationModeApplication,
  buildProfileFromOperationMode,
} from './operationModeModel';
import { operationModes, editorialProfiles, noteRecipes } from './profileModel';
import { authorSeed, topicSeed } from './persistenceModel';
import type { Author, Topic, WorkflowVariable } from './workspaceModel';

const author: Author = {
  ...authorSeed[0],
  id: 'author-a',
  name: 'Editor UMSA Diaria',
  voiceBrief: 'Voz base',
  influenceMode: 'base',
};

const fallbackAuthor: Author = {
  ...authorSeed[0],
  id: 'author-fallback',
  name: 'Fallback',
};

const topic: Topic = {
  ...topicSeed[0],
  id: 'topic-a',
  title: 'ARCA y stock fiscal con evidencia diaria',
  narrative: 'Narrativa original.',
  author: fallbackAuthor.name,
};

const variables: WorkflowVariable[] = [
  {
    id: 'var-base',
    key: 'keyword_principal',
    value: 'base',
    scope: 'editor',
    description: 'Keyword base',
    enabled: true,
  },
];

describe('operationModeModel', () => {
  it('applies an operation mode to recipe, author, topic and variable overrides', () => {
    const mode = operationModes[0];
    const result = buildOperationModeApplication({
      mode,
      profile: editorialProfiles[0],
      fallbackRecipe: noteRecipes[1],
      authors: [author, fallbackAuthor],
      fallbackAuthor,
      topics: [topic],
      targetTopic: topic,
      workflowVariables: variables,
      noteVariableOverrides: [],
      recipes: noteRecipes,
    });

    expect(result.recipe.id).toBe(mode.recipeId);
    expect(result.author.name).toBe(mode.authorName);
    expect(result.profilePatch).toMatchObject(mode.profilePatch);
    expect(result.workflowVariables.map((variable) => variable.key)).toEqual(
      expect.arrayContaining(noteRecipes[0].variableKeys),
    );
    expect(result.authors.find((item) => item.id === author.id)).toMatchObject(mode.authorPatch);
    expect(result.topics[0]).toMatchObject({
      id: topic.id,
      author: author.name,
      source: result.recipe.sourcePlan,
      publishAt: result.recipe.publishAt,
    });
    expect(result.topics[0].narrative).toContain(mode.intent);
    expect(result.noteVariableOverrides).toHaveLength(mode.variables.length);
    expect(result.noteVariableOverrides[0]).toMatchObject({
      id: `note-var-${topic.id}-${mode.id}-${mode.variables[0].key}`,
      topicId: topic.id,
      recipeId: result.recipe.id,
      key: mode.variables[0].key,
      value: mode.variables[0].value,
      enabled: true,
    });
    expect(result.statuses).toMatchObject({
      auditEvent: 'Modo operativo aplicado',
    });
    expect(result.statuses.guidedFlow).toContain(mode.name);
  });

  it('updates existing note overrides instead of duplicating them', () => {
    const mode = operationModes[0];
    const existingOverride = {
      id: 'override-existing',
      topicId: topic.id,
      recipeId: mode.recipeId,
      key: mode.variables[0].key,
      value: 'valor anterior',
      description: 'Anterior',
      enabled: false,
    };

    const result = buildOperationModeApplication({
      mode,
      profile: editorialProfiles[0],
      fallbackRecipe: noteRecipes[0],
      authors: [author],
      fallbackAuthor,
      topics: [topic],
      targetTopic: topic,
      workflowVariables: variables,
      noteVariableOverrides: [existingOverride],
      recipes: noteRecipes,
    });

    expect(result.noteVariableOverrides.filter((override) => override.key === mode.variables[0].key)).toHaveLength(1);
    expect(result.noteVariableOverrides.find((override) => override.id === existingOverride.id)).toMatchObject({
      value: mode.variables[0].value,
      enabled: true,
    });
  });

  it('builds a new profile from the operation mode with truncated topic title and profile statuses', () => {
    const mode = operationModes[1];
    const longTopic = {
      ...topic,
      title: 'Una guía muy larga sobre infraestructura documental abierta para operaciones cuyanas',
    };
    const result = buildProfileFromOperationMode({
      profileId: 'perfil-test',
      mode,
      currentProfile: editorialProfiles[0],
      fallbackRecipe: noteRecipes[0],
      authors: [author],
      fallbackAuthor,
      topics: [longTopic],
      targetTopic: longTopic,
      workflowVariables: variables,
      noteVariableOverrides: [],
      recipes: noteRecipes,
    });

    expect(result.profile).toMatchObject({
      id: 'perfil-test',
      sourceMinimum: mode.profilePatch.sourceMinimum,
      postingMode: mode.profilePatch.postingMode,
      tone: mode.profilePatch.tone,
      guardrails: mode.profilePatch.guardrails,
      defaultAuthor: author.name,
    });
    expect(result.profile.name).toBe('Guía · Una guía muy larga sobre infraestructura do...');
    expect(result.recipe.id).toBe(mode.recipeId);
    expect(result.statuses.auditEvent).toBe('Perfil operativo creado');
    expect(result.statuses.package).toContain('profile_runtime.json actualizado');
  });
});
