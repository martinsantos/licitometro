import React from 'react';
import type { OperationalWorkspaceSnapshot } from './workspaceModel';

export type RunCockpitTone = OperationalWorkspaceSnapshot['readiness']['tone'];
export type RunCockpitButtonVariant = 'primary' | 'secondary' | 'quiet';

export const cx = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' ');

export const badgeToneClasses: Record<RunCockpitTone, string> = {
  emerald: 'bg-emerald-400 text-slate-950',
  blue: 'bg-blue-400 text-slate-950',
  amber: 'bg-amber-300 text-slate-950',
  rose: 'bg-rose-400 text-white',
  slate: 'bg-white/10 text-slate-200 ring-1 ring-inset ring-white/10',
  violet: 'bg-violet-400 text-white',
};

export const controlClass = 'w-full rounded-lg border-0 bg-white/10 px-3 py-2 text-sm text-white ring-1 ring-inset ring-white/10 placeholder:text-slate-500 focus:bg-white/15 focus:ring-2 focus:ring-emerald-300';
export const inputClass = `h-10 ${controlClass}`;

export const boundedInteger = (value: string, fallback: number, min: number, max: number) => {
  const numericValue = Number(value);

  return Number.isFinite(numericValue) ? Math.min(max, Math.max(min, Math.round(numericValue))) : fallback;
};

export function Badge({ tone = 'slate', children }: { tone?: RunCockpitTone; children: React.ReactNode }) {
  return (
    <span className={cx('inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold', badgeToneClasses[tone])}>
      {children}
    </span>
  );
}

export function ActionButton({
  variant = 'secondary',
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: RunCockpitButtonVariant }) {
  return (
    <button
      type="button"
      className={cx(
        'inline-flex min-h-10 items-center justify-center rounded-lg px-3 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'primary'
          ? 'bg-emerald-400 text-slate-950 hover:bg-emerald-300'
          : variant === 'quiet'
            ? 'bg-transparent text-slate-200 ring-1 ring-inset ring-white/10 hover:bg-white/10'
            : 'bg-white text-slate-950 hover:bg-slate-100',
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function CompactMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
      <p className="text-xs font-semibold uppercase tracking-normal text-slate-400">{label}</p>
      <strong className="mt-2 block truncate text-lg font-semibold text-white">{value}</strong>
      <p className="mt-1 text-xs leading-5 text-slate-400">{detail}</p>
    </div>
  );
}

export function Field({
  label,
  children,
  className = '',
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cx('grid gap-1 text-xs font-semibold uppercase tracking-normal text-slate-400', className)}>
      {label}
      {children}
    </label>
  );
}
