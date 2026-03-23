import { useState, useEffect, useRef, useCallback } from 'react';
import type { Licitacion, Paginacion, FilterState, SortField, SortOrder, AutoFilter } from '../types/licitacion';
import { buildFilterParams } from '../utils/filterParams';

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

    const params = buildFilterParams(filters, fechaCampo);
    params.append('page', pagina.toString());
    params.append('size', pageSize.toString());
    params.append('sort_by', sortBy);
    params.append('sort_order', sortOrder);
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
