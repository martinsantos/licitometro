import React, { useCallback } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Licitacion } from '../../types/licitacion';
import { getDaysUntilOpening, getUrgencyColor, shareViaWhatsApp, highlightMatches } from '../../utils/formatting';

interface LicitacionTableProps {
  licitaciones: Licitacion[];
  favorites: Set<string>;
  onToggleFavorite: (id: string, e: React.MouseEvent) => void;
  onRowClick: (id: string) => void;
  isNewItem: (lic: Licitacion) => boolean;
  searchQuery?: string;
}

const LicitacionTable: React.FC<LicitacionTableProps> = ({
  licitaciones, favorites, onToggleFavorite, onRowClick, isNewItem, searchQuery,
}) => {
  const handleWhatsApp = useCallback((lic: Licitacion, e: React.MouseEvent) => {
    e.stopPropagation();
    shareViaWhatsApp(lic);
  }, []);

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-gray-100">
              <th className="px-4 py-4 text-xs font-black text-gray-400 uppercase">Fecha</th>
              <th className="px-4 py-4 text-xs font-black text-gray-400 uppercase">Titulo / Descripcion</th>
              <th className="px-4 py-4 text-xs font-black text-gray-400 uppercase">Organizacion</th>
              <th className="px-4 py-4 text-xs font-black text-gray-400 uppercase">Apertura</th>
              <th className="px-3 py-4 text-xs font-black text-gray-400 uppercase text-center">Dias</th>
              <th className="px-4 py-4 text-xs font-black text-gray-400 uppercase">Estado</th>
              <th className="px-3 py-4 text-xs font-black text-gray-400 uppercase">Indexado</th>
              <th className="px-4 py-4 text-xs font-black text-gray-400 uppercase text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {licitaciones.map((lic) => {
              const tableDays = getDaysUntilOpening(lic.opening_date);
              const tableUrgency = getUrgencyColor(tableDays);
              return (
                <tr
                  key={lic.id}
                  className="hover:bg-slate-50 transition-colors cursor-pointer"
                  onClick={() => onRowClick(lic.id)}
                >
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div className="text-sm font-bold text-gray-800">
                      {lic.publication_date ? format(new Date(lic.publication_date), 'dd/MM/yy', { locale: es }) : '-'}
                    </div>
                  </td>
                  <td className="px-4 py-4 max-w-md">
                    <div className="flex items-center gap-1.5">
                      {isNewItem(lic) && (
                        <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-[9px] font-black uppercase flex-shrink-0">NUEVO</span>
                      )}
                      <p className="text-sm font-bold text-gray-900 line-clamp-1">{searchQuery ? highlightMatches(lic.objeto || lic.title, searchQuery) : (lic.objeto || lic.title)}</p>
                    </div>
                    <p className="text-xs text-gray-500 line-clamp-1">{searchQuery && lic.description ? highlightMatches(lic.description, searchQuery) : lic.description}</p>
                  </td>
                  <td className="px-4 py-4">
                    <p className="text-sm text-gray-700 line-clamp-1">{searchQuery ? highlightMatches(lic.organization, searchQuery) : lic.organization}</p>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-600">
                      {lic.opening_date ? format(new Date(lic.opening_date), 'dd/MM/yy', { locale: es }) : '-'}
                    </div>
                  </td>
                  <td className="px-3 py-4 text-center whitespace-nowrap">
                    {tableDays !== null ? (
                      <span className={`inline-block px-2 py-1 rounded text-xs font-black ${tableUrgency}`}>
                        {tableDays < 0 ? `-${Math.abs(tableDays)}` : tableDays === 0 ? 'HOY' : tableDays}
                      </span>
                    ) : '-'}
                  </td>
                  <td className="px-4 py-4">
                    <span className={`px-2 py-1 rounded text-xs font-bold ${
                      lic.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {lic.status === 'active' ? 'Abierta' : 'Cerrada'}
                    </span>
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap">
                    {lic.fecha_scraping ? (
                      <span className="text-xs text-gray-500" title={lic.fecha_scraping}>
                        {(() => { try { return formatDistanceToNow(new Date(lic.fecha_scraping), { addSuffix: true, locale: es }); } catch { return '-'; } })()}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-300">-</span>
                    )}
                  </td>
                  <td className="px-4 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={(e) => onToggleFavorite(lic.id, e)}
                        className={`p-1.5 rounded-lg transition-colors ${
                          favorites.has(lic.id) ? 'text-yellow-500' : 'text-gray-400 hover:text-yellow-500'
                        }`}
                      >
                        <svg className="w-4 h-4" fill={favorites.has(lic.id) ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => handleWhatsApp(lic, e)}
                        className="p-1.5 text-gray-400 hover:text-green-500 rounded-lg transition-colors"
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default React.memo(LicitacionTable);
