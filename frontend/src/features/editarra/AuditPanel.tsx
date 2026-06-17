import React from 'react';
import { Badge, Button, Modal, Panel, SectionHead, cx, type EditarraTone } from './uiPrimitives';
import type { AuditEvent } from './persistenceModel';
import type { AnalyticsRecord, EvidenceRecord, EvidenceStatus, TrafficSource } from './productionReducer';
import type { Author, Topic } from './workspaceModel';
import OperationalActionCluster from './OperationalActionCluster';

type AuditTone = EditarraTone;

type AuthorPerformance = {
  author: Author;
  visits: number;
  records: number;
  performanceScore: number;
};

type DistributionManifestItem = {
  topic_id: string;
  title: string;
  scheduled_for: string;
  author: string;
  status: string;
  required_action: string;
  channels: Array<{
    channel: string;
    label: string;
    copy: string;
  }>;
};

type DistributionPlanSummary = {
  id: string;
  itemCount: number;
  readyCount: number;
  reviewCount: number;
  blockedCount: number;
  deliverableCount: number;
  content: string;
  manifest: {
    channels: unknown[];
    items: DistributionManifestItem[];
  };
};

type DistributionDeliverable = {
  id: string;
  title: string;
  author: string;
  scheduledFor: string;
  label: string;
  copy: string;
  actionStatus: 'pendiente' | 'copiado' | 'enviado';
};

type AuditView = 'trazabilidad' | 'metricas' | 'evidencia' | 'distribucion';

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

type AuditPanelProps = {
  auditEvents: AuditEvent[];
  totalAnalyticsVisits: number;
  averagePerformanceScore: number;
  selectedTopicAnalytics: AnalyticsRecord[];
  latestTopicAnalytics?: AnalyticsRecord;
  trafficSources: TrafficSource[];
  authorPerformance: AuthorPerformance[];
  selectedTopic: Topic;
  selectedAuthor: Author;
  currentDraftStatus: string;
  qualityStatus: string;
  aiStatus: string;
  requiredEvidenceCount: number;
  selectedTopicEvidence: EvidenceRecord[];
  validatedEvidenceCount: number;
  guidedTopicEvidence: EvidenceRecord[];
  pendingGuidedEvidence: EvidenceRecord[];
  canApproveAudit: boolean;
  auditRequirements: string[];
  evidenceStatuses: EvidenceStatus[];
  evidenceTone: Record<EvidenceStatus, AuditTone>;
  distributionPlan: DistributionPlanSummary;
  distributionDeliverables: DistributionDeliverable[];
  distributionStatus: string;
  onAddAnalyticsRecord: () => void;
  onUpdateAnalyticsRecord: (recordId: string, patch: Partial<AnalyticsRecord>) => void;
  onRemoveAnalyticsRecord: (recordId: string) => void;
  onApplyAnalyticsFeedback: (recordId: string) => void;
  onCompleteGuidedEvidence: () => void;
  onRunLocalAiAndApply: () => void;
  onApplyAiResponse: () => void;
  onApproveAudit: () => void;
  onApproveAuditAndPreparePayload: () => void;
  onPreparePayload: () => void;
  onAddEvidence: () => void;
  onUpdateEvidence: (evidenceId: string, patch: Partial<EvidenceRecord>) => void;
  onValidateEvidence: (evidenceId: string) => void;
  onRemoveEvidence: (evidenceId: string) => void;
  onCopyDistributionDeliverable: (deliverableId: string, label: string, title: string, copy: string) => void;
  onMarkDistributionDelivered: (deliverableId: string, label: string, title: string) => void;
  onRegisterDistributionPlan: () => void;
  onDownloadDistributionPlan: () => void;
};
export default function AuditPanel({
  auditEvents,
  totalAnalyticsVisits,
  averagePerformanceScore,
  selectedTopicAnalytics,
  latestTopicAnalytics,
  trafficSources,
  authorPerformance,
  selectedTopic,
  selectedAuthor,
  currentDraftStatus,
  qualityStatus,
  aiStatus,
  requiredEvidenceCount,
  selectedTopicEvidence,
  validatedEvidenceCount,
  guidedTopicEvidence,
  pendingGuidedEvidence,
  canApproveAudit,
  auditRequirements,
  evidenceStatuses,
  evidenceTone,
  distributionPlan,
  distributionDeliverables,
  distributionStatus,
  onAddAnalyticsRecord,
  onUpdateAnalyticsRecord,
  onRemoveAnalyticsRecord,
  onApplyAnalyticsFeedback,
  onCompleteGuidedEvidence,
  onRunLocalAiAndApply,
  onApplyAiResponse,
  onApproveAudit,
  onApproveAuditAndPreparePayload,
  onPreparePayload,
  onAddEvidence,
  onUpdateEvidence,
  onValidateEvidence,
  onRemoveEvidence,
  onCopyDistributionDeliverable,
  onMarkDistributionDelivered,
  onRegisterDistributionPlan,
  onDownloadDistributionPlan,
}: AuditPanelProps) {
  const [auditView, setAuditView] = React.useState<AuditView>('evidencia');
  const [selectedMetricId, setSelectedMetricId] = React.useState(selectedTopicAnalytics[0]?.id || '');
  const [metricEditorOpen, setMetricEditorOpen] = React.useState(false);
  const [pendingNewMetric, setPendingNewMetric] = React.useState(false);
  const [selectedEvidenceId, setSelectedEvidenceId] = React.useState(selectedTopicEvidence[0]?.id || '');
  const [evidenceEditorOpen, setEvidenceEditorOpen] = React.useState(false);
  const [pendingNewEvidence, setPendingNewEvidence] = React.useState(false);

  React.useEffect(() => {
    scrollWindowTop();
  }, [auditView]);

  React.useEffect(() => {
    if (!selectedTopicAnalytics.some((record) => record.id === selectedMetricId)) {
      setSelectedMetricId(selectedTopicAnalytics[0]?.id || '');
    }
  }, [selectedMetricId, selectedTopicAnalytics]);

  React.useEffect(() => {
    if (!pendingNewMetric || selectedTopicAnalytics.length === 0) {
      return;
    }
    setSelectedMetricId(selectedTopicAnalytics[0].id);
    setMetricEditorOpen(true);
    setPendingNewMetric(false);
  }, [pendingNewMetric, selectedTopicAnalytics]);

  React.useEffect(() => {
    if (!selectedTopicEvidence.some((record) => record.id === selectedEvidenceId)) {
      setSelectedEvidenceId(selectedTopicEvidence[0]?.id || '');
    }
  }, [selectedEvidenceId, selectedTopicEvidence]);

  React.useEffect(() => {
    if (!pendingNewEvidence || selectedTopicEvidence.length === 0) {
      return;
    }
    setSelectedEvidenceId(selectedTopicEvidence[selectedTopicEvidence.length - 1].id);
    setEvidenceEditorOpen(true);
    setPendingNewEvidence(false);
  }, [pendingNewEvidence, selectedTopicEvidence]);

  const selectedMetric = selectedTopicAnalytics.find((record) => record.id === selectedMetricId) || selectedTopicAnalytics[0];
  const selectedEvidence = selectedTopicEvidence.find((record) => record.id === selectedEvidenceId) || selectedTopicEvidence[0];

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="xl:col-span-2">
        <OperationalActionCluster
          topicTitle={selectedTopic.title}
          currentDraftStatus={currentDraftStatus}
          qualityStatus={qualityStatus}
          aiStatus={aiStatus}
          validatedEvidenceCount={validatedEvidenceCount}
          requiredEvidenceCount={requiredEvidenceCount}
          pendingGuidedEvidenceCount={pendingGuidedEvidence.length}
          canApproveAudit={canApproveAudit}
          auditRequirements={auditRequirements}
          onRunLocalAiAndApply={onRunLocalAiAndApply}
          onApplyAiResponse={onApplyAiResponse}
          onCompleteGuidedEvidence={onCompleteGuidedEvidence}
          onApproveAudit={onApproveAudit}
          onApproveAuditAndPreparePayload={onApproveAuditAndPreparePayload}
          onPreparePayload={onPreparePayload}
        />
      </div>

      <div className="xl:col-span-2 flex flex-wrap items-center gap-2 rounded-2xl bg-white p-2 shadow-sm ring-1 ring-slate-200/80">
        {[
          ['evidencia', 'Evidencia'],
          ['trazabilidad', 'Trazabilidad'],
          ['metricas', 'Metricas'],
          ['distribucion', 'Distribucion'],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setAuditView(value as AuditView)}
            className={cx(
              'rounded-lg px-3 py-2 text-sm font-semibold transition',
              auditView === value ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {auditView === 'trazabilidad' && (
        <>
          <Panel>
            <SectionHead
              label="Trazabilidad"
              title="Por que se eligio cada decision"
              body="La auditoria registra senales, reglas aplicadas, cambios de version y bloqueos de calidad."
            />
            <ol className="divide-y divide-slate-200 p-5">
              {auditEvents.map((item) => (
                <li className="grid gap-3 py-4 first:pt-0 last:pb-0 sm:grid-cols-[5rem_minmax(0,1fr)]" key={item.id}>
                  <time className="text-sm font-semibold text-slate-950">{item.time}</time>
                  <div>
                    <strong className="text-sm font-semibold text-slate-950">{item.event}</strong>
                    <p className="mt-1 text-sm leading-6 text-slate-500">{item.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Panel>

          <Panel>
            <SectionHead
              label="Gobernanza"
              title="Riesgos cubiertos"
              body="Bias, privacidad, derechos de autor, desinformacion y trazabilidad de fuentes."
            />
            <div className="flex flex-wrap gap-2 p-5">
              {['Revision humana obligatoria', 'Credenciales fuera de config', 'Historial de versiones', 'Licencia de imagen verificable'].map((risk) => (
                <Badge key={risk} tone="emerald">{risk}</Badge>
              ))}
            </div>
          </Panel>
        </>
      )}

      {auditView === 'metricas' && (
        <Panel className="xl:col-span-2" aria-label="Monitor de metricas">
        <SectionHead
          label="Metricas y aprendizaje"
          title="Rendimiento editorial"
          body="Registra visitas, permanencia, interacciones y criterios de exito para ajustar agenda, tono y distribucion."
        />
        <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            <Badge tone="blue">{totalAnalyticsVisits.toLocaleString('es-AR')} visitas</Badge>
            <Badge tone={averagePerformanceScore >= 75 ? 'emerald' : 'amber'}>Score {averagePerformanceScore}</Badge>
            <Badge tone="slate">{selectedTopicAnalytics.length} registros del tema</Badge>
            {latestTopicAnalytics && <Badge tone="violet">{latestTopicAnalytics.trafficSource}</Badge>}
          </div>
          <Button
            variant="primary"
            onClick={() => {
              setPendingNewMetric(true);
              onAddAnalyticsRecord();
            }}
          >
            Nueva metrica
          </Button>
        </div>

        <div className="grid gap-4 p-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="grid min-w-0 gap-3">
            {selectedTopicAnalytics.length === 0 && (
              <div className="rounded-2xl bg-slate-50 p-5 text-sm font-medium text-slate-600 ring-1 ring-slate-200">
                Sin metricas para este tema.
              </div>
            )}

            {selectedTopicAnalytics.map((record) => (
              <article key={record.id} className="grid min-w-0 gap-4 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200 lg:grid-cols-[minmax(0,1fr)_auto]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-slate-950">{record.period}</h3>
                    <p className="mt-1 break-words text-xs leading-5 text-slate-500">
                      {record.visits.toLocaleString('es-AR')} visitas · {record.averageReadSeconds}s lectura · {record.ctaClicks} CTA
                    </p>
                    <p className="mt-2 line-clamp-2 text-sm leading-5 text-slate-600">{record.successCriteria}</p>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{record.learningNote}</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-start gap-2 lg:justify-end">
                  <Badge tone={record.performanceScore >= 75 ? 'emerald' : record.performanceScore >= 55 ? 'amber' : 'rose'}>
                    score {record.performanceScore}
                  </Badge>
                  <Badge tone="blue">{record.trafficSource}</Badge>
                  <Button
                    onClick={() => {
                      setSelectedMetricId(record.id);
                      setMetricEditorOpen(true);
                    }}
                  >
                    Editar metrica
                  </Button>
                  <Button onClick={() => onApplyAnalyticsFeedback(record.id)}>Aplicar aprendizaje</Button>
                  <Button variant="danger" onClick={() => onRemoveAnalyticsRecord(record.id)}>Eliminar metrica</Button>
                </div>
              </article>
            ))}
          </div>

          <div className="grid gap-4">
            <div className="rounded-2xl bg-slate-950 p-4 text-white">
              <p className="text-xs font-semibold uppercase tracking-normal text-emerald-300">Performance por autor</p>
              <div className="mt-4 grid gap-3">
                {authorPerformance.map(({ author, visits, records, performanceScore }) => (
                  <div key={author.id} className="rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate text-sm font-semibold text-white">{author.name}</span>
                      <span className="text-sm font-semibold text-emerald-300">{performanceScore}</span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-emerald-400" style={{ width: `${performanceScore}%` }} />
                    </div>
                    <p className="mt-2 text-xs leading-5 text-slate-400">{visits.toLocaleString('es-AR')} visitas · {records} registros</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
              <p className="text-xs font-semibold uppercase tracking-normal text-emerald-700">Feedback operativo</p>
              <h3 className="mt-1 text-sm font-semibold text-slate-950">{selectedTopic.title}</h3>
              {latestTopicAnalytics ? (
                <div className="mt-3 grid gap-3 text-sm leading-6 text-slate-600">
                  <p><strong className="text-slate-950">Criterio:</strong> {latestTopicAnalytics.successCriteria}</p>
                  <p><strong className="text-slate-950">Aprendizaje:</strong> {latestTopicAnalytics.learningNote}</p>
                  <p><strong className="text-slate-950">Prioridad actual:</strong> {selectedTopic.priority} · autor {selectedAuthor.score}</p>
                </div>
              ) : (
                <p className="mt-3 text-sm leading-6 text-slate-600">Carga una metrica para activar el feedback hacia agenda y tono.</p>
              )}
            </div>
          </div>
        </div>
        </Panel>
      )}

      {auditView === 'evidencia' && (
        <Panel className="xl:col-span-2" aria-label="Matriz de evidencias">
        <SectionHead
          label="Verificacion"
          title="Matriz de evidencias"
          body="Registra fuentes, afirmaciones y nivel de confianza por tema antes de armar paquete o distribucion."
        />
        <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-950">{selectedTopic.title}</p>
            <p className="mt-1 text-sm leading-5 text-slate-500">El preflight exige al menos una evidencia validada para este tema.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="blue">{selectedTopicEvidence.length} evidencias</Badge>
            <Badge tone={validatedEvidenceCount > 0 ? 'emerald' : 'rose'}>{validatedEvidenceCount} validadas</Badge>
            <Badge tone={guidedTopicEvidence.length > 0 ? 'blue' : 'slate'}>{guidedTopicEvidence.length} guiadas</Badge>
            <Button variant="secondary" onClick={onCompleteGuidedEvidence} disabled={pendingGuidedEvidence.length === 0}>
              Completar y validar guiadas
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setPendingNewEvidence(true);
                onAddEvidence();
              }}
            >
              Nueva evidencia
            </Button>
          </div>
        </div>

        <div className="grid gap-3 p-5">
          {selectedTopicEvidence.length === 0 && (
            <div className="rounded-2xl bg-slate-50 p-5 text-sm font-medium text-slate-600 ring-1 ring-slate-200">
              Sin evidencias para este tema.
            </div>
          )}

          {selectedTopicEvidence.map((record) => (
            <article key={record.id} className="grid min-w-0 gap-4 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200 lg:grid-cols-[minmax(0,1fr)_auto]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-slate-950">{record.sourceName}</h3>
                  <p className="mt-1 break-words text-xs leading-5 text-slate-500">{record.sourceUrl}</p>
                  <p className="mt-2 line-clamp-2 text-sm leading-5 text-slate-600">{record.claim}</p>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{record.notes}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-start gap-2 lg:justify-end">
                <Badge tone={evidenceTone[record.status]}>{record.status}</Badge>
                <Badge tone={record.confidence >= 75 ? 'emerald' : record.confidence >= 50 ? 'amber' : 'rose'}>
                  confianza {record.confidence}
                </Badge>
                <Button
                  onClick={() => {
                    setSelectedEvidenceId(record.id);
                    setEvidenceEditorOpen(true);
                  }}
                >
                  Editar evidencia
                </Button>
                <Button variant="primary" onClick={() => onValidateEvidence(record.id)}>Validar evidencia</Button>
                <Button variant="danger" onClick={() => onRemoveEvidence(record.id)}>Eliminar evidencia</Button>
              </div>
            </article>
          ))}
        </div>
        </Panel>
      )}

      {auditView === 'distribucion' && (
        <Panel className="xl:col-span-2" aria-label="Cola de distribucion">
        <SectionHead
          label="Distribucion"
          title="Cola accionable multicanal"
          body="Convierte el lote editorial en piezas listas para sitio, newsletter, LinkedIn y WhatsApp, con acciones manuales y bloqueos visibles."
        />
        <div className="grid min-w-0 gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
          <div className="grid min-w-0 gap-3">
            <div className="flex min-w-0 flex-wrap gap-2">
              <Badge tone="blue">{distributionPlan.itemCount} piezas</Badge>
              <Badge tone="emerald">{distributionPlan.readyCount} listas</Badge>
              <Badge tone={distributionPlan.reviewCount > 0 ? 'amber' : 'emerald'}>{distributionPlan.reviewCount} en revision</Badge>
              <Badge tone={distributionPlan.blockedCount > 0 ? 'rose' : 'emerald'}>{distributionPlan.blockedCount} bloqueadas</Badge>
              <Badge tone="violet">{distributionPlan.deliverableCount} entregables</Badge>
            </div>

            <div className="grid min-w-0 gap-2">
              {distributionPlan.manifest.items.slice(0, 5).map((item) => (
                <article key={item.topic_id} className="min-w-0 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold text-slate-950">{item.title}</h3>
                      <p className="mt-1 text-xs leading-5 text-slate-500">{item.scheduled_for} · {item.author}</p>
                    </div>
                    <Badge tone={item.status === 'listo' ? 'emerald' : item.status === 'bloqueado' ? 'rose' : 'amber'}>
                      {item.status}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm leading-5 text-slate-600">{item.required_action}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.channels.map((channel) => (
                      <Badge key={`${item.topic_id}-${channel.channel}`} tone="slate">{channel.label}</Badge>
                    ))}
                  </div>
                </article>
              ))}
            </div>

            <div className="min-w-0 overflow-hidden rounded-2xl bg-slate-950 p-4 text-white" aria-label="Bandeja multicanal">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-normal text-emerald-300">Copys accionables</p>
                  <h3 className="mt-1 text-sm font-semibold">Bandeja de salida</h3>
                </div>
                <Badge tone="violet">{distributionDeliverables.length} copys</Badge>
              </div>
              <div className="mt-4 grid min-w-0 gap-3">
                {distributionDeliverables.slice(0, 8).map((deliverable) => (
                  <article key={deliverable.id} className="min-w-0 rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-white">{deliverable.label} · {deliverable.title}</p>
                        <p className="mt-1 text-xs leading-5 text-slate-400">{deliverable.scheduledFor} · {deliverable.author}</p>
                      </div>
                      <span className={cx(
                        'rounded-md px-2 py-1 text-xs font-semibold',
                        deliverable.actionStatus === 'enviado'
                          ? 'bg-emerald-400 text-slate-950'
                          : deliverable.actionStatus === 'copiado'
                            ? 'bg-blue-400 text-slate-950'
                            : 'bg-white/10 text-slate-200',
                      )}>
                        {deliverable.actionStatus}
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-200">{deliverable.copy}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        className="bg-white text-slate-950 hover:bg-slate-100"
                        aria-label={`Copiar ${deliverable.label} ${deliverable.title}`}
                        onClick={() => onCopyDistributionDeliverable(deliverable.id, deliverable.label, deliverable.title, deliverable.copy)}
                      >
                        Copiar
                      </Button>
                      <Button
                        className="bg-emerald-400 text-slate-950 hover:bg-emerald-300"
                        aria-label={`Marcar enviada ${deliverable.label} ${deliverable.title}`}
                        onClick={() => onMarkDistributionDelivered(deliverable.id, deliverable.label, deliverable.title)}
                      >
                        Marcar enviada
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>

          <div className="min-w-0 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-normal text-emerald-700">Plan portable</p>
                <h3 className="mt-1 text-sm font-semibold text-slate-950">{distributionPlan.id}</h3>
              </div>
              <Badge tone="blue">{distributionPlan.manifest.channels.length} canales</Badge>
            </div>
            <pre className="mt-4 max-h-80 min-w-0 max-w-full overflow-auto rounded-2xl bg-slate-950 p-4 text-xs leading-6 text-slate-100 shadow-inner" aria-label="Plan de distribucion JSON">
              {distributionPlan.content}
            </pre>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="primary" onClick={onRegisterDistributionPlan}>Generar cola</Button>
              <Button onClick={onDownloadDistributionPlan}>Descargar plan</Button>
            </div>
            <p className="mt-3 text-sm font-medium text-slate-600" role="status">{distributionStatus}</p>
          </div>
        </div>
        </Panel>
      )}

      {selectedMetric && (
        <Modal
          open={metricEditorOpen}
          onClose={() => setMetricEditorOpen(false)}
          title={selectedMetric.period || 'Metrica editorial'}
          description="Edicion puntual de rendimiento, aprendizaje y criterios de exito."
        >
          <div className="grid gap-4 p-5">
            <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_12rem_14rem]">
              <label className="grid min-w-0 gap-1 text-sm font-medium text-slate-700">
                Periodo
                <input
                  aria-label={`Periodo metrica ${selectedMetric.period}`}
                  value={selectedMetric.period}
                  onChange={(event) => onUpdateAnalyticsRecord(selectedMetric.id, { period: event.target.value })}
                  className="h-10 w-full min-w-0 rounded-lg border-0 bg-slate-50 px-3 text-sm font-semibold text-slate-950 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-emerald-500"
                />
              </label>

              <label className="grid min-w-0 gap-1 text-sm font-medium text-slate-700">
                Fuente
                <select
                  aria-label={`Fuente trafico metrica ${selectedMetric.period}`}
                  value={selectedMetric.trafficSource}
                  onChange={(event) => onUpdateAnalyticsRecord(selectedMetric.id, { trafficSource: event.target.value as TrafficSource })}
                  className="h-10 w-full min-w-0 rounded-lg border-0 bg-slate-50 px-3 text-sm text-slate-950 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-emerald-500"
                >
                  {trafficSources.map((source) => (
                    <option key={source} value={source}>{source}</option>
                  ))}
                </select>
              </label>

              <label className="grid min-w-0 gap-1 text-sm font-medium text-slate-700">
                Score {selectedMetric.performanceScore}
                <input
                  aria-label={`Score metrica ${selectedMetric.period}`}
                  type="range"
                  min={0}
                  max={100}
                  value={selectedMetric.performanceScore}
                  onChange={(event) => onUpdateAnalyticsRecord(selectedMetric.id, { performanceScore: Number(event.target.value) })}
                  className="h-10 w-full min-w-0 accent-emerald-500"
                />
              </label>
            </div>

            <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ['Visitas', 'visits', 'Visitas metrica'],
                ['Lectura seg.', 'averageReadSeconds', 'Lectura metrica'],
                ['CTA', 'ctaClicks', 'CTA metrica'],
                ['Conversion %', 'conversionRate', 'Conversion metrica'],
              ].map(([label, key, ariaPrefix]) => (
                <label className="grid min-w-0 gap-1 text-sm font-medium text-slate-700" key={key}>
                  {label}
                  <input
                    aria-label={`${ariaPrefix} ${selectedMetric.period}`}
                    type="number"
                    min={0}
                    step={key === 'conversionRate' ? 0.01 : undefined}
                    value={selectedMetric[key as keyof Pick<AnalyticsRecord, 'visits' | 'averageReadSeconds' | 'ctaClicks' | 'conversionRate'>]}
                    onChange={(event) => onUpdateAnalyticsRecord(selectedMetric.id, { [key]: Number(event.target.value) } as Partial<AnalyticsRecord>)}
                    className="h-10 w-full min-w-0 rounded-lg border-0 bg-slate-50 px-3 text-sm text-slate-950 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-emerald-500"
                  />
                </label>
              ))}
            </div>

            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              {[
                ['Compartidos', 'shares', 'Compartidos metrica'],
                ['Comentarios', 'comments', 'Comentarios metrica'],
              ].map(([label, key, ariaPrefix]) => (
                <label className="grid min-w-0 gap-1 text-sm font-medium text-slate-700" key={key}>
                  {label}
                  <input
                    aria-label={`${ariaPrefix} ${selectedMetric.period}`}
                    type="number"
                    min={0}
                    value={selectedMetric[key as keyof Pick<AnalyticsRecord, 'shares' | 'comments'>]}
                    onChange={(event) => onUpdateAnalyticsRecord(selectedMetric.id, { [key]: Number(event.target.value) } as Partial<AnalyticsRecord>)}
                    className="h-10 w-full min-w-0 rounded-lg border-0 bg-slate-50 px-3 text-sm text-slate-950 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-emerald-500"
                  />
                </label>
              ))}
            </div>

            <label className="grid min-w-0 gap-1 text-sm font-medium text-slate-700">
              Criterios de exito
              <textarea
                aria-label={`Criterios metrica ${selectedMetric.period}`}
                value={selectedMetric.successCriteria}
                rows={3}
                onChange={(event) => onUpdateAnalyticsRecord(selectedMetric.id, { successCriteria: event.target.value })}
                className="w-full min-w-0 rounded-lg border-0 bg-slate-50 px-3 py-2 text-sm leading-5 text-slate-950 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-emerald-500"
              />
            </label>

            <label className="grid min-w-0 gap-1 text-sm font-medium text-slate-700">
              Aprendizaje
              <textarea
                aria-label={`Aprendizaje metrica ${selectedMetric.period}`}
                value={selectedMetric.learningNote}
                rows={3}
                onChange={(event) => onUpdateAnalyticsRecord(selectedMetric.id, { learningNote: event.target.value })}
                className="w-full min-w-0 rounded-lg border-0 bg-slate-50 px-3 py-2 text-sm leading-5 text-slate-950 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-emerald-500"
              />
            </label>

            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => onApplyAnalyticsFeedback(selectedMetric.id)}>Aplicar aprendizaje</Button>
              <Button variant="danger" onClick={() => onRemoveAnalyticsRecord(selectedMetric.id)}>Eliminar metrica</Button>
            </div>
          </div>
        </Modal>
      )}

      {selectedEvidence && (
        <Modal
          open={evidenceEditorOpen}
          onClose={() => setEvidenceEditorOpen(false)}
          title={selectedEvidence.sourceName || 'Evidencia'}
          description="Edicion puntual de fuente, afirmacion, estado y confianza."
        >
          <div className="grid gap-4 p-5">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_9rem]">
              <label className="grid min-w-0 gap-1 text-sm font-medium text-slate-700">
                Fuente
                <input
                  aria-label={`Fuente evidencia ${selectedEvidence.sourceName}`}
                  value={selectedEvidence.sourceName}
                  onChange={(event) => onUpdateEvidence(selectedEvidence.id, { sourceName: event.target.value })}
                  className="h-10 w-full min-w-0 rounded-lg border-0 bg-slate-50 px-3 text-sm font-semibold text-slate-950 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-emerald-500"
                />
              </label>

              <label className="grid min-w-0 gap-1 text-sm font-medium text-slate-700">
                URL o archivo
                <input
                  aria-label={`URL evidencia ${selectedEvidence.sourceName}`}
                  value={selectedEvidence.sourceUrl}
                  onChange={(event) => onUpdateEvidence(selectedEvidence.id, { sourceUrl: event.target.value })}
                  className="h-10 w-full min-w-0 rounded-lg border-0 bg-slate-50 px-3 text-sm text-slate-950 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-emerald-500"
                />
              </label>

              <label className="grid min-w-0 gap-1 text-sm font-medium text-slate-700">
                Estado
                <select
                  aria-label={`Estado evidencia ${selectedEvidence.sourceName}`}
                  value={selectedEvidence.status}
                  onChange={(event) => onUpdateEvidence(selectedEvidence.id, { status: event.target.value as EvidenceStatus })}
                  className="h-10 w-full min-w-0 rounded-lg border-0 bg-slate-50 px-3 text-sm text-slate-950 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-emerald-500"
                >
                  {evidenceStatuses.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </label>
            </div>

            <label className="grid min-w-0 gap-1 text-sm font-medium text-slate-700">
              Afirmacion
              <textarea
                aria-label={`Afirmacion evidencia ${selectedEvidence.sourceName}`}
                value={selectedEvidence.claim}
                rows={4}
                onChange={(event) => onUpdateEvidence(selectedEvidence.id, { claim: event.target.value })}
                className="w-full min-w-0 rounded-lg border-0 bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-950 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-emerald-500"
              />
            </label>

            <div className="grid gap-3 lg:grid-cols-[12rem_minmax(0,1fr)]">
              <label className="grid min-w-0 gap-1 text-sm font-medium text-slate-700">
                Confianza {selectedEvidence.confidence}
                <input
                  aria-label={`Confianza evidencia ${selectedEvidence.sourceName}`}
                  type="range"
                  min={0}
                  max={100}
                  value={selectedEvidence.confidence}
                  onChange={(event) => onUpdateEvidence(selectedEvidence.id, { confidence: Number(event.target.value) })}
                  className="h-10 w-full min-w-0 accent-emerald-500"
                />
              </label>

              <label className="grid min-w-0 gap-1 text-sm font-medium text-slate-700">
                Notas
                <textarea
                  aria-label={`Notas evidencia ${selectedEvidence.sourceName}`}
                  value={selectedEvidence.notes}
                  rows={3}
                  onChange={(event) => onUpdateEvidence(selectedEvidence.id, { notes: event.target.value })}
                  className="w-full min-w-0 rounded-lg border-0 bg-slate-50 px-3 py-2 text-sm leading-5 text-slate-950 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-emerald-500"
                />
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => onValidateEvidence(selectedEvidence.id)}>Validar evidencia</Button>
              <Button variant="danger" onClick={() => onRemoveEvidence(selectedEvidence.id)}>Eliminar evidencia</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
