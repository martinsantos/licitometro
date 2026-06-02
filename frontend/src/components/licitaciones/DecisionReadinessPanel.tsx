import React from 'react';

type LicitacionLike = {
  objeto?: string | null;
  title?: string;
  opening_date?: string | null;
  budget?: number | null;
  fuente?: string | null;
  estado?: string | null;
  workflow_state?: string | null;
  enrichment_level?: number | null;
  description?: string | null;
  source_url?: string | null;
  canonical_url?: string | null;
  metadata?: Record<string, any>;
};

function formatARS(value?: number | null) {
  if (!value) return 'Sin presupuesto';
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value);
}

function daysUntil(dateStr?: string | null) {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return null;
  return Math.ceil((date.getTime() - Date.now()) / 86400000);
}

export function buildReadinessItems(licitacion: LicitacionLike) {
  const level = licitacion.enrichment_level || 1;
  return [
    { label: 'Datos del objeto', done: Boolean(licitacion.objeto || licitacion.description) },
    { label: 'Pliego o fuente', done: Boolean(licitacion.canonical_url || licitacion.source_url || licitacion.metadata?.pliego_local_url) },
    { label: 'IA / enriquecimiento', done: level >= 2 },
    { label: 'Presupuesto', done: Boolean(licitacion.budget) },
    { label: 'Workflow iniciado', done: Boolean(licitacion.workflow_state && licitacion.workflow_state !== 'descubierta') },
  ];
}

export default function DecisionReadinessPanel({ licitacion }: { licitacion: LicitacionLike }) {
  const days = daysUntil(licitacion.opening_date);
  const readinessItems = buildReadinessItems(licitacion);
  const doneCount = readinessItems.filter(item => item.done).length;
  const nextMissing = readinessItems.find(item => !item.done);
  const deadlineLabel =
    days == null ? 'Sin apertura' :
    days < 0 ? 'Vencida' :
    days === 0 ? 'Vence hoy' :
    `${days} dias`;

  return (
    <section className="codex-panel codex-readiness-panel p-4" aria-label="Qué falta para cotizar">
      <div className="codex-readiness-panel__grid">
        <div className="codex-readiness-panel__summary">
          <h2 className="text-sm font-black text-gray-900 mb-1">Qué falta para cotizar</h2>
          <p className="text-xs text-gray-500">
            {nextMissing ? `Próxima acción recomendada: ${nextMissing.label}.` : 'La licitación tiene los datos mínimos para avanzar.'}
          </p>
          <div className="codex-readiness-panel__metrics mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="codex-metric px-3 py-2">
              <div className="text-[10px] uppercase font-bold text-gray-400">Apertura</div>
              <div className="text-sm font-black text-gray-800">{deadlineLabel}</div>
            </div>
            <div className="codex-metric px-3 py-2">
              <div className="text-[10px] uppercase font-bold text-gray-400">Presupuesto</div>
              <div className="text-sm font-black text-gray-800 truncate">{formatARS(licitacion.budget)}</div>
            </div>
            <div className="codex-metric px-3 py-2">
              <div className="text-[10px] uppercase font-bold text-gray-400">Fuente</div>
              <div className="text-sm font-black text-gray-800 truncate">{licitacion.fuente || 'Sin fuente'}</div>
            </div>
            <div className="codex-metric px-3 py-2">
              <div className="text-[10px] uppercase font-bold text-gray-400">Completitud</div>
              <div className="text-sm font-black text-gray-800">{doneCount}/{readinessItems.length}</div>
            </div>
          </div>
        </div>

        <div className="codex-readiness-panel__checks">
          {readinessItems.map(item => (
            <div
              key={item.label}
              className={`codex-status ${
                item.done ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
              }`}
            >
              {item.done ? 'Listo' : 'Pendiente'} · {item.label}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
