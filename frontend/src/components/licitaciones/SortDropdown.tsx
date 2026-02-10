import React from 'react';
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

const SortDropdown: React.FC<SortDropdownProps> = ({ sortBy, sortOrder, onSortChange, onToggleOrder }) => (
  <div className="flex items-center gap-1 flex-shrink-0">
    <span className="text-[10px] text-gray-400 font-bold hidden sm:inline">Ordenar</span>
    <select
      className="px-2 py-1.5 bg-gray-100 border border-transparent focus:border-emerald-500 rounded-lg outline-none text-gray-700 font-bold cursor-pointer text-xs"
      value={sortBy}
      onChange={(e) => onSortChange(e.target.value as SortField)}
    >
      {SORT_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
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

export default React.memo(SortDropdown);
