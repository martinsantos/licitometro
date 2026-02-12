import React, { useCallback } from 'react';

interface QuickPresetButtonProps {
  onToggleTodayFilter: (today: string | null) => void;
  newItemsCount: number;
  isActive: boolean;
}

/**
 * "Nuevas de hoy" quick-access button
 *
 * Toggles a filter for today's date (fechaDesde = fechaHasta = today)
 * WITHOUT clearing other active filters.
 *
 * When active: shows green/bold state, can be clicked to toggle off
 * When inactive: shows normal state, clicking enables the filter
 *
 * This allows users to:
 * - Click "Nuevas de hoy" to see only today's items
 * - Add additional filters (rubros, nodos, etc.) without losing "Nuevas de hoy"
 * - Change sort order while maintaining the date filter
 * - Click again to remove the date filter and return to browsing all items
 */
const QuickPresetButton: React.FC<QuickPresetButtonProps> = ({
  onToggleTodayFilter,
  newItemsCount,
  isActive
}) => {
  const handleClick = useCallback(() => {
    const today = new Date().toISOString().slice(0, 10);
    onToggleTodayFilter(isActive ? null : today);
  }, [isActive, onToggleTodayFilter]);

  return (
    <button
      onClick={handleClick}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95 flex-shrink-0 ${
        isActive
          ? 'bg-emerald-600 text-white border border-emerald-700 hover:bg-emerald-700'
          : 'bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-200 text-emerald-700 hover:from-emerald-100 hover:to-green-100 hover:border-emerald-300'
      }`}
      title={isActive ? 'Remover filtro de hoy' : 'Mostrar solo licitaciones de hoy'}
    >
      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
      <span>Nuevas de hoy</span>
      {newItemsCount > 0 && (
        <span className={`inline-flex items-center justify-center px-1.5 py-0.5 ml-1 rounded text-[10px] font-black ${
          isActive
            ? 'bg-white text-emerald-600'
            : 'bg-emerald-600 text-white'
        }`}>
          {newItemsCount > 99 ? '99+' : newItemsCount}
        </span>
      )}
    </button>
  );
};

export default React.memo(QuickPresetButton);
