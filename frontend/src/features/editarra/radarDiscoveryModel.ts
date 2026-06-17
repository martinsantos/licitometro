import {
  agendaSeed,
  buildLocalCandidate,
  type DiscoveryCandidate,
  type DiscoveryRun,
  type EditorialAgenda,
} from './radarModel';

export type CandidateRunScope = 'ultimo_run' | 'historico';

export type RadarDiscoveryGuard =
  | { status: 'ready'; query: string }
  | {
      status: 'blocked';
      discoveryStatus: string;
      audit: {
        event: string;
        detail: string;
      };
    };

export type RadarRemoteSuccess = {
  run: DiscoveryRun;
  candidates: DiscoveryCandidate[];
  candidateRunScope: CandidateRunScope;
  discoveryStatus: string;
  audit: {
    event: string;
    detail: string;
  };
};

export type RadarRejected = {
  discoveryStatus: string;
  audit: {
    event: string;
    detail: string;
  };
};

export type RadarLocalFallback = {
  run: DiscoveryRun;
  candidates: DiscoveryCandidate[];
  candidateRunScope: CandidateRunScope;
  discoveryStatus: string;
  audit: {
    event: string;
    detail: string;
  };
};

export const normalizeAgendaUrlKey = (url: string) => url.trim().replace(/\/+$/, '');

export const mergeAgendaSourceUrls = (...urlLists: Array<string[] | undefined>) => {
  const merged: string[] = [];
  const seen = new Set<string>();

  urlLists.forEach((urlList) => {
    (urlList || []).forEach((value) => {
      const url = value.trim();
      if (!url) {
        return;
      }

      const key = normalizeAgendaUrlKey(url);
      if (seen.has(key)) {
        return;
      }

      seen.add(key);
      merged.push(url);
    });
  });

  return merged;
};

export const mergeAgendaForRadarRun = (
  localAgenda: EditorialAgenda,
  remoteAgenda?: EditorialAgenda,
  seedAgendas: EditorialAgenda[] = agendaSeed,
) => {
  const seedAgenda = seedAgendas.find((agenda) => agenda.id === localAgenda.id);
  const localSourceUrls = mergeAgendaSourceUrls(localAgenda.sourceUrls);
  const remoteSourceUrls = mergeAgendaSourceUrls(remoteAgenda?.sourceUrls);
  const sourceUrls = (() => {
    if (localSourceUrls.length > 0) {
      return localSourceUrls;
    }

    if (remoteSourceUrls.length > 0) {
      return remoteSourceUrls;
    }

    return mergeAgendaSourceUrls(seedAgenda?.sourceUrls);
  })();

  return {
    ...(remoteAgenda || localAgenda),
    ...localAgenda,
    sourceUrls,
    updatedAt: new Date().toISOString(),
  };
};

export const buildRadarDiscoveryGuard = ({
  query,
  agendaName,
}: {
  query: string;
  agendaName: string;
}): RadarDiscoveryGuard => {
  if (query.trim()) {
    return {
      status: 'ready',
      query,
    };
  }

  return {
    status: 'blocked',
    discoveryStatus: 'Escribe una query editorial antes de buscar temas. Ejemplo: infraestructura abierta argentina, auditoría operativa o PostgreSQL evidencia.',
    audit: {
      event: 'Radar bloqueado sin query',
      detail: `${agendaName}: falta query editorial.`,
    },
  };
};

export const buildRadarRemoteSuccess = ({
  agenda,
  run,
  candidates,
}: {
  agenda: EditorialAgenda;
  run: DiscoveryRun;
  candidates: DiscoveryCandidate[];
}): RadarRemoteSuccess => {
  const providerLabel = run.provider ? ` via ${run.provider}` : '';

  return {
    run,
    candidates,
    candidateRunScope: 'ultimo_run',
    discoveryStatus: `Discovery completado${providerLabel}: ${candidates.length} candidatos.`,
    audit: {
      event: 'Radar ejecutado',
      detail: `${agenda.name}: ${candidates.length} candidatos desde ${run.sourceCount} fuentes${providerLabel}.`,
    },
  };
};

export const buildRadarBackendRejected = ({
  agendaName,
  detail,
}: {
  agendaName: string;
  detail: string;
}): RadarRejected => ({
  discoveryStatus: `Backend rechazo Radar: ${detail}.`,
  audit: {
    event: 'Radar rechazado por backend',
    detail: `${agendaName}: ${detail}.`,
  },
});

export const buildRadarLocalFallback = ({
  agenda,
  query,
  candidate,
  nowIso = new Date().toISOString(),
}: {
  agenda: EditorialAgenda;
  query: string;
  candidate?: DiscoveryCandidate;
  nowIso?: string;
}): RadarLocalFallback => {
  const localCandidate = candidate || buildLocalCandidate(agenda, query);
  const localRun: DiscoveryRun = {
    id: localCandidate.runId || `run-local-${nowIso}`,
    agendaId: agenda.id,
    query,
    urls: agenda.sourceUrls,
    status: 'parcial',
    sourceCount: agenda.sourceUrls.length,
    candidateCount: 1,
    warnings: ['Fallback local sin fetch web live.'],
    createdAt: nowIso,
    completedAt: nowIso,
  };

  return {
    run: localRun,
    candidates: [localCandidate],
    candidateRunScope: 'ultimo_run',
    discoveryStatus: 'Candidato local creado; exporta discovery_request.json o conecta backend.',
    audit: {
      event: 'Radar local ejecutado',
      detail: `${agenda.name}: candidato local creado sin AI conectada.`,
    },
  };
};

export const upsertDiscoveryRun = (runs: DiscoveryRun[], run: DiscoveryRun, limit = 40) => (
  [run, ...runs.filter((currentRun) => currentRun.id !== run.id)].slice(0, limit)
);
