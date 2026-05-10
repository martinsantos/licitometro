import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminCockpit from './AdminCockpit';

describe('AdminCockpit', () => {
  it('routes operators to a selected operational tab', async () => {
    const select = jest.fn();
    render(<AdminCockpit activeTab="monitor" onSelectTab={select} />);

    await userEvent.click(screen.getByRole('button', { name: /fuentes/i }));
    expect(select).toHaveBeenCalledWith('fuentes');
  });
});
