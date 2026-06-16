import { buildEditarraAutomationRecipe } from './automationRecipeModel';
import type { EditarraAiRunRequest } from './aiAdapter';
import type { EditarraPipelineState } from './pipelineModel';
import type { EditarraNoteRun } from './runModel';
import type { OperationalRunQueueItem } from './runQueueModel';
import type { OperationalWorkspaceSnapshot } from './workspaceModel';

const workspace = {
  topic: {
    id: 'topic-1',
    title: 'Tema operativo',
    status: 'redaccion',
  },
  profile: {
    id: 'perfil-1',
    name: 'Perfil UMSA',
    site: 'www.licitometro.ar/editarra',
    postingMode: 'manual',
  },
  variables: [
    {
      key: 'keyword_principal',
      value: 'software editorial',
      source: 'nota',
      description: 'Keyword activa',
      enabled: true,
    },
    {
      key: 'apagada',
      value: 'no exportar',
      source: 'perfil',
      description: 'Variable desactivada',
      enabled: false,
    },
  ],
} as OperationalWorkspaceSnapshot;

const pipeline = {
  status: 'operando',
  progress: 40,
  currentStageId: 'fuentes',
  nextControl: 'Validar fuentes guiadas',
  blockers: ['1/4 fuentes validadas'],
  actions: [
    {
      id: 'validate_sources',
      stageId: 'fuentes',
      label: 'Validar fuentes guiadas',
      enabled: true,
      primary: true,
      reason: 'Control actual: Validar fuentes guiadas.',
    },
  ],
} as EditarraPipelineState;

const noteRun = {
  id: 'run-topic-1-reactiva-perfil-1',
  topicId: 'topic-1',
  topicTitle: 'Tema operativo',
} as EditarraNoteRun;

const aiRunRequest = {
  sendFile: 'ai_brief.json',
  expectedFile: 'publication_payload.json',
} as EditarraAiRunRequest;

const runQueue = [
  {
    id: 'queue-1',
    topicTitle: 'Tema operativo',
    stage: 'fuentes',
    stageLabel: 'Validar fuentes',
    actionLabel: 'Validar fuentes',
    artifact: 'evidence_log.json',
    reason: 'Fuentes incompletas',
  },
] as OperationalRunQueueItem[];

describe('automationRecipeModel', () => {
  it('builds a portable next-action recipe for operators and external AI', () => {
    const recipe = buildEditarraAutomationRecipe({
      workspace,
      noteRun,
      pipeline,
      aiRunRequest,
      runQueue,
      importBackTarget: 'www.licitometro.ar/editarra',
    });

    expect(recipe).toMatchObject({
      product: 'editarra',
      version: 1,
      executionMode: 'manual-json-copy',
      externalPostEnabled: false,
      runId: 'run-topic-1-reactiva-perfil-1',
      recommendedCommand: {
        actionId: 'validate_sources',
        targetArtifact: 'evidence_log.json',
        expectedOutput: 'evidence_log.json',
      },
      executionPreflight: {
        state: 'ready',
        canRunNow: true,
        humanReviewRequired: false,
        blockedBy: [],
        nextMutation: 'Validar fuentes guiadas -> evidence_log.json',
      },
      artifacts: {
        importBackTarget: 'www.licitometro.ar/editarra',
      },
    });
    expect(recipe.criticalVariables).toEqual([
      {
        key: 'keyword_principal',
        value: 'software editorial',
        source: 'nota',
        description: 'Keyword activa',
      },
    ]);
    expect(recipe.invariants).toContain('external_post_enabled=false');
    expect(recipe.artifacts.readFirst).toContain('operational_contract.json');
    expect(recipe.artifacts.produceOrUpdate).toContain('publication_payload.json');
    expect(recipe.executionPreflight.willUpdate).toEqual([
      'evidence_log.json',
      'publication_payload.json',
      'package_manifest.json',
    ]);
  });
});
