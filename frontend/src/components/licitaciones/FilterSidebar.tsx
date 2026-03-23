import React, { useState, useMemo, useCallback } from 'react';
import type { FilterState, FilterOptions, Nodo } from '../../types/licitacion';
import type { FacetData, FacetValue } from '../../hooks/useFacetedFilters';
import { EstadoFilter } from './EstadoFilter';
import { FilterSection, FacetItem, BudgetFilter, DateRangeFilter, ensureActiveValue, GROUP_BY_OPTIONS } from './filters';

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
  onSetMany: (updates: Partial<FilterState>) => void;
  groupBy: string;
  onGroupByChange: (value: string) => void;
  nodoMap?: Record<string, Nodo>;
}

const WORKFLOW_COLORS: Record<string, string> = {
  descubierta: 'bg-gray-400', evaluando: 'bg-blue-500',
  preparando: 'bg-yellow-500', presentada: 'bg-emerald-500', descartada: 'bg-red-500',
};

const FilterSidebar: React.FC<FilterSidebarProps> = ({
  filters, onFilterChange, onClearAll, facets, hasActiveFilters, activeFilterCount,
  criticalRubros, onToggleCriticalRubro, isCollapsed, onToggleCollapse,
  filterOptions, onSetMany, groupBy, onGroupByChange, nodoMap,
}) => {
  const [orgSearch, setOrgSearch] = useState('');
  const [showAllOrgs, setShowAllOrgs] = useState(false);
  const [showRubroConfig, setShowRubroConfig] = useState(false);

  const toggleFilter = useCallback((key: keyof FilterState, value: string) => {
    onFilterChange(key, filters[key] === value ? '' : value);
  }, [filters, onFilterChange]);

  const fuenteItems = useMemo(() => ensureActiveValue(facets.fuente || [], filters.fuenteFiltro), [facets.fuente, filters.fuenteFiltro]);
  const statusItems = useMemo(() => ensureActiveValue(facets.status || [], filters.statusFiltro), [facets.status, filters.statusFiltro]);
  const categoryItems = useMemo(() => ensureActiveValue(facets.category || [], filters.categoryFiltro), [facets.category, filters.categoryFiltro]);
  const workflowItems = useMemo(() => ensureActiveValue(facets.workflow_state || [], filters.workflowFiltro), [facets.workflow_state, filters.workflowFiltro]);
  const jurisdiccionItems = useMemo(() => ensureActiveValue(facets.jurisdiccion || [], filters.jurisdiccionFiltro), [facets.jurisdiccion, filters.jurisdiccionFiltro]);
  const tipoItems = useMemo(() => ensureActiveValue(facets.tipo_procedimiento || [], filters.tipoProcedimientoFiltro), [facets.tipo_procedimiento, filters.tipoProcedimientoFiltro]);
  const nodoItems = useMemo(() => ensureActiveValue(facets.nodos || [], filters.nodoFiltro), [facets.nodos, filters.nodoFiltro]);

  const filteredOrgs = useMemo(() => {
    let orgs = ensureActiveValue(facets.organization || [], filters.organizacionFiltro);
    if (orgSearch) {
      orgs = orgs.filter(o => o.value.toLowerCase().includes(orgSearch.toLowerCase()));
    }
    return orgs;
  }, [facets.organization, orgSearch, filters.organizacionFiltro]);

  const visibleOrgs = showAllOrgs ? filteredOrgs : filteredOrgs.slice(0, 10);

  // Collapsed strip
  if (isCollapsed) {
    return (
      <div className="w-12 flex-shrink-0">
        <div className="h-[calc(100vh-3.5rem)] bg-white border border-gray-100 rounded-xl flex flex-col items-center py-3 gap-2">
          <button onClick={onToggleCollapse} className="p-2 hover:bg-gray-100 rounded-lg transition-colors" title="Mostrar filtros">
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
      <div className="h-[calc(100vh-3.5rem)] overflow-y-auto bg-white border border-gray-100 rounded-xl">
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
              <button onClick={onClearAll} className="text-[10px] text-red-500 hover:text-red-700 font-bold px-1.5 py-0.5">
                Limpiar
              </button>
            )}
            <button onClick={onToggleCollapse} className="p-1 hover:bg-gray-100 rounded-md transition-colors" title="Ocultar filtros">
              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-3 space-y-0">
          {/* Fuente */}
          <FilterSection title="Fuente" badge={filters.fuenteFiltro ? 1 : 0} size="sm">
            {fuenteItems.map((f: FacetValue) => (
              <FacetItem key={f.value} label={f.value} count={f.count} isActive={filters.fuenteFiltro === f.value} onClick={() => toggleFilter('fuenteFiltro', f.value)} size="sm" />
            ))}
          </FilterSection>

          {/* Vigencia */}
          <FilterSection title="Vigencia" badge={filters.estadoFiltro ? 1 : 0} size="sm">
            <EstadoFilter value={filters.estadoFiltro} onChange={(value) => onFilterChange('estadoFiltro', value)} />
          </FilterSection>

          {/* Status */}
          <FilterSection title="Status" defaultOpen={false} badge={filters.statusFiltro ? 1 : 0} size="sm">
            {statusItems.map((f: FacetValue) => (
              <FacetItem key={f.value} label={f.value === 'active' ? 'Abierta' : f.value === 'closed' ? 'Cerrada' : f.value} count={f.count} isActive={filters.statusFiltro === f.value} onClick={() => toggleFilter('statusFiltro', f.value)} colorDot={f.value === 'active' ? 'bg-emerald-500' : 'bg-red-500'} size="sm" />
            ))}
          </FilterSection>

          {/* Rubro */}
          <FilterSection title="Rubro" badge={filters.categoryFiltro ? 1 : 0} size="sm">
            <div className="max-h-48 overflow-y-auto">
              {categoryItems.map((f: FacetValue) => (
                <FacetItem key={f.value} label={f.value} count={f.count} isActive={filters.categoryFiltro === f.value} onClick={() => toggleFilter('categoryFiltro', f.value)} isCritical={criticalRubros.has(f.value)} size="sm" />
              ))}
            </div>
            <button onClick={() => setShowRubroConfig(!showRubroConfig)} className="mt-1.5 text-[10px] text-emerald-600 hover:text-emerald-800 font-bold flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.11 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Configurar rubros criticos ({criticalRubros.size})
            </button>
            {showRubroConfig && (
              <div className="mt-2 bg-gray-50 rounded-lg p-2.5 border border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-gray-500">{criticalRubros.size} seleccionados</span>
                  <button onClick={() => setShowRubroConfig(false)} className="text-[10px] text-gray-400 hover:text-gray-600">&times; Cerrar</button>
                </div>
                <div className="max-h-40 overflow-y-auto space-y-0.5">
                  {filterOptions.categoryOptions.map((cat) => (
                    <label key={cat.id} className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-white cursor-pointer">
                      <input type="checkbox" checked={criticalRubros.has(cat.nombre)} onChange={() => onToggleCriticalRubro(cat.nombre)} className="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500" />
                      <span className={`text-[11px] ${criticalRubros.has(cat.nombre) ? 'font-bold text-emerald-700' : 'text-gray-600'}`}>
                        {cat.nombre}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </FilterSection>

          {/* Organizacion */}
          <FilterSection title="Organizacion" badge={filters.organizacionFiltro ? 1 : 0} size="sm">
            <input type="text" placeholder="Buscar organizacion..." className="w-full px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs outline-none focus:border-emerald-400 mb-1.5" value={orgSearch} onChange={(e) => setOrgSearch(e.target.value)} />
            <div className="max-h-40 overflow-y-auto">
              {visibleOrgs.map((f: FacetValue) => (
                <FacetItem key={f.value} label={f.value} count={f.count} isActive={filters.organizacionFiltro === f.value} onClick={() => toggleFilter('organizacionFiltro', f.value)} size="sm" />
              ))}
            </div>
            {!showAllOrgs && filteredOrgs.length > 10 && (
              <button onClick={() => setShowAllOrgs(true)} className="mt-1 text-[10px] text-emerald-600 hover:text-emerald-800 font-bold">
                Ver todos ({filteredOrgs.length})
              </button>
            )}
            {showAllOrgs && filteredOrgs.length > 10 && (
              <button onClick={() => setShowAllOrgs(false)} className="mt-1 text-[10px] text-emerald-600 hover:text-emerald-800 font-bold">
                Mostrar menos
              </button>
            )}
          </FilterSection>

          {/* Workflow */}
          <FilterSection title="Workflow" defaultOpen={false} badge={filters.workflowFiltro ? 1 : 0} size="sm">
            {workflowItems.map((f: FacetValue) => (
              <FacetItem key={f.value} label={f.value.charAt(0).toUpperCase() + f.value.slice(1)} count={f.count} isActive={filters.workflowFiltro === f.value} onClick={() => toggleFilter('workflowFiltro', f.value)} colorDot={WORKFLOW_COLORS[f.value] || 'bg-gray-400'} size="sm" />
            ))}
          </FilterSection>

          {/* Nodos */}
          {nodoItems.length > 0 && (
            <FilterSection title="Nodos" defaultOpen={false} badge={filters.nodoFiltro ? 1 : 0} size="sm">
              {nodoItems.map((f: FacetValue) => {
                const nodo = nodoMap?.[f.value];
                return (
                  <FacetItem key={f.value} label={nodo?.name || f.value.slice(0, 12) + '...'} count={f.count} isActive={filters.nodoFiltro === f.value} onClick={() => toggleFilter('nodoFiltro', f.value)} size="sm" />
                );
              })}
            </FilterSection>
          )}

          {/* Jurisdiccion */}
          <FilterSection title="Jurisdiccion" defaultOpen={false} badge={filters.jurisdiccionFiltro ? 1 : 0} size="sm">
            {jurisdiccionItems.map((f: FacetValue) => (
              <FacetItem key={f.value} label={f.value} count={f.count} isActive={filters.jurisdiccionFiltro === f.value} onClick={() => toggleFilter('jurisdiccionFiltro', f.value)} size="sm" />
            ))}
          </FilterSection>

          {/* Tipo Procedimiento */}
          <FilterSection title="Tipo Procedimiento" defaultOpen={false} badge={filters.tipoProcedimientoFiltro ? 1 : 0} size="sm">
            {tipoItems.map((f: FacetValue) => (
              <FacetItem key={f.value} label={f.value} count={f.count} isActive={filters.tipoProcedimientoFiltro === f.value} onClick={() => toggleFilter('tipoProcedimientoFiltro', f.value)} size="sm" />
            ))}
          </FilterSection>

          {/* Presupuesto */}
          <FilterSection title="Presupuesto" defaultOpen={false} badge={(filters.budgetMin || filters.budgetMax) ? 1 : 0} size="sm">
            <BudgetFilter budgetMin={filters.budgetMin} budgetMax={filters.budgetMax} onChange={onFilterChange} onSetMany={onSetMany} size="sm" />
          </FilterSection>

          {/* Fechas */}
          <FilterSection title="Fechas" defaultOpen={false} badge={(filters.fechaDesde || filters.fechaHasta) ? 1 : 0} size="sm">
            <DateRangeFilter fechaDesde={filters.fechaDesde} fechaHasta={filters.fechaHasta} fechaCampo={filters.fechaCampo} onChange={onFilterChange} onClear={() => onSetMany({ fechaDesde: '', fechaHasta: '', nuevasDesde: '' })} size="sm" />
          </FilterSection>

          {/* Agrupar por */}
          <FilterSection title="Agrupar por" defaultOpen={false} size="sm">
            <select className="w-full px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs outline-none focus:border-emerald-400 font-bold text-gray-700 cursor-pointer" value={groupBy} onChange={(e) => onGroupByChange(e.target.value)}>
              {GROUP_BY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </FilterSection>
        </div>
      </div>
    </div>
  );
};

export default React.memo(FilterSidebar);
