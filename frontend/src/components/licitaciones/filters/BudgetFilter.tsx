import React from 'react';

const BUDGET_PRESETS = [
  { label: '<100K', min: '', max: '100000' },
  { label: '100K-1M', min: '100000', max: '1000000' },
  { label: '>1M', min: '1000000', max: '' },
] as const;

interface BudgetFilterProps {
  budgetMin: string;
  budgetMax: string;
  onChange: (key: 'budgetMin' | 'budgetMax', value: string) => void;
  onSetMany: (updates: { budgetMin: string; budgetMax: string }) => void;
  size?: 'sm' | 'default';
}

const BudgetFilter: React.FC<BudgetFilterProps> = ({
  budgetMin, budgetMax, onChange, onSetMany, size = 'default',
}) => {
  const sm = size === 'sm';
  const inputCls = `w-full ${sm ? 'px-2 py-1.5 text-xs' : 'px-3 py-2 text-sm'} bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-emerald-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`;

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input type="number" placeholder="Min $" className={inputCls} value={budgetMin} onChange={(e) => onChange('budgetMin', e.target.value)} />
        <input type="number" placeholder="Max $" className={inputCls} value={budgetMax} onChange={(e) => onChange('budgetMax', e.target.value)} />
      </div>
      <div className={`flex gap-1 ${sm ? 'flex-wrap' : ''}`}>
        {BUDGET_PRESETS.map((preset) => (
          <button
            key={preset.label}
            onClick={() => onSetMany({ budgetMin: preset.min, budgetMax: preset.max })}
            className={`${sm ? '' : 'flex-1'} px-2 ${sm ? 'py-1' : 'py-1.5'} rounded ${sm ? 'text-[10px]' : 'text-xs'} font-bold transition-colors ${
              budgetMin === preset.min && budgetMax === preset.max
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>
      {(budgetMin || budgetMax) && (
        <button
          onClick={() => onSetMany({ budgetMin: '', budgetMax: '' })}
          className={`${sm ? 'text-[10px]' : 'text-xs'} text-red-500 hover:text-red-700 font-bold`}
        >
          Limpiar presupuesto
        </button>
      )}
    </div>
  );
};

export default React.memo(BudgetFilter);
