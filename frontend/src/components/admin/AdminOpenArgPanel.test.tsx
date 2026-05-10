import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminOpenArgPanel from './AdminOpenArgPanel';
import { api } from '../../services/api';

jest.mock('../../services/api', () => ({
  api: {
    post: jest.fn(),
    get: jest.fn(),
  },
}));

const mockedApi = api as jest.Mocked<typeof api>;

describe('AdminOpenArgPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('runs the admin query copilot endpoint', async () => {
    mockedApi.post.mockResolvedValueOnce({
      answer: 'Hay 3 licitaciones.',
      items: [],
      aggregate: [{ metric: 'count', value: 3 }],
      applied_filters: {},
      pipeline: [],
      confidence: 0.85,
      warnings: [],
    });

    render(<AdminOpenArgPanel />);

    await userEvent.click(screen.getByRole('button', { name: /consultar/i }));

    await waitFor(() => {
      expect(mockedApi.post).toHaveBeenCalledWith('/api/admin/query-copilot', {
        question: 'Licitaciones vigentes de Mendoza por fuente',
        limit: 100,
      });
    });
    expect(await screen.findByText('Hay 3 licitaciones.')).toBeInTheDocument();
  });

  it('searches the Datos.gob.ar catalog', async () => {
    mockedApi.get.mockResolvedValueOnce({
      query: 'Contrataciones',
      total: 1,
      items: [{
        id: 'jgm-sistema-contrataciones-electronicas',
        title: 'Sistema de Contrataciones Electronicas',
        organization: 'Jefatura de Gabinete',
        resources: [{ id: 'r1', format: 'csv', datastore_active: true }],
        resource_count: 1,
        datastore_resources: 1,
      }],
    });

    render(<AdminOpenArgPanel />);

    await userEvent.click(screen.getByRole('button', { name: /buscar/i }));

    await waitFor(() => {
      expect(mockedApi.get).toHaveBeenCalledWith(
        '/api/admin/open-data/catalog',
        expect.any(URLSearchParams),
      );
    });
    expect(await screen.findByText('Sistema de Contrataciones Electronicas')).toBeInTheDocument();
  });
});
