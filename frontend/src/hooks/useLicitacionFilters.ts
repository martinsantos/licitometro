import { useReducer, useCallback, useEffect } from 'react';
import type { FilterState } from '../types/licitacion';

const STORAGE_KEY = 'licitacionFilters';
const YEAR_STORAGE_KEY = 'yearWorkspace';
const FILTERS_VERSION = 6; // Bump this to clear stuck filters on deploy

function getDefaultYear(): string {
  // Persist across sessions via localStorage
  try {
    const stored = localStorage.getItem(YEAR_STORAGE_KEY);
    if (stored === 'all' || (stored && /^\d{4}$/.test(stored))) return stored;
  } catch { /* ignore */ }
  return new Date().getFullYear().toString();
}

const initialFilters: FilterState = {
  busqueda: '',
  fuenteFiltro: '',
  statusFiltro: '',
  categoryFiltro: '',
  workflowFiltro: '',
  jurisdiccionFiltro: '',
  tipoProcedimientoFiltro: '',
  organizacionFiltro: '',
  nodoFiltro: '',
  estadoFiltro: '',
  budgetMin: '',
  budgetMax: '',
  fechaDesde: '',
  fechaHasta: '',
  nuevasDesde: '',
  yearWorkspace: getDefaultYear(),
  jurisdiccionMode: 'all',  // Default: show all sources (Mendoza + Argentina)
};

function loadFiltersFromSession(): FilterState {
  try {
    const versionKey = STORAGE_KEY + '_v';
    const storedVersion = sessionStorage.getItem(versionKey);
    if (storedVersion !== String(FILTERS_VERSION)) {
      // Version mismatch: clear stuck filters from previous code
      sessionStorage.removeItem(STORAGE_KEY);
      sessionStorage.setItem(versionKey, String(FILTERS_VERSION));
      return initialFilters;
    }
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
      // Preserve yearWorkspace on clear
      return { ...initialFilters, yearWorkspace: state.yearWorkspace };
    default:
      return state;
  }
}

export function useLicitacionFilters(overrides?: Partial<FilterState>) {
  const [filters, dispatch] = useReducer(
    filterReducer,
    undefined,
    () => ({ ...loadFiltersFromSession(), ...overrides })
  );

  // Persist to sessionStorage on every change
  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  }, [filters]);

  // Persist yearWorkspace to localStorage (survives browser close)
  useEffect(() => {
    try { localStorage.setItem(YEAR_STORAGE_KEY, filters.yearWorkspace); } catch { /* ignore */ }
  }, [filters.yearWorkspace]);

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
    filters.tipoProcedimientoFiltro || filters.organizacionFiltro ||
    filters.nodoFiltro ||
    filters.budgetMin || filters.budgetMax ||
    filters.fechaDesde || filters.fechaHasta ||
    filters.nuevasDesde
  );

  const activeFilterCount = [
    filters.busqueda, filters.fuenteFiltro, filters.statusFiltro,
    filters.categoryFiltro, filters.workflowFiltro, filters.jurisdiccionFiltro,
    filters.tipoProcedimientoFiltro, filters.organizacionFiltro,
    filters.nodoFiltro,
    filters.budgetMin, filters.budgetMax,
    filters.fechaDesde, filters.fechaHasta,
    filters.nuevasDesde,
  ].filter(Boolean).length;

  return { filters, setFilter, setMany, clearAll, hasActiveFilters, activeFilterCount };
}
