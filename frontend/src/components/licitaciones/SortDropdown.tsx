import React, { useState, useEffect, useRef } from 'react';
import type { SortField, SortOrder } from '../../types/licitacion';

interface SortDropdownProps {
  sortBy: SortField;
  sortOrder: SortOrder;
  onSortChange: (sort: SortField) => void;
  onToggleOrder: () => void;
}

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'publication_date', label: 'Publicacion' },
  { value: 'opening_date', label: 'Apertura' },
  { value: 'fecha_scraping', label: 'Indexacion' },
  { value: 'budget', label: 'Presupuesto' },
  { value: 'title', label: 'Nombre A-Z' },
];

const getOrderLabel = (sortBy: SortField, sortOrder: SortOrder): string => {
  if (sortBy === 'title') return sortOrder === 'asc' ? 'A→Z' : 'Z→A';
  if (sortBy === 'budget') return sortOrder === 'asc' ? 'Menor' : 'Mayor';
  return sortOrder === 'asc' ? 'Antiguas' : 'Recientes';
};

const SortDropdown: React.FC<SortDropdownProps> = ({ sortBy, sortOrder, onSortChange, onToggleOrder }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const currentLabel = SORT_OPTIONS.find(o => o.value === sortBy)?.label || 'Ordenar';

  return (
    <div className="flex items-center gap-0.5 sm:gap-1 flex-shrink-0">
      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen(!open)}
          className={`flex items-center gap-1 px-2 py-1.5 rounded-lg font-bold text-[11px] sm:text-xs transition-colors ${
            open ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <svg className="w-3 h-3 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
          </svg>
          <span className="truncate max-w-[70px] sm:max-w-none">{currentLabel}</span>
          <svg className={`w-3 h-3 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Desktop dropdown */}
        {open && (
          <div className="hidden sm:block absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-40 w-44 py-1">
            <div className="px-3 py-1 text-[10px] font-bold text-gray-400 uppercase">Ordenar por</div>
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors ${
                  sortBy === opt.value
                    ? 'bg-emerald-50 text-emerald-700 font-bold'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
                onClick={() => { onSortChange(opt.value); setOpen(false); }}
              >
                {sortBy === opt.value && (
                  <svg className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                  </svg>
                )}
                <span className={sortBy !== opt.value ? 'ml-5.5' : ''}>{opt.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Mobile bottom sheet */}
        {open && (
          <div className="sm:hidden fixed inset-0 bg-black/50 z-50 flex items-end" onClick={() => setOpen(false)}>
            <div className="bg-white rounded-t-2xl w-full max-h-[70vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
                <h3 className="text-base font-bold text-gray-900">Ordenar por</h3>
                <button
                  onClick={() => setOpen(false)}
                  className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Options */}
              <div className="p-2">
                {SORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    className={`w-full px-4 py-3 text-left rounded-xl flex items-center gap-3 transition-colors ${
                      sortBy === opt.value
                        ? 'bg-emerald-50 text-emerald-700 font-bold'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                    onClick={() => { onSortChange(opt.value); setOpen(false); }}
                  >
                    {sortBy === opt.value && (
                      <svg className="w-5 h-5 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                    <span className={`text-base ${sortBy !== opt.value ? 'ml-8' : ''}`}>{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <button
        onClick={onToggleOrder}
        className="flex items-center gap-0.5 px-1.5 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors text-gray-600"
        title={sortOrder === 'asc' ? 'Ascendente' : 'Descendente'}
      >
        <span className="text-xs">{sortOrder === 'asc' ? '↑' : '↓'}</span>
        <span className="text-[9px] hidden sm:inline font-bold">{getOrderLabel(sortBy, sortOrder)}</span>
      </button>
    </div>
  );
};

export default React.memo(SortDropdown);
