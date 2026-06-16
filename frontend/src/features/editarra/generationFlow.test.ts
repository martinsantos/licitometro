import {
  buildGeneratedDraft,
  buildGuidedEvidenceCompletionUpdates,
  buildGuidedEvidenceSlots,
  buildProfileNoteGeneration,
  buildRecipeTopicPatch,
  isGuidedEvidenceRecord,
} from './generationFlow';
import { editorialProfiles, noteRecipes } from './profileModel';
import type { EditorialDraft, EvidenceRecord } from './productionReducer';
import type { Author, Topic, WorkflowVariable } from './workspaceModel';

const topic: Topic = {
  id: 'topic-a',
  title: 'ARCA y depósitos fiscales',
  status: 'aprobado',
  priority: 88,
  depth: 'Breve',
  tokens: 7000,
  author: 'Editor UMSA Diaria',
  source: 'pendiente de completar',
  narrative: 'Explicar evidencia diaria y permisos.',
  seo: 'Keyword principal: depósitos fiscales ARCA.',
  publishAt: 'Sin fecha',
};

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
    id: 'var-protagonist',
    key: 'umsa_protagonist_pool',
    value: 'responsable de depósito fiscal',
    scope: 'editor',
    description: 'Protagonista',
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

const executableRecipe = {
  intent: 'Noticia o regulación argentina de las últimas 72 horas.',
  sourcePlan: 'Norma oficial + documentación técnica + fuente de contexto + evidencia operativa.',
  defaultDepth: 'Alta' as const,
  defaultTokens: 10500,
  variableCoverage: {
    completed: 4,
    total: 4,
    label: '4/4 variables listas',
  },
  structure: [
    'Qué cambió, cuándo y fuente primaria.',
    'Impacto operativo inmediato y alcance.',
  ],
  sourceChecklist: ['Norma oficial', 'documentación técnica'],
  influenceDirectives: [
    { reference: 'Documentación oficial', relation: 'adherir', weight: 90 },
  ],
};

describe('generationFlow', () => {
  it('builds the recipe patch without mutating the topic', () => {
    const patch = buildRecipeTopicPatch({
      recipe: noteRecipes[0],
      profile: editorialProfiles[0],
      topic,
      authors: [author],
    });

    expect(patch).toMatchObject({
      status: 'redaccion',
      author: 'Editor UMSA Diaria',
      depth: noteRecipes[0].defaultDepth,
      tokens: noteRecipes[0].defaultTokens,
      publishAt: noteRecipes[0].publishAt,
      source: noteRecipes[0].sourcePlan,
    });
    expect(patch.narrative).toContain(noteRecipes[0].intent);
    expect(topic.status).toBe('aprobado');
  });

  it('generates a draft from the active profile and completes recipe variables', () => {
    const generation = buildProfileNoteGeneration({
      topic,
      authors: [author],
      selectedAuthor: author,
      profile: editorialProfiles[0],
      recipe: noteRecipes[0],
      currentDraft,
      rules,
      effectiveVariables: variables,
      workflowVariables: variables,
      executableRecipe,
      now: new Date('2026-01-01T12:30:00-03:00'),
    });

    expect(generation.recipeTopic.status).toBe('redaccion');
    expect(generation.recipeAuthor.name).toBe('Editor UMSA Diaria');
    expect(generation.draft.variant).toBe('humanizado');
    expect(generation.draft.status).toBe('borrador');
    expect(generation.draft.title).toContain('Borrador UMSA humanizado');
    expect(generation.draft.body).toContain('## Contrato de generación EDITARRA');
    expect(generation.draft.body).toContain('Intención: Noticia o regulación argentina de las últimas 72 horas.');
    expect(generation.draft.body).toContain('1. Qué cambió, cuándo y fuente primaria.');
    expect(generation.draft.body).toContain('- Norma oficial');
    expect(generation.draft.body).toContain('- Documentación oficial (adherir, peso 90)');
    expect(generation.draft.body).toContain('## Cómo funciona por dentro');
    expect(generation.completedWorkflowVariables.map((variable) => variable.key)).toEqual(
      expect.arrayContaining(noteRecipes[0].variableKeys),
    );
  });

  it('generates individual draft variants with the same UMSA structure', () => {
    const generated = buildGeneratedDraft({
      topic,
      author,
      rules,
      variables,
      variant: 'seo',
      currentDraft,
      executableRecipe,
    });

    expect(generated.variant).toBe('seo');
    expect(generated.draft.title).toContain('Versión SEO UMSA');
    expect(generated.draft.body).toContain('## Contrato de generación EDITARRA');
    expect(generated.draft.body).toContain('## Metadata sugerida');
  });

  it('creates guided evidence slots from recipe source plan', () => {
    const result = buildGuidedEvidenceSlots({
      topic,
      recipe: noteRecipes[0],
      profile: editorialProfiles[0],
      existingEvidence: [],
      nowMs: 1234,
    });

    expect(result.missingSources).toBe(editorialProfiles[0].sourceMinimum);
    expect(result.evidence).toHaveLength(editorialProfiles[0].sourceMinimum);
    expect(result.evidence[0]).toMatchObject({
      id: 'evidence-guided-topic-a-1234-0',
      topicId: topic.id,
      status: 'pendiente',
      confidence: 45,
    });
    expect(result.evidence[0].sourceName).toContain('Fuente guiada 1');
    expect(isGuidedEvidenceRecord(result.evidence[0])).toBe(true);
  });

  it('completes pending guided evidence with presets and validation status', () => {
    const pending: EvidenceRecord = {
      id: 'evidence-guided-topic-a-1234-0',
      topicId: topic.id,
      sourceName: 'Fuente guiada 1: Norma oficial',
      sourceUrl: 'https://',
      claim: '',
      status: 'pendiente',
      confidence: 45,
      notes: 'Slot creado.',
    };
    const updates = buildGuidedEvidenceCompletionUpdates({
      topic,
      evidence: [pending],
      pendingGuidedEvidence: [pending],
    });

    expect(updates).toHaveLength(1);
    expect(updates[0].patch).toMatchObject({
      sourceUrl: 'https://www.argentina.gob.ar/arca',
      status: 'validado',
      confidence: 78,
    });
    expect(updates[0].patch.claim).toContain('fuente oficial');
    expect(updates[0].patch.notes).toContain('Validada por lote guiado');
  });
});
