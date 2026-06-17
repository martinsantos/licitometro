import {
  buildAiBriefSelection,
  buildAuditApprovalAndPayloadPreparation,
  buildAiResponseApplication,
  buildFinalPayloadPreparation,
  buildGuidedAuditApproval,
  buildLocalAiResponseGeneration,
  buildLocalAiResponseGenerationAndApplication,
} from './singleNoteFlowModel';
import { editorialProfiles, noteRecipes } from './profileModel';
import type { EditarraAiHandoff, EditarraAiRunRequest } from './aiAdapter';
import type { DraftVersion, EditorialDraft } from './productionReducer';
import type { Topic } from './workspaceModel';

const fixedNow = new Date('2026-06-06T16:20:00-03:00');

const topic: Topic = {
  id: 'topic-a',
  title: 'Tema single note',
  status: 'redaccion',
  priority: 80,
  depth: 'Media',
  tokens: 9000,
  author: 'Editor',
  source: 'Agenda',
  narrative: 'Narrativa',
  seo: 'SEO',
  publishAt: '12:00',
};

const draft: EditorialDraft = {
  id: 'draft-topic-a',
  topicId: topic.id,
  variant: 'humanizado',
  status: 'borrador',
  title: 'Borrador',
  seoTitle: 'SEO actual',
  body: 'Cuerpo actual',
  notes: 'Resumen actual',
  updatedAt: 'sin guardar',
};

const handoff: EditarraAiHandoff = {
  id: 'handoff-a',
  provider: 'provider-agnostic',
  mode: 'manual-json-handoff',
  status: 'listo_para_ai',
  sendFile: 'ai_brief.json',
  expectedFile: 'publication_payload.json',
  noExternalPost: true,
  nextAction: 'Enviar ai_brief.json.',
  sourceCount: 4,
  requiredSources: 4,
  outputSchemaKeys: ['titulo', 'contenido'],
  payloadPreview: {
    title: topic.title,
    category: 'tecnico',
    publishAt: topic.publishAt,
  },
  checksum: 'ai-checksum',
};

const request: EditarraAiRunRequest = {
  id: 'request-a',
  provider: 'provider-agnostic',
  transport: 'manual-json-copy',
  externalPostEnabled: false,
  sendFile: 'ai_brief.json',
  expectedFile: 'publication_payload.json',
  status: 'listo_para_ai',
  operationModeId: 'mode-a',
  recipeId: 'reactiva',
  profileId: editorialProfiles[0].id,
  blocked: false,
  instructions: [],
  outputSchemaKeys: ['titulo', 'contenido'],
  payloadPreview: handoff.payloadPreview,
  executableRecipe: {},
  input: {},
  checksum: 'request-checksum',
};

describe('singleNoteFlowModel', () => {
  it('selects the AI brief as an operational handoff', () => {
    const outcome = buildAiBriefSelection({ handoff, request, topic });

    expect(outcome).toMatchObject({
      activeTab: 'config',
      packageFileKey: 'ai_brief.json',
      statuses: {
        ai: `Handoff AI preparado: ${handoff.nextAction} Request: ${request.id}.`,
      },
      audit: {
        event: 'Brief AI exportado',
      },
    });
  });

  it('generates a local AI response without external POST', () => {
    const outcome = buildLocalAiResponseGeneration({
      publicationPayload: {
        titulo: 'Título payload',
        resumen: 'Resumen payload',
        contenido: 'Cuerpo payload',
      },
      currentDraft: draft,
      operationModeName: 'Modo QA',
      recipe: noteRecipes[0],
      request,
      topic,
    });

    expect(outcome.aiResponseBuffer).toContain('"external_post_enabled": false');
    expect(outcome.packageFileKey).toBe('ai_brief.json');
    expect(outcome.audit?.event).toBe('Respuesta AI local generada');
  });

  it('generates and applies a local AI response in one outcome', () => {
    const outcome = buildLocalAiResponseGenerationAndApplication({
      publicationPayload: {
        titulo: 'Título payload',
        resumen: 'Resumen payload',
        contenido: 'Lead payload\n\n## Cómo funciona por dentro\nDetalle\n\n## Qué se instala o configura primero\nSetup\n\n## Dónde se rompe y cómo probarlo\nQA\n\n## Para seguir leyendo\n- Fuente',
        meta_title: 'Meta payload',
      },
      currentDraft: draft,
      operationModeName: 'Modo QA',
      recipe: noteRecipes[0],
      request,
      topic,
      handoff,
      now: fixedNow,
    });

    expect(outcome.aiResponseBuffer).toContain('"provider": "local-dry-run"');
    expect(outcome.activeTab).toBe('editor');
    expect(outcome.productionActions?.[0]).toMatchObject({
      type: 'draft/upsert',
      draft: {
        title: 'AI aplicado - Título payload',
        seoTitle: 'Meta payload',
        status: 'listo',
      },
    });
    expect(outcome.statuses.ai).toContain('AI local ejecutada y aplicada sin POST externo');
    expect(outcome.audit?.event).toBe('AI local ejecutada y aplicada');
  });

  it('returns an AI status error when response JSON is invalid', () => {
    const outcome = buildAiResponseApplication({
      rawResponse: '{',
      currentDraft: draft,
      topic,
      handoff,
      now: fixedNow,
    });

    expect(outcome.productionActions).toBeUndefined();
    expect(outcome.statuses.ai).toContain('JSON AI invalido');
  });

  it('applies a valid AI response to the current draft', () => {
    const outcome = buildAiResponseApplication({
      rawResponse: JSON.stringify({
        publication_payload: {
          titulo: 'Título AI',
          meta_title: 'Meta AI',
          resumen: 'Resumen AI',
          contenido: 'Contenido AI',
        },
      }),
      currentDraft: draft,
      topic,
      handoff,
      now: fixedNow,
    });

    expect(outcome.draftMode).toBe('humanizado');
    expect(outcome.activeTab).toBe('editor');
    expect(outcome.productionActions?.[0]).toMatchObject({
      type: 'draft/upsert',
      draft: {
        title: 'AI aplicado - Título AI',
        seoTitle: 'Meta AI',
        body: 'Contenido AI',
        notes: 'Resumen AI',
        status: 'listo',
      },
    });
    expect(outcome.statuses.ai).toContain('advertencias');
  });

  it('blocks guided audit approval when requirements are pending', () => {
    const outcome = buildGuidedAuditApproval({
      canApprove: false,
      requirements: ['faltan fuentes'],
      currentDraft: draft,
      draftVersions: [],
      selectedAuthorName: 'Editor',
      topic,
      profile: editorialProfiles[0],
      validatedEvidenceCount: 2,
      now: fixedNow,
    });

    expect(outcome.productionActions).toBeUndefined();
    expect(outcome.packageFileKey).toBe('quality_audit.json');
    expect(outcome.statuses.package).toBe('Auditoría pendiente: faltan fuentes.');
    expect(outcome.audit?.event).toBe('Auditoría asistida pendiente');
  });

  it('approves guided audit and creates a draft version', () => {
    const previousVersion: DraftVersion = {
      id: 'version-1',
      topicId: topic.id,
      draftId: draft.id,
      version: 1,
      variant: 'humanizado',
      status: 'borrador',
      title: draft.title,
      seoTitle: draft.seoTitle,
      body: draft.body,
      notes: draft.notes,
      changeNote: 'Manual',
      snapshotAt: '10:00',
      authorName: 'Editor',
    };

    const outcome = buildGuidedAuditApproval({
      canApprove: true,
      requirements: [],
      currentDraft: draft,
      draftVersions: [previousVersion],
      selectedAuthorName: 'Editor',
      topic,
      profile: editorialProfiles[0],
      validatedEvidenceCount: 4,
      openPackageFile: false,
      now: fixedNow,
    });

    expect(outcome.activeTab).toBeUndefined();
    expect(outcome.productionActions).toHaveLength(2);
    expect(outcome.productionActions?.[0]).toMatchObject({
      type: 'draft/upsert',
      draft: {
        status: 'aprobado',
      },
    });
    expect(outcome.productionActions?.[1]).toMatchObject({
      type: 'draft-version/add',
      version: {
        version: 2,
        status: 'aprobado',
      },
    });
  });

  it('approves guided audit and prepares the publication payload in one outcome', () => {
    const outcome = buildAuditApprovalAndPayloadPreparation({
      canApprove: true,
      requirements: [],
      currentDraft: draft,
      draftVersions: [],
      selectedAuthorName: 'Editor',
      topic,
      profile: editorialProfiles[0],
      validatedEvidenceCount: 4,
      now: fixedNow,
    });

    expect(outcome.activeTab).toBe('publicacion');
    expect(outcome.packageFileKey).toBe('publication_payload.json');
    expect(outcome.registerPackage).toBe(true);
    expect(outcome.productionActions).toHaveLength(2);
    expect(outcome.statuses.package).toContain('publication_payload.json quedó preparado');
    expect(outcome.statuses.guidedFlow).toBe(`Payload final preparado para "${topic.title}" después de aprobar auditoría asistida. Revisar preview publicable antes de distribuir.`);
    expect(outcome.audit?.event).toBe('Auditoría y payload preparados');
  });

  it('prepares the final publication payload', () => {
    const outcome = buildFinalPayloadPreparation({ topic });

    expect(outcome).toMatchObject({
      activeTab: 'publicacion',
      packageFileKey: 'publication_payload.json',
      registerPackage: true,
      statuses: {
        guidedFlow: `Payload final preparado para "${topic.title}". Revisar preview publicable y publication_payload.json antes de distribuir.`,
      },
    });
  });
});
