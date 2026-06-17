import {
  buildEditarraResetBaseline,
  buildImportedEditarraState,
  buildPersistedEditarraState,
  hydrateAuthor,
  hydrateDiscoveryCandidate,
  hydrateEditorialAgenda,
  hydrateEditorialProfile,
  hydrateDiscoveryRun,
  hydrateGuidedRunRecord,
  hydrateImagePrompts,
  hydrateSeoExperiment,
  hydrateTopic,
  normalizeImportedState,
  productionHydrators,
  topicSeed,
} from './persistenceModel';

describe('persistenceModel', () => {
  it('normalizes portable imports from snake_case JSON into EDITARRA state', () => {
    const normalized = normalizeImportedState({
      host_url: 'www.licitometro.ar/editarra',
      selected_recipe_id: 'evergreen',
      selected_operation_mode_id: 'modo-guia-infraestructura',
      reusable_image_ids: 'img-001,img-003',
      editorial_profiles: [{ id: 'perfil-importado', site: 'www.licitometro.ar/editarra' }],
      variables: [{ key: 'keyword_principal', value: 'infraestructura abierta' }],
      note_variable_overrides: [{ topic_id: 'topic-x', recipe_id: 'evergreen', key: 'fuente_puente', value: 'docs' }],
      image_prompts: [{ title: 'Imagen importada' }],
      editor_rules: [{ title: 'Regla importada' }],
      seo_experiments: [{ title: 'SEO importado' }],
      analytics_report: [{ period: '7 dias' }],
      evidence_log: [{ source_name: 'Fuente primaria' }],
      revision_history: [{ version: 2 }],
      audit_log: [{ event: 'Importado' }],
      guided_runs: [{ id: 'run-importado', recipe_id: 'evergreen' }],
      selected_agenda_id: 'agenda-importada',
      candidate_status_filter: 'preseleccionado',
      editorial_agendas: [{
        id: 'agenda-importada',
        name: 'Agenda importada',
        interests: ['datos auditables'],
        tropes_to_seek: ['norma nueva'],
        tropes_to_avoid: ['clickbait'],
        source_urls: ['https://example.com/feed'],
      }],
      discovery_runs: [{
        id: 'run-importado',
        agenda_id: 'agenda-importada',
        query: 'datos',
        urls: ['https://example.com/feed'],
        status: 'completo',
        source_count: 1,
        candidate_count: 1,
      }],
      discovery_candidates: [{
        id: 'cand-importado',
        agenda_id: 'agenda-importada',
        title: 'Candidato importado',
        status: 'preseleccionado',
        score: 88,
      }],
      distribution_actions: {
        'topic-x:newsletter': 'copiado',
        'topic-x:invalid': 'otro',
      },
    });

    expect(normalized.selectedSiteId).toBe('editarra-studio');
    expect(normalized.selectedRecipeId).toBe('evergreen');
    expect(normalized.selectedOperationModeId).toBe('modo-guia-infraestructura');
    expect(normalized.reusableImages).toEqual(['img-001', 'img-003']);
    expect(normalized.profiles).toHaveLength(1);
    expect(normalized.workflowVariables).toHaveLength(1);
    expect(normalized.noteVariableOverrides).toHaveLength(1);
    expect(normalized.imagePrompts).toHaveLength(1);
    expect(normalized.editorRules).toHaveLength(1);
    expect(normalized.seoExperiments).toHaveLength(1);
    expect(normalized.analyticsRecords).toHaveLength(1);
    expect(normalized.evidence).toHaveLength(1);
    expect(normalized.draftVersions).toHaveLength(1);
    expect(normalized.auditEvents).toHaveLength(1);
    expect(normalized.guidedRunRecords).toHaveLength(1);
    expect(normalized.selectedAgendaId).toBe('agenda-importada');
    expect(normalized.candidateStatusFilter).toBe('preseleccionado');
    expect(normalized.editorialAgendas).toHaveLength(1);
    expect(normalized.discoveryRuns).toHaveLength(1);
    expect(normalized.discoveryCandidates).toHaveLength(1);
    expect(normalized.distributionActions).toEqual({ 'topic-x:newsletter': 'copiado' });
  });

  it('preserves an explicitly empty image prompt list instead of restoring seeds', () => {
    expect(hydrateImagePrompts([])).toEqual([]);
    expect(hydrateImagePrompts(undefined)).not.toEqual([]);
  });

  it('hydrates publication destinations in editorial profiles', () => {
    const profile = hydrateEditorialProfile({
      id: 'perfil-cms',
      name: 'Perfil CMS',
      publication_destination_ids: ['umsa-blog', 'licitometro-json'],
      default_publication_destination_id: 'licitometro-json',
    } as any);

    expect(profile.publicationDestinationIds).toEqual(['umsa-blog', 'licitometro-json']);
    expect(profile.defaultPublicationDestinationId).toBe('licitometro-json');
  });

  it('sanitizes stale SEO instructions from persisted experiments', () => {
    const experiment = hydrateSeoExperiment({
      id: 'seo-stale',
      topicId: 'topic-a',
      title: 'BCRA: cómo corregir datos desactualizados',
      description: 'Descripcion SEO honesta, con promesa explicita y sin curiosity gap.',
      focusKeyword: 'problema administrativo que revela falla técnica',
      notes: 'Define hipotesis, canal y criterio de exito antes de publicar.',
    }, 0);

    expect(experiment.description).toContain('BCRA: cómo corregir datos desactualizados');
    expect(experiment.description).not.toMatch(/curiosity gap|promesa explicita/i);
    expect(experiment.notes).toBe('Variante sin metricas historicas.');
  });

  it('normalizes a compact operational_contract.json into an operable import', () => {
    const normalized = normalizeImportedState({
      product: 'editarra',
      version: 1,
      executionMode: 'manual-json-copy',
      activeProfile: {
        id: 'editarra-studio',
        name: 'Perfil operativo importado',
      },
      activeRecipe: {
        id: 'evergreen',
      },
      activeNote: {
        topicId: 'topic-contract',
        title: 'Nota desde contrato operativo',
        status: 'redaccion',
        nextControl: 'Validar fuentes guiadas',
      },
      queue: [
        {
          id: 'run-contract',
          topicId: 'topic-contract',
          title: 'Nota desde contrato operativo',
          action: 'Validar fuentes',
          stage: 'fuentes',
          status: 'pausado',
        },
      ],
      criticalVariables: [
        {
          key: 'keyword_principal',
          value: 'contrato operativo',
          source: 'nota',
        },
      ],
      nextOperatorAction: 'Validar fuentes: Nota desde contrato operativo (evidence_log.json)',
    });

    expect(normalized.selectedSiteId).toBe('editarra-studio');
    expect(normalized.selectedRecipeId).toBe('evergreen');
    expect(normalized.topics?.[0]).toMatchObject({
      id: 'topic-contract',
      title: 'Nota desde contrato operativo',
      source: 'operational_contract.json',
    });
    expect(normalized.workflowVariables?.[0]).toMatchObject({
      key: 'keyword_principal',
      value: 'contrato operativo',
    });
    expect(normalized.guidedRunRecords?.[0]).toMatchObject({
      id: 'run-contract',
      topic_id: 'topic-contract',
      next_control: 'Validar fuentes',
    });
  });

  it('normalizes automation_recipe.json into an actionable guided run', () => {
    const normalized = normalizeImportedState({
      product: 'editarra',
      version: 1,
      executionMode: 'manual-json-copy',
      externalPostEnabled: false,
      runId: 'run-automation',
      topic: {
        id: 'topic-automation',
        title: 'Nota desde receta operativa',
        status: 'redaccion',
      },
      profile: {
        id: 'editarra-studio',
        name: 'Perfil receta',
        site: 'www.licitometro.ar/editarra',
        postingMode: 'manual',
      },
      recipe: {
        id: 'evergreen',
        label: 'Evergreen',
      },
      recommendedCommand: {
        actionId: 'validate_sources',
        label: 'Validar fuentes guiadas',
        reason: '1/4 fuentes validadas',
        targetArtifact: 'evidence_log.json',
        expectedInput: 'evidence_log.json',
        expectedOutput: 'evidence_log.json',
      },
      criticalVariables: [
        {
          key: 'keyword_principal',
          value: 'receta operativa',
          source: 'nota',
        },
      ],
      queue: [
        {
          id: 'queue-automation',
          topicTitle: 'Nota desde receta operativa',
          stage: 'fuentes',
          stageLabel: 'Validar fuentes',
          actionLabel: 'Validar fuentes guiadas',
          artifact: 'evidence_log.json',
          reason: '1/4 fuentes validadas',
        },
      ],
    });

    expect(normalized.selectedSiteId).toBe('editarra-studio');
    expect(normalized.selectedRecipeId).toBe('evergreen');
    expect(normalized.topics?.[0]).toMatchObject({
      id: 'topic-automation',
      title: 'Nota desde receta operativa',
      source: 'automation_recipe.json',
    });
    expect(normalized.workflowVariables?.[0]).toMatchObject({
      key: 'keyword_principal',
      value: 'receta operativa',
    });
    expect(normalized.guidedRunRecords?.[0]).toMatchObject({
      id: 'queue-automation',
      topic_id: 'topic-automation',
      recipe_id: 'evergreen',
      next_control: 'Validar fuentes guiadas',
    });
  });

  it('hydrates author and topic aliases without leaking malformed values into the UI', () => {
    const author = hydrateAuthor({
      id: 'autor-importado',
      name: 'Autor Importado',
      tone_adjectives: 'preciso, local',
      banned_words: ['humo', 'relleno'],
      style_weights: { evidencia: 101, opinion: -4 },
      influences: [{ id: 'inf-importada', reference: 'Docs primarias', relation: 'adherir', weight: 82, notes: 'Usar como fuente primaria.' }],
    } as any);
    const topic = hydrateTopic({
      id: 'topic-importado',
      title: 'Tema importado',
      research_depth: 'Alta',
      token_budget: '18000',
      author_name: 'Autor Importado',
      publish_at: '09:00 -03:00',
      status: 'valor-invalido' as any,
    } as any);

    expect(author.tone).toEqual(['preciso', 'local']);
    expect(author.banned).toEqual(['humo', 'relleno']);
    expect(author.styleWeights.evidencia).toBe(100);
    expect(author.styleWeights.opinion).toBe(0);
    expect(author.influences[0]).toMatchObject({ reference: 'Docs primarias', relation: 'adherir', weight: 82 });
    expect(topic).toMatchObject({
      id: 'topic-importado',
      title: 'Tema importado',
      depth: 'Alta',
      tokens: 18000,
      author: 'Autor Importado',
      publishAt: '09:00 -03:00',
      status: topicSeed[0].status,
    });
  });

  it('restores critical agenda defaults when remote agenda data arrives sparse', () => {
    const agenda = hydrateEditorialAgenda({
      id: 'agenda-umsa-diaria',
      name: 'UMSA Diaria - Tecnologia abierta',
      sourceUrls: [],
      compatibleAuthors: [],
      compatibleRecipes: [],
      compatibleOperationModes: [],
      interests: [],
      tropesToSeek: [],
      publishingSlots: [],
    } as any);

    expect(agenda.sourceUrls).toEqual(expect.arrayContaining([
      'https://www.cnv.gov.ar/SitioWeb/HechosRelevantes',
      'https://www.bcra.gob.ar/noticias/',
      'https://www.postgresql.org/about/newsarchive/',
      'https://www.min.io/blog',
    ]));
    expect(agenda.sourceUrls.length).toBeGreaterThanOrEqual(20);
    expect(agenda.compatibleAuthors.length).toBeGreaterThan(0);
    expect(agenda.compatibleRecipes.length).toBeGreaterThan(0);
    expect(agenda.compatibleOperationModes.length).toBeGreaterThan(0);
    expect(agenda.interests.length).toBeGreaterThan(0);
    expect(agenda.tropesToSeek.length).toBeGreaterThan(0);
    expect(agenda.publishingSlots.length).toBeGreaterThan(0);
  });

  it('preserves Radar run audit fields from backend hydration', () => {
    const run = hydrateDiscoveryRun({
      id: 'run-audit',
      agenda_id: 'agenda-umsa-diaria',
      query: 'datos auditables',
      urls: ['https://datos.gob.ar/', 'https://datos.gob.ar/noticias/a'],
      status: 'completo',
      source_count: 2,
      candidate_count: 1,
      provider: 'native-web',
      seed_results: [{
        url: 'https://datos.gob.ar/',
        resolved_url: 'https://datos.gob.ar/',
        host: 'datos.gob.ar',
        kind: 'semilla',
        ok: true,
        status: 200,
        content_type: 'text/html',
        warnings: [],
        candidate_count: 0,
        max_candidate_score: null,
      }],
      expanded_results: [{
        url: 'https://datos.gob.ar/noticias/a',
        resolved_url: 'https://datos.gob.ar/noticias/a',
        host: 'datos.gob.ar',
        kind: 'expandida',
        ok: true,
        status: 200,
        content_type: 'text/html',
        warnings: [],
        candidate_count: 1,
        max_candidate_score: 84,
      }],
      candidate_distribution: {
        by_host: { 'datos.gob.ar': 1 },
        by_source_url: { 'https://datos.gob.ar/noticias/a': 1 },
        unique_hosts: 1,
        max_candidates_per_host: 2,
      },
      failed_sources: [{
        url: 'https://fallida.test/feed',
        host: 'fallida.test',
        kind: 'semilla',
        ok: false,
        error: 'timeout',
        warnings: ['Timeout al consultar fuente.'],
        candidate_count: 0,
      }],
      warnings: ['Radar consultó 2 URLs semilla configuradas.'],
      created_at: '2026-06-13T00:00:00Z',
      completed_at: '2026-06-13T00:00:01Z',
    } as any);

    expect(run.seedResults).toHaveLength(1);
    expect(run.expandedResults).toHaveLength(1);
    expect(run.failedSources).toHaveLength(1);
    expect(run.candidateDistribution?.byHost?.['datos.gob.ar']).toBe(1);
    expect(run.candidateDistribution?.uniqueHosts).toBe(1);
    expect(run.provider).toBe('native-web');
  });

  it('preserves candidate run order from backend hydration', () => {
    const candidate = hydrateDiscoveryCandidate({
      id: 'cand-order',
      run_id: 'run-order',
      run_order: 3,
      agenda_id: 'agenda-umsa-diaria',
      title: 'Candidato ordenado',
      source_url: 'https://example.com/topic',
      score: 88,
    } as any);

    expect(candidate.runId).toBe('run-order');
    expect(candidate.runOrder).toBe(3);
  });

  it('exposes production hydrators and guided run hydration from the extracted boundary', () => {
    const run = hydrateGuidedRunRecord({
      id: 'run-a',
      topic_id: 'topic-a',
      recipe_id: 'caso',
      profile_id: 'perfil-a',
      status: 'completo',
      steps: 'agenda,fuentes,ai',
      next_control: 'Abrir payload',
    } as any);

    expect(Object.keys(productionHydrators).sort()).toEqual([
      'hydrateAnalyticsRecords',
      'hydrateDraftVersions',
      'hydrateDrafts',
      'hydrateEvidence',
      'hydrateGuidedRunRecords',
      'hydrateSeoExperiments',
    ]);
    expect(run).toMatchObject({
      id: 'run-a',
      topicId: 'topic-a',
      recipeId: 'caso',
      profileId: 'perfil-a',
      status: 'completo',
      steps: ['agenda', 'fuentes', 'ai'],
      nextControl: 'Abrir payload',
    });
  });

  it('builds the persisted studio snapshot from domain state and production state', () => {
    const persisted = buildPersistedEditarraState({
      selectedSiteId: 'perfil-a',
      selectedRecipeId: 'caso',
      selectedOperationModeId: 'modo-caso-cuyano',
      selectedPublicationDestinationId: 'licitometro-json',
      profiles: [{ id: 'perfil-a', name: 'Perfil A' } as any],
      authors: [{ id: 'author-a', name: 'Autora A' } as any],
      topics: [{ id: 'topic-a', title: 'Tema A' } as any],
      selectedTopicId: 'topic-a',
      editorialAgendas: [{ id: 'agenda-a', name: 'Agenda A' } as any],
      selectedAgendaId: 'agenda-a',
      discoveryCandidates: [{ id: 'candidate-a', title: 'Candidato A' } as any],
      discoveryRuns: [{ id: 'run-a', query: 'datos' } as any],
      candidateStatusFilter: 'preseleccionado',
      candidateRunScope: 'ultimo_run',
      packageFileKey: 'publication_targets.json',
      reusableImages: ['img-a'],
      workflowVariables: [{ id: 'var-a', key: 'keyword' } as any],
      noteVariableOverrides: [{ id: 'override-a', topicId: 'topic-a' } as any],
      missionPresets: [{ id: 'preset-a', name: 'Preset A' } as any],
      imagePrompts: [
        {
          id: 'image-a',
          title: 'Imagen A',
          ratio: '16:9',
          status: 'prompt_listo',
          prompt: 'Imagen documental sin texto visible.',
        },
      ],
      editorRules: [{ id: 'rule-a', title: 'Regla A', body: 'Body', enabled: true }],
      auditEvents: [{ id: 'audit-a', event: 'Guardado', detail: 'Detalle', time: '12:00' }],
      productionState: {
        drafts: [{ id: 'draft-a', topicId: 'topic-a' } as any],
        evidence: [{ id: 'evidence-a', topicId: 'topic-a' } as any],
        draftVersions: [{ id: 'version-a', topicId: 'topic-a' } as any],
        seoExperiments: [{ id: 'seo-a', topicId: 'topic-a' } as any],
        analyticsRecords: [{ id: 'analytics-a', topicId: 'topic-a' } as any],
        guidedRunRecords: [{ id: 'guided-a', topicId: 'topic-a' } as any],
        distributionActions: { 'topic-a:site': 'copiado' },
      },
    });

    expect(persisted).toMatchObject({
      selectedSiteId: 'perfil-a',
      selectedRecipeId: 'caso',
      selectedOperationModeId: 'modo-caso-cuyano',
      selectedPublicationDestinationId: 'licitometro-json',
      selectedTopicId: 'topic-a',
      selectedAgendaId: 'agenda-a',
      candidateStatusFilter: 'preseleccionado',
      candidateRunScope: 'ultimo_run',
      packageFileKey: 'publication_targets.json',
      distributionActions: { 'topic-a:site': 'copiado' },
    });
    expect(persisted.drafts?.[0]).toMatchObject({ id: 'draft-a' });
    expect(persisted.evidence?.[0]).toMatchObject({ id: 'evidence-a' });
    expect(persisted.guidedRunRecords?.[0]).toMatchObject({ id: 'guided-a' });
    expect(persisted.auditEvents?.[0]).toMatchObject({ id: 'audit-a' });
  });

  it('falls back to the first persisted topic when the selected topic was removed', () => {
    const persisted = buildPersistedEditarraState({
      selectedSiteId: 'perfil-a',
      selectedRecipeId: 'reactiva',
      selectedOperationModeId: 'modo-alerta-regulatoria',
      selectedPublicationDestinationId: 'umsa-blog',
      profiles: [{ id: 'perfil-a', name: 'Perfil A' } as any],
      authors: [],
      topics: [{ id: 'topic-survivor', title: 'Tema vigente' } as any],
      selectedTopicId: 'topic-deleted',
      editorialAgendas: [],
      selectedAgendaId: 'agenda-a',
      discoveryCandidates: [],
      discoveryRuns: [],
      candidateStatusFilter: 'todos',
      candidateRunScope: 'ultimo_run',
      reusableImages: [],
      workflowVariables: [],
      noteVariableOverrides: [],
      missionPresets: [],
      imagePrompts: [],
      editorRules: [],
      auditEvents: [],
      productionState: {
        drafts: [],
        evidence: [],
        draftVersions: [],
        seoExperiments: [],
        analyticsRecords: [],
        guidedRunRecords: [],
        distributionActions: {},
      },
    });

    expect(persisted.selectedTopicId).toBe('topic-survivor');
  });

  it('builds a hydrated import payload ready for the page shell to apply', () => {
    const result = buildImportedEditarraState({
      rawJson: JSON.stringify({
        selected_recipe_id: 'caso',
        selected_operation_mode_id: 'modo-caso-cuyano',
        selected_publication_destination_id: 'licitometro-json',
        package_file_key: 'publication_targets.json',
        selected_topic_id: 'topic-json-b',
        editorial_profiles: [{ id: 'perfil-json', name: 'Perfil JSON', site: 'json.local' }],
        topics: [
          { id: 'topic-json-a', title: 'Tema anterior JSON' },
          { id: 'topic-json-b', title: 'Tema desde JSON' },
        ],
        drafts: [{ id: 'draft-json', topic_id: 'topic-json', body: 'Cuerpo importado' }],
        evidence_log: [{ id: 'ev-json', topic_id: 'topic-json', source_name: 'Fuente JSON' }],
        audit_log: [{ id: 'audit-json', event: 'Importado' }],
        distribution_actions: { 'topic-json:site': 'pendiente' },
      }),
      currentProfiles: [],
      now: new Date('2026-06-05T10:15:00-03:00'),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.import.profiles?.[0]).toMatchObject({ id: 'perfil-json', name: 'Perfil JSON' });
    expect(result.import.selectedSiteId).toBe('perfil-json');
    expect(result.import.selectedRecipeId).toBe('caso');
    expect(result.import.selectedOperationModeId).toBe('modo-caso-cuyano');
    expect(result.import.selectedPublicationDestinationId).toBe('licitometro-json');
    expect(result.import.packageFileKey).toBe('publication_targets.json');
    expect(result.import.selectedTopicId).toBe('topic-json-b');
    expect(result.import.topics?.[1]).toMatchObject({ id: 'topic-json-b', title: 'Tema desde JSON' });
    expect(result.import.productionPatch.drafts?.[0]).toMatchObject({ id: 'draft-json', topicId: 'topic-json' });
    expect(result.import.productionPatch.evidence?.[0]).toMatchObject({ id: 'ev-json', topicId: 'topic-json' });
    expect(result.import.auditEvents?.[0]).toMatchObject({ id: 'audit-json', event: 'Importado' });
    expect(result.import.productionPatch.distributionActions).toEqual({ 'topic-json:site': 'pendiente' });
    expect(result.import.importStatus).toContain('Config importada 10:15');
  });

  it('sanitizes imported selected agenda and CMS destination ids before applying state', () => {
    const result = buildImportedEditarraState({
      rawJson: JSON.stringify({
        selectedSiteId: 'perfil-a',
        selected_publication_destination_id: 'cms-inexistente',
        selected_agenda_id: 'agenda-inexistente',
        editorial_agendas: [
          { id: 'agenda-a', name: 'Agenda A', source_urls: ['https://example.com/a'] },
          { id: 'agenda-b', name: 'Agenda B', source_urls: ['https://example.com/b'] },
        ],
      }),
      currentProfiles: [{
        id: 'perfil-a',
        name: 'Perfil A',
        site: 'perfil-a.local',
        model: 'umsa',
        cadence: '1 nota/dia',
        defaultAuthor: 'Editor',
        sourceMinimum: 2,
        endpoint: '',
        publicationDestinationIds: ['umsa-blog', 'licitometro-json'],
        defaultPublicationDestinationId: 'licitometro-json',
        postingMode: 'asistido',
        tone: 'operativo',
        guardrails: [],
      }],
      now: new Date('2026-06-05T10:15:00-03:00'),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.import.selectedAgendaId).toBe('agenda-a');
    expect(result.import.selectedPublicationDestinationId).toBe('licitometro-json');
    expect(result.import.editorialAgendas?.map((agenda) => agenda.id)).toEqual(['agenda-a', 'agenda-b']);
  });

  it('returns import errors and the complete reset baseline for UI state', () => {
    const invalid = buildImportedEditarraState({
      rawJson: '{',
      currentProfiles: [],
    });
    const baseline = buildEditarraResetBaseline();

    expect(invalid).toEqual({
      ok: false,
      importStatus: 'JSON invalido. Revisa comas, comillas y estructura antes de importar.',
    });
    expect(baseline.selectedRecipeId).toBe('reactiva');
    expect(baseline.selectedPublicationDestinationId).toBe('umsa-blog');
    expect(baseline.selectedTopicId).toBe(topicSeed[0].id);
    expect(baseline.reusableImages).toEqual(['img-001']);
    expect(baseline.productionPatch).toMatchObject({
      guidedRunRecords: [],
      distributionActions: {},
    });
    expect(baseline.packageFileKey).toBe('article.md');
    expect(baseline.guidedFlowStatus).toContain('Flujo asistido listo');
  });
});
