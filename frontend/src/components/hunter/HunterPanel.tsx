import React, { useCallback, useEffect, useRef, useState } from 'react';

/* ── Types ─────────────────────────────────────────────────────────── */

interface HunterMatch {
  id: string;
  title: string;
  fuente: string;
  confidence: string;
  match_type: string;
  budget?: number;
  currency?: string;
  organization?: string;
  fields_available: string[];
  fields_would_fill: string[];
  items_count: number;
  description_preview?: string;
  attached_files_count: number;
  source_url?: string;
}

interface WebSource {
  source: string;
  type: string;
  text?: string;
  size?: number;
  page_title?: string;
  pdf_links?: { url: string; text: string }[];
}

interface HunterResult {
  matches: HunterMatch[];
  adjudicaciones: HunterMatch[];
  web_sources?: WebSource[];
  search_stats: {
    sources_searched: number;
    total_matches: number;
    strategies_used: string[];
  };
}

interface HunterPanelProps {
  licitacionId: string;
  mode: 'detail' | 'cotizar';
  isOpen: boolean;
  onClose: () => void;
  onMerge?: (matchId: string) => void;
  onImportItems?: (items: any[]) => void;
}

/* ── Helpers ────────────────────────────────────────────────────────── */

const fmt = (n?: number, cur?: string) => {
  if (!n) return null;
  const s = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(n);
  return `${cur === 'USD' ? 'U$D' : '$'} ${s}`;
};

const fuenteColor: Record<string, string> = {
  'COMPR.AR Mendoza': 'bg-blue-100 text-blue-700',
  'ComprasApps Mendoza': 'bg-teal-100 text-teal-700',
  'Boletin Oficial Mendoza': 'bg-amber-100 text-amber-700',
  'Boletin Oficial Mendoza (PDF)': 'bg-amber-100 text-amber-700',
};

const confBadge: Record<string, string> = {
  alta: 'bg-emerald-100 text-emerald-700',
  media: 'bg-amber-100 text-amber-700',
  baja: 'bg-gray-100 text-gray-500',
};

/* ── Match Card ─────────────────────────────────────────────────────── */

function MatchCard({ m, mode, onAction, actionLoading, alreadyMerged }: {
  m: HunterMatch;
  mode: 'detail' | 'cotizar';
  onAction: (id: string, action: string) => void;
  actionLoading: string | null;
  alreadyMerged?: boolean;
}) {
  const budgetStr = fmt(m.budget, m.currency);
  const fc = fuenteColor[m.fuente] || 'bg-gray-100 text-gray-600';
  const cc = confBadge[m.confidence] || confBadge.baja;
  const isLoading = actionLoading === m.id;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <h4 className="font-semibold text-gray-900 text-sm leading-tight flex-1">
          {m.title || 'Sin título'}
        </h4>
        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${cc}`}>
          {m.confidence}
        </span>
      </div>

      {/* Fuente + Org */}
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${fc}`}>
          {m.fuente}
        </span>
        {m.organization && (
          <span className="text-[11px] text-gray-500 truncate max-w-[200px]">{m.organization}</span>
        )}
      </div>

      {/* Budget */}
      {budgetStr && (
        <div className="text-lg font-bold text-emerald-700 mb-2">{budgetStr}</div>
      )}

      {/* Badges */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {m.items_count > 0 && (
          <span className="text-[10px] bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full font-medium">
            📦 {m.items_count} items
          </span>
        )}
        {m.attached_files_count > 0 && (
          <span className="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">
            📎 {m.attached_files_count} docs
          </span>
        )}
        {(m.fields_would_fill || []).map(f => (
          <span key={f} className="text-[10px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">
            +{f}
          </span>
        ))}
      </div>

      {/* Description preview */}
      {m.description_preview && (
        <p className="text-xs text-gray-500 mb-3 line-clamp-2">{m.description_preview}</p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        {mode === 'detail' && (
          alreadyMerged ? (
            <span className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-700">
              ✓ Ya fusionado
            </span>
          ) : (
            <button
              onClick={() => onAction(m.id, 'merge')}
              disabled={isLoading}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 transition-colors"
            >
              {isLoading ? '⏳ Fusionando...' : '🔗 Fusionar datos'}
            </button>
          )
        )}
        {mode === 'cotizar' && m.items_count > 0 && (
          <button
            onClick={() => onAction(m.id, 'import')}
            disabled={isLoading}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 transition-colors"
          >
            📥 Importar {m.items_count} items
          </button>
        )}
        <a
          href={`/licitacion/${m.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-gray-500 hover:text-amber-600 px-2 py-1.5"
        >
          👁 Ver
        </a>
      </div>
    </div>
  );
}

/* ── Main Panel ─────────────────────────────────────────────────────── */

export default function HunterPanel({ licitacionId, mode, isOpen, onClose, onMerge, onImportItems }: HunterPanelProps) {
  const [tab, setTab] = useState<'pliego' | 'precios'>('pliego');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<HunterResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [mergedIds, setMergedIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const showToast = (msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const doSearch = useCallback(async (action: string) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/licitaciones/${licitacionId}/hunter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setResult(data);
    } catch (e: any) {
      if (e.name !== 'AbortError') setError(e.message || 'Error de búsqueda');
    } finally {
      setLoading(false);
    }
  }, [licitacionId]);

  useEffect(() => {
    if (isOpen) {
      setResult(null);
      doSearch('search');
      // Load already-merged IDs from licitacion metadata
      fetch(`/api/licitaciones/${licitacionId}`, { credentials: 'include' })
        .then(r => r.json())
        .then(lic => {
          const merges = lic?.metadata?.cross_source_merges || [];
          setMergedIds(new Set(merges.map((m: any) => m.from_id)));
        })
        .catch(() => {});
    }
    return () => abortRef.current?.abort();
  }, [isOpen, doSearch, licitacionId]);

  const handleAction = async (matchId: string, action: string) => {
    setActionLoading(matchId);
    try {
      if (action === 'merge') {
        const res = await fetch(`/api/licitaciones/${licitacionId}/hunter`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ action: 'merge', related_id: matchId }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        showToast(`✓ Fusionado: ${(data.fields_merged || []).join(', ')}`);
        setMergedIds(prev => { const next = new Set(Array.from(prev)); next.add(matchId); return next; });
        onMerge?.(matchId);
      } else if (action === 'import') {
        // Fetch the related item's items
        const res = await fetch(`/api/licitaciones/${matchId}`, { credentials: 'include' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const lic = await res.json();
        const items = lic.items || [];
        if (items.length > 0) {
          onImportItems?.(items);
          showToast(`✓ ${items.length} items importados`);
        } else {
          showToast('No hay items para importar', 'err');
        }
      }
    } catch (e: any) {
      showToast(e.message || 'Error', 'err');
    } finally {
      setActionLoading(null);
    }
  };

  if (!isOpen) return null;

  const stats = result?.search_stats;
  const matches = (result?.matches || []);
  const adjudicaciones = (result?.adjudicaciones || []);
  const exactMatches = matches.filter(m => m.confidence === 'alta');
  const similarMatches = matches.filter(m => m.confidence !== 'alta');
  const allForPrices = [...matches, ...adjudicaciones].filter(m => m.budget);
  const webSources = result?.web_sources || [];
  const hasResults = matches.length > 0 || adjudicaciones.length > 0 || webSources.length > 0;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/25 z-40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed top-0 right-0 h-full w-full sm:w-[460px] bg-white shadow-2xl z-50 flex flex-col animate-slideIn">
        {/* Header */}
        <div className="bg-amber-600 text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🎯</span>
            <div>
              <h2 className="font-bold text-lg leading-tight">HUNTER</h2>
              <p className="text-amber-100 text-xs">Búsqueda cross-source</p>
            </div>
          </div>
          <button onClick={onClose} className="text-amber-200 hover:text-white text-xl p-1">✕</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 bg-gray-50">
          <button
            onClick={() => setTab('pliego')}
            className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
              tab === 'pliego'
                ? 'text-amber-700 border-b-2 border-amber-500 bg-white'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            🔍 Buscar Pliego
          </button>
          <button
            onClick={() => setTab('precios')}
            className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
              tab === 'precios'
                ? 'text-amber-700 border-b-2 border-amber-500 bg-white'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            💰 Comparar Precios
          </button>
        </div>

        {/* Stats bar */}
        {stats && (
          <div className="flex items-center gap-3 px-5 py-2 bg-amber-50 border-b border-amber-100 text-xs text-amber-800">
            <span className="font-semibold">{stats.sources_searched || 0} fuentes</span>
            <span className="text-amber-300">|</span>
            <span className="font-semibold">{stats.total_matches || 0} resultados</span>
            <span className="text-amber-300">|</span>
            <span className="truncate text-amber-600">{(stats.strategies_used || []).join(', ') || 'buscando...'}</span>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Loading */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-12 text-amber-600">
              <div className="w-10 h-10 border-3 border-amber-300 border-t-amber-600 rounded-full animate-spin mb-4" />
              <p className="font-semibold">🎯 Buscando en todas las fuentes...</p>
              <p className="text-xs text-gray-400 mt-1">Esto puede tomar unos segundos</p>
            </div>
          )}

          {/* Error */}
          {error && !loading && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
              ⚠ {error}
              <button onClick={() => doSearch('search')} className="ml-2 underline">Reintentar</button>
            </div>
          )}

          {/* ── TAB: Buscar Pliego ── */}
          {tab === 'pliego' && !loading && !error && (
            <>
              {/* Exact matches */}
              {exactMatches.length > 0 && (
                <section>
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                    Fuentes del proceso
                  </h3>
                  <div className="space-y-3">
                    {exactMatches.map(m => (
                      <MatchCard key={m.id} m={m} mode={mode} onAction={handleAction} actionLoading={actionLoading} alreadyMerged={mergedIds.has(m.id)} />
                    ))}
                  </div>
                </section>
              )}

              {/* Adjudicaciones */}
              {adjudicaciones.length > 0 && (
                <section>
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                    Adjudicaciones con precios
                  </h3>
                  <div className="space-y-3">
                    {adjudicaciones.map(m => (
                      <MatchCard key={m.id} m={m} mode={mode} onAction={handleAction} actionLoading={actionLoading} alreadyMerged={mergedIds.has(m.id)} />
                    ))}
                  </div>
                </section>
              )}

              {/* Similar matches */}
              {similarMatches.length > 0 && (
                <section>
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                    Resultados similares
                  </h3>
                  <div className="space-y-3">
                    {similarMatches.map(m => (
                      <MatchCard key={m.id} m={m} mode={mode} onAction={handleAction} actionLoading={actionLoading} alreadyMerged={mergedIds.has(m.id)} />
                    ))}
                  </div>
                </section>
              )}

              {/* Web sources from description URLs */}
              {(result?.web_sources || []).length > 0 && (
                <section>
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                    🌐 Sitios web relacionados
                  </h3>
                  <div className="space-y-2">
                    {(result?.web_sources || []).map((ws, i) => (
                      <div key={i} className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                            {ws.type === 'pdf' ? '📄 PDF' : '🌐 Web'}
                          </span>
                          {ws.page_title && <span className="text-xs text-gray-700 font-medium">{ws.page_title}</span>}
                        </div>
                        <a href={ws.source} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline break-all">
                          {ws.source}
                        </a>
                        {ws.text && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{ws.text.substring(0, 150)}...</p>}
                        {ws.pdf_links && ws.pdf_links.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {ws.pdf_links.map((pl, j) => (
                              <a key={j} href={pl.url} target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-1 text-xs text-blue-700 hover:underline">
                                📎 {pl.text || 'Descargar PDF'}
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Empty */}
              {!hasResults && !(result?.web_sources || []).length && (
                <div className="text-center py-10">
                  <p className="text-3xl mb-3">🎯</p>
                  <p className="text-gray-600 font-medium">No se encontraron fuentes</p>
                  <p className="text-gray-400 text-sm mt-1">Probá buscar más profundo</p>
                </div>
              )}

              {/* Deep search button */}
              <button
                onClick={() => doSearch('deep_search')}
                disabled={loading}
                className="w-full py-3 text-sm font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl transition-colors disabled:opacity-50"
              >
                🔄 Buscar más profundo
              </button>
            </>
          )}

          {/* ── TAB: Comparar Precios ── */}
          {tab === 'precios' && !loading && !error && (
            <>
              {allForPrices.length > 0 ? (
                <>
                  <section>
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
                      Referencias de precios encontradas
                    </h3>
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-emerald-200">
                            <th className="text-left px-4 py-2 text-emerald-800 font-semibold text-xs">Fuente</th>
                            <th className="text-right px-4 py-2 text-emerald-800 font-semibold text-xs">Presupuesto</th>
                            <th className="text-center px-4 py-2 text-emerald-800 font-semibold text-xs">Confianza</th>
                          </tr>
                        </thead>
                        <tbody>
                          {allForPrices.map((m, i) => (
                            <tr key={m.id} className={i % 2 === 0 ? 'bg-white' : 'bg-emerald-50/50'}>
                              <td className="px-4 py-2">
                                <div className="text-gray-900 text-xs font-medium truncate max-w-[180px]">{m.title}</div>
                                <div className="text-gray-400 text-[10px]">{m.fuente}</div>
                              </td>
                              <td className="px-4 py-2 text-right font-bold text-emerald-700">
                                {fmt(m.budget, m.currency)}
                              </td>
                              <td className="px-4 py-2 text-center">
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${confBadge[m.confidence] || confBadge.baja}`}>
                                  {m.confidence}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  {/* Price range summary */}
                  {(() => {
                    const budgets = allForPrices.map(m => m.budget!).sort((a, b) => a - b);
                    const min = budgets[0];
                    const max = budgets[budgets.length - 1];
                    const median = budgets[Math.floor(budgets.length / 2)];
                    return (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                        <h4 className="text-xs font-bold text-amber-800 uppercase mb-2">💡 Rango sugerido</h4>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-600">Min: {fmt(min)}</span>
                          <span className="font-bold text-amber-700">Mediana: {fmt(median)}</span>
                          <span className="text-gray-600">Max: {fmt(max)}</span>
                        </div>
                        <div className="h-2 bg-amber-200 rounded-full overflow-hidden">
                          <div className="h-full bg-amber-500 rounded-full" style={{ width: '60%' }} />
                        </div>
                        <p className="text-xs text-amber-700 mt-2">
                          Basado en {budgets.length} referencia{budgets.length !== 1 ? 's' : ''} encontrada{budgets.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                    );
                  })()}
                </>
              ) : (
                <div className="text-center py-10">
                  <p className="text-3xl mb-3">💰</p>
                  <p className="text-gray-600 font-medium">No se encontraron precios de referencia</p>
                  <button
                    onClick={() => doSearch('deep_search')}
                    className="mt-3 text-sm text-amber-600 hover:text-amber-700 underline"
                  >
                    🔄 Buscar más profundo
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Toast */}
        {toast && (
          <div className={`absolute bottom-6 left-4 right-4 py-3 px-4 rounded-xl text-sm font-medium shadow-lg text-white ${
            toast.type === 'ok' ? 'bg-emerald-500' : 'bg-red-500'
          }`}>
            {toast.msg}
          </div>
        )}
      </div>

      <style>{`
        @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
        .animate-slideIn { animation: slideIn 0.25s ease-out; }
      `}</style>
    </>
  );
}
