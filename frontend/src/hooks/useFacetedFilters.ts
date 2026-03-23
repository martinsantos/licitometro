import { useState, useEffect, useRef } from 'react';
import type { FilterState } from '../types/licitacion';
import { buildFilterParams } from '../utils/filterParams';

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
  estado: FacetValue[];
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
  estado: [],
};

export function useFacetedFilters(apiUrl: string, filters: FilterState, fechaCampo: string, apiPath: string = '/api/licitaciones'): FacetData {
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

      const params = buildFilterParams(filters, fechaCampo);

      fetch(`${apiUrl}${apiPath}/facets?${params}`, { signal: controller.signal, credentials: 'include' })
        .then(r => r.ok ? r.json() : EMPTY_FACETS)
        .then(data => {
          if (!controller.signal.aborted) setFacets(data);
        })
        .catch(() => {});
    }, 300);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [apiUrl, apiPath, filters, fechaCampo]);

  return facets;
}
