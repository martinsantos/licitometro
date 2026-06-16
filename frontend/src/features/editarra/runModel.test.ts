import { buildEditarraPipelineState } from './pipelineModel';
import { editorialProfiles, noteRecipes, operationModes } from './profileModel';
import { buildEditarraNoteRun, buildEditarraProfileRuntime, classifyRunVariable } from './runModel';
import type { Author, NoteVariableOverride, Topic, VisibleNoteVariable, WorkflowVariable } from './workspaceModel';

const author: Author = {
  id: 'author-1',
  name: 'Editor UMSA Diaria',
  role: 'Editor',
  active: true,
  models: 'umsa-diaria',
  tone: ['sobrio', 'tecnico'],
  banned: ['humo'],
  mix: 'regulacion e infraestructura',
  score: 92,
  voiceBrief: 'Voz tecnica, verificable y sin epica.',
  register: 'profesional',
  rhythm: 'directo',
  stance: 'evidencia primero',
  density: 'media',
  locality: 'Argentina',
  influenceMode: 'adherir a documentacion oficial y referencias tecnicas',
  references: ['Boletin Oficial', 'documentacion tecnica'],
  antiReferences: ['marketing generico'],
  styleWeights: {
    claridad: 90,
    evidencia: 95,
    opinion: 30,
    humanidad: 55,
    seo: 70,
  },
  influences: [
    {
      id: 'inf-1',
      reference: 'Documentacion oficial',
      relation: 'adherir',
      weight: 90,
      notes: 'Usar como base de verificacion.',
    },
  ],
};

const topic: Topic = {
  id: 'topic-1',
  title: 'ARCA y evidencia operativa',
  status: 'redaccion',
  priority: 90,
  depth: 'Alta',
  tokens: 9000,
  author: author.name,
  source: 'Norma oficial + contexto tecnico',
  narrative: 'Explicar impacto operativo.',
  seo: 'arca evidencia operativa',
  publishAt: '07:00 -03:00',
};

const executableRecipe = {
  intent: 'Noticia regulatoria con evidencia primaria.',
  sourcePlan: 'Norma oficial + documentación técnica.',
  defaultDepth: 'Alta' as const,
  defaultTokens: 10500,
  variableCoverage: {
    completed: 2,
    total: 2,
    label: '2/2 variables listas',
  },
  structure: ['Qué cambió.', 'Impacto operativo.'],
  sourceChecklist: ['Norma oficial', 'documentación técnica'],
  influenceDirectives: [
    { reference: 'Documentacion oficial', relation: 'adherir' as const, weight: 90 },
  ],
  overrideKeys: {
    intent: 'editarra_plan_intent',
    sourcePlan: 'editarra_plan_source_plan',
    structure: 'editarra_plan_structure',
    sourceChecklist: 'editarra_plan_source_checklist',
  },
};

describe('runModel', () => {
  it('builds a profile runtime with author influences and publication controls', () => {
    const runtime = buildEditarraProfileRuntime({
      profile: editorialProfiles[0],
      author,
    });

    expect(runtime.readiness).toBe('listo');
    expect(runtime.author.referencesToFollow).toContain('Boletin Oficial');
    expect(runtime.author.influenceCount).toBe(1);
    expect(runtime.controls.externalPostEnabled).toBe(false);
    expect(runtime.toneSystem.guardrails.length).toBeGreaterThan(0);
  });

  it('marks a runtime as configurable when tone and influences are missing', () => {
    const runtime = buildEditarraProfileRuntime({
      profile: { ...editorialProfiles[0], tone: '', guardrails: [] },
      author: { ...author, voiceBrief: '', influenceMode: '', influences: [] },
    });

    expect(runtime.readiness).toBe('configurar');
    expect(runtime.blockers).toEqual(expect.arrayContaining(['tono editorial', 'guardrails', 'brief de voz', 'influencias']));
  });

  it('classifies run variables by operational group', () => {
    expect(classifyRunVariable({ key: 'keyword_principal', scope: 'seo', description: 'SEO principal' })).toBe('seo');
    expect(classifyRunVariable({ key: 'fuente_puente', scope: 'editor', description: 'Fuente primaria' })).toBe('fuentes');
    expect(classifyRunVariable({ key: 'tono_guardia', scope: 'editor', description: 'Tono de voz' })).toBe('tono');
  });

  it('builds a note run with profile snapshot, grouped variables and AI handoff', () => {
    const recipe = noteRecipes[0];
    const runtime = buildEditarraProfileRuntime({ profile: editorialProfiles[0], author });
    const pipelineState = buildEditarraPipelineState({
      topicStatus: 'redaccion',
      sourcesValidated: 4,
      sourcesRequired: 4,
      draftReady: true,
      draftStatus: 'listo',
      qualityStatus: 'apto_para_revision',
      preflightBlockers: 0,
      publicationStatus: 'revision',
      payloadReady: true,
      imageStatus: 'prompt_listo',
    });
    const workflowVariables: WorkflowVariable[] = [
      {
        id: 'var-keyword',
        key: 'keyword_principal',
        value: 'arca evidencia',
        scope: 'seo',
        description: 'Keyword SEO principal',
        enabled: true,
      },
      {
        id: 'var-fuente',
        key: 'fuente_puente',
        value: 'boletin oficial',
        scope: 'editor',
        description: 'Fuente primaria puente',
        enabled: true,
      },
    ];
    const visibleVariables: VisibleNoteVariable[] = workflowVariables.map((variable) => ({
      key: variable.key,
      value: variable.value,
      enabled: variable.enabled,
      description: variable.description,
      source: variable.key === 'keyword_principal' ? 'nota' : 'perfil',
    }));
    const noteOverrides: NoteVariableOverride[] = [
      {
        id: 'override-1',
        topicId: topic.id,
        recipeId: recipe.id,
        key: 'keyword_principal',
        value: 'arca evidencia',
        description: 'Keyword SEO principal',
        enabled: true,
      },
    ];

    const run = buildEditarraNoteRun({
      topic,
      recipe,
      operationMode: operationModes[0],
      profileRuntime: runtime,
      pipelineState,
      visibleVariables,
      workflowVariables,
      noteVariableOverrides: noteOverrides,
      aiHandoff: {
        status: 'listo_para_ai',
        sendFile: 'ai_brief.json',
        expectedFile: 'publication_payload.json',
      },
      exportKeys: ['ai_brief.json', 'publication_payload.json'],
      executableRecipe,
    });

    expect(run.id).toBe('run-topic-1-reactiva-editarra-studio');
    expect(run.profileRuntime.profileName).toBe('UMSA Diaria');
    expect(run.pipeline.nextControl).toBe('Aprobar auditoría');
    expect(run.variables.noteOverrides).toBe(1);
    expect(run.variables.byGroup.seo).toHaveLength(1);
    expect(run.variables.byGroup.fuentes).toHaveLength(1);
    expect(run.ai.expectedFile).toBe('publication_payload.json');
    expect(run.executableRecipe).toMatchObject({
      intent: 'Noticia regulatoria con evidencia primaria.',
      variableCoverage: { label: '2/2 variables listas' },
      structure: ['Qué cambió.', 'Impacto operativo.'],
    });
  });
});
