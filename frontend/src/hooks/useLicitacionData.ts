import { useState, useEffect, useRef, useCallback } from 'react';
import type { Licitacion, Paginacion, FilterState, SortField, SortOrder } from '../types/licitacion';

interface UseLicitacionDataArgs {
  apiUrl: string;
  filters: FilterState;
  sortBy: SortField;
  sortOrder: SortOrder;
  pagina: number;
  pageSize?: number;
}

interface UseLicitacionDataResult {
  licitaciones: Licitacion[];
  paginacion: Paginacion | null;
  isInitialLoading: boolean;
  isFetching: boolean;
  error: string | null;
}

export function useLicitacionData({
  apiUrl, filters, sortBy, sortOrder, pagina, pageSize = 15,
}: UseLicitacionDataArgs): UseLicitacionDataResult {
  const [licitaciones, setLicitaciones] = useState<Licitacion[]>([]);
  const [paginacion, setPaginacion] = useState<Paginacion | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasFetchedOnce = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
    // Cancel previous in-flight request
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    setIsFetching(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        page: pagina.toString(),
        size: pageSize.toString(),
        sort_by: sortBy,
        sort_order: sortOrder,
      });

      if (filters.busqueda) params.append('q', filters.busqueda);
      if (filters.fuenteFiltro) params.append('fuente', filters.fuenteFiltro);
      if (filters.statusFiltro) params.append('status', filters.statusFiltro);
      if (filters.categoryFiltro) params.append('category', filters.categoryFiltro);
      if (filters.workflowFiltro) params.append('workflow_state', filters.workflowFiltro);
      if (filters.jurisdiccionFiltro) params.append('jurisdiccion', filters.jurisdiccionFiltro);
      if (filters.tipoProcedimientoFiltro) params.append('tipo_procedimiento', filters.tipoProcedimientoFiltro);
      if (filters.budgetMin) params.append('budget_min', filters.budgetMin);
      if (filters.budgetMax) params.append('budget_max', filters.budgetMax);
      if (filters.fechaDesde) params.append('fecha_desde', filters.fechaDesde);
      if (filters.fechaHasta) params.append('fecha_hasta', filters.fechaHasta);
      if (filters.fechaCampo) params.append('fecha_campo', filters.fechaCampo);

      const response = await fetch(`${apiUrl}/api/licitaciones/?${params.toString()}`, {
        signal: controller.signal,
      });

      if (!response.ok) throw new Error('Error al cargar licitaciones');
      const data = await response.json();
      setLicitaciones(data.items || []);
      setPaginacion(data.paginacion);
      hasFetchedOnce.current = true;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      if (!controller.signal.aborted) {
        setIsFetching(false);
      }
    }
  }, [apiUrl, pagina, pageSize, sortBy, sortOrder, filters]);

  useEffect(() => {
    fetchData();
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [fetchData]);

  const isInitialLoading = !hasFetchedOnce.current && isFetching;

  return { licitaciones, paginacion, isInitialLoading, isFetching, error };
}
