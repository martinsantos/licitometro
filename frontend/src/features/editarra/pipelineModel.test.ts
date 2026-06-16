import {
  buildEditarraPipelineControlExecution,
  buildEditarraPipelineState,
} from './pipelineModel';

describe('pipelineModel', () => {
  it('points to guided sources when agenda is ready but evidence is incomplete', () => {
    const pipeline = buildEditarraPipelineState({
      topicStatus: 'redaccion',
      sourcesValidated: 2,
      sourcesRequired: 4,
      draftReady: false,
      draftStatus: 'borrador',
      qualityStatus: 'requiere_revision',
      preflightBlockers: 1,
      publicationStatus: 'bloqueado',
      payloadReady: false,
      imageStatus: 'pendiente',
    });

    expect(pipeline.status).toBe('operando');
    expect(pipeline.currentStageId).toBe('fuentes');
    expect(pipeline.nextControl).toBe('Validar fuentes guiadas');
    expect(pipeline.stages.find((stage) => stage.id === 'fuentes')).toMatchObject({
      status: 'activo',
      detail: '2/4 fuentes validadas.',
    });
    expect(pipeline.actions.find((action) => action.id === 'validate_sources')).toMatchObject({
      enabled: true,
      primary: true,
      reason: 'Control actual: Validar fuentes guiadas.',
    });
    expect(pipeline.actions.find((action) => action.id === 'generate_note')).toMatchObject({
      enabled: false,
      primary: false,
    });
    expect(pipeline.blockers).toEqual(expect.arrayContaining(['2/4 fuentes validadas']));
  });

  it('moves to human audit control after sources and AI are ready', () => {
    const pipeline = buildEditarraPipelineState({
      topicStatus: 'redaccion',
      sourcesValidated: 4,
      sourcesRequired: 4,
      draftReady: true,
      draftStatus: 'listo',
      qualityStatus: 'apto_para_revision',
      preflightBlockers: 0,
      publicationStatus: 'revision',
      payloadReady: true,
      imageStatus: 'pendiente',
    });

    expect(pipeline.status).toBe('control_humano');
    expect(pipeline.currentStageId).toBe('auditoria');
    expect(pipeline.nextControl).toBe('Aprobar auditoría');
    expect(pipeline.stages.find((stage) => stage.id === 'ai')?.status).toBe('listo');
    expect(pipeline.actions.find((action) => action.id === 'approve_audit')).toMatchObject({
      enabled: true,
      primary: true,
    });
  });

  it('keeps audit pending when AI exists but sources are still incomplete', () => {
    const pipeline = buildEditarraPipelineState({
      topicStatus: 'redaccion',
      sourcesValidated: 3,
      sourcesRequired: 5,
      draftReady: true,
      draftStatus: 'listo',
      qualityStatus: 'requiere_revision',
      preflightBlockers: 1,
      publicationStatus: 'bloqueado',
      payloadReady: true,
      imageStatus: 'pendiente',
    });

    expect(pipeline.status).toBe('operando');
    expect(pipeline.currentStageId).toBe('fuentes');
    expect(pipeline.stages.find((stage) => stage.id === 'auditoria')).toMatchObject({
      status: 'pendiente',
      detail: 'Esperando fuentes validadas y nota generada.',
    });
  });

  it('marks the full pipeline ready when the publication manifest is publishable', () => {
    const pipeline = buildEditarraPipelineState({
      topicStatus: 'publicado',
      sourcesValidated: 4,
      sourcesRequired: 4,
      draftReady: true,
      draftStatus: 'aprobado',
      qualityStatus: 'apto_para_revision',
      preflightBlockers: 0,
      publicationStatus: 'listo_para_publicar',
      payloadReady: true,
      imageStatus: 'prompt_listo',
    });

    expect(pipeline.status).toBe('listo');
    expect(pipeline.progress).toBe(100);
    expect(pipeline.currentStageId).toBe('payload');
    expect(pipeline.nextControl).toBe('Listo para exportar');
    expect(pipeline.stages.every((stage) => stage.status === 'listo')).toBe(true);
    expect(pipeline.actions.find((action) => action.id === 'prepare_payload')).toMatchObject({
      label: 'Abrir payload',
      enabled: true,
      primary: true,
    });
  });

  it('requires the visual prompt stage before payload publication can be ready', () => {
    const pipeline = buildEditarraPipelineState({
      topicStatus: 'publicado',
      sourcesValidated: 4,
      sourcesRequired: 4,
      draftReady: true,
      draftStatus: 'aprobado',
      qualityStatus: 'apto_para_revision',
      preflightBlockers: 0,
      publicationStatus: 'listo_para_publicar',
      payloadReady: true,
      imageStatus: 'pendiente',
    });

    expect(pipeline.status).toBe('operando');
    expect(pipeline.currentStageId).toBe('imagenes');
    expect(pipeline.nextControl).toBe('Preparar imagen');
    expect(pipeline.blockers).toContain('imagen sin prompt/manifiesto listo');
    expect(pipeline.stages.find((stage) => stage.id === 'payload')).toMatchObject({
      status: 'pendiente',
      detail: 'Esperando prompt/manifiesto visual.',
    });
    expect(pipeline.actions.find((action) => action.id === 'prepare_image')).toMatchObject({
      enabled: true,
      primary: true,
      reason: 'Control actual: Preparar imagen.',
    });
  });

  it('turns pipeline stages into executable cockpit operations', () => {
    expect(buildEditarraPipelineControlExecution({
      pipeline: { currentStageId: 'agenda' },
      topicTitle: 'Tema A',
      recipeShortLabel: 'Reactiva',
      pendingGuidedEvidenceCount: 0,
      canApproveGuidedAudit: false,
      guidedAuditRequirements: [],
    })).toMatchObject({
      operation: 'apply_recipe',
      targetSurface: 'agenda',
      flowStatus: 'Control pipeline: receta Reactiva aplicada a "Tema A".',
    });

    expect(buildEditarraPipelineControlExecution({
      pipeline: { currentStageId: 'fuentes' },
      topicTitle: 'Tema A',
      recipeShortLabel: 'Reactiva',
      pendingGuidedEvidenceCount: 2,
      canApproveGuidedAudit: false,
      guidedAuditRequirements: [],
    })).toMatchObject({
      operation: 'complete_sources',
      targetSurface: 'auditoria',
      auditEvent: {
        event: 'Control pipeline ejecutado',
        detail: 'Fuentes guiadas validadas para "Tema A".',
      },
    });

    expect(buildEditarraPipelineControlExecution({
      pipeline: { currentStageId: 'fuentes' },
      topicTitle: 'Tema A',
      recipeShortLabel: 'Reactiva',
      pendingGuidedEvidenceCount: 0,
      canApproveGuidedAudit: false,
      guidedAuditRequirements: [],
    })).toMatchObject({
      operation: 'create_and_complete_source_slots',
      operations: ['create_and_complete_source_slots'],
      flowStatus: 'Control pipeline: fuentes guiadas preparadas y validadas para "Tema A".',
    });

    expect(buildEditarraPipelineControlExecution({
      pipeline: { currentStageId: 'ai' },
      topicTitle: 'Tema A',
      recipeShortLabel: 'Reactiva',
      pendingGuidedEvidenceCount: 0,
      canApproveGuidedAudit: false,
      guidedAuditRequirements: [],
    })).toMatchObject({
      operation: 'run_local_ai_and_apply',
      operations: ['run_local_ai_and_apply'],
      targetSurface: 'editor',
      flowStatus: 'Control pipeline: AI local ejecutada y aplicada para "Tema A".',
    });
  });

  it('builds audit and payload cockpit operations with human-control status', () => {
    expect(buildEditarraPipelineControlExecution({
      pipeline: { currentStageId: 'auditoria' },
      topicTitle: 'Tema B',
      recipeShortLabel: 'Evergreen',
      pendingGuidedEvidenceCount: 0,
      canApproveGuidedAudit: false,
      guidedAuditRequirements: ['borrador insuficiente'],
    })).toMatchObject({
      operation: 'approve_audit',
      operations: ['approve_audit'],
      targetSurface: 'auditoria',
      flowStatus: 'Control pipeline pausado: borrador insuficiente.',
    });

    expect(buildEditarraPipelineControlExecution({
      pipeline: { currentStageId: 'imagenes' },
      topicTitle: 'Tema B',
      recipeShortLabel: 'Evergreen',
      pendingGuidedEvidenceCount: 0,
      canApproveGuidedAudit: true,
      guidedAuditRequirements: [],
    })).toMatchObject({
      operation: 'prepare_image',
      operations: ['prepare_image'],
      targetSurface: 'imagenes',
      packageFileKey: 'image_prompt.json',
      flowStatus: 'Control pipeline: prompt visual preparado para "Tema B".',
    });

    expect(buildEditarraPipelineControlExecution({
      pipeline: { currentStageId: 'auditoria' },
      topicTitle: 'Tema B',
      recipeShortLabel: 'Evergreen',
      pendingGuidedEvidenceCount: 0,
      canApproveGuidedAudit: true,
      guidedAuditRequirements: [],
    })).toMatchObject({
      operation: 'approve_audit',
      operations: ['approve_audit'],
      targetSurface: 'imagenes',
      packageFileKey: 'image_prompt.json',
      flowStatus: 'Control pipeline: auditoría aprobada para "Tema B". Preparar prompt visual antes del payload.',
      auditEvent: {
        detail: 'Auditoría aprobada para "Tema B"; siguiente control visual.',
      },
    });

    expect(buildEditarraPipelineControlExecution({
      pipeline: { currentStageId: 'auditoria' },
      topicTitle: 'Tema B',
      recipeShortLabel: 'Evergreen',
      pendingGuidedEvidenceCount: 0,
      canApproveGuidedAudit: true,
      guidedAuditRequirements: [],
      imageReady: true,
    })).toMatchObject({
      operation: 'approve_audit_and_prepare_payload',
      operations: ['approve_audit_and_prepare_payload'],
      targetSurface: 'publicacion',
      packageFileKey: 'publication_payload.json',
      flowStatus: 'Control pipeline: auditoría aprobada y payload preparado para "Tema B".',
      auditEvent: {
        detail: 'Auditoría aprobada, imagen lista y payload preparado para "Tema B".',
      },
    });

    expect(buildEditarraPipelineControlExecution({
      pipeline: { currentStageId: 'payload' },
      topicTitle: 'Tema B',
      recipeShortLabel: 'Evergreen',
      pendingGuidedEvidenceCount: 0,
      canApproveGuidedAudit: true,
      guidedAuditRequirements: [],
    })).toMatchObject({
      operation: 'prepare_payload',
      targetSurface: 'publicacion',
      packageFileKey: 'publication_payload.json',
      flowStatus: 'Payload final preparado para "Tema B". Revisar preview y publication_payload.json antes de distribuir.',
      auditEvent: {
        detail: 'Payload preparado para "Tema B".',
      },
    });
  });
});
