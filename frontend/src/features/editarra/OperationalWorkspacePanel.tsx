import React, { useState } from 'react';
import type { EditorialPackageFileKey } from './operations';
import type { EditarraPipelineState } from './pipelineModel';
import type { EditorialOperationMode } from './profileModel';
import type { OperationalWorkspaceSnapshot } from './workspaceModel';

type Tone = OperationalWorkspaceSnapshot['readiness']['tone'];

type OperationalWorkspacePanelProps = {
  workspace: OperationalWorkspaceSnapshot;
  pipelineState: EditarraPipelineState;
  sourceControl: {
    total: number;
    validated: number;
    pending: number;
    pendingGuided: number;
    sourceMinimum: number;
    latest: Array<{
      id: string;
      sourceName: string;
      status: string;
      confidence: number;
    }>;
  };
  closureControl: {
    qualityStatus: string;
    canApproveAudit: boolean;
    preflightBlockers: number;
    preflightWarnings: number;
    publicationStatus: string;
    payloadFile: string;
    nextAction: string;
    activePayloadTitle: string;
  };
  operationModes: EditorialOperationMode[];
  selectedOperationModeId: string;
  onEditAuthor: () => void;
  onEditVariables: () => void;
  onOpenAudit: () => void;
  onGenerateNote: () => void;
  onSelectOperationMode: (modeId: string) => void;
  onApplyOperationMode: () => void;
  onCreateGeneratedRun: (title: string) => void;
  onUpdateNoteVariable: (key: string, value: string, description: string) => void;
  onPrepareAi: () => void;
  onPreparePayload: () => void;
  onRunNextControl: () => void;
  onRunAutopilot: () => void;
  onCreateGuidedSources: () => void;
  onValidateGuidedSources: () => void;
  onOpenSources: () => void;
  onApproveAudit: () => void;
  onCloseAuditAndPreparePayload: () => void;
  onOpenPackageFile: (fileKey: EditorialPackageFileKey) => void;
  onCopyAiRequest: () => void;
  onCopyPublicationPayload: () => void;
  onCopyCompletePackage: () => void;
};

const cx = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' ');

const badgeToneClasses: Record<Tone, string> = {
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  blue: 'bg-blue-50 text-blue-700 ring-blue-700/20',
  amber: 'bg-amber-50 text-amber-800 ring-amber-600/25',
  rose: 'bg-rose-50 text-rose-700 ring-rose-700/20',
  slate: 'bg-slate-100 text-slate-700 ring-slate-600/20',
  violet: 'bg-violet-50 text-violet-700 ring-violet-700/20',
};

function Badge({ tone = 'slate', children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span className={cx('inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold ring-1 ring-inset', badgeToneClasses[tone])}>
      {children}
    </span>
  );
}

function ActionButton({
  variant = 'secondary',
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'quiet' }) {
  return (
    <button
      type="button"
      className={cx(
        'inline-flex min-h-9 items-center justify-center rounded-lg px-3 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50',
        variant === 'primary'
          ? 'bg-slate-950 text-white hover:bg-slate-800 focus-visible:outline-slate-950'
          : variant === 'quiet'
            ? 'bg-transparent text-slate-700 ring-1 ring-inset ring-slate-200 hover:bg-white focus-visible:outline-slate-600'
            : 'bg-white text-slate-900 ring-1 ring-inset ring-slate-200 hover:bg-slate-50 focus-visible:outline-slate-600',
      )}
      {...props}
    >
      {children}
    </button>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
      <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">{label}</p>
      <strong className="mt-2 block truncate text-lg font-semibold text-slate-950">{value}</strong>
      <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>
    </div>
  );
}

const workspaceArtifacts: Array<{
  key: EditorialPackageFileKey;
  label: string;
  detail: string;
}> = [
  {
    key: 'note_run.json',
    label: 'Run',
    detail: 'perfil, receta, variables y estado del pipeline',
  },
  {
    key: 'ai_request.json',
    label: 'AI',
    detail: 'contrato ejecutable para proveedor externo o dry-run',
  },
  {
    key: 'quality_audit.json',
    label: 'Auditoría',
    detail: 'bloqueos, fuentes y controles UMSA',
  },
  {
    key: 'image_prompt.json',
    label: 'Imagen',
    detail: 'prompt y reglas visuales antes de publicar',
  },
  {
    key: 'publication_payload.json',
    label: 'Payload',
    detail: 'salida publicable sin POST automático',
  },
  {
    key: 'package_manifest.json',
    label: 'Manifest',
    detail: 'índice portable del paquete completo',
  },
];

export default function OperationalWorkspacePanel({
  workspace,
  pipelineState,
  sourceControl,
  closureControl,
  operationModes,
  selectedOperationModeId,
  onEditAuthor,
  onEditVariables,
  onOpenAudit,
  onGenerateNote,
  onSelectOperationMode,
  onApplyOperationMode,
  onCreateGeneratedRun,
  onUpdateNoteVariable,
  onPrepareAi,
  onPreparePayload,
  onRunNextControl,
  onRunAutopilot,
  onCreateGuidedSources,
  onValidateGuidedSources,
  onOpenSources,
  onApproveAudit,
  onCloseAuditAndPreparePayload,
  onOpenPackageFile,
  onCopyAiRequest,
  onCopyPublicationPayload,
  onCopyCompletePackage,
}: OperationalWorkspacePanelProps) {
  const [workspaceRunTitle, setWorkspaceRunTitle] = useState('');
  const blockerLabel = workspace.readiness.blockers.length > 0
    ? workspace.readiness.blockers.join(', ')
    : 'sin bloqueos';
  const activeStage = pipelineState.stages.find((stage) => stage.id === pipelineState.currentStageId);
  const selectedOperationMode = operationModes.find((mode) => mode.id === selectedOperationModeId) || operationModes[0];
  const sourceTone: Tone = sourceControl.validated >= sourceControl.sourceMinimum
    ? 'emerald'
    : sourceControl.pendingGuided > 0
      ? 'amber'
      : 'blue';
  const publicationTone: Tone = closureControl.publicationStatus === 'listo_para_publicar'
    ? 'emerald'
    : closureControl.publicationStatus === 'bloqueado'
      ? 'rose'
      : 'amber';

  return (
    <section className="max-h-[calc(100vh-9rem)] overflow-y-auto rounded-2xl bg-slate-50 shadow-sm ring-1 ring-slate-200/80" aria-label="Perfil operativo de nota">
      <div className="sticky top-0 z-10 grid gap-4 border-b border-slate-200 bg-slate-50 px-5 py-4">
        <div className="min-w-0 max-w-5xl">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-normal text-emerald-700">Workspace operativo</p>
            <Badge tone={workspace.readiness.tone}>{workspace.readiness.label}</Badge>
            <Badge tone={workspace.counts.noteOverrides > 0 ? 'blue' : 'slate'}>
              {workspace.counts.noteOverrides} override nota
            </Badge>
          </div>
          <h2 className="mt-2 text-lg font-semibold text-slate-950">Soporte e inspección del run</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            {workspace.topic.title} · {workspace.profile.name} · {workspace.recipe.shortLabel} · {workspace.author.name}
          </p>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
            La ejecución principal queda concentrada en el centro operativo. Este workspace sirve para inspeccionar contratos, variables, fuentes y handoff sin perder trazabilidad.
          </p>
        </div>
        <div className="min-w-0 overflow-hidden rounded-xl bg-white p-3 ring-1 ring-slate-200" aria-label="Atajos de soporte del workspace">
          <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">Atajos de soporte</p>
          <div className="mt-2 grid max-w-full gap-2 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
            <ActionButton variant="quiet" onClick={onEditAuthor}>Editar autor</ActionButton>
            <ActionButton variant="quiet" onClick={onEditVariables}>Editar variables</ActionButton>
            <ActionButton variant="quiet" onClick={onOpenAudit}>Auditar</ActionButton>
            <ActionButton variant="quiet" onClick={onRunNextControl}>Siguiente control</ActionButton>
            <ActionButton variant="quiet" onClick={onPrepareAi}>Preparar AI</ActionButton>
            <ActionButton variant="quiet" onClick={onPreparePayload}>Preparar payload</ActionButton>
            <ActionButton variant="secondary" onClick={onGenerateNote}>Generar nota operativa</ActionButton>
          </div>
        </div>
      </div>

      <div className="border-b border-slate-200 bg-white px-5 py-4" aria-label="Preset operativo del workspace">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_auto] lg:items-end">
          <label className="grid min-w-0 gap-1 text-sm font-medium text-slate-700">
            Preset operativo
            <select
              aria-label="Preset operativo workspace"
              value={selectedOperationModeId}
              onChange={(event) => onSelectOperationMode(event.target.value)}
              className="h-10 rounded-lg border-0 bg-slate-50 px-3 text-sm text-slate-950 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-emerald-500"
            >
              {operationModes.map((mode) => (
                <option key={mode.id} value={mode.id}>{mode.name}</option>
              ))}
            </select>
          </label>
          <div className="min-w-0 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="blue">{selectedOperationMode.shortLabel}</Badge>
              <Badge tone="slate">{selectedOperationMode.profilePatch.sourceMinimum} fuentes</Badge>
              <Badge tone="slate">{selectedOperationMode.variables.length} variables</Badge>
              <Badge tone="slate">{selectedOperationMode.profilePatch.postingMode}</Badge>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-600">{selectedOperationMode.intent}</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              Receta {selectedOperationMode.recipeId} · {selectedOperationMode.authorName}
            </p>
          </div>
          <ActionButton variant="primary" onClick={onApplyOperationMode}>
            Aplicar preset
          </ActionButton>
        </div>
      </div>

      <div className="border-b border-slate-200 bg-white px-5 py-4" aria-label="Receta ejecutable del workspace">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-normal text-emerald-700">Receta ejecutable</p>
              <Badge tone="blue">{workspace.recipe.shortLabel}</Badge>
              <Badge tone="slate">{workspace.plan.defaultDepth}</Badge>
              <Badge tone="slate">{workspace.plan.defaultTokens.toLocaleString('es-AR')} tokens</Badge>
              <Badge tone={workspace.plan.variableCoverage.completed === workspace.plan.variableCoverage.total ? 'emerald' : 'amber'}>
                {workspace.plan.variableCoverage.label}
              </Badge>
            </div>
            <label className="mt-3 grid gap-1 text-sm font-medium text-slate-700">
              Intención editorial
              <textarea
                aria-label="Editar intención de receta workspace"
                value={workspace.plan.intent}
                rows={2}
                onChange={(event) => onUpdateNoteVariable(
                  workspace.plan.overrideKeys.intent,
                  event.target.value,
                  'Intención editable del contrato de generación de esta nota.',
                )}
                className="min-h-16 w-full resize-y rounded-lg border-0 bg-slate-50 px-3 py-2 text-sm leading-5 text-slate-950 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-emerald-500"
              />
            </label>
            <label className="mt-3 grid gap-1 text-sm font-medium text-slate-700">
              Plan de fuentes
              <textarea
                aria-label="Editar plan de fuentes workspace"
                value={workspace.plan.sourcePlan}
                rows={2}
                onChange={(event) => onUpdateNoteVariable(
                  workspace.plan.overrideKeys.sourcePlan,
                  event.target.value,
                  'Plan de fuentes editable del contrato de generación de esta nota.',
                )}
                className="min-h-16 w-full resize-y rounded-lg border-0 bg-slate-50 px-3 py-2 text-sm leading-5 text-slate-950 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-emerald-500"
              />
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
              <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">Estructura sugerida</p>
              <label className="mt-3 block">
                <span className="sr-only">Editar estructura de receta workspace</span>
                <textarea
                  aria-label="Editar estructura de receta workspace"
                  value={workspace.plan.structure.join('\n')}
                  rows={5}
                  onChange={(event) => onUpdateNoteVariable(
                    workspace.plan.overrideKeys.structure,
                    event.target.value,
                    'Estructura editable del contrato de generación de esta nota.',
                  )}
                  className="min-h-32 w-full resize-y rounded-lg border-0 bg-white px-3 py-2 text-sm leading-5 text-slate-950 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-emerald-500"
                />
              </label>
              <ol className="mt-3 grid gap-2">
                {workspace.plan.structure.map((step, index) => (
                  <li key={step} className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 text-sm leading-5 text-slate-600">
                    <span className="flex size-6 items-center justify-center rounded-md bg-white text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                      {index + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="rounded-xl bg-slate-950 p-3 text-white ring-1 ring-slate-900">
              <p className="text-xs font-semibold uppercase tracking-normal text-emerald-300">Influencias y fuentes</p>
              <label className="mt-3 block">
                <span className="sr-only">Editar checklist de fuentes workspace</span>
                <textarea
                  aria-label="Editar checklist de fuentes workspace"
                  value={workspace.plan.sourceChecklist.join('\n')}
                  rows={4}
                  onChange={(event) => onUpdateNoteVariable(
                    workspace.plan.overrideKeys.sourceChecklist,
                    event.target.value,
                    'Checklist de fuentes editable del contrato de generación de esta nota.',
                  )}
                  className="min-h-28 w-full resize-y rounded-lg border-0 bg-white px-3 py-2 text-sm leading-5 text-slate-950 ring-1 ring-inset ring-white/20 focus:ring-2 focus:ring-emerald-400"
                />
              </label>
              <div className="mt-3 grid gap-2">
                {workspace.plan.influenceDirectives.map((influence) => (
                  <div key={`${influence.reference}-${influence.relation}`} className="min-w-0 rounded-lg bg-white/5 px-3 py-2 ring-1 ring-white/10">
                    <p className="truncate text-sm font-semibold text-white">{influence.reference}</p>
                    <p className="mt-1 text-xs text-slate-400">{influence.relation} · peso {influence.weight}</p>
                  </div>
                ))}
                {workspace.plan.sourceChecklist.map((source) => (
                  <div key={source} className="rounded-lg bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-100 ring-1 ring-emerald-300/20">
                    Fuente: {source}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="border-b border-slate-200 bg-white px-5 py-4" aria-label="Nueva corrida desde workspace">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <label className="grid min-w-0 gap-1 text-sm font-medium text-slate-700">
            Brief de nueva nota
            <input
              aria-label="Título nueva corrida workspace"
              value={workspaceRunTitle}
              onChange={(event) => setWorkspaceRunTitle(event.target.value)}
              placeholder="Ej. ARCA, cámaras y evidencia diaria en depósitos fiscales"
              className="h-10 rounded-lg border-0 bg-white px-3 text-sm text-slate-950 shadow-sm ring-1 ring-inset ring-emerald-200 focus:ring-2 focus:ring-emerald-500"
            />
          </label>
            <ActionButton
            variant="secondary"
            onClick={() => {
              onCreateGeneratedRun(workspaceRunTitle);
              setWorkspaceRunTitle('');
            }}
          >
            Crear nota por perfil
          </ActionButton>
        </div>
        <p className="mt-2 text-xs leading-5 text-slate-500">
          Usa el perfil, preset, receta, autor y variables activos; crea fuentes guiadas, borrador y note_run sin buscar controles en otra sección.
        </p>
      </div>

      <div className="border-b border-slate-200 bg-slate-50 px-5 py-4" aria-label="Control de pipeline del workspace">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={activeStage?.tone || 'slate'}>{activeStage?.label || pipelineState.currentStageId}</Badge>
              <Badge tone={pipelineState.status === 'listo' ? 'emerald' : pipelineState.status === 'bloqueado' ? 'rose' : pipelineState.status === 'control_humano' ? 'amber' : 'blue'}>
                {pipelineState.status}
              </Badge>
              <span className="text-xs font-semibold text-slate-500">{pipelineState.progress}%</span>
            </div>
            <h3 className="mt-2 text-base font-semibold text-slate-950">{pipelineState.nextControl}</h3>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              {activeStage?.detail || 'Pipeline operativo listo para ejecutar el próximo control.'}
            </p>
            {pipelineState.blockers.length > 0 && (
              <p className="mt-2 text-xs font-semibold text-rose-700">
                Bloqueos: {pipelineState.blockers.join(', ')}
              </p>
            )}
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white ring-1 ring-slate-200">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pipelineState.progress}%` }} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <ActionButton onClick={onRunNextControl} aria-label="Ejecutar siguiente control workspace">
              Ejecutar siguiente
            </ActionButton>
            <ActionButton variant="primary" onClick={onRunAutopilot} aria-label="Completar nota automática workspace">
              Completar nota
            </ActionButton>
          </div>
        </div>
      </div>

      <div className="border-b border-slate-200 px-5 py-4" aria-label="Fuentes guiadas del workspace">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-normal text-emerald-700">Fuentes guiadas</p>
              <Badge tone={sourceTone}>{sourceControl.validated}/{sourceControl.sourceMinimum} validadas</Badge>
              <Badge tone={sourceControl.pendingGuided > 0 ? 'amber' : 'slate'}>
                {sourceControl.pendingGuided} guiadas pendientes
              </Badge>
              <Badge tone="slate">{sourceControl.total} totales</Badge>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Prepara slots guiados, valida fuentes de corrida y abre la matriz de evidencia antes de enviar AI o payload.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ActionButton
              onClick={onCreateGuidedSources}
              disabled={sourceControl.total >= sourceControl.sourceMinimum}
            >
              Preparar fuentes
            </ActionButton>
            <ActionButton
              onClick={onValidateGuidedSources}
              disabled={sourceControl.pendingGuided === 0}
            >
              Validar guiadas
            </ActionButton>
            <ActionButton variant="primary" onClick={onOpenSources}>Abrir matriz</ActionButton>
          </div>
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-3">
          {sourceControl.latest.length === 0 ? (
            <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500 ring-1 ring-slate-200 md:col-span-3">
              Sin fuentes cargadas para esta corrida.
            </p>
          ) : sourceControl.latest.map((source) => (
            <article key={source.id} className="min-w-0 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
              <p className="truncate text-sm font-semibold text-slate-950">{source.sourceName}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-white px-2 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">{source.status}</span>
                <span className="rounded-md bg-white px-2 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">{source.confidence}%</span>
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="border-b border-slate-200 px-5 py-4" aria-label="Artefactos operativos del workspace">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-normal text-emerald-700">Artefactos del run</p>
            <h3 className="mt-1 text-base font-semibold text-slate-950">Abrir contratos sin buscar archivos</h3>
          </div>
          <Badge tone="slate">POST externo off</Badge>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {workspaceArtifacts.map((artifact) => (
            <button
              key={artifact.key}
              type="button"
              onClick={() => onOpenPackageFile(artifact.key)}
              className="min-w-0 rounded-xl bg-slate-50 p-3 text-left ring-1 ring-slate-200 transition hover:bg-white hover:ring-emerald-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
              aria-label={`Abrir artefacto workspace ${artifact.key}`}
            >
              <span className="text-xs font-semibold uppercase tracking-normal text-slate-500">{artifact.label}</span>
              <strong className="mt-1 block truncate font-mono text-sm text-slate-950">{artifact.key}</strong>
              <span className="mt-2 block text-xs leading-5 text-slate-500">{artifact.detail}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="border-b border-slate-200 px-5 py-4" aria-label="Cierre editorial del workspace">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-normal text-emerald-700">Cierre editorial</p>
              <Badge tone={publicationTone}>{closureControl.publicationStatus}</Badge>
              <Badge tone={closureControl.preflightBlockers > 0 ? 'rose' : 'emerald'}>
                {closureControl.preflightBlockers} bloqueos
              </Badge>
              <Badge tone={closureControl.preflightWarnings > 0 ? 'amber' : 'slate'}>
                {closureControl.preflightWarnings} avisos
              </Badge>
            </div>
            <h3 className="mt-2 truncate text-base font-semibold text-slate-950">{closureControl.payloadFile}</h3>
            <p className="mt-1 text-sm leading-6 text-slate-500">{closureControl.nextAction}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ActionButton
              variant="primary"
              onClick={onCloseAuditAndPreparePayload}
              disabled={!closureControl.canApproveAudit}
            >
              Cerrar auditoría y payload
            </ActionButton>
            <ActionButton
              onClick={onApproveAudit}
              disabled={!closureControl.canApproveAudit}
            >
              Solo aprobar auditoría
            </ActionButton>
            <ActionButton
              onClick={onPreparePayload}
              disabled={closureControl.publicationStatus === 'bloqueado'}
            >
              Preparar payload final
            </ActionButton>
            <ActionButton variant="primary" onClick={onOpenAudit}>Abrir auditoría</ActionButton>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <MetricCard
            label="Auditoría"
            value={closureControl.qualityStatus}
            detail={closureControl.canApproveAudit ? 'aprobable' : 'requiere control'}
          />
          <MetricCard
            label="Payload"
            value={closureControl.activePayloadTitle || 'sin título'}
            detail="publication_payload.json"
          />
          <MetricCard
            label="Salida"
            value={closureControl.publicationStatus}
            detail="POST externo off"
          />
        </div>
      </div>

      <div className="border-b border-slate-200 bg-slate-950 px-5 py-4 text-white" aria-label="Handoff operativo del workspace">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="emerald">handoff</Badge>
              <span className="rounded-md bg-white/10 px-2 py-1 text-xs font-semibold text-slate-200">manual-json-copy</span>
              <span className="rounded-md bg-white/10 px-2 py-1 text-xs font-semibold text-slate-200">POST externo off</span>
            </div>
            <h3 className="mt-2 text-base font-semibold">Salida portable del run</h3>
            <p className="mt-1 text-sm leading-6 text-slate-300">
              Copia los contratos listos para enchufar AI, revisar publicación o guardar el paquete completo con runtime y trazabilidad.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ActionButton onClick={onCopyAiRequest}>Copiar AI request</ActionButton>
            <ActionButton onClick={onCopyPublicationPayload}>Copiar payload</ActionButton>
            <ActionButton variant="primary" onClick={onCopyCompletePackage}>Copiar paquete</ActionButton>
          </div>
        </div>
      </div>

      <div className="grid gap-4 p-5 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        <div className="grid gap-3 sm:grid-cols-2">
          <MetricCard
            label="Perfil"
            value={workspace.profile.site}
            detail={`${workspace.profile.postingMode} · ${workspace.counts.guardrails} guardrails`}
          />
          <MetricCard
            label="Fuentes"
            value={`${workspace.counts.sources}/${workspace.counts.sourceMinimum}`}
            detail={blockerLabel}
          />
          <MetricCard
            label="Autor"
            value={`${workspace.author.score}/100`}
            detail={`${workspace.counts.activeAuthors}/${workspace.counts.totalAuthors} activos`}
          />
          <MetricCard
            label="Variables"
            value={`${workspace.counts.enabledVariables} activas`}
            detail={`${workspace.counts.recipeVariables} de receta`}
          />
        </div>

        <div className="min-w-0 rounded-xl bg-slate-950 p-4 text-white" aria-label="Mapa operativo de variables">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-normal text-emerald-300">Variables de la corrida</p>
              <h3 className="mt-1 text-sm font-semibold">{workspace.recipe.label}</h3>
            </div>
            <Badge tone={workspace.readiness.tone}>{workspace.topic.status}</Badge>
          </div>

          <div className="mt-4 grid gap-2">
            {workspace.variables.map((variable) => (
              <article key={variable.key} className="grid gap-3 rounded-lg bg-white/5 p-3 ring-1 ring-white/10 sm:grid-cols-[minmax(0,0.42fr)_minmax(0,1fr)_auto] sm:items-start">
                <div className="min-w-0">
                  <p className="break-all font-mono text-xs font-semibold text-slate-300">{variable.key}</p>
                  <p className="mt-1 text-xs text-slate-500">{variable.enabled ? 'activa' : 'inactiva'} · {variable.description}</p>
                </div>
                <label className="min-w-0">
                  <span className="sr-only">Variable operativa {variable.key}</span>
                  <textarea
                    aria-label={`Variable operativa ${variable.key}`}
                    value={variable.value}
                    rows={2}
                    onChange={(event) => onUpdateNoteVariable(variable.key, event.target.value, variable.description)}
                    className="min-h-16 w-full resize-y rounded-lg border-0 bg-white px-3 py-2 text-sm leading-5 text-slate-950 shadow-sm ring-1 ring-inset ring-white/20 focus:ring-2 focus:ring-emerald-400"
                  />
                </label>
                <span className={cx(
                  'inline-flex rounded-md px-2 py-1 text-xs font-semibold',
                  variable.source === 'nota' ? 'bg-blue-400 text-slate-950' : 'bg-white/10 text-slate-200',
                )}>
                  {variable.source === 'nota' ? 'override nota' : 'perfil'}
                </span>
              </article>
            ))}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <div className="flex flex-wrap gap-2">
              {workspace.author.primaryInfluences.map((influence) => (
                <span key={influence} className="rounded-md bg-white/10 px-2 py-1 text-xs font-semibold text-slate-200">
                  {influence}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <ActionButton onClick={onPrepareAi}>AI request</ActionButton>
              <ActionButton variant="primary" onClick={onPreparePayload}>Payload</ActionButton>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
