import React from 'react';
import type { GuidedAutopilotPlan, GuidedNextStep, GuidedRunSummary } from './guidedEngine';
import type { EditarraPipelineActionId, EditarraPipelineState } from './pipelineModel';
import type { EditorialOperationMode, EditorialProfile, EditarraRecipeKey, NoteRecipe } from './profileModel';
import type { EditarraNoteRun } from './runModel';
import type { OperationalRunQueueItem } from './runQueueModel';
import type { Author, AuthorField, OperationalWorkspaceSnapshot, StyleWeightKey } from './workspaceModel';
import type { EditorialPackageFileKey } from './operations';
import type {
  AiHandoffSummary,
  AiRunRequestSummary,
  ClosureControlSummary,
  DailyBatchControlSummary,
  SourceControlSummary,
} from './RunCockpitContracts';
import RunCommandCenter from './RunCommandCenter';
import { Badge, CompactMetric } from './RunCockpitPrimitives';
import type { RunCockpitTone as Tone } from './RunCockpitPrimitives';
import RunDesignerPanel from './RunDesignerPanel';
import RunExecutionPanel from './RunExecutionPanel';

type RunCockpitPanelProps = {
  workspace: OperationalWorkspaceSnapshot;
  profiles: Array<Pick<EditorialProfile, 'id' | 'name' | 'postingMode'>>;
  operationModes: EditorialOperationMode[];
  recipes: NoteRecipe[];
  authors: Array<Pick<Author, 'id' | 'name' | 'active' | 'voiceBrief' | 'influenceMode' | 'tone' | 'references' | 'antiReferences' | 'styleWeights'>>;
  selectedProfileId: string;
  selectedOperationModeId: string;
  selectedRecipeId: EditarraRecipeKey;
  guidedNextStep: GuidedNextStep;
  guidedAutopilotPlan: GuidedAutopilotPlan;
  pipelineState: EditarraPipelineState;
  activeNoteRun: EditarraNoteRun;
  guidedFlowStatus: string;
  visibleRuns: GuidedRunSummary[];
  recentRuns: GuidedRunSummary[];
  payloadFileKey: EditorialPackageFileKey;
  sourceControl: SourceControlSummary;
  dailyBatchControl: DailyBatchControlSummary;
  aiHandoff: AiHandoffSummary;
  aiRunRequest: AiRunRequestSummary;
  aiResponseBuffer: string;
  aiStatus: string;
  closureControl: ClosureControlSummary;
  postingModeLabels: Record<EditorialProfile['postingMode'], string>;
  onSelectProfile: (profileId: string) => void;
  onSelectOperationMode: (modeId: string) => void;
  onApplyOperationMode: () => void;
  onSelectRecipe: (recipeId: EditarraRecipeKey) => void;
  onSelectAuthor: (authorName: string) => void;
  onDuplicateProfile: () => void;
  onUpdateSelectedProfile: (patch: Partial<EditorialProfile>) => void;
  onUpdateAuthorField: (field: AuthorField, value: string | number) => void;
  onUpdateAuthorListField: (field: 'tone' | 'references' | 'antiReferences', value: string) => void;
  onUpdateAuthorStyleWeight: (key: StyleWeightKey, value: number) => void;
  onUpdateNoteVariable: (key: string, value: string, description: string) => void;
  onResumeRun: (run: GuidedRunSummary) => void;
  onOperateQueuedRun: (run: OperationalRunQueueItem) => void;
  onCreateGeneratedRun: (title: string) => void;
  onCreateDailyBatch: () => void;
  onRunSingleNoteAutopilot: () => void;
  onRunPipelineAction: (actionId: EditarraPipelineActionId) => void;
  onOpenPackageFile: (fileKey: EditorialPackageFileKey) => void;
  onCopyAiRequest: () => void;
  onRunAssisted: () => void;
  onRunNextStep: () => void;
  onGenerateNote: () => void;
  onEditVariables: () => void;
  onCreateGuidedSources: () => void;
  onValidateGuidedSources: () => void;
  onValidateDailyBatchSources: () => void;
  onApplyDailyBatchAi: () => void;
  onApproveDailyBatchAudit: () => void;
  onPrepareDailyBatchPayload: () => void;
  onRunDailyBatchAutopilot: () => void;
  onOpenSources: () => void;
  onPrepareAiHandoff: () => void;
  onGenerateLocalAiResponse: () => void;
  onRunLocalAiAndApply: () => void;
  onUpdateAiResponse: (value: string) => void;
  onApplyAiResponse: () => void;
  onApproveAudit: () => void;
  onCloseAuditAndPreparePayload: () => void;
  onPreparePayload: () => void;
  onCopyPublicationPayload: () => void;
  onCopyCompletePackage: () => void;
  onOpenAudit: () => void;
  onOpenPayload: () => void;
};

const runVariableGroupLabels: Record<string, string> = {
  tono: 'Tono',
  seo: 'SEO',
  narrativa: 'Narrativa',
  fuentes: 'Fuentes',
  referencias: 'Referencias',
  sistema: 'Sistema',
};

export default function RunCockpitPanel({
  workspace,
  profiles,
  operationModes,
  recipes,
  authors,
  selectedProfileId,
  selectedOperationModeId,
  selectedRecipeId,
  guidedNextStep,
  guidedAutopilotPlan,
  pipelineState,
  activeNoteRun,
  guidedFlowStatus,
  visibleRuns,
  recentRuns,
  payloadFileKey,
  sourceControl,
  dailyBatchControl,
  aiHandoff,
  aiRunRequest,
  aiResponseBuffer,
  aiStatus,
  closureControl,
  postingModeLabels,
  onSelectProfile,
  onSelectOperationMode,
  onApplyOperationMode,
  onSelectRecipe,
  onSelectAuthor,
  onDuplicateProfile,
  onUpdateSelectedProfile,
  onUpdateAuthorField,
  onUpdateAuthorListField,
  onUpdateAuthorStyleWeight,
  onUpdateNoteVariable,
  onResumeRun,
  onOperateQueuedRun,
  onCreateGeneratedRun,
  onCreateDailyBatch,
  onRunSingleNoteAutopilot,
  onRunPipelineAction,
  onOpenPackageFile,
  onCopyAiRequest,
  onRunAssisted,
  onRunNextStep,
  onGenerateNote,
  onEditVariables,
  onCreateGuidedSources,
  onValidateGuidedSources,
  onValidateDailyBatchSources,
  onApplyDailyBatchAi,
  onApproveDailyBatchAudit,
  onPrepareDailyBatchPayload,
  onRunDailyBatchAutopilot,
  onOpenSources,
  onPrepareAiHandoff,
  onGenerateLocalAiResponse,
  onRunLocalAiAndApply,
  onUpdateAiResponse,
  onApplyAiResponse,
  onApproveAudit,
  onCloseAuditAndPreparePayload,
  onPreparePayload,
  onCopyPublicationPayload,
  onCopyCompletePackage,
  onOpenAudit,
  onOpenPayload,
}: RunCockpitPanelProps) {
  const runtimeTone: Tone = activeNoteRun.profileRuntime.readiness === 'listo'
    ? 'emerald'
    : activeNoteRun.profileRuntime.readiness === 'bloqueado'
      ? 'rose'
      : 'amber';
  const populatedVariableGroups = Object.entries(activeNoteRun.variables.byGroup)
    .filter(([, variables]) => variables.length > 0);
  return (
    <section className="mt-4 max-w-full overflow-hidden rounded-2xl bg-slate-950 text-white shadow-sm ring-1 ring-slate-900" aria-label="Cockpit de corrida EDITARRA">
      <div className="grid min-w-0 max-w-full grid-cols-[minmax(0,1fr)] gap-5 px-5 py-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-normal text-emerald-300">Corrida activa</p>
            <Badge tone={workspace.readiness.tone}>{workspace.readiness.label}</Badge>
            <Badge tone={guidedAutopilotPlan.mode === 'control_humano' ? 'rose' : guidedAutopilotPlan.mode === 'listo' ? 'emerald' : 'blue'}>
              {guidedAutopilotPlan.mode === 'control_humano' ? 'control humano' : guidedAutopilotPlan.mode}
            </Badge>
          </div>
          <h2 className="mt-2 text-xl font-semibold tracking-normal text-white">{workspace.topic.title}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            {workspace.profile.name} · {workspace.recipe.shortLabel} · {workspace.author.name}
          </p>

          <div className="mt-4 grid min-w-0 max-w-full grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.55fr)]" aria-label="Run operativo de nota">
            <div className="min-w-0 rounded-xl bg-emerald-400/10 p-4 ring-1 ring-emerald-300/20">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-normal text-emerald-200">NoteRun</p>
                <Badge tone={runtimeTone}>{activeNoteRun.profileRuntime.label}</Badge>
                <Badge tone={activeNoteRun.mode === 'daily_batch' ? 'blue' : 'slate'}>
                  {activeNoteRun.mode === 'daily_batch' ? 'tanda diaria' : 'nota única'}
                </Badge>
              </div>
              <h3 className="mt-2 text-base font-semibold text-white">{activeNoteRun.topicTitle}</h3>
              <p className="mt-1 text-sm leading-6 text-emerald-50">
                {activeNoteRun.recipeLabel} · {activeNoteRun.operationModeLabel} · {activeNoteRun.pipeline.nextControl}
              </p>
              <div className="mt-3 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 md:grid-cols-3">
                <CompactMetric
                  label="Perfil runtime"
                  value={activeNoteRun.profileRuntime.profileName}
                  detail={`${activeNoteRun.profileRuntime.controls.sourceMinimum} fuentes · ${activeNoteRun.profileRuntime.postingMode}`}
                />
                <CompactMetric
                  label="Variables nota"
                  value={`${activeNoteRun.variables.noteOverrides}/${activeNoteRun.variables.total}`}
                  detail={`${populatedVariableGroups.length} grupos activos`}
                />
                <CompactMetric
                  label="AI/export"
                  value={activeNoteRun.ai.expectedFile}
                  detail={`${activeNoteRun.exportKeys.length} archivos disponibles`}
                />
              </div>
            </div>
            <div className="min-w-0 rounded-xl bg-white/5 p-4 ring-1 ring-white/10" aria-label="Variables editables del NoteRun">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-normal text-slate-400">Variables por sistema</p>
                  <p className="mt-1 text-xs leading-5 text-slate-400">Edita el run activo sin tocar el perfil base.</p>
                </div>
                <Badge tone={activeNoteRun.variables.noteOverrides > 0 ? 'blue' : 'slate'}>
                  {activeNoteRun.variables.noteOverrides} nota
                </Badge>
              </div>
              <div className="mt-3 grid max-h-80 gap-3 overflow-y-auto pr-1">
                {populatedVariableGroups.map(([group, variables]) => (
                  <div key={group} className="rounded-lg bg-white/5 p-3 ring-1 ring-white/10">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-white">{runVariableGroupLabels[group] || group}</span>
                      <Badge tone={variables.some((variable) => variable.source === 'nota') ? 'blue' : 'slate'}>
                        {variables.length}
                      </Badge>
                    </div>
                    <div className="mt-3 grid gap-2">
                      {variables.map((variable) => (
                        <label key={`${group}-${variable.key}`} className="grid gap-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="break-all font-mono text-xs font-semibold text-slate-300">{variable.key}</span>
                            <Badge tone={variable.source === 'nota' ? 'blue' : 'slate'}>{variable.source}</Badge>
                          </span>
                          <input
                            aria-label={`Variable ${runVariableGroupLabels[group] || group} ${variable.key}`}
                            value={variable.value}
                            disabled={!variable.enabled}
                            onChange={(event) => onUpdateNoteVariable(variable.key, event.target.value, variable.description)}
                            className="h-10 w-full rounded-lg border-0 bg-white/10 px-3 text-sm text-white ring-1 ring-inset ring-white/10 placeholder:text-slate-500 focus:bg-white/15 focus:ring-2 focus:ring-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <RunCommandCenter
            guidedNextStep={guidedNextStep}
            guidedAutopilotPlan={guidedAutopilotPlan}
            pipelineState={pipelineState}
            dailyBatchControl={dailyBatchControl}
            guidedFlowStatus={guidedFlowStatus}
            onRunPipelineAction={onRunPipelineAction}
            onOpenPackageFile={onOpenPackageFile}
            onRunAssisted={onRunAssisted}
            onRunNextStep={onRunNextStep}
            onRunSingleNoteAutopilot={onRunSingleNoteAutopilot}
            onValidateDailyBatchSources={onValidateDailyBatchSources}
            onApplyDailyBatchAi={onApplyDailyBatchAi}
            onApproveDailyBatchAudit={onApproveDailyBatchAudit}
            onPrepareDailyBatchPayload={onPrepareDailyBatchPayload}
            onRunDailyBatchAutopilot={onRunDailyBatchAutopilot}
          />

          <RunDesignerPanel
            workspace={workspace}
            profiles={profiles}
            operationModes={operationModes}
            recipes={recipes}
            authors={authors}
            selectedProfileId={selectedProfileId}
            selectedOperationModeId={selectedOperationModeId}
            selectedRecipeId={selectedRecipeId}
            postingModeLabels={postingModeLabels}
            onSelectProfile={onSelectProfile}
            onSelectOperationMode={onSelectOperationMode}
            onApplyOperationMode={onApplyOperationMode}
            onSelectRecipe={onSelectRecipe}
            onSelectAuthor={onSelectAuthor}
            onDuplicateProfile={onDuplicateProfile}
            onUpdateSelectedProfile={onUpdateSelectedProfile}
            onUpdateAuthorField={onUpdateAuthorField}
            onUpdateAuthorListField={onUpdateAuthorListField}
            onUpdateAuthorStyleWeight={onUpdateAuthorStyleWeight}
            onCreateGeneratedRun={onCreateGeneratedRun}
            onCreateDailyBatch={onCreateDailyBatch}
          />
        </div>

        <RunExecutionPanel
          workspace={workspace}
          visibleRuns={visibleRuns}
          recentRuns={recentRuns}
          payloadFileKey={payloadFileKey}
          sourceControl={sourceControl}
          dailyBatchControl={dailyBatchControl}
          aiHandoff={aiHandoff}
          aiRunRequest={aiRunRequest}
          aiResponseBuffer={aiResponseBuffer}
          aiStatus={aiStatus}
          closureControl={closureControl}
          onUpdateNoteVariable={onUpdateNoteVariable}
          onResumeRun={onResumeRun}
          onOperateQueuedRun={onOperateQueuedRun}
          onOpenPackageFile={onOpenPackageFile}
          onCopyAiRequest={onCopyAiRequest}
          onGenerateNote={onGenerateNote}
          onEditVariables={onEditVariables}
          onCreateGuidedSources={onCreateGuidedSources}
          onValidateGuidedSources={onValidateGuidedSources}
          onValidateDailyBatchSources={onValidateDailyBatchSources}
          onApplyDailyBatchAi={onApplyDailyBatchAi}
          onApproveDailyBatchAudit={onApproveDailyBatchAudit}
          onPrepareDailyBatchPayload={onPrepareDailyBatchPayload}
          onRunDailyBatchAutopilot={onRunDailyBatchAutopilot}
          onOpenSources={onOpenSources}
          onPrepareAiHandoff={onPrepareAiHandoff}
          onGenerateLocalAiResponse={onGenerateLocalAiResponse}
          onRunLocalAiAndApply={onRunLocalAiAndApply}
          onUpdateAiResponse={onUpdateAiResponse}
          onApplyAiResponse={onApplyAiResponse}
          onApproveAudit={onApproveAudit}
          onCloseAuditAndPreparePayload={onCloseAuditAndPreparePayload}
          onPreparePayload={onPreparePayload}
          onCopyPublicationPayload={onCopyPublicationPayload}
          onCopyCompletePackage={onCopyCompletePackage}
          onOpenAudit={onOpenAudit}
          onOpenPayload={onOpenPayload}
        />
      </div>
    </section>
  );
}
