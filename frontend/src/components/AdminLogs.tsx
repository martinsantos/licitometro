import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

interface ScraperRun {
  id: string;
  scraper_name: string;
  status: string;
  items_found: number;
  items_saved: number;
  items_duplicated: number;
  items_updated: number;
  duplicates_skipped: number;
  duration_seconds: number | null;
  error_message: string | null;
  started_at: string;
  ended_at: string | null;
  logs: string[];
  errors: string[];
  warnings: string[];
  record_errors: Array<{ id_licitacion: string; error: string; timestamp: string }>;
}

const STATUS_COLORS: Record<string, string> = {
  success: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  partial: 'bg-yellow-100 text-yellow-800',
  running: 'bg-blue-100 text-blue-800',
  pending: 'bg-gray-100 text-gray-800',
};

const AdminLogs = () => {
  const [runs, setRuns] = useState<ScraperRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [runLogs, setRunLogs] = useState<Record<string, { logs: string[]; errors: string[]; warnings: string[] }>>({});
  const [filterName, setFilterName] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [scraperNames, setScraperNames] = useState<string[]>([]);

  const fetchRuns = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, string> = { limit: '50' };
      if (filterName) params.scraper_name = filterName;
      const res = await axios.get('/api/scheduler/runs', { params });
      let data: ScraperRun[] = res.data;
      if (filterStatus) {
        data = data.filter((r) => r.status === filterStatus);
      }
      setRuns(data);

      // Extract unique scraper names
      const nameSet = new Set<string>(res.data.map((r: ScraperRun) => r.scraper_name));
      setScraperNames(Array.from(nameSet));
      setError(null);
    } catch (err: any) {
      setError('Error al cargar runs: ' + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  }, [filterName, filterStatus]);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  const fetchLogs = async (runId: string) => {
    if (runLogs[runId]) {
      setExpandedRun(expandedRun === runId ? null : runId);
      return;
    }
    try {
      const res = await axios.get(`/api/scheduler/runs/${runId}/logs`);
      setRunLogs((prev) => ({
        ...prev,
        [runId]: { logs: res.data.logs, errors: res.data.errors, warnings: res.data.warnings },
      }));
      setExpandedRun(runId);
    } catch (err: any) {
      setError('Error al cargar logs: ' + (err.response?.data?.detail || err.message));
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (seconds === null) return '-';
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 mb-4">
        <div className="flex-1 sm:flex-none">
          <label className="block text-sm font-medium text-gray-700 mb-1">Scraper</label>
          <select
            value={filterName}
            onChange={(e) => setFilterName(e.target.value)}
            className="border border-gray-300 rounded px-3 py-2 text-sm w-full sm:w-auto"
          >
            <option value="">Todos</option>
            {scraperNames.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 sm:flex-none">
          <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="border border-gray-300 rounded px-3 py-2 text-sm w-full sm:w-auto"
          >
            <option value="">Todos</option>
            <option value="success">Exitoso</option>
            <option value="failed">Fallido</option>
            <option value="partial">Parcial</option>
            <option value="running">Ejecutando</option>
          </select>
        </div>
        <div className="flex items-end">
          <button
            onClick={fetchRuns}
            className="bg-blue-800 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 w-full sm:w-auto"
          >
            Refrescar
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-400 p-3 mb-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800"></div>
        </div>
      ) : runs.length === 0 ? (
        <p className="text-gray-500 text-center py-8">No hay ejecuciones registradas.</p>
      ) : (
        <div className="space-y-2">
          {runs.map((run) => (
            <div key={run.id} className="border rounded-lg overflow-hidden">
              <div
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-3 px-3 sm:px-4 py-3 cursor-pointer hover:bg-gray-50"
                onClick={() => fetchLogs(run.id)}
              >
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                  <span className={`px-2 py-1 rounded text-xs font-medium flex-shrink-0 ${STATUS_COLORS[run.status] || 'bg-gray-100'}`}>
                    {run.status}
                  </span>
                  <span className="font-medium text-sm truncate">{run.scraper_name}</span>
                  <span className="text-gray-500 text-xs flex-shrink-0">{formatDate(run.started_at)}</span>
                </div>
                <div className="flex items-center gap-2 sm:gap-4 text-xs sm:text-sm text-gray-600 pl-0 sm:pl-0">
                  <span title="Encontrados">
                    {run.items_found} enc.
                  </span>
                  <span title="Guardados" className="text-green-700">
                    {run.items_saved} nuevos
                  </span>
                  <span title="Actualizados" className="text-blue-700 hidden sm:inline">
                    {run.items_updated} act.
                  </span>
                  {run.duplicates_skipped > 0 && (
                    <span title="Duplicados omitidos" className="text-orange-600 hidden sm:inline">
                      {run.duplicates_skipped} dup.
                    </span>
                  )}
                  <span className="text-gray-400">
                    {formatDuration(run.duration_seconds)}
                  </span>
                  <svg
                    className={`w-4 h-4 transition-transform flex-shrink-0 ${expandedRun === run.id ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              {expandedRun === run.id && runLogs[run.id] && (
                <div className="border-t bg-gray-50 px-4 py-3">
                  {run.error_message && (
                    <div className="bg-red-50 border border-red-200 rounded p-2 mb-3 text-sm text-red-800">
                      <strong>Error:</strong> {run.error_message}
                    </div>
                  )}

                  {runLogs[run.id].warnings.length > 0 && (
                    <div className="mb-3">
                      <h4 className="text-sm font-medium text-yellow-800 mb-1">Warnings ({runLogs[run.id].warnings.length})</h4>
                      <div className="bg-yellow-50 border border-yellow-200 rounded p-2 text-xs font-mono max-h-32 overflow-y-auto">
                        {runLogs[run.id].warnings.map((w, i) => (
                          <div key={i}>{w}</div>
                        ))}
                      </div>
                    </div>
                  )}

                  {run.record_errors && run.record_errors.length > 0 && (
                    <div className="mb-3">
                      <h4 className="text-sm font-medium text-red-800 mb-1">Errores por registro ({run.record_errors.length})</h4>
                      <div className="bg-red-50 border border-red-200 rounded p-2 text-xs font-mono max-h-32 overflow-y-auto">
                        {run.record_errors.map((re, i) => (
                          <div key={i}><strong>{re.id_licitacion}</strong>: {re.error}</div>
                        ))}
                      </div>
                    </div>
                  )}

                  <h4 className="text-sm font-medium text-gray-700 mb-1">Logs ({runLogs[run.id].logs.length})</h4>
                  <div className="bg-white border rounded p-2 text-xs font-mono max-h-64 overflow-y-auto">
                    {runLogs[run.id].logs.length === 0 ? (
                      <span className="text-gray-400">Sin logs registrados.</span>
                    ) : (
                      runLogs[run.id].logs.map((line, i) => (
                        <div key={i} className={
                          line.includes('[ERROR]') ? 'text-red-600' :
                          line.includes('[WARNING]') ? 'text-yellow-600' : 'text-gray-700'
                        }>
                          {line}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminLogs;
