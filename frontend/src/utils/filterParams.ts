import type { FilterState } from '../types/licitacion';

/**
 * Single source of truth for building API query params from FilterState.
 * Used by both useLicitacionData (listing) and useFacetedFilters (sidebar counts)
 * so that filters are always identical.
 */
export function buildFilterParams(filters: FilterState, fechaCampo: string): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.busqueda) params.append('q', filters.busqueda);
  if (filters.fuenteFiltro) params.append('fuente', filters.fuenteFiltro);
  if (filters.statusFiltro) params.append('status', filters.statusFiltro);
  if (filters.categoryFiltro) params.append('category', filters.categoryFiltro);
  if (filters.workflowFiltro) params.append('workflow_state', filters.workflowFiltro);
  if (filters.jurisdiccionFiltro) params.append('jurisdiccion', filters.jurisdiccionFiltro);
  if (filters.tipoProcedimientoFiltro) params.append('tipo_procedimiento', filters.tipoProcedimientoFiltro);
  if (filters.organizacionFiltro) params.append('organization', filters.organizacionFiltro);
  if (filters.nodoFiltro) params.append('nodo', filters.nodoFiltro);
  if (filters.estadoFiltro) params.append('estado', filters.estadoFiltro);
  if (filters.budgetMin) params.append('budget_min', filters.budgetMin);
  if (filters.budgetMax) params.append('budget_max', filters.budgetMax);

  // Year workspace → 'year' param (always filters publication_date)
  if (filters.yearWorkspace && filters.yearWorkspace !== 'all') {
    params.append('year', filters.yearWorkspace);
  }

  // Explicit date range filters
  if (filters.fechaDesde) params.append('fecha_desde', filters.fechaDesde);
  if (filters.fechaHasta) params.append('fecha_hasta', filters.fechaHasta);
  if (filters.nuevasDesde) params.append('nuevas_desde', filters.nuevasDesde);

  // When nuevasDesde is active (synchronized "Nuevas de hoy" filter),
  // force fecha_campo=fecha_scraping regardless of sort mode.
  const effectiveFechaCampo = filters.nuevasDesde ? 'fecha_scraping' : fechaCampo;
  if (effectiveFechaCampo) params.append('fecha_campo', effectiveFechaCampo);

  // Jurisdiction mode filtering
  if (filters.jurisdiccionMode === 'nacional') {
    params.append('only_national', 'true');
  } else if (filters.jurisdiccionMode === 'mendoza') {
    params.append('fuente_exclude', 'Comprar.Gob.Ar');
  }

  return params;
}
