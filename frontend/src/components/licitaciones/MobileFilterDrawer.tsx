import React, { useState, useMemo } from 'react';
import type { FilterState, FilterOptions, SortField, SortOrder, Nodo } from '../../types/licitacion';
import type { FacetData, FacetValue } from '../../hooks/useFacetedFilters';
import YearSelector from './YearSelector';
import { EstadoFilter } from './EstadoFilter';

// Ensure active filter value always appears in facet list (even when 0 results)
function ensureActiveValue(facetItems: FacetValue[], activeValue: string): FacetValue[] {
  if (!activeValue) return facetItems;
  if (facetItems.length === 0) return [{ value: activeValue, count: 0 }];
  if (!facetItems.find(f => f.value === activeValue)) {
    return [{ value: activeValue, count: 0 }, ...facetItems];
  }
  return facetItems;
}

const FECHA_CAMPO_LABELS: Record<string, string> = {
  publication_date: 'Publicacion',
  opening_date: 'Apertura',
  fecha_scraping: 'Indexacion',
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
  fechaCampo: string;
  nodoMap?: Record<string, Nodo>;
}

// Collapsible section
const Section: React.FC<{
  title: string;
  defaultOpen?: boolean;
  badge?: number;
  children: React.ReactNode;
}> = ({ title, defaultOpen = true, badge, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-gray-100">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-3 px-1 text-xs font-black text-gray-500 uppercase tracking-wider"
      >
        <span className="flex items-center gap-1.5">
          {title}
          {badge != null && badge > 0 && (
            <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-bold normal-case">
              {badge}
            </span>
          )}
        </span>
        <svg className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="pb-3">{children}</div>}
    </div>
  );
};

// Clickable facet item
const FacetItem: React.FC<{
  label: string;
  count: number;
  isActive: boolean;
  onClick: () => void;
  colorDot?: string;
}> = ({ label, count, isActive, onClick, colorDot }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all ${
      isActive
        ? 'bg-emerald-50 text-emerald-800 font-bold'
        : count === 0
        ? 'text-gray-300'
        : 'text-gray-600 hover:bg-gray-50'
    }`}
  >
    <span className="flex items-center gap-2 min-w-0">
      {colorDot && <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${colorDot}`} />}
      <span className="truncate">{label}</span>
    </span>
    <span className={`flex-shrink-0 text-xs font-bold ${isActive ? 'text-emerald-600' : 'text-gray-400'}`}>
      {count}
    </span>
  </button>
);

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'publication_date', label: 'Publicacion' },
  { value: 'opening_date', label: 'Apertura' },
  { value: 'fecha_scraping', label: 'Indexacion' },
  { value: 'budget', label: 'Presupuesto' },
  { value: 'title', label: 'Nombre A-Z' },
];

const MobileFilterDrawer: React.FC<MobileFilterDrawerProps> = ({
  isOpen, onClose, filters, onFilterChange, onClearAll,
  filterOptions, activeFilterCount, groupBy, onGroupByChange,
  criticalRubros, onToggleCriticalRubro, facets, totalItems,
  sortBy, sortOrder, onSortChange, onToggleOrder, fechaCampo, nodoMap,
}) => {
  const [orgSearch, setOrgSearch] = useState('');

  const toggleFilter = (key: keyof FilterState, value: string) => {
    onFilterChange(key, filters[key] === value ? '' : value);
  };

  // Facet lists with active-value guarantee
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
              <YearSelector
                value={filters.yearWorkspace}
                onChange={(y) => onFilterChange('yearWorkspace', y)}
              />
            </div>

            {/* Sort */}
            {sortBy && onSortChange && onToggleOrder && (
              <Section title="Ordenar" defaultOpen={true}>
                <div className="space-y-1">
                  {SORT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => onSortChange(opt.value)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all ${
                        sortBy === opt.value
                          ? 'bg-emerald-50 text-emerald-800 font-bold'
                          : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {opt.label}
                      {sortBy === opt.value && (
                        <span className="text-xs text-emerald-600">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </button>
                  ))}
                  <button
                    onClick={onToggleOrder}
                    className="w-full px-3 py-2 bg-gray-100 rounded-lg text-xs font-bold text-gray-600 hover:bg-gray-200 transition-colors mt-1"
                  >
                    {sortOrder === 'asc' ? '↑ Ascendente' : '↓ Descendente'} — Cambiar
                  </button>
                </div>
              </Section>
            )}

            {/* Fuente */}
            <Section title="Fuente" badge={filters.fuenteFiltro ? 1 : 0}>
              {fuenteItems.map((f: FacetValue) => (
                <FacetItem
                  key={f.value}
                  label={f.value}
                  count={f.count}
                  isActive={filters.fuenteFiltro === f.value}
                  onClick={() => toggleFilter('fuenteFiltro', f.value)}
                />
              ))}
            </Section>

            {/* Vigencia */}
            <Section title="Vigencia" badge={filters.estadoFiltro ? 1 : 0}>
              <EstadoFilter
                value={filters.estadoFiltro}
                onChange={(value) => onFilterChange('estadoFiltro', value)}
              />
            </Section>

            {/* Estado (legacy) */}
            <Section title="Status" defaultOpen={false} badge={filters.statusFiltro ? 1 : 0}>
              {statusItems.map((f: FacetValue) => (
                <FacetItem
                  key={f.value}
                  label={f.value === 'active' ? 'Abierta' : f.value === 'closed' ? 'Cerrada' : f.value}
                  count={f.count}
                  isActive={filters.statusFiltro === f.value}
                  onClick={() => toggleFilter('statusFiltro', f.value)}
                  colorDot={f.value === 'active' ? 'bg-emerald-500' : 'bg-red-500'}
                />
              ))}
            </Section>

            {/* Rubro */}
            <Section title="Rubro" badge={filters.categoryFiltro ? 1 : 0}>
              <div className="max-h-48 overflow-y-auto">
                {categoryItems.map((f: FacetValue) => (
                  <FacetItem
                    key={f.value}
                    label={f.value}
                    count={f.count}
                    isActive={filters.categoryFiltro === f.value}
                    onClick={() => toggleFilter('categoryFiltro', f.value)}
                  />
                ))}
              </div>
            </Section>

            {/* Organizacion */}
            <Section title="Organizacion" defaultOpen={false} badge={filters.organizacionFiltro ? 1 : 0}>
              <input
                type="text"
                placeholder="Buscar organizacion..."
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:border-emerald-400 mb-2"
                value={orgSearch}
                onChange={(e) => setOrgSearch(e.target.value)}
              />
              <div className="max-h-40 overflow-y-auto">
                {filteredOrgs.map((f: FacetValue) => (
                  <FacetItem
                    key={f.value}
                    label={f.value}
                    count={f.count}
                    isActive={filters.organizacionFiltro === f.value}
                    onClick={() => toggleFilter('organizacionFiltro', f.value)}
                  />
                ))}
              </div>
            </Section>

            {/* Workflow */}
            <Section title="Workflow" defaultOpen={false} badge={filters.workflowFiltro ? 1 : 0}>
              {workflowItems.map((f: FacetValue) => {
                const colors: Record<string, string> = {
                  descubierta: 'bg-gray-400', evaluando: 'bg-blue-500',
                  preparando: 'bg-yellow-500', presentada: 'bg-emerald-500', descartada: 'bg-red-500',
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
            </Section>

            {/* Nodos */}
            {nodoItems.length > 0 && (
              <Section title="Nodos" defaultOpen={false} badge={filters.nodoFiltro ? 1 : 0}>
                {nodoItems.map((f: FacetValue) => {
                  const nodo = nodoMap?.[f.value];
                  return (
                    <FacetItem
                      key={f.value}
                      label={nodo?.name || f.value.slice(0, 12) + '...'}
                      count={f.count}
                      isActive={filters.nodoFiltro === f.value}
                      onClick={() => toggleFilter('nodoFiltro', f.value)}
                    />
                  );
                })}
              </Section>
            )}

            {/* Jurisdiccion */}
            <Section title="Jurisdiccion" defaultOpen={false} badge={filters.jurisdiccionFiltro ? 1 : 0}>
              {jurisdiccionItems.map((f: FacetValue) => (
                <FacetItem
                  key={f.value}
                  label={f.value}
                  count={f.count}
                  isActive={filters.jurisdiccionFiltro === f.value}
                  onClick={() => toggleFilter('jurisdiccionFiltro', f.value)}
                />
              ))}
            </Section>

            {/* Tipo Procedimiento */}
            <Section title="Tipo Procedimiento" defaultOpen={false} badge={filters.tipoProcedimientoFiltro ? 1 : 0}>
              {tipoItems.map((f: FacetValue) => (
                <FacetItem
                  key={f.value}
                  label={f.value}
                  count={f.count}
                  isActive={filters.tipoProcedimientoFiltro === f.value}
                  onClick={() => toggleFilter('tipoProcedimientoFiltro', f.value)}
                />
              ))}
            </Section>

            {/* Presupuesto */}
            <Section title="Presupuesto" defaultOpen={false} badge={(filters.budgetMin || filters.budgetMax) ? 1 : 0}>
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="number"
                    placeholder="Min $"
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:border-emerald-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    value={filters.budgetMin}
                    onChange={(e) => onFilterChange('budgetMin', e.target.value)}
                  />
                  <input
                    type="number"
                    placeholder="Max $"
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:border-emerald-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    value={filters.budgetMax}
                    onChange={(e) => onFilterChange('budgetMax', e.target.value)}
                  />
                </div>
                <div className="flex gap-1">
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
                      className={`flex-1 px-2 py-1.5 rounded text-xs font-bold transition-colors ${
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
            </Section>

            {/* Fechas */}
            <Section title="Fechas" defaultOpen={false} badge={(filters.fechaDesde || filters.fechaHasta) ? 1 : 0}>
              <div className="space-y-2">
                <div className="text-xs text-gray-400 font-bold mb-1">
                  Filtrando por: <span className="text-emerald-600">{FECHA_CAMPO_LABELS[fechaCampo] || fechaCampo}</span>
                  <span className="text-gray-300 ml-1">(segun orden)</span>
                </div>
                <div className="space-y-1.5">
                  <div>
                    <label className="text-[10px] text-gray-400 font-bold">Desde</label>
                    <input
                      type="date"
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:border-emerald-400"
                      value={filters.fechaDesde}
                      onChange={(e) => onFilterChange('fechaDesde', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 font-bold">Hasta</label>
                    <input
                      type="date"
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:border-emerald-400"
                      value={filters.fechaHasta}
                      onChange={(e) => onFilterChange('fechaHasta', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </Section>

            {/* Agrupar por */}
            <Section title="Agrupar por" defaultOpen={false}>
              <select
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:border-emerald-400 font-bold text-gray-700 cursor-pointer"
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
            </Section>

            {/* Critical Rubros */}
            <Section title={`Rubros criticos (${criticalRubros.size})`} defaultOpen={false}>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {filterOptions.categoryOptions.map((cat) => (
                  <label key={cat.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={criticalRubros.has(cat.nombre)}
                      onChange={() => onToggleCriticalRubro(cat.nombre)}

                      className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className={`text-sm ${criticalRubros.has(cat.nombre) ? 'font-bold text-emerald-700' : 'text-gray-600'}`}>
                      {cat.nombre}
                    </span>
                  </label>
                ))}
              </div>
            </Section>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-gray-100 space-y-2">
            {activeFilterCount > 0 && (
              <button
                onClick={onClearAll}
                className="w-full py-3 bg-red-50 text-red-600 rounded-xl font-bold text-sm hover:bg-red-100 transition-colors"
              >
                Limpiar todos los filtros
              </button>
            )}
            <button
              onClick={onClose}
              className="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 transition-colors"
            >
              {totalItems != null ? `Ver ${totalItems} resultados` : 'Aplicar filtros'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default React.memo(MobileFilterDrawer);
