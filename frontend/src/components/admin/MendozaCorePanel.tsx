import React, { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '../../services/api';

type CoreStatus = 'up_perfect' | 'up_degraded' | 'at_risk' | 'down';

type CoreSource = {
  name: string;
  status: CoreStatus;
  expected_min_items: number;
  last_run?: {
    status?: string | null;
    items_found?: number;
    started_at?: string | null;
    duration_seconds?: number | null;
  };
  records?: {
    total?: number;
    vigentes?: number;
    new_7d?: number;
  };
  coverage?: Record<string, number>;
  blocking_issues?: string[];
  quality_issues?: string[];
  backlog_issues?: string[];
};

type RepairItem = {
  source_name: string;
  status: CoreStatus;
  priority: number;
  issues?: string[];
  recommended_action?: string;
};

type MendozaCoreSummary = {
  generated_at?: string;
  totals?: {
    sources?: number;
    up_perfect?: number;
    up_degraded?: number;
    at_risk?: number;
    down?: number;
    records_total?: number;
    vigentes_total?: number;
    new_7d_total?: number;
  };
  sources?: CoreSource[];
  repair_queue?: RepairItem[];
};

const STATUS_LABEL: Record<CoreStatus, string> = {
  up_perfect: 'Perfecta',
  up_degraded: 'Degradada',
  at_risk: 'En riesgo',
  down: 'Caida',
};

const STATUS_CLASS: Record<CoreStatus, string> = {
  up_perfect: 'bg-[#d5fdf4] text-[#14866d] border-[#9eebd7]',
  up_degraded: 'bg-[#fef6e7] text-[#ac6600] border-[#f0c982]',
  at_risk: 'bg-[#fef6e7] text-[#ac6600] border-[#f0c982]',
  down: 'bg-[#fee7e6] text-[#b32424] border-[#f54739]/30',
};

function pct(value?: number) {
  if (value === undefined || value === null) return '0%';
  return `${Math.round(value * 100)}%`;
}

function formatDate(value?: string | null) {
  if (!value) return 'Sin corrida';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin corrida';
  return date.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
}

function issueLabel(issue: string) {
  return issue.replaceAll('_', ' ');
}

export default function MendozaCorePanel() {
  const [data, setData] = useState<MendozaCoreSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<MendozaCoreSummary>('/api/mendoza-core/summary');
      setData(res);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.body : 'Error al cargar Mendoza Core');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const totals = data?.totals || {};
  const sources = data?.sources || [];
  const repairQueue = data?.repair_queue || [];

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
        {error}
      </div>
    );
  }

  return (
    <section className="admin-panel space-y-4">
      <div className="admin-toolbar">
        <div>
          <p className="codex-eyebrow">Salud de indexacion</p>
          <h2 className="font-semibold text-[#202122]">Mendoza Core 3</h2>
          <p className="mt-0.5 text-xs text-[#54595d]">
            Fuentes criticas: ComprasApps, COMPR.AR Mendoza y Boletin Oficial Mendoza.
          </p>
        </div>
        <div className="admin-toolbar-actions">
          <button
            type="button"
            onClick={load}
            className="codex-button codex-button--quiet text-sm"
          >
            Actualizar
          </button>
          <a
            href="/api/mendoza-core/export.csv"
            className="codex-button codex-button--primary text-sm"
          >
            CSV
          </a>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <Kpi label="Fuentes" value={totals.sources ?? 0} />
        <Kpi label="Perfectas" value={totals.up_perfect ?? 0} tone="emerald" />
        <Kpi label="Degradadas" value={totals.up_degraded ?? 0} tone="amber" />
        <Kpi label="En riesgo" value={totals.at_risk ?? 0} tone="orange" />
        <Kpi label="Caidas" value={totals.down ?? 0} tone="rose" />
        <Kpi label="Vigentes" value={totals.vigentes_total ?? 0} />
        <Kpi label="Nuevas 7d" value={totals.new_7d_total ?? 0} />
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        {sources.map((source) => {
          const issues = [
            ...(source.blocking_issues || []),
            ...(source.quality_issues || []),
            ...(source.backlog_issues || []),
          ];
          return (
            <article key={source.name} className="rounded border border-[#eaecf0] bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold text-[#202122]">{source.name}</h3>
                  <p className="mt-0.5 text-xs text-[#54595d]">
                    Ultima corrida: {formatDate(source.last_run?.started_at)}
                  </p>
                </div>
                <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${STATUS_CLASS[source.status]}`}>
                  {STATUS_LABEL[source.status]}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <Metric label="Items run" value={source.last_run?.items_found ?? 0} />
                <Metric label="Minimo" value={source.expected_min_items} />
                <Metric label="Vigentes" value={source.records?.vigentes ?? 0} />
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <Metric label="Apertura" value={pct(source.coverage?.opening_date)} />
                <Metric label="Docs" value={pct(source.coverage?.documents)} />
                <Metric label="URL directa" value={pct(source.coverage?.direct_url)} />
              </div>

              {issues.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {issues.map((issue) => (
                    <span key={issue} className="rounded-sm bg-[#f8f9fa] px-2 py-0.5 text-[11px] text-[#54595d] border border-[#eaecf0]">
                      {issueLabel(issue)}
                    </span>
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </div>

      <div className="rounded border border-[#eaecf0] bg-white">
        <div className="border-b border-[#eaecf0] px-4 py-3">
          <h3 className="font-semibold text-[#202122]">Cola de reparacion</h3>
        </div>
        {repairQueue.length === 0 ? (
          <div className="px-4 py-6 text-sm text-[#14866d]">Sin reparaciones abiertas en el nucleo critico.</div>
        ) : (
          <div className="divide-y divide-[#eaecf0]">
            {repairQueue.map((item) => (
              <div key={`${item.source_name}-${item.priority}`} className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[90px_1fr_2fr]">
                <div className="font-bold text-[#54595d]">P{item.priority}</div>
                <div>
                  <div className="font-semibold text-[#202122]">{item.source_name}</div>
                  <div className="text-xs text-[#54595d]">{STATUS_LABEL[item.status]}</div>
                </div>
                <div>
                  <div className="text-[#202122]">{item.recommended_action}</div>
                  {(item.issues || []).length > 0 && (
                    <div className="mt-1 text-xs text-[#54595d]">{(item.issues || []).map(issueLabel).join(', ')}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function Kpi({ label, value, tone = 'gray' }: { label: string; value: number; tone?: 'gray' | 'emerald' | 'amber' | 'orange' | 'rose' }) {
  const color = {
    gray: 'text-gray-900',
    emerald: 'text-emerald-700',
    amber: 'text-amber-700',
    orange: 'text-orange-700',
    rose: 'text-rose-700',
  }[tone];
  return (
    <div className="rounded border border-[#eaecf0] bg-white p-3">
      <div className={`text-xl font-black ${color}`}>{value}</div>
      <div className="text-xs text-[#54595d]">{label}</div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-sm bg-[#f8f9fa] px-2 py-1 border border-[#eaecf0]">
      <div className="font-bold text-[#202122]">{value}</div>
      <div className="text-[11px] text-[#54595d]">{label}</div>
    </div>
  );
}
