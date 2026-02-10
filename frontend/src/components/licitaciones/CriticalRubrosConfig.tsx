import React from 'react';

interface CriticalRubrosConfigProps {
  categoryOptions: { id: string; nombre: string }[];
  criticalRubros: Set<string>;
  onToggle: (rubro: string) => void;
  onClose: () => void;
}

const CriticalRubrosConfig: React.FC<CriticalRubrosConfigProps> = ({
  categoryOptions, criticalRubros, onToggle, onClose,
}) => (
  <div className="absolute top-full right-0 mt-2 w-80 bg-white rounded-xl shadow-2xl border border-gray-200 p-4 z-50">
    <div className="flex items-center justify-between mb-3">
      <h4 className="font-black text-gray-800 text-sm">Mis Rubros Criticos</h4>
      <span className="text-xs text-gray-400">{criticalRubros.size} seleccionados</span>
    </div>
    <p className="text-xs text-gray-500 mb-3">Las licitaciones de estos rubros apareceran primero y destacadas.</p>
    <div className="max-h-60 overflow-y-auto space-y-1">
      {categoryOptions.map((cat) => (
        <label key={cat.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 cursor-pointer">
          <input
            type="checkbox"
            checked={criticalRubros.has(cat.nombre)}
            onChange={() => onToggle(cat.nombre)}

            className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
          />
          <span className={`text-sm ${criticalRubros.has(cat.nombre) ? 'font-bold text-emerald-700' : 'text-gray-600'}`}>
            {cat.nombre}
          </span>
        </label>
      ))}
    </div>
    <button
      onClick={onClose}
      className="mt-3 w-full py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-bold text-gray-600 transition-colors"
    >
      Cerrar
    </button>
  </div>
);

export default React.memo(CriticalRubrosConfig);
