import React, { useCallback } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import WorkflowBadge from '../WorkflowBadge';
import type { Licitacion, SortField } from '../../types/licitacion';
import { getDaysUntilOpening, getUrgencyColor, formatFechaScraping, shareViaEmail, shareViaWhatsApp, copyLink, highlightMatches } from '../../utils/formatting';

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
}

const LicitacionCard: React.FC<LicitacionCardProps> = ({
  lic, sortBy, isFavorite, isNew, isCritical, isUrgent, onToggleFavorite, onRowClick, searchQuery,
}) => {
  const daysUntil = getDaysUntilOpening(lic.opening_date);
  const urgencyClass = getUrgencyColor(daysUntil);

  const handleClick = useCallback(() => onRowClick(lic.id), [lic.id, onRowClick]);
  const handleFavorite = useCallback((e: React.MouseEvent) => onToggleFavorite(lic.id, e), [lic.id, onToggleFavorite]);
  const handleEmail = useCallback((e: React.MouseEvent) => { e.stopPropagation(); shareViaEmail(lic); }, [lic]);
  const handleWhatsApp = useCallback((e: React.MouseEvent) => { e.stopPropagation(); shareViaWhatsApp(lic); }, [lic]);
  const handleCopyLink = useCallback((e: React.MouseEvent) => { e.stopPropagation(); copyLink(lic.id); }, [lic.id]);
  const handlePrint = useCallback((e: React.MouseEvent) => { e.stopPropagation(); window.print(); }, []);
  const handleVerMas = useCallback((e: React.MouseEvent) => { e.stopPropagation(); onRowClick(lic.id); }, [lic.id, onRowClick]);

  return (
    <div
      className="bg-white rounded-2xl shadow-md border border-gray-100 hover:shadow-xl hover:border-gray-200 transition-all duration-300 overflow-hidden group cursor-pointer"
      onClick={handleClick}
    >
      <div className="flex flex-col lg:flex-row">
        {/* Adaptive Date Column */}
        <div className={`lg:w-28 flex-shrink-0 p-4 flex flex-col items-center justify-center border-b lg:border-b-0 lg:border-r border-gray-100 ${
          sortBy === 'budget'
            ? lic.budget != null && lic.budget > 0 ? 'bg-green-50' : 'bg-gray-50'
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
                <span className="text-[10px] font-bold text-green-600 uppercase">
                  {lic.currency === 'USD' ? 'US$' : 'ARS'}
                </span>
                <span className="text-lg font-black text-green-800 leading-tight">
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
                  {format(new Date(lic.fecha_scraping), 'd', { locale: es })}
                </span>
                <span className="text-xs font-bold text-violet-600 uppercase">
                  {format(new Date(lic.fecha_scraping), 'MMM', { locale: es })}
                </span>
                <span className="text-[10px] text-violet-500">
                  {format(new Date(lic.fecha_scraping), 'HH:mm', { locale: es })}
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
        <div className="flex-1 min-w-0 p-5">
          <div className="flex flex-col lg:flex-row gap-4">
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

              <h3 className="text-lg font-black text-blue-700 group-hover:text-blue-800 leading-tight mb-2 line-clamp-2">
                {lic.tipo_procedimiento && <span className="text-slate-600">{lic.tipo_procedimiento} </span>}
                {lic.licitacion_number && <span className="text-blue-600">{lic.licitacion_number}</span>}
              </h3>

              <div className="space-y-0.5 mb-3">
                {lic.jurisdiccion && (
                  <p className="text-sm text-gray-600">Gobierno de la Provincia de {lic.jurisdiccion}</p>
                )}
                <p className="text-sm font-semibold text-gray-700">{searchQuery ? highlightMatches(lic.organization, searchQuery) : lic.organization}</p>
                {lic.metadata?.comprar_unidad_ejecutora && (
                  <p className="text-xs text-gray-500">{lic.metadata.comprar_unidad_ejecutora}</p>
                )}
              </div>

              {lic.budget != null && lic.budget > 0 && (
                <p className="text-sm font-semibold text-green-700 mb-1">
                  {lic.currency === 'USD' ? 'US$ ' : '$ '}
                  {lic.budget.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                </p>
              )}

              <p className="text-base text-gray-800 font-medium leading-relaxed line-clamp-2">
                {searchQuery ? highlightMatches(lic.description || lic.title, searchQuery) : (lic.description || lic.title)}
              </p>
            </div>

            {/* Right column */}
            <div className="lg:w-48 flex-shrink-0 flex flex-col items-end gap-3">
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

          {/* Action Bar */}
          <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-1">
              {formatFechaScraping(lic.fecha_scraping) && (
                <span className="text-[11px] text-gray-400 mr-2">
                  Indexado: {formatFechaScraping(lic.fecha_scraping)}
                </span>
              )}
              <button onClick={handlePrint} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors hidden sm:inline-flex" title="Imprimir">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
              </button>
              <button onClick={handleEmail} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors hidden sm:inline-flex" title="Compartir por email">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </button>
              <button onClick={handleWhatsApp} className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors" title="Compartir por WhatsApp">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
              </button>
              <button onClick={handleFavorite} className={`p-2 rounded-lg transition-colors ${isFavorite ? 'text-yellow-500 bg-yellow-50 hover:bg-yellow-100' : 'text-gray-400 hover:text-yellow-500 hover:bg-yellow-50'}`} title={isFavorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}>
                <svg className="w-5 h-5" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
              </button>
              <button onClick={handleCopyLink} className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors hidden sm:inline-flex" title="Copiar enlace">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                </svg>
              </button>
            </div>

            <div className="flex items-center gap-3">
              <WorkflowBadge state={lic.workflow_state || 'descubierta'} compact />
              {lic.tipo === 'decreto' && (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">Decreto</span>
              )}
              <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                lic.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
              }`}>
                {lic.status === 'active' ? 'Abierta' : 'Cerrada'}
              </span>
              <button onClick={handleVerMas} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-colors flex items-center gap-2">
                Ver mas
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(LicitacionCard);
