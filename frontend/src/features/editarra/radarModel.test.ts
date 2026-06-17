import {
  agendaSeed,
  buildDiscoveryRequest,
  buildSourceResearchPrompt,
  buildLocalCandidate,
  candidateToTopic,
  normalizeDiscoveryCandidates,
  parseSourceUrlsInput,
  scoreDiscoveryText,
} from './radarModel';

describe('radarModel', () => {
  it('scores candidate text by interests, sought tropes and avoided tropes', () => {
    const agenda = agendaSeed[0];
    const positive = scoreDiscoveryText(
      agenda,
      'Nueva regulación operativa exige datos auditables y norma nueva que exige evidencia para pymes argentinas.',
      'datos auditables',
    );
    const risky = scoreDiscoveryText(
      agenda,
      'Opinión sin fuente primaria sobre transformación digital genérica.',
      '',
    );

    expect(positive.matchedInterests).toEqual(expect.arrayContaining(['datos auditables', 'pymes argentinas', 'regulación operativa']));
    expect(positive.matchedTropes).toEqual(['norma nueva que exige evidencia']);
    expect(positive.score).toBeGreaterThan(80);
    expect(risky.avoidedTropes).toEqual(expect.arrayContaining(['transformación digital genérica', 'opinión sin fuente primaria']));
    expect(risky.score).toBeLessThan(20);
  });

  it('exports a portable discovery_request.json payload', () => {
    const request = buildDiscoveryRequest(agendaSeed[0], 'ARCA depositos fiscales');

    expect(request).toMatchObject({
      product: 'editarra',
      file: 'discovery_request.json',
      query: 'ARCA depositos fiscales',
      expectedOutput: 'discovery_results.json',
    });
    expect(request.agenda.id).toBe('agenda-umsa-diaria');
    expect(request.candidateSchema).toContain('detectedTrope');
  });

  it('exports a deep research prompt for finding new source urls', () => {
    const prompt = buildSourceResearchPrompt(agendaSeed[0], 'infraestructura abierta argentina');

    expect(prompt).toMatchObject({
      product: 'editarra',
      file: 'source_research_prompt.md',
      agendaId: 'agenda-umsa-diaria',
      agendaName: 'UMSA Diaria - Tecnologia abierta',
    });
    expect(prompt.prompt).toContain('Deep Research');
    expect(prompt.prompt).toContain('source_url');
    expect(prompt.prompt).toContain('Top 5 para adherir primero');
    expect(prompt.prompt).toContain('No repitas ninguna URL ya cargada');
  });

  it('extracts source urls from mixed deep research text', () => {
    const urls = parseSourceUrlsInput(`
      1. Fundación Vía Libre – Noticias
      URL: https://www.vialibre.org.ar/tag/noticias/
      2. Gcoop – Noticias
      URL: https://gcoop.coop/category/noticias/
      * https://facttic.org.ar/category/blog/
    `);

    expect(urls).toEqual([
      'https://www.vialibre.org.ar/tag/noticias/',
      'https://gcoop.coop/category/noticias/',
      'https://facttic.org.ar/category/blog/',
    ]);
  });

  it('normalizes external discovery_results.json candidates', () => {
    const candidates = normalizeDiscoveryCandidates({
      discovery_candidates: [{
        title: 'Tema externo',
        summary: 'Resumen externo',
        score: 130,
        matchedInterests: ['datos auditables'],
      }],
    }, 'agenda-x');

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      agendaId: 'agenda-x',
      title: 'Tema externo',
      score: 100,
      status: 'descubierto',
    });
  });

  it('converts candidates into topics without losing radar metadata', () => {
    const agenda = agendaSeed[0];
    const candidate = buildLocalCandidate(agenda, 'ARCA CCTV');
    const topic = candidateToTopic(candidate, agenda);

    expect(topic).toMatchObject({
      id: `topic-${candidate.id}`,
      title: candidate.title,
      agendaId: agenda.id,
      candidateId: candidate.id,
      recipeId: candidate.recommendedRecipeId,
      operationModeId: candidate.recommendedOperationModeId,
      trope: candidate.detectedTrope,
      discoverySourceUrl: candidate.sourceUrl,
    });
  });
});
