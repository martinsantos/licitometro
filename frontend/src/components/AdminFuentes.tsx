import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

interface ScraperConfig {
  id: string;
  name: string;
  url: string;
  active: boolean;
  schedule: string;
  source_type: string;
  last_run: string | null;
  runs_count: number;
  scope?: string | null;
  ai_backfill?: {
    min_ai_coverage?: number;
    limit_per_source?: number;
    disabled?: boolean;
  } | null;
}

interface SourceHealth {
  name: string;
  active: boolean;
  schedule: string;
  url: string;
  last_run: string | null;
  last_run_status: string | null;
  last_run_duration: number | null;
  last_run_items_found: number;
  last_run_items_saved: number;
  recent_errors: number;
  total_records: number;
  total_runs: number;
  source_quality?: {
    score: number;
    items_evaluated: number;
    document_coverage: number;
    direct_url_coverage: number;
    low_confidence_count: number;
    missing_core_counts?: Record<string, number>;
    missing_valuable_counts?: Record<string, number>;
  } | null;
  source_evidence?: {
    contract?: string;
    items_evaluated: number;
    items_with_evidence: number;
    evidence_count: number;
    evidence_coverage: number;
    evidence_kind_counts?: Record<string, number>;
    native_result_count?: number;
    legacy_wrapped_count?: number;
  } | null;
  readiness?: {
    records_evaluated: number;
    ai_extracted: number;
    snapshots: number;
    ready: number;
    blocked: number;
    missing_documents: number;
    red_flags: number;
    ai_coverage: number;
    snapshot_coverage: number;
  } | null;
}

interface QualityTrendPoint {
  run_id: string;
  started_at: string | null;
  status: string;
  items_found: number;
  score?: number;
  document_coverage?: number;
  direct_url_coverage?: number;
  low_confidence_count?: number;
}

interface ReadinessTrendPoint {
  updated_at: string | null;
  status: string;
  score?: number;
  priority_score?: number;
  missing_documents?: number;
  red_flags?: number;
}

interface SourceReadinessHistoryPoint {
  created_at: string | null;
  day?: string;
  total_records: number;
  ai_coverage: number;
  snapshot_coverage: number;
  ready: number;
  blocked: number;
  missing_documents: number;
  red_flags: number;
}

interface BackfillResult {
  ok: boolean;
  processed: number;
  selected_ids?: string[];
  candidates?: {
    total_candidates: number;
    sources: Array<{
      name: string;
      ai_coverage: number;
      min_ai_coverage?: number;
      candidate_count: number;
    }>;
  };
  batch?: {
    succeeded: number;
    failed: number;
    readiness?: {
      snapshots: number;
      failed: number;
    };
  } | null;
  message?: string;
}

interface BackfillCandidates {
  total_candidates: number;
  sources: Array<{
    name: string;
    ai_coverage: number;
    min_ai_coverage?: number;
    snapshot_coverage: number;
    candidate_count: number;
    candidates: Array<{
      id: string;
      id_licitacion?: string;
      title?: string;
      fecha_apertura?: string | null;
      budget?: number | null;
      remediation_score?: number;
    }>;
  }>;
}

interface BackfillRun {
  id: string;
  source_name?: string | null;
  processed: number;
  succeeded: number;
  failed: number;
  selected_count: number;
  total_candidates: number;
  readiness_snapshots: number;
  failure_diagnostics?: {
    failed_count?: number;
    categories?: Record<string, number>;
  };
  created_at: string | null;
}

interface SourceRemediationItem {
  source_name: string;
  ai_coverage: number;
  min_ai_coverage: number;
  coverage_gap: number;
  candidate_count: number;
  top_candidate_score: number;
  recent_processed: number;
  recent_failed: number;
  recent_success_rate?: number | null;
  remediation_score: number;
}

interface BackfillFailureDiagnostics {
  runs_evaluated: number;
  categories: Record<string, number>;
  repair_hints?: Record<string, string>;
  sources: Array<{
    source_name: string;
    failed: number;
    categories: Record<string, number>;
  }>;
}

interface InputQualityRepairItem {
  id: string;
  id_licitacion?: string;
  source_name: string;
  title?: string;
  error?: string;
  occurrences: number;
  age_hours?: number;
  rerun_count?: number;
  last_rerun_status?: string | null;
  status: string;
  owner?: string;
  notes?: string;
  last_seen_at?: string | null;
}

interface InputQualitySourceSummary {
  source_name: string;
  open_items: number;
  occurrences: number;
  max_age_hours: number;
  avg_age_hours: number;
}

interface RetryAnalytics {
  totals: {
    runs: number;
    processed: number;
    succeeded: number;
    failed: number;
    success_rate?: number | null;
  };
  by_category: Array<{
    category: string;
    processed: number;
    succeeded: number;
    failed: number;
    success_rate?: number | null;
  }>;
}

interface RetryAlertSettings {
  min_success_rate: number;
  max_rate_limit_share: number;
  disabled: boolean;
}

interface OperatorAlertEvent {
  id: string;
  event_type: string;
  delivered: boolean;
  processed: number;
  success_rate?: number | null;
  rate_limit_share?: number | null;
  created_at: string | null;
}

interface EditForm {
  name: string;
  url: string;
  schedule: string;
  source_type: string;
  active: boolean;
}

const SCHEDULE_PRESETS = [
  { label: 'Cada hora', value: '0 * * * *' },
  { label: 'Cada 6 horas', value: '0 */6 * * *' },
  { label: 'Cada 12 horas', value: '0 */12 * * *' },
  { label: 'Diario 8am', value: '0 8 * * *' },
  { label: 'Diario 8am y 20pm', value: '0 8,20 * * *' },
  { label: 'Lunes a viernes 8am', value: '0 8 * * 1-5' },
  { label: 'Semanal (lunes)', value: '0 8 * * 1' },
];

function describeCron(cron: string): string {
  const presetMatch = SCHEDULE_PRESETS.find(p => p.value === cron);
  if (presetMatch) return presetMatch.label;
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return cron;
  const [min, hour, , , dow] = parts;
  const dowNames: Record<string, string> = { '0': 'dom', '1': 'lun', '2': 'mar', '3': 'mie', '4': 'jue', '5': 'vie', '6': 'sab' };
  let desc = '';
  if (hour === '*') { desc = `Cada hora, min ${min}`; }
  else if (hour.includes('/')) { desc = `Cada ${hour.split('/')[1]}h`; }
  else if (hour.includes(',')) { desc = `A las ${hour.replace(/,/g, 'h, ')}h`; }
  else { desc = `A las ${hour}:${min.padStart(2, '0')}`; }
  if (dow === '1-5') desc += ' (L-V)';
  else if (dow !== '*') {
    const dayLabels = dow.split(',').map(d => dowNames[d] || d).join(', ');
    desc += ` (${dayLabels})`;
  }
  return desc;
}

function qualityColor(score?: number): string {
  if (score === undefined || score === null) return 'bg-gray-100 text-gray-500';
  if (score >= 80) return 'bg-emerald-100 text-emerald-700';
  if (score >= 60) return 'bg-amber-100 text-amber-700';
  return 'bg-red-100 text-red-700';
}

function pct(value?: number): string {
  if (value === undefined || value === null) return '-';
  return `${Math.round(value * 100)}%`;
}

const AdminFuentes = ({ apiUrl }: { apiUrl: string }) => {
  const [configs, setConfigs] = useState<ScraperConfig[]>([]);
  const [health, setHealth] = useState<Record<string, SourceHealth>>({});
  const [qualityTrends, setQualityTrends] = useState<Record<string, QualityTrendPoint[]>>({});
  const [readinessTrends, setReadinessTrends] = useState<Record<string, ReadinessTrendPoint[]>>({});
  const [readinessHistory, setReadinessHistory] = useState<Record<string, SourceReadinessHistoryPoint[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ name: '', url: '', schedule: '', source_type: '', active: true });
  const [triggeringName, setTriggeringName] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [backfillRunning, setBackfillRunning] = useState<string | null>(null);
  const [backfillResult, setBackfillResult] = useState<BackfillResult | null>(null);
  const [backfillCandidates, setBackfillCandidates] = useState<BackfillCandidates | null>(null);
  const [backfillRuns, setBackfillRuns] = useState<BackfillRun[]>([]);
  const [remediationLeaderboard, setRemediationLeaderboard] = useState<SourceRemediationItem[]>([]);
  const [failureDiagnostics, setFailureDiagnostics] = useState<BackfillFailureDiagnostics | null>(null);
  const [inputQualityQueue, setInputQualityQueue] = useState<InputQualityRepairItem[]>([]);
  const [inputQualitySources, setInputQualitySources] = useState<InputQualitySourceSummary[]>([]);
  const [retryAnalytics, setRetryAnalytics] = useState<RetryAnalytics | null>(null);
  const [retryAlertSettings, setRetryAlertSettings] = useState<RetryAlertSettings | null>(null);
  const [operatorAlerts, setOperatorAlerts] = useState<OperatorAlertEvent[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [savingBackfillSettings, setSavingBackfillSettings] = useState<string | null>(null);
  const [savingRetryAlertSettings, setSavingRetryAlertSettings] = useState(false);
  const [savingInputQualityId, setSavingInputQualityId] = useState<string | null>(null);
  const [rerunningInputQualityId, setRerunningInputQualityId] = useState<string | null>(null);
  const [retryingFailures, setRetryingFailures] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [configsRes, healthRes, trendsRes, readinessTrendsRes, readinessHistoryRes, backfillRunsRes, leaderboardRes, diagnosticsRes, inputQualityRes, retryAnalyticsRes, retryAlertSettingsRes, operatorAlertsRes] = await Promise.all([
        axios.get('/api/scraper-configs/?exclude_scope=ar_nacional'),
        axios.get('/api/scheduler/source-health').catch(() => ({ data: { sources: [] } })),
        axios.get('/api/scheduler/source-quality-trends?limit=5').catch(() => ({ data: { sources: {} } })),
        axios.get('/api/scheduler/source-readiness-trends?limit=5').catch(() => ({ data: { sources: {} } })),
        axios.get('/api/scheduler/source-readiness-history?limit=30').catch(() => ({ data: { sources: {} } })),
        axios.get('/api/scheduler/source-readiness-backfill-runs?limit=5').catch(() => ({ data: { items: [] } })),
        axios.get('/api/scheduler/source-remediation-leaderboard?min_ai_coverage=0.85&limit_per_source=5').catch(() => ({ data: { items: [] } })),
        axios.get('/api/scheduler/source-backfill-failure-diagnostics?limit=50').catch(() => ({ data: null })),
        axios.get('/api/scheduler/input-quality-repair-queue?status=open&limit=20').catch(() => ({ data: { items: [] } })),
        axios.get('/api/scheduler/source-backfill-retry-analytics?limit=50').catch(() => ({ data: null })),
        axios.get('/api/scheduler/source-backfill-retry-alert-settings').catch(() => ({ data: null })),
        axios.get('/api/scheduler/operator-alert-events?event_type=ai_backfill_retry_digest&limit=5').catch(() => ({ data: { items: [] } })),
      ]);
      setConfigs(configsRes.data);

      const healthMap: Record<string, SourceHealth> = {};
      for (const s of healthRes.data.sources) {
        healthMap[s.name] = s;
      }
      setHealth(healthMap);
      setQualityTrends(trendsRes.data.sources || {});
      setReadinessTrends(readinessTrendsRes.data.sources || {});
      setReadinessHistory(readinessHistoryRes.data.sources || {});
      setBackfillRuns(backfillRunsRes.data.items || []);
      setRemediationLeaderboard(leaderboardRes.data.items || []);
      setFailureDiagnostics(diagnosticsRes.data || null);
      setInputQualityQueue(inputQualityRes.data.items || []);
      setInputQualitySources(inputQualityRes.data.by_source || []);
      setRetryAnalytics(retryAnalyticsRes.data || null);
      setRetryAlertSettings(retryAlertSettingsRes.data || null);
      setOperatorAlerts(operatorAlertsRes.data.items || []);
      setError(null);
    } catch (err: any) {
      setError('Error al cargar fuentes: ' + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleToggle = async (configId: string) => {
    try {
      await axios.post(`/api/scraper-configs/${configId}/toggle`);
      fetchData();
    } catch (err: any) {
      setError('Error al cambiar estado: ' + (err.response?.data?.detail || err.message));
    }
  };

  const startEditing = (config: ScraperConfig) => {
    setEditingId(config.id);
    setEditForm({
      name: config.name,
      url: String(config.url),
      schedule: config.schedule,
      source_type: config.source_type,
      active: config.active,
    });
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    try {
      const updateData: Record<string, any> = {};
      const original = configs.find(c => c.id === editingId);
      if (!original) return;

      if (editForm.name !== original.name) updateData.name = editForm.name;
      if (editForm.url !== String(original.url)) updateData.url = editForm.url;
      if (editForm.schedule !== original.schedule) updateData.schedule = editForm.schedule;
      if (editForm.source_type !== original.source_type) updateData.source_type = editForm.source_type;
      if (editForm.active !== original.active) updateData.active = editForm.active;

      if (Object.keys(updateData).length === 0) {
        setEditingId(null);
        return;
      }

      await axios.put(`/api/scraper-configs/${editingId}`, updateData);
      setEditingId(null);
      fetchData();
    } catch (err: any) {
      setError('Error al guardar: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleDelete = async (configId: string) => {
    try {
      setDeletingId(configId);
      await axios.delete(`/api/scraper-configs/${configId}`);
      setConfirmDelete(null);
      fetchData();
    } catch (err: any) {
      setError('Error al eliminar: ' + (err.response?.data?.detail || err.message));
    } finally {
      setDeletingId(null);
    }
  };

  const handleTriggerNow = async (scraperName: string) => {
    try {
      setTriggeringName(scraperName);
      await axios.post(`/api/scheduler/trigger/${scraperName}`);
      setTimeout(fetchData, 3000);
    } catch (err: any) {
      setError('Error al ejecutar: ' + (err.response?.data?.detail || err.message));
    } finally {
      setTimeout(() => setTriggeringName(null), 3000);
    }
  };

  const handleBackfillAI = async (sourceName?: string) => {
    const runKey = sourceName || '__all__';
    try {
      setBackfillRunning(runKey);
      setBackfillResult(null);
      const res = await axios.post('/api/scheduler/source-readiness-backfill', null, {
        params: {
          source_name: sourceName,
          min_ai_coverage: 0.85,
          limit_per_source: sourceName ? 5 : 3,
          max_total: sourceName ? 5 : 10,
        },
      });
      setBackfillResult(res.data);
      fetchData();
    } catch (err: any) {
      setError('Error en backfill AI 0.2: ' + (err.response?.data?.detail || err.message));
    } finally {
      setBackfillRunning(null);
    }
  };

  const handlePreviewBackfill = async () => {
    try {
      setLoadingCandidates(true);
      const res = await axios.get('/api/scheduler/source-readiness-backfill-candidates', {
        params: {
          min_ai_coverage: 0.85,
          limit_per_source: 5,
        },
      });
      setBackfillCandidates(res.data);
    } catch (err: any) {
      setError('Error al cargar candidatas AI 0.2: ' + (err.response?.data?.detail || err.message));
    } finally {
      setLoadingCandidates(false);
    }
  };

  const handleBackfillSettings = async (
    config: ScraperConfig,
    patch: { min_ai_coverage?: number; limit_per_source?: number; disabled?: boolean }
  ) => {
    try {
      setSavingBackfillSettings(config.name);
      const current = config.ai_backfill || {};
      await axios.put('/api/scheduler/source-readiness-backfill-settings', {
        min_ai_coverage: patch.min_ai_coverage ?? current.min_ai_coverage ?? 0.85,
        limit_per_source: patch.limit_per_source ?? current.limit_per_source ?? 3,
        disabled: patch.disabled ?? current.disabled ?? false,
      }, {
        params: { source_name: config.name },
      });
      fetchData();
    } catch (err: any) {
      setError('Error al guardar umbral AI 0.2: ' + (err.response?.data?.detail || err.message));
    } finally {
      setSavingBackfillSettings(null);
    }
  };

  const handleRetryFailures = async () => {
    try {
      setRetryingFailures(true);
      const res = await axios.post('/api/scheduler/source-backfill-retry-failures', null, {
        params: { limit: 10, retry_window_hours: 6 },
      });
      setBackfillResult(res.data);
      fetchData();
    } catch (err: any) {
      setError('Error al reintentar fallas AI 0.2: ' + (err.response?.data?.detail || err.message));
    } finally {
      setRetryingFailures(false);
    }
  };

  const handleRetryAlertSettings = async (patch: Partial<RetryAlertSettings>) => {
    const current = retryAlertSettings || {
      min_success_rate: 0.5,
      max_rate_limit_share: 0.5,
      disabled: false,
    };
    try {
      setSavingRetryAlertSettings(true);
      const res = await axios.put('/api/scheduler/source-backfill-retry-alert-settings', {
        min_success_rate: patch.min_success_rate ?? current.min_success_rate,
        max_rate_limit_share: patch.max_rate_limit_share ?? current.max_rate_limit_share,
        disabled: patch.disabled ?? current.disabled,
      });
      setRetryAlertSettings(res.data);
    } catch (err: any) {
      setError('Error al guardar alertas de retry AI 0.2: ' + (err.response?.data?.detail || err.message));
    } finally {
      setSavingRetryAlertSettings(false);
    }
  };

  const handleInputQualityAction = async (item: InputQualityRepairItem, status: string) => {
    try {
      setSavingInputQualityId(item.id);
      await axios.put(`/api/scheduler/input-quality-repair-queue/${item.id}`, {
        status,
        owner: item.owner || '',
        notes: item.notes || '',
      });
      fetchData();
    } catch (err: any) {
      setError('Error al actualizar reparacion input_quality: ' + (err.response?.data?.detail || err.message));
    } finally {
      setSavingInputQualityId(null);
    }
  };

  const handleInputQualityRerun = async (item: InputQualityRepairItem) => {
    try {
      setRerunningInputQualityId(item.id);
      const res = await axios.post(`/api/scheduler/input-quality-repair-queue/${item.id}/rerun`, null, {
        params: { force_refresh: true },
      });
      setBackfillResult(res.data);
      fetchData();
    } catch (err: any) {
      setError('Error al relanzar AI 0.2: ' + (err.response?.data?.detail || err.message));
    } finally {
      setRerunningInputQualityId(null);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Nunca';
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDuration = (seconds: number | null) => {
    if (seconds === null) return '-';
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800"></div>
        <p className="ml-3">Cargando fuentes de datos...</p>
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div className="bg-red-50 border-l-4 border-red-400 p-3 mb-4 text-sm text-red-700 flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-2 text-red-500 hover:text-red-700 font-bold">x</button>
        </div>
      )}

      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-gray-500">{configs.length} fuentes Mendoza configuradas</p>
        <div className="flex gap-2">
          <button
            onClick={() => { window.location.href = '/api/scheduler/source-readiness-export.csv'; }}
            className="bg-white border border-gray-200 text-gray-700 px-3 py-1.5 rounded text-sm hover:bg-gray-50"
          >
            CSV readiness
          </button>
          <button
            onClick={() => handleBackfillAI()}
            disabled={backfillRunning === '__all__'}
            className="bg-indigo-700 text-white px-3 py-1.5 rounded text-sm hover:bg-indigo-600 disabled:opacity-50"
          >
            {backfillRunning === '__all__' ? 'Backfill...' : 'Backfill AI 0.2'}
          </button>
          <button
            onClick={handlePreviewBackfill}
            disabled={loadingCandidates}
            className="bg-white border border-indigo-200 text-indigo-700 px-3 py-1.5 rounded text-sm hover:bg-indigo-50 disabled:opacity-50"
          >
            {loadingCandidates ? 'Cargando...' : 'Ver candidatas'}
          </button>
          <button
            onClick={() => { window.location.href = '/api/scheduler/source-readiness-backfill-candidates.csv?min_ai_coverage=0.85&limit_per_source=5'; }}
            className="bg-white border border-indigo-200 text-indigo-700 px-3 py-1.5 rounded text-sm hover:bg-indigo-50"
          >
            CSV candidatas
          </button>
          <button
            onClick={fetchData}
            className="bg-gray-100 text-gray-700 px-3 py-1.5 rounded text-sm hover:bg-gray-200"
          >
            Refrescar
          </button>
        </div>
      </div>

      {backfillResult && (
        <div className="mb-4 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">Backfill AI 0.2</span>
            <span>{backfillResult.message || `${backfillResult.processed} procesadas`}</span>
            {backfillResult.batch && (
              <>
                <span>{backfillResult.batch.succeeded} OK</span>
                <span>{backfillResult.batch.failed} fallidas</span>
                <span>{backfillResult.batch.readiness?.snapshots || 0} readiness</span>
              </>
            )}
            <span>{backfillResult.candidates?.total_candidates || 0} candidatas detectadas</span>
          </div>
        </div>
      )}

      {backfillCandidates && (
        <div className="mb-4 rounded-lg border border-gray-200 bg-white px-3 py-2">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-sm font-semibold text-gray-700">
              Candidatas AI 0.2 · {backfillCandidates.total_candidates}
            </div>
            <button
              onClick={() => setBackfillCandidates(null)}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Cerrar
            </button>
          </div>
          <div className="space-y-2">
            {backfillCandidates.sources.length === 0 ? (
              <div className="text-xs text-gray-500">Sin candidatas bajo el umbral actual.</div>
            ) : (
              backfillCandidates.sources.slice(0, 6).map((source) => (
                <div key={source.name} className="rounded border border-gray-100 bg-gray-50 px-2 py-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-medium text-gray-700">{source.name}</span>
                    <span className="text-indigo-700">AI {pct(source.ai_coverage)}</span>
                    <span className="text-gray-500">umbral {pct(source.min_ai_coverage)}</span>
                    <span className="text-gray-500">snap {pct(source.snapshot_coverage)}</span>
                    <span className="text-gray-500">{source.candidate_count} candidatas</span>
                  </div>
                  <div className="mt-1 space-y-1">
                    {source.candidates.slice(0, 3).map((candidate) => (
                      <div key={candidate.id} className="truncate text-[11px] text-gray-500" title={candidate.title || candidate.id}>
                        P{candidate.remediation_score ?? '-'} · {candidate.id_licitacion || candidate.id} · {candidate.title || 'sin titulo'}
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {backfillRuns.length > 0 && (
        <div className="mb-4 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
          <div className="mb-2 text-sm font-semibold text-gray-700">Historial backfill AI 0.2</div>
          <div className="flex flex-wrap gap-2">
            {backfillRuns.map((run) => (
              <div key={run.id} className="rounded border border-gray-100 bg-white px-2 py-1 text-[11px] text-gray-600">
                <span className="font-medium text-gray-700">{run.source_name || 'todas'}</span>
                <span> · {formatDate(run.created_at)}</span>
                <span> · {run.succeeded}/{run.processed} OK</span>
                <span> · {run.readiness_snapshots} readiness</span>
                {(run.failure_diagnostics?.failed_count || 0) > 0 && (
                  <span className="text-red-600">
                    {' '}· {Object.entries(run.failure_diagnostics?.categories || {}).map(([key, count]) => `${key}:${count}`).join(' ')}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {remediationLeaderboard.length > 0 && (
        <div className="mb-4 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-semibold text-indigo-900">Ranking remediacion AI 0.2</div>
            <button
              onClick={() => { window.location.href = '/api/scheduler/source-remediation-leaderboard.csv?min_ai_coverage=0.85&limit_per_source=5'; }}
              className="rounded border border-indigo-200 bg-white px-2 py-1 text-xs text-indigo-700 hover:bg-indigo-50"
            >
              CSV ranking
            </button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
            {remediationLeaderboard.slice(0, 6).map((item) => (
              <div key={item.source_name} className="rounded border border-indigo-100 bg-white px-2 py-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-gray-700 truncate" title={item.source_name}>{item.source_name}</span>
                  <span className="rounded bg-indigo-100 px-1.5 py-0.5 font-semibold text-indigo-700">P{item.remediation_score}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-gray-500">
                  <span>brecha {pct(item.coverage_gap)}</span>
                  <span>{item.candidate_count} candidatas</span>
                  <span>top P{item.top_candidate_score}</span>
                  {item.recent_failed > 0 && <span className="text-red-600">{item.recent_failed} fallidas</span>}
                  {item.recent_success_rate !== null && item.recent_success_rate !== undefined && (
                    <span>exito {pct(item.recent_success_rate)}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {failureDiagnostics && Object.values(failureDiagnostics.categories || {}).some((count) => count > 0) && (
        <div className="mb-4 rounded-lg border border-red-100 bg-red-50 px-3 py-2">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-semibold text-red-900">Diagnostico fallas AI 0.2</div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-700">{failureDiagnostics.runs_evaluated} corridas</span>
              <button
                onClick={handleRetryFailures}
                disabled={retryingFailures}
                className="rounded border border-red-200 bg-white px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                {retryingFailures ? 'Reintentando...' : 'Retry recuperables'}
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {Object.entries(failureDiagnostics.categories).map(([category, count]) => (
              <span
                key={category}
                className="rounded bg-white border border-red-100 px-2 py-1 text-red-700"
                title={failureDiagnostics.repair_hints?.[category]}
              >
                {category}: <strong>{count}</strong>
              </span>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-gray-600">
            {failureDiagnostics.sources.slice(0, 4).map((source) => (
              <span key={source.source_name} className="rounded bg-white border border-red-100 px-2 py-1">
                {source.source_name}: {source.failed}
              </span>
            ))}
          </div>
        </div>
      )}

      {inputQualityQueue.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-semibold text-amber-900">Reparacion input_quality</div>
            <button
              onClick={() => { window.location.href = '/api/scheduler/input-quality-repair-queue.csv?status=open&limit=200'; }}
              className="rounded border border-amber-200 bg-white px-2 py-1 text-xs text-amber-700 hover:bg-amber-50"
            >
              CSV reparaciones
            </button>
          </div>
          <div className="space-y-2">
            {inputQualitySources.length > 0 && (
              <div className="flex flex-wrap gap-2 text-[11px] text-amber-800">
                {inputQualitySources.slice(0, 4).map((source) => (
                  <span key={source.source_name} className="rounded bg-white border border-amber-100 px-2 py-1">
                    {source.source_name}: {source.open_items} abiertas · max {source.max_age_hours}h
                  </span>
                ))}
              </div>
            )}
            {inputQualityQueue.slice(0, 5).map((item) => (
              <div key={item.id} className="rounded border border-amber-100 bg-white px-2 py-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-gray-700" title={item.title || item.id}>
                      {item.source_name} · {item.id_licitacion || item.id} · {item.title || 'sin titulo'}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-gray-500" title={item.error}>
                      {item.occurrences} ocurr. · {item.age_hours || 0}h
                      {(item.rerun_count || 0) > 0 && ` · reruns ${item.rerun_count} (${item.last_rerun_status || '-'})`}
                      {' · '}{item.error || 'sin detalle'}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <button
                      onClick={() => handleInputQualityAction(item, 'in_progress')}
                      disabled={savingInputQualityId === item.id}
                      className="rounded bg-amber-100 px-2 py-1 text-amber-800 hover:bg-amber-200 disabled:opacity-50"
                    >
                      Tomar
                    </button>
                    <button
                      onClick={() => handleInputQualityAction(item, 'resolved')}
                      disabled={savingInputQualityId === item.id}
                      className="rounded bg-emerald-100 px-2 py-1 text-emerald-700 hover:bg-emerald-200 disabled:opacity-50"
                    >
                      Resuelta
                    </button>
                    <button
                      onClick={() => handleInputQualityRerun(item)}
                      disabled={rerunningInputQualityId === item.id}
                      className="rounded bg-indigo-100 px-2 py-1 text-indigo-700 hover:bg-indigo-200 disabled:opacity-50"
                    >
                      {rerunningInputQualityId === item.id ? 'AI...' : 'Relanzar AI'}
                    </button>
                    <button
                      onClick={() => handleInputQualityAction(item, 'ignored')}
                      disabled={savingInputQualityId === item.id}
                      className="rounded bg-gray-100 px-2 py-1 text-gray-600 hover:bg-gray-200 disabled:opacity-50"
                    >
                      Ignorar
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {retryAnalytics && retryAnalytics.totals.runs > 0 && (
        <div className="mb-4 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-semibold text-emerald-900">Resultado retries AI 0.2</div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-emerald-700">
                {retryAnalytics.totals.succeeded}/{retryAnalytics.totals.processed} OK · {pct(retryAnalytics.totals.success_rate ?? undefined)}
              </span>
              <button
                onClick={() => { window.location.href = '/api/scheduler/source-backfill-retry-analytics.csv?limit=50'; }}
                className="rounded border border-emerald-200 bg-white px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50"
              >
                CSV retries
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {retryAnalytics.by_category.slice(0, 4).map((item) => (
              <span key={item.category} className="rounded bg-white border border-emerald-100 px-2 py-1 text-emerald-700">
                {item.category}: {item.succeeded}/{item.processed} · {pct(item.success_rate ?? undefined)}
              </span>
            ))}
          </div>
          {retryAlertSettings && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-emerald-800">
              <span>Alerta retry</span>
              <span>min exito {pct(retryAlertSettings.min_success_rate)}</span>
              <span>max rate-limit {pct(retryAlertSettings.max_rate_limit_share)}</span>
              <button
                onClick={() => handleRetryAlertSettings({ min_success_rate: 0.4 })}
                disabled={savingRetryAlertSettings}
                className="rounded bg-white border border-emerald-100 px-2 py-0.5 hover:bg-emerald-50 disabled:opacity-50"
              >
                40%
              </button>
              <button
                onClick={() => handleRetryAlertSettings({ min_success_rate: 0.6 })}
                disabled={savingRetryAlertSettings}
                className="rounded bg-white border border-emerald-100 px-2 py-0.5 hover:bg-emerald-50 disabled:opacity-50"
              >
                60%
              </button>
              <button
                onClick={() => handleRetryAlertSettings({ disabled: !retryAlertSettings.disabled })}
                disabled={savingRetryAlertSettings}
                className="rounded bg-white border border-emerald-100 px-2 py-0.5 hover:bg-emerald-50 disabled:opacity-50"
              >
                {retryAlertSettings.disabled ? 'Activar' : 'Pausar'}
              </button>
            </div>
          )}
          {operatorAlerts.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-emerald-800">
              <button
                onClick={() => { window.location.href = '/api/scheduler/operator-alert-events.csv?event_type=ai_backfill_retry_digest&limit=100'; }}
                className="rounded bg-white border border-emerald-100 px-2 py-1 hover:bg-emerald-50"
              >
                CSV alertas
              </button>
              {operatorAlerts.slice(0, 3).map((event) => (
                <span key={event.id} className="rounded bg-white border border-emerald-100 px-2 py-1">
                  {formatDate(event.created_at)} · {event.delivered ? 'enviada' : 'fallo envio'} · {pct(event.success_rate ?? undefined)}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {Object.keys(qualityTrends).length > 0 && (
        <div className="mb-4 border border-gray-100 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold text-gray-700">Tendencias calidad 0.2</h4>
            <span className="text-xs text-gray-400">ultimas corridas con metadatos</span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            {Object.entries(qualityTrends).slice(0, 6).map(([name, points]) => {
              const latest = points[0];
              const previous = points[1];
              const delta = latest?.score !== undefined && previous?.score !== undefined
                ? latest.score - previous.score
                : null;
              return (
                <div key={name} className="border border-gray-100 rounded-lg px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-gray-700 truncate" title={name}>{name}</span>
                    <div className="flex items-center gap-1">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${qualityColor(latest?.score)}`}>
                        {latest?.score ?? '-'}/100
                      </span>
                      {delta !== null && (
                        <span className={`text-xs ${delta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {delta >= 0 ? '+' : ''}{delta}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 flex h-1.5 gap-1">
                    {points.slice().reverse().map((point) => (
                      <div
                        key={point.run_id}
                        className={`flex-1 rounded-full ${qualityColor(point.score).split(' ')[0]}`}
                        title={`${point.started_at || 'sin fecha'}: ${point.score ?? '-'} puntos`}
                      />
                    ))}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-500">
                    <span>docs {pct(latest?.document_coverage)}</span>
                    <span>URL {pct(latest?.direct_url_coverage)}</span>
                    <span>{latest?.items_found ?? 0} items</span>
                    {(latest?.low_confidence_count || 0) > 0 && <span className="text-red-600">{latest?.low_confidence_count} baja confianza</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {configs.length === 0 ? (
        <p className="text-gray-500 text-center py-8">No hay fuentes configuradas.</p>
      ) : (
        <div className="space-y-3">
          {configs.map((config) => {
            const h = health[config.name];
            const isEditing = editingId === config.id;
            const isConfirmingDelete = confirmDelete === config.id;

            return (
              <div
                key={config.id}
                className={`border rounded-lg p-4 ${config.active ? 'border-gray-200' : 'border-gray-100 bg-gray-50 opacity-75'}`}
              >
                {/* Edit mode */}
                {isEditing ? (
                  <div className="space-y-3">
                    <h4 className="font-medium text-sm text-gray-500 mb-2">Editando fuente</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Nombre</label>
                        <input
                          value={editForm.name}
                          onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                          className="w-full border rounded px-3 py-1.5 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">URL</label>
                        <input
                          value={editForm.url}
                          onChange={(e) => setEditForm({ ...editForm, url: e.target.value })}
                          className="w-full border rounded px-3 py-1.5 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Schedule</label>
                        <select
                          value={SCHEDULE_PRESETS.some(p => p.value === editForm.schedule) ? editForm.schedule : 'custom'}
                          onChange={(e) => {
                            if (e.target.value !== 'custom') setEditForm({ ...editForm, schedule: e.target.value });
                          }}
                          className="w-full border rounded px-3 py-1.5 text-sm mb-1"
                        >
                          {SCHEDULE_PRESETS.map(p => (
                            <option key={p.value} value={p.value}>{p.label}</option>
                          ))}
                          <option value="custom">Personalizado</option>
                        </select>
                        {!SCHEDULE_PRESETS.some(p => p.value === editForm.schedule) && (
                          <input
                            value={editForm.schedule}
                            onChange={(e) => setEditForm({ ...editForm, schedule: e.target.value })}
                            className="w-full border rounded px-3 py-1.5 text-sm font-mono"
                            placeholder="0 7,13,19 * * 1-5"
                          />
                        )}
                        <p className="text-[10px] text-gray-400 mt-0.5">{describeCron(editForm.schedule)}</p>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Tipo</label>
                        <select
                          value={editForm.source_type}
                          onChange={(e) => setEditForm({ ...editForm, source_type: e.target.value })}
                          className="w-full border rounded px-3 py-1.5 text-sm"
                        >
                          <option value="website">Website</option>
                          <option value="api">API</option>
                          <option value="pdf">PDF</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={editForm.active}
                          onChange={(e) => setEditForm({ ...editForm, active: e.target.checked })}
                        />
                        Activa
                      </label>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={handleSaveEdit}
                        className="bg-blue-800 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700"
                      >
                        Guardar cambios
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="bg-gray-100 text-gray-600 px-4 py-1.5 rounded text-sm hover:bg-gray-200"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Header row */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                      <div className="flex items-center gap-3">
                        <span className={`w-3 h-3 rounded-full flex-shrink-0 ${config.active ? 'bg-green-500' : 'bg-gray-400'}`}></span>
                        <h4 className="font-medium text-sm sm:text-base">{config.name}</h4>
                        <span className="text-xs text-gray-400">{config.source_type}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                        <button
                          onClick={() => handleTriggerNow(config.name)}
                          disabled={triggeringName === config.name}
                          className="bg-blue-800 text-white px-3 py-1 rounded text-xs hover:bg-blue-700 disabled:opacity-50"
                        >
                          {triggeringName === config.name ? 'Ejecutando...' : 'Ejecutar ahora'}
                        </button>
                        <button
                          onClick={() => handleBackfillAI(config.name)}
                          disabled={backfillRunning === config.name}
                          className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded text-xs hover:bg-indigo-100 disabled:opacity-50"
                        >
                          {backfillRunning === config.name ? 'AI...' : 'AI 0.2'}
                        </button>
                        <button
                          onClick={() => startEditing(config)}
                          className="bg-gray-100 text-gray-700 px-3 py-1 rounded text-xs hover:bg-gray-200"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => handleToggle(config.id)}
                          className={`px-3 py-1 rounded text-xs font-medium ${
                            config.active
                              ? 'bg-orange-50 text-orange-700 hover:bg-orange-100'
                              : 'bg-green-50 text-green-700 hover:bg-green-100'
                          }`}
                        >
                          {config.active ? 'Desactivar' : 'Activar'}
                        </button>
                        {isConfirmingDelete ? (
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-red-600 font-medium">Confirmar?</span>
                            <button
                              onClick={() => handleDelete(config.id)}
                              disabled={deletingId === config.id}
                              className="bg-red-600 text-white px-2 py-1 rounded text-xs hover:bg-red-700 disabled:opacity-50"
                            >
                              {deletingId === config.id ? '...' : 'Si, eliminar'}
                            </button>
                            <button
                              onClick={() => setConfirmDelete(null)}
                              className="text-xs text-gray-500 hover:text-gray-700 px-1"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDelete(config.id)}
                            className="bg-red-50 text-red-600 px-3 py-1 rounded text-xs hover:bg-red-100"
                          >
                            Eliminar
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Details row */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                      <div>
                        <span className="text-gray-500 text-xs">Schedule</span>
                        <div className="mt-0.5">
                          <span className="text-xs font-medium">{describeCron(config.schedule)}</span>
                          <code className="text-[10px] bg-gray-100 px-1 py-0.5 rounded ml-1 text-gray-400">{config.schedule}</code>
                        </div>
                      </div>

                      <div>
                        <span className="text-gray-500 text-xs">Ultimo scraping</span>
                        <div className="mt-0.5 flex items-center gap-1">
                          <span className="text-xs">{formatDate(h?.last_run || config.last_run)}</span>
                          {h?.last_run_status && (
                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                              h.last_run_status === 'success' ? 'bg-green-100 text-green-700' :
                              h.last_run_status === 'failed' ? 'bg-red-100 text-red-700' :
                              'bg-yellow-100 text-yellow-700'
                            }`}>
                              {h.last_run_status}
                            </span>
                          )}
                        </div>
                      </div>

                      <div>
                        <span className="text-gray-500 text-xs">Registros</span>
                        <div className="text-xs mt-0.5">
                          <span className="font-medium">{h?.total_records ?? '-'}</span> totales
                          {h && h.last_run_items_saved > 0 && (
                            <span className="text-green-600 ml-1">(+{h.last_run_items_saved} ultimo)</span>
                          )}
                        </div>
                      </div>

                      <div>
                        <span className="text-gray-500 text-xs">Salud</span>
                        <div className="text-xs mt-0.5">
                          {!h ? (
                            <span className="text-gray-400">Sin datos</span>
                          ) : h.recent_errors === 0 ? (
                            <span className="text-green-600">Sin errores recientes</span>
                          ) : (
                            <span className="text-red-600">{h.recent_errors} errores en ultimos 5 runs</span>
                          )}
                          {h?.last_run_duration !== null && h?.last_run_duration !== undefined && (
                            <span className="text-gray-400 ml-1">({formatDuration(h.last_run_duration)})</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-2 rounded-lg border border-gray-100 bg-white px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-medium text-gray-600">Backfill AI</span>
                        <span className={config.ai_backfill?.disabled ? 'text-red-600' : 'text-indigo-700'}>
                          {config.ai_backfill?.disabled ? 'pausado' : `umbral ${pct(config.ai_backfill?.min_ai_coverage ?? 0.85)}`}
                        </span>
                        <span className="text-gray-500">limite {config.ai_backfill?.limit_per_source ?? 3}/fuente</span>
                        <button
                          onClick={() => handleBackfillSettings(config, { min_ai_coverage: 0.85, disabled: false })}
                          disabled={savingBackfillSettings === config.name}
                          className="rounded bg-gray-100 px-2 py-0.5 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                        >
                          85%
                        </button>
                        <button
                          onClick={() => handleBackfillSettings(config, { min_ai_coverage: 0.95, disabled: false })}
                          disabled={savingBackfillSettings === config.name}
                          className="rounded bg-gray-100 px-2 py-0.5 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                        >
                          95%
                        </button>
                        <button
                          onClick={() => handleBackfillSettings(config, { disabled: !config.ai_backfill?.disabled })}
                          disabled={savingBackfillSettings === config.name}
                          className="rounded bg-gray-100 px-2 py-0.5 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                        >
                          {config.ai_backfill?.disabled ? 'Reactivar' : 'Pausar'}
                        </button>
                      </div>
                    </div>

                    {h?.source_quality && (
                      <div className="mt-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-medium text-gray-500">Calidad 0.2</span>
                          <span className={`px-2 py-0.5 rounded-full font-bold ${qualityColor(h.source_quality.score)}`}>
                            {h.source_quality.score}/100
                          </span>
                          <span className="text-gray-500">
                            docs <strong className="text-gray-700">{pct(h.source_quality.document_coverage)}</strong>
                          </span>
                          <span className="text-gray-500">
                            URL directa <strong className="text-gray-700">{pct(h.source_quality.direct_url_coverage)}</strong>
                          </span>
                          <span className="text-gray-500">
                            evaluados <strong className="text-gray-700">{h.source_quality.items_evaluated}</strong>
                          </span>
                          {h.source_quality.low_confidence_count > 0 && (
                            <span className="text-red-600">
                              {h.source_quality.low_confidence_count} baja confianza
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {h?.source_evidence && (
                      <div className="mt-2 rounded-lg border border-sky-100 bg-sky-50 px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-medium text-sky-700">Evidencia 0.2</span>
                          {h.source_evidence.contract === 'native_scrape_result' && (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">nativa</span>
                          )}
                          <span className="text-gray-600">
                            cobertura <strong className="text-gray-800">{pct(h.source_evidence.evidence_coverage)}</strong>
                          </span>
                          <span className="text-gray-600">
                            evidencias <strong className="text-gray-800">{h.source_evidence.evidence_count}</strong>
                          </span>
                          <span className="text-gray-600">
                            items <strong className="text-gray-800">{h.source_evidence.items_with_evidence}/{h.source_evidence.items_evaluated}</strong>
                          </span>
                          {(h.source_evidence.native_result_count || 0) > 0 && (
                            <span className="text-emerald-700">
                              nativos <strong>{h.source_evidence.native_result_count}</strong>
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {h?.readiness && (
                      <div className="mt-2 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-medium text-indigo-700">Readiness 0.2</span>
                          <span className="text-gray-600">
                            AI <strong className="text-gray-800">{pct(h.readiness.ai_coverage)}</strong>
                          </span>
                          <span className="text-gray-600">
                            snapshots <strong className="text-gray-800">{h.readiness.snapshots}</strong>
                          </span>
                          <span className="text-emerald-700">
                            listas <strong>{h.readiness.ready}</strong>
                          </span>
                          <span className="text-rose-700">
                            bloqueadas <strong>{h.readiness.blocked}</strong>
                          </span>
                          {h.readiness.missing_documents > 0 && (
                            <span className="text-rose-700">
                              {h.readiness.missing_documents} docs faltantes
                            </span>
                          )}
                          {h.readiness.red_flags > 0 && (
                            <span className="text-amber-700">
                              {h.readiness.red_flags} riesgos
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {(readinessTrends[config.name] || []).length > 0 && (
                      <div className="mt-2 rounded-lg border border-indigo-100 bg-white px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-medium text-indigo-700">Tendencia readiness</span>
                          {(readinessTrends[config.name] || []).slice(0, 5).map((point, idx) => (
                            <span key={idx} className="rounded bg-indigo-50 px-1.5 py-0.5 text-indigo-700">
                              P{point.priority_score ?? point.score ?? '-'} · {point.status}
                              {(point.missing_documents || 0) > 0 && ` · ${point.missing_documents} falt.`}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {(readinessHistory[config.name] || []).length > 0 && (
                      <div className="mt-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-medium text-gray-700">Historial fuente</span>
                          {(readinessHistory[config.name] || []).slice(0, 4).map((point, idx) => (
                            <span key={idx} className="rounded bg-white border border-gray-100 px-1.5 py-0.5 text-gray-600">
                              {point.day || 's/d'} · AI {pct(point.ai_coverage)} · snap {pct(point.snapshot_coverage)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* URL */}
                    <div className="mt-2 text-xs text-gray-400 truncate" title={String(config.url)}>
                      {String(config.url)}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AdminFuentes;
