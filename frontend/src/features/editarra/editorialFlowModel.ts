import type { EditarraImageManifest } from './operations';
import type { EditarraPublicationTarget } from './publicationAdapter';
import type { EditorialDraft } from './productionReducer';
import type { DiscoveryCandidate, DiscoveryRun, EditorialAgenda } from './radarModel';
import type { Topic } from './workspaceModel';

type RadarQualityStatus = 'ok' | 'warning' | 'blocked' | 'sin_run';

export type RadarRunReport = {
  id: string;
  agendaId: string;
  query: string;
  status: DiscoveryRun['status'] | 'sin_run';
  generatedAt: string;
  counts: {
    configuredSeeds: number;
    consultedUrls: number;
    auditedSeeds: number;
    expandedUrls: number;
    failedSources: number;
    candidates: number;
    uniqueCandidateHosts: number;
    freshCandidates: number;
    repeatedCandidateSources: number;
  };
  hostDistribution: Array<{ host: string; count: number }>;
  quality: {
    status: RadarQualityStatus;
    seedCoveragePct: number;
    diversityStatus: 'diverso' | 'concentrado' | 'sin_candidatos';
    freshnessStatus: 'nuevo' | 'mixto' | 'repetido' | 'sin_candidatos';
  };
  warnings: string[];
  nextAction: string;
  sourceAudit: {
    seeds: Array<{ url: string; ok: boolean | null; candidateCount: number; warnings: string[] }>;
    expanded: Array<{ url: string; ok: boolean | null; candidateCount: number; warnings: string[] }>;
    failed: Array<{ url: string; error: string; warnings: string[] }>;
  };
};

export type EditorialNoteProposal = {
  id: string;
  topicId: string;
  candidateId?: string;
  title: string;
  angle: string;
  editorialPromise: string;
  hypothesis: string;
  whyNow: string;
  sourcePlan: string[];
  requiredEvidence: string[];
  recommended: {
    author: string;
    recipeId?: string;
    operationModeId?: string;
    destination?: string;
    trope?: string;
    interests: string[];
  };
  status: 'propuesta' | 'lista_para_redaccion' | 'lista_para_auditoria' | 'lista_para_publicacion';
  nextAction: string;
};

export type PublicNoteExportBundle = {
  id: string;
  product: 'editarra';
  topicId: string;
  generatedAt: string;
  externalPostEnabled: false;
  readyToPublish: boolean;
  cmsTargets: Array<{
    destinationId: string;
    destinationName: string;
    cmsType: string;
    status: string;
    previewUrlLocal: string;
    missingFields: string[];
    externalPostEnabled: false;
  }>;
  manualExport: {
    primaryPayloadFile: 'publication_payload.json';
    targetsFile: 'publication_targets.json';
    articleFile: 'article.md';
    imageManifestFile: 'image_manifest.json';
    imagePromptFile: 'image_prompt.md';
    proposalFile: 'editorial_proposal.json';
  };
  preview: {
    title: string;
    summary: string;
    destination: string;
    bodyReady: boolean;
  };
  image: {
    expectedFilename: string;
    status: EditarraImageManifest['status'];
    destinationPath: string;
  };
  audit: {
    blockers: number;
    warnings: number;
    nextAction: string;
  };
};

const nowIso = () => new Date().toISOString();

const normalizeUrlKey = (url: string) => url.trim().replace(/\/+$/, '').toLowerCase();

const hostFromUrl = (url: string) => {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url || 'sin-fuente';
  }
};

const unique = <T,>(values: T[]) => Array.from(new Set(values));

const textOrFallback = (value: unknown, fallback = '') => (
  typeof value === 'string' && value.trim() ? value.trim() : fallback
);

export const buildRadarRunReport = ({
  agenda,
  run,
  candidates,
  previousCandidates = [],
  generatedAt = nowIso(),
}: {
  agenda: EditorialAgenda;
  run?: DiscoveryRun;
  candidates: DiscoveryCandidate[];
  previousCandidates?: DiscoveryCandidate[];
  generatedAt?: string;
}): RadarRunReport => {
  if (!run) {
    return {
      id: 'radar-run-report-sin-run',
      agendaId: agenda.id,
      query: '',
      status: 'sin_run',
      generatedAt,
      counts: {
        configuredSeeds: agenda.sourceUrls.length,
        consultedUrls: 0,
        auditedSeeds: 0,
        expandedUrls: 0,
        failedSources: 0,
        candidates: 0,
        uniqueCandidateHosts: 0,
        freshCandidates: 0,
        repeatedCandidateSources: 0,
      },
      hostDistribution: [],
      quality: {
        status: 'sin_run',
        seedCoveragePct: 0,
        diversityStatus: 'sin_candidatos',
        freshnessStatus: 'sin_candidatos',
      },
      warnings: ['Sin run ejecutado para esta agenda.'],
      nextAction: 'Ejecutar Buscar temas con una query editorial concreta.',
      sourceAudit: { seeds: [], expanded: [], failed: [] },
    };
  }

  const runCandidates = candidates.filter((candidate) => candidate.runId === run.id);
  const seedAudit = run.seedResults || [];
  const expandedAudit = run.expandedResults || [];
  const seedKeys = new Set(agenda.sourceUrls.map(normalizeUrlKey));
  const expandedUrls = unique(run.urls.filter((url) => !seedKeys.has(normalizeUrlKey(url))));
  const candidateHosts = runCandidates.map((candidate) => hostFromUrl(candidate.sourceUrl));
  const hostDistribution = Object.entries(
    candidateHosts.reduce<Record<string, number>>((acc, host) => {
      acc[host] = (acc[host] || 0) + 1;
      return acc;
    }, {}),
  )
    .map(([host, count]) => ({ host, count }))
    .sort((a, b) => b.count - a.count || a.host.localeCompare(b.host));
  const previousSourceKeys = new Set(previousCandidates.map((candidate) => normalizeUrlKey(candidate.sourceUrl)));
  const freshCandidates = runCandidates.filter((candidate) => !previousSourceKeys.has(normalizeUrlKey(candidate.sourceUrl))).length;
  const repeatedCandidateSources = Math.max(0, runCandidates.length - freshCandidates);
  const consultedUrlCount = unique(run.urls.map(normalizeUrlKey)).length;
  const auditedSeedCount = seedAudit.length || run.urls.filter((url) => seedKeys.has(normalizeUrlKey(url))).length;
  const failedSources = run.failedSources || [...seedAudit, ...expandedAudit].filter((source) => !source.ok || source.error);
  const seedCoveragePct = agenda.sourceUrls.length > 0
    ? Math.round((auditedSeedCount / agenda.sourceUrls.length) * 100)
    : 0;
  const uniqueCandidateHosts = hostDistribution.length;
  const diversityStatus = runCandidates.length === 0
    ? 'sin_candidatos'
    : uniqueCandidateHosts >= Math.min(4, runCandidates.length)
      ? 'diverso'
      : 'concentrado';
  const freshnessStatus = runCandidates.length === 0
    ? 'sin_candidatos'
    : freshCandidates === runCandidates.length
      ? 'nuevo'
      : freshCandidates === 0
        ? 'repetido'
        : 'mixto';
  const warnings = unique([
    ...run.warnings,
    ...(seedCoveragePct < 80 ? [`Radar consulto ${seedCoveragePct}% de las semillas configuradas.`] : []),
    ...(diversityStatus === 'concentrado' ? ['Los candidatos siguen concentrados en pocos dominios.'] : []),
    ...(freshnessStatus === 'repetido' ? ['El run no trajo fuentes nuevas frente al historial cargado.'] : []),
    ...(failedSources.length > 0 ? [`${failedSources.length} fuentes tuvieron error o advertencia.`] : []),
  ]);
  const status: RadarQualityStatus = run.status === 'fallido' || runCandidates.length === 0
    ? 'blocked'
    : warnings.length > 0
      ? 'warning'
      : 'ok';

  return {
    id: `radar-run-report-${run.id}`,
    agendaId: agenda.id,
    query: run.query,
    status: run.status,
    generatedAt,
    counts: {
      configuredSeeds: agenda.sourceUrls.length,
      consultedUrls: consultedUrlCount,
      auditedSeeds: auditedSeedCount,
      expandedUrls: expandedUrls.length,
      failedSources: failedSources.length,
      candidates: runCandidates.length,
      uniqueCandidateHosts,
      freshCandidates,
      repeatedCandidateSources,
    },
    hostDistribution,
    quality: {
      status,
      seedCoveragePct,
      diversityStatus,
      freshnessStatus,
    },
    warnings,
    nextAction: status === 'ok'
      ? 'Preseleccionar candidatos variados y convertir a tema.'
      : 'Revisar URLs consultadas, sumar semillas distintas o ajustar la query antes de convertir.',
    sourceAudit: {
      seeds: (seedAudit.length > 0 ? seedAudit : agenda.sourceUrls.map((url) => ({
        url,
        ok: run.urls.some((runUrl) => normalizeUrlKey(runUrl) === normalizeUrlKey(url)),
        warnings: [] as string[],
        candidateCount: runCandidates.filter((candidate) => normalizeUrlKey(candidate.sourceUrl) === normalizeUrlKey(url)).length,
      }))).map((source) => ({
        url: source.url,
        ok: typeof source.ok === 'boolean' ? source.ok : null,
        candidateCount: source.candidateCount,
        warnings: source.warnings || [],
      })),
      expanded: (expandedAudit.length > 0 ? expandedAudit : expandedUrls.map((url) => ({
        url,
        ok: true,
        warnings: [] as string[],
        candidateCount: runCandidates.filter((candidate) => normalizeUrlKey(candidate.sourceUrl) === normalizeUrlKey(url)).length,
      }))).map((source) => ({
        url: source.url,
        ok: typeof source.ok === 'boolean' ? source.ok : null,
        candidateCount: source.candidateCount,
        warnings: source.warnings || [],
      })),
      failed: failedSources.map((source) => ({
        url: source.url,
        error: source.error || 'warning',
        warnings: source.warnings || [],
      })),
    },
  };
};

export const buildEditorialNoteProposal = ({
  topic,
  agenda,
  candidate,
  radarRunReport,
}: {
  topic: Topic;
  agenda?: EditorialAgenda;
  candidate?: DiscoveryCandidate;
  radarRunReport?: RadarRunReport;
}): EditorialNoteProposal => {
  const interests = candidate?.matchedInterests.length
    ? candidate.matchedInterests
    : topic.interests || agenda?.interests.slice(0, 3) || [];
  const sourceUrl = candidate?.sourceUrl || topic.discoverySourceUrl || topic.source;
  const status: EditorialNoteProposal['status'] = topic.status === 'publicado'
    ? 'lista_para_publicacion'
    : topic.status === 'aprobado'
      ? 'lista_para_auditoria'
      : topic.status === 'redaccion'
        ? 'lista_para_redaccion'
        : 'propuesta';

  return {
    id: `proposal-${topic.id}`,
    topicId: topic.id,
    candidateId: candidate?.id || topic.candidateId,
    title: topic.title,
    angle: topic.trope || candidate?.detectedTrope || 'angulo editorial pendiente',
    editorialPromise: topic.narrative || candidate?.summary || 'Convertir una senal detectada por Radar en una nota verificable.',
    hypothesis: candidate?.summary || topic.seo || `La agenda ${agenda?.name || 'activa'} puede explicar este tema con evidencia util.`,
    whyNow: radarRunReport?.query
      ? `Aparece en el run "${radarRunReport.query}" con ${radarRunReport.counts.candidates} candidatos y ${radarRunReport.counts.uniqueCandidateHosts} dominios utiles.`
      : 'Tema seleccionado por el operador para avanzar a redaccion.',
    sourcePlan: unique([
      sourceUrl,
      ...(agenda?.sourceUrls.slice(0, 3) || []),
    ]).filter(Boolean),
    requiredEvidence: [
      'Fuente primaria o documento oficial de origen.',
      'Evidencia tecnica o normativa que respalde el cambio.',
      'Impacto operativo para la audiencia antes de publicar.',
      'Chequeo de que no sea gacetilla, contenido duplicado o SEO generico.',
    ],
    recommended: {
      author: candidate?.recommendedAuthor || topic.author,
      recipeId: candidate?.recommendedRecipeId || topic.recipeId,
      operationModeId: candidate?.recommendedOperationModeId || topic.operationModeId,
      destination: agenda?.destination || topic.destinationProfileId,
      trope: topic.trope || candidate?.detectedTrope,
      interests,
    },
    status,
    nextAction: status === 'propuesta'
      ? 'Convertir en redaccion y generar borrador.'
      : status === 'lista_para_redaccion'
        ? 'Completar borrador y fuentes guiadas.'
        : status === 'lista_para_auditoria'
          ? 'Aprobar auditoria, imagen y payload.'
          : 'Exportar paquete o marcar enviado manual.',
  };
};

export const buildPublicNoteExportBundle = ({
  packageId,
  topic,
  draft,
  publicationTargets,
  imageManifest,
  proposal,
  blockers,
  warnings,
}: {
  packageId: string;
  topic: Topic;
  draft: EditorialDraft;
  publicationTargets: EditarraPublicationTarget[];
  imageManifest: EditarraImageManifest;
  proposal: EditorialNoteProposal;
  blockers: number;
  warnings: number;
}): PublicNoteExportBundle => {
  const target = publicationTargets[0];
  const readyToPublish = ['aprobado', 'publicado'].includes(draft.status)
    && publicationTargets.some((item) => item.status === 'preview_listo')
    && imageManifest.status !== 'pendiente'
    && blockers === 0;

  return {
    id: `public-export-${packageId}`,
    product: 'editarra',
    topicId: topic.id,
    generatedAt: nowIso(),
    externalPostEnabled: false,
    readyToPublish,
    cmsTargets: publicationTargets.map((item) => ({
      destinationId: item.destinationId,
      destinationName: item.destinationName,
      cmsType: item.cmsType,
      status: item.status,
      previewUrlLocal: item.previewUrlLocal,
      missingFields: item.missingFields,
      externalPostEnabled: false,
    })),
    manualExport: {
      primaryPayloadFile: 'publication_payload.json',
      targetsFile: 'publication_targets.json',
      articleFile: 'article.md',
      imageManifestFile: 'image_manifest.json',
      imagePromptFile: 'image_prompt.md',
      proposalFile: 'editorial_proposal.json',
    },
    preview: {
      title: textOrFallback(draft.seoTitle, topic.title),
      summary: textOrFallback(draft.notes, proposal.editorialPromise),
      destination: target?.destinationName || proposal.recommended.destination || 'sin destino',
      bodyReady: draft.body.trim().length > 400,
    },
    image: {
      expectedFilename: imageManifest.expectedFilename,
      status: imageManifest.status,
      destinationPath: imageManifest.destinationPath,
    },
    audit: {
      blockers,
      warnings,
      nextAction: readyToPublish
        ? 'Copiar payload o exportar paquete completo para publicacion manual.'
        : 'Resolver preflight, imagen o payload antes de sacar la nota de EDITARRA.',
    },
  };
};

export const buildImageProductionPrompt = ({
  topic,
  proposal,
  imageManifest,
}: {
  topic: Topic;
  proposal: EditorialNoteProposal;
  imageManifest: EditarraImageManifest;
}) => [
  '# Prompt PIP para imagen editorial UMSA',
  '',
  `Nota: ${topic.title}`,
  `Archivo esperado: ${imageManifest.expectedFilename}.webp`,
  `Ratio: ${imageManifest.ratio}`,
  `Alt: ${imageManifest.alt}`,
  '',
  '## Objetivo visual',
  `Crear una imagen documental realista para acompanar una nota sobre "${proposal.angle}". Debe parecer una escena tomada en contexto operativo real, no una pieza publicitaria.`,
  '',
  '## Prompt base',
  imageManifest.prompt,
  '',
  '## Reglas obligatorias',
  '- Sin texto visible en la imagen.',
  '- Sin logos, marcas, UI reconocible ni pantallas legibles.',
  '- Sin rostros reconocibles ni celebridades.',
  '- Sin collage, sin mockup generico, sin ilustracion de stock.',
  '- Una sola imagen principal, limpia, con evidencia material de trabajo.',
  '- Estetica documental sobria, apta para UMSA Blog.',
  '',
  '## Entregable',
  `Exportar WebP como ${imageManifest.expectedFilename}.webp y dejarlo listo para ${imageManifest.destinationPath}.`,
].join('\n');
