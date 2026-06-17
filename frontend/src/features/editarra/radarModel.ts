import type { EditorialProfile, EditarraRecipeKey, EditorialOperationMode } from './profileModel';
import type { Author, Topic } from './workspaceModel';

export type DiscoveryCandidateStatus = 'descubierto' | 'preseleccionado' | 'convertido' | 'descartado';
export const discoveryCandidateStatuses: DiscoveryCandidateStatus[] = ['descubierto', 'preseleccionado', 'convertido', 'descartado'];

export type EditorialAgenda = {
  id: string;
  name: string;
  destination: string;
  audience: string;
  compatibleAuthors: string[];
  compatibleRecipes: EditarraRecipeKey[];
  compatibleOperationModes: string[];
  interests: string[];
  tropesToSeek: string[];
  tropesToAvoid: string[];
  sourceUrls: string[];
  publishingSlots: string[];
  scoringWeights: {
    interest: number;
    trope: number;
    source: number;
    avoidPenalty: number;
  };
  createdAt?: string;
  updatedAt?: string;
};

export type DiscoveryCandidate = {
  id: string;
  runId?: string;
  runOrder?: number;
  agendaId: string;
  title: string;
  summary: string;
  sourceName: string;
  sourceUrl: string;
  snippet: string;
  detectedTrope: string;
  matchedInterests: string[];
  recommendedAuthor: string;
  recommendedRecipeId: EditarraRecipeKey;
  recommendedOperationModeId: string;
  score: number;
  warnings: string[];
  status: DiscoveryCandidateStatus;
  createdAt?: string;
  updatedAt?: string;
};

export type DiscoveryRunSourceAudit = {
  url: string;
  resolvedUrl?: string;
  host?: string;
  kind: 'semilla' | 'expandida';
  ok: boolean;
  status?: number | null;
  contentType?: string;
  warnings: string[];
  error?: string;
  candidateCount: number;
  maxCandidateScore?: number | null;
};

export type DiscoveryRun = {
  id: string;
  agendaId: string;
  query: string;
  urls: string[];
  status: 'completo' | 'parcial' | 'fallido';
  sourceCount: number;
  candidateCount: number;
  provider?: string;
  llmModel?: string | null;
  seedResults?: DiscoveryRunSourceAudit[];
  expandedResults?: DiscoveryRunSourceAudit[];
  candidateDistribution?: {
    byHost?: Record<string, number>;
    bySourceUrl?: Record<string, number>;
    uniqueHosts?: number;
    maxCandidatesPerHost?: number;
  };
  failedSources?: DiscoveryRunSourceAudit[];
  warnings: string[];
  createdAt: string;
  completedAt: string;
};

export type DiscoveryRequestPayload = {
  product: 'editarra';
  file: 'discovery_request.json';
  agenda: EditorialAgenda;
  query: string;
  expectedOutput: 'discovery_results.json';
  candidateSchema: Array<keyof DiscoveryCandidate>;
};

export type SourceResearchPromptPayload = {
  product: 'editarra';
  file: 'source_research_prompt.md';
  agendaId: string;
  agendaName: string;
  prompt: string;
};

export type DiscoveryResultsPayload = {
  candidates?: Partial<DiscoveryCandidate>[];
  discovery_candidates?: Partial<DiscoveryCandidate>[];
};

const nowIso = () => new Date().toISOString();
const compactId = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
export const listToTextarea = (items: string[]) => items.join('\n');
export const textareaToList = (value: string) => value.split('\n').map((item) => item.trim()).filter(Boolean);
export const parseSourceUrlsInput = (value: string) => {
  const matches = Array.from(value.matchAll(/https?:\/\/[^\s<>"')\]]+/gi))
    .map((match) => match[0].replace(/[),.;:!?]+$/g, ''))
    .filter(Boolean);

  if (matches.length > 0) {
    return Array.from(new Set(matches));
  }

  return textareaToList(value);
};

export const scoreDiscoveryText = (
  agenda: EditorialAgenda,
  text: string,
  query = '',
) => {
  const lower = text.toLowerCase();
  const matchedInterests = agenda.interests.filter((interest) => lower.includes(interest.toLowerCase()));
  const matchedTropes = agenda.tropesToSeek.filter((trope) => lower.includes(trope.toLowerCase()));
  const avoidedTropes = agenda.tropesToAvoid.filter((trope) => lower.includes(trope.toLowerCase()));
  const queryBonus = query.trim() && lower.includes(query.trim().toLowerCase()) ? 10 : 0;
  const rawScore = 42
    + queryBonus
    + (matchedInterests.length * agenda.scoringWeights.interest)
    + (Math.min(1, matchedTropes.length) * agenda.scoringWeights.trope)
    - (avoidedTropes.length * agenda.scoringWeights.avoidPenalty);

  return {
    score: Math.max(0, Math.min(100, Math.round(rawScore))),
    matchedInterests,
    matchedTropes,
    avoidedTropes,
  };
};

export const agendaSeed: EditorialAgenda[] = [
  {
    id: 'agenda-umsa-diaria',
    name: 'UMSA Diaria - Tecnologia abierta',
    destination: 'www.ultimamilla.com.ar/blog',
    audience: 'Pymes, cooperativas y equipos técnicos argentinos que necesitan decidir con evidencia.',
    compatibleAuthors: ['Editor UMSA Diaria', 'Editor Critico'],
    compatibleRecipes: ['reactiva', 'evergreen', 'caso'],
    compatibleOperationModes: ['modo-alerta-regulatoria', 'modo-guia-infraestructura', 'modo-caso-cuyano'],
    interests: ['infraestructura abierta', 'pymes argentinas', 'datos auditables', 'software libre aplicado', 'regulación operativa'],
    tropesToSeek: [
      'norma nueva que exige evidencia',
      'problema administrativo que revela falla técnica',
      'herramienta abierta que reemplaza dependencia cara',
      'caso local con aprendizaje transferible',
    ],
    tropesToAvoid: ['transformación digital genérica', 'nota de producto disfrazada', 'opinión sin fuente primaria'],
    sourceUrls: [
      'https://datos.gob.ar/',
      'https://www.argentina.gob.ar/jefatura/innovacion-ciencia-y-tecnologia/noticias',
      'https://www.argentina.gob.ar/aaip',
      'https://www.argentina.gob.ar/inti/noticias',
      'https://www.boletinoficial.gob.ar/',
      'https://www.cnv.gov.ar/SitioWeb/HechosRelevantes',
      'https://www.cnv.gov.ar/SitioWeb/Home/AIF',
      'https://www.bcra.gob.ar/noticias/',
      'https://www.bcra.gob.ar/herramientas-conocimientos/',
      'https://www.postgresql.org/about/newsarchive/',
      'https://www.min.io/blog',
      'https://www.metabase.com/blog',
      'https://supabase.com/blog',
      'https://www.docker.com/blog/',
      'https://www.cncf.io/blog/',
      'https://www.linuxfoundation.org/blog/',
      'https://opensource.org/blog/',
      'https://www.eff.org/deeplinks',
      'https://blogs.worldbank.org/en/digital-development',
      'https://www.redhat.com/en/blog',
      'https://www.elastic.co/blog',
      'https://digital.gov/news/',
    ],
    publishingSlots: ['07:00 -03:00', '12:00 -03:00', '17:00 -03:00'],
    scoringWeights: { interest: 12, trope: 18, source: 8, avoidPenalty: 24 },
    createdAt: nowIso(),
    updatedAt: nowIso(),
  },
  {
    id: 'agenda-licitometro',
    name: 'Licitómetro - Compras públicas',
    destination: 'www.licitometro.ar',
    audience: 'Operadores, proveedores y equipos comerciales que monitorean contratación pública.',
    compatibleAuthors: ['Editor UMSA Diaria', 'Editor Critico'],
    compatibleRecipes: ['reactiva', 'empresa', 'evergreen'],
    compatibleOperationModes: ['modo-alerta-regulatoria', 'modo-guia-infraestructura'],
    interests: ['licitaciones argentinas', 'pliegos', 'adjudicaciones', 'compras públicas', 'proveedores'],
    tropesToSeek: [
      'licitación que revela demanda sectorial',
      'adjudicación que muestra precio o proveedor',
      'pliego con requisito operativo relevante',
      'cambio normativo de compras públicas',
    ],
    tropesToAvoid: ['gacetilla institucional sin dato', 'ranking sin fuente', 'alarma comercial sin evidencia'],
    sourceUrls: ['https://www.argentina.gob.ar/jefatura/innovacion-publica/contrataciones', 'https://www.boletinoficial.gob.ar/'],
    publishingSlots: ['08:30 -03:00', '13:30 -03:00'],
    scoringWeights: { interest: 12, trope: 18, source: 10, avoidPenalty: 24 },
    createdAt: nowIso(),
    updatedAt: nowIso(),
  },
];

export const discoveryCandidateSeed: DiscoveryCandidate[] = [
  {
    id: 'cand-seed-arca-stock',
    agendaId: 'agenda-umsa-diaria',
    title: 'ARCA y depósitos fiscales: evidencia diaria como problema de datos',
    summary: 'Señal inicial para una nota reactiva: una obligación operativa exige fuentes, cámaras, responsables y trazabilidad.',
    sourceName: 'Radar base',
    sourceUrl: 'https://www.argentina.gob.ar/',
    snippet: 'Obligación operativa, evidencia diaria, trazabilidad y documentación primaria.',
    detectedTrope: 'norma nueva que exige evidencia',
    matchedInterests: ['regulación operativa', 'datos auditables'],
    recommendedAuthor: 'Editor UMSA Diaria',
    recommendedRecipeId: 'reactiva',
    recommendedOperationModeId: 'modo-alerta-regulatoria',
    score: 86,
    warnings: ['Seed local hasta ejecutar web live.'],
    status: 'descubierto',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  },
];

export const createDefaultEditorialAgenda = ({
  id,
  profiles,
  authors,
  operationModes,
}: {
  id: string;
  profiles: EditorialProfile[];
  authors: Author[];
  operationModes: EditorialOperationMode[];
}): EditorialAgenda => {
  const profile = profiles[0];
  const activeAuthors = authors.filter((author) => author.active).map((author) => author.name);

  return {
    id,
    name: 'Nueva agenda editorial',
    destination: profile?.site || 'www.licitometro.ar/editarra',
    audience: 'Define audiencia, ocasión y criterio editorial.',
    compatibleAuthors: activeAuthors.length ? activeAuthors : authors.slice(0, 1).map((author) => author.name),
    compatibleRecipes: ['reactiva', 'evergreen'],
    compatibleOperationModes: operationModes.slice(0, 2).map((mode) => mode.id),
    interests: ['tema operativo relevante', 'fuente primaria disponible'],
    tropesToSeek: ['señal concreta que merece explicación'],
    tropesToAvoid: ['opinión sin fuente primaria'],
    sourceUrls: ['https://www.argentina.gob.ar/noticias'],
    publishingSlots: ['09:00 -03:00'],
    scoringWeights: { interest: 12, trope: 18, source: 8, avoidPenalty: 24 },
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
};

export const buildDiscoveryRequest = (agenda: EditorialAgenda, query: string): DiscoveryRequestPayload => ({
  product: 'editarra',
  file: 'discovery_request.json',
  agenda,
  query,
  expectedOutput: 'discovery_results.json',
  candidateSchema: [
    'title',
    'summary',
    'sourceName',
    'sourceUrl',
    'snippet',
    'detectedTrope',
    'matchedInterests',
    'recommendedAuthor',
    'recommendedRecipeId',
    'recommendedOperationModeId',
    'score',
    'warnings',
    'status',
  ],
});

export const buildSourceResearchPrompt = (agenda: EditorialAgenda, query: string): SourceResearchPromptPayload => {
  const normalizedQuery = query.trim() || 'sin query explícita';
  const prompt = [
    '# Tarea',
    'Necesito que hagas una búsqueda tipo Deep Research para encontrar nuevas fuentes web que valga la pena adherir al Radar Editorial de EDITARRA.',
    '',
    '# Contexto editorial',
    `Agenda: ${agenda.name}`,
    `Destino actual: ${agenda.destination}`,
    `Audiencia: ${agenda.audience}`,
    `Query editorial actual: ${normalizedQuery}`,
    '',
    'Intereses prioritarios:',
    ...agenda.interests.map((item) => `- ${item}`),
    '',
    'Tropos buscados:',
    ...agenda.tropesToSeek.map((item) => `- ${item}`),
    '',
    'Tropos evitados:',
    ...agenda.tropesToAvoid.map((item) => `- ${item}`),
    '',
    'Fuentes ya cargadas en esta agenda:',
    ...agenda.sourceUrls.map((item) => `- ${item}`),
    '',
    '# Lo que quiero que hagas',
    '1. Encontrar fuentes NUEVAS, no repetidas, que publiquen contenido útil para detectar temas antes de redactar notas.',
    '2. Priorizar secciones indexables: news, blog, comunicados, boletines, novedades, releases, changelogs, observatorios, documentación viva, RSS/Atom o páginas índice con links hijos.',
    '3. Excluir homepages genéricas, landing pages de marketing, directorios sin actualización, páginas rotas o fuentes sin señales editoriales reutilizables.',
    '4. Si una organización tiene una URL institucional y otra mejor para discovery (por ejemplo /news, /blog, /releases, /rss.xml), devolver la mejor URL operativa para el radar.',
    '',
    '# Criterios de selección',
    '- Relevancia temática para la agenda',
    '- Frecuencia de actualización',
    '- Facilidad de indexación / crawling',
    '- Presencia de evidencia primaria o señales operativas',
    '- Potencial para generar temas distintos y no repetir siempre los mismos lugares',
    '',
    '# Entregable obligatorio',
    'Devuélveme entre 15 y 30 fuentes en una tabla Markdown con estas columnas exactas:',
    '| source_name | source_url | source_type | why_relevant | indexing_entry | update_frequency | geo_scope | notes |',
    '',
    'Donde:',
    '- source_url: la URL exacta que conviene pegar en EDITARRA',
    '- source_type: por ejemplo news_section, blog, rss, changelog, docs_updates, boletin, observatorio',
    '- why_relevant: 1 frase concreta',
    '- indexing_entry: indicar si es portada índice, feed RSS/Atom, listado de noticias o changelog',
    '- update_frequency: diaria, semanal, eventual, etc.',
    '- geo_scope: argentina, latam, global, mendoza, sectorial, etc.',
    '',
    '# Reglas de salida',
    '- No repitas ninguna URL ya cargada',
    '- No inventes URLs',
    '- Si dudas, prioriza URLs verificables y directas',
    '- Después de la tabla, agrega una sección final llamada "Top 5 para adherir primero" con una justificación breve por cada una',
  ].join('\n');

  return {
    product: 'editarra',
    file: 'source_research_prompt.md',
    agendaId: agenda.id,
    agendaName: agenda.name,
    prompt,
  };
};

export const normalizeDiscoveryCandidates = (
  raw: DiscoveryResultsPayload,
  fallbackAgendaId: string,
): DiscoveryCandidate[] => {
  const items = raw.candidates || raw.discovery_candidates || [];
  return items.map((item, index) => ({
    id: item.id || `cand-import-${Date.now()}-${index}`,
    runId: item.runId,
    agendaId: item.agendaId || fallbackAgendaId,
    title: item.title || 'Candidato importado sin título',
    summary: item.summary || '',
    sourceName: item.sourceName || 'AI externo',
    sourceUrl: item.sourceUrl || '',
    snippet: item.snippet || item.summary || '',
    detectedTrope: item.detectedTrope || '',
    matchedInterests: item.matchedInterests || [],
    recommendedAuthor: item.recommendedAuthor || 'Editor UMSA Diaria',
    recommendedRecipeId: item.recommendedRecipeId || 'reactiva',
    recommendedOperationModeId: item.recommendedOperationModeId || 'modo-alerta-regulatoria',
    score: typeof item.score === 'number' ? Math.max(0, Math.min(100, item.score)) : 60,
    warnings: item.warnings || ['Importado desde discovery_results.json.'],
    status: item.status || 'descubierto',
    createdAt: item.createdAt || nowIso(),
    updatedAt: nowIso(),
  }));
};

export const candidateToTopic = (
  candidate: DiscoveryCandidate,
  agenda: EditorialAgenda,
): Topic => ({
  id: `topic-${candidate.id}`,
  title: candidate.title,
  status: 'sugerido',
  priority: candidate.score,
  depth: 'Media',
  tokens: 9000,
  author: candidate.recommendedAuthor || agenda.compatibleAuthors[0] || 'Editor UMSA Diaria',
  source: candidate.sourceUrl || candidate.sourceName || 'Radar EDITARRA',
  narrative: candidate.summary || candidate.snippet || 'Candidato detectado por Radar EDITARRA.',
  seo: `Keyword principal: ${candidate.detectedTrope || agenda.name}`,
  publishAt: agenda.publishingSlots[0] || 'Sin fecha',
  agendaId: agenda.id,
  candidateId: candidate.id,
  destinationProfileId: agenda.destination,
  recipeId: candidate.recommendedRecipeId,
  operationModeId: candidate.recommendedOperationModeId,
  trope: candidate.detectedTrope,
  interests: candidate.matchedInterests,
  discoverySourceUrl: candidate.sourceUrl,
});

export const buildLocalCandidate = (
  agenda: EditorialAgenda,
  query: string,
): DiscoveryCandidate => {
  const interest = agenda.interests[0] || query || 'tema editorial';
  const trope = agenda.tropesToSeek[0] || 'señal editorial';
  const title = query.trim()
    ? `${query.trim()}: ${trope}`
    : `${interest}: ${trope}`;

  return {
    id: `cand-local-${compactId(title)}-${Date.now()}`,
    runId: `run-local-${Date.now()}`,
    agendaId: agenda.id,
    title,
    summary: `Candidato local generado desde intereses y tropos de ${agenda.name}.`,
    sourceName: 'Radar local',
    sourceUrl: agenda.sourceUrls[0] || '',
    snippet: `${agenda.audience} · ${interest} · ${trope}`,
    detectedTrope: trope,
    matchedInterests: agenda.interests.slice(0, 2),
    recommendedAuthor: agenda.compatibleAuthors[0] || 'Editor UMSA Diaria',
    recommendedRecipeId: agenda.compatibleRecipes[0] || 'reactiva',
    recommendedOperationModeId: agenda.compatibleOperationModes[0] || 'modo-alerta-regulatoria',
    score: 72,
    warnings: ['Generado localmente; usar web live o AI externo para evidencia real.'],
    status: 'descubierto',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
};
