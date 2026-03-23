import React, { useState, useMemo } from 'react';
import type { FilterState, FilterOptions, SortField, SortOrder, Nodo } from '../../types/licitacion';
import type { FacetData, FacetValue } from '../../hooks/useFacetedFilters';
import YearSelector from './YearSelector';
import { EstadoFilter } from './EstadoFilter';
import { FilterSection, FacetItem, BudgetFilter, DateRangeFilter, ensureActiveValue, GROUP_BY_OPTIONS } from './filters';

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'publication_date', label: 'Publicacion' },
  { value: 'opening_date', label: 'Apertura' },
  { value: 'fecha_scraping', label: 'Indexacion' },
  { value: 'budget', label: 'Presupuesto' },
  { value: 'title', label: 'Nombre A-Z' },
];

const WORKFLOW_COLORS: Record<string, string> = {
  descubierta: 'bg-gray-400', evaluando: 'bg-blue-500',
  preparando: 'bg-yellow-500', presentada: 'bg-emerald-500', descartada: 'bg-red-500',
};

interface MobileFilterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  filters: FilterState;
  onFilterChange: (key: keyof FilterState, value: string) => void;
  onClearAll: () => void;
  filterOptions: FilterOptions;
  activeFilterCount: number;
  groupBy: string;
  onGroupByChange: (value: string) => void;
  criticalRubros: Set<string>;
  onToggleCriticalRubro: (rubro: string) => void;
  facets?: FacetData;
  totalItems?: number | null;
  sortBy?: SortField;
  sortOrder?: SortOrder;
  onSortChange?: (sort: SortField) => void;
  onToggleOrder?: () => void;
  nodoMap?: Record<string, Nodo>;
  onSetMany?: (updates: Partial<FilterState>) => void;
}

const MobileFilterDrawer: React.FC<MobileFilterDrawerProps> = ({
  isOpen, onClose, filters, onFilterChange, onClearAll,
  filterOptions, activeFilterCount, groupBy, onGroupByChange,
  criticalRubros, onToggleCriticalRubro, facets, totalItems,
  sortBy, sortOrder, onSortChange, onToggleOrder, nodoMap, onSetMany,
}) => {
  const [orgSearch, setOrgSearch] = useState('');

  const toggleFilter = (key: keyof FilterState, value: string) => {
    onFilterChange(key, filters[key] === value ? '' : value);
  };

  const handleSetMany = (updates: Partial<FilterState>) => {
    if (onSetMany) {
      onSetMany(updates);
    } else {
      Object.entries(updates).forEach(([k, v]) => onFilterChange(k as keyof FilterState, v as string));
    }
  };

  const fuenteItems = useMemo(() => ensureActiveValue(facets?.fuente || [], filters.fuenteFiltro), [facets?.fuente, filters.fuenteFiltro]);
  const statusItems = useMemo(() => ensureActiveValue(facets?.status || [], filters.statusFiltro), [facets?.status, filters.statusFiltro]);
  const categoryItems = useMemo(() => ensureActiveValue(facets?.category || [], filters.categoryFiltro), [facets?.category, filters.categoryFiltro]);
  const workflowItems = useMemo(() => ensureActiveValue(facets?.workflow_state || [], filters.workflowFiltro), [facets?.workflow_state, filters.workflowFiltro]);
  const jurisdiccionItems = useMemo(() => ensureActiveValue(facets?.jurisdiccion || [], filters.jurisdiccionFiltro), [facets?.jurisdiccion, filters.jurisdiccionFiltro]);
  const tipoItems = useMemo(() => ensureActiveValue(facets?.tipo_procedimiento || [], filters.tipoProcedimientoFiltro), [facets?.tipo_procedimiento, filters.tipoProcedimientoFiltro]);
  const nodoItems = useMemo(() => ensureActiveValue(facets?.nodos || [], filters.nodoFiltro), [facets?.nodos, filters.nodoFiltro]);

  const filteredOrgs = useMemo(() => {
    let orgs = ensureActiveValue(facets?.organization || [], filters.organizacionFiltro);
    if (orgSearch) {
      orgs = orgs.filter(o => o.value.toLowerCase().includes(orgSearch.toLowerCase()));
    }
    return orgs;
  }, [facets?.organization, orgSearch, filters.organizacionFiltro]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/50 z-40 transition-opacity lg:hidden ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      {/* Drawer */}
      <div className={`fixed inset-y-0 right-0 w-80 max-w-[85vw] bg-white z-50 shadow-2xl transition-transform lg:hidden ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <h3 className="font-black text-gray-800">Filtros</h3>
              {activeFilterCount > 0 && (
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold">
                  {activeFilterCount} activos
                </span>
              )}
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-0">
            {/* Year workspace */}
            <div className="pb-3 border-b border-gray-100">
              <div className="text-xs font-black text-gray-500 uppercase tracking-wider mb-2">Periodo</div>
              <YearSelector value={filters.yearWorkspace} onChange={(y) => onFilterChange('yearWorkspace', y)} />
            </div>

            {/* Sort */}
            {sortBy && onSortChange && onToggleOrder && (
              <FilterSection title="Ordenar" defaultOpen={true}>
                <div className="space-y-1">
                  {SORT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => onSortChange(opt.value)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all ${
                        sortBy === opt.value ? 'bg-emerald-50 text-emerald-800 font-bold' : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {opt.label}
                      {sortBy === opt.value && (
                        <span className="text-xs text-emerald-600">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </button>
                  ))}
                  <button onClick={onToggleOrder} className="w-full px-3 py-2 bg-gray-100 rounded-lg text-xs font-bold text-gray-600 hover:bg-gray-200 transition-colors mt-1">
                    {sortOrder === 'asc' ? '↑ Ascendente' : '↓ Descendente'} — Cambiar
                  </button>
                </div>
              </FilterSection>
            )}

            {/* Fuente */}
            <FilterSection title="Fuente" badge={filters.fuenteFiltro ? 1 : 0}>
              {fuenteItems.map((f: FacetValue) => (
                <FacetItem key={f.value} label={f.value} count={f.count} isActive={filters.fuenteFiltro === f.value} onClick={() => toggleFilter('fuenteFiltro', f.value)} />
              ))}
            </FilterSection>

            {/* Vigencia */}
            <FilterSection title="Vigencia" badge={filters.estadoFiltro ? 1 : 0}>
              <EstadoFilter value={filters.estadoFiltro} onChange={(value) => onFilterChange('estadoFiltro', value)} />
            </FilterSection>

            {/* Status */}
            <FilterSection title="Status" defaultOpen={false} badge={filters.statusFiltro ? 1 : 0}>
              {statusItems.map((f: FacetValue) => (
                <FacetItem key={f.value} label={f.value === 'active' ? 'Abierta' : f.value === 'closed' ? 'Cerrada' : f.value} count={f.count} isActive={filters.statusFiltro === f.value} onClick={() => toggleFilter('statusFiltro', f.value)} colorDot={f.value === 'active' ? 'bg-emerald-500' : 'bg-red-500'} />
              ))}
            </FilterSection>

            {/* Rubro */}
            <FilterSection title="Rubro" badge={filters.categoryFiltro ? 1 : 0}>
              <div className="max-h-48 overflow-y-auto">
                {categoryItems.map((f: FacetValue) => (
                  <FacetItem key={f.value} label={f.value} count={f.count} isActive={filters.categoryFiltro === f.value} onClick={() => toggleFilter('categoryFiltro', f.value)} />
                ))}
              </div>
            </FilterSection>

            {/* Organizacion */}
            <FilterSection title="Organizacion" defaultOpen={false} badge={filters.organizacionFiltro ? 1 : 0}>
              <input type="text" placeholder="Buscar organizacion..." className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:border-emerald-400 mb-2" value={orgSearch} onChange={(e) => setOrgSearch(e.target.value)} />
              <div className="max-h-40 overflow-y-auto">
                {filteredOrgs.map((f: FacetValue) => (
                  <FacetItem key={f.value} label={f.value} count={f.count} isActive={filters.organizacionFiltro === f.value} onClick={() => toggleFilter('organizacionFiltro', f.value)} />
                ))}
              </div>
            </FilterSection>

            {/* Workflow */}
            <FilterSection title="Workflow" defaultOpen={false} badge={filters.workflowFiltro ? 1 : 0}>
              {workflowItems.map((f: FacetValue) => (
                <FacetItem key={f.value} label={f.value.charAt(0).toUpperCase() + f.value.slice(1)} count={f.count} isActive={filters.workflowFiltro === f.value} onClick={() => toggleFilter('workflowFiltro', f.value)} colorDot={WORKFLOW_COLORS[f.value] || 'bg-gray-400'} />
              ))}
            </FilterSection>

            {/* Nodos */}
            {nodoItems.length > 0 && (
              <FilterSection title="Nodos" defaultOpen={false} badge={filters.nodoFiltro ? 1 : 0}>
                {nodoItems.map((f: FacetValue) => {
                  const nodo = nodoMap?.[f.value];
                  return (
                    <FacetItem key={f.value} label={nodo?.name || f.value.slice(0, 12) + '...'} count={f.count} isActive={filters.nodoFiltro === f.value} onClick={() => toggleFilter('nodoFiltro', f.value)} />
                  );
                })}
              </FilterSection>
            )}

            {/* Jurisdiccion */}
            <FilterSection title="Jurisdiccion" defaultOpen={false} badge={filters.jurisdiccionFiltro ? 1 : 0}>
              {jurisdiccionItems.map((f: FacetValue) => (
                <FacetItem key={f.value} label={f.value} count={f.count} isActive={filters.jurisdiccionFiltro === f.value} onClick={() => toggleFilter('jurisdiccionFiltro', f.value)} />
              ))}
            </FilterSection>

            {/* Tipo Procedimiento */}
            <FilterSection title="Tipo Procedimiento" defaultOpen={false} badge={filters.tipoProcedimientoFiltro ? 1 : 0}>
              {tipoItems.map((f: FacetValue) => (
                <FacetItem key={f.value} label={f.value} count={f.count} isActive={filters.tipoProcedimientoFiltro === f.value} onClick={() => toggleFilter('tipoProcedimientoFiltro', f.value)} />
              ))}
            </FilterSection>

            {/* Presupuesto */}
            <FilterSection title="Presupuesto" defaultOpen={false} badge={(filters.budgetMin || filters.budgetMax) ? 1 : 0}>
              <BudgetFilter budgetMin={filters.budgetMin} budgetMax={filters.budgetMax} onChange={onFilterChange} onSetMany={handleSetMany} />
            </FilterSection>

            {/* Fechas */}
            <FilterSection title="Fechas" defaultOpen={false} badge={(filters.fechaDesde || filters.fechaHasta) ? 1 : 0}>
              <DateRangeFilter fechaDesde={filters.fechaDesde} fechaHasta={filters.fechaHasta} fechaCampo={filters.fechaCampo} onChange={onFilterChange} onClear={() => handleSetMany({ fechaDesde: '', fechaHasta: '', nuevasDesde: '' })} />
            </FilterSection>

            {/* Agrupar por */}
            <FilterSection title="Agrupar por" defaultOpen={false}>
              <select className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:border-emerald-400 font-bold text-gray-700 cursor-pointer" value={groupBy} onChange={(e) => onGroupByChange(e.target.value)}>
                {GROUP_BY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </FilterSection>

            {/* Critical Rubros */}
            <FilterSection title={`Rubros criticos (${criticalRubros.size})`} defaultOpen={false}>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {filterOptions.categoryOptions.map((cat) => (
                  <label key={cat.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <input type="checkbox" checked={criticalRubros.has(cat.nombre)} onChange={() => onToggleCriticalRubro(cat.nombre)} className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500" />
                    <span className={`text-sm ${criticalRubros.has(cat.nombre) ? 'font-bold text-emerald-700' : 'text-gray-600'}`}>
                      {cat.nombre}
                    </span>
                  </label>
                ))}
              </div>
            </FilterSection>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-gray-100 space-y-2">
            {activeFilterCount > 0 && (
              <button onClick={onClearAll} className="w-full py-3 bg-red-50 text-red-600 rounded-xl font-bold text-sm hover:bg-red-100 transition-colors">
                Limpiar todos los filtros
              </button>
            )}
            <button onClick={onClose} className="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 transition-colors">
              {totalItems != null ? `Ver ${totalItems} resultados` : 'Aplicar filtros'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default React.memo(MobileFilterDrawer);
