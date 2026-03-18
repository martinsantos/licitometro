import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';

interface ScraperHealth {
  name: string;
  success: number;
  fail: number;
  skip: number;
  last_run: string | null;
}

interface SystemStats {
  scraper_24h: ScraperHealth[];
  embedding_coverage: { total: number; embedded: number; pct: number };
  pending_enrichment: number;
  pending_embedding: number;
  pending_objeto: number;
  mongo_stats: { doc_count: number };
  generated_at: string;
  error?: string;
}

function StatCard({ label, value, sub, color = 'gray' }: {
  label: string;
  value: string | number;
  sub?: string;
  color?: 'gray' | 'green' | 'red' | 'blue' | 'orange';
}) {
  const colors = {
    gray: 'bg-gray-50 text-gray-700',
    green: 'bg-emerald-50 text-emerald-700',
    red: 'bg-red-50 text-red-700',
    blue: 'bg-blue-50 text-blue-700',
    orange: 'bg-orange-50 text-orange-700',
  };
  return (
    <div className={`rounded-xl p-3 ${colors[color]}`}>
      <div className="text-xs font-medium opacity-70 uppercase tracking-wide">{label}</div>
      <div className="text-xl font-bold mt-0.5">{value}</div>
      {sub && <div className="text-xs opacity-60 mt-0.5">{sub}</div>}
    </div>
  );
}

export default function AdminSistemaPanel() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastLoaded, setLastLoaded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${BACKEND_URL}/api/scheduler/stats/system`, {
        withCredentials: true,
      });
      setStats(r.data);
      setLastLoaded(new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }));
    } catch (e) {
      console.error('Failed to load system stats:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading && !stats) {
    return (
      <div className="flex items-center gap-3 py-12 text-gray-400 text-sm">
        <div className="w-4 h-4 border-2 border-gray-200 border-t-blue-400 rounded-full animate-spin" />
        Cargando estadísticas del sistema…
      </div>
    );
  }

  if (stats?.error) {
    return <div className="p-4 bg-red-50 text-red-600 text-sm rounded-xl">{stats.error}</div>;
  }

  if (!stats) return null;

  const scrapersFailing = stats.scraper_24h.filter(s => s.fail > 0);
  const scrapersOk = stats.scraper_24h.filter(s => s.fail === 0 && s.success > 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-800">Estado del Sistema</h2>
        <div className="flex items-center gap-3">
          {lastLoaded && (
            <span className="text-xs text-gray-400">Actualizado {lastLoaded}</span>
          )}
          <button
            onClick={load}
            disabled={loading}
            className="text-xs text-blue-600 hover:text-blue-800 border border-blue-200 px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
          >
            {loading ? '…' : '↻ Actualizar'}
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Total licitaciones"
          value={stats.mongo_stats.doc_count.toLocaleString()}
          color="blue"
        />
        <StatCard
          label="Embeddings"
          value={`${stats.embedding_coverage.pct}%`}
          sub={`${stats.embedding_coverage.embedded}/${stats.embedding_coverage.total} items`}
          color={stats.embedding_coverage.pct > 50 ? 'green' : 'orange'}
        />
        <StatCard
          label="Pendiente enriquecer"
          value={stats.pending_enrichment}
          color={stats.pending_enrichment > 100 ? 'orange' : 'gray'}
        />
        <StatCard
          label="Sin objeto"
          value={stats.pending_objeto}
          color={stats.pending_objeto > 500 ? 'red' : 'gray'}
        />
      </div>

      {/* Scraper health last 24h */}
      <div>
        <h3 className="font-medium text-gray-700 text-sm mb-3">
          Scrapers (últimas 24h)
          {scrapersFailing.length > 0 && (
            <span className="ml-2 text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">
              {scrapersFailing.length} con errores
            </span>
          )}
        </h3>

        {stats.scraper_24h.length === 0 ? (
          <p className="text-sm text-gray-400">Sin actividad en las últimas 24h</p>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold text-gray-500">Fuente</th>
                  <th className="text-right px-3 py-2 font-semibold text-gray-500">OK</th>
                  <th className="text-right px-3 py-2 font-semibold text-gray-500">Error</th>
                  <th className="text-right px-3 py-2 font-semibold text-gray-500">Último run</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {stats.scraper_24h.map(s => (
                  <tr key={s.name} className={s.fail > 0 ? 'bg-red-50' : 'hover:bg-gray-50'}>
                    <td className="px-3 py-2 text-gray-700 font-medium">{s.name}</td>
                    <td className="px-3 py-2 text-right text-emerald-600">{s.success}</td>
                    <td className="px-3 py-2 text-right text-red-500">{s.fail || '–'}</td>
                    <td className="px-3 py-2 text-right text-gray-400">
                      {s.last_run ? new Date(s.last_run).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '–'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pending queues */}
      <div>
        <h3 className="font-medium text-gray-700 text-sm mb-3">Colas pendientes</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-white rounded-xl border border-gray-100 p-3">
            <div className="text-xs text-gray-400">Sin enriquecer (L1)</div>
            <div className="text-lg font-bold text-orange-600 mt-1">{stats.pending_enrichment}</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-3">
            <div className="text-xs text-gray-400">Sin embedding</div>
            <div className="text-lg font-bold text-blue-600 mt-1">{stats.pending_embedding}</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-3">
            <div className="text-xs text-gray-400">Sin objeto</div>
            <div className="text-lg font-bold text-gray-600 mt-1">{stats.pending_objeto}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
