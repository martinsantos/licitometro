import type {
  DiscoveryCandidate,
  DiscoveryCandidateStatus,
  DiscoveryRun,
  EditorialAgenda,
} from './radarModel';

export type AgendaRemovalResult = {
  editorialAgendas: EditorialAgenda[];
  discoveryCandidates: DiscoveryCandidate[];
  discoveryRuns: DiscoveryRun[];
  selectedAgendaId: string;
  removedAgenda?: EditorialAgenda;
  removed: boolean;
};

export const upsertDiscoveryCandidateList = (
  currentCandidates: DiscoveryCandidate[],
  nextCandidates: DiscoveryCandidate[],
) => {
  const nextById = new Map(currentCandidates.map((candidate) => [candidate.id, candidate]));

  nextCandidates.forEach((candidate) => {
    nextById.set(candidate.id, candidate);
  });

  return Array.from(nextById.values());
};

export const updateDiscoveryCandidateStatusInList = ({
  candidates,
  candidateId,
  status,
  updatedAt = new Date().toISOString(),
}: {
  candidates: DiscoveryCandidate[];
  candidateId: string;
  status: DiscoveryCandidateStatus;
  updatedAt?: string;
}) => candidates.map((candidate) => (
  candidate.id === candidateId ? { ...candidate, status, updatedAt } : candidate
));

export const removeAgendaFromRadarState = ({
  editorialAgendas,
  discoveryCandidates,
  discoveryRuns,
  selectedAgendaId,
  agendaId,
}: {
  editorialAgendas: EditorialAgenda[];
  discoveryCandidates: DiscoveryCandidate[];
  discoveryRuns: DiscoveryRun[];
  selectedAgendaId: string;
  agendaId: string;
}): AgendaRemovalResult => {
  if (editorialAgendas.length <= 1) {
    return {
      editorialAgendas,
      discoveryCandidates,
      discoveryRuns,
      selectedAgendaId,
      removed: false,
    };
  }

  const removedAgenda = editorialAgendas.find((agenda) => agenda.id === agendaId);
  const remainingAgendas = editorialAgendas.filter((agenda) => agenda.id !== agendaId);

  return {
    editorialAgendas: remainingAgendas,
    discoveryCandidates: discoveryCandidates.filter((candidate) => candidate.agendaId !== agendaId),
    discoveryRuns: discoveryRuns.filter((run) => run.agendaId !== agendaId),
    selectedAgendaId: selectedAgendaId === agendaId ? remainingAgendas[0].id : selectedAgendaId,
    removedAgenda,
    removed: Boolean(removedAgenda),
  };
};
