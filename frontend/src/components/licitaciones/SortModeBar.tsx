import React from 'react';
import type { SortField, SortOrder } from '../../types/licitacion';

interface SortModeBarProps {
  sortBy: SortField;
  sortOrder: SortOrder;
  onSortChange: (sort: SortField) => void;
  onToggleOrder: () => void;
}

const SORT_TABS: { value: SortField; label: string; subtitle: string }[] = [
  { value: 'publication_date', label: 'Por Publicacion', subtitle: 'Mas recientes' },
  { value: 'opening_date', label: 'Por Apertura', subtitle: 'Proximas' },
  { value: 'fecha_scraping', label: 'Por Indexacion', subtitle: 'Ultimos scrapeos' },
  { value: 'title', label: 'A-Z', subtitle: 'Alfabetico' },
];

const SortModeBar: React.FC<SortModeBarProps> = ({ sortBy, sortOrder, onSortChange, onToggleOrder }) => (
  <div className="bg-white rounded-2xl shadow-lg border border-gray-100 px-2 py-2">
    <div className="flex items-center gap-1">
      {SORT_TABS.map((tab) => (
        <button
          key={tab.value}
          onClick={() => onSortChange(tab.value)}
          className={`flex-1 px-3 py-2.5 rounded-xl text-center transition-all ${
            sortBy === tab.value
              ? 'bg-emerald-50 border-b-2 border-emerald-500 text-emerald-800'
              : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
          }`}
        >
          <span className={`text-sm font-bold block ${sortBy === tab.value ? 'text-emerald-800' : ''}`}>
            {tab.label}
          </span>
          {sortBy === tab.value && (
            <span className="text-[10px] text-emerald-600">{tab.subtitle}</span>
          )}
        </button>
      ))}

      <button
        onClick={onToggleOrder}
        className="p-2.5 rounded-xl hover:bg-gray-100 transition-all flex-shrink-0"
        title={sortOrder === 'asc' ? 'Ascendente' : 'Descendente'}
      >
        <svg className={`w-5 h-5 text-gray-600 transition-transform ${sortOrder === 'asc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
        </svg>
      </button>
    </div>
  </div>
);

export default React.memo(SortModeBar);
