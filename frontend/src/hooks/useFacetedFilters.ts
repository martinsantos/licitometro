import { useState, useEffect, useRef } from 'react';
import type { FilterState } from '../types/licitacion';

export interface FacetValue {
  value: string;
  count: number;
}

export interface FacetData {
  fuente: FacetValue[];
  status: FacetValue[];
  category: FacetValue[];
  workflow_state: FacetValue[];
  jurisdiccion: FacetValue[];
  tipo_procedimiento: FacetValue[];
  organization: FacetValue[];
  nodos: FacetValue[];
}

const EMPTY_FACETS: FacetData = {
  fuente: [],
  status: [],
  category: [],
  workflow_state: [],
  jurisdiccion: [],
  tipo_procedimiento: [],
  organization: [],
  nodos: [],
};

export function useFacetedFilters(apiUrl: string, filters: FilterState, fechaCampo: string): FacetData {
  const [facets, setFacets] = useState<FacetData>(EMPTY_FACETS);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Debounce facet fetching by 300ms
    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

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
      if (filters.budgetMin) params.append('budget_min', filters.budgetMin);
      if (filters.budgetMax) params.append('budget_max', filters.budgetMax);
      // Year workspace → fecha_desde/fecha_hasta (only if no explicit date filter)
      if (filters.fechaDesde) {
        params.append('fecha_desde', filters.fechaDesde);
      } else if (filters.yearWorkspace && filters.yearWorkspace !== 'all') {
        params.append('fecha_desde', `${filters.yearWorkspace}-01-01`);
      }
      if (filters.fechaHasta) {
        params.append('fecha_hasta', filters.fechaHasta);
      } else if (filters.yearWorkspace && filters.yearWorkspace !== 'all') {
        params.append('fecha_hasta', `${filters.yearWorkspace}-12-31`);
      }
      if (fechaCampo) params.append('fecha_campo', fechaCampo);
      if (filters.nuevasDesde) params.append('nuevas_desde', filters.nuevasDesde);

      fetch(`${apiUrl}/api/licitaciones/facets?${params}`, { signal: controller.signal, credentials: 'include' })
        .then(r => r.ok ? r.json() : EMPTY_FACETS)
        .then(data => {
          if (!controller.signal.aborted) setFacets(data);
        })
        .catch(() => {});
    }, 300);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [apiUrl, filters, fechaCampo]);

  return facets;
}
