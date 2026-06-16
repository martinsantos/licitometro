export type EditarraAiHandoffStatus = 'listo_para_ai' | 'requiere_fuentes' | 'requiere_auditoria';

export type EditarraAiHandoff = {
  id: string;
  provider: 'provider-agnostic';
  mode: 'manual-json-handoff';
  status: EditarraAiHandoffStatus;
  sendFile: 'ai_brief.json';
  expectedFile: 'publication_payload.json';
  noExternalPost: true;
  nextAction: string;
  sourceCount: number;
  requiredSources: number;
  outputSchemaKeys: string[];
  payloadPreview: {
    title: string;
    category: string;
    publishAt: string;
  };
  checksum: string;
};

export type EditarraAiRunRequest = {
  id: string;
  provider: 'provider-agnostic';
  transport: 'manual-json-copy';
  externalPostEnabled: false;
  sendFile: 'ai_brief.json';
  expectedFile: 'publication_payload.json';
  status: EditarraAiHandoffStatus;
  operationModeId: string;
  recipeId: string;
  profileId: string;
  blocked: boolean;
  instructions: string[];
  outputSchemaKeys: string[];
  payloadPreview: EditarraAiHandoff['payloadPreview'];
  executableRecipe: Record<string, unknown>;
  input: Record<string, unknown>;
  checksum: string;
};

export type ParsedAiResponse = {
  title: string;
  metaTitle: string;
  body: string;
  summary: string;
  warnings: string[];
};

type BuildAiHandoffInput = {
  aiBrief: Record<string, unknown>;
  publicationPayload: Record<string, unknown>;
  qualityStatus: string;
  sourceCount: number;
  requiredSources: number;
};

type ParseAiResponseInput = {
  raw: string;
  fallbackTitle: string;
  fallbackSummary: string;
};

type BuildAiRunRequestInput = {
  handoff: EditarraAiHandoff;
  aiBrief: Record<string, unknown>;
  operationModeId: string;
  recipeId: string;
  profileId: string;
  executableRecipe: Record<string, unknown>;
};

type BuildLocalAiResponseInput = {
  publicationPayload: Record<string, unknown>;
  fallbackBody: string;
  fallbackSummary: string;
  sourceLabel: string;
};

const requiredHeadings = [
  '## Cómo funciona por dentro',
  '## Qué se instala o configura primero',
  '## Dónde se rompe y cómo probarlo',
  '## Para seguir leyendo',
];

const asRecord = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
);

const stringValue = (value: unknown, fallback = '') => (
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback
);

const stableChecksum = (value: unknown) => {
  const source = JSON.stringify(value);
  let hash = 0;

  for (let index = 0; index < source.length; index += 1) {
    hash = ((hash << 5) - hash + source.charCodeAt(index)) | 0;
  }

  return `ai-${Math.abs(hash).toString(36)}-${source.length}`;
};

export const buildEditarraAiHandoff = ({
  aiBrief,
  publicationPayload,
  qualityStatus,
  sourceCount,
  requiredSources,
}: BuildAiHandoffInput): EditarraAiHandoff => {
  const expectedSchema = asRecord(aiBrief.expected_json_schema);
  const title = stringValue(publicationPayload.titulo || publicationPayload.title, 'Payload pendiente');
  const category = stringValue(publicationPayload.categoria || publicationPayload.category, 'tecnico');
  const publishAt = stringValue(publicationPayload.fecha_publicacion || publicationPayload.publish_at, 'sin fecha');
  const status: EditarraAiHandoffStatus = sourceCount < requiredSources
    ? 'requiere_fuentes'
    : qualityStatus !== 'apto_para_revision'
      ? 'requiere_auditoria'
      : 'listo_para_ai';

  return {
    id: `editarra-handoff-${stableChecksum({ aiBrief, publicationPayload })}`,
    provider: 'provider-agnostic',
    mode: 'manual-json-handoff',
    status,
    sendFile: 'ai_brief.json',
    expectedFile: 'publication_payload.json',
    noExternalPost: true,
    nextAction: status === 'requiere_fuentes'
      ? `${sourceCount}/${requiredSources} fuentes disponibles; completar evidencia antes de enviar a AI.`
      : status === 'requiere_auditoria'
        ? `Revisar quality_audit.json: estado ${qualityStatus}.`
        : 'Enviar ai_brief.json al proveedor elegido y pegar publication_payload.json devuelto.',
    sourceCount,
    requiredSources,
    outputSchemaKeys: Object.keys(expectedSchema),
    payloadPreview: {
      title,
      category,
      publishAt,
    },
    checksum: stableChecksum({ expectedSchema, title, category, publishAt, sourceCount, qualityStatus }),
  };
};

export const buildEditarraAiRunRequest = ({
  handoff,
  aiBrief,
  operationModeId,
  recipeId,
  profileId,
  executableRecipe,
}: BuildAiRunRequestInput): EditarraAiRunRequest => {
  const blocked = handoff.status !== 'listo_para_ai';

  return {
    id: `editarra-ai-request-${stableChecksum({
      handoffId: handoff.id,
      operationModeId,
      recipeId,
      profileId,
    })}`,
    provider: 'provider-agnostic',
    transport: 'manual-json-copy',
    externalPostEnabled: false,
    sendFile: handoff.sendFile,
    expectedFile: handoff.expectedFile,
    status: handoff.status,
    operationModeId,
    recipeId,
    profileId,
    blocked,
    instructions: [
      'No hacer POST externo desde EDITARRA local.',
      'Enviar el contenido de ai_brief.json al proveedor elegido fuera de la UI.',
      'Solicitar respuesta JSON con las claves del schema esperado.',
      'Pegar publication_payload.json devuelto en la respuesta AI y aplicar desde cockpit.',
      blocked ? handoff.nextAction : 'Controlar quality_audit.json antes de publicar.',
    ],
    outputSchemaKeys: handoff.outputSchemaKeys,
    payloadPreview: handoff.payloadPreview,
    executableRecipe,
    input: aiBrief,
    checksum: stableChecksum({
      status: handoff.status,
      outputSchemaKeys: handoff.outputSchemaKeys,
      payloadPreview: handoff.payloadPreview,
      executableRecipe,
      operationModeId,
      recipeId,
      profileId,
    }),
  };
};

const ensureRequiredHeadings = (body: string) => {
  const baseBody = body.trim().length > 0 ? body.trim() : 'Lead operativo pendiente de completar con AI.';
  const missingSections = requiredHeadings
    .filter((heading) => !baseBody.includes(heading))
    .map((heading) => `${heading}\nCompletar sección con evidencia validada antes de publicar.`);

  return [baseBody, ...missingSections].join('\n\n');
};

export const buildEditarraLocalAiResponse = ({
  publicationPayload,
  fallbackBody,
  fallbackSummary,
  sourceLabel,
}: BuildLocalAiResponseInput) => {
  const title = stringValue(publicationPayload.titulo || publicationPayload.title, 'Nota EDITARRA generada');
  const summary = stringValue(publicationPayload.resumen || publicationPayload.summary || publicationPayload.descripcion, fallbackSummary);
  const body = ensureRequiredHeadings(stringValue(publicationPayload.contenido || publicationPayload.content || publicationPayload.body, fallbackBody));
  const category = stringValue(publicationPayload.categoria || publicationPayload.category, 'tecnico');
  const metaTitle = stringValue(publicationPayload.meta_title || publicationPayload.metaTitle, title);
  const metaDescription = stringValue(publicationPayload.meta_description || publicationPayload.metaDescription, summary);

  return JSON.stringify({
    provider: 'local-dry-run',
    source: sourceLabel,
    external_post_enabled: false,
    publication_payload: {
      titulo: title,
      resumen: summary,
      contenido: body,
      categoria: category,
      meta_title: metaTitle,
      meta_description: metaDescription,
    },
  }, null, 2);
};

export const parseEditarraAiResponse = ({
  raw,
  fallbackTitle,
  fallbackSummary,
}: ParseAiResponseInput): { ok: true; value: ParsedAiResponse } | { ok: false; error: string } => {
  try {
    const parsed = JSON.parse(raw);
    const source = asRecord(parsed);
    const payload = asRecord(source.publication_payload || source.payload || source);
    const body = stringValue(payload.contenido || payload.content || payload.body);

    if (!body) {
      return { ok: false, error: 'La respuesta JSON no trae contenido/contenido/body para aplicar.' };
    }

    const title = stringValue(payload.titulo || payload.title, fallbackTitle);
    const metaTitle = stringValue(payload.meta_title || payload.metaTitle || payload.seo_title, title);
    const summary = stringValue(payload.resumen || payload.summary || payload.description, fallbackSummary);
    const warnings = requiredHeadings
      .filter((heading) => !body.includes(heading))
      .map((heading) => `Falta ${heading}`);

    return {
      ok: true,
      value: {
        title,
        metaTitle,
        body,
        summary,
        warnings,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: `JSON AI invalido: ${error instanceof Error ? error.message : 'no se pudo leer la respuesta'}.`,
    };
  }
};
