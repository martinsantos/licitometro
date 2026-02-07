import { useReducer, useCallback } from 'react';
import type { FilterState } from '../types/licitacion';

const initialFilters: FilterState = {
  busqueda: '',
  fuenteFiltro: '',
  statusFiltro: '',
  categoryFiltro: '',
  workflowFiltro: '',
  jurisdiccionFiltro: '',
  tipoProcedimientoFiltro: '',
  budgetMin: '',
  budgetMax: '',
  fechaDesde: '',
  fechaHasta: '',
  fechaCampo: 'publication_date',
};

type FilterAction =
  | { type: 'SET_FILTER'; key: keyof FilterState; value: string }
  | { type: 'SET_MANY'; payload: Partial<FilterState> }
  | { type: 'CLEAR_ALL' };

function filterReducer(state: FilterState, action: FilterAction): FilterState {
  switch (action.type) {
    case 'SET_FILTER':
      if (state[action.key] === action.value) return state;
      return { ...state, [action.key]: action.value };
    case 'SET_MANY':
      return { ...state, ...action.payload };
    case 'CLEAR_ALL':
      return { ...initialFilters, fechaCampo: state.fechaCampo };
    default:
      return state;
  }
}

export function useLicitacionFilters() {
  const [filters, dispatch] = useReducer(filterReducer, initialFilters);

  const setFilter = useCallback((key: keyof FilterState, value: string) => {
    dispatch({ type: 'SET_FILTER', key, value });
  }, []);

  const setMany = useCallback((payload: Partial<FilterState>) => {
    dispatch({ type: 'SET_MANY', payload });
  }, []);

  const clearAll = useCallback(() => {
    dispatch({ type: 'CLEAR_ALL' });
  }, []);

  const hasActiveFilters = !!(
    filters.busqueda || filters.fuenteFiltro || filters.statusFiltro ||
    filters.categoryFiltro || filters.workflowFiltro || filters.jurisdiccionFiltro ||
    filters.tipoProcedimientoFiltro || filters.budgetMin || filters.budgetMax ||
    filters.fechaDesde || filters.fechaHasta
  );

  const activeFilterCount = [
    filters.busqueda, filters.fuenteFiltro, filters.statusFiltro,
    filters.categoryFiltro, filters.workflowFiltro, filters.jurisdiccionFiltro,
    filters.tipoProcedimientoFiltro, filters.budgetMin, filters.budgetMax,
    filters.fechaDesde, filters.fechaHasta,
  ].filter(Boolean).length;

  return { filters, setFilter, setMany, clearAll, hasActiveFilters, activeFilterCount };
}
