import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const API_BASE = '/api/licitaciones-ar';

interface ARSource {
  id: string;
  name: string;
  url: string;
  active: boolean;
  scope: string;
  last_run: string | null;
  runs_count: number;
}

interface ARStats {
  total: number;
  by_fuente: Record<string, number>;
  by_jurisdiccion: Record<string, number>;
  by_estado: Record<string, number>;
  with_nodos: number;
}

const AdminARPanel = () => {
  const [sources, setSources] = useState<ARSource[]>([]);
  const [stats, setStats] = useState<ARStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [digestResult, setDigestResult] = useState<string | null>(null);
  const [nodoResult, setNodoResult] = useState<string | null>(null);

  const fetchSources = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/sources`);
      setSources(res.data || []);
    } catch (err) {
      console.error('Error fetching AR sources:', err);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/stats`);
      setStats(res.data);
    } catch {}
  }, []);

  useEffect(() => {
    Promise.all([fetchSources(), fetchStats()]).finally(() => setLoading(false));
  }, [fetchSources, fetchStats]);

  const handleTriggerScraper = async (name: string) => {
    setActionLoading(name);
    try {
      await axios.post(`/api/scheduler/trigger/${name}`);
      // Refresh after a short delay
      setTimeout(() => {
        fetchSources();
        fetchStats();
      }, 3000);
    } catch (err) {
      console.error('Error triggering scraper:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleBatchNodos = async () => {
    setActionLoading('nodos');
    setNodoResult(null);
    try {
      const res = await axios.post(`${API_BASE}/batch-assign-nodos?limit=500`);
      setNodoResult(`Procesados: ${res.data.processed}, Asignados: ${res.data.assigned}`);
      fetchStats();
    } catch (err) {
      setNodoResult('Error al asignar nodos');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSendDigest = async () => {
    setActionLoading('digest');
    setDigestResult(null);
    try {
      const res = await axios.post(`${API_BASE}/send-digest?hours=24`);
      if (res.data.sent) {
        setDigestResult(`Enviado: ${res.data.count} items`);
      } else {
        setDigestResult(res.data.message || 'No hay items nuevos');
      }
    } catch (err) {
      setDigestResult('Error al enviar digest');
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard label="Total Items" value={stats.total} color="gray" />
          <StatCard label="Vigentes" value={stats.by_estado?.vigente || 0} color="emerald" />
          <StatCard label="Fuentes Activas" value={Object.keys(stats.by_fuente || {}).length} color="sky" />
          <StatCard label="Con Nodos" value={stats.with_nodos} color="purple" />
          <StatCard label="Jurisdicciones" value={Object.keys(stats.by_jurisdiccion || {}).length} color="amber" />
        </div>
      )}

      {/* Manual Actions */}
      <div className="bg-sky-50 border border-sky-200 rounded-lg p-4">
        <h3 className="text-sm font-bold text-sky-900 mb-3">Acciones Manuales</h3>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleBatchNodos}
            disabled={actionLoading === 'nodos'}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2"
          >
            {actionLoading === 'nodos' ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            )}
            Asignar Nodos (batch)
          </button>
          <button
            onClick={handleSendDigest}
            disabled={actionLoading === 'digest'}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2"
          >
            {actionLoading === 'digest' ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            )}
            Enviar Digest (24h)
          </button>
        </div>
        {nodoResult && (
          <p className="mt-2 text-sm text-purple-700">{nodoResult}</p>
        )}
        {digestResult && (
          <p className="mt-2 text-sm text-emerald-700">{digestResult}</p>
        )}
      </div>

      {/* Sources Table */}
      <div>
        <h3 className="text-sm font-bold text-gray-900 mb-3">
          Fuentes AR ({sources.length})
        </h3>
        <div className="bg-white rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Fuente</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600 hidden md:table-cell">URL</th>
                <th className="text-center px-4 py-2 font-medium text-gray-600">Estado</th>
                <th className="text-center px-4 py-2 font-medium text-gray-600 hidden sm:table-cell">Ejecuciones</th>
                <th className="text-center px-4 py-2 font-medium text-gray-600">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sources.map((source) => (
                <tr key={source.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{source.name}</div>
                    {source.last_run && (
                      <div className="text-xs text-gray-400">
                        Último: {new Date(source.last_run).toLocaleDateString('es-AR')}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-sky-600 hover:underline truncate block max-w-[300px]"
                    >
                      {source.url}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      source.active
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}>
                      {source.active ? 'Activa' : 'Inactiva'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center hidden sm:table-cell text-gray-500">
                    {source.runs_count}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleTriggerScraper(source.name)}
                      disabled={actionLoading === source.name}
                      className="px-3 py-1 bg-sky-600 text-white rounded text-xs font-medium hover:bg-sky-700 disabled:opacity-50"
                    >
                      {actionLoading === source.name ? '...' : 'Ejecutar'}
                    </button>
                  </td>
                </tr>
              ))}
              {sources.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                    No hay fuentes AR configuradas. Ejecuta <code>seed_ar_sources.py</code> para crearlas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* By Fuente breakdown */}
      {stats && Object.keys(stats.by_fuente || {}).length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-gray-900 mb-3">Items por Fuente</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {Object.entries(stats.by_fuente)
              .sort(([, a], [, b]) => b - a)
              .map(([name, count]) => (
                <div key={name} className="bg-white rounded border p-2 text-sm">
                  <div className="font-medium text-gray-700 truncate">{name}</div>
                  <div className="text-lg font-bold text-gray-900">{count}</div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
};


const StatCard = ({ label, value, color }: { label: string; value: number; color: string }) => {
  const colorMap: Record<string, string> = {
    gray: 'text-gray-900',
    emerald: 'text-emerald-600',
    sky: 'text-sky-600',
    purple: 'text-purple-600',
    amber: 'text-amber-600',
  };
  return (
    <div className="bg-white rounded-lg border p-3 text-center">
      <div className={`text-2xl font-bold ${colorMap[color] || 'text-gray-900'}`}>{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
};


export default AdminARPanel;
