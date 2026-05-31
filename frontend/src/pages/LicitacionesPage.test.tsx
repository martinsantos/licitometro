import { render, screen } from '@testing-library/react';
import LicitacionesPage from './LicitacionesPage';

jest.mock('../components/LicitacionesList', () => ({
  __esModule: true,
  default: () => <div data-testid="licitaciones-list">Listado real</div>,
}));

jest.mock('../components/LicitacionForm', () => ({
  __esModule: true,
  default: () => <form data-testid="licitacion-form" />,
}));

describe('LicitacionesPage', () => {
  it('frames the real tender list as the central Codex work surface', () => {
    const { container } = render(<LicitacionesPage apiUrl="http://localhost:8001" />);

    expect(screen.getByRole('heading', { name: /^Licitaciones$/i })).toBeInTheDocument();
    expect(screen.getByTestId('licitaciones-list')).toBeInTheDocument();
    expect(container.querySelector('.licitometro-codex-list-surface')).toBeInTheDocument();
  });
});
