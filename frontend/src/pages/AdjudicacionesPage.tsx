import React, { useState, useCallback } from 'react';

const API_URL = process.env.REACT_APP_API_URL || process.env.REACT_APP_BACKEND_URL || '';

// ── Types ─────────────────────────────────────────────────────────────
type Adjudicacion = {
  _id: string;
  objeto?: string | null;
  organization?: string | null;
  adjudicatario: string;
  supplier_id?: string | null;
  monto_adjudicado?: number | null;
  fecha_adjudicacion?: string | null;
  fuente: string;
  category?: string | null;
};

type ListResult = {
  items: Adjudicacion[];
  total: number;
  page: number;
  pages: number;
};

type PrecioRefItem = {
  _id: string;
  objeto?: string | null;
  monto_adjudicado?: number | null;
  fecha_adjudicacion?: string | null;
  organization?: string | null;
  adjudicatario?: string;
};

// ── Format helpers ────────────────────────────────────────────────────
const fmtMonto = (n?: number | null): string => {
  if (n == null) return '—';
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${Math.round(n).toLocaleString('es-AR')}`;
};

const fmtFecha = (iso?: string | null): string => {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch { return iso; }
};

const FUENTE_LABELS: Record<string, string> = {
  comprasapps_mendoza: 'ComprasApps',
  comprar_mendoza: 'COMPR.AR Mza',
  comprar_nacional: 'COMPR.AR Nac',
  ocds_mendoza: 'OCDS Mza',
  boletin_oficial: 'Boletín Oficial',
};

const fmtFuente = (f: string) => FUENTE_LABELS[f] || f;

// ── Component ─────────────────────────────────────────────────────────
const AdjudicacionesPage: React.FC = () => {
  // Filters
  const [organismo, setOrganismo] = useState('');
  const [proveedor, setProveedor] = useState('');
  const [fuente, setFuente] = useState('');
  const [categoria, setCategoria] = useState('');

  // Results
  const [result, setResult] = useState<ListResult | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Precio referencia modal
  const [modalOpen, setModalOpen] = useState(false);
  const [precioQ, setPrecioQ] = useState('');
  const [precioResults, setPrecioResults] = useState<PrecioRefItem[]>([]);
  const [precioLoading, setPrecioLoading] = useState(false);

  const buildParams = useCallback((p: number) => {
    const params = new URLSearchParams();
    if (organismo.trim()) params.set('organization', organismo.trim());
    if (proveedor.trim()) params.set('proveedor', proveedor.trim());
    if (fuente) params.set('fuente', fuente);
    if (categoria.trim()) params.set('categoria', categoria.trim());
    params.set('limit', '50');
    params.set('page', String(p));
    return params.toString();
  }, [organismo, proveedor, fuente, categoria]);

  const doSearch = useCallback(async (p = 1) => {
    setLoading(true);
    setError(null);
    try {
      const qs = buildParams(p);
      const r = await fetch(`${API_URL}/api/adjudicaciones?${qs}`, { credentials: 'include' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setResult(data);
      setPage(p);
    } catch (e: any) {
      setError(e?.message || 'Error al cargar adjudicaciones');
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') doSearch(1);
  };

  const doPrecioSearch = async () => {
    if (!precioQ.trim()) return;
    setPrecioLoading(true);
    try {
      const qs = new URLSearchParams({ q: precioQ.trim(), limit: '20' });
      const r = await fetch(`${API_URL}/api/adjudicaciones/precios-referencia?${qs}`, { credentials: 'include' });
      const data = await r.json();
      setPrecioResults(data.items || []);
    } catch {
      setPrecioResults([]);
    } finally {
      setPrecioLoading(false);
    }
  };

  return (
    <div className="codex-page max-w-7xl mx-auto px-4 py-6">
      <div className="codex-page-header">
        <div>
          <span className="codex-page-kicker">Histórico contractual</span>
          <h1 className="text-2xl font-bold text-gray-900">Adjudicaciones Históricas</h1>
          <p>
            Historial de licitaciones adjudicadas — filtrá por organismo, proveedor, fuente o rubro.
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="codex-button codex-button--primary flex items-center gap-2 text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Precios de referencia
        </button>
      </div>

      {/* Filter bar */}
      <div className="codex-panel codex-filter-bar mb-4 p-4">
        <div className="flex flex-col gap-1 min-w-[180px]">
          <label className="text-xs text-gray-500 font-medium">Organismo</label>
          <input
            type="text"
            value={organismo}
            onChange={(e) => setOrganismo(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ej: Municipalidad..."
            className="codex-field"
          />
        </div>

        <div className="flex flex-col gap-1 min-w-[180px]">
          <label className="text-xs text-gray-500 font-medium">Proveedor / CUIT</label>
          <input
            type="text"
            value={proveedor}
            onChange={(e) => setProveedor(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Nombre o CUIT..."
            className="codex-field"
          />
        </div>

        <div className="flex flex-col gap-1 min-w-[160px]">
          <label className="text-xs text-gray-500 font-medium">Fuente</label>
          <select
            value={fuente}
            onChange={(e) => setFuente(e.target.value)}
            className="codex-field"
          >
            <option value="">Todas</option>
            <option value="comprasapps_mendoza">ComprasApps Mendoza</option>
            <option value="comprar_mendoza">COMPR.AR Mendoza</option>
            <option value="comprar_nacional">COMPR.AR Nacional</option>
            <option value="ocds_mendoza">OCDS Mendoza</option>
            <option value="boletin_oficial">Boletín Oficial</option>
          </select>
        </div>

        <div className="flex flex-col gap-1 min-w-[150px]">
          <label className="text-xs text-gray-500 font-medium">Categoría</label>
          <input
            type="text"
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Rubro..."
            className="codex-field"
          />
        </div>

        <button
          onClick={() => doSearch(1)}
          disabled={loading}
          className="codex-button codex-button--primary self-end"
        >
          {loading ? 'Buscando…' : 'Buscar'}
        </button>

        {(organismo || proveedor || fuente || categoria) && (
          <button
            onClick={() => {
              setOrganismo(''); setProveedor(''); setFuente(''); setCategoria('');
              setResult(null);
            }}
            className="codex-link-button self-end pb-1.5"
          >
            Limpiar
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="codex-form-error mb-4">{error}</div>
      )}

      {/* Empty / initial state */}
      {!result && !loading && !error && (
        <div className="codex-empty-state">
          Usá los filtros de arriba y hacé clic en <strong>Buscar</strong> para explorar adjudicaciones históricas.
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="codex-empty-state">Cargando…</div>
      )}

      {/* Results */}
      {result && !loading && (
        <>
          <div className="mb-3 text-sm text-gray-500">
            {result.total.toLocaleString('es-AR')} adjudicaciones encontradas — página {result.page} de {result.pages}
          </div>

          {result.items.length === 0 ? (
            <div className="codex-empty-state">
              No se encontraron adjudicaciones con los filtros actuales.
            </div>
          ) : (
            <div className="codex-data-table-wrap">
              <table className="min-w-full text-sm">
                <thead className="text-xs text-gray-500 uppercase border-b border-gray-100 bg-gray-50">
                  <tr>
                    <th className="text-left py-2.5 px-3 font-medium">Objeto / Licitación</th>
                    <th className="text-left py-2.5 px-3 font-medium">Organismo</th>
                    <th className="text-left py-2.5 px-3 font-medium">Adjudicatario</th>
                    <th className="text-left py-2.5 px-2 font-medium">CUIT</th>
                    <th className="text-right py-2.5 px-3 font-medium">Monto ARS</th>
                    <th className="text-left py-2.5 px-3 font-medium">Fecha</th>
                    <th className="text-left py-2.5 px-3 font-medium">Fuente</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {result.items.map((adj) => (
                    <tr key={adj._id} className="hover:bg-blue-50 transition-colors">
                      <td className="py-2.5 px-3 max-w-xs">
                        <div className="truncate text-gray-800 font-medium" title={adj.objeto || undefined}>
                          {adj.objeto || '—'}
                        </div>
                        {adj.category && (
                          <div className="text-xs text-gray-400 mt-0.5 truncate">{adj.category}</div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 max-w-[160px]">
                        <div className="truncate text-gray-700 text-xs" title={adj.organization || undefined}>
                          {adj.organization || '—'}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 max-w-[180px]">
                        <div className="truncate text-gray-800 font-medium" title={adj.adjudicatario}>
                          {adj.adjudicatario}
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-xs text-gray-400 whitespace-nowrap">
                        {adj.supplier_id || '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-semibold whitespace-nowrap text-gray-900"
                        title={adj.monto_adjudicado != null ? `$${adj.monto_adjudicado.toLocaleString('es-AR')}` : undefined}>
                        {fmtMonto(adj.monto_adjudicado)}
                      </td>
                      <td className="py-2.5 px-3 text-xs text-gray-500 whitespace-nowrap">
                        {fmtFecha(adj.fecha_adjudicacion)}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="codex-status">
                          {fmtFuente(adj.fuente)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {result.pages > 1 && (
            <div className="mt-5 flex items-center justify-between gap-3">
              <button
                onClick={() => doSearch(page - 1)}
                disabled={page <= 1 || loading}
                className="codex-button codex-button--quiet disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ← Anterior
              </button>
              <span className="text-sm text-gray-500">
                Página {result.page} de {result.pages}
              </span>
              <button
                onClick={() => doSearch(page + 1)}
                disabled={page >= result.pages || loading}
                className="codex-button codex-button--quiet disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Siguiente →
              </button>
            </div>
          )}
        </>
      )}

      {/* Precios de referencia modal */}
      {modalOpen && (
        <>
          <div className="codex-modal-backdrop" onClick={() => setModalOpen(false)}>
            <div className="codex-modal" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-base font-bold text-gray-900">Precios de referencia</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Buscá por objeto o rubro para ver montos históricos adjudicados
                </p>
              </div>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
            </div>

            <div className="p-5">
              <div className="flex gap-2 mb-4">
                <input
                  type="text"
                  value={precioQ}
                  onChange={(e) => setPrecioQ(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && doPrecioSearch()}
                  placeholder="Ej: informática, mobiliario, vialidad…"
                  className="codex-field flex-1"
                  autoFocus
                />
                <button
                  onClick={doPrecioSearch}
                  disabled={precioLoading}
                  className="codex-button codex-button--primary text-sm disabled:opacity-50"
                >
                  {precioLoading ? 'Buscando…' : 'Buscar'}
                </button>
              </div>

              {precioResults.length === 0 && !precioLoading && precioQ && (
                <div className="text-center text-sm text-gray-400 py-6">
                  Sin resultados para <strong>{precioQ}</strong>
                </div>
              )}

              {precioResults.length > 0 && (
                <div className="codex-data-table-wrap max-h-96 overflow-y-auto">
                  <table className="min-w-full text-sm">
                    <thead className="text-xs text-gray-500 uppercase border-b border-gray-100 sticky top-0 bg-white">
                      <tr>
                        <th className="text-left py-2 pr-3">Objeto</th>
                        <th className="text-right py-2 px-2">Monto</th>
                        <th className="text-left py-2 px-2">Fecha</th>
                        <th className="text-left py-2 pl-2">Organismo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {precioResults.map((r) => (
                        <tr key={r._id} className="hover:bg-gray-50">
                          <td className="py-2 pr-3 max-w-xs">
                            <div className="truncate text-gray-800" title={r.objeto || undefined}>
                              {r.objeto || '—'}
                            </div>
                          </td>
                          <td className="py-2 px-2 text-right font-semibold whitespace-nowrap text-gray-900">
                            {fmtMonto(r.monto_adjudicado)}
                          </td>
                          <td className="py-2 px-2 text-xs text-gray-500 whitespace-nowrap">
                            {fmtFecha(r.fecha_adjudicacion)}
                          </td>
                          <td className="py-2 pl-2 text-xs text-gray-400 truncate max-w-[140px]" title={r.organization || undefined}>
                            {r.organization || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
          </div>
        </>
      )}
    </div>
  );
};

export default AdjudicacionesPage;
