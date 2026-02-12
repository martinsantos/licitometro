import React from 'react';

interface YearSelectorProps {
  value: string;
  onChange: (year: string) => void;
}

const currentYear = new Date().getFullYear();
const YEARS = [String(currentYear), String(currentYear - 1), 'all'];
const LABELS: Record<string, string> = {
  [String(currentYear)]: String(currentYear),
  [String(currentYear - 1)]: String(currentYear - 1),
  all: 'Todas',
};

const YearSelector: React.FC<YearSelectorProps> = ({ value, onChange }) => (
  <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5 flex-shrink-0">
    {YEARS.map((y) => (
      <button
        key={y}
        onClick={() => onChange(y)}
        className={`px-1.5 sm:px-2.5 py-1 rounded-md text-[11px] sm:text-xs font-bold transition-all ${
          value === y
            ? 'bg-white text-gray-800 shadow-sm'
            : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        {LABELS[y]}
      </button>
    ))}
  </div>
);

export default React.memo(YearSelector);
