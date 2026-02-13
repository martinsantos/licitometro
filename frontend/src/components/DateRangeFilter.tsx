import React from 'react';

interface DateRangeFilterProps {
  fechaDesde: string;
  fechaHasta: string;
  fechaCampo: string;
  onFechaDesdeChange: (val: string) => void;
  onFechaHastaChange: (val: string) => void;
  onFechaCampoChange: (val: string) => void;
  onClear: () => void;
}

const PRESETS = [
  { label: 'Última semana', days: -7 },
  { label: 'Último mes', days: -30 },
  { label: 'Próximos 30 días', days: 30 },
];

const DATE_FIELDS = [
  { value: 'publication_date', label: 'Publicación' },
  { value: 'opening_date', label: 'Apertura' },
  { value: 'expiration_date', label: 'Vencimiento' },
  { value: 'first_seen_at', label: 'Descubierta (1ra vez)' },
  { value: 'fecha_scraping', label: 'Indexada (última)' },
  { value: 'created_at', label: 'Creada en BD' },
];

const DateRangeFilter: React.FC<DateRangeFilterProps> = ({
  fechaDesde,
  fechaHasta,
  fechaCampo,
  onFechaDesdeChange,
  onFechaHastaChange,
  onFechaCampoChange,
  onClear,
}) => {
  const applyPreset = (days: number) => {
    const today = new Date();
    if (days < 0) {
      const from = new Date(today);
      from.setDate(from.getDate() + days);
      onFechaDesdeChange(from.toISOString().split('T')[0]);
      onFechaHastaChange(today.toISOString().split('T')[0]);
    } else {
      const to = new Date(today);
      to.setDate(to.getDate() + days);
      onFechaDesdeChange(today.toISOString().split('T')[0]);
      onFechaHastaChange(to.toISOString().split('T')[0]);
    }
  };

  const hasFilter = fechaDesde || fechaHasta;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Date field selector */}
      <select
        className="px-3 py-2 bg-gray-50 border-2 border-transparent focus:border-blue-500 rounded-xl outline-none text-gray-700 font-bold cursor-pointer text-sm"
        value={fechaCampo}
        onChange={(e) => onFechaCampoChange(e.target.value)}
      >
        {DATE_FIELDS.map((f) => (
          <option key={f.value} value={f.value}>{f.label}</option>
        ))}
      </select>

      {/* From date */}
      <input
        type="date"
        className="px-3 py-2 bg-gray-50 border-2 border-transparent focus:border-blue-500 rounded-xl outline-none text-gray-700 font-bold text-sm"
        value={fechaDesde}
        onChange={(e) => onFechaDesdeChange(e.target.value)}
        title="Desde"
      />
      <span className="text-gray-400 text-sm font-bold">a</span>
      {/* To date */}
      <input
        type="date"
        className="px-3 py-2 bg-gray-50 border-2 border-transparent focus:border-blue-500 rounded-xl outline-none text-gray-700 font-bold text-sm"
        value={fechaHasta}
        onChange={(e) => onFechaHastaChange(e.target.value)}
        title="Hasta"
      />

      {/* Presets */}
      {PRESETS.map((p) => (
        <button
          key={p.label}
          onClick={() => applyPreset(p.days)}
          className="px-3 py-2 bg-gray-50 hover:bg-gray-100 rounded-xl text-xs font-bold text-gray-600 transition-all"
        >
          {p.label}
        </button>
      ))}

      {/* Clear */}
      {hasFilter && (
        <button
          onClick={onClear}
          className="px-3 py-2 bg-red-50 hover:bg-red-100 rounded-xl text-xs font-bold text-red-600 transition-all"
          title="Limpiar filtro de fechas"
        >
          Limpiar
        </button>
      )}
    </div>
  );
};

export default DateRangeFilter;
