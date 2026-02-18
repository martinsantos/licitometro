import { useState, useEffect, useRef, useCallback } from 'react';
import type { Licitacion, Paginacion, FilterState, SortField, SortOrder, AutoFilter } from '../types/licitacion';

const MAX_RETRIES = 3;
const RETRY_DELAYS = [2000, 4000, 8000]; // exponential backoff: 2s, 4s, 8s
const FETCH_TIMEOUT = 30000; // 30 seconds

interface UseLicitacionDataArgs {
  apiUrl: string;
  apiPath?: string; // defaults to '/api/licitaciones'
  filters: FilterState;
  sortBy: SortField;
  sortOrder: SortOrder;
  pagina: number;
  pageSize?: number;
  fechaCampo: string;
}

interface UseLicitacionDataResult {
  licitaciones: Licitacion[];
  paginacion: Paginacion | null;
  isInitialLoading: boolean;
  isFetching: boolean;
  error: string | null;
  autoFilters: AutoFilter[];
  retry: () => void;
}

function buildParams(
  pagina: number, pageSize: number, sortBy: string, sortOrder: string,
  filters: FilterState, fechaCampo: string,
): URLSearchParams {
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
  if (filters.organizacionFiltro) params.append('organization', filters.organizacionFiltro);
  if (filters.nodoFiltro) params.append('nodo', filters.nodoFiltro);
  if (filters.estadoFiltro) params.append('estado', filters.estadoFiltro);
  if (filters.budgetMin) params.append('budget_min', filters.budgetMin);
  if (filters.budgetMax) params.append('budget_max', filters.budgetMax);
  // Year workspace → use 'year' param (always filters publication_date)
  if (filters.yearWorkspace && filters.yearWorkspace !== 'all') {
    params.append('year', filters.yearWorkspace);
  }
  // Explicit date range filters → use fecha_desde/fecha_hasta with fecha_campo
  if (filters.fechaDesde) params.append('fecha_desde', filters.fechaDesde);
  if (filters.fechaHasta) params.append('fecha_hasta', filters.fechaHasta);
  if (filters.nuevasDesde) params.append('nuevas_desde', filters.nuevasDesde);
  // CRITICAL: When nuevasDesde is active (synchronized "Nuevas de hoy" filter),
  // fechaDesde/fechaHasta must filter on fecha_scraping regardless of sort mode.
  // publication_date rarely matches "today" — items are discovered today but published on other dates.
  const effectiveFechaCampo = filters.nuevasDesde ? 'fecha_scraping' : fechaCampo;
  if (effectiveFechaCampo) params.append('fecha_campo', effectiveFechaCampo);

  // Jurisdiction mode filtering
  if (filters.jurisdiccionMode === 'nacional') {
    params.append('only_national', 'true');
  } else if (filters.jurisdiccionMode === 'mendoza') {
    // Exclude comprar.gob.ar sources (show only Mendoza)
    params.append('fuente_exclude', 'Comprar.Gob.Ar');
  }
  // If 'all', no additional filtering

  return params;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function useLicitacionData({
  apiUrl, apiPath = '/api/licitaciones', filters, sortBy, sortOrder, pagina, pageSize = 15, fechaCampo,
}: UseLicitacionDataArgs): UseLicitacionDataResult {
  const [licitaciones, setLicitaciones] = useState<Licitacion[]>([]);
  const [paginacion, setPaginacion] = useState<Paginacion | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoFilters, setAutoFilters] = useState<AutoFilter[]>([]);
  const hasFetchedOnce = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const fetchData = useCallback(async () => {
    // Cancel previous in-flight request
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    setIsFetching(true);
    setError(null);

    const params = buildParams(pagina, pageSize, sortBy, sortOrder, filters, fechaCampo);
    const url = `${apiUrl}${apiPath}/?${params.toString()}`;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (controller.signal.aborted) return;

      // Wait before retry (skip delay on first attempt)
      if (attempt > 0) {
        await sleep(RETRY_DELAYS[attempt - 1] || 8000);
        if (controller.signal.aborted) return;
      }

      try {
        // Add timeout via AbortSignal.timeout when available, fallback to manual
        const timeoutId = setTimeout(() => {
          if (!controller.signal.aborted) controller.abort();
        }, FETCH_TIMEOUT);

        const response = await fetch(url, {
          signal: controller.signal,
          credentials: 'include',
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(
            response.status === 500
              ? 'Error interno del servidor'
              : response.status === 503
              ? 'Servicio temporalmente no disponible'
              : `Error del servidor (${response.status})`
          );
        }

        const data = await response.json();
        setLicitaciones(data.items || []);
        setPaginacion(data.paginacion);
        hasFetchedOnce.current = true;

        // Parse auto_filters from smart search
        if (data.auto_filters && typeof data.auto_filters === 'object') {
          const af: AutoFilter[] = Object.entries(data.auto_filters).map(([key, label]) => ({
            key,
            label: String(label),
          }));
          setAutoFilters(af);
        } else {
          setAutoFilters([]);
        }

        // Success - clear error and return
        setError(null);
        if (!controller.signal.aborted) {
          setIsFetching(false);
        }
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        lastError = err instanceof Error ? err : new Error('Error desconocido');
        // Continue to next retry attempt
      }
    }

    // All retries exhausted
    if (!controller.signal.aborted) {
      const isNetworkError = lastError?.message === 'Failed to fetch' ||
        lastError?.message?.includes('NetworkError') ||
        lastError?.message?.includes('network');

      setError(
        isNetworkError
          ? 'No se pudo conectar al servidor. Verificar que el servicio esté activo.'
          : lastError?.message || 'Error desconocido'
      );
      setIsFetching(false);
    }
  }, [apiUrl, apiPath, pagina, pageSize, sortBy, sortOrder, filters, fechaCampo, retryCount]);

  useEffect(() => {
    fetchData();
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [fetchData]);

  const retry = useCallback(() => {
    setRetryCount(c => c + 1);
  }, []);

  const isInitialLoading = !hasFetchedOnce.current && isFetching;

  return { licitaciones, paginacion, isInitialLoading, isFetching, error, autoFilters, retry };
}
