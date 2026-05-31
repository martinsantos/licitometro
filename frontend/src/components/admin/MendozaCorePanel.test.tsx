import { render, screen, waitFor } from '@testing-library/react';
import MendozaCorePanel from './MendozaCorePanel';
import { api } from '../../services/api';

jest.mock('../../services/api', () => ({
  api: {
    get: jest.fn(),
  },
}));

const mockedApi = api as jest.Mocked<typeof api>;

describe('MendozaCorePanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders core source status and repair queue', async () => {
    mockedApi.get.mockResolvedValueOnce({
      generated_at: '2026-05-16T21:00:00',
      totals: {
        sources: 3,
        up_perfect: 1,
        up_degraded: 1,
        at_risk: 0,
        down: 1,
        records_total: 5537,
        vigentes_total: 492,
        new_7d_total: 302,
      },
      sources: [
        {
          name: 'COMPR.AR Mendoza',
          status: 'up_perfect',
          expected_min_items: 50,
          last_run: { status: 'success', items_found: 62, started_at: '2026-05-16T21:00:00' },
          records: { total: 955, vigentes: 62, new_7d: 143 },
          coverage: { documents: 0.903, direct_url: 0.903, opening_date: 0.998 },
          blocking_issues: [],
          quality_issues: [],
          backlog_issues: [],
        },
        {
          name: 'ComprasApps Mendoza',
          status: 'down',
          expected_min_items: 900,
          last_run: { status: 'failed', items_found: 0, started_at: '2026-05-16T20:00:00' },
          records: { total: 3766, vigentes: 91, new_7d: 123 },
          coverage: { documents: 0.055, direct_url: 0.32, opening_date: 0.999 },
          blocking_issues: ['last_run_failed'],
          quality_issues: [],
          backlog_issues: ['historical_evidence_backfill_needed'],
        },
      ],
      repair_queue: [
        {
          source_name: 'ComprasApps Mendoza',
          status: 'down',
          priority: 1,
          issues: ['last_run_failed'],
          recommended_action: 'Revisar scraper y relanzar corrida controlada.',
        },
      ],
    });

    render(<MendozaCorePanel />);

    await waitFor(() => {
      expect(mockedApi.get).toHaveBeenCalledWith('/api/mendoza-core/summary');
    });
    expect(await screen.findByText('Mendoza Core 3')).toBeInTheDocument();
    expect(screen.getByText('COMPR.AR Mendoza')).toBeInTheDocument();
    expect(screen.getAllByText('ComprasApps Mendoza').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Revisar scraper y relanzar corrida controlada.')).toBeInTheDocument();
  });
});
