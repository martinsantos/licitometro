import React, { useEffect, useState, useCallback } from 'react';

const API_URL = process.env.REACT_APP_API_URL || '';

type Summary = {
  total: number;
  by_fuente: Record<string, number>;
  unique_suppliers: number;
  last_ingest?: string | null;
};

type TopSupplier = {
  adjudicatario: string;
  count: number;
  monto_total: number;
  categories?: (string | null)[];
  organizations?: string[];
  cuit?: string | null;
  last_fecha?: string | null;
};

type PriceRange = {
  category: string;
  count: number;
  min: number;
  p25: number;
  median: number;
  p75: number;
  max: number;
  avg: number;
  spread_ratio?: number | null;
};

type Vacancia = {
  category: string;
  procesos: number;
  avg_suppliers_per_proc: number;
};

type SearchResult = {
  id: string;
  adjudicatario: string;
  monto_adjudicado?: number | null;
  fecha_adjudicacion?: string | null;
  objeto?: string | null;
  category?: string | null;
  organization?: string | null;
  fuente: string;
  extraction_confidence?: number;
};

const formatMoney = (n: number | null | undefined, currency = 'ARS'): string => {
  if (n === null || n === undefined) return '—';
  try {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `$${n.toLocaleString('es-AR')}`;
  }
};

const formatDate = (iso?: string | null): string => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
};

type WindowDays = 90 | 180 | 365 | 0;

const AnalisisPage: React.FC = () => {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [suppliers, setSuppliers] = useState<TopSupplier[]>([]);
  const [prices, setPrices] = useState<PriceRange[]>([]);
  const [vacancias, setVacancias] = useState<Vacancia[]>([]);
  const [windowDays, setWindowDays] = useState<WindowDays>(365);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search state
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    const daysParam = windowDays > 0 ? `?days=${windowDays}` : '';
    try {
      const [s, sup, pr, vac] = await Promise.all([
        fetch(`${API_URL}/api/analytics/summary`, { credentials: 'include' }).then((r) => r.json()),
        fetch(`${API_URL}/api/analytics/adjudicaciones/top-suppliers${daysParam}${daysParam ? '&' : '?'}limit=20`, { credentials: 'include' }).then((r) => r.json()),
        fetch(`${API_URL}/api/analytics/adjudicaciones/price-ranges${daysParam}`, { credentials: 'include' }).then((r) => r.json()),
        fetch(`${API_URL}/api/analytics/adjudicaciones/vacancias${daysParam}`, { credentials: 'include' }).then((r) => r.json()),
      ]);
      setSummary(s);
      setSuppliers(Array.isArray(sup) ? sup : []);
      setPrices(Array.isArray(pr) ? pr : []);
      setVacancias(Array.isArray(vac) ? vac : []);
    } catch (e: any) {
      setError(e?.message || 'Error cargando analítica');
    } finally {
      setLoading(false);
    }
  }, [windowDays]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const doSearch = useCallback(async () => {
    if (!searchQ.trim()) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    try {
      const r = await fetch(
        `${API_URL}/api/analytics/adjudicaciones/search?q=${encodeURIComponent(searchQ)}&limit=40`,
        { credentials: 'include' },
      );
      const data = await r.json();
      setSearchResults(Array.isArray(data) ? data : []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, [searchQ]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Análisis de Adjudicaciones</h1>
          <p className="text-sm text-gray-500 mt-1">
            Quién gana qué, a qué precio, qué rubros tienen poca competencia.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">Ventana:</label>
          <select
            value={windowDays}
            onChange={(e) => setWindowDays(Number(e.target.value) as WindowDays)}
            className="text-xs border border-gray-200 rounded px-2 py-1 bg-white"
          >
            <option value={90}>90 días</option>
            <option value={180}>180 días</option>
            <option value={365}>Último año</option>
            <option value={0}>Todo</option>
          </select>
          <button
            onClick={fetchAll}
            className="text-xs border border-gray-200 rounded px-3 py-1 bg-white hover:bg-gray-50"
          >
            Actualizar
          </button>
        </div>
      </div>

      {/* Summary tiles */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <Tile label="Total adjudicaciones" value={summary.total.toLocaleString('es-AR')} />
          <Tile label="Proveedores únicos" value={summary.unique_suppliers.toLocaleString('es-AR')} />
          <Tile label="OCDS Mendoza" value={(summary.by_fuente?.ocds_mendoza || 0).toLocaleString('es-AR')} />
          <Tile label="Boletín Oficial" value={(summary.by_fuente?.boletin_oficial || 0).toLocaleString('es-AR')} />
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 rounded bg-red-50 border border-red-100 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="text-sm text-gray-400 py-12 text-center">Cargando…</div>
      ) : (
        <>
          {/* Top Suppliers */}
          <Section title="Top proveedores" subtitle="Ordenados por monto total adjudicado">
            {suppliers.length === 0 ? (
              <Empty>No hay adjudicaciones en el rango seleccionado.</Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-xs text-gray-500 uppercase border-b border-gray-100">
                    <tr>
                      <th className="text-left py-2 pr-4">Proveedor</th>
                      <th className="text-right py-2 px-2">#</th>
                      <th className="text-right py-2 px-2">Monto total</th>
                      <th className="text-left py-2 pl-4">Rubros</th>
                      <th className="text-left py-2 pl-4">Última</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suppliers.map((s) => (
                      <tr key={s.adjudicatario} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-2 pr-4 font-medium text-gray-800 truncate max-w-xs" title={s.adjudicatario}>
                          {s.adjudicatario}
                          {s.cuit && <span className="ml-2 text-xs text-gray-400">{s.cuit}</span>}
                        </td>
                        <td className="text-right py-2 px-2 text-gray-700">{s.count}</td>
                        <td className="text-right py-2 px-2 text-gray-900 font-semibold whitespace-nowrap">
                          {formatMoney(s.monto_total)}
                        </td>
                        <td className="py-2 pl-4 text-xs text-gray-500 truncate max-w-xs">
                          {(s.categories || []).filter(Boolean).slice(0, 3).join(', ') || '—'}
                        </td>
                        <td className="py-2 pl-4 text-xs text-gray-400 whitespace-nowrap">{formatDate(s.last_fecha)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {/* Vacancias */}
          <Section title="Vacancias" subtitle="Rubros con <2 proveedores promedio por proceso (oportunidades de entrada)">
            {vacancias.length === 0 ? (
              <Empty>No se detectaron vacancias con el criterio actual.</Empty>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {vacancias.slice(0, 12).map((v) => (
                  <div key={v.category} className="p-3 border border-amber-200 bg-amber-50 rounded">
                    <div className="text-sm font-semibold text-gray-900 truncate" title={v.category}>
                      {v.category}
                    </div>
                    <div className="mt-1 text-xs text-gray-600 flex justify-between">
                      <span>{v.procesos} procesos</span>
                      <span className="font-semibold text-amber-700">
                        {v.avg_suppliers_per_proc.toFixed(1)} proveedores/proc
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Price ranges */}
          <Section title="Spread de precios por rubro" subtitle="Min · p25 · Mediana · p75 · Max (solo categorías con muestra ≥ 3)">
            {prices.length === 0 ? (
              <Empty>No hay datos de precios suficientes para mostrar rangos.</Empty>
            ) : (
              <div className="space-y-2">
                {prices.slice(0, 20).map((p) => (
                  <PriceRangeBar key={p.category} data={p} />
                ))}
              </div>
            )}
          </Section>

          {/* Search */}
          <Section title="Buscador de adjudicaciones" subtitle="Busca por objeto, proveedor o CUIT">
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && doSearch()}
                placeholder="Ej: informática, vialidad, ACME SRL..."
                className="flex-1 px-3 py-2 border border-gray-200 rounded text-sm"
              />
              <button
                onClick={doSearch}
                disabled={searchLoading}
                className="px-4 py-2 bg-gray-900 text-white text-sm rounded hover:bg-gray-800 disabled:opacity-50"
              >
                {searchLoading ? 'Buscando…' : 'Buscar'}
              </button>
            </div>
            {searchResults.length > 0 && (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-xs text-gray-500 uppercase border-b border-gray-100">
                    <tr>
                      <th className="text-left py-2 pr-4">Adjudicatario</th>
                      <th className="text-left py-2 px-2">Objeto</th>
                      <th className="text-right py-2 px-2">Monto</th>
                      <th className="text-left py-2 px-2">Fecha</th>
                      <th className="text-left py-2 pl-4">Fuente</th>
                    </tr>
                  </thead>
                  <tbody>
                    {searchResults.map((r) => (
                      <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-2 pr-4 font-medium text-gray-800">{r.adjudicatario}</td>
                        <td className="py-2 px-2 text-xs text-gray-600 truncate max-w-md" title={r.objeto || ''}>
                          {r.objeto || '—'}
                        </td>
                        <td className="text-right py-2 px-2 whitespace-nowrap">{formatMoney(r.monto_adjudicado)}</td>
                        <td className="py-2 px-2 text-xs text-gray-500 whitespace-nowrap">{formatDate(r.fecha_adjudicacion)}</td>
                        <td className="py-2 pl-4 text-xs text-gray-400">{r.fuente}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  );
};

// ── Sub-components ──

const Tile: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="p-4 bg-white border border-gray-100 rounded">
    <div className="text-xs text-gray-500 uppercase">{label}</div>
    <div className="text-2xl font-bold text-gray-900 mt-1">{value}</div>
  </div>
);

const Section: React.FC<{ title: string; subtitle?: string; children: React.ReactNode }> = ({
  title,
  subtitle,
  children,
}) => (
  <section className="mb-8">
    <div className="mb-3">
      <h2 className="text-base font-semibold text-gray-900">{title}</h2>
      {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
    </div>
    <div className="p-4 bg-white border border-gray-100 rounded">{children}</div>
  </section>
);

const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="text-sm text-gray-400 py-4 text-center">{children}</div>
);

const PriceRangeBar: React.FC<{ data: PriceRange }> = ({ data }) => {
  const range = Math.max(1, data.max - data.min);
  const p25Pct = ((data.p25 - data.min) / range) * 100;
  const medianPct = ((data.median - data.min) / range) * 100;
  const p75Pct = ((data.p75 - data.min) / range) * 100;
  const boxWidth = Math.max(2, p75Pct - p25Pct);

  return (
    <div className="py-2">
      <div className="flex justify-between items-baseline mb-1">
        <div className="text-sm font-medium text-gray-800 truncate mr-2" title={data.category}>
          {data.category}
        </div>
        <div className="text-xs text-gray-400 whitespace-nowrap">
          n={data.count} · spread {data.spread_ratio ? `${data.spread_ratio.toFixed(1)}x` : '—'}
        </div>
      </div>
      <div className="relative h-6 bg-gray-100 rounded overflow-hidden">
        {/* Box p25-p75 */}
        <div
          className="absolute top-0 bottom-0 bg-blue-200"
          style={{ left: `${p25Pct}%`, width: `${boxWidth}%` }}
          title={`p25: ${formatMoney(data.p25)} · p75: ${formatMoney(data.p75)}`}
        />
        {/* Median line */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-blue-700"
          style={{ left: `${medianPct}%` }}
          title={`Mediana: ${formatMoney(data.median)}`}
        />
      </div>
      <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
        <span>{formatMoney(data.min)}</span>
        <span className="font-medium text-blue-700">Med: {formatMoney(data.median)}</span>
        <span>{formatMoney(data.max)}</span>
      </div>
    </div>
  );
};

export default AnalisisPage;
