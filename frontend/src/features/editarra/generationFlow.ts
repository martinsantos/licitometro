import { composeEditarraDraft } from './operations';
import type { DraftExecutableRecipe, DraftVariantKey } from './operations';
import type { EditorialProfile, NoteRecipe } from './profileModel';
import type { EditorialDraft, EvidenceRecord, EvidenceStatus } from './productionReducer';
import { completeRecipeVariables } from './workspaceModel';
import type { Author, Topic, WorkflowVariable } from './workspaceModel';

export type GenerationEditorRule = {
  title: string;
  body: string;
  enabled: boolean;
};

export type GeneratedDraftResult = {
  draft: EditorialDraft;
  variant: DraftVariantKey;
};

export type ProfileNoteGenerationResult = GeneratedDraftResult & {
  topicPatch: Partial<Topic>;
  recipeTopic: Topic;
  recipeAuthor: Author;
  completedWorkflowVariables: WorkflowVariable[];
};

export type GuidedEvidenceSlotsResult = {
  missingSources: number;
  evidence: EvidenceRecord[];
};

export type GuidedEvidenceCompletionUpdate = {
  evidenceId: string;
  patch: Partial<EvidenceRecord>;
};

const timeLabel = (now = new Date()) => now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

export const isGuidedEvidenceRecord = (record: Pick<EvidenceRecord, 'id' | 'sourceName'>) => (
  record.id.startsWith('evidence-guided-') || /^Fuente guiada/i.test(record.sourceName)
);

export const guidedEvidenceSourceHint = (record: Pick<EvidenceRecord, 'sourceName'>) => {
  const [, hint] = record.sourceName.split(/:\s(.+)/);
  return hint?.trim() || record.sourceName.replace(/^Fuente guiada\s*\d*/i, '').trim() || 'Fuente primaria';
};

export const isPlaceholderSourceUrl = (sourceUrl: string) => {
  const normalizedUrl = sourceUrl.trim().toLowerCase();
  return normalizedUrl.length === 0
    || normalizedUrl === 'https://'
    || normalizedUrl === 'http://'
    || normalizedUrl.includes('pendiente');
};

export const guidedEvidencePreset = (sourceHint: string, topicTitle: string) => {
  const normalizedHint = sourceHint.toLowerCase();
  const basePreset = {
    sourceUrl: 'https://www.ultimamilla.com.ar/',
    confidence: 76,
    notes: 'Preset operativo: revisar fecha de consulta, alcance y captura local antes de publicar.',
  };

  if (/arca|norma|oficial|fiscal/.test(normalizedHint)) {
    return {
      sourceUrl: 'https://www.argentina.gob.ar/arca',
      confidence: 78,
      claim: `La fuente oficial permite contrastar alcance normativo y responsabilidades para "${topicTitle}".`,
      notes: 'Preset oficial: completar norma puntual, fecha de consulta y enlace profundo si aplica.',
    };
  }

  if (/postgre|documentaci[oó]n t[eé]cnica|herramienta/.test(normalizedHint)) {
    return {
      sourceUrl: 'https://www.postgresql.org/docs/17/',
      confidence: 76,
      claim: `La documentación técnica primaria sostiene la explicación operativa de "${topicTitle}".`,
      notes: 'Preset técnico: ajustar a la herramienta exacta usada en la nota.',
    };
  }

  if (/minio|objeto|s3/.test(normalizedHint)) {
    return {
      sourceUrl: 'https://min.io/docs/minio/linux/index.html',
      confidence: 76,
      claim: `La documentación de objetos permite verificar almacenamiento, metadatos y permisos para "${topicTitle}".`,
      notes: 'Preset técnico: citar sección de objetos, lifecycle o permisos según corresponda.',
    };
  }

  if (/metabase|tablero|consulta/.test(normalizedHint)) {
    return {
      sourceUrl: 'https://www.metabase.com/docs/latest/',
      confidence: 74,
      claim: `La documentación de tableros permite verificar consulta, permisos y publicación de datos para "${topicTitle}".`,
      notes: 'Preset técnico: ajustar a dashboards, permisos o publicación embebida.',
    };
  }

  if (/backup|restore|respaldo/.test(normalizedHint)) {
    return {
      sourceUrl: 'https://www.postgresql.org/docs/current/backup.html',
      confidence: 74,
      claim: `La guía de backup permite contrastar la prueba mínima y recuperación asociada a "${topicTitle}".`,
      notes: 'Preset técnico: especificar tipo de backup, restauración y ventana de prueba.',
    };
  }

  if (/pricing|costo|microsoft|precio/.test(normalizedHint)) {
    return {
      sourceUrl: 'https://www.microsoft.com/power-platform/products/power-bi/pricing',
      confidence: 70,
      claim: `La fuente de pricing permite contrastar costos y límites para "${topicTitle}".`,
      notes: 'Preset comercial: revisar precio vigente antes de publicar.',
    };
  }

  return {
    ...basePreset,
    claim: `La evidencia operativa complementaria permite contrastar implementación, límite y prueba mínima de "${topicTitle}".`,
  };
};

export const buildRecipeTopicPatch = ({
  recipe,
  profile,
  topic,
  authors,
}: {
  recipe: NoteRecipe;
  profile: EditorialProfile;
  topic: Topic;
  authors: Array<Pick<Author, 'name'>>;
}): Partial<Topic> => ({
  status: 'redaccion',
  author: authors.some((author) => author.name === profile.defaultAuthor)
    ? profile.defaultAuthor
    : topic.author,
  depth: recipe.defaultDepth,
  tokens: recipe.defaultTokens,
  publishAt: recipe.publishAt,
  source: /pendiente/i.test(topic.source) ? recipe.sourcePlan : topic.source,
  narrative: topic.narrative.includes(recipe.intent)
    ? topic.narrative
    : `${topic.narrative} Receta aplicada: ${recipe.intent}`,
  seo: topic.seo.includes(recipe.category)
    ? topic.seo
    : `${topic.seo} Categoría sugerida: ${recipe.category}.`,
});

export const buildGeneratedDraft = ({
  topic,
  author,
  rules,
  variables,
  variant,
  currentDraft,
  previousBody,
  executableRecipe,
  now = new Date(),
}: {
  topic: Topic;
  author: Author;
  rules: GenerationEditorRule[];
  variables: WorkflowVariable[];
  variant: DraftVariantKey;
  currentDraft: EditorialDraft;
  previousBody?: string;
  executableRecipe?: DraftExecutableRecipe;
  now?: Date;
}): GeneratedDraftResult => ({
  variant,
  draft: {
    ...currentDraft,
    ...composeEditarraDraft({
      topic,
      author,
      rules,
      variables,
      variant,
      previousBody,
      executableRecipe,
    }),
    variant,
    status: 'borrador',
    updatedAt: timeLabel(now),
  },
});

export const buildProfileNoteGeneration = ({
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
  now?: Date;
}): ProfileNoteGenerationResult => {
  const topicPatch = buildRecipeTopicPatch({ recipe, profile, topic, authors });
  const recipeTopic = { ...topic, ...topicPatch };
  const recipeAuthor = authors.find((author) => author.name === recipeTopic.author) || selectedAuthor;
  const completedWorkflowVariables = completeRecipeVariables(recipe, workflowVariables);
  const variablesForDraft = completeRecipeVariables(recipe, effectiveVariables);
  const generated = buildGeneratedDraft({
    topic: recipeTopic,
    author: recipeAuthor,
    rules,
    variables: variablesForDraft,
    variant: 'humanizado',
    currentDraft,
    previousBody,
    executableRecipe,
    now,
  });

  return {
    ...generated,
    topicPatch,
    recipeTopic,
    recipeAuthor,
    completedWorkflowVariables,
  };
};

export const buildGuidedEvidenceSlots = ({
  topic,
  recipe,
  profile,
  existingEvidence,
  nowMs = Date.now(),
}: {
  topic: Topic;
  recipe: NoteRecipe;
  profile: EditorialProfile;
  existingEvidence: EvidenceRecord[];
  nowMs?: number;
}): GuidedEvidenceSlotsResult => {
  const missingSources = Math.max(0, profile.sourceMinimum - existingEvidence.length);

  if (missingSources === 0) {
    return { missingSources, evidence: [] };
  }

  const sourceHints = recipe.sourcePlan
    .split('+')
    .map((sourceHint) => sourceHint.trim().replace(/\.$/, ''))
    .filter(Boolean);
  const evidence = Array.from({ length: missingSources }, (_, index): EvidenceRecord => {
    const sequence = existingEvidence.length + index + 1;
    const sourceHintIndex = sourceHints.length > 0 ? Math.min(sequence - 1, sourceHints.length - 1) : -1;
    const sourceHint = sourceHintIndex >= 0 ? sourceHints[sourceHintIndex] : 'Fuente primaria pendiente';
    const preset = guidedEvidencePreset(sourceHint, topic.title);

    return {
      id: `evidence-guided-${topic.id}-${nowMs}-${index}`,
      topicId: topic.id,
      sourceName: `Fuente guiada ${sequence}: ${sourceHint}`,
      sourceUrl: preset.sourceUrl,
      claim: preset.claim,
      status: 'pendiente',
      confidence: 45,
      notes: `Slot creado por el flujo guiado ${recipe.shortLabel}. ${preset.notes}`,
    };
  });

  return { missingSources, evidence };
};

export const buildGuidedEvidenceCompletionUpdates = ({
  topic,
  evidence,
  pendingGuidedEvidence,
}: {
  topic: Topic;
  evidence: EvidenceRecord[];
  pendingGuidedEvidence: EvidenceRecord[];
}): GuidedEvidenceCompletionUpdate[] => {
  const guidedIds = new Set(pendingGuidedEvidence.map((item) => item.id));

  return evidence.filter((item) => guidedIds.has(item.id)).map((item) => {
    const sourceHint = guidedEvidenceSourceHint(item);
    const preset = guidedEvidencePreset(sourceHint, topic.title);
    const nextNotes = item.notes.includes('Validada por lote guiado')
      ? item.notes
      : `${item.notes} Validada por lote guiado; revisar enlace profundo antes de publicar.`;

    return {
      evidenceId: item.id,
      patch: {
        sourceUrl: isPlaceholderSourceUrl(item.sourceUrl) ? preset.sourceUrl : item.sourceUrl,
        claim: item.claim.trim().length > 0 ? item.claim : preset.claim,
        status: 'validado' as EvidenceStatus,
        confidence: Math.max(item.confidence, preset.confidence),
        notes: nextNotes,
      },
    };
  });
};
