import React from 'react';
import type { GuidedAutopilotPlan, GuidedNextStep } from './guidedEngine';
import type { EditorialPackageFileKey } from './operations';
import type { EditarraPipelineActionId, EditarraPipelineState } from './pipelineModel';
import type { DailyBatchControlSummary } from './RunCockpitContracts';
import { ActionButton, Badge, cx } from './RunCockpitPrimitives';

type RunCommandCenterProps = {
  guidedNextStep: GuidedNextStep;
  guidedAutopilotPlan: GuidedAutopilotPlan;
  pipelineState: EditarraPipelineState;
  dailyBatchControl: DailyBatchControlSummary;
  guidedFlowStatus: string;
  onRunPipelineAction: (actionId: EditarraPipelineActionId) => void;
  onOpenPackageFile: (fileKey: EditorialPackageFileKey) => void;
  onRunAssisted: () => void;
  onRunNextStep: () => void;
  onRunSingleNoteAutopilot: () => void;
  onValidateDailyBatchSources: () => void;
  onApplyDailyBatchAi: () => void;
  onApproveDailyBatchAudit: () => void;
  onPrepareDailyBatchPayload: () => void;
  onRunDailyBatchAutopilot: () => void;
};

const pipelineArtifactByStage: Record<EditarraPipelineState['currentStageId'], EditorialPackageFileKey> = {
  agenda: 'metadata.json',
  fuentes: 'evidence_log.json',
  ai: 'ai_brief.json',
  auditoria: 'quality_audit.json',
  imagenes: 'image_prompt.json',
  payload: 'publication_payload.json',
};

export default function RunCommandCenter({
  guidedNextStep,
  guidedAutopilotPlan,
  pipelineState,
  dailyBatchControl,
  guidedFlowStatus,
  onRunPipelineAction,
  onOpenPackageFile,
  onRunAssisted,
  onRunNextStep,
  onRunSingleNoteAutopilot,
  onValidateDailyBatchSources,
  onApplyDailyBatchAi,
  onApproveDailyBatchAudit,
  onPrepareDailyBatchPayload,
  onRunDailyBatchAutopilot,
}: RunCommandCenterProps) {
  const primaryPipelineAction = pipelineState.actions.find((action) => action.primary && action.enabled)
    || pipelineState.actions.find((action) => action.enabled);
  const enabledPipelineActions = pipelineState.actions.filter((action) => action.enabled);
  const currentStage = pipelineState.stages.find((stage) => stage.id === pipelineState.currentStageId);
  const currentArtifactKey = pipelineArtifactByStage[pipelineState.currentStageId];
  const commandBlockedReason = pipelineState.blockers[0]
    || guidedAutopilotPlan.humanControl
    || currentStage?.detail
    || pipelineState.nextControl;
  const automationState = pipelineState.status === 'listo'
    ? 'complete'
    : primaryPipelineAction
      ? 'ready'
      : 'blocked';
  const automationStateLabel = automationState === 'complete'
    ? 'completa'
    : automationState === 'ready'
      ? 'ejecutable ahora'
      : 'bloqueada';
  const automationWillUpdate = pipelineState.currentStageId === 'ai'
    ? 'publication_payload.json'
    : pipelineState.currentStageId === 'auditoria'
      ? 'image_prompt.json'
      : pipelineState.currentStageId === 'imagenes' || pipelineState.currentStageId === 'payload'
      ? 'publication_payload.json'
      : currentArtifactKey;

  return (
    <div className="mt-5 rounded-xl bg-white/5 p-4 ring-1 ring-white/10" aria-label="Próximo control de corrida / Centro operativo guiado">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,0.45fr)]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={pipelineState.status === 'listo' ? 'emerald' : pipelineState.status === 'bloqueado' ? 'rose' : pipelineState.status === 'control_humano' ? 'amber' : 'blue'}>
              {pipelineState.status}
            </Badge>
            <Badge tone={currentStage?.tone || guidedNextStep.tone}>{currentStage?.label || guidedNextStep.badge}</Badge>
            <Badge tone="slate">{currentArtifactKey}</Badge>
          </div>
          <h3 className="mt-3 text-lg font-semibold text-white">{pipelineState.nextControl}</h3>
          <p className="mt-1 text-sm leading-6 text-slate-300">{currentStage?.detail || guidedAutopilotPlan.primaryActionDetail}</p>
          <p className="mt-2 text-xs leading-5 text-slate-400" aria-label="Razón del comando operativo">
            {primaryPipelineAction?.enabled
              ? `Acción recomendada: ${primaryPipelineAction.label}. ${primaryPipelineAction.reason}`
              : `En espera: ${commandBlockedReason}`}
          </p>
        </div>
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-3 text-xs font-semibold text-slate-300">
            <span>{guidedAutopilotPlan.progress}% operativo</span>
            <span>{guidedAutopilotPlan.humanControl}</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-emerald-400 transition-[width]"
              style={{ width: `${guidedAutopilotPlan.progress}%` }}
            />
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 rounded-xl bg-slate-900/80 p-4 ring-1 ring-emerald-300/20 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]" aria-label="Comando operativo de nota">
        <div className="grid content-start gap-2">
          <p className="rounded-lg bg-white/5 px-3 py-2 text-xs font-semibold text-slate-300 ring-1 ring-white/10">
            Artefacto activo: <span className="font-mono text-white">{currentArtifactKey}</span>
          </p>
          <div className="rounded-lg bg-white/5 p-3 ring-1 ring-white/10" aria-label="Receta operativa ejecutable">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-normal text-slate-400">automation_recipe.json</span>
              <Badge tone={automationState === 'ready' ? 'emerald' : automationState === 'blocked' ? 'rose' : 'blue'}>
                {automationStateLabel}
              </Badge>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-300">
              {automationState === 'ready'
                ? `${primaryPipelineAction?.label} actualiza ${automationWillUpdate}.`
                : automationState === 'complete'
                  ? `Corrida completa; abrir ${automationWillUpdate}.`
                  : `Bloqueo: ${commandBlockedReason}`}
            </p>
          </div>
          <ActionButton
            variant="primary"
            disabled={!primaryPipelineAction}
            onClick={() => {
              if (primaryPipelineAction) {
                onRunPipelineAction(primaryPipelineAction.id);
              }
            }}
            aria-label="Ejecutar comando operativo recomendado"
          >
            {primaryPipelineAction ? primaryPipelineAction.label : 'Esperando control'}
          </ActionButton>
          <div className="grid gap-2 sm:grid-cols-2">
            <ActionButton onClick={onRunAssisted} aria-label="Ejecutar flujo asistido">Flujo asistido</ActionButton>
            <ActionButton onClick={onRunSingleNoteAutopilot} aria-label="Completar nota automática">Autopiloto nota</ActionButton>
            <ActionButton variant="quiet" onClick={onRunNextStep} aria-label="Ejecutar siguiente control">Siguiente control</ActionButton>
            <ActionButton variant="quiet" onClick={() => onOpenPackageFile(currentArtifactKey)} aria-label={`Abrir artefacto operativo ${currentArtifactKey}`}>
              Abrir artefacto
            </ActionButton>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <ActionButton variant="quiet" onClick={() => onOpenPackageFile('note_run.json')} aria-label="Abrir artefacto runtime note_run.json">
              note_run.json
            </ActionButton>
            <ActionButton variant="quiet" onClick={() => onOpenPackageFile('profile_runtime.json')} aria-label="Abrir artefacto runtime profile_runtime.json">
              profile_runtime.json
            </ActionButton>
            <ActionButton variant="quiet" onClick={() => onOpenPackageFile('automation_recipe.json')} aria-label="Abrir receta operativa automation_recipe.json">
              automation_recipe.json
            </ActionButton>
            <ActionButton variant="quiet" onClick={() => onOpenPackageFile('operational_contract.json')} aria-label="Abrir contrato operativo operational_contract.json">
              operational_contract.json
            </ActionButton>
          </div>
        </div>

        <div className="grid gap-2" aria-label="Pipeline operativo de nota">
          {pipelineState.stages.map((stage) => (
            <article
              key={stage.id}
              className={cx(
                'grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 rounded-lg p-2 ring-1',
                stage.id === pipelineState.currentStageId
                  ? 'bg-emerald-400/10 ring-emerald-300/40'
                  : 'bg-white/5 ring-white/10',
              )}
            >
              <span className={cx(
                'mt-1 h-2.5 w-2.5 rounded-full',
                stage.status === 'listo' ? 'bg-emerald-300' : stage.status === 'bloqueado' ? 'bg-rose-300' : stage.status === 'activo' ? 'bg-blue-300' : 'bg-slate-500',
              )}
              />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-white">{stage.label}</span>
                  {stage.id === pipelineState.currentStageId ? <Badge tone="blue">actual</Badge> : null}
                </div>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-400">{stage.detail}</p>
              </div>
              <Badge tone={stage.tone}>{stage.status}</Badge>
            </article>
          ))}
          {enabledPipelineActions.length > 1 ? (
            <div className="flex flex-wrap gap-2 pt-1" aria-label="Acciones alternativas ejecutables">
              {enabledPipelineActions
                .filter((action) => action.id !== primaryPipelineAction?.id)
                .map((action) => (
                  <ActionButton key={action.id} variant="quiet" onClick={() => onRunPipelineAction(action.id)}>
                    {action.label}
                  </ActionButton>
                ))}
            </div>
          ) : null}
          <div className="grid gap-2 pt-1 sm:grid-cols-5" aria-label="Acciones ejecutables de pipeline">
            {pipelineState.actions.map((action) => (
              <button
                key={action.id}
                type="button"
                disabled={!action.enabled}
                onClick={() => onRunPipelineAction(action.id)}
                aria-label={`Ejecutar acción pipeline ${action.label}`}
                className={cx(
                  'min-w-0 rounded-lg p-2 text-left ring-1 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:cursor-not-allowed disabled:opacity-70',
                  action.primary
                    ? 'bg-emerald-400/10 ring-emerald-300/40'
                    : action.enabled
                      ? 'bg-blue-400/10 ring-blue-300/30'
                      : 'bg-white/5 ring-white/10',
                  action.enabled ? 'hover:bg-white/10' : '',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-semibold text-white">{action.label}</span>
                  <Badge tone={action.enabled ? 'emerald' : 'slate'}>{action.enabled ? 'ejecutable' : 'espera'}</Badge>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {dailyBatchControl.active ? (
        <div className="mt-4 grid gap-2 rounded-xl bg-emerald-400/10 p-3 ring-1 ring-emerald-300/20 sm:grid-cols-5" aria-label="Automatización de tanda diaria">
          <ActionButton
            variant="primary"
            onClick={onRunDailyBatchAutopilot}
            disabled={dailyBatchControl.payloadReady >= dailyBatchControl.topicCount}
          >
            Completar tanda
          </ActionButton>
          <ActionButton
            onClick={onValidateDailyBatchSources}
            disabled={dailyBatchControl.pendingGuided === 0}
          >
            Validar fuentes
          </ActionButton>
          <ActionButton
            onClick={onApplyDailyBatchAi}
            disabled={dailyBatchControl.validated < dailyBatchControl.sourceMinimum || dailyBatchControl.aiReady >= dailyBatchControl.topicCount}
          >
            Aplicar AI
          </ActionButton>
          <ActionButton
            onClick={onApproveDailyBatchAudit}
            disabled={dailyBatchControl.aiReady < dailyBatchControl.topicCount || dailyBatchControl.auditApproved >= dailyBatchControl.topicCount}
          >
            Aprobar auditoría
          </ActionButton>
          <ActionButton
            onClick={onPrepareDailyBatchPayload}
            disabled={dailyBatchControl.auditApproved < dailyBatchControl.topicCount}
          >
            Preparar payload
          </ActionButton>
        </div>
      ) : null}

      <p className="mt-3 text-xs leading-5 text-slate-400" aria-label="Estado operativo de corrida" aria-live="polite">
        {guidedFlowStatus}
      </p>
    </div>
  );
}
