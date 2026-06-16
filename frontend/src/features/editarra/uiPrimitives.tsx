import React from 'react';

export type EditarraTone = 'emerald' | 'blue' | 'amber' | 'rose' | 'slate' | 'violet';
export type EditarraButtonVariant = 'primary' | 'secondary' | 'danger';

export const cx = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' ');

export const badgeToneClasses: Record<EditarraTone, string> = {
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  blue: 'bg-blue-50 text-blue-700 ring-blue-700/20',
  amber: 'bg-amber-50 text-amber-800 ring-amber-600/25',
  rose: 'bg-rose-50 text-rose-700 ring-rose-700/20',
  slate: 'bg-slate-100 text-slate-700 ring-slate-600/20',
  violet: 'bg-violet-50 text-violet-700 ring-violet-700/20',
};

export function Badge({ tone = 'slate', children }: { tone?: EditarraTone; children: React.ReactNode }) {
  return (
    <span className={cx('inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset', badgeToneClasses[tone])}>
      {children}
    </span>
  );
}

export const Button = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: EditarraButtonVariant }>(function Button({
  variant = 'secondary',
  className = '',
  children,
  ...props
}, ref) {
  const variantClasses: Record<EditarraButtonVariant, string> = {
    primary: 'bg-slate-950 text-white shadow-sm hover:bg-slate-800 focus-visible:outline-slate-950',
    secondary: 'bg-white text-slate-900 ring-1 ring-inset ring-slate-200 hover:bg-slate-50 focus-visible:outline-slate-600',
    danger: 'bg-white text-rose-700 ring-1 ring-inset ring-rose-200 hover:bg-rose-50 focus-visible:outline-rose-600',
  };

  return (
    <button
      ref={ref}
      type="button"
      className={cx(
        'inline-flex min-h-9 items-center justify-center rounded-lg px-3 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50',
        variantClasses[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
});

export function Panel({ children, className = '', ...props }: React.HTMLAttributes<HTMLElement> & { children: React.ReactNode }) {
  return (
    <section className={cx('min-w-0 rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/80', className)} {...props}>
      {children}
    </section>
  );
}

export function SectionHead({ label, title, body }: { label: string; title: string; body: string }) {
  return (
    <div className="border-b border-slate-200 px-5 py-4">
      <p className="text-xs font-semibold uppercase tracking-normal text-emerald-700">{label}</p>
      <h2 className="mt-1 text-base font-semibold text-slate-950">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-slate-500">{body}</p>
    </div>
  );
}

let activeModalScrollLocks = 0;
let bodyOverflowBeforeModalLock = '';

const lockBodyScroll = () => {
  if (activeModalScrollLocks === 0) {
    bodyOverflowBeforeModalLock = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  activeModalScrollLocks += 1;
};

const unlockBodyScroll = () => {
  activeModalScrollLocks = Math.max(0, activeModalScrollLocks - 1);
  if (activeModalScrollLocks === 0) {
    document.body.style.overflow = bodyOverflowBeforeModalLock;
    bodyOverflowBeforeModalLock = '';
  }
};

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const getFocusableElements = (container: HTMLElement) => (
  Array.from(container.querySelectorAll<HTMLElement>(focusableSelector))
    .filter((element) => element.getAttribute('aria-hidden') !== 'true')
);

export function Modal({
  open,
  title,
  description,
  onClose,
  className = '',
  children,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  const titleId = React.useId();
  const descriptionId = React.useId();
  const dialogRef = React.useRef<HTMLDivElement | null>(null);
  const closeButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const returnFocusRef = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    if (!open) {
      return undefined;
    }

    lockBodyScroll();
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }

      if (event.key !== 'Tab' || !dialogRef.current) {
        return;
      }

      const focusableElements = getFocusableElements(dialogRef.current);
      if (focusableElements.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;

      if (event.shiftKey && (!activeElement || activeElement === firstElement || !dialogRef.current.contains(activeElement))) {
        event.preventDefault();
        lastElement.focus();
        return;
      }

      if (!event.shiftKey && activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      unlockBodyScroll();
      window.removeEventListener('keydown', onKeyDown);
      if (returnFocusRef.current?.isConnected) {
        returnFocusRef.current.focus();
      }
    };
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/45 backdrop-blur-sm px-4 py-6 sm:px-6 sm:py-10"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      tabIndex={-1}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <section className={cx('relative z-10 max-h-[calc(100vh-3rem)] w-full max-w-4xl overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-slate-200', className)}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-normal text-emerald-700">Edicion</p>
            <h2 id={titleId} className="mt-1 text-lg font-semibold text-slate-950">{title}</h2>
            {description && <p id={descriptionId} className="mt-1 text-sm leading-6 text-slate-500">{description}</p>}
          </div>
          <Button ref={closeButtonRef} onClick={onClose}>Cerrar</Button>
        </div>
        <div className="max-h-[calc(100vh-10rem)] overflow-y-auto">
          {children}
        </div>
      </section>
    </div>
  );
}
