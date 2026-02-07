import React from 'react';
import type { FilterState, FilterOptions } from '../../types/licitacion';

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
}

const selectClass = "w-full px-4 py-3 bg-gray-50 border-2 border-transparent focus:border-blue-500 rounded-xl outline-none text-gray-700 font-bold cursor-pointer text-sm";
const labelClass = "block text-xs font-bold text-gray-500 uppercase mb-1.5";

const MobileFilterDrawer: React.FC<MobileFilterDrawerProps> = ({
  isOpen, onClose, filters, onFilterChange, onClearAll,
  filterOptions, activeFilterCount, groupBy, onGroupByChange,
  criticalRubros, onToggleCriticalRubro,
}) => {
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
                  {activeFilterCount}
                </span>
              )}
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Filters */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div>
              <label className={labelClass}>Fuente</label>
              <select className={selectClass} value={filters.fuenteFiltro} onChange={(e) => onFilterChange('fuenteFiltro', e.target.value)}>
                <option value="">Todas las fuentes</option>
                {filterOptions.fuenteOptions.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>

            <div>
              <label className={labelClass}>Estado</label>
              <select className={selectClass} value={filters.statusFiltro} onChange={(e) => onFilterChange('statusFiltro', e.target.value)}>
                <option value="">Todos los estados</option>
                {filterOptions.statusOptions.map((s) => (
                  <option key={s} value={s}>{s === 'active' ? 'Abierta' : s === 'closed' ? 'Cerrada' : s}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>Rubro</label>
              <select className={selectClass} value={filters.categoryFiltro} onChange={(e) => onFilterChange('categoryFiltro', e.target.value)}>
                <option value="">Todos los rubros</option>
                {filterOptions.categoryOptions.map((cat) => (
                  <option key={cat.id} value={cat.nombre}>{cat.nombre}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>Workflow</label>
              <select className={selectClass} value={filters.workflowFiltro} onChange={(e) => onFilterChange('workflowFiltro', e.target.value)}>
                <option value="">Todos</option>
                <option value="descubierta">Descubierta</option>
                <option value="evaluando">Evaluando</option>
                <option value="preparando">Preparando</option>
                <option value="presentada">Presentada</option>
                <option value="descartada">Descartada</option>
              </select>
            </div>

            <div>
              <label className={labelClass}>Agrupar por</label>
              <select className={selectClass} value={groupBy} onChange={(e) => onGroupByChange(e.target.value)}>
                <option value="none">Sin agrupar</option>
                <option value="organization">Por Organizacion</option>
                <option value="fuente">Por Fuente</option>
                <option value="status">Por Estado</option>
                <option value="jurisdiccion">Por Jurisdiccion</option>
                <option value="procedimiento">Por Procedimiento</option>
                <option value="category">Por Rubro</option>
              </select>
            </div>

            <div>
              <label className={labelClass}>Presupuesto minimo</label>
              <input type="number" placeholder="Desde $..." className={selectClass} value={filters.budgetMin} onChange={(e) => onFilterChange('budgetMin', e.target.value)} />
            </div>

            <div>
              <label className={labelClass}>Presupuesto maximo</label>
              <input type="number" placeholder="Hasta $..." className={selectClass} value={filters.budgetMax} onChange={(e) => onFilterChange('budgetMax', e.target.value)} />
            </div>

            {/* Critical Rubros */}
            <div>
              <label className={labelClass}>Rubros criticos ({criticalRubros.size}/5)</label>
              <div className="max-h-40 overflow-y-auto space-y-1 bg-gray-50 rounded-xl p-2">
                {filterOptions.categoryOptions.map((cat) => (
                  <label key={cat.id} className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-white cursor-pointer">
                    <input
                      type="checkbox"
                      checked={criticalRubros.has(cat.nombre)}
                      onChange={() => onToggleCriticalRubro(cat.nombre)}
                      disabled={!criticalRubros.has(cat.nombre) && criticalRubros.size >= 5}
                      className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className={`text-xs ${criticalRubros.has(cat.nombre) ? 'font-bold text-emerald-700' : 'text-gray-600'}`}>
                      {cat.nombre}
                    </span>
                  </label>
                ))}
              </div>
            </div>
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
              Aplicar filtros
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default React.memo(MobileFilterDrawer);
