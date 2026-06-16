import React from 'react';
import type { EditarraAiHandoffStatus } from './aiAdapter';
import type { GuidedRunSummary } from './guidedEngine';
import type { EditorialPackageFileKey } from './operations';
import type { OperationalWorkspaceSnapshot } from './workspaceModel';
import { buildOperationalRunQueue } from './runQueueModel';
import type { OperationalRunQueueItem } from './runQueueModel';
import type {
  AiHandoffSummary,
  AiRunRequestSummary,
  ClosureControlSummary,
  DailyBatchControlSummary,
  SourceControlSummary,
} from './RunCockpitContracts';
import { ActionButton, Badge, CompactMetric } from './RunCockpitPrimitives';
import type { RunCockpitTone as Tone } from './RunCockpitPrimitives';

type RunExecutionPanelProps = {
  workspace: OperationalWorkspaceSnapshot;
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
  onUpdateNoteVariable: (key: string, value: string, description: string) => void;
  onResumeRun: (run: GuidedRunSummary) => void;
  onOperateQueuedRun: (run: OperationalRunQueueItem) => void;
  onOpenPackageFile: (fileKey: EditorialPackageFileKey) => void;
  onCopyAiRequest: () => void;
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

const sourceStatusTone: Record<string, Tone> = {
  validado: 'emerald',
  pendiente: 'amber',
  riesgo: 'rose',
};

const aiHandoffTone: Record<EditarraAiHandoffStatus, Tone> = {
  listo_para_ai: 'emerald',
  requiere_fuentes: 'rose',
  requiere_auditoria: 'amber',
};

const aiHandoffLabel: Record<EditarraAiHandoffStatus, string> = {
  listo_para_ai: 'listo para AI',
  requiere_fuentes: 'requiere fuentes',
  requiere_auditoria: 'requiere auditoría',
};

const packageFileForRunControl = (nextControl: string): EditorialPackageFileKey => {
  const normalizedControl = nextControl.toLowerCase();

  if (normalizedControl.includes('fuente')) {
    return 'evidence_log.json';
  }

  if (normalizedControl.includes('auditor')) {
    return 'quality_audit.json';
  }

  if (normalizedControl.includes('payload') || normalizedControl.includes('export')) {
    return 'publication_payload.json';
  }

  if (normalizedControl.includes('ai') || normalizedControl.includes('nota') || normalizedControl.includes('generar')) {
    return 'ai_brief.json';
  }

  return 'metadata.json';
};

const publicationTone = (status: string): Tone => (
  status === 'listo_para_publicar' ? 'emerald' : status === 'bloqueado' ? 'rose' : 'amber'
);

const decisionLabel = (status: string) => (
  status === 'listo_para_publicar'
    ? 'Publicable con control humano'
    : status === 'bloqueado'
      ? 'No publicable'
      : 'Revisión requerida'
);

export default function RunExecutionPanel({
  workspace,
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
  onUpdateNoteVariable,
  onResumeRun,
  onOperateQueuedRun,
  onOpenPackageFile,
  onCopyAiRequest,
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
}: RunExecutionPanelProps) {
  const visibleVariables = workspace.variables.slice(0, 4);
  const latestRun = visibleRuns[0];
  const blockerLabel = workspace.readiness.blockers.length > 0
    ? workspace.readiness.blockers.join(', ')
    : 'sin bloqueos';
  const sourceTone: Tone = sourceControl.validated >= sourceControl.sourceMinimum
    ? 'emerald'
    : sourceControl.pendingGuided > 0
      ? 'amber'
      : sourceControl.total === 0
        ? 'rose'
        : 'blue';
  const dailyBatchTone: Tone = !dailyBatchControl.active
    ? 'slate'
    : dailyBatchControl.validated >= dailyBatchControl.sourceMinimum
      ? 'emerald'
      : dailyBatchControl.pendingGuided > 0
        ? 'amber'
        : 'blue';
  const runQueue = buildOperationalRunQueue([...visibleRuns, ...recentRuns]);

  return (
    <div className="grid min-w-0 max-w-full grid-cols-[minmax(0,1fr)] gap-3 overflow-hidden">
      <div className="grid min-w-0 max-w-full grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2">
        <CompactMetric
          label="Fuentes"
          value={`${workspace.counts.sources}/${workspace.counts.sourceMinimum}`}
          detail={blockerLabel}
        />
        <CompactMetric
          label="Payload"
          value={payloadFileKey}
          detail={`${workspace.counts.preflightBlockers} bloqueos preflight`}
        />
      </div>

      <div className="min-w-0 rounded-xl bg-white/5 p-4 ring-1 ring-white/10" aria-label="Variables críticas de corrida">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-normal text-slate-400">Variables críticas</p>
            <p className="mt-1 text-sm text-slate-300">{workspace.counts.noteOverrides} overrides de nota</p>
          </div>
          <ActionButton variant="quiet" onClick={onEditVariables}>Abrir mapa completo</ActionButton>
        </div>
        <div className="mt-3 grid min-w-0 max-w-full grid-cols-[minmax(0,1fr)] gap-2 md:grid-cols-2">
          {visibleVariables.map((variable) => (
            <label key={variable.key} className="min-w-0 rounded-lg bg-white/5 p-3 ring-1 ring-white/10">
              <span className="flex flex-wrap items-center gap-2">
                <span className="break-all font-mono text-xs font-semibold text-slate-300">{variable.key}</span>
                <Badge tone={variable.source === 'nota' ? 'blue' : 'slate'}>{variable.source}</Badge>
              </span>
              <input
                aria-label={`Variable crítica ${variable.key}`}
                value={variable.value}
                onChange={(event) => onUpdateNoteVariable(variable.key, event.target.value, variable.description)}
                className="mt-2 h-10 w-full rounded-lg border-0 bg-white/10 px-3 text-sm text-white ring-1 ring-inset ring-white/10 placeholder:text-slate-500 focus:bg-white/15 focus:ring-2 focus:ring-emerald-300"
              />
            </label>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <ActionButton variant="primary" onClick={onGenerateNote}>Generar nota con variables</ActionButton>
          <ActionButton variant="quiet" onClick={onEditVariables}>Variables globales</ActionButton>
        </div>
      </div>

      <div className="rounded-xl bg-white/5 p-4 ring-1 ring-white/10" aria-label="Fuentes guiadas de corrida">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-normal text-slate-400">Fuentes guiadas</p>
            <p className="mt-1 text-sm text-slate-300">
              {sourceControl.pendingGuided > 0
                ? `${sourceControl.pendingGuided} pendientes de validación guiada`
                : sourceControl.total > 0
                  ? `${sourceControl.pending} pendientes totales`
                  : 'sin matriz de fuentes'}
            </p>
          </div>
          <Badge tone={sourceTone}>{sourceControl.validated}/{sourceControl.sourceMinimum} validadas</Badge>
        </div>
        <div className="mt-3 grid gap-2">
          {sourceControl.latest.length === 0 ? (
            <p className="rounded-lg bg-white/5 p-3 text-sm leading-5 text-slate-400 ring-1 ring-white/10">
              Crea una corrida o abre la matriz para preparar evidencia.
            </p>
          ) : sourceControl.latest.map((source) => (
            <article key={source.id} className="min-w-0 rounded-lg bg-white/5 p-3 ring-1 ring-white/10">
              <div className="flex flex-wrap items-center gap-2">
                <p className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{source.sourceName}</p>
                <Badge tone={sourceStatusTone[source.status] || 'slate'}>{source.status}</Badge>
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-400">Confianza {source.confidence}/100</p>
            </article>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <ActionButton
            onClick={onCreateGuidedSources}
            disabled={sourceControl.total >= sourceControl.sourceMinimum}
          >
            Preparar fuentes guiadas
          </ActionButton>
          <ActionButton
            variant="primary"
            onClick={onValidateGuidedSources}
            disabled={sourceControl.pendingGuided === 0}
          >
            Validar fuentes guiadas
          </ActionButton>
          <ActionButton variant="quiet" onClick={onOpenSources}>Abrir matriz</ActionButton>
        </div>
      </div>

      {dailyBatchControl.active ? (
        <div className="rounded-xl bg-emerald-400/10 p-4 ring-1 ring-emerald-300/20" aria-label="Tanda diaria de corrida">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-normal text-emerald-200">Tanda diaria activa</p>
              <p className="mt-1 text-sm text-emerald-50">
                {dailyBatchControl.topicCount} notas generadas desde el mismo perfil.
              </p>
            </div>
            <Badge tone={dailyBatchTone}>{dailyBatchControl.validated}/{dailyBatchControl.sourceMinimum} fuentes validadas</Badge>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <CompactMetric
              label="Pendientes guiadas"
              value={String(dailyBatchControl.pendingGuided)}
              detail="se validan como lote"
            />
            <CompactMetric
              label="Notas de tanda"
              value={String(dailyBatchControl.topicCount)}
              detail="reactiva, evergreen y caso"
            />
            <CompactMetric
              label="AI lista"
              value={`${dailyBatchControl.aiReady}/${dailyBatchControl.topicCount}`}
              detail="borradores por revisar"
            />
            <CompactMetric
              label="Auditoría"
              value={`${dailyBatchControl.auditApproved}/${dailyBatchControl.topicCount}`}
              detail={`${dailyBatchControl.payloadReady} payloads listos`}
            />
          </div>
          <div className="mt-3 grid gap-2">
            {dailyBatchControl.latestTitles.map((title, index) => (
              <p key={title} className="truncate rounded-lg bg-white/5 px-3 py-2 text-sm font-semibold text-white ring-1 ring-white/10">
                {index + 1}. {title}
              </p>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs leading-5 text-emerald-100">
              Los controles de lote están centralizados en el centro operativo.
            </p>
            <ActionButton variant="quiet" onClick={onOpenSources}>Abrir matriz</ActionButton>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-5" aria-label="Atajos de tanda diaria">
            <ActionButton
              variant="quiet"
              onClick={onRunDailyBatchAutopilot}
              disabled={dailyBatchControl.payloadReady >= dailyBatchControl.topicCount}
              aria-label="Completar tanda automática"
            >
              Completar
            </ActionButton>
            <ActionButton
              variant="quiet"
              onClick={onValidateDailyBatchSources}
              disabled={dailyBatchControl.pendingGuided === 0}
              aria-label="Validar fuentes de tanda"
            >
              Fuentes
            </ActionButton>
            <ActionButton
              variant="quiet"
              onClick={onApplyDailyBatchAi}
              disabled={dailyBatchControl.validated < dailyBatchControl.sourceMinimum || dailyBatchControl.aiReady >= dailyBatchControl.topicCount}
              aria-label="Aplicar AI a tanda"
            >
              AI
            </ActionButton>
            <ActionButton
              variant="quiet"
              onClick={onApproveDailyBatchAudit}
              disabled={dailyBatchControl.aiReady < dailyBatchControl.topicCount || dailyBatchControl.auditApproved >= dailyBatchControl.topicCount}
              aria-label="Aprobar auditoría de tanda"
            >
              Auditoría
            </ActionButton>
            <ActionButton
              variant="quiet"
              onClick={onPrepareDailyBatchPayload}
              disabled={dailyBatchControl.auditApproved < dailyBatchControl.topicCount}
              aria-label="Preparar payload de tanda"
            >
              Payload
            </ActionButton>
          </div>
        </div>
      ) : null}

      <div className="rounded-xl bg-white/5 p-4 ring-1 ring-white/10" aria-label="Handoff AI de corrida">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-normal text-slate-400">AI / JSON</p>
            <p className="mt-1 truncate text-sm font-semibold text-white">{aiHandoff.sendFile} -&gt; {aiHandoff.expectedFile}</p>
          </div>
          <Badge tone={aiHandoffTone[aiHandoff.status]}>{aiHandoffLabel[aiHandoff.status]}</Badge>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="rounded-lg bg-white/5 p-3 ring-1 ring-white/10">
            <p className="text-xs font-semibold uppercase tracking-normal text-slate-400">Fuentes brief</p>
            <p className="mt-1 text-sm font-semibold text-white">{aiHandoff.sourceCount}/{aiHandoff.requiredSources}</p>
          </div>
          <div className="rounded-lg bg-white/5 p-3 ring-1 ring-white/10">
            <p className="text-xs font-semibold uppercase tracking-normal text-slate-400">Schema</p>
            <p className="mt-1 text-sm font-semibold text-white">{aiHandoff.outputSchemaKeys.length} claves</p>
          </div>
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-400">{aiHandoff.nextAction}</p>
        <p className="mt-2 break-all font-mono text-[11px] leading-4 text-slate-500">{aiHandoff.checksum}</p>
        <div className="mt-3 rounded-lg bg-slate-950/60 p-3 ring-1 ring-white/10" aria-label="Contrato AI ejecutable">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-normal text-slate-400">Request AI</p>
              <p className="mt-1 break-all font-mono text-xs font-semibold text-white">{aiRunRequest.id}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge tone={aiRunRequest.blocked ? 'rose' : 'emerald'}>
                {aiRunRequest.blocked ? 'bloqueado' : 'listo'}
              </Badge>
              <Badge tone="slate">{aiRunRequest.transport}</Badge>
            </div>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div className="rounded-md bg-white/5 p-2 ring-1 ring-white/10">
              <p className="text-xs font-semibold uppercase tracking-normal text-slate-400">Schema esperado</p>
              <p className="mt-1 text-sm font-semibold text-white">{aiRunRequest.outputSchemaKeys.length} claves</p>
            </div>
            <div className="rounded-md bg-white/5 p-2 ring-1 ring-white/10">
              <p className="text-xs font-semibold uppercase tracking-normal text-slate-400">Checksum request</p>
              <p className="mt-1 break-all font-mono text-[11px] text-slate-300">{aiRunRequest.checksum}</p>
            </div>
          </div>
          <ul className="mt-3 grid gap-1 text-xs leading-5 text-slate-400">
            {aiRunRequest.instructions.slice(0, 3).map((instruction) => (
              <li key={instruction}>- {instruction}</li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <ActionButton variant="primary" onClick={onCopyAiRequest}>Copiar ai_request.json</ActionButton>
            <ActionButton variant="quiet" onClick={() => onOpenPackageFile('ai_request.json')}>Abrir ai_request.json</ActionButton>
            <ActionButton variant="quiet" onClick={() => onOpenPackageFile('ai_brief.json')}>Abrir ai_brief.json</ActionButton>
            <ActionButton variant="quiet" onClick={() => onOpenPackageFile('publication_payload.json')}>Abrir publication_payload.json</ActionButton>
          </div>
        </div>
        <label className="mt-3 grid gap-2 text-xs font-semibold uppercase tracking-normal text-slate-400">
          Respuesta AI JSON
          <textarea
            aria-label="Respuesta AI JSON cockpit"
            value={aiResponseBuffer}
            onChange={(event) => onUpdateAiResponse(event.target.value)}
            rows={5}
            placeholder='{"titulo":"...","resumen":"...","contenido":"Lead... ## Cómo funciona por dentro..."}'
            className="min-h-28 rounded-lg border-0 bg-white/10 px-3 py-3 font-mono text-xs leading-5 text-white ring-1 ring-inset ring-white/10 placeholder:text-slate-500 focus:bg-white/15 focus:ring-2 focus:ring-emerald-300"
          />
        </label>
        <p className="mt-2 text-xs leading-5 text-slate-400" aria-label="Estado AI cockpit" aria-live="polite">{aiStatus}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <ActionButton
            variant="primary"
            onClick={onRunLocalAiAndApply}
            disabled={aiHandoff.status === 'requiere_fuentes'}
          >
            Ejecutar AI local y aplicar
          </ActionButton>
          <ActionButton variant="quiet" onClick={onPrepareAiHandoff}>Preparar handoff AI</ActionButton>
          <ActionButton variant="quiet" onClick={onGenerateLocalAiResponse}>Generar respuesta AI local</ActionButton>
          <ActionButton
            onClick={onApplyAiResponse}
            disabled={aiResponseBuffer.trim().length === 0}
          >
            Aplicar respuesta AI en cockpit
          </ActionButton>
          <ActionButton variant="quiet" onClick={onOpenPayload}>Abrir JSON publicable</ActionButton>
        </div>
      </div>

      <div className="rounded-xl bg-emerald-400/10 p-4 ring-1 ring-emerald-300/20" aria-label="Decisión UMSA de publicación">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-normal text-emerald-200">Readiness UMSA</p>
            <h3 className="mt-1 text-base font-semibold text-white">{decisionLabel(closureControl.publicationStatus)}</h3>
            <p className="mt-1 text-sm leading-6 text-emerald-50">{closureControl.nextAction}</p>
          </div>
          <Badge tone={publicationTone(closureControl.publicationStatus)}>{closureControl.publicationStatus}</Badge>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {[
            {
              label: 'Fuentes',
              value: `${sourceControl.validated}/${sourceControl.sourceMinimum}`,
              detail: sourceControl.validated >= sourceControl.sourceMinimum ? 'mínimo validado' : `${sourceControl.pendingGuided} guiadas pendientes`,
              tone: sourceControl.validated >= sourceControl.sourceMinimum ? 'emerald' as Tone : 'amber' as Tone,
            },
            {
              label: 'AI',
              value: aiHandoffLabel[aiHandoff.status],
              detail: aiHandoff.sendFile,
              tone: aiHandoffTone[aiHandoff.status],
            },
            {
              label: 'Auditoría',
              value: closureControl.qualityStatus,
              detail: `${closureControl.preflightBlockers} bloqueos · ${closureControl.preflightWarnings} avisos`,
              tone: closureControl.preflightBlockers > 0 ? 'rose' as Tone : closureControl.canApproveAudit ? 'emerald' as Tone : 'amber' as Tone,
            },
            {
              label: 'Publicación',
              value: closureControl.payloadFile,
              detail: 'POST externo off',
              tone: publicationTone(closureControl.publicationStatus),
            },
          ].map((item) => (
            <div key={item.label} className="rounded-lg bg-slate-950/50 p-3 ring-1 ring-white/10">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-normal text-slate-400">{item.label}</p>
                <Badge tone={item.tone}>{item.detail}</Badge>
              </div>
              <p className="mt-2 truncate text-sm font-semibold text-white">{item.value}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <ActionButton variant="primary" onClick={onOpenAudit}>Revisar auditoría</ActionButton>
          <ActionButton onClick={onOpenPayload}>Revisar payload</ActionButton>
          <ActionButton variant="quiet" onClick={() => onOpenPackageFile('package_manifest.json')}>Manifest</ActionButton>
        </div>
      </div>

      <div className="min-w-0 rounded-xl bg-white/5 p-4 ring-1 ring-white/10" aria-label="Cierre editorial de corrida">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-normal text-slate-400">Cierre editorial</p>
            <p className="mt-1 truncate text-sm font-semibold text-white">{closureControl.payloadFile}</p>
          </div>
          <Badge tone={publicationTone(closureControl.publicationStatus)}>{closureControl.publicationStatus}</Badge>
        </div>
        <div className="mt-3 grid min-w-0 max-w-full grid-cols-[minmax(0,1fr)] gap-2 md:grid-cols-3">
          <div className="min-w-0 rounded-lg bg-white/5 p-3 ring-1 ring-white/10">
            <p className="text-xs font-semibold uppercase tracking-normal text-slate-400">Auditoría</p>
            <p className="mt-1 text-sm font-semibold text-white">{closureControl.qualityStatus}</p>
          </div>
          <div className="min-w-0 rounded-lg bg-white/5 p-3 ring-1 ring-white/10">
            <p className="text-xs font-semibold uppercase tracking-normal text-slate-400">Bloqueos</p>
            <p className="mt-1 text-sm font-semibold text-white">{closureControl.preflightBlockers} / {closureControl.preflightWarnings} avisos</p>
          </div>
          <div className="min-w-0 rounded-lg bg-white/5 p-3 ring-1 ring-white/10">
            <p className="text-xs font-semibold uppercase tracking-normal text-slate-400">Payload</p>
            <p className="mt-1 truncate text-sm font-semibold text-white">{closureControl.activePayloadTitle}</p>
          </div>
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-400">{closureControl.nextAction}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <ActionButton
            variant="primary"
            onClick={onCloseAuditAndPreparePayload}
            disabled={!closureControl.canApproveAudit}
          >
            Cerrar auditoría y payload
          </ActionButton>
          <ActionButton
            variant="quiet"
            onClick={onApproveAudit}
            disabled={!closureControl.canApproveAudit}
          >
            Solo aprobar auditoría
          </ActionButton>
          <ActionButton
            variant="quiet"
            onClick={onPreparePayload}
            disabled={closureControl.publicationStatus === 'bloqueado'}
          >
            Preparar payload final
          </ActionButton>
          <ActionButton
            onClick={onCopyPublicationPayload}
            disabled={closureControl.publicationStatus === 'bloqueado'}
          >
            Copiar publication_payload.json
          </ActionButton>
          <ActionButton variant="quiet" onClick={onCopyCompletePackage}>
            Copiar paquete completo
          </ActionButton>
          <ActionButton variant="quiet" onClick={onOpenAudit}>Abrir auditoría</ActionButton>
        </div>
      </div>

      <div className="rounded-xl bg-white/5 p-4 ring-1 ring-white/10" aria-label="Historial operativo de corridas">
        <div className="rounded-xl bg-slate-950/60 p-4 ring-1 ring-emerald-300/20" aria-label="Bandeja operativa de corridas">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-normal text-emerald-200">Bandeja operativa</p>
              <h3 className="mt-1 text-base font-semibold text-white">
                {runQueue.length > 0 ? `${runQueue.length} corridas priorizadas` : 'Sin corridas pendientes'}
              </h3>
              <p className="mt-1 text-sm leading-6 text-slate-300">
                Próxima acción por nota, con artefacto y control recomendado.
              </p>
            </div>
            <Badge tone={runQueue[0]?.tone || 'slate'}>
              {runQueue[0]?.stageLabel || 'sin cola'}
            </Badge>
          </div>

          <div className="mt-3 grid gap-2">
            {runQueue.length === 0 ? (
              <p className="rounded-lg bg-white/5 p-3 text-xs leading-5 text-slate-400 ring-1 ring-white/10">
                Crea una corrida desde el cockpit o lanza un preset para poblar la cola operativa.
              </p>
            ) : runQueue.slice(0, 4).map((run) => (
              <article key={`queue-${run.id}`} className="rounded-lg bg-white/5 p-3 ring-1 ring-white/10">
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={run.tone}>{run.stageLabel}</Badge>
                      <Badge tone={run.isActiveTopic ? 'emerald' : 'slate'}>{run.isActiveTopic ? 'activa' : 'otra nota'}</Badge>
                      <span className="font-mono text-xs text-slate-500">{run.artifact}</span>
                    </div>
                    <p className="mt-2 text-sm font-semibold leading-5 text-white">{run.topicTitle}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-400">{run.reason}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{run.time} · {run.summary}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <ActionButton
                      variant="primary"
                      onClick={() => onOperateQueuedRun(run)}
                      aria-label={`Operar corrida priorizada ${run.topicTitle}`}
                    >
                      {run.actionLabel}
                    </ActionButton>
                    <ActionButton
                      variant="quiet"
                      onClick={() => onOpenPackageFile(run.artifact)}
                      aria-label={`Abrir artefacto priorizado ${run.topicTitle}`}
                    >
                      Artefacto
                    </ActionButton>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="mt-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0" aria-label="Última corrida asistida">
            <p className="text-xs font-semibold uppercase tracking-normal text-slate-400">Historial operativo</p>
            {latestRun ? (
              <>
                <p className="mt-2 text-sm font-semibold text-white">{latestRun.summary}</p>
                <p className="mt-1 text-xs leading-5 text-slate-400">{latestRun.time} · Sigue: {latestRun.nextControl}</p>
              </>
            ) : (
              <p className="mt-2 text-sm leading-5 text-slate-400">Sin corridas asistidas para este tema.</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <ActionButton variant="quiet" onClick={() => onOpenPackageFile('note_run.json')} aria-label="Abrir note_run.json activo">NoteRun</ActionButton>
            <ActionButton variant="quiet" onClick={onOpenAudit}>Auditoría</ActionButton>
            <ActionButton variant="quiet" onClick={onOpenPayload}>Payload</ActionButton>
          </div>
        </div>
        </div>
        <div className="mt-3 grid gap-2">
          {visibleRuns.length === 0 && (
            <p className="rounded-lg bg-white/5 p-3 text-xs leading-5 text-slate-400 ring-1 ring-white/10">Ejecuta el comando operativo para registrar corridas con próximos controles y artefactos.</p>
          )}
          {visibleRuns.slice(0, 5).map((run) => {
            const runControlFile = packageFileForRunControl(run.nextControl);

            return (
              <article key={run.id} className="rounded-lg bg-white/5 p-3 ring-1 ring-white/10">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={run.status === 'completo' ? 'emerald' : run.status === 'bloqueado' ? 'rose' : 'blue'}>{run.status}</Badge>
                      <span className="text-xs font-medium text-slate-400">{run.time}</span>
                      <span className="font-mono text-xs text-slate-500">{runControlFile}</span>
                    </div>
                    <p className="mt-2 text-sm font-semibold leading-5 text-white">{run.summary}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-400">Próximo control: {run.nextControl}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <ActionButton
                      variant="quiet"
                      onClick={() => onOpenPackageFile('note_run.json')}
                      aria-label={`Abrir note_run.json de corrida ${run.summary}`}
                    >
                      Run JSON
                    </ActionButton>
                    <ActionButton
                      variant="quiet"
                      onClick={() => onOpenPackageFile(runControlFile)}
                      aria-label={`Abrir control de corrida ${run.summary}`}
                    >
                      Control
                    </ActionButton>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        <div className="mt-5 border-t border-white/10 pt-4" aria-label="Corridas recientes para retomar">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-normal text-slate-400">Corridas recientes</p>
            <span className="rounded-md bg-white/10 px-2 py-1 text-xs font-semibold text-slate-300">{recentRuns.length} runs</span>
          </div>
          <div className="mt-3 grid gap-2">
            {recentRuns.length === 0 && (
              <p className="rounded-lg bg-white/5 p-3 text-xs leading-5 text-slate-400 ring-1 ring-white/10">Todavía no hay corridas recientes para retomar.</p>
            )}
            {recentRuns.slice(0, 6).map((run) => {
              const runControlFile = packageFileForRunControl(run.nextControl);

              return (
                <div key={`recent-${run.id}`} className="rounded-lg bg-white/5 p-3 ring-1 ring-white/10">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={run.isActiveTopic ? 'emerald' : 'slate'}>{run.isActiveTopic ? 'activa' : 'otra nota'}</Badge>
                        <Badge tone={run.status === 'completo' ? 'emerald' : run.status === 'bloqueado' ? 'rose' : 'blue'}>{run.status}</Badge>
                        <span className="font-mono text-xs text-slate-500">{runControlFile}</span>
                      </div>
                      <p className="mt-2 text-sm font-semibold leading-5 text-white">{run.topicTitle}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-400">{run.time} · {run.summary}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-400">Sigue: {run.nextControl}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <ActionButton
                        variant={run.isActiveTopic ? 'quiet' : 'primary'}
                        onClick={() => onResumeRun(run)}
                        aria-label={`Retomar corrida ${run.topicTitle}`}
                      >
                        Retomar
                      </ActionButton>
                      <ActionButton
                        variant="quiet"
                        onClick={() => onOpenPackageFile(runControlFile)}
                        aria-label={`Abrir control reciente ${run.topicTitle}`}
                      >
                        Control
                      </ActionButton>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
