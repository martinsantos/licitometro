import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';

import { Modal } from './uiPrimitives';

describe('Modal', () => {
  afterEach(() => {
    document.body.style.overflow = '';
  });

  it('renders an accessible dialog, locks scroll and closes on Escape', () => {
    document.body.style.overflow = 'clip';
    const onClose = jest.fn();
    const { rerender } = render(
      <Modal open title="Editar agenda" description="Configurar Radar" onClose={onClose}>
        <p>Contenido del modal</p>
      </Modal>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Editar agenda' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription('Configurar Radar');
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(
      <Modal open={false} title="Editar agenda" description="Configurar Radar" onClose={onClose}>
        <p>Contenido del modal</p>
      </Modal>,
    );
    expect(document.body.style.overflow).toBe('clip');
  });

  it('keeps page scroll locked while another modal is still open', () => {
    document.body.style.overflow = 'auto';
    const onClose = jest.fn();
    const renderModals = (firstOpen: boolean, secondOpen: boolean) => (
      <>
        <Modal open={firstOpen} title="Primer modal" onClose={onClose}>
          <p>Uno</p>
        </Modal>
        <Modal open={secondOpen} title="Segundo modal" onClose={onClose}>
          <p>Dos</p>
        </Modal>
      </>
    );

    const { rerender } = render(renderModals(true, true));
    expect(document.body.style.overflow).toBe('hidden');

    rerender(renderModals(false, true));
    expect(document.body.style.overflow).toBe('hidden');

    rerender(renderModals(false, false));
    expect(document.body.style.overflow).toBe('auto');
  });

  it('moves focus into the modal and restores it after closing', () => {
    function ModalHarness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Abrir editor</button>
          <Modal open={open} title="Editor puntual" onClose={() => setOpen(false)}>
            <input aria-label="Campo editable" />
          </Modal>
        </>
      );
    }

    render(<ModalHarness />);
    const trigger = screen.getByRole('button', { name: 'Abrir editor' });
    trigger.focus();
    fireEvent.click(trigger);

    expect(screen.getByRole('button', { name: 'Cerrar' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(trigger).toHaveFocus();
  });

  it('keeps keyboard tab focus inside the modal', () => {
    render(
      <Modal open title="Editor puntual" onClose={jest.fn()}>
        <input aria-label="Campo editable" />
        <button type="button">Guardar</button>
      </Modal>,
    );

    const closeButton = screen.getByRole('button', { name: 'Cerrar' });
    const saveButton = screen.getByRole('button', { name: 'Guardar' });

    expect(closeButton).toHaveFocus();
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(saveButton).toHaveFocus();

    fireEvent.keyDown(window, { key: 'Tab' });
    expect(closeButton).toHaveFocus();
  });
});
