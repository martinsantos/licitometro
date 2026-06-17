import React, { useState, useEffect, useCallback } from 'react';
import { useCotizarAPI, MarketRates, InflationData } from '../../hooks/useCotizarAPI';

export default function MarketDataBanner() {
  const api = useCotizarAPI();
  const [rates, setRates] = useState<MarketRates | null>(null);
  const [inflation, setInflation] = useState<InflationData | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, inf] = await Promise.all([
        api.getMarketRates().catch(() => null),
        api.getInflation().catch(() => null),
      ]);
      setRates(r);
      setInflation(inf);
      setUpdatedAt(new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!rates && !inflation && !loading) return null;

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-white border-b border-gray-200 text-xs text-gray-600 flex-wrap">
      {rates?.usd && (
        <span className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-2 py-1">
          <span className="font-bold text-gray-500">USD</span>
          <span>${new Intl.NumberFormat('es-AR').format(rates.usd)}</span>
        </span>
      )}
      {inflation?.rate != null && (
        <span className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-2 py-1">
          <span className="font-bold text-gray-500">IPC</span>
          <span>{inflation.rate.toFixed(1)}%{inflation.period ? ` (${inflation.period})` : ''}</span>
        </span>
      )}
      {updatedAt && (
        <span className="inline-flex items-center gap-1.5 text-gray-400">
          <span className="font-bold text-gray-300">ACT</span>
          <span>{updatedAt}</span>
        </span>
      )}
      <button
        onClick={load}
        disabled={loading}
        className="ml-auto rounded-md border border-gray-200 px-2 py-1 font-semibold text-gray-500 hover:border-blue-300 hover:text-blue-700 disabled:opacity-40 lic-control-transition"
        title="Actualizar datos de mercado"
      >
        {loading ? '...' : 'Actualizar'}
      </button>
    </div>
  );
}
