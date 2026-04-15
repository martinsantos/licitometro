import React, { useCallback, useEffect, useRef, useState } from 'react';

/* ── Types ── */

interface PliegoDoc {
  name: string; url: string; type: string; priority: number; label: string; source: string;
}
interface RefItem {
  id: string; title: string; organization: string; fuente: string; budget?: number; currency?: string;
  items_count: number; adjudicatario?: string; monto_adjudicado?: number; confidence: string;
  fecha_adjudicacion?: string; match_type?: string;
}
interface Proveedor { name: string; count: number; total: number; }
interface Antecedente {
  id: string; title: string; organization: string; category?: string; budget?: number;
  budget_adjusted?: number; detail_url?: string; image_url?: string; vinculado?: boolean;
}
interface HunterResult {
  pliego?: { documents: PliegoDoc[]; text_extracted: string; hint: string; metadata: any[]; };
  inteligencia?: { referencias: RefItem[]; adjudicaciones: RefItem[]; price_range?: { min: number; median: number; max: number; sample_size: number }; proveedores: Proveedor[]; };
  antecedentes?: { empresa: Antecedente[]; licitaciones: RefItem[]; };
}
interface HunterPanelProps {
  licitacionId: string; mode: 'detail' | 'cotizar'; isOpen: boolean; onClose: () => void;
  onMerge?: (id: string) => void; onImportItems?: (items: any[]) => void;
  initialTab?: 'pliego' | 'inteligencia' | 'antecedentes';
}

const fmt = (n?: number, cur?: string) => {
  if (!n) return null;
  const s = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(n);
  return `${cur === 'USD' ? 'U$D' : '$'} ${s}`;
};

const fuenteColor: Record<string, string> = {
  'COMPR.AR Mendoza': 'bg-blue-100 text-blue-700', 'ComprasApps Mendoza': 'bg-teal-100 text-teal-700',
  'Boletin Oficial Mendoza': 'bg-amber-100 text-amber-700', 'contrataciones_abiertas_mendoza_ocds': 'bg-violet-100 text-violet-700',
};

export default function HunterPanel({ licitacionId, mode, isOpen, onClose, onMerge, onImportItems, initialTab }: HunterPanelProps) {
  const [tab, setTab] = useState<'pliego' | 'inteligencia' | 'antecedentes'>(initialTab || 'pliego');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<HunterResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const showToast = (msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3500);
  };

  const doSearch = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/cotizar-ai/hunter-unified', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ licitacion_id: licitacionId, action: 'full' }), signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setResult(await res.json());
    } catch (e: any) {
      if (e.name !== 'AbortError') setError(e.message || 'Error');
    } finally { setLoading(false); }
  }, [licitacionId]);

  useEffect(() => {
    if (isOpen) { setResult(null); doSearch(); }
    return () => abortRef.current?.abort();
  }, [isOpen, doSearch]);

  if (!isOpen) return null;

  const pliego = result?.pliego;
  const intel = result?.inteligencia;
  const ants = result?.antecedentes;

  return (
    <>
      <div className="fixed inset-0 bg-black/25 z-40" onClick={onClose} />
      <div className="fixed top-0 right-0 h-full w-full sm:w-[480px] bg-white shadow-2xl z-50 flex flex-col animate-slideIn">
        {/* Header */}
        <div className="bg-amber-600 text-white px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl">🎯</span>
            <div>
              <h2 className="font-bold text-lg leading-tight">HUNTER</h2>
              <p className="text-amber-100 text-xs">Investigacion de mercado</p>
            </div>
          </div>
          <button onClick={onClose} className="text-amber-200 hover:text-white text-xl p-1">✕</button>
        </div>

        {/* 3 Tabs */}
        <div className="flex border-b border-gray-200 bg-gray-50">
          {([
            ['pliego', '📄 Pliego'],
            ['inteligencia', '💰 Inteligencia'],
            ['antecedentes', '🏢 Antecedentes'],
          ] as [string, string][]).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key as any)}
              className={`flex-1 py-2 text-xs font-semibold transition-colors ${
                tab === key ? 'text-amber-700 border-b-2 border-amber-500 bg-white' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {label}
              {key === 'pliego' && pliego && pliego.documents.length > 0 && (
                <span className="ml-1 bg-emerald-100 text-emerald-700 px-1 py-0.5 rounded-full text-[9px]">{pliego.documents.length}</span>
              )}
              {key === 'inteligencia' && intel && (intel.referencias.length + intel.adjudicaciones.length) > 0 && (
                <span className="ml-1 bg-blue-100 text-blue-700 px-1 py-0.5 rounded-full text-[9px]">{intel.referencias.length + intel.adjudicaciones.length}</span>
              )}
              {key === 'antecedentes' && ants && ants.empresa.length > 0 && (
                <span className="ml-1 bg-purple-100 text-purple-700 px-1 py-0.5 rounded-full text-[9px]">{ants.empresa.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {loading && (
            <div className="flex flex-col items-center py-12 text-amber-600">
              <div className="w-8 h-8 border-3 border-amber-300 border-t-amber-600 rounded-full animate-spin mb-3" />
              <p className="font-semibold text-sm">Buscando en todas las fuentes...</p>
            </div>
          )}
          {error && !loading && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-xs">
              {error} <button onClick={doSearch} className="ml-2 underline">Reintentar</button>
            </div>
          )}

          {/* ═══ TAB: PLIEGO ═══ */}
          {tab === 'pliego' && !loading && pliego && (
            <>
              {pliego.documents.length > 0 ? (
                <div className="space-y-1.5">
                  {pliego.documents.map((p, i) => (
                    <a key={i} href={p.url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 hover:bg-blue-50 transition-colors text-xs">
                      <span className="text-red-500">📄</span>
                      <span className="flex-1 font-medium text-gray-800 truncate">{p.name}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${p.priority <= 3 ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{p.label}</span>
                    </a>
                  ))}
                </div>
              ) : (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                  <p className="text-xs font-semibold text-amber-800">No se encontraron pliegos</p>
                  <ul className="text-[10px] text-amber-700 space-y-1 list-disc list-inside">
                    <li>URLs del portal de compras pueden haber expirado</li>
                    <li>Contrataciones Directas pueden no publicarse en vista publica</li>
                  </ul>
                  <div className="flex gap-2 pt-1">
                    <a href="https://comprar.mendoza.gov.ar" target="_blank" rel="noopener noreferrer"
                      className="text-[10px] px-2 py-1 bg-white border border-amber-300 text-amber-700 rounded hover:bg-amber-50">COMPR.AR</a>
                    <a href="https://comprasapps.mendoza.gov.ar" target="_blank" rel="noopener noreferrer"
                      className="text-[10px] px-2 py-1 bg-white border border-amber-300 text-amber-700 rounded hover:bg-amber-50">ComprasApps</a>
                  </div>
                </div>
              )}
              {pliego.text_extracted && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <p className="text-[10px] font-semibold text-gray-500 uppercase mb-1">Texto del pliego ({pliego.text_extracted.length} chars)</p>
                  <p className="text-xs text-gray-600 line-clamp-4">{pliego.text_extracted.substring(0, 300)}...</p>
                </div>
              )}
              {pliego.hint && <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">{pliego.hint}</p>}
            </>
          )}

          {/* ═══ TAB: INTELIGENCIA ═══ */}
          {tab === 'inteligencia' && !loading && intel && (
            <>
              {/* Price range */}
              {intel.price_range && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                  <p className="text-[10px] font-semibold text-emerald-800 uppercase mb-2">Rango de precios ({intel.price_range.sample_size} refs)</p>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-600">Min: {fmt(intel.price_range.min)}</span>
                    <span className="font-bold text-emerald-700">Mediana: {fmt(intel.price_range.median)}</span>
                    <span className="text-gray-600">Max: {fmt(intel.price_range.max)}</span>
                  </div>
                  <div className="h-1.5 bg-emerald-200 rounded-full"><div className="h-full bg-emerald-500 rounded-full" style={{ width: '60%' }} /></div>
                </div>
              )}

              {/* Adjudicaciones */}
              {intel.adjudicaciones.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-gray-500 uppercase mb-2">Adjudicaciones ({intel.adjudicaciones.length})</p>
                  <div className="space-y-2">
                    {intel.adjudicaciones.map(a => (
                      <div key={a.id} className="bg-white border border-gray-200 rounded-lg p-3">
                        <p className="text-xs font-semibold text-gray-900 truncate">{a.title}</p>
                        <p className="text-[10px] text-gray-500">{a.organization}</p>
                        <div className="flex items-center justify-between mt-1.5">
                          <div>
                            {a.adjudicatario && <span className="text-[10px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded font-medium mr-1">🏆 {a.adjudicatario}</span>}
                            {a.monto_adjudicado && <span className="text-xs font-bold text-emerald-700">{fmt(a.monto_adjudicado)}</span>}
                            {!a.monto_adjudicado && a.budget && <span className="text-xs font-bold text-emerald-700">{fmt(a.budget)}</span>}
                          </div>
                          <div className="flex items-center gap-1">
                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${fuenteColor[a.fuente] || 'bg-gray-100 text-gray-600'}`}>{a.fuente}</span>
                            <a href={`/licitacion/${a.id}`} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-600 hover:underline">Ver</a>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Proveedores frecuentes */}
              {intel.proveedores.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-gray-500 uppercase mb-2">Proveedores frecuentes</p>
                  <div className="space-y-1">
                    {intel.proveedores.slice(0, 5).map(p => (
                      <div key={p.name} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-xs">
                        <span className="font-medium text-gray-800">{p.name}</span>
                        <span className="text-gray-500">{p.count} adj. {p.total > 0 && `· ${fmt(p.total)}`}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Referencias */}
              {intel.referencias.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-gray-500 uppercase mb-2">Referencias de precios ({intel.referencias.length})</p>
                  <div className="space-y-1.5">
                    {intel.referencias.slice(0, 10).map(r => (
                      <div key={r.id} className="flex items-center justify-between bg-white border border-gray-100 rounded-lg px-3 py-2 text-xs">
                        <div className="flex-1 min-w-0 mr-2">
                          <p className="text-gray-800 font-medium truncate">{r.title}</p>
                          <p className="text-[10px] text-gray-400">{r.organization} · {r.fuente}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="font-bold text-emerald-700">{fmt(r.budget, r.currency)}</span>
                          {r.items_count > 0 && <span className="text-[9px] text-purple-600 ml-1">{r.items_count}it</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!intel.price_range && intel.referencias.length === 0 && intel.adjudicaciones.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-2xl mb-2">💰</p>
                  <p className="text-gray-500 text-sm">No se encontraron referencias de precios</p>
                </div>
              )}
            </>
          )}

          {/* ═══ TAB: ANTECEDENTES ═══ */}
          {tab === 'antecedentes' && !loading && ants && (
            <>
              {ants.empresa.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold text-gray-500 uppercase">Proyectos de la empresa ({ants.empresa.length})</p>
                  {ants.empresa.map(a => (
                    <div key={a.id} className={`bg-white border rounded-lg p-3 ${a.vinculado ? 'border-emerald-300 bg-emerald-50/30' : 'border-gray-200'}`}>
                      <div className="flex items-start gap-2">
                        {a.image_url && (
                          <img src={a.image_url} alt="" className="w-12 h-9 object-cover rounded border border-gray-200 shrink-0"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        )}
                        <div className="flex-1 min-w-0">
                          {a.detail_url ? (
                            <a href={a.detail_url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-blue-700 hover:underline leading-tight">{a.title}</a>
                          ) : (
                            <p className="text-xs font-semibold text-gray-900 leading-tight">{a.title}</p>
                          )}
                          <p className="text-[10px] text-gray-500 mt-0.5">{a.organization}</p>
                          <div className="flex items-center gap-1.5 mt-1">
                            {a.category && <span className="text-[9px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">{a.category}</span>}
                            {(a.budget_adjusted || a.budget) && <span className="text-[9px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-medium">{fmt(a.budget_adjusted || a.budget)}</span>}
                            {a.vinculado && <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-medium">Vinculado</span>}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-2xl mb-2">🏢</p>
                  <p className="text-gray-500 text-sm">No se encontraron antecedentes relevantes</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Toast */}
        {toast && (
          <div className={`absolute bottom-6 left-4 right-4 py-3 px-4 rounded-xl text-sm font-medium shadow-lg text-white ${toast.type === 'ok' ? 'bg-emerald-500' : 'bg-red-500'}`}>
            {toast.msg}
          </div>
        )}
      </div>
      <style>{`@keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } } .animate-slideIn { animation: slideIn 0.25s ease-out; }`}</style>
    </>
  );
}
