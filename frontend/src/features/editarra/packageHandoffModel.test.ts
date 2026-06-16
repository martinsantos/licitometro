import {
  buildAutomationRecipeDownload,
  buildCompletePackageDownload,
  buildCopyAiRequestHandoff,
  buildCopyAutomationRecipeHandoff,
  buildCopyCompletePackageHandoff,
  buildCopyOperationalContractHandoff,
  buildCopyPublicationPayloadHandoff,
  buildOperationalContractDownload,
  buildPackageFileDownload,
} from './packageHandoffModel';

describe('packageHandoffModel', () => {
  it('builds a focused single-file download command', () => {
    expect(buildPackageFileDownload({
      content: '# nota',
      packageSlug: 'arca-cctv',
      packageId: 'pkg-1',
      fileKey: 'article.md',
    })).toEqual({
      content: '# nota',
      mimeType: 'text/plain;charset=utf-8',
      fileName: 'arca-cctv-article.md',
      packageStatus: 'article.md descargado desde pkg-1.',
      audit: {
        event: 'Archivo descargado',
        detail: 'article.md de pkg-1.',
      },
    });
  });

  it('builds complete package copy and download commands with file counts', () => {
    expect(buildCompletePackageDownload({
      content: '{"ok":true}',
      packageSlug: 'arca-cctv',
      packageId: 'pkg-1',
      fileCount: 18,
    })).toMatchObject({
      fileName: 'arca-cctv.editarra-package.json',
      mimeType: 'application/json;charset=utf-8',
      packageStatus: 'Paquete completo descargado desde pkg-1.',
      audit: {
        event: 'Paquete completo descargado',
        detail: 'pkg-1 con 18 archivos.',
      },
    });

    expect(buildCopyCompletePackageHandoff({
      content: '{"ok":true}',
      packageId: 'pkg-1',
      topicTitle: 'ARCA y CCTV',
      fileCount: 18,
    })).toMatchObject({
      activeTab: 'config',
      packageFileKey: 'package_manifest.json',
      guidedFlowStatus: 'Paquete EDITARRA completo copiado para "ARCA y CCTV". Incluye runtime, AI, auditoría, payload y trazabilidad.',
      packageStatus: 'Paquete completo copiado desde pkg-1: 18 archivos, contrato operativo incluido.',
      audit: {
        event: 'Paquete completo copiado',
        detail: 'pkg-1 copiado con 18 archivos y operational_contract.json.',
      },
    });
  });

  it('builds AI and publication payload copy commands without enabling external POST', () => {
    expect(buildCopyAiRequestHandoff({
      content: '{"ai":true}',
      packageId: 'pkg-1',
      topicTitle: 'ARCA y CCTV',
      request: {
        id: 'ai-run-1',
        transport: 'manual-json-copy',
      },
    })).toMatchObject({
      activeTab: 'config',
      packageFileKey: 'ai_request.json',
      aiStatus: 'ai_request.json copiado para handoff manual-json-copy; POST externo sigue desactivado.',
      packageStatus: 'ai_request.json copiado desde pkg-1; pegar en el proveedor AI o guardar como contrato.',
      audit: {
        event: 'Request AI copiado',
        detail: 'ai-run-1 preparado para "ARCA y CCTV" sin POST externo.',
      },
    });

    expect(buildCopyPublicationPayloadHandoff({
      content: '{"payload":true}',
      packageId: 'pkg-1',
      topicTitle: 'ARCA y CCTV',
    })).toMatchObject({
      activeTab: 'config',
      packageFileKey: 'publication_payload.json',
      guidedFlowStatus: 'publication_payload.json copiado para "ARCA y CCTV". Revisar distribución antes de cualquier publicación manual.',
      packageStatus: 'publication_payload.json copiado desde pkg-1; POST externo desactivado.',
      audit: {
        event: 'Payload publicable copiado',
        detail: 'pkg-1 preparado para "ARCA y CCTV" sin POST externo.',
      },
    });
  });

  it('builds operational contract and automation recipe handoffs', () => {
    expect(buildCopyOperationalContractHandoff({
      content: '{"contract":true}',
      topicTitle: 'ARCA y CCTV',
      contract: {
        executionMode: 'manual-json-copy',
        nextOperatorAction: 'Revisar payload',
      },
    })).toMatchObject({
      activeTab: 'config',
      guidedFlowStatus: 'Contrato operativo copiado para "ARCA y CCTV". Próxima acción: Revisar payload.',
      packageStatus: 'operational_contract.json copiado: manual-json-copy, POST externo desactivado.',
      audit: {
        event: 'Contrato operativo copiado',
        detail: 'ARCA y CCTV: Revisar payload.',
      },
    });

    expect(buildOperationalContractDownload({
      content: '{"contract":true}',
      packageSlug: 'arca-cctv',
      packageId: 'pkg-1',
      topicTitle: 'ARCA y CCTV',
      contract: {
        nextOperatorAction: 'Revisar payload',
      },
    })).toMatchObject({
      activeTab: 'config',
      fileName: 'arca-cctv-operational_contract.json',
      packageStatus: 'operational_contract.json descargado para pkg-1.',
    });

    const recipe = {
      recommendedCommand: {
        actionId: 'prepare_payload',
        label: 'Preparar payload',
        reason: 'Listo',
        targetArtifact: 'publication_payload.json',
        expectedInput: 'note_run.json',
        expectedOutput: 'publication_payload.json',
      },
      executionPreflight: {
        state: 'ready' as const,
        canRunNow: true,
        humanReviewRequired: true,
        blockedBy: [],
        nextMutation: 'Crear publication_payload.json',
        willUpdate: ['publication_payload.json'],
      },
    };

    expect(buildCopyAutomationRecipeHandoff({
      content: '{"recipe":true}',
      topicTitle: 'ARCA y CCTV',
      recipe,
    })).toMatchObject({
      activeTab: 'config',
      packageFileKey: 'automation_recipe.json',
      guidedFlowStatus: 'Receta operativa copiada para "ARCA y CCTV". Comando: Preparar payload.',
      packageStatus: 'automation_recipe.json copiado: ready, ejecutable ahora.',
      audit: {
        event: 'Receta operativa copiada',
        detail: 'ARCA y CCTV: Crear publication_payload.json.',
      },
    });

    expect(buildAutomationRecipeDownload({
      content: '{"recipe":true}',
      packageSlug: 'arca-cctv',
      packageId: 'pkg-1',
      topicTitle: 'ARCA y CCTV',
      recipe,
    })).toMatchObject({
      activeTab: 'config',
      packageFileKey: 'automation_recipe.json',
      fileName: 'arca-cctv-automation_recipe.json',
      audit: {
        event: 'Receta operativa descargada',
        detail: 'ARCA y CCTV: Preparar payload.',
      },
    });
  });
});
