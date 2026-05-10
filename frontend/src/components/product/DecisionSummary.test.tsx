import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DecisionSummary, EmptyResultsState } from './DecisionSummary';

describe('DecisionSummary', () => {
  it('shows counts and exposes clear action', async () => {
    const clear = jest.fn();
    render(
      <DecisionSummary
        totalItems={42}
        activeFilterCount={3}
        hasActiveFilters
        todayActive
        onClearFilters={clear}
      />
    );

    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Nuevas de hoy')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /limpiar filtros/i }));
    expect(clear).toHaveBeenCalledTimes(1);
  });
});

describe('EmptyResultsState', () => {
  it('explains filter-driven empty results', () => {
    render(<EmptyResultsState hasActiveFilters onClearFilters={jest.fn()} />);
    expect(screen.getByText(/los filtros actuales/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /limpiar filtros/i })).toBeInTheDocument();
  });
});
