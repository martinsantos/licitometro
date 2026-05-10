import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';

type ReadinessItem = {
  id: string;
  licitacion_id: string;
  company_id: string;
  score: number;
  priority_score?: number;
  nivel: string;
  status: 'blocked' | 'risk' | 'ready' | 'review' | 'weak';
  counts?: {
    red_flags?: number;
    document_matches?: number;
    missing_documents?: number;
    technical_matches?: number;
  };
  ai_v2?: {
    missing_documents?: string[];
    document_matches?: string[];
    technical_matches?: string[];
    document_coverage?: number | null;
  };
  licitacion?: {
    title?: string;
    organization?: string;
    opening_date?: string;
    days_until_opening?: number | null;
    fuente?: string;
    jurisdiccion?: string;
  };
  updated_at?: string;
  operator_action?: {
    owner?: string;
    next_action?: string;
    due_date?: string;
    notes?: string;
    resolved?: boolean;
  };
};

type SummaryBucket = {
  count: number;
  missing_documents: number;
  red_flags: number;
};

type HistoryEvent = {
  id: string;
  company_id: string;
  previous?: {
    status?: string;
    score?: number;
    priority_score?: number;
    counts?: Record<string, number>;
  };
  current?: {
    status?: string;
    score?: number;
    priority_score?: number;
    counts?: Record<string, number>;
  };
  created_at?: string;
};

const STATUS_LABEL: Record<string, string> = {
  blocked: 'Bloqueadas',
  risk: 'Con riesgo',
  ready: 'Listas',
  review: 'A revisar',
  weak: 'Debiles',
};

const STATUS_CLASS: Record<string, string> = {
  blocked: 'bg-rose-50 text-rose-700 border-rose-100',
  risk: 'bg-amber-50 text-amber-700 border-amber-100',
  ready: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  review: 'bg-blue-50 text-blue-700 border-blue-100',
  weak: 'bg-gray-50 text-gray-700 border-gray-100',
};

function formatDate(value?: string) {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin fecha';
  return date.toLocaleDateString('es-AR');
}

function isOverdue(value?: string) {
  if (!value) return false;
  const due = new Date(value);
  if (Number.isNaN(due.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return due < today;
}

export default function ReadinessDashboardPanel() {
  const [items, setItems] = useState<ReadinessItem[]>([]);
  const [summary, setSummary] = useState<Record<string, SummaryBucket>>({});
  const [status, setStatus] = useState('');
  const [minPriority, setMinPriority] = useState('');
  const [openingDays, setOpeningDays] = useState('');
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [resolutionFilter, setResolutionFilter] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [historyTarget, setHistoryTarget] = useState<string | null>(null);
  const [historyItems, setHistoryItems] = useState<HistoryEvent[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [actionTarget, setActionTarget] = useState<string | null>(null);
  const [actionDraft, setActionDraft] = useState<Record<string, string | boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', '100');
      if (status) params.set('status', status);
      if (minPriority) params.set('min_priority', minPriority);
      if (openingDays) params.set('opening_days', openingDays);
      if (criticalOnly) params.set('critical_only', 'true');
      if (resolutionFilter) params.set('resolved', resolutionFilter);
      if (overdueOnly) params.set('overdue', 'true');
      const res = await axios.get(`/api/canonical/readiness?${params.toString()}`, { withCredentials: true });
      setItems(res.data.items || []);
      setSummary(res.data.summary || {});
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Error al cargar readiness');
    } finally {
      setLoading(false);
    }
  }, [status, minPriority, openingDays, criticalOnly, resolutionFilter, overdueOnly]);

  useEffect(() => { load(); }, [load]);

  const loadHistory = async (item: ReadinessItem) => {
    if (historyTarget === item.licitacion_id) {
      setHistoryTarget(null);
      setHistoryItems([]);
      return;
    }
    setHistoryTarget(item.licitacion_id);
    setLoadingHistory(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', '10');
      params.set('company_id', item.company_id);
      const res = await axios.get(`/api/canonical/readiness/${item.licitacion_id}/history?${params.toString()}`, { withCredentials: true });
      setHistoryItems(res.data.items || []);
    } catch {
      setHistoryItems([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  const ownerSummary = items.reduce<Record<string, { total: number; overdue: number; pending: number }>>((acc, item) => {
    const action = item.operator_action;
    if (!action?.owner) return acc;
    const owner = action.owner;
    if (!acc[owner]) acc[owner] = { total: 0, overdue: 0, pending: 0 };
    acc[owner].total += 1;
    if (!action.resolved) acc[owner].pending += 1;
    if (!action.resolved && isOverdue(action.due_date)) acc[owner].overdue += 1;
    return acc;
  }, {});

  const refreshItem = async (item: ReadinessItem) => {
    setRefreshingId(item.licitacion_id);
    try {
      await axios.post(`/api/canonical/readiness/${item.licitacion_id}/refresh`, {}, { withCredentials: true });
      await load();
      if (historyTarget === item.licitacion_id) {
        setHistoryTarget(null);
        setHistoryItems([]);
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Error al refrescar readiness');
    } finally {
      setRefreshingId(null);
    }
  };

  const exportCsv = () => {
    const params = new URLSearchParams();
    params.set('limit', '200');
    if (status) params.set('status', status);
    if (minPriority) params.set('min_priority', minPriority);
    if (openingDays) params.set('opening_days', openingDays);
    if (criticalOnly) params.set('critical_only', 'true');
    if (resolutionFilter) params.set('resolved', resolutionFilter);
    if (overdueOnly) params.set('overdue', 'true');
    window.location.href = `/api/canonical/readiness/export.csv?${params.toString()}`;
  };

  const editAction = (item: ReadinessItem) => {
    const key = `${item.licitacion_id}:${item.company_id}`;
    setActionTarget(actionTarget === key ? null : key);
    setActionDraft({
      owner: item.operator_action?.owner || '',
      next_action: item.operator_action?.next_action || '',
      due_date: item.operator_action?.due_date || '',
      notes: item.operator_action?.notes || '',
      resolved: Boolean(item.operator_action?.resolved),
    });
  };

  const saveAction = async (item: ReadinessItem) => {
    try {
      const params = new URLSearchParams();
      params.set('company_id', item.company_id);
      await axios.put(`/api/canonical/readiness/${item.licitacion_id}/action?${params.toString()}`, actionDraft, { withCredentials: true });
      setActionTarget(null);
      await load();
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Error al guardar accion');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="font-semibold text-gray-800">Readiness de Ofertas 0.2</h2>
          <p className="text-xs text-gray-500 mt-0.5">Snapshots persistidos de preparación por licitación y empresa.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Todos</option>
            {Object.entries(STATUS_LABEL).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <select
            value={minPriority}
            onChange={(e) => setMinPriority(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Prioridad</option>
            <option value="80">80+</option>
            <option value="70">70+</option>
            <option value="60">60+</option>
          </select>
          <select
            value={openingDays}
            onChange={(e) => setOpeningDays(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Apertura</option>
            <option value="3">3 dias</option>
            <option value="7">7 dias</option>
            <option value="15">15 dias</option>
            <option value="30">30 dias</option>
          </select>
          <button
            onClick={() => setCriticalOnly(v => !v)}
            className={`px-3 py-2 text-sm rounded-lg border ${criticalOnly ? 'bg-rose-700 text-white border-rose-700' : 'bg-white text-gray-700 border-gray-200'}`}
          >
            Criticas
          </button>
          <select
            value={resolutionFilter}
            onChange={(e) => setResolutionFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Acciones</option>
            <option value="false">Pendientes</option>
            <option value="true">Resueltas</option>
          </select>
          <button
            onClick={() => setOverdueOnly(v => !v)}
            className={`px-3 py-2 text-sm rounded-lg border ${overdueOnly ? 'bg-amber-700 text-white border-amber-700' : 'bg-white text-gray-700 border-gray-200'}`}
          >
            Vencidas
          </button>
          <button
            onClick={() => { setStatus(''); setMinPriority(''); setOpeningDays(''); setCriticalOnly(false); setResolutionFilter(''); setOverdueOnly(false); }}
            className="px-3 py-2 text-sm bg-white text-gray-700 border border-gray-200 rounded-lg"
          >
            Limpiar
          </button>
          <button
            onClick={exportCsv}
            className="px-3 py-2 text-sm bg-white text-gray-700 border border-gray-200 rounded-lg"
          >
            CSV
          </button>
          <button
            onClick={load}
            disabled={loading}
            className="px-3 py-2 text-sm bg-blue-700 text-white rounded-lg disabled:opacity-50"
          >
            {loading ? '...' : 'Actualizar'}
          </button>
        </div>
      </div>

      {error && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg">{error}</div>}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
        {Object.entries(STATUS_LABEL).map(([key, label]) => {
          const bucket = summary[key] || { count: 0, missing_documents: 0, red_flags: 0 };
          return (
            <button
              key={key}
              onClick={() => setStatus(status === key ? '' : key)}
              className={`text-left border rounded-lg px-3 py-2 ${STATUS_CLASS[key]} ${status === key ? 'ring-2 ring-offset-1 ring-blue-300' : ''}`}
            >
              <div className="text-[11px] uppercase tracking-wide font-semibold">{label}</div>
              <div className="text-xl font-bold">{bucket.count}</div>
              <div className="text-[11px]">{bucket.missing_documents} docs faltantes · {bucket.red_flags} riesgos</div>
            </button>
          );
        })}
      </div>

      {Object.keys(ownerSummary).length > 0 && (
        <div className="border border-gray-100 rounded-lg p-3">
          <h3 className="text-sm font-semibold text-gray-800 mb-2">Carga por responsable</h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(ownerSummary)
              .sort((a, b) => b[1].overdue - a[1].overdue || b[1].pending - a[1].pending)
              .map(([owner, data]) => (
                <div key={owner} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs">
                  <div className="font-semibold text-gray-800">{owner}</div>
                  <div className="text-gray-600">{data.pending} pendientes · {data.overdue} vencidas · {data.total} total</div>
                </div>
              ))}
          </div>
        </div>
      )}

      <div className="overflow-x-auto border border-gray-100 rounded-lg">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
            <tr>
              <th className="px-3 py-2 text-left">Oportunidad</th>
              <th className="px-3 py-2 text-left">Estado</th>
              <th className="px-3 py-2 text-left">Prioridad</th>
              <th className="px-3 py-2 text-left">Brechas</th>
              <th className="px-3 py-2 text-left">Apertura</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t border-gray-100 align-top">
                <td className="px-3 py-3">
                  <div className="font-medium text-gray-800">{item.licitacion?.title || item.licitacion_id}</div>
                  <div className="text-xs text-gray-500">{item.licitacion?.organization || 'Sin organismo'} · {item.company_id}</div>
                  <button
                    onClick={() => loadHistory(item)}
                    className="mt-1 text-xs font-semibold text-blue-700 hover:text-blue-900"
                  >
                    {historyTarget === item.licitacion_id ? 'Ocultar historial' : 'Ver historial'}
                  </button>
                  <button
                    onClick={() => refreshItem(item)}
                    disabled={refreshingId === item.licitacion_id}
                    className="mt-1 ml-3 text-xs font-semibold text-emerald-700 hover:text-emerald-900 disabled:opacity-50"
                  >
                    {refreshingId === item.licitacion_id ? 'Refrescando' : 'Refrescar'}
                  </button>
                  <button
                    onClick={() => editAction(item)}
                    className="mt-1 ml-3 text-xs font-semibold text-gray-700 hover:text-gray-900"
                  >
                    Accion
                  </button>
                  {item.operator_action?.next_action && (
                    <div className={`mt-1 text-xs ${isOverdue(item.operator_action.due_date) && !item.operator_action.resolved ? 'text-rose-700 font-semibold' : 'text-gray-600'}`}>
                      {item.operator_action.resolved ? 'Resuelto' : item.operator_action.next_action}
                      {item.operator_action.owner && <span> · {item.operator_action.owner}</span>}
                      {item.operator_action.due_date && (
                        <span> · vence {formatDate(item.operator_action.due_date)}</span>
                      )}
                      {isOverdue(item.operator_action.due_date) && !item.operator_action.resolved && <span> · vencida</span>}
                    </div>
                  )}
                  {actionTarget === `${item.licitacion_id}:${item.company_id}` && (
                    <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 rounded-lg border border-gray-100 bg-white p-2">
                      <input
                        value={String(actionDraft.owner || '')}
                        onChange={(e) => setActionDraft(prev => ({ ...prev, owner: e.target.value }))}
                        placeholder="Responsable"
                        className="border border-gray-200 rounded px-2 py-1 text-xs"
                      />
                      <input
                        value={String(actionDraft.due_date || '')}
                        onChange={(e) => setActionDraft(prev => ({ ...prev, due_date: e.target.value }))}
                        placeholder="Vence YYYY-MM-DD"
                        className="border border-gray-200 rounded px-2 py-1 text-xs"
                      />
                      <input
                        value={String(actionDraft.next_action || '')}
                        onChange={(e) => setActionDraft(prev => ({ ...prev, next_action: e.target.value }))}
                        placeholder="Proxima accion"
                        className="md:col-span-2 border border-gray-200 rounded px-2 py-1 text-xs"
                      />
                      <textarea
                        value={String(actionDraft.notes || '')}
                        onChange={(e) => setActionDraft(prev => ({ ...prev, notes: e.target.value }))}
                        placeholder="Notas"
                        className="md:col-span-2 border border-gray-200 rounded px-2 py-1 text-xs"
                      />
                      <label className="flex items-center gap-2 text-xs text-gray-600">
                        <input
                          type="checkbox"
                          checked={Boolean(actionDraft.resolved)}
                          onChange={(e) => setActionDraft(prev => ({ ...prev, resolved: e.target.checked }))}
                        />
                        Resuelto
                      </label>
                      <button
                        onClick={() => saveAction(item)}
                        className="justify-self-end px-2 py-1 rounded bg-blue-700 text-white text-xs"
                      >
                        Guardar
                      </button>
                    </div>
                  )}
                  {historyTarget === item.licitacion_id && (
                    <div className="mt-2 rounded-lg border border-gray-100 bg-gray-50 p-2">
                      {loadingHistory && <div className="text-xs text-gray-500">Cargando historial...</div>}
                      {!loadingHistory && historyItems.length === 0 && (
                        <div className="text-xs text-gray-500">Sin cambios registrados.</div>
                      )}
                      {!loadingHistory && historyItems.map((event) => (
                        <div key={event.id} className="border-t first:border-t-0 border-gray-200 py-1.5 text-xs">
                          <div className="font-semibold text-gray-700">
                            {event.previous?.status || 'nuevo'} {'->'} {event.current?.status || 's/n'}
                            <span className="ml-1 text-gray-400">{formatDate(event.created_at)}</span>
                          </div>
                          <div className="text-gray-500">
                            prioridad {event.previous?.priority_score ?? '-'} {'->'} {event.current?.priority_score ?? '-'} ·
                            score {event.previous?.score ?? '-'} {'->'} {event.current?.score ?? '-'}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-3 py-3">
                  <span className={`inline-flex px-2 py-0.5 rounded-full border text-xs font-semibold ${STATUS_CLASS[item.status] || STATUS_CLASS.weak}`}>
                    {STATUS_LABEL[item.status] || item.status}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <div className="font-semibold text-gray-800">{item.priority_score ?? item.score}/100</div>
                  <div className="text-xs text-gray-500">afinidad {item.score}% · {item.nivel}</div>
                </td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-1 mb-1">
                    <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 text-xs">{item.counts?.missing_documents || 0} faltantes</span>
                    <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-xs">{item.counts?.document_matches || 0} docs ok</span>
                    <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-xs">{item.counts?.red_flags || 0} riesgos</span>
                  </div>
                  {(item.ai_v2?.missing_documents || []).slice(0, 3).map((doc, i) => (
                    <div key={i} className="text-xs text-rose-700 truncate max-w-md">{doc}</div>
                  ))}
                </td>
                <td className="px-3 py-3 text-gray-600">
                  <div>{formatDate(item.licitacion?.opening_date)}</div>
                  {item.licitacion?.days_until_opening != null && (
                    <div className={`text-xs ${item.licitacion.days_until_opening <= 3 ? 'text-rose-700 font-semibold' : 'text-gray-500'}`}>
                      {item.licitacion.days_until_opening === 0 ? 'hoy' : `${item.licitacion.days_until_opening} dias`}
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {items.length === 0 && !loading && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-gray-500">Sin snapshots de readiness todavía.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
