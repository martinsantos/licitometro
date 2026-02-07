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
}

const selectClass = "px-4 py-3 bg-gray-50 border-2 border-transparent focus:border-blue-500 rounded-xl outline-none text-gray-700 font-bold cursor-pointer text-sm";

const FilterBar: React.FC<FilterBarProps> = ({
  filters, onFilterChange, filterOptions, viewMode, onViewModeChange,
  groupBy, onGroupByChange, criticalRubros, onToggleCriticalRubro,
  showRubroConfig, onToggleRubroConfig,
}) => {
  return (
    <div className="flex flex-wrap gap-2">
      <select
        className={`${selectClass} hidden lg:block`}
        value={filters.fuenteFiltro}
        onChange={(e) => onFilterChange('fuenteFiltro', e.target.value)}
      >
        <option value="">Todas las fuentes</option>
        {filterOptions.fuenteOptions.map((f) => (
          <option key={f} value={f}>{f}</option>
        ))}
      </select>

      <select
        className={`${selectClass} hidden lg:block`}
        value={filters.statusFiltro}
        onChange={(e) => onFilterChange('statusFiltro', e.target.value)}
      >
        <option value="">Todos los estados</option>
        {filterOptions.statusOptions.map((s) => (
          <option key={s} value={s}>{s === 'active' ? 'Abierta' : s === 'closed' ? 'Cerrada' : s}</option>
        ))}
      </select>

      <div className="relative hidden lg:block">
        <div className="flex items-center gap-1">
          <select
            className={`${selectClass} max-w-[200px]`}
            value={filters.categoryFiltro}
            onChange={(e) => onFilterChange('categoryFiltro', e.target.value)}
          >
            <option value="">Todos los rubros</option>
            {filterOptions.categoryOptions.map((cat) => (
              <option key={cat.id} value={cat.nombre} title={cat.nombre}>
                {cat.nombre.length > 25 ? cat.nombre.substring(0, 25) + '...' : cat.nombre}
              </option>
            ))}
          </select>
          <button
            onClick={onToggleRubroConfig}
            className={`p-2 rounded-lg transition-colors ${showRubroConfig ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-50 text-gray-400 hover:text-gray-600'}`}
            title="Configurar rubros criticos"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
        <option value="">Todo workflow</option>
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
        <option value="none">Sin agrupar</option>
        <option value="organization">Por Organizacion</option>
        <option value="fuente">Por Fuente</option>
        <option value="status">Por Estado</option>
        <option value="jurisdiccion">Por Jurisdiccion</option>
        <option value="procedimiento">Por Procedimiento</option>
        <option value="category">Por Rubro</option>
      </select>

      {/* View toggle */}
      <div className="flex bg-gray-50 rounded-xl p-1">
        {(['cards', 'table', 'timeline'] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => onViewModeChange(mode)}
            className={`p-2 rounded-lg transition-all ${viewMode === mode ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
            title={mode === 'cards' ? 'Vista de tarjetas' : mode === 'table' ? 'Vista de tabla' : 'Linea de tiempo'}
          >
            {mode === 'cards' ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
            ) : mode === 'table' ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
