import React, { useCallback } from 'react';
import type { FilterState } from '../../types/licitacion';

interface QuickPresetButtonProps {
  onApplyPreset: (filters: Partial<FilterState>, sortBy: string, sortOrder: string) => void;
  newItemsCount: number;
}

const QuickPresetButton: React.FC<QuickPresetButtonProps> = ({ onApplyPreset, newItemsCount }) => {
  const handleClick = useCallback(() => {
    const today = new Date().toISOString().slice(0, 10);
    onApplyPreset(
      { fechaDesde: today, fechaHasta: today },
      'fecha_scraping',
      'desc'
    );
  }, [onApplyPreset]);

  return (
    <button
      onClick={handleClick}
      className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-200 rounded-lg text-xs font-bold text-emerald-700 hover:from-emerald-100 hover:to-green-100 hover:border-emerald-300 transition-all active:scale-95 flex-shrink-0 relative"
      title="Mostrar licitaciones indexadas hoy"
    >
      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
      <span>Nuevas de hoy</span>
      {newItemsCount > 0 && (
        <span className="inline-flex items-center justify-center px-1.5 py-0.5 ml-1 bg-emerald-600 text-white rounded text-[10px] font-black">
          {newItemsCount > 99 ? '99+' : newItemsCount}
        </span>
      )}
    </button>
  );
};

export default React.memo(QuickPresetButton);
