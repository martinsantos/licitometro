import {
  removeAgendaFromRadarState,
  updateDiscoveryCandidateStatusInList,
  upsertDiscoveryCandidateList,
} from './radarStateModel';
import { agendaSeed, buildLocalCandidate, type DiscoveryRun } from './radarModel';

describe('radarStateModel', () => {
  const agendaA = agendaSeed[0];
  const agendaB = { ...agendaSeed[0], id: 'agenda-b', name: 'Agenda B' };
  const candidateA = buildLocalCandidate(agendaA, 'Tema A');
  const candidateB = buildLocalCandidate(agendaB, 'Tema B');
  const runA: DiscoveryRun = {
    id: 'run-a',
    agendaId: agendaA.id,
    query: 'Tema A',
    urls: agendaA.sourceUrls,
    status: 'completo',
    sourceCount: agendaA.sourceUrls.length,
    candidateCount: 1,
    warnings: [],
    createdAt: '2026-06-01T00:00:00Z',
    completedAt: '2026-06-01T00:00:00Z',
  };
  const runB: DiscoveryRun = {
    ...runA,
    id: 'run-b',
    agendaId: agendaB.id,
    query: 'Tema B',
  };

  it('upserts candidates by id without duplicating repeated remote results', () => {
    const updatedCandidate = {
      ...candidateA,
      summary: 'Resumen actualizado',
      score: 88,
    };

    expect(upsertDiscoveryCandidateList([candidateA], [updatedCandidate, candidateB])).toEqual([
      updatedCandidate,
      candidateB,
    ]);
  });

  it('updates candidate status with deterministic updatedAt', () => {
    expect(updateDiscoveryCandidateStatusInList({
      candidates: [candidateA, candidateB],
      candidateId: candidateB.id,
      status: 'preseleccionado',
      updatedAt: '2026-06-02T10:00:00Z',
    })).toEqual([
      candidateA,
      {
        ...candidateB,
        status: 'preseleccionado',
        updatedAt: '2026-06-02T10:00:00Z',
      },
    ]);
  });

  it('removes an agenda and cascades associated candidates and runs', () => {
    expect(removeAgendaFromRadarState({
      editorialAgendas: [agendaA, agendaB],
      discoveryCandidates: [candidateA, candidateB],
      discoveryRuns: [runA, runB],
      selectedAgendaId: agendaA.id,
      agendaId: agendaA.id,
    })).toMatchObject({
      editorialAgendas: [agendaB],
      discoveryCandidates: [candidateB],
      discoveryRuns: [runB],
      selectedAgendaId: agendaB.id,
      removedAgenda: agendaA,
      removed: true,
    });
  });

  it('keeps state unchanged when trying to remove the last agenda', () => {
    expect(removeAgendaFromRadarState({
      editorialAgendas: [agendaA],
      discoveryCandidates: [candidateA],
      discoveryRuns: [runA],
      selectedAgendaId: agendaA.id,
      agendaId: agendaA.id,
    })).toEqual({
      editorialAgendas: [agendaA],
      discoveryCandidates: [candidateA],
      discoveryRuns: [runA],
      selectedAgendaId: agendaA.id,
      removed: false,
    });
  });
});
