import React from 'react';
import type { SortField, SortOrder } from '../../types/licitacion';

interface SortModeBarProps {
  sortBy: SortField;
  sortOrder: SortOrder;
  onSortChange: (sort: SortField) => void;
  onToggleOrder: () => void;
}

const SORT_TABS: { value: SortField; label: string; title: string }[] = [
  { value: 'publication_date', label: 'Pub', title: 'Ordenar por fecha de publicacion' },
  { value: 'opening_date', label: 'Apert', title: 'Ordenar por fecha de apertura' },
  { value: 'fecha_scraping', label: 'Idx', title: 'Ordenar por fecha de indexacion' },
  { value: 'budget', label: '$', title: 'Ordenar por presupuesto' },
  { value: 'title', label: 'A-Z', title: 'Ordenar alfabeticamente' },
];

const SortModeBar: React.FC<SortModeBarProps> = ({ sortBy, sortOrder, onSortChange, onToggleOrder }) => (
  <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
    {SORT_TABS.map((tab) => (
      <button
        key={tab.value}
        onClick={() => onSortChange(tab.value)}
        title={tab.title}
        className={`px-2 py-1 rounded-md text-xs font-bold transition-all whitespace-nowrap ${
          sortBy === tab.value
            ? 'bg-white shadow-sm text-emerald-700'
            : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        {tab.label}
      </button>
    ))}
    <button
      onClick={onToggleOrder}
      className="p-1 rounded-md hover:bg-white transition-all flex-shrink-0"
      title={sortOrder === 'asc' ? 'Ascendente' : 'Descendente'}
    >
      <svg className={`w-3.5 h-3.5 text-gray-500 transition-transform ${sortOrder === 'asc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
      </svg>
    </button>
  </div>
);

export default React.memo(SortModeBar);
