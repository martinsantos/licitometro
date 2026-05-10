import { render, screen } from '@testing-library/react';
import DecisionReadinessPanel, { buildReadinessItems } from './DecisionReadinessPanel';

describe('DecisionReadinessPanel', () => {
  it('computes readiness from existing tender data', () => {
    const items = buildReadinessItems({
      objeto: 'Servicio de fibra',
      canonical_url: 'https://example.com/pliego.pdf',
      enrichment_level: 2,
      budget: 1000,
      workflow_state: 'evaluando',
    });

    expect(items.every(item => item.done)).toBe(true);
  });

  it('renders next missing action', () => {
    render(
      <DecisionReadinessPanel
        licitacion={{ title: 'Compra', enrichment_level: 1, estado: 'vigente' }}
      />
    );

    expect(screen.getByText('Qué falta para cotizar')).toBeInTheDocument();
    expect(screen.getByText(/próxima acción recomendada/i)).toBeInTheDocument();
    expect(screen.getAllByText(/pendiente/i).length).toBeGreaterThan(0);
  });
});
