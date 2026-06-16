import type { DraftVariantKey, EditorialPackageFileKey } from './operations';
import {
  agendaSeed,
  discoveryCandidateSeed,
  discoveryCandidateStatuses,
} from './radarModel';
import type {
  DiscoveryCandidate,
  DiscoveryCandidateStatus,
  DiscoveryRun,
  DiscoveryRunSourceAudit,
  EditorialAgenda,
} from './radarModel';
import { readStoredEditarraState } from './storageAdapter';
import type { GuidedRunRecord } from './guidedEngine';
import { defaultNoteVariableValues, editorialProfiles, noteRecipes, operationModes } from './profileModel';
import type { EditorialProfile, EditarraRecipeKey } from './profileModel';
import type { EditarraMissionPreset } from './missionPresetModel';
import type { EditarraProductionHydrators } from './useEditarraStudio';
import type {
  AnalyticsRecord,
  DistributionActions,
  DraftStatus,
  DraftVersion,
  EditarraProductionState,
  EditorialDraft,
  EvidenceRecord,
  EvidenceStatus,
  SeoExperiment,
  SeoStrategy,
  TrafficSource,
} from './productionReducer';
import { sanitizeSeoExperiment } from './productionReducer';
import type {
  Author,
  AuthorInfluence,
  InfluenceRelation,
  NoteVariableOverride,
  StyleWeightKey,
  Topic,
  TopicStatus,
  VariableScope,
  WorkflowVariable,
} from './workspaceModel';

type StatusTone = 'emerald' | 'blue' | 'amber' | 'rose' | 'slate' | 'violet';
type TabKey = 'operacion' | 'agenda' | 'autores' | 'editor' | 'imagenes' | 'publicacion' | 'auditoria' | 'config';

export type ImagePrompt = {
  id: string;
  title: string;
  ratio: string;
  status: string;
  prompt: string;
};

export type EditorRule = {
  id: string;
  title: string;
  body: string;
  enabled: boolean;
};

export type AuditEvent = {
  id: string;
  event: string;
  detail: string;
  time: string;
};

export type PersistedEditarraState = {
  selectedSiteId?: string;
  selectedRecipeId?: EditarraRecipeKey;
  selectedOperationModeId?: string;
  selectedPublicationDestinationId?: string;
  profiles?: Partial<EditorialProfile>[];
  authors?: Partial<Author>[];
  topics?: Partial<Topic>[];
  selectedTopicId?: string;
  editorialAgendas?: Partial<EditorialAgenda>[];
  selectedAgendaId?: string;
  discoveryCandidates?: Partial<DiscoveryCandidate>[];
  discoveryRuns?: Partial<DiscoveryRun>[];
  candidateStatusFilter?: DiscoveryCandidateStatus | 'todos';
  candidateRunScope?: 'ultimo_run' | 'historico';
  reusableImages?: string[];
  workflowVariables?: Partial<WorkflowVariable>[];
  noteVariableOverrides?: Partial<NoteVariableOverride>[];
  missionPresets?: Partial<EditarraMissionPreset>[];
  imagePrompts?: Partial<ImagePrompt>[];
  editorRules?: Partial<EditorRule>[];
  drafts?: Partial<EditorialDraft>[];
  evidence?: Partial<EvidenceRecord>[];
  draftVersions?: Partial<DraftVersion>[];
  seoExperiments?: Partial<SeoExperiment>[];
  analyticsRecords?: Partial<AnalyticsRecord>[];
  auditEvents?: Partial<AuditEvent>[];
  guidedRunRecords?: Partial<GuidedRunRecord>[];
  distributionActions?: DistributionActions;
  packageFileKey?: EditorialPackageFileKey;
};

export type BuildPersistedEditarraStateInput = {
  selectedSiteId: string;
  selectedRecipeId: EditarraRecipeKey;
  selectedOperationModeId: string;
  selectedPublicationDestinationId: string;
  profiles: EditorialProfile[];
  authors: Author[];
  topics: Topic[];
  selectedTopicId: string;
  editorialAgendas: EditorialAgenda[];
  selectedAgendaId: string;
  discoveryCandidates: DiscoveryCandidate[];
  discoveryRuns: DiscoveryRun[];
  candidateStatusFilter: DiscoveryCandidateStatus | 'todos';
  candidateRunScope: 'ultimo_run' | 'historico';
  reusableImages: string[];
  workflowVariables: WorkflowVariable[];
  noteVariableOverrides: NoteVariableOverride[];
  missionPresets: EditarraMissionPreset[];
  imagePrompts: ImagePrompt[];
  editorRules: EditorRule[];
  auditEvents: AuditEvent[];
  productionState: EditarraProductionState;
  packageFileKey?: EditorialPackageFileKey;
};

export type HydratedEditarraImport = {
  profiles?: EditorialProfile[];
  selectedSiteId?: string;
  selectedRecipeId?: EditarraRecipeKey;
  selectedOperationModeId?: string;
  selectedPublicationDestinationId?: string;
  authors?: Author[];
  topics?: Topic[];
  selectedTopicId?: string;
  editorialAgendas?: EditorialAgenda[];
  selectedAgendaId?: string;
  discoveryCandidates?: DiscoveryCandidate[];
  discoveryRuns?: DiscoveryRun[];
  candidateStatusFilter?: DiscoveryCandidateStatus | 'todos';
  candidateRunScope?: 'ultimo_run' | 'historico';
  workflowVariables?: WorkflowVariable[];
  noteVariableOverrides?: NoteVariableOverride[];
  missionPresets?: EditarraMissionPreset[];
  imagePrompts?: ImagePrompt[];
  editorRules?: EditorRule[];
  auditEvents?: AuditEvent[];
  reusableImages?: string[];
  packageFileKey?: EditorialPackageFileKey;
  productionPatch: Partial<EditarraProductionState>;
  shouldShowExport: boolean;
  importStatus: string;
  draftStatusMessage: string;
};

export type EditarraImportResult =
  | { ok: true; import: HydratedEditarraImport }
  | { ok: false; importStatus: string };

export type EditarraResetBaseline = {
  profiles: EditorialProfile[];
  selectedSiteId: string;
  selectedRecipeId: EditarraRecipeKey;
  selectedOperationModeId: string;
  selectedPublicationDestinationId: string;
  authors: Author[];
  topics: Topic[];
  selectedTopicId: string;
  editorialAgendas: EditorialAgenda[];
  selectedAgendaId: string;
  discoveryCandidates: DiscoveryCandidate[];
  discoveryRuns: DiscoveryRun[];
  candidateStatusFilter: DiscoveryCandidateStatus | 'todos';
  candidateRunScope: 'ultimo_run' | 'historico';
  reusableImages: string[];
  workflowVariables: WorkflowVariable[];
  noteVariableOverrides: NoteVariableOverride[];
  missionPresets: EditarraMissionPreset[];
  imagePrompts: ImagePrompt[];
  editorRules: EditorRule[];
  productionPatch: Partial<EditarraProductionState>;
  auditEvents: AuditEvent[];
  query: string;
  statusFilter: TopicStatus | 'todos';
  importBuffer: string;
  showExport: boolean;
  importStatus: string;
  draftStatusMessage: string;
  packageFileKey: EditorialPackageFileKey;
  packageStatus: string;
  batchStatus: string;
  distributionStatus: string;
  guidedFlowStatus: string;
};

export const topicStatuses: TopicStatus[] = ['sugerido', 'aprobado', 'redaccion', 'publicado', 'descartado'];
export const topicDepths: Topic['depth'][] = ['Alta', 'Media', 'Breve'];
export const variableScopes: VariableScope[] = ['agenda', 'editor', 'seo', 'imagenes', 'sistema'];
export const draftVariants: DraftVariantKey[] = ['base', 'humanizado', 'seo'];
export const draftStatuses: DraftStatus[] = ['borrador', 'listo', 'aprobado', 'publicado'];
export const evidenceStatuses: EvidenceStatus[] = ['pendiente', 'validado', 'riesgo'];
export const seoStrategies: SeoStrategy[] = ['Discover', 'Busqueda', 'Newsletter', 'Mixto'];
export const trafficSources: TrafficSource[] = ['organico', 'discover', 'newsletter', 'social', 'directo'];
export const packageFileKeys: EditorialPackageFileKey[] = ['article.md', 'metadata.json', 'image_prompt.json', 'image_prompt.md', 'image_manifest.json', 'radar_run_report.json', 'editorial_proposal.json', 'public_export_bundle.json', 'publication_targets.json', 'profile_runtime.json', 'note_run.json', 'ai_request.json', 'operational_contract.json', 'automation_recipe.json', 'ai_brief.json', 'publication_payload.json', 'quality_audit.json', 'seo_experiments.json', 'analytics_report.json', 'evidence_log.json', 'revision_history.json', 'audit_log.json', 'package_manifest.json'];
export const runtimePackageFileKeys: EditorialPackageFileKey[] = ['radar_run_report.json', 'editorial_proposal.json', 'public_export_bundle.json', 'image_prompt.md', 'profile_runtime.json', 'note_run.json', 'ai_request.json', 'operational_contract.json', 'automation_recipe.json'];
export const formatPackageJson = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

export const buildPersistedEditarraState = ({
  selectedSiteId,
  selectedRecipeId,
  selectedOperationModeId,
  selectedPublicationDestinationId,
  profiles,
  authors,
  topics,
  selectedTopicId,
  editorialAgendas,
  selectedAgendaId,
  discoveryCandidates,
  discoveryRuns,
  candidateStatusFilter,
  candidateRunScope,
  reusableImages,
  workflowVariables,
  noteVariableOverrides,
  missionPresets,
  imagePrompts,
  editorRules,
  auditEvents,
  productionState,
  packageFileKey,
}: BuildPersistedEditarraStateInput): PersistedEditarraState => ({
  selectedSiteId,
  selectedRecipeId,
  selectedOperationModeId,
  selectedPublicationDestinationId,
  profiles,
  authors,
  topics,
  selectedTopicId: topics.some((topic) => topic.id === selectedTopicId)
    ? selectedTopicId
    : topics[0]?.id,
  editorialAgendas,
  selectedAgendaId,
  discoveryCandidates,
  discoveryRuns,
  candidateStatusFilter,
  candidateRunScope,
  reusableImages,
  workflowVariables,
  noteVariableOverrides,
  missionPresets,
  imagePrompts,
  editorRules,
  drafts: productionState.drafts,
  evidence: productionState.evidence,
  draftVersions: productionState.draftVersions,
  seoExperiments: productionState.seoExperiments,
  analyticsRecords: productionState.analyticsRecords,
  auditEvents,
  guidedRunRecords: productionState.guidedRunRecords,
  distributionActions: productionState.distributionActions,
  packageFileKey: packageFileKey && packageFileKeys.includes(packageFileKey)
    ? packageFileKey
    : 'article.md',
});

export const draftStatusTone: Record<DraftStatus, StatusTone> = {
  borrador: 'slate',
  listo: 'blue',
  aprobado: 'emerald',
  publicado: 'violet',
};

const cx = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' ');

export const getDailyBatchTopicPrefix = (topicId: string) => {
  const match = topicId.match(/^topic-batch-(.+)-(reactiva|evergreen|caso)$/);

  return match ? `topic-batch-${match[1]}-` : null;
};

export const getDailyBatchRecipeId = (topicId: string): EditarraRecipeKey => {
  const match = topicId.match(/^topic-batch-.+-(reactiva|evergreen|caso)$/);

  return (match?.[1] as EditarraRecipeKey | undefined) || 'reactiva';
};

export const tabs: Array<{ key: TabKey; label: string; summary: string }> = [
  { key: 'operacion', label: 'Operacion', summary: 'Flujo guiado' },
  { key: 'agenda', label: 'Agenda', summary: 'Radar de temas' },
  { key: 'autores', label: 'Autores', summary: 'Voz, modelos y mezcla' },
  { key: 'editor', label: 'Editor', summary: 'Humanizacion y SEO' },
  { key: 'imagenes', label: 'Imagenes', summary: 'Prompts y banco visual' },
  { key: 'publicacion', label: 'Publicacion', summary: 'Preview y CMS' },
  { key: 'auditoria', label: 'Auditoria', summary: 'Trazabilidad y riesgos' },
  { key: 'config', label: 'Config', summary: 'JSON portable' },
];

export const defaultStyleWeights: Record<StyleWeightKey, number> = {
  claridad: 82,
  evidencia: 88,
  opinion: 35,
  humanidad: 72,
  seo: 64,
};

export const authorSeed: Author[] = [
  {
    id: 'federal',
    name: 'Editor UMSA Diaria',
    role: 'Tecnología abierta para pymes y organizaciones',
    active: true,
    models: 'agenda: umsa-diaria, editor: provider-agnostic, writer: json-portable',
    tone: ['didáctico', 'preciso', 'rioplatense'],
    banned: ['transformación digital', 'en la era de', 'no es X, es Y'],
    mix: '33% reactiva, 34% evergreen técnica, 33% caso o industria',
    score: 87,
    voiceBrief: 'Explica tecnología abierta con datos, permisos, costos y pruebas; la historia abre la puerta y la explicación hace el trabajo.',
    register: 'periodístico claro',
    rhythm: 'párrafos cortos, subtítulos como mapa y cierres concretos',
    stance: 'técnico, honesto y verificable',
    density: 'media-alta con flujo operativo',
    locality: 'Mendoza, Cuyo y pymes argentinas',
    influenceMode: 'adherir a referencias invisibles de no ficción y claridad, sin nombrarlas en el texto',
    references: ['PostgreSQL docs', 'MinIO docs', 'Metabase docs', 'Ley 27.506'],
    antiReferences: ['copy de catalogo SaaS', 'hilo viral sin fuente'],
    styleWeights: { claridad: 88, evidencia: 92, opinion: 28, humanidad: 70, seo: 68 },
    influences: [
      {
        id: 'inf-federal-1',
        reference: 'Documentación técnica primaria',
        relation: 'adherir',
        weight: 78,
        notes: 'Cada herramienta nombrada debe decir qué dato recibe, qué entrega y qué pasa si falla.',
      },
      {
        id: 'inf-federal-2',
        reference: 'Prosa de catalogo',
        relation: 'evitar',
        weight: 90,
        notes: 'Evitar promesas vagas, adjetivos inflados y comparaciones sin prueba.',
      },
    ],
  },
  {
    id: 'critico',
    name: 'Editor Critico',
    role: 'Correccion, humanizacion y QA etico',
    active: true,
    models: 'editor: gpt-4.1-mini, verifier: local-checks',
    tone: ['directo', 'preciso', 'sin ornamento'],
    banned: ['no solo... sino tambien', 'mas que', 'en definitiva'],
    mix: '100% revision independiente',
    score: 92,
    voiceBrief: 'Opera como editor de cierre: corta relleno, sube precision y detecta promesas que el texto no sostiene.',
    register: 'editorial sobrio',
    rhythm: 'frases cortas, cierre seco',
    stance: 'critico con evidencia',
    density: 'alta, sin ornamento',
    locality: 'neutral rioplatense',
    influenceMode: 'consultar referencias de edicion y evitar formulas genericas',
    references: ['The Economist style guide', 'AP fact-checking', 'manual interno anti-cliche'],
    antiReferences: ['newsletter motivacional', 'SEO spun content'],
    styleWeights: { claridad: 91, evidencia: 96, opinion: 42, humanidad: 58, seo: 54 },
    influences: [
      {
        id: 'inf-critico-1',
        reference: 'The Economist style guide',
        relation: 'consultar',
        weight: 72,
        notes: 'Preferir precision, economia verbal y jerarquia clara.',
      },
      {
        id: 'inf-critico-2',
        reference: 'SEO spun content',
        relation: 'evitar',
        weight: 95,
        notes: 'Detectar repeticion semantica y frases que suenan generadas.',
      },
    ],
  },
  {
    id: 'visual',
    name: 'Curador Visual',
    role: 'Prompts, banco de imagenes y metadatos',
    active: false,
    models: 'image_prompter: imagen, local: stable-diffusion-script',
    tone: ['visual', 'sobrio', 'documental'],
    banned: ['stock photo', 'watermark', 'texto incrustado'],
    mix: '70% hero 16:9, 30% social 1:1',
    score: 73,
    voiceBrief: 'Traduce notas en criterios visuales sobrios: imagen documental, metadata util y prompts auditables.',
    register: 'visual tecnico',
    rhythm: 'checklists breves y prompts especificos',
    stance: 'documental, no publicitario',
    density: 'media, orientada a produccion',
    locality: 'sin marcas ni iconografia partidaria',
    influenceMode: 'adherir a fotografia documental y evitar banco generico',
    references: ['Reuters Pictures', 'Nieman Lab visual explainers', 'archivo documental propio'],
    antiReferences: ['stock photo corporativa', 'ilustracion futurista generica'],
    styleWeights: { claridad: 76, evidencia: 80, opinion: 18, humanidad: 66, seo: 74 },
    influences: [
      {
        id: 'inf-visual-1',
        reference: 'Reuters Pictures',
        relation: 'adherir',
        weight: 70,
        notes: 'Priorizar composicion documental, luz natural y ausencia de texto incrustado.',
      },
      {
        id: 'inf-visual-2',
        reference: 'stock photo corporativa',
        relation: 'evitar',
        weight: 88,
        notes: 'Evitar manos perfectas, sonrisas corporativas y pantallas con texto falso.',
      },
    ],
  },
];

export const topicSeed: Topic[] = [
  {
    id: 'topic-umsa-reactiva',
    title: 'ARCA y depósitos fiscales: stock, CCTV y evidencia diaria',
    status: 'aprobado',
    priority: 94,
    depth: 'Alta',
    tokens: 10500,
    author: 'Editor UMSA Diaria',
    source: 'ARCA normativa oficial + PostgreSQL docs + MinIO docs + Metabase docs',
    narrative: 'Explicar cómo una obligación de evidencia diaria se traduce en datos, cámaras, permisos y respaldo verificable.',
    seo: 'Keyword principal: depósitos fiscales ARCA. Guía técnica para preparar stock, CCTV y evidencia diaria.',
    publishAt: '07:00 -03:00',
  },
  {
    id: 'topic-umsa-evergreen',
    title: 'Cómo separar archivos pesados con MinIO sin romper PostgreSQL',
    status: 'redaccion',
    priority: 88,
    depth: 'Media',
    tokens: 9800,
    author: 'Editor UMSA Diaria',
    source: 'PostgreSQL docs + MinIO docs + guías de backup + auditoría interna',
    narrative: 'Mostrar por qué conviene guardar registros en la base y archivos pesados como objetos con metadatos.',
    seo: 'Keyword principal: MinIO PostgreSQL. Comparativa técnica para pymes argentinas.',
    publishAt: '12:00 -03:00',
  },
  {
    id: 'topic-umsa-caso',
    title: 'Claves compartidas en guardias rurales: guía para ordenar accesos',
    status: 'sugerido',
    priority: 81,
    depth: 'Media',
    tokens: 9200,
    author: 'Editor UMSA Diaria',
    source: 'Passbolt docs + Keycloak docs + GLPI docs + políticas internas de acceso',
    narrative: 'Mini caso cuyano: cada secreto debe tener dueño, grupo, vencimiento y prueba de baja.',
    seo: 'Keyword principal: claves compartidas. Guía técnica para cooperativas y guardias rurales.',
    publishAt: '17:00 -03:00',
  },
  {
    id: 'topic-umsa-empresa',
    title: 'Metabase frente a Power BI: costo, permisos y gobierno del dato',
    status: 'publicado',
    priority: 76,
    depth: 'Breve',
    tokens: 7800,
    author: 'Editor Critico',
    source: 'Metabase docs + Microsoft pricing + PostgreSQL docs + casos internos anonimizados',
    narrative: 'Comparar decisión, costo y límite sin prometer migración universal.',
    seo: 'Keyword principal: Metabase Power BI. Decisión de costo y permisos para pymes.',
    publishAt: '17:00 -03:00',
  },
];

export const workflowSteps = [
  { title: 'Percepcion', body: 'Tendencias, competidores, RSS, CSV y documentos propios.', tone: 'blue' as StatusTone },
  { title: 'Razonamiento', body: 'Clasifica intencion, brechas y autoridad tematica.', tone: 'slate' as StatusTone },
  { title: 'Planificacion', body: 'Prioridad, profundidad, token budget y fecha de parrilla.', tone: 'amber' as StatusTone },
  { title: 'Edicion critica', body: 'Anti-cliche, factualidad, voz y reglas internas.', tone: 'emerald' as StatusTone },
  { title: 'Publicacion', body: 'Moderacion humana, SEO, imagenes y versionado.', tone: 'violet' as StatusTone },
];

export const draftCopies = {
  base: {
    title: 'Borrador base',
    body: 'Una nota UMSA debe explicar qué dato entra, dónde vive, quién lo puede cambiar, cómo se prueba el backup y qué costo incluye el primer entregable.',
  },
  humanizado: {
    title: 'Borrador humanizado',
    body: 'Un archivo pesado en la base deja de ser detalle técnico cuando el cierre mensual tarda 18 segundos por consulta. La nota debe mostrar el flujo completo antes de pedir una decisión.',
  },
  seo: {
    title: 'Version SEO honesta',
    body: 'Tecnología abierta para pymes argentinas: título descriptivo, fuente primaria, estructura UMSA, meta title corto y payload JSON listo para publicar.',
  },
};

export const draftSeed: EditorialDraft[] = [
  {
    id: 'draft-topic-umsa-reactiva',
    topicId: 'topic-umsa-reactiva',
    variant: 'humanizado',
    status: 'borrador',
    title: draftCopies.humanizado.title,
    seoTitle: topicSeed[0].title,
    body: draftCopies.humanizado.body,
    notes: 'Generar nota UMSA antes de exportar el payload final.',
    updatedAt: '08:40',
  },
];

export const draftVersionSeed: DraftVersion[] = [
  {
    id: 'version-topic-umsa-reactiva-1',
    topicId: 'topic-umsa-reactiva',
    draftId: 'draft-topic-umsa-reactiva',
    version: 1,
    variant: 'humanizado',
    status: 'borrador',
    title: draftCopies.humanizado.title,
    seoTitle: topicSeed[0].title,
    body: draftCopies.humanizado.body,
    notes: 'Generar nota UMSA antes de exportar el payload final.',
    changeNote: 'Corte inicial del modelo UMSA cargado.',
    snapshotAt: '08:42',
    authorName: 'Editor UMSA Diaria',
  },
];

export const seoExperimentSeed: SeoExperiment[] = [
  {
    id: 'seo-topic-umsa-reactiva-1',
    topicId: 'topic-umsa-reactiva',
    title: 'ARCA y depósitos fiscales: stock y evidencia diaria',
    description: 'Guía técnica para preparar stock, CCTV, permisos y respaldo verificable en depósitos fiscales.',
    focusKeyword: 'depósitos fiscales ARCA',
    strategy: 'Discover',
    ctr: 4.8,
    impressions: 18200,
    selected: true,
    notes: 'Titular descriptivo con norma, sector y entregable técnico.',
  },
  {
    id: 'seo-topic-umsa-reactiva-2',
    topicId: 'topic-umsa-reactiva',
    title: 'Cómo preparar evidencia diaria para depósitos fiscales',
    description: 'Método operativo para unir registros, cámaras, permisos y backup antes de una auditoría.',
    focusKeyword: 'evidencia diaria depósitos fiscales',
    strategy: 'Busqueda',
    ctr: 3.2,
    impressions: 9400,
    selected: false,
    notes: 'Mejor para busqueda tradicional y evergreen.',
  },
  {
    id: 'seo-topic-umsa-evergreen-1',
    topicId: 'topic-umsa-evergreen',
    title: 'MinIO y PostgreSQL: archivos pesados sin romper la base',
    description: 'Explica cómo separar objetos, permisos y auditoría sin perder trazabilidad operativa.',
    focusKeyword: 'MinIO PostgreSQL',
    strategy: 'Busqueda',
    ctr: 2.9,
    impressions: 7300,
    selected: true,
    notes: 'Necesita fuente primaria antes de distribuir.',
  },
];

export const analyticsSeed: AnalyticsRecord[] = [
  {
    id: 'analytics-topic-umsa-reactiva-1',
    topicId: 'topic-umsa-reactiva',
    period: 'Últimos 7 días',
    trafficSource: 'discover',
    visits: 18420,
    averageReadSeconds: 112,
    ctaClicks: 246,
    shares: 118,
    comments: 17,
    conversionRate: 1.34,
    successCriteria: 'Lecturas sostenidas, scroll completo y descarga de payload JSON.',
    performanceScore: 86,
    learningNote: 'Mantener títulos con norma, sector y primer entregable verificable.',
  },
  {
    id: 'analytics-topic-umsa-evergreen-1',
    topicId: 'topic-umsa-evergreen',
    period: 'Últimos 14 días',
    trafficSource: 'organico',
    visits: 7300,
    averageReadSeconds: 96,
    ctaClicks: 88,
    shares: 41,
    comments: 9,
    conversionRate: 1.21,
    successCriteria: 'Búsqueda evergreen, consultas recurrentes y baja corrección técnica posterior.',
    performanceScore: 72,
    learningNote: 'Reforzar fuente primaria y schema con last-modified visible.',
  },
  {
    id: 'analytics-topic-umsa-empresa-1',
    topicId: 'topic-umsa-empresa',
    period: 'Últimos 30 días',
    trafficSource: 'newsletter',
    visits: 4200,
    averageReadSeconds: 74,
    ctaClicks: 52,
    shares: 22,
    comments: 3,
    conversionRate: 0.82,
    successCriteria: 'Reutilización de imágenes, descarga de prompts y trazabilidad visual.',
    performanceScore: 64,
    learningNote: 'El banco visual necesita miniaturas más claras y licencia visible.',
  },
];

export const evidenceSeed: EvidenceRecord[] = [
  {
    id: 'evidence-001',
    topicId: 'topic-umsa-reactiva',
    sourceName: 'ARCA normativa oficial',
    sourceUrl: 'https://www.argentina.gob.ar/arca',
    claim: 'La fuente normativa define obligaciones, responsables y alcance de control para operaciones fiscales.',
    status: 'validado',
    confidence: 86,
    notes: 'Usar como fuente primaria; citar fecha de consulta al publicar.',
  },
  {
    id: 'evidence-002',
    topicId: 'topic-umsa-reactiva',
    sourceName: 'PostgreSQL 17 Documentation',
    sourceUrl: 'https://www.postgresql.org/docs/17/',
    claim: 'PostgreSQL guarda registros estructurados, roles, estados y auditoría consultable.',
    status: 'validado',
    confidence: 88,
    notes: 'Fuente técnica primaria para explicar base relacional.',
  },
  {
    id: 'evidence-003',
    topicId: 'topic-umsa-reactiva',
    sourceName: 'MinIO Object Storage Documentation',
    sourceUrl: 'https://min.io/docs/minio/linux/index.html',
    claim: 'MinIO/S3 conserva objetos, metadatos y reglas de acceso para archivos pesados.',
    status: 'validado',
    confidence: 84,
    notes: 'Fuente técnica primaria para almacenamiento de evidencia.',
  },
  {
    id: 'evidence-004',
    topicId: 'topic-umsa-reactiva',
    sourceName: 'Metabase Documentation',
    sourceUrl: 'https://www.metabase.com/docs/latest/',
    claim: 'Metabase permite tableros y permisos de consulta sobre fuentes de datos auditables.',
    status: 'validado',
    confidence: 80,
    notes: 'Fuente técnica primaria para explicar tableros y consulta.',
  },
];

export const editorRuleSeed: EditorRule[] = [
  {
    id: 'rule-umsa-structure',
    title: 'Modelo UMSA Diaria',
    body: 'Usar lead de 60 a 85 palabras, H2 didácticos obligatorios, 4 fuentes primarias y cierre con acción verificable.',
    enabled: true,
  },
  {
    id: 'rule-umsa-invisible',
    title: 'Influencias invisibles',
    body: 'Aplicar referencias de voz sin nombrar autores referencia ni técnica editorial en el texto publicado.',
    enabled: true,
  },
  {
    id: 'rule-umsa-ortografia',
    title: 'Ortografía visible',
    body: 'Mantener tildes y eñes en título, resumen, contenido y metadata; solo el slug va en ASCII.',
    enabled: true,
  },
  {
    id: 'rule-listas',
    title: 'No listar por inercia',
    body: 'Usar lista solo cuando ordena informacion real.',
    enabled: true,
  },
  {
    id: 'rule-simetria',
    title: 'Romper simetria',
    body: 'Variar longitud de frases y evitar cierre mecanico.',
    enabled: true,
  },
  {
    id: 'rule-evidencia',
    title: 'Opinar con evidencia',
    body: 'Toda posicion fuerte debe tener fuente o dato.',
    enabled: true,
  },
  {
    id: 'rule-factualidad',
    title: 'Factualidad primero',
    body: 'Dato dudoso pasa a revision humana.',
    enabled: true,
  },
];

export const imagePromptSeed: ImagePrompt[] = [
  {
    id: 'img-001',
    title: 'Evidencia técnica UMSA',
    ratio: '16:9',
    status: 'Apto reutilización',
    prompt: 'Mesa técnica con monitor de tablero, documentos de auditoría y servidor compacto. Luz natural lateral, paleta rojo UMSA, negro, azul y gris claro, estilo editorial documental, sin texto incrustado ni logos comerciales.',
  },
  {
    id: 'img-002',
    title: 'Mapa de agenda semanal',
    ratio: '1:1',
    status: 'Requiere revision',
    prompt: 'Calendario impreso con notas adhesivas y fuentes marcadas. Fotografia realista, enfoque selectivo, tonos neutros con acento verde, composicion ordenada.',
  },
  {
    id: 'img-003',
    title: 'Archivo versionado',
    ratio: '4:3',
    status: 'Nuevo',
    prompt: 'Archivo digital con versiones y metadatos en pantalla. Entorno de redaccion, luz fria controlada, profundidad de campo baja, estilo producto editorial.',
  },
];

export const auditSeed: AuditEvent[] = [
  { id: 'audit-001', event: 'Tema priorizado', detail: 'Prioridad 94 por autoridad temática, volumen estable y baja duplicidad.', time: '08:12' },
  { id: 'audit-002', event: 'Regla anti-cliché aplicada', detail: 'Se eliminó estructura contrastiva y cierre genérico.', time: '08:19' },
  { id: 'audit-003', event: 'SEO verificado', detail: 'Título descriptivo, keyword principal y promesa alineada al cuerpo.', time: '08:27' },
  { id: 'audit-004', event: 'Revisión humana pendiente', detail: 'Debe validar montos y citar fuente antes de publicar.', time: '08:34' },
];

export const variableSeed: WorkflowVariable[] = [
  {
    id: 'var-site-id',
    key: 'site_id',
    value: 'ultimamilla',
    scope: 'sistema',
    description: 'Identificador editorial del sitio destino del modelo UMSA.',
    enabled: true,
  },
  {
    id: 'var-output-schema',
    key: 'output_schema',
    value: 'umsa_blog_post',
    scope: 'sistema',
    description: 'Schema JSON esperado para enchufar AI o publicar manualmente.',
    enabled: true,
  },
  {
    id: 'var-required-sources',
    key: 'required_sources',
    value: '4',
    scope: 'editor',
    description: 'Mínimo de fuentes primarias exigidas por nota UMSA.',
    enabled: true,
  },
  {
    id: 'var-slots',
    key: 'umsa_publication_slots',
    value: '07:00 reactiva, 12:00 evergreen, 17:00 caso',
    scope: 'agenda',
    description: 'Grilla diaria de UMSA Diaria con timezone -03:00.',
    enabled: true,
  },
  {
    id: 'var-endpoint',
    key: 'publication_endpoint',
    value: 'https://www.ultimamilla.com.ar/api/blog',
    scope: 'sistema',
    description: 'Endpoint destino documentado; EDITARRA local no hace POST externo.',
    enabled: true,
  },
  {
    id: 'var-exchange-rate',
    key: 'exchange_rate_ars_usd',
    value: 'pendiente de carga manual',
    scope: 'editor',
    description: 'Cotización para convertir costos USD a ARS antes de publicar.',
    enabled: true,
  },
  {
    id: 'var-protagonist',
    key: 'umsa_protagonist_pool',
    value: 'gerente de cooperativa eléctrica con internet rural',
    scope: 'editor',
    description: 'Protagonista cuyano rotativo para ejemplos de la nota.',
    enabled: true,
  },
  {
    id: 'var-depth',
    key: 'research_depth_default',
    value: 'Media',
    scope: 'agenda',
    description: 'Profundidad sugerida para temas nuevos antes de scoring.',
    enabled: true,
  },
  {
    id: 'var-token-cap',
    key: 'article_token_cap',
    value: '12000',
    scope: 'editor',
    description: 'Tope operativo para borradores largos antes de revision.',
    enabled: true,
  },
  {
    id: 'var-human-review',
    key: 'human_review_required',
    value: 'fuente_dudosa, publicado',
    scope: 'sistema',
    description: 'Estados o senales que bloquean publicacion automatica.',
    enabled: true,
  },
  {
    id: 'var-image-ratio',
    key: 'default_image_ratio',
    value: '16:9',
    scope: 'imagenes',
    description: 'Formato visual preferido para hero editorial.',
    enabled: false,
  },
];

export const readStoredState = (): PersistedEditarraState => (
  readStoredEditarraState<PersistedEditarraState>()
);

export const asRecord = (value: unknown): Record<string, any> => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}
);

export const stringValue = (value: unknown, fallback: string) => (
  typeof value === 'string' && value.trim().length > 0 ? value : fallback
);

export const stringList = (value: unknown, fallback: string[]) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }

  return fallback;
};

export const boundedNumber = (value: unknown, fallback: number, min = 0, max = 100) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? Math.min(max, Math.max(min, Math.round(numericValue))) : fallback;
};

export const hydrateEditorialProfile = (profile: Partial<EditorialProfile>, index = 0): EditorialProfile => {
  const fallback = editorialProfiles[index] || editorialProfiles[0];
  const source = asRecord(profile);
  const postingMode = ['manual', 'asistido', 'automatico'].includes(source.postingMode || source.posting_mode)
    ? (source.postingMode || source.posting_mode) as EditorialProfile['postingMode']
    : fallback.postingMode;

  return {
    id: stringValue(source.id, fallback.id || `perfil-${index}`),
    name: stringValue(source.name, fallback.name || 'Perfil editorial'),
    site: stringValue(source.site || source.domain || source.host_url, fallback.site),
    model: stringValue(source.model, fallback.model),
    cadence: stringValue(source.cadence, fallback.cadence),
    defaultAuthor: stringValue(source.defaultAuthor || source.default_author, fallback.defaultAuthor),
    sourceMinimum: boundedNumber(source.sourceMinimum || source.source_minimum || source.required_sources, fallback.sourceMinimum, 1, 12),
    endpoint: stringValue(source.endpoint || source.publication_endpoint, fallback.endpoint),
    publicationDestinationIds: stringList(
      source.publicationDestinationIds || source.publication_destination_ids,
      fallback.publicationDestinationIds || ['umsa-blog'],
    ),
    defaultPublicationDestinationId: stringValue(
      source.defaultPublicationDestinationId || source.default_publication_destination_id,
      fallback.defaultPublicationDestinationId || 'umsa-blog',
    ),
    postingMode,
    tone: stringValue(source.tone, fallback.tone),
    guardrails: stringList(source.guardrails, fallback.guardrails),
  };
};

export const hydrateEditorialProfiles = (profiles?: Partial<EditorialProfile>[]) => (
  profiles && profiles.length > 0 ? profiles.map(hydrateEditorialProfile) : editorialProfiles
);

export const hydrateAuthorInfluence = (influence: unknown, fallback: AuthorInfluence, index: number): AuthorInfluence => {
  const source = asRecord(influence);
  const relation = ['adherir', 'consultar', 'evitar'].includes(source.relation) ? source.relation as InfluenceRelation : fallback.relation;

  return {
    id: stringValue(source.id, fallback.id || `inf-${index}`),
    reference: stringValue(source.reference, fallback.reference || 'Referencia editorial'),
    relation,
    weight: boundedNumber(source.weight, fallback.weight || 60),
    notes: stringValue(source.notes, fallback.notes || 'Define como usar esta influencia.'),
  };
};

export const hydrateAuthor = (author: Partial<Author>, index = 0): Author => {
  const fallback = authorSeed[index] || authorSeed[0];
  const source = asRecord(author);
  const rawWeights = asRecord(source.styleWeights || source.style_weights);
  const styleWeights = (Object.keys(defaultStyleWeights) as StyleWeightKey[]).reduce((weights, key) => ({
    ...weights,
    [key]: boundedNumber(rawWeights[key], fallback.styleWeights[key] ?? defaultStyleWeights[key]),
  }), {} as Record<StyleWeightKey, number>);
  const fallbackInfluences = fallback.influences.length > 0 ? fallback.influences : authorSeed[0].influences;
  const rawInfluences = Array.isArray(source.influences) ? source.influences : fallbackInfluences;

  return {
    id: stringValue(source.id, fallback.id || `autor-${index}`),
    name: stringValue(source.name, fallback.name || 'Autor'),
    role: stringValue(source.role, fallback.role || 'Rol editorial'),
    active: typeof source.active === 'boolean' ? source.active : fallback.active ?? true,
    models: stringValue(source.models, fallback.models || 'writer: provider-agnostic'),
    tone: stringList(source.tone || source.tone_adjectives, fallback.tone),
    banned: stringList(source.banned || source.banned_words, fallback.banned),
    mix: stringValue(source.mix || source.topic_mix, fallback.mix || '50% notas breves, 50% explicadores'),
    score: boundedNumber(source.score, fallback.score || 70),
    voiceBrief: stringValue(source.voiceBrief || source.voice_brief, fallback.voiceBrief),
    register: stringValue(source.register, fallback.register),
    rhythm: stringValue(source.rhythm, fallback.rhythm),
    stance: stringValue(source.stance, fallback.stance),
    density: stringValue(source.density, fallback.density),
    locality: stringValue(source.locality, fallback.locality),
    influenceMode: stringValue(source.influenceMode || source.influence_mode, fallback.influenceMode),
    references: stringList(source.references || source.references_to_follow, fallback.references),
    antiReferences: stringList(source.antiReferences || source.references_to_avoid, fallback.antiReferences),
    styleWeights,
    influences: rawInfluences.map((influence, influenceIndex) => hydrateAuthorInfluence(
      influence,
      fallbackInfluences[influenceIndex] || fallbackInfluences[0],
      influenceIndex,
    )),
  };
};

export const hydrateAuthors = (authors?: Partial<Author>[]) => (
  authors && authors.length > 0 ? authors.map(hydrateAuthor) : authorSeed
);

export const hydrateTopic = (topic: Partial<Topic>, index = 0): Topic => {
  const fallback = topicSeed[index] || topicSeed[0];
  const source = asRecord(topic);
  const status = topicStatuses.includes(source.status) ? source.status as TopicStatus : fallback.status;
  const depthSource = source.depth || source.research_depth;
  const depth = topicDepths.includes(depthSource) ? depthSource as Topic['depth'] : fallback.depth;

  return {
    id: stringValue(source.id, fallback.id || `topic-${index}`),
    title: stringValue(source.title, fallback.title),
    status,
    priority: boundedNumber(source.priority, fallback.priority),
    depth,
    tokens: boundedNumber(source.tokens || source.token_budget, fallback.tokens, 1000, 50000),
    author: stringValue(source.author || source.author_name, fallback.author),
    source: stringValue(source.source || source.source_plan, fallback.source),
    narrative: stringValue(source.narrative || source.narrative_constraints, fallback.narrative),
    seo: stringValue(source.seo, fallback.seo),
    publishAt: stringValue(source.publishAt || source.publish_at, fallback.publishAt),
    agendaId: source.agendaId || source.agenda_id ? stringValue(source.agendaId || source.agenda_id, '') : fallback.agendaId,
    candidateId: source.candidateId || source.candidate_id ? stringValue(source.candidateId || source.candidate_id, '') : fallback.candidateId,
    destinationProfileId: source.destinationProfileId || source.destination_profile_id
      ? stringValue(source.destinationProfileId || source.destination_profile_id, '')
      : fallback.destinationProfileId,
    recipeId: source.recipeId || source.recipe_id ? stringValue(source.recipeId || source.recipe_id, '') as EditarraRecipeKey : fallback.recipeId,
    operationModeId: source.operationModeId || source.operation_mode_id
      ? stringValue(source.operationModeId || source.operation_mode_id, '')
      : fallback.operationModeId,
    trope: source.trope || source.tropo ? stringValue(source.trope || source.tropo, '') : fallback.trope,
    interests: source.interests || source.intereses ? stringList(source.interests || source.intereses, []) : fallback.interests,
    discoverySourceUrl: source.discoverySourceUrl || source.discovery_source_url
      ? stringValue(source.discoverySourceUrl || source.discovery_source_url, '')
      : fallback.discoverySourceUrl,
  };
};

export const hydrateTopics = (topics?: Partial<Topic>[]) => (
  topics && topics.length > 0 ? topics.map(hydrateTopic) : topicSeed
);

export const hydrateEditorialAgenda = (agenda: Partial<EditorialAgenda>, index = 0): EditorialAgenda => {
  const fallback = agendaSeed[index] || agendaSeed[0];
  const source = asRecord(agenda);
  const rawWeights = asRecord(source.scoringWeights || source.scoring_weights);
  const compatibleAuthors = stringList(source.compatibleAuthors || source.compatible_authors || source.authors, fallback.compatibleAuthors);
  const compatibleRecipes = stringList(source.compatibleRecipes || source.compatible_recipes || source.recipes, fallback.compatibleRecipes) as EditarraRecipeKey[];
  const compatibleOperationModes = stringList(
    source.compatibleOperationModes || source.compatible_operation_modes || source.modes,
    fallback.compatibleOperationModes,
  );
  const interests = stringList(source.interests || source.intereses, fallback.interests);
  const tropesToSeek = stringList(source.tropesToSeek || source.tropes_to_seek || source.tropos_buscados || source.tropes, fallback.tropesToSeek);
  const tropesToAvoid = stringList(source.tropesToAvoid || source.tropes_to_avoid || source.tropos_evitados, fallback.tropesToAvoid);
  const sourceUrls = stringList(source.sourceUrls || source.source_urls || source.urls_fuente || source.urls, fallback.sourceUrls);
  const publishingSlots = stringList(source.publishingSlots || source.publishing_slots || source.slots_publicacion, fallback.publishingSlots);

  return {
    id: stringValue(source.id || source._id, fallback.id || `agenda-${index}`),
    name: stringValue(source.name || source.nombre, fallback.name),
    destination: stringValue(source.destination || source.destino || source.destinationProfileId, fallback.destination),
    audience: stringValue(source.audience || source.audiencia, fallback.audience),
    compatibleAuthors: compatibleAuthors.length > 0 ? compatibleAuthors : fallback.compatibleAuthors,
    compatibleRecipes: compatibleRecipes.length > 0 ? compatibleRecipes : fallback.compatibleRecipes,
    compatibleOperationModes: compatibleOperationModes.length > 0 ? compatibleOperationModes : fallback.compatibleOperationModes,
    interests: interests.length > 0 ? interests : fallback.interests,
    tropesToSeek: tropesToSeek.length > 0 ? tropesToSeek : fallback.tropesToSeek,
    tropesToAvoid: tropesToAvoid.length > 0 ? tropesToAvoid : fallback.tropesToAvoid,
    sourceUrls: sourceUrls.length > 0 ? sourceUrls : fallback.sourceUrls,
    publishingSlots: publishingSlots.length > 0 ? publishingSlots : fallback.publishingSlots,
    scoringWeights: {
      interest: boundedNumber(rawWeights.interest, fallback.scoringWeights.interest),
      trope: boundedNumber(rawWeights.trope, fallback.scoringWeights.trope),
      source: boundedNumber(rawWeights.source, fallback.scoringWeights.source),
      avoidPenalty: boundedNumber(rawWeights.avoidPenalty || rawWeights.avoid_penalty || rawWeights.warningPenalty, fallback.scoringWeights.avoidPenalty),
    },
    createdAt: stringValue(source.createdAt || source.created_at, fallback.createdAt || 'local'),
    updatedAt: stringValue(source.updatedAt || source.updated_at, fallback.updatedAt || 'local'),
  };
};

export const hydrateEditorialAgendas = (agendas?: Partial<EditorialAgenda>[]) => (
  agendas && agendas.length > 0 ? agendas.map(hydrateEditorialAgenda) : agendaSeed
);

export const hydrateDiscoveryCandidate = (candidate: Partial<DiscoveryCandidate>, index = 0): DiscoveryCandidate => {
  const fallback = discoveryCandidateSeed[index] || discoveryCandidateSeed[0];
  const source = asRecord(candidate);
  const statusSource = source.status || source.estado;
  const status = discoveryCandidateStatuses.includes(statusSource)
    ? statusSource as DiscoveryCandidateStatus
    : fallback.status;

  return {
    id: stringValue(source.id || source._id, fallback.id || `candidate-${index}`),
    runId: stringValue(source.runId || source.run_id, fallback.runId || ''),
    runOrder: boundedNumber(source.runOrder ?? source.run_order, fallback.runOrder ?? index),
    agendaId: stringValue(source.agendaId || source.agenda_id, fallback.agendaId),
    title: stringValue(source.title || source.titulo, fallback.title),
    summary: stringValue(source.summary || source.resumen, fallback.summary),
    sourceName: stringValue(source.sourceName || source.source_name || source.fuente, fallback.sourceName),
    sourceUrl: stringValue(source.sourceUrl || source.source_url || source.url, fallback.sourceUrl),
    snippet: stringValue(source.snippet || source.evidence || source.evidencia, fallback.snippet),
    detectedTrope: stringValue(source.detectedTrope || source.detected_trope || source.trope || source.tropo_detectado, fallback.detectedTrope),
    matchedInterests: stringList(source.matchedInterests || source.matched_interests || source.interests || source.intereses, fallback.matchedInterests),
    recommendedAuthor: stringValue(source.recommendedAuthor || source.recommended_author || source.author, fallback.recommendedAuthor),
    recommendedRecipeId: stringValue(source.recommendedRecipeId || source.recommended_recipe_id || source.recipeId, fallback.recommendedRecipeId) as EditarraRecipeKey,
    recommendedOperationModeId: stringValue(
      source.recommendedOperationModeId || source.recommended_operation_mode_id || source.operationModeId,
      fallback.recommendedOperationModeId,
    ),
    score: boundedNumber(source.score || source.puntaje, fallback.score),
    warnings: stringList(source.warnings || source.advertencias, fallback.warnings),
    status,
    createdAt: stringValue(source.createdAt || source.created_at, fallback.createdAt || 'local'),
    updatedAt: stringValue(source.updatedAt || source.updated_at, fallback.updatedAt || 'local'),
  };
};

export const hydrateDiscoveryCandidates = (candidates?: Partial<DiscoveryCandidate>[]) => (
  candidates && candidates.length > 0 ? candidates.map(hydrateDiscoveryCandidate) : discoveryCandidateSeed
);

const hydrateDiscoveryRunSourceAudit = (source: unknown, fallbackKind: DiscoveryRunSourceAudit['kind']): DiscoveryRunSourceAudit => {
  const item = asRecord(source);
  const kindSource = item.kind || item.tipo;
  const kind = kindSource === 'semilla' || kindSource === 'expandida' ? kindSource as DiscoveryRunSourceAudit['kind'] : fallbackKind;

  return {
    url: stringValue(item.url || item.requestedUrl || item.requested_url, ''),
    resolvedUrl: stringValue(item.resolvedUrl || item.resolved_url, ''),
    host: stringValue(item.host || item.domain || item.dominio, ''),
    kind,
    ok: typeof item.ok === 'boolean' ? item.ok : false,
    status: item.status === null || typeof item.status === 'number' ? item.status as number | null : null,
    contentType: stringValue(item.contentType || item.content_type, ''),
    warnings: stringList(item.warnings || item.advertencias, []),
    error: stringValue(item.error, ''),
    candidateCount: boundedNumber(item.candidateCount || item.candidate_count, 0, 0, 500),
    maxCandidateScore: item.maxCandidateScore === null || item.max_candidate_score === null
      ? null
      : boundedNumber(item.maxCandidateScore || item.max_candidate_score, 0, 0, 100),
  };
};

const hydrateCandidateDistribution = (value: unknown): DiscoveryRun['candidateDistribution'] => {
  const source = asRecord(value);
  const byHost = asRecord(source.byHost || source.by_host);
  const bySourceUrl = asRecord(source.bySourceUrl || source.by_source_url);

  return {
    byHost: Object.fromEntries(Object.entries(byHost).map(([key, count]) => [key, boundedNumber(count, 0, 0, 500)])),
    bySourceUrl: Object.fromEntries(Object.entries(bySourceUrl).map(([key, count]) => [key, boundedNumber(count, 0, 0, 500)])),
    uniqueHosts: boundedNumber(source.uniqueHosts || source.unique_hosts, 0, 0, 500),
    maxCandidatesPerHost: boundedNumber(source.maxCandidatesPerHost || source.max_candidates_per_host, 0, 0, 50),
  };
};

export const hydrateDiscoveryRun = (run: Partial<DiscoveryRun>, index = 0): DiscoveryRun => {
  const source = asRecord(run);
  const statusSource = source.status || source.estado;
  const status = ['completo', 'parcial', 'fallido'].includes(statusSource)
    ? statusSource as DiscoveryRun['status']
    : 'completo';

  return {
    id: stringValue(source.id || source._id, `run-${index}`),
    agendaId: stringValue(source.agendaId || source.agenda_id, agendaSeed[0].id),
    query: stringValue(source.query || source.consulta, 'busqueda editorial'),
    urls: stringList(source.urls || source.consultedUrls || source.consulted_urls || source.urlsConsultadas, []),
    status,
    sourceCount: boundedNumber(source.sourceCount || source.source_count, 0, 0, 500),
    candidateCount: boundedNumber(source.candidateCount || source.candidate_count, 0, 0, 500),
    provider: source.provider ? stringValue(source.provider, '') : undefined,
    llmModel: source.llmModel || source.llm_model ? stringValue(source.llmModel || source.llm_model, '') : undefined,
    seedResults: Array.isArray(source.seedResults)
      ? source.seedResults.map((item) => hydrateDiscoveryRunSourceAudit(item, 'semilla'))
      : Array.isArray(source.seed_results)
        ? source.seed_results.map((item: unknown) => hydrateDiscoveryRunSourceAudit(item, 'semilla'))
        : [],
    expandedResults: Array.isArray(source.expandedResults)
      ? source.expandedResults.map((item) => hydrateDiscoveryRunSourceAudit(item, 'expandida'))
      : Array.isArray(source.expanded_results)
        ? source.expanded_results.map((item: unknown) => hydrateDiscoveryRunSourceAudit(item, 'expandida'))
        : [],
    candidateDistribution: hydrateCandidateDistribution(source.candidateDistribution || source.candidate_distribution),
    failedSources: Array.isArray(source.failedSources)
      ? source.failedSources.map((item) => hydrateDiscoveryRunSourceAudit(item, 'semilla'))
      : Array.isArray(source.failed_sources)
        ? source.failed_sources.map((item: unknown) => hydrateDiscoveryRunSourceAudit(item, 'semilla'))
        : [],
    warnings: stringList(source.warnings || source.advertencias, []),
    createdAt: stringValue(source.createdAt || source.created_at, 'local'),
    completedAt: stringValue(source.completedAt || source.completed_at || source.updatedAt || source.updated_at, 'local'),
  };
};

export const hydrateDiscoveryRuns = (runs?: Partial<DiscoveryRun>[]) => (
  runs && runs.length > 0 ? runs.map(hydrateDiscoveryRun) : []
);

export const hydrateWorkflowVariable = (variable: Partial<WorkflowVariable>, index = 0): WorkflowVariable => {
  const fallback = variableSeed[index] || variableSeed[0];
  const source = asRecord(variable);
  const scope = variableScopes.includes(source.scope) ? source.scope as VariableScope : fallback.scope;

  return {
    id: stringValue(source.id, fallback.id || `var-${index}`),
    key: stringValue(source.key, fallback.key),
    value: stringValue(source.value, fallback.value),
    scope,
    description: stringValue(source.description, fallback.description),
    enabled: typeof source.enabled === 'boolean' ? source.enabled : fallback.enabled,
  };
};

export const hydrateWorkflowVariables = (variables?: Partial<WorkflowVariable>[]) => (
  variables && variables.length > 0 ? variables.map(hydrateWorkflowVariable) : variableSeed
);

export const hydrateNoteVariableOverride = (override: Partial<NoteVariableOverride>, index = 0): NoteVariableOverride => {
  const source = asRecord(override);
  const recipeId = noteRecipes.some((recipe) => recipe.id === source.recipeId || recipe.id === source.recipe_id)
    ? (source.recipeId || source.recipe_id) as EditarraRecipeKey
    : 'reactiva';
  const key = stringValue(source.key, `variable_${index}`);

  return {
    id: stringValue(source.id, `note-var-${index}`),
    topicId: stringValue(source.topicId || source.topic_id, topicSeed[0].id),
    recipeId,
    key,
    value: stringValue(source.value, defaultNoteVariableValues[key] || ''),
    description: stringValue(source.description, 'Variable específica de esta nota.'),
    enabled: typeof source.enabled === 'boolean' ? source.enabled : true,
  };
};

export const hydrateNoteVariableOverrides = (overrides?: Partial<NoteVariableOverride>[]) => (
  overrides && overrides.length > 0 ? overrides.map(hydrateNoteVariableOverride) : []
);

export const hydrateImagePrompt = (image: Partial<ImagePrompt>, index = 0): ImagePrompt => {
  const fallback = imagePromptSeed[index] || imagePromptSeed[0];
  const source = asRecord(image);

  return {
    id: stringValue(source.id, fallback.id || `img-${index}`),
    title: stringValue(source.title, fallback.title),
    ratio: stringValue(source.ratio, fallback.ratio),
    status: stringValue(source.status, fallback.status),
    prompt: stringValue(source.prompt, fallback.prompt),
  };
};

export const hydrateImagePrompts = (images?: Partial<ImagePrompt>[]) => (
  Array.isArray(images) ? images.map(hydrateImagePrompt) : imagePromptSeed
);

export const hydrateEditorRule = (rule: Partial<EditorRule>, index = 0): EditorRule => {
  const fallback = editorRuleSeed[index] || editorRuleSeed[0];
  const source = asRecord(rule);

  return {
    id: stringValue(source.id, fallback.id || `rule-${index}`),
    title: stringValue(source.title, fallback.title),
    body: stringValue(source.body, fallback.body),
    enabled: typeof source.enabled === 'boolean' ? source.enabled : fallback.enabled,
  };
};

export const hydrateEditorRules = (rules?: Partial<EditorRule>[]) => (
  rules && rules.length > 0 ? rules.map(hydrateEditorRule) : editorRuleSeed
);

export const hydrateDraft = (draft: Partial<EditorialDraft>, index = 0): EditorialDraft => {
  const fallback = draftSeed[index] || draftSeed[0];
  const source = asRecord(draft);
  const variant = draftVariants.includes(source.variant) ? source.variant as DraftVariantKey : fallback.variant;
  const status = draftStatuses.includes(source.status) ? source.status as DraftStatus : fallback.status;

  return {
    id: stringValue(source.id, fallback.id || `draft-${index}`),
    topicId: stringValue(source.topicId || source.topic_id, fallback.topicId),
    variant,
    status,
    title: stringValue(source.title, fallback.title),
    seoTitle: stringValue(source.seoTitle || source.seo_title, fallback.seoTitle),
    body: stringValue(source.body, fallback.body),
    notes: stringValue(source.notes, fallback.notes),
    updatedAt: stringValue(source.updatedAt || source.updated_at, fallback.updatedAt),
  };
};

export const hydrateDrafts = (drafts?: Partial<EditorialDraft>[]) => (
  drafts && drafts.length > 0 ? drafts.map(hydrateDraft) : draftSeed
);

export const hydrateDraftVersion = (version: Partial<DraftVersion>, index = 0): DraftVersion => {
  const fallback = draftVersionSeed[index] || draftVersionSeed[0];
  const source = asRecord(version);
  const variant = draftVariants.includes(source.variant) ? source.variant as DraftVariantKey : fallback.variant;
  const status = draftStatuses.includes(source.status) ? source.status as DraftStatus : fallback.status;

  return {
    id: stringValue(source.id, fallback.id || `version-${index}`),
    topicId: stringValue(source.topicId || source.topic_id, fallback.topicId),
    draftId: stringValue(source.draftId || source.draft_id, fallback.draftId),
    version: boundedNumber(source.version, fallback.version || index + 1, 1, 999),
    variant,
    status,
    title: stringValue(source.title, fallback.title),
    seoTitle: stringValue(source.seoTitle || source.seo_title, fallback.seoTitle),
    body: stringValue(source.body, fallback.body),
    notes: stringValue(source.notes, fallback.notes),
    changeNote: stringValue(source.changeNote || source.change_note, fallback.changeNote),
    snapshotAt: stringValue(source.snapshotAt || source.snapshot_at, fallback.snapshotAt),
    authorName: stringValue(source.authorName || source.author_name, fallback.authorName),
  };
};

export const hydrateDraftVersions = (versions?: Partial<DraftVersion>[]) => (
  versions && versions.length > 0 ? versions.map(hydrateDraftVersion) : draftVersionSeed
);

export const hydrateSeoExperiment = (experiment: Partial<SeoExperiment>, index = 0): SeoExperiment => {
  const fallback = seoExperimentSeed[index] || seoExperimentSeed[0];
  const source = asRecord(experiment);
  const strategy = seoStrategies.includes(source.strategy) ? source.strategy as SeoStrategy : fallback.strategy;
  const title = stringValue(source.title, fallback.title);
  const focusKeyword = stringValue(source.focusKeyword || source.focus_keyword, fallback.focusKeyword);
  const rawDescription = stringValue(source.description, fallback.description);
  const rawNotes = stringValue(source.notes, fallback.notes);

  return sanitizeSeoExperiment({
    id: stringValue(source.id, fallback.id || `seo-${index}`),
    topicId: stringValue(source.topicId || source.topic_id, fallback.topicId),
    title,
    description: rawDescription,
    focusKeyword,
    strategy,
    ctr: boundedNumber(source.ctr, fallback.ctr, 0, 100),
    impressions: boundedNumber(source.impressions, fallback.impressions, 0, 999999999),
    selected: typeof source.selected === 'boolean' ? source.selected : fallback.selected,
    notes: rawNotes,
  });
};

export const hydrateSeoExperiments = (experiments?: Partial<SeoExperiment>[]) => (
  experiments && experiments.length > 0 ? experiments.map(hydrateSeoExperiment) : seoExperimentSeed
);

export const hydrateAnalyticsRecord = (record: Partial<AnalyticsRecord>, index = 0): AnalyticsRecord => {
  const fallback = analyticsSeed[index] || analyticsSeed[0];
  const source = asRecord(record);
  const trafficSource = trafficSources.includes(source.trafficSource || source.traffic_source)
    ? (source.trafficSource || source.traffic_source) as TrafficSource
    : fallback.trafficSource;

  return {
    id: stringValue(source.id, fallback.id || `analytics-${index}`),
    topicId: stringValue(source.topicId || source.topic_id, fallback.topicId),
    period: stringValue(source.period, fallback.period),
    trafficSource,
    visits: boundedNumber(source.visits, fallback.visits, 0, 999999999),
    averageReadSeconds: boundedNumber(source.averageReadSeconds || source.average_read_seconds, fallback.averageReadSeconds, 0, 3600),
    ctaClicks: boundedNumber(source.ctaClicks || source.cta_clicks, fallback.ctaClicks, 0, 999999999),
    shares: boundedNumber(source.shares, fallback.shares, 0, 999999999),
    comments: boundedNumber(source.comments, fallback.comments, 0, 999999999),
    conversionRate: boundedNumber(source.conversionRate || source.conversion_rate, fallback.conversionRate, 0, 100),
    successCriteria: stringValue(source.successCriteria || source.success_criteria, fallback.successCriteria),
    performanceScore: boundedNumber(source.performanceScore || source.performance_score, fallback.performanceScore, 0, 100),
    learningNote: stringValue(source.learningNote || source.learning_note, fallback.learningNote),
  };
};

export const hydrateAnalyticsRecords = (records?: Partial<AnalyticsRecord>[]) => (
  records && records.length > 0 ? records.map(hydrateAnalyticsRecord) : analyticsSeed
);

export const hydrateEvidenceRecord = (record: Partial<EvidenceRecord>, index = 0): EvidenceRecord => {
  const fallback = evidenceSeed[index] || evidenceSeed[0];
  const source = asRecord(record);
  const status = evidenceStatuses.includes(source.status) ? source.status as EvidenceStatus : fallback.status;

  return {
    id: stringValue(source.id, fallback.id || `evidence-${index}`),
    topicId: stringValue(source.topicId || source.topic_id, fallback.topicId),
    sourceName: stringValue(source.sourceName || source.source_name, fallback.sourceName),
    sourceUrl: stringValue(source.sourceUrl || source.source_url, fallback.sourceUrl),
    claim: stringValue(source.claim, fallback.claim),
    status,
    confidence: boundedNumber(source.confidence, fallback.confidence, 0, 100),
    notes: stringValue(source.notes, fallback.notes),
  };
};

export const hydrateEvidence = (records?: Partial<EvidenceRecord>[]) => (
  records && records.length > 0 ? records.map(hydrateEvidenceRecord) : evidenceSeed
);

export const hydrateAuditEvent = (event: Partial<AuditEvent>, index = 0): AuditEvent => {
  const fallback = auditSeed[index] || auditSeed[0];
  const source = asRecord(event);

  return {
    id: stringValue(source.id, fallback.id || `audit-${index}`),
    event: stringValue(source.event, fallback.event),
    detail: stringValue(source.detail, fallback.detail),
    time: stringValue(source.time, fallback.time),
  };
};

export const hydrateAuditEvents = (events?: Partial<AuditEvent>[]) => (
  events && events.length > 0 ? events.map(hydrateAuditEvent) : auditSeed
);

export const hydrateGuidedRunRecord = (record: Partial<GuidedRunRecord>, index = 0): GuidedRunRecord => {
  const source = asRecord(record);
  const importedRecipeId = stringValue(source.recipeId || source.recipe_id, '');
  const recipeId = noteRecipes.some((recipe) => recipe.id === importedRecipeId) ? importedRecipeId as EditarraRecipeKey : 'reactiva';
  const status = ['pausado', 'bloqueado', 'completo'].includes(source.status) ? source.status as GuidedRunRecord['status'] : 'pausado';

  return {
    id: stringValue(source.id, `guided-run-${index}`),
    topicId: stringValue(source.topicId || source.topic_id, topicSeed[0].id),
    recipeId,
    profileId: stringValue(source.profileId || source.profile_id, editorialProfiles[0].id),
    status,
    steps: stringList(source.steps, []),
    nextControl: stringValue(source.nextControl || source.next_control, 'Revisar flujo guiado'),
    summary: stringValue(source.summary, 'Corrida guiada importada.'),
    time: stringValue(source.time, 'sin hora'),
  };
};

export const hydrateGuidedRunRecords = (records?: Partial<GuidedRunRecord>[]) => (
  records && records.length > 0 ? records.map(hydrateGuidedRunRecord) : []
);

export const hydrateMissionPreset = (preset: Partial<EditarraMissionPreset>, index = 0): EditarraMissionPreset => {
  const source = asRecord(preset);
  const importedRecipeId = stringValue(source.recipeId || source.recipe_id, '');
  const recipe = noteRecipes.find((item) => item.id === importedRecipeId) || noteRecipes[0];
  const rawVariables = Array.isArray(source.variables) ? source.variables : [];

  return {
    id: stringValue(source.id, `mission-preset-${index}`),
    name: stringValue(source.name, `Preset de misión ${index + 1}`),
    profileId: stringValue(source.profileId || source.profile_id, editorialProfiles[0].id),
    profileName: stringValue(source.profileName || source.profile_name, editorialProfiles[0].name),
    recipeId: recipe.id,
    recipeLabel: stringValue(source.recipeLabel || source.recipe_label, recipe.label),
    authorName: stringValue(source.authorName || source.author_name, authorSeed[0].name),
    intent: stringValue(source.intent, recipe.intent),
    sourcePlan: stringValue(source.sourcePlan || source.source_plan, recipe.sourcePlan),
    structure: stringList(source.structure, []),
    sourceChecklist: stringList(source.sourceChecklist || source.source_checklist, []),
    voiceBrief: stringValue(source.voiceBrief || source.voice_brief, authorSeed[0].voiceBrief),
    influenceMode: stringValue(source.influenceMode || source.influence_mode, authorSeed[0].influenceMode),
    variables: rawVariables.map((variable, variableIndex) => {
      const variableSource = asRecord(variable);
      const key = stringValue(variableSource.key, recipe.variableKeys[variableIndex] || `variable_${variableIndex + 1}`);

      return {
        key,
        value: stringValue(variableSource.value, defaultNoteVariableValues[key] || ''),
        description: stringValue(variableSource.description, 'Variable guardada en preset de misión.'),
        enabled: typeof variableSource.enabled === 'boolean' ? variableSource.enabled : true,
      };
    }),
    createdAt: stringValue(source.createdAt || source.created_at, 'sin hora'),
  };
};

export const hydrateMissionPresets = (presets?: Partial<EditarraMissionPreset>[]) => (
  presets && presets.length > 0 ? presets.map(hydrateMissionPreset) : []
);

export const hydrateDistributionActions = (actions: unknown): DistributionActions | undefined => {
  const source = asRecord(actions);
  const entries = Object.entries(source).filter(([, value]) => (
    value === 'pendiente' || value === 'copiado' || value === 'enviado'
  ));

  return entries.length > 0 ? Object.fromEntries(entries) as DistributionActions : undefined;
};

export const productionHydrators: EditarraProductionHydrators = {
  hydrateDrafts,
  hydrateDraftVersions,
  hydrateSeoExperiments,
  hydrateAnalyticsRecords,
  hydrateEvidence,
  hydrateGuidedRunRecords,
};

export const normalizeImportedState = (rawState: unknown): PersistedEditarraState => {
  const source = asRecord(rawState);
  const automationRecipe = asRecord(source.active_automation_recipe || source.automation_recipe || (
    source.product === 'editarra' && source.executionMode === 'manual-json-copy' && (source.recommendedCommand || source.runId)
      ? source
      : {}
  ));
  const contract = asRecord(source.operational_contract || (
    source.product === 'editarra' && source.executionMode === 'manual-json-copy' && !automationRecipe.recommendedCommand ? source : {}
  ));
  const contractProfile = asRecord(contract.activeProfile);
  const contractRecipe = asRecord(contract.activeRecipe);
  const contractNote = asRecord(contract.activeNote);
  const automationProfile = asRecord(automationRecipe.profile);
  const automationRecipeDescriptor = asRecord(automationRecipe.recipe);
  const automationTopic = asRecord(automationRecipe.topic);
  const automationCommand = asRecord(automationRecipe.recommendedCommand);
  const importProfile = Object.keys(contractProfile).length > 0 ? contractProfile : automationProfile;
  const importRecipe = Object.keys(contractRecipe).length > 0 ? contractRecipe : automationRecipeDescriptor;
  const importNote = Object.keys(contractNote).length > 0 ? contractNote : automationTopic;
  const importQueue = Array.isArray(contract.queue)
    ? contract.queue
    : Array.isArray(automationRecipe.queue)
      ? automationRecipe.queue
      : undefined;
  const importVariables = Array.isArray(contract.criticalVariables)
    ? contract.criticalVariables
    : Array.isArray(automationRecipe.criticalVariables)
      ? automationRecipe.criticalVariables
      : undefined;
  const contractVariables = importVariables
    ? importVariables.map((variable: unknown, index: number) => {
        const item = asRecord(variable);
        const key = stringValue(item.key, `contract_variable_${index + 1}`);

        return {
          id: stringValue(item.id, `contract-var-${key}`),
          key,
          value: stringValue(item.value, ''),
          scope: stringValue(item.scope, item.source === 'nota' ? 'editor' : 'sistema'),
          description: stringValue(item.description, `Variable importada desde paquete operativo (${stringValue(item.source, 'contrato')}).`),
          enabled: item.enabled !== false,
        };
      })
    : undefined;
  const hostUrl = stringValue(source.host_url || source.domain, '');
  const siteFromHost = editorialProfiles.find((profile) => profile.site.toLowerCase() === hostUrl.toLowerCase());
  const selectedSiteId = stringValue(source.selectedSiteId || importProfile.id || siteFromHost?.id, '');
  const importedRecipeId = stringValue(source.selectedRecipeId || source.selected_recipe_id || source.recipe_id || importRecipe.id, '');
  const selectedRecipeId = noteRecipes.some((recipe) => recipe.id === importedRecipeId) ? importedRecipeId as EditarraRecipeKey : undefined;
  const importedOperationModeId = stringValue(source.selectedOperationModeId || source.selected_operation_mode_id, '');
  const selectedOperationModeId = operationModes.some((mode) => mode.id === importedOperationModeId) ? importedOperationModeId : undefined;
  const importedCandidateStatusFilter = source.candidateStatusFilter || source.candidate_status_filter;
  const importedCandidateRunScope = source.candidateRunScope || source.candidate_run_scope;
  const importedPackageFileKey = stringValue(source.packageFileKey || source.package_file_key, '');
  const reusableImageIds = source.reusableImages || source.reusable_images || source.reusable_image_ids;
  const hasReusableImageIds = Array.isArray(reusableImageIds) || typeof reusableImageIds === 'string';

  return {
    selectedSiteId: selectedSiteId || undefined,
    selectedRecipeId,
    selectedOperationModeId,
    selectedPublicationDestinationId: stringValue(
      source.selectedPublicationDestinationId || source.selected_publication_destination_id,
      '',
    ) || undefined,
    selectedTopicId: stringValue(source.selectedTopicId || source.selected_topic_id, '') || undefined,
    selectedAgendaId: stringValue(source.selectedAgendaId || source.selected_agenda_id, '') || undefined,
    candidateStatusFilter: discoveryCandidateStatuses.includes(importedCandidateStatusFilter)
      ? importedCandidateStatusFilter as DiscoveryCandidateStatus
      : importedCandidateStatusFilter === 'todos'
        ? 'todos'
        : undefined,
    candidateRunScope: importedCandidateRunScope === 'historico' || importedCandidateRunScope === 'ultimo_run'
      ? importedCandidateRunScope
      : undefined,
    packageFileKey: packageFileKeys.includes(importedPackageFileKey as EditorialPackageFileKey)
      ? importedPackageFileKey as EditorialPackageFileKey
      : undefined,
    profiles: Array.isArray(source.profiles)
      ? source.profiles
      : Array.isArray(source.editorial_profiles)
        ? source.editorial_profiles
        : undefined,
    authors: Array.isArray(source.authors) ? source.authors : undefined,
    topics: Array.isArray(source.topics)
      ? source.topics
      : importNote.title
        ? [{
            id: stringValue(importNote.topicId || importNote.topic_id || importNote.id, 'topic-contract'),
            title: stringValue(importNote.title, 'Nota importada desde paquete operativo'),
            status: stringValue(importNote.status, 'redaccion'),
            priority: 80,
            depth: 'Media',
            tokens: 9000,
            author: 'Editor UMSA Diaria',
            source: automationRecipe.recommendedCommand ? 'automation_recipe.json' : 'operational_contract.json',
            narrative: stringValue(contract.nextOperatorAction || automationCommand.reason, 'Retomar desde paquete operativo importado.'),
            seo: `Keyword principal: ${stringValue(importNote.title, 'editarra').slice(0, 64)}`,
            publishAt: 'sin programar',
          }]
        : undefined,
    editorialAgendas: Array.isArray(source.editorialAgendas)
      ? source.editorialAgendas
      : Array.isArray(source.editorial_agendas)
        ? source.editorial_agendas
        : Array.isArray(source.agendas)
          ? source.agendas
          : undefined,
    discoveryCandidates: Array.isArray(source.discoveryCandidates)
      ? source.discoveryCandidates
      : Array.isArray(source.discovery_candidates)
        ? source.discovery_candidates
        : Array.isArray(source.candidates)
          ? source.candidates
          : undefined,
    discoveryRuns: Array.isArray(source.discoveryRuns)
      ? source.discoveryRuns
      : Array.isArray(source.discovery_runs)
        ? source.discovery_runs
        : Array.isArray(source.runs)
          ? source.runs
          : undefined,
    reusableImages: hasReusableImageIds ? stringList(reusableImageIds, []) : undefined,
    workflowVariables: Array.isArray(source.workflowVariables)
      ? source.workflowVariables
      : Array.isArray(source.variables)
        ? source.variables
        : contractVariables,
    noteVariableOverrides: Array.isArray(source.noteVariableOverrides)
      ? source.noteVariableOverrides
      : Array.isArray(source.note_variable_overrides)
        ? source.note_variable_overrides
        : undefined,
    missionPresets: Array.isArray(source.missionPresets)
      ? source.missionPresets
      : Array.isArray(source.mission_presets)
        ? source.mission_presets
        : undefined,
    imagePrompts: Array.isArray(source.imagePrompts)
      ? source.imagePrompts
      : Array.isArray(source.image_prompts)
        ? source.image_prompts
        : undefined,
    editorRules: Array.isArray(source.editorRules)
      ? source.editorRules
      : Array.isArray(source.editor_rules)
        ? source.editor_rules
        : undefined,
    drafts: Array.isArray(source.drafts) ? source.drafts : undefined,
    seoExperiments: Array.isArray(source.seoExperiments)
      ? source.seoExperiments
      : Array.isArray(source.seo_experiments)
        ? source.seo_experiments
        : undefined,
    analyticsRecords: Array.isArray(source.analyticsRecords)
      ? source.analyticsRecords
      : Array.isArray(source.analytics)
        ? source.analytics
        : Array.isArray(source.analytics_report)
          ? source.analytics_report
          : undefined,
    evidence: Array.isArray(source.evidence)
      ? source.evidence
      : Array.isArray(source.evidence_log)
        ? source.evidence_log
        : undefined,
    draftVersions: Array.isArray(source.draftVersions)
      ? source.draftVersions
      : Array.isArray(source.revision_history)
        ? source.revision_history
        : undefined,
    auditEvents: Array.isArray(source.auditEvents)
      ? source.auditEvents
      : Array.isArray(source.audit_log)
        ? source.audit_log
        : undefined,
    guidedRunRecords: Array.isArray(source.guidedRunRecords)
      ? source.guidedRunRecords
      : Array.isArray(source.guided_runs)
        ? source.guided_runs
        : importQueue?.map((run: unknown) => {
          const item = asRecord(run);

          return {
            id: stringValue(item.id, `contract-run-${stringValue(item.topicId || item.topic_id, 'topic')}`),
            topic_id: stringValue(item.topicId || item.topic_id, importNote.topicId || importNote.topic_id || importNote.id || 'topic-contract'),
            recipe_id: selectedRecipeId || 'reactiva',
            profile_id: selectedSiteId || editorialProfiles[0].id,
            status: stringValue(item.status, 'pausado'),
            steps: [stringValue(item.stage, 'contrato operativo')],
            next_control: stringValue(item.action || item.actionLabel || item.action_label || item.nextControl || item.next_control, importNote.title ? stringValue(importNote.nextControl || importNote.next_control || automationCommand.label, 'Revisar paquete operativo') : 'Revisar paquete operativo'),
            summary: stringValue(item.title || item.topicTitle || item.topic_title, stringValue(importNote.title, 'Corrida importada desde paquete operativo')),
            time: 'contrato',
          };
        }),
    distributionActions: hydrateDistributionActions(source.distributionActions || source.distribution_actions),
  };
};

export const buildImportedEditarraState = ({
  rawJson,
  currentProfiles,
  now = new Date(),
}: {
  rawJson: string;
  currentProfiles: EditorialProfile[];
  now?: Date;
}): EditarraImportResult => {
  try {
    const normalizedState = normalizeImportedState(JSON.parse(rawJson));
    const productionPatch: Partial<EditarraProductionState> = {};
    const importedProfiles = normalizedState.profiles
      ? hydrateEditorialProfiles(normalizedState.profiles)
      : undefined;
    const profilePool = importedProfiles || currentProfiles;
    const selectedSiteId = importedProfiles
      ? (
          normalizedState.selectedSiteId && importedProfiles.some((profile) => profile.id === normalizedState.selectedSiteId)
            ? normalizedState.selectedSiteId
            : importedProfiles[0]?.id || editorialProfiles[0].id
        )
      : normalizedState.selectedSiteId && currentProfiles.some((profile) => profile.id === normalizedState.selectedSiteId)
        ? normalizedState.selectedSiteId
        : undefined;
    const selectedProfile = profilePool.find((profile) => profile.id === selectedSiteId);
    const selectedPublicationDestinationId = (() => {
      const allowedDestinationIds = selectedProfile?.publicationDestinationIds || [];
      if (
        normalizedState.selectedPublicationDestinationId
        && allowedDestinationIds.includes(normalizedState.selectedPublicationDestinationId)
      ) {
        return normalizedState.selectedPublicationDestinationId;
      }

      return selectedProfile?.defaultPublicationDestinationId
        && allowedDestinationIds.includes(selectedProfile.defaultPublicationDestinationId)
        ? selectedProfile.defaultPublicationDestinationId
        : allowedDestinationIds[0];
    })();

    if (normalizedState.drafts) {
      productionPatch.drafts = hydrateDrafts(normalizedState.drafts);
    }

    if (normalizedState.seoExperiments) {
      productionPatch.seoExperiments = hydrateSeoExperiments(normalizedState.seoExperiments);
    }

    if (normalizedState.analyticsRecords) {
      productionPatch.analyticsRecords = hydrateAnalyticsRecords(normalizedState.analyticsRecords);
    }

    if (normalizedState.draftVersions) {
      productionPatch.draftVersions = hydrateDraftVersions(normalizedState.draftVersions);
    }

    if (normalizedState.evidence) {
      productionPatch.evidence = hydrateEvidence(normalizedState.evidence);
    }

    if (normalizedState.guidedRunRecords) {
      productionPatch.guidedRunRecords = hydrateGuidedRunRecords(normalizedState.guidedRunRecords);
    }

    if (normalizedState.distributionActions) {
      productionPatch.distributionActions = normalizedState.distributionActions;
    }

    const importedTopics = normalizedState.topics ? hydrateTopics(normalizedState.topics) : undefined;
    const selectedTopicId = importedTopics
      ? (
          normalizedState.selectedTopicId && importedTopics.some((topic) => topic.id === normalizedState.selectedTopicId)
            ? normalizedState.selectedTopicId
            : importedTopics[0]?.id
        )
      : undefined;
    const importedAgendas = normalizedState.editorialAgendas
      ? hydrateEditorialAgendas(normalizedState.editorialAgendas)
      : undefined;
    const selectedAgendaId = importedAgendas
      ? (
          normalizedState.selectedAgendaId && importedAgendas.some((agenda) => agenda.id === normalizedState.selectedAgendaId)
            ? normalizedState.selectedAgendaId
            : importedAgendas[0]?.id
        )
      : undefined;

    return {
      ok: true,
      import: {
        profiles: importedProfiles,
        selectedSiteId,
        selectedRecipeId: normalizedState.selectedRecipeId,
        selectedOperationModeId: normalizedState.selectedOperationModeId,
        selectedPublicationDestinationId,
        authors: normalizedState.authors ? hydrateAuthors(normalizedState.authors) : undefined,
        topics: importedTopics,
        selectedTopicId,
        editorialAgendas: importedAgendas,
        selectedAgendaId,
        discoveryCandidates: normalizedState.discoveryCandidates ? hydrateDiscoveryCandidates(normalizedState.discoveryCandidates) : undefined,
        discoveryRuns: normalizedState.discoveryRuns ? hydrateDiscoveryRuns(normalizedState.discoveryRuns) : undefined,
        candidateStatusFilter: normalizedState.candidateStatusFilter,
        candidateRunScope: normalizedState.candidateRunScope,
        workflowVariables: normalizedState.workflowVariables ? hydrateWorkflowVariables(normalizedState.workflowVariables) : undefined,
        noteVariableOverrides: normalizedState.noteVariableOverrides ? hydrateNoteVariableOverrides(normalizedState.noteVariableOverrides) : undefined,
        missionPresets: normalizedState.missionPresets ? hydrateMissionPresets(normalizedState.missionPresets) : undefined,
        imagePrompts: normalizedState.imagePrompts ? hydrateImagePrompts(normalizedState.imagePrompts) : undefined,
        editorRules: normalizedState.editorRules ? hydrateEditorRules(normalizedState.editorRules) : undefined,
        auditEvents: normalizedState.auditEvents ? hydrateAuditEvents(normalizedState.auditEvents) : undefined,
        reusableImages: normalizedState.reusableImages,
        packageFileKey: normalizedState.packageFileKey,
        productionPatch,
        shouldShowExport: true,
        importStatus: `Config importada ${now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}.`,
        draftStatusMessage: 'Borradores y auditoria sincronizados desde JSON.',
      },
    };
  } catch {
    return {
      ok: false,
      importStatus: 'JSON invalido. Revisa comas, comillas y estructura antes de importar.',
    };
  }
};

export const buildEditarraResetBaseline = (): EditarraResetBaseline => ({
  profiles: editorialProfiles,
  selectedSiteId: editorialProfiles[0].id,
  selectedRecipeId: 'reactiva',
  selectedOperationModeId: operationModes[0].id,
  selectedPublicationDestinationId: editorialProfiles[0].defaultPublicationDestinationId || 'umsa-blog',
  authors: authorSeed,
  topics: topicSeed,
  selectedTopicId: topicSeed[0].id,
  editorialAgendas: agendaSeed,
  selectedAgendaId: agendaSeed[0].id,
  discoveryCandidates: discoveryCandidateSeed,
  discoveryRuns: [],
  candidateStatusFilter: 'todos',
  candidateRunScope: 'ultimo_run',
  reusableImages: ['img-001'],
  workflowVariables: variableSeed,
  noteVariableOverrides: [],
  missionPresets: [],
  imagePrompts: imagePromptSeed,
  editorRules: editorRuleSeed,
  productionPatch: {
    drafts: draftSeed,
    draftVersions: draftVersionSeed,
    seoExperiments: seoExperimentSeed,
    analyticsRecords: analyticsSeed,
    evidence: evidenceSeed,
    guidedRunRecords: [],
    distributionActions: {},
  },
  auditEvents: auditSeed,
  query: '',
  statusFilter: 'todos',
  importBuffer: '',
  showExport: false,
  importStatus: 'Config base restaurada.',
  draftStatusMessage: 'Borrador base restaurado.',
  packageFileKey: 'article.md',
  packageStatus: 'Paquete base restaurado.',
  batchStatus: 'Lote base restaurado.',
  distributionStatus: 'Cola base restaurada.',
  guidedFlowStatus: 'Flujo asistido listo; avanza hasta el próximo control humano.',
});
