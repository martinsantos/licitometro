import React, { useCallback, useEffect, useRef, useState } from 'react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface HunterMatch {
  id: string;
  title: string;
  fuente: string;
  match_type: string;
  confidence: string;
  budget?: number;
  currency?: string;
  organization?: string;
  fields_available: string[];
  fields_would_fill: string[];
  items_count: number;
  description_preview?: string;
  attached_files_count: number;
}

export interface HunterAdjudicacion {
  id: string;
  title: string;
  fuente: string;
  awarded_budget?: number;
  awarded_to?: string;
}

export interface HunterResult {
  matches: HunterMatch[];
  adjudicaciones: HunterAdjudicacion[];
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

/* ------------------------------------------------------------------ */
/*  Inline icons                                                       */
/* ------------------------------------------------------------------ */

const CrosshairIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="4" />
    <line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" />
    <line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" />
  </svg>
);

const CloseIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const MergeIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="18" cy="18" r="3" /><circle cx="6" cy="6" r="3" />
    <path d="M6 21V9a9 9 0 009 9" />
  </svg>
);

const SearchDeepIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    <line x1="11" y1="8" x2="11" y2="14" /><line x1="8" y1="11" x2="14" y2="11" />
  </svg>
);

const CheckIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const CONFIDENCE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  alta:  { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Alta' },
  media: { bg: 'bg-yellow-100',  text: 'text-yellow-700',  label: 'Media' },
  baja:  { bg: 'bg-gray-100',    text: 'text-gray-600',    label: 'Baja' },
};

const FUENTE_COLORS: Record<string, string> = {
  'COMPR.AR Mendoza': '#2563eb',
  'ComprasApps': '#7c3aed',
  'Boletin Oficial': '#dc2626',
  'Godoy Cruz': '#059669',
};

function formatBudget(amount: number, currency?: string): string {
  const symbol = currency === 'USD' ? 'US$' : '$';
  if (amount >= 1_000_000) return `${symbol}${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `${symbol}${(amount / 1_000).toFixed(0)}k`;
  return `${symbol}${amount.toLocaleString('es-AR')}`;
}

const FIELD_LABELS: Record<string, string> = {
  description: 'Descripcion',
  budget: 'Presupuesto',
  opening_date: 'Apertura',
  items: 'Items',
  objeto: 'Objeto',
  organization: 'Organismo',
  expedient_number: 'Expediente',
  licitacion_number: 'Nro. Licitacion',
  attached_files: 'Archivos',
  contact: 'Contacto',
  category: 'Rubro',
};

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

const ConfidenceBadge: React.FC<{ confidence: string }> = ({ confidence }) => {
  const style = CONFIDENCE_STYLES[confidence] ?? CONFIDENCE_STYLES.baja;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase ${style.bg} ${style.text}`}>
      {style.label}
    </span>
  );
};

const FuenteBadge: React.FC<{ fuente: string }> = ({ fuente }) => {
  const color = FUENTE_COLORS[fuente] ?? '#6b7280';
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold"
      style={{ backgroundColor: color + '18', color }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
      {fuente}
    </span>
  );
};

const FieldPill: React.FC<{ field: string }> = ({ field }) => (
  <span className="inline-block px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded text-[10px] font-medium">
    {FIELD_LABELS[field] ?? field}
  </span>
);

/* ------------------------------------------------------------------ */
/*  Match Card                                                         */
/* ------------------------------------------------------------------ */

interface MatchCardProps {
  match: HunterMatch;
  mode: 'detail' | 'cotizar';
  onMerge?: (id: string) => void;
  onImportItems?: (items: any[]) => void;
  merging: string | null;
  merged: Set<string>;
}

const MatchCard: React.FC<MatchCardProps> = ({ match, mode, onMerge, onImportItems, merging, merged }) => {
  const isMerging = merging === match.id;
  const isMerged = merged.has(match.id);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3.5 hover:border-amber-300 hover:shadow-sm transition-all duration-150">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-gray-900 leading-tight line-clamp-2">
            {match.title}
          </h4>
          {match.organization && (
            <p className="text-xs text-gray-500 mt-0.5 truncate">{match.organization}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <FuenteBadge fuente={match.fuente} />
          <ConfidenceBadge confidence={match.confidence} />
        </div>
      </div>

      {/* Description preview */}
      {match.description_preview && (
        <p className="text-xs text-gray-500 line-clamp-2 mb-2 leading-relaxed">
          {match.description_preview}
        </p>
      )}

      {/* Stats row */}
      <div className="flex items-center gap-3 mb-2.5 text-xs text-gray-500">
        {match.budget != null && match.budget > 0 && (
          <span className="font-semibold text-gray-700">
            {formatBudget(match.budget, match.currency)}
          </span>
        )}
        {match.items_count > 0 && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded font-medium">
            {match.items_count} item{match.items_count !== 1 ? 's' : ''}
          </span>
        )}
        {match.attached_files_count > 0 && (
          <span className="inline-flex items-center gap-1">
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
            </svg>
            {match.attached_files_count}
          </span>
        )}
      </div>

      {/* Fields that would fill */}
      {match.fields_would_fill.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-1">
            Campos que aportaria
          </p>
          <div className="flex flex-wrap gap-1">
            {match.fields_would_fill.map((f) => (
              <FieldPill key={f} field={f} />
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        {mode === 'detail' && onMerge && (
          <button
            type="button"
            onClick={() => onMerge(match.id)}
            disabled={isMerging || isMerged}
            className={`
              flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold
              transition-all duration-150
              ${isMerged
                ? 'bg-emerald-50 text-emerald-600 border border-emerald-200 cursor-default'
                : 'bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600 shadow-sm hover:shadow'
              }
              disabled:opacity-60
            `}
          >
            {isMerging ? (
              <>
                <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={3} />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Fusionando...
              </>
            ) : isMerged ? (
              <>
                <CheckIcon className="w-3.5 h-3.5" />
                Fusionado
              </>
            ) : (
              <>
                <MergeIcon className="w-3.5 h-3.5" />
                Fusionar datos
              </>
            )}
          </button>
        )}
        {mode === 'cotizar' && match.items_count > 0 && onImportItems && (
          <button
            type="button"
            onClick={() => onImportItems([{ source_id: match.id, fuente: match.fuente }])}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600 shadow-sm hover:shadow transition-all"
          >
            Importar {match.items_count} item{match.items_count !== 1 ? 's' : ''}
          </button>
        )}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Adjudicacion Card                                                  */
/* ------------------------------------------------------------------ */

const AdjudicacionCard: React.FC<{ adj: HunterAdjudicacion }> = ({ adj }) => (
  <div className="bg-white rounded-lg border border-emerald-200 p-3 hover:shadow-sm transition-all">
    <div className="flex items-start justify-between gap-2 mb-1.5">
      <h4 className="text-sm font-semibold text-gray-900 leading-tight line-clamp-2 flex-1 min-w-0">
        {adj.title}
      </h4>
      <FuenteBadge fuente={adj.fuente} />
    </div>
    <div className="flex items-center gap-3 text-xs">
      {adj.awarded_budget != null && adj.awarded_budget > 0 && (
        <span className="font-bold text-emerald-600 text-sm">
          {formatBudget(adj.awarded_budget)}
        </span>
      )}
      {adj.awarded_to && (
        <span className="text-gray-500 truncate">
          Adjudicado a: <span className="font-medium text-gray-700">{adj.awarded_to}</span>
        </span>
      )}
    </div>
  </div>
);

/* ------------------------------------------------------------------ */
/*  Stats Bar                                                          */
/* ------------------------------------------------------------------ */

const StatsBar: React.FC<{ stats: HunterResult['search_stats'] }> = ({ stats }) => (
  <div className="flex items-center gap-4 px-4 py-2 bg-gray-800/50 border-b border-gray-700 text-[11px] text-gray-400">
    <span>{stats.sources_searched} fuentes</span>
    <span className="w-px h-3 bg-gray-600" />
    <span>{stats.total_matches} resultado{stats.total_matches !== 1 ? 's' : ''}</span>
    <span className="w-px h-3 bg-gray-600" />
    <span className="truncate">
      {stats.strategies_used.join(', ')}
    </span>
  </div>
);

/* ------------------------------------------------------------------ */
/*  Main Panel                                                         */
/* ------------------------------------------------------------------ */

const HunterPanel: React.FC<HunterPanelProps> = ({
  licitacionId,
  mode,
  isOpen,
  onClose,
  onMerge,
  onImportItems,
}) => {
  const [result, setResult] = useState<HunterResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [deepLoading, setDeepLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [merging, setMerging] = useState<string | null>(null);
  const [merged, setMerged] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchHunter = useCallback(async (action: 'search' | 'deep_search') => {
    const isDeep = action === 'deep_search';
    if (isDeep) setDeepLoading(true); else setLoading(true);
    setError(null);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`/api/licitaciones/${licitacionId}/hunter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail ?? `Error ${res.status}`);
      }

      const data: HunterResult = await res.json();
      setResult(data);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err.message ?? 'Error al buscar fuentes');
      }
    } finally {
      if (isDeep) setDeepLoading(false); else setLoading(false);
    }
  }, [licitacionId]);

  // Auto-search on open
  useEffect(() => {
    if (isOpen) {
      setResult(null);
      setMerged(new Set());
      fetchHunter('search');
    }
    return () => { abortRef.current?.abort(); };
  }, [isOpen, fetchHunter]);

  // Toast auto-hide
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleMerge = useCallback(async (matchId: string) => {
    setMerging(matchId);
    try {
      const res = await fetch(`/api/licitaciones/${licitacionId}/hunter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'merge', match_id: matchId }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail ?? `Error ${res.status}`);
      }

      setMerged((prev) => new Set(prev).add(matchId));
      setToast('Datos fusionados correctamente');
      onMerge?.(matchId);
    } catch (err: any) {
      setToast(`Error: ${err.message}`);
    } finally {
      setMerging(null);
    }
  }, [licitacionId, onMerge]);

  // Separate matches by confidence
  const exactMatches = result?.matches.filter((m) => m.confidence === 'alta') ?? [];
  const similarMatches = result?.matches.filter((m) => m.confidence !== 'alta') ?? [];
  const adjudicaciones = result?.adjudicaciones ?? [];
  const hasAnyResults = exactMatches.length > 0 || similarMatches.length > 0 || adjudicaciones.length > 0;

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[440px] md:w-[480px] flex flex-col bg-gray-50 shadow-2xl animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-900 text-white flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-amber-500/20 rounded-lg">
              <CrosshairIcon className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-wide">HUNTER</h2>
              <p className="text-[10px] text-gray-400">Busqueda cross-source</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-700 transition-colors"
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Stats */}
        {result?.search_stats && <StatsBar stats={result.search_stats} />}

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Loading state */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 px-6">
              <div className="relative mb-4">
                <div className="w-14 h-14 rounded-full border-4 border-amber-200 border-t-amber-500 animate-spin" />
                <CrosshairIcon className="absolute inset-0 m-auto w-6 h-6 text-amber-500" />
              </div>
              <p className="text-sm font-semibold text-gray-700">HUNTER buscando en todas las fuentes...</p>
              <p className="text-xs text-gray-400 mt-1">Analizando identificadores y textos</p>
            </div>
          )}

          {/* Error state */}
          {error && !loading && (
            <div className="m-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700 font-medium">{error}</p>
              <button
                type="button"
                onClick={() => fetchHunter('search')}
                className="mt-2 text-xs text-red-600 underline hover:no-underline"
              >
                Reintentar
              </button>
            </div>
          )}

          {/* Results */}
          {!loading && !error && result && (
            <div className="p-4 space-y-5">
              {/* Exact matches */}
              {exactMatches.length > 0 && (
                <section>
                  <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500 mb-2.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    Fuentes del proceso
                    <span className="ml-auto text-[10px] font-medium text-gray-400 normal-case">
                      {exactMatches.length} encontrada{exactMatches.length !== 1 ? 's' : ''}
                    </span>
                  </h3>
                  <div className="space-y-2.5">
                    {exactMatches.map((m) => (
                      <MatchCard
                        key={m.id}
                        match={m}
                        mode={mode}
                        onMerge={handleMerge}
                        onImportItems={onImportItems}
                        merging={merging}
                        merged={merged}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* Adjudicaciones */}
              {adjudicaciones.length > 0 && (
                <section>
                  <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500 mb-2.5">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    Adjudicaciones con precios
                    <span className="ml-auto text-[10px] font-medium text-gray-400 normal-case">
                      {adjudicaciones.length}
                    </span>
                  </h3>
                  <div className="space-y-2">
                    {adjudicaciones.map((a) => (
                      <AdjudicacionCard key={a.id} adj={a} />
                    ))}
                  </div>
                </section>
              )}

              {/* Similar matches */}
              {similarMatches.length > 0 && (
                <section>
                  <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500 mb-2.5">
                    <span className="w-2 h-2 rounded-full bg-gray-300" />
                    Resultados similares
                    <span className="ml-auto text-[10px] font-medium text-gray-400 normal-case">
                      {similarMatches.length}
                    </span>
                  </h3>
                  <div className="space-y-2">
                    {similarMatches.map((m) => (
                      <MatchCard
                        key={m.id}
                        match={m}
                        mode={mode}
                        onMerge={handleMerge}
                        onImportItems={onImportItems}
                        merging={merging}
                        merged={merged}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* Empty state */}
              {!hasAnyResults && (
                <div className="flex flex-col items-center py-12 px-6 text-center">
                  <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                    <CrosshairIcon className="w-8 h-8 text-gray-300" />
                  </div>
                  <p className="text-sm font-medium text-gray-600">
                    No se encontraron fuentes adicionales
                  </p>
                  <p className="text-xs text-gray-400 mt-1 mb-5">
                    Intenta una busqueda mas profunda por titulo y texto
                  </p>
                  <button
                    type="button"
                    onClick={() => fetchHunter('deep_search')}
                    disabled={deepLoading}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border-2 border-amber-300 text-amber-700 hover:bg-amber-50 transition-colors disabled:opacity-50"
                  >
                    {deepLoading ? (
                      <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={3} />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    ) : (
                      <SearchDeepIcon className="w-4 h-4" />
                    )}
                    Buscar mas profundo
                  </button>
                </div>
              )}

              {/* Deep search button when there ARE results but user wants more */}
              {hasAnyResults && (
                <div className="pt-2 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() => fetchHunter('deep_search')}
                    disabled={deepLoading}
                    className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-gray-500 hover:text-amber-600 hover:bg-amber-50 transition-colors disabled:opacity-50"
                  >
                    {deepLoading ? (
                      <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={3} />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    ) : (
                      <SearchDeepIcon className="w-3.5 h-3.5" />
                    )}
                    Buscar mas profundo
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Toast */}
        {toast && (
          <div className={`
            absolute bottom-4 left-4 right-4
            px-4 py-3 rounded-lg shadow-lg text-sm font-medium
            animate-fade-in-up
            ${toast.startsWith('Error')
              ? 'bg-red-600 text-white'
              : 'bg-emerald-600 text-white'
            }
          `}>
            {toast}
          </div>
        )}
      </div>

      {/* Keyframe animations injected via style tag */}
      <style>{`
        @keyframes slide-in-right {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-slide-in-right {
          animation: slide-in-right 0.25s ease-out;
        }
        .animate-fade-in-up {
          animation: fade-in-up 0.2s ease-out;
        }
      `}</style>
    </>
  );
};

export default React.memo(HunterPanel);
