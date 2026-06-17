import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildEditarraAiHandoff,
  buildEditarraAiRunRequest,
} from '../features/editarra/aiAdapter';
import { buildEditarraBatch, buildEditarraDistributionPlan, buildEditarraPackage, createAuditEvent } from '../features/editarra/operations';
import type { DraftVariantKey, EditorialPackageFileKey } from '../features/editarra/operations';
import AgendaPanel from '../features/editarra/AgendaPanel';
import AuditPanel from '../features/editarra/AuditPanel';
import AuthorsPanel from '../features/editarra/AuthorsPanel';
import ConfigPortablePanel from '../features/editarra/ConfigPortablePanel';
import EditarraShell from '../features/editarra/EditarraShell';
import EditorialRulesPanel from '../features/editarra/EditorialRulesPanel';
import ImagesPanel from '../features/editarra/ImagesPanel';
import NoteEditorPanel from '../features/editarra/NoteEditorPanel';
import OpsCockpit from '../features/editarra/OpsCockpit';
import type { OpsCockpitLane } from '../features/editarra/OpsCockpit';
import OperationFlowPanel from '../features/editarra/OperationFlowPanel';
import type { OperationFlowStage } from '../features/editarra/OperationFlowPanel';
import OperationalWorkspacePanel from '../features/editarra/OperationalWorkspacePanel';
import PublicationPanel from '../features/editarra/PublicationPanel';
import RunCockpitPanel from '../features/editarra/RunCockpitPanel';
import type {
  AiHandoffSummary,
  AiRunRequestSummary,
  ClosureControlSummary,
  DailyBatchControlSummary,
  SourceControlSummary,
} from '../features/editarra/RunCockpitContracts';
import SeoExperimentsPanel from '../features/editarra/SeoExperimentsPanel';
import { Badge, Modal, cx, type EditarraTone } from '../features/editarra/uiPrimitives';
import {
  buildEditarraPublicationManifest,
  buildPublicationTargets,
  defaultPublicationDestinations,
} from '../features/editarra/publicationAdapter';
import { buildPublicationSentOutcome } from '../features/editarra/publicationFlowModel';
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
  type EditarraDownloadCommand,
  type EditarraHandoffCommand,
} from '../features/editarra/packageHandoffModel';
import {
  buildEditorialNoteProposal,
  buildImageProductionPrompt,
  buildPublicNoteExportBundle,
  buildRadarRunReport,
} from '../features/editarra/editorialFlowModel';
import {
  buildEditarraJourneyState,
  type EditarraJourneyTarget,
} from '../features/editarra/editorialJourneyModel';
import { buildEditarraExportPayload } from '../features/editarra/exportPayloadModel';
import {
  createImagePrompt,
  removeImagePromptFromWorkflow,
  toggleReusableImageId,
  updateImagePromptList,
} from '../features/editarra/imageWorkflowModel';
import { buildOperationViewModel } from '../features/editarra/operationViewModel';
import { buildTopicStatusTransition } from '../features/editarra/topicStatusTransitionModel';
import GuidedGeneratorPanel from '../features/editarra/GuidedGeneratorPanel';
import { buildGuidedAutopilotPlan, buildGuidedNextStep, createGuidedRunRecord } from '../features/editarra/guidedEngine';
import type { GuidedAssistedDecision, GuidedAutopilotPlan, GuidedPipelineSnapshot, GuidedRunRecord, GuidedRunSummary } from '../features/editarra/guidedEngine';
import {
  buildGuidedAssistedExecution,
  buildGuidedExecutionOutcome,
  buildGuidedNextStepExecution,
  buildPipelineActionExecution,
  buildPipelineControlExecutionPlan,
  type GuidedExecutionOperation,
  type GuidedExecutionOutcome,
  type GuidedExecutionPlan,
} from '../features/editarra/guidedOrchestrator';
import { buildEditarraPipelineState } from '../features/editarra/pipelineModel';
import type { EditarraPipelineActionId } from '../features/editarra/pipelineModel';
import {
  buildDiscoveryRequest,
  buildSourceResearchPrompt,
  agendaSeed,
  createDefaultEditorialAgenda,
  discoveryCandidateStatuses,
} from '../features/editarra/radarModel';
import type {
  DiscoveryCandidate,
  DiscoveryCandidateStatus,
  DiscoveryRun,
  EditorialAgenda,
} from '../features/editarra/radarModel';
import { editarraRadarApi } from '../features/editarra/editarraRadarApi';
import { ApiError } from '../services/api';
import { buildEditarraNoteRun, buildEditarraProfileRuntime } from '../features/editarra/runModel';
import {
  buildGeneratedDraft,
  buildProfileNoteGeneration,
  buildRecipeTopicPatch,
  isGuidedEvidenceRecord,
} from '../features/editarra/generationFlow';
import {
  buildCockpitDailyBatch,
  buildCockpitGeneratedRun,
  buildDailyBatchAutopilot,
  buildProfileNoteOperation,
  buildSingleNoteAutopilot,
} from '../features/editarra/operationalRunModel';
import {
  buildCockpitDailyBatchCommit,
  buildCockpitGeneratedRunCommit,
  buildDailyBatchAutopilotCommit,
  buildProfileNoteCommit,
  buildSingleNoteAutopilotCommit,
} from '../features/editarra/operationalCommitModel';
import { applyEditarraOperationalCommit } from '../features/editarra/operationalCommitController';
import { buildEditarraOperationalContract } from '../features/editarra/operationalContractModel';
import { buildEditarraAutomationRecipe } from '../features/editarra/automationRecipeModel';
import { buildOperationModeApplication, buildProfileFromOperationMode } from '../features/editarra/operationModeModel';
import { buildOperationalRunQueue, type OperationalRunQueueItem } from '../features/editarra/runQueueModel';
import {
  applyMissionPresetToNote,
  buildMissionPresetId,
  createMissionPresetFromWorkspace,
  mergeMissionPresetVariables,
  missionPresetToExecutableRecipe,
  type EditarraMissionPreset,
} from '../features/editarra/missionPresetModel';
import {
  buildAnalyticsFeedbackApplication,
  buildAnalyticsRecordCreation,
  buildAnalyticsRecordRemoval,
  buildSeoExperimentCreation,
  buildSeoExperimentRemoval,
  buildSeoExperimentSelection,
} from '../features/editarra/seoAnalyticsModel';
import {
  buildDailyBatchGuidedEvidenceCompletion,
  buildEvidenceValidation,
  buildGuidedEvidenceCompletion,
  buildGuidedEvidenceSlotCreationAndCompletion,
  buildGuidedEvidenceSlotCreation,
  buildManualEvidenceCreation,
  type EvidenceFlowOutcome,
} from '../features/editarra/evidenceFlowModel';
import {
  buildDailyBatchAiApplication,
  buildDailyBatchAuditApproval,
  buildDailyBatchPayloadPreparation,
  type DailyBatchFlowOutcome,
} from '../features/editarra/dailyBatchFlowModel';
import {
  buildAiBriefSelection,
  buildAuditApprovalAndPayloadPreparation,
  buildAiResponseApplication,
  buildFinalPayloadPreparation,
  buildGuidedAuditApproval,
  buildLocalAiResponseGeneration,
  buildLocalAiResponseGenerationAndApplication,
  type SingleNoteFlowOutcome,
} from '../features/editarra/singleNoteFlowModel';
import { buildGuidedRunStages, defaultNoteVariableValues, editorialProfiles, noteRecipes, operationModes } from '../features/editarra/profileModel';
import type { EditorialProfile, EditarraRecipeKey, NoteRecipe } from '../features/editarra/profileModel';
import { buildEditarraSelectionModel, postingModeLabels } from '../features/editarra/selectionModel';
import {
  buildOperationalWorkspace,
  buildOperationalWorkspacePlan,
  buildVisibleNoteVariables,
  completeRecipeVariables,
  mergeNoteVariableOverrides,
} from '../features/editarra/workspaceModel';
import { clearStoredEditarraState } from '../features/editarra/storageAdapter';
import {
  createBlankAuthorInfluence,
  createDefaultAuthor,
  createDefaultTopic,
  createDefaultWorkflowVariable,
  reduceEditarraDomainState,
} from '../features/editarra/domainReducer';
import type { EditarraDomainAction, EditarraDomainState } from '../features/editarra/domainReducer';
import {
  createDraftVersionSnapshot,
  nextDraftVersionNumber,
} from '../features/editarra/productionReducer';
import {
  buildCandidateNoteRunConversion,
  buildCandidateTopicConversion,
  upsertConvertedTopic,
} from '../features/editarra/candidateConversionModel';
import {
  buildRadarBackendRejected,
  buildRadarDiscoveryGuard,
  buildRadarLocalFallback,
  buildRadarRemoteSuccess,
  mergeAgendaForRadarRun,
  upsertDiscoveryRun,
  type CandidateRunScope,
} from '../features/editarra/radarDiscoveryModel';
import {
  removeAgendaFromRadarState,
  updateDiscoveryCandidateStatusInList,
  upsertDiscoveryCandidateList,
} from '../features/editarra/radarStateModel';
import {
  buildCopyDiscoveryRequestHandoff,
  buildCopySourceResearchPromptHandoff,
  buildDiscoveryResultsImport,
} from '../features/editarra/radarHandoffModel';
import type {
  AnalyticsRecord,
  DistributionActions,
  DraftStatus,
  DraftVersion,
  EditarraProductionState,
  EditorialDraft,
  EvidenceRecord,
  EvidenceStatus,
  SeoExperiment,
} from '../features/editarra/productionReducer';
import {
  useEditarraAutosave,
  useEditarraProductionState,
  type EditarraProductionHydrators,
} from '../features/editarra/useEditarraStudio';
import type {
  Author,
  AuthorField,
  AuthorInfluence,
  NoteVariableOverride,
  StyleWeightKey,
  Topic,
  TopicStatus,
  VariableScope,
  WorkflowVariable,
} from '../features/editarra/workspaceModel';

type TabKey = 'operacion' | 'agenda' | 'autores' | 'editor' | 'imagenes' | 'publicacion' | 'auditoria' | 'config';
type AgendaEntryMode = 'radar' | 'candidatos' | 'parrilla' | 'config';
type StatusFilter = TopicStatus | 'todos';
type CandidateStatusFilter = DiscoveryCandidateStatus | 'todos';
type EditorSurface = 'workspace' | 'draft' | 'guided';

function scrollWindowTop() {
  if (
    typeof window === 'undefined' ||
    typeof window.scrollTo !== 'function' ||
    (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent))
  ) {
    return;
  }

  try {
    window.scrollTo({ top: 0, behavior: 'auto' });
  } catch {
    // jsdom does not implement scrollTo.
  }
}

import {
  analyticsSeed,
  auditSeed,
  authorSeed,
  boundedNumber,
  buildEditarraResetBaseline,
  buildImportedEditarraState,
  buildPersistedEditarraState,
  defaultStyleWeights,
  draftSeed,
  draftCopies,
  draftStatusTone,
  draftVersionSeed,
  editorRuleSeed,
  evidenceSeed,
  formatPackageJson,
  getDailyBatchRecipeId,
  getDailyBatchTopicPrefix,
  hydrateAnalyticsRecords,
  hydrateAuditEvents,
  hydrateAuthors,
  hydrateDraftVersions,
  hydrateDrafts,
  hydrateEditorRules,
  hydrateDiscoveryCandidates,
  hydrateDiscoveryRuns,
  hydrateEditorialAgendas,
  hydrateEditorialProfiles,
  hydrateEvidence,
  hydrateGuidedRunRecords,
  hydrateImagePrompts,
  hydrateMissionPresets,
  hydrateNoteVariableOverrides,
  hydrateSeoExperiments,
  hydrateTopics,
  hydrateWorkflowVariables,
  normalizeImportedState,
  packageFileKeys,
  productionHydrators,
  readStoredState,
  runtimePackageFileKeys,
  seoExperimentSeed,
  seoStrategies,
  tabs,
  topicSeed,
  evidenceStatuses,
  trafficSources,
  variableScopes,
  variableSeed,
  workflowSteps,
  type AuditEvent,
  type EditorRule,
  type ImagePrompt,
  type PersistedEditarraState,
} from '../features/editarra/persistenceModel';

const evidenceTone: Record<EvidenceStatus, EditarraTone> = {
  pendiente: 'amber',
  validado: 'emerald',
  riesgo: 'rose',
};

export default function EditarraPage() {
  const [initialState] = useState<PersistedEditarraState>(() => readStoredState());
  const [activeTab, setActiveTab] = useState<TabKey>('operacion');
  const [agendaEntryMode, setAgendaEntryMode] = useState<AgendaEntryMode>('radar');
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [profiles, setProfiles] = useState<EditorialProfile[]>(() => hydrateEditorialProfiles(initialState.profiles));
  const [selectedSiteId, setSelectedSiteId] = useState(initialState.selectedSiteId || editorialProfiles[0].id);
  const [selectedRecipeId, setSelectedRecipeId] = useState<EditarraRecipeKey>(initialState.selectedRecipeId || 'reactiva');
  const [selectedOperationModeId, setSelectedOperationModeId] = useState(initialState.selectedOperationModeId || operationModes[0].id);
  const [authors, setAuthors] = useState<Author[]>(() => hydrateAuthors(initialState.authors));
  const [topics, setTopics] = useState<Topic[]>(() => hydrateTopics(initialState.topics));
  const [editorialAgendas, setEditorialAgendas] = useState<EditorialAgenda[]>(() => hydrateEditorialAgendas(initialState.editorialAgendas));
  const [selectedAgendaId, setSelectedAgendaId] = useState(() => {
    const hydratedAgendas = hydrateEditorialAgendas(initialState.editorialAgendas);
    return initialState.selectedAgendaId && hydratedAgendas.some((agenda) => agenda.id === initialState.selectedAgendaId)
      ? initialState.selectedAgendaId
      : hydratedAgendas[0]?.id || 'agenda-umsa-diaria';
  });
  const [discoveryCandidates, setDiscoveryCandidates] = useState<DiscoveryCandidate[]>(() => hydrateDiscoveryCandidates(initialState.discoveryCandidates));
  const [discoveryRuns, setDiscoveryRuns] = useState<DiscoveryRun[]>(() => hydrateDiscoveryRuns(initialState.discoveryRuns));
  const [candidateStatusFilter, setCandidateStatusFilter] = useState<CandidateStatusFilter>(initialState.candidateStatusFilter || 'todos');
  const [candidateRunScope, setCandidateRunScope] = useState<CandidateRunScope>(initialState.candidateRunScope || 'ultimo_run');
  const [radarQuery, setRadarQuery] = useState('');
  const [discoveryStatus, setDiscoveryStatus] = useState('Radar listo para buscar temas.');
  const [draftMode, setDraftMode] = useState<DraftVariantKey>('humanizado');
  const [editorSurface, setEditorSurface] = useState<EditorSurface>('workspace');
  const [reusableImages, setReusableImages] = useState<string[]>(initialState.reusableImages || ['img-001']);
  const [showExport, setShowExport] = useState(false);
  const [selectedTopicId, setSelectedTopicId] = useState(() => {
    const hydratedTopics = hydrateTopics(initialState.topics);
    return initialState.selectedTopicId && hydratedTopics.some((topic) => topic.id === initialState.selectedTopicId)
      ? initialState.selectedTopicId
      : hydratedTopics[0]?.id || topicSeed[0].id;
  });
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todos');
  const [workflowVariables, setWorkflowVariables] = useState<WorkflowVariable[]>(() => hydrateWorkflowVariables(initialState.workflowVariables));
  const [noteVariableOverrides, setNoteVariableOverrides] = useState<NoteVariableOverride[]>(() => hydrateNoteVariableOverrides(initialState.noteVariableOverrides));
  const [missionPresets, setMissionPresets] = useState<EditarraMissionPreset[]>(() => hydrateMissionPresets(initialState.missionPresets));
  const [imagePrompts, setImagePrompts] = useState<ImagePrompt[]>(() => hydrateImagePrompts(initialState.imagePrompts));
  const [editorRules, setEditorRules] = useState<EditorRule[]>(() => hydrateEditorRules(initialState.editorRules));
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>(() => hydrateAuditEvents(initialState.auditEvents));
  const [selectedPublicationDestinationId, setSelectedPublicationDestinationId] = useState(
    initialState.selectedPublicationDestinationId
      || profiles.find((profile) => profile.id === selectedSiteId)?.defaultPublicationDestinationId
      || 'umsa-blog',
  );
  const { productionState, dispatchProductionAction } = useEditarraProductionState(
    initialState,
    productionHydrators,
  );
  const {
    drafts,
    evidence,
    draftVersions,
    seoExperiments,
    analyticsRecords,
    guidedRunRecords,
    distributionActions,
  } = productionState;
  const [importBuffer, setImportBuffer] = useState('');
  const [importStatus, setImportStatus] = useState('Listo para recibir JSON portable.');
  const [aiResponseBuffer, setAiResponseBuffer] = useState('');
  const [aiStatus, setAiStatus] = useState('Brief AI listo para exportar o completar con una respuesta JSON.');
  const [draftStatusMessage, setDraftStatusMessage] = useState('Borrador listo para operar sobre el tema seleccionado.');
  const [packageFileKey, setPackageFileKey] = useState<EditorialPackageFileKey>(
    initialState.packageFileKey && packageFileKeys.includes(initialState.packageFileKey)
      ? initialState.packageFileKey
      : 'article.md',
  );
  const [packageStatus, setPackageStatus] = useState('Paquete listo para generar sobre el tema activo.');
  const [batchStatus, setBatchStatus] = useState('Lote listo para calcular temas publicables.');
  const [distributionStatus, setDistributionStatus] = useState('Cola lista para preparar distribucion multicanal.');
  const [guidedFlowStatus, setGuidedFlowStatus] = useState('Flujo asistido listo; avanza hasta el próximo control humano.');
  const agendaSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const agendaSaveSequenceRef = useRef(0);

  useEffect(() => {
    scrollWindowTop();
  }, [activeTab, editorSurface]);

  useEffect(() => () => {
    if (agendaSaveTimerRef.current) {
      clearTimeout(agendaSaveTimerRef.current);
    }
  }, []);

  const stateToPersist = useMemo<PersistedEditarraState>(() => buildPersistedEditarraState({
    selectedSiteId,
    selectedRecipeId,
    selectedOperationModeId,
    selectedPublicationDestinationId,
    profiles,
    authors,
    topics,
    selectedTopicId,
    editorialAgendas,
    selectedAgendaId,
    discoveryCandidates,
    discoveryRuns,
    candidateStatusFilter,
    candidateRunScope,
    reusableImages,
    workflowVariables,
    noteVariableOverrides,
    missionPresets,
    imagePrompts,
    editorRules,
    auditEvents,
    productionState,
    packageFileKey,
  }), [auditEvents, authors, candidateRunScope, candidateStatusFilter, discoveryCandidates, discoveryRuns, editorRules, editorialAgendas, imagePrompts, missionPresets, noteVariableOverrides, packageFileKey, productionState, profiles, reusableImages, selectedAgendaId, selectedOperationModeId, selectedPublicationDestinationId, selectedRecipeId, selectedSiteId, selectedTopicId, topics, workflowVariables]);
  const lastSavedAt = useEditarraAutosave(stateToPersist);

  const {
    selectedWorkflowProfile,
    selectedSite,
    selectedRecipe,
    selectedOperationMode,
    activeAuthors,
    approvedTopics,
    topicTokenBudget,
    filteredTopics,
    selectedTopic,
    selectedAuthor,
    selectedTopicScore,
    selectedDraft,
    currentDraft,
    selectedImagePrompt,
    selectedTopicEvidence,
    validatedEvidenceCount,
    guidedTopicEvidence,
    pendingGuidedEvidence,
    dailyBatchControl,
    selectedTopicSeoExperiments,
    selectedSeoExperiment,
    selectedTopicAnalytics,
    latestTopicAnalytics,
    totalAnalyticsVisits,
    averagePerformanceScore,
    authorPerformance,
    selectedDraftVersions,
    latestDraftVersion,
  } = useMemo(() => buildEditarraSelectionModel({
    profiles,
    selectedSiteId,
    selectedRecipeId,
    selectedOperationModeId,
    authors,
    topics,
    drafts,
    evidence,
    draftVersions,
    seoExperiments,
    analyticsRecords,
    imagePrompts,
    reusableImages,
    selectedTopicId,
    draftMode,
    query,
    statusFilter,
    getDailyBatchTopicPrefix,
    isGuidedEvidenceRecord,
  }), [
    analyticsRecords,
    authors,
    draftMode,
    draftVersions,
    drafts,
    evidence,
    imagePrompts,
    profiles,
    query,
    reusableImages,
    selectedOperationModeId,
    selectedRecipeId,
    selectedSiteId,
    selectedTopicId,
    seoExperiments,
    statusFilter,
    topics,
  ]);
  const selectedAgenda = useMemo(() => (
    editorialAgendas.find((agenda) => agenda.id === selectedAgendaId) || editorialAgendas[0] || createDefaultEditorialAgenda({
      id: 'agenda-local',
      profiles,
      authors,
      operationModes,
    })
  ), [authors, editorialAgendas, profiles, selectedAgendaId]);
  const latestDiscoveryRun = useMemo(() => (
    discoveryRuns
      .filter((run) => run.agendaId === selectedAgenda.id)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0]
  ), [discoveryRuns, selectedAgenda.id]);
  const latestDiscoveryRunId = latestDiscoveryRun?.id;
  const previousDiscoveryCandidates = useMemo(() => (
    discoveryCandidates.filter((candidate) => (
      candidate.agendaId === selectedAgenda.id && (!latestDiscoveryRunId || candidate.runId !== latestDiscoveryRunId)
    ))
  ), [discoveryCandidates, latestDiscoveryRunId, selectedAgenda.id]);
  const activeRadarRunReport = useMemo(() => buildRadarRunReport({
    agenda: selectedAgenda,
    run: latestDiscoveryRun,
    candidates: discoveryCandidates,
    previousCandidates: previousDiscoveryCandidates,
  }), [
    discoveryCandidates,
    latestDiscoveryRun,
    previousDiscoveryCandidates,
    selectedAgenda,
  ]);
  const filteredDiscoveryCandidates = useMemo(() => (
    discoveryCandidates
      .filter((candidate) => candidate.agendaId === selectedAgenda.id)
      .filter((candidate) => candidateRunScope === 'historico' || !latestDiscoveryRunId || candidate.runId === latestDiscoveryRunId)
      .filter((candidate) => candidateStatusFilter === 'todos' || candidate.status === candidateStatusFilter)
      .sort((a, b) => {
        if (candidateRunScope === 'ultimo_run') {
          const aOrder = typeof a.runOrder === 'number' ? a.runOrder : Number.MAX_SAFE_INTEGER;
          const bOrder = typeof b.runOrder === 'number' ? b.runOrder : Number.MAX_SAFE_INTEGER;
          const orderDiff = aOrder - bOrder;
          if (orderDiff !== 0) {
            return orderDiff;
          }
        }
        const updatedDiff = String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
        if (updatedDiff !== 0) {
          return updatedDiff;
        }
        return b.score - a.score;
      })
  ), [candidateRunScope, candidateStatusFilter, discoveryCandidates, latestDiscoveryRunId, selectedAgenda.id]);
  const discoveryRequestPayload = useMemo(() => (
    buildDiscoveryRequest(selectedAgenda, radarQuery)
  ), [radarQuery, selectedAgenda]);
  const discoveryRequestJson = useMemo(() => (
    formatPackageJson(discoveryRequestPayload)
  ), [discoveryRequestPayload]);
  const sourceResearchPrompt = useMemo(
    () => buildSourceResearchPrompt(selectedAgenda, radarQuery).prompt,
    [radarQuery, selectedAgenda],
  );

  useEffect(() => {
    let cancelled = false;

    const loadRadarState = async () => {
      try {
        const [remoteAgendaResponse, remoteCandidateResponse, remoteRunResponse] = await Promise.all([
          editarraRadarApi.listAgendas(''),
          editarraRadarApi.listCandidates(''),
          editarraRadarApi.listRuns(''),
        ]);
        const rawRemoteAgendas = Array.isArray(remoteAgendaResponse.agendas) ? remoteAgendaResponse.agendas : [];
        const rawRemoteCandidates = Array.isArray(remoteCandidateResponse.candidates) ? remoteCandidateResponse.candidates : [];
        const rawRemoteRuns = Array.isArray(remoteRunResponse.runs) ? remoteRunResponse.runs : [];
        const remoteAgendas = rawRemoteAgendas.length > 0 ? hydrateEditorialAgendas(rawRemoteAgendas) : [];
        const remoteCandidates = rawRemoteCandidates.length > 0 ? hydrateDiscoveryCandidates(rawRemoteCandidates) : [];
        const remoteRuns = rawRemoteRuns.length > 0 ? hydrateDiscoveryRuns(rawRemoteRuns) : [];

        if (cancelled) {
          return;
        }

        if (remoteAgendas.length > 0) {
          setEditorialAgendas(remoteAgendas);
          setSelectedAgendaId((current) => (
            remoteAgendas.some((agenda) => agenda.id === current) ? current : remoteAgendas[0].id
          ));
        }

        if (remoteCandidates.length > 0) {
          setDiscoveryCandidates(remoteCandidates);
        }

        if (remoteRuns.length > 0) {
          setDiscoveryRuns(remoteRuns);
        }

        setDiscoveryStatus('Radar sincronizado con Mongo.');
      } catch {
        if (!cancelled) {
          setDiscoveryStatus('Radar local activo; backend no sincronizado.');
        }
      }
    };

    loadRadarState();

    return () => {
      cancelled = true;
    };
  }, []);

  const activeTabMeta = tabs.find((tab) => tab.key === activeTab) || tabs[0];
  const activeNoteVariableOverrides = useMemo(() => (
    noteVariableOverrides.filter((override) => (
      override.topicId === selectedTopic.id && override.recipeId === selectedRecipe.id
    ))
  ), [noteVariableOverrides, selectedRecipe.id, selectedTopic.id]);
  const selectedGuidedRunRecords = useMemo(() => (
    guidedRunRecords.filter((record) => record.topicId === selectedTopic.id)
  ), [guidedRunRecords, selectedTopic.id]);
  const topicTitleById = useMemo(() => (
    new Map(topics.map((topic) => [topic.id, topic.title]))
  ), [topics]);
  const toGuidedRunSummary = (record: GuidedRunRecord): GuidedRunSummary => ({
    id: record.id,
    topicId: record.topicId,
    recipeId: record.recipeId,
    profileId: record.profileId,
    status: record.status,
    summary: record.summary,
    nextControl: record.nextControl,
    time: record.time,
    topicTitle: topicTitleById.get(record.topicId) || record.topicId,
    isActiveTopic: record.topicId === selectedTopic.id,
  });
  const visibleGuidedRuns: GuidedRunSummary[] = selectedGuidedRunRecords.map(toGuidedRunSummary);
  const recentGuidedRuns: GuidedRunSummary[] = guidedRunRecords.slice(0, 8).map(toGuidedRunSummary);
  const operationalRunQueue = useMemo(() => (
    buildOperationalRunQueue([...visibleGuidedRuns, ...recentGuidedRuns])
  ), [recentGuidedRuns, visibleGuidedRuns]);
  const effectiveWorkflowVariables = useMemo(() => (
    mergeNoteVariableOverrides(
      completeRecipeVariables(selectedRecipe, workflowVariables),
      activeNoteVariableOverrides,
    )
  ), [activeNoteVariableOverrides, selectedRecipe, workflowVariables]);
  const editorialPackage = useMemo(() => buildEditarraPackage({
    topic: selectedTopic,
    author: selectedAuthor,
    draft: currentDraft,
    imagePrompt: selectedImagePrompt,
    rules: editorRules,
    variables: effectiveWorkflowVariables,
    evidence,
    seoExperiments,
    analyticsRecords,
    draftVersions,
    auditEvents,
    hostUrl: selectedSite.domain,
    route: '/editarra',
  }), [analyticsRecords, auditEvents, currentDraft, draftVersions, editorRules, effectiveWorkflowVariables, evidence, selectedAuthor, selectedImagePrompt, selectedSite.domain, selectedTopic, seoExperiments]);
  const aiHandoff = useMemo(() => buildEditarraAiHandoff({
    aiBrief: editorialPackage.aiBrief as Record<string, unknown>,
    publicationPayload: editorialPackage.publicationPayload as Record<string, unknown>,
    qualityStatus: editorialPackage.qualityAudit.status,
    sourceCount: validatedEvidenceCount,
    requiredSources: selectedWorkflowProfile.sourceMinimum,
  }), [editorialPackage.aiBrief, editorialPackage.publicationPayload, editorialPackage.qualityAudit.status, selectedWorkflowProfile.sourceMinimum, validatedEvidenceCount]);
  const blockingPreflightChecks = editorialPackage.preflight.filter((check) => check.severity === 'bloqueante' && !check.passed);
  const nonStatusBlockingChecks = blockingPreflightChecks.filter((check) => check.id !== 'draft-status');
  const preflightBlockers = blockingPreflightChecks.length;
  const preflightWarnings = editorialPackage.preflight.filter((check) => check.severity === 'advertencia' && !check.passed).length;
  const selectedTopicReady = ['aprobado', 'redaccion', 'publicado'].includes(selectedTopic.status);
  const selectedSourcesReady = validatedEvidenceCount >= selectedWorkflowProfile.sourceMinimum;
  const selectedQualityReady = editorialPackage.qualityAudit.status === 'apto_para_revision';
  const selectedDraftStructured = editorialPackage.qualityAudit.required_headings.every((item) => item.present);
  const selectedDraftReady = currentDraft.body.trim().length > 120 && selectedDraftStructured;
  const selectedPayloadReady = Boolean(editorialPackage.publicationPayload.contenido);
  const canApproveGuidedAudit = (
    selectedDraftReady
    && selectedQualityReady
    && selectedSourcesReady
    && nonStatusBlockingChecks.length === 0
    && !['aprobado', 'publicado'].includes(currentDraft.status)
  );
  const guidedAuditRequirements = [
    !selectedDraftReady ? 'borrador insuficiente' : '',
    !selectedQualityReady ? 'quality_audit.json requiere revisión' : '',
    !selectedSourcesReady ? `${validatedEvidenceCount}/${selectedWorkflowProfile.sourceMinimum} fuentes validadas` : '',
    ...nonStatusBlockingChecks.map((check) => check.label),
  ].filter(Boolean);
  const guidedPipelineSnapshot: GuidedPipelineSnapshot = {
    topicTitle: selectedTopic.title,
    topicStatus: selectedTopic.status,
    topicEvidenceCount: selectedTopicEvidence.length,
    validatedEvidenceCount,
    selectedTopicReady,
    selectedSourcesReady,
    selectedDraftReady,
    selectedQualityReady,
    selectedPayloadReady,
    canApproveGuidedAudit,
    preflightBlockers,
    preflightWarnings,
    guidedAuditRequirements,
  };
  const guidedRunStages = buildGuidedRunStages({
    profile: selectedWorkflowProfile,
    recipe: selectedRecipe,
    topicStatus: selectedTopic.status,
    sourceCount: validatedEvidenceCount,
    hasDraft: selectedDraftReady,
    qualityStatus: editorialPackage.qualityAudit.status,
    hasPayload: selectedPayloadReady,
    blockers: preflightBlockers,
  });
  const guidedNextStep = buildGuidedNextStep({
    profile: selectedWorkflowProfile,
    recipe: selectedRecipe,
    snapshot: guidedPipelineSnapshot,
  });
  const guidedAutopilotPlan: GuidedAutopilotPlan = buildGuidedAutopilotPlan({
    profile: selectedWorkflowProfile,
    recipe: selectedRecipe,
    snapshot: guidedPipelineSnapshot,
    nextStep: guidedNextStep,
    pendingGuidedEvidenceCount: pendingGuidedEvidence.length,
  });
  const visibleNoteVariables = useMemo(() => buildVisibleNoteVariables({
    recipe: selectedRecipe,
    variables: effectiveWorkflowVariables,
    overrides: activeNoteVariableOverrides,
  }), [activeNoteVariableOverrides, effectiveWorkflowVariables, selectedRecipe]);
  const operationalWorkspace = useMemo(() => buildOperationalWorkspace({
    profile: selectedWorkflowProfile,
    recipe: selectedRecipe,
    topic: selectedTopic,
    author: selectedAuthor,
    authors,
    variables: effectiveWorkflowVariables,
    noteVariableOverrides: activeNoteVariableOverrides,
    sourceCount: validatedEvidenceCount,
    preflightBlockers,
    hasDraft: selectedDraftReady,
    hasPayload: selectedPayloadReady,
  }), [
    activeNoteVariableOverrides,
    authors,
    effectiveWorkflowVariables,
    preflightBlockers,
    selectedAuthor,
    selectedDraftReady,
    selectedPayloadReady,
    selectedRecipe,
    selectedTopic,
    selectedWorkflowProfile,
    validatedEvidenceCount,
  ]);
  const buildExecutableRecipeFor = (
    recipe: NoteRecipe,
    author: typeof selectedAuthor,
    variables = completeRecipeVariables(recipe, effectiveWorkflowVariables),
    overrides = recipe.id === selectedRecipe.id ? activeNoteVariableOverrides : [],
  ) => buildOperationalWorkspacePlan({
    recipe,
    author,
    visibleVariables: buildVisibleNoteVariables({
      recipe,
      variables,
      overrides,
    }),
    noteVariableOverrides: overrides,
  });
  const aiRunRequest = useMemo(() => buildEditarraAiRunRequest({
    handoff: aiHandoff,
    aiBrief: editorialPackage.aiBrief as Record<string, unknown>,
    operationModeId: selectedOperationMode.id,
    recipeId: selectedRecipe.id,
    profileId: selectedWorkflowProfile.id,
    executableRecipe: operationalWorkspace.plan as unknown as Record<string, unknown>,
  }), [
    aiHandoff,
    editorialPackage.aiBrief,
    operationalWorkspace.plan,
    selectedOperationMode.id,
    selectedRecipe.id,
    selectedWorkflowProfile.id,
  ]);
  const editorialBatch = useMemo(() => buildEditarraBatch({
    topics,
    authors,
    drafts,
    imagePrompts,
    rules: editorRules,
    variables: workflowVariables,
    evidence,
    seoExperiments,
    analyticsRecords,
    draftVersions,
    auditEvents,
    hostUrl: selectedSite.domain,
    route: '/editarra',
  }), [analyticsRecords, auditEvents, authors, draftVersions, drafts, editorRules, evidence, imagePrompts, selectedSite.domain, seoExperiments, topics, workflowVariables]);
  const distributionPlan = useMemo(() => buildEditarraDistributionPlan({
    batch: editorialBatch,
    topics,
    variables: workflowVariables,
    hostUrl: selectedSite.domain,
  }), [editorialBatch, selectedSite.domain, topics, workflowVariables]);
  const publicationDestinations = useMemo(() => {
    const allowedIds = selectedWorkflowProfile.publicationDestinationIds || ['umsa-blog'];
    const destinations = defaultPublicationDestinations.filter((destination) => allowedIds.includes(destination.id));

    return destinations.length > 0 ? destinations : defaultPublicationDestinations;
  }, [selectedWorkflowProfile.publicationDestinationIds]);
  useEffect(() => {
    if (publicationDestinations.some((destination) => destination.id === selectedPublicationDestinationId)) {
      return;
    }

    const fallbackDestinationId = selectedWorkflowProfile.defaultPublicationDestinationId
      && publicationDestinations.some((destination) => destination.id === selectedWorkflowProfile.defaultPublicationDestinationId)
      ? selectedWorkflowProfile.defaultPublicationDestinationId
      : publicationDestinations[0]?.id || 'umsa-blog';

    setSelectedPublicationDestinationId(fallbackDestinationId);
  }, [
    publicationDestinations,
    selectedPublicationDestinationId,
    selectedWorkflowProfile.defaultPublicationDestinationId,
  ]);
  const publicationTargets = useMemo(() => buildPublicationTargets({
    packageId: editorialPackage.id,
    slug: editorialPackage.slug,
    ready: editorialPackage.ready,
    blockers: preflightBlockers,
    publicationPayload: editorialPackage.publicationPayload as Record<string, unknown>,
    destinations: publicationDestinations,
  }), [
    editorialPackage.id,
    editorialPackage.publicationPayload,
    editorialPackage.ready,
    editorialPackage.slug,
    preflightBlockers,
    publicationDestinations,
  ]);
  const publicationManifest = useMemo(() => buildEditarraPublicationManifest({
    packageId: editorialPackage.id,
    slug: editorialPackage.slug,
    ready: editorialPackage.ready,
    blockers: preflightBlockers,
    warnings: preflightWarnings,
    postingMode: selectedWorkflowProfile.postingMode,
    endpoint: selectedWorkflowProfile.endpoint,
    publicationPayload: editorialPackage.publicationPayload as Record<string, unknown>,
    distributionManifest: distributionPlan.manifest,
    destinations: publicationDestinations,
    publicationTargets,
  }), [
    distributionPlan.manifest,
    editorialPackage.id,
    editorialPackage.publicationPayload,
    editorialPackage.ready,
    editorialPackage.slug,
    preflightBlockers,
    preflightWarnings,
    publicationDestinations,
    publicationTargets,
    selectedWorkflowProfile.endpoint,
    selectedWorkflowProfile.postingMode,
  ]);
  const selectedDiscoveryCandidate = useMemo(() => (
    discoveryCandidates.find((candidate) => (
      candidate.id === selectedTopic.candidateId || (
        selectedTopic.discoverySourceUrl
          && candidate.sourceUrl === selectedTopic.discoverySourceUrl
          && candidate.title === selectedTopic.title
      )
    ))
  ), [discoveryCandidates, selectedTopic.candidateId, selectedTopic.discoverySourceUrl, selectedTopic.title]);
  const activeNoteProposal = useMemo(() => buildEditorialNoteProposal({
    topic: selectedTopic,
    agenda: selectedAgenda,
    candidate: selectedDiscoveryCandidate,
    radarRunReport: activeRadarRunReport,
  }), [
    activeRadarRunReport,
    selectedAgenda,
    selectedDiscoveryCandidate,
    selectedTopic,
  ]);
  const activeImageProductionPrompt = useMemo(() => buildImageProductionPrompt({
    topic: selectedTopic,
    proposal: activeNoteProposal,
    imageManifest: editorialPackage.imageManifest,
  }), [
    activeNoteProposal,
    editorialPackage.imageManifest,
    selectedTopic,
  ]);
  const activePublicExportBundle = useMemo(() => buildPublicNoteExportBundle({
    packageId: editorialPackage.id,
    topic: selectedTopic,
    draft: currentDraft,
    publicationTargets,
    imageManifest: editorialPackage.imageManifest,
    proposal: activeNoteProposal,
    blockers: preflightBlockers,
    warnings: preflightWarnings,
  }), [
    activeNoteProposal,
    currentDraft,
    editorialPackage.id,
    editorialPackage.imageManifest,
    preflightBlockers,
    preflightWarnings,
    publicationTargets,
    selectedTopic,
  ]);
  const activePipelineState = useMemo(() => buildEditarraPipelineState({
    topicStatus: selectedTopic.status,
    sourcesValidated: validatedEvidenceCount,
    sourcesRequired: selectedWorkflowProfile.sourceMinimum,
    draftReady: selectedDraftReady,
    draftStatus: currentDraft.status,
    qualityStatus: editorialPackage.qualityAudit.status,
    preflightBlockers,
    publicationStatus: publicationManifest.status,
    payloadReady: Boolean(editorialPackage.publicationPayload.contenido),
    imageStatus: editorialPackage.imageManifest.status,
  }), [
    currentDraft.status,
    editorialPackage.imageManifest.status,
    editorialPackage.publicationPayload,
    editorialPackage.qualityAudit.status,
    preflightBlockers,
    publicationManifest.status,
    selectedDraftReady,
    selectedTopic.status,
    selectedWorkflowProfile.sourceMinimum,
    validatedEvidenceCount,
  ]);
  const activeProfileRuntime = useMemo(() => buildEditarraProfileRuntime({
    profile: selectedWorkflowProfile,
    author: selectedAuthor,
  }), [selectedAuthor, selectedWorkflowProfile]);
  const activeNoteRun = useMemo(() => buildEditarraNoteRun({
    topic: selectedTopic,
    recipe: selectedRecipe,
    operationMode: selectedOperationMode,
    profileRuntime: activeProfileRuntime,
    pipelineState: activePipelineState,
    visibleVariables: visibleNoteVariables,
    workflowVariables: effectiveWorkflowVariables,
    noteVariableOverrides: activeNoteVariableOverrides,
    aiHandoff,
    exportKeys: packageFileKeys,
    executableRecipe: operationalWorkspace.plan,
    mode: dailyBatchControl.active ? 'daily_batch' : 'single_note',
  }), [
    activeNoteVariableOverrides,
    activePipelineState,
    activeProfileRuntime,
    aiHandoff,
    dailyBatchControl.active,
    effectiveWorkflowVariables,
    operationalWorkspace.plan,
    selectedOperationMode,
    selectedRecipe,
    selectedTopic,
    visibleNoteVariables,
  ]);
  const operationalContract = useMemo(() => buildEditarraOperationalContract({
    workspace: operationalWorkspace,
    profile: selectedWorkflowProfile,
    recipe: selectedRecipe,
    noteRun: activeNoteRun,
    pipeline: activePipelineState,
    aiHandoff,
    runQueue: operationalRunQueue,
    requiredArtifacts: ['note_run.json', 'ai_request.json', 'publication_payload.json'],
  }), [
    activeNoteRun,
    activePipelineState,
    aiHandoff,
    operationalRunQueue,
    operationalWorkspace,
    selectedRecipe,
    selectedWorkflowProfile,
  ]);
  const automationRecipe = useMemo(() => buildEditarraAutomationRecipe({
    workspace: operationalWorkspace,
    noteRun: activeNoteRun,
    pipeline: activePipelineState,
    aiRunRequest,
    runQueue: operationalRunQueue,
    importBackTarget: `${selectedSite.domain}/editarra`,
  }), [
    activeNoteRun,
    activePipelineState,
    aiRunRequest,
    operationalRunQueue,
    operationalWorkspace,
    selectedSite.domain,
  ]);
  const runtimePackageManifest = useMemo(() => ({
    package_id: editorialPackage.id,
    slug: editorialPackage.slug,
    generated_at: new Date().toISOString(),
    files: packageFileKeys,
    runtime_files: runtimePackageFileKeys,
    operator_files: ['radar_run_report.json', 'editorial_proposal.json', 'public_export_bundle.json', 'image_prompt.md', 'operational_contract.json', 'automation_recipe.json'],
    model: 'umsa-diaria',
    target_publication_contract: 'ultimamilla.com.ar/api/blog',
    external_post_enabled: false,
    ready_for_manual_publish: editorialPackage.ready,
    preflight_summary: {
      passed: editorialPackage.preflight.filter((check) => check.passed).length,
      total: editorialPackage.preflight.length,
      blockers: editorialPackage.preflight.filter((check) => check.severity === 'bloqueante' && !check.passed).length,
      warnings: editorialPackage.preflight.filter((check) => check.severity === 'advertencia' && !check.passed).length,
    },
    active_profile_runtime_id: activeProfileRuntime.profileId,
    active_note_run_id: activeNoteRun.id,
    active_radar_run_report_id: activeRadarRunReport.id,
    active_editorial_proposal_id: activeNoteProposal.id,
    active_public_export_bundle_id: activePublicExportBundle.id,
    import_back_target: `${selectedSite.domain}/editarra`,
  }), [
    activeNoteRun.id,
    activeNoteProposal.id,
    activeProfileRuntime.profileId,
    activePublicExportBundle.id,
    activeRadarRunReport.id,
    editorialPackage.id,
    editorialPackage.preflight,
    editorialPackage.ready,
    editorialPackage.slug,
    selectedSite.domain,
  ]);
  const runtimePackageFiles = useMemo(() => ({
    ...editorialPackage.files,
    'radar_run_report.json': formatPackageJson(activeRadarRunReport),
    'editorial_proposal.json': formatPackageJson(activeNoteProposal),
    'public_export_bundle.json': formatPackageJson(activePublicExportBundle),
    'image_prompt.md': `${activeImageProductionPrompt}\n`,
    'publication_targets.json': formatPackageJson({
      product: 'editarra',
      package_id: editorialPackage.id,
      slug: editorialPackage.slug,
      external_post_enabled: false,
      targets: publicationTargets,
    }),
    'profile_runtime.json': formatPackageJson(activeProfileRuntime),
    'note_run.json': formatPackageJson(activeNoteRun),
    'ai_request.json': formatPackageJson(aiRunRequest),
    'operational_contract.json': formatPackageJson(operationalContract),
    'automation_recipe.json': formatPackageJson(automationRecipe),
    'package_manifest.json': formatPackageJson(runtimePackageManifest),
  } as Record<string, string>), [
    activeImageProductionPrompt,
    activeNoteRun,
    activeNoteProposal,
    activeProfileRuntime,
    activePublicExportBundle,
    activeRadarRunReport,
    aiRunRequest,
    automationRecipe,
    editorialPackage.files,
    editorialPackage.id,
    editorialPackage.slug,
    operationalContract,
    publicationTargets,
    runtimePackageManifest,
  ]);
  const selectedPackageFile = runtimePackageFiles[packageFileKey] || '';
  const completePackageContent = formatPackageJson({
    id: editorialPackage.id,
    slug: editorialPackage.slug,
    title: editorialPackage.title,
    ready: editorialPackage.ready,
    preflight: editorialPackage.preflight,
    files: runtimePackageFiles,
  });
  const distributionDeliverables = useMemo(() => (
    distributionPlan.manifest.items.flatMap((item) => (
      item.channels.map((channel) => ({
        id: `${item.topic_id}:${channel.channel}`,
        topicId: item.topic_id,
        topicStatus: item.status,
        title: item.title,
        author: item.author,
        scheduledFor: item.scheduled_for,
        canonicalUrl: item.canonical_url,
        channel: channel.channel,
        label: channel.label,
        copy: channel.copy,
        actionStatus: distributionActions[`${item.topic_id}:${channel.channel}`] || 'pendiente',
      }))
    ))
  ), [distributionActions, distributionPlan.manifest.items]);

  const exportPayload = useMemo(() => buildEditarraExportPayload({
    selectedSite,
    selectedRecipe,
    selectedOperationMode,
    operationModes,
    profiles,
    selectedWorkflowProfile,
    authors,
    topicTokenBudget,
    packageFileKeys,
    activeProfileRuntime,
    guidedRunStages,
    visibleNoteVariables,
    selectedGuidedRunRecords,
    operationalWorkspace,
    operationalContract,
    automationRecipe,
    editorialAgendas,
    discoveryRuns,
    discoveryCandidates,
    missionPresets,
    activeNoteRun,
    aiHandoff,
    aiRunRequest,
    publicationManifest,
    publicationDestinations,
    publicationTargets,
    activePipelineState,
    activeRadarRunReport,
    activeNoteProposal,
    activePublicExportBundle,
    activeImageProductionPrompt,
    editorialPackage: {
      aiBrief: editorialPackage.aiBrief,
      publicationPayload: editorialPackage.publicationPayload as Record<string, unknown>,
      qualityAudit: editorialPackage.qualityAudit,
      imageManifest: editorialPackage.imageManifest,
    },
    selectedTopic,
    currentDraftStatus: currentDraft.status,
    validatedEvidenceCount,
    guidedNextStepLabel: guidedNextStep.label,
    dailyBatchControl,
    topics,
    drafts,
    evidence,
    getDailyBatchRecipeId,
    noteVariableOverrides,
    workflowVariables,
    editorRules,
    imagePrompts,
    reusableImages,
    seoExperiments,
    analyticsRecords,
    draftVersions,
    auditEvents,
    guidedRunRecords,
    distributionPlanManifest: distributionPlan.manifest,
    distributionActions,
  }), [activeImageProductionPrompt, activeNoteProposal, activeNoteRun, activePipelineState, activeProfileRuntime, activePublicExportBundle, activeRadarRunReport, aiHandoff, aiRunRequest, analyticsRecords, auditEvents, authors, automationRecipe, currentDraft.status, dailyBatchControl, discoveryCandidates, discoveryRuns, distributionActions, distributionPlan.manifest, draftVersions, drafts, editorRules, editorialAgendas, editorialPackage.aiBrief, editorialPackage.imageManifest, editorialPackage.publicationPayload, editorialPackage.qualityAudit, evidence, guidedNextStep.label, guidedRunRecords, guidedRunStages, imagePrompts, missionPresets, noteVariableOverrides, operationalContract, operationalWorkspace, profiles, publicationDestinations, publicationManifest, publicationTargets, reusableImages, selectedGuidedRunRecords, selectedOperationMode, selectedRecipe, selectedSite, selectedTopic, selectedWorkflowProfile, seoExperiments, topicTokenBudget, topics, validatedEvidenceCount, visibleNoteVariables, workflowVariables]);

  const recordAudit = (event: string, detail: string) => {
    setAuditEvents((current) => {
      if (current.some((item) => item.event === event && item.detail === detail)) {
        return current;
      }

      const nextEvent = createAuditEvent(event, detail);
      const uniqueEvent = current.some((item) => item.id === nextEvent.id)
        ? { ...nextEvent, id: `${nextEvent.id}-${current.length}` }
        : nextEvent;

      return [uniqueEvent, ...current].slice(0, 80);
    });
  };

  const recordGuidedRun = (run: GuidedAssistedDecision['run']) => {
    const nextRun = createGuidedRunRecord({
      topicId: selectedTopic.id,
      recipeId: selectedRecipe.id,
      profileId: selectedWorkflowProfile.id,
      run,
    });

    dispatchProductionAction({ type: 'guided-run/record', run: nextRun });
  };

  const getDomainState = (): EditarraDomainState => ({
    authors,
    topics,
    workflowVariables,
    noteVariableOverrides,
    selectedTopicId,
    query,
    statusFilter,
  });

  const applyDomainState = (nextState: EditarraDomainState) => {
    setAuthors(nextState.authors);
    setTopics(nextState.topics);
    setWorkflowVariables(nextState.workflowVariables);
    setNoteVariableOverrides(nextState.noteVariableOverrides);
    setSelectedTopicId(nextState.selectedTopicId);
    setQuery(nextState.query);
    setStatusFilter(nextState.statusFilter);
  };

  const dispatchDomainAction = (action: EditarraDomainAction) => {
    const nextState = reduceEditarraDomainState(getDomainState(), action);

    applyDomainState(nextState);

    return nextState;
  };

  const applyOperationalCommit = (commit: Parameters<typeof applyEditarraOperationalCommit>[0]) => {
    applyEditarraOperationalCommit(commit, {
      setWorkflowVariables,
      setSelectedRecipeId,
      dispatchDomainAction,
      dispatchProductionAction,
      updateTopic: (topic) => {
        setTopics((current) => current.map((currentTopic) => (
          currentTopic.id === topic.id ? topic : currentTopic
        )));
      },
      setAiResponseBuffer,
      setDraftMode,
      setActiveTab,
      setPackageFileKey,
      setAiStatus,
      setDraftStatusMessage,
      setPackageStatus,
      setGuidedFlowStatus,
      recordAudit,
    });
  };

  const applyEvidenceFlowOutcome = (outcome: EvidenceFlowOutcome) => {
    outcome.productionActions?.forEach(dispatchProductionAction);

    if (outcome.productionAction) {
      dispatchProductionAction(outcome.productionAction);
    }

    if (outcome.activeTab) {
      setActiveTab(outcome.activeTab);
    }

    if (outcome.packageFileKey) {
      setPackageFileKey(outcome.packageFileKey);
    }

    if (outcome.packageStatus) {
      setPackageStatus(outcome.packageStatus);
    }

    if (outcome.guidedFlowStatus) {
      setGuidedFlowStatus(outcome.guidedFlowStatus);
    }

    recordAudit(outcome.audit.event, outcome.audit.detail);
  };

  const applyDailyBatchFlowOutcome = (outcome: DailyBatchFlowOutcome) => {
    if (outcome.productionAction) {
      dispatchProductionAction(outcome.productionAction);
    }

    if (outcome.draftMode) {
      setDraftMode(outcome.draftMode);
    }

    if (outcome.activeTab) {
      setActiveTab(outcome.activeTab);
    }

    if (outcome.packageFileKey) {
      setPackageFileKey(outcome.packageFileKey);
    }

    if (outcome.statuses.ai) {
      setAiStatus(outcome.statuses.ai);
    }

    if (outcome.statuses.draft) {
      setDraftStatusMessage(outcome.statuses.draft);
    }

    if (outcome.statuses.package) {
      setPackageStatus(outcome.statuses.package);
    }

    setGuidedFlowStatus(outcome.statuses.guidedFlow);

    if (outcome.registerPackage) {
      registerEditorialPackage();
    }

    recordAudit(outcome.audit.event, outcome.audit.detail);
  };

  const applySingleNoteFlowOutcome = (outcome: SingleNoteFlowOutcome) => {
    outcome.productionActions?.forEach(dispatchProductionAction);

    if (outcome.aiResponseBuffer !== undefined) {
      setAiResponseBuffer(outcome.aiResponseBuffer);
    }

    if (outcome.draftMode) {
      setDraftMode(outcome.draftMode);
    }

    if (outcome.activeTab) {
      setActiveTab(outcome.activeTab);
    }

    if (outcome.packageFileKey) {
      setPackageFileKey(outcome.packageFileKey);
    }

    if (outcome.statuses.ai) {
      setAiStatus(outcome.statuses.ai);
    }

    if (outcome.statuses.draft) {
      setDraftStatusMessage(outcome.statuses.draft);
    }

    if (outcome.statuses.package) {
      setPackageStatus(outcome.statuses.package);
    }

    if (outcome.statuses.guidedFlow) {
      setGuidedFlowStatus(outcome.statuses.guidedFlow);
    }

    if (outcome.registerPackage) {
      registerEditorialPackage();
    }

    if (outcome.audit) {
      recordAudit(outcome.audit.event, outcome.audit.detail);
    }
  };

  const applyGuidedExecutionOutcome = (outcome: GuidedExecutionOutcome) => {
    outcome.operations.forEach(executeGuidedOperation);
    setActiveTab(outcome.targetSurface);

    if (outcome.packageFileKey) {
      setPackageFileKey(outcome.packageFileKey);
    }

    if (outcome.draftStatusMessage) {
      setDraftStatusMessage(outcome.draftStatusMessage);
    }

    if (outcome.guidedFlowStatus) {
      setGuidedFlowStatus(outcome.guidedFlowStatus);
    }

    if (outcome.run) {
      recordGuidedRun(outcome.run);
    }

    recordAudit(outcome.auditEvent.event, outcome.auditEvent.detail);
  };

  const updateSelectedProfile = (patch: Partial<EditorialProfile>) => {
    setProfiles((current) => current.map((profile) => (
      profile.id === selectedWorkflowProfile.id ? { ...profile, ...patch } : profile
    )));
  };

  const updateSelectedProfileGuardrails = (value: string) => {
    updateSelectedProfile({
      guardrails: value.split('\n').map((item) => item.trim()).filter(Boolean),
    });
  };

  const createProfileFromCurrentRun = () => {
    const mode = selectedOperationMode;
    const operation = buildProfileFromOperationMode({
      profileId: `perfil-${mode.id}-${Date.now()}`,
      mode,
      currentProfile: selectedWorkflowProfile,
      fallbackRecipe: selectedRecipe,
      authors,
      fallbackAuthor: selectedAuthor,
      topics,
      targetTopic: selectedTopic,
      workflowVariables,
      noteVariableOverrides,
      recipes: noteRecipes,
    });

    setProfiles((current) => [...current, operation.profile]);
    setSelectedSiteId(operation.profile.id);
    setSelectedRecipeId(operation.recipe.id);
    setWorkflowVariables(operation.workflowVariables);
    setAuthors(operation.authors);
    setTopics(operation.topics);
    setNoteVariableOverrides(operation.noteVariableOverrides);
    setGuidedFlowStatus(operation.statuses.guidedFlow);
    setDraftStatusMessage(operation.statuses.draft);
    setPackageStatus(operation.statuses.package);
    recordAudit(operation.statuses.auditEvent, operation.statuses.auditDetail);
  };

  const queueAgendaSync = (agenda: EditorialAgenda) => {
    const sequence = agendaSaveSequenceRef.current + 1;
    agendaSaveSequenceRef.current = sequence;

    if (agendaSaveTimerRef.current) {
      clearTimeout(agendaSaveTimerRef.current);
    }

    setDiscoveryStatus(`Agenda actualizada localmente; guardando ${agenda.name}...`);

    agendaSaveTimerRef.current = setTimeout(() => {
      void editarraRadarApi.updateAgenda('', agenda)
        .then(() => {
          if (agendaSaveSequenceRef.current === sequence) {
            setDiscoveryStatus(`Agenda guardada: ${agenda.name}.`);
          }
        })
        .catch(() => {
          if (agendaSaveSequenceRef.current === sequence) {
            setDiscoveryStatus('Agenda actualizada localmente; backend no sincronizado.');
          }
        });
    }, 700);
  };

  const saveAgendaNow = (agendaToPersist: EditorialAgenda) => {
    if (!editorialAgendas.some((item) => item.id === agendaToPersist.id)) {
      setDiscoveryStatus('Agenda no encontrada para guardar.');
      return;
    }

    const sequence = agendaSaveSequenceRef.current + 1;
    agendaSaveSequenceRef.current = sequence;

    if (agendaSaveTimerRef.current) {
      clearTimeout(agendaSaveTimerRef.current);
      agendaSaveTimerRef.current = null;
    }

    const agendaToSave = {
      ...agendaToPersist,
      updatedAt: new Date().toISOString(),
    };

    setEditorialAgendas((current) => current.map((item) => (item.id === agendaToSave.id ? agendaToSave : item)));
    setDiscoveryStatus(`Guardando agenda ${agendaToSave.name} con ${agendaToSave.sourceUrls.length} URLs fuente...`);

    void editarraRadarApi.updateAgenda('', agendaToSave)
      .then((response) => {
        if (agendaSaveSequenceRef.current !== sequence) {
          return;
        }

        setEditorialAgendas((current) => current.map((item) => (item.id === agendaToSave.id ? response.agenda : item)));
        setDiscoveryStatus(`Agenda guardada: ${response.agenda.name} (${response.agenda.sourceUrls.length} URLs fuente).`);
        recordAudit('Agenda editorial guardada', `${response.agenda.name}: ${response.agenda.sourceUrls.length} URLs fuente persistidas.`);
      })
      .catch((error) => {
        const detail = error instanceof Error ? error.message : 'error sin detalle';
        if (agendaSaveSequenceRef.current === sequence) {
          setDiscoveryStatus(`No se pudo guardar agenda en backend: ${detail}.`);
        }
      });
  };

  const applyTopicStatus = (topicId: string, status: TopicStatus) => {
    dispatchDomainAction({ type: 'topic/status', topicId, status });
  };

  const updateTopicStatus = (topicId: string, status: TopicStatus) => {
    const topic = topics.find((item) => item.id === topicId);
    const transition = buildTopicStatusTransition({
      topicId,
      status,
      topicTitle: topic?.title,
    });

    applyTopicStatus(topicId, status);
    setSelectedTopicId(transition.selectedTopicId);

    if (transition.draftStatus) {
      updateCurrentDraft({ status: transition.draftStatus });
    }

    if (transition.activeTab) {
      setActiveTab(transition.activeTab);
    }

    if (transition.editorSurface) {
      setEditorSurface(transition.editorSurface);
    }

    if (transition.workspaceOpen) {
      setWorkspaceOpen(transition.workspaceOpen);
    }

    if (transition.draftStatusMessage) {
      setDraftStatusMessage(transition.draftStatusMessage);
    }

    if (transition.packageFileKey) {
      setPackageFileKey(transition.packageFileKey);
    }

    if (transition.packageStatus) {
      setPackageStatus(transition.packageStatus);
    }

    if (transition.distributionStatus) {
      setDistributionStatus(transition.distributionStatus);
    }

    if (transition.guidedFlowStatus) {
      setGuidedFlowStatus(transition.guidedFlowStatus);
    }

    if (transition.audit) {
      recordAudit(transition.audit.event, transition.audit.detail);
    }
  };

  const updateTopic = (topicId: string, patch: Partial<Topic>) => {
    dispatchDomainAction({ type: 'topic/update', topicId, patch });
  };

  const addTopic = () => {
    const author = authors.find((item) => item.active) || authors[0] || authorSeed[0];
    const nextTopic = createDefaultTopic({
      id: `topic-${Date.now()}`,
      authorName: author.name,
    });

    dispatchDomainAction({ type: 'topic/add', topic: nextTopic });
    setSelectedTopicId(nextTopic.id);
    setWorkspaceOpen(true);
    recordAudit('Tema creado', `Se creo "${nextTopic.title}" para ${author.name}.`);
  };

  const removeTopic = (topicId: string) => {
    if (topics.length <= 1) {
      return;
    }

    const removedTopic = topics.find((topic) => topic.id === topicId);
    dispatchDomainAction({ type: 'topic/remove', topicId });
    dispatchProductionAction({ type: 'topic/remove', topicId });
    recordAudit('Tema eliminado', `Se elimino "${removedTopic?.title || topicId}" y sus borradores asociados.`);
  };

  const updateAgenda = (agendaId: string, patch: Partial<EditorialAgenda>) => {
    let nextAgenda: EditorialAgenda | undefined;

    setEditorialAgendas((current) => current.map((agenda) => {
      if (agenda.id !== agendaId) {
        return agenda;
      }

      nextAgenda = {
        ...agenda,
        ...patch,
        scoringWeights: {
          ...agenda.scoringWeights,
          ...(patch.scoringWeights || {}),
        },
        updatedAt: new Date().toISOString(),
      };

      return nextAgenda;
    }));

    if (nextAgenda) {
      queueAgendaSync(nextAgenda);
    }
  };

  const addAgenda = () => {
    const nextAgenda = createDefaultEditorialAgenda({
      id: `agenda-${Date.now()}`,
      profiles,
      authors,
      operationModes,
    });

    setEditorialAgendas((current) => [...current, nextAgenda]);
    setSelectedAgendaId(nextAgenda.id);
    setDiscoveryStatus(`Agenda creada: ${nextAgenda.name}.`);
    recordAudit('Agenda editorial creada', `${nextAgenda.name} preparada para Radar.`);

    void editarraRadarApi.createAgenda('', nextAgenda).catch(() => {
      setDiscoveryStatus('Agenda creada localmente; backend no sincronizado.');
    });
  };

  const removeAgenda = (agendaId: string) => {
    const removal = removeAgendaFromRadarState({
      editorialAgendas,
      discoveryCandidates,
      discoveryRuns,
      selectedAgendaId,
      agendaId,
    });

    if (!removal.removed) {
      return;
    }

    setEditorialAgendas(removal.editorialAgendas);
    setSelectedAgendaId(removal.selectedAgendaId);
    setDiscoveryCandidates(removal.discoveryCandidates);
    setDiscoveryRuns(removal.discoveryRuns);
    setDiscoveryStatus(`Agenda removida: ${removal.removedAgenda?.name || agendaId}.`);
    recordAudit('Agenda editorial eliminada', `${removal.removedAgenda?.name || agendaId} removida de Radar.`);

    void editarraRadarApi.deleteAgenda('', agendaId).catch(() => {
      setDiscoveryStatus('Agenda removida localmente; backend no sincronizado.');
    });
  };

  const upsertDiscoveryCandidates = (nextCandidates: DiscoveryCandidate[]) => {
    setDiscoveryCandidates((current) => upsertDiscoveryCandidateList(current, nextCandidates));
  };

  const updateDiscoveryCandidateStatus = (candidateId: string, status: DiscoveryCandidateStatus) => {
    const candidate = discoveryCandidates.find((item) => item.id === candidateId);

    if (!candidate) {
      setDiscoveryStatus('Candidato no encontrado; no se actualizo el estado.');
      return;
    }

    setDiscoveryCandidates((current) => updateDiscoveryCandidateStatusInList({
      candidates: current,
      candidateId,
      status,
    }));
    setDiscoveryStatus(`Candidato marcado como ${status}.`);
    recordAudit('Estado de candidato actualizado', `${candidate.title} quedo como ${status}.`);

    void editarraRadarApi.updateCandidate('', candidateId, { status }).catch(() => {
      setDiscoveryStatus(`Candidato marcado como ${status} localmente.`);
    });
  };

  const runAgendaDiscovery = async () => {
    const guard = buildRadarDiscoveryGuard({
      query: radarQuery,
      agendaName: selectedAgenda.name,
    });

    if (guard.status === 'blocked') {
      setDiscoveryStatus(guard.discoveryStatus);
      recordAudit(guard.audit.event, guard.audit.detail);
      return;
    }

    setDiscoveryStatus(`Buscando temas para ${selectedAgenda.name}...`);

    try {
      const remoteAgendaResponse = await editarraRadarApi.listAgendas('');
      const remoteAgenda = remoteAgendaResponse.agendas.find((agenda) => agenda.id === selectedAgenda.id);
      const effectiveAgenda = mergeAgendaForRadarRun(selectedAgenda, remoteAgenda);
      setEditorialAgendas((current) => current.map((agenda) => (
        agenda.id === effectiveAgenda.id ? effectiveAgenda : agenda
      )));
      const agendaResponse = await editarraRadarApi.updateAgenda('', effectiveAgenda);
      const syncedAgenda = agendaResponse.agenda || effectiveAgenda;
      setEditorialAgendas((current) => current.map((agenda) => (
        agenda.id === syncedAgenda.id ? syncedAgenda : agenda
      )));
      const response = await editarraRadarApi.runDiscovery('', {
        agendaId: syncedAgenda.id,
        query: guard.query,
        urls: syncedAgenda.sourceUrls,
      });
      const success = buildRadarRemoteSuccess({
        agenda: syncedAgenda,
        run: response.run,
        candidates: response.candidates,
      });

      setDiscoveryRuns((current) => upsertDiscoveryRun(current, success.run));
      upsertDiscoveryCandidates(success.candidates);
      setCandidateRunScope(success.candidateRunScope);
      setDiscoveryStatus(success.discoveryStatus);
      recordAudit(success.audit.event, success.audit.detail);
      return;
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'error sin detalle';
      if (error instanceof ApiError && [401, 403].includes(error.status)) {
        const rejected = buildRadarBackendRejected({
          agendaName: selectedAgenda.name,
          detail,
        });

        setDiscoveryStatus(rejected.discoveryStatus);
        recordAudit(rejected.audit.event, rejected.audit.detail);
        return;
      }
      setDiscoveryStatus(`Backend no disponible (${detail}); generando candidato local.`);
    }

    const fallback = buildRadarLocalFallback({
      agenda: selectedAgenda,
      query: guard.query,
    });

    setDiscoveryRuns((current) => upsertDiscoveryRun(current, fallback.run));
    upsertDiscoveryCandidates(fallback.candidates);
    setCandidateRunScope(fallback.candidateRunScope);
    setDiscoveryStatus(fallback.discoveryStatus);
    recordAudit(fallback.audit.event, fallback.audit.detail);
  };

  const copyDiscoveryRequest = () => {
    const handoff = buildCopyDiscoveryRequestHandoff({
      content: discoveryRequestJson,
      agendaName: selectedAgenda.name,
    });

    copyTextToClipboard(handoff.content);
    setPackageStatus(handoff.packageStatus);
    setDiscoveryStatus(handoff.discoveryStatus);
    recordAudit(handoff.audit.event, handoff.audit.detail);
  };

  const copySourceResearchPrompt = () => {
    const handoff = buildCopySourceResearchPromptHandoff({
      content: sourceResearchPrompt,
      agendaName: selectedAgenda.name,
    });

    copyTextToClipboard(handoff.content);
    setPackageStatus(handoff.packageStatus);
    setDiscoveryStatus(handoff.discoveryStatus);
    recordAudit(handoff.audit.event, handoff.audit.detail);
  };

  const importDiscoveryResults = (rawJson: string) => {
    const outcome = buildDiscoveryResultsImport({
      rawJson,
      agenda: selectedAgenda,
    });

    if (outcome.status === 'invalid') {
      setDiscoveryStatus(outcome.discoveryStatus);
      return;
    }

    upsertDiscoveryCandidates(outcome.candidates);
    setCandidateRunScope(outcome.candidateRunScope);
    setDiscoveryStatus(outcome.discoveryStatus);
    recordAudit(outcome.audit.event, outcome.audit.detail);
  };

  const convertCandidateToTopic = (candidateId: string) => {
    const candidate = discoveryCandidates.find((item) => item.id === candidateId);
    const conversion = buildCandidateTopicConversion({
      candidate,
      agenda: candidate
        ? editorialAgendas.find((item) => item.id === candidate.agendaId) || selectedAgenda
        : selectedAgenda,
    });

    if (conversion.status === 'missing-candidate') {
      setDiscoveryStatus(conversion.discoveryStatus);
      return;
    }

    setTopics((current) => upsertConvertedTopic(current, conversion.topic));
    setSelectedTopicId(conversion.selectedTopicId);
    setQuery(conversion.query);
    setStatusFilter(conversion.statusFilter);
    updateDiscoveryCandidateStatus(conversion.candidateId, conversion.candidateStatus);
    setWorkspaceOpen(conversion.workspaceOpen);
    setDiscoveryStatus(conversion.discoveryStatus);
    recordAudit(conversion.audit.event, conversion.audit.detail);

    void editarraRadarApi.convertTopic('', candidateId).catch(() => undefined);
  };

  const convertCandidateToNoteRun = (candidateId: string) => {
    const candidate = discoveryCandidates.find((item) => item.id === candidateId);
    const conversion = buildCandidateNoteRunConversion({
      candidate,
      agenda: candidate
        ? editorialAgendas.find((item) => item.id === candidate.agendaId) || selectedAgenda
        : selectedAgenda,
      recipes: noteRecipes,
      operationModes,
    });

    if (conversion.status === 'missing-candidate') {
      setDiscoveryStatus(conversion.discoveryStatus);
      return;
    }

    setTopics((current) => upsertConvertedTopic(current, conversion.topic));
    setSelectedTopicId(conversion.selectedTopicId);
    setQuery(conversion.query);
    setStatusFilter(conversion.statusFilter);
    updateDiscoveryCandidateStatus(conversion.candidateId, conversion.candidateStatus);

    if (conversion.selectedRecipeId) {
      setSelectedRecipeId(conversion.selectedRecipeId);
    }

    if (conversion.selectedOperationModeId) {
      setSelectedOperationModeId(conversion.selectedOperationModeId);
    }

    setActiveTab(conversion.activeTab);
    setWorkspaceOpen(conversion.workspaceOpen);
    setEditorSurface(conversion.editorSurface);
    setDraftMode(conversion.draftMode);
    setPackageFileKey(conversion.packageFileKey);
    setDraftStatusMessage(conversion.draftStatusMessage);
    setPackageStatus(conversion.packageStatus);
    setGuidedFlowStatus(conversion.guidedFlowStatus);
    setDiscoveryStatus(conversion.discoveryStatus);
    recordAudit('NoteRun creado desde Radar', `${conversion.topic.title} usa ${conversion.topic.recipeId} y ${conversion.topic.operationModeId}.`);

    void editarraRadarApi.convertNoteRun('', candidateId).catch(() => undefined);
  };

  const toggleAuthor = (authorId: string) => {
    dispatchDomainAction({ type: 'author/toggle', authorId });
  };

  const updateAuthorField = (authorId: string, field: AuthorField, value: string | number) => {
    dispatchDomainAction({ type: 'author/update-field', authorId, field, value });
  };

  const updateAuthorListField = (authorId: string, field: 'tone' | 'banned' | 'references' | 'antiReferences', value: string) => {
    dispatchDomainAction({ type: 'author/update-list', authorId, field, value });
  };

  const updateAuthorWeight = (authorId: string, key: StyleWeightKey, value: number) => {
    dispatchDomainAction({ type: 'author/update-weight', authorId, key, value });
  };

  const updateAuthorInfluence = (authorId: string, influenceId: string, patch: Partial<AuthorInfluence>) => {
    dispatchDomainAction({ type: 'author/update-influence', authorId, influenceId, patch });
  };

  const addAuthorInfluence = (authorId: string) => {
    dispatchDomainAction({
      type: 'author/add-influence',
      authorId,
      influence: createBlankAuthorInfluence(`inf-${Date.now()}`),
    });
  };

  const removeAuthorInfluence = (authorId: string, influenceId: string) => {
    dispatchDomainAction({ type: 'author/remove-influence', authorId, influenceId });
  };

  const addAuthor = () => {
    const nextId = Date.now();
    const nextAuthor = createDefaultAuthor({
      id: `autor-${nextId}`,
      influenceId: `inf-${nextId}`,
      styleWeights: defaultStyleWeights,
    });

    dispatchDomainAction({ type: 'author/add', author: nextAuthor });
  };

  const removeAuthor = (authorId: string) => {
    const author = authors.find((item) => item.id === authorId);
    if (!author || authors.length <= 1) {
      return;
    }

    dispatchDomainAction({ type: 'author/remove', authorId });
  };

  const updateVariable = (variableId: string, patch: Partial<WorkflowVariable>) => {
    dispatchDomainAction({ type: 'variable/update', variableId, patch });
  };

  const updateWorkflowVariableByKey = (key: string, value: string, description = 'Variable específica de esta receta.') => {
    dispatchDomainAction({
      type: 'note-variable/upsert',
      topicId: selectedTopic.id,
      recipeId: selectedRecipe.id,
      key,
      value,
      description,
    });
  };

  const saveMissionPreset = () => {
    const preset = createMissionPresetFromWorkspace({
      id: buildMissionPresetId({
        topicId: selectedTopic.id,
        recipeId: selectedRecipe.id,
      }),
      profile: selectedWorkflowProfile,
      recipe: selectedRecipe,
      author: selectedAuthor,
      workspace: operationalWorkspace,
      visibleVariables: visibleNoteVariables,
    });

    setMissionPresets((current) => [preset, ...current.filter((item) => item.name !== preset.name)].slice(0, 12));
    setGuidedFlowStatus(`Preset de misión guardado: ${preset.name}.`);
    setPackageStatus(`Preset "${preset.name}" disponible en JSON portable.`);
    recordAudit('Preset de misión guardado', `${preset.name} captura perfil, receta, autor, variables y plan ejecutable.`);
  };

  const applyMissionPreset = (presetId: string) => {
    const preset = missionPresets.find((item) => item.id === presetId);

    if (!preset) {
      setGuidedFlowStatus('Preset de misión no encontrado.');
      return;
    }

    const application = applyMissionPresetToNote({
      preset,
      topicId: selectedTopic.id,
      currentOverrides: noteVariableOverrides,
      availableProfiles: profiles,
      availableAuthors: authors,
    });

    if (application.selectedSiteId) {
      setSelectedSiteId(application.selectedSiteId);
    }

    setSelectedRecipeId(application.selectedRecipeId);
    setNoteVariableOverrides(application.noteVariableOverrides);

    if (application.authorPatch) {
      setAuthors((current) => current.map((author) => (
        author.name === preset.authorName ? { ...author, ...application.authorPatch } : author
      )));
    }

    setGuidedFlowStatus(application.status);
    setPackageStatus(`Preset "${preset.name}" aplicado; note_run.json y ai_request.json recalculados.`);
    recordAudit('Preset de misión aplicado', `${preset.name} aplicado sobre "${selectedTopic.title}".`);
  };

  const removeMissionPreset = (presetId: string) => {
    const preset = missionPresets.find((item) => item.id === presetId);

    setMissionPresets((current) => current.filter((item) => item.id !== presetId));
    setGuidedFlowStatus(`Preset de misión removido: ${preset?.name || presetId}.`);
  };

  const launchMissionPresetRun = (presetId: string) => {
    const preset = missionPresets.find((item) => item.id === presetId);

    if (!preset) {
      setGuidedFlowStatus('Preset de misión no encontrado para lanzar corrida.');
      return;
    }

    const recipe = noteRecipes.find((item) => item.id === preset.recipeId) || selectedRecipe;
    const profile = profiles.find((item) => item.id === preset.profileId) || selectedWorkflowProfile;
    const author = authors.find((item) => item.name === preset.authorName)
      || authors.find((item) => item.name === profile.defaultAuthor)
      || authors.find((item) => item.active)
      || selectedAuthor
      || authorSeed[0];
    const presetVariables = mergeMissionPresetVariables(
      completeRecipeVariables(recipe, workflowVariables),
      preset,
    );
    const executableRecipe = missionPresetToExecutableRecipe(preset);
    const operation = buildCockpitGeneratedRun({
      rawTitle: preset.name,
      runId: Date.now(),
      authors,
      fallbackAuthor: { ...author, voiceBrief: preset.voiceBrief, influenceMode: preset.influenceMode },
      profile,
      recipe,
      rules: editorRules,
      workflowVariables: presetVariables,
      executableRecipeFor: () => executableRecipe,
    });

    applyOperationalCommit(buildCockpitGeneratedRunCommit({
      ...operation,
      statuses: {
        ...operation.statuses,
        ai: `Preset "${preset.name}" lanzó nota y fuentes guiadas sin POST externo.`,
        draft: `Corrida lanzada desde preset "${preset.name}".`,
        guidedFlow: `Preset "${preset.name}" lanzó una nota generada. Próximo control: validar fuentes guiadas.`,
        package: `note_run.json preparado desde preset "${preset.name}".`,
        auditEvent: 'Corrida lanzada desde preset de misión',
        auditDetail: `${preset.name} generó "${operation.topic.title}" con ${operation.evidence.length} fuentes guiadas.`,
      },
    }));
  };

  const resumeGuidedRun = (run: GuidedRunSummary) => {
    setSelectedTopicId(run.topicId);
    setSelectedRecipeId(run.recipeId);
    setSelectedSiteId(run.profileId);
    setActiveTab('editor');
    setPackageFileKey('note_run.json');
    setGuidedFlowStatus(`Corrida retomada: ${run.topicTitle}. Próximo control: ${run.nextControl}.`);
    setPackageStatus(`note_run.json preparado para retomar "${run.topicTitle}".`);
    recordAudit('Corrida retomada', `${run.summary} (${run.topicTitle}).`);
  };

  const operateQueuedRun = (run: OperationalRunQueueItem) => {
    if (!run.isActiveTopic) {
      resumeGuidedRun(run);
      return;
    }

    if (run.stage === 'fuentes' || run.stage === 'bloqueo') {
      setPackageFileKey('evidence_log.json');
      if (pendingGuidedEvidence.length === 0 && validatedEvidenceCount < selectedWorkflowProfile.sourceMinimum) {
        createGuidedEvidenceSlots();
        return;
      }

      completeGuidedEvidence();
      return;
    }

    if (run.stage === 'auditoria') {
      approveGuidedAudit();
      return;
    }

    if (run.stage === 'ai') {
      runLocalAiAndApply();
      return;
    }

    if (run.stage === 'payload') {
      openPackageFileFromCockpit('publication_payload.json');
      return;
    }

    runPipelineControl();
  };

  const ensureRecipeVariables = (recipe: NoteRecipe) => {
    setWorkflowVariables((current) => completeRecipeVariables(recipe, current));
  };

  const selectRecipe = (recipeId: EditarraRecipeKey) => {
    const nextRecipe = noteRecipes.find((recipe) => recipe.id === recipeId) || noteRecipes[0];
    setSelectedRecipeId(nextRecipe.id);
    ensureRecipeVariables(nextRecipe);
  };

  const applyOperationMode = () => {
    const mode = selectedOperationMode;
    const operation = buildOperationModeApplication({
      mode,
      profile: selectedWorkflowProfile,
      fallbackRecipe: selectedRecipe,
      authors,
      fallbackAuthor: selectedAuthor,
      topics,
      targetTopic: selectedTopic,
      workflowVariables,
      noteVariableOverrides,
      recipes: noteRecipes,
    });

    setSelectedRecipeId(operation.recipe.id);
    setWorkflowVariables(operation.workflowVariables);
    setProfiles((current) => current.map((profile) => (
      profile.id === selectedWorkflowProfile.id ? { ...profile, ...operation.profilePatch } : profile
    )));
    setAuthors(operation.authors);
    setTopics(operation.topics);
    setNoteVariableOverrides(operation.noteVariableOverrides);
    setGuidedFlowStatus(operation.statuses.guidedFlow);
    setDraftStatusMessage(operation.statuses.draft);
    setPackageStatus(operation.statuses.package);
    recordAudit(operation.statuses.auditEvent, operation.statuses.auditDetail);
  };

  const addVariable = () => {
    dispatchDomainAction({
      type: 'variable/add',
      variable: createDefaultWorkflowVariable(`var-${Date.now()}`),
    });
  };

  const removeVariable = (variableId: string) => {
    dispatchDomainAction({ type: 'variable/remove', variableId });
  };

  const updateSeoExperiment = (experimentId: string, patch: Partial<SeoExperiment>) => {
    dispatchProductionAction({ type: 'seo/update', experimentId, patch });
  };

  const addSeoExperiment = () => {
    const { experiment, audit } = buildSeoExperimentCreation({
      id: `seo-${Date.now()}`,
      topic: selectedTopic,
      selectedExperimentCount: selectedTopicSeoExperiments.length,
    });

    dispatchProductionAction({ type: 'seo/add', experiment });
    recordAudit(audit.event, audit.detail);
  };

  const selectSeoExperiment = (experimentId: string) => {
    const selection = buildSeoExperimentSelection({
      experimentId,
      experiments: seoExperiments,
      topic: selectedTopic,
    });

    dispatchProductionAction({ type: 'seo/select', topicId: selectedTopic.id, experimentId });

    if (selection.experiment && selection.draftPatch && selection.topicPatch && selection.audit) {
      updateCurrentDraft(selection.draftPatch);
      updateTopic(selectedTopic.id, selection.topicPatch);
      recordAudit(selection.audit.event, selection.audit.detail);
    }
  };

  const removeSeoExperiment = (experimentId: string) => {
    const { audit } = buildSeoExperimentRemoval({
      experimentId,
      experiments: seoExperiments,
    });

    dispatchProductionAction({ type: 'seo/remove', experimentId });
    recordAudit(audit.event, audit.detail);
  };

  const updateAnalyticsRecord = (recordId: string, patch: Partial<AnalyticsRecord>) => {
    dispatchProductionAction({ type: 'analytics/update', recordId, patch });
  };

  const addAnalyticsRecord = () => {
    const { record, audit } = buildAnalyticsRecordCreation({
      id: `analytics-${Date.now()}`,
      topic: selectedTopic,
      authorScore: selectedAuthor.score,
    });

    dispatchProductionAction({ type: 'analytics/add', record });
    recordAudit(audit.event, audit.detail);
  };

  const removeAnalyticsRecord = (recordId: string) => {
    const { audit } = buildAnalyticsRecordRemoval({
      recordId,
      records: analyticsRecords,
    });

    dispatchProductionAction({ type: 'analytics/remove', recordId });
    recordAudit(audit.event, audit.detail);
  };

  const applyAnalyticsFeedback = (recordId: string) => {
    const feedback = buildAnalyticsFeedbackApplication({
      recordId,
      records: analyticsRecords,
      selectedAuthor,
      selectedTopic,
    });

    if (!feedback) {
      return;
    }

    setAuthors((current) => current.map((author) => (
      author.name === feedback.authorName
        ? { ...author, ...feedback.authorPatch }
        : author
    )));
    updateTopic(selectedTopic.id, feedback.topicPatch);
    recordAudit(feedback.audit.event, feedback.audit.detail);
  };

  const updateEvidence = (evidenceId: string, patch: Partial<EvidenceRecord>) => {
    dispatchProductionAction({ type: 'evidence/update', evidenceId, patch });
  };

  const addEvidence = () => {
    applyEvidenceFlowOutcome(buildManualEvidenceCreation({
      id: `evidence-${Date.now()}`,
      topic: selectedTopic,
    }));
  };

  const createGuidedEvidenceSlots = () => {
    applyEvidenceFlowOutcome(buildGuidedEvidenceSlotCreation({
      topic: selectedTopic,
      recipe: selectedRecipe,
      profile: selectedWorkflowProfile,
      selectedTopicEvidence,
    }));
  };

  const validateEvidence = (evidenceId: string) => {
    applyEvidenceFlowOutcome(buildEvidenceValidation({
      evidenceId,
      evidence,
      topic: selectedTopic,
    }));
  };

  const completeGuidedEvidence = () => {
    applyEvidenceFlowOutcome(buildGuidedEvidenceCompletion({
      topic: selectedTopic,
      evidence,
      pendingGuidedEvidence,
    }));
  };

  const prepareAndCompleteGuidedEvidence = () => {
    applyEvidenceFlowOutcome(buildGuidedEvidenceSlotCreationAndCompletion({
      topic: selectedTopic,
      recipe: selectedRecipe,
      profile: selectedWorkflowProfile,
      selectedTopicEvidence,
    }));
  };

  const completeDailyBatchGuidedEvidence = () => {
    applyEvidenceFlowOutcome(buildDailyBatchGuidedEvidenceCompletion({
      control: dailyBatchControl,
      topics,
      evidence,
      profileName: selectedWorkflowProfile.name,
    }));
  };

  const applyDailyBatchAi = () => {
    applyDailyBatchFlowOutcome(buildDailyBatchAiApplication({
      control: dailyBatchControl,
      topics,
      selectedTopic,
      profile: selectedWorkflowProfile,
      selectedRecipe,
      recipes: noteRecipes,
      evidence,
      drafts,
      effectiveVariables: effectiveWorkflowVariables,
      existingGuidedRunRecords: guidedRunRecords,
      getRecipeId: getDailyBatchRecipeId,
    }));
  };

  const approveDailyBatchAudit = () => {
    applyDailyBatchFlowOutcome(buildDailyBatchAuditApproval({
      control: dailyBatchControl,
      topics,
      selectedTopic,
      selectedAuthorName: selectedAuthor.name,
      profile: selectedWorkflowProfile,
      drafts,
      draftVersions,
      existingGuidedRunRecords: guidedRunRecords,
      getRecipeId: getDailyBatchRecipeId,
    }));
  };

  const prepareDailyBatchPayload = () => {
    applyDailyBatchFlowOutcome(buildDailyBatchPayloadPreparation({
      control: dailyBatchControl,
    }));
  };

  const runDailyBatchAutopilot = () => {
    if (!dailyBatchControl.active || dailyBatchControl.topicIds.length === 0) {
      setGuidedFlowStatus('Crear una tanda diaria antes de ejecutar el piloto automático.');
      setPackageStatus('No hay tanda diaria activa para piloto automático.');
      recordAudit('Piloto automático de tanda revisado', 'Sin tanda diaria activa.');
      return;
    }

    const operation = buildDailyBatchAutopilot({
      topicIds: dailyBatchControl.topicIds,
      topics,
      selectedTopic,
      selectedAuthor,
      profile: selectedWorkflowProfile,
      selectedRecipe,
      recipes: noteRecipes,
      evidence,
      drafts,
      draftVersions,
      effectiveVariables: effectiveWorkflowVariables,
      existingGuidedRunRecords: guidedRunRecords,
      getRecipeId: getDailyBatchRecipeId,
    });

    applyOperationalCommit(buildDailyBatchAutopilotCommit(operation));
  };

  const runSingleNoteAutopilot = () => {
    const operation = buildSingleNoteAutopilot({
      topic: selectedTopic,
      authors,
      selectedAuthor,
      profile: selectedWorkflowProfile,
      recipe: selectedRecipe,
      operationModeName: selectedOperationMode.name,
      currentDraft,
      previousBody: selectedDraft?.body,
      rules: editorRules,
      effectiveVariables: effectiveWorkflowVariables,
      workflowVariables,
      evidence,
      drafts,
      draftVersions,
      existingGuidedRunRecords: guidedRunRecords,
      executableRecipeFor: buildExecutableRecipeFor,
    });

    applyOperationalCommit(buildSingleNoteAutopilotCommit({
      operation,
      existingDraftVersions: draftVersions,
      existingGuidedRunRecords: guidedRunRecords,
    }));
  };

  const removeEvidence = (evidenceId: string) => {
    const removedEvidence = evidence.find((item) => item.id === evidenceId);

    dispatchProductionAction({ type: 'evidence/remove', evidenceId });
    recordAudit('Evidencia eliminada', `${removedEvidence?.sourceName || evidenceId} removida.`);
  };

  const toggleReusableImage = (imageId: string) => {
    setReusableImages((current) => toggleReusableImageId(current, imageId));
  };

  const upsertDraft = (draft: EditorialDraft) => {
    dispatchProductionAction({ type: 'draft/upsert', draft });
  };

  const updateCurrentDraft = (patch: Partial<EditorialDraft>) => {
    const updatedDraft = {
      ...currentDraft,
      ...patch,
      updatedAt: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
    };

    upsertDraft(updatedDraft);
  };

  const saveDraftVersion = (changeNote = 'Corte manual guardado por editor.') => {
    const nextVersionNumber = nextDraftVersionNumber(draftVersions, currentDraft.topicId);
    const snapshotAt = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    const nextVersion = createDraftVersionSnapshot({
      id: `version-${currentDraft.topicId}-${Date.now()}`,
      draft: currentDraft,
      version: nextVersionNumber,
      changeNote,
      snapshotAt,
      authorName: selectedAuthor.name,
    });

    dispatchProductionAction({ type: 'draft-version/add', version: nextVersion });
    setDraftStatusMessage(`Version v${nextVersion.version} guardada para "${selectedTopic.title}".`);
    recordAudit('Version de borrador guardada', `v${nextVersion.version} para "${selectedTopic.title}".`);
  };

  const restoreDraftVersion = (versionId: string) => {
    const version = draftVersions.find((item) => item.id === versionId);

    if (!version) {
      return;
    }

    upsertDraft({
      id: version.draftId,
      topicId: version.topicId,
      variant: version.variant,
      status: version.status,
      title: version.title,
      seoTitle: version.seoTitle,
      body: version.body,
      notes: version.notes,
      updatedAt: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
    });
    setDraftMode(version.variant);
    setDraftStatusMessage(`Version v${version.version} restaurada.`);
    recordAudit('Version de borrador restaurada', `v${version.version} para "${selectedTopic.title}".`);
  };

  const removeDraftVersion = (versionId: string) => {
    const version = draftVersions.find((item) => item.id === versionId);

    dispatchProductionAction({ type: 'draft-version/remove', versionId });
    setDraftStatusMessage(`Version v${version?.version || ''} eliminada.`.trim());
    recordAudit('Version de borrador eliminada', `v${version?.version || versionId} removida.`);
  };

  const generateDraft = (variant: DraftVariantKey) => {
    const generated = buildGeneratedDraft({
      topic: selectedTopic,
      author: selectedAuthor,
      rules: editorRules,
      variables: effectiveWorkflowVariables,
      variant,
      currentDraft,
      previousBody: selectedDraft?.body,
      executableRecipe: operationalWorkspace.plan,
    });

    setDraftMode(variant);
    upsertDraft(generated.draft);
    setDraftStatusMessage(`Borrador ${variant} generado para "${selectedTopic.title}".`);
    recordAudit('Borrador generado', `${variant} para "${selectedTopic.title}" usando ${selectedAuthor.name}.`);
  };

  const generateUmsaNote = () => {
    generateDraft('humanizado');
    setAiStatus(`Nota UMSA generada para "${selectedTopic.title}". El payload se actualiza en publication_payload.json.`);
  };

  const recipeTopicPatch = (recipe: NoteRecipe): Partial<Topic> => buildRecipeTopicPatch({
    recipe,
    profile: selectedWorkflowProfile,
    topic: selectedTopic,
    authors,
  });

  const applyRecipeToSelectedTopic = () => {
    const patch = recipeTopicPatch(selectedRecipe);
    ensureRecipeVariables(selectedRecipe);
    updateTopic(selectedTopic.id, patch);
    setDraftStatusMessage(`Receta ${selectedRecipe.shortLabel} aplicada al tema activo.`);
    recordAudit('Receta aplicada', `${selectedRecipe.label} sobre "${selectedTopic.title}" con perfil ${selectedWorkflowProfile.name}.`);
  };

  const createGeneratedRunFromCockpit = (rawTitle: string) => {
    const nextId = Date.now();
    const fallbackAuthor = authors.find((author) => author.name === selectedWorkflowProfile.defaultAuthor)
      || authors.find((author) => author.active)
      || selectedAuthor
      || authorSeed[0];
    const operation = buildCockpitGeneratedRun({
      rawTitle,
      runId: nextId,
      authors,
      fallbackAuthor,
      profile: selectedWorkflowProfile,
      recipe: selectedRecipe,
      rules: editorRules,
      workflowVariables,
      executableRecipeFor: buildExecutableRecipeFor,
    });

    applyOperationalCommit(buildCockpitGeneratedRunCommit(operation));
  };

  const createDailyBatchFromCockpit = () => {
    const batchId = Date.now();
    const fallbackAuthor = authors.find((author) => author.name === selectedWorkflowProfile.defaultAuthor)
      || authors.find((author) => author.active)
      || selectedAuthor
      || authorSeed[0];
    const dailyRecipes = noteRecipes.filter((recipe) => (
      recipe.id === 'reactiva' || recipe.id === 'evergreen' || recipe.id === 'caso'
    ));
    const operation = buildCockpitDailyBatch({
      batchId,
      authors,
      fallbackAuthor,
      profile: selectedWorkflowProfile,
      recipes: dailyRecipes,
      rules: editorRules,
      workflowVariables,
      executableRecipeFor: buildExecutableRecipeFor,
    });

    if (operation.topics.length === 0 || !operation.selectedRecipeId) {
      setGuidedFlowStatus('No hay recetas disponibles para crear tanda diaria.');
      return;
    }

    applyOperationalCommit(buildCockpitDailyBatchCommit({
      operation,
      existingDrafts: drafts,
      existingEvidence: evidence,
      existingGuidedRunRecords: guidedRunRecords,
    }));
  };

  const generateProfileNote = () => {
    const operation = buildProfileNoteOperation({
      topic: selectedTopic,
      authors,
      selectedAuthor,
      profile: selectedWorkflowProfile,
      recipe: selectedRecipe,
      currentDraft,
      previousBody: selectedDraft?.body,
      rules: editorRules,
      effectiveVariables: effectiveWorkflowVariables,
      workflowVariables,
      executableRecipe: operationalWorkspace.plan,
      selectedTopicEvidence,
      draftVersions,
    });

    setEditorSurface('draft');
    applyOperationalCommit(buildProfileNoteCommit(operation));
  };

  const selectAIBriefFile = () => {
    applySingleNoteFlowOutcome(buildAiBriefSelection({
      handoff: aiHandoff,
      request: aiRunRequest,
      topic: selectedTopic,
    }));
  };

  const generateLocalAiResponse = () => {
    applySingleNoteFlowOutcome(buildLocalAiResponseGeneration({
      publicationPayload: editorialPackage.publicationPayload as Record<string, unknown>,
      currentDraft,
      operationModeName: selectedOperationMode.name,
      recipe: selectedRecipe,
      request: aiRunRequest,
      topic: selectedTopic,
    }));
  };

  const runLocalAiAndApply = () => {
    applySingleNoteFlowOutcome(buildLocalAiResponseGenerationAndApplication({
      publicationPayload: editorialPackage.publicationPayload as Record<string, unknown>,
      currentDraft,
      operationModeName: selectedOperationMode.name,
      recipe: selectedRecipe,
      request: aiRunRequest,
      topic: selectedTopic,
      handoff: aiHandoff,
    }));
  };

  const applyAiResponse = () => {
    applySingleNoteFlowOutcome(buildAiResponseApplication({
      rawResponse: aiResponseBuffer,
      currentDraft,
      topic: selectedTopic,
      handoff: aiHandoff,
    }));
  };

  const setCurrentDraftStatus = (status: DraftStatus) => {
    updateCurrentDraft({ status });
    setDraftStatusMessage(`Borrador marcado como ${status}.`);
    recordAudit('Estado de borrador', `"${currentDraft.title}" paso a ${status}.`);

    if (status === 'publicado') {
      applyTopicStatus(selectedTopic.id, 'publicado');
    }
  };

  const registerEditorialPackage = () => {
    setPackageStatus(`Paquete ${editorialPackage.id} generado con ${packageFileKeys.length} archivos.`);
    recordAudit('Paquete editorial generado', `${editorialPackage.id} para "${selectedTopic.title}".`);
  };

  const approveGuidedAudit = ({ openPackageFile = true }: { openPackageFile?: boolean } = {}) => {
    applySingleNoteFlowOutcome(buildGuidedAuditApproval({
      canApprove: canApproveGuidedAudit,
      requirements: guidedAuditRequirements,
      currentDraft,
      draftVersions,
      selectedAuthorName: selectedAuthor.name,
      topic: selectedTopic,
      profile: selectedWorkflowProfile,
      validatedEvidenceCount,
      openPackageFile,
    }));
  };

  const approveAuditFromCockpit = () => {
    approveGuidedAudit({ openPackageFile: false });
  };

  const approveAuditAndPreparePayloadFromCockpit = () => {
    applySingleNoteFlowOutcome(buildAuditApprovalAndPayloadPreparation({
      canApprove: canApproveGuidedAudit,
      requirements: guidedAuditRequirements,
      currentDraft,
      draftVersions,
      selectedAuthorName: selectedAuthor.name,
      topic: selectedTopic,
      profile: selectedWorkflowProfile,
      validatedEvidenceCount,
    }));
  };

  const preparePayloadFromCockpit = () => {
    applySingleNoteFlowOutcome(buildFinalPayloadPreparation({
      topic: selectedTopic,
    }));
  };

  const openPackageFileFromCockpit = (fileKey: EditorialPackageFileKey) => {
    setActiveTab('config');
    setWorkspaceOpen(true);
    setPackageFileKey(fileKey);
    setPackageStatus(`${fileKey} abierto desde el comando operativo de ${selectedTopic.title}.`);
  };

  const runPipelineControl = () => {
    const plan = buildPipelineControlExecutionPlan({
      pipeline: activePipelineState,
      topicTitle: selectedTopic.title,
      recipeShortLabel: selectedRecipe.shortLabel,
      pendingGuidedEvidenceCount: pendingGuidedEvidence.length,
      canApproveGuidedAudit,
      guidedAuditRequirements,
      imageReady: ['prompt_listo', 'generada_externa', 'aprobada'].includes(editorialPackage.imageManifest.status),
    });

    applyGuidedExecutionOutcome(buildGuidedExecutionOutcome(plan));
  };

  const runPipelineAction = (actionId: EditarraPipelineActionId) => {
    const result = buildPipelineActionExecution({
      actionId,
      actions: activePipelineState.actions,
      pipeline: activePipelineState,
      topicTitle: selectedTopic.title,
      recipeShortLabel: selectedRecipe.shortLabel,
      pendingGuidedEvidenceCount: pendingGuidedEvidence.length,
      canApproveGuidedAudit,
      guidedAuditRequirements,
      imageReady: ['prompt_listo', 'generada_externa', 'aprobada'].includes(editorialPackage.imageManifest.status),
    });

    if (result.status === 'blocked') {
      setGuidedFlowStatus(result.guidedFlowStatus);
      return;
    }

    applyGuidedExecutionOutcome(result.outcome);
  };

  const executeGuidedOperation = (operation: GuidedExecutionOperation) => {
    if (operation === 'apply_recipe') {
      applyRecipeToSelectedTopic();
      return;
    }

    if (operation === 'create_source_slots') {
      createGuidedEvidenceSlots();
      return;
    }

    if (operation === 'create_and_complete_source_slots') {
      prepareAndCompleteGuidedEvidence();
      return;
    }

    if (operation === 'complete_sources') {
      completeGuidedEvidence();
      return;
    }

    if (operation === 'generate_note') {
      generateProfileNote();
      return;
    }

    if (operation === 'run_local_ai_and_apply') {
      runLocalAiAndApply();
      return;
    }

    if (operation === 'approve_audit') {
      approveGuidedAudit();
      return;
    }

    if (operation === 'approve_audit_and_prepare_payload') {
      approveAuditAndPreparePayloadFromCockpit();
      return;
    }

    if (operation === 'prepare_image') {
      setActiveTab('imagenes');
      setWorkspaceOpen(true);
      setPackageFileKey('image_prompt.json');
      setPackageStatus(`image_prompt.json preparado para "${selectedTopic.title}".`);
      return;
    }

    preparePayloadFromCockpit();
  };

  const executeGuidedPlan = (plan: GuidedExecutionPlan) => {
    applyGuidedExecutionOutcome(buildGuidedExecutionOutcome(plan));
  };

  const runGuidedNextStep = () => {
    executeGuidedPlan(buildGuidedNextStepExecution({
      nextStep: guidedNextStep,
      recipe: selectedRecipe,
      topicTitle: selectedTopic.title,
    }));
  };

  const runGuidedAssistedFlow = () => {
    executeGuidedPlan(buildGuidedAssistedExecution({
      profile: selectedWorkflowProfile,
      recipe: selectedRecipe,
      snapshot: guidedPipelineSnapshot,
      nextStep: guidedNextStep,
      pendingGuidedEvidenceCount: pendingGuidedEvidence.length,
    }));
  };

  const executeDownloadCommand = (command: EditarraDownloadCommand) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    const blob = new Blob([command.content], { type: command.mimeType });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = command.fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);

    if (command.activeTab) {
      setActiveTab(command.activeTab);
    }

    if (command.packageFileKey) {
      setPackageFileKey(command.packageFileKey);
    }

    setPackageStatus(command.packageStatus);
    recordAudit(command.audit.event, command.audit.detail);
  };

  const applyHandoffCommand = (command: EditarraHandoffCommand) => {
    copyTextToClipboard(command.content);

    if (command.activeTab) {
      setActiveTab(command.activeTab);
    }

    if (command.packageFileKey) {
      setPackageFileKey(command.packageFileKey);
    }

    if (command.aiStatus) {
      setAiStatus(command.aiStatus);
    }

    if (command.guidedFlowStatus) {
      setGuidedFlowStatus(command.guidedFlowStatus);
    }

    if (command.packageStatus) {
      setPackageStatus(command.packageStatus);
    }

    recordAudit(command.audit.event, command.audit.detail);
  };

  const downloadPackageFile = () => {
    executeDownloadCommand(buildPackageFileDownload({
      content: selectedPackageFile,
      packageSlug: editorialPackage.slug,
      packageId: editorialPackage.id,
      fileKey: packageFileKey,
    }));
  };

  const downloadCompletePackage = () => {
    executeDownloadCommand(buildCompletePackageDownload({
      content: completePackageContent,
      packageSlug: editorialPackage.slug,
      packageId: editorialPackage.id,
      fileCount: Object.keys(runtimePackageFiles).length,
    }));
  };

  const copyTextToClipboard = (content: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(content).catch(() => undefined);
    }
  };

  const copyAiRequestFromCockpit = () => {
    applyHandoffCommand(buildCopyAiRequestHandoff({
      content: runtimePackageFiles['ai_request.json'],
      packageId: editorialPackage.id,
      topicTitle: selectedTopic.title,
      request: aiRunRequest,
    }));
  };

  const copyPublicationPayloadFromCockpit = () => {
    applyHandoffCommand(buildCopyPublicationPayloadHandoff({
      content: runtimePackageFiles['publication_payload.json'],
      packageId: editorialPackage.id,
      topicTitle: selectedTopic.title,
    }));
  };

  const copyCompletePackageFromCockpit = () => {
    applyHandoffCommand(buildCopyCompletePackageHandoff({
      content: completePackageContent,
      packageId: editorialPackage.id,
      topicTitle: selectedTopic.title,
      fileCount: Object.keys(runtimePackageFiles).length,
    }));
  };

  const copyOperationalContractFromConfig = () => {
    applyHandoffCommand(buildCopyOperationalContractHandoff({
      content: formatPackageJson(operationalContract),
      topicTitle: selectedTopic.title,
      contract: operationalContract,
    }));
  };

  const downloadOperationalContractFromConfig = () => {
    executeDownloadCommand(buildOperationalContractDownload({
      content: formatPackageJson(operationalContract),
      packageSlug: editorialPackage.slug,
      packageId: editorialPackage.id,
      topicTitle: selectedTopic.title,
      contract: operationalContract,
    }));
  };

  const copyAutomationRecipeFromConfig = () => {
    applyHandoffCommand(buildCopyAutomationRecipeHandoff({
      content: runtimePackageFiles['automation_recipe.json'],
      topicTitle: selectedTopic.title,
      recipe: automationRecipe,
    }));
  };

  const downloadAutomationRecipeFromConfig = () => {
    executeDownloadCommand(buildAutomationRecipeDownload({
      content: runtimePackageFiles['automation_recipe.json'],
      packageSlug: editorialPackage.slug,
      packageId: editorialPackage.id,
      topicTitle: selectedTopic.title,
      recipe: automationRecipe,
    }));
  };

  const registerEditorialBatch = () => {
    setBatchStatus(`Lote ${editorialBatch.id}: ${editorialBatch.readyCount}/${editorialBatch.topicCount} listos, ${editorialBatch.blockedCount} bloqueados.`);
    recordAudit('Lote editorial calculado', `${editorialBatch.id} con ${editorialBatch.topicCount} temas y ${editorialBatch.blockedCount} bloqueos.`);
  };

  const downloadBatchManifest = () => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    const blob = new Blob([editorialBatch.content], { type: 'application/json;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${editorialBatch.id}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
    setBatchStatus(`Manifiesto ${editorialBatch.id}.json descargado.`);
    recordAudit('Manifiesto de lote descargado', `${editorialBatch.id}.json`);
  };

  const registerDistributionPlan = () => {
    setDistributionStatus(`Cola ${distributionPlan.id}: ${distributionPlan.readyCount} listas, ${distributionPlan.reviewCount} en revision, ${distributionPlan.blockedCount} bloqueadas.`);
    recordAudit('Cola de distribucion generada', `${distributionPlan.id} con ${distributionPlan.deliverableCount} entregables multicanal.`);
  };

  const downloadDistributionPlan = () => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    const blob = new Blob([distributionPlan.content], { type: 'application/json;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${distributionPlan.id}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
    setDistributionStatus(`Plan ${distributionPlan.id}.json descargado.`);
    recordAudit('Plan de distribucion descargado', `${distributionPlan.id}.json`);
  };

  const copyDistributionDeliverable = (deliverableId: string, label: string, title: string, copy: string) => {
    if (typeof navigator !== 'undefined' && navigator.permissions?.query && navigator.clipboard?.writeText) {
      void navigator.permissions.query({ name: 'clipboard-write' as PermissionName })
        .then((permission) => (
          permission.state === 'granted'
            ? navigator.clipboard.writeText(copy).catch(() => undefined)
            : undefined
        ))
        .catch(() => undefined);
    }

    dispatchProductionAction({ type: 'distribution/mark', deliverableId, status: 'copiado' });
    setDistributionStatus(`Copy ${label} para "${title}" preparado.`);
    recordAudit('Copy de distribucion preparado', `${label} para "${title}".`);
  };

  const markDistributionDelivered = (deliverableId: string, label: string, title: string) => {
    dispatchProductionAction({ type: 'distribution/mark', deliverableId, status: 'enviado' });
    setDistributionStatus(`${label} para "${title}" marcado como enviado.`);
    recordAudit('Entrega de distribucion marcada', `${label} para "${title}".`);
  };

  const markCurrentPublicationSent = () => {
    const outcome = buildPublicationSentOutcome({
      topicId: selectedTopic.id,
      topicTitle: selectedTopic.title,
      selectedDestinationId: selectedPublicationDestinationId,
      destinations: publicationDestinations,
      publicationStatus: publicationManifest.status,
      targetStatus: publicationTargets.find((target) => target.destinationId === selectedPublicationDestinationId)?.status,
    });

    if (outcome.status === 'missing-destination' || outcome.status === 'blocked-preflight') {
      setPackageStatus(outcome.packageStatus);
      setDistributionStatus(outcome.distributionStatus);
      return;
    }

    applyTopicStatus(outcome.topicId, outcome.topicStatus);
    updateCurrentDraft({ status: outcome.draftStatus });
    dispatchProductionAction({
      type: 'distribution/mark',
      deliverableId: outcome.deliverableId,
      status: outcome.distributionActionStatus,
    });
    setActiveTab(outcome.activeTab);
    setPackageFileKey(outcome.packageFileKey);
    setPackageStatus(outcome.packageStatus);
    setGuidedFlowStatus(outcome.guidedFlowStatus);
    setDistributionStatus(outcome.distributionStatus);
    recordAudit(outcome.audit.event, outcome.audit.detail);
  };

  const updateImagePrompt = (imageId: string, patch: Partial<ImagePrompt>) => {
    setImagePrompts((current) => updateImagePromptList(current, imageId, patch));
  };

  const addImagePrompt = () => {
    setImagePrompts((current) => [
      ...current,
      createImagePrompt({ id: `img-${Date.now()}` }),
    ]);
  };

  const removeImagePrompt = (imageId: string) => {
    const removal = removeImagePromptFromWorkflow({
      imagePrompts,
      reusableImages,
      imageId,
    });

    if (!removal.removed) {
      return;
    }

    setImagePrompts(removal.imagePrompts);
    setReusableImages(removal.reusableImages);
  };

  const updateEditorRule = (ruleId: string, patch: Partial<EditorRule>) => {
    setEditorRules((current) => current.map((rule) => (
      rule.id === ruleId ? { ...rule, ...patch } : rule
    )));
  };

  const addEditorRule = () => {
    setEditorRules((current) => [
      ...current,
      {
        id: `rule-${Date.now()}`,
        title: 'Nueva regla editorial',
        body: 'Define una restriccion concreta que pueda auditarse antes de publicar.',
        enabled: true,
      },
    ]);
  };

  const removeEditorRule = (ruleId: string) => {
    if (editorRules.length <= 1) {
      return;
    }

    setEditorRules((current) => current.filter((rule) => rule.id !== ruleId));
  };

  const applyImportedConfig = () => {
    const result = buildImportedEditarraState({
      rawJson: importBuffer,
      currentProfiles: profiles,
    });

    if (!result.ok) {
      setImportStatus(result.importStatus);
      return;
    }

    const imported = result.import;

    if (imported.profiles) {
      setProfiles(imported.profiles);
    }

    if (imported.selectedSiteId) {
      setSelectedSiteId(imported.selectedSiteId);
    }

    if (imported.selectedRecipeId) {
      setSelectedRecipeId(imported.selectedRecipeId);
    }

    if (imported.selectedOperationModeId) {
      setSelectedOperationModeId(imported.selectedOperationModeId);
    }

    if (imported.selectedPublicationDestinationId) {
      setSelectedPublicationDestinationId(imported.selectedPublicationDestinationId);
    }

    if (imported.packageFileKey) {
      setPackageFileKey(imported.packageFileKey);
    }

    if (imported.authors) {
      setAuthors(imported.authors);
    }

    if (imported.topics) {
      setTopics(imported.topics);
      setSelectedTopicId(
        imported.selectedTopicId && imported.topics.some((topic) => topic.id === imported.selectedTopicId)
          ? imported.selectedTopicId
          : imported.topics[0]?.id || topicSeed[0].id,
      );
      setQuery('');
      setStatusFilter('todos');
    }

    if (imported.editorialAgendas) {
      setEditorialAgendas(imported.editorialAgendas);
      setSelectedAgendaId(
        imported.selectedAgendaId && imported.editorialAgendas.some((agenda) => agenda.id === imported.selectedAgendaId)
          ? imported.selectedAgendaId
          : imported.editorialAgendas[0]?.id || selectedAgendaId,
      );
    }

    if (imported.discoveryCandidates) {
      setDiscoveryCandidates(imported.discoveryCandidates);
      setCandidateStatusFilter(imported.candidateStatusFilter || 'todos');
      setCandidateRunScope(imported.candidateRunScope || 'ultimo_run');
    }

    if (imported.discoveryRuns) {
      setDiscoveryRuns(imported.discoveryRuns);
    }

    if (imported.workflowVariables) {
      setWorkflowVariables(imported.workflowVariables);
    }

    if (imported.noteVariableOverrides) {
      setNoteVariableOverrides(imported.noteVariableOverrides);
    }

    if (imported.missionPresets) {
      setMissionPresets(imported.missionPresets);
    }

    if (imported.imagePrompts) {
      setImagePrompts(imported.imagePrompts);
    }

    if (imported.editorRules) {
      setEditorRules(imported.editorRules);
    }

    if (imported.auditEvents) {
      setAuditEvents(imported.auditEvents);
    }

    if (imported.reusableImages) {
      setReusableImages(imported.reusableImages);
    }

    if (Object.keys(imported.productionPatch).length > 0) {
      dispatchProductionAction({ type: 'state/patch', patch: imported.productionPatch });
    }

    setShowExport(imported.shouldShowExport);
    setImportStatus(imported.importStatus);
    setDraftStatusMessage(imported.draftStatusMessage);
  };

  const resetLocalState = () => {
    clearStoredEditarraState();

    const baseline = buildEditarraResetBaseline();

    setProfiles(baseline.profiles);
    setSelectedSiteId(baseline.selectedSiteId);
    setAuthors(baseline.authors);
    setTopics(baseline.topics);
    setEditorialAgendas(baseline.editorialAgendas);
    setSelectedAgendaId(baseline.selectedAgendaId);
    setDiscoveryCandidates(baseline.discoveryCandidates);
    setDiscoveryRuns(baseline.discoveryRuns);
    setCandidateStatusFilter(baseline.candidateStatusFilter);
    setCandidateRunScope(baseline.candidateRunScope);
    setSelectedRecipeId(baseline.selectedRecipeId);
    setSelectedOperationModeId(baseline.selectedOperationModeId);
    setSelectedPublicationDestinationId(baseline.selectedPublicationDestinationId);
    setReusableImages(baseline.reusableImages);
    setWorkflowVariables(baseline.workflowVariables);
    setNoteVariableOverrides(baseline.noteVariableOverrides);
    setMissionPresets(baseline.missionPresets);
    setImagePrompts(baseline.imagePrompts);
    setEditorRules(baseline.editorRules);
    dispatchProductionAction({ type: 'state/patch', patch: baseline.productionPatch });
    setAuditEvents(baseline.auditEvents);
    setSelectedTopicId(baseline.selectedTopicId);
    setQuery(baseline.query);
    setStatusFilter(baseline.statusFilter);
    setImportBuffer(baseline.importBuffer);
    setShowExport(baseline.showExport);
    setImportStatus(baseline.importStatus);
    setDraftStatusMessage(baseline.draftStatusMessage);
    setPackageFileKey(baseline.packageFileKey);
    setPackageStatus(baseline.packageStatus);
    setBatchStatus(baseline.batchStatus);
    setDistributionStatus(baseline.distributionStatus);
    setGuidedFlowStatus(baseline.guidedFlowStatus);
  };

  const cockpitLanes: OpsCockpitLane[] = [
    {
      id: 'produccion',
      eyebrow: 'Produccion',
      title: guidedNextStep.label,
      status: guidedNextStep.badge,
      tone: guidedNextStep.tone,
      metric: `${validatedEvidenceCount}/${selectedWorkflowProfile.sourceMinimum} fuentes`,
      detail: guidedNextStep.detail,
      actionLabel: 'Avanzar corrida',
      onAction: runGuidedAssistedFlow,
      secondaryLabel: 'Agenda',
      onSecondary: () => setActiveTab('agenda'),
    },
    {
      id: 'ai',
      eyebrow: 'AI',
      title: 'Handoff provider-agnostic',
      status: aiHandoff.status,
      tone: aiHandoff.status === 'listo_para_ai' ? 'emerald' : aiHandoff.status === 'requiere_fuentes' ? 'rose' : 'amber',
      metric: aiHandoff.sendFile,
      detail: aiHandoff.nextAction,
      actionLabel: 'Preparar handoff',
      onAction: () => {
        setActiveTab('editor');
        selectAIBriefFile();
      },
      secondaryLabel: 'Editor',
      onSecondary: () => setActiveTab('editor'),
    },
    {
      id: 'auditoria',
      eyebrow: 'Auditoria',
      title: canApproveGuidedAudit ? 'Aprobacion asistida lista' : 'Control de preflight',
      status: selectedQualityReady ? 'quality ok' : 'revisar',
      tone: preflightBlockers > 0 ? 'rose' : selectedQualityReady ? 'emerald' : 'amber',
      metric: `${preflightBlockers} bloqueos`,
      detail: guidedAuditRequirements.join(', ') || `${preflightWarnings} avisos y ${validatedEvidenceCount} fuentes validadas.`,
      actionLabel: canApproveGuidedAudit ? 'Aprobar y ver preview' : 'Revisar auditoria',
      onAction: canApproveGuidedAudit
        ? approveAuditAndPreparePayloadFromCockpit
        : () => {
            setActiveTab('auditoria');
            setPackageFileKey('quality_audit.json');
          },
      secondaryLabel: 'Evidencias',
      onSecondary: () => setActiveTab('auditoria'),
    },
    {
      id: 'publicacion',
      eyebrow: 'Publicacion',
      title: 'Payload controlado',
      status: publicationManifest.status,
      tone: publicationManifest.status === 'listo_para_publicar' ? 'emerald' : publicationManifest.status === 'bloqueado' ? 'rose' : 'amber',
      metric: publicationManifest.payloadFile,
      detail: publicationManifest.nextAction,
      actionLabel: 'Ver preview',
      onAction: () => {
        setActiveTab('publicacion');
        setPackageFileKey('publication_payload.json');
        registerEditorialPackage();
      },
      secondaryLabel: 'Config',
      onSecondary: () => setActiveTab('config'),
    },
  ];

  const cockpitSourceControl: SourceControlSummary = {
    total: selectedTopicEvidence.length,
    validated: validatedEvidenceCount,
    pending: selectedTopicEvidence.filter((item) => item.status !== 'validado').length,
    pendingGuided: pendingGuidedEvidence.length,
    sourceMinimum: selectedWorkflowProfile.sourceMinimum,
    latest: selectedTopicEvidence.slice(0, 3).map(({ id, sourceName, status, confidence }) => ({
      id,
      sourceName,
      status,
      confidence,
    })),
  };

  const cockpitDailyBatchControl: DailyBatchControlSummary = {
    active: dailyBatchControl.active,
    topicCount: dailyBatchControl.topicCount,
    validated: dailyBatchControl.validated,
    pendingGuided: dailyBatchControl.pendingGuided,
    sourceMinimum: dailyBatchControl.sourceMinimum,
    aiReady: dailyBatchControl.aiReady,
    auditApproved: dailyBatchControl.auditApproved,
    payloadReady: dailyBatchControl.payloadReady,
    latestTitles: dailyBatchControl.latestTitles,
  };

  const cockpitAiHandoff: AiHandoffSummary = {
    status: aiHandoff.status,
    sendFile: aiHandoff.sendFile,
    expectedFile: aiHandoff.expectedFile,
    nextAction: aiHandoff.nextAction,
    checksum: aiHandoff.checksum,
    sourceCount: aiHandoff.sourceCount,
    requiredSources: aiHandoff.requiredSources,
    outputSchemaKeys: aiHandoff.outputSchemaKeys,
  };

  const cockpitAiRunRequest: AiRunRequestSummary = {
    id: aiRunRequest.id,
    transport: aiRunRequest.transport,
    blocked: aiRunRequest.blocked,
    status: aiRunRequest.status,
    instructions: aiRunRequest.instructions,
    outputSchemaKeys: aiRunRequest.outputSchemaKeys,
    checksum: aiRunRequest.checksum,
  };

  const cockpitClosureControl: ClosureControlSummary = {
    qualityStatus: editorialPackage.qualityAudit.status,
    canApproveAudit: canApproveGuidedAudit,
    preflightBlockers,
    preflightWarnings,
    publicationStatus: publicationManifest.status,
    payloadFile: publicationManifest.payloadFile,
    nextAction: publicationManifest.nextAction,
    activePayloadTitle: publicationManifest.activePayload.title,
  };

  const openAgendaMode = (mode: AgendaEntryMode) => {
    setAgendaEntryMode(mode);
    setActiveTab('agenda');
    setWorkspaceOpen(true);
  };

  const openEditorMode = (surface: EditorSurface) => {
    setEditorSurface(surface);
    setActiveTab('editor');
    setWorkspaceOpen(true);
  };

  const openConfigPackageFile = (fileKey: EditorialPackageFileKey) => {
    setActiveTab('config');
    setWorkspaceOpen(true);
    setPackageFileKey(fileKey);
  };

  const operationViewModel = buildOperationViewModel({
    agendaId: selectedAgenda.id,
    discoveryCandidates,
    filteredDiscoveryCandidates,
    topics,
  });
  const editorialJourney = buildEditarraJourneyState({
    candidateCount: operationViewModel.candidateCount,
    selectedTopicStatus: selectedTopic.status,
    selectedTopicTitle: selectedTopic.title,
    selectedTopicCandidateId: selectedTopic.candidateId,
    sourceSeedCount: selectedAgenda.sourceUrls.length,
    sourcesValidated: validatedEvidenceCount,
    sourcesRequired: selectedWorkflowProfile.sourceMinimum,
    draftStatus: currentDraft.status,
    draftReady: currentDraft.body.trim().length > 0,
    qualityStatus: editorialPackage.qualityAudit.status,
    preflightBlockers,
    preflightWarnings,
    imageStatus: editorialPackage.imageManifest.status,
    imageExpectedFilename: editorialPackage.imageManifest.expectedFilename,
    publicationStatus: publicationManifest.status,
    publicationNextAction: publicationManifest.nextAction,
    publicationTargetCount: publicationTargets.length,
    publicExportReady: activePublicExportBundle.readyToPublish,
  });

  const openJourneyTarget = (target: EditarraJourneyTarget) => {
    if (target === 'agenda:radar') {
      openAgendaMode('radar');
      return;
    }

    if (target === 'agenda:candidatos') {
      openAgendaMode('candidatos');
      return;
    }

    if (target === 'agenda:parrilla') {
      openAgendaMode('parrilla');
      return;
    }

    if (target === 'editor:workspace') {
      openEditorMode('workspace');
      return;
    }

    if (target === 'editor:draft') {
      openEditorMode('draft');
      return;
    }

    if (target === 'auditoria') {
      setActiveTab('auditoria');
      setWorkspaceOpen(true);
      setPackageFileKey('quality_audit.json');
      return;
    }

    if (target === 'imagenes') {
      setActiveTab('imagenes');
      setWorkspaceOpen(true);
      return;
    }

    setActiveTab('publicacion');
    setWorkspaceOpen(true);
  };

  const operationStages: OperationFlowStage[] = editorialJourney.stages.map((stage) => ({
    id: stage.id,
    label: stage.label,
    status: stage.status,
    tone: stage.tone,
    detail: stage.detail,
    control: stage.control,
    metric: stage.metric,
    actionLabel: stage.actionLabel,
    onAction: stage.id === 'radar' && operationViewModel.candidateCount === 0
      ? runAgendaDiscovery
      : () => openJourneyTarget(stage.target),
  }));
  const currentOperationStage = operationStages.find((stage) => stage.id === editorialJourney.currentStageId);

  return (
    <EditarraShell
      tabs={tabs}
      activeTab={activeTab}
      selectedSiteId={selectedSiteId}
      selectedSite={selectedSite}
      profiles={profiles}
      query={query}
      summaryMetrics={[
        { label: 'Autores activos', value: `${activeAuthors}/${authors.length}`, detail: 'control', tone: 'emerald' },
        { label: 'Temas en parrilla', value: String(approvedTopics), detail: 'flujo', tone: 'blue' },
        { label: 'Token budget', value: `${Math.round(topicTokenBudget / 1000)}K`, detail: 'investigacion', tone: 'amber' },
        { label: 'Modo portable', value: 'JSON', detail: 'sin API', tone: 'slate' },
      ]}
      onSelectTab={(tabKey) => {
        setActiveTab(tabKey as TabKey);
        setWorkspaceOpen(true);
      }}
      onSelectSite={setSelectedSiteId}
      onSearch={(nextQuery) => {
        setQuery(nextQuery);
        setAgendaEntryMode('radar');
        setActiveTab('agenda');
        setWorkspaceOpen(true);
      }}
      onExport={() => {
        setShowExport(true);
      }}
    >
      <Modal
        open={showExport}
        onClose={() => setShowExport(false)}
        title="Export portable EDITARRA"
        description="Export portable completo de EDITARRA para revisar o copiar sin desplazar la pantalla."
        className="max-w-5xl"
      >
        <div className="p-5">
          <pre className="max-h-[70vh] min-w-0 max-w-full overflow-auto rounded-2xl bg-slate-950 p-4 text-xs leading-6 text-slate-100 shadow-inner" aria-label="Workflow JSON">
            {JSON.stringify(exportPayload, null, 2)}
          </pre>
        </div>
      </Modal>

      <section
            id={`editarra-panel-${activeTab}`}
            role="tabpanel"
            aria-labelledby={`editarra-tab-${activeTab}`}
            className="mt-4"
            aria-live="polite"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-normal text-emerald-700">{activeTabMeta.label}</p>
                <h2 className="text-lg font-semibold text-slate-950">{activeTabMeta.summary}</h2>
              </div>
            </div>

            {activeTab === 'operacion' && (
              <OperationFlowPanel
                progress={editorialJourney.progress}
                nextControl={editorialJourney.nextControl}
                pipelineStatus={editorialJourney.status}
                selectedAgendaName={selectedAgenda.name}
                selectedDestination={selectedAgenda.destination}
                selectedTopicTitle={selectedTopic.title}
                selectedTopicStatus={selectedTopic.status}
                selectedAuthorName={selectedAuthor.name}
                selectedRecipeLabel={selectedRecipe.label}
                draftStatus={currentDraft.status}
                qualityStatus={editorialPackage.qualityAudit.status}
                imageStatus={editorialPackage.imageManifest.status}
                publicationStatus={publicationManifest.status}
                candidateCount={operationViewModel.candidateCount}
                topicCount={operationViewModel.topicCount}
                validatedEvidenceCount={validatedEvidenceCount}
                requiredEvidenceCount={selectedWorkflowProfile.sourceMinimum}
                preflightBlockers={preflightBlockers}
                preflightWarnings={preflightWarnings}
                blockers={editorialJourney.blockers}
                stages={operationStages}
                candidates={operationViewModel.candidates}
                topics={operationViewModel.topics}
                onRunPrimary={currentOperationStage?.onAction || runPipelineControl}
                onRunDiscovery={runAgendaDiscovery}
                onOpenRadar={() => openAgendaMode('radar')}
                onOpenCandidates={() => openAgendaMode('candidatos')}
                onOpenParrilla={() => openAgendaMode('parrilla')}
                onOpenEditor={() => openEditorMode('workspace')}
                onOpenDraft={() => openEditorMode('draft')}
                onOpenAudit={() => setActiveTab('auditoria')}
                onOpenImages={() => setActiveTab('imagenes')}
                onOpenPublication={() => setActiveTab('publicacion')}
                onOpenConfig={() => openConfigPackageFile('package_manifest.json')}
              />
            )}

            {activeTab === 'agenda' && (
              <AgendaPanel
                query={query}
                statusFilter={statusFilter}
                topics={topics}
                filteredTopics={filteredTopics}
                selectedTopic={selectedTopic}
                selectedTopicScore={selectedTopicScore}
                authors={authors}
                auditEvents={auditEvents}
                editorialAgendas={editorialAgendas}
                selectedAgenda={selectedAgenda}
                selectedAgendaId={selectedAgendaId}
                discoveryCandidates={discoveryCandidates}
                filteredDiscoveryCandidates={filteredDiscoveryCandidates}
                discoveryRuns={discoveryRuns}
                candidateStatusFilter={candidateStatusFilter}
                candidateRunScope={candidateRunScope}
                radarQuery={radarQuery}
                discoveryStatus={discoveryStatus}
                discoveryRequestJson={discoveryRequestJson}
                sourceResearchPrompt={sourceResearchPrompt}
                radarRunReport={activeRadarRunReport}
                initialMode={agendaEntryMode}
                profiles={profiles}
                noteRecipes={noteRecipes}
                operationModes={operationModes}
                onQueryChange={setQuery}
                onStatusFilterChange={setStatusFilter}
                onAddTopic={addTopic}
                onSelectTopic={setSelectedTopicId}
                onUpdateTopic={updateTopic}
                onUpdateTopicStatus={updateTopicStatus}
                onRemoveTopic={removeTopic}
                onSelectAgenda={setSelectedAgendaId}
                onUpdateAgenda={updateAgenda}
                onSaveAgenda={saveAgendaNow}
                onAddAgenda={addAgenda}
                onRemoveAgenda={removeAgenda}
                onRadarQueryChange={setRadarQuery}
                onRunDiscovery={runAgendaDiscovery}
                onCandidateStatusFilterChange={setCandidateStatusFilter}
                onCandidateRunScopeChange={setCandidateRunScope}
                onUpdateCandidateStatus={updateDiscoveryCandidateStatus}
                onConvertCandidateToTopic={convertCandidateToTopic}
                onConvertCandidateToNoteRun={convertCandidateToNoteRun}
                onCopyDiscoveryRequest={copyDiscoveryRequest}
                onCopySourceResearchPrompt={copySourceResearchPrompt}
                onImportDiscoveryResults={importDiscoveryResults}
              />
            )}

            {activeTab === 'autores' && (
              <AuthorsPanel
                authors={authors}
                onAddAuthor={addAuthor}
                onToggleAuthor={toggleAuthor}
                onUpdateAuthorField={updateAuthorField}
                onUpdateAuthorListField={updateAuthorListField}
                onUpdateAuthorWeight={updateAuthorWeight}
                onUpdateAuthorInfluence={updateAuthorInfluence}
                onAddAuthorInfluence={addAuthorInfluence}
                onRemoveAuthorInfluence={removeAuthorInfluence}
                onRemoveAuthor={removeAuthor}
              />
            )}

            {activeTab === 'editor' && (
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
                <div className="xl:col-span-2 flex flex-wrap items-center gap-2 rounded-2xl bg-white p-2 shadow-sm ring-1 ring-slate-200/80">
                  {[
                    ['workspace', 'Comando'],
                    ['draft', 'Borrador'],
                    ['guided', 'Playbook'],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setEditorSurface(value as EditorSurface)}
                      className={cx(
                        'rounded-lg px-3 py-2 text-sm font-semibold transition',
                        editorSurface === value ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950',
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {editorSurface === 'workspace' && (
                  <>
                    <div className="xl:col-span-2 grid gap-4">
                      <div className="order-1">
                        <OperationalWorkspacePanel
                          workspace={operationalWorkspace}
                          pipelineState={activePipelineState}
                          sourceControl={{
                            total: selectedTopicEvidence.length,
                            validated: validatedEvidenceCount,
                            pending: selectedTopicEvidence.filter((item) => item.status !== 'validado').length,
                            pendingGuided: pendingGuidedEvidence.length,
                            sourceMinimum: selectedWorkflowProfile.sourceMinimum,
                            latest: selectedTopicEvidence.slice(0, 3).map(({ id, sourceName, status, confidence }) => ({
                              id,
                              sourceName,
                              status,
                              confidence,
                            })),
                          }}
                          closureControl={{
                            qualityStatus: editorialPackage.qualityAudit.status,
                            canApproveAudit: canApproveGuidedAudit,
                            preflightBlockers,
                            preflightWarnings,
                            publicationStatus: publicationManifest.status,
                            payloadFile: publicationManifest.payloadFile,
                            nextAction: publicationManifest.nextAction,
                            activePayloadTitle: publicationManifest.activePayload.title,
                          }}
                          operationModes={operationModes}
                          selectedOperationModeId={selectedOperationMode.id}
                          onEditAuthor={() => setActiveTab('autores')}
                          onEditVariables={() => setActiveTab('config')}
                          onOpenAudit={() => {
                            setActiveTab('auditoria');
                            setPackageFileKey('quality_audit.json');
                          }}
                          onGenerateNote={generateProfileNote}
                          onSelectOperationMode={setSelectedOperationModeId}
                          onApplyOperationMode={applyOperationMode}
                          onCreateGeneratedRun={createGeneratedRunFromCockpit}
                          onUpdateNoteVariable={updateWorkflowVariableByKey}
                          onPrepareAi={selectAIBriefFile}
                          onPreparePayload={preparePayloadFromCockpit}
                          onRunNextControl={runPipelineControl}
                          onRunAutopilot={runSingleNoteAutopilot}
                          onCreateGuidedSources={createGuidedEvidenceSlots}
                          onValidateGuidedSources={completeGuidedEvidence}
                          onOpenSources={() => {
                            setActiveTab('auditoria');
                            setPackageFileKey('evidence_log.json');
                          }}
                          onApproveAudit={approveAuditFromCockpit}
                          onCloseAuditAndPreparePayload={approveAuditAndPreparePayloadFromCockpit}
                          onOpenPackageFile={openPackageFileFromCockpit}
                          onCopyAiRequest={copyAiRequestFromCockpit}
                          onCopyPublicationPayload={copyPublicationPayloadFromCockpit}
                          onCopyCompletePackage={copyCompletePackageFromCockpit}
                        />
                      </div>

                      <details className="order-2 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/80">
                        <summary className="cursor-pointer select-none px-5 py-4 text-sm font-semibold text-slate-800 marker:text-emerald-700">
                          Ver cockpit técnico, handoff y trazabilidad completa
                        </summary>
                        <div className="grid gap-4 border-t border-slate-200 bg-slate-50 p-4">
                          <RunCockpitPanel
                            workspace={operationalWorkspace}
                            profiles={profiles}
                            operationModes={operationModes}
                            recipes={noteRecipes}
                            authors={authors}
                            selectedProfileId={selectedSiteId}
                            selectedOperationModeId={selectedOperationMode.id}
                            selectedRecipeId={selectedRecipeId}
                            guidedNextStep={guidedNextStep}
                            guidedAutopilotPlan={guidedAutopilotPlan}
                            pipelineState={activePipelineState}
                            activeNoteRun={activeNoteRun}
                            guidedFlowStatus={guidedFlowStatus}
                            visibleRuns={visibleGuidedRuns}
                            recentRuns={recentGuidedRuns}
                            payloadFileKey={packageFileKey}
                            sourceControl={cockpitSourceControl}
                            dailyBatchControl={cockpitDailyBatchControl}
                            aiHandoff={cockpitAiHandoff}
                            aiRunRequest={cockpitAiRunRequest}
                            aiResponseBuffer={aiResponseBuffer}
                            aiStatus={aiStatus}
                            closureControl={cockpitClosureControl}
                            postingModeLabels={postingModeLabels}
                            onSelectProfile={setSelectedSiteId}
                            onSelectOperationMode={setSelectedOperationModeId}
                            onApplyOperationMode={applyOperationMode}
                            onSelectRecipe={selectRecipe}
                            onSelectAuthor={(authorName) => updateTopic(selectedTopic.id, { author: authorName })}
                            onDuplicateProfile={createProfileFromCurrentRun}
                            onUpdateSelectedProfile={updateSelectedProfile}
                            onUpdateAuthorField={(field, value) => updateAuthorField(selectedAuthor.id, field, value)}
                            onUpdateAuthorListField={(field, value) => updateAuthorListField(selectedAuthor.id, field, value)}
                            onUpdateAuthorStyleWeight={(key, value) => updateAuthorWeight(selectedAuthor.id, key, value)}
                            onUpdateNoteVariable={updateWorkflowVariableByKey}
                            onResumeRun={resumeGuidedRun}
                            onOperateQueuedRun={operateQueuedRun}
                            onCreateGeneratedRun={createGeneratedRunFromCockpit}
                            onCreateDailyBatch={createDailyBatchFromCockpit}
                            onRunSingleNoteAutopilot={runSingleNoteAutopilot}
                            onRunPipelineAction={runPipelineAction}
                            onOpenPackageFile={openPackageFileFromCockpit}
                            onCopyAiRequest={copyAiRequestFromCockpit}
                            onRunAssisted={runGuidedAssistedFlow}
                            onRunNextStep={runGuidedNextStep}
                            onGenerateNote={generateProfileNote}
                            onEditVariables={() => setActiveTab('config')}
                            onCreateGuidedSources={createGuidedEvidenceSlots}
                            onValidateGuidedSources={completeGuidedEvidence}
                            onValidateDailyBatchSources={completeDailyBatchGuidedEvidence}
                            onApplyDailyBatchAi={applyDailyBatchAi}
                            onApproveDailyBatchAudit={approveDailyBatchAudit}
                            onPrepareDailyBatchPayload={prepareDailyBatchPayload}
                            onRunDailyBatchAutopilot={runDailyBatchAutopilot}
                            onOpenSources={() => {
                              setActiveTab('auditoria');
                              setPackageFileKey('evidence_log.json');
                            }}
                            onPrepareAiHandoff={selectAIBriefFile}
                            onGenerateLocalAiResponse={generateLocalAiResponse}
                            onRunLocalAiAndApply={runLocalAiAndApply}
                            onUpdateAiResponse={setAiResponseBuffer}
                            onApplyAiResponse={applyAiResponse}
                            onApproveAudit={approveAuditFromCockpit}
                            onCloseAuditAndPreparePayload={approveAuditAndPreparePayloadFromCockpit}
                            onPreparePayload={preparePayloadFromCockpit}
                            onCopyPublicationPayload={copyPublicationPayloadFromCockpit}
                            onCopyCompletePackage={copyCompletePackageFromCockpit}
                            onOpenAudit={() => {
                              setActiveTab('auditoria');
                              setPackageFileKey('quality_audit.json');
                            }}
                            onOpenPayload={() => {
                              setActiveTab('config');
                              setPackageFileKey('publication_payload.json');
                              registerEditorialPackage();
                            }}
                          />

                          <OpsCockpit
                            topicTitle={selectedTopic.title}
                            packageId={editorialPackage.id}
                            lanes={cockpitLanes}
                          />
                        </div>
                      </details>
                    </div>
                  </>
                )}

                {editorSurface === 'draft' && (
                  <>
                    <NoteEditorPanel
                      draftCopies={draftCopies}
                      draftStatusTone={draftStatusTone}
                      currentDraft={currentDraft}
                      selectedTopicTitle={selectedTopic.title}
                      draftStatusMessage={draftStatusMessage}
                      editorialPackage={editorialPackage}
                      aiHandoff={aiHandoff}
                      aiResponseBuffer={aiResponseBuffer}
                      aiStatus={aiStatus}
                      qualityStatus={editorialPackage.qualityAudit.status}
                      validatedEvidenceCount={validatedEvidenceCount}
                      requiredEvidenceCount={selectedWorkflowProfile.sourceMinimum}
                      pendingGuidedEvidenceCount={pendingGuidedEvidence.length}
                      canApproveAudit={canApproveGuidedAudit}
                      auditRequirements={guidedAuditRequirements}
                      selectedDraftVersions={selectedDraftVersions}
                      latestDraftVersion={latestDraftVersion}
                      onGenerateDraft={generateDraft}
                      onUpdateCurrentDraft={updateCurrentDraft}
                      onSetCurrentDraftStatus={setCurrentDraftStatus}
                      onGenerateUmsaNote={generateUmsaNote}
                      onSelectAiBriefFile={selectAIBriefFile}
                      onSelectPackageFile={setPackageFileKey}
                      onUpdateAiResponse={setAiResponseBuffer}
                      onApplyAiResponse={applyAiResponse}
                      onUseCurrentPayloadAsAiResponse={() => setAiResponseBuffer(editorialPackage.files['publication_payload.json'])}
                      onCompleteGuidedEvidence={completeGuidedEvidence}
                      onRunLocalAiAndApply={runLocalAiAndApply}
                      onApproveAudit={approveAuditFromCockpit}
                      onApproveAuditAndPreparePayload={approveAuditAndPreparePayloadFromCockpit}
                      onPreparePayload={preparePayloadFromCockpit}
                      onSaveDraftVersion={() => saveDraftVersion()}
                      onRestoreDraftVersion={restoreDraftVersion}
                      onRemoveDraftVersion={removeDraftVersion}
                    />

                    <EditorialRulesPanel
                      editorRules={editorRules}
                      onAddEditorRule={addEditorRule}
                      onUpdateEditorRule={updateEditorRule}
                      onRemoveEditorRule={removeEditorRule}
                    />

                    <SeoExperimentsPanel
                      selectedTopicSeoExperiments={selectedTopicSeoExperiments}
                      selectedSeoExperiment={selectedSeoExperiment}
                      seoStrategies={seoStrategies}
                      onAddSeoExperiment={addSeoExperiment}
                      onUpdateSeoExperiment={updateSeoExperiment}
                      onSelectSeoExperiment={selectSeoExperiment}
                      onRemoveSeoExperiment={removeSeoExperiment}
                    />
                  </>
                )}

                {editorSurface === 'guided' && (
                  <div className="xl:col-span-2 grid gap-4">
                    <section className="overflow-hidden rounded-2xl bg-slate-950 shadow-sm ring-1 ring-slate-900" aria-label="Flujo de trabajo">
                      <div className="grid divide-y divide-white/10 md:grid-cols-5 md:divide-x md:divide-y-0">
                        {workflowSteps.map((step, index) => (
                          <article key={step.title} className="p-4">
                            <div className="flex items-center justify-between gap-3">
                              <Badge tone={step.tone}>{step.title}</Badge>
                              <span className="text-xs font-medium text-slate-500">{String(index + 1).padStart(2, '0')}</span>
                            </div>
                            <p className="mt-3 text-sm leading-6 text-slate-300">{step.body}</p>
                          </article>
                        ))}
                      </div>
                    </section>

                    <GuidedGeneratorPanel
                      profiles={profiles}
                      selectedSiteId={selectedSiteId}
                      selectedRecipeId={selectedRecipeId}
                      selectedWorkflowProfile={selectedWorkflowProfile}
                      selectedRecipe={selectedRecipe}
                      selectedAuthor={selectedAuthor}
                      operationalWorkspace={operationalWorkspace}
                      missionPresets={missionPresets}
                      authors={authors}
                      guidedRunStages={guidedRunStages}
                      visibleNoteVariables={visibleNoteVariables}
                      visibleGuidedRuns={visibleGuidedRuns}
                      guidedNextStep={guidedNextStep}
                      guidedAutopilotPlan={guidedAutopilotPlan}
                      guidedFlowStatus={guidedFlowStatus}
                      postingModeLabels={postingModeLabels}
                      onSelectProfile={setSelectedSiteId}
                      onSelectRecipe={selectRecipe}
                      onGenerateProfileNote={generateProfileNote}
                      onRunGuidedNextStep={runGuidedNextStep}
                      onRunGuidedAssistedFlow={runGuidedAssistedFlow}
                      onApplyRecipeToSelectedTopic={applyRecipeToSelectedTopic}
                      onOpenEditor={() => setEditorSurface('draft')}
                      onUpdateSelectedProfile={updateSelectedProfile}
                      onUpdateProfileGuardrails={updateSelectedProfileGuardrails}
                      onDuplicateProfile={createProfileFromCurrentRun}
                      onUpdateSelectedAuthorField={(field, value) => updateAuthorField(selectedAuthor.id, field, value)}
                      onUpdateWorkflowVariableByKey={updateWorkflowVariableByKey}
                      onSaveMissionPreset={saveMissionPreset}
                      onApplyMissionPreset={applyMissionPreset}
                      onRemoveMissionPreset={removeMissionPreset}
                      onLaunchMissionPresetRun={launchMissionPresetRun}
                    />
                  </div>
                )}
              </div>
            )}

            {activeTab === 'imagenes' && (
              <ImagesPanel
                imagePrompts={imagePrompts}
                reusableImages={reusableImages}
                selectedTopic={selectedTopic}
                imageManifest={editorialPackage.imageManifest}
                imageProductionPrompt={activeImageProductionPrompt}
                onAddImagePrompt={addImagePrompt}
                onUpdateImagePrompt={updateImagePrompt}
                onToggleReusableImage={toggleReusableImage}
                onRemoveImagePrompt={removeImagePrompt}
              />
            )}

            {activeTab === 'publicacion' && (
              <PublicationPanel
                topics={topics}
                selectedTopic={selectedTopic}
                currentDraft={currentDraft}
                publicationManifest={publicationManifest}
                publicationTargets={publicationTargets}
                destinations={publicationDestinations}
                selectedDestinationId={selectedPublicationDestinationId}
                imageManifest={editorialPackage.imageManifest}
                noteProposal={activeNoteProposal}
                publicExportBundle={activePublicExportBundle}
                onSelectDestination={setSelectedPublicationDestinationId}
                onSelectTopic={setSelectedTopicId}
                onCopyPayload={copyPublicationPayloadFromCockpit}
                onExportPackage={downloadCompletePackage}
                onMarkSent={markCurrentPublicationSent}
              />
            )}

            {activeTab === 'auditoria' && (
              <AuditPanel
                auditEvents={auditEvents}
                totalAnalyticsVisits={totalAnalyticsVisits}
                averagePerformanceScore={averagePerformanceScore}
                selectedTopicAnalytics={selectedTopicAnalytics}
                latestTopicAnalytics={latestTopicAnalytics}
                trafficSources={trafficSources}
                authorPerformance={authorPerformance}
                selectedTopic={selectedTopic}
                selectedAuthor={selectedAuthor}
                currentDraftStatus={currentDraft.status}
                qualityStatus={editorialPackage.qualityAudit.status}
                aiStatus={aiStatus}
                requiredEvidenceCount={selectedWorkflowProfile.sourceMinimum}
                selectedTopicEvidence={selectedTopicEvidence}
                validatedEvidenceCount={validatedEvidenceCount}
                guidedTopicEvidence={guidedTopicEvidence}
                pendingGuidedEvidence={pendingGuidedEvidence}
                canApproveAudit={canApproveGuidedAudit}
                auditRequirements={guidedAuditRequirements}
                evidenceStatuses={evidenceStatuses}
                evidenceTone={evidenceTone}
                distributionPlan={distributionPlan}
                distributionDeliverables={distributionDeliverables}
                distributionStatus={distributionStatus}
                onAddAnalyticsRecord={addAnalyticsRecord}
                onUpdateAnalyticsRecord={updateAnalyticsRecord}
                onRemoveAnalyticsRecord={removeAnalyticsRecord}
                onApplyAnalyticsFeedback={applyAnalyticsFeedback}
                onCompleteGuidedEvidence={completeGuidedEvidence}
                onRunLocalAiAndApply={runLocalAiAndApply}
                onApplyAiResponse={applyAiResponse}
                onApproveAudit={approveAuditFromCockpit}
                onApproveAuditAndPreparePayload={approveAuditAndPreparePayloadFromCockpit}
                onPreparePayload={preparePayloadFromCockpit}
                onAddEvidence={addEvidence}
                onUpdateEvidence={updateEvidence}
                onValidateEvidence={validateEvidence}
                onRemoveEvidence={removeEvidence}
                onCopyDistributionDeliverable={copyDistributionDeliverable}
                onMarkDistributionDelivered={markDistributionDelivered}
                onRegisterDistributionPlan={registerDistributionPlan}
                onDownloadDistributionPlan={downloadDistributionPlan}
              />
            )}

            {activeTab === 'config' && (
              <ConfigPortablePanel
                workflowVariables={workflowVariables}
                lastSavedAt={lastSavedAt}
                importBuffer={importBuffer}
                importStatus={importStatus}
                currentDraftStatus={currentDraft.status}
                currentDraftTone={draftStatusTone[currentDraft.status]}
                editorialPackage={editorialPackage}
                publicationManifest={publicationManifest}
                preflightBlockers={preflightBlockers}
                preflightWarnings={preflightWarnings}
                packageFileKeys={packageFileKeys}
                packageFileKey={packageFileKey}
                selectedPackageFile={selectedPackageFile}
                packageStatus={packageStatus}
                editorialBatch={editorialBatch}
                batchStatus={batchStatus}
                operationalContract={operationalContract}
                automationRecipe={automationRecipe}
                onAddVariable={addVariable}
                onUpdateVariable={updateVariable}
                onRemoveVariable={removeVariable}
                onImportBufferChange={setImportBuffer}
                onApplyImportedConfig={applyImportedConfig}
                onResetLocalState={resetLocalState}
                onSelectPackageFile={setPackageFileKey}
                onRegisterEditorialPackage={registerEditorialPackage}
                onDownloadPackageFile={downloadPackageFile}
                onDownloadCompletePackage={downloadCompletePackage}
                onRegisterEditorialBatch={registerEditorialBatch}
                onDownloadBatchManifest={downloadBatchManifest}
                onCopyOperationalContract={copyOperationalContractFromConfig}
                onDownloadOperationalContract={downloadOperationalContractFromConfig}
                onCopyAutomationRecipe={copyAutomationRecipeFromConfig}
                onDownloadAutomationRecipe={downloadAutomationRecipeFromConfig}
                onToggleExport={() => setShowExport(true)}
                onBackToAgenda={() => setActiveTab('agenda')}
              />
            )}
          </section>
    </EditarraShell>
  );
}
