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
    <div className="flex items-center gap-4 px-4 py-2 bg-amber-50 border-b border-amber-100 text-xs text-gray-600 flex-wrap">
      {rates?.usd && (
        <span className="flex items-center gap-1">
          <span>💵</span>
          <span className="font-medium">USD:</span>
          <span>${new Intl.NumberFormat('es-AR').format(rates.usd)}</span>
        </span>
      )}
      {inflation?.rate != null && (
        <span className="flex items-center gap-1">
          <span>📊</span>
          <span className="font-medium">Inflación:</span>
          <span>{inflation.rate.toFixed(1)}%{inflation.period ? ` (${inflation.period})` : ''}</span>
        </span>
      )}
      {updatedAt && (
        <span className="text-gray-400 flex items-center gap-1">
          <span>🕐</span>
          <span>{updatedAt}</span>
        </span>
      )}
      <button
        onClick={load}
        disabled={loading}
        className="ml-auto text-amber-600 hover:text-amber-800 disabled:opacity-40 transition-colors"
        title="Actualizar datos de mercado"
      >
        {loading ? '⟳' : '↻'}
      </button>
    </div>
  );
}
