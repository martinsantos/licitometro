import React, { useState, useMemo, useCallback } from 'react';
import type { FilterState, FilterOptions } from '../../types/licitacion';
import type { FacetData, FacetValue } from '../../hooks/useFacetedFilters';
import CriticalRubrosConfig from './CriticalRubrosConfig';
import DateRangeFilter from '../DateRangeFilter';

interface FilterSidebarProps {
  filters: FilterState;
  onFilterChange: (key: keyof FilterState, value: string) => void;
  onClearAll: () => void;
  facets: FacetData;
  hasActiveFilters: boolean;
  activeFilterCount: number;
  criticalRubros: Set<string>;
  onToggleCriticalRubro: (rubro: string) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  filterOptions: FilterOptions;
  // Date range
  onSetMany: (updates: Partial<FilterState>) => void;
  // Group by
  groupBy: string;
  onGroupByChange: (value: string) => void;
}

// --- FilterSection accordion ---
const FilterSection: React.FC<{
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  badge?: number;
}> = ({ title, defaultOpen = true, children, badge }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-2.5 px-1 text-xs font-black text-gray-500 uppercase tracking-wider hover:text-gray-700 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          {title}
          {badge != null && badge > 0 && (
            <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-bold normal-case">
              {badge}
            </span>
          )}
        </span>
        <svg className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="pb-3">{children}</div>}
    </div>
  );
};

// --- Clickable facet item ---
const FacetItem: React.FC<{
  label: string;
  count: number;
  isActive: boolean;
  onClick: () => void;
  colorDot?: string;
  isCritical?: boolean;
}> = ({ label, count, isActive, onClick, colorDot, isCritical }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs transition-all ${
      isActive
        ? 'bg-emerald-50 text-emerald-800 font-bold'
        : count === 0
        ? 'text-gray-300 cursor-default'
        : 'text-gray-600 hover:bg-gray-50'
    }`}
    disabled={count === 0 && !isActive}
  >
    <span className="flex items-center gap-1.5 min-w-0">
      {colorDot && <span className={`w-2 h-2 rounded-full flex-shrink-0 ${colorDot}`} />}
      {isCritical && <span className="text-red-500 flex-shrink-0">★</span>}
      <span className="truncate">{label}</span>
    </span>
    <span className={`flex-shrink-0 text-[10px] font-bold ${isActive ? 'text-emerald-600' : 'text-gray-400'}`}>
      {count}
    </span>
  </button>
);

// --- Main sidebar ---
const FilterSidebar: React.FC<FilterSidebarProps> = ({
  filters, onFilterChange, onClearAll, facets, hasActiveFilters, activeFilterCount,
  criticalRubros, onToggleCriticalRubro, isCollapsed, onToggleCollapse,
  filterOptions, onSetMany, groupBy, onGroupByChange,
}) => {
  const [orgSearch, setOrgSearch] = useState('');
  const [showAllOrgs, setShowAllOrgs] = useState(false);
  const [showRubroConfig, setShowRubroConfig] = useState(false);

  const toggleFilter = useCallback((key: keyof FilterState, value: string) => {
    onFilterChange(key, filters[key] === value ? '' : value);
  }, [filters, onFilterChange]);

  // Filtered org list
  const filteredOrgs = useMemo(() => {
    let orgs = facets.organization || [];
    if (orgSearch) {
      orgs = orgs.filter(o => o.value.toLowerCase().includes(orgSearch.toLowerCase()));
    }
    return orgs;
  }, [facets.organization, orgSearch]);

  const visibleOrgs = showAllOrgs ? filteredOrgs : filteredOrgs.slice(0, 10);

  // Collapsed strip
  if (isCollapsed) {
    return (
      <div className="w-12 flex-shrink-0">
        <div className="sticky top-0 h-[calc(100vh-80px)] bg-white border border-gray-100 rounded-xl flex flex-col items-center py-3 gap-2">
          <button
            onClick={onToggleCollapse}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            title="Mostrar filtros"
          >
            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
          </button>
          {activeFilterCount > 0 && (
            <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-bold">
              {activeFilterCount}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-[280px] flex-shrink-0">
      <div className="sticky top-0 h-[calc(100vh-80px)] overflow-y-auto bg-white border border-gray-100 rounded-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            <span className="text-sm font-black text-gray-700">Filtros</span>
            {activeFilterCount > 0 && (
              <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-bold">
                {activeFilterCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {hasActiveFilters && (
              <button
                onClick={onClearAll}
                className="text-[10px] text-red-500 hover:text-red-700 font-bold px-1.5 py-0.5"
              >
                Limpiar
              </button>
            )}
            <button
              onClick={onToggleCollapse}
              className="p-1 hover:bg-gray-100 rounded-md transition-colors"
              title="Ocultar filtros"
            >
              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-3 space-y-0">
          {/* 1. Fuente */}
          <FilterSection title="Fuente" badge={filters.fuenteFiltro ? 1 : 0}>
            {(facets.fuente || []).map((f: FacetValue) => (
              <FacetItem
                key={f.value}
                label={f.value}
                count={f.count}
                isActive={filters.fuenteFiltro === f.value}
                onClick={() => toggleFilter('fuenteFiltro', f.value)}
              />
            ))}
          </FilterSection>

          {/* 2. Estado */}
          <FilterSection title="Estado" badge={filters.statusFiltro ? 1 : 0}>
            {(facets.status || []).map((f: FacetValue) => (
              <FacetItem
                key={f.value}
                label={f.value === 'active' ? 'Abierta' : f.value === 'closed' ? 'Cerrada' : f.value}
                count={f.count}
                isActive={filters.statusFiltro === f.value}
                onClick={() => toggleFilter('statusFiltro', f.value)}
                colorDot={f.value === 'active' ? 'bg-emerald-500' : 'bg-red-500'}
              />
            ))}
          </FilterSection>

          {/* 3. Rubro */}
          <FilterSection title="Rubro" badge={filters.categoryFiltro ? 1 : 0}>
            <div className="max-h-48 overflow-y-auto">
              {(facets.category || []).map((f: FacetValue) => (
                <FacetItem
                  key={f.value}
                  label={f.value}
                  count={f.count}
                  isActive={filters.categoryFiltro === f.value}
                  onClick={() => toggleFilter('categoryFiltro', f.value)}
                  isCritical={criticalRubros.has(f.value)}
                />
              ))}
            </div>
            <button
              onClick={() => setShowRubroConfig(!showRubroConfig)}
              className="mt-1.5 text-[10px] text-emerald-600 hover:text-emerald-800 font-bold flex items-center gap-1"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Configurar rubros criticos ({criticalRubros.size}/5)
            </button>
            {showRubroConfig && (
              <div className="relative mt-2">
                <CriticalRubrosConfig
                  categoryOptions={filterOptions.categoryOptions}
                  criticalRubros={criticalRubros}
                  onToggle={onToggleCriticalRubro}
                  onClose={() => setShowRubroConfig(false)}
                />
              </div>
            )}
          </FilterSection>

          {/* 4. Organizacion */}
          <FilterSection title="Organizacion" badge={filters.organizacionFiltro ? 1 : 0}>
            <input
              type="text"
              placeholder="Buscar organizacion..."
              className="w-full px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs outline-none focus:border-emerald-400 mb-1.5"
              value={orgSearch}
              onChange={(e) => setOrgSearch(e.target.value)}
            />
            <div className="max-h-40 overflow-y-auto">
              {visibleOrgs.map((f: FacetValue) => (
                <FacetItem
                  key={f.value}
                  label={f.value}
                  count={f.count}
                  isActive={filters.organizacionFiltro === f.value}
                  onClick={() => toggleFilter('organizacionFiltro', f.value)}
                />
              ))}
            </div>
            {!showAllOrgs && filteredOrgs.length > 10 && (
              <button
                onClick={() => setShowAllOrgs(true)}
                className="mt-1 text-[10px] text-emerald-600 hover:text-emerald-800 font-bold"
              >
                Ver todos ({filteredOrgs.length})
              </button>
            )}
            {showAllOrgs && filteredOrgs.length > 10 && (
              <button
                onClick={() => setShowAllOrgs(false)}
                className="mt-1 text-[10px] text-emerald-600 hover:text-emerald-800 font-bold"
              >
                Mostrar menos
              </button>
            )}
          </FilterSection>

          {/* 5. Workflow */}
          <FilterSection title="Workflow" defaultOpen={false} badge={filters.workflowFiltro ? 1 : 0}>
            {(facets.workflow_state || []).map((f: FacetValue) => {
              const colors: Record<string, string> = {
                descubierta: 'bg-gray-400',
                evaluando: 'bg-blue-500',
                preparando: 'bg-yellow-500',
                presentada: 'bg-emerald-500',
                descartada: 'bg-red-500',
              };
              return (
                <FacetItem
                  key={f.value}
                  label={f.value.charAt(0).toUpperCase() + f.value.slice(1)}
                  count={f.count}
                  isActive={filters.workflowFiltro === f.value}
                  onClick={() => toggleFilter('workflowFiltro', f.value)}
                  colorDot={colors[f.value] || 'bg-gray-400'}
                />
              );
            })}
          </FilterSection>

          {/* 6. Jurisdiccion */}
          <FilterSection title="Jurisdiccion" defaultOpen={false} badge={filters.jurisdiccionFiltro ? 1 : 0}>
            {(facets.jurisdiccion || []).map((f: FacetValue) => (
              <FacetItem
                key={f.value}
                label={f.value}
                count={f.count}
                isActive={filters.jurisdiccionFiltro === f.value}
                onClick={() => toggleFilter('jurisdiccionFiltro', f.value)}
              />
            ))}
          </FilterSection>

          {/* 7. Tipo Procedimiento */}
          <FilterSection title="Tipo Procedimiento" defaultOpen={false} badge={filters.tipoProcedimientoFiltro ? 1 : 0}>
            {(facets.tipo_procedimiento || []).map((f: FacetValue) => (
              <FacetItem
                key={f.value}
                label={f.value}
                count={f.count}
                isActive={filters.tipoProcedimientoFiltro === f.value}
                onClick={() => toggleFilter('tipoProcedimientoFiltro', f.value)}
              />
            ))}
          </FilterSection>

          {/* 8. Presupuesto */}
          <FilterSection title="Presupuesto" defaultOpen={false} badge={(filters.budgetMin || filters.budgetMax) ? 1 : 0}>
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="number"
                  placeholder="Min $"
                  className="w-full px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs outline-none focus:border-emerald-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  value={filters.budgetMin}
                  onChange={(e) => onFilterChange('budgetMin', e.target.value)}
                />
                <input
                  type="number"
                  placeholder="Max $"
                  className="w-full px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs outline-none focus:border-emerald-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  value={filters.budgetMax}
                  onChange={(e) => onFilterChange('budgetMax', e.target.value)}
                />
              </div>
              <div className="flex gap-1 flex-wrap">
                {[
                  { label: '<100K', min: '', max: '100000' },
                  { label: '100K-1M', min: '100000', max: '1000000' },
                  { label: '>1M', min: '1000000', max: '' },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => {
                      onFilterChange('budgetMin', preset.min);
                      onFilterChange('budgetMax', preset.max);
                    }}
                    className={`px-2 py-1 rounded text-[10px] font-bold transition-colors ${
                      filters.budgetMin === preset.min && filters.budgetMax === preset.max
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </FilterSection>

          {/* 9. Fechas */}
          <FilterSection title="Fechas" defaultOpen={false} badge={(filters.fechaDesde || filters.fechaHasta) ? 1 : 0}>
            <div className="space-y-2">
              <div className="flex gap-1">
                {[
                  { value: 'publication_date', label: 'Pub' },
                  { value: 'opening_date', label: 'Apert' },
                  { value: 'fecha_scraping', label: 'Idx' },
                ].map((campo) => (
                  <button
                    key={campo.value}
                    onClick={() => onFilterChange('fechaCampo', campo.value)}
                    className={`flex-1 px-2 py-1 rounded text-[10px] font-bold transition-colors ${
                      filters.fechaCampo === campo.value
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    {campo.label}
                  </button>
                ))}
              </div>
              <div className="space-y-1.5">
                <div>
                  <label className="text-[10px] text-gray-400 font-bold">Desde</label>
                  <input
                    type="date"
                    className="w-full px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs outline-none focus:border-emerald-400"
                    value={filters.fechaDesde}
                    onChange={(e) => onFilterChange('fechaDesde', e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 font-bold">Hasta</label>
                  <input
                    type="date"
                    className="w-full px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs outline-none focus:border-emerald-400"
                    value={filters.fechaHasta}
                    onChange={(e) => onFilterChange('fechaHasta', e.target.value)}
                  />
                </div>
              </div>
              {(filters.fechaDesde || filters.fechaHasta) && (
                <button
                  onClick={() => onSetMany({ fechaDesde: '', fechaHasta: '' })}
                  className="text-[10px] text-red-500 hover:text-red-700 font-bold"
                >
                  Limpiar fechas
                </button>
              )}
            </div>
          </FilterSection>

          {/* 10. Agrupar por */}
          <FilterSection title="Agrupar por" defaultOpen={false}>
            <select
              className="w-full px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs outline-none focus:border-emerald-400 font-bold text-gray-700 cursor-pointer"
              value={groupBy}
              onChange={(e) => onGroupByChange(e.target.value)}
            >
              <option value="none">Sin agrupar</option>
              <option value="organization">Organizacion</option>
              <option value="fuente">Fuente</option>
              <option value="status">Estado</option>
              <option value="jurisdiccion">Jurisdiccion</option>
              <option value="procedimiento">Procedimiento</option>
              <option value="category">Rubro</option>
            </select>
          </FilterSection>
        </div>
      </div>
    </div>
  );
};

export default React.memo(FilterSidebar);
