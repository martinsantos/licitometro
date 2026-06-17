import React from 'react';

type CockpitTone = 'emerald' | 'blue' | 'amber' | 'rose' | 'slate' | 'violet';

export type OpsCockpitLane = {
  id: string;
  eyebrow: string;
  title: string;
  status: string;
  tone: CockpitTone;
  metric: string;
  detail: string;
  actionLabel: string;
  onAction: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  disabled?: boolean;
};

type OpsCockpitProps = {
  topicTitle: string;
  packageId: string;
  lanes: OpsCockpitLane[];
};

const cx = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' ');

const badgeToneClasses: Record<CockpitTone, string> = {
  emerald: 'bg-emerald-400 text-slate-950',
  blue: 'bg-blue-400 text-slate-950',
  amber: 'bg-amber-300 text-slate-950',
  rose: 'bg-rose-400 text-white',
  slate: 'bg-white/10 text-slate-200 ring-1 ring-inset ring-white/10',
  violet: 'bg-violet-400 text-white',
};

function Badge({ tone, children }: { tone: CockpitTone; children: React.ReactNode }) {
  return (
    <span className={cx('inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold', badgeToneClasses[tone])}>
      {children}
    </span>
  );
}

function ActionButton({
  variant = 'primary',
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' }) {
  return (
    <button
      type="button"
      className={cx(
        'inline-flex min-h-9 items-center justify-center rounded-lg px-3 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'primary'
          ? 'bg-emerald-400 text-slate-950 hover:bg-emerald-300'
          : 'bg-white/10 text-white ring-1 ring-inset ring-white/15 hover:bg-white/15',
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export default function OpsCockpit({ topicTitle, packageId, lanes }: OpsCockpitProps) {
  return (
    <section className="mt-4 overflow-hidden rounded-2xl bg-slate-950 text-white shadow-sm ring-1 ring-slate-900" aria-label="Cockpit operativo">
      <div className="grid gap-3 border-b border-white/10 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-normal text-emerald-300">Mesa operativa</p>
          <h2 className="mt-1 truncate text-lg font-semibold">{topicTitle}</h2>
          <p className="mt-1 break-all text-xs leading-5 text-slate-400">{packageId}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {lanes.map((lane) => (
            <Badge key={lane.id} tone={lane.tone}>{lane.status}</Badge>
          ))}
        </div>
      </div>

      <div className="grid divide-y divide-white/10 lg:grid-cols-4 lg:divide-x lg:divide-y-0">
        {lanes.map((lane) => (
          <article key={lane.id} className="grid min-w-0 gap-3 p-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-normal text-slate-400">{lane.eyebrow}</p>
                <Badge tone={lane.tone}>{lane.metric}</Badge>
              </div>
              <h3 className="mt-2 text-sm font-semibold text-white">{lane.title}</h3>
              <p className="mt-1 text-sm leading-6 text-slate-300">{lane.detail}</p>
            </div>
            <div className="mt-auto flex flex-wrap gap-2">
              <ActionButton onClick={lane.onAction} disabled={lane.disabled}>{lane.actionLabel}</ActionButton>
              {lane.secondaryLabel && lane.onSecondary && (
                <ActionButton variant="secondary" onClick={lane.onSecondary}>{lane.secondaryLabel}</ActionButton>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
