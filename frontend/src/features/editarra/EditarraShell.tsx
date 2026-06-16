import React from 'react';

type ShellTone = 'emerald' | 'blue' | 'amber' | 'rose' | 'slate' | 'violet';

type ShellTab = {
  key: string;
  label: string;
  summary: string;
};

type ShellProfile = {
  id: string;
  name: string;
};

type ShellSite = ShellProfile & {
  domain: string;
  cadence: string;
  approval: string;
  seoMode: string;
};

type ShellMetric = {
  label: string;
  value: string;
  detail: string;
  tone: ShellTone;
};

type EditarraShellProps = {
  tabs: ShellTab[];
  activeTab: string;
  selectedSiteId: string;
  selectedSite: ShellSite;
  profiles: ShellProfile[];
  query: string;
  summaryMetrics: ShellMetric[];
  children: React.ReactNode;
  onSelectTab: (tabKey: string) => void;
  onSelectSite: (siteId: string) => void;
  onSearch: (query: string) => void;
  onExport: () => void;
};

const cx = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' ');

const shellBadgeToneClasses: Record<ShellTone, string> = {
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  blue: 'bg-blue-50 text-blue-700 ring-blue-700/20',
  amber: 'bg-amber-50 text-amber-800 ring-amber-600/25',
  rose: 'bg-rose-50 text-rose-700 ring-rose-700/20',
  slate: 'bg-slate-100 text-slate-700 ring-slate-600/20',
  violet: 'bg-violet-50 text-violet-700 ring-violet-700/20',
};

function ShellBadge({ tone = 'slate', children }: { tone?: ShellTone; children: React.ReactNode }) {
  return (
    <span className={cx('inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset', shellBadgeToneClasses[tone])}>
      {children}
    </span>
  );
}

function ShellButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className="inline-flex min-h-9 items-center justify-center rounded-lg bg-slate-950 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950 disabled:pointer-events-none disabled:opacity-50"
      {...props}
    >
      {children}
    </button>
  );
}

export default function EditarraShell({
  tabs,
  activeTab,
  selectedSiteId,
  selectedSite,
  profiles,
  query,
  summaryMetrics,
  children,
  onSelectTab,
  onSelectSite,
  onSearch,
  onExport,
}: EditarraShellProps) {
  return (
    <div className="editarra-app min-h-screen bg-slate-100 text-slate-950 antialiased">
      <style>
        {`
          .editarra-app,
          .editarra-app *,
          .editarra-app *::before,
          .editarra-app *::after {
            box-sizing: border-box;
          }

          .editarra-app {
            max-width: 100%;
          }

          .editarra-app input,
          .editarra-app select,
          .editarra-app textarea {
            min-width: 0;
            max-width: 100%;
          }

          .editarra-app pre {
            min-width: 0;
            max-width: 100%;
          }

          .editarra-app h1,
          .editarra-app h2,
          .editarra-app h3,
          .editarra-app p,
          .editarra-app dd,
          .editarra-app dt {
            overflow-wrap: break-word;
            word-break: normal;
          }

          .editarra-app button,
          .editarra-app label,
          .editarra-app small,
          .editarra-app span {
            overflow-wrap: normal;
            word-break: normal;
          }

          .editarra-app .break-all {
            overflow-wrap: anywhere;
            word-break: break-word;
          }
        `}
      </style>
      <div className="min-h-screen max-w-full xl:grid xl:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="sticky top-0 z-30 overflow-hidden border-b border-white/10 bg-slate-950 text-white xl:h-screen xl:border-b-0 xl:border-r xl:border-slate-900" aria-label="EDITARRA navegacion">
          <div className="grid gap-2 px-3 py-3 md:flex md:items-center md:gap-4 xl:flex xl:h-full xl:flex-col xl:items-stretch xl:gap-5 xl:px-4 xl:py-4">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-400 text-sm font-black text-slate-950 shadow-sm shadow-emerald-900/30 xl:h-10 xl:w-10 xl:rounded-xl">ED</span>
              <div className="min-w-0">
                <strong className="block truncate text-sm font-semibold">EDITARRA</strong>
                <span className="hidden text-xs text-slate-400 sm:block">Studio editorial</span>
              </div>
            </div>

            <nav className="flex w-full min-w-0 max-w-full flex-1 flex-wrap gap-1 pb-1 md:flex-nowrap xl:grid xl:flex-none xl:grid-cols-1 xl:flex-wrap xl:pb-0" role="tablist" aria-label="Modulos">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  id={`editarra-tab-${tab.key}`}
                  type="button"
                  role="tab"
                  aria-label={tab.label}
                  aria-controls={`editarra-panel-${tab.key}`}
                  aria-selected={activeTab === tab.key}
                  className={cx(
                    'min-w-[5.5rem] flex-1 rounded-lg px-3 py-2 text-center transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 md:min-w-0 xl:min-w-0 xl:flex-none xl:rounded-xl xl:px-3 xl:py-3 xl:text-left',
                    activeTab === tab.key
                      ? 'bg-white text-slate-950 shadow-sm'
                      : 'text-slate-300 hover:bg-white/10 hover:text-white',
                  )}
                  onClick={() => onSelectTab(tab.key)}
                >
                  <span className="block text-xs font-semibold sm:text-sm">{tab.label}</span>
                  <small className={cx('mt-0.5 hidden text-xs xl:block', activeTab === tab.key ? 'text-slate-500' : 'text-slate-500')}>{tab.summary}</small>
                </button>
              ))}
            </nav>

            <div className="mt-auto hidden rounded-2xl bg-white/5 p-4 ring-1 ring-white/10 xl:block">
              <p className="text-xs font-semibold uppercase tracking-normal text-slate-400">URL activa</p>
              <p className="mt-2 break-words text-sm font-semibold text-white">{selectedSite.domain}</p>
              <p className="mt-2 text-xs leading-5 text-slate-400">Ruta compartida con estado, UI y workflow propios.</p>
            </div>
          </div>
        </aside>

        <main className="min-w-0 max-w-full px-3 py-3 sm:px-5 xl:px-6">
          <header className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200/80">
            <div className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,0.75fr)_minmax(0,1fr)] md:items-center xl:grid-cols-[minmax(0,1fr)_minmax(30rem,0.88fr)]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <ShellBadge tone="emerald">Automatizacion editorial multi-sitio</ShellBadge>
                  <ShellBadge tone="slate">Modo portable</ShellBadge>
                  <span className="hidden text-sm font-medium text-slate-500 sm:inline">{selectedSite.domain}</span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h1 className="text-xl font-semibold tracking-normal text-slate-950 sm:text-2xl">EDITARRA</h1>
                  <span className="hidden text-xs font-semibold uppercase tracking-normal text-slate-400 sm:inline">
                    {selectedSite.cadence} · {selectedSite.approval} · {selectedSite.seoMode}
                  </span>
                </div>
              </div>

              <div className="grid min-w-0 max-w-full gap-2 sm:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)_auto]">
                <label className="sr-only" htmlFor="editarra-site">Instancia</label>
                <select
                  id="editarra-site"
                  value={selectedSiteId}
                  onChange={(event) => onSelectSite(event.target.value)}
                  className="h-10 rounded-lg border-0 bg-slate-50 px-3 text-sm font-semibold text-slate-950 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-emerald-500"
                >
                  {profiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>{profile.name}</option>
                  ))}
                </select>
                <label className="sr-only" htmlFor="editarra-search">Buscar tema</label>
                <input
                  id="editarra-search"
                  type="search"
                  value={query}
                  onChange={(event) => onSearch(event.target.value)}
                  placeholder="Buscar agenda, fuente o SEO"
                  className="h-10 rounded-lg border-0 bg-slate-50 px-3 text-sm text-slate-950 ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-emerald-500"
                />
                <ShellButton onClick={onExport}>Exportar</ShellButton>
              </div>
            </div>

            <dl className="hidden">
              {[
                ['Cadencia', selectedSite.cadence],
                ['Aprobacion', selectedSite.approval],
                ['SEO', selectedSite.seoMode],
              ].map(([label, value]) => (
                <div key={label} className="bg-white px-5 py-3">
                  <dt className="text-xs font-medium uppercase tracking-normal text-slate-500">{label}</dt>
                  <dd className="mt-1 truncate text-sm font-semibold text-slate-950">{value}</dd>
                </div>
              ))}
            </dl>
          </header>

          <section className="hidden" aria-label="Resumen operativo">
            {summaryMetrics.map((metric) => (
              <article key={metric.label} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/80">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-slate-500">{metric.label}</p>
                  <ShellBadge tone={metric.tone}>{metric.detail}</ShellBadge>
                </div>
                <strong className="mt-3 block text-3xl font-semibold tracking-normal text-slate-950">{metric.value}</strong>
              </article>
            ))}
          </section>

          {children}
        </main>
      </div>
    </div>
  );
}
