import { buildEditarraOperationalContract } from './operationalContractModel';
import { buildEditarraPipelineState } from './pipelineModel';
import { editorialProfiles, noteRecipes, operationModes } from './profileModel';
import { buildOperationalRunQueue } from './runQueueModel';
import { buildEditarraNoteRun, buildEditarraProfileRuntime } from './runModel';
import {
  buildOperationalWorkspace,
  completeRecipeVariables,
  type Author,
  type Topic,
  type WorkflowVariable,
} from './workspaceModel';

const profile = editorialProfiles[0];
const recipe = noteRecipes[0];

const author: Author = {
  id: 'author-1',
  name: 'Editor UMSA Diaria',
  role: 'Editor',
  active: true,
  models: 'writer',
  tone: ['claro', 'preciso'],
  banned: ['clickbait'],
  mix: 'reactiva',
  score: 88,
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
  influences: [],
};

const topic: Topic = {
  id: 'topic-1',
  title: 'ARCA y evidencia operativa',
  status: 'redaccion',
  priority: 91,
  depth: 'Alta',
  tokens: 10500,
  author: author.name,
  source: 'Norma oficial',
  narrative: 'Explicar el flujo.',
  seo: 'Keyword principal: evidencia operativa.',
  publishAt: '07:00 -03:00',
};

const variables: WorkflowVariable[] = completeRecipeVariables(recipe, [
  {
    id: 'keyword',
    key: 'keyword_principal',
    value: 'evidencia operativa',
    scope: 'seo',
    description: 'Keyword foco.',
    enabled: true,
  },
]);

describe('operationalContractModel', () => {
  it('builds a compact AI/operator contract without enabling external posts', () => {
    const workspace = buildOperationalWorkspace({
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
      hasPayload: false,
    });
    const aiHandoff = {
      id: 'ai-handoff-test',
      provider: 'provider-agnostic' as const,
      mode: 'manual-json-handoff' as const,
      status: 'requiere_auditoria' as const,
      sendFile: 'ai_brief.json' as const,
      expectedFile: 'publication_payload.json' as const,
      noExternalPost: true as const,
      nextAction: 'Revisar auditoría antes de AI.',
      sourceCount: 4,
      requiredSources: profile.sourceMinimum,
      outputSchemaKeys: ['titulo', 'contenido'],
      payloadPreview: {
        title: topic.title,
        category: 'tecnico',
        publishAt: topic.publishAt,
      },
      checksum: 'checksum-test',
    };
    const profileRuntime = buildEditarraProfileRuntime({ profile, author });
    const pipeline = buildEditarraPipelineState({
      topicStatus: topic.status,
      sourcesValidated: 4,
      sourcesRequired: profile.sourceMinimum,
      draftReady: true,
      draftStatus: 'borrador',
      qualityStatus: 'requiere_revision',
      preflightBlockers: 0,
      publicationStatus: 'requiere_revision',
      payloadReady: false,
      imageStatus: 'pendiente',
    });
    const noteRun = buildEditarraNoteRun({
      topic,
      recipe,
      operationMode: operationModes[0],
      profileRuntime,
      pipelineState: pipeline,
      visibleVariables: workspace.variables,
      workflowVariables: variables,
      noteVariableOverrides: [],
      aiHandoff,
      exportKeys: ['note_run.json', 'ai_request.json', 'publication_payload.json'],
      executableRecipe: workspace.plan,
    });
    const queue = buildOperationalRunQueue([
      {
        id: 'run-1',
        topicId: topic.id,
        recipeId: recipe.id,
        profileId: profile.id,
        status: 'pausado',
        summary: 'Corrida lista para auditoría.',
        nextControl: 'Auditoría asistida',
        time: '10:00',
        topicTitle: topic.title,
        isActiveTopic: true,
      },
    ]);

    const contract = buildEditarraOperationalContract({
      workspace,
      profile,
      recipe,
      noteRun,
      pipeline,
      aiHandoff,
      runQueue: queue,
      requiredArtifacts: ['note_run.json', 'ai_request.json', 'publication_payload.json'],
    });

    expect(contract.executionMode).toBe('manual-json-copy');
    expect(contract.externalPostEnabled).toBe(false);
    expect(contract.queue[0]).toMatchObject({
      action: 'Revisar auditoría',
      artifact: 'quality_audit.json',
      stage: 'auditoria',
    });
    expect(contract.nextOperatorAction).toContain('Revisar auditoría');
    expect(contract.criticalVariables.map((variable) => variable.key)).toContain('keyword_principal');
    expect(contract.invariants).toContain('external_post_enabled=false');
    expect(contract.requiredArtifacts).toEqual(['note_run.json', 'ai_request.json', 'publication_payload.json']);
  });
});
