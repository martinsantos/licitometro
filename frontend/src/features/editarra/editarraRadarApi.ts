import { api } from '../../services/api';
import type { DiscoveryCandidate, DiscoveryCandidateStatus, DiscoveryRun, EditorialAgenda } from './radarModel';

const keyHeader = (operatorKey: string): Record<string, string> | undefined => {
  const normalizedKey = operatorKey.trim();
  return normalizedKey ? { 'X-EDITARRA-KEY': normalizedKey } : undefined;
};

export const editarraRadarApi = {
  listAgendas: (operatorKey: string) =>
    api.get<{ agendas: EditorialAgenda[] }>('/api/editarra/agendas', undefined, undefined, keyHeader(operatorKey)),

  createAgenda: (operatorKey: string, agenda: EditorialAgenda) =>
    api.post<{ agenda: EditorialAgenda }>('/api/editarra/agendas', agenda, keyHeader(operatorKey)),

  updateAgenda: (operatorKey: string, agenda: EditorialAgenda) =>
    api.put<{ agenda: EditorialAgenda }>(`/api/editarra/agendas/${encodeURIComponent(agenda.id)}`, agenda, keyHeader(operatorKey)),

  deleteAgenda: (operatorKey: string, agendaId: string) =>
    api.delete<{ ok: boolean; id: string }>(`/api/editarra/agendas/${encodeURIComponent(agendaId)}`, keyHeader(operatorKey)),

  listCandidates: (operatorKey: string, agendaId?: string, status?: DiscoveryCandidateStatus) => {
    const params = new URLSearchParams();
    if (agendaId) params.set('agendaId', agendaId);
    if (status) params.set('status', status);
    return api.get<{ candidates: DiscoveryCandidate[] }>('/api/editarra/candidates', params, undefined, keyHeader(operatorKey));
  },

  listRuns: (operatorKey: string, agendaId?: string) => {
    const params = new URLSearchParams();
    if (agendaId) params.set('agendaId', agendaId);
    return api.get<{ runs: DiscoveryRun[] }>('/api/editarra/runs', params, undefined, keyHeader(operatorKey));
  },

  updateCandidate: (operatorKey: string, candidateId: string, patch: Partial<DiscoveryCandidate>) =>
    api.patch<{ candidate: DiscoveryCandidate }>(`/api/editarra/candidates/${encodeURIComponent(candidateId)}`, patch, keyHeader(operatorKey)),

  runDiscovery: (operatorKey: string, body: { agendaId: string; query: string; urls: string[] }) =>
    api.post<{ run: DiscoveryRun; candidates: DiscoveryCandidate[] }>('/api/editarra/discovery/run', body, keyHeader(operatorKey)),

  convertTopic: (operatorKey: string, candidateId: string) =>
    api.post<{ candidate: DiscoveryCandidate; topic: unknown }>(`/api/editarra/candidates/${encodeURIComponent(candidateId)}/convert-topic`, undefined, keyHeader(operatorKey)),

  convertNoteRun: (operatorKey: string, candidateId: string) =>
    api.post<{ candidate: DiscoveryCandidate; topic: unknown; noteRun: unknown }>(`/api/editarra/candidates/${encodeURIComponent(candidateId)}/convert-noterun`, undefined, keyHeader(operatorKey)),
};
