import {
  normalizeDiscoveryCandidates,
  type DiscoveryCandidate,
  type EditorialAgenda,
} from './radarModel';

export type RadarHandoffCommand = {
  content: string;
  packageStatus: string;
  discoveryStatus: string;
  audit: {
    event: string;
    detail: string;
  };
};

export type DiscoveryResultsImportOutcome =
  | {
      status: 'imported';
      candidates: DiscoveryCandidate[];
      candidateRunScope: 'historico';
      discoveryStatus: string;
      audit: {
        event: string;
        detail: string;
      };
    }
  | {
      status: 'invalid';
      discoveryStatus: string;
    };

export const buildCopyDiscoveryRequestHandoff = ({
  content,
  agendaName,
}: {
  content: string;
  agendaName: string;
}): RadarHandoffCommand => ({
  content,
  packageStatus: 'discovery_request.json copiado para AI externa.',
  discoveryStatus: 'discovery_request.json copiado.',
  audit: {
    event: 'Discovery request copiado',
    detail: `${agendaName}: request exportable preparado.`,
  },
});

export const buildCopySourceResearchPromptHandoff = ({
  content,
  agendaName,
}: {
  content: string;
  agendaName: string;
}): RadarHandoffCommand => ({
  content,
  packageStatus: 'source_research_prompt.md copiado para Deep Research externo.',
  discoveryStatus: 'Prompt de fuentes copiado.',
  audit: {
    event: 'Prompt de fuentes copiado',
    detail: `${agendaName}: prompt listo para buscar nuevas URLs indexables.`,
  },
});

export const buildDiscoveryResultsImport = ({
  rawJson,
  agenda,
}: {
  rawJson: string;
  agenda: Pick<EditorialAgenda, 'id' | 'name'>;
}): DiscoveryResultsImportOutcome => {
  try {
    const importedCandidates = normalizeDiscoveryCandidates(JSON.parse(rawJson), agenda.id);

    return {
      status: 'imported',
      candidates: importedCandidates,
      candidateRunScope: 'historico',
      discoveryStatus: `Importados ${importedCandidates.length} candidatos desde discovery_results.json.`,
      audit: {
        event: 'Discovery results importado',
        detail: `${importedCandidates.length} candidatos externos cargados para ${agenda.name}.`,
      },
    };
  } catch {
    return {
      status: 'invalid',
      discoveryStatus: 'discovery_results.json invalido.',
    };
  }
};
