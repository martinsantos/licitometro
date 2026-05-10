import React from 'react';

interface DecisionSummaryProps {
  title?: string;
  totalItems: number | null;
  activeFilterCount: number;
  isFetching?: boolean;
  hasActiveFilters?: boolean;
  onClearFilters?: () => void;
  onRetry?: () => void;
  todayActive?: boolean;
}

export function DecisionSummary({
  title = 'Estado de búsqueda',
  totalItems,
  activeFilterCount,
  isFetching = false,
  hasActiveFilters = false,
  onClearFilters,
  onRetry,
  todayActive = false,
}: DecisionSummaryProps) {
  const totalLabel = totalItems == null ? 'Sin datos' : totalItems.toLocaleString('es-AR');
  const status = isFetching ? 'Actualizando' : totalItems === 0 ? 'Sin resultados' : 'Listo para revisar';

  return (
    <section className="bg-white border border-gray-100 rounded-lg px-3 py-2.5 shadow-sm" aria-label={title}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="grid grid-cols-3 gap-2 sm:flex sm:items-center sm:gap-3">
          <div>
            <div className="text-[10px] uppercase font-bold text-gray-400">Resultados</div>
            <div className="text-sm font-black text-gray-900">{totalLabel}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-gray-400">Filtros</div>
            <div className="text-sm font-black text-gray-900">{activeFilterCount}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-gray-400">Estado</div>
            <div className="text-sm font-black text-gray-900">{status}</div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {todayActive && (
            <span className="px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 text-xs font-bold">
              Nuevas de hoy
            </span>
          )}
          {hasActiveFilters && onClearFilters && (
            <button
              type="button"
              onClick={onClearFilters}
              className="px-2.5 py-1.5 rounded-md bg-gray-100 text-gray-700 text-xs font-bold hover:bg-gray-200 transition-colors"
            >
              Limpiar filtros
            </button>
          )}
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="px-2.5 py-1.5 rounded-md bg-blue-50 text-blue-700 text-xs font-bold hover:bg-blue-100 transition-colors"
            >
              Actualizar
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

interface EmptyResultsStateProps {
  hasActiveFilters: boolean;
  onClearFilters: () => void;
  onRetry?: () => void;
}

export function EmptyResultsState({ hasActiveFilters, onClearFilters, onRetry }: EmptyResultsStateProps) {
  return (
    <div className="bg-white rounded-lg p-8 text-center border border-gray-100">
      <h3 className="text-base font-black text-gray-800 mb-2">No se encontraron licitaciones</h3>
      <p className="text-sm text-gray-500 mb-4">
        {hasActiveFilters
          ? 'Los filtros actuales no tienen coincidencias. Probá ampliar la búsqueda o limpiar filtros.'
          : 'No hay licitaciones disponibles para esta vista en este momento.'}
      </p>
      <div className="flex items-center justify-center gap-2 flex-wrap">
        {hasActiveFilters && (
          <button
            type="button"
            onClick={onClearFilters}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-bold text-sm hover:bg-emerald-700 transition-colors"
          >
            Limpiar filtros
          </button>
        )}
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-bold text-sm hover:bg-gray-200 transition-colors"
          >
            Reintentar
          </button>
        )}
      </div>
    </div>
  );
}
