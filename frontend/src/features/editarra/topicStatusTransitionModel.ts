import type { EditorialPackageFileKey } from './operations';
import type { DraftStatus } from './productionReducer';
import type { TopicStatus } from './workspaceModel';

export type TopicStatusTransitionTab = 'editor' | 'publicacion';
export type TopicStatusTransitionEditorSurface = 'draft';

export type TopicStatusTransition = {
  topicId: string;
  status: TopicStatus;
  selectedTopicId: string;
  draftStatus?: DraftStatus;
  activeTab?: TopicStatusTransitionTab;
  editorSurface?: TopicStatusTransitionEditorSurface;
  workspaceOpen?: true;
  packageFileKey?: EditorialPackageFileKey;
  draftStatusMessage?: string;
  packageStatus?: string;
  guidedFlowStatus?: string;
  distributionStatus?: string;
  audit?: {
    event: string;
    detail: string;
  };
};

export const buildTopicStatusTransition = ({
  topicId,
  status,
  topicTitle,
}: {
  topicId: string;
  status: TopicStatus;
  topicTitle?: string;
}): TopicStatusTransition => {
  const title = topicTitle || topicId;
  const quotedTitle = `"${title}"`;
  const base = {
    topicId,
    status,
    selectedTopicId: topicId,
  };

  if (status === 'aprobado') {
    return {
      ...base,
      draftStatus: 'aprobado',
      editorSurface: 'draft',
      workspaceOpen: true,
      packageFileKey: 'note_run.json',
      draftStatusMessage: `${quotedTitle} aprobado para redaccion/publicacion.`,
      packageStatus: 'note_run.json listo con tema aprobado y variables actuales.',
      guidedFlowStatus: `Tema aprobado: ${title}.`,
      audit: {
        event: 'Tema aprobado',
        detail: `${quotedTitle} quedo aprobado y listo para redactar.`,
      },
    };
  }

  if (status === 'redaccion') {
    return {
      ...base,
      activeTab: 'editor',
      editorSurface: 'draft',
      workspaceOpen: true,
      packageFileKey: 'article.md',
      draftStatusMessage: `${quotedTitle} en redaccion. Puedes generar, editar o versionar el borrador.`,
      packageStatus: 'article.md recalculado para redaccion.',
      guidedFlowStatus: `Redaccion abierta para ${title}.`,
      audit: {
        event: 'Tema enviado a redaccion',
        detail: `${quotedTitle} paso a redaccion.`,
      },
    };
  }

  if (status === 'publicado') {
    return {
      ...base,
      draftStatus: 'publicado',
      activeTab: 'publicacion',
      packageFileKey: 'public_export_bundle.json',
      packageStatus: 'public_export_bundle.json listo; publicacion marcada en el flujo local.',
      distributionStatus: `${quotedTitle} marcado como publicado. Payload disponible para copiar/enviar.`,
      guidedFlowStatus: `Tema publicado en EDITARRA: ${title}.`,
      audit: {
        event: 'Tema publicado',
        detail: `${quotedTitle} quedo marcado como publicado y con payload listo.`,
      },
    };
  }

  if (status === 'descartado') {
    return {
      ...base,
      draftStatusMessage: `${quotedTitle} descartado.`,
      packageStatus: 'Tema descartado; ningun payload activo nuevo.',
      audit: {
        event: 'Tema descartado',
        detail: `${quotedTitle} fue descartado desde Agenda.`,
      },
    };
  }

  return base;
};
