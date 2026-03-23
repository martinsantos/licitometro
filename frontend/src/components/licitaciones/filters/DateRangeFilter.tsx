import React from 'react';
import { FECHA_CAMPO_OPTIONS } from './constants';

interface DateRangeFilterProps {
  fechaDesde: string;
  fechaHasta: string;
  fechaCampo: string;
  onChange: (key: 'fechaDesde' | 'fechaHasta' | 'fechaCampo', value: string) => void;
  onClear: () => void;
  size?: 'sm' | 'default';
}

const DateRangeFilter: React.FC<DateRangeFilterProps> = ({
  fechaDesde, fechaHasta, fechaCampo, onChange, onClear, size = 'default',
}) => {
  const sm = size === 'sm';
  const inputCls = `w-full ${sm ? 'px-2 py-1.5 text-xs' : 'px-3 py-2 text-sm'} bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-emerald-400`;
  const selectCls = `w-full ${sm ? 'px-2 py-1.5 text-xs' : 'px-3 py-2 text-sm'} bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-emerald-400 font-bold text-gray-700 cursor-pointer`;

  return (
    <div className="space-y-2">
      <div>
        <label className="text-[10px] text-gray-400 font-bold">Campo de fecha</label>
        <select className={selectCls} value={fechaCampo || 'publication_date'} onChange={(e) => onChange('fechaCampo', e.target.value)}>
          {FECHA_CAMPO_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <div>
          <label className="text-[10px] text-gray-400 font-bold">Desde</label>
          <input type="date" className={inputCls} value={fechaDesde} onChange={(e) => onChange('fechaDesde', e.target.value)} />
        </div>
        <div>
          <label className="text-[10px] text-gray-400 font-bold">Hasta</label>
          <input type="date" className={inputCls} value={fechaHasta} onChange={(e) => onChange('fechaHasta', e.target.value)} />
        </div>
      </div>
      {(fechaDesde || fechaHasta) && (
        <button onClick={onClear} className={`${sm ? 'text-[10px]' : 'text-xs'} text-red-500 hover:text-red-700 font-bold`}>
          Limpiar fechas
        </button>
      )}
    </div>
  );
};

export default React.memo(DateRangeFilter);
