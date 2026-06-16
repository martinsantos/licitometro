import {
  buildCopyDiscoveryRequestHandoff,
  buildCopySourceResearchPromptHandoff,
  buildDiscoveryResultsImport,
} from './radarHandoffModel';
import { agendaSeed } from './radarModel';

describe('radarHandoffModel', () => {
  const agenda = agendaSeed[0];

  it('builds a discovery_request handoff command', () => {
    expect(buildCopyDiscoveryRequestHandoff({
      content: '{"file":"discovery_request.json"}',
      agendaName: agenda.name,
    })).toEqual({
      content: '{"file":"discovery_request.json"}',
      packageStatus: 'discovery_request.json copiado para AI externa.',
      discoveryStatus: 'discovery_request.json copiado.',
      audit: {
        event: 'Discovery request copiado',
        detail: `${agenda.name}: request exportable preparado.`,
      },
    });
  });

  it('builds a source research prompt handoff command', () => {
    expect(buildCopySourceResearchPromptHandoff({
      content: '# prompt',
      agendaName: agenda.name,
    })).toEqual({
      content: '# prompt',
      packageStatus: 'source_research_prompt.md copiado para Deep Research externo.',
      discoveryStatus: 'Prompt de fuentes copiado.',
      audit: {
        event: 'Prompt de fuentes copiado',
        detail: `${agenda.name}: prompt listo para buscar nuevas URLs indexables.`,
      },
    });
  });

  it('imports discovery_results.json into normalized candidates', () => {
    const outcome = buildDiscoveryResultsImport({
      rawJson: JSON.stringify({
        discovery_candidates: [{
          id: 'cand-external-1',
          title: 'Tema externo',
          summary: 'Resumen externo',
          sourceUrl: 'https://example.com/news',
          score: 130,
        }],
      }),
      agenda,
    });

    expect(outcome).toMatchObject({
      status: 'imported',
      candidateRunScope: 'historico',
      discoveryStatus: 'Importados 1 candidatos desde discovery_results.json.',
      audit: {
        event: 'Discovery results importado',
        detail: `1 candidatos externos cargados para ${agenda.name}.`,
      },
    });

    if (outcome.status !== 'imported') {
      throw new Error('Expected imported outcome');
    }

    expect(outcome.candidates).toHaveLength(1);
    expect(outcome.candidates[0]).toMatchObject({
      id: 'cand-external-1',
      agendaId: agenda.id,
      title: 'Tema externo',
      score: 100,
      status: 'descubierto',
    });
  });

  it('returns an invalid outcome for malformed discovery_results.json', () => {
    expect(buildDiscoveryResultsImport({
      rawJson: '{bad json',
      agenda,
    })).toEqual({
      status: 'invalid',
      discoveryStatus: 'discovery_results.json invalido.',
    });
  });
});
