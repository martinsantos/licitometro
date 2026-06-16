import {
  buildGuidedAutopilotPlan,
  buildGuidedNextStep,
  createGuidedRunRecord,
  decideGuidedAssistedAction,
  type GuidedPipelineSnapshot,
} from './guidedEngine';
import { editorialProfiles, noteRecipes } from './profileModel';

const profile = editorialProfiles[0];
const recipe = noteRecipes[0];

const snapshot = (patch: Partial<GuidedPipelineSnapshot> = {}): GuidedPipelineSnapshot => ({
  topicTitle: 'Nota operativa de prueba',
  topicStatus: 'redaccion',
  topicEvidenceCount: 4,
  validatedEvidenceCount: 4,
  selectedTopicReady: true,
  selectedSourcesReady: true,
  selectedDraftReady: true,
  selectedQualityReady: true,
  selectedPayloadReady: true,
  canApproveGuidedAudit: false,
  preflightBlockers: 0,
  preflightWarnings: 0,
  guidedAuditRequirements: [],
  ...patch,
});

describe('guidedEngine', () => {
  it('routes an unprepared topic to agenda recipe application', () => {
    const nextStep = buildGuidedNextStep({
      profile,
      recipe,
      snapshot: snapshot({
        topicStatus: 'sugerido',
        selectedTopicReady: false,
        selectedSourcesReady: false,
        selectedDraftReady: false,
      }),
    });

    const decision = decideGuidedAssistedAction({
      profile,
      recipe,
      snapshot: snapshot({
        topicStatus: 'sugerido',
        selectedTopicReady: false,
        selectedSourcesReady: false,
        selectedDraftReady: false,
      }),
      nextStep,
      pendingGuidedEvidenceCount: 0,
    });

    expect(nextStep.id).toBe('agenda');
    expect(decision.action).toBe('apply_recipe');
    expect(decision.targetSurface).toBe('agenda');
    expect(decision.run.nextControl).toBe('Completar fuentes');
  });

  it('blocks AI behind source creation when evidence is incomplete', () => {
    const currentSnapshot = snapshot({
      topicEvidenceCount: 4,
      validatedEvidenceCount: 4,
      selectedSourcesReady: false,
      selectedDraftReady: false,
    });
    const nextStep = buildGuidedNextStep({
      profile: { ...profile, sourceMinimum: 5 },
      recipe,
      snapshot: currentSnapshot,
    });
    const decision = decideGuidedAssistedAction({
      profile: { ...profile, sourceMinimum: 5 },
      recipe,
      snapshot: currentSnapshot,
      nextStep,
      pendingGuidedEvidenceCount: 0,
    });

    expect(nextStep.id).toBe('sources');
    expect(nextStep.detail).toContain('4/5 fuentes validadas');
    expect(decision.action).toBe('create_source_slots');
    expect(decision.packageFileKey).toBe('evidence_log.json');
    expect(decision.run.steps).toEqual(['slots de evidencia']);
  });

  it('validates pending guided sources and generates the note when the minimum is reached', () => {
    const currentSnapshot = snapshot({
      topicEvidenceCount: 4,
      validatedEvidenceCount: 4,
      selectedSourcesReady: false,
      selectedDraftReady: false,
      selectedPayloadReady: false,
    });
    const nextStep = buildGuidedNextStep({
      profile: { ...profile, sourceMinimum: 5 },
      recipe,
      snapshot: currentSnapshot,
    });
    const decision = decideGuidedAssistedAction({
      profile: { ...profile, sourceMinimum: 5 },
      recipe,
      snapshot: currentSnapshot,
      nextStep,
      pendingGuidedEvidenceCount: 1,
    });

    expect(decision.action).toBe('complete_sources_and_generate_note');
    expect(decision.targetSurface).toBe('editor');
    expect(decision.run.steps).toEqual(['fuentes validadas', 'nota generada']);
    expect(decision.run.nextControl).toBe('Auditoría asistida');
  });

  it('keeps audit as a human control before payload preparation', () => {
    const currentSnapshot = snapshot({
      canApproveGuidedAudit: true,
      preflightBlockers: 1,
      guidedAuditRequirements: [],
    });
    const nextStep = buildGuidedNextStep({ profile, recipe, snapshot: currentSnapshot });
    const decision = decideGuidedAssistedAction({
      profile,
      recipe,
      snapshot: currentSnapshot,
      nextStep,
      pendingGuidedEvidenceCount: 0,
    });

    expect(nextStep.id).toBe('audit');
    expect(nextStep.label).toBe('Aprobar auditoría asistida');
    expect(decision.action).toBe('approve_audit');
    expect(decision.targetSurface).toBe('auditoria');
    expect(decision.run.status).toBe('pausado');
    expect(decision.run.nextControl).toBe('Preparar payload');
  });

  it('creates an exportable completed run record for a ready payload', () => {
    const currentSnapshot = snapshot();
    const nextStep = buildGuidedNextStep({ profile, recipe, snapshot: currentSnapshot });
    const decision = decideGuidedAssistedAction({
      profile,
      recipe,
      snapshot: currentSnapshot,
      nextStep,
      pendingGuidedEvidenceCount: 0,
    });
    const plan = buildGuidedAutopilotPlan({
      profile,
      recipe,
      snapshot: currentSnapshot,
      nextStep,
      pendingGuidedEvidenceCount: 0,
    });
    const record = createGuidedRunRecord({
      topicId: 'topic-test',
      recipeId: recipe.id,
      profileId: profile.id,
      run: decision.run,
      now: new Date('2026-06-05T12:00:00-03:00'),
    });

    expect(nextStep.id).toBe('payload');
    expect(decision.action).toBe('prepare_payload');
    expect(decision.targetSurface).toBe('publicacion');
    expect(plan.mode).toBe('listo');
    expect(plan.progress).toBe(100);
    expect(plan.stages.find((stage) => stage.id === 'payload')?.status).toBe('listo');
    expect(record.id).toBe('guided-run-topic-test-1780671600000');
    expect(record.status).toBe('completo');
    expect(record.nextControl).toBe('Listo para exportar');
  });

  it('builds an autopilot plan for an unprepared topic', () => {
    const currentSnapshot = snapshot({
      topicStatus: 'sugerido',
      topicEvidenceCount: 0,
      validatedEvidenceCount: 0,
      selectedTopicReady: false,
      selectedSourcesReady: false,
      selectedDraftReady: false,
      selectedQualityReady: false,
      selectedPayloadReady: false,
    });
    const nextStep = buildGuidedNextStep({ profile, recipe, snapshot: currentSnapshot });
    const plan = buildGuidedAutopilotPlan({
      profile,
      recipe,
      snapshot: currentSnapshot,
      nextStep,
      pendingGuidedEvidenceCount: 0,
    });

    expect(plan.mode).toBe('operando');
    expect(plan.primaryActionLabel).toBe('Aplicar receta');
    expect(plan.stages.map((stage) => stage.status)).toEqual(['activo', 'pendiente', 'pendiente', 'pendiente', 'pendiente']);
    expect(plan.progress).toBe(10);
  });

  it('shows a combined source validation and note generation autopilot action', () => {
    const currentSnapshot = snapshot({
      topicEvidenceCount: 4,
      validatedEvidenceCount: 4,
      selectedSourcesReady: false,
      selectedDraftReady: false,
      selectedPayloadReady: false,
    });
    const nextStep = buildGuidedNextStep({
      profile: { ...profile, sourceMinimum: 5 },
      recipe,
      snapshot: currentSnapshot,
    });
    const plan = buildGuidedAutopilotPlan({
      profile: { ...profile, sourceMinimum: 5 },
      recipe,
      snapshot: currentSnapshot,
      nextStep,
      pendingGuidedEvidenceCount: 1,
    });

    expect(plan.primaryActionLabel).toBe('Validar fuentes y generar');
    expect(plan.stages.find((stage) => stage.id === 'sources')?.status).toBe('activo');
    expect(plan.stages.find((stage) => stage.id === 'ai')?.status).toBe('activo');
    expect(plan.humanControl).toBe('Auditoría asistida');
  });

  it('marks audit as human control when preflight is blocked', () => {
    const currentSnapshot = snapshot({
      preflightBlockers: 2,
      selectedQualityReady: false,
      canApproveGuidedAudit: false,
      guidedAuditRequirements: ['quality_audit.json requiere revisión', 'fuente dudosa'],
    });
    const nextStep = buildGuidedNextStep({ profile, recipe, snapshot: currentSnapshot });
    const plan = buildGuidedAutopilotPlan({
      profile,
      recipe,
      snapshot: currentSnapshot,
      nextStep,
      pendingGuidedEvidenceCount: 0,
    });

    expect(plan.mode).toBe('control_humano');
    expect(plan.primaryActionLabel).toBe('Revisar auditoría');
    expect(plan.stages.find((stage) => stage.id === 'audit')?.status).toBe('bloqueado');
    expect(plan.humanControl).toContain('quality_audit.json');
  });
});
