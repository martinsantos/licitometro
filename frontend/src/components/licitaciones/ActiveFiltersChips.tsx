import React from 'react';
import type { FilterState } from '../../types/licitacion';

interface ActiveFiltersChipsProps {
  filters: FilterState;
  onFilterChange: (key: keyof FilterState, value: string) => void;
  onClearAll: () => void;
  totalItems: number | null;
  newItemsCount: number;
  hasActiveFilters: boolean;
}

const Chip: React.FC<{ label: string; color: string; onRemove: () => void }> = ({ label, color, onRemove }) => (
  <span className={`inline-flex items-center gap-1 px-2 py-0.5 ${color} rounded text-[11px] font-bold`}>
    {label}
    <button onClick={onRemove} className="hover:text-red-600">&times;</button>
  </span>
);

const ActiveFiltersChips: React.FC<ActiveFiltersChipsProps> = ({
  filters, onFilterChange, onClearAll, totalItems, newItemsCount, hasActiveFilters,
}) => {
  if (totalItems === null && !hasActiveFilters) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap text-xs">
      {totalItems !== null && totalItems === 0 && hasActiveFilters ? (
        <span className="px-2 py-0.5 bg-red-50 text-red-600 rounded font-bold">
          Sin resultados — pruebe removiendo filtros:
        </span>
      ) : totalItems !== null ? (
        <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded font-bold">
          {totalItems} resultados
        </span>
      ) : null}
      {newItemsCount > 0 && (
        <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded font-bold animate-pulse">
          +{newItemsCount} nuevas
        </span>
      )}
      {filters.fuenteFiltro && (
        <Chip label={filters.fuenteFiltro} color="bg-violet-100 text-violet-700" onRemove={() => onFilterChange('fuenteFiltro', '')} />
      )}
      {filters.statusFiltro && (
        <Chip label={filters.statusFiltro === 'active' ? 'Abierta' : filters.statusFiltro} color="bg-blue-100 text-blue-700" onRemove={() => onFilterChange('statusFiltro', '')} />
      )}
      {filters.workflowFiltro && (
        <Chip label={filters.workflowFiltro} color="bg-amber-100 text-amber-700" onRemove={() => onFilterChange('workflowFiltro', '')} />
      )}
      {filters.jurisdiccionFiltro && (
        <Chip label={filters.jurisdiccionFiltro} color="bg-teal-100 text-teal-700" onRemove={() => onFilterChange('jurisdiccionFiltro', '')} />
      )}
      {filters.tipoProcedimientoFiltro && (
        <Chip label={filters.tipoProcedimientoFiltro} color="bg-cyan-100 text-cyan-700" onRemove={() => onFilterChange('tipoProcedimientoFiltro', '')} />
      )}
      {filters.organizacionFiltro && (
        <Chip label={`Org: ${filters.organizacionFiltro}`} color="bg-indigo-100 text-indigo-700" onRemove={() => onFilterChange('organizacionFiltro', '')} />
      )}
      {filters.categoryFiltro && (
        <Chip label={filters.categoryFiltro} color="bg-pink-100 text-pink-700" onRemove={() => onFilterChange('categoryFiltro', '')} />
      )}
      {(filters.budgetMin || filters.budgetMax) && (
        <Chip label={`$${filters.budgetMin || '0'} - $${filters.budgetMax || '...'}`} color="bg-orange-100 text-orange-700" onRemove={() => { onFilterChange('budgetMin', ''); onFilterChange('budgetMax', ''); }} />
      )}
      {(filters.fechaDesde || filters.fechaHasta) && (
        <Chip label={`${filters.fechaDesde || '...'} a ${filters.fechaHasta || '...'}`} color="bg-green-100 text-green-700" onRemove={() => { onFilterChange('fechaDesde', ''); onFilterChange('fechaHasta', ''); }} />
      )}
      {hasActiveFilters && (
        <button
          onClick={onClearAll}
          className="text-gray-400 hover:text-red-600 font-medium flex items-center gap-0.5"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
          Limpiar
        </button>
      )}
    </div>
  );
};

export default React.memo(ActiveFiltersChips);
