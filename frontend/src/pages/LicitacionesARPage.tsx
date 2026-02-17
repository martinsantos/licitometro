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
    <div className="max-w-7xl mx-auto pt-2 md:pt-4 pb-4 px-3 md:px-6 lg:px-10">
      {/* Header — compact single line on mobile */}
      <div className="mb-2 flex items-center gap-2 flex-wrap">
        <h2 className="text-base sm:text-xl font-black text-gray-900 tracking-tight">
          Licitaciones Argentina
        </h2>
        <span className="px-1.5 py-0.5 bg-sky-100 text-sky-800 text-[10px] font-bold rounded-full border border-sky-200">
          AR
        </span>
        {/* Inline stats on the same line */}
        {stats && (
          <div className="flex items-center gap-1.5 text-[10px] sm:text-xs ml-auto">
            <span className="text-gray-500 font-medium">{stats.total}</span>
            <span className="text-emerald-600 font-medium">{stats.by_estado?.vigente || 0} vig</span>
            <span className="text-sky-600 font-medium">{Object.keys(stats.by_fuente || {}).length} fuentes</span>
          </div>
        )}
      </div>

      {/* Full listing with all filters — reuses main component with AR API path */}
      <LicitacionesList apiUrl={BACKEND_URL} apiPath="/api/licitaciones-ar" defaultYear="all" />
    </div>
  );
};

export default LicitacionesARPage;
