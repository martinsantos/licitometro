import React from 'react';
import type { GuidedNextStep } from './guidedEngine';
import type { EditarraPipelineActionId, EditarraPipelineState } from './pipelineModel';
import type { EditarraNoteRun } from './runModel';
import type { EditorialPackageFileKey } from './operations';
import type { VisibleNoteVariable } from './workspaceModel';
import { Badge, Button, Panel, cx, type EditarraTone } from './uiPrimitives';

type OperationalHomePanelProps = {
  topicTitle: string;
  profileName: string;
  recipeLabel: string;
  authorName: string;
  guidedNextStep: GuidedNextStep;
  pipelineState: EditarraPipelineState;
  activeNoteRun: EditarraNoteRun;
  visibleNoteVariables: VisibleNoteVariable[];
  sourceValidated: number;
  sourceMinimum: number;
  preflightBlockers: number;
  preflightWarnings: number;
  payloadFileKey: EditorialPackageFileKey;
  onRunPipelineAction: (actionId: EditarraPipelineActionId) => void;
  onGenerateNote: () => void;
  onRunAutopilot: () => void;
  onOpenPackageFile: (fileKey: EditorialPackageFileKey) => void;
  onEditVariables: () => void;
  onOpenEditor: () => void;
  onOpenAudit: () => void;
  onOpenConfig: () => void;
  onUpdateNoteVariable: (key: string, value: string, description: string) => void;
};

const pipelineTone: Record<EditarraPipelineState['status'], EditarraTone> = {
  operando: 'blue',
  bloqueado: 'rose',
  control_humano: 'amber',
  listo: 'emerald',
};

const stageTone: Record<EditarraPipelineState['stages'][number]['status'], EditarraTone> = {
  listo: 'emerald',
  activo: 'blue',
  bloqueado: 'rose',
  pendiente: 'slate',
};

export default function OperationalHomePanel({
  topicTitle,
  profileName,
  recipeLabel,
  authorName,
  guidedNextStep,
  pipelineState,
  activeNoteRun,
  visibleNoteVariables,
  sourceValidated,
  sourceMinimum,
  preflightBlockers,
  preflightWarnings,
  payloadFileKey,
  onRunPipelineAction,
  onGenerateNote,
  onRunAutopilot,
  onOpenPackageFile,
  onEditVariables,
  onOpenEditor,
  onOpenAudit,
  onOpenConfig,
  onUpdateNoteVariable,
}: OperationalHomePanelProps) {
  const primaryAction = pipelineState.actions.find((action) => action.primary && action.enabled)
    || pipelineState.actions.find((action) => action.enabled);
  const criticalVariables = visibleNoteVariables.filter((variable) => variable.enabled).slice(0, 4);
  const noteOverrides = activeNoteRun.variables.noteOverrides;

  return (
    <Panel className="mt-4 overflow-hidden" aria-label="Inicio operativo EDITARRA">
      <div className="grid gap-0 xl:grid-cols-[minmax(0,1.05fr)_minmax(22rem,0.72fr)]">
        <div className="min-w-0 bg-slate-950 p-5 text-white">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={pipelineTone[pipelineState.status]}>{pipelineState.status}</Badge>
            <Badge tone={guidedNextStep.tone}>{guidedNextStep.badge}</Badge>
            <Badge tone="slate">{sourceValidated}/{sourceMinimum} fuentes</Badge>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-normal text-emerald-300">Nota activa</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-normal text-white">{topicTitle}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                {profileName} · {recipeLabel} · {authorName}
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:w-80">
              <Button
                variant="primary"
                className="bg-emerald-400 text-slate-950 hover:bg-emerald-300 focus-visible:outline-emerald-300"
                onClick={primaryAction ? () => onRunPipelineAction(primaryAction.id) : onGenerateNote}
                aria-label="Ejecutar siguiente acción operativa"
              >
                {primaryAction?.label || 'Generar nota'}
              </Button>
              <Button
                variant="secondary"
                className="bg-white/10 text-white ring-white/15 hover:bg-white/15"
                onClick={onRunAutopilot}
                aria-label="Completar nota automática"
              >
                Autopiloto
              </Button>
              <Button
                variant="secondary"
                className="bg-white/10 text-white ring-white/15 hover:bg-white/15"
                onClick={onGenerateNote}
              >
                Generar con perfil
              </Button>
              <Button
                variant="secondary"
                className="bg-white/10 text-white ring-white/15 hover:bg-white/15"
                onClick={() => onOpenPackageFile('automation_recipe.json')}
              >
                automation_recipe.json
              </Button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3" aria-label="Estado operativo compacto">
            {[
              ['Siguiente control', pipelineState.nextControl, guidedNextStep.detail],
              ['AI / salida', activeNoteRun.ai.expectedFile, `${activeNoteRun.exportKeys.length} archivos exportables`],
              ['Revision', `${preflightBlockers} bloqueos`, `${preflightWarnings} avisos activos`],
            ].map(([label, value, detail]) => (
              <div key={label} className="min-w-0 rounded-xl bg-white/5 p-4 ring-1 ring-white/10">
                <p className="text-xs font-semibold uppercase tracking-normal text-slate-400">{label}</p>
                <strong className="mt-2 block truncate text-base font-semibold text-white">{value}</strong>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-400">{detail}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 grid gap-2 sm:grid-cols-5" aria-label="Pipeline compacto">
            {pipelineState.stages.map((stage) => (
              <button
                key={stage.id}
                type="button"
                onClick={() => {
                  if (stage.id === 'auditoria') onOpenAudit();
                  else if (stage.id === 'payload') onOpenConfig();
                  else if (stage.id === 'ai') onOpenEditor();
                }}
                className={cx(
                  'min-w-0 rounded-xl p-3 text-left transition ring-1 ring-white/10',
                  stage.id === pipelineState.currentStageId ? 'bg-white text-slate-950' : 'bg-white/5 text-white hover:bg-white/10',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold">{stage.label}</span>
                  <Badge tone={stageTone[stage.status]}>{stage.status}</Badge>
                </div>
                <p className={cx(
                  'mt-2 line-clamp-2 text-xs leading-5',
                  stage.id === pipelineState.currentStageId ? 'text-slate-600' : 'text-slate-400',
                )}>
                  {stage.control}
                </p>
              </button>
            ))}
          </div>
        </div>

        <div className="min-w-0 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-normal text-emerald-700">Variables críticas</p>
              <h3 className="mt-1 text-base font-semibold text-slate-950">Ajustes que modifican esta nota</h3>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                Cambian el brief, el borrador y el payload sin tocar el perfil base.
              </p>
            </div>
            <Badge tone={noteOverrides > 0 ? 'blue' : 'slate'}>{noteOverrides} overrides</Badge>
          </div>

          <div className="mt-4 grid gap-3">
            {criticalVariables.map((variable) => (
              <label key={variable.key} className="grid gap-1 text-sm font-medium text-slate-700">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-slate-600">{variable.key}</span>
                  <Badge tone={variable.source === 'nota' ? 'blue' : 'slate'}>{variable.source}</Badge>
                </span>
                <input
                  aria-label={`Variable crítica ${variable.key}`}
                  value={variable.value}
                  onChange={(event) => onUpdateNoteVariable(variable.key, event.target.value, variable.description)}
                  className="h-10 rounded-lg border-0 bg-slate-50 px-3 text-sm text-slate-950 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-emerald-500"
                />
              </label>
            ))}
          </div>

          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <Button onClick={onEditVariables}>Editar todas</Button>
            <Button onClick={onOpenEditor}>Editor avanzado</Button>
            <Button onClick={() => onOpenPackageFile(payloadFileKey)}>Abrir artefacto</Button>
            <Button onClick={() => onOpenPackageFile('publication_payload.json')}>Payload final</Button>
          </div>
        </div>
      </div>
    </Panel>
  );
}
