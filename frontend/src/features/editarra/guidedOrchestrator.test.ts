import { buildGuidedNextStep } from './guidedEngine';
import type { GuidedPipelineSnapshot } from './guidedEngine';
import {
  buildGuidedExecutionOutcome,
  buildGuidedAssistedExecution,
  buildGuidedNextStepExecution,
  buildPipelineActionExecution,
  buildPipelineControlExecutionPlan,
  operationsForGuidedAction,
} from './guidedOrchestrator';
import { buildEditarraPipelineState } from './pipelineModel';
import { editorialProfiles, noteRecipes } from './profileModel';

const profile = editorialProfiles[0];
const recipe = noteRecipes[0];

const baseSnapshot: GuidedPipelineSnapshot = {
  topicTitle: 'ARCA y depósitos fiscales',
  topicStatus: 'redaccion',
  topicEvidenceCount: 4,
  validatedEvidenceCount: 4,
  selectedTopicReady: true,
  selectedSourcesReady: true,
  selectedDraftReady: true,
  selectedQualityReady: true,
  selectedPayloadReady: true,
  canApproveGuidedAudit: true,
  preflightBlockers: 0,
  preflightWarnings: 0,
  guidedAuditRequirements: [],
};

describe('guidedOrchestrator', () => {
  it('maps assisted decisions into ordered executable operations', () => {
    expect(operationsForGuidedAction('apply_recipe')).toEqual(['apply_recipe']);
    expect(operationsForGuidedAction('complete_sources_and_generate_note')).toEqual([
      'complete_sources',
      'generate_note',
    ]);
    expect(operationsForGuidedAction('prepare_payload')).toEqual(['prepare_payload']);
  });

  it('builds a next-step payload execution plan', () => {
    const plan = buildGuidedNextStepExecution({
      nextStep: {
        id: 'payload',
        label: 'Preparar paquete publicable',
        detail: 'Preparar publication_payload.json.',
        badge: 'payload',
        tone: 'emerald',
      },
      recipe,
      topicTitle: baseSnapshot.topicTitle,
    });

    expect(plan).toMatchObject({
      source: 'next-step',
      operations: ['prepare_payload'],
      targetSurface: 'publicacion',
      packageFileKey: 'publication_payload.json',
      auditEvent: {
        event: 'Siguiente paso guiado',
        detail: `publication_payload.json preparado para "${baseSnapshot.topicTitle}".`,
      },
    });
  });

  it('builds a next-step agenda plan with a draft status message', () => {
    const plan = buildGuidedNextStepExecution({
      nextStep: {
        id: 'agenda',
        label: 'Aplicar receta',
        detail: 'Aplicar receta.',
        badge: 'agenda',
        tone: 'amber',
      },
      recipe,
      topicTitle: baseSnapshot.topicTitle,
    });

    expect(plan.operations).toEqual(['apply_recipe']);
    expect(plan.targetSurface).toBe('agenda');
    expect(plan.draftStatusMessage).toBe(`Siguiente paso ejecutado: receta ${recipe.shortLabel} aplicada.`);
  });

  it('builds an assisted flow plan that validates guided sources and generates a note', () => {
    const snapshot: GuidedPipelineSnapshot = {
      ...baseSnapshot,
      topicEvidenceCount: 4,
      validatedEvidenceCount: 0,
      selectedSourcesReady: false,
      selectedDraftReady: false,
      selectedQualityReady: false,
      selectedPayloadReady: false,
    };
    const nextStep = buildGuidedNextStep({ profile, recipe, snapshot });
    const plan = buildGuidedAssistedExecution({
      profile,
      recipe,
      snapshot,
      nextStep,
      pendingGuidedEvidenceCount: 4,
    });

    expect(plan.source).toBe('assisted-flow');
    expect(plan.operations).toEqual(['complete_sources', 'generate_note']);
    expect(plan.targetSurface).toBe('editor');
    expect(plan.packageFileKey).toBe('evidence_log.json');
    expect(plan.flowStatus).toContain('Fuentes guiadas validadas y nota generada');
    expect(plan.run?.steps).toEqual(['fuentes validadas', 'nota generada']);
  });

  it('builds an assisted audit plan with human-control metadata', () => {
    const snapshot: GuidedPipelineSnapshot = {
      ...baseSnapshot,
      selectedQualityReady: false,
      canApproveGuidedAudit: false,
      preflightBlockers: 1,
      preflightWarnings: 2,
      guidedAuditRequirements: ['quality_audit.json requiere revisión'],
    };
    const nextStep = buildGuidedNextStep({ profile, recipe, snapshot });
    const plan = buildGuidedAssistedExecution({
      profile,
      recipe,
      snapshot,
      nextStep,
      pendingGuidedEvidenceCount: 0,
    });

    expect(plan.operations).toEqual(['approve_audit']);
    expect(plan.targetSurface).toBe('auditoria');
    expect(plan.packageFileKey).toBe('quality_audit.json');
    expect(plan.run?.status).toBe('bloqueado');
    expect(plan.flowStatus).toContain('quality_audit.json requiere revisión');
  });

  it('normalizes a guided execution plan into an applicable outcome', () => {
    const plan = buildGuidedNextStepExecution({
      nextStep: {
        id: 'ai',
        label: 'Generar nota',
        detail: 'Generar nota.',
        badge: 'AI',
        tone: 'blue',
      },
      recipe,
      topicTitle: baseSnapshot.topicTitle,
    });

    expect(buildGuidedExecutionOutcome(plan)).toMatchObject({
      operations: ['generate_note'],
      targetSurface: 'editor',
      auditEvent: {
        event: 'Siguiente paso guiado',
      },
    });
  });

  it('builds a pipeline control execution plan from current stage', () => {
    const pipeline = buildEditarraPipelineState({
      topicStatus: 'redaccion',
      sourcesValidated: 0,
      sourcesRequired: 4,
      draftReady: false,
      draftStatus: 'borrador',
      qualityStatus: 'bloqueado',
      preflightBlockers: 2,
      publicationStatus: 'bloqueado',
      payloadReady: false,
      imageStatus: 'pendiente',
    });

    const plan = buildPipelineControlExecutionPlan({
      pipeline,
      topicTitle: 'Tema A',
      recipeShortLabel: 'Reactiva',
      pendingGuidedEvidenceCount: 0,
      canApproveGuidedAudit: false,
      guidedAuditRequirements: [],
    });

    expect(plan).toMatchObject({
      source: 'pipeline-control',
      operations: ['create_and_complete_source_slots'],
      targetSurface: 'auditoria',
      flowStatus: 'Control pipeline: fuentes guiadas preparadas y validadas para "Tema A".',
    });
  });

  it('routes a closable audit to the visual workflow before payload', () => {
    const plan = buildPipelineControlExecutionPlan({
      pipeline: { currentStageId: 'auditoria' },
      topicTitle: 'Tema A',
      recipeShortLabel: 'Reactiva',
      pendingGuidedEvidenceCount: 0,
      canApproveGuidedAudit: true,
      guidedAuditRequirements: [],
    });

    expect(plan).toMatchObject({
      source: 'pipeline-control',
      operations: ['approve_audit'],
      targetSurface: 'imagenes',
      packageFileKey: 'image_prompt.json',
      flowStatus: 'Control pipeline: auditoría aprobada para "Tema A". Preparar prompt visual antes del payload.',
    });
  });

  it('routes a closable audit to publication when the visual workflow is ready', () => {
    const plan = buildPipelineControlExecutionPlan({
      pipeline: { currentStageId: 'auditoria' },
      topicTitle: 'Tema A',
      recipeShortLabel: 'Reactiva',
      pendingGuidedEvidenceCount: 0,
      canApproveGuidedAudit: true,
      guidedAuditRequirements: [],
      imageReady: true,
    });

    expect(plan).toMatchObject({
      source: 'pipeline-control',
      operations: ['approve_audit_and_prepare_payload'],
      targetSurface: 'publicacion',
      packageFileKey: 'publication_payload.json',
      flowStatus: 'Control pipeline: auditoría aprobada y payload preparado para "Tema A".',
    });
  });

  it('builds a local AI application pipeline plan from the AI stage', () => {
    const plan = buildPipelineControlExecutionPlan({
      pipeline: { currentStageId: 'ai' },
      topicTitle: 'Tema A',
      recipeShortLabel: 'Reactiva',
      pendingGuidedEvidenceCount: 0,
      canApproveGuidedAudit: false,
      guidedAuditRequirements: [],
    });

    expect(plan).toMatchObject({
      source: 'pipeline-control',
      operations: ['run_local_ai_and_apply'],
      targetSurface: 'editor',
      flowStatus: 'Control pipeline: AI local ejecutada y aplicada para "Tema A".',
    });
  });

  it('returns a blocked status for disabled pipeline actions', () => {
    const pipeline = buildEditarraPipelineState({
      topicStatus: 'redaccion',
      sourcesValidated: 0,
      sourcesRequired: 4,
      draftReady: false,
      draftStatus: 'borrador',
      qualityStatus: 'bloqueado',
      preflightBlockers: 2,
      publicationStatus: 'bloqueado',
      payloadReady: false,
      imageStatus: 'pendiente',
    });

    const result = buildPipelineActionExecution({
      actionId: 'generate_note',
      actions: pipeline.actions,
      pipeline,
      topicTitle: 'Tema A',
      recipeShortLabel: 'Reactiva',
      pendingGuidedEvidenceCount: 0,
      canApproveGuidedAudit: false,
      guidedAuditRequirements: [],
    });

    expect(result).toEqual({
      status: 'blocked',
      guidedFlowStatus: 'Acción pipeline en espera: AI espera controles previos.',
    });
  });

  it('returns a ready outcome for the enabled pipeline action', () => {
    const pipeline = buildEditarraPipelineState({
      topicStatus: 'redaccion',
      sourcesValidated: 0,
      sourcesRequired: 4,
      draftReady: false,
      draftStatus: 'borrador',
      qualityStatus: 'bloqueado',
      preflightBlockers: 2,
      publicationStatus: 'bloqueado',
      payloadReady: false,
      imageStatus: 'pendiente',
    });

    const result = buildPipelineActionExecution({
      actionId: 'validate_sources',
      actions: pipeline.actions,
      pipeline,
      topicTitle: 'Tema A',
      recipeShortLabel: 'Reactiva',
      pendingGuidedEvidenceCount: 0,
      canApproveGuidedAudit: false,
      guidedAuditRequirements: [],
    });

    expect(result.status).toBe('ready');
    if (result.status === 'ready') {
      expect(result.outcome.operations).toEqual(['create_and_complete_source_slots']);
      expect(result.outcome.targetSurface).toBe('auditoria');
    }
  });
});
