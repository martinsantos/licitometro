import React from 'react';
import { Badge, Button, Panel, SectionHead, cx, type EditarraTone } from './uiPrimitives';

type OperationStatus = 'listo' | 'activo' | 'bloqueado' | 'pendiente';

export type OperationFlowStage = {
  id: string;
  label: string;
  status: OperationStatus;
  tone: EditarraTone;
  detail: string;
  control: string;
  metric: string;
  actionLabel: string;
  onAction: () => void;
};

export type OperationCandidateSummary = {
  id: string;
  title: string;
  score: number;
  status: string;
  sourceName: string;
  trope: string;
};

export type OperationTopicSummary = {
  id: string;
  title: string;
  status: string;
  author: string;
};

type OperationFlowPanelProps = {
  progress: number;
  nextControl: string;
  pipelineStatus: string;
  selectedAgendaName: string;
  selectedDestination: string;
  selectedTopicTitle: string;
  selectedTopicStatus: string;
  selectedAuthorName: string;
  selectedRecipeLabel: string;
  draftStatus: string;
  qualityStatus: string;
  imageStatus: string;
  publicationStatus: string;
  candidateCount: number;
  topicCount: number;
  validatedEvidenceCount: number;
  requiredEvidenceCount: number;
  preflightBlockers: number;
  preflightWarnings: number;
  blockers: string[];
  stages: OperationFlowStage[];
  candidates: OperationCandidateSummary[];
  topics: OperationTopicSummary[];
  onRunPrimary: () => void;
  onRunDiscovery: () => void;
  onOpenRadar: () => void;
  onOpenCandidates: () => void;
  onOpenParrilla: () => void;
  onOpenEditor: () => void;
  onOpenDraft: () => void;
  onOpenAudit: () => void;
  onOpenImages: () => void;
  onOpenPublication: () => void;
  onOpenConfig: () => void;
};

const statusLabels: Record<OperationStatus, string> = {
  listo: 'listo',
  activo: 'activo',
  bloqueado: 'bloqueado',
  pendiente: 'pendiente',
};

export default function OperationFlowPanel({
  progress,
  nextControl,
  pipelineStatus,
  selectedAgendaName,
  selectedDestination,
  selectedTopicTitle,
  selectedTopicStatus,
  selectedAuthorName,
  selectedRecipeLabel,
  draftStatus,
  qualityStatus,
  imageStatus,
  publicationStatus,
  candidateCount,
  topicCount,
  validatedEvidenceCount,
  requiredEvidenceCount,
  preflightBlockers,
  preflightWarnings,
  blockers,
  stages,
  candidates,
  topics,
  onRunPrimary,
  onRunDiscovery,
  onOpenRadar,
  onOpenCandidates,
  onOpenParrilla,
  onOpenEditor,
  onOpenDraft,
  onOpenAudit,
  onOpenImages,
  onOpenPublication,
  onOpenConfig,
}: OperationFlowPanelProps) {
  const primaryLabel = pipelineStatus === 'listo' ? 'Ver preview publicable' : nextControl;

  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <Panel className="xl:col-span-2 overflow-hidden" aria-label="Modo Operacion EDITARRA">
        <SectionHead
          label="Operacion"
          title="Flujo guiado de nota"
          body="Trabaja de Radar a publicacion desde una sola superficie. Los modulos avanzados siguen disponibles, pero el camino principal queda ordenado por pasos."
        />
        <div className="grid items-start gap-4 p-5 xl:grid-cols-[minmax(0,1fr)_28rem]">
          <div className="rounded-2xl bg-slate-950 p-5 text-white shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-normal text-emerald-300">Siguiente control</p>
                <h3 className="mt-2 text-2xl font-semibold tracking-normal">{primaryLabel}</h3>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">{selectedTopicTitle}</p>
              </div>
              <Badge tone={pipelineStatus === 'listo' ? 'emerald' : pipelineStatus === 'bloqueado' ? 'rose' : 'blue'}>
                {pipelineStatus}
              </Badge>
            </div>

            <div className="mt-5">
              <div className="flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-normal text-slate-400">
                <span>avance editorial</span>
                <span>{progress}%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-emerald-400" style={{ width: `${progress}%` }} />
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <Button className="bg-emerald-400 text-slate-950 hover:bg-emerald-300" onClick={onRunPrimary}>
                {primaryLabel}
              </Button>
              <Button className="bg-white text-slate-950 hover:bg-slate-100" onClick={onRunDiscovery}>
                Buscar temas
              </Button>
              <Button className="bg-white/10 text-white ring-1 ring-inset ring-white/15 hover:bg-white/15" onClick={onOpenPublication}>
                Preview
              </Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {([
              ['Agenda', selectedAgendaName, selectedDestination, 'emerald' as EditarraTone],
              ['Nota activa', selectedTopicStatus, selectedAuthorName, 'blue' as EditarraTone],
              ['Receta', selectedRecipeLabel, draftStatus, 'violet' as EditarraTone],
              ['Preflight', `${preflightBlockers} bloqueos`, `${preflightWarnings} avisos`, preflightBlockers > 0 ? 'rose' as EditarraTone : 'emerald' as EditarraTone],
            ] as Array<[string, string, string, EditarraTone]>).map(([label, value, detail, tone]) => (
              <div key={label} className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">{label}</p>
                <p className="mt-1 text-lg font-semibold text-slate-950">{value}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge tone={tone}>{detail}</Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Panel>

      <Panel className="xl:col-span-2 overflow-hidden" aria-label="Pasos del flujo operativo">
        <SectionHead
          label="Workflow"
          title="Pasos operativos"
          body="Cada paso tiene una accion concreta. Si algo bloquea la nota, aparece aca antes de que el operador pierda tiempo."
        />
        <div className="grid gap-3 p-5 lg:grid-cols-3 2xl:grid-cols-6">
          {stages.map((stage, index) => (
            <article
              key={stage.id}
              className={cx(
                'grid min-h-48 gap-3 rounded-2xl p-4 ring-1',
                stage.status === 'activo'
                  ? 'bg-white ring-emerald-300 shadow-sm'
                  : stage.status === 'bloqueado'
                    ? 'bg-rose-50 ring-rose-200'
                    : 'bg-slate-50 ring-slate-200',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">{String(index + 1).padStart(2, '0')}</p>
                  <h3 className="mt-1 text-sm font-semibold text-slate-950">{stage.label}</h3>
                </div>
                <Badge tone={stage.tone}>{statusLabels[stage.status]}</Badge>
              </div>
              <p className="text-sm leading-5 text-slate-600">{stage.detail}</p>
              <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">{stage.metric}</p>
              <Button className="mt-auto w-full" variant={stage.status === 'activo' ? 'primary' : 'secondary'} onClick={stage.onAction}>
                {stage.actionLabel}
              </Button>
            </article>
          ))}
        </div>
      </Panel>

      <Panel className="overflow-hidden">
        <SectionHead
          label="Cola"
          title="Temas y candidatos"
          body="La operacion diaria empieza buscando, seleccionando y convirtiendo candidatos."
        />
        <div className="grid gap-4 p-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <button type="button" onClick={onOpenRadar} className="rounded-2xl bg-slate-50 p-4 text-left ring-1 ring-slate-200 transition hover:bg-white hover:ring-emerald-300">
              <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">Radar</p>
              <p className="mt-1 text-2xl font-semibold text-slate-950">{candidateCount}</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">candidatos</p>
            </button>
            <button type="button" onClick={onOpenParrilla} className="rounded-2xl bg-slate-50 p-4 text-left ring-1 ring-slate-200 transition hover:bg-white hover:ring-emerald-300">
              <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">Parrilla</p>
              <p className="mt-1 text-2xl font-semibold text-slate-950">{topicCount}</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">temas</p>
            </button>
            <button type="button" onClick={onOpenAudit} className="rounded-2xl bg-slate-50 p-4 text-left ring-1 ring-slate-200 transition hover:bg-white hover:ring-emerald-300">
              <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">Fuentes</p>
              <p className="mt-1 text-2xl font-semibold text-slate-950">{validatedEvidenceCount}/{requiredEvidenceCount}</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">validadas</p>
            </button>
          </div>

          <div className="grid gap-2">
            {candidates.slice(0, 4).map((candidate) => (
              <article key={candidate.id} className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="blue">{candidate.score}</Badge>
                  <Badge tone="slate">{candidate.status}</Badge>
                  <Badge tone="violet">{candidate.trope || 'sin tropo'}</Badge>
                </div>
                <p className="mt-2 line-clamp-2 text-sm font-semibold leading-5 text-slate-950">{candidate.title}</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">{candidate.sourceName}</p>
              </article>
            ))}
            {candidates.length === 0 && (
              <div className="rounded-xl bg-slate-50 p-4 text-sm font-medium text-slate-600 ring-1 ring-slate-200">
                Sin candidatos visibles. Ejecuta Radar o revisa filtros.
              </div>
            )}
          </div>

          <Button variant="primary" onClick={onOpenCandidates}>Revisar candidatos</Button>
        </div>
      </Panel>

      <Panel className="overflow-hidden">
        <SectionHead
          label="Nota"
          title="Estado publicable"
          body="Resumen de lo que falta para pasar de borrador a preview y export."
        />
        <div className="grid gap-4 p-5">
          <div className="grid gap-3">
            {topics.slice(0, 5).map((topic) => (
              <article key={topic.id} className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="line-clamp-2 text-sm font-semibold leading-5 text-slate-950">{topic.title}</p>
                  <Badge tone={topic.status === 'publicado' ? 'emerald' : topic.status === 'redaccion' ? 'violet' : topic.status === 'aprobado' ? 'blue' : 'amber'}>
                    {topic.status}
                  </Badge>
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-500">{topic.author}</p>
              </article>
            ))}
          </div>

          <div className="grid gap-2 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
            {[
              ['Borrador', draftStatus],
              ['Calidad', qualityStatus],
              ['Imagen', imageStatus],
              ['Publicacion', publicationStatus],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-3 border-b border-slate-200 py-2 last:border-b-0">
                <span className="text-sm font-medium text-slate-600">{label}</span>
                <span className="text-right text-sm font-semibold text-slate-950">{value}</span>
              </div>
            ))}
          </div>

          {blockers.length > 0 && (
            <div className="rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
              <p className="text-xs font-semibold uppercase tracking-normal text-amber-800">Bloqueos activos</p>
              <ul className="mt-2 grid gap-1 text-sm leading-5 text-amber-900">
                {blockers.map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            <Button onClick={onOpenEditor}>Comando</Button>
            <Button onClick={onOpenDraft}>Borrador</Button>
            <Button onClick={onOpenImages}>Imagen</Button>
            <Button onClick={onOpenPublication}>Publicacion</Button>
            <Button className="sm:col-span-2" onClick={onOpenConfig}>Paquete JSON</Button>
          </div>
        </div>
      </Panel>
    </div>
  );
}
