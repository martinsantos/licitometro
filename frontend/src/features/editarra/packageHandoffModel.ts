import type { EditarraAiRunRequest } from './aiAdapter';
import type { EditarraAutomationRecipe } from './automationRecipeModel';
import type { EditarraOperationalContract } from './operationalContractModel';
import type { EditorialPackageFileKey } from './operations';

export type EditarraHandoffTab = 'config';

export type EditarraHandoffCommand = {
  content: string;
  activeTab?: EditarraHandoffTab;
  packageFileKey?: EditorialPackageFileKey;
  aiStatus?: string;
  packageStatus?: string;
  guidedFlowStatus?: string;
  audit: {
    event: string;
    detail: string;
  };
};

export type EditarraDownloadCommand = {
  content: string;
  mimeType: string;
  fileName: string;
  activeTab?: EditarraHandoffTab;
  packageFileKey?: EditorialPackageFileKey;
  packageStatus: string;
  audit: {
    event: string;
    detail: string;
  };
};

export const buildPackageFileDownload = ({
  content,
  packageSlug,
  packageId,
  fileKey,
}: {
  content: string;
  packageSlug: string;
  packageId: string;
  fileKey: EditorialPackageFileKey;
}): EditarraDownloadCommand => ({
  content,
  mimeType: 'text/plain;charset=utf-8',
  fileName: `${packageSlug}-${fileKey}`,
  packageStatus: `${fileKey} descargado desde ${packageId}.`,
  audit: {
    event: 'Archivo descargado',
    detail: `${fileKey} de ${packageId}.`,
  },
});

export const buildCompletePackageDownload = ({
  content,
  packageSlug,
  packageId,
  fileCount,
}: {
  content: string;
  packageSlug: string;
  packageId: string;
  fileCount: number;
}): EditarraDownloadCommand => ({
  content,
  mimeType: 'application/json;charset=utf-8',
  fileName: `${packageSlug}.editarra-package.json`,
  packageStatus: `Paquete completo descargado desde ${packageId}.`,
  audit: {
    event: 'Paquete completo descargado',
    detail: `${packageId} con ${fileCount} archivos.`,
  },
});

export const buildCopyAiRequestHandoff = ({
  content,
  packageId,
  topicTitle,
  request,
}: {
  content: string;
  packageId: string;
  topicTitle: string;
  request: Pick<EditarraAiRunRequest, 'id' | 'transport'>;
}): EditarraHandoffCommand => ({
  content,
  activeTab: 'config',
  packageFileKey: 'ai_request.json',
  aiStatus: `ai_request.json copiado para handoff ${request.transport}; POST externo sigue desactivado.`,
  packageStatus: `ai_request.json copiado desde ${packageId}; pegar en el proveedor AI o guardar como contrato.`,
  audit: {
    event: 'Request AI copiado',
    detail: `${request.id} preparado para "${topicTitle}" sin POST externo.`,
  },
});

export const buildCopyPublicationPayloadHandoff = ({
  content,
  packageId,
  topicTitle,
}: {
  content: string;
  packageId: string;
  topicTitle: string;
}): EditarraHandoffCommand => ({
  content,
  activeTab: 'config',
  packageFileKey: 'publication_payload.json',
  guidedFlowStatus: `publication_payload.json copiado para "${topicTitle}". Revisar distribución antes de cualquier publicación manual.`,
  packageStatus: `publication_payload.json copiado desde ${packageId}; POST externo desactivado.`,
  audit: {
    event: 'Payload publicable copiado',
    detail: `${packageId} preparado para "${topicTitle}" sin POST externo.`,
  },
});

export const buildCopyCompletePackageHandoff = ({
  content,
  packageId,
  topicTitle,
  fileCount,
}: {
  content: string;
  packageId: string;
  topicTitle: string;
  fileCount: number;
}): EditarraHandoffCommand => ({
  content,
  activeTab: 'config',
  packageFileKey: 'package_manifest.json',
  guidedFlowStatus: `Paquete EDITARRA completo copiado para "${topicTitle}". Incluye runtime, AI, auditoría, payload y trazabilidad.`,
  packageStatus: `Paquete completo copiado desde ${packageId}: ${fileCount} archivos, contrato operativo incluido.`,
  audit: {
    event: 'Paquete completo copiado',
    detail: `${packageId} copiado con ${fileCount} archivos y operational_contract.json.`,
  },
});

export const buildCopyOperationalContractHandoff = ({
  content,
  topicTitle,
  contract,
}: {
  content: string;
  topicTitle: string;
  contract: Pick<EditarraOperationalContract, 'executionMode' | 'nextOperatorAction'>;
}): EditarraHandoffCommand => ({
  content,
  activeTab: 'config',
  guidedFlowStatus: `Contrato operativo copiado para "${topicTitle}". Próxima acción: ${contract.nextOperatorAction}.`,
  packageStatus: `operational_contract.json copiado: ${contract.executionMode}, POST externo desactivado.`,
  audit: {
    event: 'Contrato operativo copiado',
    detail: `${topicTitle}: ${contract.nextOperatorAction}.`,
  },
});

export const buildOperationalContractDownload = ({
  content,
  packageSlug,
  packageId,
  topicTitle,
  contract,
}: {
  content: string;
  packageSlug: string;
  packageId: string;
  topicTitle: string;
  contract: Pick<EditarraOperationalContract, 'nextOperatorAction'>;
}): EditarraDownloadCommand => ({
  content,
  mimeType: 'application/json;charset=utf-8',
  fileName: `${packageSlug}-operational_contract.json`,
  activeTab: 'config',
  packageStatus: `operational_contract.json descargado para ${packageId}.`,
  audit: {
    event: 'Contrato operativo descargado',
    detail: `${topicTitle}: ${contract.nextOperatorAction}.`,
  },
});

export const buildCopyAutomationRecipeHandoff = ({
  content,
  topicTitle,
  recipe,
}: {
  content: string;
  topicTitle: string;
  recipe: Pick<EditarraAutomationRecipe, 'recommendedCommand' | 'executionPreflight'>;
}): EditarraHandoffCommand => ({
  content,
  activeTab: 'config',
  packageFileKey: 'automation_recipe.json',
  guidedFlowStatus: `Receta operativa copiada para "${topicTitle}". Comando: ${recipe.recommendedCommand.label}.`,
  packageStatus: `automation_recipe.json copiado: ${recipe.executionPreflight.state}, ${recipe.executionPreflight.canRunNow ? 'ejecutable ahora' : 'requiere control'}.`,
  audit: {
    event: 'Receta operativa copiada',
    detail: `${topicTitle}: ${recipe.executionPreflight.nextMutation}.`,
  },
});

export const buildAutomationRecipeDownload = ({
  content,
  packageSlug,
  packageId,
  topicTitle,
  recipe,
}: {
  content: string;
  packageSlug: string;
  packageId: string;
  topicTitle: string;
  recipe: Pick<EditarraAutomationRecipe, 'recommendedCommand'>;
}): EditarraDownloadCommand => ({
  content,
  mimeType: 'application/json;charset=utf-8',
  fileName: `${packageSlug}-automation_recipe.json`,
  activeTab: 'config',
  packageFileKey: 'automation_recipe.json',
  packageStatus: `automation_recipe.json descargado para ${packageId}.`,
  audit: {
    event: 'Receta operativa descargada',
    detail: `${topicTitle}: ${recipe.recommendedCommand.label}.`,
  },
});
