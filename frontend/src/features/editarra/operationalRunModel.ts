import {
  buildEditarraLocalAiResponse,
  parseEditarraAiResponse,
} from './aiAdapter';
import { createDefaultTopic } from './domainReducer';
import { createGuidedRunRecord } from './guidedEngine';
import type { GuidedRunRecord } from './guidedEngine';
import {
  buildGuidedEvidenceCompletionUpdates,
  buildGuidedEvidenceSlots,
  buildProfileNoteGeneration,
  buildRecipeTopicPatch,
  isGuidedEvidenceRecord,
} from './generationFlow';
import type { GenerationEditorRule, ProfileNoteGenerationResult } from './generationFlow';
import type { DraftExecutableRecipe, EditorialPackageFileKey } from './operations';
import { draftCopies } from './persistenceModel';
import type { EditarraRecipeKey, EditorialProfile, NoteRecipe } from './profileModel';
import {
  createDraftVersionSnapshot,
  nextDraftVersionNumber,
} from './productionReducer';
import type {
  DraftStatus,
  DraftVersion,
  EditorialDraft,
  EvidenceRecord,
} from './productionReducer';
import type {
  Author,
  Topic,
  WorkflowVariable,
} from './workspaceModel';
import { completeRecipeVariables } from './workspaceModel';

export type OperationalProfileNoteResult = {
  generation: ProfileNoteGenerationResult;
  guidedEvidence: EvidenceRecord[];
  localAiResponse: string;
  operationalDraft: EditorialDraft;
  nextVersion: DraftVersion;
  nextRun: GuidedRunRecord;
  targetSurface: 'auditoria' | 'editor';
  packageFileKey: EditorialPackageFileKey;
  statuses: {
    ai: string;
    draft: string;
    guidedFlow: string;
    package: string;
    auditEvent: string;
    auditDetail: string;
  };
};

export type BuildExecutableRecipeForRun = (
  recipe: NoteRecipe,
  author: Author,
  variables: WorkflowVariable[],
) => DraftExecutableRecipe;

export type CockpitGeneratedRunResult = {
  topic: Topic;
  draft: EditorialDraft;
  evidence: EvidenceRecord[];
  guidedRun: GuidedRunRecord;
  completedWorkflowVariables: WorkflowVariable[];
  statuses: {
    ai: string;
    draft: string;
    guidedFlow: string;
    package: string;
    auditEvent: string;
    auditDetail: string;
  };
};

export type CockpitDailyBatchResult = {
  topics: Topic[];
  drafts: EditorialDraft[];
  evidence: EvidenceRecord[];
  guidedRuns: GuidedRunRecord[];
  completedWorkflowVariables: WorkflowVariable[];
  selectedRecipeId?: EditarraRecipeKey;
  statuses: {
    ai: string;
    draft: string;
    guidedFlow: string;
    package: string;
    auditEvent: string;
    auditDetail: string;
  };
};

export type DailyBatchAutopilotResult = {
  evidence: EvidenceRecord[];
  drafts: EditorialDraft[];
  draftVersions: DraftVersion[];
  guidedRuns: GuidedRunRecord[];
  batchTopicCount: number;
  statuses: {
    ai: string;
    draft: string;
    guidedFlow: string;
    package: string;
    auditEvent: string;
    auditDetail: string;
  };
};

export type SingleNoteAutopilotResult = {
  topic: Topic;
  evidence: EvidenceRecord[];
  drafts: EditorialDraft[];
  draftVersion: DraftVersion;
  guidedRun: GuidedRunRecord;
  completedWorkflowVariables: WorkflowVariable[];
  statuses: {
    ai: string;
    draft: string;
    guidedFlow: string;
    package: string;
    auditEvent: string;
    auditDetail: string;
  };
};

export const buildDailyBatchAiDraft = ({
  draft,
  topic,
  recipe,
  topicEvidence,
  profile,
  effectiveVariables,
  updatedAt,
  status = 'listo',
}: {
  draft: EditorialDraft;
  topic: Topic;
  recipe: NoteRecipe;
  topicEvidence: EvidenceRecord[];
  profile: EditorialProfile;
  effectiveVariables: WorkflowVariable[];
  updatedAt: string;
  status?: DraftStatus;
}): EditorialDraft => {
  const sourceList = topicEvidence.slice(0, profile.sourceMinimum).map((item) => (
    `- ${item.sourceName}: ${item.claim} (${item.sourceUrl})`
  )).join('\n');
  const criticalVariables = effectiveVariables
    .filter((variable) => variable.enabled)
    .slice(0, 5)
    .map((variable) => `${variable.key}=${variable.value}`)
    .join('; ');

  return {
    ...draft,
    title: `AI tanda - ${topic.title}`,
    seoTitle: topic.title,
    body: [
      `${topic.title}`,
      '',
      `La corrida automatizada de EDITARRA prepara esta nota con el perfil ${profile.name}, la receta ${recipe.shortLabel} y control humano UMSA antes de publicar. El enfoque prioriza evidencia primaria, trazabilidad JSON y una salida que pueda revisarse sin depender de una API de producción.`,
      '',
      '## Cómo funciona por dentro',
      `El flujo toma el tema de agenda, aplica la receta ${recipe.label}, conserva la voz del autor asignado y cruza las variables activas del workspace. La tanda se arma como tres piezas coordinadas para cubrir reacción, explicación evergreen y caso aplicado sin perder auditoría por nota.`,
      '',
      '## Qué se instala o configura primero',
      `Antes de publicar se configuran fuentes mínimas, tono del perfil, influencias del autor, variables críticas y payload JSON. Variables activas usadas por esta corrida: ${criticalVariables || 'sin variables críticas habilitadas'}.`,
      '',
      '## Dónde se rompe y cómo probarlo',
      'El punto débil es publicar sin fuente validada, sin revisión de headings o sin revisar enlaces profundos. La prueba mínima es abrir evidence_log.json, confirmar las fuentes validadas, revisar quality_audit.json y recién después preparar publication_payload.json.',
      '',
      '## Para seguir leyendo',
      sourceList || '- Completar fuentes validadas antes de publicar.',
    ].join('\n'),
    notes: `AI local/provider-agnostic aplicada por tanda. Perfil: ${profile.name}. Receta: ${recipe.shortLabel}.`,
    status,
    updatedAt,
  };
};

export const buildCockpitGeneratedRun = ({
  rawTitle,
  runId,
  authors,
  fallbackAuthor,
  profile,
  recipe,
  rules,
  workflowVariables,
  executableRecipeFor,
}: {
  rawTitle: string;
  runId: number;
  authors: Author[];
  fallbackAuthor: Author;
  profile: EditorialProfile;
  recipe: NoteRecipe;
  rules: GenerationEditorRule[];
  workflowVariables: WorkflowVariable[];
  executableRecipeFor: BuildExecutableRecipeForRun;
}): CockpitGeneratedRunResult => {
  const baseTopic = createDefaultTopic({
    id: `topic-run-${runId}`,
    authorName: fallbackAuthor.name,
  });
  const nextTitle = rawTitle.trim() || `${recipe.shortLabel}: ${baseTopic.title}`;
  const nextTopic: Topic = {
    ...baseTopic,
    title: nextTitle,
    author: fallbackAuthor.name,
    narrative: `${baseTopic.narrative} Corrida creada desde cockpit con perfil ${profile.name}.`,
    seo: `Keyword principal pendiente. Receta ${recipe.shortLabel}. ${baseTopic.seo}`,
  };
  const completedVariables = completeRecipeVariables(recipe, workflowVariables);
  const nextDraft: EditorialDraft = {
    id: `draft-${nextTopic.id}`,
    topicId: nextTopic.id,
    variant: 'humanizado',
    status: 'borrador',
    title: `Borrador UMSA humanizado - ${nextTitle}`,
    seoTitle: nextTitle,
    body: draftCopies.humanizado.body,
    notes: 'Corrida generada desde el cockpit operativo.',
    updatedAt: 'sin guardar',
  };
  const generation = buildProfileNoteGeneration({
    topic: nextTopic,
    authors,
    selectedAuthor: fallbackAuthor,
    profile,
    recipe,
    currentDraft: nextDraft,
    rules,
    effectiveVariables: completedVariables,
    workflowVariables,
    executableRecipe: executableRecipeFor(recipe, fallbackAuthor, completedVariables),
    now: new Date(runId),
  });
  const evidence = buildGuidedEvidenceSlots({
    topic: generation.recipeTopic,
    recipe,
    profile,
    existingEvidence: [],
    nowMs: runId,
  }).evidence;
  const guidedRun = createGuidedRunRecord({
    topicId: generation.recipeTopic.id,
    recipeId: recipe.id,
    profileId: profile.id,
    now: new Date(runId),
    run: {
      status: 'pausado',
      steps: ['tema creado', 'fuentes guiadas creadas', 'nota generada'],
      nextControl: 'Validar fuentes guiadas',
      summary: `Corrida generativa preparada para ${generation.recipeTopic.title}.`,
    },
  });

  return {
    topic: generation.recipeTopic,
    draft: generation.draft,
    evidence,
    guidedRun,
    completedWorkflowVariables: generation.completedWorkflowVariables,
    statuses: {
      ai: `Nota y fuentes guiadas creadas desde cockpit con ${profile.name} / ${recipe.shortLabel}. Validar evidencia antes de publicar.`,
      draft: `Corrida generativa creada para "${generation.recipeTopic.title}".`,
      guidedFlow: `Corrida creada con ${evidence.length} fuentes guiadas y nota generada para "${generation.recipeTopic.title}". Próximo control: validar fuentes.`,
      package: `${evidence.length} slots de evidencia creados para "${generation.recipeTopic.title}".`,
      auditEvent: 'Corrida generativa creada',
      auditDetail: `${profile.name} + ${recipe.label} para "${generation.recipeTopic.title}" con ${evidence.length} fuentes guiadas.`,
    },
  };
};

export const buildCockpitDailyBatch = ({
  batchId,
  authors,
  fallbackAuthor,
  profile,
  recipes,
  rules,
  workflowVariables,
  executableRecipeFor,
}: {
  batchId: number;
  authors: Author[];
  fallbackAuthor: Author;
  profile: EditorialProfile;
  recipes: NoteRecipe[];
  rules: GenerationEditorRule[];
  workflowVariables: WorkflowVariable[];
  executableRecipeFor: BuildExecutableRecipeForRun;
}): CockpitDailyBatchResult => {
  let completedVariables = workflowVariables;
  const topics: Topic[] = [];
  const drafts: EditorialDraft[] = [];
  const evidence: EvidenceRecord[] = [];
  const guidedRuns: GuidedRunRecord[] = [];

  recipes.forEach((recipe, index) => {
    completedVariables = completeRecipeVariables(recipe, completedVariables);
    const baseTopic = createDefaultTopic({
      id: `topic-batch-${batchId}-${recipe.id}`,
      authorName: fallbackAuthor.name,
    });
    const nextTitle = `Tanda diaria ${profile.name} - ${recipe.shortLabel}`;
    const nextTopic: Topic = {
      ...baseTopic,
      title: nextTitle,
      author: fallbackAuthor.name,
      priority: Math.max(60, baseTopic.priority - index),
      narrative: `${baseTopic.narrative} Tanda diaria creada desde cockpit con perfil ${profile.name}.`,
      seo: `Keyword principal pendiente. Tanda diaria ${profile.name}. Receta ${recipe.shortLabel}. ${baseTopic.seo}`,
    };
    const nextDraft: EditorialDraft = {
      id: `draft-${nextTopic.id}`,
      topicId: nextTopic.id,
      variant: 'humanizado',
      status: 'borrador',
      title: `Borrador UMSA humanizado - ${nextTitle}`,
      seoTitle: nextTitle,
      body: draftCopies.humanizado.body,
      notes: 'Corrida generada desde tanda diaria del cockpit operativo.',
      updatedAt: 'sin guardar',
    };
    const generation = buildProfileNoteGeneration({
      topic: nextTopic,
      authors,
      selectedAuthor: fallbackAuthor,
      profile,
      recipe,
      currentDraft: nextDraft,
      rules,
      effectiveVariables: completedVariables,
      workflowVariables: completedVariables,
      executableRecipe: executableRecipeFor(recipe, fallbackAuthor, completedVariables),
      now: new Date(batchId + index),
    });
    const guidedEvidence = buildGuidedEvidenceSlots({
      topic: generation.recipeTopic,
      recipe,
      profile,
      existingEvidence: [],
      nowMs: batchId + index,
    }).evidence;

    completedVariables = generation.completedWorkflowVariables;
    topics.push(generation.recipeTopic);
    drafts.push(generation.draft);
    evidence.push(...guidedEvidence);
    guidedRuns.push(createGuidedRunRecord({
      topicId: generation.recipeTopic.id,
      recipeId: recipe.id,
      profileId: profile.id,
      now: new Date(batchId + index),
      run: {
        status: 'pausado',
        steps: ['nota generada', 'fuentes guiadas'],
        nextControl: 'Validar fuentes guiadas',
        summary: `${recipe.shortLabel} preparada para tanda diaria con ${guidedEvidence.length} fuentes guiadas.`,
      },
    }));
  });

  return {
    topics,
    drafts,
    evidence,
    guidedRuns,
    completedWorkflowVariables: completedVariables,
    selectedRecipeId: recipes[0]?.id,
    statuses: {
      ai: `Tanda diaria generada con ${profile.name}. Validar fuentes y aplicar AI por nota antes de payload.`,
      draft: topics.length > 0
        ? `Tanda diaria creada; primera corrida activa: "${topics[0].title}".`
        : 'No hay recetas disponibles para crear tanda diaria.',
      guidedFlow: `Tanda diaria creada con ${topics.length} notas y ${evidence.length} fuentes guiadas. Próximo control: validar fuentes.`,
      package: `${evidence.length} slots de evidencia creados para la tanda diaria ${profile.name}.`,
      auditEvent: 'Tanda diaria creada',
      auditDetail: `${topics.length} notas generadas desde cockpit con perfil ${profile.name}.`,
    },
  };
};

export const buildDailyBatchAutopilot = ({
  topicIds,
  topics,
  selectedTopic,
  selectedAuthor,
  profile,
  selectedRecipe,
  recipes,
  evidence,
  drafts,
  draftVersions,
  effectiveVariables,
  existingGuidedRunRecords,
  getRecipeId,
  now = new Date(),
}: {
  topicIds: string[];
  topics: Topic[];
  selectedTopic: Topic;
  selectedAuthor: Author;
  profile: EditorialProfile;
  selectedRecipe: NoteRecipe;
  recipes: NoteRecipe[];
  evidence: EvidenceRecord[];
  drafts: EditorialDraft[];
  draftVersions: DraftVersion[];
  effectiveVariables: WorkflowVariable[];
  existingGuidedRunRecords: GuidedRunRecord[];
  getRecipeId: (topicId: string) => EditarraRecipeKey;
  now?: Date;
}): DailyBatchAutopilotResult => {
  const nowMs = now.getTime();
  const updatedAt = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  const batchTopics = topics.filter((topic) => topicIds.includes(topic.id));
  const pendingBatchGuidedEvidence = evidence.filter((item) => (
    topicIds.includes(item.topicId)
    && isGuidedEvidenceRecord(item)
    && item.status !== 'validado'
  ));
  const evidenceUpdates = batchTopics.flatMap((topic) => buildGuidedEvidenceCompletionUpdates({
    topic,
    evidence,
    pendingGuidedEvidence: pendingBatchGuidedEvidence.filter((item) => item.topicId === topic.id),
  }));
  const evidencePatchesById = new Map(evidenceUpdates.map((update) => [update.evidenceId, update.patch]));
  const nextEvidence = evidence.map((record) => (
    evidencePatchesById.has(record.id) ? { ...record, ...evidencePatchesById.get(record.id) } : record
  ));
  const nextDrafts = drafts.map((draft) => {
    if (!topicIds.includes(draft.topicId)) {
      return draft;
    }

    const topic = batchTopics.find((item) => item.id === draft.topicId) || selectedTopic;
    const recipe = recipes.find((item) => item.id === getRecipeId(topic.id)) || selectedRecipe;
    const topicEvidence = nextEvidence.filter((item) => item.topicId === topic.id && item.status === 'validado');

    return buildDailyBatchAiDraft({
      draft,
      topic,
      recipe,
      topicEvidence,
      profile,
      effectiveVariables,
      updatedAt,
      status: 'aprobado',
    });
  });
  const batchDrafts = drafts.filter((draft) => topicIds.includes(draft.topicId));
  const nextVersions = batchDrafts.map((draft) => {
    const topic = batchTopics.find((item) => item.id === draft.topicId);

    return createDraftVersionSnapshot({
      id: `version-${draft.topicId}-batch-autopilot-${nowMs}`,
      draft,
      version: nextDraftVersionNumber(draftVersions, draft.topicId),
      status: 'aprobado',
      changeNote: 'Piloto automático de tanda: fuentes validadas, AI aplicada, auditoría aprobada y payload preparado.',
      snapshotAt: updatedAt,
      authorName: topic?.author || selectedAuthor.name,
    });
  });
  const guidedRuns = batchTopics.map((topic) => createGuidedRunRecord({
    topicId: topic.id,
    recipeId: getRecipeId(topic.id),
    profileId: profile.id,
    now,
    run: {
      status: 'completo',
      steps: ['fuentes validadas', 'ai aplicada', 'auditoría aprobada', 'payload preparado'],
      nextControl: 'Listo para exportar',
      summary: `Piloto automático completó ${topic.title}.`,
    },
  }));

  return {
    evidence: nextEvidence,
    drafts: nextDrafts,
    draftVersions: [...nextVersions, ...draftVersions].slice(0, 120),
    guidedRuns: [...guidedRuns, ...existingGuidedRunRecords].slice(0, 80),
    batchTopicCount: batchTopics.length,
    statuses: {
      ai: `Piloto automático aplicó AI a ${batchTopics.length} notas y dejó auditoría aprobada.`,
      draft: `Piloto automático completó la tanda diaria; nota activa: "${selectedTopic.title}".`,
      package: `Piloto automático completó tanda: ${batchTopics.length} payloads publicables listos.`,
      guidedFlow: `Piloto automático completó tanda diaria: fuentes, AI, auditoría y payload para ${batchTopics.length} notas.`,
      auditEvent: 'Piloto automático de tanda completado',
      auditDetail: `${batchTopics.length} notas cerradas desde ${profile.name}.`,
    },
  };
};

export const buildSingleNoteAutopilot = ({
  topic,
  authors,
  selectedAuthor,
  profile,
  recipe,
  operationModeName,
  currentDraft,
  previousBody,
  rules,
  effectiveVariables,
  workflowVariables,
  evidence,
  drafts,
  draftVersions,
  existingGuidedRunRecords,
  executableRecipeFor,
  now = new Date(),
}: {
  topic: Topic;
  authors: Author[];
  selectedAuthor: Author;
  profile: EditorialProfile;
  recipe: NoteRecipe;
  operationModeName: string;
  currentDraft: EditorialDraft;
  previousBody?: string;
  rules: GenerationEditorRule[];
  effectiveVariables: WorkflowVariable[];
  workflowVariables: WorkflowVariable[];
  evidence: EvidenceRecord[];
  drafts: EditorialDraft[];
  draftVersions: DraftVersion[];
  existingGuidedRunRecords: GuidedRunRecord[];
  executableRecipeFor: BuildExecutableRecipeForRun;
  now?: Date;
}): SingleNoteAutopilotResult => {
  const nowMs = now.getTime();
  const updatedAt = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  const completedVariables = completeRecipeVariables(recipe, workflowVariables);
  const recipePatch = buildRecipeTopicPatch({
    recipe,
    profile,
    topic,
    authors,
  });
  const nextTopic: Topic = {
    ...topic,
    ...recipePatch,
    status: 'aprobado',
  };
  const recipeAuthor = authors.find((author) => author.name === nextTopic.author) || selectedAuthor;
  const existingTopicEvidence = evidence.filter((item) => item.topicId === topic.id);
  const guidedSlots = buildGuidedEvidenceSlots({
    topic: nextTopic,
    recipe,
    profile,
    existingEvidence: existingTopicEvidence,
    nowMs,
  }).evidence;
  const evidenceWithSlots = [...evidence, ...guidedSlots];
  const pendingAutopilotEvidence = evidenceWithSlots.filter((item) => (
    item.topicId === topic.id
    && isGuidedEvidenceRecord(item)
    && item.status !== 'validado'
  ));
  const evidenceUpdates = buildGuidedEvidenceCompletionUpdates({
    topic: nextTopic,
    evidence: evidenceWithSlots,
    pendingGuidedEvidence: pendingAutopilotEvidence,
  });
  const evidencePatchesById = new Map(evidenceUpdates.map((update) => [update.evidenceId, update.patch]));
  const nextEvidence = evidenceWithSlots.map((record) => (
    evidencePatchesById.has(record.id) ? { ...record, ...evidencePatchesById.get(record.id) } : record
  ));
  const generation = buildProfileNoteGeneration({
    topic: nextTopic,
    authors,
    selectedAuthor: recipeAuthor,
    profile,
    recipe,
    currentDraft,
    previousBody,
    rules,
    effectiveVariables,
    workflowVariables: completedVariables,
    executableRecipe: executableRecipeFor(recipe, recipeAuthor, completedVariables),
    now,
  });
  const approvedDraft: EditorialDraft = {
    ...generation.draft,
    status: 'aprobado',
    notes: `Piloto automático single-note: ${operationModeName}, ${recipe.shortLabel}, fuentes validadas y payload preparado.`,
    updatedAt,
  };
  const nextVersion = createDraftVersionSnapshot({
    id: `version-${currentDraft.topicId}-single-autopilot-${nowMs}`,
    draft: approvedDraft,
    version: nextDraftVersionNumber(draftVersions, currentDraft.topicId),
    status: 'aprobado',
    changeNote: 'Piloto automático de nota: agenda, fuentes, AI local, auditoría y payload preparados.',
    snapshotAt: updatedAt,
    authorName: recipeAuthor.name,
  });
  const nextDrafts = drafts.some((draft) => draft.topicId === approvedDraft.topicId)
    ? drafts.map((draft) => (draft.topicId === approvedDraft.topicId ? approvedDraft : draft))
    : [...drafts, approvedDraft];
  const nextRun = createGuidedRunRecord({
    topicId: topic.id,
    recipeId: recipe.id,
    profileId: profile.id,
    now,
    run: {
      status: 'completo',
      steps: ['agenda aprobada', 'fuentes validadas', 'ai aplicada', 'auditoría aprobada', 'payload preparado'],
      nextControl: 'Listo para exportar',
      summary: `Piloto automático completó "${nextTopic.title}".`,
    },
  });

  return {
    topic: nextTopic,
    evidence: nextEvidence,
    drafts: nextDrafts,
    draftVersion: nextVersion,
    guidedRun: nextRun,
    completedWorkflowVariables: generation.completedWorkflowVariables,
    statuses: {
      ai: `Piloto automático generó y aprobó "${nextTopic.title}" con ${profile.name}.`,
      draft: `Nota automática lista: "${nextTopic.title}" queda aprobada y versionada.`,
      package: `publication_payload.json preparado para "${nextTopic.title}" con ${profile.sourceMinimum} fuentes mínimas.`,
      guidedFlow: `Piloto automático completó nota: agenda, fuentes, AI, auditoría y payload para "${nextTopic.title}".`,
      auditEvent: 'Piloto automático de nota completado',
      auditDetail: `${operationModeName}: ${nextTopic.title} cerrada con ${recipe.shortLabel}.`,
    },
  };
};

export const buildProfileNoteOperation = ({
  topic,
  authors,
  selectedAuthor,
  profile,
  recipe,
  currentDraft,
  previousBody,
  rules,
  effectiveVariables,
  workflowVariables,
  executableRecipe,
  selectedTopicEvidence,
  draftVersions,
  now = new Date(),
}: {
  topic: Topic;
  authors: Author[];
  selectedAuthor: Author;
  profile: EditorialProfile;
  recipe: NoteRecipe;
  currentDraft: EditorialDraft;
  previousBody?: string;
  rules: GenerationEditorRule[];
  effectiveVariables: WorkflowVariable[];
  workflowVariables: WorkflowVariable[];
  executableRecipe?: DraftExecutableRecipe;
  selectedTopicEvidence: EvidenceRecord[];
  draftVersions: DraftVersion[];
  now?: Date;
}): OperationalProfileNoteResult => {
  const nowMs = now.getTime();
  const updatedAt = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  const generation = buildProfileNoteGeneration({
    topic,
    authors,
    selectedAuthor,
    profile,
    recipe,
    currentDraft,
    previousBody,
    rules,
    effectiveVariables,
    workflowVariables,
    executableRecipe,
    now,
  });
  const guidedEvidence = buildGuidedEvidenceSlots({
    topic: generation.recipeTopic,
    recipe,
    profile,
    existingEvidence: selectedTopicEvidence,
    nowMs,
  }).evidence;
  const localAiResponse = buildEditarraLocalAiResponse({
    publicationPayload: {
      titulo: generation.recipeTopic.title,
      resumen: generation.draft.notes,
      contenido: generation.draft.body,
      categoria: recipe.category,
      meta_title: generation.draft.seoTitle,
      meta_description: generation.draft.notes,
    },
    fallbackBody: generation.draft.body,
    fallbackSummary: generation.draft.notes,
    sourceLabel: `${profile.name} / ${recipe.shortLabel}`,
  });
  const parsedAiResponse = parseEditarraAiResponse({
    raw: localAiResponse,
    fallbackTitle: generation.draft.seoTitle,
    fallbackSummary: generation.draft.notes,
  });
  const operationalDraft: EditorialDraft = parsedAiResponse.ok
    ? {
        ...generation.draft,
        title: `AI aplicado - ${parsedAiResponse.value.title}`,
        seoTitle: parsedAiResponse.value.metaTitle,
        body: parsedAiResponse.value.body,
        notes: parsedAiResponse.value.summary,
        status: 'listo',
        updatedAt,
      }
    : {
        ...generation.draft,
        status: 'listo',
        notes: `${generation.draft.notes} AI local no parseable; revisar respuesta antes de auditoría.`,
        updatedAt,
      };
  const nextVersion = createDraftVersionSnapshot({
    id: `version-${currentDraft.topicId}-profile-run-${nowMs}`,
    draft: operationalDraft,
    version: nextDraftVersionNumber(draftVersions, currentDraft.topicId),
    status: operationalDraft.status,
    changeNote: `Generación operativa por perfil: ${profile.name}, receta ${recipe.shortLabel}, AI local sin POST externo.`,
    snapshotAt: updatedAt,
    authorName: generation.recipeAuthor.name,
  });
  const nextRun = createGuidedRunRecord({
    topicId: topic.id,
    recipeId: recipe.id,
    profileId: profile.id,
    now,
    run: {
      status: 'pausado',
      steps: guidedEvidence.length > 0
        ? ['agenda', 'fuentes guiadas', 'ai local aplicada']
        : ['agenda', 'ai local aplicada'],
      nextControl: guidedEvidence.length > 0 ? 'Validar fuentes guiadas' : 'Auditoría asistida',
      summary: `Nota generada por perfil con ${profile.name} y ${recipe.shortLabel}.`,
    },
  });

  return {
    generation,
    guidedEvidence,
    localAiResponse,
    operationalDraft,
    nextVersion,
    nextRun,
    targetSurface: guidedEvidence.length > 0 ? 'auditoria' : 'editor',
    packageFileKey: guidedEvidence.length > 0 ? 'evidence_log.json' : 'quality_audit.json',
    statuses: {
      ai: `Nota generada y AI local aplicada sin POST externo con ${profile.name} / ${recipe.shortLabel}.`,
      draft: `Nota operativa lista para editar variables y auditar: "${generation.recipeTopic.title}".`,
      guidedFlow: guidedEvidence.length > 0
        ? `Nota generada con AI local y ${guidedEvidence.length} fuentes guiadas creadas. Próximo control: validar fuentes.`
        : 'Nota generada con AI local. Próximo control: auditoría asistida.',
      package: guidedEvidence.length > 0
        ? `${guidedEvidence.length} fuentes guiadas creadas para sostener la nota antes de payload.`
        : 'quality_audit.json listo para revisar la nota generada por perfil.',
      auditEvent: 'Generación operativa por perfil',
      auditDetail: `${profile.name} + ${recipe.label} para "${generation.recipeTopic.title}" con AI local sin POST externo.`,
    },
  };
};
