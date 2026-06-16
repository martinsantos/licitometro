import {
  buildDailyBatchGuidedEvidenceCompletion,
  buildEvidenceValidation,
  buildGuidedEvidenceCompletion,
  buildGuidedEvidenceSlotCreationAndCompletion,
  buildGuidedEvidenceSlotCreation,
  buildManualEvidenceCreation,
} from './evidenceFlowModel';
import { editorialProfiles, noteRecipes } from './profileModel';
import type { EvidenceRecord } from './productionReducer';
import type { Topic } from './workspaceModel';

const topic: Topic = {
  id: 'topic-a',
  title: 'Tema evidencia',
  status: 'redaccion',
  priority: 80,
  depth: 'Media',
  tokens: 9000,
  author: 'Editor',
  source: 'Fuente',
  narrative: 'Narrativa',
  seo: 'SEO',
  publishAt: '12:00',
};

const guidedEvidence: EvidenceRecord = {
  id: 'evidence-guided-topic-a-1-0',
  topicId: topic.id,
  sourceName: 'Fuente guiada 1: Norma oficial',
  sourceUrl: 'https://',
  claim: '',
  status: 'pendiente',
  confidence: 45,
  notes: 'Pendiente',
};

describe('evidenceFlowModel', () => {
  it('builds manual evidence creation with audit detail', () => {
    const outcome = buildManualEvidenceCreation({
      id: 'evidence-new',
      topic,
    });

    expect(outcome.productionAction).toMatchObject({
      type: 'evidence/add',
      evidence: {
        id: 'evidence-new',
        topicId: topic.id,
        sourceName: 'Nueva fuente',
        status: 'pendiente',
      },
    });
    expect(outcome.audit).toEqual({
      event: 'Evidencia agregada',
      detail: 'Nueva evidencia para "Tema evidencia".',
    });
  });

  it('opens the evidence matrix when the source minimum is already satisfied', () => {
    const existingEvidence = Array.from({ length: editorialProfiles[0].sourceMinimum }, (_, index) => ({
      ...guidedEvidence,
      id: `evidence-existing-${index}`,
      sourceName: `Fuente ${index + 1}`,
    }));

    const outcome = buildGuidedEvidenceSlotCreation({
      topic,
      recipe: noteRecipes[0],
      profile: editorialProfiles[0],
      selectedTopicEvidence: existingEvidence,
    });

    expect(outcome.productionAction).toBeUndefined();
    expect(outcome).toMatchObject({
      activeTab: 'auditoria',
      packageFileKey: 'evidence_log.json',
      packageStatus: 'La matriz ya tiene la cantidad minima de fuentes; validar evidencia pendiente.',
      audit: {
        event: 'Evidencias guiadas revisadas',
      },
    });
  });

  it('creates guided evidence slots when sources are missing', () => {
    const outcome = buildGuidedEvidenceSlotCreation({
      topic,
      recipe: noteRecipes[0],
      profile: editorialProfiles[0],
      selectedTopicEvidence: [],
    });

    expect(outcome.productionAction?.type).toBe('evidence/add-many');
    expect(outcome.productionAction && 'evidence' in outcome.productionAction ? outcome.productionAction.evidence : []).toHaveLength(
      editorialProfiles[0].sourceMinimum,
    );
    expect(outcome.packageStatus).toContain('evidencias guiadas creadas');
    expect(outcome.audit.detail).toContain(noteRecipes[0].shortLabel);
  });

  it('creates and validates missing guided evidence in one operational outcome', () => {
    const outcome = buildGuidedEvidenceSlotCreationAndCompletion({
      topic,
      recipe: noteRecipes[0],
      profile: editorialProfiles[0],
      selectedTopicEvidence: [],
    });

    expect(outcome.productionActions).toHaveLength(2);
    expect(outcome.productionActions?.[0]).toMatchObject({
      type: 'evidence/add-many',
    });
    expect(outcome.productionActions?.[1]).toMatchObject({
      type: 'evidence/bulk-update',
    });
    expect(outcome.packageStatus).toContain('creadas, completadas y validadas');
    expect(outcome.guidedFlowStatus).toContain('preparadas y validadas');
    expect(outcome.audit.event).toBe('Evidencias guiadas preparadas y validadas');
  });

  it('validates evidence with minimum confidence and source audit text', () => {
    const outcome = buildEvidenceValidation({
      evidenceId: guidedEvidence.id,
      evidence: [guidedEvidence],
      topic,
    });

    expect(outcome.productionAction).toEqual({
      type: 'evidence/validate',
      evidenceId: guidedEvidence.id,
      minConfidence: 75,
    });
    expect(outcome.audit.detail).toBe('Fuente guiada 1: Norma oficial para "Tema evidencia".');
  });

  it('completes pending guided evidence or reports when none are pending', () => {
    const empty = buildGuidedEvidenceCompletion({
      topic,
      evidence: [],
      pendingGuidedEvidence: [],
    });
    const completed = buildGuidedEvidenceCompletion({
      topic,
      evidence: [guidedEvidence],
      pendingGuidedEvidence: [guidedEvidence],
    });

    expect(empty.productionAction).toBeUndefined();
    expect(empty.guidedFlowStatus).toBe('Sin fuentes guiadas pendientes para "Tema evidencia".');
    expect(completed.productionAction?.type).toBe('evidence/bulk-update');
    expect(completed.packageFileKey).toBe('evidence_log.json');
    expect(completed.audit.event).toBe('Evidencias guiadas validadas');
  });

  it('completes guided evidence across daily batches with profile-aware status', () => {
    const topicB = { ...topic, id: 'topic-b', title: 'Tema B' };
    const pendingB = {
      ...guidedEvidence,
      id: 'evidence-guided-topic-b-1-0',
      topicId: topicB.id,
      sourceName: 'Fuente guiada 1: Documentación técnica',
    };
    const outcome = buildDailyBatchGuidedEvidenceCompletion({
      control: {
        active: true,
        topicIds: [topic.id, topicB.id],
      },
      topics: [topic, topicB],
      evidence: [guidedEvidence, pendingB],
      profileName: 'UMSA Diaria',
    });

    expect(outcome.productionAction?.type).toBe('evidence/bulk-update');
    expect(outcome.packageStatus).toBe('2 evidencias guiadas completadas y validadas para la tanda diaria UMSA Diaria.');
    expect(outcome.guidedFlowStatus).toBe('2 fuentes guiadas validadas para la tanda diaria (2 notas). Próximo control: AI por nota.');
    expect(outcome.audit.detail).toContain('"Tema evidencia", "Tema B"');
  });

  it('reports inactive or already complete daily batch evidence states', () => {
    expect(buildDailyBatchGuidedEvidenceCompletion({
      control: { active: false, topicIds: [] },
      topics: [topic],
      evidence: [guidedEvidence],
      profileName: 'UMSA Diaria',
    })).toMatchObject({
      packageStatus: 'No hay tanda diaria activa para validar.',
      audit: { event: 'Fuentes de tanda revisadas', detail: 'Sin tanda diaria activa.' },
    });

    expect(buildDailyBatchGuidedEvidenceCompletion({
      control: { active: true, topicIds: [topic.id] },
      topics: [topic],
      evidence: [{ ...guidedEvidence, status: 'validado' }],
      profileName: 'UMSA Diaria',
    })).toMatchObject({
      packageStatus: 'No hay evidencias guiadas pendientes para esta tanda diaria.',
      guidedFlowStatus: 'Sin fuentes guiadas pendientes para la tanda diaria activa.',
    });
  });
});
