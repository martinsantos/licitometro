import React from 'react';
import type { FilterState, FilterOptions, ViewMode } from '../../types/licitacion';
import CriticalRubrosConfig from './CriticalRubrosConfig';

interface FilterBarProps {
  filters: FilterState;
  onFilterChange: (key: keyof FilterState, value: string) => void;
  filterOptions: FilterOptions;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  groupBy: string;
  onGroupByChange: (value: string) => void;
  criticalRubros: Set<string>;
  onToggleCriticalRubro: (rubro: string) => void;
  showRubroConfig: boolean;
  onToggleRubroConfig: () => void;
  budgetMin?: string;
  budgetMax?: string;
  onBudgetMinChange?: (v: string) => void;
  onBudgetMaxChange?: (v: string) => void;
}

const selectClass = "px-2 py-1.5 bg-gray-50 border border-transparent focus:border-emerald-500 rounded-lg outline-none text-gray-700 font-bold cursor-pointer text-xs";

const FilterBar: React.FC<FilterBarProps> = ({
  filters, onFilterChange, filterOptions, viewMode, onViewModeChange,
  groupBy, onGroupByChange, criticalRubros, onToggleCriticalRubro,
  showRubroConfig, onToggleRubroConfig,
  budgetMin, budgetMax, onBudgetMinChange, onBudgetMaxChange,
}) => {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <select
        className={`${selectClass} hidden lg:block max-w-[140px]`}
        value={filters.fuenteFiltro}
        onChange={(e) => onFilterChange('fuenteFiltro', e.target.value)}
      >
        <option value="">Fuente</option>
        {filterOptions.fuenteOptions.map((f) => (
          <option key={f} value={f}>{f}</option>
        ))}
      </select>

      <select
        className={`${selectClass} hidden lg:block`}
        value={filters.statusFiltro}
        onChange={(e) => onFilterChange('statusFiltro', e.target.value)}
      >
        <option value="">Estado</option>
        {filterOptions.statusOptions.map((s) => (
          <option key={s} value={s}>{s === 'active' ? 'Abierta' : s === 'closed' ? 'Cerrada' : s}</option>
        ))}
      </select>

      <div className="relative hidden lg:block">
        <div className="flex items-center gap-0.5">
          <select
            className={`${selectClass} max-w-[140px]`}
            value={filters.categoryFiltro}
            onChange={(e) => onFilterChange('categoryFiltro', e.target.value)}
          >
            <option value="">Rubro</option>
            {filterOptions.categoryOptions.map((cat) => (
              <option key={cat.id} value={cat.nombre} title={cat.nombre}>
                {cat.nombre.length > 20 ? cat.nombre.substring(0, 20) + '...' : cat.nombre}
              </option>
            ))}
          </select>
          <button
            onClick={onToggleRubroConfig}
            className={`p-1 rounded-md transition-colors ${showRubroConfig ? 'bg-emerald-100 text-emerald-700' : 'text-gray-400 hover:text-gray-600'}`}
            title="Rubros criticos"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>

        {showRubroConfig && (
          <CriticalRubrosConfig
            categoryOptions={filterOptions.categoryOptions}
            criticalRubros={criticalRubros}
            onToggle={onToggleCriticalRubro}
            onClose={onToggleRubroConfig}
          />
        )}
      </div>

      <select
        className={`${selectClass} hidden lg:block`}
        value={filters.workflowFiltro}
        onChange={(e) => onFilterChange('workflowFiltro', e.target.value)}
      >
        <option value="">Workflow</option>
        <option value="descubierta">Descubierta</option>
        <option value="evaluando">Evaluando</option>
        <option value="preparando">Preparando</option>
        <option value="presentada">Presentada</option>
        <option value="descartada">Descartada</option>
      </select>

      <select
        className={`${selectClass} hidden lg:block`}
        value={groupBy}
        onChange={(e) => onGroupByChange(e.target.value)}
      >
        <option value="none">Agrupar</option>
        <option value="organization">Organizacion</option>
        <option value="fuente">Fuente</option>
        <option value="status">Estado</option>
        <option value="jurisdiccion">Jurisdiccion</option>
        <option value="procedimiento">Procedimiento</option>
        <option value="category">Rubro</option>
      </select>

      {/* Budget range */}
      <div className="hidden lg:flex items-center gap-1 border-l border-gray-200 pl-1.5 ml-0.5">
        <span className="text-[10px] font-bold text-gray-400">$</span>
        <input
          type="number"
          placeholder="Min"
          className="w-20 px-2 py-1.5 bg-gray-50 border border-transparent focus:border-emerald-500 rounded-lg outline-none text-xs text-gray-700 font-bold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          value={budgetMin || ''}
          onChange={(e) => onBudgetMinChange?.(e.target.value)}
        />
        <span className="text-[10px] text-gray-400">-</span>
        <input
          type="number"
          placeholder="Max"
          className="w-20 px-2 py-1.5 bg-gray-50 border border-transparent focus:border-emerald-500 rounded-lg outline-none text-xs text-gray-700 font-bold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          value={budgetMax || ''}
          onChange={(e) => onBudgetMaxChange?.(e.target.value)}
        />
      </div>

      {/* View toggle */}
      <div className="flex bg-gray-100 rounded-lg p-0.5">
        {(['cards', 'table', 'timeline'] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => onViewModeChange(mode)}
            className={`p-1.5 rounded-md transition-all ${viewMode === mode ? 'bg-white shadow-sm text-emerald-600' : 'text-gray-400 hover:text-gray-600'}`}
            title={mode === 'cards' ? 'Tarjetas' : mode === 'table' ? 'Tabla' : 'Timeline'}
          >
            {mode === 'cards' ? (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
            ) : mode === 'table' ? (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            )}
          </button>
        ))}
      </div>
    </div>
  );
};

export default React.memo(FilterBar);
