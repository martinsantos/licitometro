import { useReducer, useCallback, useEffect } from 'react';
import type { FilterState } from '../types/licitacion';

const STORAGE_KEY = 'licitacionFilters';

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

function loadFiltersFromSession(): FilterState {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...initialFilters, ...JSON.parse(stored) };
    }
  } catch { /* ignore */ }
  return initialFilters;
}

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
  const [filters, dispatch] = useReducer(filterReducer, undefined, loadFiltersFromSession);

  // Persist to sessionStorage on every change
  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  }, [filters]);

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
