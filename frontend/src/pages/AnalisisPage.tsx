import React, { useEffect, useState, useCallback, useMemo } from 'react';

const API_URL = process.env.REACT_APP_API_URL || '';

// ── Types ────────────────────────────────────────────────────────────
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

type CategoryOption = { category: string; count: number };
type YearActivity = { year: number; count: number; monto: number; unique_suppliers: number };
type SupplierYear = { year: number; count: number; monto: number };
type SupplierCategory = { category: string | null; count: number; monto: number };
type SupplierOrg = { organization: string | null; count: number; monto: number };
type SearchResult = {
  id: string;
  adjudicatario: string;
  monto_adjudicado?: number | null;
  fecha_adjudicacion?: string | null;
  objeto?: string | null;
  category?: string | null;
  organization?: string | null;
  fuente: string;
};
type SupplierDetail = {
  adjudicatario: string;
  totals: {
    count?: number;
    monto_total?: number;
    monto_avg?: number;
    monto_max?: number;
    first_fecha?: string | null;
    last_fecha?: string | null;
    cuit?: string | null;
  };
  by_year: SupplierYear[];
  by_category: SupplierCategory[];
  by_organization: SupplierOrg[];
  recent: SearchResult[];
};

type WindowDays = 0 | 365 | 730 | 1825;
type SortKey = 'adjudicatario' | 'count' | 'monto_total' | 'last_fecha';
type SortDir = 'asc' | 'desc';

// ── Format helpers ───────────────────────────────────────────────────
const fmtMoney = (n?: number | null, cur = 'ARS'): string => {
  if (n == null) return '—';
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${Math.round(n).toLocaleString('es-AR')}`;
};
const fmtMoneyFull = (n?: number | null): string => {
  if (n == null) return '—';
  try {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency', currency: 'ARS', maximumFractionDigits: 0,
    }).format(n);
  } catch { return `$${n.toLocaleString('es-AR')}`; }
};
const fmtDate = (iso?: string | null): string => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return iso; }
};
const fmtNum = (n: number): string => n.toLocaleString('es-AR');

// ── Component ────────────────────────────────────────────────────────
const AnalisisPage: React.FC = () => {
  // Data
  const [summary, setSummary] = useState<Summary | null>(null);
  const [suppliers, setSuppliers] = useState<TopSupplier[]>([]);
  const [prices, setPrices] = useState<PriceRange[]>([]);
  const [vacancias, setVacancias] = useState<Vacancia[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [activity, setActivity] = useState<YearActivity[]>([]);

  // Filters (cross-section)
  const [windowDays, setWindowDays] = useState<WindowDays>(0);
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [supplierFilter, setSupplierFilter] = useState<string>('');

  // Table sort
  const [sortKey, setSortKey] = useState<SortKey>('monto_total');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // UI state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSupplier, setSelectedSupplier] = useState<string | null>(null);
  const [supplierDetail, setSupplierDetail] = useState<SupplierDetail | null>(null);
  const [supplierLoading, setSupplierLoading] = useState(false);

  // Search
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const buildQS = useCallback((extra: Record<string, string | number | undefined> = {}) => {
    const params = new URLSearchParams();
    if (windowDays > 0) params.set('days', String(windowDays));
    if (categoryFilter) params.set('category', categoryFilter);
    if (supplierFilter) params.set('supplier', supplierFilter);
    Object.entries(extra).forEach(([k, v]) => { if (v !== undefined && v !== '') params.set(k, String(v)); });
    return params.toString() ? `?${params}` : '';
  }, [windowDays, categoryFilter, supplierFilter]);

  const fetchAll = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [s, sup, pr, vac, cats, act] = await Promise.all([
        fetch(`${API_URL}/api/analytics/summary`, { credentials: 'include' }).then((r) => r.json()),
        fetch(`${API_URL}/api/analytics/adjudicaciones/top-suppliers${buildQS({ limit: 50 })}`, { credentials: 'include' }).then((r) => r.json()),
        fetch(`${API_URL}/api/analytics/adjudicaciones/price-ranges${buildQS()}`, { credentials: 'include' }).then((r) => r.json()),
        fetch(`${API_URL}/api/analytics/adjudicaciones/vacancias${buildQS()}`, { credentials: 'include' }).then((r) => r.json()),
        fetch(`${API_URL}/api/analytics/adjudicaciones/categories`, { credentials: 'include' }).then((r) => r.json()),
        fetch(`${API_URL}/api/analytics/adjudicaciones/activity-by-year${buildQS()}`, { credentials: 'include' }).then((r) => r.json()),
      ]);
      setSummary(s);
      setSuppliers(Array.isArray(sup) ? sup : []);
      setPrices(Array.isArray(pr) ? pr : []);
      setVacancias(Array.isArray(vac) ? vac : []);
      setCategories(Array.isArray(cats) ? cats : []);
      setActivity(Array.isArray(act) ? act : []);
    } catch (e: any) {
      setError(e?.message || 'Error cargando analítica');
    } finally { setLoading(false); }
  }, [buildQS]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Load supplier detail
  useEffect(() => {
    if (!selectedSupplier) { setSupplierDetail(null); return; }
    (async () => {
      setSupplierLoading(true);
      try {
        const r = await fetch(
          `${API_URL}/api/analytics/adjudicaciones/supplier?name=${encodeURIComponent(selectedSupplier)}`,
          { credentials: 'include' },
        );
        setSupplierDetail(await r.json());
      } catch { setSupplierDetail(null); }
      finally { setSupplierLoading(false); }
    })();
  }, [selectedSupplier]);

  // Client-side sort for Top Suppliers (tiny table, fast)
  const sortedSuppliers = useMemo(() => {
    const arr = [...suppliers];
    arr.sort((a, b) => {
      let av: any = a[sortKey]; let bv: any = b[sortKey];
      if (sortKey === 'last_fecha') { av = av ? new Date(av).getTime() : 0; bv = bv ? new Date(bv).getTime() : 0; }
      if (av == null) av = sortDir === 'asc' ? Infinity : -Infinity;
      if (bv == null) bv = sortDir === 'asc' ? Infinity : -Infinity;
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return arr;
  }, [suppliers, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir(k === 'adjudicatario' ? 'asc' : 'desc'); }
  };

  const clearFilters = () => {
    setCategoryFilter(''); setSupplierFilter(''); setWindowDays(0);
  };
  const hasFilters = categoryFilter || supplierFilter || windowDays > 0;

  const doSearch = useCallback(async () => {
    if (!searchQ.trim()) { setSearchResults([]); return; }
    setSearchLoading(true);
    try {
      const qs = new URLSearchParams({ q: searchQ, limit: '50' });
      if (categoryFilter) qs.set('category', categoryFilter);
      const r = await fetch(`${API_URL}/api/analytics/adjudicaciones/search?${qs}`, { credentials: 'include' });
      const data = await r.json();
      setSearchResults(Array.isArray(data) ? data : []);
    } catch { setSearchResults([]); }
    finally { setSearchLoading(false); }
  }, [searchQ, categoryFilter]);

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-4 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Análisis de Adjudicaciones</h1>
          <p className="text-sm text-gray-500 mt-1">Quién gana qué, a qué precio, qué rubros tienen poca competencia.</p>
        </div>
        <button onClick={fetchAll} className="text-xs border border-gray-200 rounded px-3 py-1.5 bg-white hover:bg-gray-50">
          ↻ Actualizar
        </button>
      </div>

      {/* Filters bar */}
      <div className="mb-4 p-3 bg-white border border-gray-200 rounded flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-gray-500">Ventana:</label>
          <select
            value={windowDays}
            onChange={(e) => setWindowDays(Number(e.target.value) as WindowDays)}
            className="text-xs border border-gray-200 rounded px-2 py-1 bg-white"
          >
            <option value={0}>Todo</option>
            <option value={365}>Último año</option>
            <option value={730}>Últimos 2 años</option>
            <option value={1825}>Últimos 5 años</option>
          </select>
        </div>

        <div className="flex items-center gap-1.5">
          <label className="text-xs text-gray-500">Rubro:</label>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="text-xs border border-gray-200 rounded px-2 py-1 bg-white max-w-xs"
          >
            <option value="">Todos ({categories.length})</option>
            {categories.map((c) => (
              <option key={c.category} value={c.category}>{c.category} ({c.count})</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1.5">
          <label className="text-xs text-gray-500">Proveedor:</label>
          <input
            type="text"
            value={supplierFilter}
            onChange={(e) => setSupplierFilter(e.target.value)}
            placeholder="Buscar proveedor…"
            className="text-xs border border-gray-200 rounded px-2 py-1 bg-white w-48"
          />
        </div>

        {hasFilters && (
          <button
            onClick={clearFilters}
            className="text-xs text-blue-600 hover:text-blue-800 underline ml-auto"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Summary tiles */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <Tile label="Total adjudicaciones" value={fmtNum(summary.total)} />
          <Tile label="Proveedores únicos" value={fmtNum(summary.unique_suppliers)} />
          <Tile label="OCDS Mendoza" value={fmtNum(summary.by_fuente?.ocds_mendoza || 0)} />
          <Tile label="Boletín Oficial" value={fmtNum(summary.by_fuente?.boletin_oficial || 0)} muted />
        </div>
      )}

      {error && <div className="mb-4 p-3 rounded bg-red-50 border border-red-100 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="text-sm text-gray-400 py-12 text-center">Cargando…</div>
      ) : (
        <>
          {/* Activity timeline */}
          <Section title="Actividad por año" subtitle="Monto total adjudicado y cantidad de adjudicaciones por año">
            {activity.length === 0 ? (
              <Empty>Sin datos para este filtro.</Empty>
            ) : (
              <YearActivityChart data={activity} />
            )}
          </Section>

          {/* Top Suppliers */}
          <Section
            title="Top proveedores"
            subtitle={`${sortedSuppliers.length} proveedores${categoryFilter ? ` en ${categoryFilter}` : ''} — clic en una fila para ver detalle`}
          >
            {sortedSuppliers.length === 0 ? (
              <Empty>No hay adjudicaciones con los filtros actuales. Probá ampliar la ventana o quitar filtros.</Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-xs text-gray-500 uppercase border-b border-gray-100 sticky top-0 bg-white">
                    <tr>
                      <SortableTH label="Proveedor" k="adjudicatario" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                      <SortableTH label="#" k="count" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                      <SortableTH label="Monto total" k="monto_total" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                      <th className="text-left py-2 pl-4">Rubros top</th>
                      <SortableTH label="Última" k="last_fecha" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    </tr>
                  </thead>
                  <tbody>
                    {sortedSuppliers.slice(0, 50).map((s) => (
                      <tr
                        key={s.adjudicatario}
                        className="border-b border-gray-50 hover:bg-blue-50 cursor-pointer"
                        onClick={() => setSelectedSupplier(s.adjudicatario)}
                      >
                        <td className="py-2 pr-4 font-medium text-gray-800 truncate max-w-xs" title={s.adjudicatario}>
                          {s.adjudicatario}
                          {s.cuit && <span className="ml-2 text-xs text-gray-400">{s.cuit}</span>}
                        </td>
                        <td className="text-right py-2 px-2 text-gray-700">{s.count}</td>
                        <td className="text-right py-2 px-2 text-gray-900 font-semibold whitespace-nowrap" title={fmtMoneyFull(s.monto_total)}>
                          {fmtMoney(s.monto_total)}
                        </td>
                        <td className="py-2 pl-4 text-xs text-gray-500 truncate max-w-xs">
                          {(s.categories || []).filter(Boolean).slice(0, 3).join(', ') || '—'}
                        </td>
                        <td className="py-2 pl-4 text-xs text-gray-400 whitespace-nowrap">{fmtDate(s.last_fecha)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {/* Vacancias */}
          <Section
            title="Vacancias — oportunidades de entrada"
            subtitle="Rubros con <2 proveedores promedio por proceso (baja competencia)"
          >
            {vacancias.length === 0 ? (
              <Empty>No se detectaron vacancias con el criterio actual.</Empty>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {vacancias.slice(0, 15).map((v) => (
                  <button
                    key={v.category}
                    onClick={() => setCategoryFilter(v.category)}
                    className="p-3 border border-amber-200 bg-amber-50 hover:bg-amber-100 rounded text-left transition"
                  >
                    <div className="text-sm font-semibold text-gray-900 truncate" title={v.category}>{v.category}</div>
                    <div className="mt-1 text-xs text-gray-600 flex justify-between">
                      <span>{v.procesos} procesos</span>
                      <span className="font-semibold text-amber-700">
                        {v.avg_suppliers_per_proc.toFixed(1)} prov/proc
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Section>

          {/* Price ranges */}
          <Section
            title="Spread de precios por rubro"
            subtitle="Min · p25 · Mediana · p75 · Max (muestra ≥ 3) — clic en un rubro para filtrar"
          >
            {prices.length === 0 ? (
              <Empty>No hay datos de precios suficientes.</Empty>
            ) : (
              <div className="space-y-2">
                {prices.slice(0, 25).map((p) => (
                  <button
                    key={p.category}
                    onClick={() => setCategoryFilter(p.category)}
                    className="block w-full py-2 text-left hover:bg-gray-50 px-2 rounded transition"
                  >
                    <PriceRangeBar data={p} />
                  </button>
                ))}
              </div>
            )}
          </Section>

          {/* Search */}
          <Section title="Buscador de adjudicaciones" subtitle="Busca por objeto, proveedor o descripción">
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && doSearch()}
                placeholder="Ej: informática, vialidad, ACME SRL…"
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
                      <th className="text-left py-2 pl-4">Rubro</th>
                    </tr>
                  </thead>
                  <tbody>
                    {searchResults.map((r) => (
                      <tr key={r.id} className="border-b border-gray-50 hover:bg-blue-50 cursor-pointer"
                          onClick={() => setSelectedSupplier(r.adjudicatario)}>
                        <td className="py-2 pr-4 font-medium text-gray-800">{r.adjudicatario}</td>
                        <td className="py-2 px-2 text-xs text-gray-600 truncate max-w-md" title={r.objeto || ''}>
                          {r.objeto || '—'}
                        </td>
                        <td className="text-right py-2 px-2 whitespace-nowrap">{fmtMoney(r.monto_adjudicado)}</td>
                        <td className="py-2 px-2 text-xs text-gray-500 whitespace-nowrap">{fmtDate(r.fecha_adjudicacion)}</td>
                        <td className="py-2 pl-4 text-xs text-gray-400 truncate max-w-xs">{r.category || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </>
      )}

      {/* Supplier detail side panel */}
      {selectedSupplier && (
        <SupplierPanel
          name={selectedSupplier}
          detail={supplierDetail}
          loading={supplierLoading}
          onClose={() => setSelectedSupplier(null)}
          onFilterBySupplier={() => { setSupplierFilter(selectedSupplier); setSelectedSupplier(null); }}
        />
      )}
    </div>
  );
};

// ── Sub-components ───────────────────────────────────────────────────

const Tile: React.FC<{ label: string; value: string; muted?: boolean }> = ({ label, value, muted }) => (
  <div className={`p-4 border rounded ${muted ? 'bg-gray-50 border-gray-100' : 'bg-white border-gray-100'}`}>
    <div className="text-xs text-gray-500 uppercase">{label}</div>
    <div className={`text-2xl font-bold mt-1 ${muted ? 'text-gray-400' : 'text-gray-900'}`}>{value}</div>
  </div>
);

const Section: React.FC<{ title: string; subtitle?: string; children: React.ReactNode }> = ({ title, subtitle, children }) => (
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

const SortableTH: React.FC<{
  label: string;
  k: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
  align?: 'left' | 'right';
}> = ({ label, k, sortKey, sortDir, onSort, align = 'left' }) => {
  const active = sortKey === k;
  return (
    <th
      className={`py-2 ${align === 'right' ? 'text-right px-2' : 'text-left pr-4'} cursor-pointer hover:text-gray-900 select-none`}
      onClick={() => onSort(k)}
    >
      {label}{' '}
      <span className="inline-block w-3 text-[10px]">
        {active ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
      </span>
    </th>
  );
};

const PriceRangeBar: React.FC<{ data: PriceRange }> = ({ data }) => {
  const range = Math.max(1, data.max - data.min);
  const p25Pct = ((data.p25 - data.min) / range) * 100;
  const medianPct = ((data.median - data.min) / range) * 100;
  const p75Pct = ((data.p75 - data.min) / range) * 100;
  const boxWidth = Math.max(2, p75Pct - p25Pct);
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1">
        <div className="text-sm font-medium text-gray-800 truncate mr-2" title={data.category}>{data.category}</div>
        <div className="text-xs text-gray-400 whitespace-nowrap">
          n={data.count} · spread {data.spread_ratio ? `${data.spread_ratio.toFixed(1)}x` : '—'}
        </div>
      </div>
      <div className="relative h-5 bg-gray-100 rounded overflow-hidden">
        <div className="absolute top-0 bottom-0 bg-blue-200" style={{ left: `${p25Pct}%`, width: `${boxWidth}%` }} />
        <div className="absolute top-0 bottom-0 w-0.5 bg-blue-700" style={{ left: `${medianPct}%` }} />
      </div>
      <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
        <span>{fmtMoney(data.min)}</span>
        <span className="font-medium text-blue-700">Med: {fmtMoney(data.median)}</span>
        <span>{fmtMoney(data.max)}</span>
      </div>
    </div>
  );
};

const YearActivityChart: React.FC<{ data: YearActivity[] }> = ({ data }) => {
  const maxMonto = Math.max(1, ...data.map((d) => d.monto));
  const maxCount = Math.max(1, ...data.map((d) => d.count));
  return (
    <div>
      <div className="flex items-end gap-1 h-48">
        {data.map((d) => {
          const h = (d.monto / maxMonto) * 100;
          const ch = (d.count / maxCount) * 100;
          return (
            <div key={d.year} className="flex-1 flex flex-col items-center justify-end gap-1 min-w-0">
              <div className="w-full flex items-end justify-center gap-0.5 h-40">
                <div
                  className="bg-blue-500 rounded-t flex-1 max-w-[24px] transition-all hover:bg-blue-700"
                  style={{ height: `${h}%`, minHeight: d.monto > 0 ? '2px' : '0' }}
                  title={`${d.year}: ${fmtMoneyFull(d.monto)} (${d.count} adj, ${d.unique_suppliers} prov)`}
                />
                <div
                  className="bg-emerald-400 rounded-t flex-1 max-w-[24px] transition-all hover:bg-emerald-600"
                  style={{ height: `${ch}%`, minHeight: d.count > 0 ? '2px' : '0' }}
                  title={`${d.year}: ${d.count} adjudicaciones`}
                />
              </div>
              <div className="text-[10px] text-gray-500">{d.year}</div>
              <div className="text-[10px] text-gray-400">{fmtMoney(d.monto)}</div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-blue-500 rounded-sm"></span>Monto total</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-emerald-400 rounded-sm"></span># Adjudicaciones</span>
      </div>
    </div>
  );
};

const SupplierPanel: React.FC<{
  name: string;
  detail: SupplierDetail | null;
  loading: boolean;
  onClose: () => void;
  onFilterBySupplier: () => void;
}> = ({ name, detail, loading, onClose, onFilterBySupplier }) => {
  const t = detail?.totals;
  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed top-0 right-0 bottom-0 w-full max-w-2xl bg-white z-50 shadow-xl overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-5 py-3 flex items-center justify-between">
          <div className="min-w-0 flex-1 mr-3">
            <div className="text-xs text-gray-500 uppercase">Proveedor</div>
            <div className="text-base font-bold text-gray-900 truncate" title={name}>{name}</div>
            {t?.cuit && <div className="text-xs text-gray-500 mt-0.5">CUIT {t.cuit}</div>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-gray-400">Cargando…</div>
        ) : !detail ? (
          <div className="p-8 text-center text-sm text-gray-400">Sin datos</div>
        ) : (
          <div className="p-5 space-y-5">
            {/* Totals */}
            <div className="grid grid-cols-2 gap-3">
              <MetricBox label="Adjudicaciones" value={fmtNum(t?.count || 0)} />
              <MetricBox label="Monto total" value={fmtMoney(t?.monto_total)} fullValue={fmtMoneyFull(t?.monto_total)} />
              <MetricBox label="Promedio" value={fmtMoney(t?.monto_avg)} fullValue={fmtMoneyFull(t?.monto_avg)} />
              <MetricBox label="Máximo" value={fmtMoney(t?.monto_max)} fullValue={fmtMoneyFull(t?.monto_max)} />
            </div>
            <div className="text-xs text-gray-500">
              Primera: {fmtDate(t?.first_fecha)} · Última: {fmtDate(t?.last_fecha)}
            </div>

            <button
              onClick={onFilterBySupplier}
              className="w-full text-xs border border-blue-200 text-blue-700 rounded px-3 py-1.5 hover:bg-blue-50"
            >
              Filtrar dashboard por este proveedor
            </button>

            {/* Year activity mini */}
            {detail.by_year.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase text-gray-500 mb-2">Por año</h3>
                <MiniBarChart data={detail.by_year.map((y) => ({ label: String(y.year), value: y.monto, sub: `${y.count} adj` }))} />
              </div>
            )}

            {/* By category */}
            {detail.by_category.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase text-gray-500 mb-2">Rubros</h3>
                <div className="space-y-1">
                  {detail.by_category.slice(0, 8).map((c) => (
                    <div key={c.category || 'sin'} className="flex justify-between text-xs py-1 border-b border-gray-50">
                      <span className="text-gray-700 truncate mr-2">{c.category || '(sin categoría)'}</span>
                      <span className="text-gray-400 whitespace-nowrap">{c.count} · {fmtMoney(c.monto)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* By organization */}
            {detail.by_organization.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase text-gray-500 mb-2">Organismos (top 5)</h3>
                <div className="space-y-1">
                  {detail.by_organization.slice(0, 5).map((o) => (
                    <div key={o.organization || 'sin'} className="flex justify-between text-xs py-1 border-b border-gray-50">
                      <span className="text-gray-700 truncate mr-2">{o.organization || '—'}</span>
                      <span className="text-gray-400 whitespace-nowrap">{o.count} · {fmtMoney(o.monto)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent */}
            {detail.recent.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase text-gray-500 mb-2">Últimas adjudicaciones</h3>
                <div className="space-y-2">
                  {detail.recent.slice(0, 10).map((r) => (
                    <div key={r.id} className="p-2 border border-gray-100 rounded text-xs">
                      <div className="flex justify-between items-baseline">
                        <span className="text-gray-400">{fmtDate(r.fecha_adjudicacion)}</span>
                        <span className="font-semibold whitespace-nowrap" title={fmtMoneyFull(r.monto_adjudicado)}>
                          {fmtMoney(r.monto_adjudicado)}
                        </span>
                      </div>
                      <div className="text-gray-800 mt-0.5 line-clamp-2" title={r.objeto || ''}>{r.objeto || '—'}</div>
                      <div className="text-gray-400 mt-0.5 truncate">{r.organization || ''}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
};

const MetricBox: React.FC<{ label: string; value: string; fullValue?: string }> = ({ label, value, fullValue }) => (
  <div className="p-3 bg-gray-50 rounded" title={fullValue}>
    <div className="text-[10px] uppercase text-gray-500">{label}</div>
    <div className="text-lg font-bold text-gray-900">{value}</div>
  </div>
);

const MiniBarChart: React.FC<{ data: { label: string; value: number; sub?: string }[] }> = ({ data }) => {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex items-end gap-1 h-24">
      {data.map((d) => (
        <div key={d.label} className="flex-1 flex flex-col items-center justify-end gap-1 min-w-0">
          <div
            className="w-full bg-blue-500 rounded-t hover:bg-blue-700 max-w-[20px]"
            style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value > 0 ? '2px' : '0' }}
            title={`${d.label}: ${fmtMoneyFull(d.value)} (${d.sub || ''})`}
          />
          <div className="text-[9px] text-gray-500">{d.label}</div>
        </div>
      ))}
    </div>
  );
};

export default AnalisisPage;
