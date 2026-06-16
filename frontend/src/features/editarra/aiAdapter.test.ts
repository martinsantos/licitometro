import {
  buildEditarraAiHandoff,
  buildEditarraAiRunRequest,
  buildEditarraLocalAiResponse,
  parseEditarraAiResponse,
} from './aiAdapter';

const aiBrief = {
  expected_json_schema: {
    titulo: 'string',
    resumen: 'string',
    contenido: 'Markdown',
    categoria: 'tecnico',
  },
};

const publicationPayload = {
  titulo: 'Payload operativo',
  categoria: 'tecnico',
  fecha_publicacion: '2026-06-05T12:00:00-03:00',
};

const executableRecipe = {
  intent: 'Guía técnica con prueba mínima.',
  sourcePlan: 'Documentación de herramientas + guía de backup.',
  variableCoverage: {
    completed: 4,
    total: 4,
    label: '4/4 variables listas',
  },
  structure: ['Problema recurrente.', 'Primer entregable reproducible.'],
  sourceChecklist: ['Documentación de herramientas', 'guía de backup'],
  influenceDirectives: [
    { reference: 'Documentación técnica primaria', relation: 'adherir', weight: 78 },
  ],
};

describe('aiAdapter', () => {
  it('builds a provider-agnostic handoff manifest from the active package', () => {
    const handoff = buildEditarraAiHandoff({
      aiBrief,
      publicationPayload,
      qualityStatus: 'apto_para_revision',
      sourceCount: 4,
      requiredSources: 4,
    });

    expect(handoff.provider).toBe('provider-agnostic');
    expect(handoff.mode).toBe('manual-json-handoff');
    expect(handoff.status).toBe('listo_para_ai');
    expect(handoff.sendFile).toBe('ai_brief.json');
    expect(handoff.expectedFile).toBe('publication_payload.json');
    expect(handoff.noExternalPost).toBe(true);
    expect(handoff.outputSchemaKeys).toEqual(['titulo', 'resumen', 'contenido', 'categoria']);
    expect(handoff.payloadPreview.title).toBe('Payload operativo');
  });

  it('marks the handoff as blocked when minimum evidence is missing', () => {
    const handoff = buildEditarraAiHandoff({
      aiBrief,
      publicationPayload,
      qualityStatus: 'apto_para_revision',
      sourceCount: 2,
      requiredSources: 4,
    });

    expect(handoff.status).toBe('requiere_fuentes');
    expect(handoff.nextAction).toContain('2/4 fuentes');
  });

  it('builds an AI run request without enabling external posting', () => {
    const handoff = buildEditarraAiHandoff({
      aiBrief,
      publicationPayload,
      qualityStatus: 'apto_para_revision',
      sourceCount: 4,
      requiredSources: 4,
    });
    const request = buildEditarraAiRunRequest({
      handoff,
      aiBrief,
      operationModeId: 'modo-guia-infraestructura',
      recipeId: 'evergreen',
      profileId: 'editarra-studio',
      executableRecipe,
    });

    expect(request.provider).toBe('provider-agnostic');
    expect(request.transport).toBe('manual-json-copy');
    expect(request.externalPostEnabled).toBe(false);
    expect(request.blocked).toBe(false);
    expect(request.sendFile).toBe('ai_brief.json');
    expect(request.expectedFile).toBe('publication_payload.json');
    expect(request.operationModeId).toBe('modo-guia-infraestructura');
    expect(request.executableRecipe).toMatchObject({
      intent: 'Guía técnica con prueba mínima.',
      variableCoverage: { label: '4/4 variables listas' },
      sourceChecklist: ['Documentación de herramientas', 'guía de backup'],
    });
    expect(request.instructions.join(' ')).toContain('No hacer POST externo');
  });

  it('builds a local dry-run AI response that can be parsed back into a draft patch', () => {
    const raw = buildEditarraLocalAiResponse({
      publicationPayload,
      fallbackBody: 'Lead local.',
      fallbackSummary: 'Resumen local.',
      sourceLabel: 'dry-run QA',
    });
    const result = parseEditarraAiResponse({
      raw,
      fallbackTitle: 'Fallback',
      fallbackSummary: 'Fallback summary',
    });

    expect(raw).toContain('"external_post_enabled": false');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.title).toBe('Payload operativo');
      expect(result.value.body).toContain('## Cómo funciona por dentro');
      expect(result.value.warnings).toEqual([]);
    }
  });

  it('normalizes wrapped AI JSON responses into an editable draft patch', () => {
    const result = parseEditarraAiResponse({
      raw: JSON.stringify({
        publication_payload: {
          titulo: 'Respuesta normalizada',
          resumen: 'Resumen operativo.',
          contenido: [
            'Lead.',
            '',
            '## Cómo funciona por dentro',
            'Sistema.',
            '',
            '## Qué se instala o configura primero',
            'Pila.',
            '',
            '## Dónde se rompe y cómo probarlo',
            'Prueba.',
            '',
            '## Para seguir leyendo',
            '- Fuente',
          ].join('\n'),
          meta_title: 'Meta normalizada',
        },
      }),
      fallbackTitle: 'Fallback',
      fallbackSummary: 'Fallback summary',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.title).toBe('Respuesta normalizada');
      expect(result.value.metaTitle).toBe('Meta normalizada');
      expect(result.value.body).toContain('## Cómo funciona por dentro');
      expect(result.value.warnings).toEqual([]);
    }
  });

  it('returns actionable errors for malformed or incomplete AI JSON', () => {
    expect(parseEditarraAiResponse({
      raw: '{',
      fallbackTitle: 'Fallback',
      fallbackSummary: 'Fallback summary',
    }).ok).toBe(false);

    const missingBody = parseEditarraAiResponse({
      raw: JSON.stringify({ titulo: 'Sin contenido' }),
      fallbackTitle: 'Fallback',
      fallbackSummary: 'Fallback summary',
    });

    expect(missingBody.ok).toBe(false);
    if (!missingBody.ok) {
      expect(missingBody.error).toContain('contenido');
    }
  });
});
