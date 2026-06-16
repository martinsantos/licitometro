import type { EditorialPackageFileKey } from './operations';
import type { DraftStatus, DistributionActionStatus } from './productionReducer';
import type {
  EditarraPublicationStatus,
  EditarraPublicationTarget,
  EditarraPublicationTargetStatus,
  PublicationDestination,
} from './publicationAdapter';
import type { TopicStatus } from './workspaceModel';

export type PublicationFlowOutcome =
  | {
      status: 'missing-destination';
      packageStatus: string;
      distributionStatus: string;
    }
  | {
      status: 'blocked-preflight';
      packageStatus: string;
      distributionStatus: string;
    }
  | {
      status: 'marked-sent';
      topicId: string;
      topicStatus: TopicStatus;
      draftStatus: DraftStatus;
      deliverableId: string;
      distributionActionStatus: DistributionActionStatus;
      activeTab: 'publicacion';
      packageFileKey: EditorialPackageFileKey;
      packageStatus: string;
      guidedFlowStatus: string;
      distributionStatus: string;
      audit: {
        event: string;
        detail: string;
      };
    };

export type PublicationDestinationView = {
  selectedTarget?: EditarraPublicationTarget;
  selectedDestination?: PublicationDestination;
  selectValue: string;
  canMarkSent: boolean;
  disabledReason: string;
};

export const resolvePublicationDestinationView = ({
  selectedDestinationId,
  destinations,
  publicationTargets,
  publicationStatus,
}: {
  selectedDestinationId: string;
  destinations: PublicationDestination[];
  publicationTargets: EditarraPublicationTarget[];
  publicationStatus: EditarraPublicationStatus;
}): PublicationDestinationView => {
  const selectedDestination = destinations.find((destination) => destination.id === selectedDestinationId);
  const selectedTarget = publicationTargets.find((target) => target.destinationId === selectedDestinationId);

  if (!selectedDestination) {
    return {
      selectedTarget,
      selectedDestination,
      selectValue: '',
      canMarkSent: false,
      disabledReason: 'Selecciona un destino CMS habilitado antes de cerrar la publicacion manual.',
    };
  }

  if (!selectedTarget) {
    return {
      selectedTarget,
      selectedDestination,
      selectValue: selectedDestination.id,
      canMarkSent: false,
      disabledReason: 'El destino CMS seleccionado no tiene preview/payload generado.',
    };
  }

  if (publicationStatus !== 'listo_para_publicar' || selectedTarget.status !== 'preview_listo') {
    return {
      selectedTarget,
      selectedDestination,
      selectValue: selectedDestination.id,
      canMarkSent: false,
      disabledReason: 'Resolver preflight antes de marcar enviado/manual.',
    };
  }

  return {
    selectedTarget,
    selectedDestination,
    selectValue: selectedDestination.id,
    canMarkSent: true,
    disabledReason: '',
  };
};

export const buildPublicationSentOutcome = ({
  topicId,
  topicTitle,
  selectedDestinationId,
  destinations,
  publicationStatus,
  targetStatus,
}: {
  topicId: string;
  topicTitle: string;
  selectedDestinationId: string;
  destinations: PublicationDestination[];
  publicationStatus: EditarraPublicationStatus;
  targetStatus?: EditarraPublicationTargetStatus;
}): PublicationFlowOutcome => {
  const destination = destinations.find((item) => item.id === selectedDestinationId);

  if (destinations.length === 0) {
    return {
      status: 'missing-destination',
      packageStatus: 'No hay destino CMS configurado para marcar publicacion.',
      distributionStatus: 'Configura un destino CMS antes de cerrar la publicacion manual.',
    };
  }

  if (!destination) {
    return {
      status: 'missing-destination',
      packageStatus: `Destino CMS "${selectedDestinationId || 'sin-seleccion'}" no disponible para marcar publicacion.`,
      distributionStatus: 'Selecciona un destino CMS habilitado antes de cerrar la publicacion manual.',
    };
  }

  if (publicationStatus !== 'listo_para_publicar' || targetStatus !== 'preview_listo') {
    return {
      status: 'blocked-preflight',
      packageStatus: 'Publicacion bloqueada por preflight; falta resolver payload, preview, fuentes o imagen.',
      distributionStatus: `${destination.name} no puede marcarse enviado/manual hasta que el preflight quede listo.`,
    };
  }

  return {
    status: 'marked-sent',
    topicId,
    topicStatus: 'publicado',
    draftStatus: 'publicado',
    deliverableId: `${topicId}:cms:${destination.id}`,
    distributionActionStatus: 'enviado',
    activeTab: 'publicacion',
    packageFileKey: 'public_export_bundle.json',
    packageStatus: 'public_export_bundle.json listo con payload, preview y manifiesto visual.',
    guidedFlowStatus: `Publicacion local cerrada para ${topicTitle}. Exportar paquete o copiar payload.`,
    distributionStatus: `${destination.name} para "${topicTitle}" marcado como enviado/manual dentro de EDITARRA.`,
    audit: {
      event: 'Publicacion manual marcada',
      detail: `${topicTitle} quedo marcado como enviado/manual para ${destination.name}; POST externo desactivado.`,
    },
  };
};
