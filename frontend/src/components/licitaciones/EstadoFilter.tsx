import React from 'react';

interface EstadoFilterProps {
  value: string;
  onChange: (value: string) => void;
}

const ESTADOS = [
  { value: 'vigente', label: 'Vigentes', color: 'emerald', iconPath: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
  { value: 'prorrogada', label: 'Prorrogadas', color: 'yellow', iconPath: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
  { value: 'vencida', label: 'Vencidas', color: 'gray', iconPath: 'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z' },
  { value: 'archivada', label: 'Archivadas', color: 'slate', iconPath: 'M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4' },
];

export const EstadoFilter: React.FC<EstadoFilterProps> = ({ value, onChange }) => {
  return (
    <div className="space-y-2">
      {ESTADOS.map((estado) => {
        const isActive = value === estado.value;

        // Color classes based on estado
        const colorClasses = {
          emerald: isActive
            ? 'bg-emerald-50 text-emerald-800 border-emerald-400'
            : 'bg-white text-gray-700 border-gray-200 hover:border-emerald-300',
          yellow: isActive
            ? 'bg-yellow-50 text-yellow-800 border-yellow-400'
            : 'bg-white text-gray-700 border-gray-200 hover:border-yellow-300',
          gray: isActive
            ? 'bg-gray-50 text-gray-800 border-gray-400'
            : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300',
          slate: isActive
            ? 'bg-slate-50 text-slate-800 border-slate-400'
            : 'bg-white text-gray-700 border-gray-200 hover:border-slate-300',
        };

        const iconColors = {
          emerald: isActive ? 'text-emerald-600' : 'text-emerald-500',
          yellow: isActive ? 'text-yellow-600' : 'text-yellow-500',
          gray: isActive ? 'text-gray-600' : 'text-gray-500',
          slate: isActive ? 'text-slate-600' : 'text-slate-500',
        };

        return (
          <button
            key={estado.value}
            onClick={() => onChange(value === estado.value ? '' : estado.value)}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
              colorClasses[estado.color as keyof typeof colorClasses]
            }`}
          >
            <svg className={`w-4 h-4 ${iconColors[estado.color as keyof typeof iconColors]}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={estado.iconPath} />
            </svg>
            <span className="flex-1 text-left">{estado.label}</span>
            {isActive && (
              <span className="w-2 h-2 rounded-full bg-current"></span>
            )}
          </button>
        );
      })}
    </div>
  );
};
