import React, { useCallback } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import WorkflowBadge from '../WorkflowBadge';
import type { Licitacion, SortField, Nodo } from '../../types/licitacion';
import NodoBadge from '../nodos/NodoBadge';
import { EstadoBadge } from './EstadoBadge';
import { getDaysUntilOpening, getUrgencyColor, formatFechaScraping, parseUTCDate, shareViaEmail, shareViaWhatsApp, copyLink, highlightMatches } from '../../utils/formatting';

interface LicitacionCardProps {
  lic: Licitacion;
  sortBy: SortField;
  isFavorite: boolean;
  isNew: boolean;
  isCritical: boolean;
  isUrgent: boolean;
  onToggleFavorite: (id: string, e: React.MouseEvent) => void;
  onRowClick: (id: string) => void;
  searchQuery?: string;
  nodoMap?: Record<string, Nodo>;
}

const LicitacionCard: React.FC<LicitacionCardProps> = ({
  lic, sortBy, isFavorite, isNew, isCritical, isUrgent, onToggleFavorite, onRowClick, searchQuery, nodoMap,
}) => {
  const daysUntil = getDaysUntilOpening(lic.opening_date);
  const urgencyClass = getUrgencyColor(daysUntil);

  const handleClick = useCallback(() => onRowClick(lic.id), [lic.id, onRowClick]);
  const handleFavorite = useCallback((e: React.MouseEvent) => onToggleFavorite(lic.id, e), [lic.id, onToggleFavorite]);
  const handleEmail = useCallback((e: React.MouseEvent) => { e.stopPropagation(); shareViaEmail(lic); }, [lic]);
  const handleWhatsApp = useCallback((e: React.MouseEvent) => { e.stopPropagation(); shareViaWhatsApp(lic); }, [lic]);
  const handleCopyLink = useCallback((e: React.MouseEvent) => { e.stopPropagation(); copyLink(lic.id); }, [lic.id]);

  return (
    <div
      className="bg-white rounded-2xl shadow-md border border-gray-100 hover:shadow-xl hover:border-gray-200 transition-all duration-300 overflow-hidden group cursor-pointer"
      onClick={handleClick}
    >
      <div className="flex flex-col lg:flex-row">
        {/* Mobile apertura countdown — visible only on mobile when sorting by opening_date */}
        {sortBy === 'opening_date' && (
          <div className={`flex lg:hidden items-center gap-3 px-4 py-2.5 border-b border-gray-100 ${
            daysUntil !== null ? urgencyClass : 'bg-amber-50'
          }`}>
            {daysUntil !== null ? (
              <>
                <span className="text-2xl font-black leading-none">{Math.abs(daysUntil)}</span>
                <div className="flex flex-col">
                  <span className="text-xs font-bold leading-tight">
                    {daysUntil < 0 ? 'dias pasado' : daysUntil === 0 ? 'HOY' : 'dias para apertura'}
                  </span>
                  <span className="text-[10px] font-medium opacity-70">
                    {format(new Date(lic.opening_date), 'dd/MM/yyyy', { locale: es })}
                  </span>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <span className="text-xs font-bold text-amber-600">Sin fecha de apertura</span>
              </div>
            )}
          </div>
        )}

        {/* Adaptive Date Column — desktop only */}
        <div className={`hidden lg:flex lg:w-28 flex-shrink-0 p-4 flex-col items-center justify-center lg:border-r border-gray-100 ${
          sortBy === 'budget'
            ? lic.budget != null && lic.budget > 0
              ? lic.metadata?.budget_source === 'estimated_from_pliego' ? 'bg-amber-50' : 'bg-green-50'
              : 'bg-gray-50'
            : sortBy === 'opening_date' && daysUntil !== null
            ? urgencyClass
            : sortBy === 'opening_date' && daysUntil === null
            ? 'bg-amber-50'
            : sortBy === 'fecha_scraping'
            ? 'bg-violet-50'
            : 'bg-slate-50'
        }`}>
          {sortBy === 'budget' ? (
            lic.budget != null && lic.budget > 0 ? (
              <>
                <span className={`text-[10px] font-bold uppercase ${lic.metadata?.budget_source === 'estimated_from_pliego' ? 'text-amber-600' : 'text-green-600'}`}>
                  {lic.metadata?.budget_source === 'estimated_from_pliego' ? '~' : ''}{lic.currency === 'USD' ? 'US$' : 'ARS'}
                </span>
                <span className={`text-lg font-black leading-tight ${lic.metadata?.budget_source === 'estimated_from_pliego' ? 'text-amber-800' : 'text-green-800'}`}>
                  {lic.budget >= 1_000_000
                    ? `${(lic.budget / 1_000_000).toFixed(1)}M`
                    : lic.budget >= 1_000
                    ? `${(lic.budget / 1_000).toFixed(0)}K`
                    : lic.budget.toLocaleString('es-AR')}
                </span>
              </>
            ) : (
              <span className="text-[10px] font-bold text-gray-400 leading-tight block text-center">SIN<br/>MONTO</span>
            )
          ) : sortBy === 'opening_date' ? (
            daysUntil !== null ? (
              <>
                <span className="text-3xl font-black">{Math.abs(daysUntil)}</span>
                <span className="text-xs font-bold">
                  {daysUntil < 0 ? 'dias pasado' : daysUntil === 0 ? 'HOY' : 'dias'}
                </span>
                <span className="mt-1 text-[10px] font-medium opacity-70">
                  {format(new Date(lic.opening_date), 'dd/MM', { locale: es })}
                </span>
              </>
            ) : (
              <div className="text-center">
                <svg className="w-5 h-5 text-amber-500 mx-auto mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <span className="text-[10px] font-bold text-amber-600 leading-tight block">SIN<br/>APERTURA</span>
              </div>
            )
          ) : sortBy === 'fecha_scraping' ? (
            lic.fecha_scraping ? (
              <>
                <span className="text-[10px] font-bold text-violet-600 uppercase">Indexado</span>
                <span className="text-lg font-black text-violet-800">
                  {format(parseUTCDate(lic.fecha_scraping), 'd', { locale: es })}
                </span>
                <span className="text-xs font-bold text-violet-600 uppercase">
                  {format(parseUTCDate(lic.fecha_scraping), 'MMM', { locale: es })}
                </span>
                <span className="text-[10px] text-violet-500">
                  {format(parseUTCDate(lic.fecha_scraping), 'HH:mm', { locale: es })}
                </span>
              </>
            ) : (
              <span className="text-sm text-gray-400">Sin datos</span>
            )
          ) : (
            lic.publication_date ? (
              <>
                <span className="text-2xl font-black text-slate-800">
                  {format(new Date(lic.publication_date), 'd', { locale: es })}
                </span>
                <span className="text-sm font-bold text-slate-600 uppercase">
                  {format(new Date(lic.publication_date), 'MMM', { locale: es })}
                </span>
                <span className="text-xs text-slate-500">
                  {format(new Date(lic.publication_date), 'yyyy', { locale: es })}
                </span>
              </>
            ) : (
              <span className="text-sm text-slate-400">Sin fecha</span>
            )
          )}
        </div>

        {/* Main Content */}
        <div className="flex-1 min-w-0 p-4 lg:p-5">
          <div className="flex flex-col lg:flex-row gap-3 lg:gap-4">
            <div className="flex-1 min-w-0">
              {/* Badges */}
              {(isNew || isCritical || isUrgent) && (
                <div className="flex items-center gap-2 mb-2">
                  {isNew && (
                    <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-[10px] font-black uppercase tracking-wide animate-pulse">
                      NUEVO
                    </span>
                  )}
                  {isCritical && (
                    <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-[10px] font-black uppercase tracking-wide">
                      Rubro Critico
                    </span>
                  )}
                  {isUrgent && (
                    <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded text-[10px] font-black uppercase tracking-wide animate-pulse">
                      Urgente
                    </span>
                  )}
                </div>
              )}

              {/* Nodo badges */}
              {nodoMap && lic.nodos && lic.nodos.length > 0 && (
                <div className="flex items-center gap-1 mb-1 flex-wrap">
                  {lic.nodos.slice(0, 2).map(nid => {
                    const nodo = nodoMap[nid];
                    return nodo ? <NodoBadge key={nid} name={nodo.name} color={nodo.color} small /> : null;
                  })}
                  {lic.nodos.length > 2 && (
                    <span className="text-[9px] text-gray-400 font-bold">+{lic.nodos.length - 2}</span>
                  )}
                </div>
              )}

              {/* Badge: tipo + numero (secondary line) */}
              {(lic.tipo_procedimiento || lic.licitacion_number) && (
                <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                  {lic.tipo_procedimiento && (
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                      {lic.tipo_procedimiento}
                    </span>
                  )}
                  {lic.licitacion_number && (
                    <span className="text-[10px] font-mono text-blue-500">
                      {lic.licitacion_number}
                    </span>
                  )}
                </div>
              )}

              {/* Estado badge */}
              {lic.estado && (
                <div className="mb-1.5">
                  <EstadoBadge estado={lic.estado as 'vigente' | 'vencida' | 'prorrogada' | 'archivada'} />
                </div>
              )}

              {/* Descriptive title = main heading */}
              <h3 className="text-base font-black text-gray-900 group-hover:text-blue-700 leading-tight mb-1.5 line-clamp-2">
                {searchQuery ? highlightMatches(lic.objeto || lic.title, searchQuery) : (lic.objeto || lic.title)}
              </h3>

              {/* Organization + meta */}
              <div className="space-y-0.5 mb-2">
                {lic.jurisdiccion && (
                  <p className="text-xs text-gray-500">Gobierno de la Provincia de {lic.jurisdiccion}</p>
                )}
                <p className="text-sm font-semibold text-gray-700">
                  {searchQuery ? highlightMatches(lic.organization, searchQuery) : lic.organization}
                </p>
                {lic.metadata?.comprar_unidad_ejecutora && (
                  <p className="text-xs text-gray-500">{lic.metadata.comprar_unidad_ejecutora}</p>
                )}
              </div>

              {/* Budget */}
              {lic.budget != null && lic.budget > 0 && (
                <div className="flex items-center gap-1.5 mb-1">
                  <p className={`text-sm font-semibold ${lic.metadata?.budget_source === 'estimated_from_pliego' ? 'text-amber-700' : 'text-green-700'}`}>
                    {lic.metadata?.budget_source === 'estimated_from_pliego' ? '~' : ''}
                    {lic.currency === 'USD' ? 'US$ ' : '$ '}
                    {lic.budget.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                  </p>
                  {lic.metadata?.budget_source === 'estimated_from_pliego' && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded uppercase">
                      Proyectado
                    </span>
                  )}
                </div>
              )}

              {/* Prórroga indicator */}
              {lic.estado === 'prorrogada' && lic.fecha_prorroga && (
                <div className="flex items-center gap-1.5 mb-1.5">
                  <svg className="w-4 h-4 text-yellow-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm text-yellow-700 font-semibold">
                    Prorrogada hasta {format(new Date(lic.fecha_prorroga), 'dd/MM/yyyy', { locale: es })}
                  </span>
                </div>
              )}

              {/* Description (only if it adds info beyond the heading) */}
              {lic.description && lic.description !== (lic.objeto || lic.title) && (
                <p className="text-sm text-gray-600 leading-relaxed line-clamp-2">
                  {searchQuery ? highlightMatches(lic.description, searchQuery) : lic.description}
                </p>
              )}
            </div>

            {/* Right column - hidden on mobile, shown inline on desktop */}
            <div className="hidden lg:flex lg:w-48 flex-shrink-0 flex-col items-end gap-3">
              <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-lg text-sm font-bold">
                {lic.jurisdiccion || lic.location || 'Argentina'}
              </span>

              {sortBy === 'opening_date' ? (
                lic.publication_date && (
                  <div className="text-right">
                    <span className="text-[10px] text-gray-400 block">Publicado</span>
                    <span className="text-xs font-bold text-gray-600">
                      {format(new Date(lic.publication_date), 'dd/MM/yy', { locale: es })}
                    </span>
                  </div>
                )
              ) : (
                daysUntil !== null && (
                  <div className={`px-3 py-2 rounded-lg text-center ${urgencyClass}`}>
                    <span className="text-xl font-black">{Math.abs(daysUntil)}</span>
                    <span className="text-xs font-medium block">
                      {daysUntil < 0 ? 'dias pasado' : daysUntil === 0 ? 'HOY' : 'dias'}
                    </span>
                  </div>
                )
              )}

              <span className="px-2 py-1 bg-violet-50 text-violet-700 rounded text-xs font-bold">
                {lic.fuente || 'Fuente'}
              </span>
            </div>
          </div>

          {/* Mobile meta row */}
          <div className="flex flex-wrap items-center gap-1.5 mt-2 lg:hidden">
            <span className="px-2 py-0.5 bg-violet-50 text-violet-700 rounded text-[10px] font-bold">{lic.fuente || 'Fuente'}</span>
            <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px] font-bold">{lic.jurisdiccion || 'Argentina'}</span>
            {daysUntil !== null && (
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${urgencyClass}`}>
                {daysUntil <= 0 ? (daysUntil === 0 ? 'Abre HOY' : `Cerró hace ${Math.abs(daysUntil)}d`) : `Abre en ${daysUntil}d`}
              </span>
            )}
          </div>

          {/* Action Bar */}
          <div className="mt-3 pt-3 lg:mt-4 lg:pt-4 border-t border-gray-100 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 min-w-0 overflow-hidden">
              {formatFechaScraping(lic.fecha_scraping) && (
                <span className="text-[10px] lg:text-[11px] text-gray-400 mr-1 flex-shrink-0">
                  {formatFechaScraping(lic.fecha_scraping)}
                </span>
              )}
              <button onClick={handleWhatsApp} className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors flex-shrink-0" title="WhatsApp">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
              </button>
              <button onClick={handleFavorite} className={`p-1.5 rounded-lg transition-colors flex-shrink-0 ${isFavorite ? 'text-yellow-500 bg-yellow-50' : 'text-gray-400 hover:text-yellow-500 hover:bg-yellow-50'}`} title="Favorito">
                <svg className="w-4 h-4" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
              </button>
              <button onClick={handleEmail} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors hidden sm:inline-flex flex-shrink-0" title="Email">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </button>
              <button onClick={handleCopyLink} className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors hidden sm:inline-flex flex-shrink-0" title="Copiar enlace">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                </svg>
              </button>
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0">
              <WorkflowBadge state={lic.workflow_state || 'descubierta'} compact />
              <span className={`px-2 py-0.5 rounded-full text-[10px] lg:text-xs font-bold ${
                lic.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
              }`}>
                {lic.status === 'active' ? 'Abierta' : 'Cerrada'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(LicitacionCard);
