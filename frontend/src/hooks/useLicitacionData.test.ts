import { act, renderHook, waitFor } from '@testing-library/react';
import { useLicitacionData } from './useLicitacionData';
import type { FilterState } from '../types/licitacion';

const filters: FilterState = {
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
  yearWorkspace: 'all',
  fechaCampo: 'publication_date',
  jurisdiccionMode: 'all',
};

const args = {
  apiUrl: '',
  filters,
  sortBy: 'publication_date' as const,
  sortOrder: 'desc' as const,
  pagina: 1,
  pageSize: 25,
};

function okResponse(body: unknown) {
  return {
    ok: true,
    json: async () => body,
  } as Response;
}

function errorResponse(status: number) {
  return {
    ok: false,
    status,
    json: async () => ({}),
  } as Response;
}

describe('useLicitacionData', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('loads licitaciones and pagination', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(okResponse({
      items: [{ id: 'lic-1', title: 'Compra', organization: 'Org', publication_date: '', opening_date: '' }],
      paginacion: { pagina: 1, total_paginas: 1, total_items: 1, por_pagina: 25 },
      auto_filters: { category: 'Tecnologia' },
    }));

    const { result } = renderHook(() => useLicitacionData(args));

    await waitFor(() => expect(result.current.licitaciones).toHaveLength(1));
    expect(result.current.paginacion?.total_items).toBe(1);
    expect(result.current.autoFilters).toEqual([{ key: 'category', label: 'Tecnologia' }]);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/licitaciones/?');
    expect(String(fetchMock.mock.calls[0][0])).toContain('size=25');
  });

  it('reloads data on manual retry', async () => {
    jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(okResponse({ items: [], paginacion: { pagina: 1, total_paginas: 0, total_items: 0, por_pagina: 25 } }))
      .mockResolvedValueOnce(okResponse({
        items: [{ id: 'lic-2', title: 'Servicio', organization: 'Org', publication_date: '', opening_date: '' }],
        paginacion: { pagina: 1, total_paginas: 1, total_items: 1, por_pagina: 25 },
      }));

    const { result } = renderHook(() => useLicitacionData(args));

    await waitFor(() => expect(result.current.isFetching).toBe(false));
    expect(result.current.licitaciones).toHaveLength(0);

    act(() => result.current.retry());

    await waitFor(() => expect(result.current.licitaciones).toHaveLength(1));
    expect(result.current.licitaciones[0].id).toBe('lic-2');
  });

  it('aborts in-flight request on unmount', async () => {
    jest.spyOn(global, 'fetch').mockImplementation((_url, init) => {
      expect((init as RequestInit).signal).toBeDefined();
      return new Promise<Response>(() => undefined);
    });

    const { unmount } = renderHook(() => useLicitacionData(args));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

    const signal = (jest.mocked(global.fetch).mock.calls[0][1] as RequestInit).signal as AbortSignal;
    expect(signal.aborted).toBe(false);
    unmount();
    expect(signal.aborted).toBe(true);
  });

  it('surfaces server errors after retries are exhausted', async () => {
    jest.useFakeTimers();
    jest.spyOn(global, 'fetch').mockResolvedValue(errorResponse(500));

    const { result } = renderHook(() => useLicitacionData(args));

    await act(async () => {
      await Promise.resolve();
    });

    for (const delay of [2000, 4000, 8000]) {
      await act(async () => {
        jest.advanceTimersByTime(delay);
        await Promise.resolve();
      });
    }
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.error).toBe('Error interno del servidor');
    expect(global.fetch).toHaveBeenCalledTimes(4);
    jest.useRealTimers();
  });
});
