import React, { useState, useEffect } from 'react';

interface AdvancedSearchPanelProps {
  apiUrl: string;
  // Current filter values
  busqueda: string;
  fuenteFiltro: string;
  statusFiltro: string;
  categoryFiltro: string;
  workflowFiltro: string;
  jurisdiccionFiltro: string;
  tipoProcedimientoFiltro: string;
  budgetMin: string;
  budgetMax: string;
  // Setters
  onBusquedaChange: (v: string) => void;
  onFuenteChange: (v: string) => void;
  onStatusChange: (v: string) => void;
  onCategoryChange: (v: string) => void;
  onWorkflowChange: (v: string) => void;
  onJurisdiccionChange: (v: string) => void;
  onTipoProcedimientoChange: (v: string) => void;
  onBudgetMinChange: (v: string) => void;
  onBudgetMaxChange: (v: string) => void;
  onClearAll: () => void;
  // Options
  fuenteOptions: string[];
  statusOptions: string[];
  categoryOptions: { id: string; nombre: string }[];
  criticalRubros: Set<string>;
}

const AdvancedSearchPanel = ({
  apiUrl,
  busqueda,
  fuenteFiltro,
  statusFiltro,
  categoryFiltro,
  workflowFiltro,
  jurisdiccionFiltro,
  tipoProcedimientoFiltro,
  budgetMin,
  budgetMax,
  onBusquedaChange,
  onFuenteChange,
  onStatusChange,
  onCategoryChange,
  onWorkflowChange,
  onJurisdiccionChange,
  onTipoProcedimientoChange,
  onBudgetMinChange,
  onBudgetMaxChange,
  onClearAll,
  fuenteOptions,
  statusOptions,
  categoryOptions,
  criticalRubros,
}: AdvancedSearchPanelProps) => {
  const [jurisdiccionOptions, setJurisdiccionOptions] = useState<string[]>([]);
  const [tipoProcOptions, setTipoProcOptions] = useState<string[]>([]);

  useEffect(() => {
    const loadOptions = async () => {
      try {
        const [jurisRes, tipoRes] = await Promise.all([
          fetch(`${apiUrl}/api/licitaciones/distinct/jurisdiccion`),
          fetch(`${apiUrl}/api/licitaciones/distinct/tipo_procedimiento`),
        ]);
        if (jurisRes.ok) {
          const data = await jurisRes.json();
          setJurisdiccionOptions(data.filter((v: string) => v && v.trim()));
        }
        if (tipoRes.ok) {
          const data = await tipoRes.json();
          setTipoProcOptions(data.filter((v: string) => v && v.trim()));
        }
      } catch (err) {
        console.error('Error loading advanced filter options:', err);
      }
    };
    loadOptions();
  }, [apiUrl]);

  const activeCount = [
    busqueda, fuenteFiltro, statusFiltro, categoryFiltro,
    workflowFiltro, jurisdiccionFiltro, tipoProcedimientoFiltro,
    budgetMin, budgetMax,
  ].filter(Boolean).length;

  const selectClass = "w-full px-3 py-2.5 bg-gray-50 border border-gray-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-200 rounded-lg outline-none text-gray-700 font-medium text-sm";
  const inputClass = "w-full px-3 py-2.5 bg-gray-50 border border-gray-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-200 rounded-lg outline-none text-gray-700 font-medium text-sm";
  const labelClass = "block text-xs font-bold text-gray-500 uppercase mb-1.5";

  return (
    <div className="bg-gradient-to-b from-gray-50 to-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          <h3 className="font-black text-gray-800 text-sm">Búsqueda Avanzada</h3>
          {activeCount > 0 && (
            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-bold">
              {activeCount} filtros
            </span>
          )}
        </div>
        {activeCount > 0 && (
          <button
            onClick={onClearAll}
            className="text-xs text-red-500 hover:text-red-700 font-bold flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
            Limpiar todo
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Text search */}
        <div className="sm:col-span-2">
          <label className={labelClass}>Texto libre</label>
          <input
            type="text"
            placeholder="Buscar en título, descripción, organización..."
            className={inputClass}
            value={busqueda}
            onChange={(e) => onBusquedaChange(e.target.value)}
          />
        </div>

        {/* Jurisdiccion */}
        <div>
          <label className={labelClass}>Jurisdicción</label>
          <select
            className={selectClass}
            value={jurisdiccionFiltro}
            onChange={(e) => onJurisdiccionChange(e.target.value)}
          >
            <option value="">Todas</option>
            {jurisdiccionOptions.map((j) => (
              <option key={j} value={j}>{j}</option>
            ))}
          </select>
        </div>

        {/* Tipo procedimiento */}
        <div>
          <label className={labelClass}>Tipo procedimiento</label>
          <select
            className={selectClass}
            value={tipoProcedimientoFiltro}
            onChange={(e) => onTipoProcedimientoChange(e.target.value)}
          >
            <option value="">Todos</option>
            {tipoProcOptions.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        {/* Rubro / Category */}
        <div>
          <label className={labelClass}>Rubro</label>
          <select
            className={selectClass}
            value={categoryFiltro}
            onChange={(e) => onCategoryChange(e.target.value)}
          >
            <option value="">Todos</option>
            {categoryOptions.map((cat) => (
              <option key={cat.id} value={cat.nombre}>
                {criticalRubros.has(cat.nombre) ? '★ ' : ''}{cat.nombre}
              </option>
            ))}
          </select>
        </div>

        {/* Organization/Fuente */}
        <div>
          <label className={labelClass}>Fuente</label>
          <select
            className={selectClass}
            value={fuenteFiltro}
            onChange={(e) => onFuenteChange(e.target.value)}
          >
            <option value="">Todas</option>
            {fuenteOptions.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>

        {/* Status */}
        <div>
          <label className={labelClass}>Estado</label>
          <select
            className={selectClass}
            value={statusFiltro}
            onChange={(e) => onStatusChange(e.target.value)}
          >
            <option value="">Todos</option>
            {statusOptions.map((s) => (
              <option key={s} value={s}>{s === 'active' ? 'Abierta' : s === 'closed' ? 'Cerrada' : s}</option>
            ))}
          </select>
        </div>

        {/* Workflow */}
        <div>
          <label className={labelClass}>Workflow</label>
          <select
            className={selectClass}
            value={workflowFiltro}
            onChange={(e) => onWorkflowChange(e.target.value)}
          >
            <option value="">Todos</option>
            <option value="descubierta">Descubierta</option>
            <option value="evaluando">Evaluando</option>
            <option value="preparando">Preparando</option>
            <option value="presentada">Presentada</option>
            <option value="descartada">Descartada</option>
          </select>
        </div>

        {/* Budget range */}
        <div>
          <label className={labelClass}>Presupuesto mínimo</label>
          <input
            type="number"
            placeholder="Desde $..."
            className={inputClass}
            value={budgetMin}
            onChange={(e) => onBudgetMinChange(e.target.value)}
          />
        </div>

        <div>
          <label className={labelClass}>Presupuesto máximo</label>
          <input
            type="number"
            placeholder="Hasta $..."
            className={inputClass}
            value={budgetMax}
            onChange={(e) => onBudgetMaxChange(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
};

export default AdvancedSearchPanel;
