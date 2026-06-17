import {
  buildRadarBackendRejected,
  buildRadarDiscoveryGuard,
  buildRadarLocalFallback,
  buildRadarRemoteSuccess,
  mergeAgendaForRadarRun,
  mergeAgendaSourceUrls,
  upsertDiscoveryRun,
} from './radarDiscoveryModel';
import { agendaSeed, type DiscoveryCandidate, type DiscoveryRun } from './radarModel';

describe('radarDiscoveryModel', () => {
  it('deduplicates source URLs while preserving first useful values', () => {
    expect(mergeAgendaSourceUrls(
      [' https://example.com/news/ ', 'https://example.com/blog'],
      ['https://example.com/news', 'https://other.com/'],
    )).toEqual([
      'https://example.com/news/',
      'https://example.com/blog',
      'https://other.com/',
    ]);
  });

  it('keeps any operator-edited local source list without injecting default seeds', () => {
    const localAgenda = {
      ...agendaSeed[0],
      sourceUrls: ['https://custom.example.com/news'],
    };
    const remoteAgenda = {
      ...agendaSeed[0],
      sourceUrls: ['https://remote.example.com/news'],
    };

    const merged = mergeAgendaForRadarRun(localAgenda, remoteAgenda, agendaSeed);

    expect(merged.sourceUrls).toEqual(['https://custom.example.com/news']);
  });

  it('uses remote source URLs only when the local agenda has no usable sources', () => {
    const merged = mergeAgendaForRadarRun({
      ...agendaSeed[0],
      sourceUrls: [],
    }, {
      ...agendaSeed[0],
      sourceUrls: ['https://remote.example.com/news'],
    }, agendaSeed);

    expect(merged.sourceUrls).toEqual(['https://remote.example.com/news']);
  });

  it('falls back to default seeds only when local and remote agendas have no usable sources', () => {
    const merged = mergeAgendaForRadarRun({
      ...agendaSeed[0],
      sourceUrls: [],
    }, {
      ...agendaSeed[0],
      sourceUrls: [],
    }, agendaSeed);

    expect(merged.sourceUrls).toEqual(agendaSeed[0].sourceUrls);
  });

  it('keeps edited 22-source agendas instead of replacing them with defaults', () => {
    const sourceUrls = Array.from({ length: 22 }, (_, index) => `https://seed-${index}.example.com/news`);
    const merged = mergeAgendaForRadarRun({
      ...agendaSeed[0],
      sourceUrls,
    }, {
      ...agendaSeed[0],
      sourceUrls: ['https://remote.example.com/news'],
    }, agendaSeed);

    expect(merged.sourceUrls).toEqual(sourceUrls);
  });

  it('blocks empty Radar runs with an operator-facing message and audit event', () => {
    expect(buildRadarDiscoveryGuard({
      query: '   ',
      agendaName: 'UMSA Diaria',
    })).toEqual({
      status: 'blocked',
      discoveryStatus: 'Escribe una query editorial antes de buscar temas. Ejemplo: infraestructura abierta argentina, auditoría operativa o PostgreSQL evidencia.',
      audit: {
        event: 'Radar bloqueado sin query',
        detail: 'UMSA Diaria: falta query editorial.',
      },
    });
  });

  it('summarizes remote success with provider, candidate count and source count', () => {
    const run: DiscoveryRun = {
      id: 'run-1',
      agendaId: agendaSeed[0].id,
      query: 'datos auditables',
      urls: agendaSeed[0].sourceUrls,
      status: 'completo',
      sourceCount: 22,
      candidateCount: 3,
      provider: 'native-web',
      warnings: [],
      createdAt: '2026-06-06T10:00:00Z',
      completedAt: '2026-06-06T10:01:00Z',
    };
    const candidates = [{ id: 'cand-1' }, { id: 'cand-2' }, { id: 'cand-3' }] as DiscoveryCandidate[];

    expect(buildRadarRemoteSuccess({
      agenda: agendaSeed[0],
      run,
      candidates,
    })).toMatchObject({
      candidateRunScope: 'ultimo_run',
      discoveryStatus: 'Discovery completado via native-web: 3 candidatos.',
      audit: {
        event: 'Radar ejecutado',
        detail: 'UMSA Diaria - Tecnologia abierta: 3 candidatos desde 22 fuentes via native-web.',
      },
    });
  });

  it('summarizes backend rejection without falling back silently', () => {
    expect(buildRadarBackendRejected({
      agendaName: 'UMSA Diaria',
      detail: 'Forbidden',
    })).toEqual({
      discoveryStatus: 'Backend rechazo Radar: Forbidden.',
      audit: {
        event: 'Radar rechazado por backend',
        detail: 'UMSA Diaria: Forbidden.',
      },
    });
  });

  it('builds local fallback run and candidate for offline mode', () => {
    const candidate = {
      id: 'cand-local-test',
      runId: 'run-local-test',
      agendaId: agendaSeed[0].id,
      title: 'Fallback local',
      summary: 'Resumen',
      sourceName: 'Radar local',
      sourceUrl: 'https://example.com',
      snippet: 'Snippet',
      detectedTrope: 'norma nueva que exige evidencia',
      matchedInterests: ['datos auditables'],
      recommendedAuthor: 'Editor UMSA Diaria',
      recommendedRecipeId: 'reactiva',
      recommendedOperationModeId: 'modo-alerta-regulatoria',
      score: 72,
      warnings: [],
      status: 'descubierto',
    } satisfies DiscoveryCandidate;

    const fallback = buildRadarLocalFallback({
      agenda: agendaSeed[0],
      query: 'datos auditables',
      candidate,
      nowIso: '2026-06-06T10:00:00Z',
    });

    expect(fallback).toMatchObject({
      candidates: [candidate],
      candidateRunScope: 'ultimo_run',
      discoveryStatus: 'Candidato local creado; exporta discovery_request.json o conecta backend.',
      run: {
        id: 'run-local-test',
        agendaId: agendaSeed[0].id,
        query: 'datos auditables',
        status: 'parcial',
        sourceCount: agendaSeed[0].sourceUrls.length,
        candidateCount: 1,
        warnings: ['Fallback local sin fetch web live.'],
        createdAt: '2026-06-06T10:00:00Z',
      },
      audit: {
        event: 'Radar local ejecutado',
        detail: 'UMSA Diaria - Tecnologia abierta: candidato local creado sin AI conectada.',
      },
    });
  });

  it('upserts discovery runs at the top without duplicates', () => {
    const oldRun = {
      id: 'run-1',
      agendaId: 'agenda-x',
      query: 'viejo',
      urls: [],
      status: 'completo',
      sourceCount: 1,
      candidateCount: 1,
      warnings: [],
      createdAt: 'old',
      completedAt: 'old',
    } satisfies DiscoveryRun;
    const nextRun = {
      ...oldRun,
      query: 'nuevo',
      completedAt: 'new',
    };

    expect(upsertDiscoveryRun([oldRun], nextRun)).toEqual([nextRun]);
  });
});
