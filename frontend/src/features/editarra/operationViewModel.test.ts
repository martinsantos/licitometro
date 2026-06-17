import {
  buildOperationCandidateSummaries,
  buildOperationTopicSummaries,
  buildOperationViewModel,
} from './operationViewModel';
import type { DiscoveryCandidate } from './radarModel';
import type { Topic } from './workspaceModel';

const candidate = (patch: Partial<DiscoveryCandidate>): DiscoveryCandidate => ({
  id: 'candidate-a',
  agendaId: 'agenda-a',
  title: 'Tema candidato',
  summary: 'Resumen',
  sourceName: 'Fuente A',
  sourceUrl: 'https://source-a.test',
  snippet: 'Snippet',
  detectedTrope: 'norma nueva que exige evidencia',
  matchedInterests: ['datos auditables'],
  recommendedAuthor: 'Editor UMSA Diaria',
  recommendedRecipeId: 'reactiva',
  recommendedOperationModeId: 'modo-alerta-regulatoria',
  score: 81,
  warnings: [],
  status: 'descubierto',
  ...patch,
});

const topic = (patch: Partial<Topic>): Topic => ({
  id: 'topic-a',
  title: 'Tema A',
  status: 'aprobado',
  priority: 75,
  depth: 'Media',
  tokens: 9000,
  author: 'Editor UMSA Diaria',
  source: 'https://source-a.test',
  narrative: 'Narrativa',
  seo: 'keyword',
  publishAt: '2026-06-14T12:00:00-03:00',
  ...patch,
});

describe('operationViewModel', () => {
  it('summarizes candidates without leaking full discovery payload into the UI layer', () => {
    const summaries = buildOperationCandidateSummaries([
      candidate({ id: 'candidate-a', title: 'Tema A', score: 91, status: 'preseleccionado' }),
      candidate({ id: 'candidate-b', title: 'Tema B', sourceName: 'Fuente B', detectedTrope: 'caso local' }),
    ]);

    expect(summaries).toEqual([
      {
        id: 'candidate-a',
        title: 'Tema A',
        score: 91,
        status: 'preseleccionado',
        sourceName: 'Fuente A',
        trope: 'norma nueva que exige evidencia',
      },
      {
        id: 'candidate-b',
        title: 'Tema B',
        score: 81,
        status: 'descubierto',
        sourceName: 'Fuente B',
        trope: 'caso local',
      },
    ]);
  });

  it('limits candidate summaries for the operation home', () => {
    const summaries = buildOperationCandidateSummaries(
      Array.from({ length: 8 }, (_, index) => candidate({ id: `candidate-${index}`, title: `Tema ${index}` })),
      3,
    );

    expect(summaries).toHaveLength(3);
    expect(summaries.map((item) => item.id)).toEqual(['candidate-0', 'candidate-1', 'candidate-2']);
  });

  it('hides discarded topics from operation summaries and counts', () => {
    const summaries = buildOperationTopicSummaries([
      topic({ id: 'topic-a', title: 'A', status: 'aprobado' }),
      topic({ id: 'topic-b', title: 'B', status: 'descartado' }),
      topic({ id: 'topic-c', title: 'C', status: 'redaccion' }),
    ]);

    expect(summaries).toEqual([
      { id: 'topic-a', title: 'A', status: 'aprobado', author: 'Editor UMSA Diaria' },
      { id: 'topic-c', title: 'C', status: 'redaccion', author: 'Editor UMSA Diaria' },
    ]);
  });

  it('builds a full operation view model scoped by selected agenda', () => {
    const model = buildOperationViewModel({
      agendaId: 'agenda-a',
      discoveryCandidates: [
        candidate({ id: 'candidate-a', agendaId: 'agenda-a' }),
        candidate({ id: 'candidate-b', agendaId: 'agenda-a' }),
        candidate({ id: 'candidate-c', agendaId: 'agenda-b' }),
      ],
      filteredDiscoveryCandidates: [
        candidate({ id: 'candidate-b', agendaId: 'agenda-a', title: 'Filtrado B' }),
      ],
      topics: [
        topic({ id: 'topic-a', status: 'aprobado' }),
        topic({ id: 'topic-b', status: 'descartado' }),
      ],
    });

    expect(model.candidateCount).toBe(2);
    expect(model.topicCount).toBe(1);
    expect(model.candidates).toEqual([
      expect.objectContaining({ id: 'candidate-b', title: 'Filtrado B' }),
    ]);
    expect(model.topics).toEqual([
      expect.objectContaining({ id: 'topic-a' }),
    ]);
  });
});
