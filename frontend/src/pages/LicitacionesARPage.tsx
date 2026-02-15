import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import LicitacionesList from '../components/LicitacionesList';

const API_BASE = '/api/licitaciones-ar';
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';

interface ARStats {
  total: number;
  by_fuente: Record<string, number>;
  by_jurisdiccion: Record<string, number>;
  by_estado: Record<string, number>;
  with_nodos: number;
}

const LicitacionesARPage = () => {
  const [stats, setStats] = useState<ARStats | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/stats`);
      setStats(res.data);
    } catch {}
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return (
    <div className="max-w-7xl mx-auto pt-3 md:pt-4 pb-4 px-3 md:px-6 lg:px-10">
      {/* Header */}
      <div className="mb-3">
        <div className="flex items-center gap-3 mb-1">
          <h2 className="text-xl font-black text-gray-900 tracking-tight">
            Licitaciones Argentina
          </h2>
          <span className="px-2 py-0.5 bg-sky-100 text-sky-800 text-xs font-bold rounded-full border border-sky-200">
            LIC AR
          </span>
        </div>
        <p className="text-xs text-gray-500">
          Fuentes nacionales, provinciales e internacionales de Argentina.
        </p>
      </div>

      {/* Compact Stats Strip */}
      {stats && (
        <div className="flex flex-wrap gap-2 mb-3 text-xs">
          <span className="px-2.5 py-1 bg-white border rounded-full text-gray-700 font-medium">
            {stats.total} <span className="text-gray-400">total</span>
          </span>
          <span className="px-2.5 py-1 bg-emerald-50 border border-emerald-200 rounded-full text-emerald-700 font-medium">
            {stats.by_estado?.vigente || 0} <span className="text-emerald-500">vigentes</span>
          </span>
          <span className="px-2.5 py-1 bg-sky-50 border border-sky-200 rounded-full text-sky-700 font-medium">
            {Object.keys(stats.by_fuente || {}).length} <span className="text-sky-500">fuentes</span>
          </span>
          <span className="px-2.5 py-1 bg-purple-50 border border-purple-200 rounded-full text-purple-700 font-medium">
            {stats.with_nodos} <span className="text-purple-500">con nodos</span>
          </span>
          <span className="px-2.5 py-1 bg-amber-50 border border-amber-200 rounded-full text-amber-700 font-medium">
            {Object.keys(stats.by_jurisdiccion || {}).length} <span className="text-amber-500">jurisdicciones</span>
          </span>
        </div>
      )}

      {/* Full listing with all filters — reuses main component with AR API path */}
      <LicitacionesList apiUrl={BACKEND_URL} apiPath="/api/licitaciones-ar" defaultYear="all" />
    </div>
  );
};

export default LicitacionesARPage;
