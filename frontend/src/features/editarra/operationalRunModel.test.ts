import {
  buildCockpitDailyBatch,
  buildCockpitGeneratedRun,
  buildDailyBatchAiDraft,
  buildDailyBatchAutopilot,
  buildProfileNoteOperation,
  buildSingleNoteAutopilot,
} from './operationalRunModel';
import { editorialProfiles, noteRecipes } from './profileModel';
import type { EditorialDraft, EvidenceRecord } from './productionReducer';
import type { Author, Topic, WorkflowVariable } from './workspaceModel';

const author: Author = {
  id: 'author-a',
  name: 'Editor UMSA Diaria',
  role: 'Editor',
  active: true,
  models: 'umsa-diaria',
  tone: ['preciso'],
  banned: ['relleno'],
  mix: 'reactiva',
  score: 90,
  voiceBrief: 'Explica tecnología abierta con evidencia primaria.',
  register: 'periodístico claro',
  rhythm: 'párrafos cortos',
  stance: 'técnico y verificable',
  density: 'media',
  locality: 'Mendoza',
  influenceMode: 'adherir sin nombrar',
  references: ['PostgreSQL docs'],
  antiReferences: ['copy SaaS'],
  styleWeights: {
    claridad: 88,
    evidencia: 92,
    opinion: 30,
    humanidad: 70,
    seo: 66,
  },
  influences: [],
};

const topic: Topic = {
  id: 'topic-a',
  title: 'ARCA y depósitos fiscales',
  status: 'aprobado',
  priority: 88,
  depth: 'Breve',
  tokens: 7000,
  author: author.name,
  source: 'pendiente de completar',
  narrative: 'Explicar evidencia diaria y permisos.',
  seo: 'Keyword principal: depósitos fiscales ARCA.',
  publishAt: 'Sin fecha',
};

const currentDraft: EditorialDraft = {
  id: 'draft-topic-a',
  topicId: 'topic-a',
  variant: 'base',
  status: 'borrador',
  title: 'Borrador anterior',
  seoTitle: 'SEO anterior',
  body: 'Cuerpo anterior',
  notes: 'Notas',
  updatedAt: '09:00',
};

const variables: WorkflowVariable[] = [
  {
    id: 'var-keyword',
    key: 'keyword_principal',
    value: 'depósitos fiscales ARCA',
    scope: 'editor',
    description: 'Keyword',
    enabled: true,
  },
  {
    id: 'var-fuente',
    key: 'fuente_puente',
    value: 'Norma oficial + PostgreSQL docs',
    scope: 'editor',
    description: 'Fuente puente',
    enabled: true,
  },
];

const rules = [
  {
    title: 'Modelo UMSA',
    body: 'Usar H2 didácticos y fuentes primarias.',
    enabled: true,
  },
];

describe('operationalRunModel', () => {
  const executableRecipeFor = () => ({
    intent: 'Noticia regulatoria con evidencia primaria.',
    sourcePlan: 'Norma oficial + documentación técnica.',
    variableCoverage: {
      completed: 2,
      total: 2,
      label: '2/2 variables listas',
    },
    structure: ['Qué cambió.', 'Impacto operativo.'],
    sourceChecklist: ['Norma oficial', 'documentación técnica'],
    influenceDirectives: [
      { reference: 'Documentación oficial', relation: 'adherir', weight: 90 },
    ],
  });

  it('builds a generated cockpit run with topic, draft, evidence and guided run', () => {
    const result = buildCockpitGeneratedRun({
      rawTitle: 'Nueva corrida fiscal',
      runId: 1234,
      authors: [author],
      fallbackAuthor: author,
      profile: editorialProfiles[0],
      recipe: noteRecipes[0],
      rules,
      workflowVariables: variables,
      executableRecipeFor,
    });

    expect(result.topic).toMatchObject({
      id: 'topic-run-1234',
      title: 'Nueva corrida fiscal',
      author: author.name,
      status: 'redaccion',
    });
    expect(result.draft).toMatchObject({
      id: 'draft-topic-run-1234',
      topicId: 'topic-run-1234',
      variant: 'humanizado',
      status: 'borrador',
    });
    expect(result.draft.body).toContain('## Contrato de generación EDITARRA');
    expect(result.evidence).toHaveLength(editorialProfiles[0].sourceMinimum);
    expect(result.guidedRun).toMatchObject({
      topicId: result.topic.id,
      recipeId: noteRecipes[0].id,
      nextControl: 'Validar fuentes guiadas',
    });
    expect(result.completedWorkflowVariables.map((variable) => variable.key)).toEqual(
      expect.arrayContaining(noteRecipes[0].variableKeys),
    );
    expect(result.statuses.guidedFlow).toContain('Corrida creada');
  });

  it('builds a daily batch with one generated run per recipe', () => {
    const recipes = noteRecipes.filter((recipe) => (
      recipe.id === 'reactiva' || recipe.id === 'evergreen' || recipe.id === 'caso'
    ));
    const result = buildCockpitDailyBatch({
      batchId: 2000,
      authors: [author],
      fallbackAuthor: author,
      profile: editorialProfiles[0],
      recipes,
      rules,
      workflowVariables: variables,
      executableRecipeFor,
    });

    expect(result.topics).toHaveLength(3);
    expect(result.drafts).toHaveLength(3);
    expect(result.guidedRuns).toHaveLength(3);
    expect(result.evidence).toHaveLength(editorialProfiles[0].sourceMinimum * 3);
    expect(result.selectedRecipeId).toBe('reactiva');
    expect(result.topics.map((item) => item.id)).toEqual([
      'topic-batch-2000-reactiva',
      'topic-batch-2000-evergreen',
      'topic-batch-2000-caso',
    ]);
    expect(result.drafts[0].body).toContain('## Contrato de generación EDITARRA');
    expect(result.statuses.draft).toContain(result.topics[0].title);
  });

  it('builds a complete profile-note operation without React state', () => {
    const result = buildProfileNoteOperation({
      topic,
      authors: [author],
      selectedAuthor: author,
      profile: editorialProfiles[0],
      recipe: noteRecipes[0],
      currentDraft,
      rules,
      effectiveVariables: variables,
      workflowVariables: variables,
      selectedTopicEvidence: [],
      draftVersions: [],
      now: new Date('2026-06-05T12:15:00-03:00'),
    });

    expect(result.generation.recipeTopic.status).toBe('redaccion');
    expect(result.operationalDraft.status).toBe('listo');
    expect(result.operationalDraft.title).toContain('AI aplicado');
    expect(result.operationalDraft.body).toContain('## Cómo funciona por dentro');
    expect(result.guidedEvidence).toHaveLength(editorialProfiles[0].sourceMinimum);
    expect(result.nextVersion).toMatchObject({
      draftId: currentDraft.id,
      version: 1,
      status: 'listo',
      authorName: author.name,
    });
    expect(result.nextRun).toMatchObject({
      topicId: topic.id,
      recipeId: noteRecipes[0].id,
      profileId: editorialProfiles[0].id,
      status: 'pausado',
      nextControl: 'Validar fuentes guiadas',
    });
    expect(result.targetSurface).toBe('auditoria');
    expect(result.packageFileKey).toBe('evidence_log.json');
    expect(result.statuses.auditEvent).toBe('Generación operativa por perfil');
  });

  it('builds daily batch AI drafts with source and variable context', () => {
    const evidence: EvidenceRecord[] = [
      {
        id: 'evidence-a',
        topicId: topic.id,
        sourceName: 'ARCA normativa oficial',
        sourceUrl: 'https://www.argentina.gob.ar/arca',
        claim: 'La fuente oficial define obligaciones y alcance.',
        status: 'validado',
        confidence: 88,
        notes: 'Validada.',
      },
    ];
    const draft = buildDailyBatchAiDraft({
      draft: currentDraft,
      topic,
      recipe: noteRecipes[0],
      topicEvidence: evidence,
      profile: editorialProfiles[0],
      effectiveVariables: variables,
      updatedAt: '12:20',
      status: 'aprobado',
    });

    expect(draft.status).toBe('aprobado');
    expect(draft.title).toBe(`AI tanda - ${topic.title}`);
    expect(draft.body).toContain(`perfil ${editorialProfiles[0].name}`);
    expect(draft.body).toContain('keyword_principal=depósitos fiscales ARCA');
    expect(draft.body).toContain('- ARCA normativa oficial: La fuente oficial define obligaciones y alcance.');
    expect(draft.notes).toContain(noteRecipes[0].shortLabel);
  });

  it('runs daily batch autopilot through sources, AI, audit and payload readiness', () => {
    const recipes = noteRecipes.filter((recipe) => (
      recipe.id === 'reactiva' || recipe.id === 'evergreen' || recipe.id === 'caso'
    ));
    const batch = buildCockpitDailyBatch({
      batchId: 3000,
      authors: [author],
      fallbackAuthor: author,
      profile: editorialProfiles[0],
      recipes,
      rules,
      workflowVariables: variables,
      executableRecipeFor,
    });
    const result = buildDailyBatchAutopilot({
      topicIds: batch.topics.map((item) => item.id),
      topics: batch.topics,
      selectedTopic: batch.topics[0],
      selectedAuthor: author,
      profile: editorialProfiles[0],
      selectedRecipe: noteRecipes[0],
      recipes: noteRecipes,
      evidence: batch.evidence,
      drafts: batch.drafts,
      draftVersions: [],
      effectiveVariables: variables,
      existingGuidedRunRecords: [],
      getRecipeId: (topicId) => topicId.match(/-(reactiva|evergreen|caso)$/)?.[1] as any || 'reactiva',
      now: new Date('2026-06-05T13:00:00-03:00'),
    });

    expect(result.batchTopicCount).toBe(3);
    expect(result.evidence.every((item) => item.status === 'validado')).toBe(true);
    expect(result.drafts.filter((draft) => draft.status === 'aprobado')).toHaveLength(3);
    expect(result.draftVersions).toHaveLength(3);
    expect(result.guidedRuns).toHaveLength(3);
    expect(result.guidedRuns.every((run) => run.status === 'completo')).toBe(true);
    expect(result.statuses.guidedFlow).toContain('fuentes, AI, auditoría y payload');
  });

  it('runs single note autopilot through agenda, evidence, AI, audit and payload', () => {
    const result = buildSingleNoteAutopilot({
      topic,
      authors: [author],
      selectedAuthor: author,
      profile: editorialProfiles[0],
      recipe: noteRecipes[0],
      operationModeName: 'Alerta regulatoria',
      currentDraft,
      rules,
      effectiveVariables: variables,
      workflowVariables: variables,
      evidence: [],
      drafts: [currentDraft],
      draftVersions: [],
      existingGuidedRunRecords: [],
      executableRecipeFor,
      now: new Date('2026-06-05T13:30:00-03:00'),
    });

    expect(result.topic.status).toBe('aprobado');
    expect(result.evidence).toHaveLength(editorialProfiles[0].sourceMinimum);
    expect(result.evidence.every((item) => item.status === 'validado')).toBe(true);
    expect(result.drafts[0]).toMatchObject({
      topicId: topic.id,
      status: 'aprobado',
    });
    expect(result.draftVersion).toMatchObject({
      topicId: topic.id,
      status: 'aprobado',
      authorName: author.name,
    });
    expect(result.guidedRun).toMatchObject({
      status: 'completo',
      nextControl: 'Listo para exportar',
    });
    expect(result.completedWorkflowVariables.map((variable) => variable.key)).toEqual(
      expect.arrayContaining(noteRecipes[0].variableKeys),
    );
    expect(result.statuses.package).toContain('publication_payload.json');
  });
});
