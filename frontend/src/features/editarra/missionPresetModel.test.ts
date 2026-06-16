import {
  applyMissionPresetToNote,
  buildMissionPresetId,
  createMissionPresetFromWorkspace,
  mergeMissionPresetVariables,
  missionPresetToExecutableRecipe,
} from './missionPresetModel';
import { editorialProfiles, noteRecipes } from './profileModel';
import type { Author, OperationalWorkspaceSnapshot, VisibleNoteVariable } from './workspaceModel';

const author: Author = {
  id: 'author-1',
  name: 'Editor UMSA Diaria',
  role: 'Editor',
  active: true,
  models: 'writer',
  tone: ['claro'],
  banned: [],
  mix: 'reactiva',
  score: 88,
  voiceBrief: 'Voz guardada para preset.',
  register: 'claro',
  rhythm: 'breve',
  stance: 'verificable',
  density: 'media',
  locality: 'Argentina',
  influenceMode: 'adherir a documentación primaria',
  references: [],
  antiReferences: [],
  styleWeights: { claridad: 90, evidencia: 92, opinion: 20, humanidad: 70, seo: 60 },
  influences: [],
};

const variables: VisibleNoteVariable[] = [
  {
    key: 'keyword_principal',
    value: 'automatización editorial',
    description: 'Keyword de preset.',
    enabled: true,
    source: 'nota',
  },
];

const workspace = {
  topic: {
    id: 'topic-1',
    title: 'Nota operativa reusable',
    status: 'redaccion',
    priority: 90,
    publishAt: '07:00 -03:00',
  },
  plan: {
    intent: 'Generar una nota desde preset reusable.',
    sourcePlan: 'Fuente primaria + evidencia interna',
    defaultDepth: 'Alta',
    defaultTokens: 10500,
    variableCoverage: { completed: 1, total: 1, label: '1/1 variables listas' },
    structure: ['Abrir con evidencia', 'Cerrar con payload'],
    sourceChecklist: ['Fuente primaria', 'Evidencia interna'],
    influenceDirectives: [],
    overrideKeys: {
      intent: 'editarra_plan_intent',
      sourcePlan: 'editarra_plan_source_plan',
      structure: 'editarra_plan_structure',
      sourceChecklist: 'editarra_plan_source_checklist',
    },
  },
} as unknown as OperationalWorkspaceSnapshot;

describe('missionPresetModel', () => {
  it('creates a reusable mission preset from the active workspace', () => {
    const preset = createMissionPresetFromWorkspace({
      id: buildMissionPresetId({ topicId: 'topic-1', recipeId: 'reactiva', nowMs: 123 }),
      profile: editorialProfiles[0],
      recipe: noteRecipes[0],
      author,
      workspace,
      visibleVariables: variables,
      now: new Date('2026-06-06T10:30:00-03:00'),
    });

    expect(preset.id).toBe('mission-topic-1-reactiva-123');
    expect(preset.name).toContain('Reactiva');
    expect(preset.intent).toBe('Generar una nota desde preset reusable.');
    expect(preset.structure).toEqual(['Abrir con evidencia', 'Cerrar con payload']);
    expect(preset.variables[0]).toMatchObject({
      key: 'keyword_principal',
      value: 'automatización editorial',
      enabled: true,
    });
    expect(preset.voiceBrief).toBe('Voz guardada para preset.');
  });

  it('applies a mission preset as note overrides and author voice patch', () => {
    const preset = createMissionPresetFromWorkspace({
      id: 'mission-1',
      name: 'Preset QA',
      profile: editorialProfiles[0],
      recipe: noteRecipes[0],
      author,
      workspace,
      visibleVariables: variables,
    });
    const application = applyMissionPresetToNote({
      preset,
      topicId: 'topic-2',
      currentOverrides: [],
      availableProfiles: editorialProfiles,
      availableAuthors: [author],
    });

    expect(application.selectedRecipeId).toBe('reactiva');
    expect(application.selectedSiteId).toBe(editorialProfiles[0].id);
    expect(application.authorPatch).toMatchObject({
      voiceBrief: 'Voz guardada para preset.',
      influenceMode: 'adherir a documentación primaria',
    });
    expect(application.noteVariableOverrides).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'editarra_plan_intent', value: 'Generar una nota desde preset reusable.' }),
      expect.objectContaining({ key: 'editarra_plan_structure', value: 'Abrir con evidencia\nCerrar con payload' }),
      expect.objectContaining({ key: 'keyword_principal', value: 'automatización editorial' }),
    ]));
  });

  it('turns a preset into an executable recipe and reusable workflow variables', () => {
    const preset = createMissionPresetFromWorkspace({
      id: 'mission-2',
      name: 'Preset lanzamiento',
      profile: editorialProfiles[0],
      recipe: noteRecipes[0],
      author,
      workspace,
      visibleVariables: variables,
    });
    const executableRecipe = missionPresetToExecutableRecipe(preset);
    const mergedVariables = mergeMissionPresetVariables([
      {
        id: 'var-existing',
        key: 'keyword_principal',
        value: 'valor anterior',
        scope: 'editor',
        description: 'Anterior.',
        enabled: true,
      },
    ], preset);

    expect(executableRecipe).toMatchObject({
      intent: 'Generar una nota desde preset reusable.',
      sourcePlan: 'Fuente primaria + evidencia interna',
      variableCoverage: {
        completed: 1,
        total: 1,
        label: '1/1 variables listas',
      },
      structure: ['Abrir con evidencia', 'Cerrar con payload'],
      sourceChecklist: ['Fuente primaria', 'Evidencia interna'],
    });
    expect(mergedVariables.find((variable) => variable.key === 'keyword_principal')).toMatchObject({
      value: 'automatización editorial',
      description: 'Keyword de preset.',
      enabled: true,
    });
  });
});
