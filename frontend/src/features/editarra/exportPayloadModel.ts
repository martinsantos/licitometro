import type { EditarraAiHandoff, EditarraAiRunRequest } from './aiAdapter';
import type { RadarRunReport, EditorialNoteProposal, PublicNoteExportBundle } from './editorialFlowModel';
import type { EditarraImageManifest, EditorialPackageFileKey } from './operations';
import type { EditarraPipelineState } from './pipelineModel';
import type { EditorialOperationMode, EditorialProfile, NoteRecipe } from './profileModel';
import type { EditarraPublicationManifest, EditarraPublicationTarget, PublicationDestination } from './publicationAdapter';
import type {
  AnalyticsRecord,
  DistributionActions,
  DraftVersion,
  EditorialDraft,
  EvidenceRecord,
  SeoExperiment,
} from './productionReducer';
import type { DiscoveryCandidate, DiscoveryRun, EditorialAgenda } from './radarModel';
import type { EditarraNoteRun, EditarraProfileRuntime } from './runModel';
import type { DailyBatchControl, SelectedSiteSummary } from './selectionModel';
import type { GuidedRunRecord } from './guidedEngine';
import type { EditarraMissionPreset } from './missionPresetModel';
import type { AuditEvent, EditorRule, ImagePrompt } from './persistenceModel';
import type {
  Author,
  NoteVariableOverride,
  OperationalWorkspaceSnapshot,
  Topic,
  VisibleNoteVariable,
  WorkflowVariable,
} from './workspaceModel';

type DistributionManifest = {
  items?: Array<Record<string, unknown>>;
  [key: string]: unknown;
};

type EditorialPackageExportFields = {
  aiBrief: Record<string, unknown>;
  publicationPayload: Record<string, unknown>;
  qualityAudit: { status: string } & Record<string, unknown>;
  imageManifest: EditarraImageManifest;
};

export type BuildEditarraExportPayloadInput = {
  selectedSite: SelectedSiteSummary;
  selectedRecipe: NoteRecipe;
  selectedOperationMode: EditorialOperationMode;
  operationModes: EditorialOperationMode[];
  profiles: EditorialProfile[];
  selectedWorkflowProfile: EditorialProfile;
  authors: Author[];
  topicTokenBudget: number;
  packageFileKeys: EditorialPackageFileKey[];
  activeProfileRuntime: EditarraProfileRuntime;
  guidedRunStages: unknown[];
  visibleNoteVariables: VisibleNoteVariable[];
  selectedGuidedRunRecords: GuidedRunRecord[];
  operationalWorkspace: OperationalWorkspaceSnapshot;
  operationalContract: unknown;
  automationRecipe: unknown;
  editorialAgendas: EditorialAgenda[];
  discoveryRuns: DiscoveryRun[];
  discoveryCandidates: DiscoveryCandidate[];
  missionPresets: EditarraMissionPreset[];
  activeNoteRun: EditarraNoteRun;
  aiHandoff: EditarraAiHandoff;
  aiRunRequest: EditarraAiRunRequest;
  publicationManifest: EditarraPublicationManifest;
  publicationDestinations: PublicationDestination[];
  publicationTargets: EditarraPublicationTarget[];
  activePipelineState: EditarraPipelineState;
  activeRadarRunReport: RadarRunReport;
  activeNoteProposal: EditorialNoteProposal;
  activePublicExportBundle: PublicNoteExportBundle;
  activeImageProductionPrompt: string;
  editorialPackage: EditorialPackageExportFields;
  selectedTopic: Topic;
  currentDraftStatus: string;
  validatedEvidenceCount: number;
  guidedNextStepLabel: string;
  dailyBatchControl: DailyBatchControl;
  topics: Topic[];
  drafts: EditorialDraft[];
  evidence: EvidenceRecord[];
  getDailyBatchRecipeId: (topicId: string) => string;
  noteVariableOverrides: NoteVariableOverride[];
  workflowVariables: WorkflowVariable[];
  editorRules: EditorRule[];
  imagePrompts: ImagePrompt[];
  reusableImages: string[];
  seoExperiments: SeoExperiment[];
  analyticsRecords: AnalyticsRecord[];
  draftVersions: DraftVersion[];
  auditEvents: AuditEvent[];
  guidedRunRecords: GuidedRunRecord[];
  distributionPlanManifest: DistributionManifest;
  distributionActions: DistributionActions;
};

export const buildEditarraExportPayload = ({
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
  editorialPackage,
  selectedTopic,
  currentDraftStatus,
  validatedEvidenceCount,
  guidedNextStepLabel,
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
  distributionPlanManifest,
  distributionActions,
}: BuildEditarraExportPayloadInput) => ({
  product: 'editarra',
  standalone: true,
  host_url: selectedSite.domain,
  route: '/editarra',
  selected_recipe_id: selectedRecipe.id,
  selected_operation_mode_id: selectedOperationMode.id,
  selected_operation_mode: selectedOperationMode,
  operation_modes: operationModes,
  editorial_profiles: profiles,
  approval_mode: selectedWorkflowProfile.postingMode,
  seo_strategy: selectedSite.seoMode,
  authors: authors.map(({
    id,
    name,
    active,
    models,
    tone,
    banned,
    mix,
    score,
    voiceBrief,
    register,
    rhythm,
    stance,
    density,
    locality,
    influenceMode,
    references,
    antiReferences,
    styleWeights,
    influences,
  }) => ({
    id,
    name,
    active,
    models,
    score,
    tone_adjectives: tone,
    banned_words: banned,
    topic_mix: mix,
    voice_brief: voiceBrief,
    register,
    rhythm,
    stance,
    density,
    locality,
    influence_mode: influenceMode,
    references_to_follow: references,
    references_to_avoid: antiReferences,
    style_weights: styleWeights,
    influences,
  })),
  workflow: {
    agenda_ai: 'provider-agnostic',
    editor_ai: 'provider-agnostic',
    writer_ai: 'provider-agnostic',
    active_model: 'umsa-diaria',
    offline_mode: true,
    external_post_enabled: false,
    token_budget: topicTokenBudget,
    outputs: packageFileKeys,
  },
  umsa_diaria: {
    loaded_skill: '/Users/santosma/umsa-codex/.agents/skills/umsa-diaria/SKILL.md',
    target_site: 'ultimamilla.com.ar/blog',
    publication_endpoint: 'https://www.ultimamilla.com.ar/api/blog',
    external_post_enabled: false,
    daily_slots: [
      { note: 'A', axis: 'reactiva', publish_at: '07:00:00-03:00', category: 'noticias' },
      { note: 'B', axis: 'evergreen tecnica', publish_at: '12:00:00-03:00', category: 'tecnico' },
      { note: 'C', axis: 'caso o industria', publish_at: '17:00:00-03:00', category: 'proyectos|empresa' },
    ],
    required_sources: 4,
    required_outputs: ['ai_brief.json', 'publication_payload.json', 'quality_audit.json'],
  },
  guided_generation: {
    profile: selectedWorkflowProfile,
    profile_runtime: activeProfileRuntime,
    recipe: selectedRecipe,
    stages: guidedRunStages,
    note_variables: visibleNoteVariables,
    latest_runs: selectedGuidedRunRecords.slice(0, 8),
  },
  operational_workspace: operationalWorkspace,
  operational_contract: operationalContract,
  active_automation_recipe: automationRecipe,
  editorial_agendas: editorialAgendas.map((agenda) => ({
    id: agenda.id,
    name: agenda.name,
    destination: agenda.destination,
    audience: agenda.audience,
    compatible_authors: agenda.compatibleAuthors,
    compatible_recipes: agenda.compatibleRecipes,
    compatible_operation_modes: agenda.compatibleOperationModes,
    interests: agenda.interests,
    tropes_to_seek: agenda.tropesToSeek,
    tropes_to_avoid: agenda.tropesToAvoid,
    source_urls: agenda.sourceUrls,
    publishing_slots: agenda.publishingSlots,
    scoring_weights: agenda.scoringWeights,
    created_at: agenda.createdAt,
    updated_at: agenda.updatedAt,
  })),
  discovery_runs: discoveryRuns.map((run) => ({
    id: run.id,
    agenda_id: run.agendaId,
    query: run.query,
    urls: run.urls,
    status: run.status,
    source_count: run.sourceCount,
    candidate_count: run.candidateCount,
    provider: run.provider,
    llm_model: run.llmModel,
    seed_results: run.seedResults,
    expanded_results: run.expandedResults,
    candidate_distribution: run.candidateDistribution,
    failed_sources: run.failedSources,
    warnings: run.warnings,
    created_at: run.createdAt,
    completed_at: run.completedAt,
  })),
  discovery_candidates: discoveryCandidates.map((candidate) => ({
    id: candidate.id,
    run_id: candidate.runId,
    agenda_id: candidate.agendaId,
    title: candidate.title,
    summary: candidate.summary,
    source_name: candidate.sourceName,
    source_url: candidate.sourceUrl,
    snippet: candidate.snippet,
    detected_trope: candidate.detectedTrope,
    matched_interests: candidate.matchedInterests,
    recommended_author: candidate.recommendedAuthor,
    recommended_recipe_id: candidate.recommendedRecipeId,
    recommended_operation_mode_id: candidate.recommendedOperationModeId,
    score: candidate.score,
    warnings: candidate.warnings,
    status: candidate.status,
    created_at: candidate.createdAt,
    updated_at: candidate.updatedAt,
  })),
  mission_presets: missionPresets,
  active_note_run: activeNoteRun,
  ai_handoff: aiHandoff,
  active_ai_request: aiRunRequest,
  publication_manifest: publicationManifest,
  publication_destinations: publicationDestinations,
  publication_targets: publicationTargets,
  active_pipeline_state: activePipelineState,
  active_radar_run_report: activeRadarRunReport,
  active_note_proposal: activeNoteProposal,
  active_public_export_bundle: activePublicExportBundle,
  active_image_prompt_markdown: activeImageProductionPrompt,
  active_ai_brief: editorialPackage.aiBrief,
  active_publication_payload: editorialPackage.publicationPayload,
  active_quality_audit: editorialPackage.qualityAudit,
  active_image_manifest: editorialPackage.imageManifest,
  active_note_pipeline: {
    topic_id: selectedTopic.id,
    title: selectedTopic.title,
    recipe_id: selectedRecipe.id,
    profile_id: selectedWorkflowProfile.id,
    operation_mode_id: selectedOperationMode.id,
    topic_status: selectedTopic.status,
    sources_validated: validatedEvidenceCount,
    sources_required: selectedWorkflowProfile.sourceMinimum,
    draft_status: currentDraftStatus,
    quality_status: editorialPackage.qualityAudit.status,
    pipeline_status: activePipelineState.status,
    pipeline_progress: activePipelineState.progress,
    current_stage_id: activePipelineState.currentStageId,
    payload_ready: Boolean(editorialPackage.publicationPayload.contenido),
    ready_for_payload: ['aprobado', 'publicado'].includes(currentDraftStatus),
    next_step: guidedNextStepLabel,
    next_control: activePipelineState.nextControl,
  },
  active_daily_batch: {
    active: dailyBatchControl.active,
    topic_count: dailyBatchControl.topicCount,
    sources_validated: dailyBatchControl.validated,
    sources_required: dailyBatchControl.sourceMinimum,
    guided_sources_pending: dailyBatchControl.pendingGuided,
    ai_ready: dailyBatchControl.aiReady,
    audit_approved: dailyBatchControl.auditApproved,
    payload_ready: dailyBatchControl.payloadReady,
    items: dailyBatchControl.topicIds.map((topicId) => {
      const topic = topics.find((item) => item.id === topicId);
      const draft = drafts.find((item) => item.topicId === topicId);
      const topicEvidence = evidence.filter((item) => item.topicId === topicId);

      return {
        topic_id: topicId,
        title: topic?.title || topicId,
        recipe_id: getDailyBatchRecipeId(topicId),
        draft_status: draft?.status || 'sin_borrador',
        evidence_validated: topicEvidence.filter((item) => item.status === 'validado').length,
        evidence_required: selectedWorkflowProfile.sourceMinimum,
        ready_for_payload: ['aprobado', 'publicado'].includes(draft?.status || ''),
      };
    }),
  },
  note_variable_overrides: noteVariableOverrides.map(({ id, topicId, recipeId, key, value, description, enabled }) => ({
    id,
    topic_id: topicId,
    recipe_id: recipeId,
    key,
    value,
    description,
    enabled,
  })),
  variables: workflowVariables.map(({ id, key, value, scope, description, enabled }) => ({
    id,
    key,
    value,
    scope,
    description,
    enabled,
  })),
  editor_rules: editorRules.map(({ id, title, body, enabled }) => ({
    id,
    title,
    body,
    enabled,
  })),
  image_prompts: imagePrompts.map(({ id, title, ratio, status, prompt }) => ({
    id,
    title,
    ratio,
    status,
    prompt,
    reusable: reusableImages.includes(id),
  })),
  reusable_image_ids: reusableImages,
  seo_experiments: seoExperiments.map(({ id, topicId, title, description, focusKeyword, strategy, ctr, impressions, selected, notes }) => ({
    id,
    topic_id: topicId,
    title,
    description,
    focus_keyword: focusKeyword,
    strategy,
    ctr,
    impressions,
    selected,
    notes,
  })),
  analytics: analyticsRecords.map(({ id, topicId, period, trafficSource, visits, averageReadSeconds, ctaClicks, shares, comments, conversionRate, successCriteria, performanceScore, learningNote }) => ({
    id,
    topic_id: topicId,
    period,
    traffic_source: trafficSource,
    visits,
    average_read_seconds: averageReadSeconds,
    cta_clicks: ctaClicks,
    shares,
    comments,
    conversion_rate: conversionRate,
    success_criteria: successCriteria,
    performance_score: performanceScore,
    learning_note: learningNote,
  })),
  drafts: drafts.map(({ id, topicId, variant, status, title, seoTitle, body, notes, updatedAt }) => ({
    id,
    topic_id: topicId,
    variant,
    status,
    title,
    seo_title: seoTitle,
    body,
    notes,
    updated_at: updatedAt,
  })),
  evidence: evidence.map(({ id, topicId, sourceName, sourceUrl, claim, status, confidence, notes }) => ({
    id,
    topic_id: topicId,
    source_name: sourceName,
    source_url: sourceUrl,
    claim,
    status,
    confidence,
    notes,
  })),
  revision_history: draftVersions.map(({
    id,
    topicId,
    draftId,
    version,
    variant,
    status,
    title,
    seoTitle,
    body,
    notes,
    changeNote,
    snapshotAt,
    authorName,
  }) => ({
    id,
    topic_id: topicId,
    draft_id: draftId,
    version,
    variant,
    status,
    title,
    seo_title: seoTitle,
    body,
    notes,
    change_note: changeNote,
    snapshot_at: snapshotAt,
    author_name: authorName,
  })),
  audit_log: auditEvents.map(({ id, event, detail, time }) => ({
    id,
    event,
    detail,
    time,
  })),
  guided_runs: guidedRunRecords.map(({ id, topicId, recipeId, profileId, status, steps, nextControl, summary, time }) => ({
    id,
    topic_id: topicId,
    recipe_id: recipeId,
    profile_id: profileId,
    status,
    steps,
    next_control: nextControl,
    summary,
    time,
  })),
  distribution_plan: distributionPlanManifest,
  distribution_actions: distributionActions,
  topics: topics.filter((topic) => topic.status !== 'descartado').map((topic) => ({
    id: topic.id,
    title: topic.title,
    status: topic.status,
    priority: topic.priority,
    author: topic.author,
    research_depth: topic.depth,
    token_budget: topic.tokens,
    source_plan: topic.source,
    narrative_constraints: topic.narrative,
    seo: topic.seo,
    publish_at: topic.publishAt,
    agenda_id: topic.agendaId,
    candidate_id: topic.candidateId,
    destination_profile_id: topic.destinationProfileId,
    recipe_id: topic.recipeId,
    operation_mode_id: topic.operationModeId,
    trope: topic.trope,
    interests: topic.interests,
    discovery_source_url: topic.discoverySourceUrl,
  })),
});
