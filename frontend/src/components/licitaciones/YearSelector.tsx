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
  <div className="codex-tab-strip flex gap-0.5 flex-shrink-0">
    {YEARS.map((y) => (
      <button
        key={y}
        onClick={() => onChange(y)}
        className={`codex-button px-1.5 sm:px-2.5 py-1 text-[11px] sm:text-xs font-bold ${
          value === y
            ? 'codex-button--primary'
            : 'codex-button--quiet'
        }`}
      >
        {LABELS[y]}
      </button>
    ))}
  </div>
);

export default React.memo(YearSelector);
