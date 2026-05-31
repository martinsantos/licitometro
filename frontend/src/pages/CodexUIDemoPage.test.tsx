import { render, screen } from '@testing-library/react';
import type React from 'react';
import CodexUIDemoPage from './CodexUIDemoPage';

jest.mock('../components/LicitacionesList', () => ({
  __esModule: true,
  default: () => <div data-testid="licitaciones-list" />,
}));

jest.mock('react-router-dom', () => ({
  Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...props}>{children}</a>
  ),
}), { virtual: true });

describe('CodexUIDemoPage', () => {
  it('renders the approved Codex operating console direction with semantic status colors', () => {
    render(<CodexUIDemoPage />);

    expect(screen.getByRole('heading', { name: /consola operativa codex/i })).toBeInTheDocument();
    expect(screen.getByText(/tokens codex/i)).toBeInTheDocument();
    expect(screen.getByText(/azul: accion y foco/i)).toBeInTheDocument();
    expect(screen.getByText(/verde: fuente sana/i)).toBeInTheDocument();
    expect(screen.getByText(/ambar: riesgo operativo/i)).toBeInTheDocument();
    expect(screen.getByText(/rojo: fuente critica/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /buscar licitaciones/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /core 3/i })).toBeInTheDocument();
  });
});
