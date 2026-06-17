import {
  buildCandidateNoteRunConversion,
  buildCandidateTopicConversion,
  resolveCandidateConversionReadiness,
  upsertConvertedTopic,
} from './candidateConversionModel';
import { agendaSeed, buildLocalCandidate } from './radarModel';
import { noteRecipes, operationModes } from './profileModel';
import type { DiscoveryCandidate } from './radarModel';

describe('candidateConversionModel', () => {
  const agenda = agendaSeed[0];
  const candidate = buildLocalCandidate(agenda, 'ARCA CCTV');

  it('returns an explicit missing state when the candidate is absent', () => {
    expect(buildCandidateTopicConversion({ candidate: undefined, agenda })).toEqual({
      status: 'missing-candidate',
      candidateId: '',
      discoveryStatus: 'Candidato no encontrado.',
    });
  });

  it('builds a topic conversion with radar metadata and UI state', () => {
    const conversion = buildCandidateTopicConversion({ candidate, agenda });

    expect(conversion).toMatchObject({
      status: 'converted',
      candidateId: candidate.id,
      candidateStatus: 'convertido',
      selectedTopicId: `topic-${candidate.id}`,
      query: '',
      statusFilter: 'todos',
      workspaceOpen: true,
      discoveryStatus: `Tema creado: ${candidate.title}.`,
      audit: {
        event: 'Candidato convertido en tema',
        detail: `${candidate.title} paso a Parrilla desde ${agenda.name}.`,
      },
    });

    if (conversion.status !== 'converted') {
      throw new Error('conversion should be converted');
    }

    expect(conversion.topic).toMatchObject({
      id: `topic-${candidate.id}`,
      title: candidate.title,
      agendaId: agenda.id,
      candidateId: candidate.id,
      recipeId: candidate.recommendedRecipeId,
      operationModeId: candidate.recommendedOperationModeId,
      discoverySourceUrl: candidate.sourceUrl,
    });
  });

  it('builds a NoteRun conversion and only selects compatible recipe and mode ids', () => {
    const conversion = buildCandidateNoteRunConversion({
      candidate,
      agenda,
      recipes: noteRecipes,
      operationModes,
    });

    expect(conversion).toMatchObject({
      status: 'converted',
      activeTab: 'editor',
      editorSurface: 'draft',
      draftMode: 'humanizado',
      packageFileKey: 'note_run.json',
      selectedRecipeId: candidate.recommendedRecipeId,
      selectedOperationModeId: candidate.recommendedOperationModeId,
      draftStatusMessage: `NoteRun preparado para "${candidate.title}". Ejecuta Generar borrador cuando apruebes variables y fuentes.`,
      packageStatus: 'note_run.json recalculado desde candidato Radar.',
      guidedFlowStatus: `Candidato convertido en NoteRun manual: ${candidate.title}.`,
      discoveryStatus: `NoteRun creado para ${candidate.title}.`,
    });

    if (conversion.status !== 'converted') {
      throw new Error('conversion should be converted');
    }

    expect(conversion.topic.status).toBe('redaccion');
  });

  it('does not select unknown recipe or operation mode ids', () => {
    const incompatibleCandidate: DiscoveryCandidate = {
      ...candidate,
      id: 'cand-incompatible',
      recommendedRecipeId: 'reactiva',
      recommendedOperationModeId: 'modo-inexistente',
    };

    const conversion = buildCandidateNoteRunConversion({
      candidate: incompatibleCandidate,
      agenda,
      recipes: [],
      operationModes: [],
    });

    expect(conversion).toMatchObject({
      status: 'converted',
      selectedRecipeId: undefined,
      selectedOperationModeId: undefined,
      packageFileKey: 'note_run.json',
    });
  });

  it('upserts converted topics without duplicating repeated conversions', () => {
    const conversion = buildCandidateTopicConversion({ candidate, agenda });

    if (conversion.status !== 'converted') {
      throw new Error('conversion should be converted');
    }

    const first = upsertConvertedTopic([], conversion.topic);
    const second = upsertConvertedTopic(first, {
      ...conversion.topic,
      narrative: 'Narrativa actualizada desde nuevo run.',
    });

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(second[0].narrative).toBe('Narrativa actualizada desde nuevo run.');
  });

  it('blocks conversion for weak coverage candidates while allowing preselection review', () => {
    const weakCandidate: DiscoveryCandidate = {
      ...candidate,
      id: 'cand-weak',
      score: 38,
      matchedInterests: [],
      warnings: ['Candidato agregado para cobertura de fuente; revisar relevancia antes de convertir.'],
    };

    expect(resolveCandidateConversionReadiness(weakCandidate)).toEqual({
      ready: false,
      reason: 'Requiere revisión: Radar lo marcó como señal débil o fuente de cobertura.',
      warnings: weakCandidate.warnings,
    });
  });

  it('allows conversion only when a candidate has score, interests and auditable source', () => {
    const readyCandidate: DiscoveryCandidate = {
      ...candidate,
      score: 72,
      matchedInterests: ['datos auditables'],
      sourceUrl: 'https://example.com/news/auditoria',
      warnings: [],
    };

    expect(resolveCandidateConversionReadiness(readyCandidate)).toEqual({
      ready: true,
      reason: 'Listo para convertir con revisión humana.',
      warnings: [],
    });
  });
});
