import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { FilterState, FilterOptions, ViewMode } from '../../types/licitacion';
import type { FacetData, FacetValue } from '../../hooks/useFacetedFilters';
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
  facets?: FacetData;
}

const selectBase = "px-2 py-1.5 bg-gray-50 border rounded-lg outline-none text-gray-700 font-bold cursor-pointer text-xs";
const selectClass = `${selectBase} border-transparent focus:border-emerald-500`;
const selectActive = `${selectBase} border-emerald-500 bg-emerald-50 text-emerald-700`;

// Organization combobox sub-component
const OrgCombobox: React.FC<{
  value: string;
  onChange: (v: string) => void;
  options: string[];
}> = ({ value, onChange, options }) => {
  const [open, setOpen] = useState(false);
  const [localVal, setLocalVal] = useState(value);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setLocalVal(value); }, [value]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = localVal
    ? options.filter(o => o.toLowerCase().includes(localVal.toLowerCase()))
    : options;

  return (
    <div className="relative hidden lg:block" ref={ref}>
      <input
        type="text"
        placeholder="Org..."
        className={`${value ? selectActive : selectClass} w-[100px]`}
        value={localVal}
        onChange={(e) => { setLocalVal(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
      />
      {value && (
        <button
          className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500 text-[10px]"
          onClick={() => { setLocalVal(''); onChange(''); }}
        >
          &times;
        </button>
      )}
      {open && filtered.length > 0 && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-30 max-h-48 overflow-y-auto w-56 py-1">
          {filtered.slice(0, 20).map(opt => (
            <button
              key={opt}
              className="w-full px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 truncate"
              onClick={() => { onChange(opt); setLocalVal(opt); setOpen(false); }}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const FilterBar: React.FC<FilterBarProps> = ({
  filters, onFilterChange, filterOptions, viewMode, onViewModeChange,
  groupBy, onGroupByChange, criticalRubros, onToggleCriticalRubro,
  showRubroConfig, onToggleRubroConfig,
  budgetMin, budgetMax, onBudgetMinChange, onBudgetMaxChange, facets,
}) => {
  const [showBudget, setShowBudget] = useState(false);
  const [orgOptions, setOrgOptions] = useState<string[]>([]);
  const hasBudgetFilter = !!(budgetMin || budgetMax);

  // Load org options once
  useEffect(() => {
    const backendUrl = (window as any).__BACKEND_URL || process.env.REACT_APP_BACKEND_URL || '';
    fetch(`${backendUrl}/api/licitaciones/distinct/organization`)
      .then(r => r.ok ? r.json() : [])
      .then(data => setOrgOptions(data.filter((v: string) => v && v.trim())))
      .catch(() => {});
  }, []);

  const handleOrgChange = useCallback((v: string) => {
    onFilterChange('organizacionFiltro', v);
  }, [onFilterChange]);

  // Facet count lookup helper
  const fc = useCallback((field: keyof FacetData, value: string): string => {
    if (!facets) return '';
    const list = facets[field];
    if (!list || list.length === 0) return '';
    const item = list.find((f: FacetValue) => f.value === value);
    return item ? ` (${item.count})` : ' (0)';
  }, [facets]);

  return (
    <div className="flex items-center gap-1.5 flex-nowrap">
      <select
        className={`${filters.fuenteFiltro ? selectActive : selectClass} hidden lg:block max-w-[140px]`}
        value={filters.fuenteFiltro}
        onChange={(e) => onFilterChange('fuenteFiltro', e.target.value)}
      >
        <option value="">Fuente</option>
        {filterOptions.fuenteOptions.map((f) => (
          <option key={f} value={f}>{f}{fc('fuente', f)}</option>
        ))}
      </select>

      <select
        className={`${filters.statusFiltro ? selectActive : selectClass} hidden lg:block`}
        value={filters.statusFiltro}
        onChange={(e) => onFilterChange('statusFiltro', e.target.value)}
      >
        <option value="">Estado</option>
        {filterOptions.statusOptions.map((s) => (
          <option key={s} value={s}>{s === 'active' ? 'Abierta' : s === 'closed' ? 'Cerrada' : s}{fc('status', s)}</option>
        ))}
      </select>

      {/* Organization combobox */}
      <OrgCombobox
        value={filters.organizacionFiltro}
        onChange={handleOrgChange}
        options={orgOptions}
      />

      <div className="relative hidden lg:block">
        <div className="flex items-center gap-0.5">
          <select
            className={`${filters.categoryFiltro ? selectActive : selectClass} max-w-[140px]`}
            value={filters.categoryFiltro}
            onChange={(e) => onFilterChange('categoryFiltro', e.target.value)}
          >
            <option value="">Rubro</option>
            {filterOptions.categoryOptions.map((cat) => (
              <option key={cat.id} value={cat.nombre} title={cat.nombre}>
                {cat.nombre.length > 20 ? cat.nombre.substring(0, 20) + '...' : cat.nombre}{fc('category', cat.nombre)}
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
        className={`${filters.workflowFiltro ? selectActive : selectClass} hidden lg:block`}
        value={filters.workflowFiltro}
        onChange={(e) => onFilterChange('workflowFiltro', e.target.value)}
      >
        <option value="">Workflow</option>
        <option value="descubierta">Descubierta{fc('workflow_state', 'descubierta')}</option>
        <option value="evaluando">Evaluando{fc('workflow_state', 'evaluando')}</option>
        <option value="preparando">Preparando{fc('workflow_state', 'preparando')}</option>
        <option value="presentada">Presentada{fc('workflow_state', 'presentada')}</option>
        <option value="descartada">Descartada{fc('workflow_state', 'descartada')}</option>
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

      {/* Budget range filter — funnel icon, distinct from sort $ */}
      <div className="relative hidden lg:block">
        <button
          onClick={() => setShowBudget(!showBudget)}
          className={`px-2 py-1.5 rounded-lg text-xs font-bold transition-all flex-shrink-0 ${
            hasBudgetFilter
              ? 'bg-green-100 text-green-700'
              : 'bg-gray-50 text-gray-500 hover:text-gray-700'
          }`}
          title="Filtrar por rango de presupuesto"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
        </button>
        {showBudget && (
          <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg p-3 z-30 w-56">
            <div className="text-[10px] font-bold text-gray-400 uppercase mb-2">Presupuesto</div>
            <div className="space-y-2">
              <input
                type="number"
                placeholder="Monto mínimo"
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 focus:border-emerald-500 rounded-lg outline-none text-xs text-gray-700 font-bold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                value={budgetMin || ''}
                onChange={(e) => onBudgetMinChange?.(e.target.value)}
                autoFocus
              />
              <input
                type="number"
                placeholder="Monto máximo"
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 focus:border-emerald-500 rounded-lg outline-none text-xs text-gray-700 font-bold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                value={budgetMax || ''}
                onChange={(e) => onBudgetMaxChange?.(e.target.value)}
              />
              {hasBudgetFilter && (
                <button
                  onClick={() => { onBudgetMinChange?.(''); onBudgetMaxChange?.(''); setShowBudget(false); }}
                  className="text-[10px] text-red-500 hover:text-red-700 font-bold"
                >
                  Limpiar
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* View toggle */}
      <div className="flex bg-gray-100 rounded-lg p-0.5 flex-shrink-0">
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
