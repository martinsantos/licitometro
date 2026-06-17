import { editorialProfiles, noteRecipes } from './profileModel';
import {
  buildOperationalWorkspace,
  buildOperationalWorkspacePlan,
  buildVisibleNoteVariables,
  completeRecipeVariables,
  mergeNoteVariableOverrides,
  operationalPlanVariableKeys,
  upsertNoteVariableOverride,
} from './workspaceModel';
import type { Author, NoteVariableOverride, Topic, WorkflowVariable } from './workspaceModel';

const baseVariables: WorkflowVariable[] = [
  {
    id: 'var-existing',
    key: 'keyword_principal',
    value: 'clave base',
    scope: 'editor',
    description: 'Keyword base.',
    enabled: true,
  },
];

const author: Author = {
  id: 'author-1',
  name: 'Editor UMSA Diaria',
  role: 'Editor',
  active: true,
  models: 'writer',
  tone: ['claro', 'preciso'],
  banned: ['clickbait'],
  mix: 'reactiva',
  score: 87,
  voiceBrief: 'Explica con evidencia.',
  register: 'periodistico',
  rhythm: 'corto',
  stance: 'verificable',
  density: 'media',
  locality: 'Argentina',
  influenceMode: 'referencias invisibles',
  references: ['docs'],
  antiReferences: ['hype'],
  styleWeights: { claridad: 90, evidencia: 92, opinion: 30, humanidad: 70, seo: 65 },
  influences: [
    { id: 'inf-1', reference: 'Documentacion primaria', relation: 'adherir', weight: 88, notes: 'Usar como fuente.' },
    { id: 'inf-2', reference: 'Copy generico', relation: 'evitar', weight: 94, notes: 'No imitar.' },
  ],
};

const topic: Topic = {
  id: 'topic-1',
  title: 'ARCA y depositos fiscales',
  status: 'aprobado',
  priority: 91,
  depth: 'Alta',
  tokens: 10500,
  author: author.name,
  source: 'Norma oficial',
  narrative: 'Explicar el flujo.',
  seo: 'Keyword principal: depositos fiscales.',
  publishAt: '07:00 -03:00',
};

describe('workspaceModel', () => {
  it('adds recipe variables without duplicating existing keys', () => {
    const variables = completeRecipeVariables(noteRecipes[0], baseVariables);

    expect(variables.filter((variable) => variable.key === 'keyword_principal')).toHaveLength(1);
    expect(variables.map((variable) => variable.key)).toEqual(expect.arrayContaining([
      'keyword_principal',
      'antagonista_operativo',
      'norma_herramienta',
      'fuente_puente',
    ]));
  });

  it('merges note overrides and exposes their source for the active note', () => {
    const recipeVariables = completeRecipeVariables(noteRecipes[1], baseVariables);
    const overrides: NoteVariableOverride[] = [
      {
        id: 'override-1',
        topicId: 'topic-1',
        recipeId: 'evergreen',
        key: 'herramientas',
        value: 'PostgreSQL 17, MinIO y Metabase',
        description: 'Stack definido para esta nota.',
        enabled: true,
      },
    ];
    const merged = mergeNoteVariableOverrides(recipeVariables, overrides);
    const visible = buildVisibleNoteVariables({ recipe: noteRecipes[1], variables: merged, overrides });

    expect(merged.find((variable) => variable.key === 'herramientas')?.value).toBe('PostgreSQL 17, MinIO y Metabase');
    expect(visible.find((variable) => variable.key === 'herramientas')).toMatchObject({
      source: 'nota',
      value: 'PostgreSQL 17, MinIO y Metabase',
    });
  });

  it('upserts note overrides with deterministic ids for persistence and tests', () => {
    const created = upsertNoteVariableOverride([], {
      topicId: 'topic-1',
      recipeId: 'reactiva',
      key: 'fuente_puente',
      value: 'Stack Overflow Survey',
      idFactory: () => 'override-created',
    });
    const updated = upsertNoteVariableOverride(created, {
      topicId: 'topic-1',
      recipeId: 'reactiva',
      key: 'fuente_puente',
      value: 'GitHub Octoverse',
    });

    expect(created).toHaveLength(1);
    expect(created[0].id).toBe('override-created');
    expect(updated).toHaveLength(1);
    expect(updated[0]).toMatchObject({ id: 'override-created', value: 'GitHub Octoverse', enabled: true });
  });

  it('builds an operational snapshot that separates blockers from editable note variables', () => {
    const recipe = noteRecipes[0];
    const profile = { ...editorialProfiles[0], sourceMinimum: 5 };
    const variables = completeRecipeVariables(recipe, baseVariables);
    const snapshot = buildOperationalWorkspace({
      profile,
      recipe,
      topic,
      author,
      authors: [author],
      variables,
      noteVariableOverrides: [],
      sourceCount: 4,
      preflightBlockers: 0,
      hasDraft: true,
      hasPayload: true,
    });

    expect(snapshot.readiness.status).toBe('bloqueado');
    expect(snapshot.readiness.blockers).toContain('fuentes');
    expect(snapshot.counts.sourceMinimum).toBe(5);
    expect(snapshot.counts.recipeVariables).toBe(recipe.variableKeys.length);
    expect(snapshot.author.primaryInfluences).toEqual(['Documentacion primaria']);
    expect(snapshot.plan.intent).toBe(recipe.intent);
    expect(snapshot.plan.variableCoverage).toMatchObject({
      completed: recipe.variableKeys.length,
      total: recipe.variableKeys.length,
      label: `${recipe.variableKeys.length}/${recipe.variableKeys.length} variables listas`,
    });
    expect(snapshot.plan.structure).toEqual(expect.arrayContaining([
      'Qué cambió, cuándo y fuente primaria.',
      'Impacto operativo inmediato y alcance.',
    ]));
    expect(snapshot.plan.sourceChecklist).toEqual([
      'Norma oficial',
      'documentación técnica',
      'fuente de contexto',
      'evidencia operativa',
    ]);
    expect(snapshot.plan.influenceDirectives[0]).toMatchObject({
      reference: 'Copy generico',
      relation: 'evitar',
      weight: 94,
    });
  });

  it('overrides the executable generation plan per note without changing the recipe defaults', () => {
    const recipe = noteRecipes[0];
    const variables = completeRecipeVariables(recipe, baseVariables);
    const visibleVariables = buildVisibleNoteVariables({ recipe, variables, overrides: [] });
    const plan = buildOperationalWorkspacePlan({
      recipe,
      author,
      visibleVariables,
      noteVariableOverrides: [
        {
          id: 'plan-intent',
          topicId: topic.id,
          recipeId: recipe.id,
          key: operationalPlanVariableKeys.intent,
          value: 'Intención ajustada para una nota de prueba.',
          description: 'Override de intención.',
          enabled: true,
        },
        {
          id: 'plan-structure',
          topicId: topic.id,
          recipeId: recipe.id,
          key: operationalPlanVariableKeys.structure,
          value: 'Abrir con fuente primaria\nCerrar con decisión operativa',
          description: 'Override de estructura.',
          enabled: true,
        },
      ],
    });

    expect(plan.intent).toBe('Intención ajustada para una nota de prueba.');
    expect(plan.structure).toEqual(['Abrir con fuente primaria', 'Cerrar con decisión operativa']);
    expect(recipe.intent).toBe('Noticia o regulación argentina de las últimas 72 horas.');
  });
});
