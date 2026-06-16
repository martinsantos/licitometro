import type { EditarraImageStatus } from './operations';
import type { EditarraPublicationStatus } from './publicationAdapter';
import type { EditarraTone } from './uiPrimitives';

export type EditarraJourneyStageId = 'radar' | 'candidatos' | 'nota' | 'imagenes' | 'publicacion';
export type EditarraJourneyStatus = 'operando' | 'bloqueado' | 'control_humano' | 'listo';
export type EditarraJourneyStageStatus = 'listo' | 'activo' | 'bloqueado' | 'pendiente';
export type EditarraJourneyTarget =
  | 'agenda:radar'
  | 'agenda:candidatos'
  | 'agenda:parrilla'
  | 'editor:workspace'
  | 'editor:draft'
  | 'auditoria'
  | 'imagenes'
  | 'publicacion';

export type EditarraJourneyStage = {
  id: EditarraJourneyStageId;
  label: string;
  status: EditarraJourneyStageStatus;
  tone: EditarraTone;
  detail: string;
  control: string;
  metric: string;
  actionLabel: string;
  target: EditarraJourneyTarget;
};

export type EditarraJourneyState = {
  status: EditarraJourneyStatus;
  progress: number;
  currentStageId: EditarraJourneyStageId;
  nextControl: string;
  blockers: string[];
  stages: EditarraJourneyStage[];
};

export type BuildEditarraJourneyInput = {
  candidateCount: number;
  selectedTopicStatus: string;
  selectedTopicTitle: string;
  selectedTopicCandidateId?: string;
  sourceSeedCount: number;
  sourcesValidated: number;
  sourcesRequired: number;
  draftStatus: string;
  draftReady: boolean;
  qualityStatus: string;
  preflightBlockers: number;
  preflightWarnings: number;
  imageStatus: EditarraImageStatus;
  imageExpectedFilename: string;
  publicationStatus: EditarraPublicationStatus;
  publicationNextAction: string;
  publicationTargetCount: number;
  publicExportReady: boolean;
};

const statusTone: Record<EditarraJourneyStageStatus, EditarraTone> = {
  listo: 'emerald',
  activo: 'blue',
  bloqueado: 'rose',
  pendiente: 'slate',
};

const topicReadyStatuses = new Set(['redaccion', 'aprobado', 'publicado']);
const approvedDraftStatuses = new Set(['aprobado', 'publicado']);
const imageReadyStatuses = new Set<EditarraImageStatus>(['prompt_listo', 'generada_externa', 'aprobada']);

const stage = ({
  status,
  ...input
}: Omit<EditarraJourneyStage, 'tone'>): EditarraJourneyStage => ({
  ...input,
  status,
  tone: statusTone[status],
});

const firstControlStage = (stages: EditarraJourneyStage[]) => (
  stages.find((item) => item.status === 'bloqueado')
  || stages.find((item) => item.status === 'activo')
  || stages.find((item) => item.status === 'pendiente')
  || stages[stages.length - 1]
);

export const buildEditarraJourneyState = ({
  candidateCount,
  selectedTopicStatus,
  selectedTopicTitle,
  selectedTopicCandidateId,
  sourceSeedCount,
  sourcesValidated,
  sourcesRequired,
  draftStatus,
  draftReady,
  qualityStatus,
  preflightBlockers,
  preflightWarnings,
  imageStatus,
  imageExpectedFilename,
  publicationStatus,
  publicationNextAction,
  publicationTargetCount,
  publicExportReady,
}: BuildEditarraJourneyInput): EditarraJourneyState => {
  const hasCandidates = candidateCount > 0;
  const topicReady = topicReadyStatuses.has(selectedTopicStatus);
  const candidateResolved = Boolean(selectedTopicCandidateId) || topicReady;
  const sourcesReady = sourcesValidated >= sourcesRequired;
  const auditReady = approvedDraftStatuses.has(draftStatus) || selectedTopicStatus === 'publicado';
  const imageReady = imageReadyStatuses.has(imageStatus);
  const imageBlocked = imageStatus === 'descartada';
  const publicationReady = publicExportReady || publicationStatus === 'listo_para_publicar';
  const noteBlocked = topicReady && sourcesReady && draftReady && !auditReady && preflightBlockers > 0;

  const noteTarget: EditarraJourneyTarget = !topicReady
    ? 'agenda:parrilla'
    : !sourcesReady || noteBlocked
      ? 'auditoria'
      : !draftReady
        ? 'editor:draft'
        : !auditReady
          ? 'auditoria'
          : 'editor:workspace';

  const stages: EditarraJourneyStage[] = [
    stage({
      id: 'radar',
      label: 'Radar',
      status: hasCandidates ? 'listo' : 'activo',
      detail: hasCandidates
        ? `${candidateCount} candidatos detectados desde ${sourceSeedCount} semillas.`
        : 'Buscar temas con fuentes semilla antes de producir nuevas notas.',
      control: hasCandidates ? 'Radar con candidatos' : 'Buscar temas',
      metric: `${sourceSeedCount} semillas`,
      actionLabel: hasCandidates ? 'Abrir Radar' : 'Buscar temas',
      target: 'agenda:radar',
    }),
    stage({
      id: 'candidatos',
      label: 'Candidatos',
      status: candidateResolved ? 'listo' : hasCandidates ? 'activo' : 'pendiente',
      detail: candidateResolved
        ? `Nota activa: ${selectedTopicTitle}.`
        : hasCandidates
          ? 'Preseleccionar o convertir un candidato antes de redactar.'
          : 'Esperando resultados del Radar.',
      control: candidateResolved ? 'Tema elegido' : 'Revisar candidatos',
      metric: `${candidateCount} candidatos`,
      actionLabel: candidateResolved ? 'Ver parrilla' : 'Revisar candidatos',
      target: candidateResolved ? 'agenda:parrilla' : 'agenda:candidatos',
    }),
    stage({
      id: 'nota',
      label: 'Nota',
      status: auditReady
        ? 'listo'
        : noteBlocked
          ? 'bloqueado'
          : topicReady
            ? 'activo'
            : 'pendiente',
      detail: auditReady
        ? `Borrador ${draftStatus} con ${sourcesValidated}/${sourcesRequired} fuentes validadas.`
        : !topicReady
          ? 'Convertir o aprobar un tema antes de redactar.'
          : !sourcesReady
            ? `${sourcesValidated}/${sourcesRequired} fuentes validadas; completar evidencia antes de cerrar la nota.`
            : !draftReady
              ? 'Falta generar o completar el borrador operativo.'
              : `${qualityStatus}; ${preflightBlockers} bloqueos y ${preflightWarnings} avisos.`,
      control: auditReady
        ? 'Nota aprobada'
        : !topicReady
          ? 'Elegir tema'
          : !sourcesReady
            ? 'Validar fuentes'
            : !draftReady
              ? 'Redactar nota'
              : preflightBlockers > 0
                ? 'Resolver auditoria'
                : 'Aprobar auditoria',
      metric: `${sourcesValidated}/${sourcesRequired} fuentes`,
      actionLabel: auditReady
        ? 'Abrir editor'
        : !topicReady
          ? 'Abrir parrilla'
          : !sourcesReady || preflightBlockers > 0
            ? 'Abrir auditoria'
            : 'Abrir borrador',
      target: noteTarget,
    }),
    stage({
      id: 'imagenes',
      label: 'Imagenes',
      status: imageReady
        ? 'listo'
        : imageBlocked
          ? 'bloqueado'
          : auditReady
            ? 'activo'
            : 'pendiente',
      detail: imageReady
        ? `Manifest visual listo: ${imageExpectedFilename}.`
        : imageBlocked
          ? 'La imagen fue descartada; preparar un nuevo prompt visual.'
          : 'Generar prompt/manifiesto visual antes de exportar la nota.',
      control: imageReady ? 'Imagen preparada' : 'Preparar imagen',
      metric: imageStatus,
      actionLabel: 'Abrir imagenes',
      target: 'imagenes',
    }),
    stage({
      id: 'publicacion',
      label: 'Publicacion',
      status: publicationReady
        ? 'listo'
        : publicationStatus === 'bloqueado' && auditReady && imageReady
          ? 'bloqueado'
          : auditReady && imageReady
            ? 'activo'
            : 'pendiente',
      detail: publicationReady
        ? `Preview y payload listos para ${publicationTargetCount} CMS.`
        : publicationNextAction,
      control: publicationReady ? 'Lista para sacar' : 'Preparar preview',
      metric: `${publicationTargetCount} CMS`,
      actionLabel: 'Ver publicacion',
      target: 'publicacion',
    }),
  ];

  const blockers = [
    !hasCandidates ? 'Radar sin candidatos utiles' : '',
    hasCandidates && !candidateResolved ? 'Candidatos sin convertir a tema' : '',
    topicReady && !sourcesReady ? `${sourcesValidated}/${sourcesRequired} fuentes validadas` : '',
    topicReady && sourcesReady && !draftReady ? 'nota sin borrador completo' : '',
    noteBlocked ? `${preflightBlockers} bloqueos de auditoria` : '',
    imageBlocked ? 'imagen descartada' : '',
    auditReady && !imageReady ? 'imagen sin prompt/manifiesto listo' : '',
    auditReady && imageReady && !publicationReady ? 'preview o payload de publicacion pendiente' : '',
  ].filter(Boolean);
  const currentStage = firstControlStage(stages);
  const completed = stages.filter((item) => item.status === 'listo').length;
  const activeCredit = stages.some((item) => item.status === 'activo') ? 0.5 : 0;
  const progress = Math.round(((completed + activeCredit) / stages.length) * 100);
  const hasBlockedStage = stages.some((item) => item.status === 'bloqueado');
  const status: EditarraJourneyStatus = publicationReady
    ? 'listo'
    : hasBlockedStage
      ? 'bloqueado'
      : currentStage.id === 'nota' && currentStage.control === 'Aprobar auditoria'
        ? 'control_humano'
        : 'operando';

  return {
    status,
    progress: Math.min(100, progress),
    currentStageId: currentStage.id,
    nextControl: currentStage.control,
    blockers,
    stages,
  };
};
