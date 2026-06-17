import {
  buildEditorialNoteProposal,
  buildImageProductionPrompt,
  buildPublicNoteExportBundle,
  buildRadarRunReport,
} from './editorialFlowModel';
import type { EditarraImageManifest } from './operations';
import type { EditarraPublicationTarget } from './publicationAdapter';
import type { EditorialDraft } from './productionReducer';
import type { DiscoveryCandidate, DiscoveryRun, EditorialAgenda } from './radarModel';
import type { Topic } from './workspaceModel';

const agenda: EditorialAgenda = {
  id: 'agenda-test',
  name: 'Agenda Test',
  destination: 'umsa-blog',
  audience: 'Pymes con necesidades tecnicas.',
  compatibleAuthors: ['Editor UMSA Diaria'],
  compatibleRecipes: ['reactiva'],
  compatibleOperationModes: ['modo-alerta-regulatoria'],
  interests: ['datos auditables', 'software libre'],
  tropesToSeek: ['norma nueva que exige evidencia'],
  tropesToAvoid: ['opinion sin fuente'],
  sourceUrls: [
    'https://datos.gob.ar/',
    'https://www.postgresql.org/about/newsarchive/',
    'https://www.cnv.gov.ar/SitioWeb/HechosRelevantes',
  ],
  publishingSlots: ['07:00'],
  scoringWeights: { interest: 12, trope: 18, source: 8, avoidPenalty: 24 },
};

const run: DiscoveryRun = {
  id: 'run-test',
  agendaId: agenda.id,
  query: 'datos auditables',
  urls: [
    'https://datos.gob.ar/',
    'https://www.postgresql.org/about/newsarchive/',
    'https://www.cnv.gov.ar/SitioWeb/HechosRelevantes',
    'https://www.postgresql.org/about/news/postgresql-18/',
  ],
  status: 'completo',
  sourceCount: 4,
  candidateCount: 2,
  seedResults: [
    { url: 'https://datos.gob.ar/', kind: 'semilla', ok: true, warnings: [], candidateCount: 1 },
    { url: 'https://www.postgresql.org/about/newsarchive/', kind: 'semilla', ok: true, warnings: [], candidateCount: 1 },
    { url: 'https://www.cnv.gov.ar/SitioWeb/HechosRelevantes', kind: 'semilla', ok: true, warnings: [], candidateCount: 0 },
  ],
  expandedResults: [
    { url: 'https://www.postgresql.org/about/news/postgresql-18/', kind: 'expandida', ok: true, warnings: [], candidateCount: 1 },
  ],
  candidateDistribution: { uniqueHosts: 2, byHost: { 'datos.gob.ar': 1, 'postgresql.org': 1 }, maxCandidatesPerHost: 1 },
  failedSources: [],
  warnings: [],
  createdAt: '2026-06-14T10:00:00Z',
  completedAt: '2026-06-14T10:00:00Z',
};

const candidates: DiscoveryCandidate[] = [
  {
    id: 'cand-1',
    runId: run.id,
    agendaId: agenda.id,
    title: 'Datos abiertos con nueva API',
    summary: 'La fuente muestra datos auditables con impacto operativo.',
    sourceName: 'Datos',
    sourceUrl: 'https://datos.gob.ar/dataset/api',
    snippet: 'datos auditables para pymes',
    detectedTrope: 'norma nueva que exige evidencia',
    matchedInterests: ['datos auditables'],
    recommendedAuthor: 'Editor UMSA Diaria',
    recommendedRecipeId: 'reactiva',
    recommendedOperationModeId: 'modo-alerta-regulatoria',
    score: 78,
    warnings: [],
    status: 'descubierto',
  },
  {
    id: 'cand-2',
    runId: run.id,
    agendaId: agenda.id,
    title: 'PostgreSQL publica novedad tecnica',
    summary: 'Nueva version con cambios tecnicos verificables.',
    sourceName: 'PostgreSQL',
    sourceUrl: 'https://www.postgresql.org/about/news/postgresql-18/',
    snippet: 'software libre aplicado',
    detectedTrope: 'norma nueva que exige evidencia',
    matchedInterests: ['software libre'],
    recommendedAuthor: 'Editor UMSA Diaria',
    recommendedRecipeId: 'reactiva',
    recommendedOperationModeId: 'modo-alerta-regulatoria',
    score: 74,
    warnings: [],
    status: 'descubierto',
  },
];

const topic: Topic = {
  id: 'topic-test',
  title: 'Datos abiertos con nueva API',
  status: 'aprobado',
  priority: 80,
  depth: 'Media',
  tokens: 9000,
  author: 'Editor UMSA Diaria',
  source: 'https://datos.gob.ar/dataset/api',
  narrative: 'Explicar el impacto operativo con evidencia.',
  seo: 'datos auditables para pymes',
  publishAt: '2026-06-14T12:00:00-03:00',
  agendaId: agenda.id,
  candidateId: 'cand-1',
  trope: 'norma nueva que exige evidencia',
  interests: ['datos auditables'],
  discoverySourceUrl: 'https://datos.gob.ar/dataset/api',
};

const draft: EditorialDraft = {
  id: 'draft-test',
  topicId: topic.id,
  variant: 'base',
  status: 'aprobado',
  title: topic.title,
  seoTitle: topic.title,
  body: 'Lead verificable.\n\n'.repeat(80),
  notes: 'Resumen publico de la nota.',
  updatedAt: '12:00',
};

const imageManifest: EditarraImageManifest = {
  id: 'img-test',
  topicId: topic.id,
  slug: 'datos-abiertos-api',
  title: topic.title,
  expectedFilename: 'datos-abiertos-api-principal',
  batchId: 'editarra-images-2026-06',
  status: 'prompt_listo',
  prompt: 'Escena documental con equipo tecnico revisando documentos sin texto visible.',
  alt: 'Equipo tecnico revisando evidencia operativa.',
  ratio: '16:9',
  destinationPath: '/images/editarra/generated/editarra-images-2026-06/datos-abiertos-api-principal.webp',
};

const targets: EditarraPublicationTarget[] = [
  {
    destinationId: 'umsa-blog',
    destinationName: 'UMSA Blog',
    cmsType: 'umsa_blog',
    status: 'preview_listo',
    payload: { titulo: topic.title, contenido: draft.body },
    missingFields: [],
    previewUrlLocal: '/editarra/preview/umsa-blog/datos-abiertos-api',
    externalPostEnabled: false,
  },
];

describe('editorialFlowModel', () => {
  it('builds a Radar report with seed coverage, diversity and freshness', () => {
    const report = buildRadarRunReport({
      agenda,
      run,
      candidates,
      previousCandidates: [],
      generatedAt: '2026-06-14T11:00:00Z',
    });

    expect(report.counts.configuredSeeds).toBe(3);
    expect(report.counts.consultedUrls).toBe(4);
    expect(report.counts.expandedUrls).toBe(1);
    expect(report.counts.uniqueCandidateHosts).toBe(2);
    expect(report.counts.freshCandidates).toBe(2);
    expect(report.quality.seedCoveragePct).toBe(100);
    expect(report.quality.freshnessStatus).toBe('nuevo');
  });

  it('creates a note proposal from a candidate and agenda', () => {
    const report = buildRadarRunReport({ agenda, run, candidates, previousCandidates: [] });
    const proposal = buildEditorialNoteProposal({
      topic,
      agenda,
      candidate: candidates[0],
      radarRunReport: report,
    });

    expect(proposal.candidateId).toBe('cand-1');
    expect(proposal.sourcePlan).toContain('https://datos.gob.ar/dataset/api');
    expect(proposal.requiredEvidence).toContain('Fuente primaria o documento oficial de origen.');
    expect(proposal.nextAction).toMatch(/auditoria/i);
  });

  it('builds a public export bundle without enabling external POST', () => {
    const proposal = buildEditorialNoteProposal({ topic, agenda, candidate: candidates[0] });
    const bundle = buildPublicNoteExportBundle({
      packageId: 'editarra-test',
      topic,
      draft,
      publicationTargets: targets,
      imageManifest,
      proposal,
      blockers: 0,
      warnings: 1,
    });

    expect(bundle.readyToPublish).toBe(true);
    expect(bundle.externalPostEnabled).toBe(false);
    expect(bundle.manualExport.targetsFile).toBe('publication_targets.json');
    expect(bundle.manualExport.proposalFile).toBe('editorial_proposal.json');
    expect(bundle.cmsTargets[0].externalPostEnabled).toBe(false);
  });

  it('exports an image production prompt with UMSA visual restrictions', () => {
    const proposal = buildEditorialNoteProposal({ topic, agenda, candidate: candidates[0] });
    const prompt = buildImageProductionPrompt({ topic, proposal, imageManifest });

    expect(prompt).toContain('Prompt PIP');
    expect(prompt).toContain('Sin texto visible');
    expect(prompt).toContain('Sin logos');
    expect(prompt).toContain('Sin rostros reconocibles');
    expect(prompt).toContain('datos-abiertos-api-principal.webp');
  });
});
