import {
  buildDailyBatchAiApplication,
  buildDailyBatchAuditApproval,
  buildDailyBatchPayloadPreparation,
  type DailyBatchFlowControl,
} from './dailyBatchFlowModel';
import { editorialProfiles, noteRecipes } from './profileModel';
import type { DraftVersion, EditorialDraft, EvidenceRecord } from './productionReducer';
import type { Topic, WorkflowVariable } from './workspaceModel';

const profile = editorialProfiles[0];
const recipe = noteRecipes[0];
const fixedNow = new Date('2026-06-06T15:30:00-03:00');

const topicA: Topic = {
  id: 'topic-a',
  title: 'Tema A',
  status: 'redaccion',
  priority: 80,
  depth: 'Media',
  tokens: 9000,
  author: 'Editor A',
  source: 'Agenda',
  narrative: 'Narrativa A',
  seo: 'SEO A',
  publishAt: '10:00',
};

const topicB: Topic = {
  ...topicA,
  id: 'topic-b',
  title: 'Tema B',
  author: 'Editor B',
};

const draftA: EditorialDraft = {
  id: 'draft-topic-a',
  topicId: topicA.id,
  variant: 'humanizado',
  status: 'borrador',
  title: 'Borrador A',
  seoTitle: 'SEO A',
  body: 'Cuerpo A',
  notes: 'Notas A',
  updatedAt: 'sin guardar',
};

const draftB: EditorialDraft = {
  ...draftA,
  id: 'draft-topic-b',
  topicId: topicB.id,
  title: 'Borrador B',
};

const evidenceFor = (topicId: string, index: number): EvidenceRecord => ({
  id: `evidence-${topicId}-${index}`,
  topicId,
  sourceName: `Fuente ${index}`,
  sourceUrl: `https://example.com/${topicId}/${index}`,
  claim: `Claim ${index}`,
  status: 'validado',
  confidence: 90,
  notes: 'Validada',
});

const activeControl: DailyBatchFlowControl = {
  active: true,
  topicIds: [topicA.id, topicB.id],
  topicCount: 2,
  validated: profile.sourceMinimum,
  sourceMinimum: profile.sourceMinimum,
  aiReady: 2,
  auditApproved: 2,
  payloadReady: 2,
};

const variables: WorkflowVariable[] = [{
  id: 'var-keyword',
  key: 'keyword_principal',
  value: 'infraestructura abierta',
  description: 'Keyword',
  scope: 'editor',
  enabled: true,
}];

describe('dailyBatchFlowModel', () => {
  it('blocks AI application when no daily batch is active', () => {
    const outcome = buildDailyBatchAiApplication({
      control: { ...activeControl, active: false, topicIds: [] },
      topics: [topicA, topicB],
      selectedTopic: topicA,
      profile,
      selectedRecipe: recipe,
      recipes: noteRecipes,
      evidence: [],
      drafts: [draftA, draftB],
      effectiveVariables: variables,
      existingGuidedRunRecords: [],
      getRecipeId: () => recipe.id,
      now: fixedNow,
    });

    expect(outcome.productionAction).toBeUndefined();
    expect(outcome.statuses.ai).toBe('No hay tanda diaria activa para aplicar AI por lote.');
    expect(outcome.audit.event).toBe('AI de tanda revisada');
  });

  it('blocks AI application until enough sources are validated', () => {
    const outcome = buildDailyBatchAiApplication({
      control: { ...activeControl, validated: 1 },
      topics: [topicA, topicB],
      selectedTopic: topicA,
      profile,
      selectedRecipe: recipe,
      recipes: noteRecipes,
      evidence: [],
      drafts: [draftA, draftB],
      effectiveVariables: variables,
      existingGuidedRunRecords: [],
      getRecipeId: () => recipe.id,
      now: fixedNow,
    });

    expect(outcome.productionAction).toBeUndefined();
    expect(outcome.statuses.ai).toBe(`Validar fuentes antes de AI de tanda: 1/${profile.sourceMinimum}.`);
    expect(outcome.audit.event).toBe('AI de tanda bloqueada');
  });

  it('applies AI to every draft in the active daily batch', () => {
    const outcome = buildDailyBatchAiApplication({
      control: activeControl,
      topics: [topicA, topicB],
      selectedTopic: topicA,
      profile,
      selectedRecipe: recipe,
      recipes: noteRecipes,
      evidence: [
        ...Array.from({ length: profile.sourceMinimum }, (_, index) => evidenceFor(topicA.id, index)),
        ...Array.from({ length: profile.sourceMinimum }, (_, index) => evidenceFor(topicB.id, index)),
      ],
      drafts: [draftA, draftB],
      effectiveVariables: variables,
      existingGuidedRunRecords: [],
      getRecipeId: () => recipe.id,
      now: fixedNow,
    });

    expect(outcome.draftMode).toBe('humanizado');
    expect(outcome.packageFileKey).toBe('quality_audit.json');
    expect(outcome.productionAction).toMatchObject({ type: 'state/patch' });

    const patch = outcome.productionAction?.type === 'state/patch' ? outcome.productionAction.patch : {};
    expect(patch.drafts).toHaveLength(2);
    expect(patch.drafts?.[0]).toMatchObject({
      topicId: topicA.id,
      status: 'listo',
      title: `AI tanda - ${topicA.title}`,
    });
    expect(patch.guidedRunRecords).toHaveLength(2);
    expect(outcome.audit).toEqual({
      event: 'AI de tanda aplicada',
      detail: `2 borradores marcados como listos desde ${profile.name}.`,
    });
  });

  it('approves daily batch audit and creates draft versions', () => {
    const previousVersion: DraftVersion = {
      id: 'version-old',
      topicId: topicA.id,
      draftId: draftA.id,
      version: 1,
      variant: 'humanizado',
      status: 'borrador',
      title: draftA.title,
      seoTitle: draftA.seoTitle,
      body: draftA.body,
      notes: draftA.notes,
      changeNote: 'Anterior',
      snapshotAt: '10:00',
      authorName: topicA.author,
    };

    const outcome = buildDailyBatchAuditApproval({
      control: activeControl,
      topics: [topicA, topicB],
      selectedTopic: topicA,
      selectedAuthorName: 'Editor fallback',
      profile,
      drafts: [draftA, draftB],
      draftVersions: [previousVersion],
      existingGuidedRunRecords: [],
      getRecipeId: () => recipe.id,
      now: fixedNow,
    });

    const patch = outcome.productionAction?.type === 'state/patch' ? outcome.productionAction.patch : {};
    expect(outcome.packageFileKey).toBe('quality_audit.json');
    expect(patch.drafts?.every((draft) => draft.status === 'aprobado')).toBe(true);
    expect(patch.draftVersions).toHaveLength(3);
    expect(patch.guidedRunRecords).toHaveLength(2);
    expect(outcome.statuses.package).toBe('Auditoría de tanda aprobó 2 borradores; publication_payload.json queda como próximo paso.');
  });

  it('blocks payload preparation until every batch note is audited', () => {
    const outcome = buildDailyBatchPayloadPreparation({
      control: { ...activeControl, auditApproved: 1 },
    });

    expect(outcome.registerPackage).toBeUndefined();
    expect(outcome.statuses.package).toBe('Payload de tanda bloqueado: auditoría 1/2.');
    expect(outcome.audit.event).toBe('Payload de tanda bloqueado');
  });

  it('prepares the daily batch payload manifest when audit is approved', () => {
    const outcome = buildDailyBatchPayloadPreparation({
      control: activeControl,
    });

    expect(outcome).toMatchObject({
      activeTab: 'config',
      packageFileKey: 'package_manifest.json',
      registerPackage: true,
      statuses: {
        package: 'Manifest de tanda listo: 2/2 payloads publicables.',
        guidedFlow: 'Payload de tanda preparado para 2 notas. Exportar JSON o revisar distribution_plan.',
      },
      audit: {
        event: 'Payload de tanda preparado',
      },
    });
  });
});
