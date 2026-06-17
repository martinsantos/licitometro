import {
  hasBlockingQualityIssues,
  scanEditarraObject,
  scanEditarraText,
  summarizeQualityIssues,
} from './qualityGate';

export type DraftVariantKey = 'base' | 'humanizado' | 'seo';
export type EditorialPackageFileKey = 'article.md' | 'metadata.json' | 'image_prompt.json' | 'image_prompt.md' | 'image_manifest.json' | 'radar_run_report.json' | 'editorial_proposal.json' | 'public_export_bundle.json' | 'publication_targets.json' | 'profile_runtime.json' | 'note_run.json' | 'ai_request.json' | 'operational_contract.json' | 'automation_recipe.json' | 'ai_brief.json' | 'publication_payload.json' | 'quality_audit.json' | 'seo_experiments.json' | 'analytics_report.json' | 'evidence_log.json' | 'revision_history.json' | 'audit_log.json' | 'package_manifest.json';
export type PreflightSeverity = 'bloqueante' | 'advertencia' | 'ok';
export type UmsaPublicationCategory = 'noticias' | 'tecnico' | 'proyectos' | 'empresa';
export type EditarraImageStatus = 'pendiente' | 'prompt_listo' | 'generada_externa' | 'aprobada' | 'descartada';

export type EditarraImageManifest = {
  id: string;
  topicId: string;
  slug: string;
  title: string;
  expectedFilename: string;
  batchId: string;
  status: EditarraImageStatus;
  prompt: string;
  alt: string;
  ratio: string;
  destinationPath: string;
};

export type EditorialPreflightCheck = {
  id: string;
  label: string;
  passed: boolean;
  severity: PreflightSeverity;
  detail: string;
};

type DraftTopic = {
  id: string;
  title: string;
  status?: string;
  source: string;
  narrative: string;
  seo: string;
  depth: string;
  tokens: number;
  publishAt: string;
  author?: string;
};

type DraftAuthor = {
  name: string;
  voiceBrief: string;
  stance: string;
  density: string;
  locality: string;
  references: string[];
  antiReferences: string[];
};

type DraftRule = {
  title: string;
  body: string;
  enabled: boolean;
};

type DraftVariable = {
  key: string;
  value: string;
  enabled: boolean;
};

export type DraftExecutableRecipe = {
  intent: string;
  sourcePlan: string;
  variableCoverage: {
    completed: number;
    total: number;
    label: string;
  };
  structure: string[];
  sourceChecklist: string[];
  influenceDirectives: Array<{
    reference: string;
    relation: string;
    weight: number;
  }>;
};

type PackageImagePrompt = {
  id: string;
  title: string;
  ratio: string;
  status: string;
  prompt: string;
};

type PackageAuditEvent = {
  id: string;
  event: string;
  detail: string;
  time: string;
};

type PackageEvidence = {
  id: string;
  topicId: string;
  sourceName: string;
  sourceUrl: string;
  claim: string;
  status: string;
  confidence: number;
  notes: string;
};

type PackageSeoExperiment = {
  id: string;
  topicId: string;
  title: string;
  description: string;
  focusKeyword: string;
  strategy: string;
  ctr: number;
  impressions: number;
  selected: boolean;
  notes: string;
};

type PackageAnalyticsRecord = {
  id: string;
  topicId: string;
  period: string;
  trafficSource: string;
  visits: number;
  averageReadSeconds: number;
  ctaClicks: number;
  shares: number;
  comments: number;
  conversionRate: number;
  successCriteria: string;
  performanceScore: number;
  learningNote: string;
};

type PackageDraftVersion = {
  id: string;
  topicId: string;
  draftId: string;
  version: number;
  variant: string;
  status: string;
  title: string;
  seoTitle: string;
  body: string;
  notes: string;
  changeNote: string;
  snapshotAt: string;
  authorName: string;
};

type PackageDraft = {
  id: string;
  topicId: string;
  variant: DraftVariantKey;
  status: string;
  title: string;
  seoTitle: string;
  body: string;
  notes: string;
  updatedAt: string;
};

type ComposeDraftInput = {
  topic: DraftTopic;
  author: DraftAuthor;
  rules: DraftRule[];
  variables: DraftVariable[];
  variant: DraftVariantKey;
  previousBody?: string;
  executableRecipe?: DraftExecutableRecipe;
};

type BuildPackageInput = {
  topic: DraftTopic;
  author: DraftAuthor;
  draft: PackageDraft;
  imagePrompt: PackageImagePrompt;
  rules: DraftRule[];
  variables: DraftVariable[];
  evidence?: PackageEvidence[];
  seoExperiments?: PackageSeoExperiment[];
  analyticsRecords?: PackageAnalyticsRecord[];
  draftVersions?: PackageDraftVersion[];
  auditEvents: PackageAuditEvent[];
  hostUrl: string;
  route: string;
};

type BuildAIBriefInput = Pick<BuildPackageInput, 'topic' | 'author' | 'draft' | 'imagePrompt' | 'rules' | 'variables' | 'evidence' | 'seoExperiments'> & {
  slug: string;
};

type BuildPublicationPayloadInput = Pick<BuildPackageInput, 'topic' | 'draft' | 'imagePrompt' | 'variables' | 'evidence' | 'seoExperiments'> & {
  slug: string;
};

type BuildBatchInput = {
  topics: DraftTopic[];
  authors: DraftAuthor[];
  drafts: PackageDraft[];
  imagePrompts: PackageImagePrompt[];
  rules: DraftRule[];
  variables: DraftVariable[];
  evidence?: PackageEvidence[];
  seoExperiments?: PackageSeoExperiment[];
  analyticsRecords?: PackageAnalyticsRecord[];
  draftVersions?: PackageDraftVersion[];
  auditEvents: PackageAuditEvent[];
  hostUrl: string;
  route: string;
};

const buildPendingPackageImagePrompt = (topic: Pick<DraftTopic, 'id' | 'title'>): PackageImagePrompt => ({
  id: `image-pending-${topic.id}`,
  title: `Imagen pendiente - ${topic.title}`,
  ratio: '16:9',
  status: 'pendiente',
  prompt: '',
});

type DistributionChannel = 'site' | 'newsletter' | 'linkedin' | 'whatsapp';

type DistributionBatchItem = {
  topic_id: string;
  title: string;
  status: string;
  author: string;
  package_id: string;
  slug: string;
  ready: boolean;
  blockers: number;
  warnings: number;
  files: string[];
};

type BuildDistributionInput = {
  batch: {
    id: string;
    manifest: {
      items: DistributionBatchItem[];
    };
  };
  topics: DraftTopic[];
  variables: DraftVariable[];
  hostUrl: string;
};

const nowLabel = (now = new Date()) => now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

const topEnabledRules = (rules: DraftRule[]) => (
  rules
    .filter((rule) => rule.enabled)
    .slice(0, 3)
    .map((rule) => `${rule.title}: ${rule.body}`)
);

const variableValue = (variables: DraftVariable[], key: string, fallback: string) => (
  variables.find((variable) => variable.enabled && variable.key === key)?.value || fallback
);

const normalizeHostUrl = (hostUrl: string) => hostUrl.replace(/^https?:\/\//, '').replace(/\/+$/g, '');

const UMSA_REQUIRED_HEADINGS = [
  '## Cómo funciona por dentro',
  '## Qué se instala o configura primero',
  '## Dónde se rompe y cómo probarlo',
  '## Para seguir leyendo',
];

const UMSA_FORBIDDEN_TERMS = [
  'potenciar',
  'empoderar',
  'sinergia',
  'revolucionar',
  'innovador',
  'disruptivo',
  'seamless',
  'frictionless',
  'game-changer',
  'transformación digital',
  'en un mundo cada vez más',
  'en la era de',
  'en conclusión',
  'como vimos',
  'cabe destacar',
  'vale la pena mencionar',
  'no es',
  'no se trata de',
  'menos ruido, más señal',
];

const UMSA_PRIMARY_SOURCE_LIBRARY = [
  {
    name: 'PostgreSQL 17 Documentation',
    url: 'https://www.postgresql.org/docs/17/',
    reason: 'Base relacional, auditoría, permisos y restauración.',
  },
  {
    name: 'MinIO Object Storage Documentation',
    url: 'https://min.io/docs/minio/linux/index.html',
    reason: 'Almacenamiento S3 compatible para objetos pesados y metadatos.',
  },
  {
    name: 'Metabase Documentation',
    url: 'https://www.metabase.com/docs/latest/',
    reason: 'Consultas, permisos de tableros y definiciones de métricas.',
  },
  {
    name: 'Ley 27.506 de Economía del Conocimiento',
    url: 'https://www.argentina.gob.ar/normativa/nacional/ley-27506-324101',
    reason: 'Marco argentino para servicios basados en conocimiento.',
  },
];

const UMSA_NOTE_SLOTS = [
  { key: 'reactiva', category: 'noticias' as UmsaPublicationCategory, publishAt: '07:00:00-03:00' },
  { key: 'evergreen', category: 'tecnico' as UmsaPublicationCategory, publishAt: '12:00:00-03:00' },
  { key: 'caso', category: 'proyectos' as UmsaPublicationCategory, publishAt: '17:00:00-03:00' },
];

const textContains = (value: string, needle: string) => value.toLowerCase().includes(needle.toLowerCase());

const wordCount = (value: string) => (
  value
    .trim()
    .split(/\s+/)
    .filter(Boolean).length
);

const trimText = (value: string, maxLength: number) => {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return normalized.slice(0, maxLength - 1).replace(/\s+\S*$/g, '').trimEnd();
};

const sentenceFromMarkdown = (value: string, fallback: string) => {
  const paragraph = value
    .replace(/^# .*$/gm, '')
    .split(/\n{2,}/)
    .map((item) => item.replace(/^#+\s+/gm, '').trim())
    .find((item) => item.length > 40);

  return trimText(paragraph || fallback, 220);
};

const inferUmsaCategory = (topic: DraftTopic): UmsaPublicationCategory => {
  const text = `${topic.id} ${topic.title} ${topic.narrative} ${topic.seo}`.toLowerCase();

  if (/reactiva|arca|afip|resolucion|resolución|norma|72 hs|72h/.test(text)) {
    return 'noticias';
  }

  if (/caso|proyecto|bodega|cooperativa|clinica|clínica|escuela|municipalidad/.test(text)) {
    return 'proyectos';
  }

  if (/mercado|industria|empresa|camara|cámara/.test(text)) {
    return 'empresa';
  }

  return 'tecnico';
};

const inferUmsaSlot = (topic: DraftTopic) => {
  const text = `${topic.id} ${topic.title} ${topic.narrative} ${topic.publishAt}`.toLowerCase();

  return UMSA_NOTE_SLOTS.find((slot) => text.includes(slot.key))
    || UMSA_NOTE_SLOTS.find((slot) => slot.category === inferUmsaCategory(topic))
    || UMSA_NOTE_SLOTS[1];
};

const publicationDateForTopic = (topic: DraftTopic) => {
  const isoLike = topic.publishAt.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
  if (isoLike) {
    return topic.publishAt.includes('-03:00') ? topic.publishAt : `${topic.publishAt.replace(/Z$/g, '')}-03:00`;
  }

  const slotTime = topic.publishAt.match(/(\d{2}):(\d{2})/)?.[0];
  const fallbackTime = inferUmsaSlot(topic).publishAt;
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' });

  return `${today}T${slotTime ? `${slotTime}:00-03:00` : fallbackTime}`;
};

const sourcePayloadForTopic = (topic: DraftTopic, evidence: PackageEvidence[] = []) => {
  const topicEvidence = evidence.filter((item) => item.topicId === topic.id);
  const evidenceSources = topicEvidence.map((item) => ({
    name: item.sourceName,
    url: item.sourceUrl,
    claim: item.claim,
    status: item.status,
    confidence: item.confidence,
  }));
  const librarySources = UMSA_PRIMARY_SOURCE_LIBRARY.filter((source) => (
    !evidenceSources.some((item) => item.url === source.url)
  ));

  return [...evidenceSources, ...librarySources].slice(0, 6);
};

const selectedSeoPayload = (topic: DraftTopic, draft: PackageDraft, seoExperiments: PackageSeoExperiment[] = []) => {
  const selected = seoExperiments.find((item) => item.topicId === topic.id && item.selected);
  const fallbackTitle = trimText(draft.seoTitle || topic.title, 60);
  const fallbackDescription = trimText(sentenceFromMarkdown(draft.body, topic.seo || topic.narrative), 160);
  const rawMetaTitle = trimText(selected?.title || fallbackTitle, 60);
  const rawMetaDescription = trimText(selected?.description || fallbackDescription, 160);
  const metaTitle = hasBlockingQualityIssues(scanEditarraText(rawMetaTitle, { surface: 'seo', path: 'meta_title' }))
    ? fallbackTitle
    : rawMetaTitle;
  const metaDescription = hasBlockingQualityIssues(scanEditarraText(rawMetaDescription, { surface: 'seo', path: 'meta_description' }))
    ? fallbackDescription
    : rawMetaDescription;
  const tags = [
    inferUmsaCategory(topic) === 'noticias' ? 'argentina' : 'mendoza',
    selected?.focusKeyword || topic.seo.replace(/^Keyword principal:\s*/i, '').split('.')[0] || 'tecnologia-abierta',
    inferUmsaCategory(topic),
    'pymes-ar',
  ]
    .map((tag) => slugify(tag).slice(0, 28))
    .filter(Boolean);

  return {
    metaTitle,
    metaDescription,
    focusKeyword: selected?.focusKeyword || topic.seo.replace(/^Keyword principal:\s*/i, '').split('.')[0] || topic.title,
    tags: Array.from(new Set(tags)).slice(0, 5),
  };
};

const parseDistributionChannels = (variables: DraftVariable[]): DistributionChannel[] => {
  const requestedChannels = variableValue(variables, 'distribution_channels', 'site, newsletter, linkedin, whatsapp')
    .split(',')
    .map((channel) => channel.trim().toLowerCase())
    .filter(Boolean);
  const allowedChannels: DistributionChannel[] = ['site', 'newsletter', 'linkedin', 'whatsapp'];
  const channels = requestedChannels.filter((channel): channel is DistributionChannel => (
    allowedChannels.includes(channel as DistributionChannel)
  ));

  return channels.length > 0 ? channels : allowedChannels;
};

const distributionChannelLabel: Record<DistributionChannel, string> = {
  site: 'Sitio',
  newsletter: 'Newsletter',
  linkedin: 'LinkedIn',
  whatsapp: 'WhatsApp',
};

const channelCopy = (channel: DistributionChannel, title: string, url: string, source: string) => {
  if (channel === 'newsletter') {
    return `${title}. Lectura recomendada con fuente ${source}. ${url}`;
  }

  if (channel === 'linkedin') {
    return `${title}. Una mirada operativa para seguir compras, fuentes y decisiones publicas sin exagerar conclusiones. ${url}`;
  }

  if (channel === 'whatsapp') {
    return `${title}. Nota lista para revisar y compartir: ${url}`;
  }

  return `Publicar en sitio: ${title}. Canonical: ${url}`;
};

export const composeEditarraDraft = ({
  topic,
  author,
  rules,
  variables,
  variant,
  previousBody,
  executableRecipe,
}: ComposeDraftInput) => {
  const activeRules = topEnabledRules(rules);
  const reviewSignals = variableValue(variables, 'human_review_required', 'fuente_dudosa, publicado');
  const sourceLine = `Fuente principal: ${topic.source}.`;
  const guardrailLine = `Reglas activas: ${activeRules.join(' | ') || 'sin reglas activas'}.`;
  const voiceLine = `Voz: ${author.voiceBrief} Postura: ${author.stance}. Densidad: ${author.density}. Localia: ${author.locality}.`;
  const category = inferUmsaCategory(topic);
  const slot = inferUmsaSlot(topic);
  const protagonist = variableValue(variables, 'umsa_protagonist_pool', 'gerente de cooperativa eléctrica con internet rural');
  const exchangeRate = variableValue(variables, 'exchange_rate_ars_usd', 'cotización ARS/USD pendiente de carga manual');
  const publicationSlot = variableValue(variables, 'umsa_publication_slots', '07:00 reactiva, 12:00 evergreen, 17:00 caso');
  const sourceLinks = UMSA_PRIMARY_SOURCE_LIBRARY.map((source) => `- [${source.name}](${source.url})`);
  const recipeContract = executableRecipe ? [
    '## Contrato de generación EDITARRA',
    '',
    `Intención: ${executableRecipe.intent}`,
    `Plan de fuentes: ${executableRecipe.sourcePlan}`,
    `Variables: ${executableRecipe.variableCoverage.label}`,
    '',
    'Estructura ejecutable:',
    ...executableRecipe.structure.map((step, index) => `${index + 1}. ${step}`),
    '',
    'Fuentes obligatorias:',
    ...executableRecipe.sourceChecklist.map((source) => `- ${source}`),
    '',
    'Influencias aplicadas:',
    ...executableRecipe.influenceDirectives.map((influence) => (
      `- ${influence.reference} (${influence.relation}, peso ${influence.weight})`
    )),
  ].join('\n') : '';
  const contractBlock = recipeContract ? [recipeContract, ''] : [];
  const umsaBody = [
    ...contractBlock,
    `Una consulta de stock que tarda 18 segundos ya cambió la operación antes de romperse. ${protagonist} necesita saber quién cargó el dato, dónde quedó guardado y qué evidencia puede mostrar si una auditoría pregunta por el origen. ${topic.title} entra en esa escena con una promesa concreta: explicar qué pieza cumple cada función, qué costo mirar y qué prueba evita llevar una falla a producción.`,
    '',
    `## ${category === 'noticias' ? 'Qué cambió y dónde pega primero' : category === 'proyectos' ? 'Dónde aparece el problema en la operación' : 'Qué decisión técnica conviene revisar'}`,
    '',
    `${topic.narrative} El antagonista operativo es la carpeta compartida sin dueño: acepta archivos, no conserva responsable y deja dudas cuando alguien reemplaza una versión. El primer dato para corregir esa rutina vive en la fuente declarada para la nota: ${topic.source}. Si esa fuente no tiene fecha, responsable y enlace estable, el borrador queda en revisión.`,
    '',
    `La cifra que obliga a ordenar el sistema es simple: un cierre que demanda 18 segundos por consulta consume media hora si se repite cien veces en una mañana. El dato puente debe completarse con una fuente primaria antes de publicar; EDITARRA deja esa obligación marcada para que el editor no convierta una sospecha en historia cerrada.`,
    '',
    `La nota queda asignada al slot ${slot.key} de UMSA Diaria y respeta la grilla ${publicationSlot}. El lector debe poder reconstruir el flujo sin conocer la pila técnica de antemano.`,
    '',
    'El detalle de estatus es deliberadamente chico: una etiqueta pegada a una caja de archivo, escrita con marcador grueso, que dice "pendiente de cargar". Ese objeto muestra el punto exacto donde el proceso deja de ser administrativo y pasa a ser técnico. Si la etiqueta queda fuera del sistema, la evidencia depende de una persona. Si entra con fecha, responsable y permiso, la organización puede revisar el caso sin reconstruir la memoria de todos.',
    '',
    '## Cómo funciona por dentro',
    '',
    'El flujo mínimo tiene seis pasos. Primero, el usuario carga una factura, foto, ticket o clave desde una pantalla con permisos por rol. Segundo, la aplicación valida formato, responsable y estado. Tercero, PostgreSQL guarda registros estructurados: usuario, fecha, versión, estado y auditoría. Cuarto, MinIO/S3 guarda archivos grandes como objetos y conserva metadatos. Quinto, Keycloak, Passbolt, GLPI o Metabase toman esos registros y entregan vistas distintas para gerencia, soporte o administración. Sexto, el backup copia base y objetos, y una prueba de restauración recupera una operación real.',
    '',
    'Cada componente tiene una falla esperable. PostgreSQL puede guardar un estado correcto con una definición de métrica equivocada. MinIO puede conservar el archivo y perder una regla de retención. Metabase puede mostrar un tablero útil con permisos demasiado amplios. El entregable técnico incluye pantalla, definición escrita, dueño del dato, bitácora y prueba.',
    '',
    'La administración no necesita leer logs para tomar una decisión. Sí necesita saber qué dato entra, dónde vive, quién lo puede editar y qué evidencia queda cuando alguien pide una explicación.',
    '',
    'El equipo IT necesita otra capa de detalle. La base registra campos que se consultan muchas veces: número, estado, fecha, responsable y relación con otros registros. El almacenamiento de objetos guarda el peso que no conviene meter en la base: PDF, foto, video, acta o respaldo. El tablero consulta datos ya definidos, no hojas sueltas. La restauración prueba que esos tres lugares vuelven a coincidir después de una falla.',
    '',
    '## Qué se instala o configura primero',
    '',
    `Primero se instala una base PostgreSQL 17 con roles separados para aplicación, lectura y mantenimiento. Después se agrega almacenamiento S3 compatible para documentos pesados. Luego se configura identidad, grupos y vencimiento de credenciales. El tablero llega después de esas tres decisiones, porque una vista sin permisos claros multiplica errores.`,
    '',
    `El costo inicial se estima en 35 a 90 USD mensuales para una instalación chica con servidor, almacenamiento, backup y monitoreo básico; la conversión local queda atada a ${exchangeRate}. Ese número no incluye relevamiento, migración histórica ni capacitación. El primer entregable verificable es una carga de prueba con archivo, registro, responsable, vista de consulta y restauración documentada.`,
    '',
    'La primera semana sirve para acordar vocabulario: qué significa pendiente, validado, observado y cerrado. La segunda semana ordena usuarios, grupos y permisos. La tercera semana deja un tablero mínimo con una consulta guardada y una definición escrita. Si el proyecto pide migración histórica, esa tarea se separa para no mezclar limpieza de datos con puesta en marcha.',
    '',
    'UMSA puede aparecer como ejemplo cuando el caso pide implementación local: PSICOLE, trazabilidad de residuos, infraestructura o fibra industrial. La mención no reemplaza la fuente ni convierte la nota en venta.',
    '',
    '## Dónde se rompe y cómo probarlo',
    '',
    'El primer riesgo es el permiso amplio. La señal aparece cuando usuarios de áreas distintas ven la misma lista completa. La prueba mínima crea dos perfiles, carga un documento y verifica que cada perfil lea solo lo propio.',
    '',
    'El segundo riesgo es el backup decorativo. La señal aparece cuando existe copia, pero nadie restauró una operación completa. La prueba mínima borra un registro de ensayo, restaura base y objeto, y compara fecha, dueño y archivo.',
    '',
    'El tercer riesgo es la métrica discutida. La señal aparece cuando dos reportes calculan el mismo indicador con fechas distintas. La prueba mínima guarda la consulta, escribe la definición y deja una persona responsable de aprobar cambios.',
    '',
    'El cuarto riesgo es la alerta sin dueño. La señal aparece cuando el monitor avisa una caída y nadie sabe quién debe responder. La prueba mínima asigna responsable, horario y canal, y deja un registro de resolución. Esa prueba parece administrativa, pero decide si la herramienta corrige una falla o solo la muestra tarde.',
    '',
    '## Para seguir leyendo',
    '',
    ...sourceLinks,
    '- [Backlog interno UMSA Diaria](outputs/backlog.json)',
  ].join('\n');

  if (variant === 'seo') {
    return {
      title: `Versión SEO UMSA - ${topic.title}`,
      seoTitle: trimText(`${topic.title}: guía técnica`, 60),
      body: [
        umsaBody,
        '',
        '## Metadata sugerida',
        '',
        `${topic.seo}`,
        sourceLine,
        `Bloqueos de publicación: ${reviewSignals}.`,
      ].join('\n\n'),
    };
  }

  if (variant === 'humanizado') {
    return {
      title: `Borrador UMSA humanizado - ${topic.title}`,
      seoTitle: topic.title,
      body: [
        previousBody && previousBody.includes('## Cómo funciona por dentro') ? previousBody : umsaBody,
        '',
        `Nota de edición: ${author.name} debe sostener precisión, claridad y didáctica técnica antes de subir opinión.`,
        guardrailLine,
      ].join('\n\n'),
    };
  }

  return {
    title: `Borrador UMSA base - ${topic.title}`,
    seoTitle: topic.title,
    body: [
      umsaBody,
      '',
      voiceLine,
      `Profundidad ${topic.depth}, presupuesto ${topic.tokens} tokens, publicación sugerida ${topic.publishAt}.`,
      `Referencias internas a consultar: ${author.references.join(', ') || 'pendientes'}. Evitar: ${author.antiReferences.join(', ') || 'sin anti-referencias'}.`,
    ].join('\n\n'),
  };
};

export const createAuditEvent = (event: string, detail: string, now = new Date()) => ({
  id: `audit-${now.getTime()}`,
  event,
  detail,
  time: nowLabel(now),
});

const slugify = (value: string) => (
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72) || 'editarra-articulo'
);

const jsonFile = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

const hasMeaningfulText = (value: string, minLength = 12) => value.trim().length >= minLength;

const normalizeImageStatus = (status: string): EditarraImageStatus => {
  const normalized = status.toLowerCase().trim();

  if (/aprob/.test(normalized)) {
    return 'aprobada';
  }

  if (/generad|extern/.test(normalized)) {
    return 'generada_externa';
  }

  if (/descart/.test(normalized)) {
    return 'descartada';
  }

  if (/prompt|apto|list/.test(normalized)) {
    return 'prompt_listo';
  }

  return 'pendiente';
};

export const buildEditarraImageManifest = ({
  topic,
  imagePrompt,
  slug,
  generatedAt,
}: {
  topic: DraftTopic;
  imagePrompt: PackageImagePrompt;
  slug: string;
  generatedAt?: string;
}): EditarraImageManifest => {
  const batchDate = (generatedAt || new Date().toISOString()).slice(0, 7);
  const batchId = `editarra-images-${batchDate}`;
  const expectedFilename = `${slug}-principal`;
  const ratio = imagePrompt.ratio || '16:9';
  const basePrompt = hasMeaningfulText(imagePrompt.prompt, 40)
    ? imagePrompt.prompt
    : 'Escena documental técnica para nota UMSA, sin texto visible, sin logos, sin rostros reconocibles.';
  const prompt = [
    'Actua como director de fotografia documental para una empresa argentina de tecnologia e infraestructura digital.',
    '',
    'Objetivo: crear UNA imagen editorial unica para esta nota, apta para previsualizacion y publicacion web.',
    '',
    'Reglas visuales UMSA:',
    '- Estetica documental realista, no render 3D, no stock generico, no ilustracion.',
    '- Escenas tecnicas creibles, con evidencia fisica del trabajo.',
    '- Luz natural o LED de trabajo, composicion sobria, materiales reales.',
    `- Formato ${ratio}, minimo 1600 px de ancho si la herramienta lo permite.`,
    '- Sin texto visible agregado, sin marcas de agua, sin logos inventados o reales.',
    '- Evitar rostros reconocibles y personas identificables.',
    '- No generar collage ni grillas.',
    '- Cada nota debe tener concepto visual unico; no repetir tecnico de espaldas, rack frontal o monitor como comodin.',
    '',
    `Producto: ${topic.title}`,
    `ID: ${topic.id}`,
    `Nombre esperado: ${expectedFilename}.png`,
    `Descripcion editorial: ${topic.narrative}`,
    '',
    `Concepto base: ${basePrompt}`,
  ].join('\n');

  return {
    id: `image-${topic.id}`,
    topicId: topic.id,
    slug,
    title: imagePrompt.title || `Imagen editorial - ${topic.title}`,
    expectedFilename,
    batchId,
    status: normalizeImageStatus(imagePrompt.status),
    prompt,
    alt: `${topic.title}. Imagen editorial UMSA sin texto incrustado.`,
    ratio,
    destinationPath: `/images/editarra/generated/${batchId}/${expectedFilename}.webp`,
  };
};

const buildQualityAudit = ({
  topic,
  draft,
  evidence = [],
  seoExperiments = [],
}: Pick<BuildPackageInput, 'topic' | 'draft' | 'evidence' | 'seoExperiments'>) => {
  const requiredHeadings = UMSA_REQUIRED_HEADINGS.map((heading) => ({
    heading,
    present: draft.body.includes(heading),
  }));
  const forbiddenMatches = UMSA_FORBIDDEN_TERMS.filter((term) => textContains(`${draft.title} ${draft.seoTitle} ${draft.body}`, term));
  const sources = sourcePayloadForTopic(topic, evidence);
  const seo = selectedSeoPayload(topic, draft, seoExperiments);
  const topicSeoExperiments = seoExperiments.filter((item) => item.topicId === topic.id);
  const contentQualityIssues = scanEditarraObject({
    topic,
    draft,
    seoPayload: seo,
    seoExperiments: topicSeoExperiments,
  }, { surface: 'package', path: 'quality_audit' });
  const contentQualityPassed = !hasBlockingQualityIssues(contentQualityIssues);
  const bodyWords = wordCount(draft.body);

  return {
    model: 'umsa-diaria',
    status: requiredHeadings.every((item) => item.present) && forbiddenMatches.length === 0 && sources.length >= 4 && contentQualityPassed ? 'apto_para_revision' : 'requiere_revision',
    word_count: bodyWords,
    required_word_range: {
      min: 800,
      max: 1150,
      passed: bodyWords >= 800 && bodyWords <= 1150,
    },
    required_headings: requiredHeadings,
    forbidden_matches: forbiddenMatches,
    source_count: sources.length,
    source_requirement_passed: sources.length >= 4,
    seo: {
      meta_title_chars: seo.metaTitle.length,
      meta_description_chars: seo.metaDescription.length,
      meta_title_passed: seo.metaTitle.length <= 60,
      meta_description_passed: seo.metaDescription.length <= 160,
      tags_count: seo.tags.length,
    },
    content_quality: {
      passed: contentQualityPassed,
      issue_count: contentQualityIssues.length,
      blocking_count: contentQualityIssues.filter((issue) => issue.severity === 'bloqueante').length,
      issues: contentQualityIssues.slice(0, 20),
    },
    didactic_checklist: [
      { id: 'data_home', label: 'Explica dónde vive el dato', passed: /PostgreSQL|base/i.test(draft.body) },
      { id: 'permissions', label: 'Explica quién lee, edita o borra', passed: /permiso|rol|perfil/i.test(draft.body) },
      { id: 'flow', label: 'Incluye flujo de 4 a 7 pasos', passed: /Primero|Segundo|Tercero|Cuarto/i.test(draft.body) },
      { id: 'backup', label: 'Incluye backup, restauración o auditoría', passed: /backup|restauraci|auditor/i.test(draft.body) },
      { id: 'cost', label: 'Incluye costo y entregable', passed: /USD|ARS|costo|entregable/i.test(draft.body) },
    ],
  };
};

export const buildEditarraPublicationPayload = ({
  topic,
  draft,
  imagePrompt,
  variables,
  evidence = [],
  seoExperiments = [],
  slug,
}: BuildPublicationPayloadInput) => {
  const seo = selectedSeoPayload(topic, draft, seoExperiments);
  const category = variableValue(variables, 'umsa_default_category', inferUmsaCategory(topic));
  const allowedCategory: UmsaPublicationCategory = ['noticias', 'tecnico', 'proyectos', 'empresa'].includes(category)
    ? category as UmsaPublicationCategory
    : inferUmsaCategory(topic);
  const coverUrl = variableValue(
    variables,
    'umsa_cover_image_url',
    'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=1200&h=480&fit=crop&q=80',
  );
  const summary = trimText(sentenceFromMarkdown(draft.body, topic.narrative), 220);
  const readingMinutes = Math.max(1, Math.round(wordCount(draft.body) / 220));

  const payload = {
    titulo: trimText(draft.seoTitle || topic.title, 70),
    resumen: summary.length >= 140 ? summary : trimText(`${summary} ${topic.seo}`, 220),
    contenido: draft.body,
    categoria: allowedCategory,
    imagen_portada: coverUrl,
    tags: seo.tags,
    tiempo_lectura: readingMinutes,
    fecha_publicacion: publicationDateForTopic(topic),
    meta_title: seo.metaTitle,
    meta_description: seo.metaDescription,
    slug,
    editarra: {
      model: 'umsa-diaria',
      source_count: sourcePayloadForTopic(topic, evidence).length,
      generated_for: 'ultimamilla.com.ar/blog',
      external_post_enabled: false,
    },
  };
  const contentQualityIssues = scanEditarraObject(payload, { surface: 'payload', path: 'publication_payload' });

  return {
    ...payload,
    editarra: {
      ...payload.editarra,
      content_quality: {
        passed: !hasBlockingQualityIssues(contentQualityIssues),
        issue_count: contentQualityIssues.length,
        blocking_count: contentQualityIssues.filter((issue) => issue.severity === 'bloqueante').length,
        issues: contentQualityIssues.slice(0, 20),
      },
    },
  };
};

export const buildEditarraAIBrief = ({
  topic,
  author,
  draft,
  imagePrompt,
  rules,
  variables,
  evidence = [],
  seoExperiments = [],
  slug,
}: BuildAIBriefInput) => {
  const seo = selectedSeoPayload(topic, draft, seoExperiments);
  const slot = inferUmsaSlot(topic);
  const category = inferUmsaCategory(topic);
  const enabledRules = rules.filter((rule) => rule.enabled).map(({ title, body }) => ({ title, body }));
  const enabledVariables = variables.filter((variable) => variable.enabled).map(({ key, value }) => ({ key, value }));

  return {
    id: `editarra-ai-${slug}`,
    provider: 'provider-agnostic',
    model_contract: 'umsa-diaria',
    target_site: 'ultimamilla.com.ar/blog',
    mode: 'generate_or_rewrite_publication_payload',
    topic: {
      id: topic.id,
      title: topic.title,
      note_axis: slot.key,
      category,
      publish_at: publicationDateForTopic(topic),
      source_plan: topic.source,
      narrative: topic.narrative,
      seo: topic.seo,
      token_budget: topic.tokens,
    },
    author: {
      name: author.name,
      voice_brief: author.voiceBrief,
      stance: author.stance,
      density: author.density,
      locality: author.locality,
      visible_references_policy: 'Aplicar influencias invisibles; no nombrar autores referencia ni técnicas del prompt.',
      references_to_follow: author.references,
      references_to_avoid: author.antiReferences,
    },
    umsa_diaria_rules: {
      daily_run: [
        { note: 'A', axis: 'reactiva', publish_at: '07:00:00-03:00', category: 'noticias' },
        { note: 'B', axis: 'evergreen técnica', publish_at: '12:00:00-03:00', category: 'tecnico' },
        { note: 'C', axis: 'caso o industria', publish_at: '17:00:00-03:00', category: 'proyectos|empresa' },
      ],
      required_structure: [
        'lead de 60 a 85 palabras',
        'H2 de problema o cambio',
        ...UMSA_REQUIRED_HEADINGS,
      ],
      required_sources: 4,
      required_word_range: [800, 1150],
      forbidden_terms: UMSA_FORBIDDEN_TERMS,
      orthography: 'Español rioplatense con tildes y eñes en texto visible. Slug en ASCII.',
      didactic_outputs: [
        'dónde vive el dato',
        'quién lee, edita o borra',
        'flujo de 4 a 7 pasos',
        'backup, auditoría o restauración',
        'costo y primer entregable verificable',
      ],
      active_local_rules: enabledRules,
      variables: enabledVariables,
    },
    sources: sourcePayloadForTopic(topic, evidence),
    image: {
      title: imagePrompt.title,
      prompt: imagePrompt.prompt,
      ratio: imagePrompt.ratio,
      license_order: 'Unsplash > Pexels/Pixabay > Wikimedia Commons > SVG propio UMSA',
    },
    draft_context: {
      title: draft.title,
      seo_title: draft.seoTitle,
      body: draft.body,
      notes: draft.notes,
    },
    expected_json_schema: {
      titulo: 'string <= 70 chars',
      resumen: 'string 140-220 chars',
      contenido: 'Markdown string 800-1150 words',
      categoria: 'noticias|proyectos|tecnico|empresa',
      imagen_portada: 'licensed URL',
      tags: ['3-5 strings'],
      tiempo_lectura: 'number round(words/220)',
      fecha_publicacion: 'ISO datetime with -03:00 timezone',
      meta_title: 'string <= 60 chars',
      meta_description: 'string <= 160 chars',
    },
    seo_target: seo,
    output_policy: {
      return_json_only: true,
      accepted_wrappers: ['publication_payload', 'payload', 'direct_schema'],
      no_external_post: true,
    },
  };
};

const buildPreflightChecks = ({
  topic,
  draft,
  imagePrompt,
  rules,
  evidence = [],
  seoExperiments = [],
  analyticsRecords = [],
  draftVersions = [],
  auditEvents,
}: Pick<BuildPackageInput, 'topic' | 'draft' | 'imagePrompt' | 'rules' | 'evidence' | 'seoExperiments' | 'analyticsRecords' | 'draftVersions' | 'auditEvents'>): EditorialPreflightCheck[] => {
  const bodyLength = draft.body.trim().length;
  const activeRules = rules.filter((rule) => rule.enabled).length;
  const topicEvidence = evidence.filter((item) => item.topicId === topic.id);
  const validatedEvidence = topicEvidence.filter((item) => item.status === 'validado' && hasMeaningfulText(item.sourceName) && hasMeaningfulText(item.claim));
  const topicSeoExperiments = seoExperiments.filter((item) => item.topicId === topic.id);
  const selectedSeoExperiment = topicSeoExperiments.find((item) => item.selected);
  const topicAnalyticsRecords = analyticsRecords.filter((item) => item.topicId === topic.id);
  const latestAnalyticsRecord = topicAnalyticsRecords[0];
  const topicDraftVersions = draftVersions.filter((item) => item.topicId === topic.id);
  const qualityAudit = buildQualityAudit({ topic, draft, evidence, seoExperiments });
  const imageManifest = buildEditarraImageManifest({
    topic,
    imagePrompt,
    slug: slugify(draft.seoTitle || topic.title),
  });
  const headingsPassed = qualityAudit.required_headings.every((item) => item.present);
  const didacticPassed = qualityAudit.didactic_checklist.every((item) => item.passed);
  const seoPayload = selectedSeoPayload(topic, draft, seoExperiments);
  const contentQualityIssues = scanEditarraObject({
    topic,
    draft,
    selectedSeoExperiment,
    seoPayload,
  }, { surface: 'package', path: 'preflight' });
  const contentQualityPassed = !hasBlockingQualityIssues(contentQualityIssues);

  return [
    {
      id: 'draft-status',
      label: 'Estado editorial',
      passed: ['aprobado', 'publicado'].includes(draft.status),
      severity: ['aprobado', 'publicado'].includes(draft.status) ? 'ok' : 'bloqueante',
      detail: ['aprobado', 'publicado'].includes(draft.status)
        ? `Borrador en estado ${draft.status}.`
        : 'Debe estar aprobado o publicado antes de salida manual.',
    },
    {
      id: 'draft-body',
      label: 'Cuerpo del articulo',
      passed: bodyLength >= 180 && qualityAudit.word_count >= 250,
      severity: bodyLength >= 180 && qualityAudit.word_count >= 250 ? 'ok' : 'advertencia',
      detail: `${bodyLength} caracteres editoriales · ${qualityAudit.word_count} palabras.`,
    },
    {
      id: 'umsa-structure',
      label: 'Estructura UMSA Diaria',
      passed: headingsPassed,
      severity: headingsPassed ? 'ok' : 'bloqueante',
      detail: headingsPassed
        ? 'Incluye secciones obligatorias del modelo UMSA.'
        : `Faltan: ${qualityAudit.required_headings.filter((item) => !item.present).map((item) => item.heading.replace(/^##\s+/g, '')).join(', ') || 'secciones sin detectar'}.`,
    },
    {
      id: 'umsa-didactic',
      label: 'Didactica tecnica',
      passed: didacticPassed,
      severity: didacticPassed ? 'ok' : 'advertencia',
      detail: didacticPassed
        ? 'Explica dato, permisos, flujo, backup/auditoria y costo.'
        : `Revisar: ${qualityAudit.didactic_checklist.filter((item) => !item.passed).map((item) => item.label).join(', ')}.`,
    },
    {
      id: 'source-plan',
      label: 'Fuente verificable',
      passed: hasMeaningfulText(topic.source) && !/pendiente/i.test(topic.source),
      severity: hasMeaningfulText(topic.source) && !/pendiente/i.test(topic.source) ? 'ok' : 'bloqueante',
      detail: topic.source,
    },
    {
      id: 'seo-plan',
      label: 'SEO y metadata',
      passed: hasMeaningfulText(topic.seo, 18) && hasMeaningfulText(draft.seoTitle, 10) && seoPayload.metaTitle.length <= 60 && seoPayload.metaDescription.length <= 160,
      severity: hasMeaningfulText(topic.seo, 18) && hasMeaningfulText(draft.seoTitle, 10) && seoPayload.metaTitle.length <= 60 && seoPayload.metaDescription.length <= 160 ? 'ok' : 'advertencia',
      detail: `${seoPayload.metaTitle.length}/60 title · ${seoPayload.metaDescription.length}/160 description.`,
    },
    {
      id: 'content-quality-gate',
      label: 'Guardia anti-maqueta',
      passed: contentQualityPassed,
      severity: contentQualityPassed ? 'ok' : 'bloqueante',
      detail: summarizeQualityIssues(contentQualityIssues),
    },
    {
      id: 'seo-experiment',
      label: 'Variante SEO elegida',
      passed: Boolean(selectedSeoExperiment),
      severity: selectedSeoExperiment ? 'ok' : 'advertencia',
      detail: selectedSeoExperiment
        ? `${selectedSeoExperiment.title} · CTR ${selectedSeoExperiment.ctr}% · ${selectedSeoExperiment.impressions} impresiones.`
        : 'Conviene elegir una variante SEO antes de programar distribucion.',
    },
    {
      id: 'analytics',
      label: 'Metricas de rendimiento',
      passed: topicAnalyticsRecords.length > 0,
      severity: topicAnalyticsRecords.length > 0 ? 'ok' : 'advertencia',
      detail: latestAnalyticsRecord
        ? `${latestAnalyticsRecord.visits} visitas · ${latestAnalyticsRecord.averageReadSeconds}s lectura · score ${latestAnalyticsRecord.performanceScore}/100.`
        : 'Carga metricas o criterios de exito para cerrar el feedback loop.',
    },
    {
      id: 'image-prompt',
      label: 'Prompt visual',
      passed: hasMeaningfulText(imageManifest.prompt, 400) && !['pendiente', 'descartada'].includes(imageManifest.status),
      severity: hasMeaningfulText(imageManifest.prompt, 400) && !['pendiente', 'descartada'].includes(imageManifest.status) ? 'ok' : 'bloqueante',
      detail: `${imageManifest.title} · ${imageManifest.status} · ${imageManifest.expectedFilename}.webp`,
    },
    {
      id: 'publication-preview',
      label: 'Previa publicable',
      passed: hasMeaningfulText(draft.body, 180) && hasMeaningfulText(draft.seoTitle || topic.title, 10),
      severity: hasMeaningfulText(draft.body, 180) && hasMeaningfulText(draft.seoTitle || topic.title, 10) ? 'ok' : 'bloqueante',
      detail: 'Preview UMSA Blog disponible antes de exportar payload.',
    },
    {
      id: 'rules',
      label: 'Reglas activas',
      passed: activeRules > 0,
      severity: activeRules > 0 ? 'ok' : 'advertencia',
      detail: `${activeRules} reglas activas.`,
    },
    {
      id: 'revision-history',
      label: 'Historial de versiones',
      passed: topicDraftVersions.length > 0,
      severity: topicDraftVersions.length > 0 ? 'ok' : 'advertencia',
      detail: topicDraftVersions.length > 0
        ? `${topicDraftVersions.length} versiones guardadas para auditoria.`
        : 'Conviene guardar al menos una version antes de publicar.',
    },
    {
      id: 'evidence',
      label: 'Cuarta fuente UMSA',
      passed: validatedEvidence.length >= 4 || sourcePayloadForTopic(topic, evidence).length >= 4,
      severity: validatedEvidence.length >= 4 || sourcePayloadForTopic(topic, evidence).length >= 4 ? 'ok' : 'bloqueante',
      detail: validatedEvidence.length >= 4
        ? `${validatedEvidence.length}/${topicEvidence.length} evidencias validadas.`
        : `${sourcePayloadForTopic(topic, evidence).length} fuentes disponibles; validar 4 fuentes primarias antes de publicar.`,
    },
    {
      id: 'ai-brief',
      label: 'Brief AI exportable',
      passed: true,
      severity: 'ok',
      detail: 'ai_brief.json disponible para proveedor externo o ejecución manual.',
    },
    {
      id: 'publication-payload',
      label: 'Payload de publicacion',
      passed: true,
      severity: 'ok',
      detail: 'publication_payload.json emite el contrato de ultimamilla.com.ar/blog sin hacer POST externo.',
    },
    {
      id: 'audit',
      label: 'Trazabilidad',
      passed: auditEvents.length > 0,
      severity: auditEvents.length > 0 ? 'ok' : 'advertencia',
      detail: `${auditEvents.length} eventos registrados.`,
    },
  ];
};

export const buildEditarraPackage = ({
  topic,
  author,
  draft,
  imagePrompt,
  rules,
  variables,
  evidence = [],
  seoExperiments = [],
  analyticsRecords = [],
  draftVersions = [],
  auditEvents,
  hostUrl,
  route,
}: BuildPackageInput) => {
  const slug = slugify(draft.seoTitle || topic.title);
  const enabledRules = rules.filter((rule) => rule.enabled);
  const enabledVariables = variables.filter((variable) => variable.enabled);
  const topicEvidence = evidence.filter((item) => item.topicId === topic.id);
  const topicSeoExperiments = seoExperiments.filter((item) => item.topicId === topic.id);
  const topicAnalyticsRecords = analyticsRecords.filter((item) => item.topicId === topic.id);
  const topicDraftVersions = draftVersions.filter((item) => item.topicId === topic.id);
  const generatedAt = new Date().toISOString();
  const preflight = buildPreflightChecks({ topic, draft, imagePrompt, rules, evidence, seoExperiments, analyticsRecords, draftVersions, auditEvents });
  const readyForManualPublish = preflight.every((check) => check.severity !== 'bloqueante' || check.passed);
  const imageManifest = buildEditarraImageManifest({
    topic,
    imagePrompt,
    slug,
    generatedAt,
  });
  const aiBrief = buildEditarraAIBrief({
    topic,
    author,
    draft,
    imagePrompt,
    rules,
    variables,
    evidence,
    seoExperiments,
    slug,
  });
  const publicationPayload = buildEditarraPublicationPayload({
    topic,
    draft,
    imagePrompt,
    variables,
    evidence,
    seoExperiments,
    slug,
  });
  const qualityAudit = buildQualityAudit({
    topic,
    draft,
    evidence,
    seoExperiments,
  });
  const metadata = {
    product: 'editarra',
    model: 'umsa-diaria',
    route,
    host_url: hostUrl,
    slug,
    topic_id: topic.id,
    title: draft.seoTitle || topic.title,
    draft_title: draft.title,
    draft_status: draft.status,
    author: author.name,
    source_plan: topic.source,
    publish_at: topic.publishAt,
    research_depth: topic.depth,
    token_budget: topic.tokens,
    seo: topic.seo,
    narrative_constraints: topic.narrative,
    editorial_voice: {
      brief: author.voiceBrief,
      stance: author.stance,
      density: author.density,
      locality: author.locality,
      references_to_follow: author.references,
      references_to_avoid: author.antiReferences,
    },
    rules: enabledRules.map(({ title, body }) => ({ title, body })),
    variables: enabledVariables.map(({ key, value }) => ({ key, value })),
    seo_experiments: topicSeoExperiments.map(({ id, title, description, focusKeyword, strategy, ctr, impressions, selected, notes }) => ({
      id,
      title,
      description,
      focus_keyword: focusKeyword,
      strategy,
      ctr,
      impressions,
      selected,
      notes,
    })),
    analytics: topicAnalyticsRecords.map(({ id, period, trafficSource, visits, averageReadSeconds, ctaClicks, shares, comments, conversionRate, successCriteria, performanceScore, learningNote }) => ({
      id,
      period,
      traffic_source: trafficSource,
      visits,
      average_read_seconds: averageReadSeconds,
      cta_clicks: ctaClicks,
      shares,
      comments,
      conversion_rate: conversionRate,
      success_criteria: successCriteria,
      performance_score: performanceScore,
      learning_note: learningNote,
    })),
    evidence: topicEvidence.map(({ id, sourceName, sourceUrl, claim, status, confidence, notes }) => ({
      id,
      source_name: sourceName,
      source_url: sourceUrl,
      claim,
      status,
      confidence,
      notes,
    })),
    revision_history: topicDraftVersions.map((version) => ({
      id: version.id,
      draft_id: version.draftId,
      version: version.version,
      variant: version.variant,
      status: version.status,
      title: version.title,
      seo_title: version.seoTitle,
      change_note: version.changeNote,
      snapshot_at: version.snapshotAt,
      author_name: version.authorName,
      body_chars: version.body.length,
    })),
    preflight,
    ai_ready: true,
    publication_payload_ready: true,
    umsa_quality_status: qualityAudit.status,
    generated_at: generatedAt,
  };
  const article = [
    `# ${draft.seoTitle || topic.title}`,
    '',
    `Autor: ${author.name}`,
    `Estado: ${draft.status}`,
    `Fuente: ${topic.source}`,
    `Publicacion sugerida: ${topic.publishAt}`,
    '',
    draft.body,
    '',
    '## Notas de cierre',
    draft.notes || 'Sin notas de cierre.',
    '',
    '## SEO',
    topic.seo,
    '',
    '## Experimentos SEO',
    ...(topicSeoExperiments.length > 0
      ? topicSeoExperiments.map((item) => `- ${item.selected ? 'seleccionada' : 'variante'}: ${item.title} · ${item.focusKeyword} · CTR ${item.ctr}%`)
      : ['- Sin experimentos SEO cargados.']),
    '',
    '## Metricas y aprendizaje',
    ...(topicAnalyticsRecords.length > 0
      ? topicAnalyticsRecords.map((item) => `- ${item.period}: ${item.visits} visitas · ${item.averageReadSeconds}s lectura · ${item.ctaClicks} CTA · score ${item.performanceScore}/100. ${item.learningNote}`)
      : ['- Sin metricas cargadas.']),
    '',
    '## Evidencia',
    ...(topicEvidence.length > 0
      ? topicEvidence.map((item) => `- ${item.status}: ${item.sourceName} (${item.confidence}/100) - ${item.claim}`)
      : ['- Sin evidencias cargadas.']),
    '',
    '## Versiones',
    ...(topicDraftVersions.length > 0
      ? topicDraftVersions.map((item) => `- v${item.version} (${item.snapshotAt}) ${item.changeNote}`)
      : ['- Sin versiones guardadas.']),
    '',
    '## Reglas aplicadas',
    ...(enabledRules.length > 0
      ? enabledRules.map((rule) => `- ${rule.title}: ${rule.body}`)
      : ['- Sin reglas activas.']),
  ].join('\n');
  const imagePayload = {
    topic_id: topic.id,
    article_slug: slug,
    image_id: imagePrompt.id,
    title: imageManifest.title,
    ratio: imageManifest.ratio,
    status: imageManifest.status,
    prompt: imageManifest.prompt,
    expected_filename: `${imageManifest.expectedFilename}.png`,
    destination_path: imageManifest.destinationPath,
    alt: imageManifest.alt,
    negative_prompt: 'texto incrustado, watermark, logotipos partidarios, stock photo generica, manos deformes',
  };
  const auditPayload = auditEvents.map(({ id, event, detail, time }) => ({
    id,
    time,
    event,
    detail,
  }));
  const seoExperimentsPayload = topicSeoExperiments.map(({ id, title, description, focusKeyword, strategy, ctr, impressions, selected, notes }) => ({
    id,
    topic_id: topic.id,
    title,
    description,
    focus_keyword: focusKeyword,
    strategy,
    ctr,
    impressions,
    selected,
    notes,
  }));
  const analyticsPayload = topicAnalyticsRecords.map(({ id, period, trafficSource, visits, averageReadSeconds, ctaClicks, shares, comments, conversionRate, successCriteria, performanceScore, learningNote }) => ({
    id,
    topic_id: topic.id,
    period,
    traffic_source: trafficSource,
    visits,
    average_read_seconds: averageReadSeconds,
    cta_clicks: ctaClicks,
    shares,
    comments,
    conversion_rate: conversionRate,
    success_criteria: successCriteria,
    performance_score: performanceScore,
    learning_note: learningNote,
  }));
  const evidencePayload = topicEvidence.map(({ id, sourceName, sourceUrl, claim, status, confidence, notes }) => ({
    id,
    topic_id: topic.id,
    source_name: sourceName,
    source_url: sourceUrl,
    claim,
    status,
    confidence,
    notes,
  }));
  const revisionHistoryPayload = topicDraftVersions.map((version) => ({
    id: version.id,
    topic_id: version.topicId,
    draft_id: version.draftId,
    version: version.version,
    variant: version.variant,
    status: version.status,
    title: version.title,
    seo_title: version.seoTitle,
    body: version.body,
    notes: version.notes,
    change_note: version.changeNote,
    snapshot_at: version.snapshotAt,
    author_name: version.authorName,
  }));
  const manifest = {
    package_id: `editarra-${slug}`,
    slug,
    generated_at: generatedAt,
    files: ['article.md', 'metadata.json', 'image_prompt.json', 'image_manifest.json', 'ai_brief.json', 'publication_payload.json', 'quality_audit.json', 'seo_experiments.json', 'analytics_report.json', 'evidence_log.json', 'revision_history.json', 'audit_log.json', 'package_manifest.json'],
    model: 'umsa-diaria',
    target_publication_contract: 'ultimamilla.com.ar/api/blog',
    external_post_enabled: false,
    ready_for_manual_publish: readyForManualPublish,
    preflight_summary: {
      passed: preflight.filter((check) => check.passed).length,
      total: preflight.length,
      blockers: preflight.filter((check) => check.severity === 'bloqueante' && !check.passed).length,
      warnings: preflight.filter((check) => check.severity === 'advertencia' && !check.passed).length,
    },
    import_back_target: `${hostUrl}${route}`,
  };

  return {
    id: manifest.package_id,
    slug,
    title: metadata.title,
    ready: readyForManualPublish,
    preflight,
    aiBrief,
    imageManifest,
    publicationPayload,
    qualityAudit,
    files: {
      'article.md': `${article}\n`,
      'metadata.json': jsonFile(metadata),
      'image_prompt.json': jsonFile(imagePayload),
      'image_manifest.json': jsonFile(imageManifest),
      'ai_brief.json': jsonFile(aiBrief),
      'publication_payload.json': jsonFile(publicationPayload),
      'quality_audit.json': jsonFile(qualityAudit),
      'seo_experiments.json': jsonFile(seoExperimentsPayload),
      'analytics_report.json': jsonFile(analyticsPayload),
      'evidence_log.json': jsonFile(evidencePayload),
      'revision_history.json': jsonFile(revisionHistoryPayload),
      'audit_log.json': jsonFile(auditPayload),
      'package_manifest.json': jsonFile(manifest),
    } as Record<EditorialPackageFileKey, string>,
  };
};

export const buildEditarraBatch = ({
  topics,
  authors,
  drafts,
  imagePrompts,
  rules,
  variables,
  evidence = [],
  seoExperiments = [],
  analyticsRecords = [],
  draftVersions = [],
  auditEvents,
  hostUrl,
  route,
}: BuildBatchInput) => {
  const generatedAt = new Date().toISOString();
  const publishableTopics = topics.filter((topic) => topic.status !== 'descartado');
  const fallbackAuthor = authors[0];
  const fallbackImage = imagePrompts[0];
  const items = publishableTopics.map((topic) => {
    const author = authors.find((item) => item.name === topic.author) || fallbackAuthor;
    const draft = drafts.find((item) => item.topicId === topic.id) || {
      id: `draft-${topic.id}`,
      topicId: topic.id,
      variant: 'base' as DraftVariantKey,
      status: topic.status === 'publicado' ? 'publicado' : 'borrador',
      title: `Borrador base - ${topic.title}`,
      seoTitle: topic.title,
      body: `${topic.title}.\n\n${topic.narrative}\n\nFuente principal: ${topic.source}.`,
      notes: 'Borrador generado por lote, pendiente de cierre editorial.',
      updatedAt: generatedAt,
    };
    const imagePrompt = fallbackImage || buildPendingPackageImagePrompt(topic);
    const articlePackage = buildEditarraPackage({
      topic,
      author,
      draft,
      imagePrompt,
      rules,
      variables,
      evidence,
      seoExperiments,
      analyticsRecords,
      draftVersions,
      auditEvents,
      hostUrl,
      route,
    });
    const blockers = articlePackage.preflight.filter((check) => check.severity === 'bloqueante' && !check.passed).length;
    const warnings = articlePackage.preflight.filter((check) => check.severity === 'advertencia' && !check.passed).length;

    return {
      topic_id: topic.id,
      title: topic.title,
      status: topic.status || 'sugerido',
      author: author.name,
      package_id: articlePackage.id,
      slug: articlePackage.slug,
      ready: articlePackage.ready,
      blockers,
      warnings,
      files: Object.keys(articlePackage.files),
    };
  });
  const manifest = {
    batch_id: `editarra-batch-${generatedAt.replace(/[:.]/g, '-')}`,
    product: 'editarra',
    route,
    host_url: hostUrl,
    generated_at: generatedAt,
    totals: {
      topics: items.length,
      ready: items.filter((item) => item.ready).length,
      blocked: items.filter((item) => item.blockers > 0).length,
      warnings: items.reduce((sum, item) => sum + item.warnings, 0),
    },
    items,
  };

  return {
    id: manifest.batch_id,
    readyCount: manifest.totals.ready,
    blockedCount: manifest.totals.blocked,
    warningCount: manifest.totals.warnings,
    topicCount: manifest.totals.topics,
    manifest,
    content: jsonFile(manifest),
  };
};

export const buildEditarraDistributionPlan = ({
  batch,
  topics,
  variables,
  hostUrl,
}: BuildDistributionInput) => {
  const generatedAt = new Date().toISOString();
  const host = normalizeHostUrl(hostUrl);
  const channels = parseDistributionChannels(variables);
  const topicById = new Map(topics.map((topic) => [topic.id, topic]));
  const items = batch.manifest.items.map((item) => {
    const topic = topicById.get(item.topic_id);
    const canonicalUrl = `https://${host}/${item.slug}`;
    const selectedChannels = channels.filter((channel) => {
      if (channel === 'newsletter') {
        return (topic?.tokens || 0) >= 9000 || item.ready;
      }

      if (channel === 'linkedin') {
        return topic?.depth !== 'Breve';
      }

      if (channel === 'whatsapp') {
        return (topic?.tokens || 0) <= 18000 && item.blockers === 0;
      }

      return true;
    });
    const status = item.blockers > 0 ? 'bloqueado' : item.ready ? 'listo' : 'revision';

    return {
      topic_id: item.topic_id,
      title: item.title,
      status,
      author: item.author,
      package_id: item.package_id,
      canonical_url: canonicalUrl,
      scheduled_for: topic?.publishAt || 'Sin fecha',
      required_action: item.blockers > 0
        ? 'Resolver bloqueos editoriales antes de distribuir.'
        : item.ready
          ? 'Programar publicacion y piezas multicanal.'
          : 'Revisar avisos y confirmar fuente antes de programar.',
      channels: selectedChannels.map((channel) => ({
        channel,
        label: distributionChannelLabel[channel],
        copy: channelCopy(channel, item.title, canonicalUrl, topic?.source || 'fuente pendiente'),
      })),
      checklist: [
        'Confirmar fuente y fecha visible.',
        'Revisar canonical y slug antes de publicar.',
        'Verificar alt de imagen y ausencia de texto incrustado.',
        'Registrar aprobacion humana si hubo bloqueos o avisos.',
      ],
    };
  });
  const manifest = {
    distribution_id: `editarra-distribution-${generatedAt.replace(/[:.]/g, '-')}`,
    product: 'editarra',
    source_batch_id: batch.id,
    host_url: hostUrl,
    generated_at: generatedAt,
    totals: {
      items: items.length,
      ready: items.filter((item) => item.status === 'listo').length,
      review: items.filter((item) => item.status === 'revision').length,
      blocked: items.filter((item) => item.status === 'bloqueado').length,
      channel_deliverables: items.reduce((sum, item) => sum + item.channels.length, 0),
    },
    channels: channels.map((channel) => ({
      channel,
      label: distributionChannelLabel[channel],
      items: items.filter((item) => item.channels.some((itemChannel) => itemChannel.channel === channel)).length,
    })),
    items,
  };

  return {
    id: manifest.distribution_id,
    readyCount: manifest.totals.ready,
    reviewCount: manifest.totals.review,
    blockedCount: manifest.totals.blocked,
    deliverableCount: manifest.totals.channel_deliverables,
    itemCount: manifest.totals.items,
    manifest,
    content: jsonFile(manifest),
  };
};
