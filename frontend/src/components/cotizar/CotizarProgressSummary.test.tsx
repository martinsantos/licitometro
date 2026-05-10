import { render, screen } from '@testing-library/react';
import CotizarProgressSummary, { getCotizarNextAction } from './CotizarProgressSummary';

describe('CotizarProgressSummary', () => {
  it('recommends extracting items first', () => {
    expect(getCotizarNextAction({ title: 'Compra', items: [] })).toMatch(/items/i);
  });

  it('renders decision metrics', () => {
    render(
      <CotizarProgressSummary
        licitacion={{
          title: 'Compra de notebooks',
          organization: 'Ministerio',
          opening_date: '2026-12-31',
          budget: 500000,
          items: [{ name: 'Notebook' }],
          workflow_state: 'evaluando',
        }}
      />
    );

    expect(screen.getByText('Resumen para cotizar')).toBeInTheDocument();
    expect(screen.getByText('Compra de notebooks')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });
});
